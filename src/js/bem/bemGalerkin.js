// =======================================================
// FICHIER :  src/js/bem/bemGalerkin.js
// RÔLE    :  BEM Galerkin P1 (éléments continus linéaires), formulation
//            directe de Helmholtz, quadrature singulière de Sauter-Schwab
//            (transformation de Duffy) pour les paires d'éléments
//            coincidents / adjacents par arête / adjacents par sommet.
//
//  Portage direct des formules de BeatEngineCore.jl (Boundary Lab,
//  boundary-lab-main/src/blab/solvers/julia_local/src/), qui implémente déjà
//  ce même algorithme en Julia et est validé en production. Les formules de
//  quadrature de Duffy ci-dessous sont recopiées telles quelles (mêmes
//  régions, mêmes poids) — ne pas "simplifier", elles sont déjà minimales.
//
//  Portée de CE fichier : assemblage Galerkin (masse M, simple couche S,
//  double couche D) pour un domaine fermé UNIQUE (pas de multi-domaine, pas
//  de symétrie/baffle par image — ça viendra dans une passe ultérieure une
//  fois ce noyau validé). Script "plain" comme bemShared.js/bemDomainCore.js
//  (pas d'import/export ES) pour rester concaténable dans un blob de worker ;
//  expose `module.exports` pour les scripts Node de validation.
// =======================================================

'use strict';

// `RHO_AIR` vient de bemShared.js : ce fichier est concaténé APRÈS lui dans le
// blob du worker, où tout partage la même portée globale — le redéclarer serait
// une SyntaxError qui casserait le worker entier.
const RHO_AIR_G = (typeof RHO_AIR !== 'undefined') ? RHO_AIR : 1.21;

// ============================================================
// ── QUADRATURE RÉGULIÈRE (paires d'éléments bien séparées)
// ============================================================
// Même règle barycentrique à 7 points que bemShared.js (GAUSS7), réécrite en
// coordonnées de référence (xi, eta) = (l2, l3) : xi+eta+l1=1. Les poids
// somment à 1 ; l'intégrale physique sur un triangle d'aire A vaut
// 2A · Σ w_i f(x_i) (jacobien de l'application aire-de-référence → aire réelle).
const REGULAR_RULE = [
  { xi: 1/3,      eta: 1/3,      w: 0.225 },
  { xi: 0.470142, eta: 0.470142, w: 0.132394 },
  { xi: 0.059716, eta: 0.470142, w: 0.132394 },
  { xi: 0.470142, eta: 0.059716, w: 0.132394 },
  { xi: 0.101287, eta: 0.101287, w: 0.125939 },
  { xi: 0.797427, eta: 0.101287, w: 0.125939 },
  { xi: 0.101287, eta: 0.797427, w: 0.125939 },
];

// ============================================================
// ── FONCTIONS DE FORME P1 (continues, linéaires par triangle)
// ============================================================
function p1Values(xi, eta) {
  return [1 - xi - eta, xi, eta];
}

function mapPoint(v0, v1, v2, xi, eta) {
  const l0 = 1 - xi - eta;
  return [
    l0 * v0[0] + xi * v1[0] + eta * v2[0],
    l0 * v0[1] + xi * v1[1] + eta * v2[1],
    l0 * v0[2] + xi * v1[2] + eta * v2[2],
  ];
}

// ============================================================
// ── NOYAUX DE HELMHOLTZ (convention e^{-iωt}, k réel = ω/c)
// ============================================================
function singleLayerKernel(k, x, y) {
  const dx = y[0]-x[0], dy = y[1]-x[1], dz = y[2]-x[2];
  const r = Math.sqrt(dx*dx+dy*dy+dz*dz);
  if (r < 1e-15) return { re: 0, im: 0 };
  const kr = k*r;
  const inv4pir = 1/(4*Math.PI*r);
  return { re: Math.cos(kr)*inv4pir, im: Math.sin(kr)*inv4pir };
}

/** ∂G/∂n_y(x,y) — dérivée par rapport au point SOURCE/trial, normale trial. */
function doubleLayerKernel(k, x, y, nTrial) {
  const dx = y[0]-x[0], dy = y[1]-x[1], dz = y[2]-x[2];
  const r = Math.sqrt(dx*dx+dy*dy+dz*dz);
  if (r < 1e-15) return { re: 0, im: 0 };
  const kr = k*r;
  const gRe = Math.cos(kr)/(4*Math.PI*r), gIm = Math.sin(kr)/(4*Math.PI*r);
  // grad_y G = G * (ik - 1/r) * (y-x)/r ; on ne garde que la composante normale.
  const rdotn = (dx*nTrial[0]+dy*nTrial[1]+dz*nTrial[2]) / r;
  // facteur complexe (ik - 1/r) = (-1/r) + i*k
  const fRe = -1/r, fIm = k;
  return {
    re: (gRe*fRe - gIm*fIm) * rdotn,
    im: (gRe*fIm + gIm*fRe) * rdotn,
  };
}

/** ∂G/∂n_x(x,y) — dérivée par rapport au point TEST, normale test (signe opposé). */
function adjointDoubleLayerKernel(k, x, y, nTest) {
  const d = doubleLayerKernel(k, y, x, nTest);
  return d;
}

// ============================================================
// ── RÈGLE DE DUFFY (quadrature singulière de Sauter-Schwab)
//    Portage direct de BeatEngineCore.jl::duffy_rule / gauss_rule_1d.
// ============================================================
function gaussRule1D(order) {
  if (order === 1) return { x: [0.5], w: [1.0] };
  if (order === 2) {
    const a = 0.5/Math.sqrt(3);
    return { x: [0.5-a, 0.5+a], w: [0.5, 0.5] };
  }
  if (order === 3) {
    const a = Math.sqrt(3/5)/2;
    return { x: [0.5-a, 0.5, 0.5+a], w: [5/18, 4/9, 5/18] };
  }
  if (order === 4) {
    const x1 = Math.sqrt(3/7 - (2/7)*Math.sqrt(6/5))/2;
    const x2 = Math.sqrt(3/7 + (2/7)*Math.sqrt(6/5))/2;
    const w1 = (18+Math.sqrt(30))/72, w2 = (18-Math.sqrt(30))/72;
    return { x: [0.5-x2, 0.5-x1, 0.5+x1, 0.5+x2], w: [w2, w1, w1, w2] };
  }
  throw new Error('Duffy 1D order must be 1..4');
}

function duffyRule(order, adjacency) {
  const { x: xreg, w: wreg } = gaussRule1D(order);
  const n1d = xreg.length;
  const tp = []; // tensor points [xsi_or_eta1, ...]
  const tw = [];
  for (let i = 0; i < n1d; i++) {
    for (let j = 0; j < n1d; j++) {
      tp.push([xreg[j], xreg[i]]);
      tw.push(wreg[i]*wreg[j]);
    }
  }
  const nreg = tp.length; // n1d^2
  const testPts = [], trialPts = [], weights = [];
  const push4 = (testX, testY, trialX, trialY, w) => {
    testPts.push([testX-testY, testY]);
    trialPts.push([trialX-trialY, trialY]);
    weights.push(w);
  };

  for (let ti = 0; ti < nreg; ti++) {
    for (let tj = 0; tj < nreg; tj++) {
      const xsi = tp[ti][0], eta1 = tp[ti][1];
      const eta2 = tp[tj][0], eta3 = tp[tj][1];
      const eta12 = eta1*eta2, eta123 = eta12*eta3;
      const baseW = tw[ti]*tw[tj];

      if (adjacency === 'coincident') {
        const w = baseW * xsi*xsi*xsi * eta1*eta1 * eta2;
        push4(xsi, xsi*(1-eta1+eta12), xsi*(1-eta123), xsi*(1-eta1), w);
        push4(xsi*(1-eta123), xsi*(1-eta1), xsi, xsi*(1-eta1+eta12), w);
        push4(xsi, xsi*(eta1-eta12+eta123), xsi*(1-eta12), xsi*(eta1-eta12), w);
        push4(xsi*(1-eta12), xsi*(eta1-eta12), xsi, xsi*(eta1-eta12+eta123), w);
        push4(xsi*(1-eta123), xsi*(eta1-eta123), xsi, xsi*(eta1-eta12), w);
        push4(xsi, xsi*(eta1-eta12), xsi*(1-eta123), xsi*(eta1-eta123), w);
      } else if (adjacency === 'edge_adjacent') {
        const w = baseW * xsi*xsi*xsi * eta1*eta1;
        push4(xsi, xsi*eta1*eta3, xsi*(1-eta12), xsi*eta1*(1-eta2), w);
        push4(xsi, xsi*eta1, xsi*(1-eta123), xsi*eta1*eta2*(1-eta3), w*eta2);
        push4(xsi*(1-eta12), xsi*eta1*(1-eta2), xsi, xsi*eta123, w*eta2);
        push4(xsi*(1-eta123), xsi*eta12*(1-eta3), xsi, xsi*eta1, w*eta2);
        push4(xsi*(1-eta123), xsi*eta1*(1-eta2*eta3), xsi, xsi*eta12, w*eta2);
      } else if (adjacency === 'vertex_adjacent') {
        const w = baseW * xsi*xsi*xsi * eta2;
        push4(xsi, xsi*eta1, xsi*eta2, xsi*eta2*eta3, w);
        push4(xsi*eta2, xsi*eta2*eta3, xsi, xsi*eta1, w);
      } else {
        throw new Error('unknown adjacency: ' + adjacency);
      }
    }
  }
  return { testPts, trialPts, weights };
}

const REF_VERTS = [[0,0], [1,0], [0,1]];

/** Renumérote un point du triangle de référence canonique vers celui dont le
 *  sommet unique partagé est `vid` (0,1,2) au lieu du sommet 0 canonique. */
