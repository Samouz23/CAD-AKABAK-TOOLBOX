// ====================================================================================================
// FICHIER :  src/js/panels/horn/generation/generator.js
// RÔLE :     Algorithmes de génération de pavillon (segments, courbes idéales).
// ====================================================================================================

import { expansionFormulas, getFcFromHornLength } from '../formulas.js';

// --- Helpers pour obtenir les données throat/mouth depuis n'importe quel mode de forme ---

export function getThroatData(genDom) {
    const mode = genDom.genThroatShape.value;
    if (mode === 'rectangular') {
        const w = parseFloat(genDom.genThroatWidth.value) || 100;
        const h = parseFloat(genDom.genThroatHeight.value) || 56;
        return { w, h, s: w * h };
    } else if (mode === 'circular') {
        const d = parseFloat(genDom.genThroatDiameter.value) || 84;
        const s = Math.PI * (d / 2) * (d / 2);
        return { w: d, h: d, s };
    } else {
        const s = parseFloat(genDom.genThroatArea.value) || 5600;
        const side = Math.sqrt(s);
        return { w: side, h: side, s };
    }
}

export function getMouthData(genDom) {
    const mode = genDom.genMouthShape.value;
    if (mode === 'rectangular') {
        const w = parseFloat(genDom.genMouthWidth.value) || 400;
        const h = parseFloat(genDom.genMouthHeight.value) || 226;
        return { w, h, s: w * h };
    } else if (mode === 'circular') {
        const d = parseFloat(genDom.genMouthDiameter.value) || 340;
        const s = Math.PI * (d / 2) * (d / 2);
        return { w: d, h: d, s };
    } else {
        const s = parseFloat(genDom.genMouthArea.value) || 90400;
        const side = Math.sqrt(s);
        return { w: side, h: side, s };
    }
}

// --- Génération des segments ---

export function generateHornSegments(genDom, rootElement) {
    const type = genDom.genExpansionType.value;
    const L = parseFloat(genDom.genHornLength.value) || 500;
    const throat = getThroatData(genDom);
    const mouth = getMouthData(genDom);
    const numSegs = Math.max(2, Math.min(20, parseInt(genDom.genSegmentCount.value) || 6));
    const constantH = genDom.genConstantHeight.checked;
    const fixedH = constantH ? (parseFloat(genDom.genConstantHeightValue.value) || 200) : 0;

    const s0 = throat.s;
    const sL = mouth.s;
    if (L <= 0 || s0 <= 0 || sL <= 0) return [];

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
    if (!formula) return [];

    const rawEnd = formula(s0, sL, L, L, opts);
    const needsScale = type !== 'Conical' && rawEnd > 0 && Math.abs(rawEnd - sL) > 1;

    const getScaledArea = (x) => {
        const rawArea = formula(s0, sL, L, x, opts);
        if (!needsScale || !isFinite(rawArea)) return rawArea;
        if (rawArea <= s0) return s0;
        const logRatio = Math.log(rawArea / s0) / Math.log(rawEnd / s0);
        return s0 * Math.pow(sL / s0, logRatio);
    };

    const segments = [];
    const step = L / (numSegs - 1);

    for (let i = 0; i < numSegs; i++) {
        const x = i * step;
        let area;
        if (i === 0) area = s0;
        else if (i === numSegs - 1) area = sL;
        else area = getScaledArea(x);

        if (!isFinite(area) || area <= 0) area = s0;

        let finalW, finalH;
        if (constantH) {
            finalH = fixedH;
            finalW = area / fixedH;
        } else {
            const t = x / L;
            const segW = throatW * Math.pow(ratio_w, t);
            const segH = throatH * Math.pow(ratio_h, t);
            const rawArea = segW * segH;
            const scale = Math.sqrt(area / rawArea);
            finalW = (i === 0) ? throatW : (i === numSegs - 1) ? mouthW : segW * scale;
            finalH = (i === 0) ? throatH : (i === numSegs - 1) ? mouthH : segH * scale;
        }

        segments.push({
            w: Math.round(finalW * 10) / 10,
            h: Math.round(finalH * 10) / 10,
            l: (i < numSegs - 1) ? Math.round(step * 10) / 10 : 0,
            s: Math.round(finalW * finalH)
        });
    }

    return segments;
}

// --- Génération de la courbe d'expansion idéale (continue) pour le graphique ---

export function generateIdealExpansionCurve(genDom, rootElement) {
    const type = genDom.genExpansionType.value;
    const L = parseFloat(genDom.genHornLength.value) || 500;
    const throat = getThroatData(genDom);
    const mouth = getMouthData(genDom);

    const s0 = throat.s;
    const sL = mouth.s;

    const opts = {};
    if (type === 'Hypex') opts.T = parseFloat(rootElement.querySelector('#gen-param-T')?.value) || 1.0;
    else if (type === 'OS') opts.theta = parseFloat(rootElement.querySelector('#gen-param-theta')?.value) || 45;

    const formula = expansionFormulas[type];
    if (!formula || L <= 0 || s0 <= 0) return [];

    const points = [];
    const steps = 200;
    const rawEnd = formula(s0, sL, L, L, opts);
    const needsScale = type !== 'Conical' && rawEnd > 0 && Math.abs(rawEnd - sL) > 1;

    for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * L;
        let area = formula(s0, sL, L, x, opts);
        if (needsScale && isFinite(area) && area > s0 && rawEnd > s0) {
            const logRatio = Math.log(area / s0) / Math.log(rawEnd / s0);
            area = s0 * Math.pow(sL / s0, logRatio);
        }
        if (isFinite(area)) points.push({ x: Math.round(x * 10) / 10, y: Math.round(area) });
    }
    return points;
}

