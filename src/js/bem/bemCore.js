// =======================================================
// FICHIER :  src/js/bem/bemCore.js
// RÔLE    :  Moteur BEM acoustique — éléments constants P0
//            Symétrie par fonctions de Green image (H / V / HV)
//            BC: Wall (vn=0), Source (piston), Aperture (Robin Z=ρc)
//            Assemblage + résolution LU complexe + champ lointain K-H
//
//  Copié depuis repository/bem/bemCore.js : même solveur, mais placé
//  dans src/ pour consommation directe par le backend Directivity Pro.
// =======================================================

export const C_AIR  = 344;       // m/s
export const RHO_AIR = 1.21;     // kg/m³
const P_REF  = 2e-5;             // Pa (ref SPL)

// ── Gauss quadrature 7-point on triangle (Dunavant) ──────────────
const GAUSS7 = [
  { l1: 1/3,      l2: 1/3,      l3: 1/3,      w: 0.225 },
  { l1: 0.059716, l2: 0.470142, l3: 0.470142, w: 0.132394 },
  { l1: 0.470142, l2: 0.059716, l3: 0.470142, w: 0.132394 },
  { l1: 0.470142, l2: 0.470142, l3: 0.059716, w: 0.132394 },
  { l1: 0.797427, l2: 0.101287, l3: 0.101287, w: 0.125939 },
  { l1: 0.101287, l2: 0.797427, l3: 0.101287, w: 0.125939 },
  { l1: 0.101287, l2: 0.101287, l3: 0.797427, w: 0.125939 },
];
// 3-point Gauss (degree 2) — champ moyen
const GAUSS3 = [
  { l1: 2/3, l2: 1/6, l3: 1/6, w: 1/3 },
  { l1: 1/6, l2: 2/3, l3: 1/6, w: 1/3 },
  { l1: 1/6, l2: 1/6, l3: 2/3, w: 1/3 },
];
// 1-point (centroïde) — champ lointain
const GAUSS1 = [
  { l1: 1/3, l2: 1/3, l3: 1/3, w: 1 },
];
/**
 * Règle de quadrature adaptative selon r/h (distance au centroïde / taille élément).
 * r/h > 6 : 1pt, r/h > 2.5 : 3pt, sinon 7pt.
 */
function pickQuad(x, elem) {
  const c = elem.centroid;
  const dx = x[0]-c[0], dy = x[1]-c[1], dz = x[2]-c[2];
  const R2 = dx*dx + dy*dy + dz*dz;
  const h2 = elem.area; // ≈ h²
  if (R2 > 36 * h2) return GAUSS1;
  if (R2 > 6.25 * h2) return GAUSS3;
  return GAUSS7;
}

export function getMirrorTransforms(symmetry) {
  const mirrors = [[1, 1, 1]];
  if (symmetry === 'H' || symmetry === 'HV') mirrors.push([1, -1, 1]);
  if (symmetry === 'V' || symmetry === 'HV') mirrors.push([-1, 1, 1]);
  if (symmetry === 'HV')                     mirrors.push([-1, -1, 1]);
  return mirrors;
}

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

export function buildElements(surfaces, scale = 0.001, roleMap = null) {
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
        role,
      });
    }
  }
  return elements;
}

function greenKernel(k, x, y) {
  const dx = x[0]-y[0], dy = x[1]-y[1], dz = x[2]-y[2];
  const R = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (R < 1e-15) return { gRe: 0, gIm: 0, R: 0 };
  const kR = k * R;
  const inv4piR = 1 / (4 * Math.PI * R);
  return { gRe: Math.cos(kR) * inv4piR, gIm: Math.sin(kR) * inv4piR, R };
}

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

function integrateG(k, x, elem) {
  let re = 0, im = 0;
  const { v0, v1, v2, area } = elem;
  const rule = pickQuad(x, elem);
  for (const gp of rule) {
    const y = [
      gp.l1*v0[0] + gp.l2*v1[0] + gp.l3*v2[0],
      gp.l1*v0[1] + gp.l2*v1[1] + gp.l3*v2[1],
      gp.l1*v0[2] + gp.l2*v1[2] + gp.l3*v2[2],
    ];
    const g = greenKernel(k, x, y);
    re += gp.w * g.gRe;
    im += gp.w * g.gIm;
  }
  return { re: re * area, im: im * area };
}

