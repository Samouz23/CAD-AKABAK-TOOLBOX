// =======================================================
// FICHIER :  src/js/panels/mesh/mesh.js
// RÔLE    :  Gère l'interface et la logique de l'outil de maillage.
// MISSION :  Mise à jour du format de sortie de la "Frequency List".
// =======================================================
import { getSettings } from '../mainsettings/mainsettings.js';
import { getMeshPreviewPopupHtml, initializeMeshPreviewPopup } from '../../popup/mesh/meshPreviewPopup.js';

// --- Preset colors for frequency presets ---
const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e',
  '#a855f7', '#0ea5e9', '#84cc16', '#fb923c', '#6366f1',
];

let presetsFilePath = null;
let presets = [];

async function initPresetsPath() {
  if (presetsFilePath) return;
  const settings = await getSettings();
  const dataRoot = settings?.paths?.dataRoot;
  if (dataRoot) {
    presetsFilePath = `${dataRoot}\\Mesh-out\\freqPresets.json`;
  }
}

async function loadPresets() {
  await initPresetsPath();
  if (!presetsFilePath) return;
  const content = await window.electronAPI.readFile(presetsFilePath);
  if (content) {
    try { presets = JSON.parse(content); } catch { presets = []; }
  } else {
    presets = [];
  }
}

async function savePresets() {
  await initPresetsPath();
  if (!presetsFilePath) return;
  await window.electronAPI.saveFile({ filePath: presetsFilePath, content: JSON.stringify(presets, null, 2) });
}

