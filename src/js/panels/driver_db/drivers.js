// =======================================================
// FICHIER :  src/js/panels/drivers/drivers.js
// RÔLE    :  Gestion base HP — AMÉLIORATIONS PERF & UI
//   • Bouton d'import par image déplacé dans la vue d'import manuelle.
//   • parseDriverContent++ : unités, exponents, commentaires, dérivés
//   • Virtualisation liste (virtListRender) pour gros volumes
//   • Debounce search + reset stable, scroll conservation
//   • Feedback d’erreurs parsing
// =======================================================

import { getSettings } from '../mainsettings/mainsettings.js';
import { showImageImportView } from './imageImporter.js';
import { renderScrapperView } from './scrapper/scrapper.js';
function getDatabaseViewHtml() {
  const filterableParams = ['SD', 'Mms', 'fs', 'Qms', 'Re', 'BL', 'Le'];
  const filterCheckboxesHtml = filterableParams.map(param => `
    <div class="flex items-center">
      <input type="checkbox" id="check-${param}" data-param="${param}" class="form-checkbox">
      <label for="check-${param}" class="ml-2 text-white">${param}</label>
    </div>
  `).join('');
  return `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 flex-grow overflow-auto">
      <div class="md:col-span-1 flex flex-col h-[80vh] bg-gray-900/50 p-4 rounded-md calc-section">
        <input type="search" id="driver-search" placeholder="Search by name…" class="form-input mb-4 flex-shrink-0">
        <details class="flex-shrink-0 mb-4">
          <summary class="cursor-pointer text-white font-bold">Advanced Filters</summary>
          <div class="p-3 mt-2 rounded-md calc-section">
            <div class="grid grid-cols-3 gap-2 mb-4">${filterCheckboxesHtml}</div>
            <div id="filter-inputs-container" class="space-y-2 border-t pt-2" style="border-color: var(--theme-accent-dark)"></div>
            <div class="text-center pt-2 mt-2"><button id="reset-filters-btn" class="text-link">Reset</button></div>
          </div>
        </details>
        <div id="driver-list-container" class="overflow-y-auto flex-grow"></div>
      </div>
      <div class="md:col-span-2 flex flex-col h-full bg-gray-900/50 p-4 rounded-md calc-section">
        <div class="flex items-center justify-between border-b pb-2 mb-4 flex-shrink-0" style="border-color: var(--theme-accent-dark)">
          <h2 id="driver-preview-title" class="calc-title text-2xl">Select a driver</h2>
          <button id="compare-driver-btn" class="btn btn--accent btn--sm" disabled title="Find similar drivers based on parameters">Find Similar</button>
        </div>
        <textarea id="driver-preview-content" class="flex-grow w-full bg-transparent text-white border-0 focus:ring-0 whitespace-pre font-mono" readonly></textarea>
        <div id="compare-results" class="mt-3 hidden text-sm bg-black/30 border rounded-md p-3" style="border-color: var(--theme-accent-dark)">
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold text-white">Similar drivers</span>
            <button id="clear-compare-results" class="text-link text-xs">Clear</button>
          </div>
          <div id="compare-results-list" class="space-y-1 text-gray-200"></div>
        </div>
        <div class="text-right pt-4 flex-shrink-0 space-x-4">
            <button id="delete-driver-btn" class="action-btn" disabled>Delete</button>
            <button id="edit-driver-btn" class="action-btn" disabled>Edit</button>
            <button id="save-driver-btn" class="action-btn" style="display: none;">Save</button>
            <button id="copy-driver-btn" class="action-btn" disabled>Copy</button>
        </div>
      </div>
    </div>
  `;
}

