// Validation du mailleur de diaphragme (src/js/panels/bemsolver/diaphragmMesh.js).
//   node scripts/diaphragm_mesh_validate.mjs
// Le module est en ESM mais le paquet n'a pas "type":"module" : on le charge
// donc par évaluation de son texte, comme les autres harnais du dépôt.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(root, 'src/js/panels/bemsolver/diaphragmMesh.js'), 'utf8')
  .replace(/^export function/gm, 'function');
const { buildDiaphragmMesh } = new Function(`${src}\nreturn { buildDiaphragmMesh };`)();

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  —  ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Arêtes orientées : une arête interne doit être parcourue en sens opposé. */
function topology(mesh) {
  const dir = new Map();
  let boundary = 0, nonManifold = 0, badWinding = 0;
  for (const t of mesh.tris) {
    for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const entry = dir.get(key) || { count: 0, forward: 0 };
      entry.count++;
      entry.forward += a < b ? 1 : -1;
      dir.set(key, entry);
    }
  }
  for (const e of dir.values()) {
    if (e.count === 1) boundary++;
    else if (e.count === 2) { if (e.forward !== 0) badWinding++; }
    else nonManifold++;
  }
  return { boundary, nonManifold, badWinding, edges: dir.size };
}

/** Le bord doit être une seule boucle : chaque nœud de bord porte exactement 2 arêtes libres. */
function boundaryIsSingleLoop(mesh) {
  const count = new Map();
  const degree = new Map();
  for (const t of mesh.tris) {
    for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      count.set(key, (count.get(key) || 0) + 1);
    }
  }
  for (const [key, n] of count) {
    if (n !== 1) continue;
    for (const v of key.split('_')) degree.set(v, (degree.get(v) || 0) + 1);
  }
  return degree.size > 0 && [...degree.values()].every(d => d === 2);
}

function area(mesh) {
  let sum = 0;
  for (const t of mesh.tris) {
    const [a, b, c] = t.map(i => mesh.nodes[i]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    sum += Math.hypot(
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0]
    ) / 2;
  }
  return sum;
}

const base = {
  id: 'cmp-test', type: 'diaphragm', axis: '+z',
  dD: 100, dD1: 50, tD1: 50, hD1: 30,
  offsetX: 0, offsetY: 0, offsetZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
  meshBifurcation: true, meshConform: false, meshSize_mm: 4,
};

console.log('\n=== 1. Topologie et cohérence de parcours (h = 4 mm) ===');
const m = buildDiaphragmMesh(base);
const topo = topology(m);
console.log(`  ${m.stats.triangleCount} triangles, ${m.stats.nodeCount} nœuds, arêtes ${m.stats.minEdge_mm.toFixed(2)}–${m.stats.maxEdge_mm.toFixed(2)} mm`);
check('maillage non vide', m.stats.triangleCount > 100, `${m.stats.triangleCount} triangles`);
check('aucune arête non-manifold', topo.nonManifold === 0, `${topo.nonManifold}`);
check('parcours cohérent entre voisins', topo.badWinding === 0, `${topo.badWinding} arêtes mal orientées`);
check('bord unique (couronne extérieure)', topo.boundary > 0, `${topo.boundary} arêtes de bord`);
check('le bord forme une boucle fermée', boundaryIsSingleLoop(m), 'chaque nœud de bord porte 2 arêtes');

console.log('\n=== 2. Aire vs surface de révolution exacte ===');
// Référence : révolution du profil exact (calotte elliptique puis cône),
// intégrée sur une polyligne très fine.
function revolutionArea({ dD, dD1, tD1, hD1 }, steps = 200000) {
  const a = dD1 / 2, rOut = dD / 2;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([a * t, hD1 * Math.sqrt(Math.max(0, 1 - t * t))]);
  }
  pts.push([rOut, tD1]);
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const ds = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    s += Math.PI * (pts[i][0] + pts[i - 1][0]) * ds;
  }
  return s;
}
const analytic = revolutionArea(base);
const err = Math.abs(area(m) - analytic) / analytic;
check('aire à moins de 2 %', err < 0.02, `${(err * 100).toFixed(2)} % (${area(m).toFixed(0)} vs ${analytic.toFixed(0)} mm²)`);
const fine = buildDiaphragmMesh({ ...base, meshSize_mm: 2 });
const errFine = Math.abs(area(fine) - analytic) / analytic;
check('convergence en raffinant', errFine < err, `${(errFine * 100).toFixed(2)} % à h = 2 mm`);

