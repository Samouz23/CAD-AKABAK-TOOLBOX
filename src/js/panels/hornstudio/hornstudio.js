// ====================================================================================================
// FICHIER :  src/js/panels/hornstudio/hornstudio.js
// RÔLE :     Orchestre le panneau Horn Studio (générateur de pavillons standalone).
// ====================================================================================================

import { getHornStudioPanelHtml } from './uiTemplates.js';
import { generateHornSegments, generateHornSegmentsHV, generateIdealExpansionCurve, autoCalcFcFromLength, autoCalcLengthFromFc, getThroatData, getMouthData } from './generator.js';
import { enableMouseWheelAdjustment } from '../horn/eventHandlers.js';
import { expansionFormulas } from '../horn/formulas.js';
import { getSettings } from '../mainsettings/mainsettings.js';
import * as THREE from '../../lib/three.module.js';
import { OrbitControls } from '../../lib/OrbitControls.js';
import { createFoldingState, drawFoldedHorn, attachFoldingEvents, detachFoldingEvents, resetFoldingState } from './foldingEditor.js';

export { getHornStudioPanelHtml };

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

    // --- Baffle du haut-parleur (toujours affiché) ---
    {
        // Si un driver est sélectionné, baffle = diamètre + 5cm, sinon on utilise la gorge × 2
        const hasDriver = genState && genState.selectedDriverData && genState.selectedDriverData.diameterMm > 0;
        const throatW = segments[0].w;
        const throatH = segments[0].h;
        const defaultBaffleMm = Math.max(throatW, throatH) * 2;
        const baffleMm = hasDriver ? genState.selectedDriverData.diameterMm + 50 : defaultBaffleMm;

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

        const baffleX = margin + segXPositions[0] * scaleX;
        const baffleThickness = 18;

        // Remplissage bois
        ctx.fillStyle = 'rgba(139, 90, 43, 0.4)';
        ctx.fillRect(baffleX - baffleThickness, centerY - halfBaffle, baffleThickness, halfBaffle * 2);

        // Contour
        ctx.strokeStyle = '#c0522d';
        ctx.lineWidth = 2;
        ctx.strokeRect(baffleX - baffleThickness, centerY - halfBaffle, baffleThickness, halfBaffle * 2);

        // Hachures bois horizontales
        ctx.strokeStyle = 'rgba(160, 82, 45, 0.4)';
        ctx.lineWidth = 0.7;
        for (let yy = centerY - halfBaffle + 6; yy < centerY + halfBaffle; yy += 6) {
            ctx.beginPath();
            ctx.moveTo(baffleX - baffleThickness + 1, yy);
            ctx.lineTo(baffleX - 1, yy);
            ctx.stroke();
        }

        // Trou de la gorge (outline pointillé)
        ctx.strokeStyle = '#00ffa2';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(baffleX - baffleThickness / 2 - 2, centerY - throatHalfPx, 4, throatHalfPx * 2);
        ctx.setLineDash([]);

        // Label
        const label = hasDriver ? `Baffle ${baffleMm.toFixed(0)}mm` : `Baffle (default)`;
        ctx.font = '9px monospace';
        ctx.fillStyle = '#c0522d';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(baffleX - baffleThickness / 2, centerY - halfBaffle - 6);
        ctx.fillText(label, 0, 0);
        ctx.restore();
    }

    // Légende
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = plankStroke; ctx.fillText(`— ${valLabel} (gen)`, cw - 150, 15);
    if (idealCurve.length > 1) {
        ctx.fillStyle = idealColor; ctx.fillText(`--- ${valLabel} (ideal)`, cw - 150, 28);
    }
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

    // --- Surface color palette ---
    const SURFACE_COLORS = [
        0x00e676, 0xffea00, 0x2979ff, 0xff1744, 0xd500f9,
        0xff9100, 0x00e5ff, 0xff6d00, 0x76ff03, 0xf50057,
        0x00b0ff, 0xc6ff00, 0x651fff, 0xff3d00, 0x1de9b6,
        0xff4081, 0x00bfa5, 0xffd740, 0x536dfe, 0xef5350
    ];
    const wireColor = 0x000000;
    const wireOpacity = 0.16;
    let colorIdx = 0;
    function nextColor() { return SURFACE_COLORS[colorIdx++ % SURFACE_COLORS.length]; }
    // Separate color counter for interfaces so toggling doesn't shift subdomain colors
    let itfColorIdx = 10; // start at offset to avoid overlap with subdomain colors
    function nextItfColor() { return SURFACE_COLORS[itfColorIdx++ % SURFACE_COLORS.length]; }

    // Named geometries for MSH export
    const namedGeometries = [];

    function addSurface(geom, color, name) {
        const solid = new THREE.MeshPhongMaterial({
            color, side: THREE.DoubleSide, flatShading: true
        });
        const wire = new THREE.MeshBasicMaterial({
            color: wireColor, wireframe: true, transparent: true, opacity: wireOpacity
        });
        threeState.hornGroup.add(new THREE.Mesh(geom, solid));
        threeState.hornGroup.add(new THREE.Mesh(geom.clone(), wire));
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

    // ========================
    // BAFFLE: circular disc (diameter = SD) with rectangular horn throat cutout
    // ========================
    const hasDriver = genState?.selectedDriverData?.diameterMm > 0;
    const throat = segBounds[0];
    const defaultRadius = Math.max(throat.hw, throat.hh) * 2;
    const baffleRadius = hasDriver
        ? genState.selectedDriverData.diameterMm / 2
        : defaultRadius;
    const bx = offsetX; // throat plane
    const cutHW = throat.hw;
    const cutHH = throat.hh;

    // Find point on rectangle boundary at angle theta
    function rectBoundary(hw, hh, theta) {
        const sy = Math.sin(theta);
        const sz = Math.cos(theta);
        let t = 1e9;
        if (Math.abs(sy) > 1e-9) t = Math.min(t, Math.abs(hh / sy));
        if (Math.abs(sz) > 1e-9) t = Math.min(t, Math.abs(hw / sz));
        return { y: sy * t, z: sz * t };
    }

    // Build baffle annular face (rect cutout → circle) + optional sector filter
    function buildBaffleFace(faceX, sectorFilter) {
        const verts = [];
        const idx = [];
        const rings = baffleMeshPts + 1;
        for (let ri = 0; ri < rings; ri++) {
            const t = ri / (rings - 1);
            for (let ai = 0; ai < angularPts; ai++) {
                const theta = (ai / angularPts) * Math.PI * 2;
                const rp = rectBoundary(cutHW, cutHH, theta);
                const cy = Math.sin(theta) * baffleRadius;
                const cz = Math.cos(theta) * baffleRadius;
                verts.push(faceX, rp.y + (cy - rp.y) * t, rp.z + (cz - rp.z) * t);
            }
        }
        for (let ri = 0; ri < rings - 1; ri++) {
            const b0 = ri * angularPts;
            const b1 = (ri + 1) * angularPts;
            for (let ai = 0; ai < angularPts; ai++) {
                const nxt = (ai + 1) % angularPts;
                if (sectorFilter) {
                    const t0 = (ai / angularPts) * Math.PI * 2;
                    const t1 = ((ai + 1) / angularPts) * Math.PI * 2;
                    const mt = (t0 + t1) / 2;
                    if (!sectorFilter({ y: Math.sin(mt), z: Math.cos(mt) })) continue;
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

    // --- Baffle surfaces (Compression Chamber) — always visible ---
    const frontGeom = buildBaffleFace(bx - woodThick, sf);
    if (frontGeom) addSurface(frontGeom, nextColor(), 'Compression chamber');
    const backGeom = buildBaffleFace(bx, sf);
    if (backGeom) addSurface(backGeom, nextColor(), 'Compression chamber');

    // --- CC-H1 interface ---
    if (showInterfaces) {
        const throatRing = makeRing(throat.hw, throat.hh, angularPts);
        const ccItf = buildCapGeom(throatRing, bx - woodThick, angularPts, sf);
        if (ccItf) addSurface(ccItf, nextItfColor(), 'CC-H1');
    }

    // Outer edge wall (circular, front→back)
    {
        const sVerts = [];
        const sIdx = [];
        for (let ai = 0; ai < angularPts; ai++) {
            const theta = (ai / angularPts) * Math.PI * 2;
            const y = Math.sin(theta) * baffleRadius;
            const z = Math.cos(theta) * baffleRadius;
            sVerts.push(bx - woodThick, y, z);
            sVerts.push(bx, y, z);
        }
        for (let ai = 0; ai < angularPts; ai++) {
            const nxt = (ai + 1) % angularPts;
            if (sf) {
                const t0 = (ai / angularPts) * Math.PI * 2;
                const t1 = ((ai + 1) / angularPts) * Math.PI * 2;
                const mt = (t0 + t1) / 2;
                if (!sf({ y: Math.sin(mt), z: Math.cos(mt) })) continue;
            }
            const f0 = ai * 2, f1 = ai * 2 + 1;
            const f2 = nxt * 2, f3 = nxt * 2 + 1;
            sIdx.push(f0, f2, f3);
            sIdx.push(f0, f3, f1);
        }
        if (sIdx.length > 0) {
            const sGeom = new THREE.BufferGeometry();
            sGeom.setAttribute('position', new THREE.Float32BufferAttribute(sVerts, 3));
            sGeom.setIndex(sIdx);
            sGeom.computeVertexNormals();
            addSurface(sGeom, nextColor(), 'Compression chamber');
        }
    }

    // Inner cutout walls (rectangular hole)
    {
        const hw = cutHW, hh = cutHH;
        const xF = bx - woodThick, xB = bx;
        // [y0, z0, y1, z1] for each wall quad + midpoint for split test
        const walls = [
            { y0: hh, z0: -hw, y1: hh, z1: hw, my: hh, mz: 0 },   // top
            { y0: -hh, z0: hw, y1: -hh, z1: -hw, my: -hh, mz: 0 }, // bottom
            { y0: -hh, z0: -hw, y1: hh, z1: -hw, my: 0, mz: -hw }, // left
            { y0: hh, z0: hw, y1: -hh, z1: hw, my: 0, mz: hw },    // right
        ];
        for (const w of walls) {
            if (sf && !sf({ y: w.my, z: w.mz })) continue;
            const wVerts = [xF, w.y0, w.z0, xB, w.y0, w.z0, xF, w.y1, w.z1, xB, w.y1, w.z1];
            const wIdx = [0, 2, 3, 0, 3, 1];
            const wGeom = new THREE.BufferGeometry();
            wGeom.setAttribute('position', new THREE.Float32BufferAttribute(wVerts, 3));
            wGeom.setIndex(wIdx);
            wGeom.computeVertexNormals();
            addSurface(wGeom, nextColor(), 'Compression chamber');
        }
    }

    // Outline of circular edge (front)
    const circOutline = makeCircle(baffleRadius, angularPts).map(p => new THREE.Vector3(bx - woodThick, p.y, p.z));
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

    // Segment boundary outlines
    if (showInterfaces) {
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 });
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
    addExp(buildBaffleFace(bx - woodThick, qf), 'Compression chamber');
    addExp(buildBaffleFace(bx, qf), 'Compression chamber');

    // CC-H1 interface (quarter)
    const expThroatRing = makeRing(throat.hw, throat.hh, angularPts);
    addExp(buildCapGeom(expThroatRing, bx - woodThick, angularPts, qf), 'CC-H1');

    // Outer edge wall (quarter)
    {
        const eVerts = [];
        const eIdx = [];
        for (let ai = 0; ai < angularPts; ai++) {
            const theta = (ai / angularPts) * Math.PI * 2;
            eVerts.push(bx - woodThick, Math.sin(theta) * baffleRadius, Math.cos(theta) * baffleRadius);
            eVerts.push(bx, Math.sin(theta) * baffleRadius, Math.cos(theta) * baffleRadius);
        }
        for (let ai = 0; ai < angularPts; ai++) {
            const nxt = (ai + 1) % angularPts;
            const t0 = (ai / angularPts) * Math.PI * 2;
            const t1 = ((ai + 1) / angularPts) * Math.PI * 2;
            const mt = (t0 + t1) / 2;
            if (!qf({ y: Math.sin(mt), z: Math.cos(mt) })) continue;
            const f0 = ai * 2, f1 = ai * 2 + 1, f2 = nxt * 2, f3 = nxt * 2 + 1;
            eIdx.push(f0, f2, f3); eIdx.push(f0, f3, f1);
        }
        if (eIdx.length > 0) {
            const eGeom = new THREE.BufferGeometry();
            eGeom.setAttribute('position', new THREE.Float32BufferAttribute(eVerts, 3));
            eGeom.setIndex(eIdx);
            addExp(eGeom, 'Compression chamber');
        }
    }

    // Inner cutout walls (quarter)
    {
        const hw = cutHW, hh = cutHH;
        const xF = bx - woodThick, xB = bx;
        const expWalls = [
            { y0: hh, z0: -hw, y1: hh, z1: hw, my: hh, mz: 0 },
            { y0: -hh, z0: hw, y1: -hh, z1: -hw, my: -hh, mz: 0 },
            { y0: -hh, z0: -hw, y1: hh, z1: -hw, my: 0, mz: -hw },
            { y0: hh, z0: hw, y1: -hh, z1: hw, my: 0, mz: hw },
        ];
        for (const w of expWalls) {
            if (!qf({ y: w.my, z: w.mz })) continue;
            const wG = new THREE.BufferGeometry();
            wG.setAttribute('position', new THREE.Float32BufferAttribute([xF, w.y0, w.z0, xB, w.y0, w.z0, xF, w.y1, w.z1, xB, w.y1, w.z1], 3));
            wG.setIndex([0, 2, 3, 0, 3, 1]);
            addExp(wG, 'Compression chamber');
        }
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
            if (genState.foldingActive) {
                drawFoldedHorn(genDom.genFoldingCanvas, genState.lastGenSegments, genState.foldingState, genDom, genDom.rootElement, genState);
            } else {
                drawHorn2D(genState.lastGenSegments, genDom, genDom.rootElement, genState);
            }
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
    else if (target === 'msh') {
        // Export MSH — always 1/4 horn (split H+V) with all interfaces
        const geometries = genState.exportMeshGeometries;
        if (!geometries || geometries.length === 0) return;

        // Merge geometries by name (same name = same physical tag)
        const tagMap = new Map();
        for (const g of geometries) {
            if (!g.geometry || !g.name) continue;
            if (!tagMap.has(g.name)) tagMap.set(g.name, []);
            tagMap.get(g.name).push(g.geometry);
        }

        // Build merged geometry list
        const merged = [];
        for (const [name, geoms] of tagMap) {
            // Merge all BufferGeometries under same tag into one
            const allVerts = [];
            const allIdx = [];
            let vOffset = 0;
            for (const geo of geoms) {
                const pos = geo.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    allVerts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
                }
                if (geo.index) {
                    for (let i = 0; i < geo.index.count; i++) {
                        allIdx.push(geo.index.array[i] + vOffset);
                    }
                }
                vOffset += pos.count;
            }
            const mergedGeom = new THREE.BufferGeometry();
            mergedGeom.setAttribute('position', new THREE.Float32BufferAttribute(allVerts, 3));
            if (allIdx.length) mergedGeom.setIndex(allIdx);
            merged.push({ geometry: mergedGeom, name });
        }

        // Generate MSH string (Gmsh 2.2 format)
        let totalNodes = 0, totalElements = 0;
        merged.forEach(g => {
            totalNodes += g.geometry.attributes.position.count;
            if (g.geometry.index) totalElements += g.geometry.index.count / 3;
        });
        if (totalNodes === 0 || totalElements === 0) return;

        let msh = '$MeshFormat\n2.2 0 8\n$EndMeshFormat\n$PhysicalNames\n' + merged.length + '\n';
        merged.forEach((g, i) => { msh += `2 ${i + 1} "${g.name}"\n`; });
        msh += `$EndPhysicalNames\n$Nodes\n${totalNodes}\n`;
        let nodeIndex = 1;
        merged.forEach(g => {
            const vertices = g.geometry.attributes.position;
            for (let i = 0; i < vertices.count; i++) {
                msh += `${nodeIndex++} ${vertices.getX(i)} ${vertices.getY(i)} ${vertices.getZ(i)}\n`;
            }
        });
        msh += '$EndNodes\n$Elements\n' + totalElements + '\n';
        let elementIndex = 1, nodeOffset = 0;
        merged.forEach((g, i) => {
            if (g.geometry.index) {
                const indices = g.geometry.index.array;
                const tag = i + 1;
                for (let j = 0; j < indices.length; j += 3) {
                    msh += `${elementIndex++} 2 2 ${tag} ${tag} ${indices[j] + 1 + nodeOffset} ${indices[j + 1] + 1 + nodeOffset} ${indices[j + 2] + 1 + nodeOffset}\n`;
                }
                nodeOffset += g.geometry.attributes.position.count;
            }
        });
        msh += '$EndElements\n';

        // Save file
        (async () => {
            const settings = await getSettings();
            const meshPath = settings.paths?.dataRoot ? `${settings.paths.dataRoot}\\Mesh-out` : '';
            if (!meshPath) return;
            const result = await window.electronAPI.saveFileInDirectory({ directory: meshPath, fileName: 'horn_sim.msh', content: msh });
            const btn = rootElement.querySelector('#gen-export-msh-btn');
            if (btn) {
                const orig = btn.textContent;
                btn.textContent = result.success ? 'Exported!' : 'Error!';
                btn.classList.add(result.success ? 'text-green-400' : 'text-red-400');
                setTimeout(() => { btn.textContent = orig; btn.classList.remove('text-green-400', 'text-red-400'); }, 3000);
            }
        })();
    }
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
        if (hk.hsExport) actions[hk.hsExport.toLowerCase()] = () => {
            const overlay = rootElement.querySelector('#gen-export-modal-overlay');
            if (overlay) overlay.classList.toggle('hidden');
        };
        if (hk.hsReset) actions[hk.hsReset.toLowerCase()] = () => {
            const resetBtn = rootElement.querySelector('#gen-reset-btn');
            if (resetBtn) resetBtn.click();
        };
        if (hk.hsGenerate) actions[hk.hsGenerate.toLowerCase()] = () => {
            runGenerate(genState, genDom, rootElement);
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
    let allDrivers = [];
    let selectedDriver = null;

    const genDom = {
        rootElement,
        genDriverSearch: rootElement.querySelector('#gen-driver-search'),
        genDriverList: rootElement.querySelector('#gen-driver-list'),
        genDriverToggle: rootElement.querySelector('#gen-driver-toggle'),
        genDriverInfo: rootElement.querySelector('#gen-driver-info'),
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
        gen3dContainer: rootElement.querySelector('#gen-3d-container'),
        genMeshAngular: rootElement.querySelector('#gen-mesh-angular'),
        genMeshAxial: rootElement.querySelector('#gen-mesh-axial'),
        genMeshBaffle: rootElement.querySelector('#gen-mesh-baffle'),
        genMeshWoodThick: rootElement.querySelector('#gen-mesh-wood-thick'),
        genMeshItf: rootElement.querySelector('#gen-mesh-itf'),
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
        selectedDriverData: null,
        // Folding editor state
        foldingState: createFoldingState(),
        foldingActive: false,
    };

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

    // --- Mesh settings: redraw 3D only (no regeneration needed) ---
    const meshRedraw = () => {
        if (genState.lastGenSegments.length) {
            drawHorn3D(genState.lastGenSegments, genDom, genState);
        }
    };
    ['#gen-mesh-angular', '#gen-mesh-axial', '#gen-mesh-baffle', '#gen-mesh-wood-thick', '#gen-mesh-itf'].forEach(sel => {
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
        btn.addEventListener('click', () => {
            handleGenExport(btn.dataset.genTarget, genState, genDom, rootElement);
            setTimeout(closeExportModal, 500);
        });
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

            // Reset driver selection
            selectedDriver = null;
            genState.selectedDriverData = null;
            genDom.genDriverToggle.textContent = '[ None ]';
            genDom.genDriverSearch.value = '';
            genDom.genDriverInfo.classList.add('hidden');
            genDom.genDriverInfo.textContent = '';

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
            updateShapeFields('throat', genDom);
            updateShapeFields('mouth', genDom);
            updateGenExpansionParams(genDom, genState, rootElement);
            autoCalcFcFromLength(genDom);
            runGenerate(genState, genDom, rootElement);
        });
    }

    // --- Driver search/select ---
    async function loadDrivers() {
        try {
            allDrivers = await window.electronAPI.getAllDrivers();
        }
        catch (e) { console.error('Failed to load drivers:', e); allDrivers = []; }
    }
    loadDrivers();

    genDom.genDriverSearch.addEventListener('input', () => {
        const term = genDom.genDriverSearch.value.toLowerCase();
        if (!term) { genDom.genDriverList.classList.add('hidden'); return; }
        const filtered = allDrivers.filter(d => d.name.toLowerCase().includes(term));
        genDom.genDriverList.innerHTML = filtered
            .map(d => `<div class="p-2 hover:bg-green-700 cursor-pointer text-white" data-name="${d.name}">${d.name}</div>`)
            .join('');
        genDom.genDriverList.classList.remove('hidden');
    });

    genDom.genDriverList.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-name]');
        if (!target) return;
        const name = target.dataset.name;
        selectedDriver = { name };
        genDom.genDriverToggle.textContent = `[ ${name} ]`;
        genDom.genDriverList.classList.add('hidden');
        genDom.genDriverSearch.value = '';
        try {
            const params = await window.electronAPI.getDriverById(name);
            if (params) {
                const sd = params.SD || params.SDf || params.SDr || 0;
                const diamMm = sd > 0 ? 2 * Math.sqrt((sd * 100) / Math.PI) : 0;
                genState.selectedDriverData = { name, sd, diameterMm: diamMm, params };
                genDom.genDriverInfo.classList.remove('hidden');
                genDom.genDriverInfo.textContent = `SD: ${sd} cm² — ⌀ ${diamMm.toFixed(1)} mm`;
            }
        } catch (err) { console.error('Driver load error:', err); }
        if (genState.lastGenSegments.length) {
            drawHorn2D(genState.lastGenSegments, genDom, rootElement, genState);
            drawHorn3D(genState.lastGenSegments, genDom, genState);
        }
    });

    genDom.genDriverToggle.addEventListener('click', () => {
        selectedDriver = null;
        genState.selectedDriverData = null;
        genDom.genDriverToggle.textContent = '[ None ]';
        genDom.genDriverInfo.classList.add('hidden');
        genDom.genDriverInfo.textContent = '';
        if (genState.lastGenSegments.length) {
            drawHorn2D(genState.lastGenSegments, genDom, rootElement, genState);
            drawHorn3D(genState.lastGenSegments, genDom, genState);
        }
    });

    // --- Hotkeys ---
    loadAndApplyHotkeys(genState, genDom, rootElement);
}
