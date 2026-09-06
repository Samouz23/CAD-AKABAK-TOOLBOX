// =======================================================
// FICHIER :  src/js/panels/bemsolver/fieldGeometry.js
// RÔLE    :  Génère la nappe d'observation d'un composant « Field » :
//            plan rectangulaire ou ballon sphérique, orientés sur un axe et
//            décalés par un offset. Les mêmes points servent au rendu 3D et
//            au solveur, pour que ce qui est affiché soit ce qui est calculé.
// =======================================================

/** '+z' | '-x' | 'z' … → base orthonormée directe { u, v, n } (n = axe choisi). */
function axisBasis(value) {
  const raw = String(value || '+z').trim().toLowerCase();
  const letter = ['x', 'y', 'z'].includes(raw.slice(-1)) ? raw.slice(-1) : 'z';
  const sign = raw.startsWith('-') ? -1 : 1;
  const table = {
    x: { u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] },
    y: { u: [0, 0, 1], v: [1, 0, 0], n: [0, 1, 0] },
    z: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  }[letter];
  return { u: table.u, v: table.v, n: table.n.map(c => c * sign) };
}

function gridTriangles(nu, nv, wrapU = false) {
  const tris = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const i1 = wrapU && i === nu - 1 ? 0 : i + 1;
      const a = i * (nv + 1) + j;
      const b = i1 * (nv + 1) + j;
      const c = i1 * (nv + 1) + j + 1;
      const d = i * (nv + 1) + j + 1;
      tris.push([a, b, c], [a, c, d]);
    }
  }
  return tris;
}

function buildPlaneField(field) {
  const { u, v } = axisBasis(field.axis);
  const width = Math.max(1, Number(field.width_mm) || 0);
  const height = Math.max(1, Number(field.height_mm) || 0);
  const delta = Math.max(1, Number(field.delta_mm) || 0);
  const nu = Math.max(1, Math.round(width / delta));
  const nv = Math.max(1, Math.round(height / delta));
  const cx = Number(field.offsetX_mm) || 0;
  const cy = Number(field.offsetY_mm) || 0;
  const cz = Number(field.offsetZ_mm) || 0;

  const points = [];
  for (let i = 0; i <= nu; i++) {
    const su = -width / 2 + (i / nu) * width;
    for (let j = 0; j <= nv; j++) {
      const sv = -height / 2 + (j / nv) * height;
      points.push([
        cx + u[0] * su + v[0] * sv,
        cy + u[1] * su + v[1] * sv,
        cz + u[2] * su + v[2] * sv,
      ]);
    }
  }
  return { points, tris: gridTriangles(nu, nv), stats: { gridU: nu + 1, gridV: nv + 1, wrapU: false } };
}

function buildBalloonField(field) {
  const { u, v, n } = axisBasis(field.axis);
  const radius = Math.max(1, Number(field.radius_mm) || 0);
  const dTheta = Math.min(90, Math.max(1, Number(field.deltaTheta_deg) || 0));
  const dPhi = Math.min(90, Math.max(1, Number(field.deltaPhi_deg) || 0));
  const nPhi = Math.max(3, Math.round(360 / dPhi));
  const nTheta = Math.max(2, Math.round(180 / dTheta));
  const cx = Number(field.offsetX_mm) || 0;
  const cy = Number(field.offsetY_mm) || 0;
  const cz = Number(field.offsetZ_mm) || 0;

  // Grille (phi, theta) : phi boucle sur la couture, theta va d'un pôle à l'autre.
  const points = [];
  for (let i = 0; i < nPhi; i++) {
    const phi = (i / nPhi) * 2 * Math.PI;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    for (let j = 0; j <= nTheta; j++) {
      const theta = (j / nTheta) * Math.PI;
      const st = Math.sin(theta), ct = Math.cos(theta);
      const a = radius * st * cp, b = radius * st * sp, c = radius * ct;
      points.push([
        cx + u[0] * a + v[0] * b + n[0] * c,
        cy + u[1] * a + v[1] * b + n[1] * c,
        cz + u[2] * a + v[2] * b + n[2] * c,
      ]);
    }
  }
  return {
    points,
    tris: gridTriangles(nPhi, nTheta, true),
    stats: { gridU: nPhi, gridV: nTheta + 1, wrapU: true, radius_mm: radius, center: [cx, cy, cz] },
  };
}

/**
 * @param {object} field  nœud d'arbre de type Field
 * @returns {{points: number[][], tris: number[][], stats: object}} en millimètres
 */
export function buildFieldGeometry(field) {
  const geom = field?.fieldType === 'balloon' ? buildBalloonField(field) : buildPlaneField(field);
  geom.stats.pointCount = geom.points.length;
  geom.stats.triangleCount = geom.tris.length;
  return geom;
}

/**
 * Ballon de directivité : chaque point de la sphère de mesure est ramené vers le
 * centre proportionnellement à son niveau, `dbRange` dB sous le maximum donnant
 * un rayon nul. La forme obtenue est la surface 3D de l'onde rayonnée.
 */
export function deformBalloon(geom, levelsDb, dbRange) {
  const [cx, cy, cz] = geom.stats.center || [0, 0, 0];
  const range = Math.max(1, dbRange);
  return geom.points.map((p, i) => {
    const t = Math.min(1, Math.max(0, 1 + (levelsDb[i] ?? -Infinity) / range));
    return [cx + (p[0] - cx) * t, cy + (p[1] - cy) * t, cz + (p[2] - cz) * t];
  });
}

/**
 * Iso-contour d'un champ scalaire sur la grille structurée de la nappe, par
 * marching squares. Renvoie des segments (paires de points 3D consécutives)
 * posés sur `points`, donc sur la forme déformée si on lui passe celle-ci.
 */
export function gridIsoContour(points, values, stats, level) {
  const { gridU, gridV, wrapU } = stats;
  const at = (i, j) => i * gridV + j;
  const lerp = (ia, ib) => {
    const va = values[ia], vb = values[ib];
    const t = Math.abs(vb - va) < 1e-12 ? 0.5 : (level - va) / (vb - va);
    const a = points[ia], b = points[ib];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };

  const segments = [];
  const lastU = wrapU ? gridU : gridU - 1;
  for (let i = 0; i < lastU; i++) {
    const i1 = wrapU && i === gridU - 1 ? 0 : i + 1;
    for (let j = 0; j < gridV - 1; j++) {
      const corners = [at(i, j), at(i1, j), at(i1, j + 1), at(i, j + 1)];
      const above = corners.map(c => values[c] > level);
      const crossings = [];
      for (let e = 0; e < 4; e++) {
        const a = corners[e], b = corners[(e + 1) % 4];
        if (above[e] !== above[(e + 1) % 4]) crossings.push(lerp(a, b));
      }
      if (crossings.length === 2) segments.push(crossings[0], crossings[1]);
      else if (crossings.length === 4) segments.push(crossings[0], crossings[1], crossings[2], crossings[3]);
    }
  }
  return segments;
}