console.log('\n=== 3. Bifurcation : densité homogène ===');
const withBif = buildDiaphragmMesh({ ...base, meshBifurcation: true });
const noBif = buildDiaphragmMesh({ ...base, meshBifurcation: false });
const ratio = (x) => x.stats.maxEdge_mm / x.stats.minEdge_mm;
console.log(`  avec  : ${withBif.stats.nodeCount} nœuds, ratio max/min = ${ratio(withBif).toFixed(1)}`);
console.log(`  sans  : ${noBif.stats.nodeCount} nœuds, ratio max/min = ${ratio(noBif).toFixed(1)}`);
check('moins de nœuds avec bifurcation', withBif.stats.nodeCount < noBif.stats.nodeCount);
check('meilleur rapport d\'aspect avec bifurcation', ratio(withBif) < ratio(noBif));
check('arête max proche de la cible', withBif.stats.maxEdge_mm < base.meshSize_mm * 2.5,
  `${withBif.stats.maxEdge_mm.toFixed(2)} mm pour h = ${base.meshSize_mm} mm`);

console.log('\n=== 4. Orientations et décalages ===');
for (const axis of ['+x', '-x', '+y', '-y', '+z', '-z']) {
  const mm = buildDiaphragmMesh({ ...base, axis });
  const t = topology(mm);
  check(`axe ${axis} : topologie saine`, t.nonManifold === 0 && t.badWinding === 0 && mm.tris.length > 0);
}
const shifted = buildDiaphragmMesh({ ...base, offsetZ: 10 });
const dz = shifted.nodes[0][2] - m.nodes[0][2];
check('offset Z appliqué', Math.abs(dz - 10) < 1e-9, `${dz.toFixed(3)} mm`);
const maxX = (mesh) => mesh.nodes.reduce((mx, n) => Math.max(mx, n[0]), -Infinity);
const scaled = buildDiaphragmMesh({ ...base, scaleX: 2 });
check('scale X appliqué', Math.abs(maxX(scaled) / maxX(m) - 2) < 1e-9, `×${(maxX(scaled) / maxX(m)).toFixed(4)}`);
const rotatedX = buildDiaphragmMesh({ ...base, rotationX_deg: 90 });
const sourcePoint = m.nodes[100], rotatedPoint = rotatedX.nodes[100];
check('rotation X appliquée',
  Math.abs(rotatedPoint[0] - sourcePoint[0]) < 1e-9
    && Math.abs(rotatedPoint[1] + sourcePoint[2]) < 1e-9
    && Math.abs(rotatedPoint[2] - sourcePoint[1]) < 1e-9,
  `(${sourcePoint.map(v => v.toFixed(2)).join(', ')}) -> (${rotatedPoint.map(v => v.toFixed(2)).join(', ')})`);

console.log('\n=== 5. Conformité au maillage hôte ===');
// Anneau de sommets hôtes légèrement décalés du bord théorique, DANS le plan de
// la couronne (le profil a u = 0 au rim, donc z = offsetZ).
const rimRadius = base.dD / 2;
const host = [];
for (let i = 0; i < 64; i++) {
  const a = (2 * Math.PI * i) / 64;
  host.push((rimRadius + 0.4) * Math.cos(a), (rimRadius + 0.4) * Math.sin(a), 0);
}
const conformed = buildDiaphragmMesh({ ...base, meshConform: true }, { hostVertices: host });
check('couronne reprise du maillage hôte', conformed.stats.rimFromHost === true);
const onHost = conformed.nodes.filter(n => Math.abs(Math.hypot(n[0], n[1]) - (rimRadius + 0.4)) < 1e-12).length;
check('nœuds de bord aux coordonnées exactes de l\'hôte', onHost === 64, `${onHost}/64`);
const ct = topology(conformed);
check('topologie saine avec couronne hôte', ct.nonManifold === 0 && ct.badWinding === 0,
  `${ct.nonManifold} non-manifold, ${ct.badWinding} mal orientées`);
