// =======================================================
// scripts/dosc_harness.mjs
//
// Harnais de validation HEADLESS du générateur DOSC (aucun Electron, aucun DOM).
// Il vérifie, sur la géométrie produite par src/js/panels/waveguidestudio/dosc/
// doscGenerator.js :
//
//   1. la reproduction des cotes du brevet US 5,163,167 (O=35, i=30, L=220,
//      D=244) : demi-angle α, cote du pli, jeux ;
//   2. l'ISOPHASICITÉ : longueurs de lignes de courant identiques (critère du
//      brevet) et |n_z| = sin α sur toute la paroi (critère intrinsèque) ;
//   3. le CONGÉ : que `filletRadius` soit bien le rayon de courbure obtenu, et
//      que la dispersion résiduelle δ reste très en dessous de λ₂/4 ;
//   4. la bande de fonctionnement déduite des 5 conditions du brevet ;
//   5. la validité du maillage : anneaux non dégénérés, sections convexes,
//      progression axiale monotone, non-interpénétration corps / carter.
//
// Le harnais importe les MÊMES fonctions que l'application (sheetRadius,
// surfaceNormal, flowLineLength) : il teste le code de production, pas une
// copie.
//
// Usage (depuis la racine du repo) :
//   node scripts/dosc_harness.mjs                 # cas brevet + balayage congé
//   node scripts/dosc_harness.mjs --stl           # + export STL des 2 nappes
//   node scripts/dosc_harness.mjs --O 35 --i 30 --L 220 --D 244
//
// Sorties : rapport texte sur stdout, et scripts/out/dosc_*.stl si --stl.
// Code de retour : 0 si tout passe, 1 sinon (utilisable en CI).
// =======================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    generateDosc,
    deriveDoscParams,
    maxDoscFilletRadius,
    computeIsophaseReport,
    checkPatentConditions,
    sheetRadius,
    surfaceNormal,
    effectiveFilletRadius,
} from '../src/js/panels/waveguidestudio/dosc/doscGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'out');

// ------------------------------------------------------- CLI
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const num = (name, dflt) => {
    const k = argv.indexOf(name);
    return k >= 0 && argv[k + 1] != null ? Number(argv[k + 1]) : dflt;
};

const CASE = {
    throatDiameter: num('--O', 35),
    mouthWidth: num('--i', 30),
    mouthHeight: num('--L', 220),
    depth: num('--D', 244),
    numLines: num('--N', 120),
    axialPoints: num('--A', 120),
};

let failures = 0;
const check = (label, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  —  ' + detail : ''}`);
};

// =======================================================
// 1. Cotes du brevet
// =======================================================
console.log('\n=== 1. Reproduction des cotes du brevet US 5,163,167 ===');
const pRef = deriveDoscParams(CASE);
if (!pRef.ok) { console.log('  FAIL  ' + pRef.error); process.exit(1); }
{
    const p = pRef;
    console.log(`  entrées      : O=${CASE.throatDiameter}  i=${CASE.mouthWidth}  L=${CASE.mouthHeight}  D=${CASE.depth} mm`);
    console.log(`  tan α        = ${p.tanAlpha.toFixed(4)}`);
    console.log(`  α            = ${p.alphaDeg.toFixed(2)}°   (angle plein 2α = ${(2 * p.alphaDeg).toFixed(1)}°)`);
    console.log(`  pli carter   = z ${p.foldOnsetHousing.toFixed(1)} mm   (brevet : A = ${(CASE.depth / 2).toFixed(0)} mm)`);
    console.log(`  pli corps    = z ${p.foldOnsetBody.toFixed(1)} mm      (rev. 33 : D/2 = ${(CASE.depth / 2).toFixed(0)} mm)`);
    console.log(`  jeu conique  = ${p.gapConical.toFixed(2)} mm`);
    console.log(`  jeu biseau   = ${p.gapBevel.toFixed(2)} mm`);
    console.log(`  chemin réf.  = D/cos α = ${p.refPathLength.toFixed(3)} mm`);
    console.log(`  bombé fente  = ${p.mouthEndBulge.toFixed(2)} mm (petits côtés, FIG. 6)`);

    // Rev. 33 place le pli à D/2 pour une arête de fuite d'épaisseur NULLE.
    // L'arête réelle (t = 1,5 mm, offset parallèle) le décale de t/(4·tanα).
    const foldExpected = CASE.depth / 2 + 1.5 / (4 * p.tanAlpha);
    check('rev.33 — pli du corps à D/2, au décalage d\'arête près',
        Math.abs(p.foldOnsetBody - foldExpected) < 1e-6,
        `${p.foldOnsetBody.toFixed(3)} vs D/2 + t/(4tanα) = ${foldExpected.toFixed(3)} mm`);
    check('pli du carter proche de D/2 (< 5 % de D)',
        Math.abs(p.foldOnsetHousing - CASE.depth / 2) < 0.05 * CASE.depth,
        `écart ${(p.foldOnsetHousing - CASE.depth / 2).toFixed(1)} mm`);
    if (CASE.throatDiameter === 35 && CASE.mouthHeight === 220 && CASE.depth === 244) {
        check('angle plein 2α ≈ 50° (valeur "a" du brevet, ±10°)',
            Math.abs(2 * p.alphaDeg - 50) < 10, `2α = ${(2 * p.alphaDeg).toFixed(1)}°`);
    }
    check('condition brevet n°2 : α ≤ 30°', p.alphaDeg <= 30, `α = ${p.alphaDeg.toFixed(1)}°`);
}

