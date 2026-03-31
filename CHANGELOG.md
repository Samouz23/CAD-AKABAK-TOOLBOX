# 📋 Changelog / Journal des versions

---

## 🇫🇷 Français

---

### Version 1.1.0 — 31 mars 2026

**Nouvelles fonctionnalités**

- **Éditeur de circuits LEM Akabak** — Conception de modèles à éléments localisés (Duct, Waveguide, Enclosure, Radiator) avec placement sur grille, câblage entre modules et export binaire AKP via le backend Python (`akabak_tool_v2.py`)
- **HornStudio** — Outil de conception de pavillons interactif avec aperçu en temps réel, éditeur à pliage syntaxique et génération de formules
- **Aperçu 3D du maillage** — Visualiseur Three.js avec code couleur par surface, contrôles orbitaux, sélection par double-clic, options de symétrie miroir et export multi-format (STL, OBJ, Collada)
- **Base de données de presets Waveguide** — Sauvegarde, chargement et suppression de configurations gorge/bouche
- **Système de templates de formules** — Templates centralisés pour Duct (basique/transition), Waveguide (hauteur constante/variable), Enclosure (close/bass-reflex) avec modes grille et éditeur de code
- **Système de feature flags** — Activation/désactivation de fonctionnalités expérimentales (import OCR, calculateur d'enceinte)
- **Documentation d'aide Akabak intégrée** — Plus de 40 chapitres de référence HTML (LEM, BEM, maillage, impédance de rayonnement, modélisation sous-domaine, etc.)

**Refactoring & Architecture**

- **Module Horn** refactorisé : le monolithe `horn.js` (1400+ lignes) est découpé en modules spécialisés (`config.js`, `chart.js`, `formulas.js`, `exporters.js`, `tableManager.js`, `eventHandlers.js`, `uiTemplates.js`)
- **Module Mesh** refactorisé en répertoire modulaire avec composants popup dédiés (`meshPreviewPopup.js`, `meshSelector.js`, `meshWindows.js`, `meshMiniPopup.js`)
- **Pipeline Python** pour la génération LEM : template → validation → insertion composants → câblage → application INI → renommage

**Améliorations**

- Gestionnaires de maillage étendus : parsing STEP avec détection de groupes shell, gestion de groupes physiques (nommage automatique S1, S2…), intégration GMSH, longueur d'arête configurable, application de symétrie miroir
- Panneau Settings principal amélioré : sections repliables, sélecteur de templates LEM, sélecteur de thème (Default/Blue/Fire/White)
- Couche IPC/Preload étendue avec les API LEM, aperçu mesh et presets waveguide
- Paramètres LEM ajoutés dans `settings.js` (eta, etab, etaD, Rg)
- Création automatique des sous-dossiers de sortie (Mesh-out, STL-out, CSV-out, ABEC-out)
- +212 lignes de styles CSS (canvas 3D, grille mesh, animations, modales)

**Supprimé**

- `nasClient.js`, `nasHandlers.js`, `ordersHandlers.js` — modules NAS/commandes dépréciés

---

### Version 1.0.3 — 18 février 2026

- Ajout du module de directivité
- Simplification et amélioration des popups Geometry, calculatrice, mesh et base de drivers
- Amélioration des curseurs dans le traceur d'expansion de pavillon

### Version 1.0.2 — 28 janvier 2026

- Ajout de 2 nouveaux modules Physics : SPL Calculator & Crossover Calculator
- Ajout du web scraper pour base de données drivers (loudspeakerdatabase.com)
- Ajout de la fonction « Find Similar » pour comparer les paramètres T&S
- Base de données drivers JSON avec filtrage avancé
- Nouvelles fonctionnalités d'export mesh dans Waveguide Studio
- Manuel bilingue (FR/EN) avec sélecteur de langue
- Améliorations des thèmes UI et options de personnalisation

### Version 1.0.1 — 28 janvier 2026

- Sécurité : déplacement des fichiers sensibles vers private/ + hooks de protection

### Version 1.0.0 — 28 janvier 2026

- Commit initial — Application CAD-Akabak Toolbox

---
---

## 🇬🇧 English

---

### Version 1.1.0 — March 31, 2026

**New Features**

- **Akabak LEM Circuit Editor** — Lumped element model design (Duct, Waveguide, Enclosure, Radiator) with grid-based placement, module wiring and binary AKP export via Python backend (`akabak_tool_v2.py`)
- **HornStudio** — Interactive horn designer workbench with live preview, syntax-aware folding editor and formula generation
- **3D Mesh Preview** — Three.js viewer with per-surface color coding, orbit controls, double-click surface selection, mirror symmetry options and multi-format export (STL, OBJ, Collada)
- **Waveguide Presets Database** — Save, load and delete throat/mouth preset configurations
- **Formula Templates System** — Centralized templates for Duct (basic/transition), Waveguide (constant/variable height), Enclosure (sealed/vented) with grid and code editor modes
- **Feature Flags System** — Toggle experimental features on/off (OCR driver import, Enclosure calculator)
- **Integrated Akabak Help Documentation** — 40+ reference HTML chapters (LEM, BEM, meshing, radiation impedance, sub-domain modeling, etc.)

**Refactoring & Architecture**

- **Horn module** refactored: monolithic `horn.js` (1400+ lines) split into specialized modules (`config.js`, `chart.js`, `formulas.js`, `exporters.js`, `tableManager.js`, `eventHandlers.js`, `uiTemplates.js`)
- **Mesh module** refactored into modular directory with dedicated popup components (`meshPreviewPopup.js`, `meshSelector.js`, `meshWindows.js`, `meshMiniPopup.js`)
- **Python pipeline** for LEM generation: template → validation → component insertion → wiring → INI application → rename

**Improvements**

- Expanded mesh handlers: STEP file parsing with shell group detection, physical group management (auto-naming S1, S2…), GMSH integration, configurable edge length, mirror symmetry application
- Enhanced main settings panel: collapsible sections, LEM template selector, theme picker (Default/Blue/Fire/White)
- Extended IPC/Preload layer with LEM, mesh preview and waveguide preset APIs
- Added LEM settings in `settings.js` (eta, etab, etaD, Rg)
- Auto-creation of output subfolders (Mesh-out, STL-out, CSV-out, ABEC-out)
- +212 lines of CSS styles (3D canvas, mesh grid, animations, modals)

**Removed**

- `nasClient.js`, `nasHandlers.js`, `ordersHandlers.js` — deprecated NAS/orders modules

---

### Version 1.0.3 — February 18, 2026

- Added directivity module
- Simplified and improved Geometry, basics calculator, mesh and driver DB popups
- Improved cursors in horn expansion tracer

### Version 1.0.2 — January 28, 2026

- Added 2 new Physics modules: SPL Calculator & Crossover Calculator
- Added web scraper for driver database from loudspeakerdatabase.com
- Added "Find Similar" feature to compare drivers by T&S parameters
- Smart JSON-based driver database with advanced filtering
- New mesh export features in Waveguide Studio
- Bilingual manual (EN/FR) with language switcher
- Improved UI themes and customization options

### Version 1.0.1 — January 28, 2026

- Security: moved sensitive files to private/ + protection hooks

### Version 1.0.0 — January 28, 2026

- Initial commit — CAD-Akabak Toolbox application
