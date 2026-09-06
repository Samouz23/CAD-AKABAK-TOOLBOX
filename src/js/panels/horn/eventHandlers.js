// ====================================================================================================
// FICHIER :  src/js/panels/horn/eventHandlers.js
// RÔLE :     Gestion des événements utilisateur (clics, inputs, navigation clavier, mouse wheel).
// ====================================================================================================

import { safeEvaluateMath, getFcFromHornLength, generateIdealCurveFor, calculateFitError } from './formulas.js';
import { convertToMm, convertFromMm, getSurfaceFactor } from './tableManager.js';
import * as TableManager from './tableManager.js';
import * as Chart from './chart.js';
import * as Exporters from './exporters.js';

// --- Inline calculation (Enter pour évaluer une expression) ---

export function enableInlineCalculation(inputElement) {
    if (inputElement.dataset.hasCalculation === 'true') return;
    inputElement.dataset.hasCalculation = 'true';

    inputElement.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const expression = inputElement.value.trim();
            if (!expression) return;
            const simpleNumber = parseFloat(expression);
            if (!isNaN(simpleNumber) && /^-?\d+\.?\d*$/.test(expression)) return;
            try {
                const result = safeEvaluateMath(expression);
                inputElement.value = result;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            } catch (error) {
                console.warn("Expression invalide:", expression, "| Erreur:", error.message);
            }
        }
    });
}

// --- Mouse wheel adjustment ---

export function enableMouseWheelAdjustment(inputElement) {
    inputElement.addEventListener('wheel', (event) => {
        event.preventDefault();
        const currentValue = parseFloat(inputElement.value);
        if (isNaN(currentValue)) return;
        let step = parseFloat(inputElement.step) || 1;
        if (event.shiftKey) step *= 10;
        if (event.ctrlKey) step /= 10;
        const direction = event.deltaY < 0 ? 1 : -1;
        let newValue = currentValue + (step * direction);

        const min = parseFloat(inputElement.min);
        const max = parseFloat(inputElement.max);
        if (!isNaN(min)) newValue = Math.max(min, newValue);
        if (!isNaN(max)) newValue = Math.min(max, newValue);

        const precision = (String(step).split('.')[1] || '').length;
        inputElement.value = newValue.toFixed(precision);
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }, { passive: false });
}

// --- Mise à jour des paramètres d'expansion (extra params) ---

export function updateExtraParamsUI(state, dom, updateChartFn) {
    const { rootElement, extraParamsContainer } = dom;
    const persistedParams = {};
    extraParamsContainer.querySelectorAll('input').forEach(input => {
        persistedParams[input.id] = input.value;
    });
    extraParamsContainer.innerHTML = '';
    const neededParams = new Set();
    ['w', 'h', 's'].forEach(param => {
        const selectElement = rootElement.querySelector(`.graph-expansion-select[data-param="${param}"]`);
        if (!selectElement) return;
        const type = selectElement.value;
        if (type === 'Hypex') { neededParams.add(`T-${param}`); }
        else if (type === 'OS') { neededParams.add(`theta-${param}`); }
    });
    const paramLabels = { T: 'T', theta: 'θ' };
    neededParams.forEach(p_key => {
        const [paramName, paramType] = p_key.split('-');
        const inputId = `param-input-${p_key}`;
        const label = paramLabels[paramName] || paramName;
        let defaultValue = paramName === 'T' ? '1.0' : '45';
        const value = persistedParams[inputId] ?? defaultValue;
        let attrs = '';
        if (paramName === 'T') attrs = 'min="0" max="1.5" step="0.05"';
        extraParamsContainer.innerHTML += `<div class="flex items-center space-x-1"><label for="${inputId}" class="text-sm font-bold">${label}(${paramType.toUpperCase()}):</label><input type="text" id="${inputId}" value="${value}" ${attrs} class="form-input form-input-sm w-16"></div>`;
    });
    extraParamsContainer.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateChartFn);
        enableInlineCalculation(input);
        enableMouseWheelAdjustment(input);
    });
}

// --- Génération UI paramètres OS-SE ---