// =======================================================
// 2/3. Isophasicité, et calibration du congé
// =======================================================
console.log('\n=== 2/3. Isophasicité et congé ===');
const rhoMax = maxDoscFilletRadius(pRef);
console.log(`  rayon de congé max admissible : ${rhoMax.toFixed(2)} mm`);

/**
 * Rayon de courbure MINIMAL du méridien à l'azimut φ, mesuré numériquement.
 * Le méridien r(z) est une courbe plane : κ = |r''| / (1 + r'²)^(3/2).
 * Le balayage est resserré sur la bande du congé (|z - z*| < 1,5·ρ/(2 sinα))
 * pour que le pas de différences finies soit petit devant la taille du raccord.
 */
function minMeridianRadius(sheet, phi, rho, zFold, params, zLo, zHi) {
    if (!(rho > 0) || zFold == null) return { radius: Infinity, z: null };
    const half = (rho / (2 * params.sinAlpha)) * 1.5;
    const zFrom = Math.max(zLo, zFold - half);
    const zTo = Math.min(zHi, zFold + half);
    const n = 3000;
    const h = (zTo - zFrom) / n;
    if (!(h > 0)) return { radius: Infinity, z: null };
    let best = Infinity, bestZ = null;
    for (let k = 1; k < n; k++) {
        const z = zFrom + k * h;
        const rm = sheetRadius(sheet, z - h, phi, rho);
        const r0 = sheetRadius(sheet, z, phi, rho);
        const rp = sheetRadius(sheet, z + h, phi, rho);
        const d1 = (rp - rm) / (2 * h);
        const d2 = (rp - 2 * r0 + rm) / (h * h);
        const kappa = Math.abs(d2) / Math.pow(1 + d1 * d1, 1.5);
        if (kappa > 1e-9) {
            const R = 1 / kappa;
            if (R < best) { best = R; bestZ = z; }
        }
    }
    return { radius: best, z: bestZ };
}

/**
 * Rayon de courbure principal MINIMAL de la surface implicite en un point.
 *
 * Mesure intrinsèque, indépendante de tout paramétrage — c'est indispensable
 * ici : à un azimut φ ≠ 0 le plan méridien coupe la courbe de pli OBLIQUEMENT,
 * donc (théorème de Meusnier) la courbure qu'on y lit vaut κ_normale / cos θ et
 * SURESTIME la courbure réelle du congé. On calcule donc l'opérateur de forme
 * S = -P·(∇n)·P dans le plan tangent, à partir de la normale analytique.
 */
