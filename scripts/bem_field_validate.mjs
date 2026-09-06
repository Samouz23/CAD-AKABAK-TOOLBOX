// =======================================================
// scripts/bem_field_validate.mjs
//
// Valide les nappes d'observation ("Field") de bout en bout : la géométrie du
// panneau (fieldGeometry.js, en mm) traverse le worker (bemDomainWorker.js,
// conversion mm → m puis évaluation Galerkin) et doit reproduire la
// directivité analytique du piston circulaire bafflé.
//
// Usage : node scripts/bem_field_validate.mjs
// =======================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const { buildFieldGeometry, deformBalloon, gridIsoContour } = new Function(
  `${readFileSync(join(root, 'src/js/panels/bemsolver/fieldGeometry.js'), 'utf8').replace(/^export function/gm, 'function')}
   return { buildFieldGeometry, deformBalloon, gridIsoContour };`
)();

// ---- Émulation du contexte worker (identique à bem_galerkin_worker_check) ----
let doneResult = null, errorMessage = null;
const selfStub = {
  onmessage: null,
  postMessage(msg) {
    if (msg.type === 'done') doneResult = msg.result;
    if (msg.type === 'error') errorMessage = msg.message;
  },
};
const ctx = vm.createContext({ console, performance, self: selfStub });
for (const f of ['src/js/bem/bemShared.js', 'src/js/bem/bemDomainCore.js', 'src/js/bem/bemGalerkin.js', 'src/js/bem/bemDomainWorker.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
}

// ---- Piston circulaire plan de rayon a, dans le plan z = 0, normale +Z ----
function diskMsh(a_mm, nRings) {
  const nodes = [[0, 0, 0]];
  const ringStart = [];
  for (let r = 1; r <= nRings; r++) {
    ringStart.push(nodes.length);
    const rad = (r / nRings) * a_mm;
    const nSeg = Math.max(8, 6 * r);
    for (let s = 0; s < nSeg; s++) {
      const t = (s / nSeg) * 2 * Math.PI;
      nodes.push([rad * Math.cos(t), rad * Math.sin(t), 0]);
    }
  }
  const tris = [];
  {
    const start = ringStart[0];
    const n = (ringStart[1] ?? nodes.length) - start;
    for (let s = 0; s < n; s++) tris.push([0, start + s, start + ((s + 1) % n)]);
  }
  for (let r = 1; r < nRings; r++) {
    const s0 = ringStart[r - 1], s1 = ringStart[r];
    const n0 = s1 - s0;
    const n1 = ((r + 1 < nRings) ? ringStart[r + 1] : nodes.length) - s1;
    for (let s = 0; s < n1; s++) {
      const j0 = s0 + Math.floor((s / n1) * n0) % n0;
      const j0n = s0 + Math.floor(((s + 1) / n1) * n0) % n0;
      const j1 = s1 + s, j1n = s1 + ((s + 1) % n1);
      tris.push([j0, j1, j1n]);
      if (j0 !== j0n) tris.push([j0, j1n, j0n]);
    }
  }
  const lines = ['$MeshFormat', '2.2 0 8', '$EndMeshFormat',
    '$PhysicalNames', '1', '2 1 "piston"', '$EndPhysicalNames',
    '$Nodes', String(nodes.length)];
  nodes.forEach((n, i) => lines.push(`${i + 1} ${n[0]} ${n[1]} ${n[2]}`));
  lines.push('$EndNodes', '$Elements', String(tris.length));
  tris.forEach((t, i) => lines.push(`${i + 1} 2 2 1 1 ${t[0] + 1} ${t[1] + 1} ${t[2] + 1}`));
  lines.push('$EndElements');
  return lines.join('\n');
}

function besselJ1(x) {
  if (x === 0) return 0;
  const y = x * x;
  const p1 = x * (72362614232 + y * (-7895059235 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * (-30.16036606))))));
  const p2 = 144725228442 + y * (2300535178 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
  return p1 / p2;
}
const directivityRef = (x) => (x === 0 ? 1 : Math.abs(2 * besselJ1(x) / x));

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  —  ${detail}` : ''}`);
  if (!ok) failures++;
}

const C_AIR = 344;
const a_mm = 100, a_m = 0.1;
const ka = 3;
const freq = ka * C_AIR / (2 * Math.PI * a_m);
const R_mm = 20000;               // champ lointain : r >> a et r >> k·a²/2

