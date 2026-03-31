// ====================================================================================================
// FICHIER :  src/js/panels/horn/generation/generatorUI.js
// RÔLE :     UI du mode Génération : onglets, graphique d'expansion, dessin 2D, tableau de segments.
// ====================================================================================================

import { generateHornSegments, generateHornSegmentsHV, generateIdealExpansionCurve, autoCalcFcFromLength, autoCalcLengthFromFc, getThroatData, getMouthData } from './generator.js';
import { expansionFormulas } from '../formulas.js';
import { enableMouseWheelAdjustment } from '../eventHandlers.js';

// --- Affichage du tableau de segments générés ---

function displayGeneratedSegments(segments, genState, genDom, rootElement) {
    const lockedSet = genState.lockedLengths || new Set();
    genDom.genSegmentsTableBody.innerHTML = segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const isLocked = lockedSet.has(i);
        return `
        <tr class="border-b border-gray-800 text-xs" data-seg-idx="${i}">
            <td class="text-center px-2 py-1.5 text-gray-500">${i + 1}</td>
            <td class="text-center px-2 py-1.5">${seg.w.toFixed(1)}</td>
            <td class="text-center px-2 py-1.5">${seg.h.toFixed(1)}</td>
            <td class="px-2 py-1.5">${isLast ? '' : `<input type="text" class="gen-seg-length form-input form-input-sm w-full text-center" data-idx="${i}" value="${seg.l.toFixed(1)}">`}</td>
            <td class="text-center px-2 py-1.5">${isLast ? '' : `<button class="gen-seg-lock w-5 h-5 text-xs rounded ${isLocked ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-400'} hover:bg-yellow-500" data-idx="${i}" title="${isLocked ? 'Unlock' : 'Lock'} length">${isLocked ? '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' : '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 5-5 5 5 0 0 1 5 5"/></svg>'}</button>`}</td>
            <td class="text-center px-2 py-1.5">${seg.s}</td>
        </tr>`;
    }).join('');

    // --- Lock buttons ---
    genDom.genSegmentsTableBody.querySelectorAll('.gen-seg-lock').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            if (!genState.lockedLengths) genState.lockedLengths = new Set();
            if (genState.lockedLengths.has(idx)) {
                genState.lockedLengths.delete(idx);
                btn.classList.remove('bg-yellow-600', 'text-white');
                btn.classList.add('bg-gray-700', 'text-gray-400');
                btn.innerHTML = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 5-5 5 5 0 0 1 5 5"/></svg>';
                btn.title = 'Lock length';
            } else {
                genState.lockedLengths.add(idx);
                btn.classList.add('bg-yellow-600', 'text-white');
                btn.classList.remove('bg-gray-700', 'text-gray-400');
                btn.innerHTML = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
                btn.title = 'Unlock length';
            }
        });
    });

    // --- Editable length inputs ---
    genDom.genSegmentsTableBody.querySelectorAll('.gen-seg-length').forEach(input => {
        input.addEventListener('change', () => {
            const idx = parseInt(input.dataset.idx);
            const newLen = parseFloat(input.value);
            if (!isFinite(newLen) || newLen <= 0) {
                input.value = genState.lastGenSegments[idx].l.toFixed(1);
                return;
            }
            applyLengthEdit(idx, newLen, genState, genDom, rootElement);
        });
    });
}

// --- Appliquer une modification de longueur avec redistribution ---

