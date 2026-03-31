// ====================================================================================================
// FICHIER :  src/js/panels/hornstudio/uiTemplates.js
// RÔLE :     Génération du template HTML du panneau Horn Studio (style Waveguide Studio).
// ====================================================================================================

export function getHornStudioPanelHtml() {
    const arrowSVG = `<svg class="w-4 h-4 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;

    return `
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

      <!-- Driver Selection -->
      <div class="control-group" id="gen-driver-group">
        <div class="control-label-toggle"><span>Driver</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-1 gap-y-3 overflow-hidden">
          <input type="search" id="gen-driver-search" placeholder="Search for a driver..." class="form-input w-full">
          <div id="gen-driver-list" class="bg-gray-900 border themed-border rounded-md max-h-48 overflow-y-auto hidden"></div>
          <button id="gen-driver-toggle" class="action-btn w-full whitespace-nowrap overflow-hidden text-ellipsis">[ None ]</button>
          <div id="gen-driver-info" class="text-xs text-gray-400 hidden"></div>
        </div>
      </div>

      <!-- Expansion Law -->
      <div class="control-group">
        <div class="control-label-toggle"><span>Expansion Law</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Type</span>
          <select id="gen-expansion-type" class="form-input form-input-sm">
            <option>Conical</option><option selected>Exponential</option><option>Parabolic</option><option>Hypex</option>
          </select>
          <div id="gen-expansion-params" class="contents"></div>
        </div>
      </div>

      <!-- Horn Type -->
      <div class="control-group">
        <div class="control-label-toggle"><span>Horn Type</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Mode</span>
          <select id="gen-horn-type" class="form-input form-input-sm">
            <option value="hv" selected>Expansion H + V</option>
            <option value="constantH">Constant Height</option>
          </select>
          <div id="gen-hv-fields" class="contents">
            <span>H Coverage (°)</span>
            <input type="text" id="gen-directivity-h" value="90" class="form-input form-input-sm">
            <span>V Coverage (°)</span>
            <input type="text" id="gen-directivity-v" value="40" class="form-input form-input-sm">
          </div>
          <div id="gen-constant-height-field" class="hidden contents">
            <span>Fixed Height (mm)</span>
            <input type="text" id="gen-constant-height-value" value="200" class="form-input form-input-sm">
          </div>
          <input type="checkbox" id="gen-constant-height" class="hidden">
        </div>
      </div>

      <!-- Throat Geometry -->
      <div class="control-group">
        <div class="control-label-toggle"><span>Throat</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Shape</span>
          <select id="gen-throat-shape" class="form-input form-input-sm">
            <option value="rectangular" selected>Rectangular</option>
            <option value="circular">Circular</option>
            <option value="surface">Surface</option>
          </select>
          <div id="gen-throat-fields" class="contents">
            <span>Width (mm)</span>
            <input type="text" id="gen-throat-width" value="100" class="form-input form-input-sm">
            <span>Height (mm)</span>
            <input type="text" id="gen-throat-height" value="56" class="form-input form-input-sm">
          </div>
          <div id="gen-throat-circular" class="hidden contents">
            <span>Diameter (mm)</span>
            <input type="text" id="gen-throat-diameter" value="84" class="form-input form-input-sm">
          </div>
          <div id="gen-throat-surface" class="hidden contents">
            <span>Area (mm²)</span>
            <input type="text" id="gen-throat-area" value="5600" class="form-input form-input-sm">
          </div>
        </div>
      </div>

      <!-- Mouth Geometry -->
      <div id="gen-mouth-section" class="control-group">
        <div class="control-label-toggle"><span>Mouth</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Shape</span>
          <select id="gen-mouth-shape" class="form-input form-input-sm">
            <option value="rectangular" selected>Rectangular</option>
            <option value="circular">Circular</option>
            <option value="surface">Surface</option>
          </select>
          <div id="gen-mouth-fields" class="contents">
            <span>Width (mm)</span>
            <input type="text" id="gen-mouth-width" value="400" class="form-input form-input-sm">
            <span>Height (mm)</span>
            <input type="text" id="gen-mouth-height" value="226" class="form-input form-input-sm">
          </div>
          <div id="gen-mouth-circular" class="hidden contents">
            <span>Diameter (mm)</span>
            <input type="text" id="gen-mouth-diameter" value="340" class="form-input form-input-sm">
          </div>
          <div id="gen-mouth-surface" class="hidden contents">
            <span>Area (mm²)</span>
            <input type="text" id="gen-mouth-area" value="90400" class="form-input form-input-sm">
          </div>
        </div>
      </div>

      <!-- Generation Settings -->
      <div class="control-group">
        <div class="control-label-toggle"><span>Generation</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Length (mm)</span>
          <input type="text" id="gen-horn-length" value="500" class="form-input form-input-sm">
          <span>Fc (Hz)</span>
          <input type="text" id="gen-fc" value="" class="form-input form-input-sm" placeholder="Auto">
          <span>Segments</span>
          <input type="number" id="gen-segment-count" value="6" min="2" max="20" class="form-input form-input-sm">
        </div>
      </div>

      <!-- Mesh Settings -->
      <div class="control-group">
        <div class="control-label-toggle"><span>Mesh Settings</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Angular Points</span>
          <input type="number" id="gen-mesh-angular" value="24" min="4" max="200" class="form-input form-input-sm">
          <span>Axial Points / seg</span>
          <input type="number" id="gen-mesh-axial" value="4" min="1" max="50" class="form-input form-input-sm">
          <span>Baffle Mesh Pts</span>
          <input type="number" id="gen-mesh-baffle" value="6" min="2" max="30" class="form-input form-input-sm">
          <span>Wood Thickness (mm)</span>
          <input type="number" id="gen-mesh-wood-thick" value="18" min="3" max="50" class="form-input form-input-sm">
          <span>Interface Mesh Pts</span>
          <input type="number" id="gen-mesh-itf" value="4" min="1" max="20" class="form-input form-input-sm">
          <span>Show Interfaces</span>
          <label class="switch"><input type="checkbox" id="gen-mesh-interfaces" checked><span class="slider round"></span></label>
          <span>Split H</span>
          <label class="switch"><input type="checkbox" id="gen-mesh-split-h"><span class="slider round"></span></label>
          <span>Split V</span>
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
    <div id="gen-tab-profile" class="gen-tab-content hidden flex-grow min-h-0 flex flex-col bg-black border border-gray-700 rounded-md overflow-hidden">
      <canvas id="gen-horn-canvas" class="flex-grow min-h-0" style="display:block;width:100%;"></canvas>
    </div>

    <!-- Tab: Folding 2D -->
    <div id="gen-tab-folding" class="gen-tab-content hidden flex-grow min-h-0 flex flex-col bg-black border border-gray-700 rounded-md overflow-hidden">
      <canvas id="gen-folding-canvas" class="flex-grow min-h-0" style="display:block;width:100%;"></canvas>
    </div>

    <!-- Tab: 3D View -->
    <div id="gen-tab-view3d" class="gen-tab-content hidden flex-grow min-h-0 bg-black border border-gray-700 rounded-md overflow-hidden relative">
      <div id="gen-3d-container" style="width:100%;height:100%;"></div>
    </div>

    <!-- Tab: Segments Table -->
    <div id="gen-tab-segments" class="gen-tab-content hidden flex-grow min-h-0 overflow-y-auto bg-black border border-gray-700 rounded-md">
      <table class="w-full text-sm border-separate border-spacing-0">
        <thead class="sticky top-0 bg-black z-10">
          <tr class="text-white text-xs">
            <th class="w-8 px-2 py-2">#</th>
            <th class="px-2 py-2">Width</th>
            <th class="px-2 py-2">Height</th>
            <th class="px-2 py-2">Length</th>
            <th class="w-8 px-2 py-2"><svg class="w-3.5 h-3.5 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></th>
            <th class="px-2 py-2">Area</th>
          </tr>
        </thead>
        <tbody id="gen-segments-table-body"></tbody>
      </table>
    </div>

  </div> <!-- Fin de la colonne droite -->

  <!-- Modal export -->
  <div id="gen-export-modal-overlay" class="hidden fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
    <div class="bg-gray-900 border themed-border rounded-lg p-8 shadow-2xl w-full max-w-md relative text-white">
      <div class="relative flex items-center justify-center mb-6">
        <button id="gen-export-modal-close-btn" class="absolute left-0 top-1/2 -translate-y-1/2 text-4xl text-gray-400 hover:text-white leading-none p-1">&times;</button>
        <h2 class="text-2xl font-bold text-center">Export Options</h2>
      </div>
      <div class="flex flex-col space-y-4">
        <button id="gen-export-hornscript-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700" data-gen-target="hornscript">Horn-Script LEM</button>
        <button id="gen-export-horn-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700" data-gen-target="horn">Horn Expansion</button>
        <button id="gen-export-directivity-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700" data-gen-target="directivity">Directivity</button>
        <button id="gen-export-msh-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700" data-gen-target="msh">Export as .MSH (Simulation)</button>
      </div>
    </div>
  </div>

</div>
    `;
}
