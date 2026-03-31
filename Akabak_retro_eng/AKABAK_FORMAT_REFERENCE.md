# AKAbak .akp - Format de Fichier & Guide de Creation de Composants LEM

## Vue d'ensemble du format .akp

Le format `.akp` est un format binaire proprietaire utilise par **AKAbak** (RDTeam, v3.1.x).
Il serialise un arbre d'objets Delphi avec des pointeurs absolus internes.

### Structure du header

```
Offset  Taille  Description
------  ------  -----------
0x0000  4+N     String length-prefixed: "RDTeam File 000 1.000"
0x0019  4       Tag 0x68 (debut du bloc racine)
0x001D  8       u64: offset de fin du bloc racine (= taille_fichier - 4)
0x0025  4+N     String: version du moteur (ex: "3.1.9 b108")
0x0033  4+N     String: signature app (ex: "RDTeam Akabak 000 3.100")
...
0x0062  4+N     String: date de sauvegarde "YYYY-MM-DD HH:MM:SS"
0x0079  4+N     String: nom du projet
0x008E  4+N     String: unites "s=ms, m=mm, kg=g, N/m=N/m, H=mH, F=uF, m2=cm2, m3=L"
```

### Systeme de tags (octets marqueurs)

| Tag  | Nom     | Taille totale | Description |
|------|---------|---------------|-------------|
| 0x65 | NIL     | 4 octets      | Valeur nulle (pas de donnees) |
| 0x66 | REF66   | 12 octets     | Reference absolue (4 tag + 8 offset) |
| 0x67 | REF67   | 12 octets     | Reference absolue (4 tag + 8 offset) |
| 0x68 | BLOCK   | 12 octets     | Debut de bloc (4 tag + 8 offset de fin) |
| 0x69 | REF69   | 12 octets     | Reference speciale (4 tag + 8 offset) |

### Chaines de texte
Les chaines sont encodees en ASCII avec prefixe de longueur u32 (little-endian):
```
[4 octets: longueur N] [N octets: texte ASCII]
```

---

## Sections du fichier

### 1. Bloc de constantes globales
Situe typiquement a l'offset ~0x113D dans le fichier LEM de reference.
Contient les variables utilisables par tous les composants via `@NOM_VARIABLE`.

```
//////////CONSTANTE//////////
WOOD_THICKNESS = 15        // epaisseur des parois (mm)
RMIN           = 70        // range min pour les observations
DAMPING        = 0.1       // amortissement
WOOD           = 0.01      // coefficient eta du bois

//////////NOMBRE D'UNITES//////////
N = 1                      // nombre d'unites
x = 0.150                  // facteur de correction

//////////DIMENSION//////////
HEIGHT = 600               // hauteur de l'enceinte (mm)
WIDTH  = 450               // largeur (mm)
DEPT   = 800               // profondeur (mm)

//////////PPBOX RADIATION//////////
MOUTH_H = HEIGHT
MOUTH_D = WIDTH - 2*WOOD_THICKNESS

//////////TOOLS//////////
IB = (HEIGHT/n)/2
```

### 2. Parametres du haut-parleur
```
SDf = 855.0    // surface frontale du diaphragme (cm2)
SDr = 855.0    // surface arriere (cm2)
Mms = 173.0    // masse mobile (g)
fs  = 33.0     // frequence de resonance (Hz)
Qms = 4.3      // Q mecanique
Re  = 5.1      // resistance DC (Ohm)
BL  = 28.0     // facteur de force (T*m)
Le  = 1.9      // inductance (mH)
```

### 3. Composants du circuit LEM

Chaque composant apparait DEUX fois dans le fichier:
1. **Template** (definition du type avec proprietes par defaut)
2. **Instance** (instance reelle avec les valeurs specifiques)

---

## Types de composants LEM

