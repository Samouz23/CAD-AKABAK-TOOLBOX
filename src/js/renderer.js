// =======================================================
// FICHIER :  src/js/renderer.js
// RÔLE    :  Orchestre l'affichage des panneaux et gère les
//            événements globaux de l'interface.
// =======================================================

import { getGeometryPanelHtml, initializeGeometryPanel } from './panels/geometry.js';
import { getPowerPanelHtml, initializePowerPanel } from './panels/physics/power.js';
import { getMeshPanelHtml, initializeMeshPanel } from './panels/mesh.js';
import { getSettingsPanelHtml, initializeSettingsPanel } from './panels/mainsettings/mainsettings.js';
import { getDriversPanelHtml, initializeDriversPanel } from './panels/driver_db/drivers.js';
import { getNotesPanelHtml, initializeNotesPanel } from './panels/notes.js';
import { getHornPanelHtml, initializeHornPanel } from './panels/horn.js';
import { getWaveguidePanelHtml, initializeWaveguidePanel } from './panels/waveguidestudio/waveguide.js';
import { getHornscriptPanelHtml, initializeHornscriptPanel } from './panels/hornscript.js';
import { getDuctscriptPanelHtml, initializeDuctscriptPanel } from './panels/ductscript.js';
import { getDirectivityPanelHtml, initializeDirectivityPanel } from './panels/directivity.js';
import { initializeUi } from '../ui.js';

// [IMPORTS CONDITIONNELS] sim-db et orders sont chargés dynamiquement
// pour permettre leur suppression sans casser l'application
let getSimDbPanelHtml, initializeSimDbPanel;
let getOrdersPanelHtml, initializeOrdersPanel;

import { 
  getBasicOhmHtml, 
  getBasicParallelHtml, 
  getBasicWavelengthHtml, 
  initializeBasicCalculatorPopup 
} from './popup/basics/basicCalculatorsWindows.js';
import {
  getGeometryRectangularHtml,
  getGeometryPrismHtml,
  getGeometryDiameterHtml,
  getGeometryConversionHtml,
  initializeGeometryCalculator
} from './popup/geometry/geometryCalculators.js';
import {
  getMeshMiniPopupHtml,
  initializeMeshMiniPopup
} from './popup/mesh/meshMiniPopup.js';
import {
  getMeshMeshingHtml,
  getMeshFrequencyListHtml,
  initializeMeshPopup
} from './popup/mesh/meshWindows.js';
import {
  getDriversDatabaseHtml,
  getDriversImportHtml,
  getDriversScrapperHtml,
  initializeDriversPopup
} from './popup/drivers/driversWindows.js';

window.panelEvents = new EventTarget();

const panelModules = {
  geometry: { getHtml: getGeometryPanelHtml, initialize: initializeGeometryPanel },
  power: { getHtml: getPowerPanelHtml, initialize: initializePowerPanel },
  mesh: { getHtml: getMeshPanelHtml, initialize: initializeMeshPanel },
  settings: { getHtml: getSettingsPanelHtml, initialize: initializeSettingsPanel },
  drivers: { getHtml: getDriversPanelHtml, initialize: initializeDriversPanel },
  notes: { getHtml: getNotesPanelHtml, initialize: initializeNotesPanel },
  horn: { getHtml: getHornPanelHtml, initialize: initializeHornPanel },
  waveguide: { getHtml: getWaveguidePanelHtml, initialize: initializeWaveguidePanel },
  hornscript: { getHtml: getHornscriptPanelHtml, initialize: initializeHornscriptPanel },
  ductscript: { getHtml: getDuctscriptPanelHtml, initialize: initializeDuctscriptPanel },
  directivity: { getHtml: getDirectivityPanelHtml, initialize: initializeDirectivityPanel },
  // 'sim-db' et 'orders' sont ajoutés dynamiquement au démarrage
  'basic-ohm': { getHtml: getBasicOhmHtml, initialize: initializeBasicCalculatorPopup },
  'basic-parallel': { getHtml: getBasicParallelHtml, initialize: initializeBasicCalculatorPopup },
  'basic-wavelength': { getHtml: getBasicWavelengthHtml, initialize: initializeBasicCalculatorPopup },
  'geometry-rectangular': { getHtml: getGeometryRectangularHtml, initialize: initializeGeometryCalculator },
  'geometry-prism': { getHtml: getGeometryPrismHtml, initialize: initializeGeometryCalculator },
  'geometry-diameter': { getHtml: getGeometryDiameterHtml, initialize: initializeGeometryCalculator },
  'geometry-conversion': { getHtml: getGeometryConversionHtml, initialize: initializeGeometryCalculator },
  'mesh-mini': { getHtml: getMeshMiniPopupHtml, initialize: initializeMeshMiniPopup },
  'mesh-meshing': { getHtml: getMeshMeshingHtml, initialize: initializeMeshPopup },
  'mesh-frequency-list': { getHtml: getMeshFrequencyListHtml, initialize: initializeMeshPopup },
  'drivers-database': { getHtml: getDriversDatabaseHtml, initialize: initializeDriversPopup },
  'drivers-import': { getHtml: getDriversImportHtml, initialize: initializeDriversPopup },
  'drivers-scrapper': { getHtml: getDriversScrapperHtml, initialize: initializeDriversPopup },
};

