// =======================================================
// scripts/lib/tbbs_config.mjs
//
// Rejoue hors Electron ce que fait `buildBemSolverConfig()` du panneau BEM :
// arbre .TBBS → configuration solveur (sous-domaines, interfaces, diaphragmes
// maillés). Partagé par les harnais pour qu'ils ne divergent pas de l'appli.
// =======================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const { buildDiaphragmMesh } = new Function(
  `${readFileSync(join(root, 'src/js/panels/bemsolver/diaphragmMesh.js'), 'utf8').replace(/^export function/gm, 'function')}
   return { buildDiaphragmMesh };`
)();

export function hostVerticesFromMsh(text) {
  const block = text.split('$Nodes')[1].split('$EndNodes')[0].trim().split('\n').slice(1);
  const out = [];
  for (const line of block) {
    const p = line.trim().split(/\s+/).map(Number);
    out.push(p[1], p[2], p[3]);
  }
  return out;
}

export function medianEdgeFromMsh(text) {
  const nodes = new Map();
  for (const line of text.split('$Nodes')[1].split('$EndNodes')[0].trim().split('\n').slice(1)) {
    const p = line.trim().split(/\s+/).map(Number);
    nodes.set(p[0], [p[1], p[2], p[3]]);
  }
  const lens = [];
  for (const line of text.split('$Elements')[1].split('$EndElements')[0].trim().split('\n').slice(1)) {
    const f = line.trim().split(/\s+/).map(Number);
    if (f[1] !== 2) continue;
    const off = 3 + f[2];
    const v = [nodes.get(f[off]), nodes.get(f[off + 1]), nodes.get(f[off + 2])];
    if (!v[0] || !v[1] || !v[2]) continue;
    for (let i = 0; i < 3; i++) {
      const a = v[i], b = v[(i + 1) % 3];
      lens.push(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
  }
  lens.sort((a, b) => a - b);
  return lens.length ? lens[lens.length >> 1] : 0;
}

function axisUnitVector(value) {
  const raw = String(value || '+z').trim().toLowerCase();
  const letter = ['x', 'y', 'z'].includes(raw.slice(-1)) ? raw.slice(-1) : 'z';
  const sign = raw.startsWith('-') ? -1 : 1;
  return { x: [sign, 0, 0], y: [0, sign, 0], z: [0, 0, sign] }[letter];
}

/**
 * @param {object} study     contenu JSON d'un .TBBS
 * @param {string} mshContent maillage (éventuellement raffiné)
 * @returns {{config, driverParams, driverName, diaphragmMeshes}}
 */
export function buildConfigFromStudy(study, mshContent, { uniformVelocity = false, noBaffle = false } = {}) {
  const tree = study.tree || [];
  const symmetry = study.symmetry || 'none';
  const hostVertices = hostVerticesFromMsh(mshContent);
  const hostEdge_mm = medianEdgeFromMsh(mshContent);

  const diaphragms = [];
  const diaphragmMeshes = new Map();
  let driverParams = null, driverName = '';

  const subdomains = tree.filter(it => it.kind === 'Subdomain').map(it => {
    const components = it.components || [];
    const baffle = components.find(c => c.type === 'baffle') || null;
    const surfaces = (it.surfaces || []).filter(s => s.meshSurfaceId).map(s => ({
      surfaceId: s.meshSurfaceId,
      role: s.role === 'driven' ? 'driven' : 'boundary',
      velocity: s.velocity != null ? s.velocity : 1,
    }));
    for (const component of components) {
      if (component.type !== 'diaphragm') continue;
      const mesh = buildDiaphragmMesh(component, { hostVertices, hostEdge_mm, symmetry });
      if (!mesh?.tris?.length) throw new Error(`diaphragm mesh empty: ${mesh?.stats?.error}`);
      diaphragmMeshes.set(component.id, mesh);
      diaphragms.push({ id: component.id, nodes: mesh.nodes, tris: mesh.coneTris || mesh.tris });
      surfaces.push({
        surfaceId: `d:${component.id}`,
        role: 'driven',
        velocity: 1,
        pistonAxis: uniformVelocity ? null : axisUnitVector(component.axis),
      });
      if (mesh.capTris?.length) {
        diaphragms.push({ id: `${component.id}:cap`, nodes: mesh.nodes, tris: mesh.capTris });
        surfaces.push({ surfaceId: `d:${component.id}:cap`, role: 'boundary' });
      }
      if (!driverParams && component.driverParams) {
        driverParams = component.driverParams;
        driverName = component.driverName || '';
      }
    }
    return {
      id: it.id,
      name: it.name,
      type: it.domainType === 'interior' ? 'interior' : 'exterior',
      baffle: noBaffle ? false : !!baffle,
      baffleAxis: baffle ? (baffle.axis || '+z') : null,
      baffleOffset_mm: baffle ? (Number(baffle.offset_mm) || 0) : 0,
      surfaces,
    };
  });

  const interfaces = tree.filter(it => it.kind === 'Interface').map(it => ({
    id: it.id, name: it.name, fromId: it.fromId, toId: it.toId,
    surfaces: (it.surfaces || []).filter(s => s.meshSurfaceId).map(s => ({ surfaceId: s.meshSurfaceId })),
  }));

  return {
    config: {
      symmetry,
      driveVrms: Number(study.driveVrms || 2.83),
      normalConvention: study.normalConvention || 'auto',
      subdomains,
      interfaces,
      diaphragms,
    },
    driverParams,
    driverName,
    diaphragmMeshes,
  };
}
