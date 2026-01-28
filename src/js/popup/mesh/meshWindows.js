// =======================================================
// FICHIER :  src/popup/mesh/meshWindows.js
// RÔLE    :  Définit les popups individuels pour les outils Mesh
// =======================================================

import { initializeWindowControls, getWindowControlsStyles, getWindowControlsHtml } from '../common/windowControls.js';

// ==================== MESHING (GMSH) ====================
export function getMeshMeshingHtml() {
  const clmaxValues = [
    ...Array.from({length: 9}, (_, i) => i + 1),
    ...Array.from({length: 15}, (_, i) => 10 + i * 5)
  ];
  const clmaxOptions = clmaxValues.map(v => `<option value="${v}" ${v === 50 ? 'selected' : ''}>${v}</option>`).join('');
  const curvOptions = Array.from({length: 41}, (_, i) => i).map(v => `<option value="${v}">${v}</option>`).join('');

  const importSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="12" y2="12"></line><line x1="15" y1="15" x2="12" y2="12"></line></svg>`;

  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Meshing (Gmsh)')}
    <div class="space-y-4">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-2xl font-bold text-white">Meshing (Gmsh)</h2>
              <button id="manual-select-file-btn" title="Select a file manually" class="p-1.5 border border-gray-600 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors">
                ${importSVG}
              </button>
            </div>

            <div id="manual-file-display-container" class="hidden flex items-center justify-between p-2 bg-gray-900/50 rounded-md text-sm">
              <span class="italic truncate text-blue-400" id="selected-file-path"></span>
              <button id="clear-manual-file-btn" class="ml-2 text-red-500 font-bold hover:text-red-400 text-lg" title="Return to automatic mode">[x]</button>
            </div>

            <div class="flex items-center justify-between p-4 bg-gray-900/50 rounded-md">
              <label for="batch-mode-toggle" class="font-semibold text-white">Enable Batch Mode</label>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="batch-mode-toggle" class="sr-only peer">
                <div class="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
              </label>
            </div>

            <div id="single-clmax-container">
              <label class="text-white">Mesh size (clmax)</label>
              <select id="mesh-clmax" class="form-input">${clmaxOptions}</select>
            </div>

            <div id="batch-clmax-container" class="hidden space-y-2 border-t border-gray-700 pt-3">
              <label class="font-semibold text-white">Mesh sizes for batch</label>
              <p class="text-xs text-gray-400 mb-2">Laissez vide les valeurs non utilisées</p>
              <div class="grid grid-cols-3 gap-3">
                <div><label class="block mb-1 text-white">clmax 1</label><input type="text" id="clmax-1" class="form-input" value="10" placeholder="Ex: 10"></div>
                <div><label class="block mb-1 text-white">clmax 2</label><input type="text" id="clmax-2" class="form-input" value="20" placeholder="Ex: 20"></div>
                <div><label class="block mb-1 text-white">clmax 3</label><input type="text" id="clmax-3" class="form-input" value="30" placeholder="Ex: 30"></div>
              </div>
            </div>

            <div>
              <label class="text-white">Curvature accuracy</label>
              <select id="mesh-curv" class="form-input">${curvOptions}</select>
            </div>

            <div class="text-center pt-4 pb-4">
              <button id="start-mesh-btn" class="action-btn btn--primary w-full h-12 text-lg font-bold">Start Meshing</button>
            </div>
            <div id="mesh-status" class="pt-2 pb-4 text-center min-h-[2.5rem]"></div>
            <div id="mesh-progress" class="w-full bg-gray-700 rounded-full h-2.5 hidden">
              <div class="themed-bg h-2.5 rounded-full" style="width: 0%"></div>
        </div>
      </div>
    ${getCommonStyles()}
  `;
}

