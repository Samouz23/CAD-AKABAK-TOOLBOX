// ====================================================================================================
// FICHIER :  src/js/panels/hornstudio/uiTemplates.js
// RÔLE :     Génération du template HTML du panneau Horn Studio (style Waveguide Studio).
// ====================================================================================================

import { getBemSolverPanelHtml } from '../bemsolver/bemSolver.js';

export function getHornStudioPanelHtml() {
    const arrowSVG = `<svg class="w-4 h-4 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;

    return `
<style>
/* ========== Horn Studio — polished UI ========== */

/* --- Segments data table (directivity-style) --- */
.hs-table-wrap{ overflow-x:auto; }
.hs-table-wrap table.hs-table{
  width:100%;
  border-collapse: collapse;
  font-size:13px;
}
.hs-table-wrap table.hs-table thead th{
  position: sticky; top: 0; z-index: 1;
  background: rgba(31,41,55,.85);
  color:#d1d5db;
  font-size:11px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:.08em;
  padding:12px 18px;
  text-align:center;
}
.hs-table-wrap table.hs-table thead th:first-child{ text-align:left; }
.hs-table-wrap table.hs-table thead th .hs-unit{
  color:#6b7280;
  font-weight:400;
  margin-left:4px;
  text-transform:none;
  letter-spacing:0;
  font-size:10px;
}
.hs-table-wrap table.hs-table tbody td{
  padding:11px 18px;
  text-align:center;
  color:#d1d5db;
  border-bottom:1px solid rgba(31,41,55,.8);
  font-family: ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}
.hs-table-wrap table.hs-table tbody tr:nth-child(even){ background: rgba(17,24,39,.4); }
.hs-table-wrap table.hs-table tbody tr:nth-child(odd){  background: rgba(31,41,55,.25); }
.hs-table-wrap table.hs-table tbody tr:hover{ background: rgba(55,65,81,.5); }
.hs-table-wrap table.hs-table tbody td.hs-idx{
  font-weight:600; color:#fff; text-align:left;
}
.hs-table-wrap table.hs-table tbody tr.hs-mouth-row td{
  color:#a7f3d0; font-weight:600;
  background: rgba(16,185,129,.08);
}
.hs-table-wrap table.hs-table tbody tr.hs-mouth-row:hover td{
  background: rgba(16,185,129,.14);
}
.hs-table-wrap .hs-badge{
  display:inline-block;
  padding:2px 4px;
  border-radius:4px;
  font-size:9px;
  font-weight:700;
  letter-spacing:.05em;
  margin-left:8px;
  background: rgba(16,185,129,.2);
  color:#6ee7b7;
  vertical-align: middle;
}
.hs-len-input{
  width: 90px;
  background: rgba(17,24,39,.8);
  border:1px solid rgba(55,65,81,.8);
  border-radius:5px;
  padding:5px 10px;
  color:#f3f4f6;
  text-align:center;
  font-family: ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  font-size:13px;
  outline:none;
  transition: border-color .15s, background .15s, box-shadow .15s;
}
.hs-len-input:hover{ border-color:#6b7280; }
.hs-len-input:focus{ border-color:#22c55e; background:#0b0f17; box-shadow:0 0 0 2px rgba(34,197,94,.18); }
.hs-lock-btn{
  display:inline-flex; align-items:center; justify-content:center;
  width:26px; height:26px; border-radius:5px;
  background: rgba(55,65,81,.6); color:#9ca3af;
  border:1px solid rgba(75,85,99,.7);
  transition: all .15s ease;
}
.hs-lock-btn:hover{ background: rgba(75,85,99,.9); color:#fff; }
.hs-lock-btn.locked{
  background: linear-gradient(135deg,#f59e0b,#d97706);
  color:#fff; border-color:#b45309;
}
.hs-dim-sky     { color: #38bdf8; }
.hs-dim-emerald { color: #34d399; }
.hs-dim-amber   { color: #fbbf24; }
.hs-dim-orange  { color: #fb923c; }

/* --- 2D profile canvas container --- */
.hs-2d-container{
  background: linear-gradient(180deg, #0d0f14 0%, #090b0f 100%);
  border:1px solid #1f2937;
  border-radius:8px;
  box-shadow: inset 0 0 24px rgba(0,0,0,.4);
}

/* --- Active tab/view button glow --- */
.gen-2d-view-btn, .gen-tab-btn{ transition: all .18s ease; }
.gen-2d-view-btn.bg-green-700, .gen-tab-btn.bg-green-700{
  box-shadow:0 0 0 2px rgba(34,197,94,.4), 0 4px 12px rgba(34,197,94,.2);
}
</style>
<div class="p-6 text-green-400 h-full min-h-0 flex flex-row space-x-6 overflow-x-hidden">

  <!-- ================================================================== -->
  <!-- Colonne gauche : Panneaux de contrôle                              -->
  <!-- ================================================================== -->
  <div class="w-96 flex-shrink-0 flex flex-col h-full">

    <!-- === EN-TÊTE (FIXE) === -->
    <div class="flex-shrink-0">
      <h1 class="text-4xl font-bold text-white">Horn Studio</h1>
    </div>

    <!-- === ZONE DE CONTENU (DÉFILABLE) === -->
    <div class="flex-grow min-h-0 overflow-y-auto py-4 pr-2 space-y-4">

      <!-- Main Settings -->
      <div class="control-group">
        <div class="control-label-toggle"><span>Main settings</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Expansion Law</span>
          <select id="gen-expansion-type" class="form-input form-input-sm">
            <option>Conical</option><option selected>Exponential</option><option>Parabolic</option><option>Hypex</option>
          </select>
          <div id="gen-expansion-params" class="contents"></div>
          <span>Mode</span>
          <select id="gen-horn-type" class="form-input form-input-sm">
            <option value="hv" selected>Expansion H + V</option>
            <option value="constantH">Constant Height</option>
          </select>
          <div id="gen-constant-height-field" class="hidden contents">
            <span>Fixed Height (mm)</span>
            <input type="text" id="gen-constant-height-value" value="200" class="form-input form-input-sm">
          </div>
          <input type="checkbox" id="gen-constant-height" class="hidden">
          <span>Fc (Hz)</span>
          <input type="text" id="gen-fc" value="" class="form-input form-input-sm" placeholder="Auto">
          <span>Length (mm)</span>
          <input type="text" id="gen-horn-length" value="500" class="form-input form-input-sm">
          <span>Segments</span>
          <input type="number" id="gen-segment-count" value="6" min="2" max="20" class="form-input form-input-sm">
          <span>Baffle Diameter (mm)</span>
          <input type="text" id="gen-mesh-baffle-diameter" value="" placeholder="Auto" class="form-input form-input-sm">
          <span>Wood Thickness (mm)</span>
          <input type="number" id="gen-mesh-wood-thick" value="15" min="3" max="50" class="form-input form-input-sm">
        </div>
      </div>

      <!-- Throat Geometry -->
      <div class="control-group">
        <div class="control-label-toggle"><span>Throat</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Width (mm)</span>
          <input type="text" id="gen-throat-width" value="100" class="form-input form-input-sm">
          <span>Height (mm)</span>
          <input type="text" id="gen-throat-height" value="56" class="form-input form-input-sm">
        </div>
      </div>

      <!-- Mouth Geometry -->
      <div id="gen-mouth-section" class="control-group">
        <div class="control-label-toggle"><span>Mouth</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Width (mm)</span>
          <input type="text" id="gen-mouth-width" value="400" class="form-input form-input-sm">
          <span>Height (mm)</span>
          <input type="text" id="gen-mouth-height" value="226" class="form-input form-input-sm">
        </div>
      </div>

      <!-- Mesh Settings -->
      <div class="control-group">
        <div class="control-label-toggle"><span>Mesh Settings</span>${arrowSVG}</div>
        <div class="p-4 space-y-4 overflow-hidden">
          <div class="grid grid-cols-2 items-center gap-x-4 gap-y-3">
            <span>Angular Points</span>
            <input type="number" id="gen-mesh-angular" value="100" min="4" max="200" class="form-input form-input-sm">
            <span>Axial Points / seg</span>
            <input type="number" id="gen-mesh-axial" value="24" min="1" max="50" class="form-input form-input-sm">
            <span>Baffle Mesh Pts</span>
            <input type="number" id="gen-mesh-baffle" value="24" min="2" max="30" class="form-input form-input-sm">
            <span>Interface Mesh Pts</span>
            <input type="number" id="gen-mesh-itf" value="16" min="1" max="20" class="form-input form-input-sm">
          </div>

          <div class="space-y-2.5 pt-3 border-t themed-border">
            <p class="text-xs text-gray-400 uppercase tracking-wide">Delaunay Mesh (GMSH export)</p>

            <div class="wg-mesh-row">
              <div class="wg-mesh-row-head">
                <span class="wg-mesh-row-dot"></span>
                <span class="wg-mesh-row-title">Source</span>
                <label class="switch switch-sm ml-auto" title="Adaptive: finer at throat, coarser toward mouth">
                  <input id="gen-msh-source-adaptive" type="checkbox"><span class="slider round"></span>
                </label>
              </div>
              <div class="wg-mesh-row-fields">
                <label class="wg-mesh-field">
                  <span>Size (clmax)</span>
                  <input id="gen-msh-source-clmax" type="number" class="form-input form-input-sm" value="20" min="0.1" step="0.1">
                </label>
                <label class="wg-mesh-field">
                  <span>Curvature</span>
                  <input id="gen-msh-source-curv" type="number" class="form-input form-input-sm" value="12" min="0" step="1">
                </label>
              </div>
            </div>

            <div class="wg-mesh-row">
              <div class="wg-mesh-row-head">
                <span class="wg-mesh-row-dot"></span>
                <span class="wg-mesh-row-title">Horn</span>
                <label class="switch switch-sm ml-auto" title="Adaptive: finer at throat, coarser toward mouth">
                  <input id="gen-msh-horn-adaptive" type="checkbox" checked><span class="slider round"></span>
                </label>
              </div>
              <div class="wg-mesh-row-fields">
                <label class="wg-mesh-field">
                  <span>Size (clmax)</span>
                  <input id="gen-msh-horn-clmax" type="number" class="form-input form-input-sm" value="40" min="0.1" step="0.1">
                </label>
                <label class="wg-mesh-field">
                  <span>Curvature</span>
                  <input id="gen-msh-horn-curv" type="number" class="form-input form-input-sm" value="16" min="0" step="1">
                </label>
              </div>
            </div>

            <div class="wg-mesh-row">
              <div class="wg-mesh-row-head">
                <span class="wg-mesh-row-dot"></span>
                <span class="wg-mesh-row-title">Interface</span>
                <label class="switch switch-sm ml-auto" title="Adaptive: finer at throat, coarser toward mouth">
                  <input id="gen-msh-interface-adaptive" type="checkbox"><span class="slider round"></span>
                </label>
              </div>
              <div class="wg-mesh-row-fields">
                <label class="wg-mesh-field">
                  <span>Size (clmax)</span>
                  <input id="gen-msh-interface-clmax" type="number" class="form-input form-input-sm" value="30" min="0.1" step="0.1">
                </label>
                <label class="wg-mesh-field">
                  <span>Curvature</span>
                  <input id="gen-msh-interface-curv" type="number" class="form-input form-input-sm" value="12" min="0" step="1">
                </label>
              </div>
            </div>
            <p class="text-xs text-gray-400 pt-1">Adaptive: finer mesh at throat, coarser toward the mouth.</p>
          </div>
        </div>
      </div>

      <!-- Interface -->
      <div class="control-group">
        <div class="control-label-toggle"><span>Interface</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Show Interface</span>
          <label class="switch"><input type="checkbox" id="gen-mesh-interfaces"><span class="slider round"></span></label>
          <span>Split Horizontal</span>
          <label class="switch"><input type="checkbox" id="gen-mesh-split-h"><span class="slider round"></span></label>
          <span>Split Vertical</span>
          <label class="switch"><input type="checkbox" id="gen-mesh-split-v"><span class="slider round"></span></label>
        </div>
      </div>

    </div> <!-- Fin de la zone de contenu défilable -->

    <!-- === PIED DE PAGE (FIXE) === -->
    <div class="flex-shrink-0 pt-4 space-y-2">
      <button id="gen-reset-btn" class="action-btn bg-black-600 themed-hover-bg h-12 text-lg w-full">Reset</button>
      <button id="gen-generate-btn" class="action-btn bg-green-700 themed-hover-bg h-12 text-lg w-full font-bold">Export to..</button>
    </div>

  </div> <!-- Fin de la colonne de gauche -->

  <!-- ================================================================== -->
  <!-- Colonne droite : Visualisations                                    -->
  <!-- ================================================================== -->
  <div class="flex-grow min-w-0 flex flex-col space-y-3 min-h-0">

    <!-- Barre d'onglets -->
    <div class="flex items-center flex-shrink-0">
      <div class="flex items-center space-x-2 flex-grow">
        <button class="gen-tab-btn action-btn text-sm px-4 py-1.5" data-gen-tab="expansion">Expansion</button>
        <button class="gen-tab-btn action-btn text-sm px-4 py-1.5" data-gen-tab="profile">Profile 2D</button>
        <button class="gen-tab-btn action-btn text-sm px-4 py-1.5" data-gen-tab="view3d">3D</button>
        <button class="gen-tab-btn action-btn text-sm px-4 py-1.5" data-gen-tab="segments">Segments</button>
        <button class="gen-tab-btn action-btn text-sm px-4 py-1.5" data-gen-tab="graph">Graph</button>
      </div>
    </div>

    <!-- Boutons de vue 2D (pour Profile 2D) -->
    <div id="gen-2d-view-btns" class="flex items-center space-x-3 flex-shrink-0">
      <span class="text-xs text-gray-400 mr-2">View:</span>
      <button class="gen-2d-view-btn action-btn text-xs px-3 py-1" data-view="surface">Surface</button>
      <button class="gen-2d-view-btn action-btn text-xs px-3 py-1" data-view="width">Width (H)</button>
      <button class="gen-2d-view-btn action-btn text-xs px-3 py-1" data-view="height">Height (V)</button>
      <span class="mx-2 text-gray-600 hidden">|</span>
      <button id="gen-folding-btn" class="hidden action-btn text-xs px-3 py-1" title="Folding editor (constant height mode only)">Folding 2D</button>
      <button id="gen-folding-reset-btn" class="hidden action-btn text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600" title="Reset folding angles">↺ Reset</button>
    </div>

    <!-- Tab: Expansion Chart -->
    <div id="gen-tab-expansion" class="gen-tab-content flex-grow min-h-0 relative bg-black border border-gray-700 rounded-md p-2 overflow-hidden">
      <canvas id="gen-expansion-chart"></canvas>
    </div>

    <!-- Tab: Profile 2D -->
    <div id="gen-tab-profile" class="gen-tab-content hidden flex-grow min-h-0 flex flex-col hs-2d-container overflow-hidden">
      <canvas id="gen-horn-canvas" class="flex-grow min-h-0" style="display:block;width:100%;"></canvas>
    </div>

    <!-- Tab: Folding 2D -->
    <div id="gen-tab-folding" class="gen-tab-content hidden flex-grow min-h-0 flex flex-col hs-2d-container overflow-hidden">
      <canvas id="gen-folding-canvas" class="flex-grow min-h-0" style="display:block;width:100%;"></canvas>
    </div>

    <!-- Tab: 3D View -->
    <div id="gen-tab-view3d" class="gen-tab-content hidden flex-grow min-h-0 bg-black border border-gray-700 rounded-md overflow-hidden relative">
      <div id="gen-3d-container" style="width:100%;height:100%;"></div>
    </div>

    <!-- Tab: Segments Table -->
    <div id="gen-tab-segments" class="gen-tab-content hidden flex-grow min-h-0 overflow-y-auto">
      <div id="gen-segments-table-container" class="hs-table-wrap"></div>
    </div>

    <!-- Tab: Graph (BEM Solver results) -->
    <div id="gen-tab-graph" class="gen-tab-content hidden flex-grow min-h-0 overflow-hidden">
      <div class="flex items-center justify-end gap-3 mb-2 px-1">
        <span id="gen-solver-sync-status" class="text-xs text-gray-400"></span>
        <label class="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-white">
          <span>SYNC</span>
          <input id="gen-solver-sync" type="checkbox" class="sr-only peer">
          <span class="relative w-11 h-6 bg-gray-700 rounded-full peer-checked:bg-pink-600 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-full"></span>
        </label>
      </div>
      <div class="min-h-0" style="height:calc(100% - 2rem);">
        ${getBemSolverPanelHtml({ embeddedPro: true, graphsOnly: true })}
      </div>
    </div>

  </div> <!-- Fin de la colonne droite -->

  <!-- Bouton Presets (positionné en haut à droite) -->
  <button id="gen-presets-btn" class="wg-preset-toggle-btn" title="Horn Presets">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  </button>

  <!-- Modal Presets (Toast central avec blur) -->
  <div id="gen-presets-modal-overlay" class="wg-presets-modal-overlay hidden">
    <div class="wg-presets-modal">
      <div class="wg-presets-header">
        <div>
          <h2 class="wg-presets-title">Horn Presets</h2>
          <p class="wg-presets-subtitle">Save and load horn configurations</p>
        </div>
        <button id="gen-presets-panel-close" class="wg-presets-close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div id="gen-presets-list" class="wg-presets-list"></div>
      <div class="wg-presets-save-row">
        <input id="gen-preset-name-input" type="text" class="wg-preset-name-input" placeholder="Preset name...">
        <button id="gen-preset-save-btn" class="wg-preset-save-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save
        </button>
      </div>
    </div>
  </div>

  <!-- Modal export -->
  <div id="gen-export-modal-overlay" class="hidden fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
    <div class="bg-gray-900 border themed-border rounded-lg p-8 shadow-2xl w-full max-w-md relative text-white">
      <div class="relative flex items-center justify-center mb-6">
        <button id="gen-export-modal-close-btn" class="absolute left-0 top-1/2 -translate-y-1/2 text-4xl text-gray-400 hover:text-white leading-none p-1">&times;</button>
        <h2 class="text-2xl font-bold text-center">Export Options</h2>
      </div>
      <div class="flex flex-col space-y-4">
        <button id="gen-export-hornscript-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700" data-gen-target="akabak_lem">Akabak LEM</button>
        <button id="gen-export-horn-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700" data-gen-target="horn">Horn Expansion</button>
        <button id="gen-export-bemsolver-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700" data-gen-target="bemsolver">BEM Solver</button>

        <div class="border themed-border rounded-lg overflow-hidden">
          <button id="gen-msh-toggle-btn" class="w-full h-12 text-lg font-semibold text-white flex items-center justify-center gap-2 cursor-pointer bg-cyan-600 hover:bg-cyan-700">
            Export MSH
            <svg class="w-4 h-4 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div id="gen-msh-sub-panel" class="hidden flex flex-col space-y-3 p-3 bg-gray-800">
            <p class="text-xs text-gray-400">Uses the Delaunay mesh sizes from the Mesh Settings panel (Source / Horn / Interface).</p>
            <button id="gen-export-msh-btn" class="action-btn h-10 text-sm bg-cyan-500 hover:bg-cyan-600" data-gen-target="msh">Export .MSH</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="wave-select-modal-overlay" class="hidden fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
    <div class="bg-gray-900 border themed-border rounded-lg p-6 shadow-2xl w-80 relative text-white">
      <h2 class="text-xl font-bold mb-4 text-center">Export to Akabak LEM</h2>
      <p class="text-gray-300 text-sm mb-4 text-center">Select the wave to export the segments to</p>
      <div class="grid grid-cols-2 gap-2 mb-2">
        <button id="wave-select-front-btn" class="action-btn bg-green-700">Front Wave</button>
        <button id="wave-select-back-btn" class="action-btn bg-green-700">Back Wave</button>
      </div>
      <button id="wave-select-cancel-btn" class="action-btn w-full bg-gray-700">Cancel</button>
    </div>
  </div>

</div>
    `;
}
