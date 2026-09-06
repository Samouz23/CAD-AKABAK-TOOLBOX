// =======================================================
// FICHIER :  src/js/renderer.js
// RÔLE    :  Orchestre l'affichage des panneaux et gère les
//            événements globaux de l'interface.
// =======================================================

import { getGeometryPanelHtml, initializeGeometryPanel } from './panels/geometry.js';
import { getPowerPanelHtml, initializePowerPanel } from './panels/physics/power.js';
import { getMeshPanelHtml, initializeMeshPanel } from './panels/mesh/mesh.js';
import { getSettingsPanelHtml, initializeSettingsPanel } from './panels/mainsettings/mainsettings.js';
import { getDriversPanelHtml, initializeDriversPanel } from './panels/driver_db/drivers.js';
import { getNotesPanelHtml, initializeNotesPanel } from './panels/notes.js';
import { getHornPanelHtml, initializeHornPanel } from './panels/horn.js';
import { getWaveguidePanelHtml, initializeWaveguidePanel } from './panels/waveguidestudio/waveguide.js';
import { getHornStudioPanelHtml, initializeHornStudioPanel } from './panels/hornstudio/hornstudio.js';
import { getAkabakLemPanelHtml, initializeAkabakLemPanel } from './panels/Akabak_Lem/akabakLem.js';
import { getBemSolverPanelHtml, initializeBemSolverPanel } from './panels/bemsolver/bemSolver.js';
// import { getBemPanelHtml, initializeBemPanel } from './panels/bem/bem.js';
import { applyUiSettings, initializeUi } from '../ui.js';

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
  hornstudio: { getHtml: getHornStudioPanelHtml, initialize: initializeHornStudioPanel },
  akabak_lem: { getHtml: getAkabakLemPanelHtml, initialize: initializeAkabakLemPanel },
  directivity: { getHtml: getBemSolverPanelHtml, initialize: initializeBemSolverPanel },
  // bem: { getHtml: getBemPanelHtml, initialize: initializeBemPanel },
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
    showInitialAppSettingsPopup();
  });
  
  neverShowBtn.addEventListener('click', async () => {
    const settings = await window.electronAPI.getSettings();
    settings.showStartupInfo = false;
    await window.electronAPI.setSettings(settings);
    modal.remove();
    showInitialAppSettingsPopup();
  });
}