function maxPrincipalCurvature(sheet, x, y, z, rho, h) {
    const n = surfaceNormal(sheet, x, y, z, rho);
    // Repère orthonormé du plan tangent.
    let e1 = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const d = e1.x * n.x + e1.y * n.y + e1.z * n.z;
    e1 = { x: e1.x - d * n.x, y: e1.y - d * n.y, z: e1.z - d * n.z };
    const l1 = Math.hypot(e1.x, e1.y, e1.z); e1 = { x: e1.x / l1, y: e1.y / l1, z: e1.z / l1 };
    const e2 = {
        x: n.y * e1.z - n.z * e1.y,
        y: n.z * e1.x - n.x * e1.z,
        z: n.x * e1.y - n.y * e1.x,
    };

    // Reprojection radiale sur la surface (le contour est étoilé par construction).
    const onSurface = (px, py, pz) => {
        const phi = Math.atan2(py, px);
        const r = sheetRadius(sheet, pz, phi, rho);
        return { x: r * Math.cos(phi), y: r * Math.sin(phi), z: pz };
    };
    const dn = (e) => {
        const p = onSurface(x + h * e.x, y + h * e.y, z + h * e.z);
        const m = onSurface(x - h * e.x, y - h * e.y, z - h * e.z);
        const np = surfaceNormal(sheet, p.x, p.y, p.z, rho);
        const nm = surfaceNormal(sheet, m.x, m.y, m.z, rho);
        return { x: (np.x - nm.x) / (2 * h), y: (np.y - nm.y) / (2 * h), z: (np.z - nm.z) / (2 * h) };
    };
    const dn1 = dn(e1), dn2 = dn(e2);
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const a11 = -dot(dn1, e1), a12 = -dot(dn1, e2);
    const a21 = -dot(dn2, e1), a22 = -dot(dn2, e2);
    const off = 0.5 * (a12 + a21);
    const tr = a11 + a22;
    const det = a11 * a22 - off * off;
    const disc = Math.max(0, tr * tr - 4 * det);
    const k1 = 0.5 * (tr + Math.sqrt(disc));
    const k2 = 0.5 * (tr - Math.sqrt(disc));
    return Math.max(Math.abs(k1), Math.abs(k2));
}

/**
 * Rayon de courbure minimal du congé, balayé le long de TOUTE la courbe de pli.
 * Pour chaque azimut on relocalise la cote du pli : R(z)·|cos φ| = X(z), puis on
 * balaye la bande du congé et on retient la courbure principale maximale.
 */
function minFilletRadiusOverCrease(sheet, params, rho, nPhi = 17) {
    if (!(rho > 0)) return { radius: Infinity, phiDeg: null };
    const t = params.tanAlpha;
    const band = rho / (2 * params.sinAlpha);
    const h = Math.max(1e-4, rho / 60);
    // Le rayon demandé est plafonné par la cote locale (arête de fuite, nez).
    // On compare donc le rayon MESURÉ au rayon EFFECTIF au même endroit : c'est
    // le seul rapport qui ait un sens.
    let worst = Infinity, worstPhi = null, worstRatio = Infinity, worstEff = null;
    for (let k = 0; k < nPhi; k++) {
        const phi = (Math.PI / 2) * (k / (nPhi - 1)) * 0.98;
        const c = Math.abs(Math.cos(phi));
        // (r0 + z t)·c = x0 + (D - z) t  ⟹  z = (x0 + D t - r0 c) / (t (1 + c))
        const zFold = (sheet.x0 + params.depth * t - sheet.r0 * c) / (t * (1 + c));
        if (!(zFold > band && zFold < params.depth - band)) continue;
        for (let m = -20; m <= 20; m++) {
            const z = zFold + (band * m) / 20;
            const r = sheetRadius(sheet, z, phi, rho);
            if (!(r > 1e-6)) continue;
            const eff = effectiveFilletRadius(sheet, z, rho);
            if (!(eff > 1e-6)) continue;
            const kappa = maxPrincipalCurvature(sheet, r * Math.cos(phi), r * Math.sin(phi), z, rho, h);
            if (kappa > 1e-9) {
                const R = 1 / kappa;
                if (R < worst) { worst = R; worstPhi = phi * 180 / Math.PI; }
                if (R / eff < worstRatio) { worstRatio = R / eff; worstEff = eff; }
            }
        }
    }
    return { radius: worst, phiDeg: worstPhi, ratio: worstRatio, effAtWorst: worstEff };
}

