// =======================================================
// Central popup entry: renders a single calculator/tool per window
// =======================================================

import { initializeWindowControls } from './popup/common/windowControls.js';
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
  initializeDriversPopup
} from './popup/drivers/driversWindows.js';
import {
  getNotesPopupHtml,
  initializeNotesPopup
} from './popup/notes/notesPopup.js';

const popupModules = {
  'basic-ohm': {
    title: 'P = U²/R Converter',
    getHtml: getBasicOhmHtml,
    initialize: initializeBasicCalculatorPopup
  },
  'basic-parallel': {
    title: 'Parallel Resistors',
    getHtml: getBasicParallelHtml,
    initialize: initializeBasicCalculatorPopup
  },
  'basic-wavelength': {
    title: 'Frequency & Wavelength',
    getHtml: getBasicWavelengthHtml,
    initialize: initializeBasicCalculatorPopup
  },
  'geometry-rectangular': {
    title: 'Rectangular Volume',
    getHtml: getGeometryRectangularHtml,
    initialize: initializeGeometryCalculator
  },
  'geometry-prism': {
    title: 'Triangular Prism',
    getHtml: getGeometryPrismHtml,
    initialize: initializeGeometryCalculator
  },
  'geometry-diameter': {
    title: 'Diameter ⇄ Area',
    getHtml: getGeometryDiameterHtml,
    initialize: initializeGeometryCalculator
  },
  'geometry-conversion': {
    title: 'Metric ⇄ Inch',
    getHtml: getGeometryConversionHtml,
    initialize: initializeGeometryCalculator
  },
  'mesh-mini': {
    title: 'Quick Mesh',
    getHtml: getMeshMiniPopupHtml,
    initialize: initializeMeshMiniPopup
  },
  'mesh-meshing': {
    title: 'Meshing (Gmsh)',
    getHtml: getMeshMeshingHtml,
    initialize: initializeMeshPopup
  },
  'mesh-frequency-list': {
    title: 'Frequency List',
    getHtml: getMeshFrequencyListHtml,
    initialize: initializeMeshPopup
  },
  'drivers-database': {
    title: 'Driver Clipboard',
    getHtml: getDriversDatabaseHtml,
    initialize: initializeDriversPopup
  },
  'notes-mini': {
    title: 'Quick Note',
    getHtml: getNotesPopupHtml,
    initialize: initializeNotesPopup
  }
};

function renderTool(toolName) {
  const root = document.getElementById('popup-root');
  if (!root) return;

  const module = popupModules[toolName];
  if (!module) {
    root.innerHTML = `<div style="padding:16px; color:#f87171; font-weight:600;">Tool \"${toolName || 'unknown'}\" not available for popup.</div>`;
    return;
  }

  document.title = module.title || 'Popup';
  window.popupToolName = toolName; // For modules that need the tool id

  const shellBg = toolName.startsWith('basic') ? 'var(--bg-primary, #050505)' : 'var(--bg-main, #000)';

  root.innerHTML = `
    <div class="p-6 h-full flex flex-col" style="background-color: ${shellBg};">
      ${module.getHtml()}
    </div>
  `;

  initializeWindowControls();
  try {
    module.initialize?.(toolName);
  } catch (err) {
    console.error('Popup initialize failed', err);
    root.insertAdjacentHTML('beforeend', `<div style="color:#f87171; margin-top:12px;">Initialization error: ${err.message}</div>`);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const toolName = window.electronAPI?.getToolNameToLoad?.();
  if (!toolName) {
    const root = document.getElementById('popup-root');
    if (root) root.innerHTML = '<div style="padding:16px; color:#fbbf24;">Aucun outil spécifié pour cette fenêtre popup.</div>';
    return;
  }

  try {
    // Charger et appliquer les settings
    const settings = await window.electronAPI.getSettings();
    
    if (settings && settings.ui) {
      const KNOWN_THEMES = [
        'theme-dark-blue',
        'theme-amber-matrix',
        'theme-high-contrast',
        'theme-arcade-purple'
      ];

      // Appliquer le thème sur le body (comme dans l'application principale)
      document.body.classList.remove(...KNOWN_THEMES);
      if (settings.ui.theme && settings.ui.theme !== 'default' && KNOWN_THEMES.includes(settings.ui.theme)) {
        document.body.classList.add(settings.ui.theme);
      }

      // Appliquer les effets visuels
      document.body.classList.toggle('no-scanlines', settings.ui.scanlines === false);
      document.body.classList.toggle('reduced-motion', settings.ui.reducedMotion === true);
      document.body.classList.toggle('btn-skin-solid', settings.ui.buttonSkin === 'solid');
      
      // Appliquer le zoom/scaling seulement si activé et différent de 0
      if (settings.enableScaling && settings.zoomLevel && settings.zoomLevel !== 0) {
        window.electronAPI.setZoom?.(settings.zoomLevel);
      }
    }
  } catch (err) {
    console.warn('Failed to load settings in popup:', err);
  }

  renderTool(toolName);
});
