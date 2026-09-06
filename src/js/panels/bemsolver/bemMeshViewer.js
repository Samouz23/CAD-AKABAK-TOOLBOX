// ====================================================================================================
// FICHIER :  src/js/panels/bemsolver/bemMeshViewer.js
// RÔLE :     Visualiseur 3D minimal (Three.js) pour le module BEM Solver.
//            Repère XYZ façon Akabak + affichage d'un maillage .msh importé.
//            Aucune logique BEM ici : pur rendu, réutilisable indépendamment
//            du worker/solveur (parsing local, pas de dépendance à bemShared.js
//            qui est écrit pour le contexte Worker/CommonJS).
// ====================================================================================================

import * as THREE from '../../lib/three.module.js';
import { OrbitControls } from '../../lib/OrbitControls.js';

/**
 * Crée un viewer 3D attaché à `container` avec repère XYZ (façon Akabak) et
 * la capacité de charger un maillage .msh (ASCII Gmsh v2.2) pour inspection
 * visuelle (rotation libre, pas de calcul).
 * @param {HTMLElement} container
 * @param {{ onSurfaceContextMenu?: (info: { clientX: number, clientY: number, physical: object[], elementary: object[] }) => void }} [options]
 * @returns {{
 *   loadMeshFromText: (text: string) => void,
 *   clear: () => void,
 *   dispose: () => void,
 *   getSurfaces: () => Array<{ id: string, name: string, kind: string, entityCount: number }>,
 *   flipSurfaceNormal: (surfaceId: string) => void,
 *   setSurfaceVisible: (surfaceId: string, visible: boolean) => void,
 *   setAllSurfacesVisibleExcept: (visible: boolean, excludedSurfaceIds: string[]) => void,
 *   clearSelection: () => void,
 *   setSurfaceColor: (surfaceId: string, colorHex: number|null) => void,
 *   setSymmetry: (mode: 'none'|'h'|'v'|'hv') => void,
 *   setSymmetryVisible: (visible: boolean) => void,
 *   setBaffle: (key: string, config: { axis?: string, offset_mm?: number }|null) => void,
 *   setBaffleVisible: (key: string, visible: boolean) => void,
 *   setDiaphragm: (key: string, config: { mesh: { nodes: number[][], tris: number[][] } }|null) => void,
 *   setDiaphragmVisible: (key: string, visible: boolean) => void,
 *   setField: (key: string, config: { points: number[][], tris: number[][], wireframe?: boolean, contour?: number[][] }|null) => void,
 *   setFieldVisible: (key: string, visible: boolean) => void,
 *   setFieldColors: (key: string, colors: number[][]|null) => void,
 *   setFieldParticles: (key: string, config: object|null) => void,
 *   setFieldParticlesVisible: (key: string, visible: boolean) => void,
 *   setFieldOverlay: (key: string, config: object|null) => void,
 *   setFieldOverlayVisible: (key: string, visible: boolean) => void,
 *   getMeshVertices: () => number[],
 *   getMedianEdgeLength: () => number,
 * }}
 */