// ==================== FREQUENCY LIST ====================
export function getMeshFrequencyListHtml() {
  const resolutionOptions = [12, 24, 48, 96, 192].map(v => `<option value="${v}" ${v === 24 ? 'selected' : ''}>${v}</option>`).join('');

  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Frequency List')}
    <div class="space-y-6">
            <h2 class="text-2xl font-bold text-white">Frequency List</h2>

            <section class="calc-section bg-gray-900/30 p-4 rounded-lg">
              <h3 class="calc-title text-lg font-bold text-white mb-3">General Settings</h3>
              <div class="grid grid-cols-3 gap-4">
                <div><label class="block mb-2 text-white">Start Freq. (Hz)</label><input type="text" id="freq-start" class="form-input" value="10"></div>
                <div><label class="block mb-2 text-white">End Freq. (Hz)</label><input type="text" id="freq-end" class="form-input" value="20000"></div>
                <div><label class="block mb-2 text-white">Base Resolution</label><select id="freq-res-base" class="form-input">${resolutionOptions}</select></div>
              </div>
            </section>

            <section class="calc-section bg-gray-900/30 p-4 rounded-lg">
              <h3 class="calc-title text-lg font-bold text-white mb-3">Zoom Zones</h3>
              <div id="zoom-zones-container" class="space-y-3"></div>
              <div class="pt-4 pb-2 text-center">
                <button id="add-zoom-zone-btn" class="px-4 py-2 text-sm border border-gray-400 text-gray-300 rounded-md hover:bg-gray-800 hover:text-white transition-colors">Add zoom zone</button>
              </div>
            </section>

            <div class="text-center pt-4 pb-6">
              <button id="generate-freq-list-btn" class="action-btn btn--primary w-full h-12 text-lg font-bold">Generate and Copy</button>
            </div>
        <div id="freq-list-status" class="pt-4 text-center h-10"></div>
      </div>
    ${getCommonStyles()}
  `;
}

// ==================== INITIALIZATION ====================
export function initializeMeshPopup(toolNameFromHost) {
  console.log('[Mesh Popup] Initialisation...');
  
  // Initialiser les contrôles de fenêtre avec le helper commun
  initializeWindowControls();
  
  const urlParams = new URLSearchParams(window.location.search);
  const tool = toolNameFromHost || window.popupToolName || urlParams.get('tool');

  // Tool-specific logic
  if (tool === 'mesh-meshing') {
    initializeMeshingTool();
  } else if (tool === 'mesh-frequency-list') {
    initializeFrequencyListTool();
  }
}

function initializeMeshingTool() {
  const startBtn = document.getElementById('start-mesh-btn');
  const statusEl = document.getElementById('mesh-status');
  const progressContainer = document.getElementById('mesh-progress');
  const progressBar = progressContainer?.querySelector('div');
  const curvSelect = document.getElementById('mesh-curv');
  const batchModeToggle = document.getElementById('batch-mode-toggle');
  const singleClmaxContainer = document.getElementById('single-clmax-container');
  const batchClmaxContainer = document.getElementById('batch-clmax-container');
  const clmaxSelect = document.getElementById('mesh-clmax');
  const clmaxInput1 = document.getElementById('clmax-1');
  const clmaxInput2 = document.getElementById('clmax-2');
  const clmaxInput3 = document.getElementById('clmax-3');

  const manualSelectFileBtn = document.getElementById('manual-select-file-btn');
  const manualFileDisplayContainer = document.getElementById('manual-file-display-container');
  const selectedFilePathDisplay = document.getElementById('selected-file-path');
  const clearManualFileBtn = document.getElementById('clear-manual-file-btn');
  let manualMeshFilePath = null;

  if (manualSelectFileBtn) {
    manualSelectFileBtn.addEventListener('click', async () => {
      const result = await window.electronAPI.selectMeshFile();
      if (result && !result.canceled && result.filePaths.length > 0) {
        manualMeshFilePath = result.filePaths[0];
        const fileName = manualMeshFilePath.split('\\').pop().split('/').pop();
        selectedFilePathDisplay.textContent = fileName;
        selectedFilePathDisplay.title = manualMeshFilePath;
        manualFileDisplayContainer.classList.remove('hidden');
      }
    });
  }

  if (clearManualFileBtn) {
    clearManualFileBtn.addEventListener('click', () => {
      manualMeshFilePath = null;
      manualFileDisplayContainer.classList.add('hidden');
    });
  }

  if (batchModeToggle) {
    batchModeToggle.addEventListener('change', () => {
      if (batchModeToggle.checked) {
        singleClmaxContainer.classList.add('hidden');
        batchClmaxContainer.classList.remove('hidden');
      } else {
        singleClmaxContainer.classList.remove('hidden');
        batchClmaxContainer.classList.add('hidden');
      }
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      const isBatch = batchModeToggle.checked;
      const curv = parseInt(curvSelect.value, 10);

      let clmaxList = [];
      if (isBatch) {
        const v1 = clmaxInput1.value.trim();
        const v2 = clmaxInput2.value.trim();
        const v3 = clmaxInput3.value.trim();
        if (v1) clmaxList.push(parseFloat(v1));
        if (v2) clmaxList.push(parseFloat(v2));
        if (v3) clmaxList.push(parseFloat(v3));
        if (clmaxList.length === 0) {
          statusEl.textContent = 'Error: Enter at least one clmax value.';
          statusEl.style.color = 'red';
          return;
        }
      } else {
        clmaxList = [parseInt(clmaxSelect.value, 10)];
      }

      statusEl.textContent = 'Meshing in progress...';
      statusEl.style.color = 'yellow';
      if (progressContainer) progressContainer.classList.remove('hidden');
      if (progressBar) progressBar.style.width = '0%';

      try {
        const result = await window.electronAPI.startMeshing({
          clmaxList,
          curv,
          manualFilePath: manualMeshFilePath
        });

        if (result.success) {
          statusEl.textContent = result.message || 'Meshing completed successfully!';
          statusEl.style.color = 'lightgreen';
          if (progressBar) progressBar.style.width = '100%';
        } else {
          statusEl.textContent = result.message || 'Meshing failed.';
          statusEl.style.color = 'red';
        }
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.style.color = 'red';
      }
    });
  }

  window.electronAPI.onMeshProgress((progress) => {
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }
  });
}

function initializeFrequencyListTool() {
  const generateBtn = document.getElementById('generate-freq-list-btn');
  const statusEl = document.getElementById('freq-list-status');
  const startInput = document.getElementById('freq-start');
  const endInput = document.getElementById('freq-end');
  const resBaseSelect = document.getElementById('freq-res-base');
  const zonesContainer = document.getElementById('zoom-zones-container');
  const addZoneBtn = document.getElementById('add-zoom-zone-btn');

  let zoneCounter = 0;

  const createZoneHtml = (id) => {
    const resolutionOptions = [12, 24, 48, 96, 192].map(v => `<option value="${v}">${v}</option>`).join('');
    return `
      <div class="zoom-zone flex gap-3 items-end p-3 bg-black/20 rounded-md" data-zone-id="${id}">
        <div class="flex-1"><label class="block mb-1 text-white text-sm">Start (Hz)</label><input type="text" class="form-input zoom-start" placeholder="100"></div>
        <div class="flex-1"><label class="block mb-1 text-white text-sm">End (Hz)</label><input type="text" class="form-input zoom-end" placeholder="500"></div>
        <div class="flex-1"><label class="block mb-1 text-white text-sm">Resolution</label><select class="form-input zoom-res">${resolutionOptions}</select></div>
        <button class="remove-zone-btn px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors">Remove</button>
      </div>
    `;
  };

  if (addZoneBtn) {
    addZoneBtn.addEventListener('click', () => {
      zoneCounter++;
      const zoneHtml = createZoneHtml(zoneCounter);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = zoneHtml;
      const zoneElement = tempDiv.firstElementChild;
      zonesContainer.appendChild(zoneElement);

      const removeBtn = zoneElement.querySelector('.remove-zone-btn');
      removeBtn.addEventListener('click', () => {
        zonesContainer.removeChild(zoneElement);
      });
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      const start = parseFloat(startInput.value);
      const end = parseFloat(endInput.value);
      const resBase = parseInt(resBaseSelect.value, 10);

      if (isNaN(start) || isNaN(end) || start >= end) {
        statusEl.textContent = 'Error: Invalid frequency range.';
        statusEl.style.color = 'red';
        return;
      }

      const zones = [];
      zonesContainer.querySelectorAll('.zoom-zone').forEach(zoneEl => {
        const zStart = parseFloat(zoneEl.querySelector('.zoom-start').value);
        const zEnd = parseFloat(zoneEl.querySelector('.zoom-end').value);
        const zRes = parseInt(zoneEl.querySelector('.zoom-res').value, 10);
        if (!isNaN(zStart) && !isNaN(zEnd) && zStart < zEnd) {
          zones.push({ start: zStart, end: zEnd, resolution: zRes });
        }
      });

      try {
        const result = await window.electronAPI.generateFrequencyList({
          start,
          end,
          baseResolution: resBase,
          zoomZones: zones
        });

        if (result.success) {
          statusEl.textContent = 'Frequency list generated and copied to clipboard!';
          statusEl.style.color = 'lightgreen';
        } else {
          statusEl.textContent = result.message || 'Generation failed.';
          statusEl.style.color = 'red';
        }
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.style.color = 'red';
      }
    });
  }
}

function getCommonStyles() {
  return `
    <style>
      .calc-input {
        width: 100%;
        padding: 10px 12px;
        background-color: var(--bg-control-group);
        border: 1px solid var(--border-secondary);
        border-radius: 4px;
        color: var(--text-body);
        font-size: 14px;
        font-family: inherit;
        transition: border-color 0.2s;
      }
      .calc-input:focus {
        outline: none;
        border-color: var(--theme-accent);
      }
      .calc-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .form-input {
        width: 100%;
        padding: 10px 12px;
        background-color: var(--bg-control-group);
        border: 1px solid var(--border-secondary);
        border-radius: 4px;
        color: var(--text-body);
        font-size: 14px;
        font-family: inherit;
        transition: border-color 0.2s;
      }
      .form-input:focus {
        outline: none;
        border-color: var(--theme-accent);
      }
    </style>
  `;
}