// Ballon centré sur le piston : ses points balaient exactement la sphère de
// mesure, donc chaque latitude a une référence analytique.
const balloon = {
  fieldType: 'balloon', axis: '+z',
  offsetX_mm: 0, offsetY_mm: 0, offsetZ_mm: 0,
  radius_mm: R_mm, deltaTheta_deg: 10, deltaPhi_deg: 45,
};
const balloonGeom = buildFieldGeometry(balloon);

// Plan à 20 m, normal à +Z : un point est sur l'axe, c'est le maximum.
const plane = {
  fieldType: 'plane', axis: '+z',
  offsetX_mm: 0, offsetY_mm: 0, offsetZ_mm: R_mm,
  width_mm: 20000, height_mm: 0.001, delta_mm: 2000,
};
const planeGeom = buildFieldGeometry(plane);

const config = {
  symmetry: 'none',
  subdomains: [{
    id: 'ext', name: 'Air', type: 'exterior', baffle: true, baffleAxis: '+z', baffleOffset_mm: 0,
    surfaces: [{ surfaceId: 'p:1', role: 'driven', velocity: 1 }],
  }],
  interfaces: [],
};

console.log(`=== Piston bafflé, ka=${ka} (${freq.toFixed(0)} Hz), nappes à ${R_mm / 1000} m ===`);
try {
  selfStub.onmessage({ data: {
    type: 'computeDomain', id: 'field-job',
    mshContent: diskMsh(a_mm, 6),
    config,
    opts: {
      freqs: [freq], distance_m: 20, angleStep: 15, angleMax: 90,
      fields: [
        { id: 'balloon', name: 'Balloon 1', type: 'balloon', points_mm: balloonGeom.points },
        { id: 'plane', name: 'Plane 1', type: 'plane', points_mm: planeGeom.points },
      ],
    },
  } });
} catch (err) {
  console.error('Exception hors worker :', err);
  throw err;
}

if (errorMessage) throw new Error(`worker: ${errorMessage}`);
if (!doneResult) throw new Error('Le worker n\'a rien renvoyé.');

const results = doneResult.fieldResults || [];
check('one result per field per frequency', results.length === 2, `${results.length}`);

const byId = new Map(results.map(r => [r.id, r]));
const bal = byId.get('balloon');
check('balloon result sized like its point cloud',
  bal?.mag.length === balloonGeom.points.length, `${bal?.mag.length} vs ${balloonGeom.points.length}`);

// Hémisphère arrière : le baffle infini l'annule.
const behind = balloonGeom.points
  .map((p, i) => ({ z: p[2], mag: bal.mag[i] }))
  .filter(e => e.z < -1e-6);
check('rear hemisphere zeroed by the infinite baffle', behind.every(e => e.mag === 0), `${behind.length} points`);

// Directivité : |p(θ)|/|p(0)| doit suivre 2·J1(ka·sinθ)/(ka·sinθ).
const k = 2 * Math.PI * freq / C_AIR;
const axisMag = Math.max(...bal.mag);
let worstBalloon = 0;
balloonGeom.points.forEach((p, i) => {
  const r = Math.hypot(p[0], p[1], p[2]);
  const cosT = p[2] / r;
  if (cosT < Math.cos(75 * Math.PI / 180)) return;   // rasant : maillage grossier
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  worstBalloon = Math.max(worstBalloon, Math.abs(bal.mag[i] / axisMag - directivityRef(ka * sinT)));
});
check('balloon directivity vs 2·J1(x)/x over ±75°', worstBalloon < 0.06, `worst dev ${worstBalloon.toFixed(4)}`);

// Pression sur l'axe : |p| = rho·c·k·a²·u0/(2r).
const RHO_AIR = 1.21;
const wantAxis = RHO_AIR * C_AIR * k * a_m * a_m / (2 * (R_mm / 1000));
check('on-axis |p| matches the analytic piston',
  Math.abs(axisMag / wantAxis - 1) < 0.08, `ratio ${(axisMag / wantAxis).toFixed(4)}`);

// Le plan traverse le même champ : son point central doit égaler l'axe du ballon.
const pl = byId.get('plane');
const planeAxis = Math.max(...pl.mag);
check('plane and balloon agree on axis',
  Math.abs(planeAxis / axisMag - 1) < 0.01, `ratio ${(planeAxis / axisMag).toFixed(5)}`);

