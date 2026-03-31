// ====================================================================================================
// FICHIER :  src/js/panels/Akabak_Lem/akabakLem.js
// RÔLE    :  Panneau unifié Akabak LEM — fusionne hornscript + ductscript en un seul panneau
//            avec deux tableaux indépendants (onde avant / onde arrière), segments dynamiques
//            (Duct / Waveguide / Enclosure), copie de formules et génération de fichier LEM.
// ====================================================================================================

import { defaultTemplates } from '../../utils/formulaTemplates.js';
import {
  SEGMENT_TYPES,
  getColumnsForSegment,
  generateSegmentFormula,
  createDefaultSegment,
  calculateVentedFb,
  calculateWaveguideTFactors,
} from './segmentTypes.js';

// ─── HTML DU PANNEAU ───────────────────────────────────────────

export function getAkabakLemPanelHtml() {
  return `
  <div class="p-6 text-green-400 h-full flex flex-col" id="akabak-lem-root">
    <!-- TOP BAR -->
    <div class="flex justify-between items-center mb-4 flex-shrink-0">
      <h1 class="text-4xl font-bold text-white">Akabak LEM</h1>
      <div class="flex items-center space-x-4">
        <button id="lem-unit-switch-btn" class="action-btn w-20">mm</button>
        <div class="relative">
          <input type="search" id="lem-driver-search" placeholder="Search for a driver..." class="form-input w-64">
          <div id="lem-driver-list" class="absolute z-20 w-full bg-gray-900 border themed-border mt-1 rounded-md hidden max-h-60 overflow-y-auto"></div>
        </div>
        <button id="lem-driver-toggle" class="action-btn min-w-32 max-w-xs whitespace-nowrap overflow-hidden text-ellipsis">[ None ]</button>
      </div>
    </div>

    <!-- MAIN CONTENT -->
    <div class="flex-grow flex flex-col overflow-y-auto" style="gap: 24px;">

      <div class="flex flex-row space-x-8 items-start">
        <!-- LEFT: TWO TABLES -->
        <div class="flex-grow flex flex-col" style="gap: 32px; min-width: 0;">

          <!-- FRONT WAVE TABLE -->
          <div class="lem-wave-section" data-wave="front">
            <div class="flex items-center space-x-4 mb-2">
              <h2 class="text-2xl font-bold text-white">Onde Avant</h2>
              <label class="text-sm">Segments:</label>
              <input type="text" class="lem-segment-count form-input form-input-sm w-16" value="1" min="1" max="20">
              <div class="flex items-center">
                <div class="flex flex-col">
                  <button class="lem-insert-before h-4 w-4 flex items-center justify-center text-white hover:bg-green-700" title="Insert before">▲</button>
                  <button class="lem-insert-after h-4 w-4 flex items-center justify-center text-white hover:bg-green-700" title="Insert after">▼</button>
                </div>
                <button class="lem-delete-segment h-8 w-8 ml-2 flex items-center justify-center text-2xl text-white bg-red-700 hover:bg-red-800 rounded" title="Delete segment">×</button>
              </div>
              <button class="lem-clear-wave action-btn bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-3" style="height:36px;">Clear</button>
            </div>
            <div class="lem-table-container overflow-x-auto">
              <table class="w-full text-base" style="border-spacing: 0 0.5rem; border-collapse: separate;">
                <thead class="lem-table-head">
                  <tr class="text-white"></tr>
                </thead>
                <tbody class="lem-table-body"></tbody>
              </table>
            </div>
          </div>

          <!-- BACK WAVE TABLE -->
          <div class="lem-wave-section" data-wave="back">
            <div class="flex items-center space-x-4 mb-2">
              <h2 class="text-2xl font-bold text-white">Onde Arrière</h2>
              <label class="text-sm">Segments:</label>
              <input type="text" class="lem-segment-count form-input form-input-sm w-16" value="1" min="1" max="20">
              <div class="flex items-center">
                <div class="flex flex-col">
                  <button class="lem-insert-before h-4 w-4 flex items-center justify-center text-white hover:bg-green-700" title="Insert before">▲</button>
                  <button class="lem-insert-after h-4 w-4 flex items-center justify-center text-white hover:bg-green-700" title="Insert after">▼</button>
                </div>
                <button class="lem-delete-segment h-8 w-8 ml-2 flex items-center justify-center text-2xl text-white bg-red-700 hover:bg-red-800 rounded" title="Delete segment">×</button>
              </div>
              <button class="lem-clear-wave action-btn bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-3" style="height:36px;">Clear</button>
            </div>
            <div class="lem-table-container overflow-x-auto">
              <table class="w-full text-base" style="border-spacing: 0 0.5rem; border-collapse: separate;">
                <thead class="lem-table-head">
                  <tr class="text-white"></tr>
                </thead>
                <tbody class="lem-table-body"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- RIGHT: SIDEBAR MODULES -->
        <div id="lem-side-modules" style="display:flex; flex-direction:column; gap:20px; padding-top:32px; min-width:320px; flex-shrink:0;">

          <!-- GLOBAL MODULE -->
          <div class="hornscript-module">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
              <button id="lem-global-toggle-btn" class="action-btn" style="flex:1;">Global</button>
            </div>
            <div id="lem-global-inputs" style="display:none; flex-direction:column; gap:12px;">
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <div>
                  <label class="hornscript-label">WOOD_THICK</label>
                  <input id="lem-global-wood-thickness" type="text" class="form-input form-input-sm" style="width:100%;" value="18">
                </div>
                <div>
                  <label class="hornscript-label">DAMPING</label>
                  <input id="lem-global-damping" type="text" class="form-input form-input-sm" style="width:100%;" value="0.1">
                </div>
                <div>
                  <label class="hornscript-label">WOOD</label>
                  <input id="lem-global-wood" type="text" class="form-input form-input-sm" style="width:100%;" value="0.05">
                </div>
                <div>
                  <label class="hornscript-label">WIDTH</label>
                  <input id="lem-global-width" type="text" class="form-input form-input-sm" style="width:100%;" value="">
                </div>
              </div>
              <div>
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                  <label class="hornscript-label" style="margin:0;">HEIGHT</label>
                  <label style="display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer; color:#06b6d4; margin-left:auto;">
                    <input id="lem-constant-height-cb" type="checkbox" style="accent-color:#06b6d4;">
                    Const. Height
                  </label>
                </div>
                <input id="lem-global-height" type="text" class="form-input form-input-sm" style="width:100%;" value="">
              </div>
              <div>
                <label class="hornscript-label">DEPT</label>
                <input id="lem-global-dept" type="text" class="form-input form-input-sm" style="width:100%;" value="">
              </div>
              <div>
                <label class="hornscript-label">Voltage (V)</label>
                <input id="lem-source-voltage" type="text" class="form-input form-input-sm" style="width:100%;" value="2.83">
              </div>
              <button id="lem-copy-global-constants-btn" class="action-btn text-xs" style="margin-top:4px;">Copy Global Constants</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- BOTTOM BAR -->
    <div class="flex justify-between items-end flex-shrink-0 pt-4">
      <div class="flex items-center space-x-4">
        <button id="lem-copy-global-btn" class="action-btn w-48 bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Copy LEM Formula</button>
      </div>
      <div class="flex items-center space-x-4">
        <button id="lem-generate-btn" class="action-btn px-8 font-bold" style="background: #16a34a; border-color: #22c55e; color: white; font-size: 18px;">
          ⬇ Generate LEM File
        </button>
      </div>
    </div>
  </div>
  `;
}

