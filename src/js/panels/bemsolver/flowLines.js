// =======================================================
// FICHIER :  src/js/panels/bemsolver/flowLines.js
// RÔLE    :  Lignes de courant et iso-vitesses sur une nappe d'observation
//            plane, à la manière d'un post-traitement COMSOL
//            (« Surface: velocity magnitude » + « Streamline: velocity field »).
//
//  Le champ acoustique est HARMONIQUE : à un instant donné de la période,
//  v(x,t) = Re(v̂)·cos(ωt) + Im(v̂)·sin(ωt) est un champ de vecteurs RÉEL, et
//  ses lignes de courant sont exactement ce que trace un logiciel de CFD. Tout
//  se calcule dans l'espace PARAMÉTRIQUE (u,v) de la grille : on ne quitte
//  jamais les points où le solveur a réellement évalué le champ.
// =======================================================

/** Champ instantané interpolé bilinéairement + position monde, au paramètre (gu, gv). */
function sampleField(f, gu, gv, cosW, sinW, out) {
  const { points, gridU, gridV, vRe, vIm, scale } = f;
  const i0 = Math.min(gridU - 2, Math.max(0, Math.floor(gu)));
  const j0 = Math.min(gridV - 2, Math.max(0, Math.floor(gv)));
  const fu = gu - i0, fv = gv - j0;
  const w = [(1 - fu) * (1 - fv), (1 - fu) * fv, fu * (1 - fv), fu * fv];
  const idx = [i0 * gridV + j0, i0 * gridV + j0 + 1, (i0 + 1) * gridV + j0, (i0 + 1) * gridV + j0 + 1];
  out.x = out.y = out.z = 0;
  out.vx = out.vy = out.vz = 0;
  for (let c = 0; c < 4; c++) {
    const p = points[idx[c]], k = 3 * idx[c], wc = w[c];
    out.x += p[0] * wc; out.y += p[1] * wc; out.z += p[2] * wc;
    out.vx += (vRe[k] * cosW + vIm[k] * sinW) * scale * wc;
    out.vy += (vRe[k + 1] * cosW + vIm[k + 1] * sinW) * scale * wc;
    out.vz += (vRe[k + 2] * cosW + vIm[k + 2] * sinW) * scale * wc;
  }
  // Un nœud masqué par le solveur (point collé à une paroi) rend NaN : la ligne
  // de courant doit s'y arrêter, ce qui la fait mourir contre la paroi — le
  // comportement voulu.
  out.ok = Number.isFinite(out.vx) && Number.isFinite(out.vy) && Number.isFinite(out.vz);
  return out;
}

/**
 * Phase de DÉBIT MAXIMAL sur la nappe : l'instant du cycle où l'air bouge le
 * plus. Σ|v(θ)|² est sinusoïdal en 2θ, son maximum est donc analytique — pas
 * besoin de balayer la période.
 * @returns {number} radians
 */
export function peakFlowPhase(vRe, vIm) {
  let aa = 0, bb = 0, ab = 0;
  for (let k = 0; k < vRe.length; k++) {
    const a = vRe[k], b = vIm[k];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    aa += a * a; bb += b * b; ab += a * b;
  }
  return 0.5 * Math.atan2(2 * ab, aa - bb);
}

/**
 * Lignes de courant à espacement contrôlé (principe de Jobard & Lefer) : on
 * n'ensemence une nouvelle ligne que là où aucune autre ne passe déjà, et on
 * arrête l'intégration dès qu'on s'approche trop d'une ligne existante. C'est
 * ce qui donne le rendu régulier d'un tracé COMSOL au lieu d'un plat de
 * spaghettis dans les zones rapides.
 *
 * @param {object} f {points (mm), gridU, gridV, vRe, vIm, scale}
 * @param {object} opts {phaseRad, separation (cellules), minSpeedFrac, maxSteps, arrowEvery}
 * @returns {{positions, speeds, arrows, arrowSpeeds}} segments (paires de sommets)
 */