function applyLengthEdit(editedIdx, newLen, genState, genDom, rootElement) {
    const segs = genState.lastGenSegments;
    if (!segs || editedIdx >= segs.length - 1) return;

    const lockedSet = genState.lockedLengths || new Set();
    const oldTotalL = segs.slice(0, -1).reduce((sum, s) => sum + s.l, 0);
    const delta = newLen - segs[editedIdx].l;

    // Appliquer la nouvelle longueur au segment edite
    segs[editedIdx].l = Math.round(newLen * 10) / 10;

    // Collecter les indices non-verrouilles et non-edites pour redistribuer le delta
    const adjustable = [];
    for (let i = 0; i < segs.length - 1; i++) {
        if (i !== editedIdx && !lockedSet.has(i)) {
            adjustable.push(i);
        }
    }

    if (adjustable.length > 0 && Math.abs(delta) > 0.01) {
        const perSeg = -delta / adjustable.length;
        for (const i of adjustable) {
            const adjusted = segs[i].l + perSeg;
            segs[i].l = Math.round(Math.max(1, adjusted) * 10) / 10;
        }
    }

    // --- Recalculer W/H selon la loi d'expansion aux nouvelles positions cumulées ---
    const type = genDom.genExpansionType.value;
    const throat = getThroatData(genDom);
    const constantH = genDom.genConstantHeight.checked;
    const fixedH = constantH ? (parseFloat(genDom.genConstantHeightValue.value) || 200) : 0;
    const s0 = throat.s;
    const L = segs.slice(0, -1).reduce((sum, s) => sum + s.l, 0);

    const mouth = getMouthData(genDom);
    const sL = mouth.s;
    const throatW = throat.w;
    const throatH = constantH ? fixedH : throat.h;
    const mouthW = constantH ? (sL / fixedH) : mouth.w;
    const mouthH = constantH ? fixedH : mouth.h;
    const ratio_w = mouthW / throatW;
    const ratio_h = constantH ? 1 : (mouthH / throatH);

    const opts = {};
    if (type === 'Hypex') opts.T = parseFloat(rootElement.querySelector('#gen-param-T')?.value) || 1.0;
    else if (type === 'OS') opts.theta = parseFloat(rootElement.querySelector('#gen-param-theta')?.value) || 45;

    const formula = expansionFormulas[type];
    if (formula && L > 0 && s0 > 0 && sL > 0) {
        const rawEnd = formula(s0, sL, L, L, opts);
        const needsScale = type !== 'Conical' && rawEnd > 0 && Math.abs(rawEnd - sL) > 1;

        const getScaledArea = (x) => {
            const rawArea = formula(s0, sL, L, x, opts);
            if (!needsScale || !isFinite(rawArea)) return rawArea;
            if (rawArea <= s0) return s0;
            const logRatio = Math.log(rawArea / s0) / Math.log(rawEnd / s0);
            return s0 * Math.pow(sL / s0, logRatio);
        };

        let cumX = 0;
        const n = segs.length;
        for (let i = 0; i < n; i++) {
            let area;
            if (i === 0) area = s0;
            else if (i === n - 1) area = sL;
            else area = getScaledArea(cumX);
            if (!isFinite(area) || area <= 0) area = s0;

            let finalW, finalH;
            if (constantH) {
                finalH = fixedH;
                finalW = area / fixedH;
            } else {
                const t = (L > 0) ? cumX / L : 0;
                const segW = throatW * Math.pow(ratio_w, t);
                const segH = throatH * Math.pow(ratio_h, t);
                const rawArea = segW * segH;
                const scale = Math.sqrt(area / rawArea);
                finalW = (i === 0) ? throatW : (i === n - 1) ? mouthW : segW * scale;
                finalH = (i === 0) ? throatH : (i === n - 1) ? mouthH : segH * scale;
            }

            segs[i].w = Math.round(finalW * 10) / 10;
            segs[i].h = Math.round(finalH * 10) / 10;
            segs[i].s = Math.round(finalW * finalH);

            if (i < n - 1) cumX += segs[i].l;
        }
    }

    // Rafraichir tout
    genState.lastGenSegments = segs;
    displayGeneratedSegments(segs, genState, genDom, rootElement);
    updateGenExpansionChart(segs, genState, genDom, rootElement);
    drawHorn2D(segs, genDom, rootElement, genState);
}

// --- Graphique d'expansion (Chart.js) ---

