// ====================================================================================================
// FICHIER :  src/js/panels/waveguidestudio/uiTemplates.js
// RÔLE :     Génération des templates HTML pour le panneau waveguide.
// ====================================================================================================

import * as Formulas from './Formulas.js';

function getParamsHtml(segmentIndex, arrowSVG) {
    return `
        <div id="wg-os-se-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span>OS-SE Parameters (Seg. ${segmentIndex})</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>k:</span><input id="wg-os-se-k-${segmentIndex}" type="text" class="form-input form-input-sm" value="1"><span>α (°):</span><input id="wg-os-se-a-${segmentIndex}" type="text" class="form-input form-input-sm" value="30"><span>s:</span><input id="wg-os-se-s-${segmentIndex}" type="text" class="form-input form-input-sm" value="0.5"><span>q:</span><input id="wg-os-se-q-${segmentIndex}" type="text" class="form-input form-input-sm" value="0.996"><span>n:</span><input id="wg-os-se-n-${segmentIndex}" type="text" class="form-input form-input-sm" value="5"></div></div>
        <div id="wg-os-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span>OS Parameters (Seg. ${segmentIndex})</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>Theta (°)</span><input id="wg-os-theta-${segmentIndex}" type="text" class="form-input form-input-sm" value="45"></div></div>
        <div id="wg-conical-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span>Conical Parameters (Seg. ${segmentIndex})</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>Theta (°)</span><input id="wg-conical-theta-${segmentIndex}" type="text" class="form-input form-input-sm" value="15"></div></div>
        <div id="wg-exponential-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span>Exponential Parameters (Seg. ${segmentIndex})</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>Fc (Hz)</span><input id="wg-exponential-fc-${segmentIndex}" type="text" class="form-input form-input-sm" value="400"></div></div>
        <div id="wg-parabolic-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span>Parabolic Parameters (Seg. ${segmentIndex})</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>Fc (Hz)</span><input id="wg-parabolic-fc-${segmentIndex}" type="text" class="form-input form-input-sm" value="400"></div></div>
        <div id="wg-hypex-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span>Hypex Parameters (Seg. ${segmentIndex})</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>Fc (Hz)</span><input id="wg-hypex-fc-${segmentIndex}" type="text" class="form-input form-input-sm" value="400"><span>Flare (T)</span><input id="wg-hypex-t-${segmentIndex}" type="text" class="form-input form-input-sm" value="1.0"></div></div>
    `;
}