// Le plan est à 20 m : ses bords voient un angle croissant, la pression décroît.
const planeByAngle = planeGeom.points
  .map((p, i) => ({ x: Math.abs(p[0]), mag: pl.mag[i] }))
  .sort((a, b) => a.x - b.x);
check('plane pressure decreases away from the axis',
  planeByAngle.every((e, i) => i === 0 || e.mag <= planeByAngle[i - 1].mag * 1.001));

// ---- Ballon de directivité : la sphère est gonflée par le niveau ----
console.log('\n=== Directivity 3D shape ===');
const dbRange = 24;
const levels = bal.mag.map(m => (m > 0 ? 20 * Math.log10(m / axisMag) : -Infinity));
const shape = deformBalloon(balloonGeom, levels, dbRange);

check('shape sized like the sphere', shape.length === balloonGeom.points.length);
check('on-axis point keeps the full radius',
  Math.abs(Math.max(...shape.map(p => Math.hypot(p[0], p[1], p[2]))) - R_mm) < 1e-6);
check('rear hemisphere collapses onto the centre',
  balloonGeom.points.every((p, i) => p[2] >= -1e-6 || Math.hypot(shape[i][0], shape[i][1], shape[i][2]) < 1e-6));
check('radius follows the level',
  balloonGeom.points.every((p, i) => {
    if (!Number.isFinite(levels[i])) return true;
    const want = R_mm * Math.min(1, Math.max(0, 1 + levels[i] / dbRange));
    return Math.abs(Math.hypot(shape[i][0], shape[i][1], shape[i][2]) - want) < 1e-6;
  }));

// ---- Contour −6 dB : il doit tomber sur l'angle où 2·J1(x)/x = 1/2 ----
const segments = gridIsoContour(shape, levels, balloonGeom.stats, -6);
check('a -6 dB contour is produced', segments.length >= 2, `${segments.length / 2} segments`);
if (segments.length) {
  // Angle analytique : 2·J1(ka·sinθ)/(ka·sinθ) = 0.5.
  let xHalf = 0;
  for (let x = 0.001; x < 4; x += 0.0005) { if (directivityRef(x) <= 0.5) { xHalf = x; break; } }
  const thetaRef = Math.asin(Math.min(1, xHalf / ka)) * 180 / Math.PI;
  const thetas = [];
  for (let i = 0; i < segments.length; i++) {
    const p = segments[i];
    const r = Math.hypot(p[0], p[1], p[2]);
    if (r > 1e-9) thetas.push(Math.acos(p[2] / r) * 180 / Math.PI);
  }
  const spread = Math.max(...thetas) - Math.min(...thetas);
  const mean = thetas.reduce((s, t) => s + t, 0) / thetas.length;
  check('contour lies on a single cone (axisymmetric source)', spread < 5, `spread ${spread.toFixed(2)}°`);
  check('-6 dB half-angle matches the analytic piston',
    Math.abs(mean - thetaRef) < 3, `got ${mean.toFixed(1)}°, want ${thetaRef.toFixed(1)}°`);
}

console.log(failures ? `\n${failures} failure(s) so far.` : '\nSection 1 OK.');

// =======================================================
// Section 2 : nappe traversant DEUX domaines (intérieur du pavillon + air)
// =======================================================
console.log('\n=== Plane field crossing a cavity and the outer air ===');

