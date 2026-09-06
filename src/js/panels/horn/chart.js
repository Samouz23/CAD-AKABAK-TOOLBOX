// ====================================================================================================
// FICHIER :  src/js/panels/horn/chart.js
// RÔLE :     Création, mise à jour et gestion du graphique principal (Chart.js).
// ====================================================================================================

import { chartColors } from './config.js';
import { expansionFormulas, dimensionFormulas, getFcFromHornLength, generateIdealCurveFor } from './formulas.js';

// --- Génération de courbe idéale (pour le graphique principal) ---

export function generateIdealCurve(param, state, dom) {
    const { rootElement, tableBody } = dom;
    const { yAxisMode } = state;

    if (param === 'os-se') {
        const opts = {};
        ['L', 'k', 'r', 't', 'a', 's', 'q', 'n'].forEach(key => {
            opts[key] = parseFloat(rootElement.querySelector(`#os-se-param-${key}`)?.value) || 0;
        });
        if (opts.L <= 0) return [];
        const idealPoints = [];
        const steps = 100;
        for (let i = 0; i <= steps; i++) {
            const x = (i / steps) * opts.L;
            const y_val_dim = dimensionFormulas['OS-SE'](x, opts.L, opts);
            const y_val_surf = Math.PI * Math.pow(y_val_dim, 2);
            if (isFinite(y_val_surf)) idealPoints.push({ x, y: y_val_surf });
        }
        return idealPoints;
    }

    const select = rootElement.querySelector(`.graph-expansion-select[data-param="${param}"]`);
    if (!select) return [];
    const type = select.value;

    if (expansionFormulas[type]) {
        const allSegments = state.getTableData(true);
        if (allSegments.length === 0) return [];
        if (allSegments.length < 2 && yAxisMode !== 'os-se') return [];

        const totalLength = allSegments.reduce((acc, seg) => acc + seg.l, 0);
        if (totalLength <= 0) return [];

        const startSegment = allSegments[0];
        const endSegment = allSegments[allSegments.length - 1];
        const startVal = (param === 's') ? startSegment.s : (param === 'w' ? startSegment.w : startSegment.h);
        const endVal = (param === 's') ? endSegment.s : (param === 'w' ? endSegment.w : endSegment.h);
        if (startVal <= 0) return [];

        const s0 = (param === 's') ? startVal : startVal * startVal;
        const sL = (param === 's') ? endVal : endVal * endVal;
        const opts = {};

        if (type === 'Hypex') {
            opts.fc = getFcFromHornLength(totalLength);
            opts.T = parseFloat(rootElement.querySelector(`#param-input-T-${param}`)?.value) || 1.0;
        } else if (type === 'Exponential' || type === 'Parabolic') {
            opts.fc = getFcFromHornLength(totalLength);
        } else if (type === 'OS') {
            opts.theta = parseFloat(rootElement.querySelector(`#param-input-theta-${param}`)?.value) || 45;
        }

        const idealSurfaceCurve = generateIdealCurveFor(type, s0, sL, totalLength, opts);
        const points = idealSurfaceCurve.map(point => {
            const y_val_mm = (param === 's') ? point.y : Math.sqrt(point.y);
            return { x: point.x, y: y_val_mm };
        });
        return points.filter(p => isFinite(p.y));
    }
    return [];
}

// --- Création du graphique ---