function getImportViewHtml() {
  return `
    <div class="p-6 h-full flex flex-col items-center">
      <div class="flex justify-between items-center w-full max-w-2xl mb-6">
        <h2 class="text-3xl font-bold text-white">Import a New Driver</h2>
        <button id="import-image-view-btn" class="btn btn--secondary" title="Import from an image">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="inline-block -mt-1 mr-2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          Import from Image
        </button>
      </div>
      <div class="w-full max-w-2xl">
        <div class="mb-6">
          <label class="font-bold text-white">File Name</label>
          <input type="text" id="import-name" class="form-input mt-1">
        </div>
        <div class="grid grid-cols-2 gap-x-8 gap-y-3">
          <label for="import-sd" class="text-white">SD <span class="text-gray-400 text-sm">(cm²)</span></label>
          <input type="text" id="import-sd" class="form-input form-input-sm" placeholder="ex: 530">
          
          <label for="import-mms" class="text-white">Mms <span class="text-gray-400 text-sm">(g)</span></label>
          <input type="text" id="import-mms" class="form-input form-input-sm" placeholder="ex: 184">
          
          <label for="import-fs" class="text-white">fs <span class="text-gray-400 text-sm">(Hz)</span></label>
          <input type="number" step="any" id="import-fs" class="form-input form-input-sm" placeholder="ex: 0.5">
          
          <label for="import-qms" class="text-white">Qms <span class="text-gray-400 text-sm">(sans unité)</span></label>
          <input type="number" step="any" id="import-qms" class="form-input form-input-sm" placeholder="ex: 7.">
          
          <label for="import-re" class="text-white">Re <span class="text-gray-400 text-sm">(Ω)</span></label>
          <input type="number" step="any" id="import-re" class="form-input form-input-sm" placeholder="ex: 5.">
          
          <label for="import-bl" class="text-white">BL <span class="text-gray-400 text-sm">(N/A)</span></label>
          <input type="number" step="any" id="import-bl" class="form-input form-input-sm" placeholder="ex: .8">
          
          <label for="import-le" class="text-white">Le <span class="text-gray-400 text-sm">(mH)</span></label>
          <input type="text" id="import-le" class="form-input form-input-sm" placeholder="ex: 0.">
          
          <label for="import-vol" class="text-white">Speaker Volume <span class="text-gray-400 text-sm">(L)</span></label>
          <input type="number" step="any" id="import-vol" class="form-input form-input-sm" placeholder="">
        </div>
        <div id="import-status" class="text-center h-6 pt-4"></div>
        <div class="text-center pt-4 mt-4">
          <button id="save-import-btn" class="btn btn--accent btn--lg">Save Driver</button>
        </div>
      </div>
    </div>
  `;
}

// --- Parsing amélioré
function parseDriverContent(content) {
  const params = {};
  if (!content) return params;
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*(\w+)\s*=\s*([-+]?\d+(?:[\.,]\d+)?)(?:\s*([a-zA-Zµ^0-9]+))?/);
    if (!m) continue;
    const key = m[1];
    let val = parseFloat(m[2].replace(',', '.'));
    let unit = (m[3] || '').trim();
    if (key === 'Le') {
      if (/mH/i.test(unit)) val *= 1e-3; else if (/uH|µH/i.test(unit)) val *= 1e-6;
    }
    if (key === 'Sd') {
      if (/cm\^?2/i.test(unit)) val *= 1e-4; else if (/mm\^?2/i.test(unit)) val *= 1e-6;
      if (val > 10) val *= 1e-4;
    }
    if (key === 'Mms') {
      if (/g/i.test(unit)) val /= 1000;
      if (val > 1) val /= 1000;
    }
    params[key] = val;
  }
  if (params.SDr && !params.SD) params.SD = params.SDr;
  else if (params.SDf && !params.SD) params.SD = params.SDf;
  if (!params.Qts && params.Qes && params.Qms) params.Qts = (params.Qes * params.Qms) / (params.Qes + params.Qms);
  return params;
}

// Virtualisation simple pour listes massives
function virtListRender(container, items, renderItem, rowH = 36) {
  const viewport = container;
  const spacer = document.createElement('div');
  spacer.style.height = `${items.length * rowH}px`;
  spacer.style.position = 'relative';
  viewport.innerHTML = ''; viewport.appendChild(spacer);

  function draw() {
    const scrollTop = viewport.scrollTop;
    const h = viewport.clientHeight;
    const start = Math.max(0, Math.floor(scrollTop / rowH) - 5);
    const end = Math.min(items.length, Math.ceil((scrollTop + h) / rowH) + 5);
    spacer.innerHTML = '';
    for (let i = start; i < end; i++) {
      const y = i * rowH;
      const el = document.createElement('div');
      el.style.position = 'absolute'; el.style.top = y + 'px'; el.style.left = '0'; el.style.right = '0'; el.style.height = rowH + 'px';
      el.innerHTML = renderItem(items[i]);
      spacer.appendChild(el);
    }
  }
  viewport.addEventListener('scroll', () => requestAnimationFrame(draw));
  draw();
}

