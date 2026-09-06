// =======================================================
// FICHIER :  src/js/bem/bemShared.js
// RÔLE    :  Primitives BEM partagées — noyaux de Green, quadrature,
//            symétrie par images miroir, solveur LU complexe, parser .msh
//            et classification des Physical Surfaces Gmsh.
//
//  Ce fichier est volontairement écrit en script SIMPLE : ni `import`, ni
//  `export`. Il est concaténé en tête du blob du Web Worker par
//  `getWorkerBlobUrl()` dans bemHornBackend.js — le worker est un worker
//  classique, il ne peut donc pas importer de modules.
//
//  Il expose aussi `module.exports` quand il est chargé sous Node (require),
//  pour que les scripts de validation dans scripts/ puissent l'utiliser.
//
//  Avant ce fichier, les mêmes noyaux étaient recopiés à l'identique dans
//  bemCore.js, bemWorker.js et bemMultiDomainCore.js — et ils avaient déjà
//  divergé (le rôle 'interface' n'existait que dans bemCore.js).
// =======================================================

'use strict';

const C_AIR = 344;
const RHO_AIR = 1.21;

// ============================================================
// ── QUADRATURE SUR TRIANGLE
// ============================================================
const GAUSS7 = [
  { l1: 1/3,      l2: 1/3,      l3: 1/3,      w: 0.225 },
  { l1: 0.059716, l2: 0.470142, l3: 0.470142, w: 0.132394 },
  { l1: 0.470142, l2: 0.059716, l3: 0.470142, w: 0.132394 },
  { l1: 0.470142, l2: 0.470142, l3: 0.059716, w: 0.132394 },
  { l1: 0.797427, l2: 0.101287, l3: 0.101287, w: 0.125939 },
  { l1: 0.101287, l2: 0.797427, l3: 0.101287, w: 0.125939 },
  { l1: 0.101287, l2: 0.101287, l3: 0.797427, w: 0.125939 },
];
const GAUSS3 = [
  { l1: 2/3, l2: 1/6, l3: 1/6, w: 1/3 },
  { l1: 1/6, l2: 2/3, l3: 1/6, w: 1/3 },
  { l1: 1/6, l2: 1/6, l3: 2/3, w: 1/3 },
];
const GAUSS1 = [
  { l1: 1/3, l2: 1/3, l3: 1/3, w: 1 },
];

/** Règle adaptée à la distance : 1 point au loin, 7 au voisinage. */
function pickQuad(x, elem) {
  const c = elem.centroid;
  const dx = x[0]-c[0], dy = x[1]-c[1], dz = x[2]-c[2];
  const R2 = dx*dx + dy*dy + dz*dz;
  const h2 = elem.area;
  if (R2 > 36 * h2) return GAUSS1;
  if (R2 > 6.25 * h2) return GAUSS3;
  return GAUSS7;
}

// ============================================================
// ── SYMÉTRIE PAR IMAGES MIROIR
// ============================================================
/**
 * Plans de symétrie du maillage. 'H' = plan y=0 (Split Horizontal),
 * 'V' = plan x=0 (Split Vertical). Retourne les triplets de signes à
 * appliquer, image identité incluse.
 *
 * Aucun miroir en z : le baffle infini n'est PAS traité par une image de
 * maillage mais par le doublement du noyau de Green (les éléments
 * d'interface sont dans le plan du baffle, leur image est confondue).
 */
function getMirrorTransforms(symmetry) {
  const mirrors = [[1, 1, 1]];
  if (symmetry === 'H' || symmetry === 'HV') mirrors.push([1, -1, 1]);
  if (symmetry === 'V' || symmetry === 'HV') mirrors.push([-1, 1, 1]);
  if (symmetry === 'HV')                     mirrors.push([-1, -1, 1]);
  return mirrors;
}

/**
 * Image d'un élément. Les sommets sont réfléchis ; v1/v2 sont échangés quand
 * det<0 pour que la normale géométrique issue de l'ordre des sommets reste
 * égale à M·n (une réflexion simple inverserait sinon l'orientation).
 */
function mirrorElement(elem, m) {
  if (m[0] === 1 && m[1] === 1 && m[2] === 1) return elem;
  const det = m[0] * m[1] * m[2];
  const mv = v => [v[0]*m[0], v[1]*m[1], v[2]*m[2]];
  return {
    centroid: mv(elem.centroid),
    normal:   mv(elem.normal),
    area:     elem.area,
    v0: mv(elem.v0),
    v1: det < 0 ? mv(elem.v2) : mv(elem.v1),
    v2: det < 0 ? mv(elem.v1) : mv(elem.v2),
  };
}

// ============================================================
// ── NOYAUX DE GREEN  (convention e^{-i·omega·t}, G sortant)
// ============================================================
/** G(x,y) = e^{ikR} / (4·pi·R) */
function greenKernel(k, x, y) {
  const dx = x[0]-y[0], dy = x[1]-y[1], dz = x[2]-y[2];
  const R = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (R < 1e-15) return { gRe: 0, gIm: 0, R: 0 };
  const kR = k * R;
  const inv4piR = 1 / (4 * Math.PI * R);
  return { gRe: Math.cos(kR) * inv4piR, gIm: Math.sin(kR) * inv4piR, R };
}

/** dG/dn_y — noyau de la double couche. */
function greenDnKernel(k, x, y, ny) {
  const dx = x[0]-y[0], dy = x[1]-y[1], dz = x[2]-y[2];
  const R = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (R < 1e-15) return { re: 0, im: 0 };
  const kR = k * R;
  const cosKR = Math.cos(kR), sinKR = Math.sin(kR);
  const rdotn = dx*ny[0] + dy*ny[1] + dz*ny[2];
  const inv4piR3 = 1 / (4 * Math.PI * R * R * R);
  const factRe = cosKR + kR * sinKR;
  const factIm = sinKR - kR * cosKR;
  return { re: factRe * rdotn * inv4piR3, im: factIm * rdotn * inv4piR3 };
}

/**
 * Subdivise un triangle en 4 par les milieux d'arêtes (raffinement uniforme).
 */
