// =======================================================
// FICHIER : src/js/panels/mainsettings.js (VERSION FINALE COMPLÈTE)
// RÔLE    : Gère le panneau de configuration, avec tous les chemins restaurés et fonctionnels.
// =======================================================

import { getManualHtml, initializeManualPanel} from './text_content/manual.js';
import { applyUiSettings } from '../../../ui.js';
import { getUpdatesHtml } from './text_content/updates.js';

export const getSettings = () => window.electronAPI.getSettings();

function getHelpContentHtml() {
  return `
    <div class="bg-gray-900 border-2 border-green-700 rounded-lg shadow-xl text-green-400 flex flex-col w-full max-w-4xl h-full max-h-[90vh]">
      <div class="flex justify-between items-center p-4 border-b border-green-800 flex-shrink-0">
        <h2 class="text-2xl font-bold text-white">Toolbox Help</h2>
        <button id="close-help-modal" class="text-4xl transition-colors" style="color: var(--border-primary);">×</button>
      </div>
      <div class="p-6 overflow-y-auto">
        ${getManualHtml()}
      </div>
    </div>
  `;
}

export function getSettingsPanelHtml() {
  const arrowSVG = `<svg class="w-4 h-4 transition-transform duration-300 toggle-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;

  return `
    <div class="p-6 h-full flex flex-col">
      <h1 class="text-4xl font-bold text-white mb-8 flex-shrink-0">Settings</h1>
      <div id="settings-form" class="space-y-6 flex-grow overflow-y-auto pr-2">

        <div id="updates-panel" class="control-group">
          <div class="control-label-toggle"><span>Updates and Fixes</span>${arrowSVG}</div>
          ${getUpdatesHtml()}
        </div>

        <div id="paths-panel" class="control-group">
          <div class="control-label-toggle"><span>Access Paths</span>${arrowSVG}</div>
          <div class="p-4 pb-6 overflow-hidden space-y-4">
            
            <div id="orders-paths-group" class="hidden space-y-3 p-4 border border-gray-700 rounded-md">
              <h3 class="text-md font-bold text-white mb-2">Orders Manager Module</h3>
              <p class="text-xs text-gray-400 mb-3">Select a root folder for all Orders, Clients, and Accounting data.</p>
              <div><label class="block mb-2">Clients Root Folder</label><div class="flex space-x-2"><input type="text" id="setting-clientFolder" class="form-input flex-grow"><button data-path-for="setting-clientFolder" data-dialog="directory" class="path-select-btn action-btn">Browse...</button></div></div>
            </div>

            <div id="sim-db-paths-group" class="hidden space-y-3 p-4 border border-gray-700 rounded-md">
              <h3 class="text-md font-bold text-white mb-2">SIM-DB Module</h3>
              <p class="text-xs text-gray-400 mb-3">Path to the SIM-DB database folder.</p>
              <div><label class="block mb-2">SIM-DB Path</label><div class="flex space-x-2"><input type="text" id="setting-simDbPath" class="form-input flex-grow"><button data-path-for="setting-simDbPath" data-dialog="directory" class="path-select-btn action-btn">Browse...</button></div></div>
            </div>

            <div class="space-y-3 p-4 border border-gray-700 rounded-md">
                <h3 class="text-md font-bold text-white mb-2">General Data</h3>
                <p class="text-xs text-gray-400 mb-3">Root folder for app data (Mesh-out, STL-out, CSV-out will be auto-created).</p>
                <div><label class="block mb-2">Data Root Folder</label><div class="flex space-x-2"><input type="text" id="setting-dataRoot" class="form-input flex-grow"><button data-path-for="setting-dataRoot" data-dialog="directory" class="path-select-btn action-btn">Browse...</button></div></div>
            </div>

            <div class="space-y-4 mt-4 pb-2">
              <div><label class="block mb-2">Path to gmsh.exe</label><div class="flex space-x-2"><input type="text" id="setting-gmsh" class="form-input flex-grow"><button data-path-for="setting-gmsh" data-dialog="file-exe" class="path-select-btn action-btn">Browse...</button></div></div>
              <div><label class="block mb-2">Downloads Folder (.step)</label><div class="flex space-x-2"><input type="text" id="setting-downloads" class="form-input flex-grow"><button data-path-for="setting-downloads" data-dialog="directory" class="path-select-btn action-btn">Browse...</button></div></div>
            </div>
          </div>
        </div>

        <div id="display-panel" class="control-group">
          <div class="control-label-toggle"><span>Display & Windows</span>${arrowSVG}</div>
          <div class="p-4 overflow-hidden space-y-6">
            <div class="space-y-3"><h3 class="text-lg font-semibold text-white">Interface Size</h3><div class="flex items-center space-x-4"><button data-zoom="0.8" class="zoom-btn action-btn">Small</button><button data-zoom="1.0" class="zoom-btn action-btn">Normal</button><button data-zoom="1.2" class="zoom-btn action-btn">Large</button></div></div>
            <div class="space-y-3">
              <h3 class="text-lg font-semibold text-white">Windows</h3>
              <div class="flex items-center justify-between"><label>Keep tool windows on top</label><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="setting-always-on-top" class="sr-only peer"><div class="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div></label></div>
              <div class="flex items-center justify-between">
                <label>Show startup disclaimer</label>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="setting-show-startup-info" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                </label>
              </div>
            </div>
            <div class="space-y-3">
              <h3 class="text-lg font-semibold text-white">UI Options</h3>
              <div class="flex items-center justify-between">
                <label for="setting-ui-theme">Global Theme</label>
                <select id="setting-ui-theme" class="form-input w-48">
                  <option value="default">(Default)</option>
                  <option value="theme-dark-blue">Blue</option>
                  <option value="theme-amber-matrix">Fire</option>
                  <option value="theme-high-contrast">White</option>
                  <option value="theme-arcade-purple">Green</option>
                </select>
              </div>
              <div class="flex items-center justify-between">
                <label for="setting-ui-scanlines">Scanlines overlay</label>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="setting-ui-scanlines" class="form-toggle">
                  <div class="toggle-switch-bg"></div>
                </label>
              </div>
              <div class="flex items-center justify-between">
                <label for="setting-ui-reduced-motion">Reduce animations</label>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="setting-ui-reduced-motion" class="form-toggle">
                  <div class="toggle-switch-bg"></div>
                </label>
              </div>
              <div class="flex items-center justify-between">
                <label for="setting-ui-button-skin">Button skin</label>
                <select id="setting-ui-button-skin" class="form-input w-48">
                  <option value="striped">Striped (default)</option>
                  <option value="solid">Solid</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div id="templates-panel" class="control-group">
          <div class="control-label-toggle"><span>Formula Templates</span>${arrowSVG}</div>
          <div class="p-4 overflow-hidden space-y-4">
            <h3 class="text-lg font-semibold text-white">Duct-Script</h3>
            <div class="space-y-2"><label>Duct Formula</label><textarea id="setting-template-duct" class="form-input font-mono w-full" rows="2"></textarea><p class="text-xs text-gray-400">Variables: <code>{i+1}</code> for duct index.</p></div>
            <div class="space-y-2"><label>Waveguide Transition Formula</label><textarea id="setting-template-duct-transition-w" class="form-input font-mono w-full" rows="2"></textarea><p class="text-xs text-gray-400">Variables: <code>{i+1}</code>, <code>{i+2}</code>.</p></div>
            <div class="space-y-2"><label>Mass Transition Formula</label><textarea id="setting-template-duct-transition-m" class="form-input font-mono w-full" rows="2"></textarea><p class="text-xs text-gray-400">Variables: <code>{i+1}</code>, <code>{i+2}</code>.</p></div>
            <hr class="border-gray-700 my-4">
            <h3 class="text-lg font-semibold text-white">Horn-Script</h3>
            <div class="space-y-2"><label>Segment Formula (Constant Height)</label><textarea id="setting-template-horn-segment-const-h" class="form-input font-mono w-full" rows="2"></textarea><p class="text-xs text-gray-400">Variables: <code>{i}</code>, <code>{i+1}</code>.</p></div>
            <div class="space-y-2"><label>Segment Formula (Variable Height)</label><textarea id="setting-template-horn-segment-var-h" class="form-input font-mono w-full" rows="2"></textarea><p class="text-xs text-gray-400">Variables: <code>{i}</code>, <code>{i+1}</code>.</p></div>
            <div class="space-y-2"><label>TL Starter Formula</label><textarea id="setting-template-horn-tl-amorce" class="form-input font-mono w-full" rows="2"></textarea><p class="text-xs text-gray-400">Variables: <code>{type}</code> ('O' or 'D').</p></div>
          </div>
        </div>

        <div id="hotkeys-panel" class="control-group">
          <div class="control-label-toggle"><span>Shortcuts</span>${arrowSVG}</div>
          <div class="p-4 pb-6 overflow-hidden">
            
            <!-- Waveguide Studio Shortcuts Sub-Panel -->
            <div class="control-group mb-4">
              <div class="control-label-toggle bg-gray-800 p-2 rounded"><span>Waveguide Studio</span>${arrowSVG}</div>
              <div class="p-4 pb-6 overflow-hidden">
                <p class="text-xs text-gray-400 mb-3">Shortcuts for Waveguide Studio operations.</p>
                <div class="grid grid-cols-2 gap-x-8 gap-y-3 mb-4">
                  <div><label>Split Horizontal/Vertical</label><input type="text" id="setting-hotkey-split" class="form-input w-full hotkey-input" placeholder="Press keys" autocomplete="off"></div>
                  <div><label>Show/Hide 3D Surface</label><input type="text" id="setting-hotkey-surface" class="form-input w-full hotkey-input" placeholder="Press keys" autocomplete="off"></div>
                  <div><label>Show/Hide Points</label><input type="text" id="setting-hotkey-points" class="form-input w-full hotkey-input" placeholder="Press keys" autocomplete="off"></div>
                  <div><label>Export Window</label><input type="text" id="setting-hotkey-export" class="form-input w-full hotkey-input" placeholder="Press keys" autocomplete="off"></div>
                  <div><label>Open/Close Panels</label><input type="text" id="setting-hotkey-togglePanels" class="form-input w-full hotkey-input" placeholder="Press keys" autocomplete="off"></div>
                  <div><label>Build Interface</label><input type="text" id="setting-hotkey-buildInterface" class="form-input w-full hotkey-input" placeholder="Press keys" autocomplete="off"></div>
                </div>
              </div>
            </div>

            <!-- Main Shortcuts Sub-Panel -->
            <div class="control-group mb-4">
              <div class="control-label-toggle bg-gray-800 p-2 rounded"><span>Main Shortcuts</span>${arrowSVG}</div>
              <div class="p-4 pb-6 overflow-hidden">
                <p class="text-xs text-gray-400 mb-3">General application shortcuts.</p>
                <div class="grid grid-cols-2 gap-x-8 gap-y-3 mb-4">
                  <div><label>Close Window/Panel</label><input type="text" id="setting-hotkey-escape" class="form-input w-full hotkey-input" placeholder="Press keys" autocomplete="off"></div>
                  <div><label>Minimize Window</label><input type="text" id="setting-hotkey-minimize" class="form-input w-full hotkey-input" placeholder="Press keys" autocomplete="off"></div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

      <div class="flex-shrink-0 pt-4 space-y-2">
        <button id="save-settings-btn" class="w-full px-4 py-2 border border-red-500 text-red-500 rounded-md hover:bg-red-500 hover:text-white">Save</button>
        <div class="flex space-x-2"><button id="show-help-btn" class="w-full px-4 py-2 border border-red-500 text-red-500 rounded-md hover:bg-red-500 hover:text-white">Help</button><button id="reset-settings-btn" class="w-full px-4 py-2 border border-red-500 text-red-500 rounded-md hover:bg-red-500 hover:text-white">Reset</button></div>
      </div>
    </div>
  `;
}

export function initializeSettingsPanel(rootElement) {
  const get = (sel) => rootElement.querySelector(sel);
  const getAll = (sel) => rootElement.querySelectorAll(sel);

  async function applyFeatureVisibility() {
    const features = await window.electronAPI.getFeatures();
    const simDbPathsGroup = get('#sim-db-paths-group');
    const ordersPathsGroup = get('#orders-paths-group');
    if (simDbPathsGroup) {
      simDbPathsGroup.classList.toggle('hidden', !features.isNasEnabled);
    }
    if (ordersPathsGroup) {
      ordersPathsGroup.classList.toggle('hidden', !features.isOrdersManagerEnabled);
    }
  }

  function adjustTextareaHeight(textarea) {
    if (!textarea) return;
    textarea.style.boxSizing = 'border-box';
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }

  // Fonction pour recalculer la hauteur des parents
  function updateParentHeights(element) {
    let parent = element.parentElement;
    while (parent && parent !== rootElement) {
      if (parent.style.maxHeight && parent.style.maxHeight !== '0px' && parent.style.maxHeight !== 'none') {
        parent.style.maxHeight = parent.scrollHeight + 'px';
      }
      parent = parent.parentElement;
    }
  }

  getAll('.control-label-toggle').forEach(header => {
    const content = header.nextElementSibling;
    const arrow = header.querySelector('.toggle-arrow');
    const parentGroup = header.closest('.control-group');
    
    // Initialiser l'état : updates-panel ouvert, le reste fermé
    if (parentGroup && parentGroup.id === 'updates-panel') {
      content.style.maxHeight = content.scrollHeight + 'px';
      arrow?.classList.add('rotate-180');
    } else {
      content.style.maxHeight = '0px';
      arrow?.classList.remove('rotate-180');
    }
    
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = content.style.maxHeight && content.style.maxHeight !== '0px';
      
      if (isOpen) {
        content.style.maxHeight = '0px';
        arrow?.classList.remove('rotate-180');
        setTimeout(() => updateParentHeights(content), 350);
      } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        arrow?.classList.add('rotate-180');
        setTimeout(() => updateParentHeights(content), 350);
      }
    });
  });

  const pathInputs = {
    gmsh: get('#setting-gmsh'),
    downloads: get('#setting-downloads'),
    dataRoot: get('#setting-dataRoot'),
    simDbPath: get('#setting-simDbPath'),
    clientFolder: get('#setting-clientFolder')
  };
  const hotkeyInputs = { split: get('#setting-hotkey-split'), surface: get('#setting-hotkey-surface'), points: get('#setting-hotkey-points'), export: get('#setting-hotkey-export'), togglePanels: get('#setting-hotkey-togglePanels'), buildInterface: get('#setting-hotkey-buildInterface'), escape: get('#setting-hotkey-escape'), minimize: get('#setting-hotkey-minimize') };
  const saveBtn = get('#save-settings-btn');
  const resetBtn = get('#reset-settings-btn');
  const helpBtn = get('#show-help-btn');
  const zoomButtons = getAll('.zoom-btn');
  const alwaysOnTopToggle = get('#setting-always-on-top');
  const showStartupInfoToggle = get('#setting-show-startup-info');
  const themeSelect = get('#setting-ui-theme');
  const scanlinesToggle = get('#setting-ui-scanlines');
  const reducedMotionToggle = get('#setting-ui-reduced-motion');
  const buttonSkinSelect = get('#setting-ui-button-skin');
  const templateInputs = { duct: get('#setting-template-duct'), ductTransitionW: get('#setting-template-duct-transition-w'), ductTransitionM: get('#setting-template-duct-transition-m'), hornSegmentConstH: get('#setting-template-horn-segment-const-h'), hornSegmentVarH: get('#setting-template-horn-segment-var-h'), hornTlAmorce: get('#setting-template-horn-tl-amorce') };
  
  Object.values(templateInputs).forEach(textarea => { if(textarea) textarea.addEventListener('input', () => adjustTextareaHeight(textarea)); });

  const normalizeShortcut = (event) => {
    const parts = [];
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');

    const key = event.key.toLowerCase();
    const isModifierOnly = ['control', 'shift', 'alt', 'meta'].includes(key);
    if (!isModifierOnly) {
      if (key === ' ') parts.push('space');
      else parts.push(key);
    }

    if (parts.length === 0) return '';
    return parts.join('+');
  };

  const formatShortcutDisplay = (shortcut) => shortcut.split('+').map(part => {
    if (!part) return '';
    if (part.length === 1) return part.toUpperCase();
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join('+');

  Object.values(hotkeyInputs).forEach(input => {
    if (!input) return;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') return; // allow navigation
      e.preventDefault();

      // Effacer si Backspace/Delete sans modificateurs
      if (['Backspace', 'Delete'].includes(e.key) && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        input.value = '';
        delete input.dataset.shortcutRaw;
        return;
      }

      const normalized = normalizeShortcut(e);
      if (!normalized) return;

      input.dataset.shortcutRaw = normalized.toLowerCase();
      input.value = formatShortcutDisplay(normalized);
    });
  });

  const defaultTemplates = { duct: 'WD  = @D{i+1}\nHD  = @H\nLen = @DL{i+1}\neta = @WOOD', ductTransitionW: 'HTh = @H\nHMo = @H\nWTh = @D{i+1}\nWMo = @D{i+2}\nLen = @L{i+1}{i+2}\nT   = 10', ductTransitionM: 'd1 = @D{i+1}\nd2 = @D{i+2}\n\n// hack qui nous permet de toujours obtenir w1 > w2\nk = Sign(d2 - d1)\nw1 = if(k + 1, d1, d2)\nw2 = if(k + 1, d2, d1)\n\n// formule issue du fichier excel de plans.systeme\n// adaptée pour l\'utilisation dans Akabak\npre_m = (Density / (pi * @H)) * ((((w1-w2) ^ 2) / (2*w1*w2)) * Ln((w1+w2)/(w1-w2)) + Ln(((w1+w2) ^ 2)/(4*w1*w2))) * 1000\n\nM = if(k, 0, pre_m)', hornSegmentConstH: 'HTh = @H\nHMo = @H\nWTh = @S{i}\nWMo = @S{i+1}\nLen = @L{i}\nT   = @T{i}', hornSegmentVarH: 'HTh = @H{i}\nHMo = @H{i+1}\nWTh = @S{i}\nWMo = @S{i+1}\nLen = @L{i}\nT   = @T{i}', hornTlAmorce: 'WD  = @S1\nHD  = @H\nLen = @L{type}\neta = @WOOD' };
  
  let currentSettings = {};

  async function loadCurrentSettings() {
    currentSettings = await getSettings();
    if (!currentSettings) currentSettings = {};
    if (!currentSettings.templates) currentSettings.templates = {};
    Object.entries(pathInputs).forEach(([k, el]) => { if (el) el.value = currentSettings.paths?.[k] || ''; });
    Object.entries(hotkeyInputs).forEach(([k, el]) => {
      if (!el) return;
      const saved = currentSettings.hotkeys?.[k] || '';
      el.value = saved ? formatShortcutDisplay(saved) : '';
      if (saved) el.dataset.shortcutRaw = saved.toLowerCase(); else delete el.dataset.shortcutRaw;
    });
    if (alwaysOnTopToggle) alwaysOnTopToggle.checked = !!currentSettings.popupsAlwaysOnTop;
    if (showStartupInfoToggle) showStartupInfoToggle.checked = currentSettings.showStartupInfo !== false;
    const ui = currentSettings.ui || { theme: 'default', scanlines: false, reducedMotion: false, buttonSkin: 'striped' };
    if (themeSelect) themeSelect.value = ui.theme || 'default';
    if (scanlinesToggle) scanlinesToggle.checked = ui.scanlines === true;
    if (reducedMotionToggle) reducedMotionToggle.checked = !!ui.reducedMotion;
    if (buttonSkinSelect) buttonSkinSelect.value = ui.buttonSkin || 'striped';
    Object.entries(templateInputs).forEach(([key, element]) => { if (element) element.value = currentSettings.templates?.[key] || defaultTemplates[key]; });
    applyUiSettings(ui);
    setTimeout(() => { Object.values(templateInputs).forEach(adjustTextareaHeight); }, 50);
  }

  // Appliquer le thème en temps réel quand on change le sélecteur
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      const ui = {
        theme: themeSelect.value || 'default',
        scanlines: scanlinesToggle?.checked !== false,
        reducedMotion: reducedMotionToggle?.checked || false,
        buttonSkin: buttonSkinSelect?.value || 'striped'
      };
      applyUiSettings(ui);
    });
  }

  // Appliquer les autres options UI en temps réel aussi
  if (scanlinesToggle) {
    scanlinesToggle.addEventListener('change', () => {
      const ui = {
        theme: themeSelect?.value || 'default',
        scanlines: scanlinesToggle.checked !== false,
        reducedMotion: reducedMotionToggle?.checked || false,
        buttonSkin: buttonSkinSelect?.value || 'striped'
      };
      applyUiSettings(ui);
    });
  }

  if (buttonSkinSelect) {
    buttonSkinSelect.addEventListener('change', () => {
      const ui = {
        theme: themeSelect?.value || 'default',
        scanlines: scanlinesToggle?.checked !== false,
        reducedMotion: reducedMotionToggle?.checked || false,
        buttonSkin: buttonSkinSelect.value || 'striped'
      };
      applyUiSettings(ui);
    });
  }

  saveBtn.addEventListener('click', async () => {
    currentSettings = await getSettings();
    currentSettings.paths = Object.fromEntries(Object.entries(pathInputs).map(([k, v]) => [k, v.value]));
    currentSettings.hotkeys = Object.fromEntries(Object.entries(hotkeyInputs).map(([k, v]) => {
      if (!v) return [k, ''];
      const raw = (v.dataset.shortcutRaw || v.value.trim()).toLowerCase();
      return [k, raw];
    }));
    currentSettings.popupsAlwaysOnTop = !!alwaysOnTopToggle?.checked;
    currentSettings.showStartupInfo = !!showStartupInfoToggle?.checked;
    currentSettings.ui = { theme: themeSelect?.value || 'default', scanlines: !!scanlinesToggle?.checked, reducedMotion: !!reducedMotionToggle?.checked, buttonSkin: buttonSkinSelect?.value || 'striped' };
    currentSettings.templates = Object.fromEntries( Object.entries(templateInputs).map(([key, element]) => [key, element.value]) );
    
    applyUiSettings(currentSettings.ui);
    await window.electronAPI.setSettings(currentSettings);
    
    window.panelEvents.dispatchEvent(new CustomEvent('settings-updated', {
      detail: { newSettings: currentSettings }
    }));

    saveBtn.textContent = 'Saved! Reload app to apply path changes.';
    setTimeout(() => { saveBtn.textContent = 'Save'; }, 3500);
  });

  resetBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset all settings? The application will reload.')) return;
    await window.electronAPI.resetSettings();
  });

  helpBtn.addEventListener('click', () => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8';
    modal.innerHTML = getHelpContentHtml();
    document.body.appendChild(modal);
    initializeManualPanel(modal);
    const closeButton = modal.querySelector('#close-help-modal');
    const closeModal = () => { if (document.body.contains(modal)) document.body.removeChild(modal); };
    closeButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  });

  zoomButtons.forEach(btn => btn.addEventListener('click', () => { window.electronAPI.setZoom(parseFloat(btn.dataset.zoom)); }));
  
  rootElement.querySelectorAll('.path-select-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const inputId = button.dataset.pathFor;
      const dialogType = button.dataset.dialog;
      const inputElement = rootElement.querySelector(`#${inputId}`);
      if (!inputElement) return;

      let selectedPath = null;
      if (dialogType === 'directory') {
        selectedPath = await window.electronAPI.selectDirectory();
      } else {
        const filters = [];
        if (dialogType === 'file-exe') filters.push({ name: 'Executable', extensions: ['exe'] });
        filters.push({ name: 'All Files', extensions: ['*'] });
        selectedPath = await window.electronAPI.selectFile({ filters });
      }

      if (selectedPath) {
        inputElement.value = selectedPath;
      }
    });
  });

  applyFeatureVisibility();
  loadCurrentSettings();
  setTimeout(() => { const firstPanelContent = rootElement.querySelector('#updates-panel .control-label-toggle')?.nextElementSibling; if (firstPanelContent) firstPanelContent.style.maxHeight = firstPanelContent.scrollHeight + 'px'; }, 150);
}