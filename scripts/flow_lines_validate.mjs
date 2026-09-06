// =======================================================
// FICHIER :  scripts/flow_lines_validate.mjs
// RÔLE    :  Validation du tracé de lignes de courant et d'iso-lignes sur des
//            champs ANALYTIQUES, où la réponse est connue :
//              1. champ uniforme      → lignes droites, toutes parallèles ;
//              2. tourbillon rigide   → lignes circulaires, rayon conservé ;
//              3. champ masqué (NaN)  → aucune ligne ne traverse la paroi ;
//              4. phase de débit max  → maximise bien Σ|v(θ)|².
//
//  Lancement : node scripts/flow_lines_validate.mjs
// =======================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = readFileSync(join(root, 'src/js/panels/bemsolver/flowLines.js'), 'utf8')
  .replace(/^export function/gm, 'function');
const { buildStreamlines, buildIsoLines, peakFlowPhase } = new Function(
  `${src}\n return { buildStreamlines, buildIsoLines, peakFlowPhase };`)();

let failures = 0;
function check(label, got, want, tol, unit = '') {
  const err = Math.abs(got - want);
  const ok = err <= tol;
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}: got ${got.toFixed(4)}${unit}, want ${want.toFixed(4)}${unit} (|err| ${err.toFixed(4)} <= ${tol})`);
}

/** Nappe plane carrée dans z = 0, pas de 10 mm, champ donné par `fn(x, y)` en m/s. */
function makeField(n, fn) {
  const points = [];
  const vRe = new Float32Array(3 * n * n);
  const vIm = new Float32Array(3 * n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (i - (n - 1) / 2) * 10, y = (j - (n - 1) / 2) * 10;
      points.push([x, y, 0]);
      const v = fn(x, y);
      const k = 3 * (i * n + j);
      vRe[k] = v[0]; vRe[k + 1] = v[1]; vRe[k + 2] = 0;
      if (v[3]) { vRe[k] = NaN; vRe[k + 1] = NaN; vRe[k + 2] = NaN; }
    }
  }
  return { points, gridU: n, gridV: n, vRe, vIm, scale: 1 };
}

const segs = (r) => r.positions.length / 6;

console.log('\n=== 1. Champ uniforme (+x) ===');
{
  const f = makeField(41, () => [1, 0]);
  const r = buildStreamlines(f, { phaseRad: 0, separation: 4, arrowEvery: 1e9 });
  console.log(`  ${segs(r)} segments`);
  // Toutes les lignes doivent être horizontales : y constant sur chaque segment.
  let worstDy = 0;
  for (let s = 0; s < segs(r); s++) {
    const o = 6 * s;
    worstDy = Math.max(worstDy, Math.abs(r.positions[o + 4] - r.positions[o + 1]));
  }
  check('déviation transverse maximale', worstDy, 0, 1e-3, ' mm');
  check('des lignes ont été tracées', segs(r) > 100 ? 1 : 0, 1, 0);
}

console.log('\n=== 2. Tourbillon rigide (v = ω × r) ===');
{
  const f = makeField(61, (x, y) => [-y / 1000, x / 1000]);
  const r = buildStreamlines(f, { phaseRad: 0, separation: 5, arrowEvery: 20 });
  console.log(`  ${segs(r)} segments, ${r.arrows.length / 6} barbes de flèche`);
  // Une ligne de courant d'un tourbillon rigide est un cercle centré : le rayon
  // ne doit pas dériver d'un bout à l'autre d'un segment.
  let worstDr = 0;
  for (let s = 0; s < segs(r); s++) {
    const o = 6 * s;
    const r0 = Math.hypot(r.positions[o], r.positions[o + 1]);
    const r1 = Math.hypot(r.positions[o + 3], r.positions[o + 4]);
    if (r0 < 20) continue;                        // le centre est singulier
    worstDr = Math.max(worstDr, Math.abs(r1 - r0) / r0);
  }
  check('dérive relative du rayon par pas', worstDr, 0, 0.02);

  // Les FLÈCHES doivent toutes pointer dans le sens de l'écoulement, y compris
  // sur la moitié intégrée à rebours. La pointe est le 1er sommet de la barbe.
  let correct = 0, total = 0;
  for (let s = 0; s < r.arrows.length / 6; s++) {
    const o = 6 * s;
    const tx = r.arrows[o], ty = r.arrows[o + 1];
    if (Math.hypot(tx, ty) < 20) continue;
    // Direction de la flèche = pointe - milieu des deux barbes ; ici on prend
    // pointe - queue, dont la composante tangentielle donne le sens.
    const dx = tx - r.arrows[o + 3], dy = ty - r.arrows[o + 4];
    total++;
    if (tx * dy - ty * dx > 0) correct++;         // sens direct du tourbillon
  }
  check('fraction de flèches dans le sens du courant', correct / total, 1, 0.001);
}

console.log('\n=== 3. Paroi masquée (NaN) ===');
{
  // Bande masquée au milieu : aucune ligne ne doit la traverser.
  const f = makeField(41, (x) => [1, 0, 0, Math.abs(x) < 5]);
  const r = buildStreamlines(f, { phaseRad: 0, separation: 4, arrowEvery: 1e9 });
  let crossing = 0;
  for (let s = 0; s < segs(r); s++) {
    const o = 6 * s;
    if (Math.sign(r.positions[o]) !== Math.sign(r.positions[o + 3])) crossing++;
  }
  check('segments traversant la paroi', crossing, 0, 0);
  check('des lignes subsistent de part et d\'autre', segs(r) > 50 ? 1 : 0, 1, 0);
}

console.log('\n=== 4. Phase de débit maximal ===');
{
  // v̂ = (1, i) : |v(θ)|² = cos²θ + sin²θ est constant, la phase est indifférente.
  // v̂ = (1+0i, 0) : maximum à θ = 0.
  const vRe = Float32Array.from([1, 0, 0]);
  const vIm = Float32Array.from([0, 0, 0]);
  check('champ réel pur → phase 0', peakFlowPhase(vRe, vIm), 0, 1e-6, ' rad');
  const vRe2 = Float32Array.from([0, 0, 0]);
  const vIm2 = Float32Array.from([1, 0, 0]);
  check('champ imaginaire pur → phase 90°', Math.abs(peakFlowPhase(vRe2, vIm2)) * 180 / Math.PI, 90, 1e-4, '°');

  // Vérification numérique sur un champ quelconque.
  const a = Float32Array.from([0.3, 0.9, -0.2, 0.7, 0.1, 0.4]);
  const b = Float32Array.from([-0.5, 0.2, 0.8, 0.3, -0.6, 0.1]);
  const energy = (t) => {
    let s = 0;
    for (let k = 0; k < a.length; k++) { const v = a[k] * Math.cos(t) + b[k] * Math.sin(t); s += v * v; }
    return s;
  };
  const best = peakFlowPhase(a, b);
  let scan = 0, scanBest = -1;
  for (let i = 0; i < 3600; i++) { const t = i * Math.PI / 1800; const e = energy(t); if (e > scanBest) { scanBest = e; scan = t; } }
  check('énergie à la phase analytique / balayage', energy(best) / scanBest, 1, 1e-6);
}

console.log('\n=== 5. Iso-lignes ===');
{
  // Champ scalaire = x : l'iso-ligne au niveau L est la droite x = L.
  const n = 21, points = [], values = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (i - (n - 1) / 2) * 10, y = (j - (n - 1) / 2) * 10;
      points.push([x, y, 0]);
      values[i * n + j] = x;
    }
  }
  const iso = buildIsoLines(points, values, n, n, [25]);
  let worst = 0;
  for (let k = 0; k < iso.length; k += 3) worst = Math.max(worst, Math.abs(iso[k] - 25));
  check('écart de l\'iso-ligne x = 25', worst, 0, 1e-4, ' mm');
  check('iso-ligne non vide', iso.length > 0 ? 1 : 0, 1, 0);
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
if (failures) process.exitCode = 1;