function updateGenExpansionChart(segments, genState, genDom, rootElement) {
    const idealCurve = generateIdealExpansionCurve(genDom, rootElement);

    const genPoints = [];
    let cumX = 0;
    segments.forEach((seg) => {
        genPoints.push({ x: Math.round(cumX * 10) / 10, y: seg.s });
        cumX += seg.l;
    });

    const chartCanvas = genDom.rootElement.querySelector('#gen-expansion-chart');

    if (genState.genExpansionChart) {
        genState.genExpansionChart.data.datasets[0].data = idealCurve;
        genState.genExpansionChart.data.datasets[1].data = genPoints;
        genState.genExpansionChart.update();
        return;
    }

    genState.genExpansionChart = new Chart(chartCanvas, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Ideal Expansion', data: idealCurve,
                    borderColor: '#ff00eaff', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: false,
                },
                {
                    label: 'Generated Segments', data: genPoints,
                    borderColor: '#00ffa2ff', borderWidth: 2, pointRadius: 4, pointStyle: 'circle', tension: 0, fill: false,
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            parsing: { xAxisKey: 'x', yAxisKey: 'y' },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Length (mm)', color: '#aaa' }, ticks: { color: '#888' }, grid: { color: '#333' } },
                y: { type: 'linear', title: { display: true, text: 'Area (mm²)', color: '#aaa' }, ticks: { color: '#888' }, grid: { color: '#333' }, beginAtZero: true }
            },
            plugins: {
                legend: { labels: { color: '#ccc', usePointStyle: true, pointStyle: 'line' } },
                tooltip: { mode: 'nearest', intersect: false }
            }
        }
    });
}

// --- Dessin 2D du profil ---

