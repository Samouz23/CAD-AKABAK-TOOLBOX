// =======================================================
// FICHIER :  scripts/bem_velocity_validate.mjs
// RÔLE    :  Validation de la VITESSE PARTICULAIRE `galerkinFieldVelocity`.
//
//  Trois contrôles indépendants sur le piston circulaire bafflé :
//    1. juste au-dessus de la membrane, v·n doit redonner la vitesse imposée
//       (c'est le test de SIGNE et d'échelle — il attrape à lui seul une
//       convention e^{+iωt} inversée) ;
//    2. en champ lointain sur l'axe, l'onde est localement plane : v = p/(ρc),
//       en phase ;
//    3. le débit ∫v·dS à travers un plan devant le piston doit égaler le débit
//       de la membrane S·u0 (conservation de la masse).
//
//  Lancement :  node scripts/bem_velocity_validate.mjs
// =======================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const ctx = vm.createContext({ console, performance });
for (const f of ['src/js/bem/bemShared.js', 'src/js/bem/bemDomainCore.js', 'src/js/bem/bemGalerkin.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
}
const api = vm.runInContext(`({
  buildMultiDomainModel, domainMirrors, complexLUSolve, C_AIR, RHO_AIR,
  galerkinNodeTable, solveMultiDomainGalerkin, galerkinFieldPressure, galerkinFieldVelocity,
  pickRadiatingDomain,
})`, ctx);
const { C_AIR, RHO_AIR } = api;

let failures = 0;
function check(label, got, want, tol, unit = '') {
  const err = Math.abs(got - want);
  const ok = err <= tol;
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}: got ${got.toFixed(4)}${unit}, want ${want.toFixed(4)}${unit} (|err| ${err.toFixed(4)} <= ${tol})`);
}

// ---- Piston circulaire plan z = 0, normale +Z ----
function diskMesh(a_mm, nRings, physTag) {
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
    for (let s = 0; s < n; s++) tris.push({ a: 0, b: start + s, c: start + ((s + 1) % n), phys: physTag, elem: physTag });
  }
  for (let r = 1; r < nRings; r++) {
    const s0 = ringStart[r - 1], s1 = ringStart[r];
    const n0 = s1 - s0;
    const n1 = ((r + 1 < nRings) ? ringStart[r + 1] : nodes.length) - s1;
    for (let s = 0; s < n1; s++) {
      const j0 = s0 + Math.floor((s / n1) * n0) % n0;
      const j0n = s0 + Math.floor(((s + 1) / n1) * n0) % n0;
      const j1 = s1 + s, j1n = s1 + ((s + 1) % n1);
      tris.push({ a: j0, b: j1, c: j1n, phys: physTag, elem: physTag });
      if (j0 !== j0n) tris.push({ a: j0, b: j1n, c: j0n, phys: physTag, elem: physTag });
    }
  }
  return { nodes, tris };
}

function toMsh(nodes, tris, names) {
  const lines = ['$MeshFormat', '2.2 0 8', '$EndMeshFormat', '$PhysicalNames', String(names.length)];
  for (const [tag, name] of names) lines.push(`2 ${tag} "${name}"`);
  lines.push('$EndPhysicalNames', '$Nodes', String(nodes.length));
  nodes.forEach((n, i) => lines.push(`${i + 1} ${n[0]} ${n[1]} ${n[2]}`));
  lines.push('$EndNodes', '$Elements', String(tris.length));
  tris.forEach((t, i) => lines.push(`${i + 1} 2 2 ${t.phys} ${t.elem} ${t.a + 1} ${t.b + 1} ${t.c + 1}`));
  lines.push('$EndElements');
  return lines.join('\n');
}

const a_mm = 100, a_m = 0.1, u0 = 1;
const { nodes, tris } = diskMesh(a_mm, 12, 1);
const msh = toMsh(nodes, tris, [[1, 'piston']]);
const config = {
  symmetry: 'none',
  subdomains: [{
    id: 'ext', name: 'Air', type: 'exterior', baffle: true,
    surfaces: [{ surfaceId: 'p:1', role: 'driven', velocity: u0 }],
  }],
  interfaces: [],
};

const model = api.buildMultiDomainModel(msh, config);
const nodesArr = api.galerkinNodeTable(model);
const dom = api.pickRadiatingDomain(model);
const mirrors = api.domainMirrors(model, dom);
const deps = { domainMirrors: api.domainMirrors, complexLUSolve: api.complexLUSolve, C_AIR };
console.log(`piston bafflé : ${model.elementCount} éléments, a=${a_mm} mm, u0=${u0} m/s`);

const evalV = (x, sol) => api.galerkinFieldVelocity(
  x, model, nodesArr, dom, sol.k, sol.omega, sol.pIndex, sol.qIndex, sol.pArr, sol.qArr, mirrors);
const evalP = (x, sol) => api.galerkinFieldPressure(
  x, model, nodesArr, dom, sol.k, sol.omega, sol.pIndex, sol.qIndex, sol.pArr, sol.qArr, mirrors);

for (const ka of [1, 2]) {
  const f = ka * C_AIR / (2 * Math.PI * a_m);
  const sol = api.solveMultiDomainGalerkin(f, model, deps, { nodesArr });
  console.log(`\n--- ka=${ka} (${f.toFixed(1)} Hz) ---`);

  // 1. Juste devant la membrane : v_z doit valoir u0. La formule de
  //    représentation est quasi singulière tout contre la surface, on se place
  //    à a/50 et on moyenne sur quelques rayons pour rester loin du bord.
  let sumRe = 0, sumIm = 0, n = 0;
  for (const rr of [0, 0.2, 0.4, 0.6]) {
    const v = evalV([rr * a_m, 0, a_m / 50], sol);
    sumRe += v.re[2]; sumIm += v.im[2]; n++;
  }
  check('v_z juste devant la membrane', sumRe / n, u0, 0.06, ' m/s');
  check('v_z partie imaginaire (doit être ~0)', sumIm / n, 0, 0.06, ' m/s');

  // 2. Champ lointain sur l'axe : onde localement plane, v = p/(ρc).
  const xFar = [0, 0, 20];
  const p = evalP(xFar, sol);
  const v = evalV(xFar, sol);
  const zc = RHO_AIR * C_AIR;
  check('|v| champ lointain / (|p|/ρc)', Math.hypot(v.re[2], v.im[2]) / (Math.hypot(p.re, p.im) / zc), 1, 0.02);
  const dPhase = (Math.atan2(v.im[2], v.re[2]) - Math.atan2(p.im, p.re)) * 180 / Math.PI;
  check('déphasage v/p champ lointain', ((dPhase + 540) % 360) - 180, 0, 1.5, '°');
  const transverse = Math.hypot(v.re[0], v.im[0], v.re[1], v.im[1]);
  check('composante transverse sur l\'axe', transverse / Math.hypot(v.re[2], v.im[2]), 0, 0.02);

  // 3. Conservation de la masse : le débit à travers un plan z = cte devant le
  //    piston doit égaler S·u0. Intégration polaire, jusqu'à 12·a pour capter
  //    l'étalement du champ proche.
  const z0 = a_m / 4;
  const rMax = 12 * a_m, nR = 90, nPhi = 24;
  let qRe = 0, qIm = 0;
  for (let i = 0; i < nR; i++) {
    const r0 = (i / nR) * rMax, r1 = ((i + 1) / nR) * rMax;
    const rm = 0.5 * (r0 + r1);
    const dA = Math.PI * (r1 * r1 - r0 * r0) / nPhi;
    for (let j = 0; j < nPhi; j++) {
      const phi = ((j + 0.5) / nPhi) * 2 * Math.PI;
      const vv = evalV([rm * Math.cos(phi), rm * Math.sin(phi), z0], sol);
      qRe += vv.re[2] * dA; qIm += vv.im[2] * dA;
    }
  }
  const S = Math.PI * a_m * a_m;
  check('débit à travers un plan / S·u0', Math.hypot(qRe, qIm) / (S * u0), 1, 0.06);
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
if (failures) process.exitCode = 1;
