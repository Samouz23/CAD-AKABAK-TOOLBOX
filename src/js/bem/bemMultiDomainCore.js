// =======================================================
// FICHIER :  src/js/bem/bemMultiDomainCore.js
// RÔLE    :  Solveur BEM multi-domaine avec sous-domaines et interfaces
//            Compatible avec les fichiers .msh générés par l'export Gmsh
//            Similaire à Akabak : gère interior/exterior domains + interfaces
// =======================================================

'use strict';

const C_AIR  = 344;
const RHO_AIR = 1.21;

// =======================================================
// GAUSS QUADRATURE RULES
// =======================================================
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

function pickQuad(x, elem) {
  const c = elem.centroid;
  const dx = x[0]-c[0], dy = x[1]-c[1], dz = x[2]-c[2];
  const R2 = dx*dx + dy*dy + dz*dz;
  const h2 = elem.area;
  if (R2 > 36 * h2) return GAUSS1;
  if (R2 > 6.25 * h2) return GAUSS3;
  return GAUSS7;
}

// =======================================================
// GREEN'S FUNCTION KERNELS
// =======================================================
function greenKernel(k, x, y) {
  const dx = x[0]-y[0], dy = x[1]-y[1], dz = x[2]-y[2];
  const R = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (R < 1e-15) return { gRe: 0, gIm: 0, R: 0 };
  const kR = k * R;
  const inv4piR = 1 / (4 * Math.PI * R);
  return { 
    gRe: Math.cos(kR) * inv4piR, 
    gIm: Math.sin(kR) * inv4piR, 
    R 
  };
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
  return { 
    re: factRe * rdotn * inv4piR3, 
    im: factIm * rdotn * inv4piR3 
  };
}

// =======================================================
// INTEGRATION ROUTINES
// =======================================================
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
  return { 
    re: rEq / 2, 
    im: k * elem.area / (4 * Math.PI) 
  };
}

// =======================================================
// MSH PARSER - Parse Gmsh .msh format (version 2.2)
// =======================================================
function parseMSH(mshContent) {
  const lines = mshContent.split('\n').map(l => l.trim()).filter(l => l);
  let idx = 0;
  
  // Parse MeshFormat
  while (idx < lines.length && !lines[idx].startsWith('$MeshFormat')) idx++;
  if (idx >= lines.length) throw new Error('Invalid MSH: $MeshFormat not found');
  idx++;
  const meshFormat = lines[idx].split(/\s+/);
  const version = parseFloat(meshFormat[0]);
  if (version < 2.0 || version >= 5.0) {
    throw new Error(`Unsupported MSH version: ${version}`);
  }
  
  // Parse PhysicalNames
  const physicalNames = new Map();
  while (idx < lines.length && !lines[idx].startsWith('$PhysicalNames')) idx++;
  if (idx < lines.length) {
    idx++;
    const numNames = parseInt(lines[idx++]);
    for (let i = 0; i < numNames; i++) {
      const parts = lines[idx++].match(/(\d+)\s+(\d+)\s+"([^"]+)"/);
      if (parts) {
        const dim = parseInt(parts[1]);
        const tag = parseInt(parts[2]);
        const name = parts[3];
        if (dim === 2) { // Only 2D surfaces
          physicalNames.set(tag, name);
        }
      }
    }
  }
  
  // Parse Nodes
  while (idx < lines.length && !lines[idx].startsWith('$Nodes')) idx++;
  if (idx >= lines.length) throw new Error('Invalid MSH: $Nodes not found');
  idx++;
  const numNodes = parseInt(lines[idx++]);
  const nodes = new Map();
  for (let i = 0; i < numNodes; i++) {
    const parts = lines[idx++].split(/\s+/);
    const nodeId = parseInt(parts[0]);
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]);
    const z = parseFloat(parts[3]);
    nodes.set(nodeId, [x, y, z]);
  }
  
  // Parse Elements
  while (idx < lines.length && !lines[idx].startsWith('$Elements')) idx++;
  if (idx >= lines.length) throw new Error('Invalid MSH: $Elements not found');
  idx++;
  const numElements = parseInt(lines[idx++]);
  const surfaces = new Map(); // physicalTag -> {name, triangles}
  
  for (let i = 0; i < numElements; i++) {
    const parts = lines[idx++].split(/\s+/).map(p => parseInt(p));
    const elemId = parts[0];
    const elemType = parts[1];
    
    // Only process triangular elements (type 2)
    if (elemType !== 2) continue;
    
    const numTags = parts[2];
    const physicalTag = parts[3];
    const geometricTag = parts[4];
    
    // Node indices start after the tags
    const nodeOffset = 3 + numTags;
    const n0 = parts[nodeOffset];
    const n1 = parts[nodeOffset + 1];
    const n2 = parts[nodeOffset + 2];
    
    const v0 = nodes.get(n0);
    const v1 = nodes.get(n1);
    const v2 = nodes.get(n2);
    
    if (!v0 || !v1 || !v2) {
      console.warn(`Element ${elemId}: missing node(s)`);
      continue;
    }
    
    if (!surfaces.has(physicalTag)) {
      surfaces.set(physicalTag, {
        name: physicalNames.get(physicalTag) || `surface_${physicalTag}`,
        tag: physicalTag,
        triangles: []
      });
    }
    
    surfaces.get(physicalTag).triangles.push({ v0, v1, v2 });
  }
  
  return {
    surfaces: Array.from(surfaces.values()),
    numNodes: nodes.size,
    numElements: Array.from(surfaces.values()).reduce((sum, s) => sum + s.triangles.length, 0)
  };
}