export function getMeshPanelHtml() {
  const clmaxValues = [
    ...Array.from({length: 9}, (_, i) => i + 1),
    ...Array.from({length: 15}, (_, i) => 10 + i * 5)
  ];
  const clmaxOptions = clmaxValues.map(v => `<option value="${v}" ${v === 50 ? 'selected' : ''}>${v}</option>`).join('');
  
  const curvOptions = Array.from({length: 41}, (_, i) => i).map(v => `<option value="${v}">${v}</option>`).join('');
  
  const resolutionOptions = [12, 24, 48, 96, 192].map(v => `<option value="${v}" ${v === 24 ? 'selected' : ''}>${v}</option>`).join('');
  
  // MODIFIÉ: Ajout de la classe "toggle-arrow" pour un ciblage précis
  const arrowSVG = `<svg class="w-4 h-4 transition-transform duration-300 toggle-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
  
  const importSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="12" y2="12"></line><line x1="15" y1="15" x2="12" y2="12"></line></svg>`;

 return `
    <div class="p-6 text-green-400 h-full flex flex-col">
      <div class="flex justify-between items-center mb-6 flex-shrink-0">
        <h1 class="text-4xl font-bold text-white">Simulation Tools</h1>
        <button id="pop-out-btn" data-tool="mesh" title="Open in a new window" class="btn btn--ghost p-2 ml-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </button>
      </div>
      
      <div class="flex-1 overflow-y-auto pb-8 space-y-6">
      
      <!-- Panneau Maillage (Gmsh) -->
      <div id="mesh-panel" class="control-group space-y-4 mb-6">
        <div class="control-label-toggle flex justify-between items-start">
            <!-- MODIFIÉ: La classe 'flex-col' empile le titre et la flèche verticalement -->
            <div class="flex flex-col">
                <span>Physical (Gmsh)</span>
                ${arrowSVG}
            </div>
            <div class="flex flex-col items-end">
                <button id="manual-select-file-btn" title="Select a file manually" class="p-1.5 border border-gray-600 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors">
                    ${importSVG}
                </button>
                <div id="manual-file-display-container" class="hidden flex items-center justify-between p-2 bg-gray-900/50 rounded-md text-sm mt-1">
                    <span class="italic truncate text-blue-400" id="selected-file-path"></span>
                    <button id="clear-manual-file-btn" class="ml-2 text-red-500 font-bold hover:text-red-400 text-lg" title="Return to automatic mode">[x]</button>
                </div>
            </div>
        </div>
        <div class="p-4 space-y-4 overflow-hidden">
            <div class="flex items-center justify-between">
                <label for="batch-mode-toggle" class="font-semibold">Enable Batch Mode</label>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="batch-mode-toggle" class="sr-only peer">
                    <div class="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                </label>
            </div>

            <div class="flex items-center justify-between">
                <label for="bem-mode-toggle" class="font-semibold">Physical Mode</label>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="bem-mode-toggle" class="sr-only peer">
                    <div class="w-11 h-6 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                </label>
            </div>
            
            <div id="single-clmax-container">
                <label>Mesh size (clmax)</label>
                <select id="mesh-clmax" class="form-input">${clmaxOptions}</select>
            </div>

            <div id="batch-clmax-container" class="hidden space-y-2 border-t border-gray-700 pt-3">
                <label class="font-semibold text-white">Mesh sizes for batch</label>
                <p class="text-xs text-gray-400 mb-2">Leave unused values empty</p>
                <div class="grid grid-cols-3 gap-3">
                    <div><label class="block mb-1">clmax 1</label><input type="text" id="clmax-1" class="form-input" value="10" placeholder="Ex: 10"></div>
                    <div><label class="block mb-1">clmax 2</label><input type="text" id="clmax-2" class="form-input" value="20" placeholder="Ex: 20"></div>
                    <div><label class="block mb-1">clmax 3</label><input type="text" id="clmax-3" class="form-input" value="30" placeholder="Ex: 30"></div>
                </div>
            </div>

            <div>
                <label>Curvature accuracy</label>
                <select id="mesh-curv" class="form-input">${curvOptions}</select>
            </div>

            <div class="text-center pt-4 pb-4" style="display:flex; gap:8px;">
              <button id="start-mesh-btn" class="action-btn btn--primary h-12 text-lg font-bold" style="flex:1;">Start Meshing</button>
              <button id="open-preview-btn" class="action-btn btn--secondary h-12 font-bold" style="flex:1; font-size:13px; display:none;">Open Preview</button>
            </div>
            <div id="mesh-status" class="pt-2 pb-4 text-center min-h-[2.5rem]"></div>
            <div id="mesh-progress" class="w-full bg-gray-700 rounded-full h-2.5 hidden">
              <div class="themed-bg h-2.5 rounded-full" style="width: 0%"></div>
            </div>
        </div>
      </div>

      <!-- Panneau Frequency List -->
      <div id="freq-list-panel" class="control-group space-y-4">
        <!-- MODIFIÉ: Structure harmonisée pour un alignement parfait -->
        <div class="control-label-toggle">
            <div class="flex flex-col">
                <span>Frequency List</span>
                ${arrowSVG}
            </div>
        </div>
        <div class="p-4 pb-6 space-y-6 overflow-hidden">
            <section class="calc-section bg-gray-900/30 p-4 rounded-lg">
                <h2 class="calc-title text-lg font-bold text-white mb-3">General Settings</h2>
                <div class="grid grid-cols-3 gap-4">
                    <div><label class="block mb-2">Start Freq. (Hz)</label><input type="text" id="freq-start" class="form-input" value="10"></div>
                    <div><label class="block mb-2">End Freq. (Hz)</label><input type="text" id="freq-end" class="form-input" value="20000"></div>
                    <div><label class="block mb-2">Base Resolution</label><select id="freq-res-base" class="form-input">${resolutionOptions}</select></div>
                </div>
            </section>
            
            <section class="calc-section bg-gray-900/30 p-4 rounded-lg">
                <h2 class="calc-title text-lg font-bold text-white mb-3">Zoom Zones</h2>
                <div id="zoom-zones-container" class="space-y-3">
                    <!-- Les zones de zoom seront injectées ici par JS -->
                </div>
                <div class="pt-4 pb-2 text-center">
                    <button id="add-zoom-zone-btn" class="px-4 py-2 text-sm border border-gray-400 text-gray-300 rounded-md hover:bg-gray-800 hover:text-white transition-colors">Add zoom zone</button>
                </div>
            </section>
            
            <div class="text-center pt-4" style="display:flex; gap:8px;">
              <button id="generate-freq-list-btn" class="action-btn btn--primary h-12 text-lg font-bold" style="flex:1;">Generate and Copy</button>
              <button id="generate-add-preset-btn" class="action-btn btn--secondary h-12 font-bold" style="flex:1; font-size:13px;">Generate and Add Preset</button>
            </div>
            <div id="freq-list-status" class="pt-4 text-center h-10"></div>
        </div>
      </div>

      <!-- Presets (outside panels) -->
      <div id="freq-presets-section" class="mt-2">
          <h2 class="text-lg font-bold text-white mb-3 px-1">Presets</h2>
          <div id="freq-presets-container" class="grid grid-cols-2 gap-3"></div>
      </div>
      
      </div>
    </div>

    <!-- PREVIEW TOAST OVERLAY (Modal) -->
    <div id="preview-toast-overlay" style="display:none; position:fixed; inset:0; z-index:1040; background:rgba(0,0,0,0.65); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); align-items:center; justify-content:center;">
      <div id="preview-toast" style="position:relative; width:92vw; height:92vh; background:#111827; border-radius:10px; box-shadow:0 25px 60px rgba(0,0,0,0.7); border:1px solid rgba(236,72,153,0.3); display:flex; flex-direction:column; overflow:hidden;">
        <!-- Header avec croix -->
        <div class="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 class="text-xl font-bold text-white">Physical Mesh Preview</h2>
          <button id="preview-toast-close-btn" class="text-gray-400 hover:text-white hover:bg-gray-800 p-2 rounded transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <div id="preview-embedded-root" class="flex-1 min-h-0 bg-gray-950"></div>
      </div>
    </div>
  `;

}