function integrateDGdn(k, x, elem) {
  let re = 0, im = 0;
  const { v0, v1, v2, area, normal } = elem;
  const rule = pickQuad(x, elem);
  for (const gp of rule) {
    const y = [
      gp.l1*v0[0] + gp.l2*v1[0] + gp.l3*v2[0],
      gp.l1*v0[1] + gp.l2*v1[1] + gp.l3*v2[1],
      gp.l1*v0[2] + gp.l2*v1[2] + gp.l3*v2[2],
    ];
    const dg = greenDnKernel(k, x, y, normal);
    re += gp.w * dg.re;
    im += gp.w * dg.im;
  }
  return { re: re * area, im: im * area };
}

function selfTermG(k, elem) {
  const rEq = Math.sqrt(elem.area / Math.PI);
  return { re: rEq / 2, im: k * elem.area / (4 * Math.PI) };
}

function integrateG_sym(k, xi, elem, mirrors) {
  let re = 0, im = 0;
  for (const m of mirrors) {
    const mE = mirrorElement(elem, m);
    const g = integrateG(k, xi, mE);
    re += g.re; im += g.im;
  }
  return { re, im };
}

function integrateDGdn_sym(k, xi, elem, mirrors) {
  let re = 0, im = 0;
  for (const m of mirrors) {
    const mE = mirrorElement(elem, m);
    const h = integrateDGdn(k, xi, mE);
    re += h.re; im += h.im;
  }
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

function complexLUSolve(A, rhs, N) {
  for (let col = 0; col < N; col++) {
    let maxMag = 0, maxRow = col;
    for (let row = col; row < N; row++) {
      const re = A[2*(row*N+col)], im = A[2*(row*N+col)+1];
      const mag = re*re + im*im;
      if (mag > maxMag) { maxMag = mag; maxRow = row; }
    }
    if (maxMag < 1e-30) continue;
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
}

export function solveBEM(freq, elements, velocity, symmetry = 'none', onProgress, opts = {}) {
  const N = elements.length;
  const k = 2 * Math.PI * freq / C_AIR;
  const omega = 2 * Math.PI * freq;
  const mirrors = getMirrorTransforms(symmetry);

  // Optional: use baffled-piston radiation impedance at aperture instead of
  // the simple locally-reacting Z=ρc (Sommerfeld) termination.  Needed at LF
  // where the mouth is compact (ka_mouth << 1) and the plane-wave absorber
  // over-damps the horn output, suppressing LF horn loading.
  //
  // Beranek (Acoustics, §4.5):
  //   R1(2ka) = 1 − 2·J1(2ka)/(2ka) = 1 − J1(2ka)/ka
  //   X1(2ka) = 2·H1(2ka)/(2ka)     = H1(2ka)/ka       (Struve H1)
  // Applied globally (same ratio on every aperture element, local-reaction
  // approximation — reasonable when mouth is roughly equiaxed).
  let apertureZratioRe = 1, apertureZratioIm = 0;   // default: Z=ρc
  if (opts.apertureBaffled) {
    let apArea = 0;
    for (const e of elements) if (e.role === 'aperture' || e.role === 'interface') apArea += e.area;
    apArea *= Math.max(1, mirrors ? mirrors.length : 1);
    const a_eff = Math.sqrt(apArea / Math.PI);
    const ka = k * a_eff;
    // Evaluate J1 and H1 at w = 2ka using full series + asymptotic tail.
    const w = 2 * ka;
    let R1, X1;
    if (w < 10) {
      // Series: J1(w) = Σ (-1)^k / (k!(k+1)!) · (w/2)^(2k+1)
      let J1 = 0, tJ = w/2;  // k=0 term = w/2
      const hw2 = -(w*w)/4;
      J1 = tJ;
      for (let n = 1; n < 40; n++) {
        tJ *= hw2 / (n * (n + 1));
        J1 += tJ;
        if (Math.abs(tJ) < 1e-15 * Math.abs(J1)) break;
      }
      // Struve H1(w) = (w/2)² · Σ (-1)^n · (w/2)^(2n) / [Γ(n+3/2)·Γ(n+5/2)]
      //   t0 = 8(w/2)² / (3π) = 2w²/(3π)
      //   t_{n+1}/t_n = -(w/2)² / ((n+3/2)(n+5/2))
      let H1 = (2*w*w)/(3*Math.PI);
      let tH = H1;
      for (let n = 1; n < 40; n++) {
        tH *= hw2 / ((n + 0.5) * (n + 1.5));
        H1 += tH;
        if (Math.abs(tH) < 1e-15 * Math.abs(H1)) break;
      }
      R1 = 1 - 2*J1/w;
      X1 = 2*H1/w;
    } else {
      // Asymptotic: R1 → 1, X1 → 4/(π·w) = 2/(π·ka)
      R1 = 1;
      X1 = 4 / (Math.PI * w);
    }
    apertureZratioRe = R1;
    apertureZratioIm = X1;
  }

  const H = new Float64Array(2 * N * N);
  const G = new Float64Array(2 * N * N);

  for (let i = 0; i < N; i++) {
    const xi = elements[i].centroid;
    for (let j = 0; j < N; j++) {
      const idx = 2 * (i * N + j);
      if (i === j) {
        const gSelf = selfTermG_sym(k, elements[j], mirrors);
        G[idx]   = gSelf.re;
        G[idx+1] = gSelf.im;

        const hSelf = selfTermH_sym(k, elements[j], mirrors);
        H[idx]   = hSelf.re;
        H[idx+1] = hSelf.im;
      } else {
        const gVal = integrateG_sym(k, xi, elements[j], mirrors);
        G[idx]   = gVal.re;
        G[idx+1] = gVal.im;

        const hVal = integrateDGdn_sym(k, xi, elements[j], mirrors);
        H[idx]   = hVal.re;
        H[idx+1] = hVal.im;
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

      if (role === 'aperture' || role === 'interface') {
        // ∂p/∂n = -ik · (Z/ρc) · p   where Z/ρc = apertureZratio (complex).
        // Original Sommerfeld (Z=ρc) is the special case ratio=1+0j.
        // Substitute q_j = -ik·(Zr+jZi)·p_j into (H + 0.5) p + G q = rhs,
        // giving modified diagonal  A = H + δij·0.5 + G · (-ik·Z̃).
        const GRe = G[idx], GIm = G[idx+1];
        // (-ik)·Z̃ = -ik·(Zr + jZi) = -i·k·Zr + k·Zi
        //         = k·Zi  +  j·(-k·Zr)
        const coefRe =  k * apertureZratioIm;
        const coefIm = -k * apertureZratioRe;
        // A[idx] += G · coef
        //   (Gre+jGim)·(coefRe+jcoefIm) = (Gre·coefRe − Gim·coefIm) + j(Gre·coefIm + Gim·coefRe)
        const addRe = GRe*coefRe - GIm*coefIm;
        const addIm = GRe*coefIm + GIm*coefRe;
        aRe = H[idx] + (i === j ? 0.5 : 0) + addRe;
        aIm = H[idx+1] + addIm;
      }

      if (role === 'source') {
        const factor = omega * RHO_AIR * velocity;
        const GRe = G[idx], GIm = G[idx+1];
        rhs[2*i]   += -factor * GIm;
        rhs[2*i+1] += factor * GRe;
      }

      A[idx]   = aRe;
      A[idx+1] = aIm;
    }
    if (onProgress) onProgress(0.5 + (i + 1) / N * 0.3);
  }

  complexLUSolve(A, rhs, N);

  const q = new Float64Array(2 * N);
  for (let j = 0; j < N; j++) {
    const role = elements[j].role;
    if (role === 'wall') {
      q[2*j] = 0; q[2*j+1] = 0;
    } else if (role === 'source') {
      q[2*j] = 0; q[2*j+1] = omega * RHO_AIR * velocity;
    } else if (role === 'aperture' || role === 'interface') {
      // q = -ik · Z̃ · p
      const pRe = rhs[2*j], pIm = rhs[2*j+1];
      const coefRe =  k * apertureZratioIm;
      const coefIm = -k * apertureZratioRe;
      q[2*j]   = coefRe*pRe - coefIm*pIm;
      q[2*j+1] = coefRe*pIm + coefIm*pRe;
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
      const qjRe = normalDerivative[2*j],  qjIm = normalDerivative[2*j+1];
      if (monopoleOnly) {
        // Rayleigh-I (monopole only): p(x) = ∫ G · q dS.
        // At LF where the aperture is compact (kL << 1) this sums to a
        // net volume-velocity monopole → omnidirectional into 4π, matching
        // free-standing horn behaviour. At HF the spatial phase across
        // q produces the correct Fraunhofer (sinc-like) pattern.
        pRe += (gRe*qjRe - gIm*qjIm);
        pIm += (gRe*qjIm + gIm*qjRe);
      } else {
        // Full Kirchhoff–Helmholtz (baffled-piston model)
        const dg = greenDnKernel(k, fieldPoint, mE.centroid, mE.normal);
        const dgRe = dg.re * mE.area, dgIm = dg.im * mE.area;
        const pjRe = pressure[2*j],          pjIm = pressure[2*j+1];
        pRe += (gRe*qjRe - gIm*qjIm) - (dgRe*pjRe - dgIm*pjIm);
        pIm += (gRe*qjIm + gIm*qjRe) - (dgRe*pjIm + dgIm*pjRe);
      }
    }
  }
  return { re: pRe, im: pIm };
}

export function computeFieldPressure(fieldPoint, k, elements, pressure, normalDerivative, symmetry = 'none', options = {}) {
  const mirrors = getMirrorTransforms(symmetry);
  const { monopoleOnly = false, elementFilter = null, apertureOnly = false } = options;
  let filter = elementFilter;
  if (apertureOnly && !filter) {
    const hasAperture = elements.length > 0 && 'role' in elements[0] && elements.some(e => e.role === 'aperture' || e.role === 'interface');
    if (hasAperture) filter = e => e.role === 'aperture' || e.role === 'interface';
  }
  return fieldPressure(fieldPoint, k, elements, pressure, normalDerivative, mirrors, filter, monopoleOnly);
}

/**
 * Complex force on the source surface = Σ p_j · A_j over elements whose role === 'source',
 * multiplied by the mirror count to recover the full-horn value from a quarter mesh.
 * Units: N per (unit piston velocity on the BEM source).
 *
 * For a driver coupled to the horn throat with its own diaphragm area Sd and
 * horn throat area St, the mechanical load on the driver is:
 *     Z_mec_load = F · (Sd/St)²
 */
export function computeSourceForce(elements, pressure, symmetry = 'none', roleName = 'source') {
  const mirrors = getMirrorTransforms(symmetry).length;
  let re = 0, im = 0, areaQuarter = 0;
  for (let j = 0; j < elements.length; j++) {
    if (elements[j].role !== roleName) continue;
    const pjRe = pressure[2*j], pjIm = pressure[2*j+1];
    const A = elements[j].area;
    re += pjRe * A;
    im += pjIm * A;
    areaQuarter += A;
  }
  return {
    re: re * mirrors,
    im: im * mirrors,
    area: areaQuarter * mirrors, // total source area (m²) in the full horn
  };
}

export function computePolar(freq, k, elements, pressure, normalDerivative, plane, distance, angleStep, symmetry = 'none', angleMinDeg = -180, angleMaxDeg = 180, elementFilter = null) {
  const mirrors = getMirrorTransforms(symmetry);
  // Default: if elements have role info, restrict far-field to APERTURE only.
  // Rationale: the interior walls carry standing-wave pressure that, when
  // summed via K-H with free-space Green's functions, produces spurious
  // off-axis "ghost" lobes (they radiate in all directions ignoring the
  // horn geometry). The physically correct far field of an open horn comes
  // from the mouth aperture only (equivalent to the baffled-piston Rayleigh
  // integral with the complex pressure distribution found by the BEM).
  if (!elementFilter) {
    const hasRole = elements.length > 0 && 'role' in elements[0];
    const hasAperture = hasRole && elements.some(e => e.role === 'aperture' || e.role === 'interface');
    if (hasAperture) elementFilter = e => e.role === 'aperture' || e.role === 'interface';
  }
  const angles = [];
  const pressureMags = [];

  for (let deg = angleMinDeg; deg <= angleMaxDeg; deg += angleStep) {
    const rad = deg * Math.PI / 180;
    let pt;
    if (plane === 'H') {
      pt = [distance * Math.sin(rad), 0, distance * Math.cos(rad)];
    } else {
      pt = [0, distance * Math.sin(rad), distance * Math.cos(rad)];
    }
    const p = fieldPressure(pt, k, elements, pressure, normalDerivative, mirrors, elementFilter, /*monopoleOnly*/ true);
    const mag = Math.sqrt(p.re*p.re + p.im*p.im);
    angles.push(deg);
    pressureMags.push(mag);
  }

  // Normalize by maximum magnitude, not on-axis (avoids fake hot lobes when
  // the axis hits a near-field / modal dip).
  const maxMag = Math.max(...pressureMags);
  const normalized = pressureMags.map(m => maxMag > 0 ? m / maxMag : 0);

  return { angles, normalized, pressureMags };
}
