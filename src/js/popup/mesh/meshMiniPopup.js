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

    // Désactiver le bouton pendant le processus
    startBtn.disabled = true;
    startBtn.textContent = 'Meshing...';
    
    // Afficher la barre de progression
    progressDiv.style.display = 'block';
    progressBar.style.width = '0%';
    
    statusDiv.textContent = 'Starting mesh generation...';
    statusDiv.style.color = 'var(--text-muted)';

    try {
      // Charger les settings pour obtenir les chemins nécessaires
      const settings = await window.electronAPI.getSettings();
      
      if (!settings?.paths?.gmsh) {
        throw new Error('GMSH path not configured. Please configure it in Settings.');
      }
      
      if (!settings?.paths?.downloads) {
        throw new Error('Downloads folder not configured. Please configure it in Settings.');
      }
      
      if (!settings?.paths?.dataRoot) {
        throw new Error('Data root folder not configured. Please configure it in Settings.');
      }

      // Simulation de progression
      progressBar.style.width = '30%';
      
      // Préparer les arguments pour runMesh
      const meshArgs = {
        gmshPath: settings.paths.gmsh,
        downloadsPath: settings.paths.downloads,
        destPath: settings.paths.dataRoot + '/Mesh-out',
        clmax: clmax,
        curv: curv,
        fileNameSuffix: '_meshed'
      };
      
      // Appeler l'API pour lancer le mesh
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
      // Réactiver le bouton
      startBtn.disabled = false;
      startBtn.textContent = 'Start Meshing';
      
      // Cacher la barre de progression après 2 secondes
      setTimeout(() => {
        progressDiv.style.display = 'none';
      }, 2000);
    }
  });
}