function drawHorn2D(segments, genDom, rootElement, genState) {
    const canvas = genDom.genHornCanvas;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, cw, ch);

    if (!segments || segments.length < 2) return;

    // Determine view mode: surface (default), width, height
    const viewMode = (genState && genState.gen2dView) ? genState.gen2dView : 'surface';

    // Get the value to display per segment based on view mode
    const getVal = (seg) => {
        if (viewMode === 'width') return seg.w;
        if (viewMode === 'height') return seg.h;
        return seg.s;
    };
    const valLabel = viewMode === 'width' ? 'Width' : viewMode === 'height' ? 'Height' : 'Surface';
    const valUnit = viewMode === 'surface' ? 'mm²' : 'mm';

    const maxVal = Math.max(...segments.map(s => getVal(s)));
    if (maxVal <= 0) return;

    // Ideal curve (only for surface mode, or generate dimension curves for W/H)
    let idealCurve = [];
    if (viewMode === 'surface') {
        idealCurve = generateIdealExpansionCurve(genDom, rootElement);
    }
    const idealMax = idealCurve.length ? Math.max(...idealCurve.map(p => p.y)) : maxVal;
    const globalMax = Math.max(maxVal, idealMax);

    const n = segments.length;
    const margin = 30;
    const drawW = cw - 2 * margin;
    const drawH = ch - 2 * margin;

    // Positions X basees sur les longueurs reelles de chaque segment
    const totalL = segments.reduce((sum, s) => sum + s.l, 0);
    const segXPositions = [0];
    let cumLen = 0;
    for (let i = 0; i < n - 1; i++) {
        cumLen += segments[i].l;
        segXPositions.push(cumLen);
    }
    const scaleX = totalL > 0 ? drawW / totalL : 1;

    const t = 24;
    const scaleY = (drawH / 2 - t) / (globalMax * 1.08);
    const centerY = ch / 2;

    // Axe central
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(margin, centerY);
    ctx.lineTo(cw - margin, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

    const plankStroke = '#c8915a';
    const plankFill = 'rgba(200, 145, 90, 0.15)';
    const idealColor = 'rgba(255, 50, 50, 0.8)';

    // Courbe idéale (surface mode only)
    if (idealCurve.length > 1) {
        const idealScaleX = totalL > 0 ? drawW / totalL : 1;
        ctx.strokeStyle = idealColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        for (let i = 0; i < idealCurve.length; i++) {
            const px = margin + idealCurve[i].x * idealScaleX;
            const py = centerY - idealCurve[i].y * scaleY;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < idealCurve.length; i++) {
            const px = margin + idealCurve[i].x * idealScaleX;
            const py = centerY + idealCurve[i].y * scaleY;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Planches trapézoïdales
    for (let i = 0; i < n - 1; i++) {
        const x1 = margin + segXPositions[i] * scaleX;
        const x2 = margin + segXPositions[i + 1] * scaleX;
        const halfL = getVal(segments[i]) * scaleY;
        const halfR = getVal(segments[i + 1]) * scaleY;

        // TOP PLANK
        ctx.fillStyle = plankFill;
        ctx.beginPath();
        ctx.moveTo(x1, centerY - halfL - t);
        ctx.lineTo(x2, centerY - halfR - t);
        ctx.lineTo(x2, centerY - halfR);
        ctx.lineTo(x1, centerY - halfL);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = plankStroke;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x1, centerY - halfL - t); ctx.lineTo(x2, centerY - halfR - t); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, centerY - halfL); ctx.lineTo(x2, centerY - halfR); ctx.stroke();

        // BOTTOM PLANK
        ctx.fillStyle = plankFill;
        ctx.beginPath();
        ctx.moveTo(x1, centerY + halfL);
        ctx.lineTo(x2, centerY + halfR);
        ctx.lineTo(x2, centerY + halfR + t);
        ctx.lineTo(x1, centerY + halfL + t);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = plankStroke;
        ctx.beginPath(); ctx.moveTo(x1, centerY + halfL); ctx.lineTo(x2, centerY + halfR); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, centerY + halfL + t); ctx.lineTo(x2, centerY + halfR + t); ctx.stroke();

        // Faces verticales
        if (i === 0) {
            ctx.beginPath(); ctx.moveTo(x1, centerY - halfL - t); ctx.lineTo(x1, centerY - halfL); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x1, centerY + halfL); ctx.lineTo(x1, centerY + halfL + t); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(x2, centerY - halfR - t); ctx.lineTo(x2, centerY - halfR); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, centerY + halfR); ctx.lineTo(x2, centerY + halfR + t); ctx.stroke();

        // Angle annotation pour chaque planche (H+V mode)
        if (viewMode !== 'surface' && segments[i].l > 0) {
            const dx = x2 - x1;
            const dy = halfR - halfL;
            const angleDeg = Math.atan2(Math.abs(dy), dx) * (180 / Math.PI);
            ctx.font = '9px monospace';
            ctx.fillStyle = '#8bf';
            ctx.textAlign = 'center';
            ctx.fillText(`${angleDeg.toFixed(1)}°`, (x1 + x2) / 2, centerY - Math.max(halfL, halfR) - t - 6);
        }
    }

    // Légende
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = plankStroke; ctx.fillText(`— ${valLabel} (gen)`, cw - 150, 15);
    if (idealCurve.length > 1) {
        ctx.fillStyle = idealColor; ctx.fillText(`--- ${valLabel} (ideal)`, cw - 150, 28);
    }
}

// --- Exécution de la génération ---

function runGenerate(genState, genDom, rootElement) {
    const isHV = genDom.genHornType.value === 'hv';
    const segments = isHV
        ? generateHornSegmentsHV(genDom, rootElement)
        : generateHornSegments(genDom, rootElement);
    if (segments.length === 0) return;
    genState.lastGenSegments = segments;
    displayGeneratedSegments(segments, genState, genDom, rootElement);
    updateGenExpansionChart(segments, genState, genDom, rootElement);
    drawHorn2D(segments, genDom, rootElement, genState);
}

// --- Système d'onglets ---

