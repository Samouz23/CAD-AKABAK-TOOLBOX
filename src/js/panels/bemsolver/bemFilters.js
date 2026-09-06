/**
 * Filtres analogiques appliqués en aval du BEM (peak / passe-haut / passe-bas).
 *
 * Le BEM est LINÉAIRE : la nappe, la vitesse particulaire et le SPL sont tous
 * proportionnels à la tension d'attaque. Un filtre n'est donc rien d'autre
 * qu'un gain complexe H(f) appliqué à cette tension — aucune raison de
 * resolver quoi que ce soit après coup, et c'est exactement pourquoi on peut
 * régler l'égalisation une fois la simulation terminée.
 *
 * Tout est écrit dans le domaine de Laplace et évalué en s = jω. Les
 * prototypes normalisés (Q de Butterworth, forme peaking RBJ) sont les mêmes
 * que ceux des processeurs de haut-parleur, pour que les réglages se
 * transposent tels quels.
 */

/** Multiplication complexe, en place sur un couple {re, im}. */
function mulInto(acc, re, im) {
  const r = acc.re * re - acc.im * im;
  acc.im = acc.re * im + acc.im * re;
  acc.re = r;
}

/** Division complexe num/den. */
function div(nRe, nIm, dRe, dIm) {
  const d = dRe * dRe + dIm * dIm;
  if (!(d > 0)) return { re: 0, im: 0 };
  return { re: (nRe * dRe + nIm * dIm) / d, im: (nIm * dRe - nRe * dIm) / d };
}

/**
 * Facteurs de qualité des sections d'un Butterworth d'ordre n.
 *
 * Les pôles sont régulièrement espacés sur le demi-cercle gauche, aux angles
 * θ_k = (2k+1)π/(2n) comptés depuis l'axe imaginaire, d'où
 * Q_k = 1 / (2·sin(θ_k)). La forme en cosinus qu'on croise souvent ne redonne
 * le bon ENSEMBLE que pour n pair (par symétrie) et se trompe pour n impair :
 * à l'ordre 3 elle rend 0,577 au lieu de 1. Un ordre impair ajoute un pôle
 * réel, rendu ici par `firstOrder`.
 */
export function butterworthSections(order) {
  const n = Math.max(1, Math.round(order));
  const qs = [];
  for (let k = 0; k < Math.floor(n / 2); k++) {
    qs.push(1 / (2 * Math.sin((Math.PI * (2 * k + 1)) / (2 * n))));
  }
  return { qs, firstOrder: n % 2 === 1 };
}

/**
 * Sections d'une coupure selon son alignement.
 *
 * - bw     : Butterworth, -3 dB à la coupure, la bande passante la plus plate.
 * - lr     : Linkwitz-Riley, soit DEUX Butterworth d'ordre moitié en cascade.
 *            D'où -6 dB à la coupure et, surtout, les deux voies d'un filtrage
 *            complémentaire en phase — ce qui les somme à plat. Impose un ordre
 *            pair : un LR impair n'existe pas, on retombe alors sur Butterworth.
 * - custom : un unique biquad au Q imposé. Au-delà de l'ordre 2 un Q seul ne
 *            définit plus l'alignement, on repasse donc en Butterworth.
 */
export function filterSections(order, alignment = 'bw', q = Math.SQRT1_2) {
  const n = Math.min(8, Math.max(1, Math.round(order)));
  if (alignment === 'custom' && n === 2) return { qs: [q > 0 ? q : Math.SQRT1_2], firstOrderCount: 0 };
  if (alignment === 'lr' && n % 2 === 0) {
    const half = butterworthSections(n / 2);
    return { qs: [...half.qs, ...half.qs], firstOrderCount: half.firstOrder ? 2 : 0 };
  }
  const bw = butterworthSections(n);
  return { qs: bw.qs, firstOrderCount: bw.firstOrder ? 1 : 0 };
}

/**
 * Réponse complexe d'un filtre à la fréquence f.
 *
 * - peak  : H = (s² + (A·ω₀/Q)s + ω₀²) / (s² + (ω₀/(A·Q))s + ω₀²), A = 10^(G/40)
 * - hpf   : sections s² / (s² + (ω₀/Q)s + ω₀²), plus s/(s+ω₀) par pôle réel
 * - lpf   : sections ω₀² / (s² + (ω₀/Q)s + ω₀²), plus ω₀/(s+ω₀) par pôle réel
 *
 * L'alignement (`bw`, `lr`, `custom`) fixe les Q ; voir `filterSections`.
 */
export function filterResponse(filter, f) {
  const acc = { re: 1, im: 0 };
  if (!filter || filter.enabled === false || !(f > 0)) return acc;
  const f0 = Number(filter.freq_Hz);
  if (!(f0 > 0)) return acc;

  const w = 2 * Math.PI * f;
  const w0 = 2 * Math.PI * f0;
  // s = jω, donc s² = -ω². Tout se ramène à des réels et un seul imaginaire.
  const s2 = -w * w;
  const q = Number(filter.q) > 0 ? Number(filter.q) : Math.SQRT1_2;

  if (filter.type === 'peak') {
    const A = Math.pow(10, (Number(filter.gain_dB) || 0) / 40);
    const num = div(s2 + w0 * w0, (A * w0 / q) * w, s2 + w0 * w0, (w0 / (A * q)) * w);
    mulInto(acc, num.re, num.im);
    return acc;
  }

  const highPass = filter.type === 'hpf';
  if (!highPass && filter.type !== 'lpf') return acc;

  const { qs, firstOrderCount } = filterSections(Number(filter.order) || 2, filter.alignment || 'bw', q);

  for (const qk of qs) {
    const dRe = s2 + w0 * w0;
    const dIm = (w0 / qk) * w;
    const sec = highPass ? div(s2, 0, dRe, dIm) : div(w0 * w0, 0, dRe, dIm);
    mulInto(acc, sec.re, sec.im);
  }
  for (let i = 0; i < firstOrderCount; i++) {
    const sec = highPass ? div(0, w, w0, w) : div(w0, 0, w0, w);
    mulInto(acc, sec.re, sec.im);
  }
  return acc;
}

/** Produit de tous les filtres actifs à la fréquence f. */
export function filterChainResponse(filters, f) {
  const acc = { re: 1, im: 0 };
  for (const filter of filters || []) {
    const h = filterResponse(filter, f);
    mulInto(acc, h.re, h.im);
  }
  return acc;
}

/** Gain de la chaîne, en linéaire — c'est lui qui multiplie la tension. */
export function filterChainGain(filters, f) {
  if (!filters?.length) return 1;
  const h = filterChainResponse(filters, f);
  return Math.hypot(h.re, h.im);
}

/** Gain de la chaîne en dB, pour l'affichage de la courbe de réponse. */
export function filterChainGainDb(filters, f) {
  const g = filterChainGain(filters, f);
  return g > 0 ? 20 * Math.log10(g) : -200;
}
