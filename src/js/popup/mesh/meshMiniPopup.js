// =======================================================
// FICHIER :  src/js/popup/mesh/meshMiniPopup.js
// RÔLE    :  Mini popup minimaliste pour meshing rapide
// =======================================================

import { getWindowControlsHtml, initializeWindowControls, getWindowControlsStyles } from '../common/windowControls.js';

/**
 * Génère le HTML pour le mini popup mesh
 */
export function getMeshMiniPopupHtml() {
  const clmaxValues = [
    ...Array.from({length: 9}, (_, i) => i + 1),
    ...Array.from({length: 15}, (_, i) => 10 + i * 5)
  ];
  const clmaxOptions = clmaxValues.map(v => `<option value="${v}" ${v === 50 ? 'selected' : ''}>${v}</option>`).join('');
  
  const curvOptions = Array.from({length: 41}, (_, i) => i).map(v => `<option value="${v}">${v}</option>`).join('');

  return `
    <div class="h-full flex flex-col" style="background-color: var(--bg-primary); margin: 0; padding: 0;">
      ${getWindowControlsHtml('Quick Mesh')}
      
      <!-- Contenu -->
      <div style="padding: 10px; flex-grow: 1; display: flex; flex-direction: column;">
        <div style="margin-bottom: 8px;">
          <label style="color: var(--text-subtitle); font-size: 11px; font-weight: 500; display: block; margin-bottom: 3px;">Mesh size (clmax)</label>
          <select id="mini-mesh-clmax" class="calc-input" style="width: 100%;">${clmaxOptions}</select>
        </div>
        
        <div style="margin-bottom: 8px;">
          <label style="color: var(--text-subtitle); font-size: 11px; font-weight: 500; display: block; margin-bottom: 3px;">Curvature accuracy</label>
          <select id="mini-mesh-curv" class="calc-input" style="width: 100%;">${curvOptions}</select>
        </div>

        <div id="mini-mesh-status" style="text-align: center; min-height: 1rem; color: var(--text-muted); font-size: 10px; margin-bottom: 4px;"></div>
        
        <div id="mini-mesh-progress" style="width: 100%; background-color: var(--bg-secondary); border-radius: 3px; height: 4px; display: none; overflow: hidden; margin-bottom: 8px;">
          <div id="mini-mesh-progress-bar" style="background-color: var(--theme-accent); height: 100%; width: 0%; transition: width 0.3s ease;"></div>
        </div>
      
        <button id="mini-start-mesh-btn" class="action-btn btn--primary" style="width: 100%; height: 34px; font-size: 13px; font-weight: 700; border-radius: 4px; background-color: var(--theme-accent); color: white; border: none; cursor: pointer; transition: all 0.2s; margin-top: auto;">
          Start Meshing
        </button>

        <button id="mini-remesh-physical-btn" class="action-btn" style="width: 100%; height: 34px; font-size: 12px; font-weight: 600; border-radius: 4px; background-color: #1e3a5f; color: #38bdf8; border: 1px solid #2563eb; cursor: pointer; transition: all 0.2s; margin-top: 6px;">
          Remesh Physical
        </button>
      </div>
    </div>
    ${getCommonStyles()}
    ${getWindowControlsStyles()}
  `;
}

/**
 * Styles communs pour les calculateurs
 */
function getCommonStyles() {
  return `
    <style>
      .calc-input, select.calc-input {
        width: 100%;
        padding: 6px 8px;
        background-color: var(--bg-control);
        border: 1px solid var(--border-secondary);
        border-radius: 3px;
        color: var(--text-primary);
        font-size: 12px;
        font-family: inherit;
        transition: all 0.2s;
      }
      
      .calc-input:focus, select.calc-input:focus {
        outline: none;
        border-color: var(--theme-accent);
        background-color: var(--bg-control-hover);
      }

      .calc-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .action-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(233, 30, 140, 0.3);
      }

      .action-btn:active {
        transform: translateY(0);
      }

      .action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
    </style>
  `;
}

/**
 * Initialise le mini popup mesh
 */