function switchGenTab(tabName, genState, genDom) {
    genState.activeGenTab = tabName;
    genDom.genTabBtns.forEach(btn => {
        btn.classList.toggle('bg-green-700', btn.dataset.genTab === tabName);
    });
    genDom.genTabContents.forEach(el => {
        el.classList.toggle('hidden', el.id !== `gen-tab-${tabName}`);
    });
    if (genDom.gen2dViewBtnsContainer) {
        genDom.gen2dViewBtnsContainer.classList.toggle('hidden', tabName !== 'profile');
    }
    requestAnimationFrame(() => {
        if (tabName === 'expansion' && genState.genExpansionChart) genState.genExpansionChart.resize();
        if (tabName === 'profile' && genState.lastGenSegments.length) drawHorn2D(genState.lastGenSegments, genDom, genDom.rootElement, genState);
    });
}

// --- Mise à jour des paramètres d'expansion du générateur ---

function updateGenExpansionParams(genDom, genState, rootElement) {
    genDom.genExpansionParams.innerHTML = '';
    const type = genDom.genExpansionType.value;
    if (type === 'Hypex') {
        genDom.genExpansionParams.innerHTML = `<span>Flare (T)</span><input type="text" id="gen-param-T" value="1.0" min="0" max="1.5" step="0.05" class="form-input form-input-sm">`;
    } else if (type === 'OS') {
        genDom.genExpansionParams.innerHTML = `<span>θ (deg)</span><input type="text" id="gen-param-theta" value="45" class="form-input form-input-sm">`;
    }
    genDom.genExpansionParams.querySelectorAll('input').forEach(input => {
        enableMouseWheelAdjustment(input);
        if (genState && rootElement) {
            input.addEventListener('input', () => runGenerate(genState, genDom, rootElement));
        }
    });
}

// --- Shape fields ---

function updateShapeFields(which, genDom) {
    if (which === 'throat') {
        const mode = genDom.genThroatShape.value;
        genDom.genThroatFields.className = mode === 'rectangular' ? 'contents' : 'hidden contents';
        genDom.genThroatCircular.className = mode === 'circular' ? 'contents' : 'hidden contents';
        genDom.genThroatSurface.className = mode === 'surface' ? 'contents' : 'hidden contents';
    } else {
        const mode = genDom.genMouthShape.value;
        genDom.genMouthFields.className = mode === 'rectangular' ? 'contents' : 'hidden contents';
        genDom.genMouthCircular.className = mode === 'circular' ? 'contents' : 'hidden contents';
        genDom.genMouthSurface.className = mode === 'surface' ? 'contents' : 'hidden contents';
    }
}

// --- Export des segments générés vers d'autres panneaux ---

