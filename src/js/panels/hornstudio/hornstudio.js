// ====================================================================================================
// FICHIER :  src/js/panels/hornstudio/hornstudio.js
// RÔLE :     Orchestre le panneau Horn Studio (générateur de pavillons standalone).
// ====================================================================================================

import { getHornStudioPanelHtml } from './uiTemplates.js';
import { generateHornSegments, generateHornSegmentsHV, generateIdealExpansionCurve, autoCalcFcFromLength, autoCalcLengthFromFc, getThroatData, getMouthData } from './generator.js';
import { enableMouseWheelAdjustment } from '../horn/eventHandlers.js';
import { expansionFormulas } from '../horn/formulas.js';
import { getSettings } from '../mainsettings/mainsettings.js';
import { importBemMeshContent, initializeBemSolverPanel, hasCompletedBemSimulation, rerunBemSolver, refreshBemGraphs } from '../bemsolver/bemSolver.js';
import * as THREE from '../../lib/three.module.js';
import { OrbitControls } from '../../lib/OrbitControls.js';
import { createFoldingState, drawFoldedHorn, attachFoldingEvents, detachFoldingEvents, resetFoldingState } from './foldingEditor.js';
import { getChartThemeColors } from '../../utils/chartThemeHelper.js';

export { getHornStudioPanelHtml };

// --- Palette sobre du profil 2D, dérivée du thème actif de l'app ---

function withAlpha(color, alpha) {
    const hex = color?.match(/^#([a-f\d]{3}|[a-f\d]{6})$/i)?.[1];
    if (hex) {
        const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
        const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    const rgb = color?.match(/^rgba?\(([^)]+)\)$/i)?.[1]?.split(',').slice(0, 3).map(v => parseFloat(v.trim()));
    if (rgb?.length === 3 && rgb.every(Number.isFinite)) return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
    return color;
}

function getHorn2DPalette() {
    const theme = getChartThemeColors();
    const accent = theme.primary || '#ec4899';
    return {
        accent,
        accentSoft: withAlpha(accent, 0.55),
        accentFaint: withAlpha(accent, 0.12),
        bgTop: '#0d0f14',
        bgBottom: '#090b0f',
        grid: 'rgba(100,112,132,.22)',
        gridStrong: 'rgba(120,132,150,.4)',
        text: '#8b93a3',
        textStrong: '#c3c9d4',
        plank: '#3a3f4a',
        plankBorder: '#565d6b',
        outline: '#c7cdd6',
        joint: 'rgba(15,17,22,.85)'
    };
}

// --- Affichage du tableau de segments générés ---

const LOCK_SVG_OPEN = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 5-5 5 5 0 0 1 5 5"/></svg>';
const LOCK_SVG_CLOSED = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

function dimColorClass(val, minVal, maxVal) {
    const t = maxVal > minVal ? (val - minVal) / (maxVal - minVal) : 0;
    if (t < 0.25) return 'hs-dim-sky';
    if (t < 0.5)  return 'hs-dim-emerald';
    if (t < 0.75) return 'hs-dim-amber';
    return 'hs-dim-orange';
}

function areaColorClass(val, minVal, maxVal) {
    const t = maxVal > minVal ? (val - minVal) / (maxVal - minVal) : 0;
    if (t < 0.25) return 'hs-dim-sky';
    if (t < 0.5)  return 'hs-dim-emerald';
    if (t < 0.75) return 'hs-dim-amber';
    return 'hs-dim-orange';
}

function displayGeneratedSegments(segments, genState, genDom, rootElement) {
    const container = genDom.genSegmentsTableContainer;
    if (!container) return;
    const lockedSet = genState.lockedLengths || new Set();

    const minW = Math.min(...segments.map(s => s.w));
    const maxW = Math.max(...segments.map(s => s.w));
    const minH = Math.min(...segments.map(s => s.h));
    const maxH = Math.max(...segments.map(s => s.h));
    const areas = segments.map(s => Math.round(s.w * s.h));
    const minArea = Math.min(...areas);
    const maxArea = Math.max(...areas);

    const rowsHtml = segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const isLocked = lockedSet.has(i);
        const area = areas[i];
        const rowCls = isLast ? 'hs-mouth-row' : '';
        const idxLabel = isLast
            ? `#${i + 1} <span class="hs-badge">MOUTH</span>`
            : (i === 0 ? `#${i + 1} <span class="hs-badge" style="background:rgba(59,130,246,.2);color:#93c5fd">THROAT</span>` : `#${i + 1}`);
        const wCls = dimColorClass(seg.w, minW, maxW);
        const hCls = dimColorClass(seg.h, minH, maxH);
        const aCls = areaColorClass(area, minArea, maxArea);

        return `
            <tr class="${rowCls}" data-seg-idx="${i}">
                <td class="hs-idx">${idxLabel}</td>
                <td class="${wCls}">${seg.w.toFixed(1)}</td>
                <td class="${hCls}">${seg.h.toFixed(1)}</td>
                <td>${isLast
                    ? '<span style="color:#4b5563">—</span>'
                    : `<input type="text" class="gen-seg-length hs-len-input" data-idx="${i}" value="${seg.l.toFixed(1)}">`}</td>
                <td>${isLast
                    ? ''
                    : `<button class="gen-seg-lock hs-lock-btn ${isLocked ? 'locked' : ''}" data-idx="${i}" title="${isLocked ? 'Unlock' : 'Lock'} length">${isLocked ? LOCK_SVG_CLOSED : LOCK_SVG_OPEN}</button>`}</td>
                <td class="${aCls}">${area.toLocaleString()}</td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="hs-table">
            <thead>
                <tr>
                    <th>Segment</th>
                    <th>Width <span class="hs-unit">mm</span></th>
                    <th>Height <span class="hs-unit">mm</span></th>
                    <th>Length <span class="hs-unit">mm</span></th>
                    <th>Lock</th>
                    <th>Area <span class="hs-unit">mm²</span></th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>`;

    // --- Lock buttons ---
    container.querySelectorAll('.gen-seg-lock').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            if (!genState.lockedLengths) genState.lockedLengths = new Set();
            if (genState.lockedLengths.has(idx)) {
                genState.lockedLengths.delete(idx);
                btn.classList.remove('locked');
                btn.innerHTML = LOCK_SVG_OPEN;
                btn.title = 'Lock length';
            } else {
                genState.lockedLengths.add(idx);
                btn.classList.add('locked');
                btn.innerHTML = LOCK_SVG_CLOSED;
                btn.title = 'Unlock length';
            }
        });
    });

    // --- Editable length inputs ---
    container.querySelectorAll('.gen-seg-length').forEach(input => {
        let applied = false;
        const applyChange = () => {
            if (applied) return;
            applied = true;
            const idx = parseInt(input.dataset.idx);
            const newLen = parseFloat(input.value);
            if (!isFinite(newLen) || newLen <= 0) {
                input.value = genState.lastGenSegments[idx].l.toFixed(1);
                return;
            }
            applyLengthEdit(idx, newLen, genState, genDom, rootElement);
        };
        input.addEventListener('change', applyChange);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applyChange(); input.blur(); }
        });
        enableMouseWheelAdjustment(input);
    });
}

// --- Appliquer une modification de longueur avec redistribution ---

function applyLengthEdit(editedIdx, newLen, genState, genDom, rootElement) {
    const segs = genState.lastGenSegments;
    if (!segs || editedIdx >= segs.length - 1) return;
    genState._suppressRegenerate = true;

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
    const constantH = genDom.genConstantHeight ? genDom.genConstantHeight.checked : false;
    const fixedH = constantH ? (parseFloat(genDom.genConstantHeightValue?.value) || 200) : 0;
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

    // Mise à jour du folding editor si actif
    if (genState.foldingActive && genDom.genFoldingCanvas) {
        drawFoldedHorn(genDom.genFoldingCanvas, segs, genState.foldingState, genDom, rootElement, genState);
    }
    setTimeout(() => { genState._suppressRegenerate = false; }, 0);
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

    const pal = getHorn2DPalette();
    genState.genExpansionChart = new Chart(chartCanvas, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Ideal Expansion', data: idealCurve,
                    borderColor: pal.accentSoft, borderDash: [5, 4], borderWidth: 1.6, pointRadius: 0, tension: 0.1, fill: false,
                },
                {
                    label: 'Generated Segments', data: genPoints,
                    borderColor: pal.outline, backgroundColor: pal.outline,
                    borderWidth: 2, pointRadius: 4, pointStyle: 'circle', tension: 0, fill: false,
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            parsing: { xAxisKey: 'x', yAxisKey: 'y' },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Length (mm)', color: pal.text }, ticks: { color: pal.text }, grid: { color: pal.grid } },
                y: { type: 'linear', title: { display: true, text: 'Area (mm²)', color: pal.text }, ticks: { color: pal.text }, grid: { color: pal.grid }, beginAtZero: true }
            },
            plugins: {
                legend: { labels: { color: pal.textStrong, usePointStyle: true, pointStyle: 'line' } },
                tooltip: { mode: 'nearest', intersect: false }
            }
        }
    });
}

// --- Dessin 2D du profil ---

// Manual override (mm) from Mesh Settings; falls back to an auto value derived from the throat.
function getBaffleDiameterMm(genDom, autoMm) {
    const v = parseFloat(genDom.genMeshBaffleDiameter?.value);
    return (v > 0) ? v : autoMm;
}