function remapSharedVertex(pt, vid) {
  if (vid === 0) return pt;
  if (vid === 1) return [1 - pt[0] - pt[1], pt[1]];
  if (vid === 2) return [pt[0], 1 - pt[0] - pt[1]];
  throw new Error('vid must be 0,1,2');
}

/** Idem pour une arête partagée (v1,v2 = indices locaux 0,1,2 des 2 sommets
 *  de l'arête, dans l'ordre correspondant au triangle de l'autre côté). */
function remapSharedEdge(pt, v1, v2) {
  const remaining = 3 - v1 - v2;
  const a = REF_VERTS[v1], b = REF_VERTS[v2], c = REF_VERTS[remaining];
  return [
    a[0] + pt[0]*(b[0]-a[0]) + pt[1]*(c[0]-a[0]),
    a[1] + pt[0]*(b[1]-a[1]) + pt[1]*(c[1]-a[1]),
  ];
}

// Rules canoniques mises en cache par ordre.
const _duffyCache = new Map();
function getDuffyRule(order, adjacency) {
  const key = order + ':' + adjacency;
  let r = _duffyCache.get(key);
  if (!r) { r = duffyRule(order, adjacency); _duffyCache.set(key, r); }
  return r;
}

// ============================================================
// ── CLASSIFICATION D'UNE PAIRE D'ÉLÉMENTS
// ============================================================
/**
 * `testNodes`/`trialNodes` : triplets d'ids GLOBAUX de nœuds (maillage soudé,
 * cf. weldNodes — indispensable pour que les ids coïncident réellement).
 * Retourne { kind, testPerm, trialPerm } où *Perm sont les indices locaux
 * (0,1,2) à passer à remapSharedVertex/remapSharedEdge.
 */
function classifyPair(testNodes, trialNodes, sameElement) {
  if (sameElement) return { kind: 'coincident' };

  const shared = []; // [{ tLocal, rLocal }]
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      if (testNodes[a] === trialNodes[b]) shared.push({ t: a, r: b });
    }
  }
  if (shared.length >= 3) return { kind: 'coincident' };
  if (shared.length === 2) {
    return {
      kind: 'edge_adjacent',
      testPerm: [shared[0].t, shared[1].t],
      trialPerm: [shared[0].r, shared[1].r],
    };
  }
  if (shared.length === 1) {
    return { kind: 'vertex_adjacent', testPerm: shared[0].t, trialPerm: shared[0].r };
  }
  return { kind: 'regular' };
}

// ============================================================
// ── MATRICE DE MASSE (opérateur identité testé, ⟨N_i,N_j⟩ par élément)
// ============================================================
// Matrice de référence standard du P1 : diag=1/12·2A... on la calcule ici par
// quadrature (cohérent avec BeatEngineCore.jl::l2_identity_element_matrix),
// pas besoin de forme close séparée.
function massElementBlock(area) {
  const block = new Float64Array(9); // 3x3, réel (l'identité n'a pas de partie imaginaire)
  // REGULAR_RULE a des poids qui somment à 1 : intégrale physique = aire * Σw·f
  // (PAS 2*aire, qui serait la convention d'une règle à poids sommant à 1/2).
  const jac = area;
  for (const { xi, eta, w } of REGULAR_RULE) {
    const N = p1Values(xi, eta);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        block[i*3+j] += N[i]*N[j]*w*jac;
      }
    }
  }
  return block;
}

// ============================================================
// ── ASSEMBLAGE GALERKIN (domaine fermé unique)
// ============================================================
/**
 * ACCUMULE dans `out` (4 Float64Array(9) : Sre/Sim/Dre/Dim) le bloc 3x3 d'UNE
 * paire d'éléments. Version sans allocation : noyaux inlinés et points de test
 * précalculés — la boucle est exécutée O(Nelem²·mirrors) fois, donc le moindre
 * `{re,im}` par évaluation de noyau y coûte des dizaines de millions
 * d'allocations et sature le GC (mesuré : plusieurs minutes par fréquence sur
 * 617 éléments avant cette réécriture).
 * `vRExplicit` remplace les coordonnées trial (image miroir) ; `cls` est la
 * classification d'adjacence de la paire, calculée une seule fois pour tout le
 * balayage fréquentiel (cf. `domainPairPlan`). Une image miroir n'est jamais
 * adjacente au sens des ids de nœud : l'appelant lui passe `REGULAR_CLS`.
 */
function accumulatePairBlocks(elT, elR, cls, k, singularOrder, nodes, trialNormal, vRExplicit, out) {
  const tn = elT.nodes, rn = elR.nodes;
  const t0 = nodes[tn[0]], t1 = nodes[tn[1]], t2 = nodes[tn[2]];
  const vR = vRExplicit || [nodes[rn[0]], nodes[rn[1]], nodes[rn[2]]];
  const r0 = vR[0], r1 = vR[1], r2v = vR[2];
  const nR = trialNormal || elR.normal;
  const nRx = nR[0], nRy = nR[1], nRz = nR[2];
  const Sre = out.blockSre, Sim = out.blockSim, Dre = out.blockDre, Dim = out.blockDim;
  const invFourPi = 1 / (4 * Math.PI);

  // Un seul corps de boucle pour les deux régimes : seules changent la liste de
  // points (produit tensoriel régulier vs paires de Duffy) et le jacobien.
  let ptsT, ptsR, wts, jac;
  if (cls.kind === 'regular') {
    // Ordre choisi sur la séparation : à 6 tailles d'élément de distance, le
    // noyau est quasi constant sur la paire et 1 point vaut 49. C'est ce qui
    // fait la vitesse — l'écrasante majorité des paires est « lointaine ».
    // Mêmes seuils que la règle adaptative déjà validée en P0 (bemShared::pickQuad).
    const ddx = (t0[0] + t1[0] + t2[0] - r0[0] - r1[0] - r2v[0]) / 3;
    const ddy = (t0[1] + t1[1] + t2[1] - r0[1] - r1[1] - r2v[1]) / 3;
    const ddz = (t0[2] + t1[2] + t2[2] - r0[2] - r1[2] - r2v[2]) / 3;
    const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
    const h2 = elT.area > elR.area ? elT.area : elR.area;   // aire ≈ h²
    const rule = d2 > 36 * h2 ? REGULAR_PAIR_1 : (d2 > 6.25 * h2 ? REGULAR_PAIR_3 : REGULAR_PAIR_7);
    ptsT = rule.T; ptsR = rule.R; wts = rule.W;
    jac = elT.area * elR.area;
  } else {
    const rule = getRemappedDuffyRule(singularOrder, cls);
    ptsT = rule.testPts; ptsR = rule.trialPts; wts = rule.weights;
    jac = (2 * elT.area) * (2 * elR.area);
  }

  const np = wts.length;
  for (let p = 0; p < np; p++) {
    const xiT = ptsT[2 * p], etaT = ptsT[2 * p + 1];
    const xiR = ptsR[2 * p], etaR = ptsR[2 * p + 1];
    const lT = 1 - xiT - etaT, lR = 1 - xiR - etaR;

    const xx = lT * t0[0] + xiT * t1[0] + etaT * t2[0];
    const xy = lT * t0[1] + xiT * t1[1] + etaT * t2[1];
    const xz = lT * t0[2] + xiT * t1[2] + etaT * t2[2];
    const yx = lR * r0[0] + xiR * r1[0] + etaR * r2v[0];
    const yy = lR * r0[1] + xiR * r1[1] + etaR * r2v[1];
    const yz = lR * r0[2] + xiR * r1[2] + etaR * r2v[2];

    const dx = yx - xx, dy = yy - xy, dz = yz - xz;
    const rr = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (rr < 1e-15) continue;
    const kr = k * rr;
    const inv4pir = invFourPi / rr;
    const gRe = Math.cos(kr) * inv4pir, gIm = Math.sin(kr) * inv4pir;
    // grad_y G · n = G·(ik − 1/r)·(y−x)·n/r
    const rdotn = (dx * nRx + dy * nRy + dz * nRz) / rr;
    const fRe = -1 / rr;
    const hRe = (gRe * fRe - gIm * k) * rdotn;
    const hIm = (gRe * k + gIm * fRe) * rdotn;

    const w = wts[p] * jac;
    const N0 = lT * w, N1 = xiT * w, N2 = etaT * w;
    const M0 = lR, M1 = xiR, M2 = etaR;

    for (let i = 0; i < 3; i++) {
      const ni = i === 0 ? N0 : (i === 1 ? N1 : N2);
      const b = i * 3;
      for (let j = 0; j < 3; j++) {
        const nn = ni * (j === 0 ? M0 : (j === 1 ? M1 : M2));
        Sre[b + j] += gRe * nn; Sim[b + j] += gIm * nn;
        Dre[b + j] += hRe * nn; Dim[b + j] += hIm * nn;
      }
    }
  }
}

const REGULAR_CLS = { kind: 'regular' };
const COINCIDENT_CLS = { kind: 'coincident' };

// Règles triangulaires de degré croissant, pour les paires régulières.
const RULE_1 = [{ xi: 1 / 3, eta: 1 / 3, w: 1 }];
const RULE_3 = [
  { xi: 1 / 6, eta: 1 / 6, w: 1 / 3 },
  { xi: 2 / 3, eta: 1 / 6, w: 1 / 3 },
  { xi: 1 / 6, eta: 2 / 3, w: 1 / 3 },
];

/** Produit tensoriel test×trial d'une règle, aplati en Float64Array. */
function tensorPairRule(rule) {
  const n = rule.length * rule.length;
  const T = new Float64Array(2 * n), R = new Float64Array(2 * n), W = new Float64Array(n);
  let p = 0;
  for (const a of rule) {
    for (const b of rule) {
      T[2 * p] = a.xi; T[2 * p + 1] = a.eta;
      R[2 * p] = b.xi; R[2 * p + 1] = b.eta;
      W[p] = a.w * b.w;
      p++;
    }
  }
  return { T, R, W };
}