export function initializeMeshPanel(rootElement) {
  // --- LOGIQUE DES PANNEAUX DÉROULANTS ---
  rootElement.querySelectorAll('.control-label-toggle').forEach(header => {
      const content = header.nextElementSibling;
      // MODIFIÉ: Cible la flèche avec sa classe pour éviter toute ambigüité
      const arrow = header.querySelector('.toggle-arrow');
      const panel = header.closest('.control-group');

      if (panel.id === 'mesh-panel') {
          content.style.maxHeight = content.scrollHeight + "px";
          if (arrow) arrow.classList.add('rotate-180');
      } else {
          content.style.maxHeight = '0px';
          if (arrow) arrow.classList.remove('rotate-180');
      }

      header.addEventListener('click', (e) => {
          // Empêche le clic sur le bouton d'import de déclencher le panneau
          if (e.target.closest('#manual-select-file-btn')) return;

          if (content.style.maxHeight && content.style.maxHeight !== '0px') {
              content.style.maxHeight = '0px';
              if (arrow) arrow.classList.remove('rotate-180');
          } else {
              content.style.maxHeight = content.scrollHeight + "px";
              if (arrow) arrow.classList.add('rotate-180');
          }
      });
  });

  // --- PARTIE MAILLAGE (GMSH) ---
  const startBtn = document.getElementById('start-mesh-btn');
  const openPreviewBtn = document.getElementById('open-preview-btn');
  const statusEl = document.getElementById('mesh-status');
  const progressContainer = document.getElementById('mesh-progress');
  const progressBar = progressContainer.querySelector('div');
  const curvSelect = document.getElementById('mesh-curv');
  const batchModeToggle = document.getElementById('batch-mode-toggle');
  const singleClmaxContainer = document.getElementById('single-clmax-container');
  const batchClmaxContainer = document.getElementById('batch-clmax-container');
  const clmaxSelect = document.getElementById('mesh-clmax');
  const clmaxInput1 = document.getElementById('clmax-1');
  const clmaxInput2 = document.getElementById('clmax-2');
  const clmaxInput3 = document.getElementById('clmax-3');
  const bemModeToggle = document.getElementById('bem-mode-toggle');

  const manualSelectFileBtn = document.getElementById('manual-select-file-btn');
  const manualFileDisplayContainer = document.getElementById('manual-file-display-container');
  const selectedFilePathDisplay = document.getElementById('selected-file-path');
  const clearManualFileBtn = document.getElementById('clear-manual-file-btn');
  let manualMeshFilePath = null;

  // --- PREVIEW TOAST OVERLAY (Modal) ---
  const previewToastOverlay = document.getElementById('preview-toast-overlay');
  const previewToastCloseBtn = document.getElementById('preview-toast-close-btn');
  const previewEmbeddedRoot = document.getElementById('preview-embedded-root');
  let previewEmbeddedInitialized = false;

  function closePreviewToast() {
    previewToastOverlay.style.display = 'none';
  }

  function displayPreviewToast() {
    previewToastOverlay.style.display = 'flex';
    if (!previewEmbeddedInitialized) {
      previewEmbeddedRoot.innerHTML = getMeshPreviewPopupHtml({ embedded: true });
      initializeMeshPreviewPopup({ embedded: true });
      previewEmbeddedInitialized = true;
    }
  }

  previewToastCloseBtn.addEventListener('click', closePreviewToast);
  previewToastOverlay.addEventListener('click', (e) => {
    if (e.target === previewToastOverlay) closePreviewToast();
  });

  // Listen for preview data from main process
  if (window.electronAPI?.onShowMeshPreviewToast) {
    window.electronAPI.onShowMeshPreviewToast(() => {
      displayPreviewToast();
    });
  }

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

  clearManualFileBtn.addEventListener('click', () => {
      manualMeshFilePath = null;
      manualFileDisplayContainer.classList.add('hidden');
  });

  function updateStartBtnText() {
    const isBatch = batchModeToggle.checked;
    const isPhysical = bemModeToggle.checked;
    if (isBatch) {
      startBtn.textContent = 'Start Batch';
      openPreviewBtn.style.display = 'none';
    } else if (isPhysical) {
      startBtn.textContent = 'Mesh Preview';
      openPreviewBtn.style.display = '';
    } else {
      startBtn.textContent = 'Start Meshing';
      openPreviewBtn.style.display = 'none';
    }
  }

  batchModeToggle.addEventListener('change', () => {
      const isBatchMode = batchModeToggle.checked;
      singleClmaxContainer.classList.toggle('hidden', isBatchMode);
      batchClmaxContainer.classList.toggle('hidden', !isBatchMode);
      updateStartBtnText();
  });

    bemModeToggle.addEventListener('change', () => {
      updateStartBtnText();
    });

  openPreviewBtn.addEventListener('click', async () => {
    if (!previewEmbeddedInitialized) {
      statusEl.textContent = 'No preview session. Click "Mesh Preview" first.';
      statusEl.className = 'text-yellow-400';
      return;
    }
    displayPreviewToast();
    statusEl.textContent = 'Preview opened.';
    statusEl.className = 'text-blue-400';
  });

  startBtn.addEventListener('click', async () => {
    const settings = await getSettings();
    const paths = settings.paths;
    const isManualMode = !!manualMeshFilePath; 

    const meshOutPath = paths.dataRoot ? `${paths.dataRoot}\\Mesh-out` : '';
    if (!paths || !paths.gmsh || !meshOutPath || (!isManualMode && !paths.downloads)) {
      statusEl.textContent = 'Error: Gmsh/Data Root/Downloads paths missing.';
      statusEl.className = 'text-red-500';
      return;
    }
    
    startBtn.disabled = true;
    startBtn.textContent = 'In progress...';
    statusEl.textContent = '';
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    const curv = curvSelect.value;
    const isBatchMode = batchModeToggle.checked;
    
    const createMeshArgs = (clmax) => ({
        gmshPath: paths.gmsh,
        destPath: meshOutPath,
        clmax: String(clmax),
        curv: curv,
        fileNameSuffix: `(${clmax}_${curv})`,
        sourceFilePath: manualMeshFilePath,
        downloadsPath: isManualMode ? null : paths.downloads,
        physicalSurfaces: bemModeToggle.checked,
        symmetryMirror: 'none',
    });
    
    if (isBatchMode) {
      const clmax1 = clmaxInput1.value.trim();
      const clmax2 = clmaxInput2.value.trim();
      const clmax3 = clmaxInput3.value.trim();
      
      // Filtrer uniquement les valeurs valides et non vides
      const tasks = [clmax1, clmax2, clmax3]
        .filter(v => v !== '')  // Ignorer les cases vides
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v) && v > 0);

      if (tasks.length === 0) {
        statusEl.textContent = 'Erreur: Entrez au moins une valeur clmax valide.';
        statusEl.className = 'text-red-500';
        startBtn.disabled = false;
        startBtn.textContent = 'Start Batch';
        return;
      }
      
      let hasFailed = false;
      for (let i = 0; i < tasks.length; i++) {
        const clmax = tasks[i];
        statusEl.textContent = `Meshing ${i + 1}/${tasks.length} (clmax: ${clmax})...`;
        statusEl.className = 'text-yellow-400';
        const args = createMeshArgs(clmax);
        const result = await window.electronAPI.runMesh(args);
        if (!result.success) {
            statusEl.textContent = `Error on clmax=${clmax}: ${result.error}`;
            statusEl.className = 'text-red-500';
            hasFailed = true;
            break;
        }
        const progress = ((i + 1) / tasks.length) * 100;
        progressBar.style.width = `${progress}%`;
      }
      if (!hasFailed) {
        statusEl.textContent = `Batch of ${tasks.length} meshes completed!`;
        statusEl.className = 'text-green-400';
      }
    } else {
      progressBar.style.width = '50%';
      const clmax = clmaxSelect.value;
      const args = createMeshArgs(clmax);

      // Physical Surfaces ON (single mode): mesh to temp, then open preview popup
      if (bemModeToggle.checked) {
        args.tempMode = true;
      }

      const result = await window.electronAPI.runMesh(args);
      progressBar.style.width = '100%';

      if (result.success) {
        if (bemModeToggle.checked && result.outputPath) {
          window.electronAPI.openMeshPreview({
            mshPath: result.outputPath,
            axis: null,
            destPath: meshOutPath,
            gmshPath: paths.gmsh,
            sourceFilePath: result.sourceFilePath,
            shellTagMap: result.shellTagMap,
            // Always forward the values the user typed in the panel so the
            // preview reflects the main panel settings (mesh size + curvature).
            defaultMeshSize: Number(clmax),
            defaultCurveMeshSize: Number(curv),
          });
          statusEl.textContent = 'Physical preview window opened.';
          statusEl.className = 'text-blue-400';
        } else {
          statusEl.textContent = result.message;
          statusEl.className = 'text-green-400';
        }
      } else {
        statusEl.textContent = `Error: ${result.error}`;
        statusEl.className = 'text-red-500';
      }
    }
    setTimeout(() => {
        startBtn.disabled = false;
      updateStartBtnText();
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
        if (statusEl.className.includes('green')) {
            statusEl.textContent = '';
        }
    }, 5000);
  });

  // --- PARTIE FREQUENCY LIST ---
  const freqStartInput = document.getElementById('freq-start');
  const freqEndInput = document.getElementById('freq-end');
  const freqResBaseSelect = document.getElementById('freq-res-base');
  const zoomZonesContainer = document.getElementById('zoom-zones-container');
  const addZoomZoneBtn = document.getElementById('add-zoom-zone-btn');
  const generateFreqListBtn = document.getElementById('generate-freq-list-btn');
  const generateAddPresetBtn = document.getElementById('generate-add-preset-btn');
  const freqListStatusEl = document.getElementById('freq-list-status');
  const presetsContainer = document.getElementById('freq-presets-container');
  let zoomZoneCounter = 0;

  function createZoomZone(id) {
    const zoomResolutionOptions = [12, 24, 48, 96, 192].map(v => `<option value="${v}" ${v === 96 ? 'selected' : ''}>${v}</option>`).join('');
    const div = document.createElement('div');
    div.className = 'grid grid-cols-12 gap-2 items-center p-2 rounded-md bg-gray-800/60';
    div.dataset.zoneId = id;
    div.innerHTML = `
        <div class="col-span-3"><input type="text" data-param="zoom_f_start" class="form-input" placeholder="Start (Hz)" value="30"></div>
        <div class="col-span-3"><input type="text" data-param="zoom_f_end" class="form-input" placeholder="End (Hz)" value="200"></div>
        <div class="col-span-5"><select data-param="resolution_zoom" class="form-input">${zoomResolutionOptions}</select></div>
        <div class="col-span-1 text-center">
            <button class="remove-zoom-zone-btn text-red-500 hover:text-red-400 text-2xl font-bold" title="Remove zone" data-id="${id}">×</button>
        </div>
    `;
    zoomZonesContainer.appendChild(div);
  }

  addZoomZoneBtn.addEventListener('click', () => {
    zoomZoneCounter++;
    createZoomZone(zoomZoneCounter);
    const parentPanelContent = addZoomZoneBtn.closest('.control-group > div');
    if (parentPanelContent.style.maxHeight && parentPanelContent.style.maxHeight !== '0px') {
        parentPanelContent.style.maxHeight = parentPanelContent.scrollHeight + "px";
    }
  });

  zoomZonesContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-zoom-zone-btn')) {
      const id = e.target.dataset.id;
      const zoneToRemove = zoomZonesContainer.querySelector(`[data-zone-id="${id}"]`);
      if (zoneToRemove) {
        zoomZonesContainer.removeChild(zoneToRemove);
      }
    }
  });

  function generatePoints(start, end, pointsPerOctave) {
    const points = [];
    let current_f = start;
    const factor = Math.pow(2, 1 / pointsPerOctave);
    while(current_f <= end) {
        points.push(parseFloat(current_f.toFixed(3)));
        current_f *= factor;
    }
    return points;
  }

  function collectCurrentFrequencies() {
    const f_start = parseFloat(freqStartInput.value);
    const f_end = parseFloat(freqEndInput.value);
    const resolution_base = parseInt(freqResBaseSelect.value);

    if (isNaN(f_start) || isNaN(f_end) || isNaN(resolution_base) || f_start >= f_end) {
      return null;
    }

    let allPoints = new Set(generatePoints(f_start, f_end, resolution_base));

    const zoomZones = zoomZonesContainer.querySelectorAll('[data-zone-id]');
    const zoomParams = [];
    zoomZones.forEach(zone => {
        const zoom_f_start = parseFloat(zone.querySelector('[data-param="zoom_f_start"]').value);
        const zoom_f_end = parseFloat(zone.querySelector('[data-param="zoom_f_end"]').value);
        const resolution_zoom = parseInt(zone.querySelector('[data-param="resolution_zoom"]').value);
        if (!isNaN(zoom_f_start) && !isNaN(zoom_f_end) && !isNaN(resolution_zoom) && zoom_f_start < zoom_f_end) {
            const zoomPoints = generatePoints(zoom_f_start, zoom_f_end, resolution_zoom);
            zoomPoints.forEach(p => allPoints.add(p));
            zoomParams.push({ start: zoom_f_start, end: zoom_f_end, resolution: resolution_zoom });
        }
    });

    const sortedList = Array.from(allPoints).sort((a, b) => a - b);
    return {
      frequencies: sortedList,
      params: { start: f_start, end: f_end, resolution: resolution_base, zoomZones: zoomParams }
    };
  }

  generateFreqListBtn.addEventListener('click', () => {
    const result = collectCurrentFrequencies();
    if (!result) {
        freqListStatusEl.textContent = "Error: Invalid general settings.";
        freqListStatusEl.className = 'text-red-500';
        return;
    }

    const listString = result.frequencies.join('\n');
    navigator.clipboard.writeText(listString).then(() => {
        generateFreqListBtn.textContent = 'Copied!';
        freqListStatusEl.textContent = `List of ${result.frequencies.length} frequencies copied.`;
        freqListStatusEl.className = 'text-green-400';
        setTimeout(() => { generateFreqListBtn.textContent = 'Generate and Copy'; }, 2000);
    }).catch(err => {
        freqListStatusEl.textContent = `Copy error: ${err}`;
        freqListStatusEl.className = 'text-red-500';
    });
  });

  // --- PRESETS ---
  function renderPresets() {
    presetsContainer.innerHTML = '';
    const section = document.getElementById('freq-presets-section');
    if (presets.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    presets.forEach((preset, index) => {
      const color = PRESET_COLORS[index % PRESET_COLORS.length];
      const el = document.createElement('div');
      el.className = 'preset-rect';
      el.style.cssText = `
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 14px 10px; border-radius: 10px; cursor: pointer;
        border: 2px solid ${color}; background: ${color}22;
        color: ${color}; font-weight: 700;
        user-select: none; transition: background 0.15s;
        min-height: 80px;
      `;
      el.innerHTML = `<span style="font-size:15px;">${preset.name}</span><span style="font-size:11px; opacity:0.7; margin-top:4px;">${preset.frequencies.length} freq</span>`;
      el.title = `Left click to copy, Right click to edit`;

      el.addEventListener('mouseenter', () => { el.style.background = `${color}44`; });
      el.addEventListener('mouseleave', () => { el.style.background = `${color}22`; });

      // Left click → copy frequency list
      el.addEventListener('click', () => {
        const listString = preset.frequencies.join('\n');
        navigator.clipboard.writeText(listString).then(() => {
          freqListStatusEl.textContent = `"${preset.name}" — ${preset.frequencies.length} frequencies copied.`;
          freqListStatusEl.className = 'text-green-400';
          setTimeout(() => { freqListStatusEl.textContent = ''; }, 3000);
        });
      });

      // Right click → edit toast
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showPresetToast(preset, index);
      });

      presetsContainer.appendChild(el);
    });
    updatePanelMaxHeight();
  }

  function showPresetToast(preset, index) {
    // Remove any existing toast
    const existing = document.getElementById('preset-edit-overlay');
    if (existing) existing.remove();

    // Backdrop overlay with blur
    const overlay = document.createElement('div');
    overlay.id = 'preset-edit-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: var(--z-modal-backdrop, 1040);
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      animation: overlayFadeIn 250ms ease-out;
    `;

    const color = PRESET_COLORS[index % PRESET_COLORS.length];

    // Toast card — centered, large
    const toast = document.createElement('div');
    toast.id = 'preset-edit-toast';
    toast.style.cssText = `
      z-index: var(--z-modal, 1050);
      background: var(--card-bg, #1a0a1f);
      border: 1px solid var(--border-primary, #8b1355);
      border-radius: var(--radius-xl, 16px);
      padding: 28px 32px;
      width: 420px; max-width: 90vw; height: 80vh;
      display: flex; flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 40px ${color}26;
      color: var(--text-body, #fff);
      animation: modalFadeIn 250ms ease-out;
    `;

    toast.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px;">
        <div style="width:14px; height:14px; border-radius:50%; background:${color}; flex-shrink:0;"></div>
        <h3 style="margin:0; font-size:18px; font-weight:700; color:var(--text-heading, #fff);">Edit Preset</h3>
      </div>

      <div style="margin-bottom:16px;">
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:13px; color:var(--text-muted, #d1d5db);">Name</label>
        <input type="text" id="toast-preset-name" value="${preset.name.replace(/"/g, '&quot;')}" 
          class="form-input" style="width:100%; padding:8px 12px; font-size:14px;">
      </div>

      <div style="margin-bottom:20px; flex:1; min-height:0; display:flex; flex-direction:column;">
        <label style="display:block; margin-bottom:6px; font-weight:600; font-size:13px; color:var(--text-muted, #d1d5db);">Frequencies <span style="opacity:0.6;">(${preset.frequencies.length} points)</span></label>
        <textarea id="toast-preset-freqs"
          class="form-input" style="width:100%; flex:1; min-height:200px; padding:8px 12px; font-size:13px; resize:none; font-family:monospace; line-height:1.5;"
        >${preset.frequencies.join('\n')}</textarea>
      </div>

      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button id="toast-delete-preset" class="action-btn" style="padding:8px 20px; border-radius:var(--radius-md, 8px); background:rgba(239,68,68,0.15); border:1px solid #ef4444; color:#fca5a5; cursor:pointer; font-weight:600; font-size:13px;">Delete</button>
        <button id="toast-close-preset" class="action-btn" style="padding:8px 20px; border-radius:var(--radius-md, 8px); background:var(--btn-ghost-bg, transparent); border:1px solid var(--btn-ghost-border, rgba(156,163,175,0.4)); color:var(--btn-ghost-text, #d1d5db); cursor:pointer; font-size:13px;">Cancel</button>
        <button id="toast-save-preset" class="action-btn" style="padding:8px 20px; border-radius:var(--radius-md, 8px); background:var(--btn-primary-bg, #e91e8c); border:1px solid var(--btn-primary-border, #e91e8c); color:var(--btn-primary-text, #fff); cursor:pointer; font-weight:700; font-size:13px;">Save</button>
      </div>
    `;

    overlay.appendChild(toast);
    document.body.appendChild(overlay);

    // Focus name input
    const nameInput = document.getElementById('toast-preset-name');
    nameInput.focus();
    nameInput.select();

    function closeToast() {
      overlay.remove();
    }

    // Save
    document.getElementById('toast-save-preset').addEventListener('click', async () => {
      const newName = document.getElementById('toast-preset-name').value.trim();
      const newFreqsRaw = document.getElementById('toast-preset-freqs').value.trim();
      const newFreqs = newFreqsRaw.split('\n').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
      if (!newName || newFreqs.length === 0) {
        freqListStatusEl.textContent = 'Invalid name or frequencies.';
        freqListStatusEl.className = 'text-red-500';
        closeToast();
        return;
      }
      presets[index].name = newName;
      presets[index].frequencies = newFreqs;
      await savePresets();
      renderPresets();
      closeToast();
      freqListStatusEl.textContent = `Preset "${newName}" updated.`;
      freqListStatusEl.className = 'text-green-400';
      setTimeout(() => { freqListStatusEl.textContent = ''; }, 3000);
    });

    // Delete
    document.getElementById('toast-delete-preset').addEventListener('click', async () => {
      const name = presets[index].name;
      presets.splice(index, 1);
      await savePresets();
      renderPresets();
      closeToast();
      freqListStatusEl.textContent = `Preset "${name}" deleted.`;
      freqListStatusEl.className = 'text-yellow-400';
      setTimeout(() => { freqListStatusEl.textContent = ''; }, 3000);
    });

    // Cancel
    document.getElementById('toast-close-preset').addEventListener('click', closeToast);

    // Close on overlay click (not toast itself)
    overlay.addEventListener('mousedown', (ev) => {
      if (ev.target === overlay) closeToast();
    });
  }

  function updatePanelMaxHeight() {
    const parentPanelContent = presetsContainer.closest('.control-group > div');
    if (parentPanelContent && parentPanelContent.style.maxHeight && parentPanelContent.style.maxHeight !== '0px') {
      parentPanelContent.style.maxHeight = parentPanelContent.scrollHeight + 'px';
    }
  }

  // Generate and Add Preset button
  generateAddPresetBtn.addEventListener('click', async () => {
    const result = collectCurrentFrequencies();
    if (!result) {
      freqListStatusEl.textContent = "Error: Invalid general settings.";
      freqListStatusEl.className = 'text-red-500';
      return;
    }

    const name = `Preset ${presets.length + 1}`;
    presets.push({
      name,
      frequencies: result.frequencies,
      params: result.params,
    });
    await savePresets();
    renderPresets();

    freqListStatusEl.textContent = `"${name}" added (${result.frequencies.length} frequencies).`;
    freqListStatusEl.className = 'text-green-400';
    setTimeout(() => { freqListStatusEl.textContent = ''; }, 3000);
  });

  // Load presets on init
  loadPresets().then(() => renderPresets());

  createZoomZone(0);

  setTimeout(() => {
      rootElement.querySelectorAll('.control-label-toggle').forEach(header => {
          const content = header.nextElementSibling;
          const panel = header.closest('.control-group');
          if (panel.id === 'mesh-panel') {
             content.style.maxHeight = content.scrollHeight + 'px';
          }
      });
  }, 150);
}