export function buildStreamlines(f, opts = {}) {
  const { gridU, gridV, points } = f;
  const phase = opts.phaseRad || 0;
  const cosW = Math.cos(phase), sinW = -Math.sin(phase);   // Re(v̂·e^{-iθ})
  const sep = Math.max(1, opts.separation ?? 3);
  const dTest = sep * 0.5;
  const maxSteps = opts.maxSteps ?? 900;
  const step = 0.3;                                        // cellules par pas
  const arrowEvery = opts.arrowEvery ?? 28;

  // Pas de grille en monde : sert à convertir une direction monde en incrément
  // paramétrique, ce qui garde des pas d'égale LONGUEUR même si les mailles ne
  // sont pas carrées.
  const p00 = points[0], p10 = points[gridV], p01 = points[1];
  const du = [p10[0] - p00[0], p10[1] - p00[1], p10[2] - p00[2]];
  const dv = [p01[0] - p00[0], p01[1] - p00[1], p01[2] - p00[2]];
  const duLen2 = du[0] ** 2 + du[1] ** 2 + du[2] ** 2;
  const dvLen2 = dv[0] ** 2 + dv[1] ** 2 + dv[2] ** 2;
  if (!(duLen2 > 0) || !(dvLen2 > 0)) return emptyResult();

  // Vitesse de référence : seuil d'arrêt et filtre des zones mortes.
  let vMax = 0;
  const probe = {};
  for (let i = 0; i < gridU; i++) {
    for (let j = 0; j < gridV; j++) {
      sampleField(f, i, j, cosW, sinW, probe);
      if (!probe.ok) continue;
      const s = Math.hypot(probe.vx, probe.vy, probe.vz);
      if (s > vMax) vMax = s;
    }
  }
  if (!(vMax > 0)) return emptyResult();
  const minSpeed = vMax * (opts.minSpeedFrac ?? 0.02);

  // Grille d'occupation au pas `sep` : test de proximité en O(1).
  const ou = Math.max(1, Math.ceil((gridU - 1) / sep));
  const ov = Math.max(1, Math.ceil((gridV - 1) / sep));
  const occupancy = Array.from({ length: ou * ov }, () => []);
  const cellOf = (gu, gv) => Math.min(ou - 1, Math.floor(gu / sep)) * ov + Math.min(ov - 1, Math.floor(gv / sep));
  const tooClose = (gu, gv) => {
    const ci = Math.min(ou - 1, Math.floor(gu / sep)), cj = Math.min(ov - 1, Math.floor(gv / sep));
    for (let a = Math.max(0, ci - 1); a <= Math.min(ou - 1, ci + 1); a++) {
      for (let b = Math.max(0, cj - 1); b <= Math.min(ov - 1, cj + 1); b++) {
        for (const p of occupancy[a * ov + b]) {
          if (Math.hypot(p[0] - gu, p[1] - gv) < dTest) return true;
        }
      }
    }
    return false;
  };

  const positions = [];
  const speeds = [];
  const arrows = [];
  const arrowSpeeds = [];
  const pushSeg = (a, b, s) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    speeds.push(s, s);
  };

  const cur = {}, mid = {};
  /** Intégration RK2 à pas d'ARC constant, dans un sens (dir = ±1). */
  const trace = (gu0, gv0, dir, line) => {
    let gu = gu0, gv = gv0;
    let prev = null, prevSpeed = 0, sinceArrow = 0;
    for (let n = 0; n < maxSteps; n++) {
      sampleField(f, gu, gv, cosW, sinW, cur);
      if (!cur.ok) break;
      const speed = Math.hypot(cur.vx, cur.vy, cur.vz);
      if (speed < minSpeed) break;
      if (prev && tooClose(gu, gv)) break;

      if (prev) {
        pushSeg(prev, cur, prevSpeed);
        if (++sinceArrow >= arrowEvery) {
          sinceArrow = 0;
          // En intégration arrière le segment remonte le courant : il faut
          // inverser les extrémités, sinon la moitié des flèches pointe à
          // contresens de l'écoulement.
          if (dir > 0) emitArrow(prev, cur, prevSpeed);
          else emitArrow(cur, prev, prevSpeed);
        }
      }
      prev = { x: cur.x, y: cur.y, z: cur.z };
      prevSpeed = speed;
      line.push([gu, gv]);

      // Direction MONDE normalisée → incrément paramétrique : les pas gardent
      // la même longueur physique où que la maille soit.
      const inv = dir / speed;
      const sx = cur.vx * inv, sy = cur.vy * inv, sz = cur.vz * inv;
      const hu = (sx * du[0] + sy * du[1] + sz * du[2]) / duLen2;
      const hv = (sx * dv[0] + sy * dv[1] + sz * dv[2]) / dvLen2;
      const hLen = Math.hypot(hu, hv);
      if (!(hLen > 1e-9)) break;
      const gu1 = gu + (hu / hLen) * step * 0.5;
      const gv1 = gv + (hv / hLen) * step * 0.5;
      if (gu1 < 0 || gu1 > gridU - 1 || gv1 < 0 || gv1 > gridV - 1) break;

      sampleField(f, gu1, gv1, cosW, sinW, mid);
      if (!mid.ok) break;
      const ms = Math.hypot(mid.vx, mid.vy, mid.vz);
      if (!(ms > 0)) break;
      const minv = dir / ms;
      const mx = mid.vx * minv, my = mid.vy * minv, mz = mid.vz * minv;
      const mu = (mx * du[0] + my * du[1] + mz * du[2]) / duLen2;
      const mv = (mx * dv[0] + my * dv[1] + mz * dv[2]) / dvLen2;
      const mLen = Math.hypot(mu, mv);
      if (!(mLen > 1e-9)) break;
      gu += (mu / mLen) * step;
      gv += (mv / mLen) * step;
      if (gu < 0 || gu > gridU - 1 || gv < 0 || gv > gridV - 1) break;
    }
  };

  /** Pointe de flèche en V à l'extrémité `b`, dans le plan de la nappe. */
  function emitArrow(a, b, s) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-9)) return;
    // Normale de la nappe = du × dv ; la barbe est la direction tournée dans ce plan.
    const nx = du[1] * dv[2] - du[2] * dv[1];
    const ny = du[2] * dv[0] - du[0] * dv[2];
    const nz = du[0] * dv[1] - du[1] * dv[0];
    const nLen = Math.hypot(nx, ny, nz) || 1;
    const px = (ny * dz - nz * dy) / (nLen * len);
    const py = (nz * dx - nx * dz) / (nLen * len);
    const pz = (nx * dy - ny * dx) / (nLen * len);
    const back = Math.hypot(du[0], du[1], du[2]) * 0.9;     // ~1 maille
    const ux = dx / len, uy = dy / len, uz = dz / len;
    for (const side of [1, -1]) {
      arrows.push(
        b.x, b.y, b.z,
        b.x - ux * back + side * px * back * 0.5,
        b.y - uy * back + side * py * back * 0.5,
        b.z - uz * back + side * pz * back * 0.5,
      );
      arrowSpeeds.push(s, s);
    }
  }

  // Ensemencement : on balaie la grille du plus rapide au plus lent pour que
  // les zones intéressantes (le jet de l'event) soient tracées en premier.
  const seeds = [];
  const seedStep = Math.max(1, Math.round(sep * 0.5));
  for (let i = 1; i < gridU - 1; i += seedStep) {
    for (let j = 1; j < gridV - 1; j += seedStep) {
      sampleField(f, i, j, cosW, sinW, probe);
      if (!probe.ok) continue;
      const s = Math.hypot(probe.vx, probe.vy, probe.vz);
      if (s < minSpeed) continue;
      seeds.push([i, j, s]);
    }
  }
  seeds.sort((a, b) => b[2] - a[2]);

  for (const [si, sj] of seeds) {
    if (tooClose(si, sj)) continue;
    const line = [];
    trace(si, sj, 1, line);
    trace(si, sj, -1, line);
    for (const p of line) occupancy[cellOf(p[0], p[1])].push(p);
  }

  return {
    positions: new Float32Array(positions),
    speeds: new Float32Array(speeds),
    arrows: new Float32Array(arrows),
    arrowSpeeds: new Float32Array(arrowSpeeds),
  };
}

