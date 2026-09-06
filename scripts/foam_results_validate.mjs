// =======================================================
// FICHIER :  scripts/foam_results_validate.mjs
// RÔLE    :  Valide la lecture des sondes OpenFOAM et la décomposition
//            harmonique (src/ipc/foamResults.js)
// USAGE   :  node scripts/foam_results_validate.mjs
// =======================================================
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const R = require(path.join(here, '..', 'src', 'ipc', 'foamResults.js'));

let failures = 0;
function check(label, condition, detail = '') {
    if (!condition) failures++;
    console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  —  ${detail}` : ''}`);
}
const close = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('=== Parsing des sondes ===');
const vectorText = `# Probe 0 (0.01 -0.185 -0.16)
# Probe 1 (0.02 -0.185 -0.07)
#       Probe             0             1
#        Time
0.001   (1 2 3)   (4 5 6)
0.002   (7 8 9)   (10 11 12)
`;
const vec = R.parseProbes(vectorText);
check('positions des sondes lues', vec.positions.length === 2 && vec.positions[1][2] === -0.07,
    JSON.stringify(vec.positions));
check('pas de temps lus', vec.times.length === 2 && vec.times[1] === 0.002);
check('champ vectoriel reconnu', vec.components === 3);
check('valeurs correctement ventilées', vec.values[1][1][2] === 12);

const scalarText = `# Probe 0 (0 0 0)
#       Time
0.001   101.3
0.002   99.7
`;
const sca = R.parseProbes(scalarText);
check('champ scalaire reconnu', sca.components === 1 && sca.values[0][0][0] === 101.3);

// OpenFOAM marque une sonde hors maillage avec GREAT au lieu de l'omettre:
// sans masquage, ces points passeraient pour du fluide à 1e300 m/s.
const outsideText = `# Probe 0 (0 0 0)
# Probe 1 (9 9 9)
#       Time
0.001   (1 2 3)   (1e+300 1e+300 1e+300)
0.002   (4 5 6)   (1e+300 1e+300 1e+300)
`;
const outside = R.parseProbes(outsideText);
check('sonde hors maillage masquée', outside.valid[0] === true && outside.valid[1] === false,
    JSON.stringify(outside.valid));
const outDec = R.harmonicDecompose(outside, 100, 1);
check('la sonde masquée n\'entache pas la décomposition',
    outDec.cos.slice(3).every(v => v === 0) && Number.isFinite(outDec.cos[0]));

console.log('\n=== Décomposition harmonique ===');
// Signal de synthèse: continu + fondamentale + une harmonique 3f qui doit se
// retrouver intégralement dans le résidu (ce que le BEM linéaire ne produit pas).
const freq = 40;
const period = 1 / freq;
const MEAN = [0.5, 0, -0.2];
const A = [3, 0, 8];
const B = [-1, 0, 2];
const H3 = [0.4, 0, 1.1];
const samples = 400;
const lines = ['# Probe 0 (0 0 0)', '#  Time'];
for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * 3 * period;
    const w = 2 * Math.PI * freq * t;
    const c = Math.cos(w), s = Math.sin(w), c3 = Math.cos(3 * w);
    const u = [0, 1, 2].map(k => MEAN[k] + A[k] * c + B[k] * s + H3[k] * c3);
    lines.push(`${t.toPrecision(10)}   (${u.join(' ')})`);
}
const probes = R.parseProbes(lines.join('\n'));
check('série de synthèse échantillonnée', probes.times.length === samples + 1);

const dec = R.harmonicDecompose(probes, freq, 1);
check('fenêtre limitée à la dernière période',
    close(dec.window.to - dec.window.from, period, period * 0.02),
    `${((dec.window.to - dec.window.from) * 1000).toFixed(2)} ms sur ${dec.window.samples} points`);

for (const [k, axis] of [[0, 'x'], [2, 'z']]) {
    check(`composante continue ${axis} retrouvée`, close(dec.mean[k], MEAN[k], 0.05),
        `${dec.mean[k].toFixed(4)} attendu ${MEAN[k]}`);
    check(`amplitude cos ${axis} retrouvée`, close(dec.cos[k], A[k], Math.abs(A[k]) * 0.02 + 0.05),
        `${dec.cos[k].toFixed(4)} attendu ${A[k]}`);
    check(`amplitude sin ${axis} retrouvée`, close(dec.imag[k], B[k], Math.abs(B[k]) * 0.02 + 0.05),
        `${dec.imag[k].toFixed(4)} attendu ${B[k]}`);
}

// L'harmonique 3f est purement non linéaire: sa valeur efficace vaut |H3|/√2.
const expectedResidual = Math.hypot(H3[0], H3[1], H3[2]) / Math.SQRT2;
check('le résidu capte exactement la part non linéaire',
    close(dec.residualRms[0], expectedResidual, expectedResidual * 0.05),
    `${dec.residualRms[0].toFixed(4)} attendu ${expectedResidual.toFixed(4)}`);

console.log('\n=== Mise au format du Field BEM ===');
const field = R.toFieldVelocity(dec);
check('tableaux dimensionnés pour 1 point', field.vRe.length === 3 && field.peak.length === 1);
// Demi-grand axe de l'ellipse: composantes x et z en quadrature partielle.
const a2 = A[0] * A[0] + A[2] * A[2];
const b2 = B[0] * B[0] + B[2] * B[2];
const ab = A[0] * B[0] + A[2] * B[2];
const expectedPeak = Math.sqrt((a2 + b2) / 2 + Math.hypot((a2 - b2) / 2, ab));
check('vitesse crête cohérente avec la convention BEM',
    close(field.peak[0], expectedPeak, expectedPeak * 0.03),
    `${field.peak[0].toFixed(3)} attendu ${expectedPeak.toFixed(3)} m/s`);
check('turbulence exposée séparément', close(field.turbulence[0], expectedResidual, expectedResidual * 0.05),
    `${field.turbulence[0].toFixed(4)} m/s`);
check('écoulement moyen conservé', close(field.vMean[2], MEAN[2], 0.05), `${field.vMean[2].toFixed(4)} m/s`);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
