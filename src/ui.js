// =======================================================
// FICHIER : src/ui.js (VERSION AVEC THÈMES PERSONNALISABLES)
// =======================================================

const KNOWN_THEMES = [
  'theme-dark-blue',
  'theme-amber-matrix',
  'theme-high-contrast',
  'theme-arcade-purple'
];

export function applyUiSettings(uiSettings = {}) {
  const settings = {
    scanlines: true,
    reducedMotion: false,
    buttonSkin: 'striped',
    theme: 'default',
    customColors: null,      // NEW: couleurs personnalisées
    ...uiSettings
  };

  document.body.classList.remove(...KNOWN_THEMES);
  if (settings.theme && settings.theme !== 'default' && KNOWN_THEMES.includes(settings.theme)) {
    document.body.classList.add(settings.theme);
  }

  document.body.classList.toggle('no-scanlines', settings.scanlines === false);
  document.body.classList.toggle('reduced-motion', settings.reducedMotion === true);
  document.body.classList.toggle('btn-skin-solid', settings.buttonSkin === 'solid');

  // Application des couleurs personnalisées
  applyCustomColors(settings.customColors);
  
  // Déclencher un événement pour mettre à jour les graphiques
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: settings }));
}

/**
 * Applique des couleurs personnalisées via CSS variables
 */
export function applyCustomColors(customColors) {
  const root = document.documentElement;
  
  if (!customColors) {
    return; // On garde les variables du thème par défaut
  }

  // Bordures
  if (customColors.borderPrimary) root.style.setProperty('--border-primary', customColors.borderPrimary);
  if (customColors.borderHover) root.style.setProperty('--border-hover', customColors.borderHover);
  
  // Icônes
  if (customColors.iconFilterPrimary) root.style.setProperty('--icon-filter-primary', customColors.iconFilterPrimary);
  if (customColors.iconFilterHover) root.style.setProperty('--icon-filter-hover', customColors.iconFilterHover);
  
  // Textes
  if (customColors.textTitle) root.style.setProperty('--text-title', customColors.textTitle);
  if (customColors.textSubtitle) root.style.setProperty('--text-subtitle', customColors.textSubtitle);
  if (customColors.textBody) root.style.setProperty('--text-body', customColors.textBody);
  
  // Boutons
  if (customColors.btnPrimaryBorder) root.style.setProperty('--btn-primary-border', customColors.btnPrimaryBorder);
  if (customColors.btnDangerBorder) root.style.setProperty('--btn-danger-border', customColors.btnDangerBorder);
}

export async function initializeUi() {
  const settings = await window.electronAPI.getSettings();
  applyUiSettings(settings?.ui);
}