// Startup disclaimer popup
function showStartupDisclaimer() {
  const modal = document.createElement('div');
  modal.id = 'startup-disclaimer-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 99999;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: var(--bg-secondary, #1a1a1a);
    border: 2px solid var(--border-primary, #ec4899);
    border-radius: 8px;
    padding: 2rem;
    max-width: 500px;
    color: var(--text-primary, #ffffff);
  `;
  
  content.innerHTML = `
    <h2 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem; color: var(--text-primary, #ffffff);">Important Notice</h2>
    <p style="margin-bottom: 1.5rem; line-height: 1.6;">
      All data and calculations provided by this application are for reference purposes only. 
      Please verify all results independently. The developer assumes no responsibility for errors or omissions.
    </p>
    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
      <button id="disclaimer-never-show" style="
        padding: 0.5rem 1rem;
        border: 2px solid var(--border-primary, #ec4899);
        background: transparent;
        color: var(--border-primary, #ec4899);
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
      ">Never show again</button>
      <button id="disclaimer-ok" style="
        padding: 0.5rem 1.5rem;
        border: 2px solid var(--border-primary, #ec4899);
        background: var(--border-primary, #ec4899);
        color: white;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: all 0.2s;
      ">OK</button>
    </div>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // Add hover effects
  const okBtn = content.querySelector('#disclaimer-ok');
  const neverShowBtn = content.querySelector('#disclaimer-never-show');
  
  okBtn.addEventListener('mouseenter', () => {
    okBtn.style.opacity = '0.8';
  });
  okBtn.addEventListener('mouseleave', () => {
    okBtn.style.opacity = '1';
  });
  
  neverShowBtn.addEventListener('mouseenter', () => {
    neverShowBtn.style.background = 'var(--border-primary, #ec4899)';
    neverShowBtn.style.color = 'white';
  });
  neverShowBtn.addEventListener('mouseleave', () => {
    neverShowBtn.style.background = 'transparent';
    neverShowBtn.style.color = 'var(--border-primary, #ec4899)';
  });
  
  // Event handlers
  okBtn.addEventListener('click', () => {
    modal.remove();
  });
  
  neverShowBtn.addEventListener('click', async () => {
    const settings = await window.electronAPI.getSettings();
    settings.showStartupInfo = false;
    await window.electronAPI.setSettings(settings);
    modal.remove();
  });
}

document.getElementById('min-btn').addEventListener('click', () => {
    window.electronAPI.windowAction('minimize');
  });
document.getElementById('max-btn').addEventListener('click', () => {
    window.electronAPI.windowAction('maximize');
  });
document.getElementById('close-btn').addEventListener('click', () => {
    window.electronAPI.windowAction('close');
  });


document.addEventListener('DOMContentLoaded', async () => {
  initializeUi();

  const features = await window.electronAPI.getFeatures();
  
  // [CHARGEMENT CONDITIONNEL SIM-DB]
  const openSimDbBtn = document.getElementById('open-sim-db-btn');
  if (features.isNasEnabled) {
    try {
      const simDbModule = await import('./panels/sim-db.js');
      getSimDbPanelHtml = simDbModule.getSimDbPanelHtml;
      initializeSimDbPanel = simDbModule.initializeSimDbPanel;
      panelModules['sim-db'] = { getHtml: getSimDbPanelHtml, initialize: initializeSimDbPanel };
      console.log("Module SIM-DB chargé avec succès.");
    } catch (error) {
      console.warn("Impossible de charger sim-db.js:", error.message);
      if (openSimDbBtn) openSimDbBtn.style.display = 'none';
    }
  } else {
    if (openSimDbBtn) openSimDbBtn.style.display = 'none';
    console.log("Fonctionnalité SIM-DB (NAS) désactivée.");
  }

  // [CHARGEMENT CONDITIONNEL ORDERS]
  const openOrdersBtn = document.getElementById('open-orders-btn');
  if (features.isOrdersManagerEnabled) {
    try {
      const ordersModule = await import('./panels/orders/orders.js');
      getOrdersPanelHtml = ordersModule.getOrdersPanelHtml;
      initializeOrdersPanel = ordersModule.initializeOrdersPanel;
      panelModules['orders'] = { getHtml: getOrdersPanelHtml, initialize: initializeOrdersPanel };
      console.log("Module Orders chargé avec succès.");
    } catch (error) {
      console.warn("Impossible de charger orders.js:", error.message);
      if (openOrdersBtn) openOrdersBtn.style.display = 'none';
    }
  } else {
    if (openOrdersBtn) openOrdersBtn.style.display = 'none';
    console.log("Fonctionnalité Gestionnaire de Commandes désactivée.");
  }
  
  // Show startup disclaimer popup if enabled
  const settings = await window.electronAPI.getSettings();
  if (settings.showStartupInfo !== false) {
    showStartupDisclaimer();
  }
  
  // [MODIFICATION] Nous sélectionnons maintenant le conteneur principal du dashboard
  const appContainer = document.getElementById('app-container');
  const dashboard = document.getElementById('dashboard');
  const toolView = document.getElementById('tool-view');
  const toolContent = document.getElementById('tool-content');
  const closeToolBtn = document.getElementById('close-tool-btn');
  const openSettingsBtn = document.getElementById('open-settings-btn');
  const hornSubMenu = document.getElementById('horn-sub-menu');
  const closeSubMenuBtn = document.getElementById('close-submenu-btn');
  
  let currentTool = { name: null, title: null };
  let openedFromSubMenu = false;
  
  const initializedPanels = new Set();

  function preLoadAllTools() {
  toolContent.innerHTML = '';
  for (const toolName in panelModules) {
    const panel = panelModules[toolName];
    
    // 1. On crée le wrapper principal (ex: <div id="tool-wrapper-settings">)
    const toolWrapper = document.createElement('div');
    toolWrapper.id = `tool-wrapper-${toolName}`;
    toolWrapper.className = 'tool-wrapper h-full w-full';
    toolWrapper.style.display = 'none';

    // 2. ON CRÉE LA BOÎTE DE LAYOUT INTÉRIEUR (L'ÉLÉMENT CLÉ MANQUANT !)
    const layoutBox = document.createElement('div');
    layoutBox.className = 'p-6 h-full flex flex-col'; // Le padding et le flex sont ICI
    
    // 3. On injecte le contenu du panneau (h1, form...) DANS cette boîte de layout
    layoutBox.innerHTML = panel.getHtml();

    // 4. On place la boîte de layout dans le wrapper
    toolWrapper.appendChild(layoutBox);

    // 5. On place le wrapper complet dans tool-content
    toolContent.appendChild(toolWrapper);
  }
}


  function showTool(toolName, toolTitle) {
    if (!panelModules[toolName]) {
        console.error(`Tentative d'ouverture d'un module désactivé ou inexistant: ${toolName}`);
        return;
    }
    
    // [MODIFICATION] Plus besoin de gérer les boutons ici

    if (!initializedPanels.has(toolName)) {
        const toolWrapper = document.getElementById(`tool-wrapper-${toolName}`);
        panelModules[toolName].initialize(toolWrapper);
        initializedPanels.add(toolName);
        console.log(`Initialized panel: ${toolName}`);
    }

    document.querySelectorAll('.tool-wrapper').forEach(wrapper => {
      wrapper.style.display = 'none';
    });

    const wrapperToShow = document.getElementById(`tool-wrapper-${toolName}`);
    if (wrapperToShow) {
        appContainer.style.display = 'none'; // On cache le conteneur principal
        hornSubMenu.style.display = 'none';
        toolView.style.display = 'flex';
        currentTool.name = toolName;
        currentTool.title = toolTitle;
        wrapperToShow.style.display = 'block';
    } else {
      toolContent.innerHTML = `<h1 class="text-4xl text-center text-red-500">Outil non implémenté: ${toolName}</h1>`;
    }
  }
  
  window.showTool = showTool;
  
  // Gestionnaire global pour les boutons pop-out
  document.addEventListener('click', (event) => {
      const popOutButton = event.target.closest('button[data-tool]');
      if (!popOutButton) return;
      const toolName = popOutButton.dataset.tool;
      
      // Cas spécial pour Physics: ouvrir le sélecteur de calculateur
      if (toolName === 'power') {
        // Vérifier si on est dans l'onglet Basic
        const activeTab = document.querySelector('.physics-tab.active');
        if (activeTab && activeTab.dataset.tab === 'basic') {
          // Ouvrir le sélecteur de calculateur
          if (window.showBasicCalculatorSelector) {
            window.showBasicCalculatorSelector();
          }
          return;
        }
      }
      
      // Cas spécial pour Geometry: ouvrir le sélecteur de calculateur
      if (toolName === 'geometry') {
        if (window.showGeometryCalculatorSelector) {
          window.showGeometryCalculatorSelector();
        }
        return;
      }
      
      // Cas spécial pour Mesh: ouvrir directement le mini popup
      if (toolName === 'mesh') {
        window.electronAPI.openToolInNewWindow({ 
          toolName: 'mesh-mini', 
          title: 'Quick Mesh' 
        });
        return;
      }
      
      // Cas spécial pour Drivers: ouvrir directement le clipboard
      if (toolName === 'drivers') {
        window.electronAPI.openToolInNewWindow({ 
          toolName: 'drivers-database', 
          title: 'Driver Clipboard' 
        });
        return;
      }
      
      // Cas spécial pour Notes: ouvrir directement le mini popup
      if (toolName === 'notes') {
        window.electronAPI.openToolInNewWindow({ 
          toolName: 'notes-mini', 
          title: 'Quick Note' 
        });
        return;
      }
      
      // Pour les autres outils, comportement par défaut
      const header = popOutButton.closest('.flex-shrink-0');
      const titleElement = header ? header.querySelector('h1') : null;
      const title = titleElement ? titleElement.textContent : 'Outil';
      window.electronAPI.openToolInNewWindow({ toolName, title });
  });

  openSettingsBtn.addEventListener('click', () => {
      openedFromSubMenu = false;
      showTool('settings', 'Configuration');
  });

  if (openOrdersBtn && features.isOrdersManagerEnabled) {
    openOrdersBtn.addEventListener('click', () => {
        openedFromSubMenu = false;
        showTool('orders', 'Gestionnaire de Commandes');
    });
  }

  if (openSimDbBtn && features.isNasEnabled) {
      openSimDbBtn.addEventListener('click', () => {
          openedFromSubMenu = false;
          showTool('sim-db', 'SIM-DB Cloud');
      });
  }
  
  closeToolBtn.addEventListener('click', () => {
    toolView.style.display = 'none';
    if (currentTool.name) {
       const activeWrapper = document.getElementById(`tool-wrapper-${currentTool.name}`);
       if (activeWrapper) activeWrapper.style.display = 'none';
    }
    if (openedFromSubMenu) {
        hornSubMenu.style.display = 'flex';
    } else {
        appContainer.style.display = 'block'; // On réaffiche le conteneur principal
    }

    // [MODIFICATION] Plus besoin de gérer les boutons ici non plus
    currentTool = { name: null, title: null };
  });

  closeSubMenuBtn.addEventListener('click', () => {
      hornSubMenu.style.display = 'none';
      appContainer.style.display = 'block'; // On réaffiche le conteneur principal
      // [MODIFICATION] Plus besoin de gérer les boutons ici
  });

  const toolToLoad = window.electronAPI.getToolNameToLoad();
  preLoadAllTools(); 
  
  if (toolToLoad) {
    // ---- NOUS SOMMES DANS UNE FENÊTRE POP-OUT ----
    appContainer.style.display = 'none'; // On cache le conteneur principal
    toolView.style.display = 'flex';
    closeToolBtn.style.display = 'none';
    
    // [MODIFICATION] Les boutons sont déjà masqués avec le conteneur, donc pas de code supplémentaire nécessaire ici
    
    showTool(toolToLoad, 'Outil');
    const wrapperToShow = document.getElementById(`tool-wrapper-${toolToLoad}`);
    if(wrapperToShow){
        const popOutBtn = wrapperToShow.querySelector(`button[data-tool="${toolToLoad}"]`);
        if (popOutBtn) popOutBtn.style.display = 'none';
    }
  } else {
    // ---- NOUS SOMMES DANS LA FENÊTRE PRINCIPALE ----
    toolView.style.display = 'none';
    hornSubMenu.style.display = 'none';

    dashboard.addEventListener('click', e => {
      const panel = e.target.closest('.panel');
      if (!panel) return;
      const panelName = panel.dataset.panel;

      if (panelName === 'horn-submenu-trigger') {
          appContainer.style.display = 'none'; // On cache le conteneur principal
          hornSubMenu.style.display = 'flex';
          // [MODIFICATION] Plus besoin de gérer les boutons ici
      } else {
          openedFromSubMenu = false;
          const toolTitle = panel.querySelector('h2').textContent;
          showTool(panelName, toolTitle);
      }
    });

    hornSubMenu.addEventListener('click', e => {
        const subPanel = e.target.closest('.sub-panel');
        if (subPanel) {
            openedFromSubMenu = true;
            const panelName = subPanel.dataset.panel;
            const toolTitle = subPanel.querySelector('h2').textContent;
            showTool(panelName, toolTitle);
        }
    });
  }

  // Gestionnaire de raccourcis globaux
  async function setupGlobalHotkeys() {
    const settings = await window.electronAPI.getSettings();
    const hotkeys = settings?.hotkeys || {};

    const normalizeHotkeyEvent = (event) => {
      const parts = [];
      if (event.ctrlKey) parts.push('ctrl');
      if (event.altKey) parts.push('alt');
      if (event.shiftKey) parts.push('shift');
      if (event.metaKey) parts.push('meta');

      const key = event.key.toLowerCase();
      const isModifier = ['control', 'shift', 'alt', 'meta'].includes(key);
      if (!isModifier) {
        if (key === ' ') parts.push('space');
        else parts.push(key);
      }

      if (parts.length === 0) return '';
      return parts.join('+');
    };

    document.addEventListener('keydown', (e) => {
      // Ne pas intercepter dans les inputs/textarea sauf si c'est un raccourci avec modificateurs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        return;
      }

      const keyCombo = normalizeHotkeyEvent(e);

      // Raccourci Escape (configurable)
      const escapeKey = hotkeys.escape?.toLowerCase() || 'escape';
      if (keyCombo === escapeKey) {
        if (toolView.style.display === 'flex') {
          e.preventDefault();
          closeToolBtn.click();
        } 
        else if (hornSubMenu.style.display === 'flex') {
          e.preventDefault();
          closeSubMenuBtn.click();
        }
      }

      // Raccourci Minimize (configurable)
      const minimizeKey = hotkeys.minimize?.toLowerCase();
      if (minimizeKey && keyCombo === minimizeKey) {
        e.preventDefault();
        window.electronAPI.windowAction('minimize');
      }
    });
  }

  // Initialiser les raccourcis globaux
  setupGlobalHotkeys();

  // Recharger les raccourcis quand les paramètres changent
  window.panelEvents.addEventListener('settings-updated', () => {
    setupGlobalHotkeys();
  });
});