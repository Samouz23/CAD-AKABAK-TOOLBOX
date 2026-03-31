# AKAbak Toolbox — Contexte complet pour l'IA

> Ce document contient TOUT ce qu'une IA a besoin de savoir pour travailler sur ce projet.
> Il résume 20+ sessions de reverse engineering du format binaire .akp d'AKAbak.
> **LIS CE FICHIER EN ENTIER avant de modifier quoi que ce soit.**

---

## 1. Qu'est-ce que c'est ?

**AKAbak** est un logiciel de simulation acoustique LEM (Lumped Element Model) pour la conception d'enceintes acoustiques. Il utilise un format binaire propriétaire `.akp` (Delphi/Object Pascal sérialisé).

**akabak_tool_v2.py** est un outil Python qui manipule ces fichiers binaires pour :
- Insérer des composants acoustiques (Duct, Waveguide, DynDriver, Radiator, Encl, EnclVented, MassAcou, GND)
- Insérer des fils (Wires) entre composants
- Renommer des projets (in-place padding)
- Modifier des constantes et formules (in-place padding)
- Positionner des composants sur la grille schématique
- Appliquer des configurations batch via fichiers .ini

**Le but final** : intégrer cet outil dans une application Electron/JS ("AKAbak Toolbox") pour automatiser la création de fichiers .akp.

---

## 2. Format binaire .akp — Essentiel

### 2.1 Structure du fichier
```
[0x0000-0x001C]    Header: "RDTeam File 000 1.000" + TAG_68 root pointer
[0x001D-~0x00FF]   Métadonnées: version, nom projet, unités, timestamp
[~0x0100-~0x10FF]  Chemin fichier (hex-encodé), paramètres
[~0x1100-~0x21EE]  Formules globales (4 onglets: Global, LEM, Fields, Spectra)
[~0x21EF]          Section "Observation" (MEASURE, POLAR, etc.)
[~0x277E]          Section "Repository"
[~0x2DA4-~0x33BA]  Section "Sys"
[avant first_comp] Component List Header (32 bytes)
[first_comp-...]   Zone composants: paires template/instance par type
[...après comps]   Marqueur fin de bloc externe [65 65 u32 0000 65 68...]
[...après marker]  Zone câblage (Wire template/instance pairs, 520B chaque)
[...après wires]   Section Page/imprimante/RVF
[derniers 38B]     Footer (suffixe constant)
```

### 2.2 Tags (4 bytes chacun: [tag 00 00 00])
| Tag | Hex  | Description |
|-----|------|-------------|
| NIL | 0x65 | Séparateur / préfixe pointeur u64 |
| REF66 | 0x66 | Pointeur u64 (référence) |
| REF67 | 0x67 | Pointeur u64 (référence) |
| BLOCK | 0x68 | Début de bloc avec u64 → fin du bloc |
| REF69 | 0x69 | Pointeur u64 (référence) |

### 2.3 Strings LPS (Length-Prefixed Strings)
Format : `[u32 longueur little-endian][octets ASCII]` — pas de terminateur nul.

### 2.4 Composants = paires Template + Instance
Chaque composant est sérialisé DEUX FOIS :
- **Template** : contient nom court, formule, propriétés. Détecté par `[LPS type_name][NIL][TAG_68]`
- **Instance** : contient "Active", "Caption", etc. Détecté par `[LPS type_name][NIL][NIL]`

### 2.5 Component List Header (32 bytes avant first_comp)
```
fc-32: TAG_68
fc-28: NIL
fc-24: u32 block_end      → pointe vers le marqueur fin de bloc après le dernier composant
fc-20: u32 zeros
fc-16: u32 count           = len(get_components()) - 1  ⚠️ TOUJOURS -1 (GND jamais compté)
fc-12: NIL
fc-8:  u64 after_name      → pointe vers l'octet après le nom du premier type
fc-0:  [LPS first_type_name]  = first_comp
```

