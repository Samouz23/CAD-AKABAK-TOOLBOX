// ====================================================================================================
// FICHIER :  src/js/panels/bemsolver/diaphragmMesh.js
// RÔLE :     Maillage triangulaire d'un diaphragme (calotte + cône) destiné à
//            servir de surface SOURCE au solveur BEM, et non de simple décor.
//            Le semis de points est radial à BIFURCATION (le nombre de secteurs
//            double dès que l'espacement angulaire dépasse la taille cible), ce
//            qui garde des triangles de taille homogène du centre au bord ;
//            la connectivité est ensuite obtenue par une triangulation de
//            DELAUNAY (Bowyer–Watson) dans le plan paramétrique, puis relevée
//            sur le profil. La couronne extérieure peut être accrochée aux
//            nœuds du maillage hôte pour rester conforme au baffle porteur.
// ====================================================================================================

const MIN_ANGULAR = 6;      // secteurs de la première couronne
const MAX_POINTS = 8000;    // garde-fou : Bowyer–Watson naïf est en O(n²)

/**
 * @param {object} component  composant diaphragme de l'arbre BEM (mm)
 *        component.side : 'front' (cône + calotte pilotée, par défaut) ou
 *        'back' — même cône (dD → dVC, profondeur hD2) mais SANS calotte : le
 *        disque central (Ø dVC) reste en place, rigide et non piloté (rôle
 *        boundary), pendant que le reste du cône rayonne vers l'arrière.
 * @param {{ hostVertices?: number[], hostEdge_mm?: number, symmetry?: string }} [options]
 *        hostVertices : triplets XYZ du maillage importé, pour l'accrochage
 *        hostEdge_mm  : arête médiane du maillage hôte, pour la taille auto
 *        symmetry     : 'none' | 'h' | 'v' | 'hv', pour découper comme l'hôte
 * @returns {{ nodes: number[][], tris: number[][], stats: object,
 *             coneTris?: number[][], capTris?: number[][] }}
 *        coneTris/capTris ne sont renseignés que côté 'back' : ce sont les
 *        deux sous-ensembles de `tris` à envoyer au solveur comme deux
 *        surfaces distinctes (cône piloté + capot fixe).
 */
