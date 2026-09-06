// ====================================================================================================
// FICHIER :  src/js/panels/waveguidestudio/uiTemplates.js
// RÔLE :     Génération des templates HTML pour le panneau waveguide.
// ====================================================================================================

import * as Formulas from './Formulas.js';
import { getBemSolverPanelHtml } from '../bemsolver/bemSolver.js';

function getParamsHtml(segmentIndex, arrowSVG) {
    return `
        <div id="wg-os-se-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span id="wg-os-se-title-${segmentIndex}">OS-SE Parameters</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>k:</span><input id="wg-os-se-k-${segmentIndex}" type="text" class="form-input form-input-sm" value="1"><span>α (°):</span><input id="wg-os-se-a-${segmentIndex}" type="text" class="form-input form-input-sm" value="30"><span>s:</span><input id="wg-os-se-s-${segmentIndex}" type="text" class="form-input form-input-sm" value="0.5"><span>q:</span><input id="wg-os-se-q-${segmentIndex}" type="text" class="form-input form-input-sm" value="0.996"><span>n:</span><input id="wg-os-se-n-${segmentIndex}" type="text" class="form-input form-input-sm" value="5"></div></div>
        <div id="wg-os-se-v-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span>OS-SE Flare V</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>k:</span><input id="wg-os-se-k-v-${segmentIndex}" type="text" class="form-input form-input-sm" value="1"><span>α (°):</span><input id="wg-os-se-a-v-${segmentIndex}" type="text" class="form-input form-input-sm" value="30"><span>s:</span><input id="wg-os-se-s-v-${segmentIndex}" type="text" class="form-input form-input-sm" value="0.5"><span>q:</span><input id="wg-os-se-q-v-${segmentIndex}" type="text" class="form-input form-input-sm" value="0.996"><span>n:</span><input id="wg-os-se-n-v-${segmentIndex}" type="text" class="form-input form-input-sm" value="5"></div></div>
        <div id="wg-os-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span id="wg-os-title-${segmentIndex}">OS Parameters</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>Theta (°)</span><input id="wg-os-theta-${segmentIndex}" type="text" class="form-input form-input-sm" value="45"></div></div>
        <div id="wg-os-v-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span>OS Flare V</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>Theta (°)</span><input id="wg-os-theta-v-${segmentIndex}" type="text" class="form-input form-input-sm" value="45"></div></div>
        <div id="wg-hypex-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span id="wg-hypex-title-${segmentIndex}">Hypex Parameters</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>Fc (Hz)</span><input id="wg-hypex-fc-${segmentIndex}" type="text" class="form-input form-input-sm" value="400"><span>Flare (T)</span><input id="wg-hypex-t-${segmentIndex}" type="text" class="form-input form-input-sm" value="1.0"></div></div>
        <div id="wg-hypex-v-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span>Hypex Flare V</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>Fc (Hz)</span><input id="wg-hypex-fc-v-${segmentIndex}" type="text" class="form-input form-input-sm" value="400"><span>Flare (T)</span><input id="wg-hypex-t-v-${segmentIndex}" type="text" class="form-input form-input-sm" value="1.0"></div></div>
        <div id="wg-bessel-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span id="wg-bessel-title-${segmentIndex}">Bessel Parameters</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>Fc (Hz)</span><input id="wg-bessel-fc-${segmentIndex}" type="text" class="form-input form-input-sm" value="400"><span>b (exponent)</span><input id="wg-bessel-b-${segmentIndex}" type="text" class="form-input form-input-sm" value="1.0"></div></div>
        <div id="wg-bessel-v-params-container-${segmentIndex}" class="control-group hidden"><div class="control-label-toggle"><span>Bessel Flare V</span>${arrowSVG}</div><div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden"><span>Fc (Hz)</span><input id="wg-bessel-fc-v-${segmentIndex}" type="text" class="form-input form-input-sm" value="400"><span>b (exponent)</span><input id="wg-bessel-b-v-${segmentIndex}" type="text" class="form-input form-input-sm" value="1.0"></div></div>
    `;
}