---

## 3. Règles CRITIQUES (violations = "broken data-stream")

### 3.1 Ordre des composants
**Le composant le plus récemment ajouté DOIT être PREMIER dans la zone composants.**
- Insertion TOUJOURS à `first_comp` (début), JAMAIS à `outer_end` (fin)
- AKAbak rejette silencieusement les fichiers avec le mauvais ordre

### 3.2 Count field = composants - 1
Le champ count à `first_comp - 16` vaut `len(get_components()) - 1`.
Le GND original "terminateur" n'est jamais compté. Si le count est faux → "File of newer version (GeoRefArr)".

### 3.3 Pointeurs u64 dans les blobs
Chaque blob composant contient des pointeurs u64 absolus (précédés de tags 0x65-0x69).
Ces pointeurs DOIVENT être rebasés (delta = nouvelle_position - source_offset) lors de l'insertion.
Les positions exactes sont dans `POINTER_MAPS` (par type).

### 3.4 Blob tail ref
Chaque composant a un marqueur `[65 65 u32 0000]` (outer block end) qui pointe vers le prochain composant.
Après insertion, ce pointeur doit être corrigé par `_fix_blob_tail_ref()`.

### 3.5 Blob outer block
Le marqueur `[68 65 u32 0000]` hors du blob, entre composants, doit aussi être corrigé via `_fix_blob_outer_block()`.

### 3.6 Recherche LPS-aware obligatoire
JAMAIS utiliser `data.find(b'Duct')` pour chercher un composant — ça matche dans le texte des formules ("Largeurs des Ducts"). Toujours vérifier le préfixe u32 length.

---

## 4. POINTER_MAPS — Carte des pointeurs par type

Les blobs composants contiennent des pointeurs u64 à des positions fixes (relatives au début du template/instance). Ces positions sont CONSTANTES pour un type donné — elles ne changent jamais entre fichiers .akp.

```python
POINTER_MAPS = {
    'Duct':       { 'template_size': 451,  'instance_size': 2109, 'tpl_ptrs': 7,  'inst_ptrs': 38 },
    'Waveguide':  { 'template_size': 489,  'instance_size': 2382, 'tpl_ptrs': 7,  'inst_ptrs': 45 },
    'DynDriver':  { 'template_size': 529,  'instance_size': 3944, 'tpl_ptrs': 7,  'inst_ptrs': 74 },
    'Radiator':   { 'template_size': 322,  'instance_size': 1502, 'tpl_ptrs': 7,  'inst_ptrs': 26 },
    'Encl':       { 'template_size': 410,  'instance_size': 1253, 'tpl_ptrs': 7,  'inst_ptrs': 24 },
    'EnclVented': { 'template_size': 487,  'instance_size': 3074, 'tpl_ptrs': 7,  'inst_ptrs': 54 },
    'MassAcou':   { 'template_size': 527,  'instance_size': 1008, 'tpl_ptrs': 7,  'inst_ptrs': 20 },
    'GND':        { 'template_size': 191,  'instance_size': 783,  'tpl_ptrs': 2,  'inst_ptrs': 19 },
    'Wire':       { 'template_size': 315,  'instance_size': 205,  'tpl_ptrs': 7,  'inst_ptrs': 5  },
}
```

Les positions exactes de chaque pointeur sont dans `akabak_tool_v2.py` lignes 65-170.

---

## 5. Dimensions et ports des composants (grille schématique)

```python
COMPONENT_DIMS = {
    'Waveguide':  { 'width': 8, 'height': 6 },
    'Duct':       { 'width': 8, 'height': 4 },
    'DynDriver':  { 'width': 8, 'height': 8 },
    'Radiator':   { 'width': 4, 'height': 8 },
    'Filter':     { 'width': 6, 'height': 4 },
    'Source':     { 'width': 2, 'height': 8 },
    'Resistor':   { 'width': 6, 'height': 2 },
    'Encl':       { 'width': 8, 'height': 6 },
    'EnclVented': { 'width': 8, 'height': 8 },
    'MassAcou':   { 'width': 8, 'height': 4 },
    'GND':        { 'width': 2, 'height': 2 },
}
```