export function buildDiaphragmMesh(component, options = {}) {
  const isBack = component.side === 'back';
  let dD, dD1, tD1, hD1;
  if (isBack) {
    dD = Math.max(0, Number(component.dD) || 0);
    dD1 = Math.max(0, Number(component.dVC) || 0);
    tD1 = Number(component.hD2) || 0;
    hD1 = 0; // pas de calotte : le centre reste un disque plat, figé
  } else {
    dD = Math.max(0, Number(component.dD) || 0);
    dD1 = Math.max(0, Number(component.dD1) || 0);
    tD1 = Number(component.tD1) || 0;
    hD1 = Number(component.hD1) || 0;
  }
  const rInner = dD1 / 2;
  const rOuter = Math.max(dD / 2, rInner);
  if (!(rOuter > 0)) return emptyMesh('Diameter must be greater than zero.');

  const basis = axisBasis(component.axis);
  const scale = [
    finiteOr(component.scaleX, 1) || 1,
    finiteOr(component.scaleY, 1) || 1,
    finiteOr(component.scaleZ, 1) || 1,
  ];
  const offset = [finiteOr(component.offsetX, 0), finiteOr(component.offsetY, 0), finiteOr(component.offsetZ, 0)];

  const target = resolveTargetSize(component, options, rOuter);
  const profile = sampleProfile(rInner, rOuter, tD1, hD1);

  // Sur un maillage hôte réduit par symétrie, le diaphragme doit l'être aussi :
  // laissé entier, il est démultiplié par les images miroir, son sous-domaine ne
  // se referme plus et la source rayonne en champ libre — d'où un ballon inversé.
  const sector = symmetrySector(options.symmetry, basis, scale, offset, options.hostVertices, component);
  const conform = component.meshConform !== false;
  const hostRim = conform
    ? hostRimPoints(options.hostVertices, basis, scale, offset, rOuter, target, sector, component)
    : null;

  const rings = buildRings(profile, target, component.meshBifurcation !== false, sector, hostRim);
  if (!rings.points.length) return emptyMesh('Element size is too coarse for this diaphragm.');
  if (rings.points.length > MAX_POINTS) {
    return emptyMesh(`Element size too fine: ${rings.points.length} nodes exceeds the ${MAX_POINTS} node limit.`);
  }

  const triangles = delaunay(rings.points);
  if (!triangles.length) return emptyMesh('Triangulation produced no element.');

  // Les nœuds repris du maillage hôte gardent leurs coordonnées exactes : c'est
  // ce qui permet au soudage du solveur de recoller la couronne sans jeu.
  const nodes = rings.points.map(p => {
    if (p.world) return p.world.slice();
    const world = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      world[k] = basis.e1[k] * p.x + basis.e2[k] * p.y + basis.e3[k] * p.u;
    }
    return worldFromLocal(world, scale, offset, component);
  });

  const snapped = (!conform || hostRim)
    ? (hostRim ? hostRim.length : 0)
    : snapRimToHost(nodes, rings.rimIndices, options.hostVertices, target);

  // Une mise à l'échelle négative retourne le sens de parcours : on le rétablit
  // pour que toutes les facettes restent cohérentes entre elles.
  const tris = scale[0] * scale[1] * scale[2] < 0
    ? triangles.map(t => [t[0], t[2], t[1]])
    : triangles;

  // Diaphragme désaxé ou décalé hors des plans de symétrie : le semis ne peut pas
  // être un secteur, on retombe sur une découpe des triangles après coup.
  const clip = sector
    ? { nodes, tris, clipped: true }
    : clipToSymmetry(nodes, tris, options.symmetry, options.hostVertices);

  // Côté 'back' : le disque central (Ø dD1 = dVC) doit devenir une surface
  // fixe séparée — on classe chaque triangle après toutes les transformations
  // (snap/clip) en réinversant le repère local à partir des coordonnées
  // monde, ce qui reste exact quel que soit l'historique du nœud.
  let coneTris, capTris;
  if (isBack && rInner > 0) {
    const split = classifyCapTriangles(clip.nodes, clip.tris, rInner, basis, scale, offset, component);
    coneTris = split.coneTris;
    capTris = split.capTris;
  }

  return {
    nodes: clip.nodes,
    tris: clip.tris,
    coneTris,
    capTris,
    stats: {
      nodeCount: clip.nodes.length,
      triangleCount: clip.tris.length,
      targetSize_mm: target,
      ringCount: rings.ringCount,
      snappedNodes: snapped,
      rimFromHost: !!hostRim,
      symmetryClipped: clip.clipped,
      capTriangleCount: capTris ? capTris.length : 0,
      ...edgeExtent(clip.nodes, clip.tris),
    },
  };
}

/**
 * Classe chaque triangle du maillage 'back' comme capot fixe (les 3 sommets
 * dans le disque central Ø 2·rInner) ou cône piloté (le reste), en revenant
 * aux coordonnées locales (avant offset/échelle/axe) pour retrouver le rayon
 * paramétrique — exact même pour les nœuds ajoutés par l'accrochage au
 * maillage hôte ou par la découpe de symétrie.
 */
function classifyCapTriangles(nodes, tris, rInner, basis, scale, offset, component) {
  const eps = Math.max(rInner * 1e-3, 1e-6);
  const nodeR = nodes.map(p => {
    const [lx, ly, lz] = localFromWorld(p, scale, offset, component);
    const x = lx * basis.e1[0] + ly * basis.e1[1] + lz * basis.e1[2];
    const y = lx * basis.e2[0] + ly * basis.e2[1] + lz * basis.e2[2];
    return Math.hypot(x, y);
  });
  const coneTris = [];
  const capTris = [];
  for (const t of tris) {
    const isCap = nodeR[t[0]] <= rInner + eps && nodeR[t[1]] <= rInner + eps && nodeR[t[2]] <= rInner + eps;
    (isCap ? capTris : coneTris).push(t);
  }
  return { coneTris, capTris };
}