export function createChart(state, dom) {
    if (state.mainChart) {
        state.mainChart.destroy();
    }
    const { currentUnit, yAxisMode, datasetVisibility } = state;
    const dimUnitLabel = currentUnit;
    const surfUnitLabel = `${currentUnit}²`;
    const yDimUnitLabel = `Dimensions (${currentUnit})`;
    const ySurfUnitLabel = `Area (${currentUnit}²)`;
    const xUnitLabel = `Length (${currentUnit})`;
    const canvas = dom.rootElement.querySelector('#main-chart');

    state.mainChart = new Chart(canvas, {
        type: 'line',
        data: {
            datasets: [
                { label: 'Width', data: [], borderColor: chartColors.w, tension: 0, pointStyle: 'circle', radius: 4, yAxisID: 'yDimensions' },
                { label: 'Ideal (W)', data: [], borderColor: chartColors.w, borderDash: [5, 5], pointRadius: 2, yAxisID: 'yDimensions' },
                { label: 'Height', data: [], borderColor: chartColors.h, tension: 0, pointStyle: 'circle', radius: 4, yAxisID: 'yDimensions' },
                { label: 'Ideal (H)', data: [], borderColor: chartColors.h, borderDash: [5, 5], pointRadius: 2, yAxisID: 'yDimensions' },
                { label: 'Area', data: [], borderColor: chartColors.s, tension: 0, pointStyle: 'circle', radius: 4, yAxisID: 'ySurface' },
                { label: 'Ideal (Area)', data: [], borderColor: chartColors.s, borderDash: [5, 5], pointRadius: 2, yAxisID: 'ySurface' },
                {
                    label: 'OS-SE', data: [], borderColor: chartColors.os, borderWidth: 2,
                    tension: 0.1, pointStyle: 'line', radius: 0,
                    pointHitRadius: 20, hitRadius: 20, hoverRadius: 6, yAxisID: 'ySurface'
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: {
                    position: 'top', labels: { color: '#a0aec0' },
                    onClick: (e, legendItem) => customLegendClickHandler(e, legendItem, state, dom)
                },
                tooltip: {
                    mode: 'nearest', intersect: false,
                    callbacks: {
                        label: (ctx) => {
                            const yVal = ctx.parsed?.y;
                            const unit = ctx.dataset?.yAxisID === 'ySurface' ? surfUnitLabel : dimUnitLabel;
                            if (!isFinite(yVal)) return ctx.dataset.label || '';
                            const xScale = ctx.chart?.scales?.x;
                            const caretX = ctx.chart?.tooltip?.caretX;
                            const xFromCursor = (xScale && isFinite(caretX)) ? xScale.getValueForPixel(caretX) : ctx.parsed?.x;
                            if (!isFinite(xFromCursor)) return ctx.dataset.label || '';
                            return `${ctx.dataset.label}: ${Math.round(yVal)} ${unit} @ ${Math.round(xFromCursor)} ${currentUnit}`;
                        }
                    }
                }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: xUnitLabel, color: '#a0aec0' }, ticks: { color: '#a0aec0' }, grid: { color: '#2D3748' } },
                yDimensions: {
                    display: (yAxisMode === 'dim'), type: 'linear', position: 'left',
                    ticks: { color: '#a0aec0' }, grid: { color: '#2D3748' },
                    title: { display: true, text: yDimUnitLabel, color: '#a0aec0' }
                },
                ySurface: {
                    display: (yAxisMode === 'surf' || yAxisMode === 'os-se'),
                    type: 'linear', position: 'right',
                    ticks: { color: chartColors.s }, grid: { drawOnChartArea: false },
                    title: { display: true, text: ySurfUnitLabel, color: chartColors.s }
                }
            }
        }
    });
}

// --- Mise à jour du graphique ---

