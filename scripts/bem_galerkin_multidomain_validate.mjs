// =======================================================
// scripts/bem_galerkin_multidomain_validate.mjs
//
// Compare le nouvel assemblage Galerkin P1 multi-domaine à l'assemblage P0
// DÉJÀ VALIDÉ (bemDomainCore.solveMultiDomain), sur la MÊME géométrie et la
// MÊME config : un cylindre court (piston à z=0, paroi latérale, interface à
// z=L) couplé à un domaine extérieur NON bafflé constitué du seul disque
// d'interface (topologie éprouvée par bem_domain_validate.mjs — évite le
// piège d'orientation des sphères concentriques rencontré en v1, cf. mémoire
// de session : deux composantes fermées disjointes dans un même domaine
// trompent l'heuristique de volume signé).
//
// Ce n'est pas une validation analytique (l'écart P0 attendu à ce maillage est
// documenté ~5-15%, cf. bem_domain_validate.mjs) mais un test de COHÉRENCE :
// si le Galerkin P1 est correctement câblé (mêmes signes, mêmes rôles, même
// couplage d'interface que le P0 déjà éprouvé), les deux doivent converger
// vers la MÊME limite quand le maillage se raffine, même si leurs valeurs à
// maillage fixe diffèrent (P0 vs P1 ont des ordres de convergence différents).
//
// Usage : node scripts/bem_galerkin_multidomain_validate.mjs [nSeg] [nAx]
// =======================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import bemSharedModule from '../src/js/bem/bemShared.js';
import galerkinModule from '../src/js/bem/bemGalerkin.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const vmContext = vm.createContext({ console, performance });
for (const f of ['src/js/bem/bemShared.js', 'src/js/bem/bemDomainCore.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), vmContext, { filename: f });
}
const core = vm.runInContext('({ buildMultiDomainModel, prepareMultiDomain, solveMultiDomain, multiDomainPowerBalance, domainMirrors, computeMultiDomainPolar, pickRadiatingDomain })', vmContext);
const bemShared = bemSharedModule;
const galerkin = galerkinModule;

const C_AIR = 344;

// ---- Cylindre : piston (z=0) + paroi latérale + interface (z=L), en mètres. ----
function buildCylinderMsh(a, L, nSeg, nAx) {
  const nodes = [], tris = [];
  const push = (na, nb, nc, phys) => tris.push({ a: na, b: nb, c: nc, phys });
  const ringIdx = [];
  for (let z = 0; z <= nAx; z++) {
    const start = nodes.length;
    for (let s = 0; s < nSeg; s++) {
      const t = (s / nSeg) * 2 * Math.PI;
      nodes.push([a * Math.cos(t), a * Math.sin(t), (z / nAx) * L]);
    }
    ringIdx.push(start);
  }
  // Paroi latérale (phys=2), normale sortante (loin de l'axe).
  for (let z = 0; z < nAx; z++) {
    const s0 = ringIdx[z], s1 = ringIdx[z + 1];
    for (let s = 0; s < nSeg; s++) {
      const sn = (s + 1) % nSeg;
      push(s0 + s, s0 + sn, s1 + sn, 2);
      push(s0 + s, s1 + sn, s1 + s, 2);
    }
  }
  // Piston (phys=1) à z=0, normale sortante = -Z (hors du cylindre).
  const cBot = nodes.length; nodes.push([0, 0, 0]);
  for (let s = 0; s < nSeg; s++) push(cBot, ringIdx[0] + ((s + 1) % nSeg), ringIdx[0] + s, 1);
  // Interface (phys=3) à z=L, normale sortante = +Z.
  const cTop = nodes.length; nodes.push([0, 0, L]);
  for (let s = 0; s < nSeg; s++) push(cTop, ringIdx[nAx] + s, ringIdx[nAx] + ((s + 1) % nSeg), 3);

  const lines = ['$MeshFormat', '2.2 0 8', '$EndMeshFormat', '$Nodes', String(nodes.length)];
  nodes.forEach((n, i) => lines.push(`${i + 1} ${n[0]} ${n[1]} ${n[2]}`));
  lines.push('$EndNodes', '$Elements', String(tris.length));
  tris.forEach((t, i) => lines.push(`${i + 1} 2 2 ${t.phys} ${t.phys} ${t.a + 1} ${t.b + 1} ${t.c + 1}`));
  lines.push('$EndElements');
  return lines.join('\n');
}

function solveP0(mshContent, config, freq) {
  const model = core.buildMultiDomainModel(mshContent, config);
  const prep = core.prepareMultiDomain(model, null);
  const worst = Math.max(...prep.diagnostics.map(d => d.worstRowSumError));
  const sol = core.solveMultiDomain(freq, model, prep, {});
  let sumRe = 0, sumIm = 0, cnt = 0;
  for (let i = 0; i < model.elements.length; i++) {
    if (!model.info[i].iface) continue;
    sumRe += sol.pressure[2 * i]; sumIm += sol.pressure[2 * i + 1]; cnt++;
  }
  const bal = core.multiDomainPowerBalance(model, sol);
  const rad = core.pickRadiatingDomain(model);
  const polar = core.computeMultiDomainPolar(model, sol, rad, 'H', 2, 15, 90);
  return { pRe: sumRe / cnt, pIm: sumIm / cnt, worstRowSumError: worst, model, bal, polar };
}

function solveP1(model, freq) {
  const omega = 2 * Math.PI * freq, k = omega / C_AIR;
  const nodeCoordByWeldedId = new Map();
  for (const el of model.elements) {
    const verts = [el.v0, el.v1, el.v2];
    el.nodes.forEach((g, i) => { if (!nodeCoordByWeldedId.has(g)) nodeCoordByWeldedId.set(g, verts[i]); });
  }
  const maxId = Math.max(...nodeCoordByWeldedId.keys());
  const nodesArr = new Array(maxId + 1);
  for (const [id, xyz] of nodeCoordByWeldedId) nodesArr[id] = xyz;

  const getMirrors = (d) => core.domainMirrors(model, d);
  const { A, rhs, Nt, Np, Nq, pIndex, qIndex } = galerkin.assembleMultiDomainGalerkin(model, nodesArr, k, omega, {
    singularOrder: 2,
    getMirrors,
  });
  bemShared.complexLUSolve(A, rhs, Nt, { throwOnSingular: true, label: 'cylinder galerkin' });
  const pArr = rhs.subarray(0, 2 * Np);
  const qArr = rhs.subarray(2 * Np, 2 * Nt);

  const ifaceNodeIds = new Set();
  for (let i = 0; i < model.elements.length; i++) {
    if (!model.info[i].iface) continue;
    for (const g of model.elements[i].nodes) ifaceNodeIds.add(g);
  }
  let sumRe = 0, sumIm = 0, cnt = 0;
  for (const g of ifaceNodeIds) {
    const col = pIndex.get(g);
    sumRe += rhs[2 * col]; sumIm += rhs[2 * col + 1]; cnt++;
  }

  const domainsArr = [...model.domains.values()];
  const radDomain = domainsArr.find(d => d.type === 'exterior');
  const mirrors = getMirrors(radDomain);
  const polar = galerkin.galerkinComputeMultiDomainPolar(model, nodesArr, radDomain, k, omega, pIndex, qIndex, pArr, qArr, mirrors, 'H', 2, 15, 90);
  const bal = galerkin.galerkinPowerBalance(model, nodesArr, pIndex, qIndex, pArr, qArr, omega);

  return { pRe: sumRe / cnt, pIm: sumIm / cnt, polar, bal };
}

function main() {
  const a = 0.06, L = 0.08, v0 = 1;
  const freq = Number(process.argv[5] || 400);
  const nSeg = Number(process.argv[2] || 16), nAx = Number(process.argv[3] || 4);
  const baffle = process.argv[4] === 'baffle';
  console.log(`\n=== Cylindre piston+paroi+interface, Ext ${baffle ? 'BAFFLÉ' : 'NON bafflé'} — a=${a}m L=${L}m f=${freq}Hz, nSeg=${nSeg} nAx=${nAx} ===\n`);

  const mshContent = buildCylinderMsh(a, L, nSeg, nAx);
  const config = {
    scale: 1,
    symmetry: 'none',
    subdomains: [
      { id: 'in', name: 'Cavity', type: 'interior', baffle: false,
        surfaces: [
          { surfaceId: 'p:1', role: 'driven', velocity: v0 },
          { surfaceId: 'p:2', role: 'boundary' },
        ] },
      { id: 'out', name: 'Air', type: 'exterior', baffle, surfaces: [] },
    ],
    interfaces: [{ id: 'if1', name: 'Mouth', fromId: 'in', toId: 'out', surfaces: [{ surfaceId: 'p:3' }] }],
  };

  const p0 = solveP0(mshContent, config, freq);
  console.log(`  P0  worstRowSumError=${p0.worstRowSumError.toExponential(3)} (doit être ~0)`);
  console.log(`  P0  p(interface) = ${p0.pRe.toExponential(4)} + i${p0.pIm.toExponential(4)}  (|p|=${Math.hypot(p0.pRe, p0.pIm).toExponential(4)})`);

  const p1 = solveP1(p0.model, freq);
  console.log(`  P1  p(interface) = ${p1.pRe.toExponential(4)} + i${p1.pIm.toExponential(4)}  (|p|=${Math.hypot(p1.pRe, p1.pIm).toExponential(4)})`);

  const errPct = 100 * Math.hypot(p1.pRe - p0.pRe, p1.pIm - p0.pIm) / Math.hypot(p0.pRe, p0.pIm);
  console.log(`\n  écart P1 vs P0 (même maillage, ordres de convergence différents — pas un pass/fail strict) : ${errPct.toFixed(1)}%`);
  console.log(p0.worstRowSumError < 0.05 ? '  PASS  P0 sain sur cette géométrie (pas de piège d\'orientation)' : '  FAIL  P0 lui-même incohérent — mauvaise géométrie de test, recommencer');

  console.log(`\n  --- Bilan de puissance ---`);
  console.log(`  P0  driven=${p0.bal.driven.toExponential(3)} W  radiated=${p0.bal.radiated.toExponential(3)} W  mismatch=${(p0.bal.mismatch*100).toFixed(1)}%`);
  console.log(`  P1  driven=${p1.bal.driven.toExponential(3)} W  radiated=${p1.bal.radiated.toExponential(3)} W  mismatch=${(p1.bal.mismatch*100).toFixed(1)}%`);

  console.log(`\n  --- Polaire H (deg : P0 / P1, normalisée sur l'axe) ---`);
  for (let i = 0; i < p0.polar.angles.length; i++) {
    console.log(`  ${p0.polar.angles[i].toFixed(0).padStart(4)}°  P0=${p0.polar.normalized[i].toFixed(3)}  P1=${p1.polar.normalized[i].toFixed(3)}`);
  }
}

main();
