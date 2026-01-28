# Système d'Icônes SVG - CAD-AKABAK Toolbox

## 📁 Organisation

Toutes les icônes SVG sont centralisées dans le dossier `/src/assets/icon/`

## 🎨 Icônes Disponibles

### Icônes Principales (Dashboard)
- `geometry.svg` - Icône pour le panneau Geometry (boîte 3D)
- `physics.svg` - Icône pour le panneau Physics (éclair)
- `mesh.svg` - Icône pour le panneau Mesh & Frequency (réseau de nœuds)
- `speaker.svg` - Icône pour le panneau Driver DB (haut-parleur)
- `goggles.svg` - Icône pour le panneau Advanced (lunettes)
- `pencil.svg` - Icône pour le panneau Notes (crayon)

### Icônes d'Interface
- `calendar.svg` - Gestionnaire de commandes
- `cloud.svg` - SIM-DB Cloud
- `settings.svg` - Configuration

### Icônes de Fichiers
- `folder.svg` - Dossier
- `file.svg` - Fichier
- `copy.svg` - Copier

## 🔧 Utilisation

### Import du Module

```javascript
import { getIcon, getFileIcon, getCopyIcon, ICONS } from '../icons.js';
```

### Méthodes Disponibles

#### `getIcon(key, alt, className)`
Génère une balise img pour une icône en utilisant la clé du catalogue.

```javascript
// Exemple
const icon = getIcon('GEOMETRY', 'Geometry', 'w-16 h-16');
// Résultat: <img src="./assets/icon/geometry.svg" alt="Geometry" class="w-16 h-16">
```

#### `getIconImg(iconName, alt, className)`
Génère une balise img pour une icône en utilisant le nom du fichier.

```javascript
// Exemple
const icon = getIconImg('physics.svg', 'Physics', 'w-6 h-6');
```

#### `getFileIcon(type)`
Retourne l'icône appropriée pour un fichier ou dossier.

```javascript
// Exemple
const icon = getFileIcon('directory'); // Retourne l'icône folder
const icon = getFileIcon('file');      // Retourne l'icône file
```

#### `getCopyIcon()`
Retourne l'icône de copie formatée pour les boutons.

```javascript
// Exemple
const copyBtn = `<button>${getCopyIcon()}</button>`;
```

#### `getIconPath(iconName)`
Retourne le chemin complet d'une icône.

```javascript
// Exemple
const path = getIconPath('settings.svg');
// Résultat: ./assets/icon/settings.svg
```

### Catalogue des Icônes (ICONS)

```javascript
ICONS = {
  GEOMETRY: 'geometry.svg',
  PHYSICS: 'physics.svg',
  MESH: 'mesh.svg',
  SPEAKER: 'speaker.svg',
  GOGGLES: 'goggles.svg',
  PENCIL: 'pencil.svg',
  CALENDAR: 'calendar.svg',
  CLOUD: 'cloud.svg',
  SETTINGS: 'settings.svg',
  FOLDER: 'folder.svg',
  FILE: 'file.svg',
  COPY: 'copy.svg',
}
```

## ✅ Avantages de cette Architecture

1. **Centralisation** : Toutes les icônes au même endroit
2. **Réutilisabilité** : Un seul module pour toute l'application
3. **Maintenance facile** : Modifier une icône = modifier un seul fichier
4. **Performance** : Les SVG sont chargés comme des images (pas de code inline)
5. **Cohérence** : Toutes les icônes suivent le même style

## 🔄 Migration

Les emojis suivants ont été remplacés :
- 📏 → `geometry.svg`
- ⚡️ → `physics.svg`
- ⛓️ → `mesh.svg`
- 🔊 → `speaker.svg`
- 🥽 → `goggles.svg`
- ✏️ → `pencil.svg`
- ☁️ → `cloud.svg`
- 📁 → `folder.svg`
- 📄 → `file.svg`

## 🎯 Fichiers Modifiés

- `/src/index.html` - Dashboard principal
- `/src/js/panels/sim-db.js` - Liste de fichiers
- `/src/js/panels/orders/templates.js` - Boutons de copie
- `/src/js/icons.js` - Module centralisé (nouveau)
- `/src/assets/icon/` - Dossier des icônes SVG

## 📝 Ajouter une Nouvelle Icône

1. Placer le fichier SVG dans `/src/assets/icon/`
2. Ajouter une entrée dans le catalogue `ICONS` de `/src/js/icons.js`
3. Utiliser la méthode `getIcon()` pour l'afficher

```javascript
// 1. Ajouter dans ICONS
export const ICONS = {
  // ...
  NEW_ICON: 'new-icon.svg',
};

// 2. Utiliser dans votre code
const icon = getIcon('NEW_ICON', 'Description', 'w-6 h-6');
```
