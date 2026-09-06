// =======================================================
// FICHIER :  src/js/bem/bemWorker.js
// RÔLE    :  Worker autonome (aucun import) qui exécute tout le
//            pipeline BEM (mesh auto + solve + polaires) dans un
//            thread dédié, pour ne pas geler l'UI.
//
//  Chargé comme worker classique via Blob URL (voir bemHornBackend.js).
//  Tous les symboles nécessaires sont inlinés depuis :
//    - src/js/bem/bemCore.js
//    - src/js/bem/bemHornBackend.js (parties mesh + freqs)
//
//  Protocole :
//    {type:'compute', id, segs, opts}
//      → plusieurs {type:'progress', id, ev}
//      → un {type:'done', id, result}  ou  {type:'error', id, message}
//    {type:'abort', id}   → marque l'abandon au prochain freq.
// =======================================================

'use strict';

// Les primitives partagees (constantes, quadrature, noyaux de Green, images
// miroir, termes propres, solveur LU complexe, parser .msh, classification
// des Physical Surfaces) vivent desormais dans src/js/bem/bemShared.js, que
// getWorkerBlobUrl() concatene AVANT ce fichier. Ne pas les redefinir ici.

function solveBEM(freq, elements, velocity, symmetry, onProgress) {
  const N = elements.length;
  const k = 2 * Math.PI * freq / C_AIR;
  const omega = 2 * Math.PI * freq;
  const mirrors = getMirrorTransforms(symmetry);
  const H = new Float64Array(2 * N * N);
  const G = new Float64Array(2 * N * N);

  for (let i = 0; i < N; i++) {
    const xi = elements[i].centroid;
    for (let j = 0; j < N; j++) {
      const idx = 2 * (i * N + j);
      if (i === j) {
        const gSelf = selfTermG_sym(k, elements[j], mirrors);
        G[idx] = gSelf.re; G[idx+1] = gSelf.im;
        const hSelf = selfTermH_sym(k, elements[j], mirrors);
        H[idx] = hSelf.re; H[idx+1] = hSelf.im;
      } else {
        const gVal = integrateG_sym(k, xi, elements[j], mirrors);
        G[idx] = gVal.re; G[idx+1] = gVal.im;
        const hVal = integrateDGdn_sym(k, xi, elements[j], mirrors);
        H[idx] = hVal.re; H[idx+1] = hVal.im;
      }
    }
    if (onProgress) onProgress((i + 1) / N * 0.5);
  }

  const A = new Float64Array(2 * N * N);
  const rhs = new Float64Array(2 * N);

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const idx = 2 * (i * N + j);
      let aRe = H[idx], aIm = H[idx+1];
      if (i === j) { aRe += 0.5; }
      const role = elements[j].role;
      if (role === 'aperture') {
        const GRe = G[idx], GIm = G[idx+1];
        aRe = H[idx] + (i === j ? 0.5 : 0) + k * GIm;
        aIm = H[idx+1] - k * GRe;
      }
      if (role === 'source') {
        const factor = omega * RHO_AIR * velocity;
        const GRe = G[idx], GIm = G[idx+1];
        rhs[2*i]   += -factor * GIm;
        rhs[2*i+1] += factor * GRe;
      }
      A[idx] = aRe; A[idx+1] = aIm;
    }
    if (onProgress) onProgress(0.5 + (i + 1) / N * 0.3);
  }

  complexLUSolve(A, rhs, N);

  const q = new Float64Array(2 * N);
  for (let j = 0; j < N; j++) {
    const role = elements[j].role;
    if (role === 'wall') { q[2*j] = 0; q[2*j+1] = 0; }
    else if (role === 'source') { q[2*j] = 0; q[2*j+1] = omega * RHO_AIR * velocity; }
    else if (role === 'aperture') {
      const pRe = rhs[2*j], pIm = rhs[2*j+1];
      q[2*j]   = -k * pIm;
      q[2*j+1] = k * pRe;
    }
  }
  if (onProgress) onProgress(1);
  return { pressure: rhs, normalDerivative: q, k };
}