const free = buildDiaphragmMesh({ ...base, meshConform: false }, { hostVertices: host });
check('conformité désactivable', free.stats.rimFromHost !== true);

const noisyHost = host.slice();
for (let i = 0; i < 64; i++) {
  const a = (2 * Math.PI * i) / 64;
  noisyHost.push(48 * Math.cos(a), 48 * Math.sin(a), 0);
  noisyHost.push(50.4 * Math.cos(a), 50.4 * Math.sin(a), 1.5);
}
const noisyConformed = buildDiaphragmMesh({ ...base, meshConform: true }, { hostVertices: noisyHost });
check('couronne stable avec sommets parasites du common mesh', noisyConformed.stats.nodeCount === conformed.stats.nodeCount,
  `${noisyConformed.stats.nodeCount} nœuds vs ${conformed.stats.nodeCount}`);
const noisyOnHost = noisyConformed.nodes.filter(n => Math.abs(Math.hypot(n[0], n[1]) - (rimRadius + 0.4)) < 1e-12).length;
check('couronne parasite exclue', noisyOnHost === 64, `${noisyOnHost}/64`);

const closedHost = host.slice();
closedHost.push(host[0], host[1], host[2]);
const closedConformed = buildDiaphragmMesh({ ...base, meshConform: true }, { hostVertices: closedHost });
check('doublon de fermeture de couronne supprimé', closedConformed.stats.nodeCount === conformed.stats.nodeCount,
  `${closedConformed.stats.nodeCount} nœuds vs ${conformed.stats.nodeCount}`);
const closedTopo = topology(closedConformed);
check('topologie saine après fermeture de couronne', closedTopo.nonManifold === 0 && closedTopo.badWinding === 0,
  `${closedTopo.nonManifold} non-manifold, ${closedTopo.badWinding} mal orientées`);

console.log('\n=== 5 bis. Réduction par symétrie ===');
// Hôte réduit au quadrant x ≥ 0, y ≥ 0 : le diaphragme doit l'être aussi, sinon
// les images miroir du solveur le démultiplient, son sous-domaine reste ouvert
// et la source rayonne en champ libre (ballon de directivité retourné).
const quarterHost = [];
for (let i = 0; i <= 32; i++) {
  const a = ((Math.PI / 2) * i) / 32;
  quarterHost.push((rimRadius + 0.4) * Math.cos(a), (rimRadius + 0.4) * Math.sin(a), 0);
}
const quarter = buildDiaphragmMesh({ ...base, meshConform: true }, { hostVertices: quarterHost, symmetry: 'hv' });
check('maillage restreint au quadrant',
  quarter.tris.length > 0 && quarter.nodes.every(n => n[0] > -1e-9 && n[1] > -1e-9),
  `${quarter.stats.triangleCount} triangles`);
const qt = topology(quarter);
check('topologie saine sur le quadrant', qt.nonManifold === 0 && qt.badWinding === 0,
  `${qt.nonManifold} non-manifold, ${qt.badWinding} mal orientées`);
check('aire ≈ un quart de l\'entier', Math.abs(area(quarter) / area(conformed) - 0.25) < 0.05,
  `${(area(quarter) / area(conformed)).toFixed(3)}`);

console.log('\n=== 6. Taille auto calée sur le maillage hôte ===');
const auto = buildDiaphragmMesh({ ...base, meshSize_mm: 0 }, { hostEdge_mm: 6 });
check('taille auto = arête médiane hôte', Math.abs(auto.stats.targetSize_mm - 6) < 1e-9, `${auto.stats.targetSize_mm}`);

console.log(failures ? `\n================ ${failures} FAIL ================\n` : '\n================ ALL PASS ================\n');
process.exit(failures ? 1 : 0);