function subdivideTri3(v0, v1, v2) {
  const mid = (a, b) => [(a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2];
  const m01 = mid(v0, v1), m12 = mid(v1, v2), m20 = mid(v2, v0);
  return [
    [v0, m01, m20],
    [m01, v1, m12],
    [m20, m12, v2],
    [m01, m12, m20],
  ];
}

// R² < NEAR_FIELD_RATIO2 · aire ⇒ le point de collocation est trop proche du
// panneau pour qu'une règle de Gauss fixe à 7 points le résolve : le noyau
// varie comme 1/R (ou 1/R² pour dG/dn) sur l'étendue du triangle. C'est la
// principale source d'erreur sur un maillage grossier (panneaux de 30 mm),
// bien avant toute question de collocation P0 vs P1.
const NEAR_FIELD_RATIO2 = 4;
const NEAR_FIELD_SUBDIV_DEPTH = 2; // 4² = 16 sous-triangles, 112 évaluations

/**
 * Intègre un noyau ponctuel sur (v0,v1,v2) par subdivision uniforme fixe —
 * alternative simple à la transformation de Duffy, sans changement de base :
 * on raffine juste le maillage d'intégration au voisinage du point singulier.
 */
function integrateKernelRefined(kernelFn, v0, v1, v2, depth) {
  if (depth <= 0) {
    let re = 0, im = 0;
    const e1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
    const e2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
    const cx = e1[1]*e2[2]-e1[2]*e2[1], cy = e1[2]*e2[0]-e1[0]*e2[2], cz = e1[0]*e2[1]-e1[1]*e2[0];
    const area = 0.5 * Math.sqrt(cx*cx + cy*cy + cz*cz);
    for (const gp of GAUSS7) {
      const y = [
        gp.l1*v0[0] + gp.l2*v1[0] + gp.l3*v2[0],
        gp.l1*v0[1] + gp.l2*v1[1] + gp.l3*v2[1],
        gp.l1*v0[2] + gp.l2*v1[2] + gp.l3*v2[2],
      ];
      const g = kernelFn(y);
      re += gp.w * g.re; im += gp.w * g.im;
    }
    return { re: re * area, im: im * area };
  }
  let re = 0, im = 0;
  for (const [a, b, c] of subdivideTri3(v0, v1, v2)) {
    const r = integrateKernelRefined(kernelFn, a, b, c, depth - 1);
    re += r.re; im += r.im;
  }
  return { re, im };
}

function integrateG(k, x, elem) {
  const { v0, v1, v2, area, centroid } = elem;
  const dx = x[0]-centroid[0], dy = x[1]-centroid[1], dz = x[2]-centroid[2];
  if (dx*dx + dy*dy + dz*dz < NEAR_FIELD_RATIO2 * area) {
    return integrateKernelRefined(y => {
      const g = greenKernel(k, x, y);
      return { re: g.gRe, im: g.gIm };
    }, v0, v1, v2, NEAR_FIELD_SUBDIV_DEPTH);
  }
  let re = 0, im = 0;
  const rule = pickQuad(x, elem);
  for (const gp of rule) {
    const y = [
      gp.l1*v0[0] + gp.l2*v1[0] + gp.l3*v2[0],
      gp.l1*v0[1] + gp.l2*v1[1] + gp.l3*v2[1],
      gp.l1*v0[2] + gp.l2*v1[2] + gp.l3*v2[2],
    ];
    const g = greenKernel(k, x, y);
    re += gp.w * g.gRe; im += gp.w * g.gIm;
  }
  return { re: re * area, im: im * area };
}

function integrateDGdn(k, x, elem) {
  const { v0, v1, v2, area, normal, centroid } = elem;
  const dx = x[0]-centroid[0], dy = x[1]-centroid[1], dz = x[2]-centroid[2];
  if (dx*dx + dy*dy + dz*dz < NEAR_FIELD_RATIO2 * area) {
    return integrateKernelRefined(y => greenDnKernel(k, x, y, normal), v0, v1, v2, NEAR_FIELD_SUBDIV_DEPTH);
  }
  let re = 0, im = 0;
  const rule = pickQuad(x, elem);
  for (const gp of rule) {
    const y = [
      gp.l1*v0[0] + gp.l2*v1[0] + gp.l3*v2[0],
      gp.l1*v0[1] + gp.l2*v1[1] + gp.l3*v2[1],
      gp.l1*v0[2] + gp.l2*v1[2] + gp.l3*v2[2],
    ];
    const dg = greenDnKernel(k, x, y, normal);
    re += gp.w * dg.re; im += gp.w * dg.im;
  }
  return { re: re * area, im: im * area };
}

/** Terme propre de la simple couche, disque équivalent de même aire. */
function selfTermG(k, elem) {
  const rEq = Math.sqrt(elem.area / Math.PI);
  return { re: rEq / 2, im: k * elem.area / (4 * Math.PI) };
}

function integrateG_sym(k, xi, elem, mirrors) {
  let re = 0, im = 0;
  for (const m of mirrors) { const mE = mirrorElement(elem, m); const g = integrateG(k, xi, mE); re += g.re; im += g.im; }
  return { re, im };
}

function integrateDGdn_sym(k, xi, elem, mirrors) {
  let re = 0, im = 0;
  for (const m of mirrors) { const mE = mirrorElement(elem, m); const h = integrateDGdn(k, xi, mE); re += h.re; im += h.im; }
  return { re, im };
}

function selfTermG_sym(k, elem, mirrors) {
  const g0 = selfTermG(k, elem);
  let re = g0.re, im = g0.im;
  for (let mi = 1; mi < mirrors.length; mi++) {
    const mE = mirrorElement(elem, mirrors[mi]);
    const g = integrateG(k, elem.centroid, mE);
    re += g.re; im += g.im;
  }
  return { re, im };
}

function selfTermH_sym(k, elem, mirrors) {
  let re = 0, im = 0;
  for (let mi = 1; mi < mirrors.length; mi++) {
    const mE = mirrorElement(elem, mirrors[mi]);
    const h = integrateDGdn(k, elem.centroid, mE);
    re += h.re; im += h.im;
  }
  return { re, im };
}

// ============================================================
// ── SOLVEUR LU COMPLEXE DENSE
//    A est stocké entrelacé re/im dans un Float64Array de 2·N·N.
//    rhs est écrasé par la solution.
// ============================================================
/**
 * `throwOnSingular` : sans lui, une colonne singulière est silencieusement
 * sautée et la solution contient des valeurs arbitraires sans qu'aucune erreur
 * ne soit remontée. Le chemin mono-domaine historique conserve l'ancien
 * comportement permissif ; le solveur couplé exige la levée d'erreur.
 *
 * Renvoie un indicateur de conditionnement, min|U_ii| / max|U_ii|, gratuit.
 */
function complexLUSolve(A, rhs, N, options) {
  const throwOnSingular = !!(options && options.throwOnSingular);
  const label = (options && options.label) || 'linear system';
  for (let col = 0; col < N; col++) {
    let maxMag = 0, maxRow = col;
    for (let row = col; row < N; row++) {
      const re = A[2*(row*N+col)], im = A[2*(row*N+col)+1];
      const mag = re*re + im*im;
      if (mag > maxMag) { maxMag = mag; maxRow = row; }
    }
    if (maxMag < 1e-30) {
      if (throwOnSingular) {
        throw new Error(`${label}: column ${col} of ${N} is singular — the system is degenerate (check for a duplicated boundary condition on the aperture).`);
      }
      continue;
    }
    if (maxRow !== col) {
      for (let j = 0; j < N; j++) {
        const a = 2*(col*N+j), b = 2*(maxRow*N+j);
        let t = A[a]; A[a] = A[b]; A[b] = t;
        t = A[a+1]; A[a+1] = A[b+1]; A[b+1] = t;
      }
      let t = rhs[2*col]; rhs[2*col] = rhs[2*maxRow]; rhs[2*maxRow] = t;
      t = rhs[2*col+1]; rhs[2*col+1] = rhs[2*maxRow+1]; rhs[2*maxRow+1] = t;
    }
    const pRe = A[2*(col*N+col)], pIm = A[2*(col*N+col)+1];
    const pMag2 = pRe*pRe + pIm*pIm;
    for (let row = col+1; row < N; row++) {
      const aRe = A[2*(row*N+col)], aIm = A[2*(row*N+col)+1];
      const fRe = (aRe*pRe + aIm*pIm) / pMag2;
      const fIm = (aIm*pRe - aRe*pIm) / pMag2;
      for (let j = col+1; j < N; j++) {
        const hRe = A[2*(col*N+j)], hIm = A[2*(col*N+j)+1];
        A[2*(row*N+j)]   -= fRe*hRe - fIm*hIm;
        A[2*(row*N+j)+1] -= fRe*hIm + fIm*hRe;
      }
      rhs[2*row]   -= fRe*rhs[2*col] - fIm*rhs[2*col+1];
      rhs[2*row+1] -= fRe*rhs[2*col+1] + fIm*rhs[2*col];
    }
  }

  // Indicateur de conditionnement gratuit : rapport des modules extrêmes de la
  // diagonale de U. Sous ~1e-12 la solution ne vaut plus rien.
  let minU = Infinity, maxU = 0;
  for (let i = 0; i < N; i++) {
    const m = Math.hypot(A[2*(i*N+i)], A[2*(i*N+i)+1]);
    if (m < minU) minU = m;
    if (m > maxU) maxU = m;
  }
  const condIndicator = maxU > 0 ? minU / maxU : 0;

  for (let i = N-1; i >= 0; i--) {
    for (let j = i+1; j < N; j++) {
      const hRe = A[2*(i*N+j)], hIm = A[2*(i*N+j)+1];
      rhs[2*i]   -= hRe*rhs[2*j] - hIm*rhs[2*j+1];
      rhs[2*i+1] -= hRe*rhs[2*j+1] + hIm*rhs[2*j];
    }
    const dRe = A[2*(i*N+i)], dIm = A[2*(i*N+i)+1];
    const dMag2 = dRe*dRe + dIm*dIm;
    const sRe = (rhs[2*i]*dRe + rhs[2*i+1]*dIm) / dMag2;
    const sIm = (rhs[2*i+1]*dRe - rhs[2*i]*dIm) / dMag2;
    rhs[2*i]   = sRe;
    rhs[2*i+1] = sIm;
  }

  return { condIndicator, minU, maxU };
}

// ============================================================
// ── PARSER .msh  (Gmsh ASCII v2.2)
//    Repris de bemMultiDomainCore.js, seule implémentation déjà correcte.
// ============================================================
function parseMSH(mshContent) {
  const lines = mshContent.split('\n').map(l => l.trim()).filter(l => l);
  let idx = 0;

  while (idx < lines.length && !lines[idx].startsWith('$MeshFormat')) idx++;
  if (idx >= lines.length) throw new Error('Invalid MSH: $MeshFormat not found');
  idx++;
  const version = parseFloat(lines[idx].split(/\s+/)[0]);
  if (version < 2.0 || version >= 5.0) {
    throw new Error(`Unsupported MSH version: ${version}`);
  }

  // $PhysicalNames — on ne retient que la dimension 2 (surfaces).
  const physicalNames = new Map();
  while (idx < lines.length && !lines[idx].startsWith('$PhysicalNames')) idx++;
  if (idx < lines.length) {
    idx++;
    const numNames = parseInt(lines[idx++]);
    for (let i = 0; i < numNames; i++) {
      const parts = lines[idx++].match(/(\d+)\s+(\d+)\s+"([^"]+)"/);
      if (parts && parseInt(parts[1]) === 2) {
        physicalNames.set(parseInt(parts[2]), parts[3]);
      }
    }
  }

  while (idx < lines.length && !lines[idx].startsWith('$Nodes')) idx++;
  if (idx >= lines.length) throw new Error('Invalid MSH: $Nodes not found');
  idx++;
  const numNodes = parseInt(lines[idx++]);
  const nodes = new Map();
  for (let i = 0; i < numNodes; i++) {
    const parts = lines[idx++].split(/\s+/);
    nodes.set(parseInt(parts[0]), [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
  }

  while (idx < lines.length && !lines[idx].startsWith('$Elements')) idx++;
  if (idx >= lines.length) throw new Error('Invalid MSH: $Elements not found');
  idx++;
  const numElements = parseInt(lines[idx++]);
  const surfaces = new Map(); // physicalTag -> {name, tag, triangles}
  let skippedMissingNodes = 0;

  for (let i = 0; i < numElements; i++) {
    const parts = lines[idx++].split(/\s+/).map(p => parseInt(p));
    if (parts[1] !== 2) continue; // triangles seulement

    const numTags = parts[2];
    const physicalTag = parts[3];
    const nodeOffset = 3 + numTags;

    const v0 = nodes.get(parts[nodeOffset]);
    const v1 = nodes.get(parts[nodeOffset + 1]);
    const v2 = nodes.get(parts[nodeOffset + 2]);
    if (!v0 || !v1 || !v2) { skippedMissingNodes++; continue; }

    if (!surfaces.has(physicalTag)) {
      surfaces.set(physicalTag, {
        name: physicalNames.get(physicalTag) || `surface_${physicalTag}`,
        tag: physicalTag,
        triangles: [],
      });
    }
    surfaces.get(physicalTag).triangles.push({ v0, v1, v2 });
  }

  const surfaceList = Array.from(surfaces.values());
  return {
    surfaces: surfaceList,
    numNodes: nodes.size,
    numElements: surfaceList.reduce((sum, s) => sum + s.triangles.length, 0),
    skippedMissingNodes,
  };
}

// ============================================================
// ── CLASSIFICATION DES PHYSICAL SURFACES
// ============================================================
/**
 * Rôle BEM de chaque Physical Surface émise par
 * generateGeoForSTEPLoft() (waveguidestudio/exporters.js).
 *
 *   throat_cap      → 'source'     piston, v_n imposée
 *   horn_surface    → 'wall'       paroi rigide
 *   interface_wall  → 'wall'       collerette rigide bouche → plan d'interface
 *   interface_face  → 'interface'  surface rayonnante, dans le plan du baffle
 *   mouth_cap       → 'interface'  idem quand tipOffset == 0
 *
 * L'ordre compte : `interface_wall` contient la sous-chaîne « interface » mais
 * c'est une paroi rigide. Le classement se fait donc d'abord par nom exact,
 * et le repli par sous-chaîne teste `_wall` avant `interface`.
 */
const MSH_ROLE_BY_NAME = {
  throat_cap: 'source',
  horn_surface: 'wall',
  body_surface: 'wall',
  interface_wall: 'wall',
  interface_face: 'interface',
  mouth_cap: 'interface',
};

function roleForSurfaceName(rawName) {
  const name = String(rawName || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(MSH_ROLE_BY_NAME, name)) {
    return MSH_ROLE_BY_NAME[name];
  }
  // Repli tolérant pour des maillages produits ailleurs.
  if (name.includes('throat') || name.includes('source') || name.includes('piston')) return 'source';
  if (name.includes('wall') || name.includes('horn') || name.includes('rigid')) return 'wall';
  if (name.includes('interface') || name.includes('mouth') || name.includes('aperture')) return 'interface';
  return 'wall';
}

/**
 * Construit la table tag → rôle et un récapitulatif par groupe.
 * Lève une erreur explicite si le piston ou l'interface manquent : sans eux
 * le problème couplé n'a pas de sens (c'est le cas quand Show Interface est
 * décoché, l'export n'émettant alors que `horn_surface`).
 */
function classifyMshSurfaces(surfaces) {
  const roleMap = new Map();
  const groups = [];
  for (const surf of surfaces) {
    const role = roleForSurfaceName(surf.name);
    roleMap.set(surf.tag, role);
    groups.push({ tag: surf.tag, name: surf.name, role, triangleCount: surf.triangles.length });
  }

  const has = role => groups.some(g => g.role === role && g.triangleCount > 0);
  if (!has('source')) {
    throw new Error(
      'Mesh has no throat_cap surface — the BEM needs a driven piston. ' +
      `Groups found: ${groups.map(g => g.name).join(', ') || 'none'}.`
    );
  }
  if (!has('interface')) {
    throw new Error(
      'Mesh has no interface_face/mouth_cap surface — the BEM needs a radiating aperture. ' +
      `Groups found: ${groups.map(g => g.name).join(', ') || 'none'}.`
    );
  }

  return { roleMap, groups };
}

// ============================================================
// ── CONSTRUCTION DES ÉLÉMENTS DE COLLOCATION
// ============================================================
/**
 * Triangles → éléments constants P0 (collocation au centroïde).
 * `scale` convertit les unités du maillage en mètres (0.001 pour un .msh en mm).
 */
function buildElements(surfaces, scale, roleMap) {
  const elements = [];
  for (const surf of surfaces) {
    const role = roleMap ? (roleMap.get(surf.tag) || 'wall') : 'wall';
    for (const tri of surf.triangles) {
      const v0 = tri.v0.map(c => c * scale);
      const v1 = tri.v1.map(c => c * scale);
      const v2 = tri.v2.map(c => c * scale);
      const cx = (v0[0] + v1[0] + v2[0]) / 3;
      const cy = (v0[1] + v1[1] + v2[1]) / 3;
      const cz = (v0[2] + v1[2] + v2[2]) / 3;
      const e1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
      const e2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
      const nx = e1[1]*e2[2] - e1[2]*e2[1];
      const ny = e1[2]*e2[0] - e1[0]*e2[2];
      const nz = e1[0]*e2[1] - e1[1]*e2[0];
      const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
      const area = nLen / 2;
      if (area < 1e-15) continue;
      elements.push({
        centroid: [cx, cy, cz],
        normal: [nx/nLen, ny/nLen, nz/nLen],
        area, v0, v1, v2,
        surfaceTag: surf.tag,
        surfaceName: surf.name,
        role,
      });
    }
  }
  return elements;
}

/** Plus grande arête de tout le maillage — sert à la règle lambda/6. */
function maxEdgeLength(elements) {
  let maxE = 0;
  const d = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
  for (const el of elements) {
    const e = Math.max(d(el.v0, el.v1), d(el.v1, el.v2), d(el.v2, el.v0));
    if (e > maxE) maxE = e;
  }
  return maxE;
}

/**
 * Pipeline complet .msh → éléments prêts à assembler.
 * `symmetry` sert seulement à pondérer les aires rapportées (le maillage
 * n'est pas dupliqué : les images sont appliquées dans les noyaux).
 */
function buildBemModelFromMsh(mshContent, { scale = 0.001, symmetry = 'none' } = {}) {
  const parsed = parseMSH(mshContent);
  const { roleMap, groups } = classifyMshSurfaces(parsed.surfaces);
  const elements = buildElements(parsed.surfaces, scale, roleMap);
  if (!elements.length) throw new Error('Mesh contains no usable triangles.');

  const mirrorCount = getMirrorTransforms(symmetry).length;
  const areaByRole = { source: 0, wall: 0, interface: 0 };
  const indexByRole = { source: [], wall: [], interface: [] };
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    areaByRole[el.role] = (areaByRole[el.role] || 0) + el.area;
    (indexByRole[el.role] = indexByRole[el.role] || []).push(i);
  }

  const maxEdge = maxEdgeLength(elements);
  return {
    elements,
    groups,
    indexByRole,
    mirrorCount,
    // Aires du modèle physique complet, images comprises.
    sourceArea_m2: areaByRole.source * mirrorCount,
    apertureArea_m2: areaByRole.interface * mirrorCount,
    maxElementSize_m: maxEdge,
    maxElementSize_mm: maxEdge * 1000,
    numNodes: parsed.numNodes,
    elementCount: elements.length,
  };
}

// ============================================================
// ── VÉRIFICATIONS DE MAILLAGE
//    À lancer AVANT toute résolution. Une seule Physical Surface dont les
//    normales sont inversées suffit à rendre la formulation fausse, sans
//    qu'aucun calcul n'échoue : ces assertions sont la seule garde.
// ============================================================
function checkMeshSanity(model, symmetry) {
  const { elements } = model;
  const problems = [];
  const warnings = [];

  // (1) Volume signé. Les plans de coupe manquants (x=0, y=0) contribuent
  // exactement 0 à l'intégrale car c·n = 0 dessus — la formule est donc
  // valable telle quelle sur un maillage ouvert en quart ou en moitié.
  let vol = 0;
  let sumAnZ = 0;
  let sumAnX = 0;
  let sumAnY = 0;
  for (const el of elements) {
    const c = el.centroid, n = el.normal;
    vol += (c[0]*n[0] + c[1]*n[1] + c[2]*n[2]) * el.area;
    sumAnX += n[0] * el.area;
    sumAnY += n[1] * el.area;
    sumAnZ += n[2] * el.area;
  }
  vol /= 3;
  if (vol <= 0) {
    problems.push(`Enclosed volume is ${vol.toExponential(3)} m3 (must be > 0) — surface normals point inward.`);
  }

  // (2) Fermeture : sum(A·n) = 0 sur l'assemblage complet (images comprises).
  // Pour un quart, la somme des matrices miroir vaut diag(0,0,4) : seule la
  // composante z doit s'annuler, les composantes x/y le font par symétrie.
  const totalArea = elements.reduce((s, el) => s + el.area, 0);
  const closureTol = 0.02 * totalArea;
  const usesH = symmetry === 'H' || symmetry === 'HV';
  const usesV = symmetry === 'V' || symmetry === 'HV';
  if (Math.abs(sumAnZ) > closureTol) {
    problems.push(`Surface is not closed in z: sum(A·nz) = ${sumAnZ.toExponential(3)} vs tolerance ${closureTol.toExponential(3)} — a Physical Surface is missing or flipped.`);
  }
  if (!usesV && Math.abs(sumAnX) > closureTol) {
    problems.push(`Surface is not closed in x: sum(A·nx) = ${sumAnX.toExponential(3)}.`);
  }
  if (!usesH && Math.abs(sumAnY) > closureTol) {
    problems.push(`Surface is not closed in y: sum(A·ny) = ${sumAnY.toExponential(3)}.`);
  }

  // (3) Orientation des groupes clés. Le throat regarde -Z (il est en
  // z = -totalLength), l'interface regarde +Z.
  let worstIface = 1, worstThroat = 1;
  for (const el of elements) {
    if (el.role === 'interface') worstIface = Math.min(worstIface, el.normal[2]);
    if (el.role === 'source')  worstThroat = Math.min(worstThroat, -el.normal[2]);
  }
  if (worstIface < 0.99) {
    problems.push(`interface_face normals are not +Z (worst nz = ${worstIface.toFixed(4)}) — the infinite-baffle reduction requires a planar aperture facing +Z.`);
  }
  if (worstThroat < 0.99) {
    problems.push(`throat_cap normals are not -Z (worst -nz = ${worstThroat.toFixed(4)}).`);
  }

  // (4) Planéité de l'interface : c'est ce qui autorise à remplacer le BEM
  // extérieur par l'intégrale de Rayleigh. Si l'ouverture n'est pas plane,
  // dG_h/dn ne s'annule plus et la réduction est invalide.
  const ifz = elements.filter(el => el.role === 'interface').map(el => el.centroid[2]);
  const zBaffle = ifz.reduce((a, b) => a + b, 0) / ifz.length;
  const planarity = Math.max(...ifz.map(z => Math.abs(z - zBaffle)));
  if (planarity > 1e-4) {
    problems.push(`interface aperture is not planar (spread ${(planarity*1000).toFixed(2)} mm) — the infinite-baffle reduction is invalid. Use a non-zero interface Z Offset so the aperture is a flat plane.`);
  }

  // (5) Aucun élément posé sur un plan de symétrie : son image serait
  // confondue avec lui (distance nulle) et compterait double.
  let minAbsX = Infinity, minAbsY = Infinity;
  for (const el of elements) {
    minAbsX = Math.min(minAbsX, Math.abs(el.centroid[0]));
    minAbsY = Math.min(minAbsY, Math.abs(el.centroid[1]));
  }
  if (usesV && minAbsX < 1e-9) problems.push('An element centroid lies on the x=0 symmetry plane (degenerate triangle).');
  if (usesH && minAbsY < 1e-9) problems.push('An element centroid lies on the y=0 symmetry plane (degenerate triangle).');

  // Résolution utile : P0 est O(h), il faut 6 a 10 elements par longueur d'onde.
  const fMaxMarginal = C_AIR / (6 * model.maxElementSize_m);
  const fMaxSafe = C_AIR / (10 * model.maxElementSize_m);

  return { problems, warnings, vol, zBaffle, planarity, totalArea, fMaxMarginal, fMaxSafe };
}

// ============================================================
// ── PRÉPARATION INDÉPENDANTE DE LA FRÉQUENCE
// ============================================================
/**
 * Somme statique des lignes de la double couche.
 *
 * Pour toute surface fermée avec x_i dessus, l'identité exacte est
 *     1/2 + sum_j H_ij|_{k=0} = 0.
 * Toute la singularité de H vit dans le terme k=0 (le développement de
 * (1-ikR)e^{ikR} n'a que des termes réguliers au-delà). Utiliser
 * `freeTerm_i = -sum_j H_ij|_{k=0}` au lieu de la constante 1/2 absorbe donc
 * l'intégralité de l'erreur de quadrature quasi-singulière dans la diagonale.
 *
 * L'écart avant correction est aussi le meilleur diagnostic de maillage
 * disponible : il explose si des normales sont inversées ou si la surface
 * a un trou.
 */
function prepareCoupledModel(model, symmetry, onProgress) {
  const { elements } = model;
  const N = elements.length;
  const mirrors = getMirrorTransforms(symmetry);
  const freeTerms = new Float64Array(N);
  let worstRowSumError = 0;

  for (let i = 0; i < N; i++) {
    const xi = elements[i].centroid;
    let s = 0;
    for (let j = 0; j < N; j++) {
      // H_ii = 0 exactement pour une facette plane colloquée dans son propre
      // plan (angle solide sous-tendu nul) : seules les images contribuent.
      s += (i === j)
        ? selfTermH_sym(0, elements[j], mirrors).re
        : integrateDGdn_sym(0, xi, elements[j], mirrors).re;
    }
    freeTerms[i] = -s;
    worstRowSumError = Math.max(worstRowSumError, Math.abs(0.5 + s));
    if (onProgress && (i % 32 === 0)) onProgress((i + 1) / N);
  }

  return { freeTerms, worstRowSumError, mirrors, symmetry };
}

// ============================================================
// ── ÉQUILIBRAGE
//    Mise à l'échelle lignes/colonnes en puissances de 2 (donc sans erreur
//    d'arrondi). Le pivotage partiel de la LU ne corrige pas l'échelle des
//    colonnes, et les colonnes de vitesse sont O(k·h) plus faibles que les
//    colonnes de pression — soit ~2 chiffres perdus à 100 Hz.
// ============================================================
function pow2(x) { return Math.pow(2, Math.round(Math.log2(x))); }

function equilibrate(A, rhs, N) {
  const rowScale = new Float64Array(N);
  const colScale = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    let m = 0;
    for (let j = 0; j < N; j++) {
      const re = A[2*(i*N+j)], im = A[2*(i*N+j)+1];
      const mag = Math.hypot(re, im);
      if (mag > m) m = mag;
    }
    if (!(m > 0)) throw new Error(`Coupled system row ${i} is entirely zero — the assembly is inconsistent.`);
    const r = pow2(m);
    rowScale[i] = r;
    const inv = 1 / r;
    for (let j = 0; j < 2*N; j++) A[2*i*N + j] *= inv;
    rhs[2*i] *= inv; rhs[2*i+1] *= inv;
  }

  for (let j = 0; j < N; j++) {
    let m = 0;
    for (let i = 0; i < N; i++) {
      const re = A[2*(i*N+j)], im = A[2*(i*N+j)+1];
      const mag = Math.hypot(re, im);
      if (mag > m) m = mag;
    }
    if (!(m > 0)) throw new Error(`Coupled system column ${j} is entirely zero — an unknown is unconstrained.`);
    const c = pow2(m);
    colScale[j] = c;
    const inv = 1 / c;
    for (let i = 0; i < N; i++) { A[2*(i*N+j)] *= inv; A[2*(i*N+j)+1] *= inv; }
  }

  return { rowScale, colScale };
}