function fieldPressure(fieldPoint, k, elements, pressure, normalDerivative, mirrors, elementFilter, monopoleOnly) {
  let pRe = 0, pIm = 0;
  for (const m of mirrors) {
    for (let j = 0; j < elements.length; j++) {
      if (elementFilter && !elementFilter(elements[j])) continue;
      const mE = mirrorElement(elements[j], m);
      const g = greenKernel(k, fieldPoint, mE.centroid);
      const gRe = g.gRe * mE.area, gIm = g.gIm * mE.area;
      const qjRe = normalDerivative[2*j], qjIm = normalDerivative[2*j+1];
      if (monopoleOnly) {
        // Rayleigh-I (monopole only) → omni at LF, Fraunhofer at HF.
        pRe += (gRe*qjRe - gIm*qjIm);
        pIm += (gRe*qjIm + gIm*qjRe);
      } else {
        const dg = greenDnKernel(k, fieldPoint, mE.centroid, mE.normal);
        const dgRe = dg.re * mE.area, dgIm = dg.im * mE.area;
        const pjRe = pressure[2*j], pjIm = pressure[2*j+1];
        pRe += (gRe*qjRe - gIm*qjIm) - (dgRe*pjRe - dgIm*pjIm);
        pIm += (gRe*qjIm + gIm*qjRe) - (dgRe*pjIm + dgIm*pjRe);
      }
    }
  }
  return { re: pRe, im: pIm };
}

function computePolar(freq, k, elements, pressure, normalDerivative, plane, distance, angleStep, symmetry, angleMinDeg, angleMaxDeg) {
  const mirrors = getMirrorTransforms(symmetry);
  // Default: restrict far field to APERTURE elements only when role info
  // is present. Walls carry interior standing-wave pressure that, if summed
  // through free-space Green's functions, produces unphysical off-axis lobes.
  let elementFilter = null;
  const hasRole = elements.length > 0 && 'role' in elements[0];
  const hasAperture = hasRole && elements.some(e => e.role === 'aperture');
  if (hasAperture) elementFilter = e => e.role === 'aperture';
  const angles = [];
  const pressureMags = [];
  for (let deg = angleMinDeg; deg <= angleMaxDeg; deg += angleStep) {
    const rad = deg * Math.PI / 180;
    let pt;
    if (plane === 'H') pt = [distance * Math.sin(rad), 0, distance * Math.cos(rad)];
    else               pt = [0, distance * Math.sin(rad), distance * Math.cos(rad)];
    const p = fieldPressure(pt, k, elements, pressure, normalDerivative, mirrors, elementFilter, /*monopoleOnly*/ true);
    const mag = Math.sqrt(p.re*p.re + p.im*p.im);
    angles.push(deg);
    pressureMags.push(mag);
  }
  // Always normalize by the maximum magnitude across the polar, NOT by the
  // on-axis value. Near-field / standing-wave modes can create an on-axis dip
  // at some frequencies, which — if used as the normalizer — produces fake
  // off-axis "hot lobes" and values > 1. Normalizing by max keeps the curve
  // bounded in [0,1] and physically meaningful.
  const maxMag = Math.max.apply(null, pressureMags);
  const normalized = pressureMags.map(m => maxMag > 0 ? m / maxMag : 0);
  return { angles, normalized, pressureMags };
}

