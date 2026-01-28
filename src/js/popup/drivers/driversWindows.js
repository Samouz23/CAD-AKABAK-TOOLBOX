// =======================================================
// FICHIER :  src/popup/drivers/driversWindows.js
// RÔLE    :  Définit les popups individuels pour Driver DB
// NOTE    :  La logique complète est dans drivers.js, ici on fournit juste le HTML
// =======================================================

import { getWindowControlsHtml, initializeWindowControls, getWindowControlsStyles } from '../common/windowControls.js';

// ==================== DATABASE VIEW (CLIPBOARD) ====================
export function getDriversDatabaseHtml() {
  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Driver Clipboard')}
    
    <div class="calc-content flex-grow" style="padding: 16px;">
      <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 12px; text-align: center;">Last 5 copied drivers</p>
      
      <div id="drivers-clipboard-list" style="display: flex; flex-direction: column; gap: 8px;">
        <!-- Les drivers seront ajoutés ici dynamiquement -->
      </div>
      
      <div id="clipboard-empty" style="text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 13px;">
        No drivers copied yet.<br>
        <span style="font-size: 11px; color: var(--text-subtle);">Copy a driver from the main app to see it here.</span>
      </div>
    </div>
    
    ${getCommonStyles()}
  `;
}

function getCommonStyles() {
  return `
    <style>
      .driver-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background-color: var(--bg-control-group);
        border: 1px solid var(--border-secondary);
        border-radius: 6px;
        padding: 10px 14px;
        transition: all 0.2s;
      }
      
      .driver-card:hover {
        border-color: var(--theme-accent);
        background-color: var(--bg-hover);
      }
      
      .driver-name {
        color: var(--text-title);
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        margin-right: 12px;
      }
      
      .copy-btn {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--theme-accent);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .copy-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(233, 30, 140, 0.3);
      }
      
      .copy-btn:active {
        transform: translateY(0);
      }
      
      .copy-btn.copied {
        background-color: #10b981;
      }
      
      .copy-btn svg {
        pointer-events: none;
      }
    </style>
  `;
}

// ==================== IMPORT VIEW ====================
export function getDriversImportHtml() {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Import Driver</title>
      <link rel="stylesheet" href="css/style.css">
      <link rel="stylesheet" href="css/theme-variables.css">
      <link rel="stylesheet" href="css/theme-application.css">
    </head>
    <body class="overflow-hidden" style="background-color: var(--bg-main);">
      <div class="flex flex-col h-screen">
        <!-- Window controls -->
        <div class="window-controls flex justify-between items-center px-4 py-2 select-none" style="background-color: var(--bg-panel); -webkit-app-region: drag; display: none;">
          <span class="font-bold" style="color: var(--theme-accent);">Import Driver</span>
          <div class="flex gap-2" style="-webkit-app-region: no-drag;">
            <button id="popup-min-btn" class="window-control-btn" title="Minimize">−</button>
            <button id="popup-max-btn" class="window-control-btn" title="Maximize">□</button>
            <button id="popup-close-btn" class="window-control-btn" title="Close">×</button>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-6">
          <div class="flex flex-col items-center">
            <div class="flex justify-between items-center w-full max-w-2xl mb-6">
              <h2 class="text-3xl font-bold text-white">Import a New Driver</h2>
              <button id="import-image-view-btn" class="btn btn--secondary" title="Import from an image">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="inline-block -mt-1 mr-2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                Import from Image
              </button>
            </div>
            <div class="w-full max-w-2xl">
              <div class="mb-6">
                <label class="font-bold text-white">File Name</label>
                <input type="text" id="import-name" class="form-input mt-1">
              </div>
              <div class="grid grid-cols-2 gap-x-8 gap-y-3">
                <label for="import-sd" class="text-white">SD <span class="text-gray-400 text-sm">(cm²)</span></label>
                <input type="text" id="import-sd" class="form-input form-input-sm" placeholder="ex: 530">
                
                <label for="import-mms" class="text-white">Mms <span class="text-gray-400 text-sm">(g)</span></label>
                <input type="text" id="import-mms" class="form-input form-input-sm" placeholder="ex: 184">
                
                <label for="import-fs" class="text-white">fs <span class="text-gray-400 text-sm">(Hz)</span></label>
                <input type="number" step="any" id="import-fs" class="form-input form-input-sm" placeholder="ex: 0.5">
                
                <label for="import-qms" class="text-white">Qms <span class="text-gray-400 text-sm">(sans unité)</span></label>
                <input type="number" step="any" id="import-qms" class="form-input form-input-sm" placeholder="ex: 7.">
                
                <label for="import-re" class="text-white">Re <span class="text-gray-400 text-sm">(Ω)</span></label>
                <input type="number" step="any" id="import-re" class="form-input form-input-sm" placeholder="ex: 5.">
                
                <label for="import-bl" class="text-white">BL <span class="text-gray-400 text-sm">(N/A)</span></label>
                <input type="number" step="any" id="import-bl" class="form-input form-input-sm" placeholder="ex: .8">
                
                <label for="import-le" class="text-white">Le <span class="text-gray-400 text-sm">(mH)</span></label>
                <input type="text" id="import-le" class="form-input form-input-sm" placeholder="ex: 0.">
                
                <label for="import-vol" class="text-white">Speaker Volume <span class="text-gray-400 text-sm">(L)</span></label>
                <input type="number" step="any" id="import-vol" class="form-input form-input-sm" placeholder="">
              </div>
              <div id="import-status" class="text-center h-6 pt-4"></div>
              <div class="text-center pt-4 mt-4">
                <button id="save-import-btn" class="btn btn--accent btn--lg">Save Driver</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ==================== SCRAPPER VIEW ====================
export function getDriversScrapperHtml() {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Driver Scrapper</title>
      <link rel="stylesheet" href="css/style.css">
      <link rel="stylesheet" href="css/theme-variables.css">
      <link rel="stylesheet" href="css/theme-application.css">
    </head>
    <body class="overflow-hidden" style="background-color: var(--bg-main);">
      <div class="flex flex-col h-screen">
        <!-- Window controls -->
        <div class="window-controls flex justify-between items-center px-4 py-2 select-none" style="background-color: var(--bg-panel); -webkit-app-region: drag; display: none;">
          <span class="font-bold" style="color: var(--theme-accent);">Driver Scrapper</span>
          <div class="flex gap-2" style="-webkit-app-region: no-drag;">
            <button id="popup-min-btn" class="window-control-btn" title="Minimize">−</button>
            <button id="popup-max-btn" class="window-control-btn" title="Maximize">□</button>
            <button id="popup-close-btn" class="window-control-btn" title="Close">×</button>
          </div>
        </div>

        <!-- Content -->
        <div id="scrapper-view-container" class="flex-1 overflow-y-auto p-6">
          <!-- Content will be injected by scrapper.js -->
        </div>
      </div>
    </body>
    </html>
  `;
}