const REGULAR_PAIR_1 = tensorPairRule(RULE_1);
const REGULAR_PAIR_3 = tensorPairRule(RULE_3);
const REGULAR_PAIR_7 = tensorPairRule(REGULAR_RULE);

// Règles de Duffy déjà REMAPPÉES pour une orientation d'adjacence donnée, en
// Float64Array plates. Mises en cache : il n'y a que 3+6+3 combinaisons, alors
// que le remap était refait à chaque paire.
const _remappedDuffyCache = new Map();
function getRemappedDuffyRule(order, cls) {
  const key = cls.kind === 'coincident' ? `${order}:c`
    : cls.kind === 'edge_adjacent' ? `${order}:e${cls.testPerm[0]}${cls.testPerm[1]}_${cls.trialPerm[0]}${cls.trialPerm[1]}`
    : `${order}:v${cls.testPerm}_${cls.trialPerm}`;
  let cached = _remappedDuffyCache.get(key);
  if (cached) return cached;

  const rule = getDuffyRule(order, cls.kind);
  const n = rule.weights.length;
  const testPts = new Float64Array(2 * n), trialPts = new Float64Array(2 * n);
  const weights = Float64Array.from(rule.weights);
  const remapT = (pt) => cls.kind === 'coincident' ? pt
    : cls.kind === 'edge_adjacent' ? remapSharedEdge(pt, cls.testPerm[0], cls.testPerm[1])
    : remapSharedVertex(pt, cls.testPerm);
  const remapR = (pt) => cls.kind === 'coincident' ? pt
    : cls.kind === 'edge_adjacent' ? remapSharedEdge(pt, cls.trialPerm[0], cls.trialPerm[1])
    : remapSharedVertex(pt, cls.trialPerm);
  for (let p = 0; p < n; p++) {
    const a = remapT(rule.testPts[p]), b = remapR(rule.trialPts[p]);
    testPts[2 * p] = a[0]; testPts[2 * p + 1] = a[1];
    trialPts[2 * p] = b[0]; trialPts[2 * p + 1] = b[1];
  }
  cached = { testPts, trialPts, weights };
  _remappedDuffyCache.set(key, cached);
  return cached;
}

/** Enveloppe allouante de `accumulatePairBlocks` — conservée pour les tests. */
function computePairBlocks(elT, elR, sameElement, k, singularOrder, nodes, trialNormal, vRExplicit, forceRegular) {
  const out = {
    blockSre: new Float64Array(9), blockSim: new Float64Array(9),
    blockDre: new Float64Array(9), blockDim: new Float64Array(9),
  };
  const cls = forceRegular ? REGULAR_CLS : classifyPair(elT.nodes, elR.nodes, sameElement);
  accumulatePairBlocks(elT, elR, cls, k, singularOrder, nodes, trialNormal, vRExplicit, out);
  return out;
}

// ============================================================
// ── IMAGES MIROIR (baffle + symétrie H/V/HV)
// ============================================================
// `mirrors` = liste de { s:[sx,sy,sz], o:[ox,oy,oz], identity } comme produites
// par `bemDomainCore.js::composeMirrors`/`domainMirrors` — passée en paramètre
// (pas importée comme globale) pour garder ce fichier testable seul.
const MIRROR_COINCIDENT_EPS2 = 1e-24;

/** Même transform qu'un miroir dans bemDomainCore.js::mirrorElementAffine,
 *  appliquée à la géométrie P1 (v0/v1/v2/normal/centroid ; aire inchangée). */
function applyMirrorToElement(el, m) {
  if (m.identity) return el;
  const s = m.s, o = m.o;
  const det = s[0] * s[1] * s[2];
  const mv = (v) => [v[0]*s[0]+o[0], v[1]*s[1]+o[1], v[2]*s[2]+o[2]];
  const v0 = mv(el.v0), v1r = mv(el.v1), v2r = mv(el.v2);
  return {
    centroid: mv(el.centroid),
    normal: [el.normal[0]*s[0], el.normal[1]*s[1], el.normal[2]*s[2]],
    area: el.area,
    v0, v1: det < 0 ? v2r : v1r, v2: det < 0 ? v1r : v2r,
  };
}

/**
 * Somme des blocs (S,D) sur toutes les images d'un miroir. Chaque image NON
 * IDENTITÉ est traitée comme une paire RÉGULIÈRE (bien séparée) sauf si son
 * centroïde tombe EXACTEMENT sur celui de l'élément test — l'élément est alors
 * sur le plan miroir et son image coïncide avec lui-même : même argument
 * géométrique que le terme propre (triangle plat, (y-x)⊥n) ⇒ D est nul et S
 * doit passer par la quadrature singulière "coincident", pas la régulière
 * (sous peine de diverger sur le noyau 1/r). Cf. bemDomainCore.js::sumG pour
 * le même raisonnement en P0 (doublement de couche évité par `selfTermG`).
 */
function accumulateMirroredPairBlocks(elT, elR, cls, k, singularOrder, nodes, trialSign, mirrors, out, scratch) {
  const list = mirrors || IDENTITY_ONLY;
  for (let mi = 0; mi < list.length; mi++) {
    const m = list[mi];
    if (m.identity) {
      const n = elR.normal;
      scratch.n[0] = trialSign * n[0]; scratch.n[1] = trialSign * n[1]; scratch.n[2] = trialSign * n[2];
      accumulatePairBlocks(elT, elR, cls, k, singularOrder, nodes, scratch.n, null, out);
      continue;
    }
    const s = m.s, o = m.o;
    const det = s[0] * s[1] * s[2];
    const rv = [elR.v0, elR.v1, elR.v2];
    // Réflexion : l'ordre des sommets s'inverse quand det<0, sinon la normale
    // déduite du parcours ne serait plus l'image de la normale d'origine.
    const i1 = det < 0 ? 2 : 1, i2 = det < 0 ? 1 : 2;
    scratch.v0[0] = rv[0][0]*s[0]+o[0]; scratch.v0[1] = rv[0][1]*s[1]+o[1]; scratch.v0[2] = rv[0][2]*s[2]+o[2];
    scratch.v1[0] = rv[i1][0]*s[0]+o[0]; scratch.v1[1] = rv[i1][1]*s[1]+o[1]; scratch.v1[2] = rv[i1][2]*s[2]+o[2];
    scratch.v2[0] = rv[i2][0]*s[0]+o[0]; scratch.v2[1] = rv[i2][1]*s[1]+o[1]; scratch.v2[2] = rv[i2][2]*s[2]+o[2];
    scratch.n[0] = trialSign * elR.normal[0] * s[0];
    scratch.n[1] = trialSign * elR.normal[1] * s[1];
    scratch.n[2] = trialSign * elR.normal[2] * s[2];

    const cx = elR.centroid[0]*s[0]+o[0], cy = elR.centroid[1]*s[1]+o[1], cz = elR.centroid[2]*s[2]+o[2];
    const dx = elT.centroid[0]-cx, dy = elT.centroid[1]-cy, dz = elT.centroid[2]-cz;
    if (dx*dx + dy*dy + dz*dz < MIRROR_COINCIDENT_EPS2) {
      // Élément posé sur le plan miroir : son image se confond avec lui, donc
      // intégrale singulière (règle « coincident »), pas régulière.
      accumulatePairBlocks(elT, elT, COINCIDENT_CLS, k, singularOrder, nodes, scratch.n, null, out);
    } else {
      scratch.vR[0] = scratch.v0; scratch.vR[1] = scratch.v1; scratch.vR[2] = scratch.v2;
      accumulatePairBlocks(elT, elR, REGULAR_CLS, k, singularOrder, nodes, scratch.n, scratch.vR, out);
    }
  }
}

const IDENTITY_ONLY = [{ identity: true }];

function makePairScratch() {
  return { v0: new Float64Array(3), v1: new Float64Array(3), v2: new Float64Array(3), n: new Float64Array(3), vR: [null, null, null] };
}

/** Enveloppe allouante — conservée pour les tests et la compatibilité. */
function computeMirroredPairBlocks(elT, elR, sameElementBase, k, singularOrder, nodes, trialSign, mirrors) {
  const out = {
    blockSre: new Float64Array(9), blockSim: new Float64Array(9),
    blockDre: new Float64Array(9), blockDim: new Float64Array(9),
  };
  const cls = classifyPair(elT.nodes, elR.nodes, sameElementBase);
  accumulateMirroredPairBlocks(elT, elR, cls, k, singularOrder, nodes, trialSign, mirrors, out, makePairScratch());
  return out;
}

// ============================================================
// ── ASSEMBLAGE GALERKIN (domaine fermé unique)
// ============================================================
/**
 * `mesh` = { nodes: Float64Array-like [[x,y,z],...] (mètres), elements:
 *            [{ nodes:[i,j,k] (ids globaux soudés), normal:[nx,ny,nz]
 *            (sortante), area }] }
 * Retourne { M, S, D, N } avec M réelle (Float64Array N*N), S,D complexes
 * (Float64Array 2*N*N, re/im entrelacés), N = nombre de nœuds du maillage.
 */