export function createBemMeshViewer(container, options = {}) {
  const onSurfaceContextMenu = typeof options.onSurfaceContextMenu === 'function' ? options.onSurfaceContextMenu : null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);

  const aspect = Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
  const camera = new THREE.PerspectiveCamera(45, aspect, 1, 100000);
  camera.position.set(300, 220, 300);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(1, 1, 1);
  scene.add(dirLight);

  // --- Repère XYZ façon Akabak : X rouge, Y vert, Z bleu, longues lignes ---
  const axisLength = 5000;
  const axesGroup = new THREE.Group();
  const axisDefs = [
    { dir: [1, 0, 0], color: 0xff3b3b },
    { dir: [0, 1, 0], color: 0x3bff6a },
    { dir: [0, 0, 1], color: 0x3b8bff },
  ];
  axisDefs.forEach(({ dir, color }) => {
    const points = [
      new THREE.Vector3(-dir[0] * axisLength, -dir[1] * axisLength, -dir[2] * axisLength),
      new THREE.Vector3(dir[0] * axisLength, dir[1] * axisLength, dir[2] * axisLength),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color });
    axesGroup.add(new THREE.Line(geo, mat));
  });
  scene.add(axesGroup);

  // Le maillage est découpé en « entités » = plus petite unité indivisible,
  // c.-à-d. un couple (tag physique, tag élémentaire). Une SURFACE sélectionnable
  // est ensuite soit un tag physique (regroupant plusieurs entités), soit un tag
  // élémentaire — les deux vues coexistent, d'où deux entrées de menu distinctes.
  let meshRoot = null;       // THREE.Group contenant une sous-mesh par entité
  let entities = [];         // [{ physicalTag, elementaryTag, mesh, wire }]
  let surfaces = new Map();  // surfaceId ('p:<tag>' | 'e:<tag>') -> { id, name, kind, entityIndices }
  let hasPhysicalTags = false; // priorité décidée au niveau du MAILLAGE, pas de l'entité
  let selection = new Set(); // surfaceId sélectionnés (Shift + clic gauche)
  let baseColors = new Map();// surfaceId -> couleur imposée par le panneau (rôle BEM)
  let symmetryRoot = null;   // copies miroir, purement visuelles (jamais cliquables)
  let symmetryClones = [];   // [{ clone, source, sourceGroup? }] pour resynchroniser couleur/visibilité
  let symmetryMode = 'none'; // 'none' | 'h' | 'v' | 'hv'
  let symmetryVisible = true;
  let baffles = new Map();   // clé (id de composant) -> plan de baffle infini
  let diaphragms = new Map();// clé (id de composant) -> maillage de diaphragme
  let fields = new Map();    // clé (id de field) -> nappe d'observation
  // Déclaré ici et pas près de `setFieldParticles` : la boucle de rendu, plus
  // haut dans le fichier, y accède dès la première frame.
  const particleSystems = new Map();
  const fieldOverlays = new Map();   // clé -> lignes de courant / iso-vitesses

  const SURFACE_COLOR = 0x9aa0a6;
  const SELECTED_COLOR = 0x38bdf8;

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  // Rayon de tolérance autour du curseur : sur un maillage fin, viser un triangle
  // au pixel près est impraticable, donc on échantillonne en spirale autour du clic.
  const PICK_RADIUS_PX = 14;
  const PICK_OFFSETS = (() => {
    const offsets = [[0, 0]];
    for (const r of [5, 10, PICK_RADIUS_PX]) {
      for (let a = 0; a < 8; a++) {
        const t = (a / 8) * Math.PI * 2;
        offsets.push([Math.cos(t) * r, Math.sin(t) * r]);
      }
    }
    return offsets;
  })();

  function rayHitAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    return raycaster.intersectObjects(meshRoot.children, true)
      .find(h => h.object.isMesh && h.object.visible) || null;
  }

  function pickEntityAt(clientX, clientY) {
    if (!meshRoot) return -1;
    // Les faces arrière sont invisibles (FrontSide) mais doivent rester
    // cliquables : on passe temporairement en DoubleSide pour le lancer de rayon.
    entities.forEach(ent => { ent.mesh.material.side = THREE.DoubleSide; });
    let hit = null;
    for (const [dx, dy] of PICK_OFFSETS) {
      hit = rayHitAt(clientX + dx, clientY + dy);
      if (hit) break;
    }
    entities.forEach((ent, i) => { ent.mesh.material.side = sideForEntity(i); });
    return hit ? hit.object.userData.entityIndex : -1;
  }

  /** Surface sélectionnable d'une entité : tag physique si le maillage en a, sinon tag élémentaire. */
  function primarySurfaceId(entityIndex) {
    const ent = entities[entityIndex];
    if (!ent) return null;
    if (hasPhysicalTags) return ent.physicalTag != null ? `p:${ent.physicalTag}` : null;
    return ent.elementaryTag != null ? `e:${ent.elementaryTag}` : null;
  }

  /** Une surface sélectionnée se voit des deux côtés, pour que la surbrillance soit visible partout. */
  function sideForEntity(entityIndex) {
    const id = primarySurfaceId(entityIndex);
    return id && selection.has(id) ? THREE.DoubleSide : THREE.FrontSide;
  }

  function refreshSelectionHighlight() {
    entities.forEach((ent, i) => {
      ent.mesh.material.side = sideForEntity(i);
      const id = primarySurfaceId(i);
      if (id && selection.has(id)) {
        ent.mesh.material.color.setHex(SELECTED_COLOR);
        return;
      }
      // Une entité peut être peinte via son tag physique ou son tag élémentaire.
      const override = (ent.physicalTag != null ? baseColors.get(`p:${ent.physicalTag}`) : undefined)
        ?? (ent.elementaryTag != null ? baseColors.get(`e:${ent.elementaryTag}`) : undefined);
      ent.mesh.material.color.setHex(override ?? SURFACE_COLOR);
    });
    syncSymmetry();
  }

  function mirrorScales() {
    // H = plan y=0 (miroir Y), V = plan x=0 (miroir X) — même convention que
    // le solveur (bemDomainCore.js/bemCore.js) et le sector de diaphragmMesh.js.
    if (symmetryMode === 'h') return [[1, -1, 1]];
    if (symmetryMode === 'v') return [[-1, 1, 1]];
    if (symmetryMode === 'hv') return [[1, -1, 1], [-1, 1, 1], [-1, -1, 1]];
    return [];
  }

  function disposeSymmetry() {
    if (!symmetryRoot) return;
    scene.remove(symmetryRoot);
    symmetryRoot.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    symmetryRoot = null;
    symmetryClones = [];
  }

  /**
   * Géométrie réfléchie d'une entité. On réfléchit les sommets ET on rétablit
   * l'ordre des sommets quand la réflexion l'a inversé : la normale du miroir
   * est ainsi la vraie réflexion de la normale d'origine, et non son opposée.
   */
  function mirroredGeometry(geometry, scale) {
    const src = geometry.getAttribute('position');
    const out = new Float32Array(src.count * 3);
    const reversesWinding = scale[0] * scale[1] * scale[2] < 0;
    for (let v = 0; v < src.count; v += 3) {
      const order = reversesWinding ? [0, 2, 1] : [0, 1, 2];
      for (let k = 0; k < 3; k++) {
        const s = v + order[k];
        const d = (v + k) * 3;
        out[d]     = src.getX(s) * scale[0];
        out[d + 1] = src.getY(s) * scale[1];
        out[d + 2] = src.getZ(s) * scale[2];
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    geo.computeVertexNormals();
    return geo;
  }

  function mirroredLineGeometry(geometry, scale) {
    const src = geometry.getAttribute('position');
    const out = new Float32Array(src.count * 3);
    for (let v = 0; v < src.count; v++) {
      const d = v * 3;
      out[d]     = src.getX(v) * scale[0];
      out[d + 1] = src.getY(v) * scale[1];
      out[d + 2] = src.getZ(v) * scale[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    return geo;
  }

  function cloneMirroredRenderable(source, scale, sourceGroup = null) {
    if (!source.geometry || !source.material) return null;
    const geo = source.isLineSegments ? mirroredLineGeometry(source.geometry, scale) : mirroredGeometry(source.geometry, scale);
    const mat = source.material.clone();
    const clone = source.isLineSegments ? new THREE.LineSegments(geo, mat) : new THREE.Mesh(geo, mat);
    symmetryClones.push({ clone, source, sourceGroup });
    return clone;
  }

  function rebuildSymmetry() {
    disposeSymmetry();
    const scales = mirrorScales();
    if (!meshRoot || !scales.length) return;
    symmetryRoot = new THREE.Group();
    scales.forEach(scale => {
      const group = new THREE.Group();
      entities.forEach(ent => {
        const mesh = cloneMirroredRenderable(ent.mesh, scale);
        if (mesh) group.add(mesh);
        const wire = cloneMirroredRenderable(ent.wire, scale);
        if (wire) group.add(wire);
      });
      diaphragms.forEach(sourceGroup => {
        const diaphragmGroup = new THREE.Group();
        sourceGroup.children.forEach(source => {
          const clone = cloneMirroredRenderable(source, scale, sourceGroup);
          if (clone) diaphragmGroup.add(clone);
        });
        group.add(diaphragmGroup);
      });
      symmetryRoot.add(group);
    });
    symmetryRoot.visible = symmetryVisible;
    scene.add(symmetryRoot);
    syncSymmetry();
  }

  /** Copies colour and visibility from each original entity onto its mirrored clones. */
  function syncSymmetry() {
    symmetryClones.forEach(({ clone, source, sourceGroup }) => {
      if (clone.material?.color && source.material?.color) clone.material.color.copy(source.material.color);
      if (clone.material && source.material?.side !== undefined) clone.material.side = source.material.side;
      clone.visible = source.visible && (!sourceGroup || sourceGroup.visible);
    });
  }

  // On distingue un clic d'un glisser-déposer de caméra : orbiter/panner ne doit
  // jamais toucher à la sélection ni ouvrir le menu contextuel.
  let pointerDownPos = null;
  const CLICK_SLOP_PX = 4;

  container.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY, button: e.button };
  });

  container.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !meshRoot || !pointerDownPos) return;
    const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (moved > CLICK_SLOP_PX) return; // caméra déplacée : sélection inchangée

    const i = pickEntityAt(e.clientX, e.clientY);
    const surfaceId = i >= 0 ? primarySurfaceId(i) : null;

    if (e.shiftKey) {
      if (!surfaceId) return;
      if (selection.has(surfaceId)) selection.delete(surfaceId);
      else selection.add(surfaceId);
    } else if (surfaceId) {
      selection = new Set([surfaceId]);
    } else if (selection.size) {
      selection.clear();
    } else {
      return;
    }
    refreshSelectionHighlight();
  });

  /** Unique physical/elementary surfaces covering the given selectable surfaces. */
  function surfacesForIds(surfaceIds) {
    const physical = new Map();
    const elementary = new Map();
    surfaceIds.forEach(sid => {
      surfaces.get(sid)?.entityIndices.forEach(i => {
        const ent = entities[i];
        if (!ent) return;
        if (ent.physicalTag != null) {
          const s = surfaces.get(`p:${ent.physicalTag}`);
          if (s) physical.set(s.id, { id: s.id, name: s.name, kind: s.kind });
        }
        if (ent.elementaryTag != null) {
          const s = surfaces.get(`e:${ent.elementaryTag}`);
          if (s) elementary.set(s.id, { id: s.id, name: s.name, kind: s.kind });
        }
      });
    });
    return { physical: [...physical.values()], elementary: [...elementary.values()] };
  }

  container.addEventListener('contextmenu', (e) => {
    if (!meshRoot || !onSurfaceContextMenu) return;
    e.preventDefault();
    // Un clic droit maintenu sert à déplacer la caméra : on n'ouvre le menu
    // que si le pointeur n'a pas bougé.
    if (pointerDownPos && Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > CLICK_SLOP_PX) return;
    const entityIndex = pickEntityAt(e.clientX, e.clientY);
    const hitSurfaceId = entityIndex >= 0 ? primarySurfaceId(entityIndex) : null;
    // Le clic droit agit sur la sélection dès qu'elle existe (elle a été
    // construite à la souris, éventuellement sous plusieurs angles de caméra) ;
    // sans sélection, il ne vise que la surface pointée.
    const targets = selection.size ? [...selection] : (hitSurfaceId ? [hitSurfaceId] : []);
    if (!targets.length) return;
    onSurfaceContextMenu({ clientX: e.clientX, clientY: e.clientY, ...surfacesForIds(targets) });
  });

  let rafId = null;
  let lastFrameMs = 0;
  const animate = () => {
    rafId = requestAnimationFrame(animate);
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // Borné : un onglet remis au premier plan renverrait un dt d'une minute et
    // téléporterait toutes les particules.
    const dt = lastFrameMs ? Math.min(0.05, (now - lastFrameMs) / 1000) : 0;
    lastFrameMs = now;
    if (particleSystems.size) {
      particleSystems.forEach(sys => { if (sys.points.visible) updateParticles(sys, dt); });
    }
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  const resizeObserver = new ResizeObserver(() => {
    if (!container.clientWidth || !container.clientHeight) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  resizeObserver.observe(container);

  function clear() {
    disposeSymmetry();
    [...baffles.keys()].forEach(removeBaffle);
    [...diaphragms.keys()].forEach(key => removeDiaphragm(key, false));
    [...particleSystems.keys()].forEach(removeFieldParticles);
    [...fieldOverlays.keys()].forEach(removeFieldOverlay);
    [...fields.keys()].forEach(removeField);
    if (meshRoot) {
      scene.remove(meshRoot);
      meshRoot.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      meshRoot = null;
    }
    entities = [];
    surfaces = new Map();
    selection = new Set();
    baseColors = new Map();
    hasPhysicalTags = false;
  }

  /**
   * Parse un .msh ASCII Gmsh v2.2 et renvoie les triangles regroupés par entité
   * (couple tag physique / tag élémentaire), plus les noms physiques déclarés.
   */
  function parseMshForDisplay(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let idx = lines.indexOf('$PhysicalNames');
    const physicalNames = new Map();
    if (idx !== -1) {
      idx++;
      const numNames = parseInt(lines[idx++], 10);
      for (let i = 0; i < numNames; i++) {
        const m = lines[idx++].match(/(\d+)\s+(\d+)\s+"([^"]+)"/);
        if (m && parseInt(m[1], 10) === 2) physicalNames.set(parseInt(m[2], 10), m[3]);
      }
    }

    idx = lines.indexOf('$Nodes');
    if (idx === -1) throw new Error('Invalid MSH: $Nodes not found');
    idx++;
    const numNodes = parseInt(lines[idx++], 10);
    const nodes = new Map();
    for (let i = 0; i < numNodes; i++) {
      const p = lines[idx++].split(/\s+/);
      nodes.set(parseInt(p[0], 10), [parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])]);
    }

    idx = lines.indexOf('$Elements');
    if (idx === -1) throw new Error('Invalid MSH: $Elements not found');
    idx++;
    const numElements = parseInt(lines[idx++], 10);

    const order = [];              // [{ physicalTag, elementaryTag }]
    const keyToIndex = new Map();
    const triangles = [];          // parallel: array of flat position arrays

    for (let i = 0; i < numElements; i++) {
      const p = lines[idx++].split(/\s+/).map(Number);
      if (p[1] !== 2) continue; // triangles only
      const numTags = p[2];
      // Gmsh écrit 0 quand l'élément n'appartient à aucun groupe : ce n'est pas un tag.
      const physicalTag = numTags >= 1 && p[3] > 0 ? p[3] : null;
      const elementaryTag = numTags >= 2 && p[4] > 0 ? p[4] : null;
      const off = 3 + numTags;
      const v0 = nodes.get(p[off]), v1 = nodes.get(p[off + 1]), v2 = nodes.get(p[off + 2]);
      if (!v0 || !v1 || !v2) continue;

      const key = `${physicalTag ?? '_'}|${elementaryTag ?? '_'}`;
      let gi = keyToIndex.get(key);
      if (gi === undefined) {
        gi = order.length;
        keyToIndex.set(key, gi);
        order.push({ physicalTag, elementaryTag });
        triangles.push([]);
      }
      triangles[gi].push(...v0, ...v1, ...v2);
    }

    return { order, triangles, physicalNames };
  }

  function loadMeshFromText(text) {
    clear();
    const { order, triangles, physicalNames } = parseMshForDisplay(text);
    if (!order.length) throw new Error('No triangles found in mesh');

    meshRoot = new THREE.Group();
    scene.add(meshRoot);

    order.forEach((ent, i) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles[i], 3));
      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: SURFACE_COLOR, side: THREE.FrontSide, flatShading: true })
      );
      mesh.userData.entityIndex = i;
      meshRoot.add(mesh);

      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x2a2f36, transparent: true, opacity: 0.5 })
      );
      meshRoot.add(wire);

      entities.push({ physicalTag: ent.physicalTag, elementaryTag: ent.elementaryTag, mesh, wire });
    });

    // Construit les deux familles de surfaces sélectionnables.
    hasPhysicalTags = entities.some(ent => ent.physicalTag != null);
    entities.forEach((ent, i) => {
      if (ent.physicalTag != null) {
        const id = `p:${ent.physicalTag}`;
        if (!surfaces.has(id)) {
          surfaces.set(id, {
            id, kind: 'physical', entityIndices: [],
            name: physicalNames.get(ent.physicalTag) || `Physical ${ent.physicalTag}`,
          });
        }
        surfaces.get(id).entityIndices.push(i);
      }
      if (ent.elementaryTag != null) {
        const id = `e:${ent.elementaryTag}`;
        if (!surfaces.has(id)) {
          surfaces.set(id, { id, kind: 'elementary', entityIndices: [], name: `Elementary ${ent.elementaryTag}` });
        }
        surfaces.get(id).entityIndices.push(i);
      }
    });

    const box = new THREE.Box3().setFromObject(meshRoot);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    if (sphere.radius > 0) {
      const dist = sphere.radius * 3;
      camera.position.set(dist, dist * 0.7, dist);
      controls.target.copy(sphere.center);
      controls.update();
    }
    rebuildSymmetry();
  }

  function getSurfaces() {
    return [...surfaces.values()].map(s => ({ id: s.id, name: s.name, kind: s.kind, entityCount: s.entityIndices.length }));
  }

  function removeBaffle(key) {
    const plane = baffles.get(key);
    if (!plane) return;
    scene.remove(plane);
    plane.geometry.dispose();
    plane.material.dispose();
    baffles.delete(key);
  }

  /**
   * Baffle infini : grand plan perpendiculaire à l'axe choisi, posé sur
   * l'origine du repère puis décalé de `offset_mm` le long de cet axe.
   * `config` à null (ou falsy) retire le baffle.
   */
  function setBaffle(key, config) {
    removeBaffle(key);
    if (!config || !meshRoot) return;
    const { axis } = parseAxis(config.axis);
    const offset = Number.isFinite(config.offset_mm) ? config.offset_mm : 0;
    const box = new THREE.Box3().setFromObject(meshRoot);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const size = sphere.radius > 0 ? sphere.radius * 8 : 1000;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8, transparent: true, opacity: 0.18,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    // PlaneGeometry est dans le plan XY (normale +Z) : on la bascule vers l'axe.
    if (axis === 'x') plane.rotation.y = Math.PI / 2;
    else if (axis === 'y') plane.rotation.x = Math.PI / 2;
    plane.position.copy(sphere.center);
    plane.position[axis] = offset;
    scene.add(plane);
    baffles.set(key, plane);
  }

  function setBaffleVisible(key, visible) {
    const plane = baffles.get(key);
    if (plane) plane.visible = visible;
  }

  /** '+z' | '-x' | 'z' … → { axis: 'x'|'y'|'z', sign: ±1 }. */
  function parseAxis(value) {
    const raw = String(value || '+z').trim().toLowerCase();
    const axis = ['x', 'y', 'z'].includes(raw.slice(-1)) ? raw.slice(-1) : 'z';
    return { axis, sign: raw.startsWith('-') ? -1 : 1 };
  }

  function removeDiaphragm(key, rebuild = true) {
    const group = diaphragms.get(key);
    if (!group) return;
    scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    diaphragms.delete(key);
    if (rebuild) rebuildSymmetry();
  }

  /**
   * Diaphragme : on affiche le maillage réellement envoyé au solveur
   * (`config.mesh` = { nodes, tris }, en mm) plutôt qu'une surface lissée, pour
   * que ce qui est vu soit exactement ce qui est calculé. Côté 'back',
   * `capTris` (disque central fixe) est distingué en gris du cône piloté.
   * `config` à null le retire.
   */
  function setDiaphragm(key, config) {
    removeDiaphragm(key, false);
    const mesh = config?.mesh;
    if (!mesh || !mesh.tris?.length) {
      rebuildSymmetry();
      return;
    }

    const buildGeometry = (trisList) => {
      const positions = new Float32Array(trisList.length * 9);
      let o = 0;
      for (const t of trisList) {
        for (const idx of t) {
          const v = mesh.nodes[idx];
          positions[o++] = v[0]; positions[o++] = v[1]; positions[o++] = v[2];
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      return geometry;
    };

    const group = new THREE.Group();
    const coneGeometry = buildGeometry(mesh.coneTris?.length ? mesh.coneTris : mesh.tris);
    group.add(new THREE.Mesh(coneGeometry, new THREE.MeshStandardMaterial({
      color: 0xb91c1c, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05,
    })));
    group.add(new THREE.LineSegments(
      new THREE.WireframeGeometry(coneGeometry),
      new THREE.LineBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.55 })
    ));
    if (mesh.capTris?.length) {
      const capGeometry = buildGeometry(mesh.capTris);
      group.add(new THREE.Mesh(capGeometry, new THREE.MeshStandardMaterial({
        color: 0x9ca3af, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.05,
      })));
      group.add(new THREE.LineSegments(
        new THREE.WireframeGeometry(capGeometry),
        new THREE.LineBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.55 })
      ));
    }
    scene.add(group);
    diaphragms.set(key, group);
    rebuildSymmetry();
  }

  function setDiaphragmVisible(key, visible) {
    const group = diaphragms.get(key);
    if (group) {
      group.visible = visible;
      syncSymmetry();
    }
  }

  function removeField(key) {
    const group = fields.get(key);
    if (!group) return;
    scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    fields.delete(key);
  }

  /**
   * Nappe d'observation (plan ou ballon) : les sommets sont exactement les
   * points envoyés au solveur, si bien que la coloration par SPL se pose
   * sur eux sans interpolation. `config` à null retire la nappe.
   */
  function setField(key, config) {
    removeField(key);
    if (!config?.points?.length) return;

    const positions = new Float32Array(config.points.length * 3);
    config.points.forEach((p, i) => {
      positions[3 * i] = p[0]; positions[3 * i + 1] = p[1]; positions[3 * i + 2] = p[2];
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(0.55), 3));
    if (config.tris?.length) {
      geometry.setIndex(config.tris.flat());
      geometry.computeVertexNormals();
    }

    const group = new THREE.Group();
    if (config.tris?.length) {
      // Légèrement transparente : sans ça une nappe qui traverse la caisse cache
      // les parois dont on cherche justement à lire l'effet.
      group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.DoubleSide,
        transparent: true, opacity: 0.82, depthWrite: false,
      })));
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.45 })
      );
      wire.visible = config.wireframe !== false;
      group.add(wire);    } else {
      group.add(new THREE.Points(geometry, new THREE.PointsMaterial({ size: 3, vertexColors: true })));
    }
    if (config.contour?.length) {
      const cPos = new Float32Array(config.contour.length * 3);
      config.contour.forEach((p, i) => {
        cPos[3 * i] = p[0]; cPos[3 * i + 1] = p[1]; cPos[3 * i + 2] = p[2];
      });
      const cGeom = new THREE.BufferGeometry();
      cGeom.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
      const line = new THREE.LineSegments(cGeom, new THREE.LineBasicMaterial({ color: 0xffffff }));
      line.renderOrder = 2;
      line.material.depthTest = false;
      group.add(line);
    }
    group.userData.geometry = geometry;
    scene.add(group);
    fields.set(key, group);
  }

  function setFieldVisible(key, visible) {
    const group = fields.get(key);
    if (group) group.visible = visible;
  }

  /** `colors` = un triplet RGB 0-255 par point, ou null pour revenir au gris. */
  function setFieldColors(key, colors) {
    const geometry = fields.get(key)?.userData.geometry;
    const attr = geometry?.getAttribute('color');
    if (!attr) return;
    for (let i = 0; i < attr.count; i++) {
      const c = colors?.[i];
      if (c) attr.setXYZ(i, c[0] / 255, c[1] / 255, c[2] / 255);
      else attr.setXYZ(i, 0.55, 0.55, 0.55);
    }
    attr.needsUpdate = true;
  }

  // ==================================================================
  // ── PARTICULES D'AIR
  // ==================================================================
  // Les particules vivent dans l'espace PARAMÉTRIQUE (u, v) de la grille du
  // plan d'observation, pas dans le monde : l'interpolation de la vitesse et le
  // test de sortie y sont triviaux, et la position monde s'obtient par une
  // bilinéaire sur les points envoyés au solveur — donc exactement là où le
  // champ a été calculé, sans extrapolation.

  function removeFieldParticles(key) {
    const sys = particleSystems.get(key);
    if (!sys) return;
    scene.remove(sys.points);
    sys.points.geometry.dispose();
    sys.points.material.dispose();
    particleSystems.delete(key);
  }

  /**
   * Tirage d'un germe pondéré par l'énergie cinétique locale (vitesse crête²).
   * Un event fait quelques cm² sur une nappe de 2 m : un semis uniforme n'y
   * place quasiment jamais de particule, alors que c'est le seul endroit où
   * l'air se déplace vraiment. La CDF est cumulée par cellule (i, j).
   */
  function buildSeedCdf(config) {
    const { gridU, gridV, peak } = config;
    if (!peak?.length) return null;
    const cdf = new Float64Array((gridU - 1) * (gridV - 1));
    let acc = 0;
    for (let i = 0; i < gridU - 1; i++) {
      for (let j = 0; j < gridV - 1; j++) {
        const s = (peak[i * gridV + j] + peak[i * gridV + j + 1]
          + peak[(i + 1) * gridV + j] + peak[(i + 1) * gridV + j + 1]) / 4;
        // Un NaN (coin masqué par le solveur) annule la cellule : on n'y sème pas.
        acc += Number.isFinite(s) ? s * s : 0;
        cdf[i * (gridV - 1) + j] = acc;
      }
    }
    return acc > 0 ? cdf : null;
  }

  /**
   * @param {object|null} config {points (mm), gridU, gridV, vRe, vIm, peak, scale,
   *        freq, count, periodsPerSecond, vMax}
   */
  function setFieldParticles(key, config) {
    removeFieldParticles(key);
    if (!config?.points?.length || !config.vRe) return;
    const { gridU, gridV } = config;
    if (!(gridU > 1) || !(gridV > 1)) return;

    const count = Math.max(1, Math.round(config.count || 1000));
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 4, vertexColors: true, sizeAttenuation: false,
      transparent: true, opacity: 0.95, depthWrite: false,
    }));
    points.renderOrder = 3;
    scene.add(points);

    const sys = {
      points, geometry, count, config,
      seedCdf: buildSeedCdf(config),
      gu: new Float32Array(count),
      gv: new Float32Array(count),
      age: new Float32Array(count),
      life: new Float32Array(count),
      phase: 0,
    };
    for (let i = 0; i < count; i++) respawn(sys, i, true);
    particleSystems.set(key, sys);
    updateParticles(sys, 0);
  }

  function respawn(sys, i, initial) {
    // On ne sème QUE là où l'air bouge vraiment : ailleurs les particules
    // restent immobiles et couvrent toute la nappe de poussière.
    const { gridU, gridV } = sys.config;
    const cdf = sys.seedCdf;
    let gu, gv;
    if (cdf) {
      const target = Math.random() * cdf[cdf.length - 1];
      let lo = 0, hi = cdf.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < target) lo = mid + 1; else hi = mid;
      }
      gu = Math.floor(lo / (gridV - 1)) + Math.random();
      gv = (lo % (gridV - 1)) + Math.random();
    } else {
      gu = Math.random() * (gridU - 1);
      gv = Math.random() * (gridV - 1);
    }
    sys.gu[i] = gu;
    sys.gv[i] = gv;
    sys.life[i] = 1.5 + Math.random() * 2.5;              // secondes de rendu
    sys.age[i] = initial ? Math.random() * sys.life[i] : 0;
  }

  /** Bilinéaire sur la grille structurée : renvoie la position monde et la vitesse instantanée. */
  function sampleGrid(sys, gu, gv, cosW, sinW, out) {
    const { points, gridU, gridV, vRe, vIm, scale } = sys.config;
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
      // v(t) = Re(v̂)·cos(ωt) + Im(v̂)·sin(ωt)
      out.vx += (vRe[k] * cosW + vIm[k] * sinW) * scale * wc;
      out.vy += (vRe[k + 1] * cosW + vIm[k + 1] * sinW) * scale * wc;
      out.vz += (vRe[k + 2] * cosW + vIm[k + 2] * sinW) * scale * wc;
    }
    // Un coin masqué par le solveur (point collé à une paroi) contamine toute
    // la cellule : la particule y est immobile plutôt que projetée à l'infini.
    if (!Number.isFinite(out.vx) || !Number.isFinite(out.vy) || !Number.isFinite(out.vz)) {
      out.vx = out.vy = out.vz = 0;
    }
  }

  const sampleOut = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

  function updateParticles(sys, dt) {
    const { gridU, gridV, points: gp, vMax, freq } = sys.config;
    const rate = sys.config.periodsPerSecond || 1;
    // Le temps est ralenti : une période acoustique dure `1/rate` seconde à
    // l'écran, sans quoi 40 Hz défilerait 40 fois par seconde. L'AMPLITUDE du
    // va-et-vient reste elle physique (v/2πf, soit quelques centimètres dans un
    // event) — c'est tout l'intérêt de la vue.
    sys.phase = (sys.phase + dt * rate) % 1;
    const ang = 2 * Math.PI * sys.phase;
    const cosW = Math.cos(ang), sinW = -Math.sin(ang);   // Re(v̂·e^{-iωt})
    const dtPhys = dt * rate / Math.max(freq, 1e-6);

    // Pas de grille en mm : convertit une vitesse monde en vitesse paramétrique.
    const p00 = gp[0], p10 = gp[gridV], p01 = gp[1];
    const du = [p10[0] - p00[0], p10[1] - p00[1], p10[2] - p00[2]];
    const dv = [p01[0] - p00[0], p01[1] - p00[1], p01[2] - p00[2]];
    const duLen2 = du[0] * du[0] + du[1] * du[1] + du[2] * du[2];
    const dvLen2 = dv[0] * dv[0] + dv[1] * dv[1] + dv[2] * dv[2];

    const pos = sys.geometry.getAttribute('position');
    const col = sys.geometry.getAttribute('color');
    for (let i = 0; i < sys.count; i++) {
      sys.age[i] += dt;
      if (sys.age[i] > sys.life[i]) respawn(sys, i, false);

      sampleGrid(sys, sys.gu[i], sys.gv[i], cosW, sinW, sampleOut);
      // ×1000 : les points du viewer sont en mm, la vitesse en m/s.
      const kU = duLen2 > 0 ? 1000 * (sampleOut.vx * du[0] + sampleOut.vy * du[1] + sampleOut.vz * du[2]) / duLen2 : 0;
      const kV = dvLen2 > 0 ? 1000 * (sampleOut.vx * dv[0] + sampleOut.vy * dv[1] + sampleOut.vz * dv[2]) / dvLen2 : 0;
      sys.gu[i] += kU * dtPhys;
      sys.gv[i] += kV * dtPhys;
      if (sys.gu[i] < 0 || sys.gu[i] > gridU - 1 || sys.gv[i] < 0 || sys.gv[i] > gridV - 1) {
        respawn(sys, i, false);
        sampleGrid(sys, sys.gu[i], sys.gv[i], cosW, sinW, sampleOut);
      }

      pos.setXYZ(i, sampleOut.x, sampleOut.y, sampleOut.z);
      const speed = Math.hypot(sampleOut.vx, sampleOut.vy, sampleOut.vz);
      const t = Math.min(1, speed / Math.max(vMax || 1, 1e-9));
      // Sombre et bleu au repos, blanc-rouge dans le jet : l'œil suit le débit.
      const fade = Math.min(1, (sys.life[i] - sys.age[i]) * 2, sys.age[i] * 2);
      col.setXYZ(i, (0.15 + 0.85 * t) * fade, (0.35 + 0.25 * t) * fade, (0.9 - 0.6 * t) * fade);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  function setFieldParticlesVisible(key, visible) {
    const sys = particleSystems.get(key);
    if (sys) sys.points.visible = visible;
  }

  // Surcouches filaires d'une nappe (lignes de courant, iso-vitesses) : de
  // simples segments déjà exprimés en monde, dessinés PAR-DESSUS la carte de
  // couleurs (depthTest coupé, sinon le z-fighting avec la nappe les hache).

  function removeFieldOverlay(key) {
    const line = fieldOverlays.get(key);
    if (!line) return;
    scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
    fieldOverlays.delete(key);
  }

  /** @param {object|null} config {positions: Float32Array, colors?: Float32Array, opacity?} */
  function setFieldOverlay(key, config) {
    removeFieldOverlay(key);
    if (!config?.positions?.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(config.positions, 3));
    if (config.colors?.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(config.colors, 3));
    const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      vertexColors: !!config.colors?.length,
      color: config.colors?.length ? 0xffffff : (config.color ?? 0x000000),
      transparent: config.opacity != null && config.opacity < 1,
      opacity: config.opacity ?? 1,
      depthTest: false,
    }));
    line.renderOrder = 4;
    scene.add(line);
    fieldOverlays.set(key, line);
  }

  function setFieldOverlayVisible(key, visible) {
    const line = fieldOverlays.get(key);
    if (line) line.visible = visible;
  }


  /** Sommets triangulaires bruts du maillage importé (triplets XYZ, en mm). */
  function getMeshVertices() {
    const out = [];
    entities.forEach(ent => {
      const pos = ent.mesh.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    });
    return out;
  }

  /** Arête médiane du maillage importé, en mm — taille d'élément de référence. */
  function getMedianEdgeLength() {
    const lengths = [];
    entities.forEach(ent => {
      const pos = ent.mesh.geometry.getAttribute('position');
      for (let v = 0; v + 2 < pos.count; v += 3) {
        for (let k = 0; k < 3; k++) {
          const a = v + k, b = v + ((k + 1) % 3);
          lengths.push(Math.hypot(
            pos.getX(a) - pos.getX(b), pos.getY(a) - pos.getY(b), pos.getZ(a) - pos.getZ(b)
          ));
        }
      }
    });
    if (!lengths.length) return 0;
    lengths.sort((a, b) => a - b);
    return lengths[Math.floor(lengths.length / 2)];
  }

  /** Shows or hides every entity belonging to the surface (mesh + wireframe). */
  function setSurfaceVisible(surfaceId, visible) {
    const surface = surfaces.get(surfaceId);
    if (!surface) return;
    surface.entityIndices.forEach(i => {
      const ent = entities[i];
      if (!ent) return;
      ent.mesh.visible = visible;
      ent.wire.visible = visible;
    });
    syncSymmetry();
  }

  function setAllSurfacesVisibleExcept(visible, excludedSurfaceIds = []) {
    const excludedEntities = new Set();
    excludedSurfaceIds.forEach(surfaceId => {
      surfaces.get(surfaceId)?.entityIndices.forEach(index => excludedEntities.add(index));
    });
    entities.forEach((ent, index) => {
      if (excludedEntities.has(index)) return;
      ent.mesh.visible = visible;
      ent.wire.visible = visible;
    });
    syncSymmetry();
  }

  function setSymmetry(mode) {
    symmetryMode = ['h', 'v', 'hv'].includes(mode) ? mode : 'none';
    rebuildSymmetry();
  }

  function setSymmetryVisible(visible) {
    symmetryVisible = visible;
    if (symmetryRoot) symmetryRoot.visible = visible;
  }

  /** Reverses the winding order of every triangle of the surface, flipping its normals. */
  function flipSurfaceNormal(surfaceId) {
    const surface = surfaces.get(surfaceId);
    if (!surface) return;
    surface.entityIndices.forEach(i => {
      const ent = entities[i];
      if (!ent) return;
      const posAttr = ent.mesh.geometry.getAttribute('position');
      for (let v = 0; v < posAttr.count; v += 3) {
        // Swap vertices 2 and 3 of the triangle to reverse its winding order.
        const x1 = posAttr.getX(v + 1), y1 = posAttr.getY(v + 1), z1 = posAttr.getZ(v + 1);
        const x2 = posAttr.getX(v + 2), y2 = posAttr.getY(v + 2), z2 = posAttr.getZ(v + 2);
        posAttr.setXYZ(v + 1, x2, y2, z2);
        posAttr.setXYZ(v + 2, x1, y1, z1);
      }
      posAttr.needsUpdate = true;
      ent.mesh.geometry.computeVertexNormals();
    });
    // Les miroirs dérivent du winding d'origine : il faut les régénérer.
    rebuildSymmetry();
  }

  function clearSelection() {
    if (!selection.size) return;
    selection.clear();
    refreshSelectionHighlight();
  }

  /** Paints a surface according to its BEM role; pass null to restore the default grey. */
  function setSurfaceColor(surfaceId, colorHex) {
    if (colorHex == null) baseColors.delete(surfaceId);
    else baseColors.set(surfaceId, colorHex);
    refreshSelectionHighlight();
  }

  function dispose() {
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    clear();
    controls.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  return { loadMeshFromText, clear, dispose, getSurfaces, flipSurfaceNormal, setSurfaceVisible, setAllSurfacesVisibleExcept, clearSelection, setSurfaceColor, setSymmetry, setSymmetryVisible, setBaffle, setBaffleVisible, setDiaphragm, setDiaphragmVisible, setField, setFieldVisible, setFieldColors, setFieldParticles, setFieldParticlesVisible, setFieldOverlay, setFieldOverlayVisible, getMeshVertices, getMedianEdgeLength };
}
