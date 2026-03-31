/**
 * Module centralisé pour la gestion des icônes SVG
 * Toutes les icônes sont stockées dans /src/assets/icon/
 */

const ICON_PATH = './assets/icon/';

/**
 * Catalogue des icônes disponibles
 */
export const ICONS = {
  // Icônes principales du dashboard
  GEOMETRY: 'geometry.svg',
  PHYSICS: 'physics.svg',
  MESH: 'mesh.svg',
  SPEAKER: 'speaker.svg',
  GOGGLES: 'goggles.svg',
  PENCIL: 'pencil.svg',
  
  // Icônes d'interface
  CALENDAR: 'calendar.svg',
  SETTINGS: 'settings.svg',
  
  // Icônes de fichiers
  FOLDER: 'folder.svg',
  FILE: 'file.svg',
  COPY: 'copy.svg',
};

/**
 * Génère une balise img pour une icône
 * @param {string} iconName - Nom du fichier SVG (ex: 'geometry.svg')
 * @param {string} alt - Texte alternatif
 * @param {string} className - Classes CSS (optionnel)
 * @returns {string} HTML de la balise img
 */
export function getIconImg(iconName, alt = '', className = 'w-6 h-6') {
  return `<img src="${ICON_PATH}${iconName}" alt="${alt}" class="${className}">`;
}

/**
 * Génère une balise img pour une icône en utilisant la clé du catalogue
 * @param {string} key - Clé du catalogue ICONS (ex: 'GEOMETRY')
 * @param {string} alt - Texte alternatif
 * @param {string} className - Classes CSS (optionnel)
 * @returns {string} HTML de la balise img
 */
export function getIcon(key, alt = '', className = 'w-6 h-6') {
  const iconName = ICONS[key];
  if (!iconName) {
    console.warn(`Icône non trouvée pour la clé: ${key}`);
    return '';
  }
  return getIconImg(iconName, alt, className);
}

/**
 * Retourne le chemin complet d'une icône
 * @param {string} iconName - Nom du fichier SVG
 * @returns {string} Chemin complet
 */
export function getIconPath(iconName) {
  return `${ICON_PATH}${iconName}`;
}

/**
 * Icônes spécifiques pour les types de fichiers
 */
export const getFileIcon = (type) => {
  const iconName = type === 'directory' ? ICONS.FOLDER : ICONS.FILE;
  return getIconImg(iconName, type === 'directory' ? 'Folder' : 'File', 'inline-block w-4 h-4');
};

/**
 * Icône de copie pour les boutons
 */
export const getCopyIcon = () => {
  return getIconImg(ICONS.COPY, 'Copy', 'w-4 h-4');
};

export default {
  ICONS,
  getIcon,
  getIconImg,
  getIconPath,
  getFileIcon,
  getCopyIcon,
};