export function initializeMeshMiniPopup() {
  console.log('[Mesh Mini Popup] Initialisation...');
  
  // Initialiser les contrôles de fenêtre
  initializeWindowControls();
  
  const clmaxSelect = document.getElementById('mini-mesh-clmax');
  const curvSelect = document.getElementById('mini-mesh-curv');
  const startBtn = document.getElementById('mini-start-mesh-btn');
  const remeshPhysicalBtn = document.getElementById('mini-remesh-physical-btn');
  const statusDiv = document.getElementById('mini-mesh-status');
  const progressDiv = document.getElementById('mini-mesh-progress');
  const progressBar = document.getElementById('mini-mesh-progress-bar');

  if (!startBtn) {
    console.error('[Mesh Mini Popup] Start button not found');
    return;
  }

  startBtn.addEventListener('click', async () => {
    const clmax = clmaxSelect.value;
    const curv = curvSelect.value;

    console.log('[Mesh Mini Popup] Starting mesh with clmax:', clmax, 'curv:', curv);

    startBtn.disabled = true;
    startBtn.textContent = 'Meshing...';
    progressDiv.style.display = 'block';
    progressBar.style.width = '0%';
    statusDiv.textContent = 'Starting mesh generation...';
    statusDiv.style.color = 'var(--text-muted)';

    try {
      const settings = await window.electronAPI.getSettings();
      
      if (!settings?.paths?.gmsh) throw new Error('GMSH path not configured.');
      if (!settings?.paths?.downloads) throw new Error('Downloads folder not configured.');
      if (!settings?.paths?.dataRoot) throw new Error('Data root folder not configured.');

      progressBar.style.width = '30%';
      
      const meshArgs = {
        gmshPath: settings.paths.gmsh,
        downloadsPath: settings.paths.downloads,
        destPath: settings.paths.dataRoot + '/Mesh-out',
        clmax: clmax,
        curv: curv,
        fileNameSuffix: '_meshed',
        physicalSurfaces: false,
        symmetryMirror: 'none',
      };
      
      const result = await window.electronAPI.runMesh(meshArgs);
      progressBar.style.width = '100%';
      
      if (result.success) {
        statusDiv.textContent = '✓ Mesh completed successfully!';
        statusDiv.style.color = 'var(--theme-accent)';
      } else {
        statusDiv.textContent = '✗ Mesh failed: ' + (result.error || 'Unknown error');
        statusDiv.style.color = '#ef4444';
      }
    } catch (error) {
      console.error('[Mesh Mini Popup] Error:', error);
      statusDiv.textContent = '✗ ' + error.message;
      statusDiv.style.color = '#ef4444';
      progressBar.style.width = '0%';
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = 'Start Meshing';
      setTimeout(() => { progressDiv.style.display = 'none'; }, 2000);
    }
  });

  remeshPhysicalBtn.addEventListener('click', async () => {
    remeshPhysicalBtn.disabled = true;
    remeshPhysicalBtn.textContent = 'Remeshing...';
    statusDiv.textContent = '';
    statusDiv.style.color = 'var(--text-muted)';
    progressDiv.style.display = 'block';
    progressBar.style.width = '10%';

    try {
      const saved = await window.electronAPI.getLastPreviewState();
      if (!saved) {
        throw new Error('No Physical Preview session found. Open Physical Preview first.');
      }

      const { state, config } = saved;
      const settings = await window.electronAPI.getSettings();
      if (!settings?.paths?.downloads) throw new Error('Downloads folder not configured.');
      if (!settings?.paths?.dataRoot) throw new Error('Data root folder not configured.');

      const gmshPath = config.gmshPath || settings.paths.gmsh;
      if (!gmshPath) throw new Error('GMSH path not configured.');

      const downloadsPath = settings.paths.downloads;
      const files = await window.electronAPI.readDirectory?.(downloadsPath)
        || [];

      progressBar.style.width = '20%';
      statusDiv.textContent = 'Finding latest STEP file...';

      // Step 1: mesh the latest STEP with physical surfaces to get a temp msh
      const meshResult = await window.electronAPI.runMesh({
        gmshPath,
        downloadsPath,
        destPath: settings.paths.dataRoot + '/Mesh-out',
        clmax: String(config.defaultMeshSize || 50),
        curv: '0',
        fileNameSuffix: '_meshed',
        physicalSurfaces: true,
        symmetryMirror: 'none',
        tempMode: true,
      });

      if (!meshResult.success) throw new Error(meshResult.error);
      progressBar.style.width = '40%';
      statusDiv.textContent = 'Applying preview parameters...';

      // Step 2: Build physicalConfig from saved state
      const isMirrorEnabled = state.mirrorAxis === 'H' || state.mirrorAxis === 'V';
      const defaultMeshSize = config.defaultMeshSize || 50;
      const defaultCurveMeshSize = config.defaultCurveMeshSize ?? defaultMeshSize;

      const groups = (state.surfaceParams || []).map((param, index) => ({
        name: `S${index + 1}`,
        isInterface: isMirrorEnabled && Boolean(param.mergeAtSymmetry),
        meshSize: param.meshSize || defaultMeshSize,
        curveMeshSize: param.curveMeshSize ?? defaultCurveMeshSize,
        shellIndices: [index],
      }));

      const mirrorArgs = isMirrorEnabled ? {
        axis: state.mirrorAxis,
        interfaceTags: [],
      } : null;

      // Step 3: Remesh with the saved parameters
      const remeshResult = await window.electronAPI.remeshPreview({
        mshPath: meshResult.outputPath,
        mirror: mirrorArgs,
        physicalConfig: {
          gmshPath,
          sourceFilePath: meshResult.sourceFilePath,
          defaultMeshSize,
          defaultCurveMeshSize,
          groups,
        },
      });

      if (!remeshResult.success) throw new Error(remeshResult.error);
      progressBar.style.width = '80%';
      statusDiv.textContent = 'Exporting...';

      // Step 4: Export to final destination
      const destPath = config.destPath || (settings.paths.dataRoot + '/Mesh-out');
      const exportResult = await window.electronAPI.exportMesh({
        mshPath: remeshResult.mshPath,
        destPath,
      });

      if (!exportResult.success) throw new Error(exportResult.error);
      progressBar.style.width = '100%';
      statusDiv.textContent = '✓ Physical remesh + export done!';
      statusDiv.style.color = 'var(--theme-accent)';
    } catch (error) {
      console.error('[Mesh Mini] Remesh Physical error:', error);
      statusDiv.textContent = '✗ ' + error.message;
      statusDiv.style.color = '#ef4444';
      progressBar.style.width = '0%';
    } finally {
      remeshPhysicalBtn.disabled = false;
      remeshPhysicalBtn.textContent = 'Remesh Physical';
      setTimeout(() => { progressDiv.style.display = 'none'; }, 2000);
    }
  });
}
