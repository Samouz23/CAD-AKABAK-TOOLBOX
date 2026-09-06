// =======================================================
// FICHIER :  scripts/bem_validate.mjs
// RÔLE    :  Validation du solveur BEM couplé contre des solutions
//            analytiques exactes.
//
//   Run: node scripts/bem_validate.mjs
//
//  Ces tests sont ce qui verrouille les signes et les facteurs d'échelle de la
//  formulation. Ils assertent le MODULE ET LA PHASE : un test de module seul
//  laisse passer une inversion de signe globale, qui ne se manifeste qu'au
//  moment où on superpose deux sources.
//
//  Étage 1 — piston circulaire plan dans un baffle infini. Teste le bloc de
//            Rayleigh isolément : doublement du noyau, signe de Z, phase.
//  Étage 2 — conduit cylindrique rigide fermé. Teste le bloc intérieur seul :
//            Re(Z_in) doit être nul, donc tout Re calculé est de l'erreur pure.
//  Étage 3 — conduit cylindrique débouchant dans le baffle. Teste la chaîne
//            couplée complète contre l'impédance d'entrée 1-D exacte.
//  Étage 4 — bilan d'énergie. Détecte à lui seul toute erreur de signe.
// =======================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const S = require(path.join(here, '..', 'src', 'js', 'bem', 'bemShared.js'));

const { C_AIR, RHO_AIR } = S;
const RHOC = RHO_AIR * C_AIR;

// =======================================================
// Fonctions spéciales — implémentées ICI, indépendamment du code testé.
// Valider le solveur contre les séries de bemCore.js validerait le code
// contre lui-même.
// =======================================================

/** J1(x) par sa série entière. Convergence excellente jusqu'à x ~ 12. */
function besselJ1(x) {
  const h = x / 2;
  let term = 1, sum = 1;
  const q = -h * h;
  for (let m = 1; m < 60; m++) {
    // term_m = q^m / (m! (m+1)!)
    term *= q / (m * (m + 1));
    sum += term;
    if (Math.abs(term) < 1e-18 * Math.abs(sum)) break;
  }
  return h * sum;
}

/** Gamma via Lanczos — seulement pour les demi-entiers de la série de Struve. */
function gammaFn(z) {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  z -= 1;
  let a = 0.99999999999980993;
  const t = z + 7.5;
  for (let i = 0; i < g.length; i++) a += g[i] / (z + i + 1);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a;
}

/**
 * Fonction de Struve H1 :
 *   H_1(z) = (z/2)^2 · sum_k (-1)^k (z/2)^{2k} / [Gamma(k+3/2)·Gamma(k+5/2)]
 * Vérification petit argument : H_1(z) -> 2z^2/(3·pi), donc
 * X1(w) = 2H_1(w)/w -> 4w/(3·pi), soit 8ka/(3·pi) avec w = 2ka.
 */
function struveH1(z) {
  const h = z / 2;
  const h2 = h * h;
  let sum = 0, pow = 1;
  for (let k = 0; k < 80; k++) {
    const term = ((k % 2 === 0) ? 1 : -1) * pow / (gammaFn(k + 1.5) * gammaFn(k + 2.5));
    sum += term;
    if (Math.abs(term) < 1e-18 * Math.abs(sum) && k > 3) break;
    pow *= h2;
  }
  return h2 * sum;
}

/** Impédance de rayonnement d'un piston bafflé, convention e^{-i·omega·t}. */
function pistonR1(w) { return 1 - 2 * besselJ1(w) / w; }
function pistonX1(w) { return 2 * struveH1(w) / w; }

// =======================================================
// Générateurs de maillages de test
// =======================================================

function triNormalArea(v0, v1, v2) {
  const e1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
  const e2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
  const n = [
    e1[1]*e2[2] - e1[2]*e2[1],
    e1[2]*e2[0] - e1[0]*e2[2],
    e1[0]*e2[1] - e1[1]*e2[0],
  ];
  const len = Math.hypot(n[0], n[1], n[2]);
  return { normal: [n[0]/len, n[1]/len, n[2]/len], area: len / 2 };
}

function makeElement(v0, v1, v2, role) {
  const { normal, area } = triNormalArea(v0, v1, v2);
  return {
    centroid: [(v0[0]+v1[0]+v2[0])/3, (v0[1]+v1[1]+v2[1])/3, (v0[2]+v1[2]+v2[2])/3],
    normal, area, v0, v1, v2, role, surfaceName: role,
  };
}