// =======================================================
// BUILD ELEMENTS WITH SUBDOMAIN CLASSIFICATION
// =======================================================
function buildMultiDomainElements(surfaces) {
  const elements = [];
  const subdomains = {
    interior: [],
    exterior: [],
    interface: []
  };
  
  for (const surf of surfaces) {
    const name = surf.name.toLowerCase();
    
    // Classify surfaces into subdomains
    let subdomain = 'exterior'; // default
    let role = 'wall'; // default
    
    if (name.includes('throat') || name.includes('source')) {
      subdomain = 'interior';
      role = 'source';
    } else if (name.includes('interface')) {
      subdomain = 'interface';
      role = 'interface';
    } else if (name.includes('waveguide') || name.includes('horn')) {
      subdomain = 'interior';
      role = 'wall';
    }
    
    for (const tri of surf.triangles) {
      const v0 = tri.v0;
      const v1 = tri.v1;
      const v2 = tri.v2;
      
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
      
      const elem = {
        centroid: [cx, cy, cz],
        normal: [nx/nLen, ny/nLen, nz/nLen],
        area,
        v0, v1, v2,
        surfaceName: surf.name,
        surfaceTag: surf.tag,
        subdomain,
        role
      };
      
      elements.push(elem);
      subdomains[subdomain].push(elements.length - 1);
    }
  }
  
  return { elements, subdomains };
}

// =======================================================
// MULTI-DOMAIN BEM ASSEMBLY
// Assemble coupled BEM system for interior + exterior domains
// with continuity at interfaces
// =======================================================
function assembleMultiDomainBEM(freq, elements, subdomains, onProgress) {
  const k = 2 * Math.PI * freq / C_AIR;
  const omega = 2 * Math.PI * freq;
  
  const N = elements.length;
  const Ni = subdomains.interior.length;
  const Ne = subdomains.exterior.length;
  const Nif = subdomains.interface.length;
  
  console.log(`Multi-domain BEM: ${Ni} interior, ${Ne} exterior, ${Nif} interface elements`);
  
  // Build global H and G matrices
  const H = new Float64Array(2 * N * N);
  const G = new Float64Array(2 * N * N);
  
  for (let i = 0; i < N; i++) {
    const xi = elements[i].centroid;
    
    for (let j = 0; j < N; j++) {
      const idx = 2 * (i * N + j);
      
      if (i === j) {
        const gSelf = selfTermG(k, elements[j]);
        G[idx] = gSelf.re;
        G[idx+1] = gSelf.im;
        H[idx] = 0;
        H[idx+1] = 0;
      } else {
        const gVal = integrateG(k, xi, elements[j]);
        G[idx] = gVal.re;
        G[idx+1] = gVal.im;
        
        const hVal = integrateDGdn(k, xi, elements[j]);
        H[idx] = hVal.re;
        H[idx+1] = hVal.im;
      }
    }
    
    if (onProgress) onProgress((i + 1) / N * 0.5);
  }
  
  // Build system matrix A and RHS
  // For now, simple exterior Neumann formulation
  // TODO: Implement full multi-domain coupling
  const A = new Float64Array(2 * N * N);
  const rhs = new Float64Array(2 * N);
  
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const idx = 2 * (i * N + j);
      let aRe = H[idx];
      let aIm = H[idx+1];
      
      if (i === j) {
        aRe += 0.5;
      }
      
      const elem = elements[j];
      
      // Apply boundary conditions based on role
      if (elem.role === 'source') {
        // Source: prescribe normal velocity
        const velocity = 1.0; // unit velocity
        const factor = omega * RHO_AIR * velocity;
        const GRe = G[idx], GIm = G[idx+1];
        rhs[2*i]   += -factor * GIm;
        rhs[2*i+1] += factor * GRe;
      }
      
      A[idx] = aRe;
      A[idx+1] = aIm;
    }
    
    if (onProgress) onProgress(0.5 + (i + 1) / N * 0.3);
  }
  
  return { A, rhs, G, H, N };
}