console.log('');
console.log('  ρ (mm) | R_mérid. φ=0 (éq.9) | R_min réel sur l\'arête | s_carter min→max (mm)     |    δ (mm) | δ/(λ₂/4)@16k');
console.log('  -------+---------------------+------------------------+---------------------------+-----------+-------------');

const budget16k = 343000 / 16000 / 4;
const sweep = [0, 1, 2, 3, 5].filter(r => r <= rhoMax);
if (rhoMax > 5) sweep.push(Number(rhoMax.toFixed(2)));
const results = new Map();

for (const R of sweep) {
    const built = generateDosc({ ...CASE, filletRadius: R });
    if (!built.ok) { console.log(`  FAIL ρ=${R}: ${built.error}`); failures++; continue; }
    const rep = computeIsophaseReport(built, { azimuthSamples: 25, fMaxHz: 16000 });
    const axial = R > 0
        ? minMeridianRadius(built.sheets.housing, 0, R, built.params.foldOnsetHousing, built.params, 0.2, CASE.depth - 0.2)
        : { radius: Infinity };
    const crease = minFilletRadiusOverCrease(built.sheets.housing, built.params, R);
    const creaseBody = minFilletRadiusOverCrease(built.sheets.body, built.params, R);
    results.set(R, { built, rep, axial, crease, creaseBody });

    const fmt = (v) => (v === Infinity ? '(vif)' : v.toFixed(2));
    console.log(
        `  ${R.toFixed(2).padStart(6)} | ${fmt(axial.radius).padStart(19)} | ` +
        `${(crease.radius === Infinity ? '(vif)' : crease.radius.toFixed(2) + ` @φ${Math.round(crease.phiDeg)}°`).padStart(22)} | ` +
        `${rep.housing.min.toFixed(3).padStart(10)} → ${rep.housing.max.toFixed(3).padStart(10)} | ` +
        `${rep.delta.toFixed(4).padStart(9)} | ${(rep.delta / budget16k * 100).toFixed(1).padStart(9)} %`
    );
}
console.log('');

// -- Arêtes vives : le modèle du brevet doit être isophasique à la précision de
//    l'intégrateur (pas axial D/2000 → erreur ~10 µm).
{
    const r0 = results.get(0);
    check('arêtes vives : isophasicité exacte (δ < 0.05 mm)', r0 && r0.rep.delta < 0.05,
        `δ = ${r0?.rep.delta.toFixed(4)} mm`);
    const err = Math.abs(r0.rep.housing.mean - pRef.refPathLength);
    check('longueur de chemin mesurée = D / cos α', err < 0.01,
        `mesuré ${r0.rep.housing.mean.toFixed(4)} vs théorique ${pRef.refPathLength.toFixed(4)} mm`);
}

// -- Forme close (9) : R_min du méridien φ=0 doit valoir ρ/sin²(2α).
{
    const s2a = Math.sin(2 * pRef.alpha) ** 2;
    for (const R of sweep.filter(r => r >= 1)) {
        const measured = results.get(R).axial.radius;
        const expected = R / s2a;
        const relErr = Math.abs(measured - expected) / expected;
        check(`éq.(9) : R_min(φ=0) = ρ/sin²(2α) pour ρ=${R}`, relErr < 0.05,
            `mesuré ${measured.toFixed(3)} vs attendu ${expected.toFixed(3)} mm (${(relErr * 100).toFixed(1)} %)`);
    }
}