/**
 * Secteur angulaire du plan paramétrique conservé par les plans de symétrie
 * ('v' → x = 0, 'h' → y = 0), du côté occupé par le maillage hôte. Renvoie null
 * quand il n'y a pas de symétrie, ou quand le diaphragme est placé de telle
 * sorte que la condition ne passe pas par l'origine (le semis n'est alors plus
 * un secteur et l'appelant découpe les triangles à la place).
 */
function symmetrySector(symmetry, basis, scale, offset, hostVertices, component) {
  const sym = String(symmetry || 'none').trim().toLowerCase();
  const axes = [];
  if (sym === 'v' || sym === 'hv') axes.push(0);
  if (sym === 'h' || sym === 'hv') axes.push(1);
  if (!axes.length) return null;
  if (rotationRadians(component).some(angle => Math.abs(angle) > 1e-12)) return null;

  let lo = -Infinity, hi = Infinity;
  for (const a of axes) {
    if (Math.abs(basis.e3[a]) > 1e-12 || Math.abs(offset[a]) > 1e-9) return null;
    const s = hostKeptSign(hostVertices, a) * (scale[a] < 0 ? -1 : 1);
    // On garde n·(x, y) ≥ 0, soit un demi-plan de ±90° autour de la direction n.
    const theta = Math.atan2(basis.e2[a] * s, basis.e1[a] * s);
    let l = theta - Math.PI / 2, h = theta + Math.PI / 2;
    if (Number.isFinite(lo)) {
      while (l < lo - Math.PI) { l += 2 * Math.PI; h += 2 * Math.PI; }
      while (l > lo + Math.PI) { l -= 2 * Math.PI; h -= 2 * Math.PI; }
    }
    lo = Math.max(lo, l);
    hi = Math.min(hi, h);
  }
  return (hi - lo) > 1e-6 ? { a0: lo, a1: hi } : null;
}

/**
 * Nœuds du maillage hôte posés sur la couronne extérieure du diaphragme,
 * ramenés dans le plan paramétrique et triés angulairement. Les reprendre tels
 * quels comme dernière couronne rend la surface CONFORME : sans cela le semis
 * régulier ne tombe pas sur les mêmes points que l'hôte, le soudage laisse des
 * nœuds en T et le sous-domaine du diaphragme reste ouvert.
 */
function hostRimPoints(hostVertices, basis, scale, offset, rOuter, target, sector, component) {
  if (!hostVertices || hostVertices.length < 9) return null;
  const tol = Math.max(target * 0.5, rOuter * 0.02);
  const found = [];
  for (let i = 0; i + 2 < hostVertices.length; i += 3) {
    const w = localFromWorld([hostVertices[i], hostVertices[i + 1], hostVertices[i + 2]], scale, offset, component);
    const x = w[0] * basis.e1[0] + w[1] * basis.e1[1] + w[2] * basis.e1[2];
    const y = w[0] * basis.e2[0] + w[1] * basis.e2[1] + w[2] * basis.e2[2];
    const u = w[0] * basis.e3[0] + w[1] * basis.e3[1] + w[2] * basis.e3[2];
    if (Math.abs(u) > tol) continue;
    if (Math.abs(Math.hypot(x, y) - rOuter) > tol) continue;
    const angle = Math.atan2(y, x);
    if (sector && !angleInSector(angle, sector)) continue;
    found.push({ x, y, u, angle, world: [hostVertices[i], hostVertices[i + 1], hostVertices[i + 2]] });
  }
  if (!found.length) return null;

  // Le common mesh contient souvent des sommets d'autres rangées à portée de
  // la tolérance. On garde d'abord la bande radiale la plus proche du rayon
  // demandé, puis seulement sa rangée plane : sinon Delaunay relie des points
  // intérieurs à la couronne et fabrique des facettes qui traversent la surface.
  const bestRadialError = Math.min(...found.map(p => Math.abs(Math.hypot(p.x, p.y) - rOuter)));
  const radialBand = Math.max(pointTolerance(target, rOuter), Math.min(tol * 0.25, target * 0.15, rOuter * 0.005));
  const radial = found.filter(p => Math.abs(Math.hypot(p.x, p.y) - rOuter) <= bestRadialError + radialBand);
  const uRim = radial.reduce((best, p) => (Math.abs(p.u) < Math.abs(best.u) ? p : best)).u;
  const planar = radial.filter(p => Math.abs(p.u - uRim) <= Math.max(1e-6, rOuter * 1e-6));

  // Doublons du .msh (une copie par surface élémentaire) : on ne garde qu'un
  // nœud par position, sinon la triangulation dégénère.
  planar.sort((a, b) => a.angle - b.angle);
  const pointTol = tol * 1e-3;
  const unique = planar.filter((p, i) => i === 0 || Math.hypot(p.x - planar[i - 1].x, p.y - planar[i - 1].y) > pointTol);
  // atan2 place la même jonction à -pi et +pi : elle n'est pas voisine dans
  // le tableau trié, alors que la couronne est une boucle fermée.
  if (unique.length > 3 && Math.hypot(unique[0].x - unique.at(-1).x, unique[0].y - unique.at(-1).y) <= pointTol) {
    unique.pop();
  }
  return unique.length >= (sector ? 2 : 3) ? unique.map(p => ({ x: p.x, y: p.y, u: p.u, world: p.world })) : null;
}

