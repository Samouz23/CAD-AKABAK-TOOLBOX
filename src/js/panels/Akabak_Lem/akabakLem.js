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

      <div class="lem-layout flex flex-row space-x-8 items-start">
        <!-- LEFT: TWO TABLES -->
        <div class="flex-grow flex flex-col" style="gap: 32px; min-width: 0;">

          <!-- FRONT WAVE TABLE -->
          <div class="lem-wave-section" data-wave="front">
            <div class="flex items-center space-x-4 mb-2">
              <h2 class="text-2xl font-bold text-white">Front Wave</h2>
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
              <h2 class="text-2xl font-bold text-white">Back Wave</h2>
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
        <div id="lem-side-modules" class="lem-side-modules" style="display:flex; flex-direction:column; gap:20px; padding-top:32px;">

          <!-- GLOBAL MODULE -->
          <div class="hornscript-module">
            <div class="lem-global-toggle-row" style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
              <button id="lem-global-toggle-btn" class="action-btn lem-global-toggle-btn">Global</button>
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
                  <input id="lem-global-wood" type="text" class="form-input form-input-sm" style="width:100%;" value="0.02">
                </div>
                <div>
                  <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                    <label class="hornscript-label" style="margin:0;">WIDTH</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer; color:#06b6d4; margin-left:auto;">
                      <input id="lem-constant-width-cb" type="checkbox" style="accent-color:#06b6d4;">
                      Constant Width
                    </label>
                  </div>
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
              <button id="lem-copy-global-constants-btn" class="action-btn text-xs" style="margin-top:4px;">Copy Global Constants</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- BOTTOM BAR -->
    <div class="flex justify-end items-end flex-shrink-0 pt-4">
      <div class="flex items-center space-x-4">
        <button id="lem-copy-global-btn" class="action-btn px-8 font-bold" style="background: #16a34a; border-color: #22c55e; color: white; font-size: 18px;">
          Copy LEM Formulas
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

  // Fill segments arrays to max 20 — extras are 'empty' (unassigned) until user picks a type.
  // (Only the first visible row of each wave gets a meaningful default; the rest stay 'empty'
  // so growing the segment count never silently reveals a leftover Enclosure component.)
  for (let i = state.front.segments.length; i < 20; i++) state.front.segments.push(createDefaultSegment('empty'));
  for (let i = state.back.segments.length; i < 20; i++) state.back.segments.push(createDefaultSegment('empty'));

  // ── DOM refs ──
  const driverSearch = rootElement.querySelector('#lem-driver-search');
  const driverList = rootElement.querySelector('#lem-driver-list');
  const driverToggle = rootElement.querySelector('#lem-driver-toggle');
  const unitSwitchBtn = rootElement.querySelector('#lem-unit-switch-btn');
  const copyGlobalBtn = rootElement.querySelector('#lem-copy-global-btn');
  const generateBtn = rootElement.querySelector('#lem-generate-btn'); // may be null (UI disabled)

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

  // S/L numbering is GLOBAL across both waves: the back wave continues counting where
  // the front wave left off (front has 2 ducts → S1,S2; back's first duct is S3, not S1).
  // This avoids name conflicts when both waves are pasted into the same Akabak script.
  function getWaveSOffset(wave) {
    return wave === 'back' ? state.front.segmentCount : 0;
  }

  // Terminal node name is also GLOBAL: front wave's terminal is END, back wave's is END2
  // (both waves can't share "END" once pasted together in the same Akabak script).
  function getWaveEndLabel(wave) {
    return wave === 'back' ? 'END2' : 'END';
  }

  // Walk the current state with the same emit rules as generateGlobalFormula()
  // to retrieve the global section indices for nodes (wave, c) and (wave, c+1).
  // Used by the Duct↔Duct transition copy button.
  function computeTransitionIndices(wave, c) {
    // In the new model, section S{n} for component at 0-based index c is always c+1
    const offset = getWaveSOffset(wave);
    return { sA: offset + c + 1, sB: offset + c + 2 };
  }

  // Build the Akabak formula for a duct↔duct transition.
  // mode 'W' = waveguide section between two ducts (has its own length L{a}{b})
  // mode 'M' = acoustic mass (sudden area change, no length) — Plans-Système formula
  function buildTransitionFormula(mode, a, b) {
    if (mode === 'M') {
      return [
        `d1 = @S${a}`,
        `d2 = @S${b}`,
        '',
        '// hack qui nous permet de toujours obtenir w1 > w2',
        'k = Sign(d2 - d1)',
        'w1 = if(k + 1, d1, d2)',
        'w2 = if(k + 1, d2, d1)',
        '',
        '// formule issue du fichier excel de plans.systeme',
        "// adaptée pour l'utilisation dans Akabak",
        'pre_m = (Density / (pi * @H)) * ((((w1-w2) ^ 2) / (2*w1*w2)) * Ln((w1+w2)/(w1-w2)) + Ln(((w1+w2) ^ 2)/(4*w1*w2))) * 1000',
        '',
        'M = if(k, 0, pre_m)'
      ].join('\n');
    }
    // Waveguide transition
    return [
      'HTh = @H',
      'HMo = @H',
      `WTh = @S${a}`,
      `WMo = @S${b}`,
      `Len = @L${a}${b}`,
      'T   = 10'
    ].join('\n');
  }

  // ── Table Rendering ──
  //
  // NEW MODEL: each row = a NODE. A table with N rows defines N−1 physical components.
  // Row i (i < N−1) carries the TYPE and LENGTH of the component between node i and node i+1.
  // Section S_k is carried by node k through its WD field.
  // Last row (i = N−1) is the terminal node: only WD + HD are editable.
  // Special case: Duct→Duct junction has an additional TRANSITION sub-row
  // (mode W = waveguide transition with own length; mode M = acoustic mass, no length).
  //
  // Enclosure remains a standalone row (not chained — single entry per wave, typically back).

  // Canonical column order for the table
  const COLUMN_ORDER = ['WD', 'HD', 'Len', 'VB', 'LenCab', 'portLen', 'portDD', 'portWD', 'portHD'];

  function buildColumnUnion(wave) {
    const waveState = state[wave];
    const seen = new Map();
    for (let i = 0; i < waveState.segmentCount; i++) {
      const seg = waveState.segments[i];
      const cols = getColumnsForSegment(seg);
      cols.forEach(col => { if (!seen.has(col.key)) seen.set(col.key, col); });
    }
    const ordered = [];
    COLUMN_ORDER.forEach(key => { if (seen.has(key)) ordered.push(seen.get(key)); });
    seen.forEach((col, key) => { if (!COLUMN_ORDER.includes(key)) ordered.push(col); });
    return ordered;
  }

  function renderTableHeader(wave) {
    const section = waveSections[wave];
    let headerHtml = '<th class="w-12 p-2 text-left">#</th>';
    headerHtml += '<th class="w-32 p-2 text-left">Type</th>';
    const colUnion = buildColumnUnion(wave);
    colUnion.forEach(col => {
      const suffix = col.unitLabel === 'dim' ? ` (${currentUnit})` : (col.suffix ? ` (${col.suffix})` : '');
      headerHtml += `<th class="p-2 text-left" data-unit-label="${col.unitLabel || ''}">${col.label}${suffix}</th>`;
    });
    section.tableHead.innerHTML = headerHtml;
  }

  function renderTable(wave) {
    const waveState = state[wave];
    const section = waveSections[wave];
    const N = waveState.segmentCount;

    // Auto-compute T-factors for all waveguide components before rendering
    calculateWaveguideTFactors(waveState.segments, N);

    const colUnion = buildColumnUnion(wave);

    // Apply constant dimensions as the inside dimensions after wall thickness.
    const constantHeightCb = rootElement.querySelector('#lem-constant-height-cb');
    const constantWidthCb = rootElement.querySelector('#lem-constant-width-cb');
    const globalWidthInput = rootElement.querySelector('#lem-global-width');
    const globalHeightInput = rootElement.querySelector('#lem-global-height');
    const isConstantHeight = constantHeightCb && constantHeightCb.checked;
    const isConstantWidth = constantWidthCb && constantWidthCb.checked;
    const woodThickness = parseFloat(rootElement.querySelector('#lem-global-wood-thickness')?.value) || 0;
    const getInsideDimension = input => {
      const value = parseFloat(input?.value);
      if (!isFinite(value)) return '';
      return String(value - (2 * woodThickness));
    };
    const constHeightVal = isConstantHeight ? getInsideDimension(globalHeightInput) : '';
    const constWidthVal = isConstantWidth ? getInsideDimension(globalWidthInput) : '';
    if (isConstantHeight && constHeightVal) {
      for (let i = 0; i <= N; i++) {
        const s = waveState.segments[i];
        if (s && (s.type === 'duct' || s.type === 'waveguide')) {
          s.params.HD = constHeightVal;
        }
      }
    }
    if (isConstantWidth && constWidthVal) {
      for (let i = 0; i <= N; i++) {
        const s = waveState.segments[i];
        if (s && (s.type === 'duct' || s.type === 'waveguide')) {
          s.params.WD = constWidthVal;
        }
      }
    }

    // segmentCount = component count. Terminal node at index N is auto-appended when the wave has
    // at least one duct or waveguide component (it defines the end section / WMo of the last WG).
    const hasChainSegs = waveState.segments.slice(0, N).some(s => s.type === 'duct' || s.type === 'waveguide');
    const renderCount = hasChainSegs ? N + 1 : N;

    renderTableHeader(wave);
    section.tableBody.innerHTML = '';

    for (let i = 0; i < renderCount; i++) {
      const seg = waveState.segments[i] || createDefaultSegment('empty');
      const isLastNode = i === N;  // true only for the auto-appended terminal row
      const isEnclosure = (seg.type === 'enclosure');

      const row = document.createElement('tr');
      row.className = 'lem-segment-row';
      row.dataset.wave = wave;
      row.dataset.index = i;

      // # column — copy button for components; plain dim label for terminal
      const tdNum = document.createElement('td');
      tdNum.className = 'p-2 h-12 flex items-center justify-start';
      if (!isLastNode) {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'lem-copy-segment-btn text-lg font-bold text-green-400 focus:outline-none';
        copyBtn.dataset.wave = wave;
        copyBtn.dataset.index = i;
        copyBtn.title = `Copy formula for segment ${i + 1}`;
        copyBtn.textContent = String(i + 1);
        tdNum.appendChild(copyBtn);
      }
      row.appendChild(tdNum);

      // Type selector (hidden on terminal node unless it's an enclosure)
      const tdType = document.createElement('td');
      tdType.className = 'p-2 h-12 align-middle';
      if (isLastNode && !isEnclosure) {
        // Terminal node — pretty pill badge
        const badge = document.createElement('span');
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px dashed #6b7280;border-radius:999px;font-size:10px;letter-spacing:1px;color:#9ca3af;text-transform:uppercase;font-weight:600;background:rgba(107,114,128,0.08);';
        badge.title = `Terminal node — defines the ${getWaveEndLabel(wave)} section. No component follows.`;
        const dot = document.createElement('span');
        dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#9ca3af;';
        const label = document.createElement('span');
        label.textContent = getWaveEndLabel(wave);
        badge.appendChild(dot);
        badge.appendChild(label);
        tdType.appendChild(badge);
      } else {
        const select = document.createElement('select');
        select.className = 'form-input lem-type-select h-full';
        select.dataset.wave = wave;
        select.dataset.index = i;
        select.tabIndex = -1; // Tab skips type selector
        const isEmpty = seg.type === 'empty';
        if (isEmpty) {
          // Placeholder Empty option (disabled) — user must pick a real type
          const placeholder = document.createElement('option');
          placeholder.value = 'empty';
          placeholder.textContent = 'Empty';
          placeholder.disabled = true;
          placeholder.selected = true;
          select.appendChild(placeholder);
          select.style.fontStyle = 'italic';
          select.style.opacity = '0.75';
        }
        Object.entries(SEGMENT_TYPES).forEach(([key, typeDef]) => {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = typeDef.label;
          if (!isEmpty && key === seg.type) opt.selected = true;
          select.appendChild(opt);
        });
        tdType.appendChild(select);
      }
      row.appendChild(tdType);

      // Adaptive columns from the union
      const segCols = getColumnsForSegment(seg);
      const segColKeys = new Set(segCols.map(c => c.key));
      // Terminal node always exposes WD and HD regardless of its stored type
      if (isLastNode && !isEnclosure) {
        segColKeys.add('WD');
        segColKeys.add('HD');
      }

      colUnion.forEach(col => {
        const td = document.createElement('td');
        td.className = 'p-2 h-12 align-middle';

        // On terminal node: hide Len (the terminal has no length — it is just a section point)
        const hideOnTerminal = isLastNode && !isEnclosure && col.key === 'Len';
        const showCell = segColKeys.has(col.key) && !hideOnTerminal;

        if (showCell) {
          if (col.key === 'VB' && seg.type === 'enclosure') {
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
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-input lem-seg-input h-full w-full';
            input.dataset.wave = wave;
            input.dataset.index = i;
            input.dataset.col = col.key;
            input.value = seg.params[col.key] || '';
            if (col.key === 'portDD' && seg.params.portShape !== 'circle') input.style.display = 'none';
            if ((col.key === 'portWD' || col.key === 'portHD') && seg.params.portShape === 'circle') input.style.display = 'none';
            td.appendChild(input);
          } else {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-input lem-seg-input h-full w-full';
            input.dataset.wave = wave;
            input.dataset.index = i;
            input.dataset.col = col.key;
            input.value = seg.params[col.key] || '';
            if (col.key === 'HD' && (seg.type === 'duct' || seg.type === 'waveguide') && isConstantHeight && constHeightVal) {
              input.readOnly = true;
              input.style.opacity = '0.7';
              input.style.cursor = 'default';
              input.title = 'Set by Constant Height';
            }
            if (col.key === 'WD' && (seg.type === 'duct' || seg.type === 'waveguide') && isConstantWidth && constWidthVal) {
              input.readOnly = true;
              input.style.opacity = '0.7';
              input.style.cursor = 'default';
              input.title = 'Set by Constant Width';
            }
            // The "varying section" column (WD normally, HD when Constant Width is on)
            // inherits from the previous segment's same column ONLY in these cases:
            //   - current row is a Waveguide AND the previous component is a Duct
            //     → WG throat takes the duct's (constant) section (duct↔WG junction).
            //     A pure WG chain (no duct adjacent) keeps every throat freely editable
            //     so the user can describe the full horn profile manually.
            //   - current row is the END (terminal) AND the previous component is a Duct
            //     → end section = duct section (duct has constant cross-section).
            // Two consecutive Ducts keep INDEPENDENT sections (the W/M transition sub-row
            // handles the section change between them).
            const sectionKey = isConstantWidth ? 'HD' : 'WD';
            if (col.key === sectionKey && i > 0) {
              const prevSeg = waveState.segments[i - 1];
              const isTerminalRow = isLastNode && !isEnclosure;
              const shouldInherit =
                (seg.type === 'waveguide' && prevSeg && prevSeg.type === 'duct') ||
                (isTerminalRow && prevSeg && prevSeg.type === 'duct');
              if (shouldInherit) {
                const prevVal = prevSeg.params[sectionKey] || '';
                seg.params[sectionKey] = prevVal;
                input.value = prevVal;
                input.readOnly = true;
                input.style.opacity = '0.7';
                input.style.cursor = 'default';
                input.title = isTerminalRow
                  ? `End section = duct ${i} section (constant cross-section)`
                  : `Waveguide throat inherits duct ${i} section (constant cross-section)`;
              }
            }
            td.appendChild(input);
          }
        }
        row.appendChild(td);
      });

      // Enclosure extras (port shape button + Fb)
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

      // Transition sub-row: only between two consecutive DUCT nodes
      const next = waveState.segments[i + 1];
      if (!isLastNode && seg.type === 'duct' && next && next.type === 'duct') {
        if (!seg.transition) seg.transition = { mode: 'W', len: '' };
        const transRow = document.createElement('tr');
        transRow.className = 'lem-transition-row';
        transRow.dataset.wave = wave;
        transRow.dataset.index = i;

        const mode = seg.transition.mode === 'M' ? 'M' : 'W';

        const tdLabel = document.createElement('td');
        tdLabel.className = 'p-2 h-12 text-center align-middle';
        tdLabel.title = `Copy formula for transition ${i + 1}↔${i + 2}`;
        const copyTransBtn = document.createElement('button');
        copyTransBtn.type = 'button';
        copyTransBtn.className = 'lem-copy-trans-btn text-base font-bold text-green-400 focus:outline-none';
        copyTransBtn.dataset.wave = wave;
        copyTransBtn.dataset.index = i;
        copyTransBtn.textContent = `${i + 1}↔${i + 2}`;
        tdLabel.appendChild(copyTransBtn);
        transRow.appendChild(tdLabel);

        const tdMode = document.createElement('td');
        tdMode.className = 'p-2 h-12 align-middle';
        const modeBtn = document.createElement('button');
        modeBtn.className = 'lem-trans-mode-btn action-btn text-xs';
        modeBtn.style.cssText = 'padding:4px 10px; height:32px;';
        modeBtn.tabIndex = -1; // Tab skips mode button
        modeBtn.dataset.wave = wave;
        modeBtn.dataset.index = i;
        modeBtn.textContent = mode === 'W' ? 'W (Guide)' : 'M (Mass)';
        if (mode === 'M') modeBtn.classList.add('bg-yellow-700');
        modeBtn.title = mode === 'W' ? 'Waveguide transition (has length)' : 'Acoustic mass (no length)';
        tdMode.appendChild(modeBtn);
        transRow.appendChild(tdMode);

        // Fill the column union cells: put the Len input under Len column if mode=W; others empty
        colUnion.forEach(col => {
          const td = document.createElement('td');
          td.className = 'p-2 h-12 align-middle';
          if (col.key === 'Len') {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-input lem-trans-len-input h-full w-full';
            input.dataset.wave = wave;
            input.dataset.index = i;
            input.value = seg.transition.len || '';
            if (mode === 'M') {
              input.disabled = true;
              input.style.opacity = '0.4';
              input.title = 'Disabled in acoustic-mass mode';
            }
            td.appendChild(input);
          }
          transRow.appendChild(td);
        });

        section.tableBody.appendChild(transRow);
      }
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
    // Sync transition sub-row (if any) attached to this index
    const transRow = section.tableBody.querySelector(`.lem-transition-row[data-index="${index}"]`);
    if (transRow) {
      if (!seg.transition) seg.transition = { mode: 'W', len: '' };
      const lenInput = transRow.querySelector('.lem-trans-len-input');
      if (lenInput) seg.transition.len = lenInput.value;
    }
  }

  function syncAllFromDOM(wave) {
    // Include terminal node (at index segmentCount) so its WD/HD are also persisted
    for (let i = 0; i <= state[wave].segmentCount; i++) {
      syncSegmentFromDOM(wave, i);
    }
  }

  function insertSegment(wave, index, before = false) {
    const waveState = state[wave];
    if (waveState.segmentCount >= 19) return; // max 19 components (terminal at index 19 = slot 20)
    syncAllFromDOM(wave);

    const insertionPoint = before ? index : index + 1;
    // Newly added rows start as 'empty' — user will assign a type.
    waveState.segments.splice(insertionPoint, 0, createDefaultSegment('empty'));
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
    waveState.segments.push(createDefaultSegment('empty'));
    waveState.segmentCount--;
    waveState.focusedIndex = -1;

    const section = waveSections[wave];
    section.countInput.value = waveState.segmentCount;
    renderTable(wave);
  }

  function clearWave(wave) {
    const waveState = state[wave];
    const initialType = wave === 'front' ? 'duct' : 'enclosure';
    waveState.segmentCount = 1;
    waveState.segments = Array.from({ length: 20 }, (_, i) =>
      createDefaultSegment(i === 0 ? initialType : 'empty')
    );
    waveState.focusedIndex = -1;

    const section = waveSections[wave];
    section.countInput.value = 1;
    renderTable(wave);
  }

  // ── Formula Generation ──

  /**
   * Global formula format (per-wave):
   *   // Sections (S)
   *   S{i+1} = <WD>    //<TypeLabel><localIdx>
   *   ...
   *   END   = <terminalWD>
   *
   *   //Lengths
   *   L{i+1} = <Len>   //<TypeLabel><localIdx>
   *
   * Per-type local indices restart per wave (Duct1, Duct2, Waveguide1, ...).
   * T-factors grouped at the end, indexed by segment position within the wave.
   * Duct↔Duct waveguide transitions (mode W) are also emitted here as L{a}{b} lines,
   * matching the @L{a}{b} reference used by the per-transition copy button/formula.
   */
  async function generateGlobalFormula() {
    const lines = [];
    const HEAD = '                    ';
    const PAD = (s) => (s + '        ').slice(0, 8); // rough column alignment for inline comments

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

    // Global dimension: height wins when both constant toggles are enabled.
    const constantHeightCb = rootElement.querySelector('#lem-constant-height-cb');
    const constantWidthCb = rootElement.querySelector('#lem-constant-width-cb');
    const dimensionRef = constantHeightCb?.checked || !constantWidthCb?.checked ? '@HEIGHT' : '@WIDTH';
    lines.push('// Global Dimensions');
    lines.push(`H = ${dimensionRef}*@n - (2*@n)*@WOOD_THICKNESS`);

    // Constant Width mode: the fixed dimension is WIDTH, so the varying S-sections must
    // be built from HEIGHT (HD) instead of WIDTH (WD). Constant Height (default) keeps WD.
    const sectionParamKey = constantWidthCb?.checked ? 'HD' : 'WD';

    // Sync DOM then recompute T-factors
    syncAllFromDOM('front');
    syncAllFromDOM('back');
    calculateWaveguideTFactors(state.front.segments, state.front.segmentCount);
    calculateWaveguideTFactors(state.back.segments, state.back.segmentCount);

    const fmtVal = (v) => {
      if (v === undefined || v === '') return '';
      const num = parseFloat(v);
      if (!isFinite(num)) return String(v);
      const mm = convertToMm(num);
      return String(mm);
    };
    const labelOf = (type) => type === 'duct' ? 'Duct' : type === 'waveguide' ? 'Waveguide' : '';

    const enclSegs = [];
    const waveBlocks = [];
    const tFactorLines = []; // collected globally, emitted after all wave blocks

    ['front', 'back'].forEach(wave => {
      const segs = state[wave].segments;
      const N = state[wave].segmentCount;
      if (N === 0) return;

      const block = { wave, sLines: [], lenLines: [], endLine: null };

      // S/L numbering is GLOBAL across waves — back wave continues from where front left off.
      const offset = getWaveSOffset(wave);

      // Per-wave, per-type counters (Duct1, Duct2, Waveguide1, ...)
      let ductLocal = 0, wgLocal = 0;
      const hasChain = [];
      for (let c = 0; c < N; c++) {
        const seg = segs[c];
        if (!seg || seg.type !== 'duct' && seg.type !== 'waveguide') continue;
        hasChain.push(c);
        const tLabel = labelOf(seg.type);
        const localIdx = seg.type === 'duct' ? ++ductLocal : ++wgLocal;
        const sNum = offset + c + 1;
        const prev = c > 0 ? segs[c - 1] : null;
        // A Waveguide inherits its throat (S) only when the preceding component is a Duct.
        // Consecutive waveguides each carry their own throat/mouth (pure horn chain).
        const inheritsSection = seg.type === 'waveguide' && prev && prev.type === 'duct';
        const sRhs = inheritsSection ? `S${offset + c}` : (fmtVal(seg.params[sectionParamKey]) || '0');
        block.sLines.push(`S${sNum} = ${PAD(sRhs)}//${tLabel}${localIdx}`);
        const lenVal = fmtVal(seg.params.Len) || '0';
        block.lenLines.push(`L${sNum} = ${PAD(lenVal)}//${tLabel}${localIdx}`);
        if (seg.type === 'waveguide') {
          const t = seg.params.T;
          if (t !== undefined && t !== '') tFactorLines.push(`T${sNum} = ${PAD(String(t))}//${tLabel}${localIdx}`);
        }

        // Duct↔Duct waveguide transition: emit its own length constant L{a}{b}
        // so it's included alongside the rest of the wave's Lengths block.
        const nextSeg = segs[c + 1];
        const isDuctToDuctTransition = seg.type === 'duct' && nextSeg && nextSeg.type === 'duct';
        if (isDuctToDuctTransition && seg.transition && seg.transition.mode !== 'M') {
          const a = sNum;
          const b = offset + c + 2;
          const transLenVal = fmtVal(seg.transition.len) || '0';
          block.lenLines.push(`L${a}${b} = ${PAD(transLenVal)}//Transition ${a}↔${b} (Waveguide)`);
        }
      }

      // Terminal (only if wave has at least one duct/waveguide)
      if (hasChain.length > 0) {
        const terminal = segs[N];
        const prevComp = segs[N - 1];
        const endInherits = prevComp && prevComp.type === 'duct';
        const endLabel = getWaveEndLabel(wave);
        if (endInherits) {
          block.endLine = `${endLabel} = ${PAD('S' + (offset + N))}//terminal (inherits from Duct)`;
        } else {
          const endVal = terminal ? fmtVal(terminal.params[sectionParamKey]) : '';
          block.endLine = `${endLabel} = ${endVal || '0'}`;
        }
      }

      // Collect enclosures
      for (let k = 0; k <= N; k++) {
        if (segs[k] && segs[k].type === 'enclosure') enclSegs.push(segs[k]);
      }

      waveBlocks.push(block);
    });

    // Emit per-wave blocks
    waveBlocks.forEach(block => {
      const title = block.wave === 'front' ? 'Front Wave' : 'Back Wave';
      // Always emit the wave heading, even if the wave is just enclosure
      lines.push('');
      lines.push(`${HEAD}// ─── ${title} ───`);
      if (block.sLines.length) {
        lines.push('// Sections (S)');
        block.sLines.forEach(l => lines.push(l));
        if (block.endLine) lines.push(block.endLine);
        lines.push('');
        lines.push('//Lengths');
        block.lenLines.forEach(l => lines.push(l));
      }
    });

    // Enclosure definitions — numbered to match intrinsic component formulas (@Vb1, @Lb1, …)
    if (enclSegs.length > 0) {
      lines.push('');
      lines.push('// Enclosure Definition');
      enclSegs.forEach((seg, idx) => {
        const n = idx + 1;
        const mode = seg.params.ventedMode || 'sealed';
        const vbVal = (seg.params.VB !== undefined && seg.params.VB !== '') ? seg.params.VB : '0';
        const lbRaw = fmtVal(seg.params.LenCab);
        const lbVal = lbRaw !== '' ? lbRaw : '0';
        lines.push(`Vb${n}=${vbVal}`);
        lines.push(`Lb${n}=${lbVal}`);
        if (mode === 'vented') {
          const portLen = fmtVal(seg.params.portLen);
          lines.push(`PortLen${n}=${portLen !== '' ? portLen : '0'}`);
          if (seg.params.portShape === 'circle') {
            const dD = fmtVal(seg.params.portDD);
            lines.push(`dD${n} = ${dD !== '' ? dD : '0'}`);
          } else {
            const wD = fmtVal(seg.params.portWD);
            const hD = fmtVal(seg.params.portHD);
            lines.push(`wDP${n} = ${wD !== '' ? wD : '0'}`);
            lines.push(`hDP${n} = ${hD !== '' ? hD : '0'}`);
          }
        }
      });
    }

    // T-Factors block (globally, at the end)
    if (tFactorLines.length > 0) {
      lines.push('');
      lines.push(`${HEAD}// ─── T-Factors ───`);
      lines.push('');
      tFactorLines.forEach(l => lines.push(l));
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
        wood: rootElement.querySelector('#lem-global-wood')?.value?.trim() || '0.02',
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
      const oldCount = waveState.segmentCount;
      const newCount = Math.max(1, Math.min(19, parseInt(section.countInput.value, 10) || 1)); // max 19 components (terminal uses slot 20)
      waveState.segmentCount = newCount;
      section.countInput.value = newCount;

      // Ensure enough segments exist, and (re)initialise newly revealed slots as 'empty'
      while (waveState.segments.length < 20) waveState.segments.push(createDefaultSegment('empty'));
      if (newCount > oldCount) {
        for (let k = oldCount; k < newCount; k++) {
          const existing = waveState.segments[k];
          // Only replace if the slot wasn't already user-assigned (i.e. still has no meaningful data)
          const isUntouched = !existing
            || existing.type === 'empty'
            || (existing.type === 'duct' && !existing.params.WD && !existing.params.Len)
            || (existing.type === 'enclosure' && !existing.params.VB && !existing.params.LenCab);
          if (isUntouched) waveState.segments[k] = createDefaultSegment('empty');
        }
      }

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

    // Keyboard navigation: arrow keys move between editable inputs in the grid.
    // Tab / Shift+Tab moves to next/prev editable input, skipping selects and buttons.
    section.tableBody.addEventListener('keydown', e => {
      const input = e.target;
      if (!input.matches('input[type="text"]:not([disabled]):not([readonly])')) return;

      // Tab / Shift+Tab — collect all focusable text inputs in DOM order, skip forward/back
      if (e.key === 'Tab') {
        e.preventDefault();
        const all = Array.from(section.tableBody.querySelectorAll(
          'input[type="text"]:not([disabled]):not([readonly])'
        ));
        const idx = all.indexOf(input);
        if (idx === -1) return;
        const next = all[e.shiftKey ? idx - 1 : idx + 1];
        if (next) { next.focus(); next.select(); }
        return;
      }

      // Arrow keys — move within the grid by row/column
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();

      const currentRow = input.closest('tr');
      const currentCol = input.dataset.col;
      if (!currentRow || !currentCol) return;

      // Build an ordered list of all inputs inside each row (segment rows only)
      const allRows = Array.from(section.tableBody.querySelectorAll(
        'tr.lem-segment-row, tr.lem-transition-row'
      ));
      const rowIdx = allRows.indexOf(currentRow);
      if (rowIdx === -1) return;

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const step = e.key === 'ArrowDown' ? 1 : -1;
        // Walk rows in the given direction looking for a matching col input
        for (let r = rowIdx + step; r >= 0 && r < allRows.length; r += step) {
          const candidate = allRows[r].querySelector(
            `input[type="text"][data-col="${currentCol}"]:not([disabled]):not([readonly])`
          );
          if (candidate) { candidate.focus(); candidate.select(); return; }
        }
        return;
      }

      // ArrowLeft / ArrowRight — move between columns within the same row
      const rowInputs = Array.from(
        currentRow.querySelectorAll('input[type="text"]:not([disabled]):not([readonly])')
      );
      const colIdx = rowInputs.indexOf(input);
      if (colIdx === -1) return;
      const sibling = rowInputs[e.key === 'ArrowRight' ? colIdx + 1 : colIdx - 1];
      if (sibling) { sibling.focus(); sibling.select(); }
    });

    section.tableBody.addEventListener('input', e => {
      const input = e.target;

      // Transition sub-row length input
      if (input.classList.contains('lem-trans-len-input')) {
        const idx = parseInt(input.dataset.index, 10);
        if (isNaN(idx)) return;
        const seg = state[wave].segments[idx];
        if (!seg.transition) seg.transition = { mode: 'W', len: '' };
        seg.transition.len = input.value;
        return;
      }

      if (!input.classList.contains('lem-seg-input')) return;
      const idx = parseInt(input.dataset.index, 10);
      const col = input.dataset.col;
      if (isNaN(idx) || !col) return;

      state[wave].segments[idx].params[col] = input.value;

      // Recalculate T-factors when any node WD or component Len changes
      // (throat/mouth of WG are read from adjacent node WDs in the new model)
      if (col === 'WD' || col === 'Len') {
        calculateWaveguideTFactors(state[wave].segments, state[wave].segmentCount);
        section.tableBody.querySelectorAll('.lem-seg-input[data-col="T"]').forEach(tInput => {
          const tIdx = parseInt(tInput.dataset.index, 10);
          tInput.value = state[wave].segments[tIdx].params.T || '';
        });
      }

      // Update Fb display for vented enclosures
      const seg = state[wave].segments[idx];
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
        const N = state[wave].segmentCount;
        const offset = getWaveSOffset(wave);
        const mouthRef = (idx < N - 1) ? `S${offset + idx + 2}` : getWaveEndLabel(wave);
        const formula = generateSegmentFormula(seg, offset + idx + 1, { mouthRef });
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

      // Transition mode toggle (W ↔ M)
      if (target.classList.contains('lem-trans-mode-btn')) {
        const idx = parseInt(target.dataset.index, 10);
        const seg = state[wave].segments[idx];
        syncSegmentFromDOM(wave, idx);
        if (!seg.transition) seg.transition = { mode: 'W', len: '' };
        seg.transition.mode = seg.transition.mode === 'M' ? 'W' : 'M';
        renderTable(wave);
        return;
      }

      // Copy transition formula (W = waveguide / M = acoustic mass)
      if (target.classList.contains('lem-copy-trans-btn')) {
        const idx = parseInt(target.dataset.index, 10);
        const seg = state[wave].segments[idx];
        syncSegmentFromDOM(wave, idx);
        if (!seg.transition) seg.transition = { mode: 'W', len: '' };
        const indices = computeTransitionIndices(wave, idx);
        if (indices.sA == null || indices.sB == null) {
          flashButtonColor(target, 500);
          return;
        }
        const formula = buildTransitionFormula(seg.transition.mode, indices.sA, indices.sB);
        navigator.clipboard.writeText(formula);
        flashButtonColor(target, 500);
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
  const constantWidthCb = rootElement.querySelector('#lem-constant-width-cb');
  const globalHeightInput = rootElement.querySelector('#lem-global-height');
  const globalWidthInput = rootElement.querySelector('#lem-global-width');
  const globalWoodThicknessInput = rootElement.querySelector('#lem-global-wood-thickness');

  function applyConstantHeight() {
    if (!constantHeightCb || !constantHeightCb.checked) return;
    const heightVal = globalHeightInput ? globalHeightInput.value.trim() : '';
    if (!heightVal) return;
    ['front', 'back'].forEach(wave => {
      const N = state[wave].segmentCount;
      for (let i = 0; i <= N; i++) {
        const s = state[wave].segments[i];
        if (s && (s.type === 'duct' || s.type === 'waveguide')) {
          s.params.HD = heightVal;
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

  function applyConstantWidth() {
    if (!constantWidthCb || !constantWidthCb.checked) return;
    const widthVal = globalWidthInput ? globalWidthInput.value.trim() : '';
    if (!widthVal) return;
    ['front', 'back'].forEach(wave => {
      const N = state[wave].segmentCount;
      const woodThickness = parseFloat(globalWoodThicknessInput?.value) || 0;
      const numericWidth = parseFloat(widthVal);
      const insideWidth = isFinite(numericWidth)
        ? String(numericWidth - (2 * woodThickness))
        : widthVal;
      for (let i = 0; i <= N; i++) {
        const s = state[wave].segments[i];
        if (s && (s.type === 'duct' || s.type === 'waveguide')) {
          s.params.WD = insideWidth;
        }
      }
      renderTable(wave);
    });
  }

  if (constantWidthCb) {
    constantWidthCb.addEventListener('change', () => {
      applyConstantWidth();
      if (!constantWidthCb.checked) {
        ['front', 'back'].forEach(wave => renderTable(wave));
      }
    });
  }
  if (globalWidthInput) {
    globalWidthInput.addEventListener('input', () => {
      if (constantWidthCb && constantWidthCb.checked) applyConstantWidth();
    });
  }
  if (globalWoodThicknessInput) {
    globalWoodThicknessInput.addEventListener('input', () => {
      if (constantHeightCb && constantHeightCb.checked) applyConstantHeight();
      if (constantWidthCb && constantWidthCb.checked) applyConstantWidth();
    });
  }

  // ── Global Constants Generation ──

  function generateGlobalConstants() {
    const woodThickness = rootElement.querySelector('#lem-global-wood-thickness')?.value?.trim() || '18';
    const damping = rootElement.querySelector('#lem-global-damping')?.value?.trim() || '0.1';
    const wood = rootElement.querySelector('#lem-global-wood')?.value?.trim() || '0.02';
    const width = rootElement.querySelector('#lem-global-width')?.value?.trim() || '';
    const height = rootElement.querySelector('#lem-global-height')?.value?.trim() || '';
    const dept = rootElement.querySelector('#lem-global-dept')?.value?.trim() || '';

    const lines = [];
    lines.push('////////CONSTANTE/////////');
    lines.push(`WOOD_THICKNESS = ${woodThickness}`);
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
    lines.push('HOUT1 = 150 ');
    lines.push('WOUT1 = WIDTH - 2*WOOD_THICKNESS');
    lines.push('OOUT1 = 0');
    lines.push('');
    lines.push('HOUT2 = 150 ');
    lines.push('WOUT2 = WIDTH - 2*WOOD_THICKNESS');
    lines.push('OOUT2 = 0');
    lines.push('//////////TOOLS//////////');
    lines.push('IB = -(HEIGHT/2)');
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

  if (generateBtn) {
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
  }

  // ── Settings sync ──

  window.panelEvents.addEventListener('settings-updated', (e) => {
    templates = { ...defaultTemplates, ...e.detail?.newSettings?.templates };
  });

  // ── Export-to event (from horn panel) ──

  window.panelEvents.addEventListener('export-to-hornscript', (e) => {
    const { segments, count, unit, wave } = e.detail;
    if (!segments || !count || count < 2) return;

    const targetWave = wave === 'back' ? 'back' : 'front';
    const waveState = state[targetWave];

    // The horn table is node-based: `count` rows = `count` nodes, `count-1` actual segments.
    // The last row carries w=mouth, l=0 and must become the terminal node, not a component.
    const numComponents = Math.min(count - 1, 19); // max 19 components (slot 20 = terminal)
    waveState.segmentCount = numComponents;
    waveSections[targetWave].countInput.value = numComponents;

    if (currentUnit !== unit) {
      currentUnit = unit;
      unitSwitchBtn.textContent = unit;
    }

    // Create one waveguide component per inter-node segment (rows 0 .. numComponents-1)
    for (let i = 0; i < numComponents; i++) {
      const segData = segments[i];
      if (!segData) continue;
      waveState.segments[i] = {
        type: 'waveguide',
        params: {
          ...SEGMENT_TYPES.waveguide.defaults,
          WD: String(convertFromMm(segData.w)),
          Len: String(convertFromMm(segData.l)),
          T: '',
        },
        transition: { mode: 'W', len: '' },
      };
    }

    // Terminal node at index numComponents carries the mouth width (last horn row)
    const mouthRow = segments[numComponents]; // index = last horn row
    waveState.segments[numComponents] = {
      type: 'waveguide',
      params: {
        ...SEGMENT_TYPES.waveguide.defaults,
        WD: String(convertFromMm(mouthRow ? mouthRow.w : (segments[numComponents - 1]?.w ?? 0))),
      },
      transition: { mode: 'W', len: '' },
    };

    renderTable(targetWave);
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