function drawHorn2D(segments, genDom, rootElement, genState) {
    const canvas = genDom.genHornCanvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return; // not laid out yet
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = rect.width;
    const ch = rect.height;
    const pal = getHorn2DPalette();

    // --- Background: flat, sober vertical gradient ---
    const bgGrad = ctx.createLinearGradient(0, 0, 0, ch);
    bgGrad.addColorStop(0, pal.bgTop);
    bgGrad.addColorStop(1, pal.bgBottom);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cw, ch);

    if (!segments || segments.length < 2) return;

    // --- View mode ---
    const viewMode = (genState && genState.gen2dView) ? genState.gen2dView : 'surface';
    const getVal = (seg) => {
        if (viewMode === 'width') return seg.w;
        if (viewMode === 'height') return seg.h;
        return seg.s;
    };
    const valLabel = viewMode === 'width' ? 'Width (H)' : viewMode === 'height' ? 'Height (V)' : 'Surface';
    const valUnit = viewMode === 'surface' ? 'mm²' : 'mm';

    const maxVal = Math.max(...segments.map(s => getVal(s)));
    if (maxVal <= 0) return;

    // Ideal curve (surface mode only)
    let idealCurve = [];
    if (viewMode === 'surface') {
        idealCurve = generateIdealExpansionCurve(genDom, rootElement);
    }
    const idealMax = idealCurve.length ? Math.max(...idealCurve.map(p => p.y)) : maxVal;
    const globalMax = Math.max(maxVal, idealMax);

    const n = segments.length;
    const marginL = 72, marginR = 28, marginT = 38, marginB = 46;
    const BAFFLE_W = 22;                      // on-canvas baffle thickness (px)
    const plotL = marginL + BAFFLE_W;         // horn plot starts AFTER the baffle
    const drawW = cw - plotL - marginR;
    const drawH = ch - marginT - marginB;

    // X positions based on real segment lengths
    const totalL = segments.reduce((sum, s) => sum + s.l, 0);
    const segXPositions = [0];
    let cumLen = 0;
    for (let i = 0; i < n - 1; i++) {
        cumLen += segments[i].l;
        segXPositions.push(cumLen);
    }
    const scaleX = totalL > 0 ? drawW / totalL : 1;

    const plankT = 22; // plank thickness in px
    const scaleY = (drawH / 2 - plankT - 6) / (globalMax * 1.08);
    const centerY = marginT + drawH / 2;

    // --- Helper: nice tick interval ---
    function niceStep(range, targetTicks) {
        const raw = range / targetTicks;
        const pow = Math.pow(10, Math.floor(Math.log10(raw)));
        const n = raw / pow;
        const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow;
        return step;
    }

    // --- Grid (length + value axis) ---
    ctx.save();
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = pal.text;
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;

    // vertical grid lines (length)
    if (totalL > 0) {
        const stepX = niceStep(totalL, 8);
        for (let x = 0; x <= totalL + 0.001; x += stepX) {
            const px = plotL + x * scaleX;
            ctx.beginPath();
            ctx.moveTo(px, marginT);
            ctx.lineTo(px, marginT + drawH);
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.fillStyle = pal.text;
            ctx.fillText(x.toFixed(0), px, marginT + drawH + 14);
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = pal.textStrong;
        ctx.fillText('Length (mm)', plotL + drawW / 2, marginT + drawH + 30);
    }

    // horizontal grid (symmetric about center)
    const stepY = niceStep(globalMax, 5);
    for (let v = 0; v <= globalMax * 1.05; v += stepY) {
        const halfPx = v * scaleY;
        for (const y of [centerY - halfPx, centerY + halfPx]) {
            if (y < marginT || y > marginT + drawH) continue;
            ctx.strokeStyle = v === 0 ? pal.gridStrong : pal.grid;
            ctx.beginPath();
            ctx.moveTo(plotL, y);
            ctx.lineTo(plotL + drawW, y);
            ctx.stroke();
            if (v > 0) {
                ctx.fillStyle = pal.text;
                ctx.textAlign = 'right';
                ctx.fillText(v.toFixed(0), marginL - 8, y + 3);
            }
        }
    }
    // Y axis label (rotated)
    ctx.save();
    ctx.translate(14, centerY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = pal.textStrong;
    ctx.textAlign = 'center';
    ctx.fillText(`${valLabel} (${valUnit})`, 0, 0);
    ctx.restore();
    ctx.restore();

    // --- Center axis (dashed) ---
    ctx.save();
    ctx.strokeStyle = pal.gridStrong;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(plotL, centerY);
    ctx.lineTo(plotL + drawW, centerY);
    ctx.stroke();
    ctx.restore();

    // --- Ideal curve (smooth) ---
    if (idealCurve.length > 1) {
        ctx.save();
        const idealScaleX = totalL > 0 ? drawW / totalL : 1;
        const drawSmooth = (sign) => {
            ctx.beginPath();
            for (let i = 0; i < idealCurve.length; i++) {
                const px = plotL + idealCurve[i].x * idealScaleX;
                const py = centerY + sign * idealCurve[i].y * scaleY;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        };
        ctx.strokeStyle = pal.accentSoft;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([6, 4]);
        drawSmooth(-1);
        drawSmooth(1);
        ctx.setLineDash([]);
        ctx.restore();
    }

    // --- Smooth top/bottom profile curves through segment endpoints ---
    // Use monotone cubic interpolation for silky smoothness
    const topPts = [], botPts = [];
    for (let i = 0; i < n; i++) {
        const x = plotL + segXPositions[i] * scaleX;
        const half = getVal(segments[i]) * scaleY;
        topPts.push({ x, y: centerY - half });
        botPts.push({ x, y: centerY + half });
    }

    function drawCatmullRom(pts) {
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2] || p2;
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
    }

    // --- Filled horn body (subtle envelope) ---
    ctx.save();
    ctx.fillStyle = pal.accentFaint;
    ctx.beginPath();
    drawCatmullRom(topPts);
    for (let i = botPts.length - 1; i >= 0; i--) {
        ctx.lineTo(botPts[i].x, botPts[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // --- Planches (sober flat slate trapezoidal planks) ---
    for (let i = 0; i < n - 1; i++) {
        const x1 = plotL + segXPositions[i] * scaleX;
        const x2 = plotL + segXPositions[i + 1] * scaleX;
        const halfL = getVal(segments[i]) * scaleY;
        const halfR = getVal(segments[i + 1]) * scaleY;

        // TOP PLANK
        ctx.fillStyle = pal.plank;
        ctx.beginPath();
        ctx.moveTo(x1, centerY - halfL - plankT);
        ctx.lineTo(x2, centerY - halfR - plankT);
        ctx.lineTo(x2, centerY - halfR);
        ctx.lineTo(x1, centerY - halfL);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = pal.plankBorder;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, centerY - halfL - plankT); ctx.lineTo(x2, centerY - halfR - plankT);
        ctx.moveTo(x1, centerY - halfL); ctx.lineTo(x2, centerY - halfR);
        ctx.stroke();

        // BOTTOM PLANK
        ctx.fillStyle = pal.plank;
        ctx.beginPath();
        ctx.moveTo(x1, centerY + halfL);
        ctx.lineTo(x2, centerY + halfR);
        ctx.lineTo(x2, centerY + halfR + plankT);
        ctx.lineTo(x1, centerY + halfL + plankT);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = pal.plankBorder;
        ctx.beginPath();
        ctx.moveTo(x1, centerY + halfL); ctx.lineTo(x2, centerY + halfR);
        ctx.moveTo(x1, centerY + halfL + plankT); ctx.lineTo(x2, centerY + halfR + plankT);
        ctx.stroke();

        // Side joints (thin darker lines)
        ctx.strokeStyle = pal.joint;
        ctx.lineWidth = 1;
        if (i === 0) {
            ctx.beginPath();
            ctx.moveTo(x1, centerY - halfL - plankT); ctx.lineTo(x1, centerY - halfL);
            ctx.moveTo(x1, centerY + halfL); ctx.lineTo(x1, centerY + halfL + plankT);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(x2, centerY - halfR - plankT); ctx.lineTo(x2, centerY - halfR);
        ctx.moveTo(x2, centerY + halfR); ctx.lineTo(x2, centerY + halfR + plankT);
        ctx.stroke();

        // Angle label (when in W/H view)
        if (viewMode !== 'surface' && segments[i].l > 0) {
            const dx = x2 - x1;
            const dy = halfR - halfL;
            const angleDeg = Math.atan2(Math.abs(dy), dx) * (180 / Math.PI);
            const lx = (x1 + x2) / 2;
            const ly = centerY - Math.max(halfL, halfR) - plankT - 10;
            const text = `${angleDeg.toFixed(1)}°`;
            ctx.font = '10px "Segoe UI", system-ui, sans-serif';
            const w = ctx.measureText(text).width + 10;
            ctx.fillStyle = 'rgba(20,22,28,.85)';
            ctx.strokeStyle = pal.plankBorder;
            ctx.lineWidth = 1;
            const rx = lx - w / 2, ry = ly - 11;
            roundRect(ctx, rx, ry, w, 15, 4);
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = pal.textStrong;
            ctx.textAlign = 'center';
            ctx.fillText(text, lx, ly);
        }
    }

    // --- Smooth profile outline on top of planks ---
    ctx.save();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.6;
    drawCatmullRom(topPts); ctx.stroke();
    drawCatmullRom(botPts); ctx.stroke();
    ctx.restore();

    // --- Segment endpoint dots ---
    for (let i = 0; i < n; i++) {
        for (const pts of [topPts, botPts]) {
            ctx.fillStyle = pal.accent;
            ctx.strokeStyle = pal.bgBottom;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(pts[i].x, pts[i].y, 2.6, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
        }
    }

    // --- Baffle du haut-parleur ---
    {
        const throatW = segments[0].w;
        const throatH = segments[0].h;
        const defaultBaffleMm = Math.max(throatW, throatH) * 2;
        const baffleMm = getBaffleDiameterMm(genDom, defaultBaffleMm);

        const throatVal = getVal(segments[0]);
        const throatHalfPx = throatVal * scaleY;

        let baffleRatio;
        if (viewMode === 'surface') {
            baffleRatio = (throatVal > 0) ? (baffleMm * baffleMm) / throatVal : 1;
        } else if (viewMode === 'width') {
            baffleRatio = (segments[0].w > 0) ? baffleMm / segments[0].w : 1;
        } else {
            baffleRatio = (segments[0].h > 0) ? baffleMm / segments[0].h : 1;
        }
        const halfBaffle = throatHalfPx * baffleRatio;

        const baffleX = plotL + segXPositions[0] * scaleX;
        const baffleThickness = BAFFLE_W;

        // Slate baffle, flat sober fill
        ctx.fillStyle = pal.plank;
        ctx.fillRect(baffleX - baffleThickness, centerY - halfBaffle, baffleThickness, halfBaffle * 2);

        // Contour
        ctx.strokeStyle = pal.plankBorder;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(baffleX - baffleThickness, centerY - halfBaffle, baffleThickness, halfBaffle * 2);

        // Subtle horizontal hatching
        ctx.strokeStyle = pal.joint;
        ctx.lineWidth = 0.6;
        for (let yy = centerY - halfBaffle + 6; yy < centerY + halfBaffle; yy += 8) {
            ctx.beginPath();
            ctx.moveTo(baffleX - baffleThickness + 2, yy);
            ctx.lineTo(baffleX - 2, yy);
            ctx.stroke();
        }

        // Throat hole (horn entrance)
        ctx.strokeStyle = pal.accent;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.2;
        ctx.strokeRect(baffleX - baffleThickness - 0.5, centerY - throatHalfPx, baffleThickness + 1, throatHalfPx * 2);
        ctx.setLineDash([]);

        // Label
        const label = `Baffle ⌀${baffleMm.toFixed(0)}mm`;
        ctx.font = '10px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = pal.text;
        ctx.textAlign = 'left';
        ctx.fillText(label, baffleX - baffleThickness, centerY - halfBaffle - 6);
    }

    // --- Legend card ---
    {
        const items = [
            { color: pal.outline, label: `Planks (${valLabel})` },
            ...(idealCurve.length > 1 ? [{ color: pal.accentSoft, label: `Ideal (${valLabel})`, dashed: true }] : []),
            { color: pal.accent, label: 'Throat' },
        ];

        const pad = 8;
        ctx.font = '10.5px "Segoe UI", system-ui, sans-serif';
        const maxW = Math.max(...items.map(it => ctx.measureText(it.label).width)) + 28;
        const lineH = 15;
        const boxH = items.length * lineH + pad * 2;
        const boxW = maxW + pad * 2;
        const bx = cw - marginR - boxW;
        const by = marginT - 8;
        ctx.fillStyle = 'rgba(13,15,20,.85)';
        ctx.strokeStyle = pal.plankBorder;
        ctx.lineWidth = 1;
        roundRect(ctx, bx, by, boxW, boxH, 6);
        ctx.fill(); ctx.stroke();
        items.forEach((it, i) => {
            const y = by + pad + i * lineH + 8;
            ctx.strokeStyle = it.color;
            ctx.lineWidth = 2;
            if (it.dashed) ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(bx + pad, y); ctx.lineTo(bx + pad + 16, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = pal.textStrong;
            ctx.textAlign = 'left';
            ctx.fillText(it.label, bx + pad + 22, y + 3);
        });
    }

    // --- Title ---
    ctx.fillStyle = pal.textStrong;
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Horn Profile — ${valLabel}`, plotL, marginT - 14);
    ctx.fillStyle = pal.text;
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${n} segments · ${totalL.toFixed(0)} mm total`, plotL + 180, marginT - 14);
}

function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
}

// ====================================================================================================
// VUE 3D DU PAVILLON (Three.js)
// ====================================================================================================

const threeState = {
    scene: null, camera: null, renderer: null, controls: null,
    hornGroup: null, initialized: false
};

function initThreeScene(container) {
    if (threeState.renderer) {
        threeState.renderer.dispose();
        while (container.firstChild) container.removeChild(container.firstChild);
    }

    threeState.scene = new THREE.Scene();
    const aspect = container.clientWidth / container.clientHeight || 1;
    const frustumSize = 400;
    threeState.camera = new THREE.OrthographicCamera(
        -frustumSize * aspect / 2, frustumSize * aspect / 2,
        frustumSize / 2, -frustumSize / 2, 0.1, 5000
    );
    threeState.camera.position.set(300, 200, 300);
    threeState.camera.lookAt(0, 0, 0);

    threeState.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    threeState.renderer.setSize(container.clientWidth, container.clientHeight);
    threeState.renderer.setClearColor(0x111827, 1);
    container.appendChild(threeState.renderer.domElement);

    threeState.controls = new OrbitControls(threeState.camera, threeState.renderer.domElement);
    threeState.controls.enableDamping = true;

    threeState.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dL = new THREE.DirectionalLight(0xffffff, 0.7);
    dL.position.set(1, 1.5, 1);
    threeState.scene.add(dL);
    const dL2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dL2.position.set(-1, -0.5, -1);
    threeState.scene.add(dL2);

    threeState.hornGroup = new THREE.Group();
    threeState.scene.add(threeState.hornGroup);
    threeState.initialized = true;

    const animate = () => {
        requestAnimationFrame(animate);
        threeState.controls.update();
        threeState.renderer.render(threeState.scene, threeState.camera);
    };
    animate();

    new ResizeObserver(() => {
        if (!container || container.clientWidth === 0) return;
        const a = container.clientWidth / container.clientHeight;
        threeState.camera.left = -frustumSize * a / 2;
        threeState.camera.right = frustumSize * a / 2;
        threeState.camera.top = frustumSize / 2;
        threeState.camera.bottom = -frustumSize / 2;
        threeState.camera.updateProjectionMatrix();
        threeState.renderer.setSize(container.clientWidth, container.clientHeight);
    }).observe(container);
}

function drawHorn3D(segments, genDom, genState) {
    if (!threeState.initialized || !threeState.hornGroup) return;
    if (!segments || segments.length < 2) return;

    // Clear previous
    while (threeState.hornGroup.children.length) {
        const child = threeState.hornGroup.children[0];
        threeState.hornGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    }

    // --- Mesh parameters ---
    const angularPts = parseInt(genDom.genMeshAngular?.value) || 24;
    const axialPtsPerSeg = parseInt(genDom.genMeshAxial?.value) || 4;
    const baffleMeshPts = parseInt(genDom.genMeshBaffle?.value) || 6;
    const woodThick = parseFloat(genDom.genMeshWoodThick?.value) || 18;
    const itfMeshPts = parseInt(genDom.genMeshItf?.value) || 4;
    const showInterfaces = genDom.genMeshInterfaces?.checked !== false;
    const splitH = genDom.genMeshSplitH?.checked === true;
    const splitV = genDom.genMeshSplitV?.checked === true;
    const doSplit = splitH || splitV;
    // Split filter: hides faces whose midpoint falls in the removed half
    function splitFilter(p) {
        if (splitH && p.y < 0) return false;
        if (splitV && p.z < 0) return false;
        return true;
    }
    const sf = doSplit ? splitFilter : null;

    // --- Surface color palette: wood tones (each section a distinct shade) ---
    const SURFACE_COLORS = [
        0x8b5a2b, 0xa9713f, 0x6f4522, 0xc08a4e, 0x7a4d27,
        0x9c6b3e, 0x5c3a1e, 0xb8895a, 0x8a5a34, 0x734423,
        0xd1a06b, 0x63401f, 0xa6764a, 0x54331a, 0xbd9463,
        0x89623a, 0x996633, 0x714f2c, 0xc79b6a, 0x674328
    ];
    const wireColor = 0x1a1208;
    const wireOpacity = 0.85;
    let colorIdx = 0;
    function nextColor() { return SURFACE_COLORS[colorIdx++ % SURFACE_COLORS.length]; }
    // Separate color counter for interfaces so toggling doesn't shift subdomain colors
    let itfColorIdx = 10; // start at offset to avoid overlap with subdomain colors
    function nextItfColor() { return SURFACE_COLORS[itfColorIdx++ % SURFACE_COLORS.length]; }

    // Named geometries for MSH export
    const namedGeometries = [];
    const edgeMaterial = new THREE.LineBasicMaterial({ color: wireColor, transparent: true, opacity: wireOpacity });

    function addSurface(geom, color, name) {
        const solid = new THREE.MeshPhongMaterial({
            color,
            side: THREE.DoubleSide,
            flatShading: false,
            shininess: 12,
            specular: 0x1a1208
        });
        threeState.hornGroup.add(new THREE.Mesh(geom, solid));
        // Black contour lines separating each section
        threeState.hornGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), edgeMaterial));
        if (name) namedGeometries.push({ geometry: geom, name });
    }

    const n = segments.length;

    // Build segment boundary data
    const segBounds = [];
    let cumX = 0;
    for (let i = 0; i < n; i++) {
        segBounds.push({ x: cumX, hw: segments[i].w / 2, hh: segments[i].h / 2 });
        if (i < n - 1) cumX += segments[i].l;
    }
    const totalLen = cumX;
    const offsetX = -totalLen / 2;

    // Rounded-rectangle ring generator
    function makeRing(hw, hh, numPts) {
        const pts = [];
        for (let i = 0; i < numPts; i++) {
            const t = (i / numPts) * Math.PI * 2;
            const cosT = Math.cos(t);
            const sinT = Math.sin(t);
            let py, pz;
            if (Math.abs(cosT) * hh >= Math.abs(sinT) * hw) {
                pz = (cosT >= 0 ? 1 : -1) * hw;
                py = Math.max(-hh, Math.min(hh, sinT / Math.abs(cosT) * hh));
            } else {
                py = (sinT >= 0 ? 1 : -1) * hh;
                pz = Math.max(-hw, Math.min(hw, cosT / Math.abs(sinT) * hw));
            }
            pts.push({ y: py, z: pz });
        }
        return pts;
    }

    // Circle generator
    function makeCircle(radius, numPts) {
        const pts = [];
        for (let i = 0; i < numPts; i++) {
            const t = (i / numPts) * Math.PI * 2;
            pts.push({ y: Math.sin(t) * radius, z: Math.cos(t) * radius });
        }
        return pts;
    }

    // Interpolate between two segment boundaries
    function interpRing(r0, r1, t) {
        return {
            x: r0.x + (r1.x - r0.x) * t,
            hw: r0.hw + (r1.hw - r0.hw) * t,
            hh: r0.hh + (r1.hh - r0.hh) * t
        };
    }

    // Helper: build wall strip for a sector — keeps all vertices, only emits faces whose midpoint passes filter
    function buildWallStrip(segRings, filter, angPts) {
        const verts = [];
        const idx = [];
        for (const ring of segRings) {
            for (const p of ring.pts) {
                verts.push(ring.x + offsetX, p.y, p.z);
            }
        }
        for (let ri = 0; ri < segRings.length - 1; ri++) {
            const b0 = ri * angPts;
            const b1 = (ri + 1) * angPts;
            for (let ai = 0; ai < angPts; ai++) {
                const nxt = (ai + 1) % angPts;
                const p0 = segRings[ri].pts[ai];
                const p1 = segRings[ri].pts[nxt];
                const midY = (p0.y + p1.y) / 2;
                const midZ = (p0.z + p1.z) / 2;
                if (!filter({ y: midY, z: midZ })) continue;
                idx.push(b0 + ai, b0 + nxt, b1 + nxt);
                idx.push(b0 + ai, b1 + nxt, b1 + ai);
            }
        }
        if (idx.length === 0) return null;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geom.setIndex(idx);
        geom.computeVertexNormals();
        return geom;
    }

    // Build full wall strip (closed loop)
    function buildFullWall(segRings, angPts) {
        const verts = [];
        const idx = [];
        for (const ring of segRings) {
            for (const p of ring.pts) {
                verts.push(ring.x + offsetX, p.y, p.z);
            }
        }
        for (let ri = 0; ri < segRings.length - 1; ri++) {
            const b0 = ri * angPts;
            const b1 = (ri + 1) * angPts;
            for (let pi = 0; pi < angPts; pi++) {
                const nxt = (pi + 1) % angPts;
                idx.push(b0 + pi, b0 + nxt, b1 + nxt);
                idx.push(b0 + pi, b1 + nxt, b1 + pi);
            }
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geom.setIndex(idx);
        geom.computeVertexNormals();
        return geom;
    }

    // Helper: build interface cap with radial subdivision + optional sector filter
    function buildCapGeom(ring, xPos, angPts, sectorFilter) {
        const verts = [];
        const idx = [];
        const radialRings = itfMeshPts + 1;
        for (let ri = 0; ri < radialRings; ri++) {
            const t = ri / (radialRings - 1);
            if (ri === 0) {
                verts.push(xPos, 0, 0);
            } else {
                for (let ai = 0; ai < angPts; ai++) {
                    verts.push(xPos, ring[ai].y * t, ring[ai].z * t);
                }
            }
        }
        for (let ai = 0; ai < angPts; ai++) {
            const nxt = (ai + 1) % angPts;
            if (sectorFilter) {
                const midY = (ring[ai].y + ring[nxt].y) / 2;
                const midZ = (ring[ai].z + ring[nxt].z) / 2;
                if (!sectorFilter({ y: midY, z: midZ })) continue;
            }
            idx.push(0, 1 + ai, 1 + nxt);
            for (let ri = 1; ri < radialRings - 1; ri++) {
                const b0 = 1 + (ri - 1) * angPts;
                const b1 = 1 + ri * angPts;
                idx.push(b0 + ai, b0 + nxt, b1 + nxt);
                idx.push(b0 + ai, b1 + nxt, b1 + ai);
            }
        }
        if (idx.length === 0) return null;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geom.setIndex(idx);
        geom.computeVertexNormals();
        return geom;
    }

    // Helper: annular face between an inner ring and outer ring (both at same X)
    // Radially subdivided into baffleMeshPts rings; filter by angular midpoint.
    function buildAnnularFace(faceX, innerRing, outerRing, angPts, sectorFilter) {
        const verts = [];
        const idx = [];
        const rings = baffleMeshPts + 1;
        for (let ri = 0; ri < rings; ri++) {
            const t = ri / (rings - 1);
            for (let ai = 0; ai < angPts; ai++) {
                const iy = innerRing[ai].y, iz = innerRing[ai].z;
                const oy = outerRing[ai].y, oz = outerRing[ai].z;
                verts.push(faceX, iy + (oy - iy) * t, iz + (oz - iz) * t);
            }
        }
        for (let ri = 0; ri < rings - 1; ri++) {
            const b0 = ri * angPts;
            const b1 = (ri + 1) * angPts;
            for (let ai = 0; ai < angPts; ai++) {
                const nxt = (ai + 1) % angPts;
                if (sectorFilter) {
                    const midY = (innerRing[ai].y + innerRing[nxt].y) / 2;
                    const midZ = (innerRing[ai].z + innerRing[nxt].z) / 2;
                    if (!sectorFilter({ y: midY, z: midZ })) continue;
                }
                idx.push(b0 + ai, b0 + nxt, b1 + nxt);
                idx.push(b0 + ai, b1 + nxt, b1 + ai);
            }
        }
        if (idx.length === 0) return null;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geom.setIndex(idx);
        geom.computeVertexNormals();
        return geom;
    }

    // Helper: loft a tube between two rings at xA and xB with axial subdivision
    function buildLoftTube(ringA, xA, ringB, xB, axialSteps, angPts, sectorFilter) {
        const verts = [];
        const idx = [];
        for (let si = 0; si <= axialSteps; si++) {
            const t = si / axialSteps;
            const x = xA + (xB - xA) * t;
            for (let ai = 0; ai < angPts; ai++) {
                const y = ringA[ai].y + (ringB[ai].y - ringA[ai].y) * t;
                const z = ringA[ai].z + (ringB[ai].z - ringA[ai].z) * t;
                verts.push(x, y, z);
            }
        }
        for (let si = 0; si < axialSteps; si++) {
            const b0 = si * angPts;
            const b1 = (si + 1) * angPts;
            for (let ai = 0; ai < angPts; ai++) {
                const nxt = (ai + 1) % angPts;
                if (sectorFilter) {
                    // average over 4 corners
                    const midY = (ringA[ai].y + ringA[nxt].y + ringB[ai].y + ringB[nxt].y) / 4;
                    const midZ = (ringA[ai].z + ringA[nxt].z + ringB[ai].z + ringB[nxt].z) / 4;
                    if (!sectorFilter({ y: midY, z: midZ })) continue;
                }
                idx.push(b0 + ai, b0 + nxt, b1 + nxt);
                idx.push(b0 + ai, b1 + nxt, b1 + ai);
            }
        }
        if (idx.length === 0) return null;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geom.setIndex(idx);
        geom.computeVertexNormals();
        return geom;
    }

    // ========================
    // BAFFLE / COMPRESSION CHAMBER
    // The baffle plank remains flat: throat hole (rectangular) is identical
    // on front and back faces, so the inner chamber walls form a straight
    // rectangular extrusion through the wood thickness.
    // ========================
    const throat = segBounds[0];
    const throatMax = Math.max(throat.hw, throat.hh);

    // Outer baffle radius: manual override from Mesh Settings, else comfortably
    // encloses the rectangular throat.
    const baffleRadius = getBaffleDiameterMm(genDom, throatMax * 4) / 2;

    const bx = offsetX; // back face (horn-side)
    const fx = bx - woodThick; // front face (driver-side)

    // Angular-sampled rings (same angPts → coherent topology for loft).
    // Front and back inner rings are identical so the plank stays straight.
    const backInnerRing = makeRing(throat.hw, throat.hh, angularPts);
    const frontInnerRing = makeRing(throat.hw, throat.hh, angularPts);
    const outerRing = makeCircle(baffleRadius, angularPts);

    // --- Annular faces (front & back of the baffle plank) ---
    const frontGeom = buildAnnularFace(fx, frontInnerRing, outerRing, angularPts, sf);
    if (frontGeom) addSurface(frontGeom, nextColor(), 'Compression chamber');
    const backGeom = buildAnnularFace(bx, backInnerRing, outerRing, angularPts, sf);
    if (backGeom) addSurface(backGeom, nextColor(), 'Compression chamber');

    // --- CC-H1 interface (acoustic source at diaphragm plane) ---
    if (showInterfaces) {
        const ccItf = buildCapGeom(frontInnerRing, fx, angularPts, sf);
        if (ccItf) addSurface(ccItf, nextItfColor(), 'CC-H1');
    }

    // --- Outer cylindrical edge (circle → circle, straight cylinder) ---
    {
        const axSteps = Math.max(1, Math.min(8, Math.ceil(woodThick / 6)));
        const outerWall = buildLoftTube(outerRing, fx, outerRing, bx, axSteps, angularPts, sf);
        if (outerWall) addSurface(outerWall, nextColor(), 'Compression chamber');
    }

    // --- Inner chamber walls: lofted front inner ring → back inner ring ---
    {
        const chamberSteps = Math.max(2, baffleMeshPts);
        const chamberWall = buildLoftTube(frontInnerRing, fx, backInnerRing, bx, chamberSteps, angularPts, sf);
        if (chamberWall) addSurface(chamberWall, nextColor(), 'Compression chamber');
    }

    // Outline of circular edge (front)
    const circOutline = outerRing.map(p => new THREE.Vector3(fx, p.y, p.z));
    circOutline.push(circOutline[0].clone());
    threeState.hornGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(circOutline),
        new THREE.LineBasicMaterial({ color: 0x00ff88 })
    ));

    // ========================
    // HORN SEGMENTS (walls) — with optional H/V split
    // ========================
    for (let si = 0; si < n - 1; si++) {
        const r0 = segBounds[si];
        const r1 = segBounds[si + 1];
        const steps = axialPtsPerSeg;
        const hornLabel = `Horn ${si + 1}`;

        // Build rings for this segment
        const segRings = [];
        for (let ai = 0; ai <= steps; ai++) {
            const t = ai / steps;
            const rr = interpRing(r0, r1, t);
            segRings.push({ ...rr, pts: makeRing(rr.hw, rr.hh, angularPts) });
        }

        if (!doSplit) {
            const geom = buildFullWall(segRings, angularPts);
            addSurface(geom, nextColor(), hornLabel);
        } else {
            const geom = buildWallStrip(segRings, splitFilter, angularPts);
            if (geom) addSurface(geom, nextColor(), hornLabel);
        }

        // --- Interface cap between segments ---
        if (showInterfaces && si < n - 2) {
            const sb = segBounds[si + 1];
            const xPos = sb.x + offsetX;
            const ring = makeRing(sb.hw, sb.hh, angularPts);
            const itfGeom = buildCapGeom(ring, xPos, angularPts, sf);
            if (itfGeom) addSurface(itfGeom, nextItfColor(), `H${si + 1}-H${si + 2}`);
        }
    }

    // --- Exterior interface at mouth ---
    if (showInterfaces) {
        const mouth = segBounds[n - 1];
        const xPos = mouth.x + offsetX;
        const ring = makeRing(mouth.hw, mouth.hh, angularPts);
        const extGeom = buildCapGeom(ring, xPos, angularPts, sf);
        if (extGeom) addSurface(extGeom, nextItfColor(), `H${n - 1}-Ext`);
    }

    // Segment boundary outlines (subtle)
    if (showInterfaces) {
        const edgeMat = new THREE.LineBasicMaterial({ color: wireColor, transparent: true, opacity: wireOpacity });
        for (let bi = 0; bi < n; bi++) {
            const sb = segBounds[bi];
            const ring = makeRing(sb.hw, sb.hh, angularPts);
            const pts3 = ring.map(p => new THREE.Vector3(sb.x + offsetX, p.y, p.z));
            pts3.push(pts3[0].clone());
            threeState.hornGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3), edgeMat));
        }
    }

    // ========================
    // CENTER AXIS
    // ========================
    const axisMat = new THREE.LineDashedMaterial({ color: 0x555555, dashSize: 5, gapSize: 3 });
    const axisGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(offsetX - 30, 0, 0),
        new THREE.Vector3(offsetX + totalLen + 30, 0, 0)
    ]);
    const axisLine = new THREE.Line(axisGeom, axisMat);
    axisLine.computeLineDistances();
    threeState.hornGroup.add(axisLine);

    // Store display geometries
    genState.lastMeshGeometries = namedGeometries;

    // ========================
    // BUILD EXPORT GEOMETRIES (always 1/4 with all interfaces)
    // ========================
    const exportGeometries = [];
    function qf(p) { return p.y >= 0 && p.z >= 0; }
    function addExp(geom, name) { if (geom && name) exportGeometries.push({ geometry: geom, name }); }

    // Baffle faces (quarter)
    addExp(buildAnnularFace(fx, frontInnerRing, outerRing, angularPts, qf), 'Compression chamber');
    addExp(buildAnnularFace(bx, backInnerRing, outerRing, angularPts, qf), 'Compression chamber');

    // CC-H1 interface (quarter) — at diaphragm plane
    addExp(buildCapGeom(frontInnerRing, fx, angularPts, qf), 'CC-H1');

    // Outer cylindrical edge (quarter)
    {
        const axSteps = Math.max(1, Math.min(8, Math.ceil(woodThick / 6)));
        addExp(buildLoftTube(outerRing, fx, outerRing, bx, axSteps, angularPts, qf), 'Compression chamber');
    }

    // Inner lofted chamber wall (quarter)
    {
        const chamberSteps = Math.max(2, baffleMeshPts);
        addExp(buildLoftTube(frontInnerRing, fx, backInnerRing, bx, chamberSteps, angularPts, qf), 'Compression chamber');
    }

    // Horn walls & all interfaces (quarter)
    for (let si = 0; si < n - 1; si++) {
        const r0 = segBounds[si], r1 = segBounds[si + 1];
        const segRings = [];
        for (let ai = 0; ai <= axialPtsPerSeg; ai++) {
            const t = ai / axialPtsPerSeg;
            const rr = interpRing(r0, r1, t);
            segRings.push({ ...rr, pts: makeRing(rr.hw, rr.hh, angularPts) });
        }
        addExp(buildWallStrip(segRings, qf, angularPts), `Horn ${si + 1}`);

        // Interface between segments
        if (si < n - 2) {
            const sb = segBounds[si + 1];
            const ring = makeRing(sb.hw, sb.hh, angularPts);
            addExp(buildCapGeom(ring, sb.x + offsetX, angularPts, qf), `H${si + 1}-H${si + 2}`);
        }
    }

    // Exterior interface (quarter)
    const expMouth = segBounds[n - 1];
    const expMouthRing = makeRing(expMouth.hw, expMouth.hh, angularPts);
    addExp(buildCapGeom(expMouthRing, expMouth.x + offsetX, angularPts, qf), `H${n - 1}-Ext`);

    genState.exportMeshGeometries = exportGeometries;
}

