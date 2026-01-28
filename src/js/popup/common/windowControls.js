// =======================================================
// FICHIER :  src/js/popup/common/windowControls.js
// RÔLE    :  Barre de contrôles de fenêtre commune pour tous les popups
// =======================================================

/**
 * Génère la barre de titre avec contrôles personnalisés (style menu principal)
 * @param {string} title - Le titre à afficher
 * @returns {string} Le HTML de la barre
 */
export function getWindowControlsHtml(title) {
  return `
    <div class="window-controls" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background-color: var(--bg-elevated, #12121a); border-bottom: 1px solid var(--border-subtle, rgba(233, 30, 140, 0.2)); -webkit-app-region: drag; position: relative; z-index: 9999;">
      <span style="color: var(--text-subtitle, #fae8ff); font-size: 14px; font-weight: 700; letter-spacing: 0.05em; user-select: none; -webkit-user-select: none;">${title}</span>
      <div style="display: flex; gap: 8px; -webkit-app-region: no-drag; pointer-events: auto; position: relative; z-index: 10000;">
        <button id="popup-min-btn" class="window-control-btn" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: transparent; border: none; cursor: pointer; transition: all 150ms ease; padding: 0; -webkit-app-region: no-drag; position: relative; z-index: 10001;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted, #999);"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button id="popup-close-btn" class="window-control-btn window-control-close" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: transparent; border: none; cursor: pointer; transition: all 150ms ease; padding: 0; -webkit-app-region: no-drag; position: relative; z-index: 10001;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted, #999); pointer-events: none;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
        </button>
      </div>
    </div>
  `;
}

/**
 * Initialise les event listeners pour les contrôles de fenêtre
 */
export function initializeWindowControls() {
  console.log('[WindowControls] Initialisation...');
  console.log('[WindowControls] window.electronAPI existe ?', !!window.electronAPI);
  console.log('[WindowControls] windowAction existe ?', !!window.electronAPI?.windowAction);
  
  const minBtn = document.getElementById('popup-min-btn');
  const closeBtn = document.getElementById('popup-close-btn');
  
  console.log('[WindowControls] Boutons trouvés:', { minBtn: !!minBtn, closeBtn: !!closeBtn });

  if (minBtn) {
    minBtn.addEventListener('click', () => {
      console.log('[WindowControls] Minimize cliqué');
      if (window.electronAPI && window.electronAPI.windowAction) {
        window.electronAPI.windowAction('minimize');
      } else {
        console.error('[WindowControls] electronAPI.windowAction non disponible');
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      console.log('[WindowControls] Close cliqué');
      if (window.electronAPI && window.electronAPI.windowAction) {
        window.electronAPI.windowAction('close');
      } else {
        console.error('[WindowControls] electronAPI.windowAction non disponible');
      }
    });
  }
}

/**
 * Styles CSS communs pour les contrôles de fenêtre
 */
export function getWindowControlsStyles() {
  return `
    <style>
      .window-control-btn:hover {
        background: var(--bg-hover, rgba(233, 30, 140, 0.08)) !important;
      }
      
      .window-control-close:hover {
        background: rgba(239, 68, 68, 0.15) !important;
      }
    </style>
  `;
}