export function generateOsSeParamsUI(dom, updateChartFn) {
    const { osSeParamsContainer } = dom;
    const params = { L: 'L', k: 'k', r: 'r', t: 't', a: 'α', s: 's', q: 'q', n: 'n' };
    const defaults = { L: '170', k: '1', r: '18', t: '5', a: '40', s: '0.7', q: '0.996', n: '5' };
    const constraints = {
        k: { min: 1, max: 10, step: 0.1 },
        a: { min: 0, max: 90, step: 1 },
        s: { min: 0, max: 2, step: 0.1 },
        q: { min: 0.99, max: 1, step: 0.001 },
        n: { min: 2, max: 10, step: 1 },
        L: { min: 0, max: 1000, step: 10 },
        r: { min: 1, max: 200, step: 1 },
        t: { min: 0, max: 90, step: 1 }
    };

    osSeParamsContainer.innerHTML = Object.entries(params).map(([key, label]) => {
        const c = constraints[key] || {};
        const minAttr = c.min !== undefined ? `min="${c.min}"` : '';
        const maxAttr = c.max !== undefined ? `max="${c.max}"` : '';
        const stepAttr = c.step !== undefined ? `step="${c.step}"` : '';
        return `
        <div class="flex items-center space-x-1">
            <label for="os-se-param-${key}" class="text-sm font-bold">${label}:</label>
            <input type="text" id="os-se-param-${key}" value="${defaults[key]}" class="form-input form-input-sm w-20" ${minAttr} ${maxAttr} ${stepAttr}>
        </div>
    `;
    }).join('');

    osSeParamsContainer.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateChartFn);
        enableInlineCalculation(input);
        enableMouseWheelAdjustment(input);
    });
}

// --- Best-Fit ---

export function findBestFit(state, dom) {
    dom.bestFitResults.textContent = 'Analyzing...';
    setTimeout(() => {
        const rawSurfaceData = state.getTableData().s;
        if (rawSurfaceData.length < 2) {
            dom.bestFitResults.textContent = "Error: at least 2 segments required.";
            return;
        }
        const offsetX = rawSurfaceData[0].x;
        const realPoints = rawSurfaceData.map(p => ({ x: p.x - offsetX, y: p.y }));
        const s0 = realPoints[0].y;
        const sL = realPoints[realPoints.length - 1].y;
        const L = realPoints[realPoints.length - 1].x;
        if (s0 <= 0 || L <= 0) {
            dom.bestFitResults.textContent = "Error: S0 and L > 0 required.";
            return;
        }
        let results = [];
        const fcFromLength = getFcFromHornLength(L);
        results.push({ profile: 'Conical', error: calculateFitError(realPoints, generateIdealCurveFor('Conical', s0, sL, L, {})), params: {} });
        results.push({ profile: 'Exponential', error: calculateFitError(realPoints, generateIdealCurveFor('Exponential', s0, sL, L, {})), params: { Fc: fcFromLength } });
        results.push({ profile: 'Parabolic', error: calculateFitError(realPoints, generateIdealCurveFor('Parabolic', s0, sL, L, {})), params: { Fc: fcFromLength } });
        let bestHypex = { error: Infinity, T: null };
        for (let T = 0.5; T <= 1.5; T += 0.1) {
            const t_fixed = parseFloat(T.toFixed(1));
            const error = calculateFitError(realPoints, generateIdealCurveFor('Hypex', s0, sL, L, { T: t_fixed }));
            if (error < bestHypex.error) bestHypex = { error, T: t_fixed };
        }
        results.push({ profile: 'Hypex', error: bestHypex.error, params: { Fc: fcFromLength, T: bestHypex.T } });
        results.sort((a, b) => a.error - b.error);
        const maxError = Math.max(...results.filter(r => isFinite(r.error) && r.error > 0).map(r => r.error));
        const resultsString = results.map(res => {
            const score = isFinite(res.error) ? Math.max(0, (1 - (res.error / (maxError + 1e-9))) * 100) : 0;
            let paramsString = "";
            if (res.params.Fc) paramsString += ` Fc:${Math.round(res.params.Fc)}`;
            if (res.params.T) paramsString += ` T:${res.params.T}`;
            return `${res.profile.substring(0, 4).toUpperCase()}: ${score.toFixed(0)}%${paramsString}`;
        }).join(' | ');
        dom.bestFitResults.textContent = resultsString;
    }, 10);
}

// --- Bind tous les événements ---