export function getWaveguidePanelHtml() {
    const expansionOptionsHtml = Object.keys(Formulas.expansionLaws)
        .map(key => `<option value="${key}">${key}</option>`)
        .join('');
    const arrowSVG = `<svg class="w-4 h-4 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;

    return `
<div class="p-6 text-green-400 h-full min-h-0 flex flex-row space-x-6 overflow-x-hidden">

  <!-- ================================================================== -->
  <!-- Colonne gauche : Panneaux de contrôle (Structure corrigée)       -->
  <!-- ================================================================== -->
  <div id="controls-panel" class="w-96 flex-shrink-0 flex flex-col h-full">

    <!-- === EN-TÊTE (FIXE) === -->
    <div class="flex-shrink-0">
      <h1 class="text-4xl font-bold text-white">Waveguide Studio</h1>
      <div id="wg-error-container" class="mt-4 p-3 bg-red-800 border border-red-600 text-white rounded-md hidden"></div>
    </div>

    <!-- === ZONE DE CONTENU (DÉFILABLE) === -->
    <div class="flex-grow min-h-0 overflow-y-auto py-4 pr-2 space-y-4">

      <div class="control-group">
        <div class="control-label-toggle"><span>Main Settings</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Segment Count</span>
          <select id="wg-segment-count" class="graph-expansion-select">
            <option value="1">1</option><option value="2">2</option>
          </select>
          <div id="wg-segment-1-law-container" class="contents">
            <span>Expansion Law</span>
            <select id="wg-expansion-law-1" class="graph-expansion-select">${expansionOptionsHtml}</select>
            <span>Length (mm)</span>
            <input id="wg-length-1" type="text" class="form-input form-input-sm" value="170">
          </div>
          <div id="wg-segment-2-laws-container" class="hidden contents">
            <span>Law Seg. 1</span>
            <select id="wg-expansion-law-2-1" class="graph-expansion-select">${expansionOptionsHtml}</select>
            <span>Law Seg. 2</span>
            <select id="wg-expansion-law-2-2" class="graph-expansion-select">${expansionOptionsHtml}</select>
            <span>Length Seg. 1</span>
            <input id="wg-length-2-1" type="text" class="form-input form-input-sm" value="50">
            <span>Length Seg. 2</span>
            <input id="wg-length-2-2" type="text" class="form-input form-input-sm" value="50">
          </div>
        </div>
      </div>

      <div class="control-group">
  <div class="control-label-toggle"><span>Geometry</span>${arrowSVG}</div>
  <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">

    <!-- THROAT SHAPE -->
    <span>Throat Shape</span>
    <select id="wg-input-shape" class="graph-expansion-select">
      <option value="circle" selected>Circle</option>
      <option value="rectangle">Rectangle</option>
    </select>

    <!-- CIRCLE INPUT -->
    <div id="wg-input-circle-container" class="contents col-span-2 grid grid-cols-2 gap-x-4">
      <span>Throat Ø (mm)</span>
      <input id="wg-d-in-circle" type="text" class="form-input form-input-sm" value="25.4">
    </div>

    <!-- RECTANGLE INPUT (masqué tant que 'Rectangle' n'est pas sélectionné) -->
    <div id="wg-input-rect-container" class="hidden contents col-span-2 grid grid-cols-2 gap-x-4">
      <span>Throat Width (mm)</span>
      <input id="wg-d-in-rect-w" type="text" class="form-input form-input-sm" value="80">
      <span>Throat Height (mm)</span>
      <input id="wg-d-in-rect-h" type="text" class="form-input form-input-sm" value="60">
    </div>

    <!-- SHAPE CONTROL (inchangé) -->
    <span>Shape Control</span>
    <label class="switch"><input type="checkbox" id="wg-shape-switch"><span class="slider round"></span></label>
    <div id="wg-shape-params-container" class="hidden contents"></div>

    <!-- MOUTH SHAPE (inchangé) -->
    <span>Mouth Shape</span>
    <select id="wg-output-shape" class="graph-expansion-select">
      <option value="circle">Circle</option>
      <option value="rectangle">Rectangle</option>
      <option value="rounded_rectangle">Rounded Rectangle</option>
    </select>

    <!-- MOUTH: circle -->
    <div id="wg-output-circle-container" class="contents col-span-2 grid grid-cols-2 gap-x-4">
      <span>Mouth Ø (mm)</span>
      <input id="wg-d-out-circle" type="text" class="form-input form-input-sm bg-gray-800" value="150" disabled>
    </div>

    <!-- MOUTH: rectangle -->
    <div id="wg-output-rect-container" class="hidden contents col-span-2 grid grid-cols-2 gap-x-4">
      <span>Target Width (mm)</span><input id="wg-d-out-rect-w" type="text" class="form-input form-input-sm" value="180">
      <span>Target Height (mm)</span><input id="wg-d-out-rect-h" type="text" class="form-input form-input-sm" value="120">
      <span class="text-gray-400">Calc. Width</span><input id="wg-w-out-calc" type="text" class="form-input form-input-sm bg-gray-800" disabled>
      <span class="text-gray-400">Calc. Height</span><input id="wg-h-out-calc" type="text" class="form-input form-input-sm bg-gray-800" disabled>
    </div>

    <!-- MOUTH: rounded rectangle -->
    <div id="wg-output-rounded-rect-container" class="hidden contents col-span-2 grid grid-cols-2 gap-x-4">
      <span>Target Width (mm)</span><input id="wg-d-out-rounded-rect-w" type="text" class="form-input form-input-sm" value="180">
      <span>Target Height (mm)</span><input id="wg-d-out-rounded-rect-h" type="text" class="form-input form-input-sm" value="120">
      <span>Radius (factor)</span><input id="wg-d-out-rounded-rect-r" type="text" class="form-input form-input-sm" value="0">
      <span class="text-gray-400">Calc. Width</span><input id="wg-w-out-calc-rounded" type="text" class="form-input form-input-sm bg-gray-800" disabled>
      <span class="text-gray-400">Calc. Height</span><input id="wg-h-out-calc-rounded" type="text" class="form-input form-input-sm bg-gray-800" disabled>
    </div>
  </div>
</div>


      <div id="superformula-group" class="control-group">
        <div class="control-label-toggle"><span>Shape-Superformula</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-1 gap-y-3 overflow-hidden">
          <div class="grid grid-cols-3 gap-x-4 gap-y-2">
            <div class="grid grid-cols-[auto,1fr] items-center gap-x-2"><span class="justify-self-end">m:</span><input id="sf-m" type="text" class="form-input form-input-sm" value="4"></div>
            <div class="grid grid-cols-[auto,1fr] items-center gap-x-2"><span class="justify-self-end">a:</span><input id="sf-a" type="text" class="form-input form-input-sm" value="1"></div>
            <div class="grid grid-cols-[auto,1fr] items-center gap-x-2"><span class="justify-self-end">b:</span><input id="sf-b" type="text" class="form-input form-input-sm" value="1"></div>
            <div class="grid grid-cols-[auto,1fr] items-center gap-x-2"><span class="justify-self-end">n1:</span><input id="sf-n1" type="text" class="form-input form-input-sm" value="0.8"></div>
            <div class="grid grid-cols-[auto,1fr] items-center gap-x-2"><span class="justify-self-end">n2:</span><input id="sf-n2" type="text" class="form-input form-input-sm" value="8"></div>
            <div class="grid grid-cols-[auto,1fr] items-center gap-x-2"><span class="justify-self-end">n3:</span><input id="sf-n3" type="text" class="form-input form-input-sm" value="2"></div>
          </div>
          <div class="grid grid-cols-2 items-center gap-x-4 pt-2">
            <span>Amplitude (%)</span><input id="sf-amplitude" type="text" class="form-input form-input-sm" value="30">
            <span>Shape Length (mm)</span><input id="wg-shape-length" type="text" class="form-input form-input-sm" value="169">
          </div>
        </div>
      </div>

      <div id="wg-segment-1-params-wrapper">${getParamsHtml(1, arrowSVG)}</div>
      <div id="wg-segment-2-params-wrapper" class="hidden">${getParamsHtml(2, arrowSVG)}</div>

      <div class="control-group">
        <div class="control-label-toggle"><span>Mesh Settings</span>${arrowSVG}</div>
        <div class="overflow-hidden">
          <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3">
            <span>Angular Points</span><input id="wg-lines" type="text" class="form-input form-input-sm" value="100">
            <span>Axial Points</span><input id="wg-points" type="text" class="form-input form-input-sm" value="100">
            <span>Source Angular Pts</span><input id="wg-source-angular-points" type="text" class="form-input form-input-sm" value="100">
            <span>Source Axial Pts</span><input id="wg-source-axial-points" type="text" class="form-input form-input-sm" value="5">
            <span>Interface Angular Pts</span><input id="wg-interface-angular-points" type="text" class="form-input form-input-sm" value="100">
            <span>Interface Axial Pts</span><input id="wg-interface-axial-points" type="text" class="form-input form-input-sm" value="10">
            <span>Throat Density</span><input id="wg-throat-mesh-factor" type="text" class="form-input form-input-sm" value="0">
            <span>Mouth Density</span><input id="wg-mouth-mesh-factor" type="text" class="form-input form-input-sm" value="0">
          </div>
          <div class="px-4 pb-4 grid grid-cols-2 gap-x-4">
            <div class="flex flex-col items-center justify-center py-2">
              <span class="text-sm mb-2">Points</span>
              <label class="switch"><input type="checkbox" id="wg-show-points"><span class="slider round"></span></label>
            </div>
            <div class="flex flex-col items-center justify-center py-2">
              <span class="text-sm mb-2">Surface</span>
              <label class="switch"><input type="checkbox" id="wg-show-surface" checked><span class="slider round"></span></label>
            </div>
          </div>
        </div>
      </div>

      <div class="control-group">
        <div class="control-label-toggle"><span>Interface</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Show Interface</span><label class="switch"><input type="checkbox" id="wg-build-interface"><span class="slider round"></span></label>
          <span>Z Offset (mm)</span><input id="interface-tip-offset" type="text" class="form-input form-input-sm" value="30">
          <span>Radius (mm)</span><input id="interface-bulge-radius" type="text" class="form-input form-input-sm" value="0">
          <span>Z Bulge (mm)</span><input id="interface-bulge-z" type="text" class="form-input form-input-sm" value="10">
          <span>Split Horizontal</span><label class="switch"><input type="checkbox" id="wg-split-horizontal"><span class="slider round"></span></label>
          <span>Split Vertical</span><label class="switch"><input type="checkbox" id="wg-split-vertical"><span class="slider round"></span></label>
        </div>
      </div>

    </div> <!-- Fin de la zone de contenu défilable -->

    <!-- === PIED DE PAGE (FIXE) === -->
    <div class="flex-shrink-0 pt-4 space-y-2">
      <button id="wg-reset-btn" class="action-btn bg-black-600 themed-hover-bg h-12 text-lg w-full">Reset</button>
      <button id="wg-export-btn" class="action-btn bg-black-600 themed-hover-bg h-12 text-lg w-full" disabled>Export to</button>
    </div>

  </div> <!-- Fin de la colonne de gauche -->

  <!-- ================================================================== -->
  <!-- Colonne droite : Vues 2D et 3D (inchangée)                       -->
  <!-- ================================================================== -->
  <div id="visualization-panel" class="flex-grow min-w-0 flex flex-col space-y-4 min-h-0">
    <div id="wg-2d-viewer-container" class="flex-grow bg-black border border-gray-700 rounded-md relative p-2 min-h-0">
      <span class="viewer-label">Shape view</span>
      <canvas id="wg-2d-chart"></canvas>
    </div>
    <div id="wg-preview-container" class="flex-grow bg-black border border-gray-700 rounded-md relative min-h-0">
      <span class="viewer-label">3D View</span>
    </div>
  </div>

  <!-- Modal export (inchangé) -->
  <div id="wg-export-modal-overlay" class="hidden fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
    <div class="bg-gray-900 border themed-border rounded-lg p-8 shadow-2xl w-full max-w-md relative text-white">
      <div class="relative flex items-center justify-center mb-6">
        <button id="wg-export-modal-close-btn" class="absolute left-0 top-1/2 -translate-y-1/2 text-4xl text-gray-400 hover:text-white leading-none p-1">&times;</button>
        <h2 class="text-2xl font-bold text-center">Export Options</h2>
      </div>
      <div class="flex flex-col space-y-4">
        <button id="wg-export-stl-modal-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700">Export as .STL</button>
        <button id="wg-export-csv-full-modal-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700">Export All Points (.CSV)</button>
        <button id="wg-export-csv-profile-modal-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700">Export Profiles & Outlines (.CSV)</button>
        <button id="wg-export-msh-modal-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700">Export as .MSH (Simulation)</button>
      </div>
    </div>
  </div>

</div>`;
}