### DynDriver (Haut-parleur electrodynamique)
```
SDf = @SDf          // Surface frontale (cm2) - reference a constante globale
SDr = @SDr          // Surface arriere (cm2)
Mms = @Mms          // Masse mobile (g)
fs  = @fs           // Frequence de resonance (Hz)
Qms = @Qms          // Q mecanique
Re  = @Re           // Resistance DC (Ohm)
BL  = @BL           // Force factor (T*m)
Le  = @Le           // Inductance (mH)
```

### Duct (Conduit acoustique)
```
WD  = @D1           // Largeur du conduit (mm)
HD  = @H            // Hauteur du conduit (mm)
Len = @DL1          // Longueur du conduit (mm)
eta = @WOOD         // Coefficient d'amortissement
vf  = 2.5*@n        // Facteur de volume (optionnel)
```

### Waveguide (Guide d'onde / Pavillon)
```
HTh = @H            // Hauteur de la gorge (Throat)
HMo = @H            // Hauteur de la bouche (Mouth)
WTh = @D3           // Largeur gorge
WMo = @D4           // Largeur bouche
Len = @L34          // Longueur du guide
T   = 10            // Salmon factor (0=catenoidal, 1=expo, >1=conique)
```
Proprietes speciales: `Throat`, `Mouth`, `Length`, `Slope` (Exponential/Conical)

### Volume (Chambre acoustique)
```
HCab   = @HEIGHT    // Hauteur de l'enceinte
WCab   = @WIDTH     // Largeur
LenCab = @DEPT      // Profondeur

HD  = 100           // Hauteur du port (mm)
WD  = 420           // Largeur du port (mm)
```

### Filter (Filtre electrique)
Proprietes configurees via l'interface:
- **Type**: Low-pass, Low to high-pass, Low to band-pass, Low to all-pass
- **Alignment**: Butterworth, Bessel, Linkwitz-Riley, Chebychev, etc.
- **Order**: Ordre du filtre (1 a N)
- **Filter frequency**: Frequence de coupure
- **Amplification factor**: Gain
- **Delay**: Retard temporel et spatial

### Source (Source)
- **Source type**: "Potential source" ou "Flow source"
- **Network type**: "Impedance network" ou "Mobility network"
- **Domain type**: Electric, Mechanic, Acoustic

### Resistor (Resistance)
- **Value**: Valeur en Ohm

---

## Syntaxe des formules

Les formules AKAbak utilisent:
- `@NOM` pour referencer une constante globale
- `@NOM_COMPOSANT.propriete` pour referencer une propriete d'un autre composant
- Operateurs: `+`, `-`, `*`, `/`, `^` (puissance)
- Fonctions: `sqrt()`, `sin()`, `cos()`, `exp()`, `log()`, `abs()`
- Separateur de ligne: `\r\n` (CRLF)
- Commentaires: `//` jusqu'a fin de ligne

---

## Observations (Mesures/Graphiques)

### MEASURE (Mesure de reponse)
```
z1 = @Z1            // coordonnee z du point de mesure 1
Y1 = @Y1            // coordonnee y
z2 = @Z2            // coordonnee z du point 2
```

### POLAR (Directivite)
```
RangeMin = @RMIN    // plage minimale d'affichage
```
Types: P HORIZONTAL, P VERTICAL

### EXTERIOR (Vue exterieure)
Configuration de la geometrie 3D de l'enceinte

### IMPEDANCE
Courbe d'impedance electrique

---

## Utilisation de akabak_tool_v2.py

### Noms de types de composants (LPS)
Les noms de types dans le binaire sont les noms Delphi SANS suffixe:
- `DynDriver`, `Waveguide`, `Duct`, `Resistor`, `Filter`, `Source`, `Transform`

### Lister le contenu d'un fichier
```bash
python akabak_tool_v2.py list "MonFichier.akp"
```

### Modifier des constantes globales
```bash
python akabak_tool_v2.py patch "source.akp" "sortie.akp" --set "HEIGHT=800,WIDTH=500,DEPT=600"
```