/** Cylindre en mm : piston (z=0, p:1), paroi (p:2), interface (z=L, p:3). */
function cylinderMsh(a, L, nSeg, nAx) {
  const nodes = [], tris = [];
  const ringIdx = [];
  for (let z = 0; z <= nAx; z++) {
    ringIdx.push(nodes.length);
    for (let s = 0; s < nSeg; s++) {
      const t = (s / nSeg) * 2 * Math.PI;
      nodes.push([a * Math.cos(t), a * Math.sin(t), (z / nAx) * L]);
    }
  }
  for (let z = 0; z < nAx; z++) {
    const s0 = ringIdx[z], s1 = ringIdx[z + 1];
    for (let s = 0; s < nSeg; s++) {
      const sn = (s + 1) % nSeg;
      tris.push([s0 + s, s0 + sn, s1 + sn, 2], [s0 + s, s1 + sn, s1 + s, 2]);
    }
  }
  const cBot = nodes.length; nodes.push([0, 0, 0]);
  for (let s = 0; s < nSeg; s++) tris.push([cBot, ringIdx[0] + ((s + 1) % nSeg), ringIdx[0] + s, 1]);
  const cTop = nodes.length; nodes.push([0, 0, L]);
  for (let s = 0; s < nSeg; s++) tris.push([cTop, ringIdx[nAx] + s, ringIdx[nAx] + ((s + 1) % nSeg), 3]);

  const lines = ['$MeshFormat', '2.2 0 8', '$EndMeshFormat', '$Nodes', String(nodes.length)];
  nodes.forEach((n, i) => lines.push(`${i + 1} ${n[0]} ${n[1]} ${n[2]}`));
  lines.push('$EndNodes', '$Elements', String(tris.length));
  tris.forEach((t, i) => lines.push(`${i + 1} 2 2 ${t[3]} ${t[3]} ${t[0] + 1} ${t[1] + 1} ${t[2] + 1}`));
  lines.push('$EndElements');
  return lines.join('\n');
}

const L_mm = 100, rad_mm = 50;
// Plan x–z (normale +y) : il coupe la cavité, la bouche et l'air devant.
const cut = {
  fieldType: 'plane', axis: '+y',
  offsetX_mm: 0, offsetY_mm: 0, offsetZ_mm: 50,
  width_mm: 300, height_mm: 200, delta_mm: 25,   // width = le long de z, height = le long de x
};
const cutGeom = buildFieldGeometry(cut);

doneResult = null; errorMessage = null;
selfStub.onmessage({ data: {
  type: 'computeDomain', id: 'cut-job',
  mshContent: cylinderMsh(rad_mm, L_mm, 16, 3),
  config: {
    symmetry: 'none',
    subdomains: [
      { id: 'in', name: 'Cavity', type: 'interior', baffle: false, surfaces: [
        { surfaceId: 'p:1', role: 'driven', velocity: 1 },
        { surfaceId: 'p:2', role: 'boundary' },
      ] },
      { id: 'out', name: 'Air', type: 'exterior', baffle: false, surfaces: [] },
    ],
    interfaces: [{ id: 'if1', name: 'Mouth', fromId: 'in', toId: 'out', surfaces: [{ surfaceId: 'p:3' }] }],
  },
  opts: {
    freqs: [2000], distance_m: 1, angleStep: 30, angleMax: 90,
    fields: [{ id: 'cut', name: 'Cut', type: 'plane', points_mm: cutGeom.points }],
  },
} });

if (errorMessage) throw new Error(`worker: ${errorMessage}`);
const cutRes = (doneResult?.fieldResults || [])[0];
if (!cutRes) throw new Error('pas de résultat de nappe pour la coupe');

const mean = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0);
const pick = (test) => cutGeom.points.map((p, i) => ({ p, mag: cutRes.mag[i] })).filter(e => test(e.p));

const inside = pick(p => Math.abs(p[0]) < rad_mm - 1 && p[2] > 5 && p[2] < L_mm - 5);
const ahead = pick(p => Math.abs(p[0]) < rad_mm - 1 && p[2] > L_mm + 5 && p[2] < L_mm + 60);
const atAxis = (z) => cutGeom.points.findIndex(p => Math.abs(p[0]) < 1e-9 && Math.abs(p[2] - z) < 1e-9);

check('the cavity is sampled by the cut', inside.length >= 4, `${inside.length} points`);
check('pressure inside the horn is computed, not zero',
  mean(inside.map(e => e.mag)) > 0, `mean |p| = ${mean(inside.map(e => e.mag)).toExponential(3)} Pa`);
check('the interior field dominates the radiated one (cavity gain)',
  mean(inside.map(e => e.mag)) > mean(ahead.map(e => e.mag)),
  `in ${mean(inside.map(e => e.mag)).toExponential(2)} vs ahead ${mean(ahead.map(e => e.mag)).toExponential(2)}`);

// Le vrai test du chanînage : de part et d'autre de la bouche, chaque point est
// servi par un domaine DIFFÉRENT. Un câblage raté (un seul domaine sommé, ou
// sommé du mauvais côté) ferait chuter un côté à zéro.
const zIn = cutRes.mag[atAxis(75)], zOut = cutRes.mag[atAxis(125)];
check('the field is continuous across the mouth',
  zIn > 0 && zOut > 0 && Math.max(zIn, zOut) / Math.min(zIn, zOut) < 2,
  `inside ${zIn.toExponential(2)} Pa, outside ${zOut.toExponential(2)} Pa`);