function pointTolerance(target, radius) {
  return Math.max(1e-6, Math.min(target * 0.1, radius * 0.002));
}

function angleInSector(angle, { a0, a1 }) {
  const eps = 1e-9;
  for (let k = -2; k <= 2; k++) {
    const a = angle + k * 2 * Math.PI;
    if (a >= a0 - eps && a <= a1 + eps) return true;
  }
  return false;
}

/**
 * Découpe la surface sur les plans de symétrie actifs ('v' → x = 0, 'h' → y = 0)
 * et ne garde que le côté occupé par le maillage hôte. Découpe de triangles à la
 * Sutherland–Hodgman : le bord obtenu tombe exactement sur le plan, donc les
 * images miroir du solveur reconstituent le diaphragme entier sans recouvrement.
 */
function clipToSymmetry(nodes, tris, symmetry, hostVertices) {
  const sym = String(symmetry || 'none').trim().toLowerCase();
  const planes = [];
  if (sym === 'v' || sym === 'hv') planes.push({ axis: 0, sign: hostKeptSign(hostVertices, 0) });
  if (sym === 'h' || sym === 'hv') planes.push({ axis: 1, sign: hostKeptSign(hostVertices, 1) });
  if (!planes.length) return { nodes, tris, clipped: false };

  const EPS = 1e-9;
  let outNodes = nodes;
  let outTris = tris;

  for (const { axis, sign } of planes) {
    const cache = new Map();
    const dist = (i) => sign * outNodes[i][axis];
    const cut = (a, b) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (cache.has(key)) return cache.get(key);
      const da = dist(a), db = dist(b);
      const t = da / (da - db);
      const p = [0, 1, 2].map(k => outNodes[a][k] + (outNodes[b][k] - outNodes[a][k]) * t);
      p[axis] = 0;
      const idx = outNodes.length;
      outNodes.push(p);
      cache.set(key, idx);
      return idx;
    };

    const next = [];
    for (const tri of outTris) {
      const d = [dist(tri[0]), dist(tri[1]), dist(tri[2])];
      const kept = d.filter(v => v >= -EPS).length;
      if (kept === 3) { next.push(tri); continue; }
      if (kept === 0) continue;
      const poly = [];
      for (let i = 0; i < 3; i++) {
        const a = tri[i], b = tri[(i + 1) % 3];
        const da = d[i], db = d[(i + 1) % 3];
        if (da >= -EPS) poly.push(a);
        if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) poly.push(cut(a, b));
      }
      for (let i = 2; i < poly.length; i++) next.push([poly[0], poly[i - 1], poly[i]]);
    }
    outTris = next;
  }

  // Compactage : les nœuds du côté écarté ne sont plus référencés.
  const remap = new Map();
  const packed = [];
  const finalTris = outTris.map(t => t.map(i => {
    let n = remap.get(i);
    if (n === undefined) { n = packed.length; remap.set(i, n); packed.push(outNodes[i]); }
    return n;
  }));
  return { nodes: packed, tris: finalTris, clipped: true };
}