// -- `filletRadius` doit être une BORNE INFÉRIEURE du rayon de courbure, une
//    fois pris en compte le plafond par cote locale : partout sur l'arête, le
//    rayon mesuré doit valoir au moins le ρ EFFECTIF de l'endroit.
//    Le long de l'arête du CARTER l'angle dièdre reste ≥ 89,6° (cf. §2.2 bis),
//    donc le raccord y est quasi exactement circulaire. Sur le CORPS l'arête va
//    jusqu'à φ=90° où γ tombe à 82,8°, d'où une tolérance plus large.
for (const R of sweep.filter(r => r >= 1)) {
    const h = results.get(R).crease;
    check(`ρ=${R} : carter — rayon ≥ ρ effectif partout sur l'arête`, h.ratio >= 0.95,
        `pire rapport ${h.ratio.toFixed(2)}·ρ_eff (min absolu ${h.radius.toFixed(3)} mm @ φ=${Math.round(h.phiDeg)}°)`);
    const b = results.get(R).creaseBody;
    check(`ρ=${R} : corps — rayon ≥ 0.8·ρ effectif partout sur l'arête`, b.ratio >= 0.80,
        `pire rapport ${b.ratio.toFixed(2)}·ρ_eff (min absolu ${b.radius.toFixed(3)} mm @ φ=${Math.round(b.phiDeg)}°)`);
}

// -- δ. Le raccord est homogène de degré 1 en ρ, donc δ serait rigoureusement
//    proportionnel à ρ si le rayon n'était pas plafonné localement. Avec le
//    plafond, δ devient SOUS-linéaire (le congé cesse de grandir près du nez et
//    de l'arête de fuite) — c'est le comportement voulu. On vérifie donc la
//    croissance monotone, la sous-linéarité, et le budget du brevet.
{
    const nz = sweep.filter(r => r >= 1);
    const deltas = nz.map(R => results.get(R).rep.delta);
    let monotone = true;
    for (let i = 1; i < deltas.length; i++) if (deltas[i] < deltas[i - 1]) monotone = false;
    check('δ croît avec ρ', monotone, deltas.map(v => v.toFixed(4)).join(' < '));

    const ratios = nz.map((R, i) => deltas[i] / R);
    let subLinear = true;
    for (let i = 1; i < ratios.length; i++) if (ratios[i] > ratios[i - 1] + 1e-9) subLinear = false;
    check('δ/ρ décroît (effet du plafond local)', subLinear,
        `δ/ρ = ${ratios.map(v => v.toFixed(4)).join(', ')} mm/mm`);

    for (const R of nz) {
        const rep = results.get(R).rep;
        check(`ρ=${R} : δ ≤ λ₂/4 à 16 kHz`, rep.delta <= budget16k,
            `δ = ${rep.delta.toFixed(4)} mm, ${(rep.delta / budget16k * 100).toFixed(1)} % du budget`);
    }
}

// =======================================================
// 4. Bande de fonctionnement déduite du brevet
// =======================================================
console.log('\n=== 4. Bande de fonctionnement (5 conditions, col. 5 l. 10-24) ===');
{
    const R = Math.min(3, rhoMax);
    const { built, rep } = results.get(R) ?? { built: generateDosc({ ...CASE, filletRadius: R }) };
    const report = rep ?? computeIsophaseReport(built, { azimuthSamples: 21 });
    const { band, lines } = checkPatentConditions(built.params, report);
    for (const l of lines) console.log(`  ${l.ok ? 'OK ' : '!! '} ${l.text}`);
    console.log(`  ⟹ bande utile : ${Math.round(band.f1)} Hz … ${Math.round(band.f2)} Hz`);
    console.log(`     (f₂ limitée par : ${band.f2Limiter})`);
    check('la bande utile est non vide', band.usable, `f₁=${Math.round(band.f1)} f₂=${Math.round(band.f2)}`);
    // Sur l'exemple du brevet, la bande doit tomber dans le domaine annoncé
    // (« improves […] with frequencies having a wavelength less than
    // approximately 15 centimeters », soit f > ~2,3 kHz).
    if (CASE.mouthHeight === 220 && CASE.mouthWidth === 30) {
        check('exemple brevet : f₁ dans 1–2 kHz', band.f1 > 1000 && band.f1 < 2500,
            `f₁ = ${Math.round(band.f1)} Hz`);
        check('exemple brevet : f₂ > 10 kHz', band.f2 > 10000, `f₂ = ${Math.round(band.f2)} Hz`);
    }
}