// ============================================================
// ── SOLVEUR COUPLÉ  intérieur BEM  ⟷  baffle infini
// ============================================================
/**
 * Convention : e^{-i·omega·t}. G = e^{ikR}/(4·pi·R) sortante.
 * Masse ⟹ -i ; compliance ⟹ +i. dp/dn = i·omega·rho·v_n, n sortante du
 * domaine acoustique.
 *
 * Inconnues, non-dimensionnalisées en u = rho·c·v_n (unités de pression) pour
 * que les deux blocs aient des ordres de grandeur comparables :
 *
 *   x = [ p_1..p_N            pression sur TOUS les éléments intérieurs
 *         u_1..u_Nif ]        rho·c·v_n sur les seuls éléments d'interface
 *
 * BLOC 1 — collocation de Kirchhoff-Helmholtz intérieure, lignes i = 1..N :
 *
 *   sum_j (freeTerm_i·delta_ij + H_ij) p_j  -  i·k·sum_{m in IF} G_im u_m
 *                                           =  sum_{s in THR} i·omega·rho·v_s·G_is
 *
 * BLOC 2 — continuité de pression à l'interface, lignes i in IF :
 *
 *   p_i  +  2·i·k·sum_{m in IF} G_im u_m  =  0
 *
 * Le bloc 2 vient de p_i = sum_j Z_ij v_j avec l'impédance de rayonnement de
 * demi-espace Z_ij = -2·i·omega·rho·∫G dS. Le signe négatif est structurel : la
 * normale sortante du domaine EXTÉRIEUR vaut -z à l'ouverture, alors que la
 * normale de interface_face vaut +z. Avec un +, la résistance de rayonnement
 * devient négative et l'ouverture injecte de l'énergie au lieu d'en dissiper.
 *
 * Conséquence pratique majeure : la matrice de Rayleigh doublée est
 * littéralement 2·G restreinte à IF×IF, y compris son terme propre. Aucun
 * second assemblage n'est nécessaire — on réutilise le bloc G intérieur, ce qui
 * rend les deux blocs automatiquement cohérents en signe.
 *
 * Invariant vérifiable en une ligne : le coefficient de colonne d'ouverture
 * vaut -i·k·G au bloc 1 et +2·i·k·G au bloc 2, soit un rapport exactement -2.
 *
 * Pas de Burton-Miller, pas de CHIEF : les fréquences irrégulières sont une
 * pathologie du problème EXTÉRIEUR, et il n'y a pas de BIE extérieure ici —
 * l'extérieur est une intégrale de Rayleigh en forme fermée. L'opérateur
 * intérieur (1/2·I + H) n'a pas de spectre parasite.
 */