/** Côté du plan `axis = 0` réellement occupé par le maillage hôte (+1 par défaut). */
function hostKeptSign(hostVertices, axis) {
  if (!hostVertices || hostVertices.length < 3) return 1;
  let pos = 0, neg = 0;
  for (let i = axis; i < hostVertices.length; i += 3) {
    if (hostVertices[i] > 1e-6) pos++;
    else if (hostVertices[i] < -1e-6) neg++;
  }
  return neg > pos ? -1 : 1;
}

function emptyMesh(error) {
  return { nodes: [], tris: [], stats: { nodeCount: 0, triangleCount: 0, error } };
}

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rotationRadians(component) {
  const factor = Math.PI / 180;
  return [
    finiteOr(component.rotationX_deg, 0) * factor,
    finiteOr(component.rotationY_deg, 0) * factor,
    finiteOr(component.rotationZ_deg, 0) * factor,
  ];
}

function rotateXYZ([x, y, z], [rx, ry, rz]) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const yx = y * cx - z * sx, zx = y * sx + z * cx;
  const xy = x * cy + zx * sy, zy = -x * sy + zx * cy;
  return [xy * cz - yx * sz, xy * sz + yx * cz, zy];
}

function inverseRotateXYZ([x, y, z], [rx, ry, rz]) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const xz = x * cz + y * sz, yz = -x * sz + y * cz;
  const xx = xz * cy - z * sy, zz = xz * sy + z * cy;
  return [xx, yz * cx + zz * sx, -yz * sx + zz * cx];
}

function worldFromLocal(point, scale, offset, component) {
  const scaled = point.map((value, index) => value * scale[index]);
  const rotated = rotateXYZ(scaled, rotationRadians(component));
  return rotated.map((value, index) => value + offset[index]);
}

function localFromWorld(point, scale, offset, component) {
  const translated = point.map((value, index) => value - offset[index]);
  const unrotated = inverseRotateXYZ(translated, rotationRadians(component));
  return unrotated.map((value, index) => value / (scale[index] || 1));
}

/** Taille d'élément cible : explicite, sinon calée sur le maillage hôte. */
function resolveTargetSize(component, options, rOuter) {
  const explicit = Number(component.meshSize_mm);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (Number.isFinite(options.hostEdge_mm) && options.hostEdge_mm > 0) return options.hostEdge_mm;
  return Math.max(rOuter / 8, 1e-3);
}

/**
 * Profil méridien échantillonné finement : calotte de rayon rInner et de
 * hauteur hD1, puis cône jusqu'à rOuter sur une profondeur tD1. Renvoie des
 * points (r, u) accompagnés de leur abscisse curviligne.
 * L'origine du profil est le CENTRE DU PLAN DU BORD (u = 0 au rim) : offsets à
 * zéro, le diaphragme se pose donc par sa couronne extérieure sur l'origine.
 * hD1 = 0 dégénère la calotte en un disque plat (cas 'back', capot rigide).
 */
function sampleProfile(rInner, rOuter, tD1, hD1) {
  const pts = [];
  const DOME_STEPS = 64;
  const rimU = rOuter > rInner ? tD1 : 0;
  if (rInner > 0) {
    for (let i = 0; i <= DOME_STEPS; i++) {
      const t = i / DOME_STEPS;
      pts.push({ r: rInner * t, u: hD1 * Math.sqrt(Math.max(0, 1 - t * t)) - rimU });
    }
  } else {
    pts.push({ r: 0, u: -rimU });
  }
  if (rOuter > rInner) pts.push({ r: rOuter, u: 0 });

  let s = 0;
  pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += Math.hypot(pts[i].r - pts[i - 1].r, pts[i].u - pts[i - 1].u);
    pts[i].s = s;
  }
  return { pts, length: s };
}

function profileAt(profile, s) {
  const pts = profile.pts;
  if (s <= 0) return { r: pts[0].r, u: pts[0].u };
  const last = pts[pts.length - 1];
  if (s >= last.s) return { r: last.r, u: last.u };
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].s < s) continue;
    const span = pts[i].s - pts[i - 1].s;
    const t = span > 0 ? (s - pts[i - 1].s) / span : 0;
    return {
      r: pts[i - 1].r + (pts[i].r - pts[i - 1].r) * t,
      u: pts[i - 1].u + (pts[i].u - pts[i - 1].u) * t,
    };
  }
  return { r: last.r, u: last.u };
}