// ============================================================
// ── MESH AUTO (copié de bemHornBackend.js)
// ============================================================
function buildHornQuarterMesh(segs, opts) {
  opts = opts || {};
  // Akabak-style two-tier mesh: fine mesh on piston (throat cap) 20 mm,
  // coarser mesh on walls + mouth 50 mm.
  const targetWallSize_mm   = opts.targetWallSize_mm   || opts.targetElementSize_mm || 50;
  const targetSourceSize_mm = opts.targetSourceSize_mm || 20;
  const targetApertureSize_mm = opts.targetApertureSize_mm || targetWallSize_mm;
  const transMin = opts.transMin || 3;
  const axialMin = opts.axialMin || 2;

  // --- Upsampling: if segments are few (<8) or some segment is long relative
  // to wall target size, subdivide linearly so walls get smooth tessellation.
  {
    const subd = [];
    for (let i = 0; i < segs.length - 1; i++) {
      const s0 = segs[i], s1 = segs[i + 1];
      const L = Math.max(0, Number(s0.l) || 0);
      // Number of sub-steps for this segment (axial), min 1
      const n = Math.max(1, Math.ceil(L / Math.max(20, targetWallSize_mm)));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const w = Number(s0.w) + t * (Number(s1.w) - Number(s0.w));
        const h = Number(s0.h) + t * (Number(s1.h) - Number(s0.h));
        subd.push({ w, h, l: L / n });
      }
    }
    // last segment = mouth (l=0 convention)
    const last = segs[segs.length - 1];
    subd.push({ w: Number(last.w), h: Number(last.h), l: 0 });
    segs = subd;
  }

  const zs = [0];
  for (let i = 0; i < segs.length - 1; i++) {
    zs.push(zs[zs.length - 1] + Math.max(0, Number(segs[i].l) || 0));
  }
  const totalZ = zs[zs.length - 1];
  if (!(totalZ > 0)) throw new Error('horn length is zero');

  const Ws = segs.map(s => Number(s.w) / 2);
  const Hs = segs.map(s => Number(s.h) / 2);
  const divForSize = (extent_mm, size_mm, minimum) => Math.max(minimum, Math.round(extent_mm / size_mm));
  const divFor = (extent_mm, minimum) => divForSize(extent_mm, targetWallSize_mm, minimum);

  const surfaces = [];

  // Throat cap (z=0), normal -Z — fine mesh for source (piston)
  {
    const triangles = [];
    const nX = divForSize(Ws[0], targetSourceSize_mm, transMin);
    const nY = divForSize(Hs[0], targetSourceSize_mm, transMin);
    for (let i = 0; i < nX; i++) {
      for (let j = 0; j < nY; j++) {
        const x0 = (i)     / nX * Ws[0];
        const x1 = (i + 1) / nX * Ws[0];
        const y0 = (j)     / nY * Hs[0];
        const y1 = (j + 1) / nY * Hs[0];
        triangles.push({ v0: [x0,y0,0], v1: [x0,y1,0], v2: [x1,y0,0] });
        triangles.push({ v0: [x1,y0,0], v1: [x0,y1,0], v2: [x1,y1,0] });
      }
    }
    surfaces.push({ tag: 1, triangles });
  }

  for (let seg = 0; seg < segs.length - 1; seg++) {
    const z0 = zs[seg], z1 = zs[seg + 1];
    const segLen = z1 - z0;
    if (segLen <= 1e-6) continue;
    const w0 = Ws[seg], w1 = Ws[seg + 1];
    const h0 = Hs[seg], h1 = Hs[seg + 1];
    const Nz = divFor(segLen, axialMin);
    const NyWall = divFor(Math.max(h0, h1), transMin);
    const NxWall = divFor(Math.max(w0, w1), transMin);

    const xTris = [];
    for (let i = 0; i < Nz; i++) {
      for (let j = 0; j < NyWall; j++) {
        const t0 = i / Nz, t1 = (i + 1) / Nz;
        const s0 = j / NyWall, s1 = (j + 1) / NyWall;
        const za = z0 + t0 * segLen, zb = z0 + t1 * segLen;
        const wa = w0 + t0 * (w1 - w0), wb = w0 + t1 * (w1 - w0);
        const ha = h0 + t0 * (h1 - h0), hb = h0 + t1 * (h1 - h0);
        const pAA = [wa, s0 * ha, za];
        const pAB = [wa, s1 * ha, za];
        const pBA = [wb, s0 * hb, zb];
        const pBB = [wb, s1 * hb, zb];
        xTris.push({ v0: pAA, v1: pAB, v2: pBA });
        xTris.push({ v0: pBA, v1: pAB, v2: pBB });
      }
    }
    surfaces.push({ tag: 100 + seg, triangles: xTris });

    const yTris = [];
    for (let i = 0; i < Nz; i++) {
      for (let j = 0; j < NxWall; j++) {
        const t0 = i / Nz, t1 = (i + 1) / Nz;
        const s0 = j / NxWall, s1 = (j + 1) / NxWall;
        const za = z0 + t0 * segLen, zb = z0 + t1 * segLen;
        const wa = w0 + t0 * (w1 - w0), wb = w0 + t1 * (w1 - w0);
        const ha = h0 + t0 * (h1 - h0), hb = h0 + t1 * (h1 - h0);
        const pAA = [s0 * wa, ha, za];
        const pAB = [s1 * wa, ha, za];
        const pBA = [s0 * wb, hb, zb];
        const pBB = [s1 * wb, hb, zb];
        yTris.push({ v0: pAA, v1: pBA, v2: pAB });
        yTris.push({ v0: pAB, v1: pBA, v2: pBB });
      }
    }
    surfaces.push({ tag: 200 + seg, triangles: yTris });
  }

  // Mouth cap (z=totalZ), normal +Z
  {
    const nLast = segs.length - 1;
    const Wm = Ws[nLast], Hm = Hs[nLast];
    const triangles = [];
    const nX = divForSize(Wm, targetApertureSize_mm, transMin);
    const nY = divForSize(Hm, targetApertureSize_mm, transMin);
    for (let i = 0; i < nX; i++) {
      for (let j = 0; j < nY; j++) {
        const x0 = (i)     / nX * Wm;
        const x1 = (i + 1) / nX * Wm;
        const y0 = (j)     / nY * Hm;
        const y1 = (j + 1) / nY * Hm;
        triangles.push({ v0: [x0,y0,totalZ], v1: [x1,y0,totalZ], v2: [x0,y1,totalZ] });
        triangles.push({ v0: [x1,y0,totalZ], v1: [x1,y1,totalZ], v2: [x0,y1,totalZ] });
      }
    }
    surfaces.push({ tag: 999, triangles });
  }

  const roleMap = new Map();
  roleMap.set(1, 'source');
  roleMap.set(999, 'aperture');
  for (let seg = 0; seg < segs.length - 1; seg++) {
    roleMap.set(100 + seg, 'wall');
    roleMap.set(200 + seg, 'wall');
  }

  const elementCount = surfaces.reduce((s, sf) => s + sf.triangles.length, 0);
  const nLast = segs.length - 1;
  const maxEdge = Math.max(
    Ws[nLast] / divFor(Ws[nLast], transMin),
    Hs[nLast] / divFor(Hs[nLast], transMin),
  );

  return { surfaces, roleMap, totalLength_mm: totalZ, elementCount, maxElementSize_mm: maxEdge };
}