// ─── LOGIQUE D'INITIALISATION ──────────────────────────────────

export function initializeAkabakLemPanel(rootElement) {
  // ── State ──
  let currentUnit = 'mm';
  let allDrivers = [];
  let selectedDriver = null;
  let templates = {};

  const state = {
    front: { segmentCount: 1, segments: [createDefaultSegment('duct')], focusedIndex: -1 },
    back:  { segmentCount: 1, segments: [createDefaultSegment('enclosure')], focusedIndex: -1 },
  };

  // Fill segments arrays to max 20
  for (let i = state.front.segments.length; i < 20; i++) state.front.segments.push(createDefaultSegment('duct'));
  for (let i = state.back.segments.length; i < 20; i++) state.back.segments.push(createDefaultSegment('enclosure'));

  // ── DOM refs ──
  const driverSearch = rootElement.querySelector('#lem-driver-search');
  const driverList = rootElement.querySelector('#lem-driver-list');
  const driverToggle = rootElement.querySelector('#lem-driver-toggle');
  const unitSwitchBtn = rootElement.querySelector('#lem-unit-switch-btn');
  const copyGlobalBtn = rootElement.querySelector('#lem-copy-global-btn');
  const generateBtn = rootElement.querySelector('#lem-generate-btn');

  const waveSections = {};
  rootElement.querySelectorAll('.lem-wave-section').forEach(section => {
    const wave = section.dataset.wave;
    waveSections[wave] = {
      el: section,
      countInput: section.querySelector('.lem-segment-count'),
      tableHead: section.querySelector('.lem-table-head tr'),
      tableBody: section.querySelector('.lem-table-body'),
      insertBefore: section.querySelector('.lem-insert-before'),
      insertAfter: section.querySelector('.lem-insert-after'),
      deleteBtn: section.querySelector('.lem-delete-segment'),
      clearBtn: section.querySelector('.lem-clear-wave'),
    };
  });

  // ── Utilities ──
  const convertToMm = (value) => (currentUnit === 'cm' ? value * 10 : value);
  const convertFromMm = (value) => (currentUnit === 'cm' ? value / 10 : value);

  function enableInlineCalculation(inputElement) {
    inputElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const expression = inputElement.value.replace(',', '.');
        try {
          const result = new Function('return ' + expression)();
          if (typeof result === 'number' && isFinite(result)) {
            inputElement.value = result;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } catch (_) { /* invalid expression, ignore */ }
      }
    });
  }

  function flashButtonColor(buttonEl, duration = 500) {
    buttonEl.style.setProperty('color', '#ec4899', 'important');
    buttonEl.style.pointerEvents = 'none';
    setTimeout(() => {
      buttonEl.style.color = '';
      buttonEl.style.pointerEvents = 'auto';
    }, duration);
  }

  // ── Table Rendering ──

  function getMaxColumns(wave) {
    const waveState = state[wave];
    let maxCols = 0;
    for (let i = 0; i < waveState.segmentCount; i++) {
      const seg = waveState.segments[i];
      const cols = getColumnsForSegment(seg);
      if (cols.length > maxCols) maxCols = cols.length;
    }
    return maxCols;
  }

  function renderTableHeader(wave) {
    const waveState = state[wave];
    const section = waveSections[wave];
    const maxCols = getMaxColumns(wave);

    let headerHtml = '<th class="w-12 p-2 text-left">#</th>';
    headerHtml += '<th class="w-32 p-2 text-left">Type</th>';

    // Compute union of column labels across all segments
    const colUnion = buildColumnUnion(wave);
    colUnion.forEach(col => {
      const suffix = col.unitLabel === 'dim' ? ` (${currentUnit})` : (col.suffix ? ` (${col.suffix})` : '');
      headerHtml += `<th class="p-2 text-left" data-unit-label="${col.unitLabel || ''}">${col.label}${suffix}</th>`;
    });

    section.tableHead.innerHTML = headerHtml;
  }

  function allWaveguidesBetweenDucts(wave) {
    const waveState = state[wave];
    let hasWg = false;
    for (let i = 0; i < waveState.segmentCount; i++) {
      if (waveState.segments[i].type !== 'waveguide') continue;
      hasWg = true;
      const prev = i > 0 ? waveState.segments[i - 1] : null;
      const next = i < waveState.segmentCount - 1 ? waveState.segments[i + 1] : null;
      if (!prev || prev.type !== 'duct' || !next || next.type !== 'duct') return false;
    }
    return hasWg;
  }

  // Canonical column order: Width, Height, W Throat, W Mouth, Length, VF, then enclosure cols
  const COLUMN_ORDER = ['WD', 'HD', 'WTh', 'WMo', 'Len', 'VF', 'VB', 'LenCab', 'portLen', 'portDD', 'portWD', 'portHD'];

  function buildColumnUnion(wave) {
    const waveState = state[wave];
    const hideThroatMouth = allWaveguidesBetweenDucts(wave);
    const seen = new Map();

    for (let i = 0; i < waveState.segmentCount; i++) {
      const seg = waveState.segments[i];
      const cols = getColumnsForSegment(seg, { hideThroatMouth });
      cols.forEach(col => {
        if (!seen.has(col.key)) {
          seen.set(col.key, col);
        }
      });
    }

    // Sort by canonical order
    const ordered = [];
    COLUMN_ORDER.forEach(key => {
      if (seen.has(key)) ordered.push(seen.get(key));
    });
    // Add any remaining columns not in canonical order
    seen.forEach((col, key) => {
      if (!COLUMN_ORDER.includes(key)) ordered.push(col);
    });
    return ordered;
  }

  function renderTable(wave) {
    const waveState = state[wave];
    const section = waveSections[wave];

    // Auto-compute T-factors for all waveguide segments before rendering
    calculateWaveguideTFactors(waveState.segments, waveState.segmentCount);

    const hideThroatMouth = allWaveguidesBetweenDucts(wave);
    const colUnion = buildColumnUnion(wave);

    // Apply constant height if enabled
    const constantHeightCb = rootElement.querySelector('#lem-constant-height-cb');
    const globalHeightInput = rootElement.querySelector('#lem-global-height');
    const isConstantHeight = constantHeightCb && constantHeightCb.checked;
    const constHeightVal = globalHeightInput ? globalHeightInput.value.trim() : '';

    if (isConstantHeight && constHeightVal) {
      for (let i = 0; i < waveState.segmentCount; i++) {
        if (waveState.segments[i].type === 'duct') {
          waveState.segments[i].params.HD = constHeightVal;
        }
      }
    }

    renderTableHeader(wave);

    section.tableBody.innerHTML = '';

    for (let i = 0; i < waveState.segmentCount; i++) {
      const seg = waveState.segments[i];
      const row = document.createElement('tr');
      row.className = 'lem-segment-row';
      row.dataset.wave = wave;
      row.dataset.index = i;

      // # column (copy button)
      const tdNum = document.createElement('td');
      tdNum.className = 'p-2 h-12 flex items-center justify-start';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'lem-copy-segment-btn text-lg font-bold text-green-400 focus:outline-none';
      copyBtn.dataset.wave = wave;
      copyBtn.dataset.index = i;
      copyBtn.title = `Copy formula for segment ${i + 1}`;
      copyBtn.textContent = String(i + 1);
      tdNum.appendChild(copyBtn);
      row.appendChild(tdNum);

      // Type selector
      const tdType = document.createElement('td');
      tdType.className = 'p-2 h-12 align-middle';
      const select = document.createElement('select');
      select.className = 'form-input lem-type-select h-full';
      select.dataset.wave = wave;
      select.dataset.index = i;
      Object.entries(SEGMENT_TYPES).forEach(([key, typeDef]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = typeDef.label;
        if (key === seg.type) opt.selected = true;
        select.appendChild(opt);
      });
      tdType.appendChild(select);
      row.appendChild(tdType);

      // Adaptive columns from the union
      const segCols = getColumnsForSegment(seg, { hideThroatMouth });
      const segColKeys = new Set(segCols.map(c => c.key));

      colUnion.forEach(col => {
        const td = document.createElement('td');
        td.className = 'p-2 h-12 align-middle';

        if (segColKeys.has(col.key)) {
          // Special: enclosure vented mode toggle
          if (col.key === 'VB' && seg.type === 'enclosure') {
            // VB input + sealed/vented toggle
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'display:flex;gap:4px;align-items:center;';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-input lem-seg-input h-full';
            input.style.flex = '1';
            input.dataset.wave = wave;
            input.dataset.index = i;
            input.dataset.col = col.key;
            input.value = seg.params[col.key] || '';
            wrapper.appendChild(input);

            const ventedBtn = document.createElement('button');
            ventedBtn.className = 'lem-vented-toggle action-btn text-xs';
            ventedBtn.style.cssText = 'padding:4px 8px; height:32px; white-space:nowrap;';
            ventedBtn.dataset.wave = wave;
            ventedBtn.dataset.index = i;
            const isVented = seg.params.ventedMode === 'vented';
            ventedBtn.textContent = isVented ? 'Vented' : 'Sealed';
            if (isVented) ventedBtn.classList.add('bg-pink-700');
            wrapper.appendChild(ventedBtn);

            td.appendChild(wrapper);
          } else if (col.key === 'portDD' || col.key === 'portWD' || col.key === 'portHD') {
            // Port shape-dependent — show shape toggle for portDD
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-input lem-seg-input h-full w-full';
            input.dataset.wave = wave;
            input.dataset.index = i;
            input.dataset.col = col.key;
            input.value = seg.params[col.key] || '';

            if (col.key === 'portDD' && seg.params.portShape !== 'circle') {
              input.style.display = 'none';
            }
            if ((col.key === 'portWD' || col.key === 'portHD') && seg.params.portShape === 'circle') {
              input.style.display = 'none';
            }

            td.appendChild(input);
          } else {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-input lem-seg-input h-full w-full';
            input.dataset.wave = wave;
            input.dataset.index = i;
            input.dataset.col = col.key;
            input.value = seg.params[col.key] || '';
            // T-factor is computed automatically — read-only
            if (col.computed) {
              input.readOnly = true;
              input.style.opacity = '0.7';
              input.style.cursor = 'default';
              input.title = 'Auto-calculated (Salmon factor)';
            }
            // Constant Height: make HD read-only when enabled
            if (col.key === 'HD' && seg.type === 'duct' && isConstantHeight && constHeightVal) {
              input.readOnly = true;
              input.style.opacity = '0.7';
              input.style.cursor = 'default';
              input.title = 'Set by Constant Height';
            }
            td.appendChild(input);
          }
        }
        // else: empty cell for non-matching columns

        row.appendChild(td);
      });

      // If enclosure + vented, add port shape button and Fb display in last cell
      if (seg.type === 'enclosure' && seg.params.ventedMode === 'vented') {
        const tdExtra = document.createElement('td');
        tdExtra.className = 'p-2 h-12 align-middle';
        tdExtra.style.whiteSpace = 'nowrap';

        const shapeBtn = document.createElement('button');
        shapeBtn.className = 'lem-port-shape-btn action-btn text-xs';
        shapeBtn.style.cssText = 'padding:4px 8px; height:32px;';
        shapeBtn.dataset.wave = wave;
        shapeBtn.dataset.index = i;
        shapeBtn.textContent = (seg.params.portShape || 'circle') === 'circle' ? '○ Circle' : '□ Rect';

        const fbSpan = document.createElement('span');
        fbSpan.className = 'lem-fb-display text-sm ml-2';
        fbSpan.dataset.wave = wave;
        fbSpan.dataset.index = i;
        const fb = calculateVentedFb(seg.params);
        if (fb) fbSpan.textContent = `Fb ≈ ${fb.toFixed(2)} Hz`;

        tdExtra.appendChild(shapeBtn);
        tdExtra.appendChild(fbSpan);
        row.appendChild(tdExtra);
      }

      section.tableBody.appendChild(row);
    }

    // Enable inline calculation on all new inputs
    section.tableBody.querySelectorAll('input[type="text"]').forEach(enableInlineCalculation);
  }

  // ── Segment Operations ──

  function syncSegmentFromDOM(wave, index) {
    const section = waveSections[wave];
    const row = section.tableBody.querySelector(`.lem-segment-row[data-index="${index}"]`);
    if (!row) return;

    const seg = state[wave].segments[index];
    row.querySelectorAll('.lem-seg-input').forEach(input => {
      const col = input.dataset.col;
      if (col) seg.params[col] = input.value;
    });
  }

  function syncAllFromDOM(wave) {
    for (let i = 0; i < state[wave].segmentCount; i++) {
      syncSegmentFromDOM(wave, i);
    }
  }

  function insertSegment(wave, index, before = false) {
    const waveState = state[wave];
    if (waveState.segmentCount >= 20) return;
    syncAllFromDOM(wave);

    const insertionPoint = before ? index : index + 1;
    const defaultType = wave === 'front' ? 'duct' : 'enclosure';
    waveState.segments.splice(insertionPoint, 0, createDefaultSegment(defaultType));
    waveState.segments.pop(); // maintain array size 20
    waveState.segmentCount++;

    const section = waveSections[wave];
    section.countInput.value = waveState.segmentCount;
    renderTable(wave);
  }

  function deleteSegment(wave, index) {
    const waveState = state[wave];
    if (waveState.segmentCount <= 1) return;
    syncAllFromDOM(wave);

    waveState.segments.splice(index, 1);
    const defaultType = wave === 'front' ? 'duct' : 'enclosure';
    waveState.segments.push(createDefaultSegment(defaultType));
    waveState.segmentCount--;
    waveState.focusedIndex = -1;

    const section = waveSections[wave];
    section.countInput.value = waveState.segmentCount;
    renderTable(wave);
  }

  function clearWave(wave) {
    const waveState = state[wave];
    const defaultType = wave === 'front' ? 'duct' : 'enclosure';
    waveState.segmentCount = 1;
    waveState.segments = Array.from({ length: 20 }, () => createDefaultSegment(defaultType));
    waveState.focusedIndex = -1;

    const section = waveSections[wave];
    section.countInput.value = 1;
    renderTable(wave);
  }

  // ── Formula Generation ──

  async function generateGlobalFormula() {
    const lines = [];

    // Driver params
    if (selectedDriver?.name) {
      try {
        const driverParams = await window.electronAPI.getDriverById(selectedDriver.name);
        if (driverParams) {
          lines.push(`// HP UTILISE : [${selectedDriver.name}]`);
          ['SDf', 'SDr', 'Mms', 'fs', 'Qms', 'Re', 'BL', 'Le'].forEach(key => {
            if (driverParams[key] !== undefined) lines.push(`${key}=${driverParams[key]}`);
          });
          lines.push('');
        }
      } catch (e) { console.error('Driver error:', e); }
    }

    // Global height
    lines.push('// Global Dimensions (Height)');
    lines.push('H = @HEIGHT*@n - (2*@n)*@WOOD_THICKNESS');

    // Collect all segments sequentially: front then back
    syncAllFromDOM('front');
    syncAllFromDOM('back');

    // Recalculate T-factors (Salmon) before reading values
    calculateWaveguideTFactors(state.front.segments, state.front.segmentCount);
    calculateWaveguideTFactors(state.back.segments, state.back.segmentCount);

    // Per-type counters with adjacency tracking
    let ductNum = 0, wgNum = 0;
    const ductSegs = [];
    const wgSegs = [];
    const enclSegs = [];
    const allSegsOrdered = [];

    ['front', 'back'].forEach(wave => {
      const waveSegs = state[wave].segments;
      const count = state[wave].segmentCount;

      // First pass: assign duct numbers in this wave
      const localDuctNums = [];
      for (let i = 0; i < count; i++) {
        if (waveSegs[i].type === 'duct') {
          ductNum++;
          localDuctNums[i] = ductNum;
          ductSegs.push({ num: ductNum, seg: waveSegs[i] });
        }
        allSegsOrdered.push(waveSegs[i]);
      }

      // Second pass: waveguides with adjacency info
      for (let i = 0; i < count; i++) {
        const seg = waveSegs[i];
        if (seg.type === 'waveguide') {
          wgNum++;
          const prevDuctNum = (i > 0 && waveSegs[i - 1].type === 'duct') ? localDuctNums[i - 1] : null;
          const nextDuctNum = (i < count - 1 && waveSegs[i + 1].type === 'duct') ? localDuctNums[i + 1] : null;
          wgSegs.push({ num: wgNum, seg, prevDuctNum, nextDuctNum });
        } else if (seg.type === 'enclosure') {
          enclSegs.push(seg);
        }
      }
    });

    // Duct widths (D) and lengths (DL)
    if (ductSegs.length > 0) {
      lines.push(`\n// Largeurs des Ducts (D)`);
      ductSegs.forEach(({ num, seg }) => {
        const w = seg.params.WD;
        if (w !== undefined && w !== '') lines.push(`D${num} = ${convertToMm(parseFloat(w)) || w}`);
      });
      lines.push(`// Longueurs des Ducts (DL)`);
      ductSegs.forEach(({ num, seg }) => {
        const l = seg.params.Len;
        if (l !== undefined && l !== '') lines.push(`DL${num} = ${convertToMm(parseFloat(l)) || l}`);
      });
    }

    // Waveguide widths (S) — with deduplication and D-references for between-ducts
    if (wgSegs.length > 0) {
      const sLines = [];
      const definedS = new Set();
      for (let w = 0; w < wgSegs.length; w++) {
        const wg = wgSegs[w];
        const sThroatIdx = wg.num;
        const sMouthIdx = wg.num + 1;
        // Throat
        if (!definedS.has(sThroatIdx)) {
          definedS.add(sThroatIdx);
          if (wg.prevDuctNum != null) {
            sLines.push(`S${sThroatIdx} = D${wg.prevDuctNum}`);
          } else {
            const wth = wg.seg.params.WTh;
            if (wth !== undefined && wth !== '') sLines.push(`S${sThroatIdx} = ${convertToMm(parseFloat(wth)) || wth}`);
          }
        }
        // Mouth
        if (!definedS.has(sMouthIdx)) {
          definedS.add(sMouthIdx);
          if (wg.nextDuctNum != null) {
            sLines.push(`S${sMouthIdx} = D${wg.nextDuctNum}`);
          } else {
            const wmo = wg.seg.params.WMo;
            if (wmo !== undefined && wmo !== '') sLines.push(`S${sMouthIdx} = ${convertToMm(parseFloat(wmo)) || wmo}`);
          }
        }
      }
      if (sLines.length > 0) {
        lines.push(`\n// Horn Width (S)`);
        sLines.forEach(l => lines.push(l));
      }
      lines.push(`// Horn Length (L)`);
      for (let w = 0; w < wgSegs.length; w++) {
        const l = wgSegs[w].seg.params.Len;
        if (l !== undefined && l !== '') lines.push(`L${wgSegs[w].num} = ${convertToMm(parseFloat(l)) || l}`);
      }
      lines.push(`// T-Factor (T)`);
      for (let w = 0; w < wgSegs.length; w++) {
        const t = wgSegs[w].seg.params.T;
        if (t !== undefined && t !== '') lines.push(`T${wgSegs[w].num} = ${t}`);
      }
    }

    // Volumes (VF) — global counter to avoid conflicts between duct/waveguide
    const vfEntries = [];
    let vfNum = 0;
    allSegsOrdered.forEach(seg => {
      if (seg.params.VF && seg.params.VF !== '' && seg.params.VF !== '0') {
        vfNum++;
        vfEntries.push({ num: vfNum, val: seg.params.VF });
      }
    });
    if (vfEntries.length > 0) {
      lines.push(`// Volumes (VF)`);
      vfEntries.forEach(({ num, val }) => lines.push(`VF${num} = ${val}`));
    }

    // Enclosure (single Vb/Lb, no index)
    if (enclSegs.length > 0) {
      const seg = enclSegs[0]; // only one enclosure expected
      const mode = seg.params.ventedMode || 'sealed';
      lines.push(`\n// Enclosure Definition`);
      if (seg.params.VB !== undefined && seg.params.VB !== '') lines.push(`Vb=${seg.params.VB}*@N`);
      if (seg.params.LenCab !== undefined && seg.params.LenCab !== '') lines.push(`Lb=${convertToMm(parseFloat(seg.params.LenCab)) || seg.params.LenCab}`);
      if (mode === 'vented') {
        if (seg.params.portLen) lines.push(`PortLen=${convertToMm(parseFloat(seg.params.portLen)) || seg.params.portLen}`);
        if (seg.params.portDD) lines.push(`dD = ${convertToMm(parseFloat(seg.params.portDD)) || seg.params.portDD}`);
        if (seg.params.portWD) lines.push(`wDP = ${convertToMm(parseFloat(seg.params.portWD)) || seg.params.portWD}`);
        if (seg.params.portHD) lines.push(`hDP = ${convertToMm(parseFloat(seg.params.portHD)) || seg.params.portHD}`);
      }
    }

    // Source
    const voltage = rootElement.querySelector('#lem-source-voltage')?.value?.trim();
    if (voltage) {
      lines.push('\n// Source');
      lines.push(`Vg=${voltage}`);
    }

    return lines.join('\n');
  }

  async function generateLemConfig() {
    syncAllFromDOM('front');
    syncAllFromDOM('back');

    // Recalculate T-factors (Salmon) so params.T is populated before building config
    calculateWaveguideTFactors(state.front.segments, state.front.segmentCount);
    calculateWaveguideTFactors(state.back.segments, state.back.segmentCount);

    const config = {
      driver: null,
      frontWave: [],
      backWave: [],
      globalConstants: {
        woodThickness: rootElement.querySelector('#lem-global-wood-thickness')?.value?.trim() || '18',
        damping: rootElement.querySelector('#lem-global-damping')?.value?.trim() || '0.1',
        wood: rootElement.querySelector('#lem-global-wood')?.value?.trim() || '0.05',
        width: rootElement.querySelector('#lem-global-width')?.value?.trim() || '',
        height: rootElement.querySelector('#lem-global-height')?.value?.trim() || '',
        dept: rootElement.querySelector('#lem-global-dept')?.value?.trim() || '',
      },
      modules: {
        source: {
          voltage: rootElement.querySelector('#lem-source-voltage')?.value?.trim() || null,
        },
      },
    };

    // Driver
    if (selectedDriver?.name) {
      try {
        config.driver = await window.electronAPI.getDriverById(selectedDriver.name);
        if (config.driver) config.driver.name = selectedDriver.name;
      } catch (_) {}
    }

    // Waves
    ['front', 'back'].forEach(wave => {
      const waveState = state[wave];
      for (let i = 0; i < waveState.segmentCount; i++) {
        const seg = waveState.segments[i];
        const params = {};
        const cols = getColumnsForSegment(seg);
        cols.forEach(col => {
          const val = seg.params[col.key];
          if (val !== undefined && val !== '') {
            const numVal = parseFloat(val);
            params[col.key] = col.unitLabel === 'dim' && !isNaN(numVal) ? convertToMm(numVal) : val;
          }
        });
        // T is auto-calculated (not a UI column) — include it explicitly
        if (seg.type === 'waveguide' && seg.params.T !== undefined && seg.params.T !== '') {
          params.T = String(seg.params.T);
        }
        const entry = { type: seg.type, index: i + 1, params };
        if (seg.type === 'enclosure') {
          entry.ventedMode = seg.params.ventedMode || 'sealed';
          entry.portShape = seg.params.portShape || 'circle';
        }
        config[wave === 'front' ? 'frontWave' : 'backWave'].push(entry);
      }
    });

    return config;
  }

  // ── Event Handlers ──

  function setupWaveListeners(wave) {
    const section = waveSections[wave];
    const waveState = state[wave];

    // Segment count input
    section.countInput.addEventListener('input', () => {
      syncAllFromDOM(wave);
      const newCount = Math.max(1, Math.min(20, parseInt(section.countInput.value, 10) || 1));
      waveState.segmentCount = newCount;
      section.countInput.value = newCount;

      // Ensure enough segments exist
      const defaultType = wave === 'front' ? 'duct' : 'enclosure';
      while (waveState.segments.length < 20) waveState.segments.push(createDefaultSegment(defaultType));

      renderTable(wave);
    });

    // Insert / Delete / Clear
    section.insertBefore.addEventListener('click', () => {
      if (waveState.focusedIndex > -1) insertSegment(wave, waveState.focusedIndex, true);
    });
    section.insertAfter.addEventListener('click', () => {
      if (waveState.focusedIndex > -1) insertSegment(wave, waveState.focusedIndex, false);
    });
    section.deleteBtn.addEventListener('click', () => {
      if (waveState.focusedIndex > -1) {
        deleteSegment(wave, waveState.focusedIndex);
      } else if (waveState.segmentCount > 1) {
        deleteSegment(wave, waveState.segmentCount - 1);
      }
    });
    section.clearBtn.addEventListener('click', () => clearWave(wave));

    // Table events (delegated)
    section.tableBody.addEventListener('focusin', e => {
      const row = e.target.closest('.lem-segment-row');
      if (row) waveState.focusedIndex = parseInt(row.dataset.index, 10);
    });

    section.tableBody.addEventListener('input', e => {
      const input = e.target;
      if (!input.classList.contains('lem-seg-input')) return;
      const idx = parseInt(input.dataset.index, 10);
      const col = input.dataset.col;
      if (isNaN(idx) || !col) return;

      state[wave].segments[idx].params[col] = input.value;

      // Recalculate T-factors for waveguide segments when dimensions change
      const seg = state[wave].segments[idx];
      if (seg.type === 'waveguide' && (col === 'WTh' || col === 'WMo' || col === 'Len')) {
        calculateWaveguideTFactors(state[wave].segments, state[wave].segmentCount);
        // Update all T inputs in this wave
        section.tableBody.querySelectorAll('.lem-seg-input[data-col="T"]').forEach(tInput => {
          const tIdx = parseInt(tInput.dataset.index, 10);
          tInput.value = state[wave].segments[tIdx].params.T || '';
        });
      }

      // Update Fb display for vented enclosures
      if (seg.type === 'enclosure' && seg.params.ventedMode === 'vented') {
        const fbDisplay = section.tableBody.querySelector(`.lem-fb-display[data-wave="${wave}"][data-index="${idx}"]`);
        if (fbDisplay) {
          const fb = calculateVentedFb(seg.params);
          fbDisplay.textContent = fb ? `Fb ≈ ${fb.toFixed(2)} Hz` : '';
        }
      }
    });

    section.tableBody.addEventListener('click', e => {
      const target = e.target;

      // Copy segment formula
      if (target.classList.contains('lem-copy-segment-btn')) {
        const idx = parseInt(target.dataset.index, 10);
        const seg = state[wave].segments[idx];
        syncSegmentFromDOM(wave, idx);
        const formula = generateSegmentFormula(seg, idx + 1);
        navigator.clipboard.writeText(formula);
        flashButtonColor(target, 500);
        return;
      }

      // Type selector change
      if (target.classList.contains('lem-type-select')) return; // handled by 'change'

      // Sealed/Vented toggle
      if (target.classList.contains('lem-vented-toggle')) {
        const idx = parseInt(target.dataset.index, 10);
        const seg = state[wave].segments[idx];
        syncSegmentFromDOM(wave, idx);
        seg.params.ventedMode = seg.params.ventedMode === 'vented' ? 'sealed' : 'vented';
        renderTable(wave);
        return;
      }

      // Port shape toggle
      if (target.classList.contains('lem-port-shape-btn')) {
        const idx = parseInt(target.dataset.index, 10);
        const seg = state[wave].segments[idx];
        syncSegmentFromDOM(wave, idx);
        seg.params.portShape = seg.params.portShape === 'circle' ? 'rectangle' : 'circle';
        renderTable(wave);
        return;
      }
    });

    // Type selector change event
    section.tableBody.addEventListener('change', e => {
      if (!e.target.classList.contains('lem-type-select')) return;
      const idx = parseInt(e.target.dataset.index, 10);
      syncSegmentFromDOM(wave, idx);

      const newType = e.target.value;
      const oldSeg = state[wave].segments[idx];

      // Create new segment with default params, preserving common values
      const newSeg = createDefaultSegment(newType);
      // Try to carry over any overlapping param keys
      Object.keys(oldSeg.params).forEach(key => {
        if (key in newSeg.params && oldSeg.params[key]) {
          newSeg.params[key] = oldSeg.params[key];
        }
      });

      state[wave].segments[idx] = newSeg;
      renderTable(wave);
    });
  }

  // ── Driver Search ──

  driverSearch.addEventListener('input', () => {
    const term = driverSearch.value.toLowerCase();
    if (!term) { driverList.classList.add('hidden'); return; }
    driverList.innerHTML = allDrivers
      .filter(d => d.name.toLowerCase().includes(term))
      .map(d => `<div class="p-2 hover:bg-green-700 cursor-pointer" data-name="${d.name}">${d.name}</div>`)
      .join('');
    driverList.classList.remove('hidden');
  });

  driverList.addEventListener('click', e => {
    const target = e.target.closest('[data-name]');
    if (target) {
      selectedDriver = { name: target.dataset.name };
      driverToggle.textContent = `[ ${selectedDriver.name} ]`;
      driverList.classList.add('hidden');
      driverSearch.value = '';
    }
  });

  driverToggle.addEventListener('click', () => {
    selectedDriver = null;
    driverToggle.textContent = '[ None ]';
  });

  // ── Unit Switch ──

  unitSwitchBtn.addEventListener('click', () => {
    // Sync all current values
    syncAllFromDOM('front');
    syncAllFromDOM('back');

    const oldUnit = currentUnit;
    currentUnit = oldUnit === 'mm' ? 'cm' : 'mm';
    unitSwitchBtn.textContent = currentUnit;

    // Convert all dimension values in state
    ['front', 'back'].forEach(wave => {
      const waveState = state[wave];
      for (let i = 0; i < waveState.segmentCount; i++) {
        const seg = waveState.segments[i];
        const cols = getColumnsForSegment(seg);
        cols.forEach(col => {
          if (col.unitLabel !== 'dim') return;
          const val = parseFloat(seg.params[col.key]);
          if (isNaN(val) || seg.params[col.key] === '') return;
          // Convert: old unit → mm → new unit
          const mm = oldUnit === 'cm' ? val * 10 : val;
          seg.params[col.key] = String((currentUnit === 'cm' ? mm / 10 : mm).toFixed(1));
        });
      }
    });

    renderTable('front');
    renderTable('back');
  });

  // ── Module Toggles ──

  function setupModuleToggle(toggleId, inputsId) {
    const btn = rootElement.querySelector(`#${toggleId}`);
    const inputs = rootElement.querySelector(`#${inputsId}`);
    if (!btn || !inputs) return;
    btn.addEventListener('click', () => {
      const isOpen = inputs.style.display === 'flex';
      inputs.style.display = isOpen ? 'none' : 'flex';
      btn.classList.toggle('bg-pink-700', !isOpen);
    });
  }

  setupModuleToggle('lem-global-toggle-btn', 'lem-global-inputs');

  // ── Global Panel: Constant Height ──

  const constantHeightCb = rootElement.querySelector('#lem-constant-height-cb');
  const globalHeightInput = rootElement.querySelector('#lem-global-height');

  function applyConstantHeight() {
    if (!constantHeightCb || !constantHeightCb.checked) return;
    const heightVal = globalHeightInput ? globalHeightInput.value.trim() : '';
    if (!heightVal) return;
    ['front', 'back'].forEach(wave => {
      for (let i = 0; i < state[wave].segmentCount; i++) {
        if (state[wave].segments[i].type === 'duct') {
          state[wave].segments[i].params.HD = heightVal;
        }
      }
      renderTable(wave);
    });
  }

  if (constantHeightCb) {
    constantHeightCb.addEventListener('change', () => {
      applyConstantHeight();
      if (!constantHeightCb.checked) {
        ['front', 'back'].forEach(wave => renderTable(wave));
      }
    });
  }
  if (globalHeightInput) {
    globalHeightInput.addEventListener('input', () => {
      if (constantHeightCb && constantHeightCb.checked) applyConstantHeight();
    });
  }

  // ── Global Constants Generation ──

  function generateGlobalConstants() {
    const woodThickness = rootElement.querySelector('#lem-global-wood-thickness')?.value?.trim() || '18';
    const damping = rootElement.querySelector('#lem-global-damping')?.value?.trim() || '0.1';
    const wood = rootElement.querySelector('#lem-global-wood')?.value?.trim() || '0.05';
    const width = rootElement.querySelector('#lem-global-width')?.value?.trim() || '';
    const height = rootElement.querySelector('#lem-global-height')?.value?.trim() || '';
    const dept = rootElement.querySelector('#lem-global-dept')?.value?.trim() || '';

    const lines = [];
    lines.push('////////CONSTANTE/////////');
    lines.push(`WOOD_THICKNESS = ${woodThickness}`);
    lines.push(`RMIN           = 70`);
    lines.push(`DAMPING        = ${damping}`);
    lines.push(`WOOD           = ${wood}`);
    lines.push('');
    lines.push("//////////NOMBRE D'UNITES//////////");
    lines.push('N =1');
    lines.push('');
    lines.push('//////////DIMENSION//////////');
    if (height) lines.push(`HEIGHT = ${height}`);
    if (width) lines.push(`WIDTH  = ${width}`);
    if (dept) lines.push(`DEPT   = ${dept}`);
    lines.push('');
    lines.push('//////////PPBOX RADIATION//////////');
    lines.push('MOUTH_H = HEIGHT');
    lines.push('MOUTH_D = WIDTH - 2*WOOD_THICKNESS');
    lines.push('');
    lines.push('//////////TOOLS//////////');
    lines.push('IB = (HEIGHT/n)/2');
    return lines.join('\n');
  }

  const copyGlobalConstantsBtn = rootElement.querySelector('#lem-copy-global-constants-btn');
  if (copyGlobalConstantsBtn) {
    copyGlobalConstantsBtn.addEventListener('click', async () => {
      const text = generateGlobalConstants();
      try {
        await navigator.clipboard.writeText(text);
        const original = copyGlobalConstantsBtn.textContent;
        copyGlobalConstantsBtn.textContent = 'Copied!';
        setTimeout(() => { copyGlobalConstantsBtn.textContent = original; }, 2000);
      } catch (err) {
        console.error('Copy error:', err);
      }
    });
  }

  // ── Copy Global Formula ──

  copyGlobalBtn.addEventListener('click', async () => {
    const formula = await generateGlobalFormula();
    try {
      await navigator.clipboard.writeText(formula);
      const original = copyGlobalBtn.textContent;
      copyGlobalBtn.textContent = 'Copied!';
      setTimeout(() => { copyGlobalBtn.textContent = original; }, 2000);
    } catch (err) {
      console.error('Copy error:', err);
    }
  });

  // ── Generate LEM File ──

  generateBtn.addEventListener('click', async () => {
    try {
      const config = await generateLemConfig();
      const defaultName = selectedDriver?.name
        ? `${selectedDriver.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_lem.akp`
        : 'project_lem.akp';

      const result = await window.electronAPI.generateLemFile({ config, defaultName });
      if (result?.success) {
        const original = generateBtn.textContent;
        generateBtn.textContent = '✓ Generated!';
        generateBtn.style.background = '#16a34a';
        setTimeout(() => { generateBtn.textContent = original; }, 3000);
      } else if (result?.error) {
        console.error('LEM generation error:', result.error);
        const original = generateBtn.textContent;
        generateBtn.textContent = '✗ Error';
        generateBtn.style.background = '#dc2626';
        setTimeout(() => { generateBtn.textContent = original; generateBtn.style.background = '#16a34a'; }, 3000);
      }
    } catch (err) {
      console.error('LEM generation failed:', err);
    }
  });

  // ── Settings sync ──

  window.panelEvents.addEventListener('settings-updated', (e) => {
    templates = { ...defaultTemplates, ...e.detail?.newSettings?.templates };
  });

  // ── Export-to event (from horn panel) ──

  window.panelEvents.addEventListener('export-to-hornscript', (e) => {
    const { segments, count, unit } = e.detail;
    if (!segments || !count) return;

    state.front.segmentCount = Math.min(count, 20);
    waveSections.front.countInput.value = state.front.segmentCount;

    if (currentUnit !== unit) {
      currentUnit = unit;
      unitSwitchBtn.textContent = unit;
    }

    for (let i = 0; i < state.front.segmentCount; i++) {
      const segData = segments[i];
      if (!segData) continue;
      state.front.segments[i] = {
        type: 'waveguide',
        params: {
          ...SEGMENT_TYPES.waveguide.defaults,
          WTh: String(convertFromMm(segData.w)),
          WMo: i + 1 < segments.length ? String(convertFromMm(segments[i + 1].w)) : '',
          Len: String(convertFromMm(segData.l)),
          T: '10',
        },
      };
    }

    renderTable('front');
  });

  // ── Initial Load ──

  setupWaveListeners('front');
  setupWaveListeners('back');

  async function initialLoad() {
    const settings = await window.electronAPI.getSettings();
    templates = { ...defaultTemplates, ...settings?.templates };

    try { allDrivers = await window.electronAPI.getAllDrivers(); }
    catch (_) { allDrivers = []; }

    renderTable('front');
    renderTable('back');

    // Enable inline calc on sidebar inputs
    rootElement.querySelectorAll('#lem-side-modules input[type="text"]').forEach(enableInlineCalculation);
  }

  initialLoad();
}