/**
 * Disque plan triangulé en z = z0, normales +Z.
 * Les rayons sont corrigés d'un facteur sqrt(2·pi/(n·sin(2·pi/n))) pour que
 * l'aire du polygone égale exactement pi·a² : sinon le déficit O(1/n²) biaise
 * directement la normalisation de l'impédance.
 */
function makeDisc(a, h, z0 = 0, role = 'interface') {
  const n = Math.max(12, Math.round(2 * Math.PI * a / h));
  const nr = Math.max(3, Math.round(a / h));
  const areaFix = Math.sqrt(2 * Math.PI / (n * Math.sin(2 * Math.PI / n)));
  const aa = a * areaFix;

  const ring = (i) => {
    const r = aa * i / nr;
    const pts = [];
    for (let j = 0; j < n; j++) {
      const t = 2 * Math.PI * j / n;
      pts.push([r * Math.cos(t), r * Math.sin(t), z0]);
    }
    return pts;
  };

  const rings = [];
  for (let i = 1; i <= nr; i++) rings.push(ring(i));
  const center = [0, 0, z0];
  const els = [];

  // Couronne centrale : éventail depuis le centre.
  for (let j = 0; j < n; j++) {
    const p1 = rings[0][j], p2 = rings[0][(j + 1) % n];
    els.push(makeElement(center, p1, p2, role));
  }
  // Couronnes suivantes : deux triangles par quadrilatère.
  for (let i = 1; i < nr; i++) {
    for (let j = 0; j < n; j++) {
      const jn = (j + 1) % n;
      const a0 = rings[i-1][j], a1 = rings[i-1][jn];
      const b0 = rings[i][j],   b1 = rings[i][jn];
      els.push(makeElement(a0, b0, b1, role));
      els.push(makeElement(a0, b1, a1, role));
    }
  }
  return els;
}

/**
 * Conduit cylindrique fermé : cap au throat (z = -L, normale -Z), paroi
 * latérale (normales radiales sortantes), et cap à la bouche en z = 0
 * (normale +Z) dont le rôle est paramétrable — 'interface' pour un conduit
 * rayonnant, 'wall' pour un conduit rigide fermé.
 */
function makeDuct(a, L, h, mouthRole) {
  const n = Math.max(12, Math.round(2 * Math.PI * a / h));
  const nz = Math.max(3, Math.round(L / h));
  const areaFix = Math.sqrt(2 * Math.PI / (n * Math.sin(2 * Math.PI / n)));
  const aa = a * areaFix;
  const els = [];

  const ringAt = (z) => {
    const pts = [];
    for (let j = 0; j < n; j++) {
      const t = 2 * Math.PI * j / n;
      pts.push([aa * Math.cos(t), aa * Math.sin(t), z]);
    }
    return pts;
  };

  // Paroi latérale, normales sortant du domaine acoustique (radialement).
  for (let i = 0; i < nz; i++) {
    const z0 = -L + L * i / nz;
    const z1 = -L + L * (i + 1) / nz;
    const r0 = ringAt(z0), r1 = ringAt(z1);
    for (let j = 0; j < n; j++) {
      const jn = (j + 1) % n;
      els.push(makeElement(r0[j], r1[jn], r1[j], 'wall'));
      els.push(makeElement(r0[j], r0[jn], r1[jn], 'wall'));
    }
  }

  // Cap du throat en z = -L, normale -Z (donc sens horaire vu de +Z).
  const throatDisc = makeDisc(a, h, -L, 'source').map(el =>
    makeElement(el.v0, el.v2, el.v1, 'source'));

  // Cap de bouche en z = 0, normale +Z.
  const mouthDisc = makeDisc(a, h, 0, mouthRole);

  return els.concat(throatDisc, mouthDisc);
}