function solveCoupledBEM(freq, model, prep, options) {
  const opts = options || {};
  const velocity = opts.velocity != null ? opts.velocity : 1;
  const onProgress = opts.onProgress;

  const elements = model.elements;
  const N = elements.length;
  const ifIdx = model.indexByRole.interface;
  const thrIdx = model.indexByRole.source;
  const Nif = ifIdx.length;
  const Nt = N + Nif;

  if (!Nif) throw new Error('No interface elements: the cavity is fully closed and singular at its resonances.');
  if (!thrIdx.length) throw new Error('No source elements: nothing drives the horn.');
  if (freq < 20) throw new Error(`Frequency ${freq} Hz is below the 20 Hz floor (the system degenerates as k -> 0).`);

  const k = 2 * Math.PI * freq / C_AIR;
  const omega = 2 * Math.PI * freq;
  const mirrors = prep.mirrors;
  const freeTerms = prep.freeTerms;

  // Position de chaque élément d'interface dans le bloc u, et dans les lignes
  // du bloc 2.
  const uCol = new Int32Array(N).fill(-1);
  for (let m = 0; m < Nif; m++) uCol[ifIdx[m]] = m;

  const A = new Float64Array(2 * Nt * Nt);
  const rhs = new Float64Array(2 * Nt);
  // G restreinte à IF×IF, mémorisée pendant l'assemblage du bloc 1 pour que le
  // bloc 2 n'ait rien à réassembler.
  const Gif = new Float64Array(2 * Nif * Nif);

  for (let i = 0; i < N; i++) {
    const xi = elements[i].centroid;
    const ifRowIdx = uCol[i];
    let rhsRe = 0, rhsIm = 0;

    for (let j = 0; j < N; j++) {
      const ej = elements[j];

      // --- double couche : nécessaire sur toutes les colonnes ---
      const h = (i === j) ? selfTermH_sym(k, ej, mirrors) : integrateDGdn_sym(k, xi, ej, mirrors);
      const base = 2 * (i * Nt + j);
      A[base]     = h.re + (i === j ? freeTerms[i] : 0);
      A[base + 1] = h.im;

      // --- simple couche : seulement là où q est connu (source) ou inconnu
      //     (interface). Les parois rigides ont q = 0, leur colonne G ne sert
      //     à rien — c'est la majorité des éléments, l'économie est réelle.
      const role = ej.role;
      if (role !== 'interface' && role !== 'source') continue;

      const g = (i === j) ? selfTermG_sym(k, ej, mirrors) : integrateG_sym(k, xi, ej, mirrors);

      if (role === 'source') {
        // Piston se translatant selon +Z à la vitesse `velocity`. La normale du
        // throat_cap sort du domaine acoustique vers -Z, donc
        // v_n = v·n = velocity · n_z (négatif pour un piston qui pousse l'air
        // DANS le pavillon). Passer par la normale rend le signe robuste à
        // l'orientation du maillage.
        const vn = velocity * ej.normal[2];
        const s = omega * RHO_AIR * vn;   // q = i·s
        rhsRe += -s * g.im;
        rhsIm +=  s * g.re;
      } else {
        // Colonne d'ouverture, bloc 1 : -i·k·G
        const m = uCol[j];
        const cb = 2 * (i * Nt + N + m);
        A[cb]     =  k * g.im;
        A[cb + 1] = -k * g.re;
        if (ifRowIdx >= 0) {
          const gb = 2 * (ifRowIdx * Nif + m);
          Gif[gb] = g.re; Gif[gb + 1] = g.im;
        }
      }
    }

    rhs[2*i]     = rhsRe;
    rhs[2*i + 1] = rhsIm;
    if (onProgress && (i % 16 === 0)) onProgress(0.55 * (i + 1) / N);
  }

  // --- BLOC 2 : p_i + 2·i·k·sum G_im u_m = 0 ---
  // 2·i·k·(g_re + i·g_im) = -2·k·g_im + i·2·k·g_re : la partie réelle du
  // coefficient vient de g_im, et l'imaginaire de g_re. Les intervertir
  // produit une impédance d'ouverture X1 - i·R1 au lieu de R1 - i·X1 : même
  // module, phase fausse — d'où l'invariant de rapport vérifié juste après.
  for (let m = 0; m < Nif; m++) {
    const row = N + m;
    A[2 * (row * Nt + ifIdx[m])] = 1;
    for (let m2 = 0; m2 < Nif; m2++) {
      const gb = 2 * (m * Nif + m2);
      const cb = 2 * (row * Nt + N + m2);
      A[cb]     = -2 * k * Gif[gb + 1];
      A[cb + 1] =  2 * k * Gif[gb];
    }
  }

  // Invariant de signe du couplage : la colonne d'ouverture vaut -i·k·G au
  // bloc 1 et +2·i·k·G au bloc 2, donc leur rapport doit être exactement -2.
  // Un seul test, qui attrape toute interversion re/im ou tout signe inversé
  // entre les deux blocs.
  if (Nif > 0) {
    const iProbe = ifIdx[0];
    const b1 = 2 * (iProbe * Nt + N + 0);
    const b2 = 2 * ((N + uCol[iProbe]) * Nt + N + 0);
    const n1 = Math.hypot(A[b1], A[b1 + 1]);
    if (n1 > 1e-300) {
      // rapport = bloc2 / bloc1, attendu -2 + 0i
      const den = A[b1]*A[b1] + A[b1+1]*A[b1+1];
      const rRe = (A[b2]*A[b1] + A[b2+1]*A[b1+1]) / den;
      const rIm = (A[b2+1]*A[b1] - A[b2]*A[b1+1]) / den;
      if (Math.abs(rRe + 2) > 1e-9 || Math.abs(rIm) > 1e-9) {
        throw new Error(`Coupled BEM sign invariant violated: block2/block1 = ${rRe.toFixed(9)} + ${rIm.toFixed(9)}i, expected exactly -2 + 0i.`);
      }
    }
  }
  if (onProgress) onProgress(0.6);

  const { colScale } = equilibrate(A, rhs, Nt);
  complexLUSolve(A, rhs, Nt, { throwOnSingular: true, label: `coupled BEM @ ${freq.toFixed(1)} Hz` });
  if (onProgress) onProgress(0.95);

  // Dé-mise à l'échelle des colonnes.
  for (let j = 0; j < Nt; j++) {
    const inv = 1 / colScale[j];
    rhs[2*j] *= inv; rhs[2*j + 1] *= inv;
  }

  // --- extraction ---
  const pressure = new Float64Array(2 * N);
  for (let j = 0; j < N; j++) { pressure[2*j] = rhs[2*j]; pressure[2*j+1] = rhs[2*j+1]; }

  const u = new Float64Array(2 * Nif);
  for (let m = 0; m < Nif; m++) { u[2*m] = rhs[2*(N+m)]; u[2*m+1] = rhs[2*(N+m)+1]; }

  // q = dp/dn sur tous les éléments, pour l'évaluation de champ et le bilan.
  const q = new Float64Array(2 * N);
  for (let j = 0; j < N; j++) {
    const ej = elements[j];
    if (ej.role === 'source') {
      const vn = velocity * ej.normal[2];
      q[2*j] = 0; q[2*j+1] = omega * RHO_AIR * vn;
    } else if (ej.role === 'interface') {
      // q = i·k·u
      const m = uCol[j];
      q[2*j]   = -k * u[2*m + 1];
      q[2*j+1] =  k * u[2*m];
    }
    // parois rigides : q = 0
  }

  if (onProgress) onProgress(1);
  return { pressure, normalDerivative: q, u, uCol, ifIdx, thrIdx, k, omega, Nif, N };
}