function maxValidFrequency(maxElementSize_mm) {
  const edge_m = maxElementSize_mm / 1000;
  if (edge_m <= 0) return 20000;
  return C_AIR / (3 * edge_m);
}

// ============================================================
// ── CHEMIN COUPLÉ  (maillage Gmsh réel + baffle infini)
// ============================================================
/**
 * Polaire du modèle couplé. La sphère d'observation est centrée sur le CENTRE
 * DE L'OUVERTURE (0, 0, zBaffle) et non sur l'origine : c'est la référence
 * acoustique du radiateur bafflé, et cela évite que les angles rasants
 * retombent sous le plan du baffle.
 *
 * Le champ est l'intégrale de Rayleigh sur la seule ouverture — les parois
 * portent la pression d'onde stationnaire intérieure, qui n'a aucune raison
 * d'être sommée avec des fonctions de Green de plein espace.
 *
 * Normalisation sur l'AXE (theta = 0) et non sur le maximum : normaliser par le
 * maximum faussait la largeur de faisceau -6 dB dès qu'un lobe hors axe
 * dépassait l'axe, puisque le seuil se déplaçait avec le lobe.
 */
function computeCoupledPolar(model, sol, mirrors, zBaffle, plane, distance, angleStep, angleMaxDeg) {
  const angles = [];
  const mags = [];
  const origin = [0, 0, zBaffle];
  for (let deg = -angleMaxDeg; deg <= angleMaxDeg + 1e-9; deg += angleStep) {
    const rad = deg * Math.PI / 180;
    const s = distance * Math.sin(rad);
    const c = distance * Math.cos(rad);
    const pt = (plane === 'H')
      ? [origin[0] + s, origin[1], origin[2] + c]
      : [origin[0], origin[1] + s, origin[2] + c];
    const p = coupledFieldPressure(pt, model, sol, mirrors, zBaffle, { farField: true });
    angles.push(deg);
    mags.push(Math.hypot(p.re, p.im));
  }
  // Valeur sur l'axe = angle le plus proche de 0.
  let axisIdx = 0, best = Infinity;
  for (let i = 0; i < angles.length; i++) {
    const d = Math.abs(angles[i]);
    if (d < best) { best = d; axisIdx = i; }
  }
  const ref = mags[axisIdx];
  const normalized = ref > 0 ? mags.map(m => m / ref) : mags.map(() => 0);
  return { angles, normalized, pressureMags: mags };
}