/** Emballe une liste d'éléments dans la structure attendue par le solveur. */
function wrapModel(elements, symmetry = 'none') {
  const indexByRole = { source: [], wall: [], interface: [] };
  for (let i = 0; i < elements.length; i++) indexByRole[elements[i].role].push(i);
  const mirrorCount = S.getMirrorTransforms(symmetry).length;
  const areaOf = role => indexByRole[role].reduce((s, i) => s + elements[i].area, 0);
  const maxEdge = S.maxEdgeLength(elements);
  return {
    elements, indexByRole, mirrorCount,
    sourceArea_m2: areaOf('source') * mirrorCount,
    apertureArea_m2: areaOf('interface') * mirrorCount,
    maxElementSize_m: maxEdge,
    maxElementSize_mm: maxEdge * 1000,
    elementCount: elements.length,
  };
}

// =======================================================
// Harnais d'assertions
// =======================================================
let passed = 0, failed = 0;
const failures = [];

function check(name, got, want, tolRel, unit = '') {
  const err = Math.abs(got - want) / Math.max(Math.abs(want), 1e-300);
  const ok = err <= tolRel;
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}: got ${fmt(got)}${unit}, want ${fmt(want)}${unit} (err ${(err*100).toFixed(2)}%, tol ${(tolRel*100).toFixed(1)}%)`;
  console.log('  ' + line);
  if (ok) passed++; else { failed++; failures.push(line); }
}

function checkAbs(name, got, want, tolAbs, unit = '') {
  const err = Math.abs(got - want);
  const ok = err <= tolAbs;
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}: got ${fmt(got)}${unit}, want ${fmt(want)}${unit} (err ${fmt(err)}, tol ${fmt(tolAbs)})`;
  console.log('  ' + line);
  if (ok) passed++; else { failed++; failures.push(line); }
}

function checkTrue(name, cond, detail = '') {
  const line = `${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`;
  console.log('  ' + line);
  if (cond) passed++; else { failed++; failures.push(line); }
}

function fmt(x) {
  if (!isFinite(x)) return String(x);
  if (x === 0) return '0';
  const m = Math.abs(x);
  return (m < 1e-3 || m >= 1e5) ? x.toExponential(4) : x.toFixed(5);
}