function assembleGalerkin(mesh, k, opts) {
  const singularOrder = (opts && opts.singularOrder) || 3;
  const nodes = mesh.nodes;
  const elements = mesh.elements;
  const N = nodes.length;
  const Ne = elements.length;

  const M = new Float64Array(N*N);
  const S = new Float64Array(2*N*N);
  const D = new Float64Array(2*N*N);

  // -- Masse : boucle simple sur les éléments.
  for (let e = 0; e < Ne; e++) {
    const el = elements[e];
    const block = massElementBlock(el.area);
    for (let i = 0; i < 3; i++) {
      const gi = el.nodes[i];
      for (let j = 0; j < 3; j++) {
        const gj = el.nodes[j];
        M[gi*N+gj] += block[i*3+j];
      }
    }
  }

  // -- Simple/double couche : double boucle sur les paires d'éléments.
  for (let ei = 0; ei < Ne; ei++) {
    const elT = elements[ei];
    for (let ej = 0; ej < Ne; ej++) {
      const elR = elements[ej];
      const { blockSre, blockSim, blockDre, blockDim } =
        computePairBlocks(elT, elR, ei === ej, k, singularOrder, nodes);

      for (let i = 0; i < 3; i++) {
        const gi = elT.nodes[i];
        for (let j = 0; j < 3; j++) {
          const gj = elR.nodes[j];
          const idx = 2*(gi*N+gj);
          S[idx]   += blockSre[i*3+j]; S[idx+1]   += blockSim[i*3+j];
          D[idx]   += blockDre[i*3+j]; D[idx+1]   += blockDim[i*3+j];
        }
      }
    }
  }

  return { M, S, D, N };
}

// ============================================================
// ── ASSEMBLAGE GALERKIN MULTI-DOMAINE
// ============================================================
// Réutilise le modèle de `bemDomainCore.js::buildMultiDomainModel` (parsing,
// soudure, tags, domaines, orientation) tel quel — seule l'indexation des
// inconnues change : par NŒUD (P1 continu) au lieu de par ÉLÉMENT (P0).
// Généralisation directe du système P0 de `solveMultiDomain` :
//   - Chaque domaine écrit sa PROPRE équation (test = ses nœuds à lui, sur SA
//     seule frontière) ; un nœud d'interface reçoit deux lignes (une par
//     domaine voisin), exactement comme un élément d'interface P0 reçoit deux
//     lignes. D'où une matrice RECTANGULAIRE en apparence (Σ nœuds-test par
//     domaine) mais CARRÉE en réalité : Np (pression, partagée entre domaines
//     via le même nœud global ⇒ continuité automatique) + Nq (flux, un par
//     nœud d'interface).
//   - Images miroir (baffle + symétrie H/V/HV) : `opts.getMirrors(domain)` doit
//     renvoyer la liste de miroirs (cf. `bemDomainCore.js::domainMirrors`) ;
//     par défaut `[{identity:true}]` (aucun miroir, comportement inchangé).
/**
 * @param {object} model  sortie de bemDomainCore.buildMultiDomainModel
 * @param {number[][]} nodes  coordonnées (mètres) indexées par id de nœud soudé
 * @param {number} k
 * @param {number} omega  2π·fréquence (nécessaire séparément de k car k=ω/c
 *   ne redonne pas ω sans la vitesse du son — gardé explicite plutôt que
 *   recalculé, pour ne pas dupliquer C_AIR ici).
 * @param {object} [opts]
 * @param {(domain:object)=>Array} [opts.getMirrors]  miroirs propres au domaine
 */
function buildGalerkinDofs(model) {
  const pIndex = new Map();   // rawNodeId -> compact P index
  const qIndex = new Map();   // rawNodeId -> compact Q index (nœuds d'interface seulement)
  for (const el of model.elements) {
    for (const g of el.nodes) if (!pIndex.has(g)) pIndex.set(g, pIndex.size);
  }
  for (let i = 0; i < model.elements.length; i++) {
    if (!model.info[i].iface) continue;
    for (const g of model.elements[i].nodes) if (!qIndex.has(g)) qIndex.set(g, qIndex.size);
  }
  return { pIndex, qIndex, Np: pIndex.size, Nq: qIndex.size };
}

function assembleMultiDomainGalerkin(model, nodes, k, omega, opts) {
  const singularOrder = (opts && opts.singularOrder) || 3;
  const getMirrors = (opts && opts.getMirrors) || (() => [{ identity: true }]);
  const { pIndex, qIndex, Np, Nq } = buildGalerkinDofs(model);
  const Nt = Np + Nq;

  // Ligne = (domaine, nœud LOCAL à ce domaine) ; distincte de la colonne
  // (nœud GLOBAL partagé) — même dissociation que `row` vs `pIndex`/`qIndex`
  // dans solveMultiDomain (P0).
  const domainsArr = [...model.domains.values()];
  const rowIndex = domainsArr.map(() => new Map()); // par domaine : rawNodeId -> row
  let totalRows = 0;
  domainsArr.forEach((d, di) => {
    for (const j of d.elemIdx) {
      for (const g of model.elements[j].nodes) {
        if (!rowIndex[di].has(g)) { rowIndex[di].set(g, totalRows++); }
      }
    }
  });
  if (totalRows !== Nt) {
    throw new Error(`Galerkin multi-domain: ${totalRows} rows for ${Nt} unknowns (Np=${Np}, Nq=${Nq}) — every interface must connect exactly two subdomains.`);
  }

  const A = new Float64Array(2*Nt*Nt);
  const rhs = new Float64Array(2*Nt);
  const onProgress = opts && opts.onProgress;
  const totalPairs = domainsArr.reduce((s, d) => s + d.elemIdx.length * d.elemIdx.length, 0);
  let donePairs = 0, lastReport = 0;

  domainsArr.forEach((d, di) => {
    const idx = d.elemIdx;
    const rows = rowIndex[di];
    const mirrors = getMirrors(d);
    // Lignes/colonnes et classification des paires ne dépendent QUE de la
    // topologie : les recalculer à chaque fréquence coûtait des millions de
    // `Map.get` et d'objets jetables. On les mémorise sur le modèle.
    const plan = domainPairPlan(model, d, di, rows, pIndex, qIndex, Np, idx, Nt);
    const rowOf = plan.rowOf, pColOf = plan.pColOf, qColOf = plan.qColOf, classOf = plan.classOf;

    // -- Terme libre (masse), boucle simple. Un élément EXACTEMENT dans un plan
    // miroir (ex : ouverture rayonnante dans le plan du baffle) a une image
    // confondue avec lui-même ; son terme de masse compte alors pour 2 (comme
    // le « 0.5×max(1,coincidentCount) » du P0, cf. bemDomainCore.js::prepareMultiDomain).
    const massRowSum = new Float64Array(Nt);
    for (const e of idx) {
      const el = model.elements[e];
      const block = massElementBlock(el.area);
      let coincidentCount = 1;
      for (const m of mirrors) {
        if (m.identity) continue;
        const mE = applyMirrorToElement(el, m);
        const dx = el.centroid[0]-mE.centroid[0], dy = el.centroid[1]-mE.centroid[1], dz = el.centroid[2]-mE.centroid[2];
        if (dx*dx + dy*dy + dz*dz < MIRROR_COINCIDENT_EPS2) coincidentCount++;
      }
      for (let i = 0; i < 3; i++) {
        const row = rows.get(el.nodes[i]);
        for (let j = 0; j < 3; j++) {
          const col = pIndex.get(el.nodes[j]);
          const v = 0.5*coincidentCount*block[i*3+j];
          A[2*(row*Nt+col)] += v;
          massRowSum[row] += v;
        }
      }
    }

    // -- Régularisation par somme de lignes (domaines FERMÉS uniquement).
    // Sur un domaine INTÉRIEUR, la pression constante est solution exacte du
    // problème à flux nul : (½M + D₀)·1 doit valoir 0. Sur un domaine
    // EXTÉRIEUR ce n'est PAS le cas — la constante viole la condition de
    // rayonnement — et l'identité exacte devient (½M + D₀)·1 = M·1, parce que
    // la normale sortante du fluide donne ∫∂G₀/∂n = +½ au lieu de -½.
    // Forcer 0 dans ce cas décale la diagonale de toute la masse et ANNULE la
    // composante monopolaire : la caisse fermée ne rayonne alors plus rien
    // (100× trop faible en champ lointain, sans que le bilan de puissance
    // surfacique ne s'en aperçoive).
    if (d.closed) {
      const exterior = d.type === 'exterior';
      const staticSums = domainStaticRowSums(model, d, di, nodes, singularOrder, plan, idx, Nt);
      for (let a = 0; a < idx.length; a++) {
        for (let i = 0; i < 3; i++) {
          const row = plan.rowOf[3 * a + i];
          if (plan.diagDone[row]) continue;
          plan.diagDone[row] = 1;
          // massRowSum porte déjà le facteur ½·coincidentCount, donc la cible
          // extérieure M·1 vaut 2·massRowSum.
          const target = exterior ? 2 * massRowSum[row] : 0;
          A[2*(row*Nt + plan.pColOf[3 * a + i])] -= massRowSum[row] + staticSums[row] - target;
        }
      }
      plan.diagDone.fill(0);
    }

    // -- Double couche (D, tous les éléments trial) + simple couche (S, selon rôle).
    const blk = {
      blockSre: new Float64Array(9), blockSim: new Float64Array(9),
      blockDre: new Float64Array(9), blockDim: new Float64Array(9),
    };
    const scratch = makePairScratch();
    const blockSre = blk.blockSre, blockSim = blk.blockSim, blockDre = blk.blockDre, blockDim = blk.blockDim;
    const nLocal = idx.length;
    for (let a = 0; a < nLocal; a++) {
      const ei = idx[a];
      const elT = model.elements[ei];
      for (let b = 0; b < nLocal; b++) {
        const ej = idx[b];
        const elR = model.elements[ej];
        const sj = d.sign.get(ej);
        const role = d.role.get(ej);
        blockSre.fill(0); blockSim.fill(0); blockDre.fill(0); blockDim.fill(0);
        accumulateMirroredPairBlocks(elT, elR, classOf[a * nLocal + b], k, singularOrder, nodes, sj, mirrors, blk, scratch);

        const s = role === 'driven' ? -omega * RHO_AIR_G * d.velocity.get(ej) : 0;
        for (let i = 0; i < 3; i++) {
          const row = rowOf[3 * a + i];
          const base = 2 * row * Nt;
          for (let j = 0; j < 3; j++) {
            const ij = i * 3 + j;
            const col = pColOf[3 * b + j];
            A[base + 2 * col]     += blockDre[ij];
            A[base + 2 * col + 1] += blockDim[ij];

            if (role === 'boundary') continue; // paroi rigide : q = 0, pas de S.
            if (role === 'driven') {
              // q connu, constant sur l'élément : -G·q passe au second membre.
              // Même dérivation que solveMultiDomain (P0) : q=i·s,
              // s=-ω·ρ·vitesse ; (blockS)·(i·s) = -s·Im(blockS) + i·s·Re(blockS).
              rhs[2*row]   += -s * blockSim[ij];
              rhs[2*row+1] += s * blockSre[ij];
            } else {
              // Interface : q = signe(domaine) × Q (nœud partagé).
              const qcol = qColOf[3 * b + j];
              A[base + 2 * qcol]     += -sj * blockSre[ij];
              A[base + 2 * qcol + 1] += -sj * blockSim[ij];
            }
          }
        }
      }
      donePairs += nLocal;
      if (onProgress && donePairs - lastReport > 20000) {
        lastReport = donePairs;
        onProgress(donePairs / totalPairs);
      }
    }
  });

  return { A, rhs, Nt, Np, Nq, pIndex, qIndex, rowIndex, domainsArr };
}