// =======================================================
// 5. Intégrité géométrique du maillage
// =======================================================
console.log('\n=== 5. Intégrité géométrique du maillage ===');
{
    const R = Math.min(3, rhoMax);
    const built = results.get(R)?.built ?? generateDosc({ ...CASE, filletRadius: R });
    const { housing, body, params, zBodyStart, edgeThickness } = built;

    console.log(`  carter : ${housing.numSlices} tranches × ${housing.numLines} pts`);
    console.log(`  corps  : ${body.numSlices} tranches × ${body.numLines} pts  (démarre à z=${zBodyStart.toFixed(2)} mm)`);

    const ringStats = (stack, name) => {
        let minR = Infinity, maxR = 0, degenerate = 0, nonMonotonic = 0;
        let prevZ = -Infinity;
        for (let s = 0; s < stack.numSlices; s++) {
            const z = stack.vertices[s * stack.numLines * 3 + 2];
            if (z <= prevZ) nonMonotonic++;
            prevZ = z;
            let rMin = Infinity, rMax = 0;
            for (let j = 0; j < stack.numLines; j++) {
                const k = (s * stack.numLines + j) * 3;
                const r = Math.hypot(stack.vertices[k], stack.vertices[k + 1]);
                rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
            }
            if (rMin < 1e-6) degenerate++;
            minR = Math.min(minR, rMin); maxR = Math.max(maxR, rMax);
        }
        check(`${name} : aucun anneau dégénéré`, degenerate === 0, `${degenerate} anneau(x) de rayon nul`);
        check(`${name} : stations axiales strictement croissantes`, nonMonotonic === 0);
        console.log(`     rayons ${name} : ${minR.toFixed(3)} … ${maxR.toFixed(2)} mm`);
    };
    ringStats(housing, 'carter');
    ringStats(body, 'corps ');

    // -- Non-interpénétration : le corps doit rester dans le carter.
    let minGap = Infinity, minGapAt = null;
    for (let s = 0; s < body.numSlices; s++) {
        for (let j = 0; j < body.numLines; j++) {
            const k = (s * body.numLines + j) * 3;
            const x = body.vertices[k], y = body.vertices[k + 1], z = body.vertices[k + 2];
            const phi = Math.atan2(y, x);
            const gap = sheetRadius(built.sheets.housing, z, phi, R) - Math.hypot(x, y);
            if (gap < minGap) { minGap = gap; minGapAt = { z, phiDeg: (phi * 180 / Math.PI).toFixed(0) }; }
        }
    }
    check('corps strictement à l\'intérieur du carter', minGap > 0.1,
        `jeu radial mini ${minGap.toFixed(2)} mm @ z=${minGapAt?.z.toFixed(1)} φ=${minGapAt?.phiDeg}°`);
    console.log(`     jeu radial mini carter↔corps : ${minGap.toFixed(2)} mm`);
    console.log(`     (jeux normaux théoriques : cône ${params.gapConical.toFixed(2)} / biseau ${params.gapBevel.toFixed(2)} mm)`);

    // -- Sections convexes : garantit un loft OCC propre et un contour étoilé,
    //    donc la compatibilité avec le ré-échantillonnage angulaire du pipeline.
    const worstConcavity = (stack) => {
        let worst = 0;
        for (let s = 0; s < stack.numSlices; s++) {
            for (let j = 0; j < stack.numLines; j++) {
                const i0 = (s * stack.numLines + ((j - 1 + stack.numLines) % stack.numLines)) * 3;
                const i1 = (s * stack.numLines + j) * 3;
                const i2 = (s * stack.numLines + ((j + 1) % stack.numLines)) * 3;
                const ax = stack.vertices[i1] - stack.vertices[i0], ay = stack.vertices[i1 + 1] - stack.vertices[i0 + 1];
                const bx = stack.vertices[i2] - stack.vertices[i1], by = stack.vertices[i2 + 1] - stack.vertices[i1 + 1];
                const cross = ax * by - ay * bx;
                const scale = (Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1;
                worst = Math.min(worst, cross / scale);
            }
        }
        return worst;
    };
    check('carter : sections convexes', worstConcavity(housing) > -1e-3,
        `min ${worstConcavity(housing).toExponential(2)}`);
    check('corps  : sections convexes', worstConcavity(body) > -1e-3,
        `min ${worstConcavity(body).toExponential(2)}`);

    // -- Régularité de l'échantillonnage angulaire. Garde-fou contre un retour
    //    à un pas angulaire constant : sur la lame de fuite du corps (~0,4 mm
    //    d'épaisseur pour 181 mm de haut) cela produisait un rapport
    //    d'aspect > 1000 entre la plus grande et la plus petite arête du même
    //    anneau. L'échantillonnage à abscisse curviligne doit rester sous 20.
    const worstRingAspect = (stack, name) => {
        let worst = 0, worstSlice = -1;
        for (let s = 0; s < stack.numSlices; s++) {
            let lo = Infinity, hi = 0;
            for (let j = 0; j < stack.numLines; j++) {
                const a = (s * stack.numLines + j) * 3;
                const b = (s * stack.numLines + ((j + 1) % stack.numLines)) * 3;
                const d = Math.hypot(stack.vertices[b] - stack.vertices[a],
                    stack.vertices[b + 1] - stack.vertices[a + 1]);
                lo = Math.min(lo, d); hi = Math.max(hi, d);
            }
            const ratio = lo > 1e-12 ? hi / lo : Infinity;
            if (ratio > worst) { worst = ratio; worstSlice = s; }
        }
        check(`${name} : anneaux régulièrement échantillonnés (aspect < 20)`, worst < 20,
            `pire rapport ${worst.toFixed(1)} sur la tranche ${worstSlice}/${stack.numSlices}`);
    };
    worstRingAspect(housing, 'carter');
    worstRingAspect(body, 'corps ');

    // -- Critère intrinsèque d'isophasicité : |n_z| = sin α partout HORS bande
    //    de congé. La bande est repérée exactement comme dans le champ : les
    //    deux distances sont simultanément sous ρ.
    //    Exception documentée : le méplat d'arête de fuite du corps (§3), où la
    //    paroi est volontairement axiale sur edgeThickness/(2 tanα).
    const nzReport = (sheet, name, zFrom, zTo) => {
        let inBand = 0, total = 0, worstOut = 0, worstAt = null;
        for (let s = 1; s < 80; s++) {
            const z = zFrom + ((zTo - zFrom) * s) / 80;
            for (let k = 0; k < 25; k++) {
                const phi = (Math.PI / 2) * (k / 24);
                const r = sheetRadius(sheet, z, phi, R);
                if (!(r > 1e-6)) continue;
                total++;
                const absCosPhi = Math.abs(Math.cos(phi));
                // Le rayon effectif est plafonné par la cote locale : c'est lui
                // qui délimite la bande influencée par le congé.
                const rho = effectiveFilletRadius(sheet, z, R);
                const a = (sheet.R(z) - r) * sheet.cosAlpha;
                const b = (sheet.X(z) - r * absCosPhi) * sheet.cosAlpha;
                if (rho > 0 && a < rho && b < rho) { inBand++; continue; }
                const n = surfaceNormal(sheet, r * Math.cos(phi), r * Math.sin(phi), z, R);
                const dev = Math.abs(Math.abs(n.z) - params.sinAlpha);
                if (dev > worstOut) { worstOut = dev; worstAt = { z, phiDeg: (phi * 180 / Math.PI).toFixed(0) }; }
            }
        }
        check(`${name} : |n_z| = sin α hors bande de congé`, worstOut < 1e-6,
            `écart max ${worstOut.toExponential(2)} @ z=${worstAt?.z.toFixed(1)} φ=${worstAt?.phiDeg}°` +
            ` · ${inBand}/${total} échantillons dans la bande`);
    };
    nzReport(built.sheets.housing, 'carter', 0.5, params.depth - 0.5);
    // Le corps est testé jusqu'au début du méplat d'arête de fuite.
    const zEdgeFlat = params.depth - edgeThickness / (2 * params.tanAlpha);
    nzReport(built.sheets.body, 'corps ', zBodyStart + 0.5, zEdgeFlat - 0.5);
    console.log(`     méplat d'arête de fuite du corps : z ${zEdgeFlat.toFixed(2)} → ${params.depth} mm ` +
        `(${(params.depth - zEdgeFlat).toFixed(2)} mm, exclu du test — cf. §3 du générateur)`);
}

// =======================================================
// 6. Rejet des entrées invalides
// =======================================================
console.log('\n=== 6. Rejet des entrées invalides ===');
{
    const bad = [
        [{ throatDiameter: 35, mouthWidth: 30, mouthHeight: 30, depth: 244 }, 'L ≤ O'],
        [{ throatDiameter: 35, mouthWidth: 300, mouthHeight: 220, depth: 244 }, 'i ≥ L'],
        [{ throatDiameter: 35, mouthWidth: 30, mouthHeight: 220, depth: 0 }, 'D = 0'],
        [{ throatDiameter: 0, mouthWidth: 30, mouthHeight: 220, depth: 244 }, 'O = 0'],
        [{ throatDiameter: 200, mouthWidth: 5, mouthHeight: 220, depth: 244 }, '|i-O| ≥ L-O'],
    ];
    for (const [input, label] of bad) {
        const r = deriveDoscParams(input);
        check(`rejette « ${label} »`, r.ok === false, r.ok ? 'accepté à tort' : r.error.slice(0, 66));
    }
    // Et un cas limite qui DOIT passer : guide court et large.
    const okCase = { throatDiameter: 25.4, mouthWidth: 20, mouthHeight: 120, depth: 90 };
    const g = generateDosc({ ...okCase, numLines: 60, axialPoints: 60, filletRadius: 2 });
    check('accepte un guide court/large', g.ok === true, g.ok ? `α=${g.params.alphaDeg.toFixed(1)}°` : g.error);
}

// =======================================================
// STL facultatif (inspection visuelle)
// =======================================================
if (flag('--stl')) {
    console.log('\n=== STL ===');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const R = Math.min(3, rhoMax);
    const built = generateDosc({ ...CASE, filletRadius: R });
    for (const [name, stack] of [['housing', built.housing], ['body', built.body]]) {
        const file = path.join(OUT_DIR, `dosc_${name}.stl`);
        fs.writeFileSync(file, stackToStl(stack, `dosc_${name}`));
        console.log(`  écrit ${path.relative(process.cwd(), file)}`);
    }
    const sharp = generateDosc({ ...CASE, filletRadius: 0 });
    fs.writeFileSync(path.join(OUT_DIR, 'dosc_housing_sharp.stl'), stackToStl(sharp.housing, 'sharp'));
    console.log('  écrit scripts/out/dosc_housing_sharp.stl (comparaison vif / congé)');
}

console.log(`\n=== RÉSULTAT : ${failures === 0 ? 'TOUS LES TESTS PASSENT' : failures + ' ÉCHEC(S)'} ===\n`);
process.exit(failures === 0 ? 0 : 1);

// -------------------------------------------------------
/** STL ASCII d'un empilement d'anneaux (bandes de quads triangulés). */
function stackToStl(stack, name) {
    const { numLines: N, numSlices: S, vertices: V } = stack;
    const P = (s, j) => { const k = (s * N + j) * 3; return [V[k], V[k + 1], V[k + 2]]; };
    const out = [`solid ${name}`];
    const tri = (a, b, c) => {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const n = Math.hypot(nx, ny, nz) || 1;
        out.push(`facet normal ${nx / n} ${ny / n} ${nz / n}`, '  outer loop',
            `    vertex ${a[0]} ${a[1]} ${a[2]}`,
            `    vertex ${b[0]} ${b[1]} ${b[2]}`,
            `    vertex ${c[0]} ${c[1]} ${c[2]}`,
            '  endloop', 'endfacet');
    };
    for (let s = 0; s < S - 1; s++) {
        for (let j = 0; j < N; j++) {
            const jn = (j + 1) % N;
            tri(P(s, j), P(s + 1, j), P(s + 1, jn));
            tri(P(s, j), P(s + 1, jn), P(s, jn));
        }
    }
    out.push(`endsolid ${name}`);
    return out.join('\n');
}