export function bindAllEvents(state, dom, updateChartFn) {
    const { rootElement, tableBody, segmentCountInput, clearBtn, bestFitBtn,
            exportOsSeCsvBtn, exportToBtn, exportOptions,
            unitSwitchBtn, deleteSegmentBtn, insertBeforeBtn,
            insertAfterBtn, graphsContainer } = dom;

    // Segment count
    segmentCountInput.addEventListener('input', () => {
        state.segmentCount = Math.max(1, Math.min(20, parseInt(segmentCountInput.value, 10) || 1));
        segmentCountInput.value = state.segmentCount;
        TableManager.updateVisibleSegments(state, dom, updateChartFn);
    });

    // Clear and Best-Fit
    clearBtn.addEventListener('click', () => TableManager.clearValues(state, dom, updateChartFn));
    bestFitBtn.addEventListener('click', () => findBestFit(state, dom));
    if (exportOsSeCsvBtn) exportOsSeCsvBtn.addEventListener('click', () => Exporters.exportOsSeCsv(dom));

    // Export menu
    exportToBtn.addEventListener('click', () => { exportOptions.classList.toggle('hidden'); });
    exportOptions.addEventListener('click', (e) => {
        e.preventDefault();
        const target = e.target.closest('a');
        if (target && target.dataset.target) Exporters.handleExport(target.dataset.target, state, dom);
    });
    document.addEventListener('click', (e) => {
        if (!exportToBtn.contains(e.target)) exportOptions.classList.add('hidden');
    });

    // Table input (W/H → S, S → W/H)
    tableBody.addEventListener('input', e => {
        if (!e.target.matches('input')) return;
        dom.bestFitResults.textContent = '';
        const input = e.target;
        const row = input.closest('.segment-row');
        if (!row) return;
        const wInput = row.querySelector('.segment-w');
        const hInput = row.querySelector('.segment-h');
        const sInput = row.querySelector('.segment-s-input');
        const changedCol = input.dataset.col;

        if (changedCol === 'w' || changedCol === 'h') {
            const w = convertToMm(parseFloat(wInput.value) || 0, state.currentUnit);
            const h = convertToMm(parseFloat(hInput.value) || 0, state.currentUnit);
            sInput.value = (w * h / getSurfaceFactor(state.currentUnit)).toFixed(0);
        } else if (changedCol === 's') {
            const s_unit = parseFloat(sInput.value) || 0;
            const s_mm2 = s_unit * getSurfaceFactor(state.currentUnit);
            const w_mm = convertToMm(parseFloat(wInput.value) || 0, state.currentUnit);
            const h_mm = convertToMm(parseFloat(hInput.value) || 0, state.currentUnit);
            if (s_mm2 > 0) {
                if (w_mm > 0 && h_mm > 0) {
                    const ratio = w_mm / h_mm;
                    const new_h = Math.sqrt(s_mm2 / ratio);
                    const new_w = new_h * ratio;
                    wInput.value = convertFromMm(new_w, state.currentUnit).toFixed(1);
                    hInput.value = convertFromMm(new_h, state.currentUnit).toFixed(1);
                } else {
                    const dim = Math.sqrt(s_mm2);
                    wInput.value = convertFromMm(dim, state.currentUnit).toFixed(1);
                    hInput.value = convertFromMm(dim, state.currentUnit).toFixed(1);
                }
            }
        }
        updateChartFn();
    });

    // Focus tracking
    tableBody.addEventListener('focusin', e => {
        const row = e.target.closest('.segment-row');
        if (row) state.focusedRowIndex = parseInt(row.dataset.index, 10);
    });

    // Expansion selectors & Y-axis mode
    graphsContainer.addEventListener('change', e => {
        if (e.target.classList.contains('graph-expansion-select')) {
            updateExtraParamsUI(state, dom, updateChartFn);
            updateChartFn();
        }
    });
    graphsContainer.addEventListener('click', e => {
        if (e.target.classList.contains('y-axis-toggle-btn')) {
            Chart.setYAxisMode(e.target.dataset.scale, state, dom);
        }
    });

    // Unit switch
    unitSwitchBtn.addEventListener('click', () => {
        const dataInMm = state.getTableData(true);
        state.currentUnit = state.currentUnit === 'mm' ? 'cm' : 'mm';
        unitSwitchBtn.textContent = state.currentUnit;
        const dimUnitLabel = `(${state.currentUnit})`;
        const surfUnitLabel = `(${state.currentUnit}²)`;
        rootElement.querySelectorAll('[data-unit-label="dim"]').forEach(el => el.textContent = el.textContent.split('(')[0] + dimUnitLabel);
        rootElement.querySelectorAll('[data-unit-label="surf"]').forEach(el => el.textContent = el.textContent.split('(')[0] + surfUnitLabel);
        TableManager.updateTableUI(dataInMm, state, dom);
        Chart.createChart(state, dom);
        updateChartFn();
    });

    // Insert / Delete
    deleteSegmentBtn.addEventListener('click', () => {
        if (state.focusedRowIndex > -1) TableManager.deleteSegment(state.focusedRowIndex, state, dom, updateChartFn);
        else if (state.segmentCount > 1) TableManager.deleteSegment(state.segmentCount - 1, state, dom, updateChartFn);
    });
    insertBeforeBtn.addEventListener('click', () => {
        if (state.focusedRowIndex > -1) TableManager.insertSegment(state.focusedRowIndex, true, state, dom, updateChartFn);
    });
    insertAfterBtn.addEventListener('click', () => {
        if (state.focusedRowIndex > -1) TableManager.insertSegment(state.focusedRowIndex, false, state, dom, updateChartFn);
    });

    // Keyboard navigation
    tableBody.addEventListener('keydown', e => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        if (!e.target.matches('input')) return;
        e.preventDefault();
        const currentInput = e.target;
        const currentRow = currentInput.closest('tr');
        const currentIndex = parseInt(currentRow.dataset.index, 10);
        const currentCol = currentInput.dataset.col;
        const colsOrder = ['w', 'h', 'l', 's'];
        const currentColIndex = colsOrder.indexOf(currentCol);
        let nextRow = currentIndex;
        let nextColIndex = currentColIndex;
        switch (e.key) {
            case 'ArrowUp':    nextRow = Math.max(0, currentIndex - 1); break;
            case 'ArrowDown':  nextRow = Math.min(state.segmentCount - 1, currentIndex + 1); break;
            case 'ArrowLeft':  nextColIndex = Math.max(0, currentColIndex - 1); break;
            case 'ArrowRight': nextColIndex = Math.min(colsOrder.length - 1, currentColIndex + 1); break;
        }
        const nextInput = tableBody.querySelector(`tr[data-index="${nextRow}"] input[data-col="${colsOrder[nextColIndex]}"]`);
        if (nextInput && !nextInput.disabled) { nextInput.focus(); nextInput.select(); }
    });
}