/**
 * Plan de paires d'un domaine : indices de lignes/colonnes déjà résolus et
 * classification d'adjacence de chaque paire. Ce sont des données de
 * TOPOLOGIE — invariantes en fréquence — mais elles étaient recalculées à
 * chaque assemblage (des millions de `Map.get` et un objet jetable par paire).
 * Le plan est mémorisé sur le modèle et partagé par toutes les fréquences.
 */
function domainPairPlan(model, d, di, rows, pIndex, qIndex, Np, idx, Nt) {
  if (!model._galerkinPlans) model._galerkinPlans = [];
  const cached = model._galerkinPlans[di];
  if (cached) return cached;

  const n = idx.length;
  const rowOf = new Int32Array(3 * n);
  const pColOf = new Int32Array(3 * n);
  const qColOf = new Int32Array(3 * n);
  for (let a = 0; a < n; a++) {
    const nodesOf = model.elements[idx[a]].nodes;
    for (let i = 0; i < 3; i++) {
      const g = nodesOf[i];
      rowOf[3 * a + i] = rows.get(g);
      pColOf[3 * a + i] = pIndex.get(g);
      qColOf[3 * a + i] = qIndex.has(g) ? Np + qIndex.get(g) : -1;
    }
  }
  const classOf = new Array(n * n);
  for (let a = 0; a < n; a++) {
    const tn = model.elements[idx[a]].nodes;
    for (let b = 0; b < n; b++) {
      classOf[a * n + b] = classifyPair(tn, model.elements[idx[b]].nodes, idx[a] === idx[b]);
    }
  }
  const plan = { rowOf, pColOf, qColOf, classOf, diagDone: new Uint8Array(Nt) };
  model._galerkinPlans[di] = plan;
  return plan;
}

/**
 * Sommes de lignes de la double couche STATIQUE (k = 0) d'un domaine fermé,
 * images de symétrie comprises. Géométrique donc indépendante de la fréquence :
 * calculée une fois, réutilisée par tout le balayage.
 */
function domainStaticRowSums(model, d, di, nodes, singularOrder, plan, idx, Nt) {
  if (plan.staticRowSums) return plan.staticRowSums;
  const sums = new Float64Array(Nt);
  const blk = {
    blockSre: new Float64Array(9), blockSim: new Float64Array(9),
    blockDre: new Float64Array(9), blockDim: new Float64Array(9),
  };
  const scratch = makePairScratch();
  const n = idx.length;
  for (let a = 0; a < n; a++) {
    const elT = model.elements[idx[a]];
    for (let b = 0; b < n; b++) {
      const ej = idx[b];
      blk.blockDre.fill(0); blk.blockDim.fill(0);
      blk.blockSre.fill(0); blk.blockSim.fill(0);
      accumulateMirroredPairBlocks(elT, model.elements[ej], classOfPair(plan, a, b, n), 0, singularOrder,
        nodes, d.sign.get(ej), model.symMirrors, blk, scratch);
      for (let i = 0; i < 3; i++) {
        const row = plan.rowOf[3 * a + i];
        sums[row] += blk.blockDre[i*3] + blk.blockDre[i*3+1] + blk.blockDre[i*3+2];
      }
    }
  }
  plan.staticRowSums = sums;
  return sums;
}

function classOfPair(plan, a, b, n) {
  return plan.classOf[a * n + b];
}

// ============================================================
// ── POST-TRAITEMENT : CHAMP RAYONNÉ, POLAIRE, BILAN DE PUISSANCE
// ============================================================
// Consomme la solution déjà résolue (pArr/qArr, indexées par pIndex/qIndex —
// cf. `assembleMultiDomainGalerkin`) ; ne fait AUCUN solve ici. `mirrors` est
// injecté par l'appelant (typiquement `bemDomainCore.domainMirrors(model,d)`),
// comme pour l'assemblage — bemGalerkin.js reste sans dépendance cachée sur
// bemDomainCore.js.

/** Valeur nodale de q (P1) au nœud local `li` de l'élément `j` du domaine `d`. */
function galerkinNodalQ(model, d, j, li, qIndex, qArr, omega) {
  const role = d.role.get(j);
  if (role === 'boundary') return { re: 0, im: 0 };
  if (role === 'driven') return { re: 0, im: -omega * RHO_AIR_G * d.velocity.get(j) };
  const g = model.elements[j].nodes[li];
  const sj = d.sign.get(j);
  const m = qIndex.get(g);
  return { re: sj * qArr[2*m], im: sj * qArr[2*m+1] };
}

/**
 * Formule de représentation p(x) = Σ_j ∫ [G·q(y) - ∂G/∂n_y·p(y)] dS_y, images
 * miroir comprises — généralisation P1 de `bemDomainCore.js::
 * multiDomainFieldPressure`. `x` est HORS surface (champ proche/lointain) :
 * aucune singularité, quadrature régulière simple (pas de Duffy).
 *
 * `wantVelocity` ajoute la VITESSE PARTICULAIRE v = ∇p/(iωρ), obtenue en
 * dérivant la même formule par rapport au point d'OBSERVATION. Avec
 * d = y - x, R = |d| :
 *     W = G·(ik - 1/R)/R                 →  ∇ₓG          = -W·d
 *     P = G·(-k²/R² - 3ik/R³ + 3/R⁴)     →  ∇ₓ(∂G/∂n_y)  = -P·(d·n)·d - W·n
 * d'où  ∇p = ∫ [ -W·d·q + (P·(d·n)·d + W·n)·p ] dS.
 * Les deux grandeurs partagent chaque évaluation de noyau, d'où le calcul en
 * UN seul passage : les demander séparément doublait le temps des nappes.
 *
 * Convention e^{-iωt} du solveur (q = ∂p/∂n = +iωρ·v_n, cf. `galerkinNodalQ`
 * où `d.velocity` est comptée VERS l'intérieur du domaine) ⇒ v = -i·∇p/(ωρ).
 * @returns {{re, im, v: {re: number[3], im: number[3]}|null}} v en m/s pour une
 *          amplitude de diaphragme unité (le couplage moteur est appliqué par
 *          l'appelant).
 */
function galerkinFieldResponse(x, model, nodesArr, d, k, omega, pIndex, qIndex, pArr, qArr, mirrors, wantVelocity) {
  let pRe = 0, pIm = 0;
  const gRe = [0, 0, 0], gIm = [0, 0, 0];   // ∇p
  for (const j of d.elemIdx) {
    const el = model.elements[j];
    const sj = d.sign.get(j);
    const v = [nodesArr[el.nodes[0]], nodesArr[el.nodes[1]], nodesArr[el.nodes[2]]];
    const pNodal = el.nodes.map(g => ({ re: pArr[2*pIndex.get(g)], im: pArr[2*pIndex.get(g)+1] }));
    const qNodal = [0, 1, 2].map(li => galerkinNodalQ(model, d, j, li, qIndex, qArr, omega));

    for (const m of (mirrors || [{ identity: true }])) {
      const mv0 = m.identity ? v[0] : [v[0][0]*m.s[0]+m.o[0], v[0][1]*m.s[1]+m.o[1], v[0][2]*m.s[2]+m.o[2]];
      const mv1r = m.identity ? v[1] : [v[1][0]*m.s[0]+m.o[0], v[1][1]*m.s[1]+m.o[1], v[1][2]*m.s[2]+m.o[2]];
      const mv2r = m.identity ? v[2] : [v[2][0]*m.s[0]+m.o[0], v[2][1]*m.s[1]+m.o[1], v[2][2]*m.s[2]+m.o[2]];
      const det = m.identity ? 1 : m.s[0]*m.s[1]*m.s[2];
      const mv1 = det < 0 ? mv2r : mv1r, mv2 = det < 0 ? mv1r : mv2r;
      const mn = m.identity ? el.normal : [el.normal[0]*m.s[0], el.normal[1]*m.s[1], el.normal[2]*m.s[2]];
      const nEff = sj === 1 ? mn : [-mn[0], -mn[1], -mn[2]];

      for (const { xi, eta, w } of REGULAR_RULE) {
        const y = mapPoint(mv0, mv1, mv2, xi, eta);
        const N = p1Values(xi, eta);
        let pyRe = 0, pyIm = 0, qyRe = 0, qyIm = 0;
        for (let i = 0; i < 3; i++) {
          pyRe += N[i]*pNodal[i].re; pyIm += N[i]*pNodal[i].im;
          qyRe += N[i]*qNodal[i].re; qyIm += N[i]*qNodal[i].im;
        }
        const wj = w * el.area;

        const dx = y[0]-x[0], dy = y[1]-x[1], dz = y[2]-x[2];
        const R2 = dx*dx + dy*dy + dz*dz;
        const R = Math.sqrt(R2);
        if (R < 1e-15) continue;
        const kr = k*R, inv4piR = 1/(4*Math.PI*R);
        const gkRe = Math.cos(kr)*inv4piR, gkIm = Math.sin(kr)*inv4piR;
        const fRe = -1/R2, fIm = k/R;                       // (ik - 1/R)/R
        const WRe = gkRe*fRe - gkIm*fIm, WIm = gkRe*fIm + gkIm*fRe;
        const dn = dx*nEff[0] + dy*nEff[1] + dz*nEff[2];

        // p : G·q - (∂G/∂n_y)·p, avec ∂G/∂n_y = W·(d·n).
        pRe += (gkRe*qyRe - gkIm*qyIm) * wj - (WRe*pyRe - WIm*pyIm) * dn * wj;
        pIm += (gkRe*qyIm + gkIm*qyRe) * wj - (WRe*pyIm + WIm*pyRe) * dn * wj;
        if (!wantVelocity) continue;

        const qqRe = -k*k/R2 + 3/(R2*R2), qqIm = -3*k/(R2*R);
        const PRe = gkRe*qqRe - gkIm*qqIm, PIm = gkRe*qqIm + gkIm*qqRe;
        // (-W·q + P·(d·n)·p) multiplie d ; (W·p) multiplie n.
        const aRe = (-(WRe*qyRe - WIm*qyIm) + dn*(PRe*pyRe - PIm*pyIm)) * wj;
        const aIm = (-(WRe*qyIm + WIm*qyRe) + dn*(PRe*pyIm + PIm*pyRe)) * wj;
        const bRe = (WRe*pyRe - WIm*pyIm) * wj;
        const bIm = (WRe*pyIm + WIm*pyRe) * wj;
        gRe[0] += aRe*dx + bRe*nEff[0];
        gRe[1] += aRe*dy + bRe*nEff[1];
        gRe[2] += aRe*dz + bRe*nEff[2];
        gIm[0] += aIm*dx + bIm*nEff[0];
        gIm[1] += aIm*dy + bIm*nEff[1];
        gIm[2] += aIm*dz + bIm*nEff[2];
      }
    }
  }
  if (!wantVelocity) return { re: pRe, im: pIm, v: null };
  const s = 1 / (omega * RHO_AIR_G);   // v = -i·∇p/(ωρ)
  return {
    re: pRe, im: pIm,
    v: { re: [gIm[0]*s, gIm[1]*s, gIm[2]*s], im: [-gRe[0]*s, -gRe[1]*s, -gRe[2]*s] },
  };
}