### Ports (coordonnées de connexion vérifiées empiriquement)
- **DynDriver** : front = (x+8, y+1), rear = (x+8, y+7)
- **Duct** : gauche = (x, y+2), droite = (x+8, y+2)
- **Waveguide** : gauche = (x, y+3), droite = (x+8, y+3)
- **Radiator** : port gauche = (x+1, y) ⚠️ PAS (x, y+offset)
- **EnclVented** : port gauche = (x, y+2) ⚠️ port_y_offset=2, PAS 3
- **Encl** : port gauche = (x, y+3)

### Connexion par contact
AKAbak connecte automatiquement deux composants dont les ports se TOUCHENT sur la grille (aucun objet Wire nécessaire). Un Wire (520B) n'est créé que pour les câblages manuels avec espace entre les ports.

---

## 6. Blobs .akb — Format des composants pré-extraits

Header : `[4B: "AKB\x01"] [4B: source_offset u32 LE] [reste: blob data]`

- `source_offset` = position originale du blob dans le fichier source (pour le calcul du delta de rebase)
- Le blob contient la paire template + instance complète du composant

### Blobs disponibles
| Fichier | Type | Taille data | Source |
|---------|------|-------------|--------|
| duct_formula_ref.akb | Duct | 2560B | TEMPLATE_FINAL |
| waveguide_formula_ref.akb | Waveguide | 2871B | TEMPLATE_FINAL |
| dyndriver_formula_ref.akb | DynDriver | 4473B | TEMPLATE_FINAL |
| radiator_ref.akb | Radiator | 1824B | TEMPLATE_FINAL |
| encl_formula_ref.akb | Encl | 1663B | TEMPLATE_FINAL |
| enclvented_formula_ref.akb | EnclVented | 3561B | TEMPLATE_FINAL55 |
| massacou_formula_ref.akb | MassAcou | 1535B | TEMPLATE_FINAL |
| gnd_ref.akb | GND | 974B | TEMPLATE_FINAL |
| wire_ref.akb | Wire | 520B | TEMPLATE_FINAL |