export function getDriversPanelHtml() {
  return `
    <div class="p-6 h-full flex flex-col">
      <div class="flex justify-between items-center mb-6 flex-shrink-0">
        <h1 class="text-4xl font-bold text-white">Driver Database</h1>
        <div>
          <button id="db-view-btn" class="btn btn--primary">Database</button>
          <button id="import-view-btn" class="btn btn--primary">Import</button>
          <button id="scrapper-view-btn" class="btn btn--primary">Search</button>
          <button id="pop-out-btn" data-tool="drivers" title="Open in a new window" class="btn btn--ghost p-2 ml-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
        </div>
      </div>
      <div id="drivers-view-container" class="flex-grow overflow-auto"></div>
    </div>
  `;
}

export function initializeDriversPanel() {
  const viewContainer = document.getElementById('drivers-view-container');
  const dbViewBtn = document.getElementById('db-view-btn');
  const importViewBtn = document.getElementById('import-view-btn');
  const scrapperViewBtn = document.getElementById('scrapper-view-btn');

  let allParsedDrivers = [];
  let currentDriver = null;

  // Helpers shared across views
  const buildContentFromParams = (p, extra = {}) => {
    const lines = [
      `SDf = ${p.SDf ?? ''}`,
      `SDr = ${p.SDr ?? ''}`,
      `Mms = ${p.Mms ?? ''}`,
      `fs = ${p.fs ?? ''}`,
      `Qms = ${p.Qms ?? ''}`,
      `Re = ${p.Re ?? ''}`,
      `BL = ${p.BL ?? ''}`,
      `Le = ${p.Le ?? ''}`
    ];
    if (extra.speakerVolume !== undefined) {
      lines.push(`//Speaker volume = ${extra.speakerVolume}`);
    }
    return lines.join('\n');
  };

  // Heuristic: detect SI units mistakenly saved and convert back to expected units
  // Expected units in DB: SDf/SDr in cm², Mms in g, Le in mH
  const normalizeDriverUnits = (params) => {
    const p = { ...params };
    let corrected = false;
    if (typeof p.SDf === 'number' && p.SDf > 0 && p.SDf <= 5) { p.SDf = +(p.SDf * 1e4).toFixed(2); corrected = true; }
    if (typeof p.SDr === 'number' && p.SDr > 0 && p.SDr <= 5) { p.SDr = +(p.SDr * 1e4).toFixed(2); corrected = true; }
    if (typeof p.Mms === 'number' && p.Mms > 0 && p.Mms < 10) { p.Mms = +(p.Mms * 1000).toFixed(2); corrected = true; }
    if (typeof p.Le === 'number' && p.Le > 0 && p.Le < 0.05) { p.Le = +(p.Le * 1000).toFixed(3); corrected = true; }
    return { params: p, corrected };
  };

  function renderLoader(message = 'Chargement des drivers…') {
    viewContainer.innerHTML = `<div class="w-full h-full flex flex-col items-center justify-center gap-3"><div class="animate-spin w-10 h-10 rounded-full border-4 border-white/20 border-t-white"></div><p class="text-white/80 text-sm">${message}</p></div>`;
  }

  async function loadAndParseAllDrivers() {
    // Toujours recharger depuis le backend pour avoir les données à jour
    let driversFromBackend = await window.electronAPI.getAllDrivers();
    allParsedDrivers = driversFromBackend.map(driver => ({ ...driver, params: parseDriverContent(driver.content) }));
    window.__driversCacheDrivers = driversFromBackend;
  }

  function attachDatabaseViewLogic() {
    const listContainer = document.getElementById('driver-list-container');
    const searchInput = document.getElementById('driver-search');
    const previewTitle = document.getElementById('driver-preview-title');
    const previewContent = document.getElementById('driver-preview-content');
    const deleteBtn = document.getElementById('delete-driver-btn');
    const editBtn = document.getElementById('edit-driver-btn');
    const saveBtn = document.getElementById('save-driver-btn');
    const copyBtn = document.getElementById('copy-driver-btn');
    const filterInputsContainer = document.getElementById('filter-inputs-container');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    const compareBtn = document.getElementById('compare-driver-btn');
    const compareResultsContainer = document.getElementById('compare-results');
    const compareResultsList = document.getElementById('compare-results-list');
    const clearCompareBtn = document.getElementById('clear-compare-results');

    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    const clearCompareResults = () => {
      if (compareResultsContainer) {
        compareResultsContainer.classList.add('hidden');
      }
      if (compareResultsList) {
        compareResultsList.innerHTML = '';
      }
    };

    const selectDriverByName = (driverName) => {
      const found = allParsedDrivers.find(d => d.name === driverName);
      if (!found) return;
      currentDriver = found;
      clearCompareResults();
      previewTitle.textContent = found.name;
      previewContent.value = found.content;
      deleteBtn.disabled = false;
      editBtn.disabled = false;
      copyBtn.disabled = false;
      compareBtn.disabled = false;
      previewContent.readOnly = true;
      previewContent.classList.remove('editing-active');
      saveBtn.style.display = 'none';
      editBtn.style.display = 'inline-block';
      const previouslySelected = listContainer.querySelector('.driver-item.bg-green-600');
      if (previouslySelected) previouslySelected.classList.remove('bg-green-600');
      let item;
      try {
        item = listContainer.querySelector(`.driver-item[data-driver-name="${CSS.escape(driverName)}"]`);
      } catch (err) {
        const safeName = driverName.replace(/"/g, '\\"');
        item = listContainer.querySelector(`.driver-item[data-driver-name="${safeName}"]`);
      }
      if (item) item.classList.add('bg-green-600');
    };

    const computeSimilarDrivers = (baseDriver, paramsToCompare, limit = 5) => {
      if (!baseDriver) return [];
      const results = [];
      for (const driver of allParsedDrivers) {
        if (driver.name === baseDriver.name) continue;
        let distanceSum = 0;
        let used = 0;
        const deltas = [];
        paramsToCompare.forEach(param => {
          const baseVal = baseDriver.params?.[param];
          const otherVal = driver.params?.[param];
          if (baseVal === undefined || otherVal === undefined) return;
          const norm = Math.max(Math.abs(baseVal), 1e-6);
          const diff = Math.abs(baseVal - otherVal) / norm;
          distanceSum += diff;
          used += 1;
          deltas.push({ param, baseVal, otherVal, percent: diff * 100 });
        });
        if (used === 0) continue;
        results.push({ driver, distance: distanceSum / used, deltas });
      }
      return results
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);
    };

    const renderCompareResults = (results, paramsUsed) => {
      if (!compareResultsContainer || !compareResultsList) return;
      if (!results.length) {
        compareResultsList.innerHTML = '<div class="text-xs text-gray-400">No close drivers with these parameters.</div>';
        compareResultsContainer.classList.remove('hidden');
        return;
      }
      const lines = results.map(res => {
        const summary = paramsUsed.map(param => {
          const delta = res.deltas.find(d => d.param === param);
          if (!delta) return `${param}: n/a`;
          const sign = delta.percent >= 0 ? '+' : '';
          return `${param}: ${sign}${delta.percent.toFixed(1)}%`;
        }).join(' \u00b7 ');
        const pctLabel = `${(res.distance * 100).toFixed(1)}% diff`;
        return `<button class="w-full text-left px-2 py-2 rounded hover:bg-gray-800/70 border border-transparent hover:border-gray-700 flex items-start justify-between gap-3" data-driver-name="${res.driver.name}">
            <div>
              <div class="font-semibold text-white">${res.driver.name}</div>
              <div class="text-xs text-gray-400">${summary}</div>
            </div>
            <span class="text-xs px-2 py-1 rounded bg-gray-800 text-gray-200">${pctLabel}</span>
          </button>`;
      }).join('');
      compareResultsList.innerHTML = lines;
      compareResultsContainer.classList.remove('hidden');
    };

    const removeCompareToast = () => {
      const overlay = document.querySelector('.compare-config-overlay');
      if (overlay) overlay.remove();
    };

    const openCompareToast = () => {
      if (!currentDriver) return;
      removeCompareToast();
      const candidateParams = ['SD', 'Mms', 'fs', 'Qms', 'Qes', 'Qts', 'Re', 'BL', 'Le'];
      const availableParams = candidateParams.filter(p => currentDriver.params?.[p] !== undefined);
      const defaults = availableParams.slice(0, 3);
      const paramCheckboxes = availableParams.map(param => {
        const checked = defaults.includes(param) ? 'checked' : '';
        return `<label style="display: flex; align-items: center; gap: 8px; color: var(--text-body); font-size: 13px; cursor: pointer;"><input type="checkbox" class="form-checkbox" data-param="${param}" ${checked} style="accent-color: var(--border-primary); cursor: pointer;">${param}</label>`;
      }).join('');
      const overlay = document.createElement('div');
      overlay.className = 'compare-config-overlay fixed inset-0 z-50 flex items-center justify-center';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      overlay.style.backdropFilter = 'blur(2px)';

      const toast = document.createElement('div');
      toast.className = 'compare-config-toast rounded-lg shadow-2xl';
      toast.style.width = '480px';
      toast.style.maxWidth = '90vw';
      toast.style.backgroundColor = 'var(--bg-panel)';
      toast.style.border = '2px solid var(--border-primary)';
      toast.style.display = 'flex';
      toast.style.flexDirection = 'column';
      toast.innerHTML = `
        <div style="padding: 20px 24px; border-bottom: 1px solid var(--border-secondary); display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
          <div>
            <h2 style="color: var(--text-title); font-size: 18px; font-weight: 600; margin: 0 0 4px 0;">Find Similar Drivers</h2>
            <p style="color: var(--text-muted); font-size: 13px; margin: 0;">Find drivers with similar specifications</p>
          </div>
          <button data-close-toast style="color: var(--text-muted); cursor: pointer; background: transparent; border: none; font-size: 24px; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div style="padding: 20px 24px; display: flex; flex-direction: column; gap: 20px;">
          <div>
            <label style="display: block; color: var(--text-subtitle); font-size: 13px; font-weight: 600; margin-bottom: 8px;">Max Results</label>
            <input id="compare-count" type="number" min="1" max="10" value="3" style="width: 100%; padding: 10px 12px; background-color: var(--bg-control-group); border: 1px solid var(--border-secondary); border-radius: 4px; color: var(--text-body); font-size: 14px; font-family: inherit;">
          </div>
          
          <div>
            <label style="display: block; color: var(--text-subtitle); font-size: 13px; font-weight: 600; margin-bottom: 12px;">Compare by</label>
            <div style="display: grid; grid-cols-cols: repeat(3, 1fr); gap: 12px;">${paramCheckboxes || '<div style="color: var(--text-muted); font-size: 12px;">No comparable parameters</div>'}</div>
          </div>
          
          <div id="compare-error" style="color: rgb(239, 68, 68); font-size: 13px; font-weight: 500; display: none;"></div>
        </div>
        
        <div style="padding: 16px 24px; border-top: 1px solid var(--border-secondary); display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <span style="color: var(--text-muted); font-size: 11px;">Normalized difference scoring</span>
          <div style="display: flex; gap: 8px;">
            <button data-close-toast style="padding: 8px 16px; border-radius: 4px; border: 1px solid var(--border-secondary); background-color: transparent; color: var(--text-muted); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: inherit;">Cancel</button>
            <button id="run-compare-btn" style="padding: 8px 16px; border-radius: 4px; border: none; background-color: var(--btn-primary-border); color: white; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit;">Find Drivers</button>
          </div>
        </div>
      `;
      overlay.appendChild(toast);
      document.body.appendChild(overlay);

      const closeButtons = toast.querySelectorAll('[data-close-toast]');
      closeButtons.forEach(btn => btn.addEventListener('click', removeCompareToast));
      const runBtn = toast.querySelector('#run-compare-btn');
      const countInput = toast.querySelector('#compare-count');
      const errorLabel = toast.querySelector('#compare-error');
      if (runBtn) {
        runBtn.addEventListener('click', () => {
          errorLabel.style.display = 'none';
          errorLabel.textContent = '';
          const count = Math.min(10, Math.max(1, parseInt(countInput.value, 10) || 3));
          const selectedParams = Array.from(toast.querySelectorAll('input[data-param]:checked')).map(el => el.dataset.param);
          if (!selectedParams.length) {
            errorLabel.textContent = 'Please select at least one parameter';
            errorLabel.style.display = 'block';
            return;
          }
          const results = computeSimilarDrivers(currentDriver, selectedParams, count);
          renderCompareResults(results, selectedParams);
          removeCompareToast();
        });
      }
    };

    function applyFiltersAndSearch() {
      const searchTerm = (searchInput.value || '').toLowerCase();
      const activeFilters = {};
      filterInputsContainer.querySelectorAll('.filter-range-input').forEach(container => {
        const param = container.dataset.param;
        const minVal = parseFloat(container.querySelector('.min-input').value);
        const maxVal = parseFloat(container.querySelector('.max-input').value);
        activeFilters[param] = { min: isNaN(minVal) ? -Infinity : minVal, max: isNaN(maxVal) ? Infinity : maxVal };
      });
      const filtered = allParsedDrivers.filter(driver => {
        if (searchTerm && !driver.name.toLowerCase().includes(searchTerm)) return false;
        for (const param in activeFilters) {
          const val = driver.params[param];
          if (val === undefined || val < activeFilters[param].min || val > activeFilters[param].max) return false;
        }
        return true;
      });

      virtListRender(listContainer, filtered, d => `<div class="driver-item p-2 rounded-md cursor-pointer hover:bg-green-700 hover:text-white" data-driver-name="${d.name}">${d.name}</div>`);
    }

    function updateFilterInputs() {
      document.querySelectorAll('.form-checkbox[data-param]').forEach(checkbox => {
        const param = checkbox.dataset.param;
        const existingInput = filterInputsContainer.querySelector(`.filter-range-input[data-param="${param}"]`);
        if (checkbox.checked && !existingInput) {
          const newInputHtml = `<div class="grid grid-cols-3 gap-2 items-center filter-range-input" data-param="${param}"><label for="${param}-min" class="text-white text-sm">${param}</label><input type="number" id="${param}-min" step="any" class="form-input form-input-sm min-input" placeholder="min"><input type="number" id="${param}-max" step="any" class="form-input form-input-sm max-input" placeholder="max"></div>`;
          filterInputsContainer.insertAdjacentHTML('beforeend', newInputHtml);
          filterInputsContainer.lastElementChild.querySelectorAll('input').forEach(input => input.addEventListener('input', applyFiltersAndSearch));
        } else if (!checkbox.checked && existingInput) {
          existingInput.remove();
        }
      });
      applyFiltersAndSearch();
    }

    applyFiltersAndSearch();
    searchInput.addEventListener('input', debounce(applyFiltersAndSearch, 120));
    document.querySelectorAll('.form-checkbox[data-param]').forEach(cb => cb.addEventListener('change', updateFilterInputs));
    resetFiltersBtn.addEventListener('click', () => {
      document.querySelectorAll('.form-checkbox[data-param]').forEach(cb => (cb.checked = false));
      filterInputsContainer.innerHTML = '';
      searchInput.value = '';
      applyFiltersAndSearch();
    });

    listContainer.addEventListener('click', e => {
      const item = e.target.closest('.driver-item');
      if (!item) return;
      selectDriverByName(item.dataset.driverName);
    });

    editBtn.addEventListener('click', () => {
      previewContent.readOnly = false;
      previewContent.focus();
      previewContent.classList.add('editing-active');
      editBtn.style.display = 'none';
      saveBtn.style.display = 'inline-block';
    });

    saveBtn.addEventListener('click', async () => {
      if (!currentDriver) return;
      const newContent = previewContent.value;
      const parsed = parseDriverContent(newContent);
      const volMatch = /\/\/Speaker\s+volume\s*=\s*([^\n\r]+)/i.exec(newContent);
      const extra = volMatch ? { speakerVolume: volMatch[1].trim() } : {};
      const norm = normalizeDriverUnits(parsed);
      const contentOut = norm.corrected ? buildContentFromParams(norm.params, extra) : newContent;

      const updatedDriver = {
        name: currentDriver.name,
        content: contentOut,
        params: norm.corrected ? norm.params : parsed
      };
      
      const result = await window.electronAPI.addDriver(updatedDriver);
      if (result.success) {
        const beforeScroll = document.getElementById('driver-list-container')?.scrollTop ?? 0;
        // Recharger immédiatement la base de données
        await loadAndParseAllDrivers();
        // Retrouver le driver mis à jour
        currentDriver = allParsedDrivers.find(d => d.name === updatedDriver.name);
        if (currentDriver) {
          previewContent.value = currentDriver.content;
        }
        previewContent.readOnly = true;
        previewContent.classList.remove('editing-active');
        saveBtn.style.display = 'none';
        editBtn.style.display = 'inline-block';
        applyFiltersAndSearch();
        document.getElementById('driver-list-container').scrollTop = beforeScroll;
      }
    });

    copyBtn.addEventListener('click', () => {
      if (previewContent.value && currentDriver) {
        navigator.clipboard.writeText(previewContent.value);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
        
        // Ajouter le driver à l'historique du clipboard
        try {
          const clipboardHistory = JSON.parse(localStorage.getItem('driversClipboard') || '[]');
          
          // Ajouter le nouveau driver au début de l'historique
          clipboardHistory.unshift({
            name: currentDriver.name,
            params: currentDriver.params,
            timestamp: Date.now()
          });
          
          // Garder seulement les 5 derniers
          const trimmedHistory = clipboardHistory.slice(0, 5);
          
          // Sauvegarder
          localStorage.setItem('driversClipboard', JSON.stringify(trimmedHistory));
          
          console.log('[Drivers] Driver added to clipboard history:', currentDriver.name);
        } catch (error) {
          console.error('[Drivers] Error adding driver to clipboard:', error);
        }
      }
    });

    deleteBtn.addEventListener('click', () => {
      if (!currentDriver) return;
      
      // Créer le modal de confirmation
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-gray-900 border-2 rounded-lg p-6 max-w-md" style="border-color: var(--theme-accent)">
          <h3 class="text-xl font-bold text-white mb-4">Delete Driver</h3>
          <p class="text-gray-300 mb-6">Are you sure you want to delete "${currentDriver.name}"? This action cannot be undone.</p>
          <div class="flex justify-end space-x-4">
            <button id="cancel-delete" class="px-4 py-2 rounded" style="background-color: var(--theme-bg-lighter); color: var(--theme-text)">Cancel</button>
            <button id="confirm-delete" class="px-4 py-2 rounded" style="background-color: var(--theme-accent); color: var(--theme-bg)">Delete</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const handleDelete = async () => {
        const result = await window.electronAPI.deleteDriver(currentDriver.name);
        modal.remove();
        document.removeEventListener('keydown', keyHandler);
        
        if (result.success) {
          // Recharger immédiatement les drivers
          await loadAndParseAllDrivers();
          previewTitle.textContent = 'Select a driver';
          previewContent.value = '';
          deleteBtn.disabled = true;
          editBtn.disabled = true;
          compareBtn.disabled = true;
          copyBtn.disabled = true;
          currentDriver = null;
          clearCompareResults();
          applyFiltersAndSearch();
        }
      };

      const handleCancel = () => {
        modal.remove();
        document.removeEventListener('keydown', keyHandler);
      };

      const keyHandler = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleDelete();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      };

      document.addEventListener('keydown', keyHandler);
      document.getElementById('cancel-delete').addEventListener('click', handleCancel);
      document.getElementById('confirm-delete').addEventListener('click', handleDelete);
    });

    // Event listeners for compare functionality
    if (clearCompareBtn) {
      clearCompareBtn.addEventListener('click', clearCompareResults);
    }
    if (compareResultsList) {
      compareResultsList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-driver-name]');
        if (!btn) return;
        selectDriverByName(btn.dataset.driverName);
      });
    }
    if (compareBtn) {
      compareBtn.addEventListener('click', openCompareToast);
    }
  }

  function showDatabaseView() {
    viewContainer.innerHTML = getDatabaseViewHtml();
    attachDatabaseViewLogic();
  }

  function showScrapperView() {
    renderLoader('Chargement du scrapper...');
    renderScrapperView({
      container: viewContainer,
      onAddDriver: async (driver) => {
        const result = await window.electronAPI.addDriver(driver);
        if (result?.success) {
          await loadAndParseAllDrivers();
        }
        return result;
      }
    });
  }

  function showImportView(initialData = {}) {
    viewContainer.innerHTML = getImportViewHtml();
    
    // Le listener est attaché ici car le bouton n'existe que dans cette vue
    const importImageViewBtn = document.getElementById('import-image-view-btn');
    // Respect du feature flag OCR
    window.electronAPI.getFeatures().then((features) => {
      if (!features?.isDriverOcrEnabled) {
        // Masquer le bouton et empêcher l'accès
        if (importImageViewBtn) importImageViewBtn.style.display = 'none';
      } else {
        importImageViewBtn.addEventListener('click', () => {
          showImageImportView(
              viewContainer,
              { dbViewBtn, importViewBtn },
              (extractedData) => showImportView(extractedData)
          );
        });
      }
    });

    const saveBtn = document.getElementById('save-import-btn');
    const statusEl = document.getElementById('import-status');
    const inputs = {
      name: document.getElementById('import-name'), sd: document.getElementById('import-sd'),
      mms: document.getElementById('import-mms'), fs: document.getElementById('import-fs'),
      qms: document.getElementById('import-qms'), re: document.getElementById('import-re'),
      bl: document.getElementById('import-bl'), le: document.getElementById('import-le'),
      vol: document.getElementById('import-vol'),
    };

    // Pré‑remplissage propre - convertit en unités attendues
    if (initialData.name) inputs.name.value = initialData.name.replace(/[^a-z0-9\s-]/gi, '').trim();
    if (initialData.Sd) inputs.sd.value = (initialData.Sd * 1e4).toFixed(2); // Convertir m² en cm²
    if (initialData.Mms) inputs.mms.value = (initialData.Mms * 1000).toFixed(2); // Convertir kg en g
    if (initialData.fs) inputs.fs.value = initialData.fs;
    if (initialData.Qms) inputs.qms.value = initialData.Qms;
    if (initialData.Re) inputs.re.value = initialData.Re;
    if (initialData.BL) inputs.bl.value = initialData.BL;
    if (initialData.Le) inputs.le.value = (initialData.Le * 1000).toFixed(2); // Convertir H en mH

    

    const handleSave = async () => {
      const name = inputs.name.value;
      if (!name) { statusEl.textContent = 'The file name is required.'; return; }

      // Conserver les unités telles qu'affichées (cm², g, mH)
      const p = {
        SDf: +(parseFloat(inputs.sd.value) || 0),
        SDr: +(parseFloat(inputs.sd.value) || 0),
        Mms: +(parseFloat(inputs.mms.value) || 0),
        fs: +(parseFloat(inputs.fs.value) || 0),
        Qms: +(parseFloat(inputs.qms.value) || 0),
        Re: +(parseFloat(inputs.re.value) || 0),
        BL: +(parseFloat(inputs.bl.value) || 0),
        Le: +(parseFloat(inputs.le.value) || 0)
      };
      const { params: normParams } = normalizeDriverUnits(p); // noop unless user pasted SI
      const fileContent = buildContentFromParams(normParams, { speakerVolume: inputs.vol.value || 0 });

      const driver = { name, content: fileContent, params: normParams };

      const result = await window.electronAPI.addDriver(driver);
      if (result.success) {
        // Recharger immédiatement les drivers
        await loadAndParseAllDrivers();
        // Retourner à la vue database
        showDatabaseView();
      } else {
        statusEl.textContent = `Error: ${result.error}`;
      }
    };

    // Ajouter le listener pour le bouton
    saveBtn.addEventListener('click', handleSave);

    // Ajouter le listener pour la touche Enter sur tous les inputs
    Object.values(inputs).forEach(input => {
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
          }
        });
      }
    });
  }

  dbViewBtn.addEventListener('click', async () => {
    const settings = await getSettings().catch(() => ({}));
    const openDelayMs = settings?.ui?.panelOpenDelay?.driversMs ?? 50;
    renderLoader('Ouverture de la base…');
    await new Promise(res => setTimeout(res, openDelayMs));
    showDatabaseView();
  });

  importViewBtn.addEventListener('click', () => showImportView());
  scrapperViewBtn.addEventListener('click', () => showScrapperView());

  async function initialize() {
    renderLoader('Chargement des drivers…');
    await loadAndParseAllDrivers();
    const settings = await getSettings().catch(() => ({}));
    const firstOpenDelayMs = settings?.ui?.panelFirstOpenDelay?.driversMs ?? 100;
    await new Promise(res => setTimeout(res, firstOpenDelayMs));
    showDatabaseView();
  }

  initialize();
}