function galerkinFieldPressure(x, model, nodesArr, d, k, omega, pIndex, qIndex, pArr, qArr, mirrors) {
  return galerkinFieldResponse(x, model, nodesArr, d, k, omega, pIndex, qIndex, pArr, qArr, mirrors, false);
}

function galerkinFieldVelocity(x, model, nodesArr, d, k, omega, pIndex, qIndex, pArr, qArr, mirrors) {
  return galerkinFieldResponse(x, model, nodesArr, d, k, omega, pIndex, qIndex, pArr, qArr, mirrors, true).v;
}

// ── Nappes : le même intégrande pour des MILLIERS de points ──────────────
// `galerkinFieldResponse` refait, pour chaque point d'observation, la transfo
// miroir des sommets, la lecture des valeurs nodales et les allocations qui
// vont avec. Sur une nappe de 5000 points × 4 domaines × 350 éléments × 4
// miroirs cela fait des dizaines de millions de petits tableaux jetables, et
// c'est le ramasse-miettes — pas l'arithmétique — qui domine le temps.
// On aplatit donc l'intégrande UNE fois par (domaine, fréquence) : chaque point
// de quadrature devient 10 flottants contigus, et l'évaluation d'un point
// d'observation se réduit à une boucle numérique pure.
const FIELD_QUAD_STRIDE = 10;   // y(3) · p·w(2) · q·w(2) · n(3)

// Le cache ci-dessus est une règle à 7 points FIGÉE : elle n'est exacte que si
// l'élément est petit devant sa distance au point d'observation. Le noyau de la
// vitesse varie en 1/R³, si bien qu'un point posé DANS un event — donc à
// quelques millimètres de parois maillées en centimètres — rendait des vitesses
// aberrantes qu'il fallait masquer, et l'event restait vide à l'écran. On garde
// donc aussi la géométrie du bloc pour ré-intégrer par subdivision adaptative
// quand le point est proche : v0(3) v1(3) v2(3) n(3) centroïde(3) aire h p(6) q(6).
const FIELD_GEOM_STRIDE = 29;
const FIELD_QUAD_PER_BLOCK = REGULAR_RULE.length;
const FIELD_NEAR_FACTOR = 1.5;      // en tailles d'élément : au-delà, le cache suffit
const FIELD_NEAR_MAX_DEPTH = 6;     // 4^6 morceaux au pire, mais la descente est locale

function buildFieldQuadCache(model, nodesArr, d, omega, pIndex, qIndex, pArr, qArr, mirrors) {
  const mirrorList = mirrors || [{ identity: true }];
  const blocks = d.elemIdx.length * mirrorList.length;
  const data = new Float64Array(blocks * FIELD_QUAD_PER_BLOCK * FIELD_QUAD_STRIDE);
  const geom = new Float64Array(blocks * FIELD_GEOM_STRIDE);
  let go = 0;
  let o = 0;
  for (const j of d.elemIdx) {
    const el = model.elements[j];
    const sj = d.sign.get(j);
    const v = [nodesArr[el.nodes[0]], nodesArr[el.nodes[1]], nodesArr[el.nodes[2]]];
    const pNodal = el.nodes.map(g => ({ re: pArr[2*pIndex.get(g)], im: pArr[2*pIndex.get(g)+1] }));
    const qNodal = [0, 1, 2].map(li => galerkinNodalQ(model, d, j, li, qIndex, qArr, omega));

    for (const m of mirrorList) {
      const mv0 = m.identity ? v[0] : [v[0][0]*m.s[0]+m.o[0], v[0][1]*m.s[1]+m.o[1], v[0][2]*m.s[2]+m.o[2]];
      const mv1r = m.identity ? v[1] : [v[1][0]*m.s[0]+m.o[0], v[1][1]*m.s[1]+m.o[1], v[1][2]*m.s[2]+m.o[2]];
      const mv2r = m.identity ? v[2] : [v[2][0]*m.s[0]+m.o[0], v[2][1]*m.s[1]+m.o[1], v[2][2]*m.s[2]+m.o[2]];
      const det = m.identity ? 1 : m.s[0]*m.s[1]*m.s[2];
      const mv1 = det < 0 ? mv2r : mv1r, mv2 = det < 0 ? mv1r : mv2r;
      const mn = m.identity ? el.normal : [el.normal[0]*m.s[0], el.normal[1]*m.s[1], el.normal[2]*m.s[2]];
      const nEff = sj === 1 ? mn : [-mn[0], -mn[1], -mn[2]];

      geom[go] = mv0[0]; geom[go+1] = mv0[1]; geom[go+2] = mv0[2];
      geom[go+3] = mv1[0]; geom[go+4] = mv1[1]; geom[go+5] = mv1[2];
      geom[go+6] = mv2[0]; geom[go+7] = mv2[1]; geom[go+8] = mv2[2];
      geom[go+9] = nEff[0]; geom[go+10] = nEff[1]; geom[go+11] = nEff[2];
      geom[go+12] = (mv0[0]+mv1[0]+mv2[0])/3;
      geom[go+13] = (mv0[1]+mv1[1]+mv2[1])/3;
      geom[go+14] = (mv0[2]+mv1[2]+mv2[2])/3;
      geom[go+15] = el.area;
      geom[go+16] = Math.sqrt(2 * el.area);
      for (let i = 0; i < 3; i++) {
        geom[go+17+2*i] = pNodal[i].re; geom[go+18+2*i] = pNodal[i].im;
        geom[go+23+2*i] = qNodal[i].re; geom[go+24+2*i] = qNodal[i].im;
      }
      go += FIELD_GEOM_STRIDE;

      for (const { xi, eta, w } of REGULAR_RULE) {
        const y = mapPoint(mv0, mv1, mv2, xi, eta);
        const N = p1Values(xi, eta);
        const wj = w * el.area;
        let pyRe = 0, pyIm = 0, qyRe = 0, qyIm = 0;
        for (let i = 0; i < 3; i++) {
          pyRe += N[i]*pNodal[i].re; pyIm += N[i]*pNodal[i].im;
          qyRe += N[i]*qNodal[i].re; qyIm += N[i]*qNodal[i].im;
        }
        data[o] = y[0]; data[o+1] = y[1]; data[o+2] = y[2];
        data[o+3] = pyRe * wj; data[o+4] = pyIm * wj;
        data[o+5] = qyRe * wj; data[o+6] = qyIm * wj;
        data[o+7] = nEff[0]; data[o+8] = nEff[1]; data[o+9] = nEff[2];
        o += FIELD_QUAD_STRIDE;
      }
    }
  }
  return { data, geom, blocks };
}