/** Somme p·A sur le throat, ramenée au pavillon complet par les images. */
function coupledSourceForce(model, sol) {
  let re = 0, im = 0;
  for (const j of sol.thrIdx) {
    re += sol.pressure[2*j]   * model.elements[j].area;
    im += sol.pressure[2*j+1] * model.elements[j].area;
  }
  return { re: re * model.mirrorCount, im: im * model.mirrorCount };
}

// ============================================================
// ── WORKER PROTOCOL
// ============================================================
const _aborted = Object.create(null); // id → true

self.onmessage = function (e) {
  const msg = e.data || {};
  if (msg.type === 'abort') {
    _aborted[msg.id] = true;
    return;
  }
  if (msg.type !== 'compute') return;

  const id = msg.id;
  try {
    runCompute(id, msg.segs, msg.opts || {});
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err && err.message ? err.message : String(err) });
  }
};

function runCompute(id, segs, opts) {
  const {
    freqs,
    mouthVelocity = 1,
    distance_m = 10,
    angleStep = 2,
    angleMax = 90,
    targetElementSize_mm,
    targetWallSize_mm,
    targetSourceSize_mm,
    targetApertureSize_mm,
    // 'directivity' (default) → per-freq { f, polarH, polarV }
    // 'spl' → per-freq { f, F_re, F_im, p1m_re, p1m_im, throatArea_m2 }
    computeType = 'directivity',
    // For SPL mode: point on axis at which to evaluate p.
    // Defaults to 1 m beyond the mouth (z = L + 1 m).
    axialDistance_m = 1,
  } = opts;

  const fHi = freqs && freqs.length ? Math.max.apply(null, freqs) : 4000;
  const lambdaMin_mm = (C_AIR / fHi) * 1000;
  // Akabak-like defaults: walls 50 mm, piston 20 mm, mouth 50 mm.
  // Auto-clamp walls to lambda/4 so we stay valid at the highest freq.
  const autoWall   = targetWallSize_mm   || Math.min(50, Math.max(10, lambdaMin_mm / 4));
  const autoSource = targetSourceSize_mm || 20;
  const autoAper   = targetApertureSize_mm || autoWall;

  const meshData = buildHornQuarterMesh(segs, {
    targetElementSize_mm,            // legacy compat
    targetWallSize_mm:   autoWall,
    targetSourceSize_mm: autoSource,
    targetApertureSize_mm: autoAper,
    transMin: 3,
    axialMin: 2,
  });
  const elements = buildElements(meshData.surfaces, 0.001, meshData.roleMap);
  const fMaxValid = maxValidFrequency(meshData.maxElementSize_mm);

  const meshInfo = {
    elementCount: meshData.elementCount,
    totalLength_mm: meshData.totalLength_mm,
    maxElementSize_mm: meshData.maxElementSize_mm,
    fMaxValid_Hz: fMaxValid,
  };
  self.postMessage({ type: 'progress', id, ev: { phase: 'meshReady', meshInfo } });

  const list = freqs && freqs.length ? freqs : [250, 500, 1000, 2000, 4000];
  const polarH = [], polarV = [];
  const splCurve = [];  // for computeType='spl'

  // Precompute per-mode constants
  const mirrorCount = getMirrorTransforms('HV').length;   // = 4 for quarter mesh
  let sourceArea_m2 = 0, apertureArea_m2 = 0;
  for (const e of elements) {
    if (e.role === 'source')   sourceArea_m2   += e.area;
    if (e.role === 'aperture') apertureArea_m2 += e.area;
  }
  sourceArea_m2   *= mirrorCount;
  apertureArea_m2 *= mirrorCount;
  const hornLength_m = meshData.totalLength_mm * 1e-3;
  const axialPoint = [0, 0, hornLength_m + axialDistance_m];

  for (let fi = 0; fi < list.length; fi++) {
    if (_aborted[id]) {
      self.postMessage({
        type: 'done', id,
        result: computeType === 'spl'
          ? { freqs: list.slice(0, fi), spl: splCurve, meshInfo, sourceArea_m2, apertureArea_m2, hornLength_m, aborted: true }
          : { freqs: list.slice(0, fi), polarH, polarV, splRaw: splCurve, meshInfo, sourceArea_m2, apertureArea_m2, hornLength_m, aborted: true }
      });
      delete _aborted[id];
      return;
    }
    const f = list[fi];
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    let lastReport = 0;
    const sol = solveBEM(f, elements, mouthVelocity, 'HV', (frac) => {
      // Throttle progress postMessages to ~50 ms
      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      if (now - lastReport > 50) {
        lastReport = now;
        self.postMessage({ type: 'progress', id, ev: {
          phase: 'solve', freqIndex: fi, freqCount: list.length, freq: f, subProgress: frac
        }});
      }
    });

    if (computeType === 'spl') {
      // Source force (Σ p·A over source, × mirror count) — full-horn value,
      // complex, per unit piston velocity.
      let Fre = 0, Fim = 0;
      for (let j = 0; j < elements.length; j++) {
        if (elements[j].role !== 'source') continue;
        Fre += sol.pressure[2*j]   * elements[j].area;
        Fim += sol.pressure[2*j+1] * elements[j].area;
      }
      Fre *= mirrorCount; Fim *= mirrorCount;

      // On-axis field point 1 m in front of the mouth, Rayleigh-I
      // monopole-only from aperture (piston-in-baffle far-field).
      const mirrorsArr = getMirrorTransforms('HV');
      const filter = (el) => el.role === 'aperture';
      const p1m = fieldPressure(axialPoint, sol.k, elements, sol.pressure, sol.normalDerivative,
                                mirrorsArr, filter, /*monopoleOnly*/ true);
      splCurve.push({
        f,
        F_re: Fre, F_im: Fim,
        p1m_re: p1m.re, p1m_im: p1m.im,
      });
    } else {
      // `symmetry` et non 'HV' en dur : computePolar re-dérive ses propres
      // images, un littéral y dupliquerait 4x un maillage déjà complet.
      const ph = computePolar(f, sol.k, elements, sol.pressure, sol.normalDerivative,
                              'H', distance_m, angleStep, symmetry, -angleMax, angleMax);
      const pv = computePolar(f, sol.k, elements, sol.pressure, sol.normalDerivative,
                              'V', distance_m, angleStep, symmetry, -angleMax, angleMax);
      polarH.push({ f, angles: ph.angles, normalized: ph.normalized });
      polarV.push({ f, angles: pv.angles, normalized: pv.normalized });

      // Also compute SPL raw data (F + p1m) — cheap given solve is done.
      // Allows the same run to drive both directivity and SPL visualisations.
      let Fre = 0, Fim = 0;
      for (let j = 0; j < elements.length; j++) {
        if (elements[j].role !== 'source') continue;
        Fre += sol.pressure[2*j]   * elements[j].area;
        Fim += sol.pressure[2*j+1] * elements[j].area;
      }
      Fre *= mirrorCount; Fim *= mirrorCount;
      const mirrorsArr = getMirrorTransforms('HV');
      const p1m = fieldPressure(axialPoint, sol.k, elements, sol.pressure, sol.normalDerivative,
                                mirrorsArr, (el) => el.role === 'aperture', /*monopoleOnly*/ true);
      splCurve.push({
        f,
        F_re: Fre, F_im: Fim,
        p1m_re: p1m.re, p1m_im: p1m.im,
      });
    }

    const elapsed_ms = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0;
    self.postMessage({ type: 'progress', id, ev: {
      phase: 'freqDone', freqIndex: fi, freqCount: list.length, freq: f, elapsed_ms
    }});
  }

  self.postMessage({
    type: 'done', id,
    result: computeType === 'spl'
      ? { freqs: list, spl: splCurve, meshInfo, sourceArea_m2, apertureArea_m2, hornLength_m, aborted: false }
      : { freqs: list, polarH, polarV, splRaw: splCurve, meshInfo, sourceArea_m2, apertureArea_m2, hornLength_m, aborted: false }
  });
  delete _aborted[id];
}