### Modifier la formule d'un composant
```bash
# D'abord lister pour trouver l'index du composant
python akabak_tool_v2.py list "source.akp"

# Puis modifier (utiliser \n pour les sauts de ligne)
python akabak_tool_v2.py formula "source.akp" "sortie.akp" --comp 0 --formula "SDf = 900\nSDr = 900\nMms = 200\nfs  = 35\nQms = 5\nRe  = 6\nBL  = 30\nLe  = 2.0"
```

### Appliquer un fichier de configuration complet (batch)
```bash
python akabak_tool_v2.py apply "source.akp" "sortie.akp" --config projet.ini
```

Exemple de fichier `projet.ini`:
```ini
[constants]
HEIGHT = 700
WIDTH  = 500
DEPT   = 900
WOOD_THICKNESS = 18

[DynDriver.0]
SDf = @SDf
SDr = @SDr
Mms = @Mms
fs  = @fs

[Waveguide.0]
HTh = @H
HMo = @H
WTh = @D3
WMo = @D4
Len = @L34
T   = 12

[Duct.2]
WD  = @D3
HD  = @H
Len = @DL3
eta = @WOOD
```

### Comparer deux fichiers
```bash
python akabak_tool_v2.py diff "original.akp" "modifie.akp"
```

### Extraire un blob de composant
```bash
python akabak_tool_v2.py extract "source.akp" --comp 0 --out composant.bin
```

### Generer une formule pour un type
```bash
python akabak_tool_v2.py generate DynDriver --params "SDf=855,SDr=855,Mms=173,fs=33,Qms=4.3,Re=5.1,BL=28,Le=1.9"
python akabak_tool_v2.py generate Duct --params "WD=140,HD=600,Len=205,eta=0.01"
python akabak_tool_v2.py generate Waveguide --params "HTh=100,HMo=200,WTh=50,WMo=100,Len=300,T=10"
```

### Voir les templates disponibles
```bash
python akabak_tool_v2.py templates
```

---

## Workflow recommande pour creer un nouveau projet

1. **Partir du fichier template** (par ex. `SZKCH-115LM LEM.akp`)
2. **Modifier les constantes** pour votre enceinte
3. **Modifier les formules** des composants existants
4. **Ouvrir dans AKAbak** pour verifier et ajouter les connexions du circuit

### Exemple complet : modifier le systeme SZKCH
```bash
# Creer un fichier de config
# (voir szkch_config.ini pour un exemple complet)

# Appliquer les modifications en batch
python akabak_tool_v2.py apply "SZKCH-115LM LEM.akp" "MaVersion.akp" --config mon_projet.ini

# Verifier les differences
python akabak_tool_v2.py diff "SZKCH-115LM LEM.akp" "MaVersion.akp"

# Ouvrir MaVersion.akp dans AKAbak pour verifier
```

---

## Structure du circuit LEM dans le fichier

Le fichier contient une section "Repository" qui organise les composants, et une section
"Sys1" (System) qui definit le circuit electro-acoustique equivalent.

Les composants sont relies dans un schema LEM (Lumped Element Model) ou:
- Les **elements electriques** (Source, Resistor, Filter) forment le circuit d'entree
- Le **DynDriver** convertit l'electrique en mecanique/acoustique
- Les **Ducts** et **Waveguides** modelisent la propagation acoustique
- Les **Volumes** representent les chambres de compression

La topologie du circuit (connections entre composants) est stockee dans la partie binaire
non-editable du fichier. Pour modifier les connections, il faut utiliser l'interface
graphique d'AKAbak.

---

## Correspondance fichiers du dossier

| Fichier | Description |
|---------|-------------|
| `1.akp` | Projet vide (base template, 4 sections: General, Observation, Repository, Sys1) |
| `2.akp` | Projet avec 1 Waveguide |
| `3.akp` | Projet vide (variante) |
| `4.akp` | Projet avec 2 Waveguides |
| `5.akp` | Projet vide (variante) |
| `SZKCH-115LM LEM.akp` | Projet complet avec DynDriver, 6 Ducts, 4 Waveguides, Filter, Source, Resistor |