export function updateChart(state, dom) {
    if (!state.mainChart) return;

    const { currentUnit, yAxisMode, datasetVisibility } = state;

    const idealCurveOsSe = generateIdealCurve('os-se', state, dom);
    const data = state.getTableData();
    const idealCurveW = generateIdealCurve('w', state, dom);
    const idealCurveH = generateIdealCurve('h', state, dom);
    const idealCurveS = generateIdealCurve('s', state, dom);

    let maxX = data.totalL;
    if (yAxisMode === 'os-se') {
        maxX = parseFloat(dom.rootElement.querySelector('#os-se-param-L')?.value) || data.totalL;
    }

    const displayFactor = currentUnit === 'cm' ? 0.1 : 1;
    const displaySurfFactor = state.getSurfaceFactor(currentUnit);

    state.mainChart.options.scales.x.max = maxX * displayFactor;

    state.mainChart.data.datasets[0].data = data.w.map(p => ({ x: p.x * displayFactor, y: p.y * displayFactor }));
    state.mainChart.data.datasets[1].data = idealCurveW.map(p => ({ x: p.x * displayFactor, y: p.y * displayFactor }));
    state.mainChart.data.datasets[2].data = data.h.map(p => ({ x: p.x * displayFactor, y: p.y * displayFactor }));
    state.mainChart.data.datasets[3].data = idealCurveH.map(p => ({ x: p.x * displayFactor, y: p.y * displayFactor }));
    state.mainChart.data.datasets[4].data = data.s.map(p => ({ x: p.x * displayFactor, y: p.y / displaySurfFactor }));
    state.mainChart.data.datasets[5].data = idealCurveS.map(p => ({ x: p.x * displayFactor, y: p.y / displaySurfFactor }));
    state.mainChart.data.datasets[6].data = idealCurveOsSe.map(p => ({ x: p.x * displayFactor, y: p.y / displaySurfFactor }));

    const useProximityTooltip = true;
    if (state.mainChart.options?.interaction) {
        state.mainChart.options.interaction.intersect = useProximityTooltip;
        state.mainChart.options.interaction.mode = 'nearest';
    } else {
        state.mainChart.options.interaction = { mode: 'nearest', intersect: useProximityTooltip };
    }
    if (state.mainChart.options?.plugins?.tooltip) {
        state.mainChart.options.plugins.tooltip.intersect = useProximityTooltip;
        state.mainChart.options.plugins.tooltip.mode = 'nearest';
    }

    const xScale = state.mainChart.scales?.x;
    if (xScale) {
        const oneCmInDisplayUnits = currentUnit === 'cm' ? 1 : 10;
        const thresholdPx = Math.abs(xScale.getPixelForValue(oneCmInDisplayUnits) - xScale.getPixelForValue(0));
        const hitRadiusPx = Math.max(6, Math.min(40, thresholdPx));
        [0, 1, 2, 3, 4, 5, 6].forEach(idx => {
            const ds = state.mainChart.data.datasets[idx];
            if (!ds) return;
            ds.pointHitRadius = hitRadiusPx;
            ds.hitRadius = hitRadiusPx;
            ds.hoverRadius = Math.max(6, Math.min(16, hitRadiusPx));
        });
    }

    const relevantDatasetsForMode = { 'dim': [0, 1, 2, 3], 'surf': [4, 5, 6], 'os-se': [4, 5, 6] };
    datasetVisibility.forEach((userWantsVisible, i) => {
        const isRelevant = relevantDatasetsForMode[yAxisMode].includes(i);
        state.mainChart.setDatasetVisibility(i, userWantsVisible && isRelevant);
    });

    state.mainChart.update('none');
}

// --- Gestion du clic sur la légende ---

function customLegendClickHandler(e, legendItem, state, dom) {
    state.datasetVisibility[legendItem.datasetIndex] = !state.datasetVisibility[legendItem.datasetIndex];
    if (state.yAxisMode === 'os-se') {
        window.hornDatasetVisibilityOsSe = [...state.datasetVisibility];
    } else {
        window.hornDatasetVisibilityNormal = [...state.datasetVisibility];
    }
    updateChart(state, dom);
}

// --- Changement du mode d'axe Y ---

export function setYAxisMode(mode, state, dom) {
    if (!state.mainChart) return;

    // Sauvegarder
    if (state.yAxisMode === 'os-se') {
        window.hornDatasetVisibilityOsSe = [...state.datasetVisibility];
    } else {
        window.hornDatasetVisibilityNormal = [...state.datasetVisibility];
    }

    state.yAxisMode = mode;
    const isOsSeMode = mode === 'os-se';

    // Charger l'état approprié
    if (isOsSeMode) {
        state.datasetVisibility = [...window.hornDatasetVisibilityOsSe];
    } else {
        state.datasetVisibility = [...window.hornDatasetVisibilityNormal];
    }

    dom.rootElement.querySelectorAll('.y-axis-toggle-btn').forEach(b => b.classList.remove('bg-pink-700'));
    const activeButton = dom.rootElement.querySelector(`.y-axis-toggle-btn[data-scale="${mode}"]`);
    if (activeButton) activeButton.classList.add('bg-pink-700');

    dom.tableContainer.style.display = isOsSeMode ? 'none' : 'flex';
    dom.osSeParamsContainer.style.display = isOsSeMode ? 'flex' : 'none';
    dom.expansionSelectorsContainer.style.display = isOsSeMode ? 'none' : 'flex';
    dom.bestFitContainer.style.display = isOsSeMode ? 'none' : 'flex';

    if (dom.exportOsSeCsvBtn) {
        dom.exportOsSeCsvBtn.style.display = isOsSeMode ? 'inline-flex' : 'none';
    }

    dom.graphsContainer.classList.toggle('flex-grow', !isOsSeMode);
    dom.graphsContainer.classList.toggle('h-full', isOsSeMode);

    createChart(state, dom);
    updateChart(state, dom);
}
