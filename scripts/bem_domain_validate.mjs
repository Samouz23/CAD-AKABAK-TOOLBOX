// =======================================================
// FICHIER :  scripts/bem_domain_validate.mjs
// RÔLE    :  Validation numérique du solveur BEM multi-domaine.
//
//  Le cas de référence est le PISTON CIRCULAIRE PLAN DANS UN BAFFLE INFINI,
//  dont la pression en champ lointain est connue analytiquement :
//
//      p(r,theta) = i·rho·c·k·a²·u0/(2r) · e^{ikr} · [2·J1(ka·sin θ)/(ka·sin θ)]
//
//  On vérifie :
//    1. la directivité normalisée contre 2·J1(x)/x, à plusieurs ka ;
//    2. la pression sur l'axe contre rho·c·k·a²·u0/(2r) ;
//    3. le bilan de puissance contre la résistance de rayonnement
//       R = rho·c·S·[1 - 2·J1(2ka)/(2ka)] ;
//    4. la continuité à travers une interface (deux domaines chaînés).
//
//  Lancement :  node scripts/bem_domain_validate.mjs
// =======================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// bemDomainCore.js consomme les primitives de bemShared.js comme des globales
// (c'est ainsi que le worker les assemble). On reproduit ce contexte.
const context = vm.createContext({ console, performance });
for (const f of ['src/js/bem/bemShared.js', 'src/js/bem/bemDomainCore.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), context, { filename: f });
}
const api = vm.runInContext(`({
  buildMultiDomainModel, prepareMultiDomain, solveMultiDomain,
  computeMultiDomainPolar, multiDomainPowerBalance, multiDomainFieldPressure,
  pickRadiatingDomain, C_AIR, RHO_AIR,
})`, context);

const { C_AIR, RHO_AIR } = api;

// Le mailleur de diaphragme est un module ESM du panneau ; le paquet n'ayant
// pas "type":"module", on l'évalue comme les sources du solveur.
const { buildDiaphragmMesh } = new Function(
  `${readFileSync(join(root, 'src/js/panels/bemsolver/diaphragmMesh.js'), 'utf8').replace(/^export function/gm, 'function')}
   return { buildDiaphragmMesh };`
)();

// ------------------------------------------------------------------
// Génération de maillages .msh (Gmsh ASCII 2.2) en mémoire
// ------------------------------------------------------------------
function toMsh(nodes, tris, physicalNames) {
  const lines = ['$MeshFormat', '2.2 0 8', '$EndMeshFormat'];
  if (physicalNames && physicalNames.length) {
    lines.push('$PhysicalNames', String(physicalNames.length));
    for (const [tag, name] of physicalNames) lines.push(`2 ${tag} "${name}"`);
    lines.push('$EndPhysicalNames');
  }
  lines.push('$Nodes', String(nodes.length));
  nodes.forEach((n, i) => lines.push(`${i + 1} ${n[0]} ${n[1]} ${n[2]}`));
  lines.push('$EndNodes', '$Elements', String(tris.length));
  tris.forEach((t, i) => lines.push(`${i + 1} 2 2 ${t.phys} ${t.elem} ${t.a + 1} ${t.b + 1} ${t.c + 1}`));
  lines.push('$EndElements');
  return lines.join('\n');
}

/**
 * Disque plan de rayon `a` (mm) dans le plan z = 0, normale +Z, maillé en
 * anneaux concentriques. C'est le piston bafflé.
 */
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
  // Premier anneau : éventail depuis le centre.
  {
    const start = ringStart[0];
    const n = (ringStart[1] ?? nodes.length) - start;
    for (let s = 0; s < n; s++) {
      tris.push({ a: 0, b: start + s, c: start + ((s + 1) % n), phys: physTag, elem: physTag });
    }
  }
  for (let r = 1; r < nRings; r++) {
    const s0 = ringStart[r - 1], s1 = ringStart[r];
    const n0 = s1 - s0;
    const n1 = ((r + 1 < nRings) ? ringStart[r + 1] : nodes.length) - s1;
    for (let s = 0; s < n1; s++) {
      const t = s / n1;
      const j0 = s0 + Math.floor(t * n0) % n0;
      const j0n = s0 + Math.floor(((s + 1) / n1) * n0) % n0;
      const j1 = s1 + s, j1n = s1 + ((s + 1) % n1);
      tris.push({ a: j0, b: j1, c: j1n, phys: physTag, elem: physTag });
      if (j0 !== j0n) tris.push({ a: j0, b: j1n, c: j0n, phys: physTag, elem: physTag });
    }
  }
  return { nodes, tris };
}