// --- Exécution de la génération ---

function runGenerate(genState, genDom, rootElement) {
    if (genState._suppressRegenerate) return;
    const isHV = genDom.genHornType.value === 'hv';
    const segments = isHV
        ? generateHornSegmentsHV(genDom, rootElement)
        : generateHornSegments(genDom, rootElement);
    if (segments.length === 0) return;
    genState.lastGenSegments = segments;
    displayGeneratedSegments(segments, genState, genDom, rootElement);
    updateGenExpansionChart(segments, genState, genDom, rootElement);
    drawHorn2D(segments, genDom, rootElement, genState);
    drawHorn3D(segments, genDom, genState);

    // Mise à jour du folding editor si actif
    if (genState.foldingActive && genDom.genFoldingCanvas) {
        // Réinitialiser les angles si le nombre de segments a changé
        if (genState.foldingState.jointAngles.length !== segments.length) {
            resetFoldingState(genState.foldingState, segments.length);
        }
        drawFoldedHorn(genDom.genFoldingCanvas, segments, genState.foldingState, genDom, rootElement, genState);
    }

    scheduleSolverSync(genState, genDom, rootElement);
}

// --- Système d'onglets ---

function switchGenTab(tabName, genState, genDom) {
    genState.activeGenTab = tabName;
    genDom.genTabBtns.forEach(btn => {
        btn.classList.toggle('bg-green-700', btn.dataset.genTab === tabName);
    });
    genDom.genTabContents.forEach(el => {
        // Masquer tous les tabs sauf celui sélectionné
        // Mais aussi gérer le tab folding qui n'est pas dans les onglets standards
        if (el.id === 'gen-tab-folding') {
            // Le tab folding est contrôlé par le bouton folding, pas par les onglets
            // On le cache sauf si le folding est actif ET on est sur profile
            el.classList.toggle('hidden', !(genState.foldingActive && tabName === 'profile'));
        } else {
            el.classList.toggle('hidden', el.id !== `gen-tab-${tabName}`);
        }
    });
    // Si le folding est actif et on bascule sur profile, cacher le profile standard
    if (genState.foldingActive && tabName === 'profile') {
        const profileTab = genDom.rootElement.querySelector('#gen-tab-profile');
        if (profileTab) profileTab.classList.add('hidden');
    }
    if (genDom.gen2dViewBtnsContainer) {
        genDom.gen2dViewBtnsContainer.classList.toggle('hidden', tabName !== 'profile');
    }
    requestAnimationFrame(() => {
        if (tabName === 'expansion' && genState.genExpansionChart) genState.genExpansionChart.resize();
        if (tabName === 'profile' && genState.lastGenSegments.length) {
            // Small delay to ensure layout has computed dimensions after unhiding
            setTimeout(() => {
                if (genState.foldingActive) {
                    drawFoldedHorn(genDom.genFoldingCanvas, genState.lastGenSegments, genState.foldingState, genDom, genDom.rootElement, genState);
                } else {
                    drawHorn2D(genState.lastGenSegments, genDom, genDom.rootElement, genState);
                }
            }, 50);
        }
        if (tabName === 'view3d') {
            const container = genDom.gen3dContainer;
            if (container) {
                // Small delay to ensure layout has computed dimensions after unhiding
                setTimeout(() => {
                    if (!threeState.initialized && container.clientWidth > 0) {
                        initThreeScene(container);
                    }
                    if (threeState.initialized && genState.lastGenSegments.length) {
                        drawHorn3D(genState.lastGenSegments, genDom, genState);
                    }
                }, 50);
            }
        }
        if (tabName === 'graph') {
            refreshBemGraphs(genDom.rootElement.querySelector('#gen-tab-graph'));
        }
    });
}