export function getWaveguidePanelHtml() {
    const allowedLaws = ['OS-SE', 'OS', 'Hypex', 'Bessel'];
    const expansionOptionsHtml = Object.keys(Formulas.expansionLaws)
        .filter(key => allowedLaws.includes(key))
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

      <!-- ============================================================== -->
      <!-- Main Settings — TOUJOURS visible : c'est ici que se trouve le   -->
      <!-- sélecteur Waveguide Type. Seul son contenu bascule entre les    -->
      <!-- réglages Horn et les réglages DOSC.                             -->
      <!-- ============================================================== -->
      <div class="control-group">
        <div class="control-label-toggle"><span>Main Settings</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">

          <span>Waveguide Type</span>
          <select id="wg-waveguide-type" class="graph-expansion-select" title="Horn = classic expansion-law waveguide. Dosc = isophase circular-to-slot diffuser (US 5,163,167).">
            <option value="horn" selected>Horn</option>
            <option value="dosc">Dosc</option>
          </select>

          <!-- ---- Réglages Horn (masqués en mode Dosc) ---- -->
          <div id="wg-horn-main-settings" class="contents col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 items-center">
            <span>Flare</span>
            <select id="wg-flare-mode" class="graph-expansion-select">
              <option value="isotrope">Isotrope</option>
              <option value="anisotrope">Anisotrope</option>
            </select>
            <span>Expansion Law</span>
            <select id="wg-expansion-law-1" class="graph-expansion-select">${expansionOptionsHtml}</select>
            <span>Length (mm)</span>
            <input id="wg-length-1" type="text" class="form-input form-input-sm" value="170">
            <span>Throat Angle (°)</span>
            <div class="flex items-center gap-1">
              <input id="wg-throat-angle" type="text" class="form-input form-input-sm flex-grow min-w-0" value="0">
              <select id="wg-throat-angle-mode" class="graph-expansion-select" style="flex:0 0 auto; width:auto; padding-left:6px; padding-right:6px;" title="Half = angle from axis (Hornresp/ATH4 convention). Full = angle measured between the two opposite walls in CAD.">
                <option value="half" selected>Half</option>
                <option value="full">Full</option>
              </select>
            </div>
            <span>Throat Adapter</span>
            <label class="switch"><input type="checkbox" id="wg-adapter-switch"><span class="slider round"></span></label>
            <span>Radial</span>
            <label class="switch"><input type="checkbox" id="wg-radial-switch"><span class="slider round"></span></label>
            <span>Arced Horn</span>
            <label class="switch"><input type="checkbox" id="wg-arced-horn-switch"><span class="slider round"></span></label>
          </div>

          <!-- ---- Réglages DOSC (US 5,163,167) ---- -->
          <!-- La géométrie découle entièrement de ces 4 cotes : le demi-angle
               des nappes vaut alpha = atan((mouthHeight - throatDiameter)/(2*depth)),
               et tout le reste (cône, biseaux, arête de fuite) en découle.
               Edge Fillet R remplace les arêtes vives du brevet par un congé. -->
          <div id="wg-dosc-main-settings" class="hidden contents col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 items-center">
            <span>Throat Ø (mm)</span>
            <input id="wg-dosc-throat-d" type="text" class="form-input form-input-sm" value="35">
            <span>Mouth Height (mm)</span>
            <input id="wg-dosc-mouth-h" type="text" class="form-input form-input-sm" value="220">
            <span>Mouth Width (mm)</span>
            <input id="wg-dosc-mouth-w" type="text" class="form-input form-input-sm" value="30">
            <span>Depth (mm)</span>
            <input id="wg-dosc-depth" type="text" class="form-input form-input-sm" value="244">
            <span title="Radius of the fillet replacing the sharp cone/bevel fold. 0 = sharp edges as drawn in the patent figures.">Edge Fillet R (mm)</span>
            <input id="wg-dosc-fillet-r" type="text" class="form-input form-input-sm" value="3">
            <span title="Height of the internal prism, i.e. the slope of its cone. 0% = patent geometry. +100% = the prism grows until only the minimum passage gap is left, pushing the slot toward the top and bottom. -100% = the prism is no taller than the throat diameter. On its own this does NOT curve the wavefront: what curves it is the DIFFERENCE between this and Prism Width.">Prism Height (%)</span>
            <input id="wg-dosc-prism-height" type="text" class="form-input form-input-sm" value="0">
            <span title="Width of the internal diamond, i.e. the slope of its bevel, set independently of the height. 0% = patent geometry (same slope as the cone, perfectly isophase). NEGATIVE thins the diamond: the centre leads the edges, the exit front becomes convex ')' and vertical directivity WIDENS instead of beaming at HF - this is the useful direction. -100% = a blade of constant thickness, maximum centre advance. POSITIVE fattens it (centre lags), but the range is short since the diamond must stay inside the housing. The resulting centre advance in mm is shown in the diagnostic below.">Prism Width (%)</span>
            <input id="wg-dosc-prism-width" type="text" class="form-input form-input-sm" value="0">
            <span title="Makes the bevel slope INCREASE with height instead of being one flat plane. The path lengthens toward the slot edges, so they lag progressively behind the centre: a genuine phase gradient spread over the full height, rather than a correction concentrated near the centre. Works on its own (no need for Centre Advance) and stacks with it. 0% = flat bevel, unchanged behaviour. 100% = steepest bevel geometry allows before the body touches the housing. Note: with this above 0 the STEP/MSH export falls back to the sampled loft, as the exact B-Rep body is a Y-extruded sketch and cannot carry a height-varying slope.">Wavefront Grade (%)</span>
            <input id="wg-dosc-wavefront-grade" type="text" class="form-input form-input-sm" value="0">
            <div id="wg-dosc-info" class="col-span-2 text-xs text-gray-400 leading-relaxed pt-1" style="font-family: monospace;"></div>
          </div>
        </div>
      </div>

      <!-- Contrôles de profil propres au mode Horn (masqués en mode Dosc) -->
      <div id="wg-default-controls" class="space-y-4">

      <div class="control-group">
  <div class="control-label-toggle"><span>Geometry</span>${arrowSVG}</div>
  <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">

    <!-- Mount point for the Throat Shape block (it is reparented into the
         Throat Adapter panel when the adapter is enabled). -->
    <div id="wg-throat-shape-mount-geometry" class="contents col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 items-center">
      <div id="wg-throat-shape-block" class="contents">
        <!-- THROAT SHAPE -->
        <span>Throat Shape</span>
        <select id="wg-input-shape" class="graph-expansion-select">
          <option value="circle" selected>Circle</option>
          <option value="rectangle">Rectangle</option>
          <option value="rounded_rectangle">Rounded Rectangle</option>
        </select>

        <!-- CIRCLE INPUT -->
        <div id="wg-input-circle-container" class="contents col-span-2 grid grid-cols-2 gap-x-4">
          <span>Throat Ø (mm)</span>
          <input id="wg-d-in-circle" type="text" class="form-input form-input-sm" value="25.4">
        </div>

        <!-- RECTANGLE INPUT -->
        <div id="wg-input-rect-container" class="hidden contents col-span-2 grid grid-cols-2 gap-x-4">
          <span>Throat Width (mm)</span>
          <input id="wg-d-in-rect-w" type="text" class="form-input form-input-sm" value="80">
          <span>Throat Height (mm)</span>
          <input id="wg-d-in-rect-h" type="text" class="form-input form-input-sm" value="60">
        </div>

        <!-- ROUNDED RECTANGLE INPUT -->
        <div id="wg-input-rounded-rect-container" class="hidden contents col-span-2 grid grid-cols-2 gap-x-4">
          <span>Throat Width (mm)</span>
          <input id="wg-d-in-rounded-rect-w" type="text" class="form-input form-input-sm" value="40">
          <span>Throat Height (mm)</span>
          <input id="wg-d-in-rounded-rect-h" type="text" class="form-input form-input-sm" value="25">
          <span>Radius (mm)</span>
          <input id="wg-d-in-rounded-rect-r" type="text" class="form-input form-input-sm" value="10">
        </div>
      </div>
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

      <div id="wg-adapter-panel" class="control-group hidden">
        <div class="control-label-toggle"><span>Throat Adapter</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Length (mm)</span>
          <input id="wg-adapter-length" type="text" class="form-input form-input-sm" value="15">
          <span>Expansion Law</span>
          <select id="wg-adapter-law" class="graph-expansion-select">
            <option value="linear" selected>Linear</option>
            <option value="OS">OS</option>
            <option value="Bessel">Bessel</option>
          </select>
          <span>Theta H (°)</span>
          <input id="wg-adapter-theta-h" type="text" class="form-input form-input-sm" value="15">
          <span>Theta V (°)</span>
          <input id="wg-adapter-theta-v" type="text" class="form-input form-input-sm" value="10">

          <!-- Mount point: the Throat Shape block is reparented HERE when
               the adapter is enabled. Empty by default. -->
          <div id="wg-throat-shape-mount-adapter" class="contents col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 items-center"></div>

          <!-- THROAT MOUTH SHAPE (= shape at the END of the adapter,
               i.e. entry of the main horn) -->
          <span>Throat Mouth Shape</span>
          <select id="wg-adapter-mouth-shape" class="graph-expansion-select">
            <option value="circle" selected>Circle</option>
            <option value="rectangle">Rectangle</option>
            <option value="rounded_rectangle">Rounded Rectangle</option>
          </select>

          <div id="wg-am-circle-container" class="contents col-span-2 grid grid-cols-2 gap-x-4">
            <span>Throat Mouth Ø (mm)</span>
            <input id="wg-d-am-circle" type="text" class="form-input form-input-sm" value="35">
          </div>

          <div id="wg-am-rect-container" class="hidden contents col-span-2 grid grid-cols-2 gap-x-4">
            <span>Width (mm)</span>
            <input id="wg-d-am-rect-w" type="text" class="form-input form-input-sm" value="40">
            <span>Height (mm)</span>
            <input id="wg-d-am-rect-h" type="text" class="form-input form-input-sm" value="25">
          </div>

          <div id="wg-am-rounded-rect-container" class="hidden contents col-span-2 grid grid-cols-2 gap-x-4">
            <span>Width (mm)</span>
            <input id="wg-d-am-rounded-rect-w" type="text" class="form-input form-input-sm" value="50">
            <span>Height (mm)</span>
            <input id="wg-d-am-rounded-rect-h" type="text" class="form-input form-input-sm" value="30">
            <span>Radius (mm)</span>
            <input id="wg-d-am-rounded-rect-r" type="text" class="form-input form-input-sm" value="8">
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
          <div class="grid grid-cols-2 items-center gap-x-4 pt-2">
            <span title="Rotates the superformula pattern around the axis. Matches ATH4's GCurve.Rot.">Rotation (°)</span><input id="sf-rot" type="text" class="form-input form-input-sm" value="0">
            <span title="Stretches the superformula pattern on the V axis. Matches ATH4's GCurve.AspectRatio.">Aspect Ratio</span><input id="sf-aspect" type="text" class="form-input form-input-sm" value="1">
          </div>
        </div>
      </div>

      <div id="wg-segment-1-params-wrapper">${getParamsHtml(1, arrowSVG)}</div>


      <div id="wg-arced-horn-panel" class="control-group hidden">
        <div class="control-label-toggle"><span>Arced Horn</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span class="font-bold col-span-2">Up-Down</span>
          <span>Angle (°)</span>
          <input id="wg-arced-ud-angle" type="text" class="form-input form-input-sm" value="0">
          <span class="font-bold col-span-2 pt-2">Left-Right</span>
          <span>Angle (°)</span>
          <input id="wg-arced-lr-angle" type="text" class="form-input form-input-sm" value="0">
        </div>
      </div>

      <div id="wg-radial-panel" class="control-group hidden">
        <div class="control-label-toggle"><span>Radial Horn</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span class="font-bold col-span-2">Up-Down</span>
          <span>Type</span>
          <select id="wg-radial-ud-type" class="graph-expansion-select">
            <option value="linear" selected>Linear</option>
            <option value="arced">Arced</option>
          </select>
          <span>Height (mm)</span>
          <input id="wg-radial-ud-height" type="text" class="form-input form-input-sm" value="0">
          <span class="font-bold col-span-2 pt-2">Left-Right</span>
          <span>Type</span>
          <select id="wg-radial-lr-type" class="graph-expansion-select">
            <option value="linear" selected>Linear</option>
            <option value="arced">Arced</option>
          </select>
          <span>Height (mm)</span>
          <input id="wg-radial-lr-height" type="text" class="form-input form-input-sm" value="0">
          <div id="wg-radial-info" class="col-span-2 text-xs text-gray-400 leading-relaxed pt-1" style="font-family: monospace;"></div>
        </div>
      </div>

      </div> <!-- /#wg-default-controls -->

      <!-- Shared controls (Mesh + Interface) — always visible -->

      <div class="control-group">
        <div class="control-label-toggle"><span>Mesh Settings</span>${arrowSVG}</div>
        <div class="overflow-hidden">
          <div class="p-4 space-y-2.5">

            <!-- Source row -->
            <div class="wg-mesh-row">
              <div class="wg-mesh-row-head">
                <span class="wg-mesh-row-dot"></span>
                <span class="wg-mesh-row-title">Source</span>
                <label class="switch switch-sm ml-auto" title="Adaptive: finer at throat, coarser at mouth">
                  <input id="wg-source-adaptive" type="checkbox" checked><span class="slider round"></span>
                </label>
              </div>
              <div class="wg-mesh-row-fields">
                <label class="wg-mesh-field">
                  <span>Size (clmax)</span>
                  <input id="wg-source-clmax" type="number" class="form-input form-input-sm" value="4" min="0.1" step="0.1">
                </label>
                <label class="wg-mesh-field">
                  <span>Curvature</span>
                  <input id="wg-source-curv" type="number" class="form-input form-input-sm" value="12" min="0" step="1">
                </label>
              </div>
            </div>

            <!-- Horn row -->
            <div class="wg-mesh-row">
              <div class="wg-mesh-row-head">
                <span class="wg-mesh-row-dot"></span>
                <span class="wg-mesh-row-title">Horn</span>
                <label class="switch switch-sm ml-auto" title="Adaptive: finer at throat, coarser at mouth">
                  <input id="wg-horn-adaptive" type="checkbox" checked><span class="slider round"></span>
                </label>
              </div>
              <div class="wg-mesh-row-fields">
                <label class="wg-mesh-field">
                  <span>Size (clmax)</span>
                  <input id="wg-horn-clmax" type="number" class="form-input form-input-sm" value="8" min="0.1" step="0.1">
                </label>
                <label class="wg-mesh-field">
                  <span>Curvature</span>
                  <input id="wg-horn-curv" type="number" class="form-input form-input-sm" value="16" min="0" step="1">
                </label>
              </div>
            </div>

            <!-- Interface row -->
            <div class="wg-mesh-row">
              <div class="wg-mesh-row-head">
                <span class="wg-mesh-row-dot"></span>
                <span class="wg-mesh-row-title">Interface</span>
                <label class="switch switch-sm ml-auto" title="Adaptive: finer at throat, coarser at mouth">
                  <input id="wg-interface-adaptive" type="checkbox"><span class="slider round"></span>
                </label>
              </div>
              <div class="wg-mesh-row-fields">
                <label class="wg-mesh-field">
                  <span>Size (clmax)</span>
                  <input id="wg-interface-clmax" type="number" class="form-input form-input-sm" value="8" min="0.1" step="0.1">
                </label>
                <label class="wg-mesh-field">
                  <span>Curvature</span>
                  <input id="wg-interface-curv" type="number" class="form-input form-input-sm" value="12" min="0" step="1">
                </label>
              </div>
            </div>

            <p class="text-xs text-gray-400 pt-1">Adaptive: finer mesh at throat, coarser toward the mouth.</p>
          </div>
          <div class="wg-mesh-vis-row">
            <label class="wg-mesh-vis-toggle">
              <input type="checkbox" id="wg-show-points">
              <span class="wg-mesh-vis-icon">&#8226;</span>
              <span class="wg-mesh-vis-label">Points</span>
            </label>
            <label class="wg-mesh-vis-toggle">
              <input type="checkbox" id="wg-show-mesh">
              <span class="wg-mesh-vis-icon">&#9638;</span>
              <span class="wg-mesh-vis-label">Mesh</span>
            </label>
            <label class="wg-mesh-vis-toggle">
              <input type="checkbox" id="wg-show-surface" checked>
              <span class="wg-mesh-vis-icon">&#9670;</span>
              <span class="wg-mesh-vis-label">Surface</span>
            </label>
          </div>
        </div>
      </div>

      <div class="control-group">
        <div class="control-label-toggle"><span>Interface</span>${arrowSVG}</div>
        <div class="p-4 grid grid-cols-2 items-center gap-x-4 gap-y-3 overflow-hidden">
          <span>Show Interface</span><label class="switch"><input type="checkbox" id="wg-build-interface"><span class="slider round"></span></label>
          <span>Z Offset (mm)</span><input id="interface-tip-offset" type="text" class="form-input form-input-sm" value="5">
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
  <!-- Colonne droite : Vues 2D et 3D                                    -->
  <!-- ================================================================== -->
  <div id="visualization-panel" class="flex-grow min-w-0 flex flex-col min-h-0 relative">
    <div class="flex items-center flex-shrink-0 mb-2">
      <div class="flex items-center space-x-2">
        <button class="wg-tab-btn action-btn text-sm px-4 py-1.5 bg-green-700" data-wg-tab="view3d">3D View</button>
        <button class="wg-tab-btn action-btn text-sm px-4 py-1.5" data-wg-tab="shape">Shape 2D</button>
        <button class="wg-tab-btn action-btn text-sm px-4 py-1.5" data-wg-tab="both">Both</button>
        <button class="wg-tab-btn action-btn text-sm px-4 py-1.5" data-wg-tab="directivity">Graph</button>
      </div>
    </div>
    <div id="wg-tab-view3d" class="wg-tab-content flex-grow bg-black border border-gray-700 rounded-md relative min-h-0">
      <div id="wg-preview-container" style="width:100%;height:100%;"><span class="viewer-label">3D View</span></div>
    </div>
    <div id="wg-tab-shape" class="wg-tab-content hidden flex-grow bg-black border border-gray-700 rounded-md relative p-2 min-h-0">
      <canvas id="wg-2d-chart"></canvas>
    </div>
    <div id="wg-tab-both" class="wg-tab-content hidden flex-grow flex flex-col space-y-2 min-h-0">
      <div id="wg-both-2d" class="bg-black border border-gray-700 rounded-md relative p-2" style="height:35%;min-height:0;flex-shrink:0;"></div>
      <div id="wg-both-3d" class="bg-black border border-gray-700 rounded-md relative" style="flex:1;min-height:0;"></div>
    </div>
    <div id="wg-tab-directivity" class="wg-tab-content hidden flex-grow min-h-0 overflow-hidden">
      <div class="flex items-center justify-end gap-3 mb-2 px-1">
        <span id="wg-solver-sync-status" class="text-xs text-gray-400"></span>
        <label class="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-white">
          <span>SYNC</span>
          <input id="wg-solver-sync" type="checkbox" class="sr-only peer">
          <span class="relative w-11 h-6 bg-gray-700 rounded-full peer-checked:bg-pink-600 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-full"></span>
        </label>
      </div>
      <div class="min-h-0" style="height:calc(100% - 2rem);">
        ${getBemSolverPanelHtml({ embeddedPro: true, graphsOnly: true })}
      </div>
    </div>
  </div>

  <!-- Bouton Presets (positionné en haut à droite, à côté de la croix fermer) -->
  <button id="wg-presets-btn" class="wg-preset-toggle-btn" title="Waveguide Presets">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  </button>

  <!-- Modal Presets (Toast central avec blur) -->
  <div id="wg-presets-modal-overlay" class="wg-presets-modal-overlay hidden">
    <div class="wg-presets-modal">
      <div class="wg-presets-header">
        <div>
          <h2 class="wg-presets-title">Waveguide Presets</h2>
          <p class="wg-presets-subtitle">Save and load waveguide configurations</p>
        </div>
        <button id="wg-presets-panel-close" class="wg-presets-close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div id="wg-presets-list" class="wg-presets-list"></div>
      <div class="wg-presets-save-row">
        <input id="wg-preset-name-input" type="text" class="wg-preset-name-input" placeholder="Preset name...">
        <button id="wg-preset-save-btn" class="wg-preset-save-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save
        </button>
      </div>
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
        <button id="wg-export-stl-modal-btn" class="action-btn h-12 text-lg bg-indigo-600 hover:bg-indigo-700">Export .STL</button>
        <button id="wg-export-solver-modal-btn" class="action-btn h-12 text-lg bg-pink-600 hover:bg-pink-700">Export to Solver</button>
        <button id="wg-export-dxf-modal-btn" class="action-btn h-12 text-lg bg-emerald-600 hover:bg-emerald-700">Export DXF Sections</button>

        <button id="wg-export-step-modal-btn" class="action-btn h-12 text-lg bg-teal-600 hover:bg-teal-700">Export STEP</button>

        <button id="wg-export-msh-modal-btn" class="action-btn h-12 text-lg bg-cyan-600 hover:bg-cyan-700">Export MSH</button>

        <div class="border themed-border rounded-lg overflow-hidden">
          <button id="wg-csv-toggle-btn" class="w-full h-12 text-lg font-semibold text-white flex items-center justify-center gap-2 cursor-pointer themed-bg">
            CSV
            <svg class="w-4 h-4 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div id="wg-csv-sub-panel" class="hidden flex flex-col space-y-2 p-3 bg-gray-800">
            <button id="wg-export-csv-full-modal-btn" class="action-btn h-10 text-sm bg-indigo-500 hover:bg-indigo-600">All Points</button>
            <button id="wg-export-csv-profile-modal-btn" class="action-btn h-10 text-sm bg-indigo-500 hover:bg-indigo-600">Profiles & Outlines</button>
            <button id="wg-export-onshape-modal-btn" class="action-btn h-10 text-sm bg-amber-500 hover:bg-amber-600">Onshape (.CSV)</button>
          </div>
        </div>
      </div>
    </div>
  </div>

</div>`;
}