/**
 * Bilan d'énergie. Les parois sont rigides et sans perte, donc la puissance
 * injectée au throat doit ressortir intégralement par l'ouverture. C'est le
 * test qui détecte à lui seul toutes les erreurs de signe de la formulation :
 * une puissance négative signale immédiatement un signe inversé.
 */
function coupledPowerBalance(model, sol, velocity) {
  const { elements } = model;
  const mirrorCount = model.mirrorCount;
  const omega = sol.omega;

  // 1/2 · Re( p · conj(v_n) ) · A, sommé puis multiplié par le nombre d'images.
  const halfRePvA = (indices, vnOf) => {
    let w = 0;
    for (const j of indices) {
      const el = elements[j];
      const pRe = sol.pressure[2*j], pIm = sol.pressure[2*j+1];
      const v = vnOf(j, el);
      w += 0.5 * (pRe * v.re + pIm * v.im) * el.area;
    }
    return w * mirrorCount;
  };

  const rhoc = RHO_AIR * C_AIR;
  // Les deux intégrales utilisent la normale SORTANTE du domaine acoustique.
  // Dans cette convention la puissance quittant le domaine est positive : le
  // throat, qui injecte, compte donc négatif. On le renvoie négé pour que
  // `wIn` soit la puissance injectée, directement comparable à `wAp`.
  const wOutThroat = halfRePvA(sol.thrIdx, (j, el) => ({ re: velocity * el.normal[2], im: 0 }));
  const wIn = -wOutThroat;
  const wAp = halfRePvA(sol.ifIdx, (j) => {
    const m = sol.uCol[j];
    return { re: sol.u[2*m] / rhoc, im: sol.u[2*m+1] / rhoc };
  });

  const denom = Math.max(Math.abs(wIn), Math.abs(wAp), 1e-300);
  return { wIn, wAp, mismatch: Math.abs(wIn - wAp) / denom, omega };
}