// --- Pont vers le BEM Solver (maillage + SYNC), calqué sur Waveguide Studio ---

function getStandaloneSolverRoot() {
    return document.querySelector('#tool-wrapper-directivity #directivity-root');
}

function setSolverSyncStatus(genDom, message, isError = false) {
    const status = genDom.rootElement?.querySelector('#gen-solver-sync-status');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('text-red-400', isError);
    status.classList.toggle('text-gray-400', !isError);
}

function confirmSyncBreakingChange() {
    if (!window.notify?.confirm) return Promise.resolve(true);
    return window.notify.confirm(
        'Sync is enabled: changing the Interface or Split setting now will invalidate the current BEM solution and it will need to be solved again. '
        + 'To remove the interface or a split without losing your results, disable Sync first, revert the setting, then re-enable Sync to re-solve.',
        'This will invalidate the BEM solution'
    );
}

// Intercepts a checkbox's "change" event while Sync is on, reverts it until the
// user confirms, then re-dispatches it so meshRedraw/hotkeys run normally.
function guardSyncSensitiveCheckbox(checkbox, isSyncActive) {
    if (!checkbox) return;
    checkbox.addEventListener('change', (e) => {
        if (!isSyncActive() || checkbox.dataset.syncGuardBypass) return;
        const attemptedChecked = checkbox.checked;
        checkbox.checked = !attemptedChecked;
        e.stopImmediatePropagation();
        confirmSyncBreakingChange().then(ok => {
            if (!ok) return;
            checkbox.checked = attemptedChecked;
            checkbox.dataset.syncGuardBypass = '1';
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            delete checkbox.dataset.syncGuardBypass;
        });
    }, true);
}

async function generateHornSolverMesh(segs, genDom, rootElement, fileName) {
    const { geoContent, gmshPath } = await buildHornGeoForExport(segs, genDom, rootElement);
    const result = await window.electronAPI.exportWaveguideStep({
        gmshPath,
        geoContent,
        fileName,
        mode: 'mesh',
        returnContent: true,
    });
    if (!result.success || !result.content) {
        throw new Error((result.error || 'GMSH failed to generate the solver mesh.').substring(0, 200));
    }
    return result.content;
}

function scheduleSolverSync(genState, genDom, rootElement) {
    if (!genState.solverSync) return;
    genState.solverSyncPending = true;
    clearTimeout(genState.solverSyncTimer);
    genState.solverSyncTimer = setTimeout(() => runSolverSync(genState, genDom, rootElement), 600);
}