/**
 * Semis radial. Avec bifurcation, le nombre de secteurs DOUBLE dès que l'arc
 * 2πr/n dépasse la taille cible : la densité reste constante du centre au bord.
 * Sans elle, toutes les couronnes portent le compte nécessaire au bord, ce qui
 * produit des triangles très allongés près de l'apex.
 * `sector` restreint le semis à un secteur angulaire (symétrie), `hostRim`
 * impose les nœuds de la couronne extérieure (conformité au maillage hôte).
 */
function buildRings(profile, target, bifurcate, sector = null, hostRim = null) {
  const ringCount = Math.max(1, Math.round(profile.length / target));
  const rOuterActual = profileAt(profile, profile.length).r;
  const fixedCount = Math.max(MIN_ANGULAR, Math.ceil((2 * Math.PI * rOuterActual) / target));
  const span = sector ? sector.a1 - sector.a0 : 2 * Math.PI;

  const points = [];
  const rimIndices = [];
  let angular = MIN_ANGULAR;

  for (let i = 0; i <= ringCount; i++) {
    const { r, u } = profileAt(profile, (profile.length * i) / ringCount);
    const isRim = i === ringCount;
    if (isRim && hostRim) {
      for (const p of hostRim) { rimIndices.push(points.length); points.push(p); }
      continue;
    }
    if (r <= 1e-9) {
      points.push({ x: 0, y: 0, u });
      continue;
    }
    let count;
    if (bifurcate) {
      while ((2 * Math.PI * r) / angular > 1.5 * target) angular *= 2;
      count = angular;
    } else {
      count = fixedCount;
    }
    if (sector) {
      // Les deux rayons du secteur portent des nœuds : le bord tombe exactement
      // sur les plans de symétrie, donc les images miroir se recollent.
      const steps = Math.max(1, Math.round((count * span) / (2 * Math.PI)));
      for (let jj = 0; jj <= steps; jj++) {
        const a = sector.a0 + (span * jj) / steps;
        if (isRim) rimIndices.push(points.length);
        points.push({ x: r * Math.cos(a), y: r * Math.sin(a), u });
      }
      continue;
    }
    // Décalage d'un demi-secteur une couronne sur deux : le semis devient
    // quinconce, ce que Delaunay traduit en triangles quasi équilatéraux.
    const phase = (i % 2) * (Math.PI / count);
    for (let j = 0; j < count; j++) {
      const a = phase + (2 * Math.PI * j) / count;
      if (isRim) rimIndices.push(points.length);
      points.push({ x: r * Math.cos(a), y: r * Math.sin(a), u });
    }
  }
  return { points, rimIndices, ringCount };
}

// ----------------------------------------------------------------------------
//  DELAUNAY (Bowyer–Watson) dans le plan paramétrique (x, y)
// ----------------------------------------------------------------------------
function delaunay(points) {
  const n = points.length;
  if (n < 3) return [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const dMax = Math.max(maxX - minX, maxY - minY) || 1;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  // Super-triangle largement englobant ; ses sommets portent les indices n..n+2.
  const verts = points.map(p => [p.x, p.y]);
  verts.push([cx - 20 * dMax, cy - dMax], [cx + 20 * dMax, cy - dMax], [cx, cy + 20 * dMax]);

  let tris = [[n, n + 1, n + 2]];

  for (let i = 0; i < n; i++) {
    const px = verts[i][0], py = verts[i][1];
    const bad = [];
    const kept = [];
    for (const t of tris) {
      if (inCircumcircle(px, py, verts[t[0]], verts[t[1]], verts[t[2]])) bad.push(t);
      else kept.push(t);
    }
    if (!bad.length) continue;

    // Frontière du trou : arêtes n'apparaissant qu'une fois parmi les mauvais.
    const edgeCount = new Map();
    for (const t of bad) {
      for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        const entry = edgeCount.get(key);
        if (entry) entry.count++;
        else edgeCount.set(key, { a, b, count: 1 });
      }
    }
    tris = kept;
    for (const { a, b, count } of edgeCount.values()) {
      if (count === 1) tris.push([a, b, i]);
    }
  }

  const out = [];
  for (const t of tris) {
    if (t[0] >= n || t[1] >= n || t[2] >= n) continue;
    // Sens direct dans le plan paramétrique ⇒ facettes mutuellement cohérentes.
    out.push(signedArea(verts[t[0]], verts[t[1]], verts[t[2]]) < 0 ? [t[0], t[2], t[1]] : t);
  }
  return out;
}