function emptyResult() {
  return {
    positions: new Float32Array(0), speeds: new Float32Array(0),
    arrows: new Float32Array(0), arrowSpeeds: new Float32Array(0),
  };
}

/**
 * Iso-lignes d'un champ scalaire sur la grille structurée (marching squares),
 * pour plusieurs niveaux d'un coup — les traits noirs de l'image COMSOL.
 * @returns {Float32Array} paires de sommets
 */
export function buildIsoLines(points, values, gridU, gridV, levels) {
  const out = [];
  const at = (i, j) => i * gridV + j;
  for (const level of levels) {
    for (let i = 0; i < gridU - 1; i++) {
      for (let j = 0; j < gridV - 1; j++) {
        const corners = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        let bad = false;
        for (const c of corners) if (!Number.isFinite(values[c])) { bad = true; break; }
        if (bad) continue;
        const crossings = [];
        for (let e = 0; e < 4; e++) {
          const a = corners[e], b = corners[(e + 1) % 4];
          const va = values[a], vb = values[b];
          if ((va > level) === (vb > level)) continue;
          const t = Math.abs(vb - va) < 1e-12 ? 0.5 : (level - va) / (vb - va);
          const pa = points[a], pb = points[b];
          crossings.push([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t]);
        }
        if (crossings.length >= 2) {
          out.push(...crossings[0], ...crossings[1]);
          if (crossings.length === 4) out.push(...crossings[2], ...crossings[3]);
        }
      }
    }
  }
  return new Float32Array(out);
}