function wrapAngle(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// =======================================================
// ÉTAGE 0 — les fonctions spéciales elles-mêmes
// =======================================================
function tier0() {
  console.log('\n=== Tier 0: special functions (self-check) ===');
  // Valeurs de référence indépendantes.
  check('J1(0.548)', besselJ1(0.548), 0.2638431, 1e-5);
  check('J1(1.0)',   besselJ1(1.0),   0.4400506, 1e-6);
  // Valeurs tabulées standard, au-delà du premier zéro (3.8317) où J1 est négative.
  check('J1(5.0)',   besselJ1(5.0),  -0.3275791, 1e-5);
  check('J1(5.5)',   besselJ1(5.5),  -0.3414343, 1e-4);
  checkTrue('J1 first zero near 3.8317', Math.abs(besselJ1(3.8317)) < 1e-5,
    `J1(3.8317) = ${fmt(besselJ1(3.8317))}`);
  // X1 décroît en 4/(pi·w) aux grands arguments — contrôle indépendant de la
  // série de Struve loin du régime petit argument.
  check('X1(5.48) vs 4/(pi·w) asymptote', pistonX1(5.48), 4 / (Math.PI * 5.48), 0.02);
  // Limite petit argument de Struve : X1(w) -> 4w/(3·pi).
  const w = 0.01;
  check('X1 small-arg limit', pistonX1(w), 4 * w / (3 * Math.PI), 1e-4);
  check('R1 small-arg limit', pistonR1(0.02), (0.02 * 0.02) / 8, 2e-3);
  // Cohérence avec l'audit à w = 0.548.
  check('R1(0.548)', pistonR1(0.548), 0.037069, 1e-3);
  check('X1(0.548)', pistonX1(0.548), 0.227960, 1e-3);
}

// =======================================================
// ÉTAGE 1 — piston circulaire dans un baffle infini
// =======================================================
/**
 * Applique le bloc de Rayleigh du solveur : p_i = -2·i·k·sum_j G_ij u_j,
 * avec exactement les mêmes primitives (integrateG_sym / selfTermG_sym) que
 * l'assemblage réel — c'est le code de production qui est testé, pas une
 * reformulation.
 */
function rayleighPressureOnAperture(elements, k, u, mirrors) {
  const N = elements.length;
  const p = new Float64Array(2 * N);
  for (let i = 0; i < N; i++) {
    const xi = elements[i].centroid;
    let wRe = 0, wIm = 0;
    for (let j = 0; j < N; j++) {
      const g = (i === j)
        ? S.selfTermG_sym(k, elements[j], mirrors)
        : S.integrateG_sym(k, xi, elements[j], mirrors);
      const uRe = u[2*j], uIm = u[2*j+1];
      wRe += uRe * g.re - uIm * g.im;
      wIm += uRe * g.im + uIm * g.re;
    }
    p[2*i]   =  2 * k * wIm;
    p[2*i+1] = -2 * k * wRe;
  }
  return p;
}

function tier1() {
  const a = 0.15;
  const h = 0.015;
  const v0 = 1;
  const els = makeDisc(a, h, 0, 'interface');
  const model = wrapModel(els, 'none');
  const mirrors = S.getMirrorTransforms('none');
  const S_area = els.reduce((s, e) => s + e.area, 0);

  console.log(`\n=== Tier 1: baffled circular piston  (a=${a} m, h=${h*1000} mm, N=${els.length}) ===`);
  check('aperture area vs pi·a^2', S_area, Math.PI * a * a, 2e-3, ' m2');
  const worstNz = Math.min(...els.map(e => e.normal[2]));
  checkTrue('all disc normals +Z', worstNz > 0.999999, `worst nz = ${worstNz.toFixed(8)}`);

  for (const freq of [100, 1000]) {
    const k = 2 * Math.PI * freq / C_AIR;
    const ka = k * a;
    const w = 2 * ka;
    console.log(`\n  -- f = ${freq} Hz   (k=${k.toFixed(3)}, ka=${ka.toFixed(4)}, w=${w.toFixed(4)}) --`);

    // u = rho·c·v_n, v_n = v0 selon la normale +Z.
    const u = new Float64Array(2 * els.length);
    for (let j = 0; j < els.length; j++) { u[2*j] = RHOC * v0; u[2*j+1] = 0; }

    const p = rayleighPressureOnAperture(els, k, u, mirrors);

    // Z_mech/(rho·c·S) = <p>/(rho·c·v0)
    let fRe = 0, fIm = 0;
    for (let j = 0; j < els.length; j++) { fRe += p[2*j] * els[j].area; fIm += p[2*j+1] * els[j].area; }
    const zRe = fRe / (S_area * RHOC * v0);
    const zIm = fIm / (S_area * RHOC * v0);

    const wantR1 = pistonR1(w);
    const wantX1 = pistonX1(w);
    checkTrue('Re(Z_rad) > 0  [radiation resistance sign]', zRe > 0, `Re = ${fmt(zRe)}`);
    checkTrue('Im(Z_rad) < 0  [mass-like reactance sign]', zIm < 0, `Im = ${fmt(zIm)}`);
    check('Z_rad real part / (rho·c·S)', zRe, wantR1, freq === 100 ? 0.05 : 0.03);
    check('Z_rad imag part / (rho·c·S)', zIm, -wantX1, 0.05);

    // Pression sur l'axe : exacte, sans approximation.
    //   p(0,0,z) = rho·c·v0·[ e^{ikz} - e^{ik·sqrt(a^2+z^2)} ]
    const sol = { u, ifIdx: els.map((_, i) => i), k, uCol: null };
    for (const z of [0.2, 1.0, 2.0]) {
      const got = S.coupledFieldPressure([0, 0, z], model, sol, mirrors, 0, { farField: false });
      const d = Math.sqrt(a * a + z * z);
      const exRe = RHOC * v0 * (Math.cos(k * z) - Math.cos(k * d));
      const exIm = RHOC * v0 * (Math.sin(k * z) - Math.sin(k * d));
      const gotMag = Math.hypot(got.re, got.im);
      const exMag = Math.hypot(exRe, exIm);
      check(`|p| on axis z=${z} m`, gotMag, exMag, 0.03, ' Pa');
      const dPhase = wrapAngle((Math.atan2(got.im, got.re) - Math.atan2(exIm, exRe)) * 180 / Math.PI);
      checkAbs(`arg p on axis z=${z} m`, dPhase, 0, 3, ' deg');
    }

    // Directivité far-field : |2·J1(ka·sin t)/(ka·sin t)|
    const dObs = 8;
    const onAxis = S.coupledFieldPressure([0, 0, dObs], model, sol, mirrors, 0, { farField: true });
    const onAxisMag = Math.hypot(onAxis.re, onAxis.im);
    for (const deg of [10, 20, 30, 40]) {
      const t = deg * Math.PI / 180;
      const pt = [dObs * Math.sin(t), 0, dObs * Math.cos(t)];
      const pv = S.coupledFieldPressure(pt, model, sol, mirrors, 0, { farField: true });
      const gotDb = 20 * Math.log10(Math.hypot(pv.re, pv.im) / onAxisMag);
      const uu = ka * Math.sin(t);
      const wantDb = 20 * Math.log10(Math.abs(2 * besselJ1(uu) / uu));
      checkAbs(`directivity ${deg} deg`, gotDb, wantDb, 0.35, ' dB');
    }

    // Aucun rayonnement arrière avec un baffle infini rigide.
    const back = S.coupledFieldPressure([0, 0, -dObs], model, sol, mirrors, 0, { farField: true });
    checkTrue('no rear radiation (hemisphere clamp)', back.re === 0 && back.im === 0);
  }
}

// =======================================================
// ÉTAGE 2 — chaîne couplée complète : conduit cylindrique droit
//           débouchant dans le baffle infini.
//
// Référence 1-D exacte, écrite sous forme cos/sin pour rester stable en
// kL = pi/2 où tan diverge :
//
//   Z_in/Z0 = (zeta_L·cos kL - i·sin kL) / (cos kL - i·zeta_L·sin kL)
//   zeta_L  = R1(2ka) - i·X1(2ka)
//
// Le « -i·sin » (au lieu du « +j·tan » des manuels) est le conjugué : le module
// est invariant par conjugaison, donc SEUL le test de phase discrimine la
// convention. C'est pour cela qu'il est asserté.
// =======================================================
function ductInputImpedanceRatio(k, a, L) {
  const w = 2 * k * a;
  const zLr = pistonR1(w), zLi = -pistonX1(w);
  const c = Math.cos(k * L), s = Math.sin(k * L);
  // numérateur = zeta_L·c - i·s
  const nRe = zLr * c,          nIm = zLi * c - s;
  // dénominateur = c - i·zeta_L·s  =  (c + zLi·s) - i·(zLr·s)
  const dRe = c + zLi * s,      dIm = -zLr * s;
  const den = dRe * dRe + dIm * dIm;
  return {
    re: (nRe * dRe + nIm * dIm) / den,
    im: (nIm * dRe - nRe * dIm) / den,
  };
}

/** Résout le conduit et renvoie l'impédance d'entrée normalisée + le bilan. */
function solveDuct(a, L, h, freq, v0) {
  const els = makeDuct(a, L, h, 'interface');
  const model = wrapModel(els, 'none');
  const prep = S.prepareCoupledModel(model, 'none');
  const sol = S.solveCoupledBEM(freq, model, prep, { velocity: v0 });
  let fRe = 0, fIm = 0, sArea = 0;
  for (const j of sol.thrIdx) {
    fRe += sol.pressure[2*j] * els[j].area;
    fIm += sol.pressure[2*j+1] * els[j].area;
    sArea += els[j].area;
  }
  return {
    els, model, prep, sol,
    zRe: fRe / (sArea * RHOC * v0),
    zIm: fIm / (sArea * RHOC * v0),
    balance: S.coupledPowerBalance(model, sol, v0),
  };
}

function tier2() {
  // h = 15 mm : exactement le Mesh Max utilisé en production.
  const a = 0.05, L = 0.30, h = 0.015, v0 = 1;
  const els = makeDuct(a, L, h, 'interface');
  const model = wrapModel(els, 'none');
  const Nif = model.indexByRole.interface.length;

  console.log(`\n=== Tier 2: straight duct into infinite baffle  (a=${a} m, L=${L} m, h=${h*1000} mm) ===`);
  console.log(`  N = ${els.length}  (walls ${model.indexByRole.wall.length}, throat ${model.indexByRole.source.length}, aperture ${Nif}) -> Nt = ${els.length + Nif}`);

  // --- orientations, avant tout calcul ---
  let worstWallRadial = 1, worstMouth = 1, worstThroat = 1;
  for (const el of els) {
    if (el.role === 'wall') {
      const r = Math.hypot(el.centroid[0], el.centroid[1]);
      worstWallRadial = Math.min(worstWallRadial,
        (el.centroid[0]*el.normal[0] + el.centroid[1]*el.normal[1]) / r);
    }
    if (el.role === 'interface') worstMouth = Math.min(worstMouth, el.normal[2]);
    if (el.role === 'source') worstThroat = Math.min(worstThroat, -el.normal[2]);
  }
  checkTrue('duct wall normals point outward radially', worstWallRadial > 0.99, `worst n·rhat = ${fmt(worstWallRadial)}`);
  checkTrue('mouth normals +Z', worstMouth > 0.9999, `worst nz = ${fmt(worstMouth)}`);
  checkTrue('throat normals -Z', worstThroat > 0.9999, `worst -nz = ${fmt(worstThroat)}`);

  // --- vérifications de maillage du solveur ---
  const sanity = S.checkMeshSanity(model, 'none');
  checkTrue('checkMeshSanity reports no problem', sanity.problems.length === 0,
    sanity.problems.join(' | ') || 'clean');
  check('enclosed volume vs pi·a^2·L', sanity.vol, Math.PI * a * a * L, 0.02, ' m3');
  checkAbs('aperture plane z', sanity.zBaffle, 0, 1e-9, ' m');

  // --- somme statique des lignes de la double couche ---
  const prep = S.prepareCoupledModel(model, 'none');
  checkTrue('static H row-sum identity holds before correction',
    prep.worstRowSumError < 0.05,
    `worst |1/2 + sum H| = ${fmt(prep.worstRowSumError)}`);

  // kL = pi/2 -> c/4L ;  kL = pi -> c/2L
  // kL = pi/2 est le pic quart d'onde : Z_in s'y lit en 1/zeta_L, donc l'erreur
  // relative du pic vaut l'erreur relative sur R1 (ici 0.034, petit) — c'est le
  // point le plus exigeant de la suite, d'où la tolérance un peu plus large.
  const cases = [
    { name: 'kL = pi/2', freq: C_AIR / (4 * L), tolMag: 0.04, tolPhase: 2, tolPower: 0.055 },
    { name: 'kL = pi',   freq: C_AIR / (2 * L), tolMag: 0.06, tolPhase: 2, tolPower: 0.055 },
  ];

  for (const cs of cases) {
    const freq = cs.freq;
    const k = 2 * Math.PI * freq / C_AIR;
    console.log(`\n  -- ${cs.name}:  f = ${freq.toFixed(1)} Hz, ka = ${(k*a).toFixed(4)} --`);

    const sol = S.solveCoupledBEM(freq, model, prep, { velocity: v0 });

    // Impédance d'entrée normalisée : <p>_throat / (rho·c·v0)
    let fRe = 0, fIm = 0, sArea = 0;
    for (const j of sol.thrIdx) {
      fRe += sol.pressure[2*j] * els[j].area;
      fIm += sol.pressure[2*j+1] * els[j].area;
      sArea += els[j].area;
    }
    const gotRe = fRe / (sArea * RHOC * v0);
    const gotIm = fIm / (sArea * RHOC * v0);
    const want = ductInputImpedanceRatio(k, a, L);

    const gotMag = Math.hypot(gotRe, gotIm), wantMag = Math.hypot(want.re, want.im);
    check(`|Z_in|/Z0`, gotMag, wantMag, cs.tolMag);
    const dPhase = wrapAngle((Math.atan2(gotIm, gotRe) - Math.atan2(want.im, want.re)) * 180 / Math.PI);
    checkAbs(`arg Z_in`, dPhase, 0, cs.tolPhase, ' deg');
    checkTrue(`Re(Z_in) > 0  [passive load]`, gotRe > 0, `Re = ${fmt(gotRe)}`);

    // --- ÉTAGE 4 : bilan d'énergie. Parois rigides sans perte, donc toute la
    //     puissance injectée au throat doit sortir par l'ouverture.
    const bal = S.coupledPowerBalance(model, sol, v0);
    checkTrue('W_in > 0  [interior RHS sign]', bal.wIn > 0, `W_in = ${fmt(bal.wIn)} W`);
    checkTrue('W_aperture > 0  [Z_ij sign]', bal.wAp > 0, `W_ap = ${fmt(bal.wAp)} W`);
    checkAbs('power balance mismatch', bal.mismatch, 0, cs.tolPower);
  }

  // --- convergence en maillage ---
  // P0 en collocation est O(h) et le couplage n'est pas exactement conservatif
  // au niveau discret : l'écart de bilan doit donc DÉCROÎTRE quand on raffine.
  // Cette assertion vaut mieux qu'une tolérance absolue — elle distingue une
  // erreur de discrétisation (qui converge) d'une erreur de formulation
  // (qui plafonne).
  console.log('\n  -- mesh convergence at the quarter-wave peak --');
  const fPeak = C_AIR / (4 * L);
  const coarse = solveDuct(a, L, 0.025, fPeak, v0);
  const fine = { balance: null, zRe: null, zIm: null };
  {
    const solFine = solveDuct(a, L, 0.015, fPeak, v0);
    fine.balance = solFine.balance; fine.zRe = solFine.zRe; fine.zIm = solFine.zIm;
  }
  const want = ductInputImpedanceRatio(2 * Math.PI * fPeak / C_AIR, a, L);
  const wantMag = Math.hypot(want.re, want.im);
  const errCoarse = Math.abs(Math.hypot(coarse.zRe, coarse.zIm) - wantMag) / wantMag;
  const errFine = Math.abs(Math.hypot(fine.zRe, fine.zIm) - wantMag) / wantMag;
  console.log(`     h=25mm: |Z_in| err ${(errCoarse*100).toFixed(2)}%, power mismatch ${(coarse.balance.mismatch*100).toFixed(2)}%`);
  console.log(`     h=15mm: |Z_in| err ${(errFine*100).toFixed(2)}%, power mismatch ${(fine.balance.mismatch*100).toFixed(2)}%`);
  checkTrue('|Z_in| error decreases under refinement', errFine < errCoarse,
    `${(errCoarse*100).toFixed(2)}% -> ${(errFine*100).toFixed(2)}%`);
  checkTrue('power mismatch decreases under refinement', fine.balance.mismatch < coarse.balance.mismatch,
    `${(coarse.balance.mismatch*100).toFixed(2)}% -> ${(fine.balance.mismatch*100).toFixed(2)}%`);
}

// =======================================================
// ÉTAGE 3 — garde-fous : le solveur doit refuser proprement les cas
//           dégénérés au lieu de rendre des chiffres arbitraires.
// =======================================================
function tier3() {
  console.log('\n=== Tier 3: guard rails ===');

  const a = 0.05, L = 0.20, h = 0.03;

  // Cavité entièrement rigide : aucun élément d'interface. Le système est
  // singulier aux résonances de cavité — le solveur doit refuser, pas deviner.
  const rigid = wrapModel(makeDuct(a, L, h, 'wall'), 'none');
  let threw = null;
  try {
    S.solveCoupledBEM(500, rigid, { freeTerms: new Float64Array(rigid.elements.length), mirrors: S.getMirrorTransforms('none'), symmetry: 'none' }, {});
  } catch (e) { threw = e.message; }
  checkTrue('fully rigid cavity is rejected', !!threw && /interface/i.test(threw), threw || 'no throw');

  // Plancher fréquentiel : le système dégénère quand k -> 0.
  const duct = wrapModel(makeDuct(a, L, h, 'interface'), 'none');
  const prep = { freeTerms: new Float64Array(duct.elements.length), mirrors: S.getMirrorTransforms('none'), symmetry: 'none' };
  let threwLow = null;
  try { S.solveCoupledBEM(5, duct, prep, {}); } catch (e) { threwLow = e.message; }
  checkTrue('sub-20 Hz request is rejected', !!threwLow && /20 Hz/.test(threwLow), threwLow || 'no throw');

  // classifyMshSurfaces doit refuser un maillage sans piston ni ouverture —
  // c'est exactement ce que produit l'export quand Show Interface est décoché.
  const hornOnly = [{ tag: 1, name: 'horn_surface', triangles: [{ v0: [0,0,0], v1: [1,0,0], v2: [0,1,0] }] }];
  let threwCls = null;
  try { S.classifyMshSurfaces(hornOnly); } catch (e) { threwCls = e.message; }
  checkTrue('horn_surface-only mesh is rejected', !!threwCls && /throat_cap/.test(threwCls), threwCls || 'no throw');
}

// =======================================================
// MAIN
// =======================================================
tier0();
tier1();
tier2();
tier3();

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
if (failed) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  ' + f);
  process.exitCode = 1;
}