function signedArea(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function inCircumcircle(px, py, a, b, c) {
  const area = signedArea(a, b, c);
  if (Math.abs(area) < 1e-18) return false;
  const ax = a[0] - px, ay = a[1] - py;
  const bx = b[0] - px, by = b[1] - py;
  const cx = c[0] - px, cy = c[1] - py;
  const det =
    (ax * ax + ay * ay) * (bx * cy - by * cx) -
    (bx * bx + by * by) * (ax * cy - ay * cx) +
    (cx * cx + cy * cy) * (ax * by - ay * bx);
  return area > 0 ? det > 0 : det < 0;
}

// ----------------------------------------------------------------------------
//  CONFORMITÉ AU MAILLAGE HÔTE
// ----------------------------------------------------------------------------
/**
 * Recale les nœuds de la couronne extérieure sur les sommets du maillage
 * importé situés à portée. C'est ce qui permet au soudage de nœuds du solveur
 * de recoller le diaphragme au baffle qui le porte au lieu de le laisser
 * flotter comme une surface libre.
 */
function snapRimToHost(nodes, rimIndices, hostVertices, target) {
  if (!hostVertices || hostVertices.length < 3 || !rimIndices.length) return 0;
  const tol = target * 0.5;
  const cell = Math.max(tol, 1e-6);
  const grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)}|${Math.floor(y / cell)}|${Math.floor(z / cell)}`;
  for (let i = 0; i + 2 < hostVertices.length; i += 3) {
    const k = key(hostVertices[i], hostVertices[i + 1], hostVertices[i + 2]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }

  let snapped = 0;
  for (const idx of rimIndices) {
    const p = nodes[idx];
    const gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell), gz = Math.floor(p[2] / cell);
    let best = null, bestDist = tol;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(`${gx + dx}|${gy + dy}|${gz + dz}`);
          if (!bucket) continue;
          for (const i of bucket) {
            const d = Math.hypot(hostVertices[i] - p[0], hostVertices[i + 1] - p[1], hostVertices[i + 2] - p[2]);
            if (d < bestDist) { bestDist = d; best = i; }
          }
        }
      }
    }
    if (best != null) {
      nodes[idx] = [hostVertices[best], hostVertices[best + 1], hostVertices[best + 2]];
      snapped++;
    }
  }
  return snapped;
}

function edgeExtent(nodes, tris) {
  let min = Infinity, max = 0;
  for (const t of tris) {
    for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1], nodes[a][2] - nodes[b][2]);
      if (d < min) min = d;
      if (d > max) max = d;
    }
  }
  return { minEdge_mm: Number.isFinite(min) ? min : 0, maxEdge_mm: max };
}

/** Base orthonormée directe dont e3 est l'axe demandé ('+z', '-x', …). */
function axisBasis(value) {
  switch (String(value || '+z').trim().toLowerCase()) {
    case '+x': return { e1: [0, 1, 0], e2: [0, 0, 1], e3: [1, 0, 0] };
    case '-x': return { e1: [0, 1, 0], e2: [0, 0, -1], e3: [-1, 0, 0] };
    case '+y': return { e1: [0, 0, 1], e2: [1, 0, 0], e3: [0, 1, 0] };
    case '-y': return { e1: [0, 0, -1], e2: [1, 0, 0], e3: [0, -1, 0] };
    case '-z': return { e1: [1, 0, 0], e2: [0, -1, 0], e3: [0, 0, -1] };
    default:   return { e1: [1, 0, 0], e2: [0, 1, 0], e3: [0, 0, 1] };
  }
}