// ==================== INITIALIZATION ====================
export function initializeDriversPopup() {
  console.log('[Drivers Popup] Initialisation...');
  
  // Initialiser les contrôles de fenêtre
  initializeWindowControls();

  // Charger et afficher l'historique des drivers copiés
  loadDriversClipboard();
}

/**
 * Charge et affiche les 5 derniers drivers copiés
 */
async function loadDriversClipboard() {
  const listContainer = document.getElementById('drivers-clipboard-list');
  const emptyMessage = document.getElementById('clipboard-empty');
  
  if (!listContainer || !emptyMessage) return;

  try {
    // Récupérer l'historique des drivers depuis localStorage
    const clipboardHistory = JSON.parse(localStorage.getItem('driversClipboard') || '[]');
    
    if (clipboardHistory.length === 0) {
      emptyMessage.style.display = 'block';
      listContainer.style.display = 'none';
      return;
    }

    emptyMessage.style.display = 'none';
    listContainer.style.display = 'flex';
    listContainer.innerHTML = '';

    // Afficher les 5 derniers drivers (les plus récents en premier)
    clipboardHistory.slice(0, 5).forEach((driver, index) => {
      const card = createDriverCard(driver, index);
      listContainer.appendChild(card);
    });

  } catch (error) {
    console.error('[Drivers Clipboard] Error loading clipboard:', error);
    emptyMessage.textContent = 'Error loading clipboard history.';
    emptyMessage.style.display = 'block';
    listContainer.style.display = 'none';
  }
}