/** Un échantillon de quadrature ajouté à l'accumulateur pression + gradient. */
function accumulateFieldSample(acc, yx, yy, yz, pwRe, pwIm, qwRe, qwIm, nx, ny, nz, x0, x1, x2, k, wantVelocity) {
  const dx = yx - x0, dy = yy - x1, dz = yz - x2;
  const R2 = dx*dx + dy*dy + dz*dz;
  if (R2 < 1e-30) return;
  const R = Math.sqrt(R2);
  const kr = k*R, inv4piR = 1/(4*Math.PI*R);
  const gkRe = Math.cos(kr)*inv4piR, gkIm = Math.sin(kr)*inv4piR;
  const fRe = -1/R2, fIm = k/R;
  const WRe = gkRe*fRe - gkIm*fIm, WIm = gkRe*fIm + gkIm*fRe;
  const dn = dx*nx + dy*ny + dz*nz;

  acc.pRe += (gkRe*qwRe - gkIm*qwIm) - (WRe*pwRe - WIm*pwIm) * dn;
  acc.pIm += (gkRe*qwIm + gkIm*qwRe) - (WRe*pwIm + WIm*pwRe) * dn;
  if (!wantVelocity) return;

  const qqRe = -k*k/R2 + 3/(R2*R2), qqIm = -3*k/(R2*R);
  const PRe = gkRe*qqRe - gkIm*qqIm, PIm = gkRe*qqIm + gkIm*qqRe;
  const aRe = -(WRe*qwRe - WIm*qwIm) + dn*(PRe*pwRe - PIm*pwIm);
  const aIm = -(WRe*qwIm + WIm*qwRe) + dn*(PRe*pwIm + PIm*pwRe);
  const bRe = WRe*pwRe - WIm*pwIm, bIm = WRe*pwIm + WIm*pwRe;
  acc.g0r += aRe*dx + bRe*nx; acc.g1r += aRe*dy + bRe*ny; acc.g2r += aRe*dz + bRe*nz;
  acc.g0i += aIm*dx + bIm*nx; acc.g1i += aIm*dy + bIm*ny; acc.g2i += aIm*dz + bIm*nz;
}

const _fieldAcc = { pRe: 0, pIm: 0, g0r: 0, g1r: 0, g2r: 0, g0i: 0, g1i: 0, g2i: 0 };
const _fieldBlk = { v0: [0,0,0], v1: [0,0,0], v2: [0,0,0], n: [0,0,0], p: new Float64Array(6), q: new Float64Array(6), area: 0 };

/**
 * Intègre un sous-triangle en coordonnées de référence (xi, eta) du bloc, en
 * subdivisant tant qu'il n'est pas petit devant sa distance au point. À la
 * profondeur 0 et loin du bloc, le critère est faux d'emblée : on retombe
 * exactement sur la règle à 7 points du cache.
 */
function refineFieldTri(acc, b, aXi, aEta, bXi, bEta, cXi, cEta, depth, x0, x1, x2, k, wantVelocity) {
  const v0 = b.v0, v1 = b.v1, v2 = b.v2;
  const la = 1 - aXi - aEta, lb = 1 - bXi - bEta, lc = 1 - cXi - cEta;
  const ax = la*v0[0] + aXi*v1[0] + aEta*v2[0], ay = la*v0[1] + aXi*v1[1] + aEta*v2[1], az = la*v0[2] + aXi*v1[2] + aEta*v2[2];
  const bx = lb*v0[0] + bXi*v1[0] + bEta*v2[0], by = lb*v0[1] + bXi*v1[1] + bEta*v2[1], bz = lb*v0[2] + bXi*v1[2] + bEta*v2[2];
  const cx = lc*v0[0] + cXi*v1[0] + cEta*v2[0], cy = lc*v0[1] + cXi*v1[1] + cEta*v2[1], cz = lc*v0[2] + cXi*v1[2] + cEta*v2[2];

  const gx = (ax+bx+cx)/3 - x0, gy = (ay+by+cy)/3 - x1, gz = (az+bz+cz)/3 - x2;
  const dist = Math.sqrt(gx*gx + gy*gy + gz*gz);
  const size = Math.max(
    Math.hypot(bx-ax, by-ay, bz-az),
    Math.hypot(cx-bx, cy-by, cz-bz),
    Math.hypot(ax-cx, ay-cy, az-cz));

  if (depth < FIELD_NEAR_MAX_DEPTH && size > 0.5 * dist) {
    const abXi = (aXi+bXi)/2, abEta = (aEta+bEta)/2;
    const bcXi = (bXi+cXi)/2, bcEta = (bEta+cEta)/2;
    const caXi = (cXi+aXi)/2, caEta = (cEta+aEta)/2;
    refineFieldTri(acc, b, aXi, aEta, abXi, abEta, caXi, caEta, depth+1, x0, x1, x2, k, wantVelocity);
    refineFieldTri(acc, b, abXi, abEta, bXi, bEta, bcXi, bcEta, depth+1, x0, x1, x2, k, wantVelocity);
    refineFieldTri(acc, b, caXi, caEta, bcXi, bcEta, cXi, cEta, depth+1, x0, x1, x2, k, wantVelocity);
    refineFieldTri(acc, b, abXi, abEta, bcXi, bcEta, caXi, caEta, depth+1, x0, x1, x2, k, wantVelocity);
    return;
  }

  // Le découpage en 4 conserve les aires : chaque niveau divise par 4.
  const subArea = b.area / (1 << (2 * depth));
  const n = b.n, pN = b.p, qN = b.q;
  for (let r = 0; r < REGULAR_RULE.length; r++) {
    const { xi, eta, w } = REGULAR_RULE[r];
    const l0 = 1 - xi - eta;
    const pXi = l0*aXi + xi*bXi + eta*cXi;
    const pEta = l0*aEta + xi*bEta + eta*cEta;
    const n0 = 1 - pXi - pEta;
    const wj = w * subArea;
    accumulateFieldSample(acc,
      l0*ax + xi*bx + eta*cx, l0*ay + xi*by + eta*cy, l0*az + xi*bz + eta*cz,
      (n0*pN[0] + pXi*pN[2] + pEta*pN[4]) * wj, (n0*pN[1] + pXi*pN[3] + pEta*pN[5]) * wj,
      (n0*qN[0] + pXi*qN[2] + pEta*qN[4]) * wj, (n0*qN[1] + pXi*qN[3] + pEta*qN[5]) * wj,
      n[0], n[1], n[2], x0, x1, x2, k, wantVelocity);
  }
}

/** Même intégrande que `galerkinFieldResponse`, lu dans le cache aplati. */
function evalFieldQuadCache(cache, x, k, omega, wantVelocity, out) {
  const { data, geom, blocks } = cache;
  const x0 = x[0], x1 = x[1], x2 = x[2];
  const acc = _fieldAcc;
  acc.pRe = 0; acc.pIm = 0;
  acc.g0r = 0; acc.g1r = 0; acc.g2r = 0;
  acc.g0i = 0; acc.g1i = 0; acc.g2i = 0;
  const blockLen = FIELD_QUAD_PER_BLOCK * FIELD_QUAD_STRIDE;

  for (let b = 0; b < blocks; b++) {
    const g = b * FIELD_GEOM_STRIDE;
    const h = geom[g+16];
    const dcx = geom[g+12] - x0, dcy = geom[g+13] - x1, dcz = geom[g+14] - x2;
    const reach = (FIELD_NEAR_FACTOR + 1) * h;
    if (dcx*dcx + dcy*dcy + dcz*dcz <= reach * reach) {
      const blk = _fieldBlk;
      for (let c = 0; c < 3; c++) {
        blk.v0[c] = geom[g+c]; blk.v1[c] = geom[g+3+c]; blk.v2[c] = geom[g+6+c]; blk.n[c] = geom[g+9+c];
      }
      for (let c = 0; c < 6; c++) { blk.p[c] = geom[g+17+c]; blk.q[c] = geom[g+23+c]; }
      blk.area = geom[g+15];
      refineFieldTri(acc, blk, 0, 0, 1, 0, 0, 1, 0, x0, x1, x2, k, wantVelocity);
      continue;
    }
    const end = b * blockLen + blockLen;
    for (let o = b * blockLen; o < end; o += FIELD_QUAD_STRIDE) {
      accumulateFieldSample(acc, data[o], data[o+1], data[o+2],
        data[o+3], data[o+4], data[o+5], data[o+6],
        data[o+7], data[o+8], data[o+9], x0, x1, x2, k, wantVelocity);
    }
  }

  out.re = acc.pRe; out.im = acc.pIm;
  if (!wantVelocity) return out;
  const s = 1 / (omega * RHO_AIR_G);   // v = -i·∇p/(ωρ)
  out.vRe[0] = acc.g0i*s; out.vRe[1] = acc.g1i*s; out.vRe[2] = acc.g2i*s;
  out.vIm[0] = -acc.g0r*s; out.vIm[1] = -acc.g1r*s; out.vIm[2] = -acc.g2r*s;
  return out;
}

/** Généralisation P1 de `bemDomainCore.js::computeMultiDomainPolar`. */
function galerkinComputeMultiDomainPolar(model, nodesArr, d, k, omega, pIndex, qIndex, pArr, qArr, mirrors, plane, distance, angleStep, angleMaxDeg) {
  let cx = 0, cy = 0, cz = 0, aTot = 0;
  for (const j of d.elemIdx) {
    const el = model.elements[j];
    cx += el.centroid[0]*el.area; cy += el.centroid[1]*el.area; cz += el.centroid[2]*el.area;
    aTot += el.area;
  }
  const origin = aTot > 0 ? [cx/aTot, cy/aTot, cz/aTot] : [0, 0, 0];
  const bafAx = d.baffleAxisIdx ?? 2;
  const bafSign = d.baffleSign ?? 1;
  if (d.baffle) { origin[0] = 0; origin[1] = 0; origin[2] = 0; origin[bafAx] = d.baffleZ; }

  const angles = [], mags = [], phasesDeg = [];
  for (let deg = -angleMaxDeg; deg <= angleMaxDeg + 1e-9; deg += angleStep) {
    const rad = deg * Math.PI / 180;
    const s = distance * Math.sin(rad), c = distance * Math.cos(rad);
    const pt = (plane === 'H') ? [origin[0]+s, origin[1], origin[2]+c] : [origin[0], origin[1]+s, origin[2]+c];
    if (d.baffle && (pt[bafAx] - d.baffleZ) * bafSign < 0) { angles.push(deg); mags.push(0); phasesDeg.push(0); continue; }
    const p = galerkinFieldPressure(pt, model, nodesArr, d, k, omega, pIndex, qIndex, pArr, qArr, mirrors);
    angles.push(deg); mags.push(Math.hypot(p.re, p.im));
    phasesDeg.push(Math.atan2(p.im, p.re) * 180 / Math.PI);
  }
  let axisIdx = 0, best = Infinity;
  for (let i = 0; i < angles.length; i++) { const dd = Math.abs(angles[i]); if (dd < best) { best = dd; axisIdx = i; } }
  const ref = mags[axisIdx];
  const normalized = ref > 0 ? mags.map(m => m/ref) : mags.map(() => 0);
  return { angles, normalized, pressureMags: mags, phasesDeg, axisIdx };
}