async function runSolverSync(genState, genDom, rootElement) {
    if (!genState.solverSync || genState.solverSyncRunning || !genState.solverSyncPending) return;
    if (!genState.lastGenSegments || genState.lastGenSegments.length < 2) return;
    genState.solverSyncPending = false;
    genState.solverSyncRunning = true;
    try {
        setSolverSyncStatus(genDom, 'Generating mesh...');
        const content = await generateHornSolverMesh(genState.lastGenSegments, genDom, rootElement, 'horn_sync.msh');
        const solverRoot = getStandaloneSolverRoot();
        await importBemMeshContent(solverRoot, content, 'horn_sync.msh');
        setSolverSyncStatus(genDom, 'Solving...');
        await rerunBemSolver(solverRoot);
        setSolverSyncStatus(genDom, 'Graph up to date');
        refreshBemGraphs(rootElement.querySelector('#gen-tab-graph'));
    } catch (error) {
        console.error('[Horn Studio Solver SYNC] failed', error);
        setSolverSyncStatus(genDom, error.message || String(error), true);
    } finally {
        genState.solverSyncRunning = false;
        if (genState.solverSyncPending && genState.solverSync) {
            clearTimeout(genState.solverSyncTimer);
            genState.solverSyncTimer = setTimeout(() => runSolverSync(genState, genDom, rootElement), 0);
        }
    }
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

// --- Export des segments générés vers d'autres panneaux ---

// --- GMSH .geo generator for Horn Studio MSH export ---
// Mirrors the 3D preview exactly: horn segments with sharp rectangular corners,
// compression chamber (wood thickness), baffle plate, and the diaphragm cap.
// Supports split H / V / H+V.
//
// Horn segments: one ThruSections loft per segment → all lateral rectangular
// quad faces kept (those with dz > ε and not lying on a symmetry plane) and
// emitted as a single Physical Surface per segment.
//
// Baffle: outer circle is emitted as a split-aware sector polyline (full,
// half, or quarter arc with radial closing lines), lofted to produce the outer
// cylindrical wall. Compression chamber inner wall is a straight rectangular
// prism lofted between the inner-front rect (at fx) and the throat rect (at
// bx). Front/back annular plates are emitted as Plane Surfaces: a single
// closed loop in split mode (outer arc → bridge → inner rect → bridge),
// outer+inner loops in non-split mode.
// Adaptive throat sizing tuning (mirrors Waveguide Studio's exporters.js):
// throat element size = clmax / ADAPTIVE_MIN_FACTOR, ramping back up to clmax
// over ADAPTIVE_DIST_MIN_FRAC..ADAPTIVE_DIST_MAX_FRAC of the horn's length.
const ADAPTIVE_MIN_FACTOR = 4;
const ADAPTIVE_DIST_MIN_FRAC = 0.08;
const ADAPTIVE_DIST_MAX_FRAC = 0.6;

// Emits a flat `Constant` size field scoped to `surfaceExpr` (a Gmsh surface
// tag/list expression, e.g. `_s0_keep(), _s1_keep()`).
function emitGroupSizeField(lines, clmax, surfaceExpr, fieldIdStart) {
    const constId = fieldIdStart;
    lines.push(`Field[${constId}] = Constant;`);
    lines.push(`Field[${constId}].VIn = ${clmax};`);
    if (surfaceExpr) lines.push(`Field[${constId}].SurfacesList = {${surfaceExpr}};`);
    return { fieldId: constId, nextFieldId: constId + 1 };
}

// Wraps `inFieldId` in a `Restrict` field scoped to `surfaceExpr`.
function emitRestrictField(lines, inFieldId, surfaceExpr, fieldIdStart) {
    if (!surfaceExpr) return { fieldId: inFieldId, nextFieldId: fieldIdStart };
    const restrictId = fieldIdStart;
    lines.push(`Field[${restrictId}] = Restrict;`);
    lines.push(`Field[${restrictId}].InField = ${inFieldId};`);
    lines.push(`Field[${restrictId}].SurfacesList = {${surfaceExpr}};`);
    return { fieldId: restrictId, nextFieldId: restrictId + 1 };
}

// Horn group sizing: adaptive Distance/Threshold (fine at throat, coarser
// toward mouth) restricted to the horn's own lateral surfaces when enabled,
// otherwise a flat Constant field — same tuning as Waveguide Studio.
function emitHornSizeField(lines, groupConfig, throatCurveIds, hornLength, fieldIdStart, surfaceExpr) {
    let nextFieldId = fieldIdStart;
    if (groupConfig.adaptive && throatCurveIds && throatCurveIds.length && hornLength > 0) {
        const sizeMin = groupConfig.clmax / ADAPTIVE_MIN_FACTOR;
        const distMin = hornLength * ADAPTIVE_DIST_MIN_FRAC;
        const distMax = hornLength * ADAPTIVE_DIST_MAX_FRAC;
        const distId = nextFieldId++;
        const threshId = nextFieldId++;
        lines.push('// --- Adaptive mesh sizing (fine at throat, coarser toward mouth) ---');
        lines.push(`Field[${distId}] = Distance;`);
        lines.push(`Field[${distId}].CurvesList = {${throatCurveIds.join(', ')}};`);
        lines.push(`Field[${distId}].Sampling = 100;`);
        lines.push(`Field[${threshId}] = Threshold;`);
        lines.push(`Field[${threshId}].InField = ${distId};`);
        lines.push(`Field[${threshId}].SizeMin = ${sizeMin};`);
        lines.push(`Field[${threshId}].SizeMax = ${groupConfig.clmax};`);
        lines.push(`Field[${threshId}].DistMin = ${distMin};`);
        lines.push(`Field[${threshId}].DistMax = ${distMax};`);
        return emitRestrictField(lines, threshId, surfaceExpr, nextFieldId);
    }
    return emitGroupSizeField(lines, groupConfig.clmax, surfaceExpr, fieldIdStart);
}

function buildHornGeo(slices, split, meshConfig, baffle, showInterfaces) {
    const hasSplit = split && (split.horizontal || split.vertical);
    const splitH = !!(split && split.horizontal);
    const splitV = !!(split && split.vertical);
    const quarter = splitH && splitV;
    const emitInterfaces = showInterfaces !== false;
    const out = ['SetFactory("OpenCASCADE");', ''];
    const n = slices.length;

    // Per-group Delaunay mesh sizing targets (Source / Horn / Interface),
    // populated as physical surfaces are emitted below.
    const hornSurfaceExprs = [];
    const sourceSurfaceIds = [];
    const interfaceSurfaceIds = [];

    let pointId = 1;
    const sliceRanges = [];

    // Phase 1: horn slice points
    for (const s of slices) {
        const first = pointId;
        for (const p of s.points3D) {
            out.push(`Point(${pointId}) = {${p.x.toFixed(6)}, ${p.y.toFixed(6)}, ${p.z.toFixed(6)}, 0};`);
            pointId++;
        }
        sliceRanges.push({ first, count: s.points3D.length });
    }

    // Phase 1b: symmetry corner points at origin (for quarter split closures)
    const cornerPts = [];
    if (quarter) {
        for (let si = 0; si < n; si++) {
            const z = slices[si].points3D[0].z;
            const cp = pointId++;
            out.push(`Point(${cp}) = {0, 0, ${z.toFixed(6)}, 0};`);
            cornerPts.push(cp);
        }
    }
    out.push('');

    let nextCurve = pointId + 100000;

    // Phase 2: slice contour lines (straight = sharp corners)
    const sliceLines = [];
    for (let si = 0; si < n; si++) {
        const r = sliceRanges[si];
        const cls = [];
        for (let j = 0; j < r.count - 1; j++) {
            const lId = nextCurve++;
            out.push(`Line(${lId}) = {${r.first + j}, ${r.first + j + 1}};`);
            cls.push(lId);
        }
        if (!hasSplit) {
            const lId = nextCurve++;
            out.push(`Line(${lId}) = {${r.first + r.count - 1}, ${r.first}};`);
            cls.push(lId);
        }
        sliceLines.push(cls);
    }
    out.push('');

    // Phase 2b: closing lines along symmetry planes (split mode)
    const closingLines = [];
    if (hasSplit) {
        for (let si = 0; si < n; si++) {
            const r = sliceRanges[si];
            const firstPt = r.first;
            const lastPt = r.first + r.count - 1;
            const cls = [];
            if (quarter) {
                const l1 = nextCurve++;
                const l2 = nextCurve++;
                out.push(`Line(${l1}) = {${lastPt}, ${cornerPts[si]}};`);
                out.push(`Line(${l2}) = {${cornerPts[si]}, ${firstPt}};`);
                cls.push(l1, l2);
            } else {
                const lId = nextCurve++;
                out.push(`Line(${lId}) = {${lastPt}, ${firstPt}};`);
                cls.push(lId);
            }
            closingLines.push(cls);
        }
        out.push('');
    }

    // Phase 2c: per-slice wires (closed)
    let nextWire = nextCurve + 1000000;
    const wires = [];
    for (let si = 0; si < n; si++) {
        const wId = nextWire++;
        const curves = hasSplit ? [...sliceLines[si], ...closingLines[si]] : sliceLines[si];
        out.push(`Wire(${wId}) = {${curves.join(', ')}};`);
        wires.push(wId);
    }
    out.push('');

    // --- Helper emitted verbatim into .geo: keep lateral faces, drop caps and symmetry walls ---
    // Loops through the boundary surfaces of the volume just before us and
    // keeps those with dz > tol AND not entirely on an active symmetry plane.
    const emitLateralKeep = (pfx, volTag, physicalName) => {
        out.push(`${pfx}bnd() = Boundary{ Volume{${volTag}}; };`);
        out.push(`Delete{ Volume{${volTag}}; }`);
        out.push(`${pfx}keep() = {};`);
        out.push(`For ${pfx}i In {0 : #${pfx}bnd()-1}`);
        out.push(`  ${pfx}bb() = BoundingBox Surface{Abs(${pfx}bnd(${pfx}i))};`);
        out.push(`  ${pfx}dz = ${pfx}bb(5) - ${pfx}bb(2);`);
        out.push(`  ${pfx}onSymY = ((Fabs(${pfx}bb(1)) < 0.01) && (Fabs(${pfx}bb(4)) < 0.01)) ? 1 : 0;`);
        out.push(`  ${pfx}onSymX = ((Fabs(${pfx}bb(0)) < 0.01) && (Fabs(${pfx}bb(3)) < 0.01)) ? 1 : 0;`);
        out.push(`  ${pfx}drop = 0;`);
        out.push(`  If (${pfx}dz < 0.001) ${pfx}drop = 1; EndIf`);
        out.push(`  If (${splitH ? 1 : 0} == 1 && ${pfx}onSymY == 1) ${pfx}drop = 1; EndIf`);
        out.push(`  If (${splitV ? 1 : 0} == 1 && ${pfx}onSymX == 1) ${pfx}drop = 1; EndIf`);
        out.push(`  If (${pfx}drop == 1)`);
        out.push(`    Delete{ Surface{Abs(${pfx}bnd(${pfx}i))}; }`);
        out.push(`  Else`);
        out.push(`    ${pfx}keep() = {${pfx}keep(), Abs(${pfx}bnd(${pfx}i))};`);
        out.push(`  EndIf`);
        out.push(`EndFor`);
        out.push(`Physical Surface("${physicalName}") = {${pfx}keep()};`);
    };

    // Phase 3: per-segment loft → keep all lateral faces, drop caps + symmetry walls
    for (let s = 0; s < n - 1; s++) {
        const pfx = `_s${s}_`;
        const volTag = s + 1;
        out.push(`// --- Segment ${s + 1} ---`);
        // Ruled = straight (linear) lateral faces between the two rectangular
        // wires. The default (non-ruled) ThruSections fits a smooth spline
        // surface even between just 2 sections, which bulges near strongly
        // tapered segments (typically the throat) and produces a dense/fan
        // triangulation there instead of the intended flat sides.
        out.push(`Ruled ThruSections(${volTag}) = {${wires[s]}, ${wires[s + 1]}};`);
        emitLateralKeep(pfx, volTag, `Segment_${s + 1}`);
        hornSurfaceExprs.push(`${pfx}keep()`);
        out.push('');
    }

    // Phase 4: interface caps (one Physical Surface per slice)
    let nextLoop = nextWire + 1000000;
    let nextSurf = nextLoop + 1000000;
    for (let si = 0; si < n; si++) {
        const curves = hasSplit ? [...sliceLines[si], ...closingLines[si]] : sliceLines[si];
        const clId = nextLoop++;
        out.push(`Curve Loop(${clId}) = {${curves.join(', ')}};`);
        if (emitInterfaces) {
            const sfId = nextSurf++;
            let name;
            if (si === 0) name = 'Itf_Throat';
            else if (si === n - 1) name = 'Itf_Mouth';
            else name = `Itf_H${si}_H${si + 1}`;
            out.push(`Plane Surface(${sfId}) = {${clId}};`);
            out.push(`Physical Surface("${name}") = {${sfId}};`);
            (si === 0 ? sourceSurfaceIds : interfaceSurfaceIds).push(sfId);
        }
    }
    out.push('');

    // Phase 5: baffle + compression chamber (split-aware)
    if (baffle) {
        // OpenCASCADE's ThruSections above auto-allocates new curve/wire tags
        // at runtime starting from max(existing)+1 in the shared Line/Wire/
        // CurveLoop tag space. Bump our JS counters well above anything it
        // could possibly have consumed so baffle lines/wires/loops don't
        // collide with loft-internal edges.
        const curveSafe = Math.max(nextCurve, nextWire, nextLoop) + 1_000_000;
        nextCurve = curveSafe;
        nextWire = curveSafe + 200_000;
        nextLoop = curveSafe + 400_000;
        nextSurf = Math.max(nextSurf, curveSafe) + 600_000;

        const { woodThick, baffleRadius, angularPts } = baffle;
        const throatZ = slices[0].points3D[0].z;
        const bx = throatZ;                 // back face of baffle = horn throat plane
        const fx = throatZ - woodThick;     // front face of baffle (driver side)
        const R = baffleRadius;

        // --- Outer arc sector points (front + back) ---
        // Split-aware: full circle, half-arc, or quarter-arc.
        let aStart, aEnd;
        if (!hasSplit) { aStart = 0; aEnd = 2 * Math.PI; }
        else if (quarter) { aStart = 0; aEnd = Math.PI / 2; }
        else if (splitH) { aStart = 0; aEnd = Math.PI; }
        else /* splitV */ { aStart = -Math.PI / 2; aEnd = Math.PI / 2; }

        // Number of arc polyline segments
        const arcFraction = hasSplit ? (quarter ? 0.25 : 0.5) : 1.0;
        const arcSegCount = Math.max(4, Math.ceil(angularPts * arcFraction));
        // Points along arc: (arcSegCount) segments → (arcSegCount+1) points for open arc;
        // for closed (non-split), arcSegCount points with wrap-around.
        const arcFrontPts = [];
        const arcBackPts = [];
        if (!hasSplit) {
            // Closed circle: arcSegCount distinct points, wrap via lines
            for (let i = 0; i < arcSegCount; i++) {
                const a = aStart + (aEnd - aStart) * (i / arcSegCount);
                const cx = Math.cos(a) * R;
                const cy = Math.sin(a) * R;
                const pF = pointId++;
                out.push(`Point(${pF}) = {${cx.toFixed(6)}, ${cy.toFixed(6)}, ${fx.toFixed(6)}, 0};`);
                arcFrontPts.push(pF);
                const pB = pointId++;
                out.push(`Point(${pB}) = {${cx.toFixed(6)}, ${cy.toFixed(6)}, ${bx.toFixed(6)}, 0};`);
                arcBackPts.push(pB);
            }
        } else {
            // Open arc: arcSegCount+1 points, endpoints lie exactly on symmetry planes
            for (let i = 0; i <= arcSegCount; i++) {
                const a = aStart + (aEnd - aStart) * (i / arcSegCount);
                const cx = Math.cos(a) * R;
                const cy = Math.sin(a) * R;
                const pF = pointId++;
                out.push(`Point(${pF}) = {${cx.toFixed(6)}, ${cy.toFixed(6)}, ${fx.toFixed(6)}, 0};`);
                arcFrontPts.push(pF);
                const pB = pointId++;
                out.push(`Point(${pB}) = {${cx.toFixed(6)}, ${cy.toFixed(6)}, ${bx.toFixed(6)}, 0};`);
                arcBackPts.push(pB);
            }
        }

        // --- Origin corner points (quarter only) at fx and bx ---
        let originFrontPt = -1, originBackPt = -1;
        if (quarter) {
            originFrontPt = pointId++;
            out.push(`Point(${originFrontPt}) = {0, 0, ${fx.toFixed(6)}, 0};`);
            originBackPt = pointId++;
            out.push(`Point(${originBackPt}) = {0, 0, ${bx.toFixed(6)}, 0};`);
        }

        // --- Inner rectangle points at fx (same xy as throat slice) ---
        const innerFrontPts = [];
        for (let j = 0; j < sliceRanges[0].count; j++) {
            const p = slices[0].points3D[j];
            const pF = pointId++;
            out.push(`Point(${pF}) = {${p.x.toFixed(6)}, ${p.y.toFixed(6)}, ${fx.toFixed(6)}, 0};`);
            innerFrontPts.push(pF);
        }
        // Inner-front symmetry corner point (quarter: same origin as outer)
        // already available via originFrontPt.

        // --- Build arc edges (front and back) ---
        const arcFrontLines = [];
        const arcBackLines = [];
        if (!hasSplit) {
            for (let i = 0; i < arcFrontPts.length; i++) {
                const a = arcFrontPts[i];
                const b = arcFrontPts[(i + 1) % arcFrontPts.length];
                const l = nextCurve++;
                out.push(`Line(${l}) = {${a}, ${b}};`);
                arcFrontLines.push(l);
            }
            for (let i = 0; i < arcBackPts.length; i++) {
                const a = arcBackPts[i];
                const b = arcBackPts[(i + 1) % arcBackPts.length];
                const l = nextCurve++;
                out.push(`Line(${l}) = {${a}, ${b}};`);
                arcBackLines.push(l);
            }
        } else {
            for (let i = 0; i < arcFrontPts.length - 1; i++) {
                const l = nextCurve++;
                out.push(`Line(${l}) = {${arcFrontPts[i]}, ${arcFrontPts[i + 1]}};`);
                arcFrontLines.push(l);
            }
            for (let i = 0; i < arcBackPts.length - 1; i++) {
                const l = nextCurve++;
                out.push(`Line(${l}) = {${arcBackPts[i]}, ${arcBackPts[i + 1]}};`);
                arcBackLines.push(l);
            }
        }

        // --- Inner rectangle edges at fx (front) --- (mirror of sliceLines[0] topology)
        const innerFrontLines = [];
        for (let j = 0; j < innerFrontPts.length - 1; j++) {
            const l = nextCurve++;
            out.push(`Line(${l}) = {${innerFrontPts[j]}, ${innerFrontPts[j + 1]}};`);
            innerFrontLines.push(l);
        }
        if (!hasSplit) {
            const l = nextCurve++;
            out.push(`Line(${l}) = {${innerFrontPts[innerFrontPts.length - 1]}, ${innerFrontPts[0]}};`);
            innerFrontLines.push(l);
        }
        // Inner-front closing lines (split mode) — mirror of throat's closingLines[0]
        const innerFrontClosing = [];
        if (hasSplit) {
            const firstPt = innerFrontPts[0];
            const lastPt = innerFrontPts[innerFrontPts.length - 1];
            if (quarter) {
                const l1 = nextCurve++;
                const l2 = nextCurve++;
                out.push(`Line(${l1}) = {${lastPt}, ${originFrontPt}};`);
                out.push(`Line(${l2}) = {${originFrontPt}, ${firstPt}};`);
                innerFrontClosing.push(l1, l2);
            } else {
                const lId = nextCurve++;
                out.push(`Line(${lId}) = {${lastPt}, ${firstPt}};`);
                innerFrontClosing.push(lId);
            }
        }

        // --- Outer arc wire (closed sector) ---
        // Non-split: wrap-around circle. Split: arc + symmetry radial lines.
        const buildOuterSectorWire = (arcLines, arcPts, originPt) => {
            const cls = [...arcLines];
            if (!hasSplit) return cls; // already closed
            if (quarter) {
                // arcPts[0] = (R,0), arcPts[last] = (0,R)
                const lA = nextCurve++; // (0,R) -> origin
                const lB = nextCurve++; // origin -> (R,0)
                out.push(`Line(${lA}) = {${arcPts[arcPts.length - 1]}, ${originPt}};`);
                out.push(`Line(${lB}) = {${originPt}, ${arcPts[0]}};`);
                cls.push(lA, lB);
            } else {
                // Single closing line: last arc point back to first
                const l = nextCurve++;
                out.push(`Line(${l}) = {${arcPts[arcPts.length - 1]}, ${arcPts[0]}};`);
                cls.push(l);
            }
            return cls;
        };
        const outerFrontWireLines = buildOuterSectorWire(arcFrontLines, arcFrontPts, originFrontPt);
        const outerBackWireLines = buildOuterSectorWire(arcBackLines, arcBackPts, originBackPt);

        // --- Inner wires (closed) ---
        const innerFrontWireLines = hasSplit
            ? [...innerFrontLines, ...innerFrontClosing]
            : innerFrontLines;
        const innerBackWireLines = hasSplit
            ? [...sliceLines[0], ...closingLines[0]]
            : sliceLines[0];

        // --- Wires ---
        const wOF = nextWire++;
        out.push(`Wire(${wOF}) = {${outerFrontWireLines.join(', ')}};`);
        const wOB = nextWire++;
        out.push(`Wire(${wOB}) = {${outerBackWireLines.join(', ')}};`);
        const wIF = nextWire++;
        out.push(`Wire(${wIF}) = {${innerFrontWireLines.join(', ')}};`);
        const wIB = nextWire++;
        out.push(`Wire(${wIB}) = {${innerBackWireLines.join(', ')}};`);
        out.push('');

        // --- Outer cylindrical wall: loft → keep lateral strip ---
        const ocTag = n + 10;
        out.push('// --- Baffle outer wall ---');
        out.push(`Ruled ThruSections(${ocTag}) = {${wOF}, ${wOB}};`);
        emitLateralKeep('_bo_', ocTag, 'Baffle_Outer');
        hornSurfaceExprs.push('_bo_keep()');
        out.push('');

        // --- Compression chamber inner wall: loft between inner-front rect and throat rect ---
        const icTag = n + 11;
        out.push('// --- Compression chamber inner wall ---');
        out.push(`Ruled ThruSections(${icTag}) = {${wIF}, ${wIB}};`);
        emitLateralKeep('_bi_', icTag, 'Compression_Chamber');
        hornSurfaceExprs.push('_bi_keep()');
        out.push('');

        // Bump tag counters again: the two ThruSections above auto-allocate
        // curve/wire/loop/surface tags in the shared OpenCASCADE tag space,
        // starting from max(existing)+1. If we don't bump, the bridge Line()
        // calls below (split mode) collide with those auto-allocated curves
        // ("curve with tag N already exists" → curve loop not closed).
        {
            const bump = Math.max(nextCurve, nextWire, nextLoop, nextSurf) + 1_000_000;
            nextCurve = bump;
            nextWire = bump + 200_000;
            nextLoop = bump + 400_000;
            nextSurf = bump + 600_000;
        }

        // --- Baffle annular faces (front + back) ---
        if (!hasSplit) {
            // Closed outer ring + inner hole
            const ofLoop = nextLoop++;
            out.push(`Curve Loop(${ofLoop}) = {${outerFrontWireLines.join(', ')}};`);
            const ifLoop = nextLoop++;
            out.push(`Curve Loop(${ifLoop}) = {${innerFrontWireLines.join(', ')}};`);
            const frontSurf = nextSurf++;
            out.push(`Plane Surface(${frontSurf}) = {${ofLoop}, ${ifLoop}};`);
            out.push(`Physical Surface("Baffle_Front") = {${frontSurf}};`);

            const obLoop = nextLoop++;
            out.push(`Curve Loop(${obLoop}) = {${outerBackWireLines.join(', ')}};`);
            const ibLoop = nextLoop++;
            out.push(`Curve Loop(${ibLoop}) = {${innerBackWireLines.join(', ')}};`);
            const backSurf = nextSurf++;
            out.push(`Plane Surface(${backSurf}) = {${obLoop}, ${ibLoop}};`);
            out.push(`Physical Surface("Baffle_Back") = {${backSurf}};`);
            interfaceSurfaceIds.push(frontSurf, backSurf);
        } else {
            // Single closed loop: outer arc → bridge → reversed inner rect → bridge
            // We need two bridge lines joining outer endpoints to inner endpoints
            // along the active symmetry plane(s).
            // Outer endpoints: arcPts[0] (start) and arcPts[last] (end).
            // Inner endpoints: innerRectPts[0] and innerRectPts[last].
            const innerRectStart = innerFrontPts[0];
            const innerRectEnd = innerFrontPts[innerFrontPts.length - 1];
            const innerThroatStart = sliceRanges[0].first;
            const innerThroatEnd = sliceRanges[0].first + sliceRanges[0].count - 1;

            const buildAnnular = (arcLines, arcPts, innerLines, innerStart, innerEnd) => {
                // Bridge lines: from arc endpoints to inner endpoints along symmetry axes
                // Arc goes from arcPts[0] to arcPts[last] (CCW in kept sector)
                // Inner rect goes from innerStart to innerEnd (also angularly sorted CCW)
                // Loop (CCW of annulus region): arcLines (→) + bridgeEnd + reverse(innerLines) + bridgeStart
                const bridgeEnd = nextCurve++;
                out.push(`Line(${bridgeEnd}) = {${arcPts[arcPts.length - 1]}, ${innerEnd}};`);
                const bridgeStart = nextCurve++;
                out.push(`Line(${bridgeStart}) = {${innerStart}, ${arcPts[0]}};`);
                // Loop curve ids with signs (positive = as defined, negative = reversed)
                const loopCurves = [
                    ...arcLines,            // forward
                    bridgeEnd,              // forward
                    ...innerLines.slice().reverse().map(l => -l), // reversed inner
                    bridgeStart             // forward
                ];
                return loopCurves;
            };

            const frontLoopCurves = buildAnnular(arcFrontLines, arcFrontPts, innerFrontLines, innerRectStart, innerRectEnd);
            const ofLoop = nextLoop++;
            out.push(`Curve Loop(${ofLoop}) = {${frontLoopCurves.join(', ')}};`);
            const frontSurf = nextSurf++;
            out.push(`Plane Surface(${frontSurf}) = {${ofLoop}};`);
            out.push(`Physical Surface("Baffle_Front") = {${frontSurf}};`);

            const backLoopCurves = buildAnnular(arcBackLines, arcBackPts, sliceLines[0], innerThroatStart, innerThroatEnd);
            const obLoop = nextLoop++;
            out.push(`Curve Loop(${obLoop}) = {${backLoopCurves.join(', ')}};`);
            const backSurf = nextSurf++;
            out.push(`Plane Surface(${backSurf}) = {${obLoop}};`);
            out.push(`Physical Surface("Baffle_Back") = {${backSurf}};`);
            interfaceSurfaceIds.push(frontSurf, backSurf);
        }
        out.push('');

        // --- Diaphragm cap (front inner rect face = driver position) ---
        const diaLoop = nextLoop++;
        out.push(`Curve Loop(${diaLoop}) = {${innerFrontWireLines.join(', ')}};`);
        const diaSurf = nextSurf++;
        out.push(`Plane Surface(${diaSurf}) = {${diaLoop}};`);
        out.push(`Physical Surface("Itf_Diaphragm") = {${diaSurf}};`);
        sourceSurfaceIds.push(diaSurf);
        out.push('');
    }

    // Mesh parameters — per-group Delaunay sizing (Source / Horn / Interface),
    // mirrors Waveguide Studio's exporters.js emitMeshSizingLines/emitGroupSizeField.
    if (meshConfig) {
        out.push('// --- Mesh parameters ---');
        const throatZ = slices[0].points3D[0].z;
        const mouthZ = slices[n - 1].points3D[0].z;
        const hornLength = Math.abs(mouthZ - throatZ);
        const throatCurveIds = hasSplit ? [...sliceLines[0], ...closingLines[0]] : sliceLines[0];

        let fieldId = 1;
        const bgFieldIds = [];

        // Horn group (segments + baffle/compression-chamber lateral walls):
        // adaptive fine-at-throat sizing when enabled, restricted to its own surfaces.
        const hornExpr = hornSurfaceExprs.join(', ');
        const { fieldId: hornFieldId, nextFieldId: fid1 } =
            emitHornSizeField(out, meshConfig.horn, throatCurveIds, hornLength, fieldId, hornExpr);
        fieldId = fid1;
        bgFieldIds.push(hornFieldId);

        // Source group (throat cap / diaphragm)
        if (sourceSurfaceIds.length) {
            const { fieldId: srcFieldId, nextFieldId: fid2 } =
                emitGroupSizeField(out, meshConfig.source.clmax, sourceSurfaceIds.join(', '), fieldId);
            fieldId = fid2;
            bgFieldIds.push(srcFieldId);
        }

        // Interface group (mouth / mid-section interfaces / baffle plate)
        if (interfaceSurfaceIds.length) {
            const { fieldId: ifFieldId, nextFieldId: fid3 } =
                emitGroupSizeField(out, meshConfig.interface.clmax, interfaceSurfaceIds.join(', '), fieldId);
            fieldId = fid3;
            bgFieldIds.push(ifFieldId);
        }

        const minId = fieldId;
        out.push(`Field[${minId}] = Min;`);
        out.push(`Field[${minId}].FieldsList = {${bgFieldIds.join(', ')}};`);
        out.push(`Background Field = ${minId};`);
        // Disable boundary-size extension: sizes must stay local to the
        // surface each field targets, not bleed into neighbours.
        out.push('Mesh.CharacteristicLengthExtendFromBoundary = 0;');
        out.push(`Mesh.CharacteristicLengthMax = ${Math.max(meshConfig.source.clmax, meshConfig.horn.clmax, meshConfig.interface.clmax)};`); // safety cap
        const maxCurv = Math.max(meshConfig.source.curvature || 0, meshConfig.horn.curvature || 0, meshConfig.interface.curvature || 0);
        if (maxCurv > 0) out.push(`Mesh.MeshSizeFromCurvature = ${maxCurv};`);
        out.push('Mesh.Algorithm = 6;'); // Frontal-Delaunay
        out.push('');
    }

    return out.join('\n');
}

// Reads the per-group Delaunay mesh settings (Source / Horn / Interface) from
// the Mesh Settings panel — mirrors Waveguide Studio's getMeshSettings().
function getHornMeshSettings(genDom) {
    const profile = (clmaxEl, curvEl, adaptiveEl, defaults) => {
        const clmax = parseFloat(clmaxEl?.value);
        const curvature = parseFloat(curvEl?.value);
        return {
            clmax: Number.isFinite(clmax) && clmax > 0 ? clmax : defaults.clmax,
            curvature: Number.isFinite(curvature) ? Math.max(0, curvature) : defaults.curvature,
            adaptive: !!adaptiveEl?.checked,
        };
    };
    return {
        source: profile(genDom.genMshSourceClmax, genDom.genMshSourceCurv, genDom.genMshSourceAdaptive, { clmax: 20, curvature: 12 }),
        horn: profile(genDom.genMshHornClmax, genDom.genMshHornCurv, genDom.genMshHornAdaptive, { clmax: 40, curvature: 16 }),
        interface: profile(genDom.genMshInterfaceClmax, genDom.genMshInterfaceCurv, genDom.genMshInterfaceAdaptive, { clmax: 30, curvature: 12 }),
    };
}

// Construit le .geo GMSH du pavillon courant — partagé par l'export fichier .MSH
// et l'import direct dans le module BEM Solver.
async function buildHornGeoForExport(segs, genDom, rootElement) {
    const settings = await getSettings();
    const gmshPath = settings.paths?.gmsh;
    if (!gmshPath) throw new Error('GMSH path missing!');
    const basePath = settings.paths?.dataRoot ? `${settings.paths.dataRoot}\\Mesh-out` : '';

    // --- Read mesh parameters from UI ---
    const meshConfig = getHornMeshSettings(genDom);

    // Wood thickness comes from the horn's own mesh settings (same
    // value used by the 3D preview).
    const woodThick = parseFloat(genDom.genMeshWoodThick?.value) || 0;

    // --- Build axial slices using exact rectangle corners ---
    // MSH export mirrors the 3D preview: split H / V / H+V from the
    // UI is propagated to the generated geometry.
    const splitH = genDom.genMeshSplitH?.checked === true;
    const splitV = genDom.genMeshSplitV?.checked === true;
    const split = { horizontal: splitH, vertical: splitV };
    const showInterfaces = genDom.genMeshInterfaces?.checked !== false;

    const n = segs.length;
    const segBounds = [];
    let cumX = 0;
    for (let i = 0; i < n; i++) {
        segBounds.push({ x: cumX, hw: segs[i].w / 2, hh: segs[i].h / 2 });
        if (i < n - 1) cumX += Number(segs[i].l) || 0;
    }
    const totalLen = cumX;

    // Rectangle corners in (x, y) plane, CCW viewed from +Z.
    // Coordinate mapping: x = width direction, y = height direction,
    // z = axial (throat at -totalLen, mouth at 0).
    // In split mode we inject the rectangle's intersections with the
    // active symmetry plane(s) so the kept sector always has ≥ 3
    // points, then filter to the kept half/quarter and sort CCW.
    const buildSliceContour = (hw, hh) => {
        let pts = [
            { x:  hw, y:  hh },
            { x: -hw, y:  hh },
            { x: -hw, y: -hh },
            { x:  hw, y: -hh }
        ];
        if (splitH) pts.push({ x:  hw, y: 0 }, { x: -hw, y: 0 });
        if (splitV) pts.push({ x: 0, y:  hh }, { x: 0, y: -hh });
        if (splitH) pts = pts.filter(p => p.y >= -0.001);
        if (splitV) pts = pts.filter(p => p.x >= -0.001);
        // Dedupe (tolerance)
        const unique = [];
        for (const p of pts) {
            if (!unique.some(q => Math.abs(q.x - p.x) < 0.001 && Math.abs(q.y - p.y) < 0.001)) {
                unique.push(p);
            }
        }
        // Sort CCW by angle around origin
        unique.sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
        return unique;
    };

    const slices = [];
    for (let i = 0; i < n; i++) {
        const contour2D = buildSliceContour(segBounds[i].hw, segBounds[i].hh);
        const zAxial = segBounds[i].x - totalLen;
        const points3D = contour2D.map(p => ({ x: p.x, y: p.y, z: zAxial }));
        if (points3D.length >= 3) slices.push({ points3D });
    }
    if (slices.length < 2) throw new Error('Not enough sections');

    // --- Baffle / compression chamber config (matches drawHorn3D) ---
    let baffle = null;
    if (woodThick > 0) {
        const throatHw = segBounds[0].hw;
        const throatHh = segBounds[0].hh;
        const throatMax = Math.max(throatHw, throatHh);
        const baffleRadius = getBaffleDiameterMm(genDom, throatMax * 4) / 2;
        baffle = {
            woodThick,
            baffleRadius,
            angularPts: parseInt(genDom.genMeshAngular?.value) || 24
        };
    }

    return {
        geoContent: buildHornGeo(slices, split, meshConfig, baffle, showInterfaces),
        gmshPath,
        basePath,
    };
}

async function handleGenExport(target, genState, genDom, rootElement) {
    const segs = genState.lastGenSegments;
    if (!segs || segs.length === 0) return;

    if (target === 'akabak_lem') {
        // Same format as the Horn Expansion export: N rows = N nodes, last row = mouth (l=0)
        const segments = segs.map((seg, i) => ({
            index: i, w: seg.w, h: seg.h,
            l: (i === segs.length - 1) ? 0 : seg.l,
            s: seg.w * seg.h, cumulativeL: 0
        }));
        let cum = 0;
        segments.forEach((s, i) => { s.cumulativeL = cum; cum += s.l; });

        const wave = await askWaveSelection(rootElement);
        if (!wave) return false;

        const payload = { segments, count: segs.length, unit: 'mm', wave };
        window.showTool('akabak_lem', 'Akabak LEM');
        setTimeout(() => {
            window.panelEvents.dispatchEvent(new CustomEvent('export-to-hornscript', { detail: payload }));
        }, 100);
    }
    else if (target === 'horn') {
        // Naviguer vers le panneau Horn Expansion et injecter les segments
        window.showTool('horn', 'Horn Expansion');
        setTimeout(() => {
            const hornWrapper = document.getElementById('tool-wrapper-horn');
            if (!hornWrapper) return;
            const tableBody = hornWrapper.querySelector('#segments-table-body');
            const segCountInput = hornWrapper.querySelector('#segment-count');
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
                const firstInput = tableBody.querySelector('.segment-w');
                if (firstInput) firstInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }, 200);
    }
    else if (target === 'bemsolver') {
        // Génère le maillage en mémoire puis l'injecte directement dans le
        // panneau BEM Solver — même flux que Waveguide Studio.
        if (segs.length < 2) return false;
        const btn = rootElement.querySelector('#gen-export-bemsolver-btn');
        const originalText = btn?.textContent || 'BEM Solver';

        return (async () => {
            if (btn) { btn.disabled = true; btn.textContent = 'Generating mesh...'; }
            try {
                const content = await generateHornSolverMesh(segs, genDom, rootElement, 'horn_solver.msh');
                window.showTool?.('directivity', 'BEM Solver');
                const solverRoot = getStandaloneSolverRoot();
                await importBemMeshContent(solverRoot, content, 'horn_solver.msh');
                if (btn) btn.textContent = 'Imported';
                return true;
            } catch (e) {
                console.error('[HornStudio→Solver] export failed', e);
                if (btn) btn.textContent = `Error: ${e.message}`;
                return false;
            } finally {
                setTimeout(() => {
                    if (!btn) return;
                    btn.disabled = false;
                    btn.textContent = originalText;
                }, 1800);
            }
        })();
    }
    else if (target === 'msh') {
        // Export MSH — GMSH ThruSections loft, Delaunay surface mesh.
        // Each horn segment becomes its own Physical Surface; each slice (throat,
        // inter-segment, mouth) becomes a distinct Physical Surface interface.
        const btn = rootElement.querySelector('#gen-export-msh-btn');
        const showStatus = (msg, isError = false) => {
            if (!btn) return;
            const orig = btn.dataset.origText || btn.textContent;
            btn.dataset.origText = orig;
            btn.textContent = msg;
            btn.classList.toggle('text-red-400', isError);
            btn.classList.toggle('text-green-400', !isError);
            setTimeout(() => {
                btn.textContent = orig;
                btn.classList.remove('text-red-400', 'text-green-400');
                delete btn.dataset.origText;
            }, 4000);
        };

        (async () => {
            try {
                const { geoContent, gmshPath, basePath } = await buildHornGeoForExport(segs, genDom, rootElement);
                if (!basePath) { showStatus('Path missing!', true); return; }

                showStatus('Meshing...', false);

                const result = await window.electronAPI.exportWaveguideStep({
                    gmshPath,
                    geoContent,
                    outputDir: basePath,
                    fileName: 'horn_delaunay.msh',
                    mode: 'mesh'
                });

                if (result.success) {
                    showStatus('MSH → Mesh-out');
                } else {
                    const errMsg = (result.error || '').substring(0, 200);
                    console.error('Horn MSH Delaunay error:', result.error);
                    showStatus(`MSH Error: ${errMsg}`, true);
                }
            } catch (e) {
                console.error('Horn MSH JS error:', e);
                showStatus(`JS Error: ${e.message}`, true);
            }
        })();
    }
}

// Same wave selection modal as Horn Expansion for Akabak LEM export.
function askWaveSelection(rootElement) {
    return new Promise((resolve) => {
        const modal = rootElement.querySelector('#wave-select-modal-overlay');
        const frontBtn = rootElement.querySelector('#wave-select-front-btn');
        const backBtn = rootElement.querySelector('#wave-select-back-btn');
        const cancelBtn = rootElement.querySelector('#wave-select-cancel-btn');

        if (!modal || !frontBtn || !backBtn || !cancelBtn) {
            resolve(null);
            return;
        }

        modal.classList.remove('hidden');

        const cleanup = () => {
            modal.classList.add('hidden');
            frontBtn.removeEventListener('click', handleFront);
            backBtn.removeEventListener('click', handleBack);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        const handleFront = () => { cleanup(); resolve('front'); };
        const handleBack = () => { cleanup(); resolve('back'); };
        const handleCancel = () => { cleanup(); resolve(null); };

        frontBtn.addEventListener('click', handleFront);
        backBtn.addEventListener('click', handleBack);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

// --- Hotkeys ---

const normalizeHotkeyEvent = (event) => {
    const parts = [];
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');
    const key = event.key.toLowerCase();
    const isModifier = ['control', 'shift', 'alt', 'meta'].includes(key);
    if (!isModifier) {
        if (key === ' ') parts.push('space');
        else parts.push(key);
    }
    if (parts.length === 0) return '';
    return parts.join('+');
};

function createHotkeyHandler(genState, genDom, rootElement) {
    return function handleHotkeys(event) {
        if (genDom.rootElement.offsetParent === null) return;
        const hk = genState.hotkeySettings || {};
        const keyCombo = normalizeHotkeyEvent(event);
        if (!keyCombo) return;

        const toggleAllPanels = () => {
            const headers = genDom.rootElement.querySelectorAll('.control-label-toggle');
            const anyOpen = Array.from(headers).some(h => h.nextElementSibling.classList.contains('is-open'));
            headers.forEach(header => {
                const content = header.nextElementSibling;
                const arrow = header.querySelector('svg');
                if (anyOpen) {
                    content.classList.remove('is-open');
                    arrow.classList.remove('rotate-180');
                } else {
                    content.classList.add('is-open');
                    arrow.classList.add('rotate-180');
                }
            });
        };

        const actions = {};
        if (hk.hsTogglePanels) actions[hk.hsTogglePanels.toLowerCase()] = toggleAllPanels;
        if (hk.hsSplit) actions[hk.hsSplit.toLowerCase()] = () => {
            if (!genDom.genMeshSplitH || !genDom.genMeshSplitV) return;
            const applyToggle = () => {
                const newVal = !genDom.genMeshSplitH.checked;
                [genDom.genMeshSplitH, genDom.genMeshSplitV].forEach(cb => {
                    cb.checked = newVal;
                    cb.dataset.syncGuardBypass = '1';
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                    delete cb.dataset.syncGuardBypass;
                });
            };
            if (genState.solverSync) {
                confirmSyncBreakingChange().then(ok => { if (ok) applyToggle(); });
            } else {
                applyToggle();
            }
        };
        if (hk.hsInterface) actions[hk.hsInterface.toLowerCase()] = () => {
            if (genDom.genMeshInterfaces) genDom.genMeshInterfaces.click();
        };
        if (hk.hsExport) actions[hk.hsExport.toLowerCase()] = () => {
            const overlay = rootElement.querySelector('#gen-export-modal-overlay');
            if (overlay) overlay.classList.toggle('hidden');
        };
        if (hk.hsReset) actions[hk.hsReset.toLowerCase()] = () => {
            const resetBtn = rootElement.querySelector('#gen-reset-btn');
            if (resetBtn) resetBtn.click();
        };

        const action = actions[keyCombo.toLowerCase()];
        if (action) { event.preventDefault(); action(); }
    };
}

async function loadAndApplyHotkeys(genState, genDom, rootElement) {
    genState.hotkeySettings = (await getSettings()).hotkeys || {};
    if (genState._hotkeyHandler) document.removeEventListener('keydown', genState._hotkeyHandler);
    genState._hotkeyHandler = createHotkeyHandler(genState, genDom, rootElement);
    document.addEventListener('keydown', genState._hotkeyHandler);
}

// --- Initialisation du panneau Horn Studio ---

export function initializeHornStudioPanel(rootElement) {
    const genDom = {
        rootElement,
        genExpansionType: rootElement.querySelector('#gen-expansion-type'),
        genExpansionParams: rootElement.querySelector('#gen-expansion-params'),
        genHornType: rootElement.querySelector('#gen-horn-type'),
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
        genSegmentsTableContainer: rootElement.querySelector('#gen-segments-table-container'),
        genConstantHeight: rootElement.querySelector('#gen-constant-height'),
        genConstantHeightField: rootElement.querySelector('#gen-constant-height-field'),
        genConstantHeightValue: rootElement.querySelector('#gen-constant-height-value'),
        gen2dViewBtns: rootElement.querySelectorAll('.gen-2d-view-btn'),
        gen2dViewBtnsContainer: rootElement.querySelector('#gen-2d-view-btns'),
        gen3dContainer: rootElement.querySelector('#gen-3d-container'),
        genMeshAngular: rootElement.querySelector('#gen-mesh-angular'),
        genMeshAxial: rootElement.querySelector('#gen-mesh-axial'),
        genMeshBaffle: rootElement.querySelector('#gen-mesh-baffle'),
        genMeshBaffleDiameter: rootElement.querySelector('#gen-mesh-baffle-diameter'),
        genMeshWoodThick: rootElement.querySelector('#gen-mesh-wood-thick'),
        genMeshItf: rootElement.querySelector('#gen-mesh-itf'),
        genMshSourceClmax: rootElement.querySelector('#gen-msh-source-clmax'),
        genMshSourceCurv: rootElement.querySelector('#gen-msh-source-curv'),
        genMshSourceAdaptive: rootElement.querySelector('#gen-msh-source-adaptive'),
        genMshHornClmax: rootElement.querySelector('#gen-msh-horn-clmax'),
        genMshHornCurv: rootElement.querySelector('#gen-msh-horn-curv'),
        genMshHornAdaptive: rootElement.querySelector('#gen-msh-horn-adaptive'),
        genMshInterfaceClmax: rootElement.querySelector('#gen-msh-interface-clmax'),
        genMshInterfaceCurv: rootElement.querySelector('#gen-msh-interface-curv'),
        genMshInterfaceAdaptive: rootElement.querySelector('#gen-msh-interface-adaptive'),
        genMeshInterfaces: rootElement.querySelector('#gen-mesh-interfaces'),
        genMeshSplitH: rootElement.querySelector('#gen-mesh-split-h'),
        genMeshSplitV: rootElement.querySelector('#gen-mesh-split-v'),
        genTabBtns: rootElement.querySelectorAll('.gen-tab-btn'),
        genTabContents: rootElement.querySelectorAll('.gen-tab-content'),
        // Folding editor
        genFoldingCanvas: rootElement.querySelector('#gen-folding-canvas'),
        genFoldingBtn: rootElement.querySelector('#gen-folding-btn'),
        genFoldingResetBtn: rootElement.querySelector('#gen-folding-reset-btn'),
        genFoldingTab: rootElement.querySelector('#gen-tab-folding'),
    };

    const genState = {
        genExpansionChart: null,
        lastGenSegments: [],
        lastMeshGeometries: [],
        lockedLengths: new Set(),
        activeGenTab: 'expansion',
        isGenerateMode: false,
        gen2dView: 'surface',
        // Folding editor state
        foldingState: createFoldingState(),
        foldingActive: false,
        // Pont BEM Solver (onglet Graph)
        solverSync: false,
        solverSyncTimer: null,
        solverSyncRunning: false,
        solverSyncPending: false,
    };

    initializeBemSolverPanel(rootElement);

    const solverSyncToggle = rootElement.querySelector('#gen-solver-sync');
    solverSyncToggle?.addEventListener('change', () => {
        if (solverSyncToggle.checked && !hasCompletedBemSimulation()) {
            solverSyncToggle.checked = false;
            setSolverSyncStatus(genDom, 'Run the first simulation manually in Solver.', true);
            return;
        }
        genState.solverSync = solverSyncToggle.checked;
        setSolverSyncStatus(genDom, genState.solverSync ? 'Sync enabled' : '');
        if (genState.solverSync) scheduleSolverSync(genState, genDom, rootElement);
    });
    // Interface/split changes while synced silently invalidate the BEM mesh topology,
    // so warn before letting them through (registered before the meshRedraw
    // 'change' listeners added further below).
    [genDom.genMeshInterfaces, genDom.genMeshSplitH, genDom.genMeshSplitV].forEach(el => guardSyncSensitiveCheckbox(el, () => genState.solverSync));

    // --- Horn type selector logic ---
    function updateHornTypeUI() {
        const isConstantH = genDom.genHornType.value === 'constantH';
        genDom.genConstantHeight.checked = isConstantH;
        genDom.genConstantHeightField.className = isConstantH ? 'contents' : 'hidden contents';
        // Mouth section: toggle the whole control-group
        genDom.genMouthSection.classList.toggle('hidden', isConstantH);
    }
    genDom.genHornType.addEventListener('change', updateHornTypeUI);
    updateHornTypeUI();

    // 2D view mode switcher
    genDom.gen2dViewBtns.forEach(btn => {
        btn.classList.toggle('bg-green-700', btn.dataset.view === genState.gen2dView);
        btn.addEventListener('click', () => {
            // Quitter le mode folding si on clique sur un bouton de vue standard
            if (genState.foldingActive) {
                genState.foldingActive = false;
                genDom.genFoldingBtn.classList.remove('bg-green-700');
                genDom.genFoldingResetBtn.classList.add('hidden');
                genDom.genFoldingTab.classList.add('hidden');
                detachFoldingEvents(genState.foldingState);
                // Réafficher le tab profile
                const profileTab = rootElement.querySelector('#gen-tab-profile');
                if (profileTab && genState.activeGenTab === 'profile') {
                    profileTab.classList.remove('hidden');
                }
            }
            genState.gen2dView = btn.dataset.view;
            genDom.gen2dViewBtns.forEach(b => b.classList.toggle('bg-green-700', b.dataset.view === genState.gen2dView));
            if (genState.lastGenSegments.length) drawHorn2D(genState.lastGenSegments, genDom, rootElement, genState);
        });
    });

    // --- Folding editor activation ---
    function activateFolding() {
        const isConstantH = genDom.genHornType.value === 'constantH';
        if (!isConstantH) {
            // Le folding n'est disponible qu'en mode hauteur constante
            // Afficher un avertissement bref
            genDom.genFoldingBtn.classList.add('animate-pulse');
            setTimeout(() => genDom.genFoldingBtn.classList.remove('animate-pulse'), 1000);
            return;
        }

        genState.foldingActive = !genState.foldingActive;
        genDom.genFoldingBtn.classList.toggle('bg-green-700', genState.foldingActive);
        genDom.genFoldingResetBtn.classList.toggle('hidden', !genState.foldingActive);

        // Désactiver la surbrillance des boutons de vue standard
        if (genState.foldingActive) {
            genDom.gen2dViewBtns.forEach(b => b.classList.remove('bg-green-700'));
        } else {
            genDom.gen2dViewBtns.forEach(b => b.classList.toggle('bg-green-700', b.dataset.view === genState.gen2dView));
        }

        if (genState.foldingActive) {
            // Basculer vers l'onglet profile si pas déjà dessus
            if (genState.activeGenTab !== 'profile') {
                switchGenTab('profile', genState, genDom);
            }
            // Cacher le canvas profile standard, montrer le canvas folding
            const profileTab = rootElement.querySelector('#gen-tab-profile');
            if (profileTab) profileTab.classList.add('hidden');
            genDom.genFoldingTab.classList.remove('hidden');

            // Initialiser l'état de pliage si les segments ont changé
            const segs = genState.lastGenSegments;
            if (segs.length > 0 && genState.foldingState.jointAngles.length !== segs.length) {
                resetFoldingState(genState.foldingState, segs.length);
            }

            // Attacher les événements
            const redraw = () => {
                drawFoldedHorn(genDom.genFoldingCanvas, genState.lastGenSegments, genState.foldingState, genDom, rootElement, genState);
            };
            const onFoldEnd = () => {
                if (threeState.initialized) {
                    drawHorn3D(genState.lastGenSegments, genDom, genState);
                }
            };
            attachFoldingEvents(genDom.genFoldingCanvas, genState.foldingState, genState.lastGenSegments, genDom, rootElement, genState, redraw, onFoldEnd);
            redraw();
        } else {
            // Désactiver le folding
            detachFoldingEvents(genState.foldingState);
            genDom.genFoldingTab.classList.add('hidden');
            const profileTab = rootElement.querySelector('#gen-tab-profile');
            if (profileTab && genState.activeGenTab === 'profile') {
                profileTab.classList.remove('hidden');
            }
            if (genState.lastGenSegments.length) {
                drawHorn2D(genState.lastGenSegments, genDom, rootElement, genState);
            }
        }
    }

    if (genDom.genFoldingBtn) {
        genDom.genFoldingBtn.addEventListener('click', activateFolding);
    }
    if (genDom.genFoldingResetBtn) {
        genDom.genFoldingResetBtn.addEventListener('click', () => {
            resetFoldingState(genState.foldingState, genState.lastGenSegments.length);
            const redraw = () => {
                drawFoldedHorn(genDom.genFoldingCanvas, genState.lastGenSegments, genState.foldingState, genDom, rootElement, genState);
            };
            redraw();
        });
    }

    // Tab system
    genDom.genTabBtns.forEach(btn => btn.addEventListener('click', () => switchGenTab(btn.dataset.genTab, genState, genDom)));
    switchGenTab('expansion', genState, genDom);

    // Accordion toggle for control-groups
    rootElement.querySelectorAll('.control-label-toggle').forEach(header => {
        const content = header.nextElementSibling;
        const arrow = header.querySelector('svg');
        // Closed by default
        content.classList.remove('is-open');
        arrow.classList.remove('rotate-180');
        header.addEventListener('click', () => {
            content.classList.toggle('is-open');
            arrow.classList.toggle('rotate-180');
        });
    });

    // Initialisation directe (panneau standalone)
    updateGenExpansionParams(genDom, genState, rootElement);
    autoCalcFcFromLength(genDom);
    switchGenTab(genState.activeGenTab, genState, genDom);
    setTimeout(() => runGenerate(genState, genDom, rootElement), 150);

    // Scroll molette sur tous les inputs (Shift = x10, Ctrl = /10)
    rootElement.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
        enableMouseWheelAdjustment(input);
    });

    // Generate events
    genDom.genExpansionType.addEventListener('change', () => { updateGenExpansionParams(genDom, genState, rootElement); runGenerate(genState, genDom, rootElement); });
    genDom.genHornLength.addEventListener('input', () => { autoCalcFcFromLength(genDom); runGenerate(genState, genDom, rootElement); });
    genDom.genFc.addEventListener('input', () => { autoCalcLengthFromFc(genDom); runGenerate(genState, genDom, rootElement); });

    // Real-time regeneration on any parameter change
    const regenInputIds = [
        '#gen-constant-height-value',
        '#gen-throat-width', '#gen-throat-height',
        '#gen-mouth-width', '#gen-mouth-height',
        '#gen-segment-count'
    ];
    regenInputIds.forEach(sel => {
        const el = rootElement.querySelector(sel);
        if (el) el.addEventListener('input', () => runGenerate(genState, genDom, rootElement));
    });
    const regenSelectIds = ['#gen-horn-type'];
    regenSelectIds.forEach(sel => {
        const el = rootElement.querySelector(sel);
        if (el) el.addEventListener('change', () => runGenerate(genState, genDom, rootElement));
    });

    // --- Mesh settings: redraw 3D only (no regeneration needed) ---
    const meshRedraw = () => {
        if (genState.lastGenSegments.length) {
            drawHorn3D(genState.lastGenSegments, genDom, genState);
        }
    };
    ['#gen-mesh-angular', '#gen-mesh-axial', '#gen-mesh-baffle', '#gen-mesh-baffle-diameter', '#gen-mesh-wood-thick', '#gen-mesh-itf'].forEach(sel => {
        const el = rootElement.querySelector(sel);
        if (el) el.addEventListener('input', meshRedraw);
    });
    if (genDom.genMeshInterfaces) {
        genDom.genMeshInterfaces.addEventListener('change', meshRedraw);
    }
    if (genDom.genMeshSplitH) {
        genDom.genMeshSplitH.addEventListener('change', meshRedraw);
    }
    if (genDom.genMeshSplitV) {
        genDom.genMeshSplitV.addEventListener('change', meshRedraw);
    }

    // --- Export modal ---
    const genExportOverlay = rootElement.querySelector('#gen-export-modal-overlay');
    const genExportCloseBtn = rootElement.querySelector('#gen-export-modal-close-btn');
    const closeExportModal = () => genExportOverlay.classList.add('hidden');

    genDom.genGenerateBtn.addEventListener('click', () => {
        genExportOverlay.classList.remove('hidden');
    });
    genExportCloseBtn.addEventListener('click', closeExportModal);
    genExportOverlay.addEventListener('click', (e) => {
        if (e.target === genExportOverlay) closeExportModal();
    });
    genExportOverlay.querySelectorAll('[data-gen-target]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await handleGenExport(btn.dataset.genTarget, genState, genDom, rootElement);
            if (ok === false) return;
            setTimeout(closeExportModal, 500);
        });
    });

    // MSH collapsible sub-panel (same UX as Waveguide Studio)
    const mshToggleBtn = rootElement.querySelector('#gen-msh-toggle-btn');
    const mshSubPanel = rootElement.querySelector('#gen-msh-sub-panel');
    if (mshToggleBtn && mshSubPanel) {
        mshToggleBtn.addEventListener('click', () => {
            const arrow = mshToggleBtn.querySelector('svg');
            mshSubPanel.classList.toggle('hidden');
            if (arrow) arrow.style.transform = mshSubPanel.classList.contains('hidden') ? '' : 'rotate(180deg)';
        });
    }

    // --- Reset button ---
    const genResetBtn = rootElement.querySelector('#gen-reset-btn');
    if (genResetBtn) {
        genResetBtn.addEventListener('click', () => {
            // Reset form values to defaults
            genDom.genExpansionType.value = 'Exponential';
            genDom.genHornType.value = 'hv';
            genDom.genConstantHeightValue.value = '200';
            genDom.genThroatWidth.value = '100';
            genDom.genThroatHeight.value = '56';
            genDom.genMouthWidth.value = '400';
            genDom.genMouthHeight.value = '226';
            genDom.genHornLength.value = '500';
            genDom.genFc.value = '';
            genDom.genSegmentCount.value = '6';

            // Reset state
            genState.lockedLengths = new Set();
            genState.gen2dView = 'surface';
            genDom.gen2dViewBtns.forEach(b => b.classList.toggle('bg-green-700', b.dataset.view === 'surface'));

            // Reset folding
            genState.foldingActive = false;
            resetFoldingState(genState.foldingState, 0);
            detachFoldingEvents(genState.foldingState);
            genDom.genFoldingBtn.classList.remove('bg-green-700');
            genDom.genFoldingResetBtn.classList.add('hidden');
            genDom.genFoldingTab.classList.add('hidden');
            const profileTab = rootElement.querySelector('#gen-tab-profile');
            if (profileTab) profileTab.classList.remove('hidden');

            // Refresh UI
            updateHornTypeUI();
            updateGenExpansionParams(genDom, genState, rootElement);
            autoCalcFcFromLength(genDom);
            runGenerate(genState, genDom, rootElement);
        });
    }

    // --- Hotkeys ---
    loadAndApplyHotkeys(genState, genDom, rootElement);

    // --- Presets (Load/Save, same UX as Waveguide Studio) ---
    initHornPresetListeners(rootElement);

    // --- Auto-redraw 2D canvas on resize ---
    if (genDom.genHornCanvas && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
            if (genState.activeGenTab === 'profile' && genState.lastGenSegments.length && !genState.foldingActive) {
                drawHorn2D(genState.lastGenSegments, genDom, rootElement, genState);
            }
        });
        ro.observe(genDom.genHornCanvas.parentElement);
    }

    // --- Import depuis Horn Expansion ---
    window.panelEvents.addEventListener('export-to-hornstudio', (e) => {
        const { throatW, throatH, mouthW, mouthH, length, segmentCount } = e.detail;
        genDom.genHornType.value = 'hv';
        updateHornTypeUI();
        genDom.genThroatWidth.value = String(Math.round(throatW));
        genDom.genThroatHeight.value = String(Math.round(throatH));
        genDom.genMouthWidth.value = String(Math.round(mouthW));
        genDom.genMouthHeight.value = String(Math.round(mouthH));
        genDom.genHornLength.value = String(Math.round(length));
        genDom.genSegmentCount.value = String(segmentCount);
        autoCalcFcFromLength(genDom);
        runGenerate(genState, genDom, rootElement);
    });
}

