/**
 * Contrôle des filtres EQ appliqués en aval du BEM.
 *
 * Chaque test compare la réponse calculée à une valeur ANALYTIQUE connue, pas
 * à une sortie de référence : c'est ce qui permet d'attraper une erreur de
 * convention ou de prototype plutôt que de figer un bug.
 */
import { filterResponse, filterChainGainDb, butterworthSections } from '../src/js/panels/bemsolver/bemFilters.js';

let failures = 0;
const db = (filter, f) => filterChainGainDb([filter], f);

function check(label, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  —  ${got.toFixed(4)} (attendu ${want.toFixed(4)} ± ${tol})`);
}

console.log('=== Passe-haut Butterworth ===');
for (const order of [1, 2, 3, 4, 5, 6, 8]) {
  const f = { type: 'hpf', freq_Hz: 100, order, q: Math.SQRT1_2 };
  // À la coupure un Butterworth vaut -3,0103 dB quel que soit l'ordre.
  check(`ordre ${order} : -3 dB à f0`, db(f, 100), -10 * Math.log10(2), 1e-6);
  // Pente asymptotique 20n dB/décade, mesurée 3 à 4 décades sous la coupure :
  // une seule décade d'écart laisse encore 0,04 dB d'erreur d'asymptote.
  check(`ordre ${order} : pente ${20 * order} dB/décade`, db(f, 0.1) - db(f, 0.01), 20 * order, 0.01);
  check(`ordre ${order} : transparent en haut`, db(f, 100000), 0, 0.02);
}

console.log('\n=== Passe-bas Butterworth ===');
for (const order of [1, 2, 3, 4, 6]) {
  const f = { type: 'lpf', freq_Hz: 1000, order, q: Math.SQRT1_2 };
  check(`ordre ${order} : -3 dB à f0`, db(f, 1000), -10 * Math.log10(2), 1e-6);
  check(`ordre ${order} : pente -${20 * order} dB/décade`, db(f, 1e7) - db(f, 1e6), -20 * order, 0.01);
  check(`ordre ${order} : transparent en bas`, db(f, 1), 0, 0.02);
}

console.log('\n=== Q de Butterworth (valeurs de table) ===');
check('ordre 2 : Q = 0,7071', butterworthSections(2).qs[0], Math.SQRT1_2, 1e-9);
check('ordre 3 : Q = 1 (le piège des ordres impairs)', butterworthSections(3).qs[0], 1, 1e-9);
check('ordre 4 : Q1 = 1,3066', butterworthSections(4).qs[0], 1.306563, 1e-5);
check('ordre 4 : Q2 = 0,5412', butterworthSections(4).qs[1], 0.541196, 1e-5);
check('ordre 5 : Q1 = 1,6180', butterworthSections(5).qs[0], 1.618034, 1e-5);
check('ordre 5 : Q2 = 0,6180', butterworthSections(5).qs[1], 0.618034, 1e-5);
check('ordre 3 : une section + un pôle réel', butterworthSections(3).qs.length, 1, 0);
console.log(`  ${butterworthSections(3).firstOrder ? 'PASS' : 'FAIL'}  ordre 3 : pôle réel présent`);
if (!butterworthSections(3).firstOrder) failures++;

console.log('\n=== Linkwitz-Riley ===');
for (const order of [2, 4, 6, 8]) {
  const lp = { type: 'lpf', freq_Hz: 500, order, alignment: 'lr' };
  const hp = { type: 'hpf', freq_Hz: 500, order, alignment: 'lr' };
  check(`LR${order} : -6 dB à la coupure`, db(lp, 500), -6.0206, 1e-3);
  check(`LR${order} : pente -${20 * order} dB/décade`, db(lp, 5e6) - db(lp, 5e5), -20 * order, 0.01);
  // Propriété fondatrice du LR : les deux voies se somment à plat, à toutes les
  // fréquences. En phase quand l'ordre est multiple de 4, en opposition pour
  // LR2 et LR6 — d'où le signe. C'est le test qui distingue vraiment un LR
  // d'un Butterworth de même pente.
  const sign = (order / 2) % 2 === 0 ? 1 : -1;
  let worst = 0;
  for (const f of [50, 100, 250, 500, 1000, 2500, 5000]) {
    const a = filterResponse(lp, f);
    const b = filterResponse(hp, f);
    worst = Math.max(worst, Math.abs(Math.hypot(a.re + sign * b.re, a.im + sign * b.im) - 1));
  }
  check(`LR${order} : somme des deux voies plate`, worst, 0, 1e-9);
}

console.log('\n=== Alignements ===');
check('BW4 : -3 dB à la coupure', db({ type: 'lpf', freq_Hz: 500, order: 4, alignment: 'bw' }, 500), -10 * Math.log10(2), 1e-9);
check('LR4 = deux BW2 en cascade',
  db({ type: 'lpf', freq_Hz: 500, order: 4, alignment: 'lr' }, 500),
  2 * db({ type: 'lpf', freq_Hz: 500, order: 2, alignment: 'bw' }, 500), 1e-9);
check('LR impair retombe sur Butterworth',
  db({ type: 'hpf', freq_Hz: 500, order: 3, alignment: 'lr' }, 500),
  db({ type: 'hpf', freq_Hz: 500, order: 3, alignment: 'bw' }, 500), 1e-12);
check('Q libre : biquad à Q = 0,5 donne -6 dB',
  db({ type: 'lpf', freq_Hz: 500, order: 2, alignment: 'custom', q: 0.5 }, 500), -6.0206, 1e-3);
// Un Q unique ne définit pas un alignement d'ordre 4 : on doit retomber sur BW.
check('Q libre ignoré au-delà du biquad',
  db({ type: 'lpf', freq_Hz: 500, order: 4, alignment: 'custom', q: 3 }, 500), -10 * Math.log10(2), 1e-9);
check('alignement absent = Butterworth',
  db({ type: 'lpf', freq_Hz: 500, order: 4 }, 500), -10 * Math.log10(2), 1e-9);

console.log('\n=== Cloche (peaking) ===');
for (const gain of [-12, -6, 6, 12]) {
  const f = { type: 'peak', freq_Hz: 80, q: 2, gain_dB: gain };
  check(`gain ${gain} dB au centre`, db(f, 80), gain, 1e-6);
  check(`gain ${gain} dB : transparent loin sous f0`, db(f, 0.1), 0, 1e-3);
  check(`gain ${gain} dB : transparent loin au-dessus`, db(f, 100000), 0, 1e-3);
}
// Largeur de bande d'une cloche RBJ : 1/Q = 2·sinh(ln2·BW/2), et aux bords de
// cette bande le gain vaut exactement la moitié du gain crête en dB.
{
  const Q = 1.5;
  const f = { type: 'peak', freq_Hz: 100, q: Q, gain_dB: 10 };
  const bw = (2 / Math.LN2) * Math.asinh(1 / (2 * Q));
  check('demi-gain à la demi-bande haute', db(f, 100 * Math.pow(2, bw / 2)), 5, 1e-6);
  check('demi-gain à la demi-bande basse', db(f, 100 / Math.pow(2, bw / 2)), 5, 1e-6);
}

console.log('\n=== Chaîne et neutralité ===');
check('filtre désactivé = transparent', filterChainGainDb([{ type: 'lpf', freq_Hz: 100, order: 4, enabled: false }], 10000), 0, 1e-9);
check('chaîne vide = transparent', filterChainGainDb([], 100), 0, 1e-9);
{
  // Un passe-haut et un passe-bas identiques en cascade doivent donner
  // exactement la somme de leurs gains en dB : c'est la linéarité de la chaîne.
  const hp = { type: 'hpf', freq_Hz: 60, order: 2, q: Math.SQRT1_2 };
  const lp = { type: 'lpf', freq_Hz: 800, order: 4, q: Math.SQRT1_2 };
  check('cascade = somme en dB', filterChainGainDb([hp, lp], 200), db(hp, 200) + db(lp, 200), 1e-9);
}

console.log('\n=== Phase ===');
{
  // Un passe-haut du 1er ordre avance de 45° à sa coupure, un passe-bas retarde
  // d'autant : le signe de la phase est LE test de convention.
  const hp = filterResponse({ type: 'hpf', freq_Hz: 100, order: 1 }, 100);
  const lp = filterResponse({ type: 'lpf', freq_Hz: 100, order: 1 }, 100);
  check('HPF 1er ordre : +45° à f0', Math.atan2(hp.im, hp.re) * 180 / Math.PI, 45, 1e-6);
  check('LPF 1er ordre : -45° à f0', Math.atan2(lp.im, lp.re) * 180 / Math.PI, -45, 1e-6);
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