// =======================================================
// COMPLEX LU SOLVER
// =======================================================
function complexLUSolve(A, rhs, N) {
  // Forward elimination with partial pivoting
  for (let col = 0; col < N; col++) {
    // Find pivot
    let maxMag = 0, maxRow = col;
    for (let row = col; row < N; row++) {
      const re = A[2*(row*N+col)], im = A[2*(row*N+col)+1];
      const mag = re*re + im*im;
      if (mag > maxMag) { maxMag = mag; maxRow = row; }
    }
    
    if (maxMag < 1e-30) continue;
    
    // Swap rows
    if (maxRow !== col) {
      for (let j = 0; j < N; j++) {
        const a = 2*(col*N+j), b = 2*(maxRow*N+j);
        let t = A[a]; A[a] = A[b]; A[b] = t;
        t = A[a+1]; A[a+1] = A[b+1]; A[b+1] = t;
      }
      let t = rhs[2*col]; rhs[2*col] = rhs[2*maxRow]; rhs[2*maxRow] = t;
      t = rhs[2*col+1]; rhs[2*col+1] = rhs[2*maxRow+1]; rhs[2*maxRow+1] = t;
    }
    
    // Eliminate
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
  
  // Back substitution
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

// =======================================================
// FIELD PRESSURE EVALUATION
// =======================================================
function fieldPressure(fieldPoint, k, elements, pressure, normalDerivative) {
  let pRe = 0, pIm = 0;
  
  for (let j = 0; j < elements.length; j++) {
    const elem = elements[j];
    const g = greenKernel(k, fieldPoint, elem.centroid);
    const gRe = g.gRe * elem.area;
    const gIm = g.gIm * elem.area;
    
    const qjRe = normalDerivative[2*j];
    const qjIm = normalDerivative[2*j+1];
    
    // Use full representation (not just monopole)
    const dg = greenDnKernel(k, fieldPoint, elem.centroid, elem.normal);
    const dgRe = dg.re * elem.area;
    const dgIm = dg.im * elem.area;
    
    const pjRe = pressure[2*j];
    const pjIm = pressure[2*j+1];
    
    pRe += (gRe*qjRe - gIm*qjIm) - (dgRe*pjRe - dgIm*pjIm);
    pIm += (gRe*qjIm + gIm*qjRe) - (dgRe*pjIm + dgIm*pjRe);
  }
  
  return { re: pRe, im: pIm };
}

// =======================================================
// POLAR DIRECTIVITY COMPUTATION
// =======================================================
function computePolarMultiDomain(freq, k, elements, pressure, normalDerivative, plane, distance, angleStep, angleMinDeg, angleMaxDeg) {
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
    
    const p = fieldPressure(pt, k, elements, pressure, normalDerivative);
    const mag = Math.sqrt(p.re*p.re + p.im*p.im);
    angles.push(deg);
    pressureMags.push(mag);
  }
  
  // Normalize by maximum
  const maxMag = Math.max(...pressureMags);
  const normalized = pressureMags.map(m => maxMag > 0 ? m / maxMag : 0);
  
  return { angles, normalized, pressureMags };
}

// =======================================================
// MAIN SOLVE FUNCTION
// =======================================================
function solveMultiDomainBEM(freq, elements, subdomains, onProgress) {
  const k = 2 * Math.PI * freq / C_AIR;
  const omega = 2 * Math.PI * freq;
  
  // Assemble system
  const { A, rhs, G, H, N } = assembleMultiDomainBEM(freq, elements, subdomains, onProgress);
  
  // Solve
  complexLUSolve(A, rhs, N);
  
  // Compute normal derivatives
  const q = new Float64Array(2 * N);
  for (let j = 0; j < N; j++) {
    const elem = elements[j];
    if (elem.role === 'wall') {
      q[2*j] = 0;
      q[2*j+1] = 0;
    } else if (elem.role === 'source') {
      q[2*j] = 0;
      q[2*j+1] = omega * RHO_AIR;
    } else if (elem.role === 'interface') {
      // Compute from pressure solution
      const pRe = rhs[2*j];
      const pIm = rhs[2*j+1];
      q[2*j]   = -k * pIm;
      q[2*j+1] = k * pRe;
    }
  }
  
  if (onProgress) onProgress(1);
  
  return { 
    pressure: rhs, 
    normalDerivative: q, 
    k 
  };
}

// =======================================================
// EXPORT
// =======================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseMSH,
    buildMultiDomainElements,
    solveMultiDomainBEM,
    computePolarMultiDomain,
    fieldPressure,
    C_AIR,
    RHO_AIR
  };
}