// --- Onglets Value / Graph / Both ---

export function initHornTabs(state, dom) {
    const { rootElement, mainContentArea, graphsContainer, tableContainer } = dom;
    const tabBtns = rootElement.querySelectorAll('.horn-tab-btn');

    function applyTab(tabName) {
        state.activeHornTab = tabName;
        tabBtns.forEach(b => b.classList.toggle('bg-green-700', b.dataset.hornTab === tabName));

        const showValue = tabName === 'value' || tabName === 'both';
        const showGraph = tabName === 'graph' || tabName === 'both';
        mainContentArea.classList.toggle('hidden', !showValue);
        graphsContainer.classList.toggle('hidden', !showGraph);

        // In "Both" mode the table keeps a fixed height to leave room for the graph below it.
        // In "Value" mode the table grows to fill the available space (≈12 rows visible).
        if (tabName === 'both') {
            tableContainer.classList.remove('flex-grow');
            tableContainer.classList.add('flex-shrink-0');
            tableContainer.style.height = '280px';
        } else {
            tableContainer.classList.add('flex-grow');
            tableContainer.classList.remove('flex-shrink-0');
            tableContainer.style.height = '';
        }

        if (state.mainChart) {
            // Chart.js measures the canvas' parent while it's still display:none right after
            // un-hiding, producing a broken layout. Recreating the chart next frame (once the
            // container has its real size) fixes it, same as what happens when the y-axis
            // buttons (which call createChart/updateChart) are clicked.
            if (showGraph) {
                requestAnimationFrame(() => {
                    Chart.createChart(state, dom);
                    Chart.updateChart(state, dom);
                });
            } else {
                requestAnimationFrame(() => state.mainChart.resize());
            }
        }
    }

    tabBtns.forEach(btn => btn.addEventListener('click', () => applyTab(btn.dataset.hornTab)));
    applyTab('value');
}