/** Intégrale de puissance ½·Re(∫ p·conj(v) dS) sur UN élément, p/q P1 (v=q/(iωρ)). */
function elementPowerIntegral(pNodal, qNodal, area, omega) {
  let acc = 0;
  const invOmegaRho = 1 / (omega * RHO_AIR_G);
  for (const { xi, eta, w } of REGULAR_RULE) {
    const N = p1Values(xi, eta);
    let pRe = 0, pIm = 0, qRe = 0, qIm = 0;
    for (let i = 0; i < 3; i++) {
      pRe += N[i]*pNodal[i].re; pIm += N[i]*pNodal[i].im;
      qRe += N[i]*qNodal[i].re; qIm += N[i]*qNodal[i].im;
    }
    // v = q/(iωρ) = (qIm - i·qRe)/(ωρ)
    const vRe = qIm * invOmegaRho, vIm = -qRe * invOmegaRho;
    acc += (pRe*vRe + pIm*vIm) * w * area;
  }
  return 0.5 * acc;
}

/** Généralisation P1 de `bemDomainCore.js::multiDomainPowerBalance`. */
function galerkinPowerBalance(model, nodesArr, pIndex, qIndex, pArr, qArr, omega) {
  const out = [];
  let driven = 0, radiated = 0;
  for (const d of model.domains.values()) {
    let w = 0, wDriven = 0;
    for (const j of d.elemIdx) {
      const el = model.elements[j];
      const pNodal = el.nodes.map(g => ({ re: pArr[2*pIndex.get(g)], im: pArr[2*pIndex.get(g)+1] }));
      const qNodal = [0, 1, 2].map(li => galerkinNodalQ(model, d, j, li, qIndex, qArr, omega));
      const dw = elementPowerIntegral(pNodal, qNodal, el.area, omega) * model.mirrorCount;
      w += dw;
      if (d.role.get(j) === 'driven') wDriven += dw;
    }
    out.push({ domain: d.name, wOut: w });
    driven -= wDriven;
    if (d.type === 'exterior') radiated -= w;
  }
  const denom = Math.max(Math.abs(driven), Math.abs(radiated), 1e-300);
  return { perDomain: out, driven, radiated, mismatch: Math.abs(driven - radiated) / denom };
}

// ============================================================
// ── FAÇADE : même interface d'appel que le solveur P0
// ============================================================
/**
 * Table nœud soudé → coordonnées, reconstruite depuis les éléments du modèle.
 * `buildMultiDomainModel` ne conserve pas la table de nœuds (le P0 n'en a pas
 * besoin, il colloque aux centroïdes) mais chaque élément porte v0/v1/v2 dans
 * le même ordre que `nodes` : la relire ici évite de modifier bemDomainCore.js.
 */
function galerkinNodeTable(model) {
  const byId = new Map();
  for (const el of model.elements) {
    const verts = [el.v0, el.v1, el.v2];
    el.nodes.forEach((g, i) => { if (!byId.has(g)) byId.set(g, verts[i]); });
  }
  const arr = new Array(Math.max(...byId.keys()) + 1);
  for (const [id, xyz] of byId) arr[id] = xyz;
  return arr;
}

/**
 * Résout une fréquence en Galerkin P1 et renvoie un objet de solution portant
 * les mêmes champs que `solveMultiDomain` (P0) plus ce dont le post-traitement
 * P1 a besoin. `deps` fournit ce que ce fichier ne connaît pas : `domainMirrors`
 * (bemDomainCore) et `complexLUSolve` (bemShared).
 */
function solveMultiDomainGalerkin(freq, model, deps, options) {
  const opts = options || {};
  if (!(freq > 0)) throw new Error(`Invalid frequency ${freq}.`);
  const omega = 2 * Math.PI * freq;
  const k = omega / (deps.C_AIR || 344);
  const nodesArr = opts.nodesArr || galerkinNodeTable(model);

  const { A, rhs, Nt, Np, pIndex, qIndex } = assembleMultiDomainGalerkin(model, nodesArr, k, omega, {
    singularOrder: opts.singularOrder || 2,
    getMirrors: (d) => deps.domainMirrors(model, d),
    onProgress: opts.onProgress ? (f) => opts.onProgress(0.9 * f) : null,
  });
  if (opts.onProgress) opts.onProgress(0.9);

  const lu = deps.complexLUSolve(A, rhs, Nt, {
    throwOnSingular: true,
    label: `multi-domain Galerkin BEM @ ${freq.toFixed(1)} Hz`,
  });
  if (opts.onProgress) opts.onProgress(1);

  return {
    pArr: rhs.subarray(0, 2 * Np),
    qArr: rhs.subarray(2 * Np, 2 * Nt),
    pIndex, qIndex, nodesArr,
    k, omega, freq,
    condIndicator: lu.condIndicator,
  };
}

/** Polaire P1 avec la signature de `computeMultiDomainPolar` (P0). */
function galerkinPolar(model, sol, d, plane, distance, angleStep, angleMaxDeg, mirrors) {
  return galerkinComputeMultiDomainPolar(
    model, sol.nodesArr, d, sol.k, sol.omega, sol.pIndex, sol.qIndex, sol.pArr, sol.qArr,
    mirrors, plane, distance, angleStep, angleMaxDeg);
}

/** Bilan de puissance P1 avec la signature de `multiDomainPowerBalance` (P0). */
function galerkinBalance(model, sol) {
  return galerkinPowerBalance(model, sol.nodesArr, sol.pIndex, sol.qIndex, sol.pArr, sol.qArr, sol.omega);
}

/**
 * Réaction de l'air sur les surfaces PILOTÉES : F = ∫ p·u_n dS (images miroir
 * comprises) et aire de piston équivalente S = ∫ u_n dS, où u_n est le profil
 * de vitesse normale imposé pour une amplitude unité. La puissance fournie
 * valant ½·Re(F), F EST l'impédance mécanique de rayonnement vue par la
 * source — c'est elle qui manque à un couplage T&S « en l'air ».
 */
function galerkinDrivenLoad(model, sol) {
  let re = 0, im = 0, area = 0;
  for (const d of model.domains.values()) {
    for (const j of d.elemIdx) {
      if (d.role.get(j) !== 'driven') continue;
      const el = model.elements[j];
      const un = d.velocity.get(j);
      const w = un * el.area / 3;   // ∫ N_i dS sur un triangle P1
      for (const g of el.nodes) {
        const c = sol.pIndex.get(g);
        re += sol.pArr[2 * c] * w;
        im += sol.pArr[2 * c + 1] * w;
      }
      area += un * el.area;
    }
  }
  const m = model.mirrorCount;
  return { re: re * m, im: im * m, area: area * m };
}

/**
 * Débit volumique acoustique complexe traversant une surface, en m³/s.
 *
 * C'est la grandeur qui pilote la CFD de l'event : le BEM fixe le débit que
 * l'acoustique linéaire impose au conduit, Navier-Stokes s'occupe du reste.
 *
 * Un élément d'interface appartient à deux domaines avec des normales opposées;
 * ne le compter qu'une fois évite que la somme ne s'annule.
 *
 * @param {object} model
 * @param {object} sol - solution surfacique d'une fréquence
 * @param {(el: object) => boolean} matchElement - sélecteur d'éléments
 * @returns {{re: number, im: number, area: number}}
 */
function galerkinSurfaceVolumeVelocity(model, sol, matchElement) {
  let re = 0, im = 0, area = 0;
  const seen = new Set();
  const s = 1 / (sol.omega * RHO_AIR_G);   // v = q/(iωρ)
  for (const d of model.domains.values()) {
    for (const j of d.elemIdx) {
      if (seen.has(j)) continue;
      const el = model.elements[j];
      if (!matchElement(el)) continue;
      seen.add(j);
      const w = el.area / 3;   // ∫ N_i dS sur un triangle P1
      let qRe = 0, qIm = 0;
      for (let li = 0; li < 3; li++) {
        const q = galerkinNodalQ(model, d, j, li, sol.qIndex, sol.qArr, sol.omega);
        qRe += q.re * w;
        qIm += q.im * w;
      }
      re += qIm * s;
      im -= qRe * s;
      area += el.area;
    }
  }
  const m = model.mirrorCount;
  return { re: re * m, im: im * m, area: area * m };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    p1Values, mapPoint, singleLayerKernel, doubleLayerKernel, adjointDoubleLayerKernel,
    gaussRule1D, duffyRule, remapSharedVertex, remapSharedEdge, classifyPair,
    massElementBlock, computePairBlocks, assembleGalerkin, REGULAR_RULE,
    buildGalerkinDofs, assembleMultiDomainGalerkin, RHO_AIR: RHO_AIR_G,
    applyMirrorToElement, computeMirroredPairBlocks,
    galerkinNodalQ, galerkinFieldPressure, galerkinFieldVelocity, galerkinFieldResponse,
    buildFieldQuadCache, evalFieldQuadCache,
    galerkinComputeMultiDomainPolar,
    elementPowerIntegral, galerkinPowerBalance, galerkinSurfaceVolumeVelocity,
    galerkinNodeTable, solveMultiDomainGalerkin, galerkinPolar, galerkinBalance,
    galerkinDrivenLoad,
  };
}