// ---- « Start field » : rejouer les nappes sur la solution en cache ----
console.log('\n=== Field-only recompute (cached surface solution) ===');
const denser = buildFieldGeometry({ ...cut, delta_mm: 50 });
doneResult = null; errorMessage = null;
const tField = Date.now();
selfStub.onmessage({ data: {
  type: 'computeFields', id: 'refield',
  opts: { fields: [
    { id: 'cut', name: 'Cut', type: 'plane', points_mm: cutGeom.points },
    { id: 'denser', name: 'Denser', type: 'plane', points_mm: denser.points },
  ] },
} });

if (errorMessage) throw new Error(`worker (fields): ${errorMessage}`);
const again = (doneResult?.fieldResults || []).find(r => r.id === 'cut');
const extra = (doneResult?.fieldResults || []).find(r => r.id === 'denser');
check('the cached solution answers without re-solving', !!again && !!extra,
  `${(Date.now() - tField) / 1000}s for ${cutGeom.points.length + denser.points.length} points`);
check('replayed field matches the one from the full run',
  again && again.mag.every((m, i) => m === cutRes.mag[i]));
check('a field added afterwards is computed too',
  extra && extra.mag.length === denser.points.length && extra.mag.some(m => m > 0));
check('the replay covers the solved frequencies',
  doneResult.freqs.length === 1 && doneResult.freqs[0] === 2000, `${doneResult.freqs.join(',')} Hz`);

// ---- Vitesse à quelques millimètres d'une paroi (cas de l'event) ----
// Les parois du cylindre sont maillées en ~25 mm : sans ré-intégration de champ
// proche, tout l'intérieur d'un conduit étroit tombe dans la bande masquée et
// l'utilisateur ne voit rien. On sonde donc jusqu'à 2 mm de la paroi.
console.log('\n=== Near-wall particle velocity inside the duct ===');
const probes = [];
for (const z of [2, 5, 10, 20]) probes.push([0, 0, z]);            // au-dessus du piston
for (const r of [0, 20, 35, 45, 48]) probes.push([r, 0, 50]);      // traversée du rayon
doneResult = null; errorMessage = null;
selfStub.onmessage({ data: {
  type: 'computeFields', id: 'nearwall',
  opts: { fields: [{ id: 'probe', name: 'Probe', type: 'plane', withVelocity: true, points_mm: probes }] },
} });
if (errorMessage) throw new Error(`worker (near wall): ${errorMessage}`);
const probe = (doneResult?.fieldResults || []).find(r => r.id === 'probe');
if (!probe?.vRe) throw new Error('pas de vitesse renvoyée pour les sondes');

const comp = (i, c) => Math.hypot(probe.vRe[3 * i + c], probe.vIm[3 * i + c]);
const finite = probes.every((_, i) => [0, 1, 2].every(c => Number.isFinite(comp(i, c))));
check('velocity is available 2 mm from a wall meshed at 25 mm', finite,
  probes.map((p, i) => `r${p[0]}z${p[2]}:${Number.isFinite(comp(i, 2)) ? comp(i, 2).toFixed(2) : 'NaN'}`).join(' '));

// Non-pénétration : sur une paroi rigide la composante normale doit s'effacer.
const wall = probes.findIndex(p => p[0] === 48);
const axis = probes.findIndex(p => p[0] === 0 && p[2] === 50);
const leak = comp(wall, 0) / Math.max(comp(axis, 2), 1e-12);
check('radial velocity collapses at the rigid wall', leak < 0.25, `|v_r|/|v_z| = ${leak.toFixed(3)}`);

// Juste au-dessus de la membrane, v·n doit redonner la vitesse imposée (1 m/s).
const onPiston = comp(probes.findIndex(p => p[0] === 0 && p[2] === 2), 2);
check('v·n above the driven piston matches the imposed 1 m/s',
  onPiston > 0.6 && onPiston < 1.6, `${onPiston.toFixed(3)} m/s`);

console.log(failures ? `\n${failures} failure(s).` : '\nAll checks passed.');
process.exitCode = failures ? 1 : 0;