// --- Génération H+V par directivité cible ---
// Gorge et bouche = valeurs utilisateur (fixes).
// La loi d'expansion est respectée pour la surface.
// Les longueurs de segment sont NON-UNIFORMES : plus courtes là où l'expansion
// est rapide, pour que l'angle local de chaque planche se rapproche de la
// directivité cible H et V.

export function generateHornSegmentsHV(genDom, rootElement) {
    const type = genDom.genExpansionType.value;
    const L = parseFloat(genDom.genHornLength.value) || 500;
    const throat = getThroatData(genDom);
    const mouth = getMouthData(genDom);
    const numSegs = Math.max(2, Math.min(20, parseInt(genDom.genSegmentCount.value) || 6));

    const targetH_deg = parseFloat(genDom.genDirectivityH.value) || 90;
    const targetV_deg = parseFloat(genDom.genDirectivityV.value) || 40;
    const tanH = Math.tan((targetH_deg / 2) * (Math.PI / 180));
    const tanV = Math.tan((targetV_deg / 2) * (Math.PI / 180));

    const throatW = throat.w, throatH = throat.h, s0 = throat.s;
    const mouthW = mouth.w, mouthH = mouth.h, sL = mouth.s;
    if (L <= 0 || s0 <= 0 || sL <= 0) return [];

    const ratio_w = mouthW / throatW;
    const ratio_h = mouthH / throatH;

    const opts = {};
    if (type === 'Hypex') opts.T = parseFloat(rootElement.querySelector('#gen-param-T')?.value) || 1.0;
    else if (type === 'OS') opts.theta = parseFloat(rootElement.querySelector('#gen-param-theta')?.value) || 45;

    const formula = expansionFormulas[type];
    if (!formula) return [];

    const rawEnd = formula(s0, sL, L, L, opts);
    const needsScale = type !== 'Conical' && rawEnd > 0 && Math.abs(rawEnd - sL) > 1;

    const getScaledArea = (x) => {
        const rawArea = formula(s0, sL, L, x, opts);
        if (!needsScale || !isFinite(rawArea)) return rawArea;
        if (rawArea <= s0) return s0;
        const logRatio = Math.log(rawArea / s0) / Math.log(rawEnd / s0);
        return s0 * Math.pow(sL / s0, logRatio);
    };

    // Fonction continue W(x), H(x) — interpolation par ratio + mise à l'échelle expansion
    const getWH = (x) => {
        if (x <= 0) return { w: throatW, h: throatH };
        if (x >= L) return { w: mouthW, h: mouthH };
        let area = getScaledArea(x);
        if (!isFinite(area) || area <= 0) area = s0;
        const t = x / L;
        const sw = throatW * Math.pow(ratio_w, t);
        const sh = throatH * Math.pow(ratio_h, t);
        const scale = Math.sqrt(area / (sw * sh));
        return { w: sw * scale, h: sh * scale };
    };

    // --- Placement optimal des segments ---
    // On échantillonne finement le pavillon et on pèse chaque tranche par le
    // rapport entre le taux d'expansion local et l'angle cible.
    // Les segments sont ensuite placés à intervalles de poids égaux, ce qui
    // donne des segments courts là où l'expansion est rapide et vice-versa.
    const FINE = 1000;
    const dx = L / FINE;
    const weights = new Array(FINE);
    for (let j = 0; j < FINE; j++) {
        const x = j * dx;
        const wh1 = getWH(x);
        const wh2 = getWH(x + dx);
        const rateH = Math.abs(wh2.w - wh1.w) / (2 * dx * tanH);
        const rateV = Math.abs(wh2.h - wh1.h) / (2 * dx * tanV);
        weights[j] = Math.max(rateH, rateV, 0.001);
    }

    const cumW = [0];
    for (let j = 0; j < FINE; j++) cumW.push(cumW[j] + weights[j]);
    const totalW = cumW[FINE];

    // Positions à poids égaux
    const positions = [0];
    for (let k = 1; k < numSegs - 1; k++) {
        const target = (k / (numSegs - 1)) * totalW;
        let j = 0;
        while (j < FINE - 1 && cumW[j + 1] < target) j++;
        const denom = cumW[j + 1] - cumW[j];
        const frac = denom > 0 ? (target - cumW[j]) / denom : 0;
        positions.push((j + frac) * dx);
    }
    positions.push(L);

    // Construire les segments
    const segments = [];
    for (let i = 0; i < numSegs; i++) {
        const wh = getWH(positions[i]);
        const segLen = i < numSegs - 1
            ? Math.round((positions[i + 1] - positions[i]) * 10) / 10
            : 0;
        segments.push({
            w: Math.round(wh.w * 10) / 10,
            h: Math.round(wh.h * 10) / 10,
            l: segLen,
            s: Math.round(wh.w * wh.h)
        });
    }

    return segments;
}

// --- Auto-calcul Fc ↔ Longueur ---

export function autoCalcFcFromLength(genDom) {
    const L_mm = parseFloat(genDom.genHornLength.value) || 0;
    if (L_mm > 0) genDom.genFc.value = Math.round(getFcFromHornLength(L_mm));
}

export function autoCalcLengthFromFc(genDom) {
    const fc = parseFloat(genDom.genFc.value) || 0;
    if (fc > 0) genDom.genHornLength.value = Math.round((116 * 1000) / fc);
}
