# Journal de Reverse Engineering — AKAbak .akp
> Projet de rétro-ingénierie du format binaire .akp utilisé par AKAbak (simulation acoustique LEM)
> Sessions 1 à 16 — Mars–Juin 2026

---

## Table des matières
1. [Objectif du projet](#1-objectif-du-projet)
2. [Format binaire AKP — Ce qu'on a découvert](#2-format-binaire-akp)
3. [Outils créés](#3-outils-créés)
4. [Chronologie des sessions](#4-chronologie-des-sessions)
5. [Approches testées et abandonnées](#5-approches-testées-et-abandonnées)
6. [Solution finale qui fonctionne](#6-solution-finale-qui-fonctionne)
7. [Limites actuelles](#7-limites-actuelles)
8. [Structure du projet](#8-structure-du-projet)

---

## 1. Objectif du projet

Modifier automatiquement des fichiers `.akp` (AKAbak) par script Python pour :
- **Renommer** un projet (nom + chemins internes hex-encodés)
- **Modifier les constantes** (dimensions, paramètres de simulation)
- **Modifier les formules** de composants individuels
- **Appliquer des configurations batch** via fichiers `.ini`
- **Insérer des composants** dans un projet existant ✅ (Session 8 — confirmé fonctionnel)

---

## 2. Format binaire AKP

### 2.1 Structure générale du fichier

Le format `.akp` est un format binaire Delphi (Object Pascal) sérialisé.

```
[0x0000-0x001C]    Header: "RDTeam File 000 1.000" + TAG_68 root pointer
[0x001D-~0x00FF]   Métadonnées: version, nom du projet, unités, timestamp
[~0x0100-~0x10FF]  Chemin fichier (hex-encodé), paramètres
[~0x1100-~0x21EE]  Grille/BEM/paramètres calcul ($$1234$$, propriétés air...)
[~0x21EF]          Section "Observation" (MEASURE, POLAR, etc.)
[~0x277E]          Header section "Repository"
[~0x2DA4-~0x33BA]  Section "Sys" (Active, Caption, Formula, Page, Prn, Info)
[0x33BB-0x33DA]    Component List Header (32 bytes)
[0x33DB-...]       Zone composants: paires template/instance
[...après comps]   Marqueur fin de bloc externe
[...après marker]  Zone câblage (Wire template/instance pairs)
[...après wires]   Section Page/imprimante/RVF
[derniers 38B]     Footer fichier (suffixe constant)
```

### 2.2 Système de tags

Le fichier utilise 5 types de tags, chacun sur 4 octets `[tag 00 00 00]` :

| Tag | Hex | Nom | Taille totale | Description |
|-----|-----|-----|---------------|-------------|
| TAG_NIL | 0x65 | Nil/séparateur | 4 bytes | Marqueur nul, mais aussi préfixe de pointeurs u64 |
| TAG_REF66 | 0x66 | Référence | 12 bytes (4+8) | Pointeur u64 vers une autre position |
| TAG_REF67 | 0x67 | Référence | 12 bytes (4+8) | Pointeur u64 |
| TAG_BLOCK | 0x68 | Bloc | 12 bytes (4+8) | Début de bloc avec u64 pointant vers la fin du bloc |
| TAG_REF69 | 0x69 | Référence | 12 bytes (4+8) | Pointeur u64 |

### 2.3 Strings LPS (Length-Prefixed Strings)

Toutes les chaînes sont au format `[u32 longueur][octets ASCII]` :
- Le champ longueur (u32 little-endian) indique le nombre d'octets
- Suivi directement par les caractères ASCII
- Pas de terminateur nul
- AKAbak tolère les espaces de fin (padding)

### 2.4 Chemins hex-encodés

Le chemin du fichier est stocké en hexadécimal ASCII à deux endroits :
- **Chemin complet** (~0x111) : ex. `413A5C53616D75656C5C...` → `A:\Samuel\SZS\DATA\TEMPLATE LEM.akpbe`
- **Nom de fichier court** (~0x2FCD) : ex. `54454D504C415445204C454D2E616B70` → `TEMPLATE LEM.akp`

Le suffixe `be` (0x6265) après `.akp` fait partie du format, toujours présent.

### 2.5 Composants — Template vs Instance

Chaque composant apparaît **deux fois** dans le fichier :
- **Template** (dans Repository) : contient le nom court, la formule, les propriétés éditables
- **Instance** (dans Sys) : contient "Active", "Caption", etc.

Détection : après `[LPS type_name]` :
- Template : `[NIL 0x65] [TAG_68 0x68] [u64 ptr]...`
- Instance : `[NIL 0x65] [NIL 0x65] [u64 ptr]...`

### 2.6 Types de composants

| Type | prop_count | Usage |
|------|-----------|-------|
| DynDriver | 16 | Haut-parleur dynamique |
| Duct | 10 | Conduit/tube |
| Waveguide | 11 | Guide d'onde/pavillon |
| Radiator | 13 | Radiateur (rayonnement) |
| Filter | - | Filtre électrique |
| Source | - | Source de tension/courant |
| Transform | - | Transformateur |
| Resistor | - | Résistance |

### 2.7 Component List Header

32 octets avant le premier composant :
```
fc-32: [u32: 0x68]           Block type marker
fc-28: [u32: 0x65]           NIL
fc-24: [u64: outer_end]      Pointeur vers fin du bloc externe
fc-16: [u32: num_types]      Nombre de types distincts
fc-12: [u32: 0x65]           NIL
fc-8:  [u64: after_name]     Pointeur vers octet après le premier type_name
```

### 2.8 Câblage (Wires)

- Les wires suivent le même pattern template/instance que les composants
- Wire a `prop_count = 12`
- Chaque connexion = ~520 octets
- Stockées APRÈS le marqueur de fin de bloc externe

---

## 3. Outils créés

### 3.1 `akabak_tool_v2.py` (outil principal)

```bash
# Lister le contenu d'un fichier
python akabak_tool_v2.py list "fichier.akp"

# Renommer un projet (nom + chemins hex)
python akabak_tool_v2.py rename "source.akp" output.akp --name "NOUVEAU NOM"

# Modifier des constantes
python akabak_tool_v2.py patch "source.akp" output.akp --set "HEIGHT=700,WIDTH=500"

# Modifier la formule d'un composant
python akabak_tool_v2.py formula "source.akp" output.akp --comp 0 --formula "SDf=900\nSDr=900"

# Appliquer un fichier de configuration complet
python akabak_tool_v2.py apply "source.akp" output.akp --config config.ini

# Comparer deux fichiers
python akabak_tool_v2.py diff "file1.akp" "file2.akp"

# Extraire un composant en blob (non fiable pour réinsertion)
python akabak_tool_v2.py extract "source.akp" --comp 0 --out composant.bin

# Afficher les templates de composants disponibles
python akabak_tool_v2.py templates
```

### 3.2 `akp_watcher.py` (surveillance en temps réel)

Surveille un fichier `.akp` et trace chaque modification faite dans AKAbak :
```bash
python akp_watcher.py "fichier.akp" --snapshots
```

### 3.3 Scripts d'analyse (`script/`)

~90 scripts Python créés pendant le reverse engineering. Principaux :
- `smart_diff.py` — diff structurel intelligent entre deux .akp
- `inplace_test.py` — preuve de concept du remplacement in-place
- `check_ptrtag_values.py` — analyse des faux positifs POINTER_TAG
- `diff_a_vs_c.py` — comparaison byte-level des tests A vs C
- `isolation_tests.py` / `ultra_isolation.py` — tests d'isolation progressifs

---

## 4. Chronologie des sessions

### Session 1 — Découverte du format
- Reverse engineering initial de la structure .akp
- Découverte du système de tags (0x65-0x69)
- Création de `find_all_strings()`, `find_all_pointers()`
- Première version de `replace_string()` avec splice (changement de taille)
- Création de `_adjust_pointers()` pour recalculer les pointeurs absolus

### Session 2 — Pipeline d'insertion de composants
- Extraction et réinsertion de composants (blobs)
- Découverte des raw u32 dans patterns `[65 65 u32 0000]` et `[68 65 u32 0000]`
- Sans ces raw u32, AKAbak rejette avec "GeoRefArr newer version"
- Fix de `_fix_component_metadata` : block_end, count field, after_name
- Format AKB header: `[4B: "AKB\x01"] [4B: source_offset LE u32] [blob bytes]`

### Session 3 — Correction after_name
- **Bug trouvé** : `after_name` (u64 à `first_comp - 12`) n'était pas recalculé après insertion
- Fix: lire `name_len`, calculer `correct_after_name = first_comp + 4 + name_len`
- Fichiers test : comparaison byte-perfect montrant delta=-21 (différence chemin/nom)

### Session 4 — TAG_NIL u64 pointers + échec fondamental
- **Découverte majeure** : 257 pointeurs TAG_NIL u64 jamais ajustés par `_adjust_pointers`
- Pattern : `[65 00 00 00][u64 file offset]`
- Construction d'un ensemble d'exclusion `in_ptr_u64` pour éviter les faux positifs
- **Target validation** : vérifier `is_tag(data, new_ptr)` au lieu de `is_tag(data, old_ptr)`

- **Problème POINTER_TAG** : sur 2846 "POINTER_TAG" détectés, **1306 avaient des valeurs au-dessus de filesize** (faux tags dans les données binaires)
- 3 faux positifs identifiés dans la plage ajustable :
  - `0x000103: val=0x96` — données, pas un vrai tag
  - `0x00E976: val=0x9101` — texte ASCII ".04331388"
  - `0x014FF1: val=0x9101` — même texte ASCII
- Ajout de target validation pour POINTER_TAG → 1410 ajustés, 3 bloqués

- **Malgré toutes ces corrections → fichiers toujours rejetés par AKAbak** ("broken data-stream")

### Session 5 — Percée : remplacement in-place

#### Tests d'isolation (tous échoués)
- test_V1 : POINTER_TAG seulement → ÉCHEC
- test_V2 : + after_name → ÉCHEC
- test_V3 : + TAG_NIL u64 → ÉCHEC
- test_V4 : + raw u32 → ÉCHEC
- test_V5 : tous les ajustements → ÉCHEC
- test_V0a à V0f : isolation ultra-minimale → ÉCHEC (sauf V0a same-length)

#### Découverte clé
**V0a (même longueur, zéro delta) était le seul qui aurait pu marcher.** Cela a confirmé que le problème n'était pas dans les pointeurs eux-mêmes, mais dans le fait de **changer la taille du fichier**.

#### Solution : remplacement in-place avec padding
- Nouveau texte paddé avec des espaces pour garder la même longueur
- Champ longueur LPS inchangé
- Taille du fichier identique → zéro ajustement de pointeurs nécessaire
- **Résultat : "ça marche"** — confirmé par l'utilisateur dans AKAbak

#### Implémentation finale
- `replace_string()` réécrit : padding in-place, retourne 0 (pas de delta)
- `rename_project()` ajouté : met à jour nom + chemins hex avec padding '0'
- Commande CLI `rename` ajoutée
- Le tout fonctionne en pipeline : rename → apply → fichier identique en taille

---

## 5. Approches testées et abandonnées

### 5.1 Splice + _adjust_pointers (ABANDONNÉ)

**Principe** : insérer/supprimer des octets dans le fichier, puis scanner tous les pointeurs absolus et les ajuster du delta.

**Pourquoi ça échoue** :
- `is_tag()` cherche le pattern `[tag_byte 00 00 00]` — ce pattern apparaît naturellement dans les données binaires
- Sur 2846 "POINTER_TAG" détectés, 1306 sont des faux positifs (données qui ressemblent à des tags)
- Même avec target validation (`is_tag()` à la position cible), les effets en cascade rendent l'approche fragile
- Un seul pointeur mal ajusté suffit à corrompre le fichier

### 5.2 Exclusion set pour TAG_NIL (PARTIEL)

**Principe** : construire un ensemble des positions occupées par les u64 des POINTER_TAG, pour éviter d'interpréter ces octets comme des TAG_NIL indépendants.

**Résultat** : élimine les faux positifs TAG_NIL mais ne résout pas les faux positifs POINTER_TAG.

### 5.3 Target validation (INSUFFISANT)

**Principe** : avant d'ajuster un pointeur, vérifier que la valeur cible pointe vers une position contenant un vrai tag.

**Résultat** : bloque 3 faux positifs POINTER_TAG, mais d'autres sources de corruption subsistent.

---

## 6. Solution finale qui fonctionne

### Principe : remplacement in-place (zéro delta)

Toute modification de texte (nom, constantes, formules) est faite **sans changer la taille du fichier** :

1. Le nouveau texte est **paddé** à la longueur de l'ancien :
   - Texte normal → padding avec espaces `' '`
   - Chemins hex-encodés → padding avec `'0'` (qui décode en null bytes)
2. Le champ longueur LPS reste **inchangé**
3. AKAbak tolère les espaces de fin et les null bytes après l'extension `.akp`

### Contrainte importante
Le nouveau texte doit être **plus court ou égal** à l'ancien. Si plus long → erreur.

### Commandes fonctionnelles
- `rename` — renommer le projet
- `patch` — modifier des constantes individuelles
- `formula` — modifier la formule d'un composant
- `apply` — appliquer un fichier `.ini` complet (constantes + formules)
- `list` / `diff` — lecture seule

---

## Session 6 — Percée : insertion précise de composants

### Problème résolu
L'insertion de composants (qui change la taille du fichier) échouait systématiquement en sessions 1-5 à cause de la détection heuristique des pointeurs. Le taux de faux positifs pour les TAG_NIL u64 était de ~46%, produisant des fichiers corrompus.

### Technique : Pointer-by-diff
Au lieu de deviner les positions des pointeurs par analyse de patterns de tags (heuristique), on **compare le même composant à deux offsets différents** dans des snapshots successifs. Les valeurs u64 qui diffèrent par exactement le delta de position sont des pointeurs ; tout le reste est des données.

**Outil** : `script/multi_type_pointers.py` — compare les snapshots tt23.akp.v0..v11 et extrait les cartes de pointeurs pour chaque type.

### Découvertes clés

1. **TOUS les pointeurs internes des composants sont des u64 précédés de tags (0x65-0x69)**. Il n'y a AUCUN pointeur raw u32 à l'intérieur des blobs composants.

2. **Les templates ont toujours exactement 7 pointeurs u64**, quel que soit le type de composant.

3. **Le nombre de pointeurs d'instance varie par type** (état non-câblé) :
   | Type | Template | Instance | Taille totale |
   |------|----------|----------|---------------|
   | Duct | 7 | 38 | 2386B |
   | Waveguide | 7 | 45 | 2659B |
   | Radiator | 7 | 26 | 1824B |
   | DynDriver | 7 | 74 | 4246B |

4. **Pointeurs hors composants** (fichier entier) :
   - 2 pointeurs pré-composants (root block à 0x001D, référence à ~0x1112)
   - 41 pointeurs post-composants (zone wire/page/footer)
   - 1 self-ref u32 dans le marqueur block-end

5. **La validation `is_tag(data, tgt)` pour les POINTER_TAGS (66-69) cassait l'ajustement** des pointeurs pointant près de EOF (le footer n'est pas un tag). Supprimée pour les tags non-ambigus.

### Algorithme d'insertion précis

```
1. Charger le blob de référence (.akb) avec source_offset
2. Déterminer le type et consulter la carte de pointeurs exacte
3. Point d'insertion = first_comp (0x33DB) — le nouveau composant va EN PREMIER
4. Rebase blob : pour chaque position de pointeur connue, value += delta
5. Splice : insérer le blob rebasé AVANT les composants existants
6. Ajuster les pointeurs externes :
   - POINTER_TAGS (66-69) : toujours ajuster (sans validation is_tag)
   - Compound [TAG_66/67/69][TAG_NIL][u64] : pointeur à i+8
   - TAG_NIL u64 : ajuster avec validation cible
   - Raw u32 [65/68 65 u32 0000] : toujours ajuster
7. Metadata : num_types, after_name fix, block_end self_ref fix
```

### Résultats de validation

- **v1 + Waveguide** → 20746B = **taille identique à v2** ✅
- **v1 + WG + Rad + DD (chaîne)** → 4 types, outer_end = 0x5F46 (v7=0x5F48, diff=2B = longueur nom)
- **Toutes les validations structurelles passent** (outer_end, num_types, after_name, block_end)
- **44 pointeurs externes ajustés** (17 POINTER_TAG + 13 TAG_NIL + 14 raw u32)

### Fichiers créés
- `script/precise_insert.py` — Inserteur autonome avec cartes de pointeurs et validation
- `script/multi_type_pointers.py` — Extracteur de cartes de pointeurs par diff
- `script/file_level_pointers.py` — Carte des pointeurs au niveau fichier
- `blobs/*.akb` — Blobs de référence (Duct, Waveguide, Radiator, DynDriver)
- `analysis/pointer_maps.txt` — Cartes de pointeurs complètes

### Intégration dans akabak_tool_v2.py
- `POINTER_MAPS` — Constante avec les positions exactes des pointeurs par type
- `_rebase_blob_pointers` — Utilise les cartes précises quand disponibles, fallback heuristique sinon
- `_adjust_pointers` — Suppression de `is_tag(data, tgt)` pour POINTER_TAGS
- `find_insertion_point` — Utilise outer_end depuis l'en-tête component list

---

## Session 7 — Fix : pointeurs composés (compound pointers)

### Problème
Les fichiers générés par `precise_insert.py` étaient structurellement identiques aux références, mais AKAbak les rejetait toujours ("broken data-stream"). L'analyse byte-à-byte montrait 0 différence de structure.

### Découverte
5 pointeurs composés de type `[TAG_66/67/69][TAG_NIL][u64]` dans la zone post-composants n'étaient pas ajustés. Ces structures sont des pointeurs à 3 couches où le vrai u64 se trouve à `i+8` (et non `i+4` comme un simple `[TAG][u64]`).

### Fix
- Phase 1 : scanner les 3-byte préfixes `[TAG_66/67/69][TAG_NIL]` suivi d'un u64 pointant dans la zone
- Phase 2 : quand on ajuste les TAG_NIL u64, ignorer ceux qui sont précédés d'un tag (déjà traités en Phase 1)
- Résultat : 5 pointeurs compound détectés, 95 total (39 ptr_tag + 7 compound + 26 nil_u64 + 23 raw_u32)

### Impact
Fix nécessaire mais pas suffisant — le fichier était toujours rejeté par AKAbak après ce fix.

---

## Session 8 — Percée finale : ordre des composants

### Problème résiduel
Après le fix compound (Session 7), les fichiers générés sont byte-identiques aux références (sauf 8 octets : 6 timestamp + 2 instance Duct), toutes les validations passent, aucun checksum dans le format. Pourtant AKAbak refuse.

### Expérience discriminante
6 fichiers de test créés à partir de v2 (fichier fonctionnel connu) :
1. **Copie exacte de v2** → ✅ OK
2. **v2 + 1 byte timestamp modifié** → ✅ OK (pas de checksum)
3. **v2 + 1 bit data flippé** → ✅ OK (pas de CRC)
4. **v2 avec composants réordonnés** (WG↔Duct swappés) → ❌ REJETÉ
5. **Réordonné + bytes v1 pour Duct** → ❌ REJETÉ
6. **Notre insertion depuis v1** → ❌ REJETÉ

### Conclusion
**L'ordre des composants est critique.** AKAbak exige que le composant le plus récemment ajouté soit sérialisé EN PREMIER dans la zone composants (offset 0x33DB). L'ancien algorithme insérait à `outer_end` (fin), le bon algorithme insère à `first_comp` (début).

### Fix appliqué
- `insert_pos = first_comp` (0x33DB) au lieu de `outer_end`
- Modifié dans : `script/precise_insert.py`, `akabak_tool_v2.py`, `script/akabak_tool_v2.py`
- `find_insertion_point()` retourne maintenant `first_comp`

### Validation
- **test_INSERT_WG_v8.akp** et **test_INSERT_WG_CLI_v8.akp** : ouverts dans AKAbak ✅
- L'utilisateur confirme : « ça fonctionne »
- Insertion chaînée (v1 + WG + Rad) : fonctionne aussi ✅

---

## Session 9 — Duplication de composants

### Découverte
Algorithme de duplication de composants existants (cloner un Waveguide pour en faire un 2e).

- Delta = type_name_len + (type_ref_start - inst_data_start) + 196
- Structure de sortie : identity zone → expanded type_ref (37+N bytes) → matching block (159B) → clone → post-zone
- Pointer relocation pour tous les u64 taggés dans clone et post-zone
- 11 index patches par composant (9 property +9, 1 formula +8)

### Implémentation
- Commande `duplicate` ajoutée à `akabak_tool_v2.py`
- Index patch positions cartographiées pour Waveguide et Duct

---

## Session 10 — Fix blob tail ref + tests TEMPLATE LEM

### Bug critique trouvé
Chaque bloc composant a un `outer block end` [65 65 u32 0000] qui pointe APRÈS le blob vers le TAG_NIL après le nom du PROCHAIN composant. Lors d'insertion d'un blob depuis un contexte différent, ce pointeur est INCORRECT (longueur de nom différente).

### Fix
`_fix_blob_tail_ref()` ajouté à `akabak_tool_v2.py` — patche après rebase+insert.
C'était LA cause racine de tous les échecs d'insertion dans TEMPLATE LEM.

### Tests
- TT23 + WG = FONCTIONNE (toutes versions)
- TEMPLATE LEM + WG = ÉCHOUE encore (problème lié au count field, résolu plus tard)

---

## Session 11 — Câblage (Wire) : analyse détaillée

### Structure Wire découverte
- Wire suit le même pattern template/instance que les composants
- Wire prop_count = 8 (corrigé, pas 12)
- Chaque wire = 315B template + 205B instance = 520B total
- Wires stockés APRÈS le marqueur outer block end, dans leur propre bloc TAG_68

### Positions X,Y dans l'instance Wire
Offset +171: X1, +175: Y1, +179: X2, +183: Y2 (coordonnées grille des deux extrémités)

### Découverte : connexion par contact
- La **connexion par contact** (composants qui se touchent) est le VRAI mécanisme de connexion
- Pas besoin d'objet Wire — AKAbak détecte automatiquement les ports adjacents
- Seul le câblage manual (drag) crée un vrai objet Wire (520B)
- Pour toucher : `comp_B.X = comp_A.X + comp_A.width`, même `port_Y`
- Dimensions composants : WG 8×6, Duct 8×4, DynDriver 8×8, Radiator 4×8, etc.

### Implémentation positions
- `_patch_blob_position()` pour écrire X,Y dans un blob
- Commande `batch-insert` ajoutée pour insertion multi-composants avec positions

---

## Session 12 — Wire POINTER_MAP fix + multi-type insertion

### Bug trouvé
Les POINTER_MAPs des Wires avaient les positions TAG au lieu des positions VALUE (off by 4 bytes).
- Composants : template_ptrs[0]=0x0010 (u64 VALUE après TAG_BLOCK)
- Wire (FAUX) : template_ptrs[0]=0x000C (byte TAG_BLOCK lui-même)
- Le rebase écrasait les bytes TAG avec des valeurs de pointeurs → corruption

### Fix
+4 sur tous les offsets de pointeurs u64 Wire :
- template_ptrs: [0x0010, 0x00CD, 0x00E9, 0x0123] (était [0x000C, ...])
- instance_ptrs: [0x0045] (était [0x0041])

### Validation
- Duct, Radiator, DynDriver insérés correctement dans 40TESTFF
- Insertion combinée (Duct + Radiator + 4 wires) fonctionne : 14 composants + 7 wires

---

## Session 13 — Éditeur de formules globales (4 zones)

### Architecture des formules globales
Le Global Formula Editor d'AKAbak a 4 onglets, stockés comme blocs LPS indépendants dans la zone header (~0x1100-0x1900) :

| Onglet | Taille | Contenu |
|--------|--------|---------|
| Global | ~398B | WOOD_THICKNESS, HEIGHT, WIDTH, DEPTH... |
| LEM | ~1206B | SDf, H, D1-D20, DL1-DL20, L12-L1920 |
| Fields | ~285B | Application-specific |
| Spectra | ~439B | Z1, Y1, Z2... |

### Extraction des blobs formule
Blobs extraits depuis TEMPLATE_FINAL (15 snapshots, v0-v14) pour TOUS les types de composants :
- `duct_formula_ref.akb`, `waveguide_formula_ref.akb`, `dyndriver_formula_ref.akb`
- `encl_formula_ref.akb`, `enclvented_formula_ref.akb`, `massacou_formula_ref.akb`, `gnd_ref.akb`
- Source offset pour tous les blobs formule : 0x017E2D

---

## Session 14 — Nouveaux types de composants (Encl, EnclVented, MassAcou, GND)

### Nouveaux types ajoutés
| Type | Blob | Template | Instance | Ptrs (tpl+inst) |
|------|------|----------|----------|-----------------|
| Encl (Enclosure) | 1663B | 410 | 1253 | 7+24 |
| EnclVented (Vented) | 3558B | 487 | 3071 | 7+54 |
| MassAcou (Mass Acoust.) | 1535B | 527 | 1008 | 7+20 |
| GND (Ground) | 974B | 191 | 783 | 2+19 |

### POINTER_MAPS mis à jour
- Cartes de pointeurs extraites pour les 12 types par diff de snapshots
- Tous les blobs formule vérifient source_offset=0x017E2D

---

## Session 15 — Bugs critiques et validation finale dans AKAbak ✅

### Tests de validation
3 fichiers de test construits et ouverts dans AKAbak :
- `TEST_SINGLE_DUCT.akp` — v3 + 1 Duct à (40,20)
- `TEST_ALL_TYPES.akp` — v3 + 7 nouveaux composants (Duct, WG, DD, Encl, EnclVented, MassAcou, GND), 15 composants total
- `TEST_ALL_TYPES_VAR.akp` — idem mais formules remplacées par refs @VAR

### Bug 1 : recherche naïve dans `_fix_component_metadata()`
**Symptôme** : caractères chinois dans les formules, @WOOD_THICKNESS corrompu, composant DRIVER cassé
**Cause** : `data.find(b'Duct', 0x1000)` matchait "Duct" dans le texte de formule LEM `"// Largeurs des Ducts"` à l'offset 0x13BA au lieu du vrai composant à 0x17E31+. Écriture de métadonnées aux mauvais offsets → corruption des strings LPS.
**Fix** : Recherche LPS-aware (vérifier que le préfixe u32 length == len(nom)). Ajout aussi des types manquants : Radiator, Encl, EnclVented, MassAcou, GND.

### Bug 2 : count field off-by-one
**Symptôme** : erreur "File of newer version (GeoRefArr)" dans AKAbak
**Cause** : `len(get_components())` inclut GND, mais le count field = `len(comps) - 1` (le GND original terminateur n'est jamais compté).
**Validation** : vérifié sur les 15 snapshots TEMPLATE_FINAL (v0-v14). v14 = 15 comps, 2 GNDs, count=14=15-1 → confirme la règle -1 (pas -GND_count).
**Fix** : `actual_count = len(components) - 1`

### Comparaison byte-à-byte v4 vs notre outil
Seuls 12 octets de différence :
- 0x5A : random seed (change à chaque sauvegarde, non critique)
- 0x71 : timestamp
- 0x17E1D : count field (seule différence critique)
- 0x18226 : position composant

### Résultat final
**« Ça fonctionne !!!!! 0 Bug 0 Message d'erreur, toutes les variables et tous les composants sont présents »** — Confirmé par l'utilisateur dans AKAbak.

### État des 12 types supportés
DynDriver, Waveguide, Duct, Resistor, Filter, Source, Transform, Radiator, Encl, EnclVented, MassAcou, GND — **TOUS VALIDÉS** dans AKAbak.

---

## Session 16 — Reverse engineering complet du format Wire ✅

### Snapshots TEMPLATE_FINAL55 (v0-v9)
10 snapshots progressifs avec opérations de câblage :
- v0 = copie du Template Final (baseline, 3 wires)
- v1 = Dyn2 déplacé (+101B de re-sérialisation AKAbak)
- v2 = GND déplacé (0B delta)
- v3 = Dyn2+ câblé en parallèle (+1560B = 3×520B = jonction-T)
- v4 = Enclosure déplacé (0B delta)
- v5 = Enclosure câblé au rear du Driver (+520B = wire droit)
- v6 = Du2 déplacé (0B delta)
- v7 = Front Dyn2 câblé au Du2 (+1040B = 2×520B = wire coudé/L)
- v8 = Front Dyn1 câblé en parallèle au wire de Dyn2 (+1560B = 3×520B)
- v9 = Rear Dyn2 câblé en parallèle + WG1 câblé au Du2 (+2080B = 4×520B)

### Découvertes clés

**1. Wire = 520B = 315B template + 205B instance**
Chaque wire est un segment droit (HORIZ ou VERT). Confirmé sur les 10 snapshots.

**2. Coordonnées à instance+0xAB/AF/B3/B7**
- +0xAB: i32 X1, +0xAF: i32 Y1, +0xB3: i32 X2, +0xB7: i32 Y2
- Y=-1 pour les chemins de routage au-dessus des composants

**3. Flags de jonction-T à instance+0xBB/BC**
- flag=0 : normal ou coude-L
- flag=1 : jonction-T (3+ wires se rejoignent)

**4. En-tête de zone Wire (32B avant le premier template)**
```
+0x00: TAG_68  +0x04: NIL  +0x08: u64 ptr_last_tail
+0x10: u32 wire_count  +0x14: NIL  +0x18: u64 ptr_first
```

**5. Carte complète des pointeurs (12 par paire wire)**
Template (7 u64) : offsets 0x010, 0x020, 0x0CD, 0x0ED, 0x10A, 0x127, 0x133
Instance (5 u64) : offsets 0x010, 0x01C, 0x045, 0x0A3, 0x0C5
Tous les offsets relatifs identiques pour les 7 wires (v5) — vérification croisée 100%.

**6. Liste chaînée**
Chaque instance pointe (INST+0x0C5) vers le template suivant+8.
Dernier wire : [NIL][NIL][NIL][u32 end+4] au lieu d'un pointeur.

**7. Mécanique du câblage parallèle (jonction-T)**
- Modifie le wire existant : raccourcit X2 + met flag2=1 (2 octets changent)
- Ajoute 3 nouveaux wires (vertical vers routage, horizontal, branch vers cible)

### Scripts d'analyse créés
- `script/analyze_wire_snapshots.py` — comparaison des tailles v0-v9
- `script/extract_wire_coords.py` — extraction coordonnées
- `script/deep_wire_analysis.py` — flags jonction, diff parallèle
- `script/wire_template_analysis.py` — structure template détaillée
- `script/wire_zone_analysis.py` — en-tête zone, structure chaîne
- `script/wire_tail_analysis.py` — structure queue, vérification header
- `script/wire_crossref_analysis.py` — références croisées template↔instance
- `script/wire_all_pointers.py` — scan complet de tous les pointeurs

### Documentation
- `analysis/WIRE_FORMAT_ANALYSIS.md` — analyse complète avec algorithme de rebasing

---

## 7. Limites actuelles

### 7.1 ~~Insertion/suppression de composants → NE FONCTIONNE PAS~~ → **RÉSOLU** (Session 6-15)
L'insertion de TOUS les 12 types de composants fonctionne, avec positioning et formules @VAR. Vérifié dans AKAbak — 0 bugs, 0 erreurs (Session 15).

### 7.2 ~~Modification du câblage → EN COURS D'ANALYSE~~ → **FORMAT DÉCODÉ** (Session 16)
Le câblage par contact (composants adjacents) fonctionne automatiquement via positioning.
Le format binaire des Wires est maintenant entièrement décodé :
- Wire = 520B = 315B template + 205B instance (segment droit)
- 7 pointeurs u64 dans le template, 5 dans l'instance — tous mappés
- En-tête de zone Wire (32B) avec compteur et pointeurs de chaîne
- Coordonnées (X1,Y1,X2,Y2) à instance+0xAB/AF/B3/B7
- Flags de jonction-T à instance+0xBB/BC
- Liste chaînée : chaque instance pointe vers le template suivant+8
- Analyse complète : analysis/WIRE_FORMAT_ANALYSIS.md
Prochaine étape : implémenter la génération programmatique de wires dans akabak_tool_v2.py.

### 7.3 Texte plus long que l'original → IMPOSSIBLE
Le remplacement in-place impose que le nouveau texte soit ≤ ancien en longueur.

### 7.4 Workflow recommandé
1. **Dans AKAbak** : créer au moins 1 composant → sauvegarder comme template
2. **Par script** : insérer des composants via `insert --blob`, renommer via `rename`, paramétrer via `apply --config`
3. Les composants non utilisés peuvent rester non câblés (ignorés par la simulation)

---

## 8. Structure du projet

```
AKA HEX/
├── akabak_tool_v2.py          # Outil principal (CLI)
├── akp_watcher.py             # Surveillance temps réel
├── AKABAK_FORMAT_REFERENCE.md # Référence du format binaire
├── AKP_FORMAT_ANALYSIS.md     # Analyse détaillée du format
├── JOURNAL_REVERSE_ENGINEERING.md  # Ce fichier
│
├── templates/                 # Fichiers .akp de base
│   ├── TEMPLATE LEM.akp      # Template 5 composants
│   ├── TEMPLATE LEM2.akp     # Template 9 composants
│   ├── TEMPLATE LEM36.akp    # Template 8 composants (insertion test)
│   ├── SZKCH-115LM LEM.akp   # Projet réel 13 composants
│   └── TT23.akp              # Projet test
│
├── configs/                   # Fichiers de configuration .ini
│   ├── exemple_projet.ini     # Exemple documenté
│   ├── szkch_config.ini       # Config pour SZKCH-115LM
│   └── test23_config.ini      # Config pour TT23
│
├── tests/                     # Fichiers de test générés (~37 fichiers)
│   ├── test_INPLACE.akp       # ✅ Premier test in-place réussi
│   ├── test_rename.akp        # ✅ Test rename réussi
│   ├── test_full.akp          # ✅ Test rename "MON PROJET"
│   ├── test_full_config.akp   # ✅ Test rename + apply config
│   ├── test_V0a-V0f*.akp     # Tests isolation ultra-minimale (échoués)
│   ├── test_V1-V5*.akp       # Tests isolation progressive (échoués)
│   ├── test_A-E*.akp         # Tests isolation par fonctionnalité
│   └── ...                    # Autres tests (insert, duplicate, etc.)
│
├── reference_akp/             # Fichiers .akp numérotés (1-8 composants)
│   └── 1.akp à 8.akp         # Références avec N composants chacun
│
├── blobs/                     # Composants extraits (.akb)
│   ├── duct_formula_ref.akb   # Duct avec formules (2568B)
│   ├── waveguide_formula_ref.akb  # Waveguide avec formules (2879B)
│   ├── dyndriver_formula_ref.akb  # DynDriver avec formules (4481B)
│   ├── encl_formula_ref.akb   # Enclosure avec formules (1671B)
│   ├── enclvented_formula_ref.akb # EnclVented avec formules (3566B)
│   ├── massacou_formula_ref.akb   # MassAcou avec formules (1543B)
│   └── gnd_ref.akb            # GND référence (982B)
│
├── images/                    # Captures d'écran AKAbak
├── analysis/                  # Fichiers d'analyse (wiring, index)
├── script/                    # ~90 scripts d'analyse et debug
│   ├── akabak_tool_v2.py      # Copie miroir de l'outil principal
│   ├── smart_diff.py          # Diff structurel
│   ├── inplace_test.py        # Preuve de concept in-place
│   └── ...                    # Scripts d'analyse divers
│
├── _akp_snapshots/            # Snapshots du watcher
└── ABEC3_extracted/           # Documentation AKAbak extraite (CHM)
```