/**
 * Crée une carte pour afficher un driver
 */
function createDriverCard(driver, index) {
  const card = document.createElement('div');
  card.className = 'driver-card';
  
  card.innerHTML = `
    <div class="driver-name" title="${driver.name}">${driver.name}</div>
    <button class="copy-btn" data-index="${index}" title="Copy T&S Parameters">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
  `;
  
  // Ajouter l'événement de copie
  const copyBtn = card.querySelector('.copy-btn');
  copyBtn.addEventListener('click', () => {
    copyDriverParams(driver, copyBtn);
  });
  
  return card;
}

/**
 * Copie les paramètres T&S d'un driver dans le presse-papier
 * Utilise le même format que l'application principale
 */
function copyDriverParams(driver, button) {
  const params = driver.params || {};
  
  // Utiliser le même format que buildContentFromParams dans l'application principale
  const lines = [
    `SDf = ${params.SDf ?? ''}`,
    `SDr = ${params.SDr ?? ''}`,
    `Mms = ${params.Mms ?? ''}`,
    `fs = ${params.fs ?? ''}`,
    `Qms = ${params.Qms ?? ''}`,
    `Re = ${params.Re ?? ''}`,
    `BL = ${params.BL ?? ''}`,
    `Le = ${params.Le ?? ''}`
  ];
  
  // Ajouter le volume du haut-parleur si disponible
  if (params.vol !== undefined && params.vol !== null && params.vol !== '') {
    lines.push(`//Speaker volume = ${params.vol}`);
  }
  
  const content = lines.join('\n');

  // Copier dans le presse-papier
  navigator.clipboard.writeText(content).then(() => {
    // Feedback visuel - changer l'icône en checkmark
    const originalHTML = button.innerHTML;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    button.classList.add('copied');
    
    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.classList.remove('copied');
    }, 1500);
  }).catch(err => {
    console.error('[Drivers Clipboard] Error copying to clipboard:', err);
  });
}

// Fonction utilitaire pour ajouter un driver à l'historique (appelée depuis l'app principale)
window.addDriverToClipboard = function(driver) {
  try {
    const clipboardHistory = JSON.parse(localStorage.getItem('driversClipboard') || '[]');
    
    // Ajouter le nouveau driver au début de l'historique
    clipboardHistory.unshift({
      name: driver.name,
      params: driver.params,
      timestamp: Date.now()
    });
    
    // Garder seulement les 5 derniers
    const trimmedHistory = clipboardHistory.slice(0, 5);
    
    // Sauvegarder
    localStorage.setItem('driversClipboard', JSON.stringify(trimmedHistory));
    
    console.log('[Drivers Clipboard] Driver added to clipboard:', driver.name);
  } catch (error) {
    console.error('[Drivers Clipboard] Error adding driver to clipboard:', error);
  }
};
function initializeDatabaseView() {
  console.log('Database view popup - logic to be implemented');
  // TODO: Importer et réutiliser la logique de drivers.js
}

function initializeImportView() {
  console.log('Import view popup - logic to be implemented');
  // TODO: Importer et réutiliser la logique de drivers.js
}

function initializeScrapperView() {
  console.log('Scrapper view popup - logic to be implemented');
  // TODO: Importer et réutiliser la logique de scrapper.js
}