/**
 * Pression rayonnée en un point d'observation, par l'intégrale de Rayleigh de
 * demi-espace sur la seule ouverture :
 *
 *   p(x) = -2·i·k · sum_{images} sum_{j in IF} u_j · ∫_{Sj} G(x,y) dS
 *
 * Le facteur 2 est le doublement analytique du noyau (baffle infini). Il ne
 * faut SURTOUT pas le remplacer par une image géométrique en z : les éléments
 * d'interface sont dans le plan du baffle, leur image est confondue avec eux,
 * R vaut 0, `greenKernel` renvoie {0,0} par sa garde — et on perd
 * silencieusement le doublement, soit exactement -6,02 dB.
 *
 * Avec un baffle infini rigide il n'y a aucun rayonnement arrière : la
 * pression est nulle sous le plan du baffle.
 */
function coupledFieldPressure(fieldPoint, model, sol, mirrors, zBaffle, opts) {
  // Strictement sous le plan du baffle : aucun rayonnement. Les points DANS le
  // plan (incidence rasante, theta = 90 deg) sont eux parfaitement définis et
  // généralement non nuls — il ne faut donc pas les écarter.
  if (fieldPoint[2] < zBaffle) return { re: 0, im: 0 };
  const farField = !!(opts && opts.farField);
  const elements = model.elements;
  const k = sol.k;

  let wRe = 0, wIm = 0;   // sum u_j · ∫G dS
  for (let m = 0; m < sol.ifIdx.length; m++) {
    const j = sol.ifIdx[m];
    const uRe = sol.u[2*m], uIm = sol.u[2*m+1];
    if (uRe === 0 && uIm === 0) continue;
    const el = elements[j];
    for (const mir of mirrors) {
      const mE = mirrorElement(el, mir);
      let gRe, gIm;
      if (farField) {
        const g = greenKernel(k, fieldPoint, mE.centroid);
        gRe = g.gRe * mE.area; gIm = g.gIm * mE.area;
      } else {
        const g = integrateG(k, fieldPoint, mE);
        gRe = g.re; gIm = g.im;
      }
      wRe += uRe * gRe - uIm * gIm;
      wIm += uRe * gIm + uIm * gRe;
    }
  }

  // -2·i·k·w
  return { re: 2 * k * wIm, im: -2 * k * wRe };
}

// ============================================================
// ── EXPORT NODE (ignoré dans le worker : `module` y est undefined)
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    C_AIR, RHO_AIR,
    GAUSS7, GAUSS3, GAUSS1, pickQuad,
    getMirrorTransforms, mirrorElement,
    greenKernel, greenDnKernel,
    integrateG, integrateDGdn, selfTermG,
    integrateG_sym, integrateDGdn_sym, selfTermG_sym, selfTermH_sym,
    complexLUSolve, equilibrate,
    parseMSH, classifyMshSurfaces, roleForSurfaceName, MSH_ROLE_BY_NAME,
    buildElements, maxEdgeLength, buildBemModelFromMsh,
    checkMeshSanity, prepareCoupledModel, solveCoupledBEM,
    coupledPowerBalance, coupledFieldPressure,
  };
}