function handleGenExport(target, genState, genDom, rootElement) {
    const segs = genState.lastGenSegments;
    if (!segs || segs.length === 0) return;

    if (target === 'hornscript') {
        // Format identique à l'export principal : { segments, count, unit:'mm' }
        const segments = segs.map((seg, i) => ({
            index: i, w: seg.w, h: seg.h,
            l: (i === segs.length - 1) ? 0 : seg.l,
            s: seg.w * seg.h, cumulativeL: 0
        }));
        let cum = 0;
        segments.forEach((s, i) => { s.cumulativeL = cum; cum += s.l; });

        const payload = { segments, count: segs.length, unit: 'mm' };
        window.showTool('hornscript', 'Horn-Script LEM');
        setTimeout(() => {
            window.panelEvents.dispatchEvent(new CustomEvent('export-to-hornscript', { detail: payload }));
        }, 100);
    }
    else if (target === 'horn') {
        // Injecter les segments dans le tableau du mode édition
        const tableBody = rootElement.querySelector('#segments-table-body');
        const segCountInput = rootElement.querySelector('#segment-count');
        if (!tableBody || !segCountInput) return;

        segCountInput.value = segs.length;
        segCountInput.dispatchEvent(new Event('input', { bubbles: true }));

        requestAnimationFrame(() => {
            const rows = tableBody.querySelectorAll('.segment-row');
            segs.forEach((seg, i) => {
                const row = rows[i];
                if (!row) return;
                const wInput = row.querySelector('.segment-w');
                const hInput = row.querySelector('.segment-h');
                const lInput = row.querySelector('.segment-l');
                const sInput = row.querySelector('.segment-s-input');
                if (wInput) wInput.value = seg.w.toFixed(1);
                if (hInput) hInput.value = seg.h.toFixed(1);
                if (lInput) lInput.value = (i === segs.length - 1) ? '' : seg.l.toFixed(1);
                if (sInput) sInput.value = Math.round(seg.w * seg.h);
            });
            // Revenir en mode édition
            rootElement.querySelector('#generate-view').classList.add('hidden');
            rootElement.querySelector('#edit-view').classList.remove('hidden');
            const toggleGraphBtn = rootElement.querySelector('#toggle-graph-btn');
            if (toggleGraphBtn) toggleGraphBtn.classList.remove('hidden');
            // Déclencher une mise à jour du graphe
            const firstInput = tableBody.querySelector('.segment-w');
            if (firstInput) firstInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }
    else if (target === 'directivity') {
        if (segs.length < 2) return;
        const last = segs[segs.length - 1];
        const prev = segs[segs.length - 2];
        const deltaW = last.w - prev.w;
        const deltaH = last.h - prev.h;
        const len = prev.l;

        const halfAngleRadH = Math.atan((deltaW / 2) / len);
        const wallAngleH = (halfAngleRadH * 180 / Math.PI) * 2;
        const halfAngleRadV = Math.atan((deltaH / 2) / len);
        const wallAngleV = (halfAngleRadV * 180 / Math.PI) * 2;

        const expansionType = genDom.genExpansionType.value || 'Conical';
        const s0 = segs[0].w * segs[0].h;
        const s0M = s0 / 1000000;
        const cutoffFrequency = 344 / (4 * Math.sqrt(s0M));

        const payload = {
            lastSegmentWidth: last.w,
            lastSegmentHeight: last.h,
            calculatedWallAngleH: wallAngleH,
            calculatedWallAngleV: wallAngleV,
            expansionType,
            cutoffFrequency
        };

        window.showTool('directivity', 'Directivity Calculator');
        setTimeout(() => {
            window.panelEvents.dispatchEvent(new CustomEvent('export-to-directivity', { detail: payload }));
        }, 100);
    }
}

// --- Initialisation complète du mode Génération ---

export function initGenerateMode(rootElement, dom) {
    const genDom = {
        rootElement,
        genExpansionType: rootElement.querySelector('#gen-expansion-type'),
        genExpansionParams: rootElement.querySelector('#gen-expansion-params'),
        genHornType: rootElement.querySelector('#gen-horn-type'),
        genHvFields: rootElement.querySelector('#gen-hv-fields'),
        genDirectivityH: rootElement.querySelector('#gen-directivity-h'),
        genDirectivityV: rootElement.querySelector('#gen-directivity-v'),
        genMouthSection: rootElement.querySelector('#gen-mouth-section'),
        genHornLength: rootElement.querySelector('#gen-horn-length'),
        genThroatWidth: rootElement.querySelector('#gen-throat-width'),
        genThroatHeight: rootElement.querySelector('#gen-throat-height'),
        genMouthWidth: rootElement.querySelector('#gen-mouth-width'),
        genMouthHeight: rootElement.querySelector('#gen-mouth-height'),
        genFc: rootElement.querySelector('#gen-fc'),
        genSegmentCount: rootElement.querySelector('#gen-segment-count'),
        genGenerateBtn: rootElement.querySelector('#gen-generate-btn'),
        genHornCanvas: rootElement.querySelector('#gen-horn-canvas'),
        genSegmentsTableBody: rootElement.querySelector('#gen-segments-table-body'),
        genThroatShape: rootElement.querySelector('#gen-throat-shape'),
        genThroatFields: rootElement.querySelector('#gen-throat-fields'),
        genThroatCircular: rootElement.querySelector('#gen-throat-circular'),
        genThroatSurface: rootElement.querySelector('#gen-throat-surface'),
        genThroatDiameter: rootElement.querySelector('#gen-throat-diameter'),
        genThroatArea: rootElement.querySelector('#gen-throat-area'),
        genMouthShape: rootElement.querySelector('#gen-mouth-shape'),
        genMouthFields: rootElement.querySelector('#gen-mouth-fields'),
        genMouthCircular: rootElement.querySelector('#gen-mouth-circular'),
        genMouthSurface: rootElement.querySelector('#gen-mouth-surface'),
        genMouthDiameter: rootElement.querySelector('#gen-mouth-diameter'),
        genMouthArea: rootElement.querySelector('#gen-mouth-area'),
        genConstantHeight: rootElement.querySelector('#gen-constant-height'),
        genConstantHeightField: rootElement.querySelector('#gen-constant-height-field'),
        genConstantHeightValue: rootElement.querySelector('#gen-constant-height-value'),
        gen2dViewBtns: rootElement.querySelectorAll('.gen-2d-view-btn'),
        gen2dViewBtnsContainer: rootElement.querySelector('#gen-2d-view-btns'),
        genTabBtns: rootElement.querySelectorAll('.gen-tab-btn'),
        genTabContents: rootElement.querySelectorAll('.gen-tab-content'),
    };

    const genState = {
        genExpansionChart: null,
        lastGenSegments: [],
        lockedLengths: new Set(),
        activeGenTab: 'expansion',
        isGenerateMode: false,
        gen2dView: 'surface',
    };

    const generateModeBtn = rootElement.querySelector('#generate-mode-btn');
    const backToEditBtn = rootElement.querySelector('#back-to-edit-btn');
    const mainView = rootElement.querySelector('#edit-view');
    const generateView = rootElement.querySelector('#generate-view');
    const toggleGraphBtn = dom.toggleGraphBtn;

    // --- Horn type selector logic ---
    function updateHornTypeUI() {
        const isConstantH = genDom.genHornType.value === 'constantH';
        genDom.genConstantHeight.checked = isConstantH;
        genDom.genConstantHeightField.className = isConstantH ? 'contents' : 'hidden contents';
        genDom.genHvFields.className = isConstantH ? 'hidden contents' : 'contents';
        // Mouth section: toggle the whole control-group
        genDom.genMouthSection.classList.toggle('hidden', isConstantH);
    }
    genDom.genHornType.addEventListener('change', updateHornTypeUI);
    updateHornTypeUI();

    // Shape selectors
    genDom.genThroatShape.addEventListener('change', () => updateShapeFields('throat', genDom));
    genDom.genMouthShape.addEventListener('change', () => updateShapeFields('mouth', genDom));

    // 2D view mode switcher
    genDom.gen2dViewBtns.forEach(btn => {
        btn.classList.toggle('bg-green-700', btn.dataset.view === genState.gen2dView);
        btn.addEventListener('click', () => {
            genState.gen2dView = btn.dataset.view;
            genDom.gen2dViewBtns.forEach(b => b.classList.toggle('bg-green-700', b.dataset.view === genState.gen2dView));
            if (genState.lastGenSegments.length) drawHorn2D(genState.lastGenSegments, genDom, rootElement, genState);
        });
    });

    // Tab system
    genDom.genTabBtns.forEach(btn => btn.addEventListener('click', () => switchGenTab(btn.dataset.genTab, genState, genDom)));
    switchGenTab('expansion', genState, genDom);

    // Mode switching
    generateModeBtn.addEventListener('click', () => {
        mainView.classList.add('hidden');
        generateView.classList.remove('hidden');
        toggleGraphBtn.classList.add('hidden');
        genState.isGenerateMode = true;
        updateGenExpansionParams(genDom, genState, rootElement);
        autoCalcFcFromLength(genDom);
        switchGenTab(genState.activeGenTab, genState, genDom);
        runGenerate(genState, genDom, rootElement);
    });

    // Accordion toggle for control-groups
    generateView.querySelectorAll('.control-label-toggle').forEach(header => {
        const content = header.nextElementSibling;
        const arrow = header.querySelector('svg');
        // Open all sections by default
        content.classList.add('is-open');
        arrow.classList.add('rotate-180');
        header.addEventListener('click', () => {
            content.classList.toggle('is-open');
            arrow.classList.toggle('rotate-180');
        });
    });

    backToEditBtn.addEventListener('click', () => {
        generateView.classList.add('hidden');
        mainView.classList.remove('hidden');
        toggleGraphBtn.classList.remove('hidden');
        genState.isGenerateMode = false;
    });

    // Generate events
    genDom.genExpansionType.addEventListener('change', () => { updateGenExpansionParams(genDom, genState, rootElement); runGenerate(genState, genDom, rootElement); });
    genDom.genHornLength.addEventListener('input', () => { autoCalcFcFromLength(genDom); runGenerate(genState, genDom, rootElement); });
    genDom.genFc.addEventListener('input', () => { autoCalcLengthFromFc(genDom); runGenerate(genState, genDom, rootElement); });

    // Real-time regeneration on any parameter change
    const regenInputIds = [
        '#gen-directivity-h', '#gen-directivity-v', '#gen-constant-height-value',
        '#gen-throat-width', '#gen-throat-height', '#gen-throat-diameter', '#gen-throat-area',
        '#gen-mouth-width', '#gen-mouth-height', '#gen-mouth-diameter', '#gen-mouth-area',
        '#gen-segment-count'
    ];
    regenInputIds.forEach(sel => {
        const el = rootElement.querySelector(sel);
        if (el) el.addEventListener('input', () => runGenerate(genState, genDom, rootElement));
    });
    const regenSelectIds = ['#gen-horn-type', '#gen-throat-shape', '#gen-mouth-shape'];
    regenSelectIds.forEach(sel => {
        const el = rootElement.querySelector(sel);
        if (el) el.addEventListener('change', () => runGenerate(genState, genDom, rootElement));
    });

    // --- Export dropdown ---
    const genExportOptions = rootElement.querySelector('#gen-export-options');
    genDom.genGenerateBtn.addEventListener('click', () => {
        genExportOptions.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
        if (!genDom.genGenerateBtn.contains(e.target)) genExportOptions.classList.add('hidden');
    });
    genExportOptions.addEventListener('click', (e) => {
        e.preventDefault();
        const link = e.target.closest('a');
        if (!link || !link.dataset.genTarget) return;
        genExportOptions.classList.add('hidden');
        handleGenExport(link.dataset.genTarget, genState, genDom, rootElement);
    });

    // --- Reset button ---
    const genResetBtn = rootElement.querySelector('#gen-reset-btn');
    if (genResetBtn) {
        genResetBtn.addEventListener('click', () => {
            // Reset form values to defaults
            genDom.genExpansionType.value = 'Exponential';
            genDom.genHornType.value = 'hv';
            genDom.genDirectivityH.value = '90';
            genDom.genDirectivityV.value = '40';
            genDom.genConstantHeightValue.value = '200';
            genDom.genThroatShape.value = 'rectangular';
            genDom.genThroatWidth.value = '100';
            genDom.genThroatHeight.value = '56';
            genDom.genThroatDiameter.value = '84';
            genDom.genThroatArea.value = '5600';
            genDom.genMouthShape.value = 'rectangular';
            genDom.genMouthWidth.value = '400';
            genDom.genMouthHeight.value = '226';
            genDom.genMouthDiameter.value = '340';
            genDom.genMouthArea.value = '90400';
            genDom.genHornLength.value = '500';
            genDom.genFc.value = '';
            genDom.genSegmentCount.value = '6';

            // Reset state
            genState.lockedLengths = new Set();
            genState.gen2dView = 'surface';
            genDom.gen2dViewBtns.forEach(b => b.classList.toggle('bg-green-700', b.dataset.view === 'surface'));

            // Refresh UI
            updateHornTypeUI();
            updateShapeFields('throat', genDom);
            updateShapeFields('mouth', genDom);
            updateGenExpansionParams(genDom, genState, rootElement);
            autoCalcFcFromLength(genDom);
            runGenerate(genState, genDom, rootElement);
        });
    }
}
