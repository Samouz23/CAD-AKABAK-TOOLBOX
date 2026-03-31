// =======================================================
// FICHIER :  src/js/popup/mesh/meshPreviewPopup.js
// RÔLE    :  Popup 3D preview for physical grouping + export
// =======================================================

import { initializeWindowControls, getWindowControlsStyles, getWindowControlsHtml } from '../common/windowControls.js';
import * as THREE from '../../lib/three.module.js';
import { OrbitControls } from '../../lib/OrbitControls.js';

const SURFACE_COLORS = [
  0x00e676, 0xffea00, 0x2979ff, 0xff1744,
  0xd500f9, 0xff9100, 0x00e5ff, 0xff6d00,
  0x76ff03, 0xf50057, 0x00b0ff, 0xc6ff00,
  0x651fff, 0xff3d00, 0x1de9b6, 0xff4081,
  0x00bfa5, 0xffd740, 0x536dfe, 0xef5350,
];
const INTERFACE_COLOR = 0xffffff;

export function getMeshPreviewPopupHtml() {
  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Physical Preview')}
    <div style="display:flex; flex-direction:column; height:calc(100vh - 38px); overflow:hidden; background:#0f172a;">
      <div id="preview-canvas-container" style="flex:1; min-height:200px; background:#111827; position:relative;">
        <div id="preview-loading" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#9ca3af;">
          Loading...
        </div>
      </div>

      <div style="flex-shrink:0; max-height:52%; display:flex; flex-direction:column; border-top:1px solid #374151; background:#111827;">
        <div style="padding:8px 12px; display:flex; justify-content:space-between; align-items:center; gap:12px; border-bottom:1px solid #374151;">
          <span class="text-sm font-semibold text-white">Surface Parameters</span>
          <div id="surface-summary" class="text-xs text-gray-400"></div>
        </div>

        <div style="padding:8px 12px; border-bottom:1px solid #374151; display:flex; gap:10px; align-items:center;">
          <button id="mirror-options-btn" class="action-btn btn--secondary" style="height:34px; min-width:120px;">Mirror</button>
          <div id="mirror-options-panel" class="hidden" style="display:flex; align-items:center; gap:8px;">
            <label for="preview-symmetry-mirror-select" class="text-xs text-gray-300">Symmetry Mirror</label>
            <select id="preview-symmetry-mirror-select" class="form-input" style="width:auto; min-width:120px; height:30px; font-size:12px;">
              <option value="none" selected>None</option>
              <option value="H">H (Top Plane)</option>
              <option value="V">V (Right Plane)</option>
            </select>
          </div>
          <span class="text-xs text-gray-400">Double-click in 3D to focus a surface</span>
        </div>

        <div id="surface-table-container" style="flex:1; min-height:150px; overflow-y:auto; padding:0 8px 6px 8px; background:#0f172a;"></div>

        <div style="padding:8px 12px; background:#111827; border-top:1px solid #374151; display:flex; gap:8px; align-items:center;">
          <button id="reset-btn" class="action-btn btn--secondary" style="height:38px; min-width:100px; font-size:13px; font-weight:600; border:1px solid #475569;">Reset</button>
          <button id="remesh-btn" class="action-btn btn--secondary" style="height:38px; min-width:140px; font-size:14px; font-weight:700;">Remesh</button>
          <button id="export-btn" class="action-btn btn--primary" style="height:38px; min-width:140px; font-size:14px; font-weight:700;">Export</button>
          <span id="export-status" class="text-sm" style="flex:1; text-align:right;"></span>
        </div>
      </div>
    </div>
    ${getPreviewStyles()}
  `;
}

function getPreviewStyles() {
  return `
    <style>
      #surface-table-container {
        display: flex;
        flex-direction: column;
      }
      .surface-table-header {
        display: grid;
        grid-template-columns: var(--surface-grid-template);
        gap: 8px;
        padding: 6px 12px;
        border-bottom: 1px solid #374151;
        position: sticky;
        top: 0;
        z-index: 10;
        background: #1f2937;
        font-size: 11px;
        color: #9ca3af;
        font-weight: 600;
      }
      .surface-table-header > div {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .surface-table-row {
        display: grid;
        grid-template-columns: var(--surface-grid-template);
        gap: 8px;
        padding: 8px 12px;
        border-bottom: 1px solid #1f2937;
        align-items: center;
      }
      .surface-table-row:hover {
        background: rgba(56, 189, 248, 0.05);
      }
      .surface-table-row.selected {
        background: rgba(236, 72, 153, 0.12);
        border-left: 2px solid #ec4899;
      }
      .surface-table-row .col-name {
        font-size: 13px;
        font-weight: 600;
        color: #e5e7eb;
        cursor: pointer;
        white-space: nowrap;
        width: 100%;
      }
      .surface-table-row .col-name:hover {
        color: #7dd3fc;
      }
      .surface-table-row input[type="number"] {
        height: 28px;
        font-size: 12px;
        padding: 4px 6px;
      }
      .surface-table-row .col-status {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(125, 211, 252, 0.12);
        color: #bae6fd;
        text-align: center;
        cursor: pointer;
        border: 1px solid rgba(125, 211, 252, 0.35);
      }
    </style>
  `;
}

export function initializeMeshPreviewPopup() {
  initializeWindowControls();

  const canvasContainer = document.getElementById('preview-canvas-container');
  const loadingEl = document.getElementById('preview-loading');
  const surfaceTableContainer = document.getElementById('surface-table-container');
  const mirrorOptionsBtn = document.getElementById('mirror-options-btn');
  const mirrorOptionsPanel = document.getElementById('mirror-options-panel');
  const previewSymmetryMirrorSelect = document.getElementById('preview-symmetry-mirror-select');
  const resetBtn = document.getElementById('reset-btn');
  const remeshBtn = document.getElementById('remesh-btn');
  const exportBtn = document.getElementById('export-btn');
  const exportStatus = document.getElementById('export-status');
  const summaryEl = document.getElementById('surface-summary');

  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let animId = null;
  let previewData = null;
  let resizeObserver = null;
  let nextGroupId = 1;
  let surfaceMeshes = [];
  let groups = [];
  let selectedSurfaceIndex = -1;
  let previewDirty = false;
  let currentPreviewMshPath = null;
  let mirrorAxis = 'none';

  function getGroupById(groupId) {
    return groups.find(group => group.id === groupId) || null;
  }

  function isMirrorEnabled() {
    return mirrorAxis === 'H' || mirrorAxis === 'V';
  }

  function getSurfaceByTag(tag) {
    return surfaceMeshes.find(surface => surface.tag === tag) || null;
  }

  function getGroupSurfaceIndices(group) {
    return group.surfaceTags
      .map(tag => surfaceMeshes.findIndex(surface => surface.tag === tag))
      .filter(index => index >= 0)
      .sort((a, b) => a - b);
  }

  function sortGroups() {
    groups.sort((left, right) => {
      const leftIndex = getGroupSurfaceIndices(left)[0] ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = getGroupSurfaceIndices(right)[0] ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
  }

  function renumberGroups() {
    sortGroups();
    let index = 1;

    groups.forEach(group => {
      group.name = `S${index++}`;
    });

    renderSurfaceTable();
    refreshAllSurfaceVisuals();
    updateSummary();
  }

  function updateSummary() {
    const mirrorMergedCount = surfaceMeshes.filter(surface => surface.mergeAtSymmetry).length;
    summaryEl.textContent = isMirrorEnabled()
      ? `${surfaceMeshes.length} surfaces, ${mirrorMergedCount} merged on symmetry`
      : `${surfaceMeshes.length} surfaces`;
  }

  function updateActionButtons() {
    remeshBtn.disabled = !previewData;
    exportBtn.disabled = !previewData || previewDirty;
    exportBtn.textContent = previewDirty ? 'Export (Remesh required)' : 'Export';
  }

  function markPreviewDirty() {
    previewDirty = true;
    exportStatus.textContent = 'Preview changed. Click Remesh before Export.';
    exportStatus.style.color = '#fbbf24';
    updateActionButtons();
    saveStateToMain();
  }

  function markPreviewClean(message) {
    previewDirty = false;
    if (message) {
      exportStatus.textContent = message;
      exportStatus.style.color = '#4ade80';
    }
    updateActionButtons();
    saveStateToMain();
  }

  function getSurfaceBaseColor(index) {
    return SURFACE_COLORS[index % SURFACE_COLORS.length];
  }

  function refreshSurfaceVisual(surfaceIndex) {
    const surface = surfaceMeshes[surfaceIndex];
    if (!surface) return;

    const baseColor = getSurfaceBaseColor(surfaceIndex);
    const material = surface.mesh.material;

    material.transparent = true;
    material.color.setHex(baseColor);
    material.opacity = selectedSurfaceIndex === surfaceIndex ? 0.92 : 1;
    material.emissive.setHex(selectedSurfaceIndex === surfaceIndex ? 0xec4899 : 0x000000);
    material.emissiveIntensity = selectedSurfaceIndex === surfaceIndex ? 0.22 : 0;
  }

  function refreshAllSurfaceVisuals() {
    surfaceMeshes.forEach((_, index) => refreshSurfaceVisual(index));
  }

  function createInitialGroups(surfaces) {
    return surfaces.map(surface => ({
      id: nextGroupId++,
      name: '',
      isInterface: false,
      meshSize: Number(previewData.defaultMeshSize) || 50,
      curveMeshSize: Number(previewData.defaultCurveMeshSize) || Number(previewData.defaultMeshSize) || 50,
      surfaceTags: [surface.tag],
    }));
  }

  function initializeState(surfaces) {
    const previousStateMap = new Map(surfaceMeshes.map(surface => [surface.label, {
      mergeAtSymmetry: Boolean(surface.mergeAtSymmetry),
      meshSize: surface.meshSize,
      curveMeshSize: surface.curveMeshSize,
    }]));

    const defaultMeshSize = Number(previewData.defaultMeshSize) || 50;
    const defaultCurveMeshSize = Number(previewData.defaultCurveMeshSize) || defaultMeshSize;

    groups = createInitialGroups(surfaces);
    surfaceMeshes = surfaces.map((surface, index) => {
      const label = `S${index + 1}`;
      const prev = previousStateMap.get(label);
      return {
        tag: surface.tag,
        surfaceIndex: index,
        label,
        triangleCount: surface.triangleCount,
        mesh: surface.mesh,
        groupId: groups[index].id,
        meshSize: prev?.meshSize ?? defaultMeshSize,
        curveMeshSize: prev?.curveMeshSize ?? defaultCurveMeshSize,
        mergeAtSymmetry: prev?.mergeAtSymmetry ?? false,
      };
    });

    syncMirrorInterfacesFromSurface();
    renumberGroups();
  }

  function syncMirrorInterfacesFromSurface() {
    groups.forEach(group => {
      const surface = getSurfaceByTag(group.surfaceTags[0]);
      group.isInterface = isMirrorEnabled() && Boolean(surface?.mergeAtSymmetry);
    });
    refreshAllSurfaceVisuals();
    updateSummary();
  }

  function renderSurfaceTable() {
    surfaceTableContainer.innerHTML = '';
    surfaceTableContainer.style.setProperty('--surface-grid-template', isMirrorEnabled() ? '120px 150px 150px 120px' : '120px 150px 150px');

    // Header
    const header = document.createElement('div');
    header.className = 'surface-table-header';
    header.innerHTML = `
      <div>Surface</div>
      <div>Mesh Size</div>
      <div>Curve Size</div>
      ${isMirrorEnabled() ? '<div>Merged</div>' : ''}
    `;
    surfaceTableContainer.appendChild(header);

    // Rows
    surfaceMeshes.forEach((surface, index) => {
      const group = getGroupById(surface.groupId);
      const row = document.createElement('div');
      row.className = `surface-table-row${selectedSurfaceIndex === index ? ' selected' : ''}`;
      row.dataset.surfaceIndex = String(index);

      const colorHex = '#' + getSurfaceBaseColor(index).toString(16).padStart(6, '0');
      const meshSize = String(surface.meshSize || 50);
      const curveSize = String(surface.curveMeshSize || 50);
      const mergedLabel = surface.mergeAtSymmetry ? 'Yes' : 'No';

      row.innerHTML = `
        <div class="col-name" data-surface-index="${index}" style="background:${colorHex}; display:flex; align-items:center; gap:6px; padding:0 6px; border-radius:4px;">
          <span style="color:white;">${surface.label}</span>
        </div>
        <input type="number" min="0.01" step="0.01" class="mesh-size-input" data-surface-index="${index}" value="${meshSize}">
        <input type="number" min="0.01" step="0.01" class="curve-size-input" data-surface-index="${index}" value="${curveSize}">
        ${isMirrorEnabled() ? `<div class="col-status mirror-merge-toggle" data-surface-index="${index}">${mergedLabel}</div>` : ''}
      `;

      surfaceTableContainer.appendChild(row);
    });
  }

  function selectSurface(index) {
    selectedSurfaceIndex = index;
    renderSurfaceTable();
    refreshAllSurfaceVisuals();
  }

  function toggleSurfaceMirrorMerge(surfaceIndex) {
    const surface = surfaceMeshes[surfaceIndex];
    if (!surface || !isMirrorEnabled()) return;
    surface.mergeAtSymmetry = !surface.mergeAtSymmetry;
    syncMirrorInterfacesFromSurface();
    renderSurfaceTable();
    markPreviewDirty();
  }

  function toggleGroupInterface(groupId) {
    const group = getGroupById(groupId);
    if (!group) return;
    group.isInterface = !group.isInterface;
    renumberGroups();
  }

  function buildPhysicalConfig() {
    const defaultMeshSize = Number(previewData.defaultMeshSize) || 50;
    const defaultCurveMeshSize = Number(previewData.defaultCurveMeshSize) || defaultMeshSize;

    return {
      gmshPath: previewData.gmshPath,
      sourceFilePath: previewData.sourceFilePath,
      defaultMeshSize,
      defaultCurveMeshSize,
      groups: groups.map(group => ({
        name: group.name,
        isInterface: (() => {
          const surface = getSurfaceByTag(group.surfaceTags[0]);
          return isMirrorEnabled() && Boolean(surface?.mergeAtSymmetry);
        })(),
        meshSize: (() => {
          const values = group.surfaceTags
            .map(tag => getSurfaceByTag(tag)?.meshSize)
            .map(Number)
            .filter(value => Number.isFinite(value) && value > 0);
          return values.length > 0 ? Math.min(...values) : defaultMeshSize;
        })(),
        curveMeshSize: (() => {
          const values = group.surfaceTags
            .map(tag => getSurfaceByTag(tag)?.curveMeshSize)
            .map(Number)
            .filter(value => Number.isFinite(value) && value > 0);
          return values.length > 0 ? Math.min(...values) : defaultCurveMeshSize;
        })(),
        shellIndices: group.surfaceTags
          .map(tag => {
            const surface = getSurfaceByTag(tag);
            return surface ? surface.surfaceIndex : -1;
          })
          .filter(index => index >= 0),
      })),
    };
  }

  function focusSurfaceRow(surfaceIndex) {
    const row = surfaceTableContainer.querySelector(`.surface-table-row[data-surface-index="${surfaceIndex}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const meshInput = row.querySelector('.mesh-size-input');
    if (meshInput instanceof HTMLInputElement) {
      window.setTimeout(() => {
        meshInput.focus();
        meshInput.select();
      }, 120);
    }
  }

  function focusCameraOnSurface(surfaceIndex) {
    const surface = surfaceMeshes[surfaceIndex];
    if (!surface || !camera || !controls) return;

    const bounds = new THREE.Box3().setFromObject(surface.mesh);
    const center = new THREE.Vector3();
    bounds.getCenter(center);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    controls.target.copy(center);
    camera.position.copy(center.clone().add(new THREE.Vector3(maxDim * 1.6, maxDim * 1.1, maxDim * 1.6)));
    controls.update();
  }

  function disposePreviewScene() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (scene) {
      scene.traverse(object => {
        if (object.geometry) {
          object.geometry.dispose?.();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose?.());
          } else {
            object.material.dispose?.();
          }
        }
      });
    }
    controls?.dispose?.();
    renderer?.dispose?.();
    if (renderer?.domElement?.parentNode === canvasContainer) {
      canvasContainer.removeChild(renderer.domElement);
    }
    scene = null;
    camera = null;
    controls = null;
    renderer = null;
  }

  function buildScene(surfaces, { skipStateInit = false } = {}) {
    disposePreviewScene();

    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);

    camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 10000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    canvasContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(1, 2, 3);
    scene.add(directionalLight);

    const globalBox = new THREE.Box3();
    const sceneSurfaces = [];
    const configCount = skipStateInit ? surfaceMeshes.length : surfaces.length;

    surfaces.forEach((surface, index) => {
      const geometry = new THREE.BufferGeometry();
      const vertices = new Float32Array(surface.triangles.length * 9);
      for (let triangleIndex = 0; triangleIndex < surface.triangles.length; triangleIndex++) {
        const triangle = surface.triangles[triangleIndex];
        const offset = triangleIndex * 9;
        vertices[offset] = triangle.v0[0];
        vertices[offset + 1] = triangle.v0[1];
        vertices[offset + 2] = triangle.v0[2];
        vertices[offset + 3] = triangle.v1[0];
        vertices[offset + 4] = triangle.v1[1];
        vertices[offset + 5] = triangle.v1[2];
        vertices[offset + 6] = triangle.v2[0];
        vertices[offset + 7] = triangle.v2[1];
        vertices[offset + 8] = triangle.v2[2];
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();

      const isExtraMirrorSurface = index >= configCount;
      const material = new THREE.MeshPhongMaterial({
        color: isExtraMirrorSurface ? 0x607080 : getSurfaceBaseColor(index),
        side: THREE.DoubleSide,
        flatShading: true,
        opacity: isExtraMirrorSurface ? 0.7 : 1,
        transparent: isExtraMirrorSurface,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      globalBox.expandByObject(mesh);

      const wireframe = new THREE.LineSegments(
        new THREE.WireframeGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.16, transparent: true })
      );
      mesh.add(wireframe);

      sceneSurfaces.push({ ...surface, mesh });
    });

    if (skipStateInit) {
      sceneSurfaces.forEach((surface, index) => {
        if (index < surfaceMeshes.length) {
          surfaceMeshes[index].mesh = surface.mesh;
        }
      });
      refreshAllSurfaceVisuals();
    } else {
      initializeState(sceneSurfaces);
    }

    const center = new THREE.Vector3();
    globalBox.getCenter(center);
    const size = new THREE.Vector3();
    globalBox.getSize(size);
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    camera.position.copy(center.clone().add(new THREE.Vector3(maxDimension, maxDimension * 0.7, maxDimension * 1.2)));
    controls.target.copy(center);
    controls.update();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    renderer.domElement.addEventListener('dblclick', event => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(surfaceMeshes.map(surface => surface.mesh), false);
      if (intersects.length === 0) return;

      const hitIndex = surfaceMeshes.findIndex(surface => surface.mesh === intersects[0].object);
      if (hitIndex < 0) return;

      selectSurface(hitIndex);
      focusCameraOnSurface(hitIndex);
      focusSurfaceRow(hitIndex);
    });

    resizeObserver = new ResizeObserver(() => {
      const nextWidth = canvasContainer.clientWidth;
      const nextHeight = canvasContainer.clientHeight;
      if (nextWidth <= 0 || nextHeight <= 0) return;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(canvasContainer);

    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    animate();
  }

  function updateSurfaceSize(target) {
    if (!(target instanceof HTMLInputElement)) return;

    if (target.classList.contains('mesh-size-input')) {
      const surfaceIndex = Number(target.dataset.surfaceIndex);
      const surface = surfaceMeshes[surfaceIndex];
      if (!surface) return;
      const value = Number(target.value);
      if (Number.isFinite(value) && value > 0) {
        surface.meshSize = value;
        markPreviewDirty();
      }
      return;
    }

    if (target.classList.contains('curve-size-input')) {
      const surfaceIndex = Number(target.dataset.surfaceIndex);
      const surface = surfaceMeshes[surfaceIndex];
      if (!surface) return;
      const value = Number(target.value);
      if (Number.isFinite(value) && value > 0) {
        surface.curveMeshSize = value;
        markPreviewDirty();
      }
    }
  }

  async function loadPreviewFromMsh(mshPath, { skipStateInit = false } = {}) {
    const parseResult = await window.electronAPI.parseMshPreview(mshPath);
    if (!parseResult.success || !parseResult.surfaces || parseResult.surfaces.length === 0) {
      loadingEl.textContent = 'No physical surfaces found in mesh file.';
      loadingEl.style.color = '#f87171';
      return false;
    }

    loadingEl.style.display = 'none';
    buildScene(parseResult.surfaces, { skipStateInit });
    return true;
  }

  surfaceTableContainer.addEventListener('input', event => {
    updateSurfaceSize(event.target);
  });

  surfaceTableContainer.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    updateSurfaceSize(target);
  });

  surfaceTableContainer.addEventListener('click', event => {
    const target = event.target;
    // Support click on the div itself OR the span child inside col-name
    const nameEl = target.classList.contains('col-name')
      ? target
      : target.closest?.('.col-name');
    if (nameEl) {
      const surfaceIndex = Number(nameEl.dataset.surfaceIndex);
      if (!isNaN(surfaceIndex)) {
        selectSurface(surfaceIndex);
        focusCameraOnSurface(surfaceIndex);
        focusSurfaceRow(surfaceIndex);
      }
      return;
    }

    const mergeToggle = target.classList.contains('mirror-merge-toggle')
      ? target
      : target.closest?.('.mirror-merge-toggle');
    if (mergeToggle) {
      const surfaceIndex = Number(mergeToggle.dataset.surfaceIndex);
      if (!isNaN(surfaceIndex)) {
        toggleSurfaceMirrorMerge(surfaceIndex);
      }
    }
  });

  mirrorOptionsBtn.addEventListener('click', () => {
    mirrorOptionsPanel.classList.toggle('hidden');
  });

  previewSymmetryMirrorSelect.addEventListener('change', () => {
    mirrorAxis = previewSymmetryMirrorSelect.value;
    syncMirrorInterfacesFromSurface();
    renderSurfaceTable();
    markPreviewDirty();
  });

  resetBtn.addEventListener('click', async () => {
    if (!previewData) return;

    resetBtn.disabled = true;
    remeshBtn.disabled = true;
    exportBtn.disabled = true;
    exportStatus.textContent = 'Resetting...';
    exportStatus.style.color = '#fbbf24';

    // Clear all state so initializeState starts fresh
    surfaceMeshes = [];
    groups = [];
    selectedSurfaceIndex = -1;
    mirrorAxis = 'none';
    previewSymmetryMirrorSelect.value = 'none';
    mirrorOptionsPanel.classList.add('hidden');

    // Rebuild from original STEP source with default parameters
    const defaultMeshSize = Number(previewData.defaultMeshSize) || 50;
    const defaultCurveMeshSize = Number(previewData.defaultCurveMeshSize) || defaultMeshSize;

    const result = await window.electronAPI.remeshPreview({
      mshPath: previewData.mshPath,
      mirror: null,
      physicalConfig: {
        gmshPath: previewData.gmshPath,
        sourceFilePath: previewData.sourceFilePath,
        defaultMeshSize,
        defaultCurveMeshSize,
        groups: [],
      },
    });

    resetBtn.disabled = false;

    if (!result.success) {
      exportStatus.textContent = 'Reset error: ' + (result.error || 'failed');
      exportStatus.style.color = '#f87171';
      updateActionButtons();
      return;
    }

    currentPreviewMshPath = result.mshPath || previewData.mshPath;
    const loaded = await loadPreviewFromMsh(currentPreviewMshPath);

    if (!loaded) {
      updateActionButtons();
      return;
    }

    markPreviewClean('Reset to original.');
  });

  remeshBtn.addEventListener('click', async () => {
    if (!previewData) return;

    remeshBtn.disabled = true;
    exportBtn.disabled = true;
    remeshBtn.textContent = isMirrorEnabled() ? 'Remeshing + Mirror...' : 'Remeshing...';
    exportStatus.textContent = '';
    exportStatus.style.color = '';

    const mirrorArgs = isMirrorEnabled() ? {
      axis: mirrorAxis,
      interfaceTags: [],
    } : null;

    const result = await window.electronAPI.remeshPreview({
      mshPath: currentPreviewMshPath || previewData.mshPath,
      mirror: mirrorArgs,
      physicalConfig: buildPhysicalConfig(),
    });

    if (!result.success) {
      exportStatus.textContent = 'Error: ' + (result.error || 'Remesh failed');
      exportStatus.style.color = '#f87171';
      remeshBtn.disabled = false;
      remeshBtn.textContent = 'Remesh';
      updateActionButtons();
      return;
    }

    currentPreviewMshPath = result.mshPath || currentPreviewMshPath || previewData.mshPath;

    const loaded = await loadPreviewFromMsh(currentPreviewMshPath, { skipStateInit: true });

    remeshBtn.disabled = false;
    remeshBtn.textContent = 'Remesh';

    if (!loaded) {
      updateActionButtons();
      return;
    }

    markPreviewClean('Preview remeshed successfully.');
  });

  exportBtn.addEventListener('click', async () => {
    if (!previewData || previewDirty) return;

    exportBtn.disabled = true;
    exportBtn.textContent = 'Exporting...';
    exportStatus.textContent = '';
    exportStatus.style.color = '';

    const result = await window.electronAPI.exportMesh({
      mshPath: currentPreviewMshPath || previewData.mshPath,
      destPath: previewData.destPath,
    });

    if (result.success) {
      exportStatus.textContent = result.message;
      exportStatus.style.color = '#4ade80';
      exportBtn.textContent = 'Exported';
      exportBtn.disabled = false;
      return;
    }

    exportStatus.textContent = 'Error: ' + (result.error || 'Export failed');
    exportStatus.style.color = '#f87171';
    exportBtn.disabled = false;
    exportBtn.textContent = 'Export';
  });

  function collectState() {
    return {
      mirrorAxis,
      surfaceParams: surfaceMeshes.map(surface => ({
        label: surface.label,
        meshSize: surface.meshSize,
        curveMeshSize: surface.curveMeshSize,
        mergeAtSymmetry: surface.mergeAtSymmetry,
      })),
      currentMshPath: currentPreviewMshPath,
    };
  }

  function saveStateToMain() {
    window.electronAPI.savePreviewState(collectState());
  }

  function applyRestoredState(saved) {
    if (!saved) return;
    mirrorAxis = saved.mirrorAxis || 'none';
    previewSymmetryMirrorSelect.value = mirrorAxis;
    if (mirrorAxis !== 'none') {
      mirrorOptionsPanel.classList.remove('hidden');
    }

    if (Array.isArray(saved.surfaceParams)) {
      saved.surfaceParams.forEach(param => {
        const surface = surfaceMeshes.find(s => s.label === param.label);
        if (surface) {
          surface.meshSize = param.meshSize;
          surface.curveMeshSize = param.curveMeshSize;
          surface.mergeAtSymmetry = Boolean(param.mergeAtSymmetry);
        }
      });
    }

    syncMirrorInterfacesFromSurface();
    renderSurfaceTable();
  }

  async function init() {
    previewData = await window.electronAPI.getMeshPreviewData();
    if (!previewData || !previewData.mshPath) {
      loadingEl.textContent = 'Error: No mesh data received.';
      loadingEl.style.color = '#f87171';
      updateActionButtons();
      return;
    }

    currentPreviewMshPath = previewData.mshPath;
    mirrorAxis = previewData.axis || 'none';
    previewSymmetryMirrorSelect.value = mirrorAxis;

    const loaded = await loadPreviewFromMsh(currentPreviewMshPath);
    if (!loaded) {
      updateActionButtons();
      return;
    }

    // Restore saved state if available (reopen scenario)
    if (previewData.savedState) {
      applyRestoredState(previewData.savedState);
    }

    markPreviewClean('Preview ready.');
  }

  async function reloadWithNewData(data) {
    // Save nothing — we start from the new STEP build but keep old params
    const savedState = collectState();
    previewData = data;
    currentPreviewMshPath = data.mshPath;

    surfaceMeshes = [];
    selectedSurfaceIndex = -1;

    const loaded = await loadPreviewFromMsh(currentPreviewMshPath);
    if (!loaded) {
      updateActionButtons();
      return;
    }

    applyRestoredState(savedState);
    markPreviewDirty();
    exportStatus.textContent = 'Reloaded with new source. Remesh to apply.';
    exportStatus.style.color = '#38bdf8';
  }

  window.electronAPI.onReloadPreview((data) => {
    reloadWithNewData(data);
  });

  window.addEventListener('beforeunload', () => {
    saveStateToMain();
    disposePreviewScene();
  });

  updateActionButtons();
  init();
}