**ATTENTION EnclVented** : Le blob vient de TEMPLATE_FINAL55, pas TEMPLATE_FINAL. Son `source_offset` est **0x01B567** (pas 0x017E2D). Une erreur ici (source_offset pointant vers Waveguide au lieu d'EnclVented) a causé des semaines de debugging.

---

## 7. Wire (Câblage) — Format complet

### Structure
- Chaque wire = **520B** = 315B template + 205B instance
- Segment droit uniquement (HORIZ ou VERT)
- Stockés APRÈS le marqueur outer block end des composants

### Wire Zone Header (32B avant le premier template)
```
+0x00: TAG_68  +0x04: NIL  +0x08: u64 ptr_last_tail
+0x10: u32 wire_count  +0x14: NIL  +0x18: u64 ptr_first
```

### Coordonnées dans l'instance
- Instance+0xAB: i32 X1, +0xAF: i32 Y1, +0xB3: i32 X2, +0xB7: i32 Y2
- Instance+0xBB: u8 flag1 (T-junction P1), +0xBC: u8 flag2 (T-junction P2)

### Liste chaînée
- Chaque instance pointe (INST+0xC5) vers le template suivant+8
- Dernier wire : [NIL][u32 end_of_wires+4] au lieu de pointer vers le suivant

---

## 8. Algorithme d'insertion de composant (résumé)

```
1. Charger le blob .akb → extraire source_offset du header AKB
2. _strip_repo_header() → retirer le header Repository si présent
3. find_insertion_point() → trouver first_comp (dynamique, LPS-aware)
4. _rebase_blob_pointers() → delta = insertion_point - source_offset
   → ajuster chaque u64 aux positions POINTER_MAPS[type]
   → aussi scanner les patterns [65 65 u32 0000] et [68 65 u32 0000] (raw u32)
5. _patch_blob_position() → écrire X, Y dans le blob
6. insert_blob() → splice le blob rebasé dans le fichier à insertion_point
   → _adjust_pointers() ajuste tous les pointeurs EXTERNES au blob
7. _fix_component_metadata() → corriger count, block_end, after_name
8. _fix_blob_outer_block() → corriger le [68 65 u32] hors blob
9. _fix_blob_tail_ref() → corriger le [65 65 u32 0000] tail ref
```

### Algorithme d'insertion de wire
```
1. insert_wire() orchestre tout
2. Trouver la zone wires (après outer block end)
3. Rebase blob wire (12 pointeurs: 7 template + 5 instance)
4. Écrire coords (X1,Y1,X2,Y2) et flags
5. Splice dans le fichier
6. Mettre à jour: wire_count+1, chain (prev→new, new→nil), header ptrs
7. _adjust_pointers() pour les pointeurs externes
```

---

## 9. Bugs historiques et leurs solutions

### Bug 1 — Ordre des composants (Session 8)
**Symptôme** : "broken data-stream"
**Cause** : Insertion à outer_end (fin) au lieu de first_comp (début)
**Fix** : `find_insertion_point()` retourne first_comp

### Bug 2 — Recherche naïve dans _fix_component_metadata (Session 15)
**Symptôme** : Caractères chinois dans les formules, composants corrompus
**Cause** : `data.find(b'Duct')` matchait "Duct" dans le texte de formule LEM
**Fix** : Recherche LPS-aware (vérifier préfixe u32 length)

### Bug 3 — Count field off-by-one (Session 15)
**Symptôme** : "File of newer version (GeoRefArr)"
**Cause** : count = len(comps) au lieu de len(comps) - 1
**Fix** : `actual_count = len(components) - 1`

### Bug 4 — POINTER_MAP off by -4 (Session 17)
**Symptôme** : Corruption catastrophique avec grands deltas
**Cause** : Positions dans POINTER_MAPS pointaient vers le TAG u32 au lieu du u64 value (+4)
**Fix** : +4 sur toutes les entrées des 7 types formula-ref

### Bug 5 — Wire POINTER_MAP (Session 12)
**Symptôme** : Tags écrasés par des valeurs de pointeurs
**Cause** : Même bug que #4 mais spécifique aux Wires
**Fix** : +4 sur les offsets template et instance

### Bug 6 — _fix_blob_outer_block incomplet (Session 20)
**Symptôme** : block_end lu comme garbage (0x4B434948 = "HICK")
**Cause** : Liste comp_types incomplète (manquait Radiator, Encl, EnclVented, MassAcou, GND) + pas de validation LPS
**Fix** : Liste complète + validation LPS

### Bug 7 — EnclVented source_offset FAUX (Session 20) ⚠️ LE PLUS VICIEUX
**Symptôme** : "broken data stream" uniquement avec EnclVented
**Cause** : Le blob AKB avait source_offset=0x017E33 (position du WAVEGUIDE dans TF55!) au lieu de 0x01B567 (position de l'EnclVented). Delta=-6 au lieu de -14138 → tous les 61 pointeurs pointaient hors du blob.
**Fix** : Corriger source_offset dans le fichier .akb (bytes 4-8)

### Bug 8 — in_ptr_u64 false positive (Session 18)
**Symptôme** : Pointeur externe non ajusté → corruption
**Cause** : `_adjust_pointers` construisait `in_ptr_u64` à partir de positions globales mais testait avec des offsets locaux
**Fix** : Correction du calcul d'exclusion

---

## 10. Fonctions clés dans akabak_tool_v2.py (~1935 lignes)

| Ligne | Fonction | Rôle |
|-------|----------|------|
| ~65 | POINTER_MAPS | Carte des positions de pointeurs par type de composant |
| ~175 | COMPONENT_DIMS | Dimensions grille par type |
| ~200 | AkpFile | Classe principale : load/save/get_strings/get_components |
| ~289 | get_components() | Trouve tous les templates (pas instances) |
| ~395 | insert_blob() | Splice blob + _adjust_pointers avec skip_range |
| ~440 | _adjust_pointers() | Ajuste pointeurs EXTERNES : POINTER_TAG, compound, NIL u64, raw u32 |
| ~640 | find_outer_end() | Lit outer_end depuis le header component list |
| ~718 | find_insertion_point() | Trouve first_comp (LPS-aware, dynamique) |
| ~800 | _fix_component_metadata() | Corrige count, block_end, after_name |
| ~886 | _strip_repo_header() | Retire header Repository d'un blob |
| ~912 | _fix_blob_outer_block() | Corrige [68 65 u32] hors blob |
| ~951 | _fix_blob_tail_ref() | Corrige [65 65 u32 0000] tail ref |
| ~981 | _patch_blob_position() | Écrit X,Y dans un blob composant |
| ~1092 | insert_wire() | Insertion complète d'un wire avec chaînage |
| ~1194 | _rebase_blob_pointers() | Rebase les u64 internes d'un blob (POINTER_MAPS) |

---

## 11. Comment utiliser l'outil (exemples Python)

### Insertion d'un composant
```python
import akabak_tool_v2 as t
import struct

def load_akb(path):
    raw = open(path, 'rb').read()
    if raw[:4] == b'AKB\x01':
        return raw[8:], struct.unpack_from('<I', raw, 4)[0]
    return raw, None

def add_comp(akp, blob_path, x, y):
    blob, src_off = load_akb(blob_path)
    ip = t.find_insertion_point(akp)
    blob, src_off = t._strip_repo_header(bytearray(blob), src_off)
    adj = t._rebase_blob_pointers(bytearray(blob), ip, src_off)
    adj = t._patch_blob_position(bytearray(adj), x, y)
    sz = len(adj)
    akp.insert_blob(ip, adj)
    t._fix_component_metadata(akp)
    t._fix_blob_outer_block(akp, ip, sz)
    t._fix_blob_tail_ref(akp, ip, sz)
    return akp

# Charger le template
akp = t.AkpFile.from_file('templates/TEMPLATE_FINAL.akp')

# Insérer un Duct à la position grille (73, 10)
add_comp(akp, 'blobs/duct_formula_ref.akb', 73, 10)

# Sauvegarder
akp.save('output.akp')
```

### Insertion d'un wire
```python
def add_wire(akp, blob_path, x1, y1, x2, y2):
    blob, src_off = load_akb(blob_path)
    t.insert_wire(akp, blob, src_off, x1, y1, x2, y2)
    return akp

# Wire de (64,12) vers (73,12) — segment horizontal
add_wire(akp, 'blobs/wire_ref.akb', 64, 12, 73, 12)
```

### Repositionner un composant existant
```python
def reposition(akp, comp_short_name, new_x, new_y):
    comps = akp.get_components()
    foc = struct.pack('<I', 20) + b'Formula of component'
    d = bytes(akp.data)
    for i, c in enumerate(comps):
        if c['short_name'] != comp_short_name:
            continue
        start = c['type_offset']
        end = comps[i+1]['type_offset'] if i+1 < len(comps) else len(d)
        pos = d.find(foc, start, end)
        if pos >= 0:
            t.write_u32(akp.data, pos + 154, new_x)
            t.write_u32(akp.data, pos + 158, new_y)
            return akp
    return akp
```

---

## 12. Ce qui fonctionne vs ce qui reste à faire

### ✅ Fonctionne (validé dans AKAbak 3.1.9 b108)
- Insertion des 12 types de composants
- Insertion de wires (segments droits)
- Positionnement sur la grille
- Renommage de projet (in-place)
- Modification de constantes/formules (in-place, ≤ longueur originale)
- Configuration batch via .ini
- Le tool est UNIVERSEL — fonctionne avec n'importe quel fichier .akp, pas seulement TEMPLATE_FINAL

### ⚠️ Limites connues
- Le texte de remplacement doit être ≤ au texte original (padding in-place)
- Wires en L (coude) et T-junction (parallèle) non automatisés (nécessitent 2-3 wires + flags)
- Le message "newer version" apparaît parfois (cosmétique, n'empêche pas le fonctionnement)
- Pas encore de suppression de composants

### 🔮 Prochaines étapes possibles
- Port en JavaScript/Node.js pour l'app Electron
- Extraction de nouveaux blobs depuis d'autres fichiers AKAbak
- Wire routing automatique (L-bend, T-junction)
- Interface graphique pour le positionnement

---

## 13. Structure du dossier

```
akabak_toolbox/
├── akabak_tool_v2.py              # Outil principal Python (~1935 lignes)
├── akp_watcher.py                 # Surveillance temps réel de fichiers .akp
├── AI_CONTEXT.md                  # CE FICHIER — contexte complet pour l'IA
├── JOURNAL_REVERSE_ENGINEERING.md # Journal détaillé des 20 sessions
├── AKABAK_FORMAT_REFERENCE.md     # Référence du format binaire
├── AKP_FORMAT_ANALYSIS.md         # Analyse détaillée
├── WIRE_FORMAT_ANALYSIS.md        # Analyse du format Wire
├── pointer_maps.txt               # Cartes de pointeurs extraites
├── .github/copilot-instructions.md # Instructions pour GitHub Copilot
├── blobs/                         # Composants pré-extraits (.akb)
│   ├── duct_formula_ref.akb       # Duct (2568B)
│   ├── waveguide_formula_ref.akb  # Waveguide (2879B)
│   ├── dyndriver_formula_ref.akb  # DynDriver (4481B)
│   ├── radiator_ref.akb           # Radiator (1832B)
│   ├── encl_formula_ref.akb       # Encl (1671B)
│   ├── enclvented_formula_ref.akb # EnclVented (3569B) ⚠️ source from TF55
│   ├── massacou_formula_ref.akb   # MassAcou (1543B)
│   ├── gnd_ref.akb                # GND (982B)
│   └── wire_ref.akb               # Wire (528B)
├── templates/                     # Fichiers .akp de base
│   ├── TEMPLATE_FINAL.akp         # Template principal (145,800B, 8 comps, 3 wires)
│   └── TEMPLATE_FINAL55.akp       # Source du blob EnclVented (170,259B, 15 comps)
└── tests/                         # Fichiers de test générés
```

---

## 14. Comment extraire un nouveau blob

Si tu as besoin d'un type de composant non encore disponible en blob :

1. **Créer le composant dans AKAbak** dans un fichier template
2. **Utiliser akp_watcher.py** pour créer des snapshots avant/après
3. **Comparer les snapshots** avec `script/multi_type_pointers.py` pour extraire la carte de pointeurs
4. **Extraire le blob** : trouver le template LPS offset, calculer la taille (template_size + instance_size), extraire les bytes, ajouter le header AKB (4B magic + 4B source_offset)
5. **Ajouter la POINTER_MAP** dans `akabak_tool_v2.py`
6. **Tester** : insérer dans un fichier, ouvrir dans AKAbak

**CRITIQUE** : Le `source_offset` dans le header AKB DOIT correspondre à la position RÉELLE du blob dans le fichier source. Une erreur ici fait que le rebase applique le mauvais delta → corruption silencieuse de tous les pointeurs internes.
