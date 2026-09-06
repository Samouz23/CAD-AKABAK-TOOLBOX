// =======================================================
// FICHIER :  scripts/bem_back_diaphragm_validate.mjs
// RÔLE    :  Vérifie le diaphragme 'back' (cône piloté + capot central figé,
//            voir diaphragmMesh.js) dans le cas le plus simple qui puisse
//            trahir un bug de signe/normale : une boîte scellée, sans
//            rayonnement extérieur, sous sa première résonance. Le mur avant
//            de la boîte porte un trou où le diaphragme est monté (conforme
//            au maillage hôte, comme en production).
//
//  Pour une cavité fermée, sans perte, en dessous de résonance, la puissance
//  RÉELLE injectée par le piston doit être quasi nulle (réactif pur) — tout
//  écart notable révèle un signe inversé entre le cône (piloté) et le capot
//  (figé), ou un défaut d'étanchéité à leur jonction.
//
//  Lancement :  node scripts/bem_back_diaphragm_validate.mjs
// =======================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const context = vm.createContext({ console, performance });
for (const f of ['src/js/bem/bemShared.js', 'src/js/bem/bemDomainCore.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), context, { filename: f });
}
const api = vm.runInContext(`({
  buildMultiDomainModel, prepareMultiDomain, solveMultiDomain, multiDomainPowerBalance,
  C_AIR, RHO_AIR,
})`, context);
const { C_AIR, RHO_AIR } = api;

const { buildDiaphragmMesh } = new Function(
  `${readFileSync(join(root, 'src/js/panels/bemsolver/diaphragmMesh.js'), 'utf8').replace(/^export function/gm, 'function')}
   return { buildDiaphragmMesh };`
)();

function toMsh(nodes, tris, physicalNames) {
  const lines = ['$MeshFormat', '2.2 0 8', '$EndMeshFormat'];
  lines.push('$PhysicalNames', String(physicalNames.length));
  for (const [tag, name] of physicalNames) lines.push(`2 ${tag} "${name}"`);
  lines.push('$EndPhysicalNames');
  lines.push('$Nodes', String(nodes.length));
  nodes.forEach((n, i) => lines.push(`${i + 1} ${n[0]} ${n[1]} ${n[2]}`));
  lines.push('$EndNodes', '$Elements', String(tris.length));
  tris.forEach((t, i) => lines.push(`${i + 1} 2 2 ${t.phys} ${t.elem} ${t.a + 1} ${t.b + 1} ${t.c + 1}`));
  lines.push('$EndElements');
  return lines.join('\n');
}

/** Anneau plan z=cst entre rA et rB (mm), maillé en secteurs radiaux simples. */
function annulusMesh(rA_mm, rB_mm, z_mm, nSeg, physTag) {
  const nodes = [];
  const inner = [], outer = [];
  for (let s = 0; s < nSeg; s++) {
    const t = (s / nSeg) * 2 * Math.PI;
    inner.push(nodes.length); nodes.push([rA_mm * Math.cos(t), rA_mm * Math.sin(t), z_mm]);
  }
  for (let s = 0; s < nSeg; s++) {
    const t = (s / nSeg) * 2 * Math.PI;
    outer.push(nodes.length); nodes.push([rB_mm * Math.cos(t), rB_mm * Math.sin(t), z_mm]);
  }
  const tris = [];
  for (let s = 0; s < nSeg; s++) {
    const i0 = inner[s], i1 = inner[(s + 1) % nSeg];
    const o0 = outer[s], o1 = outer[(s + 1) % nSeg];
    tris.push({ a: i0, b: o0, c: o1, phys: physTag, elem: physTag });
    tris.push({ a: i0, b: o1, c: i1, phys: physTag, elem: physTag });
  }
  return { nodes, tris, innerRing: inner.map(i => nodes[i]) };
}

/** Paroi cylindrique fermée rayon R, de z0 à z1 (mm). */
function cylinderMesh(R_mm, z0_mm, z1_mm, nSeg, nRows, physTag) {
  const nodes = [];
  const rows = [];
  for (let r = 0; r <= nRows; r++) {
    const z = z0_mm + ((z1_mm - z0_mm) * r) / nRows;
    const row = [];
    for (let s = 0; s < nSeg; s++) {
      const t = (s / nSeg) * 2 * Math.PI;
      row.push(nodes.length); nodes.push([R_mm * Math.cos(t), R_mm * Math.sin(t), z]);
    }
    rows.push(row);
  }
  const tris = [];
  for (let r = 0; r < nRows; r++) {
    for (let s = 0; s < nSeg; s++) {
      const a = rows[r][s], b = rows[r][(s + 1) % nSeg];
      const c = rows[r + 1][s], d = rows[r + 1][(s + 1) % nSeg];
      tris.push({ a, b, c: d, phys: physTag, elem: physTag });
      tris.push({ a, b: d, c, phys: physTag, elem: physTag });
    }
  }
  return { nodes, tris };
}

/** Disque plein rayon R (mm) au plan z=cst, fermant la boîte. */
function diskMesh(R_mm, z_mm, nRings, nSeg0, physTag) {
  const nodes = [[0, 0, z_mm]];
  const ringStart = [];
  for (let r = 1; r <= nRings; r++) {
    ringStart.push(nodes.length);
    const rad = (r / nRings) * R_mm;
    const n = nSeg0 * r;
    for (let s = 0; s < n; s++) {
      const t = (s / n) * 2 * Math.PI;
      nodes.push([rad * Math.cos(t), rad * Math.sin(t), z_mm]);
    }
  }
  const tris = [];
  {
    const start = ringStart[0], n = (ringStart[1] ?? nodes.length) - start;
    for (let s = 0; s < n; s++) tris.push({ a: 0, b: start + s, c: start + ((s + 1) % n), phys: physTag, elem: physTag });
  }
  for (let r = 1; r < nRings; r++) {
    const s0 = ringStart[r - 1], s1 = ringStart[r];
    const n0 = s1 - s0, n1 = ((r + 1 < nRings) ? ringStart[r + 1] : nodes.length) - s1;
    for (let s = 0; s < n1; s++) {
      const j0 = s0 + Math.floor((s / n1) * n0) % n0;
      const j0n = s0 + Math.floor(((s + 1) / n1) * n0) % n0;
      const j1 = s1 + s, j1n = s1 + ((s + 1) % n1);
      tris.push({ a: j0, b: j1, c: j1n, phys: physTag, elem: physTag });
      if (j0n !== j0) tris.push({ a: j0, b: j1n, c: j0n, phys: physTag, elem: physTag });
    }
  }
  return { nodes, tris };
}

function mergeMeshes(parts) {
  const nodes = [], tris = [];
  for (const p of parts) {
    const base = nodes.length;
    nodes.push(...p.nodes);
    for (const t of p.tris) tris.push({ a: t.a + base, b: t.b + base, c: t.c + base, phys: t.phys, elem: t.elem });
  }
  return { nodes, tris };
}

// ------------------------------------------------------------------
const R = 150, a_mm = 100, H = 300;
const front = annulusMesh(a_mm, R, 0, 48, 2);
const side = cylinderMesh(R, 0, -H, 48, 6, 3);
const back = diskMesh(R, -H, 6, 8, 4);
const host = mergeMeshes([front, side, back]);

const hostVertices = front.innerRing.flatMap(p => p);

const diaphragm = buildDiaphragmMesh({
  id: 'cmp-1', type: 'diaphragm', side: 'back', axis: '+z',
  dD: 2 * a_mm, dVC: 0.4 * 2 * a_mm, hD2: 30,
  offsetX: 0, offsetY: 0, offsetZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
  meshSize_mm: 14, meshBifurcation: true, meshConform: true,
}, { hostVertices });

console.log(`diaphragm: ${diaphragm.stats.triangleCount} tris (cone ${diaphragm.coneTris?.length ?? 0}, ` +
  `cap ${diaphragm.capTris?.length ?? 0}) · snapped=${diaphragm.stats.snappedNodes} rimFromHost=${diaphragm.stats.rimFromHost}`);
if (diaphragm.stats.error) { console.error('MESH ERROR:', diaphragm.stats.error); process.exitCode = 1; }
if (!diaphragm.coneTris?.length || !diaphragm.capTris?.length) {
  console.error('FAIL: expected both a driven cone and a fixed cap for a back diaphragm.');
  process.exitCode = 1;
}

const msh = toMsh(host.nodes, host.tris, [[2, 'front'], [3, 'side'], [4, 'back']]);
const config = {
  symmetry: 'none',
  subdomains: [{
    id: 'box', name: 'Box', type: 'interior', baffle: false,
    surfaces: [
      { surfaceId: 'p:2', role: 'boundary' },
      { surfaceId: 'p:3', role: 'boundary' },
      { surfaceId: 'p:4', role: 'boundary' },
      { surfaceId: 'd:cmp-1', role: 'driven', velocity: 1, pistonAxis: [0, 0, 1] },
      { surfaceId: 'd:cmp-1:cap', role: 'boundary' },
    ],
  }],
  interfaces: [],
  diaphragms: [
    { id: 'cmp-1', nodes: diaphragm.nodes, tris: diaphragm.coneTris },
    { id: 'cmp-1:cap', nodes: diaphragm.nodes, tris: diaphragm.capTris },
  ],
};

const model = api.buildMultiDomainModel(msh, config);
const boxDomain = model.domains.get('box');
console.log(`model: ${model.elementCount} elements, box closed=${boxDomain.closed}, ` +
  `closureResidual=${boxDomain.closureResidual?.toExponential?.(2)}`);

const prep = api.prepareMultiDomain(model, null);
const S = Math.PI * (a_mm / 1000) ** 2; // aire pleine du trou, échelle de référence
const f = 100; // très en dessous de la 1re résonance de la boîte (~570 Hz pour H=300mm)
const sol = api.solveMultiDomain(f, model, prep, {});
const bal = api.multiDomainPowerBalance(model, sol);

const scale = 0.5 * RHO_AIR * C_AIR * S; // ordre de grandeur d'une résistance de rayonnement
const relDriven = Math.abs(bal.driven) / scale;
console.log(`f=${f} Hz: driven power (real) = ${bal.driven.toExponential(3)} W, scale = ${scale.toExponential(3)} W, ` +
  `|driven|/scale = ${(relDriven * 100).toFixed(2)}%`);

const ok = boxDomain.closed && relDriven < 0.05;
console.log(ok
  ? 'PASS: sealed cavity stays reactive (cone/cap split is power-consistent).'
  : 'FAIL: non-negligible real power injected into a sealed lossless cavity — sign/closure bug in the back diaphragm.');
if (!ok) process.exitCode = 1;
