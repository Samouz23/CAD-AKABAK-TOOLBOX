---
applyTo: "**"
---

# AKAbak Toolbox — Instructions pour GitHub Copilot

## Contexte obligatoire

**AVANT TOUTE MODIFICATION**, lis `AI_CONTEXT.md` à la racine de ce dossier.
Ce fichier contient le contexte complet de 20+ sessions de reverse engineering du format binaire .akp d'AKAbak.

## Fichiers de référence (par ordre de priorité)

1. **AI_CONTEXT.md** — Résumé complet : format, bugs, solutions, algorithmes, API
2. **JOURNAL_REVERSE_ENGINEERING.md** — Journal détaillé de chaque session
3. **AKABAK_FORMAT_REFERENCE.md** — Spécification du format binaire
4. **akabak_tool_v2.py** — Implémentation Python de référence (~1935 lignes)
5. **WIRE_FORMAT_ANALYSIS.md** — Analyse du format de câblage

## Règles critiques

- **Ordre d'insertion** : Le composant le plus récent DOIT être PREMIER dans la zone composants (insertion à `first_comp`, jamais à `outer_end`)
- **Count = composants - 1** : Le champ count ne compte JAMAIS le GND terminateur
- **LPS-aware** : TOUJOURS vérifier le préfixe u32 longueur quand on cherche un nom de type — JAMAIS chercher le texte brut directement
- **source_offset** : Doit correspondre à la position RÉELLE du blob dans le fichier source — sinon corruption silencieuse de TOUS les pointeurs
- **POINTER_MAPS** : Les offsets pointent vers la valeur u64, PAS vers le tag (tag est à offset-4)

## Architecture du code Python

Le fichier `akabak_tool_v2.py` est l'implémentation de référence. Pour le port en JavaScript :
- Toutes les opérations sont sur des `bytearray` → utiliser `Buffer` en Node.js
- Les entiers sont little-endian → `buffer.readUInt32LE()`, `buffer.readInt32LE()`
- Les pointeurs u64 sont en pratique des u32 (partie haute toujours 0) → `buffer.readUInt32LE(offset)` suffit pour la valeur, mais écrire les 8 bytes

## Types de composants supportés

Duct, Waveguide, DynDriver, Radiator, Encl, EnclVented, MassAcou, GND, Wire
(+ Filter, Source, Resistor existent dans AKAbak mais pas encore de blobs extraits)

## Langue de communication

L'utilisateur communique principalement en français.
