// Aller-retour base64 des composantes de vitesse d'une nappe : c'est ce codage
// qui empêche `JSON.stringify` de dépasser la longueur maximale d'une chaîne
// JavaScript sur une nappe fine. On rejoue ici les deux fonctions du panneau.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'src/js/panels/bemsolver/bemSolver.js'), 'utf8');

const pick = (name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} introuvable`);
  let depth = 0, i = src.indexOf('{', start);
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`${name} non fermée`);
};

const { encodeFloat32, decodeFloat32 } = new Function(
  'btoa', 'atob',
  `${pick('encodeFloat32')}\n${pick('decodeFloat32')}\n return { encodeFloat32, decodeFloat32 };`
)(
  (s) => Buffer.from(s, 'binary').toString('base64'),
  (s) => Buffer.from(s, 'base64').toString('binary'),
);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
};

// Taille réaliste : 40401 points × 3 composantes.
const n = 40401 * 3;
const src32 = new Float32Array(n);
for (let i = 0; i < n; i++) src32[i] = Math.sin(i * 0.001) * Math.pow(10, (i % 20) - 12);
src32[0] = NaN; src32[1] = 0; src32[2] = -1e-30;

const encoded = encodeFloat32(src32);
const back = decodeFloat32(encoded);
console.log(`  ${n} valeurs → ${encoded.length} caractères (${(encoded.length / n).toFixed(2)} car./valeur)`);
console.log(`  décimal équivalent ≈ ${JSON.stringify([...src32.subarray(0, 1000)]).length * n / 1000 | 0} caractères`);

check('longueur conservée', back.length === src32.length, `${back.length} vs ${src32.length}`);
let exact = true;
for (let i = 3; i < n; i++) if (back[i] !== src32[i]) { exact = false; break; }
check('valeurs identiques bit à bit', exact);
check('NaN préservé', Number.isNaN(back[0]));
check('base64 au moins 2× plus compact que le décimal',
  encoded.length * 2 < JSON.stringify([...src32.subarray(0, 1000)]).length * n / 1000);

check('tableau brut (ancien .TBBS) toujours accepté',
  decodeFloat32([1.5, -2.5, 3])?.[1] === -2.5);
check('valeur absente → null', decodeFloat32(undefined) === null);
check('tableau vide → undefined à l\'écriture', encodeFloat32(new Float32Array(0)) === undefined);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
if (failures) process.exitCode = 1;
