// =======================================================
// FICHIER :  src/js/bem/bemDomainCore.js
// RÔLE    :  Solveur BEM MULTI-DOMAINE générique (façon Akabak) :
//            N sous-domaines intérieurs/extérieurs, M interfaces reliant
//            deux sous-domaines, surfaces rigides (« boundary ») ou pilotées
//            (« driven »), baffle infini optionnel par sous-domaine extérieur,
//            symétries H/V par images miroir.
//
//  Comme bemShared.js, ce fichier est un script SIMPLE (ni import ni export) :
//  il est concaténé APRÈS bemShared.js dans le blob du worker et consomme ses
//  primitives (noyaux de Green, quadrature, LU complexe, equilibrate).
//
//  ── CONVENTION DE NORMALE ────────────────────────────────────────────────
//  La normale d'une surface pointe VERS L'EXTÉRIEUR du domaine acoustique
//  qu'elle borde (c'est déjà la convention de bemShared/checkMeshSanity).
//  Pour une interface reliant A (`fromId`) à B (`toId`), la normale du
//  maillage pointe hors de A, donc vers B. Le signe est donc +1 côté A et
//  -1 côté B, ce qui fixe sans ambiguïté la continuité de vitesse.
//
//  ── FORMULATION ──────────────────────────────────────────────────────────
//  Sur chaque domaine d, collocation de Kirchhoff-Helmholtz aux centroïdes :
//
//      sum_j (c_i·delta_ij + H^d_ij) p_j  -  sum_j G_ij q^d_j  =  0
//
//  avec n^d la normale sortante de d, q^d = dp/dn^d, et
//      c_i = -sum_j H^d_ij|_{k=0}      (astuce de somme de lignes)
//  qui absorbe l'erreur de quadrature quasi-singulière dans la diagonale et
//  donne automatiquement le bon terme libre, que d soit intérieur ou extérieur.
//
//  Inconnues globales :
//      p_e   pour chaque élément utilisé          (continue à l'interface)
//      Q_e   pour chaque élément d'interface      (= q côté `fromId`)
//  Les parois rigides ont q = 0 (aucune inconnue) ; les surfaces pilotées ont
//  q = i·omega·rho·u_n connu et passent au second membre.
//
//  Le système est carré : sum_d |B_d| = N_p + N_interface = N_p + N_q, car un
//  élément d'interface appartient à exactement deux domaines.
//
//  ── LIMITE CONNUE ────────────────────────────────────────────────────────
//  Pas de Burton-Miller : un domaine EXTÉRIEUR non bafflé présente des
//  fréquences irrégulières au voisinage des résonances intérieures du volume
//  complémentaire. Avec un baffle infini (demi-espace) le problème ne se pose
//  pas. `solveMultiDomain` remonte l'indicateur de conditionnement de la LU,
//  qui s'effondre précisément à ces fréquences.
// =======================================================

'use strict';

// ============================================================
// ── PARSEUR .msh CONSERVANT LES DEUX TAGS
//    parseMSH() de bemShared regroupe par tag physique uniquement. L'UI peut
//    désigner une surface par son tag physique OU élémentaire, il faut donc
//    conserver les deux sur chaque triangle.
// ============================================================
function parseMshBothTags(mshContent) {
  const lines = mshContent.split('\n').map(l => l.trim()).filter(l => l);
  let idx = 0;

  while (idx < lines.length && !lines[idx].startsWith('$MeshFormat')) idx++;
  if (idx >= lines.length) throw new Error('Invalid MSH: $MeshFormat not found');
  idx++;
  const version = parseFloat(lines[idx].split(/\s+/)[0]);
  if (version < 2.0 || version >= 5.0) throw new Error(`Unsupported MSH version: ${version}`);

  const physicalNames = new Map();
  let scan = idx;
  while (scan < lines.length && !lines[scan].startsWith('$PhysicalNames')) scan++;
  if (scan < lines.length) {
    scan++;
    const numNames = parseInt(lines[scan++], 10);
    for (let i = 0; i < numNames; i++) {
      const m = lines[scan++].match(/(\d+)\s+(\d+)\s+"([^"]+)"/);
      if (m && parseInt(m[1], 10) === 2) physicalNames.set(parseInt(m[2], 10), m[3]);
    }
  }

  idx = 0;
  while (idx < lines.length && !lines[idx].startsWith('$Nodes')) idx++;
  if (idx >= lines.length) throw new Error('Invalid MSH: $Nodes not found');
  idx++;
  const numNodes = parseInt(lines[idx++], 10);
  const nodes = new Map();
  for (let i = 0; i < numNodes; i++) {
    const p = lines[idx++].split(/\s+/);
    nodes.set(parseInt(p[0], 10), [parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])]);
  }

  while (idx < lines.length && !lines[idx].startsWith('$Elements')) idx++;
  if (idx >= lines.length) throw new Error('Invalid MSH: $Elements not found');
  idx++;
  const numElements = parseInt(lines[idx++], 10);
  const tris = [];
  for (let i = 0; i < numElements; i++) {
    const p = lines[idx++].split(/\s+/).map(Number);
    if (p[1] !== 2) continue;
    const numTags = p[2];
    // Gmsh écrit 0 quand l'élément n'appartient à aucun groupe : ce n'est pas un tag.
    const physicalTag = numTags >= 1 && p[3] > 0 ? p[3] : null;
    const elementaryTag = numTags >= 2 && p[4] > 0 ? p[4] : null;
    const off = 3 + numTags;
    const n0 = p[off], n1 = p[off + 1], n2 = p[off + 2];
    const v0 = nodes.get(n0), v1 = nodes.get(n1), v2 = nodes.get(n2);
    if (!v0 || !v1 || !v2) continue;
    tris.push({ v0, v1, v2, n0, n1, n2, physicalTag, elementaryTag });
  }
  return { tris, physicalNames, numNodes: nodes.size };
}

/**
 * Soude les sommets coïncidents et renvoie, pour chaque triangle, des
 * identifiants de nœuds canoniques.
 *
 * Gmsh écrit fréquemment une COPIE des nœuds de bord pour chaque surface
 * élémentaire : deux surfaces voisines ne partagent alors aucun identifiant,
 * bien que géométriquement jointives. L'adjacence par arêtes — dont dépendent
 * la cohérence des normales et la détection de fermeture — devient impossible,
 * et un pavillon fermé se présente comme quatre morceaux ouverts sans
 * orientation commune. C'est l'étape « merge coincident vertices » que tout
 * pipeline BEM sérieux applique avant de résoudre.
 */