// ====================================================================================================
// PRESETS : Save / Load / Delete Horn Studio configurations (mirrors Waveguide Studio)
// ====================================================================================================

function collectHornFormValues(root) {
    const values = {};
    root.querySelectorAll('input[type="text"], input[type="number"], select, input[type="checkbox"]').forEach(el => {
        if (!el.id) return;
        if (el.type === 'checkbox') values[el.id] = el.checked;
        else values[el.id] = el.value;
    });
    return values;
}

function applyHornFormValues(root, values) {
    if (!values) return;
    for (const [id, val] of Object.entries(values)) {
        const el = root.querySelector(`#${CSS.escape(id)}`);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = val;
        else el.value = val;
        el.dispatchEvent(new Event(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    }
}

function initHornPresetListeners(rootElement) {
    const presetsBtn = rootElement.querySelector('#gen-presets-btn');
    const modalOverlay = rootElement.querySelector('#gen-presets-modal-overlay');
    const closeBtn = rootElement.querySelector('#gen-presets-panel-close');
    const saveBtn = rootElement.querySelector('#gen-preset-save-btn');
    const nameInput = rootElement.querySelector('#gen-preset-name-input');
    if (!presetsBtn || !modalOverlay) return;

    presetsBtn.addEventListener('click', () => {
        const isHidden = modalOverlay.classList.contains('hidden');
        modalOverlay.classList.toggle('hidden', !isHidden);
        if (isHidden) refreshHornPresetList(rootElement);
    });

    closeBtn?.addEventListener('click', () => modalOverlay.classList.add('hidden'));
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.add('hidden'); });

    saveBtn?.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        const values = collectHornFormValues(rootElement);
        const preset = { name, values, savedAt: new Date().toISOString() };
        const result = await window.electronAPI.saveHornPreset(preset);
        if (result.success) {
            nameInput.value = '';
            refreshHornPresetList(rootElement);
        }
    });

    // Block ALL keyboard events from propagating when input is focused (avoid triggering hotkeys)
    ['keydown', 'keyup', 'keypress'].forEach(evtType => {
        nameInput?.addEventListener(evtType, (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (evtType === 'keydown' && e.key === 'Enter') saveBtn.click();
        }, true);
    });
}

