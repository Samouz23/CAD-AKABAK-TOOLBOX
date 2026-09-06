// Validation de la géométrie des nappes d'observation (src/js/panels/bemsolver/fieldGeometry.js).
//   node scripts/field_geometry_validate.mjs
// Le module est en ESM mais le paquet n'a pas "type":"module" : on le charge
// donc par évaluation de son texte, comme les autres harnais du dépôt.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(root, 'src/js/panels/bemsolver/fieldGeometry.js'), 'utf8')
  .replace(/^export function/gm, 'function');
const { buildFieldGeometry } = new Function(`${src}\nreturn { buildFieldGeometry };`)();

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  —  ${detail}` : ''}`);
  if (!ok) failures++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('=== Plane field ===');
{
  const g = buildFieldGeometry({
    fieldType: 'plane', axis: '+z',
    offsetX_mm: 0, offsetY_mm: 0, offsetZ_mm: 500,
    width_mm: 1000, height_mm: 400, delta_mm: 100,
  });
  check('grid size 11 × 5', g.stats.gridU === 11 && g.stats.gridV === 5, `${g.stats.gridU}×${g.stats.gridV}`);
  check('point count matches grid', g.points.length === 11 * 5, `${g.points.length}`);
  check('all points on the plane z = 500', g.points.every(p => near(p[2], 500, 1e-9)));
  const xs = g.points.map(p => p[0]), ys = g.points.map(p => p[1]);
  check('spans width on x', near(Math.min(...xs), -500, 1e-9) && near(Math.max(...xs), 500, 1e-9));
  check('spans height on y', near(Math.min(...ys), -200, 1e-9) && near(Math.max(...ys), 200, 1e-9));
  check('two triangles per cell', g.tris.length === 2 * 10 * 4, `${g.tris.length}`);
  check('indices in range', g.tris.every(t => t.every(i => i >= 0 && i < g.points.length)));
}

console.log('\n=== Plane field on the X axis ===');
{
  const g = buildFieldGeometry({
    fieldType: 'plane', axis: '-x',
    offsetX_mm: 250, offsetY_mm: 0, offsetZ_mm: 0,
    width_mm: 200, height_mm: 200, delta_mm: 100,
  });
  check('normal to x: all points at x = 250', g.points.every(p => near(p[0], 250, 1e-9)));
}

console.log('\n=== Balloon field ===');
{
  const R = 1000;
  const g = buildFieldGeometry({
    fieldType: 'balloon', axis: '+z',
    offsetX_mm: 0, offsetY_mm: 0, offsetZ_mm: 0,
    radius_mm: R, deltaTheta_deg: 30, deltaPhi_deg: 45,
  });
  check('grid 8 phi × 7 theta', g.stats.gridU === 8 && g.stats.gridV === 7, `${g.stats.gridU}×${g.stats.gridV}`);
  check('every point on the sphere', g.points.every(p => near(Math.hypot(p[0], p[1], p[2]), R, 1e-6)));
  const zs = g.points.map(p => p[2]);
  check('reaches both poles', near(Math.max(...zs), R, 1e-6) && near(Math.min(...zs), -R, 1e-6));
  check('phi seam is closed (wrapped triangles)', g.tris.some(t => t.some(i => i < 7) && t.some(i => i >= 7 * 7)));
  check('indices in range', g.tris.every(t => t.every(i => i >= 0 && i < g.points.length)));
}

console.log('\n=== Balloon offset and pole axis ===');
{
  const g = buildFieldGeometry({
    fieldType: 'balloon', axis: '-y',
    offsetX_mm: 100, offsetY_mm: -50, offsetZ_mm: 20,
    radius_mm: 500, deltaTheta_deg: 45, deltaPhi_deg: 90,
  });
  check('centred on the offset', g.points.every(p =>
    near(Math.hypot(p[0] - 100, p[1] + 50, p[2] - 20), 500, 1e-6)));
  const ys = g.points.map(p => p[1]);
  check('pole on -y', near(Math.min(...ys), -550, 1e-6) && near(Math.max(...ys), 450, 1e-6));
}

console.log(failures ? `\n${failures} failure(s).` : '\nAll checks passed.');
process.exitCode = failures ? 1 : 0;