function showInitialAppSettingsPopup() {
  const modal = document.createElement('div');
  modal.id = 'initial-app-settings-modal';
  modal.style.cssText = `
    position: fixed;
    inset: 0;
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
    width: min(520px, calc(100vw - 2rem));
    color: var(--text-primary, #ffffff);
  `;

  content.innerHTML = `
    <h2 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem; color: var(--text-primary, #ffffff);">Initial Settings</h2>
    <p style="margin-bottom: 1.5rem; line-height: 1.6; color: var(--text-body, #e5e7eb);">
      All setting can be modified in de configuration setting
    </p>
    <div style="display: grid; gap: 1rem; margin-bottom: 1.5rem;">
      <label style="display: grid; gap: 0.5rem;">
        <span>App size</span>
        <select id="initial-app-size" class="form-input" style="width: 100%; padding: 0.5rem;">
          <option value="0.8">Small</option>
          <option value="1" selected>Normal</option>
          <option value="1.2">Large</option>
        </select>
      </label>
      <label style="display: grid; gap: 0.5rem;">
        <span>Theme</span>
        <select id="initial-app-theme" class="form-input" style="width: 100%; padding: 0.5rem;">
          <option value="default">Default</option>
          <option value="theme-dark-blue">Blue</option>
          <option value="theme-high-contrast">White</option>
        </select>
      </label>
    </div>
    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
      <button id="initial-settings-save" style="
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

  const sizeSelect = content.querySelector('#initial-app-size');
  const themeSelect = content.querySelector('#initial-app-theme');
  const saveBtn = content.querySelector('#initial-settings-save');

  window.electronAPI.getSettings().then(settings => {
    const savedZoom = String(settings?.zoomLevel || 1);
    const savedTheme = settings?.ui?.theme || 'default';
    if ([...sizeSelect.options].some(option => option.value === savedZoom)) {
      sizeSelect.value = savedZoom;
    }
    if ([...themeSelect.options].some(option => option.value === savedTheme)) {
      themeSelect.value = savedTheme;
    }
  }).catch(error => console.warn('Failed to preload initial settings:', error));

  const saveInitialSettings = async () => {
    const settings = await window.electronAPI.getSettings();
    const zoomLevel = parseFloat(sizeSelect.value) || 1;
    settings.enableScaling = true;
    settings.zoomLevel = zoomLevel;
    settings.ui = {
      ...(settings.ui || {}),
      theme: themeSelect.value || 'default'
    };
    applyUiSettings(settings.ui);
    window.electronAPI.setZoom?.(zoomLevel);
    await window.electronAPI.setSettings(settings);
  };

  sizeSelect.addEventListener('change', saveInitialSettings);
  themeSelect.addEventListener('change', saveInitialSettings);
  saveBtn.addEventListener('click', async () => {
    await saveInitialSettings();
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
  // Attendre que window.electronAPI soit disponible
  while (!window.electronAPI) {
    console.log('[Renderer] Waiting for electronAPI...');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  console.log('[Renderer] electronAPI ready!');

  initializeUi();

  const features = await window.electronAPI.getFeatures();
  

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
  const moduleSidebar = document.getElementById('module-sidebar');
  const moduleSidebarToggle = document.getElementById('module-sidebar-toggle');
  const historyBackBtn = document.getElementById('history-back-btn');
  const historyForwardBtn = document.getElementById('history-forward-btn');
  const appTitle = document.getElementById('app-title');
  const appLogo = document.getElementById('app-logo');
  
  let currentTool = { name: null, title: null };
  let currentSavedPageId = null;
  let openedFromSubMenu = false;
  let historyEntries = [{ type: 'home' }];
  let historyIndex = 0;
  let isHistoryNavigation = false;

  function updateHistoryButtons() {
    if (historyBackBtn) historyBackBtn.disabled = historyIndex <= 0;
    if (historyForwardBtn) historyForwardBtn.disabled = historyIndex >= historyEntries.length - 1;
  }

  function sameHistoryEntry(left, right) {
    return left?.type === right?.type && left?.toolName === right?.toolName && left?.pageId === right?.pageId;
  }

  function recordHistory(entry) {
    if (isHistoryNavigation || sameHistoryEntry(historyEntries[historyIndex], entry)) return;
    historyEntries = historyEntries.slice(0, historyIndex + 1);
    historyEntries.push(entry);
    historyIndex = historyEntries.length - 1;
    updateHistoryButtons();
  }

  const SAVED_PAGES_KEY = 'akabakSavedModulePages';

  function getSavedPages() {
    try { return JSON.parse(localStorage.getItem(SAVED_PAGES_KEY) || '[]'); }
    catch (error) { console.warn('Saved module pages could not be loaded:', error); return []; }
  }

  function setSavedPages(pages) {
    localStorage.setItem(SAVED_PAGES_KEY, JSON.stringify(pages));
  }

  function captureModulePage(wrapper, moduleName, title) {
    const clone = wrapper.cloneNode(true);
    clone.querySelectorAll('canvas').forEach(canvas => {
      try {
        const image = document.createElement('img');
        image.src = canvas.toDataURL();
        image.alt = 'Saved module preview';
        image.style.cssText = canvas.getAttribute('style') || 'max-width:100%;';
        canvas.replaceWith(image);
      } catch (error) { canvas.remove(); }
    });

    const controls = [...wrapper.querySelectorAll('input, textarea, select, [contenteditable="true"]')];
    const state = controls.map((element, index) => ({
      index,
      type: element.type || element.tagName.toLowerCase(),
      value: element.type === 'checkbox' || element.type === 'radio' ? element.checked : element.value ?? element.innerHTML
    }));
    return { moduleName, title, html: clone.innerHTML, state };
  }

  function restoreModulePage(wrapper, page) {
    const controls = [...wrapper.querySelectorAll('input, textarea, select, [contenteditable="true"]')];
    (page.state || []).forEach(item => {
      const element = controls[item.index];
      if (!element) return;
      if (element.type === 'checkbox' || element.type === 'radio') element.checked = !!item.value;
      else if (element.isContentEditable) element.innerHTML = item.value || '';
      else element.value = item.value ?? '';
    });
  }

  function renderSavedPagesHome() {
    if (!savedPagesGrid) return;
    const pages = getSavedPages();
    savedPagesGrid.innerHTML = '';
    if (!pages.length) {
      savedPagesGrid.innerHTML = '<p style="color:var(--text-muted,#999);">No saved module page yet.</p>';
      return;
    }
    pages.forEach(page => {
      const card = document.createElement('article');
      card.className = 'saved-page-card';
      card.draggable = true;
      card.dataset.pageId = page.id;
      card.innerHTML = `<h2></h2><p></p><button type="button" class="btn btn--primary btn--sm" data-action="open">Open</button><button type="button" class="btn btn--danger btn--sm" data-action="delete">Delete</button>`;
      card.querySelector('h2').textContent = page.name;
      card.querySelector('p').textContent = `${page.title} - ${page.moduleName}`;
      card.addEventListener('click', event => {
        const action = event.target.closest('button')?.dataset.action;
        if (action === 'delete') {
          setSavedPages(getSavedPages().filter(item => item.id !== page.id));
          renderSavedPagesHome();
        } else if (action === 'open') openSavedPage(page.id);
      });
      card.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', page.id));
      card.addEventListener('dragover', event => event.preventDefault());
      card.addEventListener('drop', event => {
        event.preventDefault();
        const draggedId = event.dataTransfer.getData('text/plain');
        if (!draggedId || draggedId === page.id) return;
        const pages = getSavedPages();
        const from = pages.findIndex(item => item.id === draggedId);
        const to = pages.findIndex(item => item.id === page.id);
        if (from < 0 || to < 0) return;
        const [dragged] = pages.splice(from, 1);
        pages.splice(to, 0, dragged);
        setSavedPages(pages);
        renderSavedPagesHome();
      });
      savedPagesGrid.appendChild(card);
    });
  }

  function askSavedPageName(defaultName) {
    return new Promise(resolve => {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.82);';
      modal.innerHTML = `<form style="width:min(420px,90vw);padding:1.5rem;background:var(--bg-elevated,#12121a);border:1px solid var(--border-primary,#ec4899);border-radius:8px;color:var(--text-primary,#fff);"><h2 style="margin:0 0 1rem;">Save module page</h2><label style="display:block;margin-bottom:.4rem;">Page name</label><input name="name" class="form-input" style="width:100%;box-sizing:border-box;margin-bottom:1rem;" autocomplete="off"><div style="display:flex;justify-content:flex-end;gap:.5rem;"><button type="button" class="btn btn--ghost btn--sm" data-cancel>Cancel</button><button type="submit" class="btn btn--primary btn--sm">Save</button></div></form>`;
      document.body.appendChild(modal);
      const form = modal.querySelector('form');
      const input = form.querySelector('input');
      input.value = defaultName || 'Saved module';
      input.select();
      const close = value => { modal.remove(); resolve(value); };
      modal.querySelector('[data-cancel]').addEventListener('click', () => close(null));
      form.addEventListener('submit', event => { event.preventDefault(); close(input.value.trim() || defaultName || 'Saved module'); });
      modal.addEventListener('click', event => { if (event.target === modal) close(null); });
    });
  }

  function openSavedPage(pageId) {
    const page = getSavedPages().find(item => item.id === pageId);
    if (!page) return;
    recordHistory({ type: 'saved', pageId: page.id });
    document.querySelectorAll('.tool-wrapper').forEach(wrapper => { wrapper.style.display = 'none'; });
    document.getElementById('saved-page-active')?.remove();
    const wrapper = document.createElement('div');
    wrapper.id = 'saved-page-active';
    wrapper.className = 'tool-wrapper h-full w-full';
    wrapper.innerHTML = page.html;
    restoreModulePage(wrapper, page);
    toolContent.appendChild(wrapper);
    appContainer.style.display = 'none';
    hornSubMenu.style.display = 'none';
    moduleSidebar.style.display = 'flex';
    toolView.style.display = 'flex';
    closeToolBtn.style.display = 'block';
    currentTool = { name: page.moduleName, title: page.title };
    currentSavedPageId = page.id;
  }

  async function saveCurrentModulePage() {
    if (!currentTool.name) return;
    const source = currentSavedPageId ? document.getElementById('saved-page-active') : document.getElementById(`tool-wrapper-${currentTool.name}`);
    if (!source) return;
    const existing = currentSavedPageId ? getSavedPages().find(page => page.id === currentSavedPageId) : null;
    const name = await askSavedPageName(existing?.name || currentTool.title || currentTool.name);
    if (!name) return;
    const snapshot = captureModulePage(source, currentTool.name, currentTool.title);
    const pages = getSavedPages();
    if (existing) {
      const index = pages.findIndex(page => page.id === existing.id);
      pages[index] = { ...existing, ...snapshot, name, updatedAt: Date.now() };
    } else {
      pages.push({ id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, ...snapshot, createdAt: Date.now() });
    }
    setSavedPages(pages);
    renderSavedPagesHome();
  }
  
  const initializedPanels = new Set();
  const defaultModuleOrder = ['geometry', 'power', 'mesh', 'drivers', 'notes', 'horn', 'akabak_lem', 'hornstudio', 'directivity', 'waveguide', 'settings'];

  function applyModuleOrder(order) {
    const orderToApply = [
      ...(Array.isArray(order) ? order : []),
      ...defaultModuleOrder
    ].filter((moduleName, index, list) => defaultModuleOrder.includes(moduleName) && list.indexOf(moduleName) === index);
    const buttons = new Map([...moduleSidebar.querySelectorAll('.module-nav-btn')].map(button => [button.dataset.tool, button]));
    orderToApply.forEach(moduleName => {
      const button = buttons.get(moduleName);
      if (button) moduleSidebar.appendChild(button);
    });
  }

  dashboard.style.display = 'none';
  document.getElementById('dashboard-actions').style.display = 'none';
  updateHistoryButtons();
  applyModuleOrder(settings.ui?.moduleOrder || defaultModuleOrder);

  function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Affiche jusqu'à 5 modules (hors Configuration) choisis au hasard, chacun avec sa propre trajectoire.
  function renderHomeWallpaper() {
    const container = document.getElementById('home-wallpaper');
    if (!container) return;
    const eligibleButtons = [...moduleSidebar.querySelectorAll('.module-nav-btn')]
      .filter(button => button.dataset.tool !== 'settings');
    const count = Math.min(eligibleButtons.length, 2 + Math.floor(Math.random() * 4));
    const chosen = shuffleArray(eligibleButtons).slice(0, count);

    container.innerHTML = '';
    chosen.forEach(button => {
      const iconSrc = button.querySelector('img')?.getAttribute('src') || '';
      const label = button.dataset.title || button.querySelector('span')?.textContent || '';
      const left = 5 + Math.random() * 75;
      const top = 8 + Math.random() * 70;
      const duration = (14 + Math.random() * 16).toFixed(1);
      const delay = (Math.random() * 6).toFixed(1);
      const rand = (min, max) => (min + Math.random() * (max - min)).toFixed(1);

      const item = document.createElement('div');
      item.className = 'wallpaper-item';
      item.style.cssText = [
        `left:${left}%`, `top:${top}%`,
        `animation-duration:${duration}s`, `animation-delay:-${delay}s`,
        `--dx1:${rand(-25, 25)}vw`, `--dy1:${rand(-20, 20)}vh`,
        `--dx2:${rand(-15, 45)}vw`, `--dy2:${rand(-15, 35)}vh`,
        `--dx3:${rand(-35, 45)}vw`, `--dy3:${rand(-30, 20)}vh`,
        `--dx4:${rand(-30, 50)}vw`, `--dy4:${rand(-20, 30)}vh`
      ].join(';');
      item.innerHTML = `<img src="${iconSrc}" alt=""><div class="wallpaper-label">${label}</div>`;
      container.appendChild(item);
    });
  }

  renderHomeWallpaper();
  setInterval(renderHomeWallpaper, 24000);

  moduleSidebarToggle.addEventListener('click', () => {
    const isCollapsed = moduleSidebar.classList.toggle('collapsed');
    moduleSidebarToggle.innerHTML = isCollapsed ? '&#x203A;' : '&#x2039;';
    moduleSidebarToggle.setAttribute('aria-label', isCollapsed ? 'Agrandir la barre' : 'Réduire la barre');
    document.documentElement.style.setProperty('--module-sidebar-width', isCollapsed ? '52px' : '220px');
    appTitle.style.display = isCollapsed ? 'none' : 'block';
    appLogo.style.display = isCollapsed ? 'block' : 'none';
  });

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

    recordHistory({ type: 'live', toolName, title: toolTitle });

    currentSavedPageId = null;
    document.getElementById('saved-page-active')?.remove();
    
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
        moduleSidebar.style.display = 'flex';
        toolView.style.display = 'flex';
        currentTool.name = toolName;
        currentTool.title = toolTitle;
        wrapperToShow.style.display = 'block';
        document.querySelectorAll('.module-nav-btn').forEach(button => {
          button.classList.toggle('active', button.dataset.tool === toolName);
        });
    } else {
      toolContent.innerHTML = `<h1 class="text-4xl text-center text-red-500">Outil non implémenté: ${toolName}</h1>`;
    }
  }
  
  window.showTool = showTool;

  document.querySelectorAll('.module-nav-btn').forEach(button => {
    button.addEventListener('click', () => {
      openedFromSubMenu = false;
      showTool(button.dataset.tool, button.dataset.title);
    });
  });
  
  // Gestionnaire global pour les boutons pop-out
  document.addEventListener('click', (event) => {
      const popOutButton = event.target.closest('button[data-tool]');
      if (!popOutButton) return;
      if (popOutButton.closest('#module-sidebar')) return;
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


  
  closeToolBtn.addEventListener('click', () => {
    recordHistory({ type: 'home' });
    toolView.style.display = 'none';
    moduleSidebar.style.display = 'flex';
    if (currentTool.name) {
       const activeWrapper = document.getElementById(`tool-wrapper-${currentTool.name}`);
       if (activeWrapper) activeWrapper.style.display = 'none';
    }
    if (openedFromSubMenu) {
        hornSubMenu.style.display = 'flex';
    } else {
        appContainer.style.display = 'block';
        renderHomeWallpaper();
    }

    document.querySelectorAll('.module-nav-btn').forEach(button => button.classList.remove('active'));

    // [MODIFICATION] Plus besoin de gérer les boutons ici non plus
    currentTool = { name: null, title: null };
    currentSavedPageId = null;
    document.getElementById('saved-page-active')?.remove();
  });

  function goToHistoryEntry(entry) {
    if (!entry) return;
    isHistoryNavigation = true;
    try {
      if (entry.type === 'home') closeToolBtn.click();
      else if (entry.type === 'saved') openSavedPage(entry.pageId);
      else showTool(entry.toolName, entry.title);
    } finally {
      isHistoryNavigation = false;
      updateHistoryButtons();
    }
  }

  historyBackBtn?.addEventListener('click', () => {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    goToHistoryEntry(historyEntries[historyIndex]);
  });

  historyForwardBtn?.addEventListener('click', () => {
    if (historyIndex >= historyEntries.length - 1) return;
    historyIndex += 1;
    goToHistoryEntry(historyEntries[historyIndex]);
  });

  closeSubMenuBtn.addEventListener('click', () => {
      hornSubMenu.style.display = 'none';
      appContainer.style.display = 'block';
      renderHomeWallpaper();
  });

  const toolToLoad = window.electronAPI.getToolNameToLoad();
  preLoadAllTools(); 
  
  if (toolToLoad) {
    // ---- NOUS SOMMES DANS UNE FENÊTRE POP-OUT ----
    appContainer.style.display = 'none'; // On cache le conteneur principal
    moduleSidebar.style.display = 'none';
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
    moduleSidebar.style.display = 'flex';

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
  let globalHotkeyHandler = null;

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

    if (globalHotkeyHandler) document.removeEventListener('keydown', globalHotkeyHandler);
    globalHotkeyHandler = (e) => {
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

      const saveModuleKey = hotkeys.saveModule?.toLowerCase() || 'ctrl+s';
      if (keyCombo === saveModuleKey && toolView.style.display === 'flex') {
        e.preventDefault();
        saveCurrentModulePage();
      }
    };
    document.addEventListener('keydown', globalHotkeyHandler);
  }

  // Initialiser les raccourcis globaux
  setupGlobalHotkeys();

  // Recharger les raccourcis quand les paramètres changent
  window.panelEvents.addEventListener('settings-updated', () => {
    setupGlobalHotkeys();
  });

  window.panelEvents.addEventListener('settings-updated', (event) => {
    applyModuleOrder(event.detail?.newSettings?.ui?.moduleOrder || defaultModuleOrder);
  });
});