async function refreshHornPresetList(rootElement) {
    const listEl = rootElement.querySelector('#gen-presets-list');
    const presets = await window.electronAPI.getHornPresets();

    if (!presets || presets.length === 0) {
        listEl.innerHTML = '<div class="wg-presets-empty">No saved presets</div>';
        return;
    }

    listEl.innerHTML = presets.map(p => `
        <div class="wg-preset-item" data-preset-name="${p.name.replace(/"/g, '&quot;')}">
            <span class="wg-preset-item-name" title="${p.name.replace(/"/g, '&quot;')}">${p.name}</span>
            <button class="wg-preset-load-btn" data-load-name="${p.name.replace(/"/g, '&quot;')}" title="Load preset">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Load
            </button>
            <button class="wg-preset-delete-btn" data-delete-name="${p.name.replace(/"/g, '&quot;')}" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div>
    `).join('');

    listEl.querySelectorAll('.wg-preset-load-btn').forEach(loadBtn => {
        loadBtn.addEventListener('click', () => {
            const presetName = loadBtn.dataset.loadName;
            const preset = presets.find(p => p.name === presetName);
            if (!preset) return;
            applyHornFormValues(rootElement, preset.values);
            rootElement.querySelector('#gen-presets-modal-overlay').classList.add('hidden');
        });
    });

    listEl.querySelectorAll('.wg-preset-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const name = btn.dataset.deleteName;
            await window.electronAPI.deleteHornPreset(name);
            refreshHornPresetList(rootElement);
        });
    });
}