// ------------------------------------------------------------------
// Références analytiques
// ------------------------------------------------------------------
function besselJ1(x) {
  if (x === 0) return 0;
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const p1 = x * (72362614232 + y * (-7895059235 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * (-30.16036606))))));
    const p2 = 144725228442 + y * (2300535178 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return p1 / p2;
  }
  const z = 8 / ax, y = z * z;
  const xx = ax - 2.356194491;
  const p1 = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * (-0.240337019e-6))));
  const p2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const r = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2);
  return x < 0 ? -r : r;
}
const directivityRef = (x) => (x === 0 ? 1 : Math.abs(2 * besselJ1(x) / x));

// ------------------------------------------------------------------
// Harnais
// ------------------------------------------------------------------
let failures = 0, checks = 0;
// `node scripts/bem_domain_validate.mjs 4` ne joue que la section 4.
const only = process.argv[2];
const want = (n) => !only || only.split(',').includes(String(n));
function check(label, got, want, tol, unit = '') {
  checks++;
  const err = Math.abs(got - want);
  const ok = err <= tol;
  if (!ok) failures++;
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${label}: got ${got.toFixed(4)}${unit}, want ${want.toFixed(4)}${unit} (|err| ${err.toFixed(4)} <= ${tol})`);
}

console.log('\n=== 1. Baffled circular piston ===');
if (want(1)) {
  const a_mm = 100, a_m = 0.1;
  const { nodes, tris } = diskMesh(a_mm, 10, 1);
  const msh = toMsh(nodes, tris, [[1, 'piston']]);

  const config = {
    symmetry: 'none',
    subdomains: [{
      id: 'ext', name: 'Air', type: 'exterior', baffle: true,
      surfaces: [{ surfaceId: 'p:1', role: 'driven', velocity: 1 }],
    }],
    interfaces: [],
  };

  const model = api.buildMultiDomainModel(msh, config);
  console.log(`  mesh: ${model.elementCount} elements, ${model.nUnknowns} unknowns`);
  const prep = api.prepareMultiDomain(model, null);
  console.log(`  domain closed=${prep.diagnostics[0].closed} (planar aperture ⇒ expected false ⇒ free term 1/2)`);

  const dom = api.pickRadiatingDomain(model);

  for (const ka of [1, 2, 4]) {
    const f = ka * C_AIR / (2 * Math.PI * a_m);
    const sol = api.solveMultiDomain(f, model, prep, {});
    const r = 20; // champ lointain : r >> a et r >> ka·a²/2
    const pol = api.computeMultiDomainPolar(model, sol, dom, 'H', r, 15, 90);

    // (1) directivité
    let worst = 0;
    for (let i = 0; i < pol.angles.length; i++) {
      const th = Math.abs(pol.angles[i]) * Math.PI / 180;
      if (th > 75 * Math.PI / 180) continue; // rasant : P0 grossier
      const want = directivityRef(ka * Math.sin(th));
      worst = Math.max(worst, Math.abs(pol.normalized[i] - want));
    }
    check(`ka=${ka} directivity (worst dev over ±75°)`, worst, 0, 0.06);

    // (2) pression sur l'axe : |p| = rho·c·k·a²·u0/(2r)
    const axisIdx = pol.angles.findIndex(x => Math.abs(x) < 1e-9);
    const k = 2 * Math.PI * f / C_AIR;
    const wantAxis = RHO_AIR * C_AIR * k * a_m * a_m / (2 * r);
    const gotAxis = pol.pressureMags[axisIdx];
    check(`ka=${ka} on-axis |p| ratio`, gotAxis / wantAxis, 1, 0.08);

    // (3) puissance rayonnée vs résistance de rayonnement analytique
    const bal = api.multiDomainPowerBalance(model, sol);
    const S = Math.PI * a_m * a_m;
    const x = 2 * k * a_m;
    const Rrad = RHO_AIR * C_AIR * S * (1 - 2 * besselJ1(x) / x);
    const wantW = 0.5 * Rrad * 1 * 1;
    check(`ka=${ka} radiated power ratio`, bal.radiated / wantW, 1, 0.10);
  }
}

console.log('\n=== 2. Interface continuity (two chained domains) ===');
if (want(2)) {
  // Un cylindre court fermé par un piston à z=0 et ouvert sur un plan
  // d'interface à z=L, lui-même bordé par un domaine extérieur bafflé.
  //
  // On rejoue le MÊME problème sous quatre écritures différentes : normales
  // dessinées vers l'extérieur ou vers l'intérieur (convention Akabak), et
  // interface déclarée intérieur→extérieur ou extérieur→intérieur. La physique
  // ne doit pas bouger : c'est le test de non-régression de l'auto-orientation.
  const a_mm = 60, L_mm = 80;
  const nSeg = 24, nAx = 6;

  function buildCylinder(flipAll, flipInterface) {
    const nodes = [], tris = [];
    const push = (a, b, c, phys) => {
      const rev = phys === 3 ? (flipAll !== !!flipInterface) : flipAll;
      tris.push(rev ? { a, b: c, c: b, phys, elem: phys } : { a, b, c, phys, elem: phys });
    };

    const ringIdx = [];
    for (let z = 0; z <= nAx; z++) {
      const start = nodes.length;
      for (let s = 0; s < nSeg; s++) {
        const t = (s / nSeg) * 2 * Math.PI;
        nodes.push([a_mm * Math.cos(t), a_mm * Math.sin(t), (z / nAx) * L_mm]);
      }
      ringIdx.push(start);
    }
    for (let z = 0; z < nAx; z++) {
      const s0 = ringIdx[z], s1 = ringIdx[z + 1];
      for (let s = 0; s < nSeg; s++) {
        const sn = (s + 1) % nSeg;
        push(s0 + s, s0 + sn, s1 + sn, 2);
        push(s0 + s, s1 + sn, s1 + s, 2);
      }
    }
    const cBot = nodes.length; nodes.push([0, 0, 0]);
    for (let s = 0; s < nSeg; s++) push(cBot, ringIdx[0] + ((s + 1) % nSeg), ringIdx[0] + s, 1);
    const cTop = nodes.length; nodes.push([0, 0, L_mm]);
    for (let s = 0; s < nSeg; s++) push(cTop, ringIdx[nAx] + s, ringIdx[nAx] + ((s + 1) % nSeg), 3);

    return toMsh(nodes, tris, [[1, 'piston'], [2, 'wall'], [3, 'mouth']]);
  }

  const variants = [
    { label: 'outward normals, interface in→out       ', flip: false, reverse: false, flipIf: false },
    { label: 'INWARD normals (Akabak style)          ', flip: true, reverse: false, flipIf: false },
    { label: 'outward normals, interface out→in      ', flip: false, reverse: true, flipIf: false },
    { label: 'INWARD normals, interface out→in       ', flip: true, reverse: true, flipIf: false },
    // Cas réel rencontré : parois et piston vers l'intérieur, interface vers
    // l'extérieur — normales incohérentes AU SEIN d'un même domaine.
    { label: 'MIXED: walls in, interface out, out→in ', flip: true, reverse: true, flipIf: true },
    { label: 'MIXED: walls out, interface in, in→out ', flip: false, reverse: false, flipIf: true },
  ];

  const radiatedByVariant = [];
  for (const v of variants) {
    const msh = buildCylinder(v.flip, v.flipIf);
    const config = {
      symmetry: 'none',
      subdomains: [
        {
          id: 'in', name: 'Cavity', type: 'interior', baffle: false,
          surfaces: [
            { surfaceId: 'p:1', role: 'driven', velocity: 1 },
            { surfaceId: 'p:2', role: 'boundary' },
          ],
        },
        { id: 'out', name: 'Air', type: 'exterior', baffle: true, surfaces: [] },
      ],
      interfaces: [{
        id: 'if1', name: 'Mouth',
        fromId: v.reverse ? 'out' : 'in',
        toId: v.reverse ? 'in' : 'out',
        surfaces: [{ surfaceId: 'p:3' }],
      }],
    };

    const model = api.buildMultiDomainModel(msh, config);
    const prep = api.prepareMultiDomain(model, null);
    const sol = api.solveMultiDomain(300, model, prep, {});
    const bal = api.multiDomainPowerBalance(model, sol);
    const flips = prep.diagnostics.filter(d => d.flipped).map(d => d.domain).join(',') || 'none';

    console.log(`  ${v.label} | radiated=${bal.radiated.toExponential(4)} W, mismatch=${(bal.mismatch * 100).toFixed(2)}%, auto-flipped: ${flips}`);
    check(`    energy conservation`, bal.mismatch, 0, 0.05);
    check(`    radiated power positive`, Math.sign(bal.radiated), 1, 0);
    radiatedByVariant.push(bal.radiated);
  }

  // Les quatre écritures doivent donner la même puissance rayonnée.
  const ref = radiatedByVariant[0];
  for (let i = 1; i < radiatedByVariant.length; i++) {
    check(`  variant ${i} matches variant 0`, radiatedByVariant[i] / ref, 1, 1e-6);
  }
}

console.log('\n=== 3. Quarter mesh with HV symmetry ===');
if (want(3)) {
  // Même piston circulaire, mais maillé sur un quart exact (secteur
  // theta dans [0, pi/2]) et résolu avec symétrie HV. Les plans de coupe sont
  // absents du fichier : le test de fermeture doit les ignorer, sinon aucun
  // quart ni demi-maillage ne serait exploitable.
  const a_mm = 100, a_m = 0.1;
  const nR = 10, nT = 14;
  const nodes = [[0, 0, 0]];
  const at = (i, j) => 1 + (i - 1) * (nT + 1) + j;
  for (let i = 1; i <= nR; i++) {
    for (let j = 0; j <= nT; j++) {
      const r = (i / nR) * a_mm, t = (j / nT) * (Math.PI / 2);
      nodes.push([r * Math.cos(t), r * Math.sin(t), 0]);
    }
  }
  const tris = [];
  for (let j = 0; j < nT; j++) tris.push({ a: 0, b: at(1, j), c: at(1, j + 1), phys: 1, elem: 1 });
  for (let i = 1; i < nR; i++) {
    for (let j = 0; j < nT; j++) {
      tris.push({ a: at(i, j), b: at(i + 1, j), c: at(i + 1, j + 1), phys: 1, elem: 1 });
      tris.push({ a: at(i, j), b: at(i + 1, j + 1), c: at(i, j + 1), phys: 1, elem: 1 });
    }
  }
  const msh = toMsh(nodes, tris, [[1, 'piston']]);

  const config = {
    symmetry: 'hv',
    subdomains: [{
      id: 'ext', name: 'Air', type: 'exterior', baffle: true,
      surfaces: [{ surfaceId: 'p:1', role: 'driven', velocity: 1 }],
    }],
    interfaces: [],
  };
  const model = api.buildMultiDomainModel(msh, config);
  const prep = api.prepareMultiDomain(model, null);
  const dom = api.pickRadiatingDomain(model);
  const quarterArea = model.elements.reduce((s, e) => s + e.area, 0);
  console.log(`  quarter mesh: ${model.elementCount} elements, mirrors=${model.mirrorCount}, ` +
    `area x4 = ${(quarterArea * 4 * 1e4).toFixed(1)} cm2 (disk = ${(Math.PI * a_m * a_m * 1e4).toFixed(1)} cm2)`);

  const ka = 2;
  const f = ka * C_AIR / (2 * Math.PI * a_m);
  const sol = api.solveMultiDomain(f, model, prep, {});
  const r = 20;
  const pol = api.computeMultiDomainPolar(model, sol, dom, 'H', r, 15, 90);

  let worst = 0;
  for (let i = 0; i < pol.angles.length; i++) {
    const th = Math.abs(pol.angles[i]) * Math.PI / 180;
    if (th > 75 * Math.PI / 180) continue;
    worst = Math.max(worst, Math.abs(pol.normalized[i] - directivityRef(ka * Math.sin(th))));
  }
  check(`ka=${ka} quarter-mesh directivity`, worst, 0, 0.06);

  const bal = api.multiDomainPowerBalance(model, sol);
  const S = Math.PI * a_m * a_m;
  const k = 2 * Math.PI * f / C_AIR;
  const x = 2 * k * a_m;
  const wantW = 0.5 * RHO_AIR * C_AIR * S * (1 - 2 * besselJ1(x) / x);
  check(`ka=${ka} quarter-mesh radiated power ratio`, bal.radiated / wantW, 1, 0.10);
}

console.log('\n=== 4. Diaphragm source injected through config.diaphragms ===');
if (want(4)) {
  // Même piston bafflé, mais la surface pilotée n'est plus dans le .msh : elle
  // est produite par le mailleur de diaphragme (calotte plate) et injectée par
  // `config.diaphragms`. Le .msh hôte ne sert que de porteur.
  const a_mm = 100, a_m = 0.1;
  const diaphragm = buildDiaphragmMesh({
    id: 'cmp-1', type: 'diaphragm', axis: '+z',
    dD: 2 * a_mm, dD1: 0, tD1: 0, hD1: 0,
    offsetX: 0, offsetY: 0, offsetZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
    meshSize_mm: 10, meshBifurcation: true, meshConform: false,
  });

  const { nodes, tris } = diskMesh(a_mm, 10, 1);
  const config = {
    symmetry: 'none',
    subdomains: [{
      id: 'ext', name: 'Air', type: 'exterior', baffle: true,
      surfaces: [{ surfaceId: 'd:cmp-1', role: 'driven', velocity: 1 }],
    }],
    interfaces: [],
    diaphragms: [{ id: 'cmp-1', nodes: diaphragm.nodes, tris: diaphragm.tris }],
  };

  const model = api.buildMultiDomainModel(toMsh(nodes, tris, [[1, 'unused']]), config);
  console.log(`  diaphragm: ${diaphragm.stats.triangleCount} triangles ⇒ model has ${model.elementCount} elements`);
  check('every diaphragm triangle reached the model', model.elementCount, diaphragm.stats.triangleCount, 0);

  const area = model.elements.reduce((s, e) => s + e.area, 0);
  check('diaphragm area vs disk', area / (Math.PI * a_m * a_m), 1, 0.03);

  const prep = api.prepareMultiDomain(model, null);
  const dom = api.pickRadiatingDomain(model);
  const ka = 2;
  const f = ka * C_AIR / (2 * Math.PI * a_m);
  const sol = api.solveMultiDomain(f, model, prep, {});
  const pol = api.computeMultiDomainPolar(model, sol, dom, 'H', 20, 15, 90);

  let worst = 0;
  for (let i = 0; i < pol.angles.length; i++) {
    const th = Math.abs(pol.angles[i]) * Math.PI / 180;
    if (th > 75 * Math.PI / 180) continue;
    worst = Math.max(worst, Math.abs(pol.normalized[i] - directivityRef(ka * Math.sin(th))));
  }
  check(`ka=${ka} diaphragm directivity (worst dev over ±75°)`, worst, 0, 0.06);

  const bal = api.multiDomainPowerBalance(model, sol);
  const S = Math.PI * a_m * a_m;
  const k = 2 * Math.PI * f / C_AIR;
  const x = 2 * k * a_m;
  const wantW = 0.5 * RHO_AIR * C_AIR * S * (1 - 2 * besselJ1(x) / x);
  check(`ka=${ka} diaphragm radiated power ratio`, bal.radiated / wantW, 1, 0.10);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} / ${checks} CHECKS FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