function weldNodes(tris) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const t of tris) {
    for (const v of [t.v0, t.v1, t.v2]) {
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
      if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
    }
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const tol = diag * 1e-7;
  const inv = 1 / tol;

  const grid = new Map();
  const canonical = [];   // id soudé → coordonnées
  let welded = 0;

  const idFor = (v) => {
    const cx = Math.round(v[0] * inv), cy = Math.round(v[1] * inv), cz = Math.round(v[2] * inv);
    // Une cellule voisine peut contenir le même point si celui-ci tombe près
    // d'une frontière de grille : on balaye les 27 cellules adjacentes.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(`${cx + dx}|${cy + dy}|${cz + dz}`);
          if (!bucket) continue;
          for (const id of bucket) {
            const c = canonical[id];
            if (Math.hypot(c[0] - v[0], c[1] - v[1], c[2] - v[2]) <= tol) return id;
          }
        }
      }
    }
    const id = canonical.length;
    canonical.push(v);
    const key = `${cx}|${cy}|${cz}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(id);
    return id;
  };

  for (const t of tris) {
    const a = idFor(t.v0), b = idFor(t.v1), c = idFor(t.v2);
    if (a !== t.n0 || b !== t.n1 || c !== t.n2) welded++;
    t.n0 = a; t.n1 = b; t.n2 = c;
  }
  return { nodeCount: canonical.length, tolerance: tol };
}

/** Triangles bruts → éléments P0 (collocation au centroïde), en mètres. */
function buildTaggedElements(tris, scale) {
  const elements = [];
  for (const t of tris) {
    const v0 = [t.v0[0] * scale, t.v0[1] * scale, t.v0[2] * scale];
    const v1 = [t.v1[0] * scale, t.v1[1] * scale, t.v1[2] * scale];
    const v2 = [t.v2[0] * scale, t.v2[1] * scale, t.v2[2] * scale];
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const area = nLen / 2;
    if (area < 1e-15) continue;
    elements.push({
      centroid: [(v0[0] + v1[0] + v2[0]) / 3, (v0[1] + v1[1] + v2[1]) / 3, (v0[2] + v1[2] + v2[2]) / 3],
      normal: [nx / nLen, ny / nLen, nz / nLen],
      area, v0, v1, v2,
      nodes: [t.n0, t.n1, t.n2],
      physicalTag: t.physicalTag,
      elementaryTag: t.elementaryTag,
      diaphragmId: t.diaphragmId || null,
    });
  }
  return elements;
}

/**
 * Injecte les triangles des diaphragmes dans le jeu de triangles du .msh, AVANT
 * le soudage de nœuds : leur couronne extérieure ayant été accrochée aux
 * sommets du maillage hôte côté UI, `weldNodes` les recolle au baffle porteur
 * et l'adjacence d'arêtes voit une seule et même surface.
 */
function appendDiaphragmTriangles(tris, diaphragms) {
  for (const dia of diaphragms || []) {
    const nodes = dia.nodes || [];
    for (const t of (dia.tris || [])) {
      const v0 = nodes[t[0]], v1 = nodes[t[1]], v2 = nodes[t[2]];
      if (!v0 || !v1 || !v2) continue;
      tris.push({
        v0, v1, v2,
        n0: -1, n1: -1, n2: -1,   // réattribués par weldNodes
        physicalTag: null, elementaryTag: null,
        diaphragmId: dia.id,
      });
    }
  }
}

/** `p:<tag>` / `e:<tag>` / `d:<id>` → prédicat sur un élément (mêmes identifiants que l'UI). */
function surfaceIdMatcher(surfaceId) {
  const raw = String(surfaceId || '');
  const dia = /^d:(.+)$/.exec(raw);
  if (dia) return (el) => el.diaphragmId === dia[1];
  const m = /^([pe]):(\d+)$/.exec(raw);
  if (!m) return () => false;
  const tag = parseInt(m[2], 10);
  return m[1] === 'p'
    ? (el) => el.physicalTag === tag
    : (el) => el.elementaryTag === tag;
}

// ============================================================
// ── MIROIRS AFFINES  (symétrie H/V + image de baffle)
//    y' = s·y + o. Les miroirs de SYMÉTRIE font partie de la surface physique
//    réelle (un quart de maillage + ses images = la surface fermée), alors que
//    l'image de BAFFLE est une source fictive. Cette distinction est capitale :
//    seul le premier groupe entre dans la somme de lignes du terme libre.
// ============================================================
function symmetryMirrors(symmetry) {
  const sym = String(symmetry || 'none').toLowerCase();
  const list = [{ s: [1, 1, 1], o: [0, 0, 0], identity: true }];
  const push = (s) => list.push({ s, o: [0, 0, 0], identity: false });
  if (sym === 'h' || sym === 'hv') push([1, -1, 1]);
  if (sym === 'v' || sym === 'hv') push([-1, 1, 1]);
  if (sym === 'hv') push([-1, -1, 1]);
  return list;
}

/** Produit des miroirs de symétrie par l'image de baffle (plan u_axis = bafflePos). */
function composeMirrors(symMirrors, bafflePos, axisIdx = 2) {
  if (bafflePos == null) return symMirrors.slice();
  const out = [];
  for (const m of symMirrors) {
    out.push(m);
    const s = m.s.slice();
    const o = m.o.slice();
    s[axisIdx] = -s[axisIdx];
    o[axisIdx] = 2 * bafflePos - m.o[axisIdx];
    out.push({ s, o, identity: false });
  }
  return out;
}

/** '+z' | '-x' | 'z' … → { idx: 0|1|2, sign: ±1 }. */
function parseBaffleAxis(value) {
  const raw = String(value || '+z').trim().toLowerCase();
  const letter = raw.slice(-1);
  const idx = letter === 'x' ? 0 : (letter === 'y' ? 1 : 2);
  return { idx, sign: raw.startsWith('-') ? -1 : 1 };
}

function mirrorElementAffine(elem, m) {
  if (m.identity) return elem;
  const s = m.s, o = m.o;
  const det = s[0] * s[1] * s[2];
  const mv = (v) => [v[0] * s[0] + o[0], v[1] * s[1] + o[1], v[2] * s[2] + o[2]];
  return {
    centroid: mv(elem.centroid),
    normal: [elem.normal[0] * s[0], elem.normal[1] * s[1], elem.normal[2] * s[2]],
    area: elem.area,
    v0: mv(elem.v0),
    v1: det < 0 ? mv(elem.v2) : mv(elem.v1),
    v2: det < 0 ? mv(elem.v1) : mv(elem.v2),
  };
}

const COINCIDENT_EPS2 = 1e-24;

/**
 * Somme de G sur toutes les images. Une image peut être CONFONDUE avec
 * l'élément d'origine (élément posé dans le plan du baffle) : R vaut alors 0 et
 * `greenKernel` renverrait {0,0}, ce qui ferait silencieusement perdre le
 * doublement du demi-espace, soit exactement -6,02 dB. On y substitue donc le
 * terme propre.
 */
function sumG(k, xi, elem, mirrors, isSelf) {
  let re = 0, im = 0;
  for (const m of mirrors) {
    const mE = mirrorElementAffine(elem, m);
    const dx = xi[0] - mE.centroid[0], dy = xi[1] - mE.centroid[1], dz = xi[2] - mE.centroid[2];
    if ((isSelf && m.identity) || dx * dx + dy * dy + dz * dz < COINCIDENT_EPS2) {
      const g = selfTermG(k, elem);
      re += g.re; im += g.im;
    } else {
      const g = integrateG(k, xi, mE);
      re += g.re; im += g.im;
    }
  }
  return { re, im };
}

/**
 * Somme de dG/dn sur toutes les images, avec le signe de normale du domaine.
 * H_ii = 0 exactement pour une facette plane colloquée dans son propre plan
 * (angle solide nul) ; une image confondue a sa normale retournée et donne
 * elle aussi 0. Les deux cas se traitent donc par omission.
 */
function sumH(k, xi, elem, mirrors, isSelf, normalSign) {
  let re = 0, im = 0;
  for (const m of mirrors) {
    if (isSelf && m.identity) continue;
    const mE = mirrorElementAffine(elem, m);
    const dx = xi[0] - mE.centroid[0], dy = xi[1] - mE.centroid[1], dz = xi[2] - mE.centroid[2];
    if (dx * dx + dy * dy + dz * dz < COINCIDENT_EPS2) continue;
    const h = integrateDGdn(k, xi, mE);
    re += h.re; im += h.im;
  }
  return { re: re * normalSign, im: im * normalSign };
}

// ============================================================
// ── CONSTRUCTION DU MODÈLE MULTI-DOMAINE
// ============================================================
/**
 * @param {string} mshContent
 * @param {{
 *   scale?: number,
 *   symmetry?: 'none'|'h'|'v'|'hv',
 *   subdomains: Array<{ id, name, type:'interior'|'exterior', baffle?:boolean,
 *                       surfaces: Array<{ surfaceId, role:'boundary'|'driven', velocity?:number }> }>,
 *   interfaces: Array<{ id, name, fromId, toId, surfaces: Array<{ surfaceId }> }>,
 *   diaphragms?: Array<{ id, nodes: number[][], tris: number[][] }>,
 * }} config
 */
function buildMultiDomainModel(mshContent, config) {
  const scale = config.scale != null ? config.scale : 0.001;
  const { tris, physicalNames, numNodes } = parseMshBothTags(mshContent);
  appendDiaphragmTriangles(tris, config.diaphragms);
  const weld = weldNodes(tris);
  const allElements = buildTaggedElements(tris, scale);
  if (!allElements.length) throw new Error('Mesh contains no usable triangles.');

  const subdomains = config.subdomains || [];
  const interfaces = config.interfaces || [];
  if (!subdomains.length) throw new Error('No subdomain defined — nothing to solve.');

  // --- Affectation élément → domaine(s) ---
  // owner[e]      = { domainId, role, velocity }  pour une surface propre
  // ifaceOf[e]    = { ifaceId, fromId, toId }     pour une surface d'interface
  const owner = new Array(allElements.length).fill(null);
  const ifaceOf = new Array(allElements.length).fill(null);
  const claimedBy = new Map(); // elemIdx → libellé, pour un message d'erreur utile

  const claim = (surfaceId, label, apply) => {
    const match = surfaceIdMatcher(surfaceId);
    let count = 0;
    for (let e = 0; e < allElements.length; e++) {
      if (!match(allElements[e])) continue;
      if (claimedBy.has(e)) {
        throw new Error(`Surface ${surfaceId} overlaps "${claimedBy.get(e)}" — an element cannot belong to two places.`);
      }
      claimedBy.set(e, label);
      apply(e);
      count++;
    }
    if (!count) throw new Error(`Surface ${surfaceId} ("${label}") matches no element in the mesh.`);
    return count;
  };

  for (const sd of subdomains) {
    for (const s of (sd.surfaces || [])) {
      claim(s.surfaceId, sd.name || sd.id, (e) => {
        owner[e] = {
          domainId: sd.id,
          role: s.role === 'driven' ? 'driven' : 'boundary',
          velocity: s.velocity != null ? s.velocity : 1,
          pistonAxis: s.pistonAxis || null,
        };
      });
    }
  }
  for (const itf of interfaces) {
    if (!itf.fromId || !itf.toId) {
      throw new Error(`Interface "${itf.name || itf.id}" has no From/To subdomain — set them by double-clicking it.`);
    }
    if (itf.fromId === itf.toId) {
      throw new Error(`Interface "${itf.name || itf.id}" connects a subdomain to itself.`);
    }
    for (const s of (itf.surfaces || [])) {
      claim(s.surfaceId, itf.name || itf.id, (e) => {
        ifaceOf[e] = { ifaceId: itf.id, fromId: itf.fromId, toId: itf.toId };
      });
    }
  }

  // --- Compactage : on ne garde que les éléments réellement affectés ---
  const used = [];
  for (let e = 0; e < allElements.length; e++) if (owner[e] || ifaceOf[e]) used.push(e);
  if (!used.length) throw new Error('No mesh surface has been assigned to a subdomain or interface.');

  // Une surface oubliée laisse un trou dans un domaine : le repérer ici évite
  // de faire chercher à l'utilisateur une erreur de normales inexistante.
  const unassigned = new Map();
  for (let e = 0; e < allElements.length; e++) {
    if (owner[e] || ifaceOf[e]) continue;
    const el = allElements[e];
    const id = el.physicalTag != null ? `p:${el.physicalTag}` : `e:${el.elementaryTag}`;
    const u = unassigned.get(id) || { surfaceId: id, triangles: 0, area: 0 };
    u.triangles++; u.area += el.area;
    unassigned.set(id, u);
  }

  const elements = used.map(e => allElements[e]);
  const info = used.map(e => ({ owner: owner[e], iface: ifaceOf[e] }));
  const N = elements.length;

  // --- Domaines : liste ordonnée d'éléments + signe de normale sortante ---
  const domains = new Map();
  for (const sd of subdomains) {
    const axis = parseBaffleAxis(sd.baffleAxis);
    domains.set(sd.id, {
      id: sd.id,
      name: sd.name || sd.id,
      type: sd.type === 'interior' ? 'interior' : 'exterior',
      baffle: !!sd.baffle,
      baffleZ: null,
      baffleAxisIdx: axis.idx,
      baffleSign: axis.sign,
      baffleOffset_m: (Number(sd.baffleOffset_mm) || 0) / 1000,
      elemIdx: [],
      sign: new Map(),      // elemIdx local → ±1
      role: new Map(),      // 'boundary' | 'driven' | 'interface'
      velocity: new Map(),
      pistonAxis: new Map(), // surfaces pilotées en corps rigide : axe du mouvement
    });
  }

  for (let i = 0; i < N; i++) {
    const inf = info[i];
    if (inf.owner) {
      const d = domains.get(inf.owner.domainId);
      if (!d) throw new Error(`Surface assigned to unknown subdomain ${inf.owner.domainId}.`);
      d.elemIdx.push(i);
      d.sign.set(i, 1);
      d.role.set(i, inf.owner.role);
      d.velocity.set(i, inf.owner.velocity);
      if (inf.owner.pistonAxis) d.pistonAxis.set(i, inf.owner.pistonAxis);
    } else {
      const a = domains.get(inf.iface.fromId);
      const b = domains.get(inf.iface.toId);
      if (!a || !b) throw new Error(`Interface references an unknown subdomain.`);
      // Les deux côtés partent de la normale du maillage telle quelle. C'est
      // `orientDomains` qui décide ensuite du sens, domaine par domaine, et les
      // deux côtés se retrouvent nécessairement opposés puisqu'ils bordent la
      // même surface par l'extérieur de volumes opposés. Fixer le signe ici à
      // partir de l'ordre From/To rendrait le jeu de signes d'un domaine
      // incohérent avec ses propres parois dès que l'utilisateur déclare
      // l'interface dans l'autre sens — ce n'est qu'une étiquette.
      a.elemIdx.push(i); a.sign.set(i, 1);
      b.elemIdx.push(i); b.sign.set(i, 1);
      a.role.set(i, 'interface');
      b.role.set(i, 'interface');
    }
  }

  for (const d of domains.values()) {
    if (!d.elemIdx.length) throw new Error(`Subdomain "${d.name}" has no surface assigned.`);
  }

  // --- Plan du baffle : il contient le BORD LIBRE du domaine bafflé, c.-à-d.
  //     les arêtes n'appartenant qu'à un seul triangle. C'est là que la
  //     géométrie rencontre le baffle et se referme sur lui. Prendre l'étendue
  //     du maillage, ou la position moyenne des éléments, placerait le plan au
  //     mauvais endroit dès que la bouche dépasse du baffle par une collerette.
  //     Le décalage utilisateur (baffleOffset_m) s'ajoute ensuite au plan ajusté.
  for (const d of domains.values()) {
    if (!d.baffle || d.type !== 'exterior') { d.baffle = false; continue; }
    const ax = d.baffleAxisIdx;
    const sym = String(config.symmetry || 'none').toLowerCase();
    const usesH = sym === 'h' || sym === 'hv';   // plan y = 0
    const usesV = sym === 'v' || sym === 'hv';   // plan x = 0
    // Sur un maillage réduit, les arêtes de coupe sont libres elles aussi mais
    // n'ont rien à voir avec le baffle : les inclure décalerait le plan.
    const onSymmetryPlane = (va, vb) =>
      (usesV && Math.abs(va[0]) < 1e-9 && Math.abs(vb[0]) < 1e-9) ||
      (usesH && Math.abs(va[1]) < 1e-9 && Math.abs(vb[1]) < 1e-9);

    const edgeCount = new Map();
    for (const j of d.elemIdx) {
      const n = elements[j].nodes;
      for (let e = 0; e < 3; e++) {
        const a = n[e], b = n[(e + 1) % 3];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      }
    }
    let zSum = 0, wSum = 0;
    for (const j of d.elemIdx) {
      const el = elements[j];
      for (let e = 0; e < 3; e++) {
        const a = el.nodes[e], b = el.nodes[(e + 1) % 3];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (edgeCount.get(key) !== 1) continue;
        const va = e === 0 ? el.v0 : (e === 1 ? el.v1 : el.v2);
        const vb = e === 0 ? el.v1 : (e === 1 ? el.v2 : el.v0);
        if (onSymmetryPlane(va, vb)) continue;
        const len = Math.hypot(vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]);
        zSum += (va[ax] + vb[ax]) / 2 * len;
        wSum += len;
      }
    }
    if (wSum > 0) {
      d.baffleZ = zSum / wSum;
      d.baffleFromFreeEdge = true;
    } else {
      // Coque déjà FERMÉE (ex : une boîte complète plaquée contre un mur
      // infini par une de ses propres faces) : il n'y a pas de bord libre où
      // lire la position du baffle, et la moyenne des centroïdes de toute la
      // surface n'a aucun sens physique (elle ne coïncide avec le plan voulu
      // que par coïncidence). L'offset EST alors la position absolue du plan
      // depuis l'origine, comme documenté dans le popup Baffle.
      d.baffleZ = 0;
      d.baffleFromFreeEdge = false;
    }
    d.baffleZ += d.baffleOffset_m;
  }

  const normalConvention = String(config.normalConvention || 'auto').toLowerCase();
  const orientation = orientDomains(domains, elements, String(config.symmetry || 'none').toLowerCase(), normalConvention);

  // Contrôle de la convention ABEC sur les interfaces : la normale du maillage
  // doit pointer VERS le premier sous-domaine (« From »). L'orientation n'en
  // dépend pas — elle est déduite du maillage — mais un From/To inversé rend
  // l'arbre trompeur, donc on le signale.
  const interfaceChecks = [];
  for (const itf of interfaces) {
    const from = domains.get(itf.fromId);
    if (!from) continue;
    let dot = 0;
    for (let i = 0; i < N; i++) {
      if (info[i].iface?.ifaceId !== itf.id) continue;
      dot += from.sign.get(i) * elements[i].area;   // +1 ⇔ sortante de From = n maillage
    }
    if (dot === 0) continue;
    interfaceChecks.push({
      id: itf.id,
      name: itf.name || itf.id,
      fromName: from.name,
      toName: domains.get(itf.toId)?.name || itf.toId,
      // La normale rentre dans From ⇔ sortante de From = -n ⇔ dot < 0.
      pointsToFrom: dot < 0,
    });
  }

  // Un diaphragme lié à un moteur ne « respire » pas : il se translate en CORPS
  // RIGIDE le long de son axe. Sa vitesse normale suit donc cos(axe, normale),
  // et son débit vaut l'aire PROJETÉE × vitesse, pas l'aire développée. Sur un
  // cône de 39 mm de creux la différence n'a rien d'anecdotique.
  // À faire APRÈS `orientDomains`, qui fixe le signe de la normale sortante.
  for (const d of domains.values()) {
    for (const [i, axis] of d.pistonAxis) {
      const n = elements[i].normal;
      const s = d.sign.get(i);
      const dot = s * (axis[0]*n[0] + axis[1]*n[1] + axis[2]*n[2]);
      d.velocity.set(i, -dot * d.velocity.get(i));
    }
  }

  // Un domaine non orientable signale un vrai défaut de modèle : surface ni
  // fermée, ni bordant un baffle, ni reliée au reste par une interface.
  for (const d of domains.values()) {
    if (d.oriented) continue;
    const hint = unassigned.size
      ? ` Unassigned mesh surfaces that would likely close it: ${[...unassigned.values()]
          .sort((a, b) => b.area - a.area)
          .map(u => `${u.surfaceId} (${(u.area * 1e4).toFixed(1)} cm2, ${u.triangles} tris)`)
          .join(', ')}.`
      : '';
    throw new Error(
      `Subdomain "${d.name}" is not closed: ${(d.closureResidual * 100).toFixed(1)}% of its area is unaccounted for, ` +
      `and it is neither bounded by an infinite baffle nor linked through an interface.${hint}`
    );
  }

  // --- Indexation des inconnues ---
  const pIndex = new Int32Array(N);
  for (let i = 0; i < N; i++) pIndex[i] = i;          // p : une inconnue par élément
  const qIndex = new Int32Array(N).fill(-1);          // Q : interfaces seulement
  let nq = 0;
  for (let i = 0; i < N; i++) if (info[i].iface) qIndex[i] = nq++;

  const totalRows = [...domains.values()].reduce((s, d) => s + d.elemIdx.length, 0);
  const nUnknowns = N + nq;
  if (totalRows !== nUnknowns) {
    throw new Error(`Inconsistent model: ${totalRows} equations for ${nUnknowns} unknowns. Every interface must connect exactly two subdomains.`);
  }

  const hasDriven = [...domains.values()].some(d => [...d.role.values()].includes('driven'));
  if (!hasDriven) throw new Error('No driven surface — nothing excites the model. Mark at least one surface as "Driven".');

  const symMirrors = symmetryMirrors(config.symmetry);
  const maxEdge = maxEdgeLength(elements);

  return {
    elements, info, domains, pIndex, qIndex, nq, N, nUnknowns,
    symMirrors,
    orientation,
    interfaceChecks,
    normalConvention,
    unassigned: [...unassigned.values()],
    symmetry: String(config.symmetry || 'none').toLowerCase(),
    mirrorCount: symMirrors.length,
    physicalNames,
    numNodes,
    maxElementSize_m: maxEdge,
    maxElementSize_mm: maxEdge * 1000,
    elementCount: N,
  };
}

/** Jeu d'images propre à un domaine : symétries, plus l'image de baffle s'il en a une. */
function domainMirrors(model, domain) {
  return composeMirrors(model.symMirrors, domain.baffle ? domain.baffleZ : null, domain.baffleAxisIdx ?? 2);
}

/** Distance d'un point au triangle (v0,v1,v2), par projection sur la région de Voronoï. */
function pointTriangleDistance(p, v0, v1, v2) {
  const e0 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
  const e1 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
  const d = [v0[0]-p[0], v0[1]-p[1], v0[2]-p[2]];
  const a = e0[0]*e0[0] + e0[1]*e0[1] + e0[2]*e0[2];
  const b = e0[0]*e1[0] + e0[1]*e1[1] + e0[2]*e1[2];
  const c = e1[0]*e1[0] + e1[1]*e1[1] + e1[2]*e1[2];
  const dd = e0[0]*d[0] + e0[1]*d[1] + e0[2]*d[2];
  const e = e1[0]*d[0] + e1[1]*d[1] + e1[2]*d[2];
  const det = a*c - b*b;
  let s = b*e - c*dd, t = b*dd - a*e;

  if (s + t <= det) {
    if (s < 0) { if (t < 0) { if (dd < 0) { t = 0; s = a > 0 ? Math.min(1, Math.max(0, -dd/a)) : 0; } else { s = 0; t = c > 0 ? Math.min(1, Math.max(0, -e/c)) : 0; } } else { s = 0; t = c > 0 ? Math.min(1, Math.max(0, -e/c)) : 0; } }
    else if (t < 0) { t = 0; s = a > 0 ? Math.min(1, Math.max(0, -dd/a)) : 0; }
    else if (det > 0) { s /= det; t /= det; }
    else { s = 0; t = 0; }
  } else {
    if (s < 0) { const tmp0 = b + e, tmp1 = c; if (tmp1 > tmp0) { const num = tmp1 - tmp0, den = a - 2*b + c; s = den > 0 ? Math.min(1, Math.max(0, num/den)) : 0; t = 1 - s; } else { s = 0; t = c > 0 ? Math.min(1, Math.max(0, -e/c)) : 0; } }
    else if (t < 0) { const tmp0 = b + dd, tmp1 = a; if (tmp1 > tmp0) { const num = c + e - b - dd, den = a - 2*b + c; s = den > 0 ? Math.min(1, Math.max(0, num/den)) : 0; t = 1 - s; } else { t = 0; s = a > 0 ? Math.min(1, Math.max(0, -dd/a)) : 0; } }
    else { const num = c + e - b - dd, den = a - 2*b + c; s = den > 0 ? Math.min(1, Math.max(0, num/den)) : 0; t = 1 - s; }
  }
  const qx = v0[0] + s*e0[0] + t*e1[0] - p[0];
  const qy = v0[1] + s*e0[1] + t*e1[1] - p[1];
  const qz = v0[2] + s*e0[2] + t*e1[2] - p[2];
  return Math.sqrt(qx*qx + qy*qy + qz*qz);
}

/**
 * Marque les points d'une nappe trop PROCHES d'une paroi pour être exploitables.
 *
 * `evalFieldQuadCache` ré-intègre les éléments voisins par subdivision
 * adaptative : la vitesse reste juste jusqu'à une fraction de la taille
 * d'élément, ce qui permet de descendre DANS un event de 20 mm maillé en
 * 20 mm. Ne restent inexploitables que les points posés sur la paroi elle-même,
 * où la couche double est discontinue et la valeur dépend du côté d'approche.
 * @returns {Uint8Array} 1 = point utilisable, 0 = sur la paroi.
 */
function fieldSurfaceMask(points, elements, factor = 0.04) {
  const mask = new Uint8Array(points.length).fill(1);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    for (const el of elements) {
      // Rejet rapide sur le centroïde : la distance exacte ne peut pas être
      // plus petite que |p - c| - rayon circonscrit, majoré ici par 2·h.
      const h = Math.sqrt(2 * el.area);
      const dcx = p[0]-el.centroid[0], dcy = p[1]-el.centroid[1], dcz = p[2]-el.centroid[2];
      const dc2 = dcx*dcx + dcy*dcy + dcz*dcz;
      const reach = factor * h + h;
      if (dc2 > reach * reach) continue;
      if (pointTriangleDistance(p, el.v0, el.v1, el.v2) < factor * h) { mask[i] = 0; break; }
    }
  }
  return mask;
}

// ============================================================
// ── ORIENTATION AUTOMATIQUE DES DOMAINES
// ============================================================
/**
 * Rend les normales d'un domaine mutuellement cohérentes par ADJACENCE
 * D'ARÊTES, puis renvoie ses composantes connexes.
 *
 * Deux triangles voisins correctement orientés parcourent leur arête commune
 * en sens OPPOSÉ. S'ils la parcourent dans le même sens, l'un des deux est
 * retourné. C'est indispensable ici : rien n'oblige l'utilisateur (ni Akabak) à
 * dessiner la paroi, le piston et l'interface d'un même domaine dans le même
 * sens — un simple retournement global du domaine ne pourrait alors JAMAIS le
 * rendre cohérent, et le domaine resterait non fermé.
 */
function makeDomainCoherent(d, elements) {
  const idx = d.elemIdx;
  const local = new Map();
  idx.forEach((g, li) => local.set(g, li));

  // arête non orientée → [{ li, dir }], dir = +1 si parcourue du plus petit
  // identifiant de nœud vers le plus grand.
  const edgeMap = new Map();
  idx.forEach((g, li) => {
    const n = elements[g].nodes;
    for (let e = 0; e < 3; e++) {
      const a = n[e], b = n[(e + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const dir = a < b ? 1 : -1;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key).push({ li, dir });
    }
  });

  const rel = new Int8Array(idx.length).fill(0);   // 0 = non visité
  const components = [];

  for (let seed = 0; seed < idx.length; seed++) {
    if (rel[seed] !== 0) continue;
    rel[seed] = 1;
    const comp = [seed];
    const queue = [seed];
    while (queue.length) {
      const li = queue.pop();
      const n = elements[idx[li]].nodes;
      for (let e = 0; e < 3; e++) {
        const a = n[e], b = n[(e + 1) % 3];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        // Sens EFFECTIF, c.-à-d. tenant compte du retournement déjà décidé pour
        // cet élément : comparer les sens bruts serait faux dès que rel = -1.
        const dirEff = (a < b ? 1 : -1) * rel[li];
        for (const nb of (edgeMap.get(key) || [])) {
          if (nb.li === li || rel[nb.li] !== 0) continue;
          // Voisin cohérent ⟺ sens effectifs opposés : nb.dir·want = -dirEff.
          rel[nb.li] = -dirEff * nb.dir;
          comp.push(nb.li);
          queue.push(nb.li);
        }
      }
    }
    components.push(comp);
  }

  idx.forEach((g, li) => d.sign.set(g, d.sign.get(g) * rel[li]));
  return components;
}

/**
 * Aire, vecteur de fermeture et volume signé d'un sous-ensemble d'éléments.
 *
 * Les plans de coupe d'un maillage symétrique sont absents du fichier : leurs
 * composantes ne peuvent donc pas s'annuler et doivent être exclues du test de
 * fermeture, sans quoi AUCUN quart ni demi-maillage ne serait jamais reconnu
 * comme fermé.
 */
function componentMetrics(d, elements, comp, symmetry) {
  let ax = 0, ay = 0, az = 0, area = 0, vol = 0;
  for (const li of comp) {
    const g = d.elemIdx[li];
    const el = elements[g];
    const s = d.sign.get(g);
    ax += s * el.normal[0] * el.area;
    ay += s * el.normal[1] * el.area;
    az += s * el.normal[2] * el.area;
    area += el.area;
    vol += s * (el.centroid[0] * el.normal[0] + el.centroid[1] * el.normal[1] + el.centroid[2] * el.normal[2]) * el.area;
  }
  const usesH = symmetry === 'h' || symmetry === 'hv';   // plan y = 0
  const usesV = symmetry === 'v' || symmetry === 'hv';   // plan x = 0
  const residual = Math.hypot(usesV ? 0 : ax, usesH ? 0 : ay, az);
  return { closureVec: [ax, ay, az], area, volume: vol / 3, residual, closed: residual < 0.02 * area };
}

/**
 * Nombre d'enroulement d'une composante fermée autour d'un point, par somme
 * des angles solides (Van Oosterom & Strackee). Vaut 1 si le point est à
 * l'intérieur de la composante, 0 sinon.
 *
 * Les images miroir sont incluses : sur un maillage réduit par symétrie la
 * composante est ouverte aux plans de coupe, et sans ses images la somme ne
 * vaudrait jamais 4π.
 */
function componentWinding(point, d, elements, comp, mirrors) {
  let omega = 0;
  for (const li of comp) {
    const g = d.elemIdx[li];
    const el = elements[g];
    const flip = d.sign.get(g) < 0;
    for (const m of mirrors) {
      const mE = mirrorElementAffine(el, m);
      const p0 = mE.v0, p1 = flip ? mE.v2 : mE.v1, p2 = flip ? mE.v1 : mE.v2;
      const ax = p0[0]-point[0], ay = p0[1]-point[1], az = p0[2]-point[2];
      const bx = p1[0]-point[0], by = p1[1]-point[1], bz = p1[2]-point[2];
      const cx = p2[0]-point[0], cy = p2[1]-point[1], cz = p2[2]-point[2];
      const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
      if (la < 1e-15 || lb < 1e-15 || lc < 1e-15) continue;
      const num = ax*(by*cz - bz*cy) + ay*(bz*cx - bx*cz) + az*(bx*cy - by*cx);
      const den = la*lb*lc
        + (ax*bx + ay*by + az*bz)*lc
        + (ax*cx + ay*cy + az*cz)*lb
        + (bx*cx + by*cy + bz*cz)*la;
      omega += 2 * Math.atan2(num, den);
    }
  }
  return omega / (4 * Math.PI);
}

/**
 * Normalise chaque domaine vers des normales SORTANTES du domaine acoustique.
 *
 *   1. cohérence interne par adjacence d'arêtes (ci-dessus) ;
 *   1 bis. convention 'akabak' : les normales du maillage RENTRENT dans le
 *      domaine auquel l'élément appartient (règle d'ABEC, cf. « Normals and
 *      Volumes »), donc la sortante vaut -n. On lit ce sens sur les surfaces
 *      PROPRES du domaine ; les interfaces suivent par cohérence d'arêtes, ce
 *      qui les rend automatiquement opposées de part et d'autre.
 *   2. composante fermée   → volume signé du mauvais sens ⇒ retourner. Le bon
 *      sens dépend du TYPE : un domaine intérieur enferme son volume (V > 0),
 *      un extérieur est l'air AUTOUR de la coque (V < 0).
 *   2 bis. composante fermée CONTENUE dans une autre du même domaine ⇒
 *      retourner à nouveau (c'est une cavité exclue du domaine) ;
 *   3. extérieur bafflé    → l'air occupe z > zBaffle, la sortante pointe -Z ;
 *   4. reste               → déduit d'un voisin déjà orienté à travers une
 *      interface, les deux côtés y étant nécessairement opposés.
 */
function orientDomains(domains, elements, symmetry, convention = 'auto') {
  const domainsArr = [...domains.values()];
  const symMirrors = symmetryMirrors(symmetry);
  const useMeshNormals = String(convention).toLowerCase() === 'akabak';

  const flipComp = (d, comp) => {
    for (const li of comp) {
      const g = d.elemIdx[li];
      d.sign.set(g, -d.sign.get(g));
    }
    d.flipped = true;
  };

  for (const d of domainsArr) {
    d.flipped = false;
    d.components = makeDomainCoherent(d, elements);
    d.oriented = false;
    // Le signe voulu du volume signé dépend du type : l'air d'un domaine
    // intérieur est DANS la coque, celui d'un extérieur est AUTOUR. Confondre
    // les deux laisse une interface avec le MÊME signe des deux côtés — le
    // couplage part alors à l'envers sans qu'aucun test de fermeture ne bronche.
    const wantVolumeSign = d.type === 'exterior' ? -1 : 1;

    // 1 bis. Ancrage sur les normales du maillage (convention ABEC).
    const anchored = new Set();
    if (useMeshNormals) {
      for (const comp of d.components) {
        let vote = 0;
        for (const li of comp) {
          const g = d.elemIdx[li];
          if (d.role.get(g) === 'interface') continue;   // les interfaces suivent
          vote += d.sign.get(g) * elements[g].area;
        }
        if (vote === 0) continue;                        // composante 100 % interface
        if (vote > 0) flipComp(d, comp);                 // sortante = -n du maillage
        anchored.add(comp);
      }
    }

    // 2. Toute composante fermée s'oriente seule. La géométrie a le dernier mot
    // même en convention 'akabak' : sur une composante FERMÉE le sens sortant
    // est déterminé sans ambiguïté, donc si le maillage contredit la convention
    // c'est le maillage qui est mal dessiné — on le corrige et on le signale
    // plutôt que de rendre un résultat faux.
    let allOriented = true;
    const closedComps = [];
    for (const comp of d.components) {
      const m = componentMetrics(d, elements, comp, symmetry);
      if (m.closed) {
        if (m.volume * wantVolumeSign < 0) {
          flipComp(d, comp);
          if (anchored.has(comp)) d.conventionOverride = true;
        }
        closedComps.push(comp);
      } else if (!anchored.has(comp)) {
        allOriented = false;
      }
    }

    // 2 bis. Un domaine peut être borné par PLUSIEURS coques fermées : c'est le
    // cas d'un guide annulaire (carter + corps interne), où l'air est DANS le
    // carter mais AUTOUR du corps. Le volume signé oriente chaque coque hors
    // d'elle-même, ce qui n'est juste que pour la coque englobante ; toute coque
    // contenue dans une autre borde une cavité EXCLUE du domaine et doit être
    // retournée. Sans ça le domaine paraît fermé mais son jeu de signes est
    // incohérent (rowSumError ≈ 1, bilan de puissance aberrant).
    if (closedComps.length > 1) {
      for (const comp of closedComps) {
        const g0 = d.elemIdx[comp[0]];
        const probe = elements[g0].centroid;
        let containedIn = 0;
        for (const other of closedComps) {
          if (other === comp) continue;
          if (Math.abs(componentWinding(probe, d, elements, other, symMirrors)) > 0.5) containedIn++;
        }
        if (containedIn % 2 === 1) flipComp(d, comp);
      }
    }

    const whole = componentMetrics(d, elements, d.elemIdx.map((_, li) => li), symmetry);
    d.closed = whole.closed;
    d.areaTotal = whole.area;
    d.closureVec = whole.closureVec;
    d.closureResidual = whole.residual / Math.max(whole.area, 1e-300);
    d.signedVolume = whole.volume;
    d.anchoredComps = anchored;
    if (allOriented) d.oriented = true;
  }

  // 3. Repli baffle : un extérieur bafflé se referme sur le plan du baffle.
  for (const d of domainsArr) {
    if (d.oriented || !d.baffle) continue;
    const ax = d.baffleAxisIdx ?? 2;
    const wantedSign = -(d.baffleSign ?? 1);   // la sortante pointe vers le baffle
    for (const comp of d.components) {
      if (d.anchoredComps.has(comp)) continue;
      const m = componentMetrics(d, elements, comp, symmetry);
      if (m.closed) continue;
      let nz = 0;
      for (const li of comp) {
        const g = d.elemIdx[li];
        nz += d.sign.get(g) * elements[g].normal[ax] * elements[g].area;
      }
      if (nz * wantedSign < 0) flipComp(d, comp);
    }
    d.oriented = true;
  }

  // 4. Propagation par les interfaces, jusqu'au point fixe.
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const d of domainsArr) {
      if (d.oriented) continue;
      for (const other of domainsArr) {
        if (other === d || !other.oriented) continue;
        const shared = d.elemIdx.find(g => other.sign.has(g));
        if (shared === undefined) continue;
        if (d.sign.get(shared) !== -other.sign.get(shared)) {
          for (const comp of d.components) {
            if (d.anchoredComps.has(comp)) continue;
            for (const li of comp) {
              const g = d.elemIdx[li];
              d.sign.set(g, -d.sign.get(g));
            }
          }
          d.flipped = true;
        }
        d.oriented = true;
        progressed = true;
        break;
      }
    }
  }

  return domainsArr.map(d => ({
    domain: d.name, closed: d.closed, flipped: d.flipped,
    oriented: d.oriented, components: d.components.length,
    closureResidual: d.closureResidual,
    conventionOverride: !!d.conventionOverride,
  }));
}

// ============================================================
// ── PRÉPARATION INDÉPENDANTE DE LA FRÉQUENCE
// ============================================================
/**
 * Terme libre par domaine.
 *
 * Sur une surface FERMÉE, c_i = -sum_j H^d_ij|_{k=0} : l'identité
 * sum_j H_ij|_{k=0} = -1/2 est exacte, et l'utiliser au lieu de la constante
 * 1/2 absorbe toute l'erreur de quadrature quasi-singulière dans la diagonale.
 * Elle donne aussi le bon signe sans rien savoir de l'orientation : +1/2 pour
 * un domaine intérieur, -1/2 pour un extérieur.
 *
 * Sur une surface OUVERTE, cette identité ne tient plus. Le terme libre vient
 * du saut du potentiel de double couche : il vaut 1/2 par « côté de fluide »
 * vu par le point de collocation. Un élément posé DANS le plan du baffle a son
 * image confondue avec lui, il voit donc deux demi-espaces (le vrai et son
 * reflet) et son terme libre vaut 1, pas 1/2.
 *
 * C'est décisif pour l'ouverture plane bafflée : `sumG` y double déjà le noyau
 * (image confondue), donc un terme libre de 1/2 donnerait p = 4·∫G·q au lieu de
 * p = 2·∫G·q — la pression pariétale, et donc la puissance rayonnée, seraient
 * exactement deux fois trop grandes. Le champ lointain, lui, ne dépend que de q
 * sur une surface plane (H ≡ 0) et resterait juste : seul un bilan d'énergie
 * révèle l'erreur.
 *
 * Seuls les miroirs de SYMÉTRIE entrent dans la somme de lignes : ils font
 * partie de la surface physique réelle. L'image de baffle est une source
 * fictive, régulière, qui n'a rien à faire dans un terme libre.
 */
function prepareMultiDomain(model, onProgress) {
  const freeTerms = new Map();
  const diagnostics = [];
  const domainsArr = [...model.domains.values()];
  const totalWork = domainsArr.reduce((s, d) => s + d.elemIdx.length, 0);
  let doneWork = 0;

  for (const d of domainsArr) {
    const idx = d.elemIdx;
    const n = idx.length;
    const closed = d.closed;

    const ft = new Float64Array(n);
    let worstRowSumError = 0;

    if (closed) {
      // Σ_j H_ij|k=0 vaut -½ sur un domaine INTÉRIEUR et +½ sur un EXTÉRIEUR
      // (la normale sortante du fluide y pointe vers le corps). Le terme libre
      // exact reste +½ dans les deux cas : c'est la somme attendue qui change,
      // et c'est elle qu'on retranche pour absorber l'erreur de quadrature.
      const sExpected = d.type === 'exterior' ? 0.5 : -0.5;
      for (let a = 0; a < n; a++) {
        const i = idx[a];
        const xi = model.elements[i].centroid;
        let s = 0;
        for (let b = 0; b < n; b++) {
          const j = idx[b];
          s += sumH(0, xi, model.elements[j], model.symMirrors, i === j, d.sign.get(j)).re;
        }
        ft[a] = 0.5 - (s - sExpected);
        worstRowSumError = Math.max(worstRowSumError, Math.abs(s - sExpected));
        doneWork++;
        if (onProgress && (doneWork % 32 === 0)) onProgress(doneWork / totalWork);
      }
    } else {
      const mirrors = domainMirrors(model, d);
      for (let a = 0; a < n; a++) {
        const el = model.elements[idx[a]];
        // Nombre d'images confondues avec l'élément (identité incluse).
        let coincident = 0;
        for (const m of mirrors) {
          const mE = mirrorElementAffine(el, m);
          const dx = el.centroid[0] - mE.centroid[0];
          const dy = el.centroid[1] - mE.centroid[1];
          const dz = el.centroid[2] - mE.centroid[2];
          if (dx * dx + dy * dy + dz * dz < COINCIDENT_EPS2) coincident++;
        }
        ft[a] = 0.5 * Math.max(1, coincident);
      }
      doneWork += n;
      if (onProgress) onProgress(doneWork / totalWork);
    }

    freeTerms.set(d.id, ft);
    diagnostics.push({
      domain: d.name, closed, worstRowSumError,
      flipped: d.flipped, oriented: d.oriented,
    });
  }

  if (onProgress) onProgress(1);
  return { freeTerms, diagnostics };
}

// ============================================================
// ── ASSEMBLAGE ET RÉSOLUTION À UNE FRÉQUENCE
// ============================================================
function solveMultiDomain(freq, model, prep, options) {
  const opts = options || {};
  const onProgress = opts.onProgress;
  if (!(freq > 0)) throw new Error(`Invalid frequency ${freq}.`);

  const k = 2 * Math.PI * freq / C_AIR;
  const omega = 2 * Math.PI * freq;
  const { elements, N, nq, nUnknowns } = model;
  const Nt = nUnknowns;

  const A = new Float64Array(2 * Nt * Nt);
  const rhs = new Float64Array(2 * Nt);

  let row = 0;
  const domainsArr = [...model.domains.values()];
  const totalRows = Nt;

  for (const d of domainsArr) {
    const idx = d.elemIdx;
    const n = idx.length;
    const mirrors = domainMirrors(model, d);
    const ft = prep.freeTerms.get(d.id);

    for (let a = 0; a < n; a++) {
      const i = idx[a];
      const xi = elements[i].centroid;
      let rhsRe = 0, rhsIm = 0;

      for (let b = 0; b < n; b++) {
        const j = idx[b];
        const ej = elements[j];
        const isSelf = (i === j);
        const sj = d.sign.get(j);
        const role = d.role.get(j);

        // --- double couche : colonne p_j, présente pour tous les éléments ---
        const h = sumH(k, xi, ej, mirrors, isSelf, sj);
        const cb = 2 * (row * Nt + model.pIndex[j]);
        A[cb]     += h.re + (isSelf ? ft[a] : 0);
        A[cb + 1] += h.im;

        // --- simple couche : seulement là où q est inconnu ou imposé ---
        if (role === 'boundary') continue;   // paroi rigide : q = 0
        const g = sumG(k, xi, ej, mirrors, isSelf);

        if (role === 'driven') {
          // `velocity` est dirigée VERS l'intérieur du domaine (un haut-parleur
          // qui pousse dans la charge est positif) ; la normale étant sortante,
          // la vitesse normale vaut donc -velocity.
          const s = -omega * RHO_AIR * d.velocity.get(j);
          // -G·q passe au second membre : +G·q, avec q = i·s
          rhsRe += -s * g.im;
          rhsIm +=  s * g.re;
        } else {
          // Interface : q^d = sign · Q. Le terme -G·q^d reste à gauche.
          const qcol = 2 * (row * Nt + N + model.qIndex[j]);
          A[qcol]     += -sj * g.re;
          A[qcol + 1] += -sj * g.im;
        }
      }

      rhs[2 * row]     = rhsRe;
      rhs[2 * row + 1] = rhsIm;
      row++;
      if (onProgress && (row % 16 === 0)) onProgress(0.85 * row / totalRows);
    }
  }

  if (onProgress) onProgress(0.88);
  const { colScale } = equilibrate(A, rhs, Nt);
  const lu = complexLUSolve(A, rhs, Nt, {
    throwOnSingular: true,
    label: `multi-domain BEM @ ${freq.toFixed(1)} Hz`,
  });
  for (let j = 0; j < Nt; j++) {
    const inv = 1 / colScale[j];
    rhs[2 * j] *= inv; rhs[2 * j + 1] *= inv;
  }

  const pressure = new Float64Array(2 * N);
  for (let j = 0; j < N; j++) { pressure[2 * j] = rhs[2 * j]; pressure[2 * j + 1] = rhs[2 * j + 1]; }
  const Q = new Float64Array(2 * nq);
  for (let m = 0; m < nq; m++) { Q[2 * m] = rhs[2 * (N + m)]; Q[2 * m + 1] = rhs[2 * (N + m) + 1]; }

  if (onProgress) onProgress(1);
  return { pressure, Q, k, omega, freq, condIndicator: lu.condIndicator };
}

/** q = dp/dn sortante du domaine `d`, pour l'élément global j. */
function domainQ(model, sol, d, j) {
  const role = d.role.get(j);
  if (role === 'boundary') return { re: 0, im: 0 };
  if (role === 'driven') {
    return { re: 0, im: -sol.omega * RHO_AIR * d.velocity.get(j) };
  }
  const m = model.qIndex[j];
  const s = d.sign.get(j);
  return { re: s * sol.Q[2 * m], im: s * sol.Q[2 * m + 1] };
}

// ============================================================
// ── CHAMP RAYONNÉ
// ============================================================
/**
 * Formule de représentation dans le domaine `d` :
 *     p(x) = sum_j [ G_j·q^d_j - H_j·p_j ]
 * (images comprises). C'est la même convention de signe que la BIE assemblée
 * ci-dessus, donc toute erreur de signe s'y propagerait de façon cohérente et
 * serait attrapée par le bilan de puissance.
 */
function multiDomainFieldPressure(x, model, sol, d, opts) {
  const farField = !!(opts && opts.farField);
  const mirrors = domainMirrors(model, d);
  const elements = model.elements;
  let pRe = 0, pIm = 0;

  for (const j of d.elemIdx) {
    const ej = elements[j];
    const q = domainQ(model, sol, d, j);
    const pj = { re: sol.pressure[2 * j], im: sol.pressure[2 * j + 1] };
    const sj = d.sign.get(j);

    for (const m of mirrors) {
      const mE = mirrorElementAffine(ej, m);
      let gRe, gIm;
      if (farField) {
        const g = greenKernel(sol.k, x, mE.centroid);
        gRe = g.gRe * mE.area; gIm = g.gIm * mE.area;
      } else {
        const g = integrateG(sol.k, x, mE);
        gRe = g.re; gIm = g.im;
      }
      pRe += gRe * q.re - gIm * q.im;
      pIm += gRe * q.im + gIm * q.re;

      const dg = integrateDGdn(sol.k, x, mE);
      const hRe = dg.re * sj, hIm = dg.im * sj;
      pRe -= hRe * pj.re - hIm * pj.im;
      pIm -= hRe * pj.im + hIm * pj.re;
    }
  }
  return { re: pRe, im: pIm };
}

/**
 * Bilan de puissance : la somme des puissances sortantes de tous les domaines
 * doit être nulle (les interfaces s'annulent deux à deux), donc la puissance
 * injectée par les surfaces pilotées ressort intégralement par les domaines
 * extérieurs. Une valeur négative signale immédiatement un signe inversé.
 */
function multiDomainPowerBalance(model, sol) {
  const out = [];
  let driven = 0, radiated = 0;
  for (const d of model.domains.values()) {
    let w = 0;
    let wDriven = 0;
    for (const j of d.elemIdx) {
      const el = model.elements[j];
      const q = domainQ(model, sol, d, j);
      // v_n = q / (i·omega·rho)  ⟹  conj(v_n) = conj(q)/(-i·omega·rho)
      const s = 1 / (sol.omega * RHO_AIR);
      const vRe = q.im * s, vIm = -q.re * s;
      const pRe = sol.pressure[2 * j], pIm = sol.pressure[2 * j + 1];
      const dw = 0.5 * (pRe * vRe + pIm * vIm) * el.area * model.mirrorCount;
      w += dw;
      if (d.role.get(j) === 'driven') wDriven += dw;
    }
    out.push({ domain: d.name, wOut: w });
    // La normale sort du domaine ACOUSTIQUE : une source qui injecte compte
    // donc négativement, et pour un domaine extérieur l'énergie rayonnée vers
    // l'infini entre par la frontière, d'où le signe opposé des deux côtés.
    driven -= wDriven;
    if (d.type === 'exterior') radiated -= w;
  }
  const denom = Math.max(Math.abs(driven), Math.abs(radiated), 1e-300);
  return { perDomain: out, driven, radiated, mismatch: Math.abs(driven - radiated) / denom };
}

// ============================================================
// ── POLAIRE
// ============================================================
/**
 * Balayage polaire dans le domaine extérieur, centré sur le centre acoustique
 * du rayonnement (barycentre pondéré par l'aire des surfaces du domaine
 * extérieur). Normalisation SUR L'AXE et non sur le maximum : normaliser par le
 * maximum déplace le seuil -6 dB dès qu'un lobe hors axe dépasse l'axe.
 */
function computeMultiDomainPolar(model, sol, d, plane, distance, angleStep, angleMaxDeg) {
  let cx = 0, cy = 0, cz = 0, aTot = 0;
  for (const j of d.elemIdx) {
    const el = model.elements[j];
    cx += el.centroid[0] * el.area; cy += el.centroid[1] * el.area; cz += el.centroid[2] * el.area;
    aTot += el.area;
  }
  const origin = aTot > 0 ? [cx / aTot, cy / aTot, cz / aTot] : [0, 0, 0];
  // Avec un baffle, l'origine acoustique est le plan du baffle lui-même.
  const bafAx = d.baffleAxisIdx ?? 2;
  const bafSign = d.baffleSign ?? 1;
  if (d.baffle) { origin[0] = 0; origin[1] = 0; origin[2] = 0; origin[bafAx] = d.baffleZ; }

  const angles = [], mags = [];
  for (let deg = -angleMaxDeg; deg <= angleMaxDeg + 1e-9; deg += angleStep) {
    const rad = deg * Math.PI / 180;
    const s = distance * Math.sin(rad);
    const c = distance * Math.cos(rad);
    const pt = (plane === 'H')
      ? [origin[0] + s, origin[1], origin[2] + c]
      : [origin[0], origin[1] + s, origin[2] + c];
    // Baffle infini rigide : aucun rayonnement derrière son plan.
    if (d.baffle && (pt[bafAx] - d.baffleZ) * bafSign < 0) { angles.push(deg); mags.push(0); continue; }
    const p = multiDomainFieldPressure(pt, model, sol, d, { farField: true });
    angles.push(deg);
    mags.push(Math.hypot(p.re, p.im));
  }

  let axisIdx = 0, best = Infinity;
  for (let i = 0; i < angles.length; i++) {
    const dd = Math.abs(angles[i]);
    if (dd < best) { best = dd; axisIdx = i; }
  }
  const ref = mags[axisIdx];
  const normalized = ref > 0 ? mags.map(m => m / ref) : mags.map(() => 0);
  return { angles, normalized, pressureMags: mags };
}

/** Domaine extérieur servant d'observation : le premier déclaré, baffle prioritaire. */
function pickRadiatingDomain(model) {
  const ext = [...model.domains.values()].filter(d => d.type === 'exterior');
  if (!ext.length) throw new Error('No exterior subdomain — there is nowhere to radiate. Set one subdomain to "Exterior".');
  return ext.find(d => d.baffle) || ext[0];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseMshBothTags, buildTaggedElements, surfaceIdMatcher,
    symmetryMirrors, composeMirrors, mirrorElementAffine,
    sumG, sumH,
    buildMultiDomainModel, domainMirrors,
    prepareMultiDomain, solveMultiDomain, domainQ,
    multiDomainFieldPressure, multiDomainPowerBalance,
    computeMultiDomainPolar, pickRadiatingDomain,
  };
}
