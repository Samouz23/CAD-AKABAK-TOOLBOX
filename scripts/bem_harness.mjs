// =======================================================
// scripts/bem_harness.mjs
//
// Standalone BEM test harness running in Node.js.
// - Imports bemCore.js (pure ESM — no DOM / no worker deps).
// - Duplicates the mesh builder from bemWorker.js.
// - Sweeps a dense frequency grid on the default Horn Studio horn.
// - Writes heatmap PNGs (directivity map) for H and V planes so the
//   agent can view them and iterate.
//
// Usage (from repo root):
//   node scripts/bem_harness.mjs [--fine] [--fmax N] [--runtag TAG]
// Output:
//   scripts/out/<tag>_H.png
//   scripts/out/<tag>_V.png
//   scripts/out/<tag>_info.json
// =======================================================

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  C_AIR,
  buildElements,
  solveBEM,
  computePolar,
} from '../src/js/bem/bemCore.js';

// -------------------------------------------------------
// 1. Mesh builder (copied from bemWorker.js, kept in sync)
// -------------------------------------------------------
function buildHornQuarterMesh(segs, opts = {}) {
  const targetWallSize_mm     = opts.targetWallSize_mm     || 50;
  const targetSourceSize_mm   = opts.targetSourceSize_mm   || 20;
  const targetApertureSize_mm = opts.targetApertureSize_mm || targetWallSize_mm;
  const transMin = opts.transMin || 3;
  const axialMin = opts.axialMin || 2;

  // Upsample segments
  {
    const subd = [];
    for (let i = 0; i < segs.length - 1; i++) {
      const s0 = segs[i], s1 = segs[i + 1];
      const L = Math.max(0, Number(s0.l) || 0);
      const n = Math.max(1, Math.ceil(L / Math.max(20, targetWallSize_mm)));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const w = Number(s0.w) + t * (Number(s1.w) - Number(s0.w));
        const h = Number(s0.h) + t * (Number(s1.h) - Number(s0.h));
        subd.push({ w, h, l: L / n });
      }
    }
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
  const divForSize = (extent, size, min) => Math.max(min, Math.round(extent / size));

  const surfaces = [];

  // Throat cap
  {
    const triangles = [];
    const nX = divForSize(Ws[0], targetSourceSize_mm, transMin);
    const nY = divForSize(Hs[0], targetSourceSize_mm, transMin);
    for (let i = 0; i < nX; i++) {
      for (let j = 0; j < nY; j++) {
        const x0 = i / nX * Ws[0], x1 = (i + 1) / nX * Ws[0];
        const y0 = j / nY * Hs[0], y1 = (j + 1) / nY * Hs[0];
        triangles.push({ v0: [x0, y0, 0], v1: [x0, y1, 0], v2: [x1, y0, 0] });
        triangles.push({ v0: [x1, y0, 0], v1: [x0, y1, 0], v2: [x1, y1, 0] });
      }
    }
    surfaces.push({ tag: 1, triangles });
  }

  // Walls per sub-segment
  for (let seg = 0; seg < segs.length - 1; seg++) {
    const z0 = zs[seg], z1 = zs[seg + 1];
    const segLen = z1 - z0;
    if (segLen <= 1e-6) continue;
    const w0 = Ws[seg], w1 = Ws[seg + 1];
    const h0 = Hs[seg], h1 = Hs[seg + 1];
    const Nz = divForSize(segLen, targetWallSize_mm, axialMin);
    const NyWall = divForSize(Math.max(h0, h1), targetWallSize_mm, transMin);
    const NxWall = divForSize(Math.max(w0, w1), targetWallSize_mm, transMin);

    const xTris = [];
    for (let i = 0; i < Nz; i++) {
      for (let j = 0; j < NyWall; j++) {
        const t0 = i / Nz, t1 = (i + 1) / Nz;
        const s0 = j / NyWall, s1 = (j + 1) / NyWall;
        const za = z0 + t0 * segLen, zb = z0 + t1 * segLen;
        const wa = w0 + t0 * (w1 - w0), wb = w0 + t1 * (w1 - w0);
        const ha = h0 + t0 * (h1 - h0), hb = h0 + t1 * (h1 - h0);
        const pAA = [wa, s0 * ha, za], pAB = [wa, s1 * ha, za];
        const pBA = [wb, s0 * hb, zb], pBB = [wb, s1 * hb, zb];
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
        const pAA = [s0 * wa, ha, za], pAB = [s1 * wa, ha, za];
        const pBA = [s0 * wb, hb, zb], pBB = [s1 * wb, hb, zb];
        yTris.push({ v0: pAA, v1: pBA, v2: pAB });
        yTris.push({ v0: pAB, v1: pBA, v2: pBB });
      }
    }
    surfaces.push({ tag: 200 + seg, triangles: yTris });
  }

  // Mouth cap
  {
    const nLast = segs.length - 1;
    const Wm = Ws[nLast], Hm = Hs[nLast];
    const triangles = [];
    const nX = divForSize(Wm, targetApertureSize_mm, transMin);
    const nY = divForSize(Hm, targetApertureSize_mm, transMin);
    for (let i = 0; i < nX; i++) {
      for (let j = 0; j < nY; j++) {
        const x0 = i / nX * Wm, x1 = (i + 1) / nX * Wm;
        const y0 = j / nY * Hm, y1 = (j + 1) / nY * Hm;
        triangles.push({ v0: [x0, y0, totalZ], v1: [x1, y0, totalZ], v2: [x0, y1, totalZ] });
        triangles.push({ v0: [x1, y0, totalZ], v1: [x1, y1, totalZ], v2: [x0, y1, totalZ] });
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
    Ws[nLast] / divForSize(Ws[nLast], targetApertureSize_mm, transMin),
    Hs[nLast] / divForSize(Hs[nLast], targetApertureSize_mm, transMin),
  );
  return { surfaces, roleMap, totalLength_mm: totalZ, elementCount, maxElementSize_mm: maxEdge };
}

// -------------------------------------------------------
// 2. Minimal PNG encoder (RGBA, no deps)
// -------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // Raw scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// REW-like colormap
function rewColor(db, dbRange) {
  const t = Math.max(0, Math.min(1, -db / dbRange));
  const stops = [
    [0.00, [165,  30,  30]],
    [0.08, [220,  40,  40]],
    [0.20, [240, 110,  30]],
    [0.33, [245, 205,  40]],
    [0.45, [100, 200,  60]],
    [0.58, [ 40, 190, 170]],
    [0.72, [ 40, 140, 220]],
    [0.88, [ 30,  70, 190]],
    [1.00, [ 20,  30, 100]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (t - t0) / Math.max(1e-9, t1 - t0);
      return [
        Math.round(c0[0] + f * (c1[0] - c0[0])),
        Math.round(c0[1] + f * (c1[1] - c0[1])),
        Math.round(c0[2] + f * (c1[2] - c0[2])),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

// -------------------------------------------------------
// 3. Heatmap renderer from polar table
// -------------------------------------------------------
function interpolateFreq(table, freq) {
  if (freq <= table[0].f) return table[0];
  if (freq >= table[table.length - 1].f) return table[table.length - 1];
  for (let i = 0; i < table.length - 1; i++) {
    if (table[i].f <= freq && freq <= table[i + 1].f) {
      const a = table[i], b = table[i + 1];
      const t = (Math.log2(freq) - Math.log2(a.f)) / (Math.log2(b.f) - Math.log2(a.f));
      const normalized = a.normalized.map((v, j) => v * (1 - t) + b.normalized[j] * t);
      return { angles: a.angles, normalized };
    }
  }
  return table[0];
}
function sampleAngle(polar, angleDeg) {
  const a = Math.max(polar.angles[0], Math.min(polar.angles[polar.angles.length - 1], angleDeg));
  for (let i = 0; i < polar.angles.length - 1; i++) {
    const a0 = polar.angles[i], a1 = polar.angles[i + 1];
    if (a0 <= a && a <= a1) {
      const t = (a - a0) / Math.max(1e-9, a1 - a0);
      return polar.normalized[i] * (1 - t) + polar.normalized[i + 1] * t;
    }
  }
  return polar.normalized[polar.normalized.length - 1];
}
function renderHeatmap(table, fMin, fMax, width = 900, height = 600, dbRange = 24) {
  // Layout: padL,padT,padR,padB
  const padL = 70, padT = 40, padR = 100, padB = 60;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const rgba = Buffer.alloc(width * height * 4, 0);
  // Background fill light gray
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 25; rgba[i + 1] = 25; rgba[i + 2] = 30; rgba[i + 3] = 255; }

  const logFMin = Math.log10(fMin), logFMax = Math.log10(fMax);
  const aMin = -90, aMax = 90;

  for (let py = 0; py < plotH; py++) {
    const angle = aMax - (py / (plotH - 1)) * (aMax - aMin);
    for (let px = 0; px < plotW; px++) {
      const logF = logFMin + (px / (plotW - 1)) * (logFMax - logFMin);
      const f = Math.pow(10, logF);
      const polar = interpolateFreq(table, f);
      const p = sampleAngle(polar, Math.abs(angle));
      const db = 20 * Math.log10(Math.max(1e-6, p));
      const [r, g, b] = rewColor(db, dbRange);
      const i = ((py + padT) * width + (px + padL)) * 4;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }

  // Frame
  const setPx = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
  };
  for (let x = padL; x <= padL + plotW; x++) { setPx(x, padT, 150, 150, 150); setPx(x, padT + plotH, 150, 150, 150); }
  for (let y = padT; y <= padT + plotH; y++) { setPx(padL, y, 150, 150, 150); setPx(padL + plotW, y, 150, 150, 150); }

  // Angle grid lines
  for (const ang of [-90, -60, -30, 0, 30, 60, 90]) {
    const y = padT + Math.round((1 - (ang - aMin) / (aMax - aMin)) * plotH);
    for (let x = padL; x < padL + plotW; x += 2) setPx(x, y, 120, 120, 140);
  }
  // Freq grid
  for (const f of [100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    if (f < fMin || f > fMax) continue;
    const x = padL + Math.round((Math.log10(f) - logFMin) / (logFMax - logFMin) * plotW);
    for (let y = padT; y < padT + plotH; y += 2) setPx(x, y, 120, 120, 140);
  }

  // Legend strip on the right
  const legX = padL + plotW + 20, legW = 18;
  for (let py = 0; py < plotH; py++) {
    const db = -(py / (plotH - 1)) * dbRange;
    const [r, g, b] = rewColor(db, dbRange);
    for (let x = legX; x < legX + legW; x++) setPx(x, padT + py, r, g, b);
  }

  return rgba;
}

// -------------------------------------------------------
// 4. Main
// -------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const runtag = opt('--runtag', 'run1');
const fMax = parseFloat(opt('--fmax', '5000'));
const wallMm = parseFloat(opt('--wall', '50'));
const sourceMm = parseFloat(opt('--source', '20'));
const fine = args.includes('--fine');

// Horn Studio default horn (conical, linear interpolation between throat and mouth)
// Throat 100×56, mouth 400×226, length 500, 6 segments.
function makeSegs(n) {
  const W0 = 100, H0 = 56, W1 = 400, H1 = 226, L = 500;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push({ w: W0 + t * (W1 - W0), h: H0 + t * (H1 - H0), l: i < n - 1 ? L / (n - 1) : 0 });
  }
  return out;
}
const segs = makeSegs(6);

const mesh = buildHornQuarterMesh(segs, {
  targetWallSize_mm: wallMm,
  targetSourceSize_mm: sourceMm,
  targetApertureSize_mm: wallMm,
});
const elements = buildElements(mesh.surfaces, 0.001, mesh.roleMap);
const fMaxValid = C_AIR / (3 * mesh.maxElementSize_mm / 1000);

console.log(`[harness] Horn: 6 segs, throat 100×56, mouth 400×226, L=500`);
console.log(`[harness] Mesh: ${mesh.elementCount} triangles, maxEdge=${mesh.maxElementSize_mm.toFixed(1)} mm, fMaxValid=${fMaxValid.toFixed(0)} Hz`);

// Frequency grid — 1/4-octave from 100 Hz
const freqs = [];
{
  const fMin = 100;
  const spo = fine ? 6 : 4; // steps per octave
  const nSteps = Math.round(Math.log2(fMax / fMin) * spo);
  for (let i = 0; i <= nSteps; i++) {
    const logF = Math.log2(fMin) + i / spo;
    freqs.push(Math.round(Math.pow(2, logF)));
  }
}
console.log(`[harness] Freqs (${freqs.length}): ${freqs.join(', ')}`);

const polarH = [], polarV = [];
const t0 = performance.now();
for (let fi = 0; fi < freqs.length; fi++) {
  const f = freqs[fi];
  const tf = performance.now();
  const sol = solveBEM(f, elements, 1, 'HV');
  const ph = computePolar(f, sol.k, elements, sol.pressure, sol.normalDerivative, 'H', 10, 2, 'HV', -90, 90);
  const pv = computePolar(f, sol.k, elements, sol.pressure, sol.normalDerivative, 'V', 10, 2, 'HV', -90, 90);
  polarH.push({ f, angles: ph.angles, normalized: ph.normalized });
  polarV.push({ f, angles: pv.angles, normalized: pv.normalized });
  console.log(`  f=${f.toString().padStart(5)} Hz  ${(performance.now() - tf).toFixed(0)} ms`);
}
console.log(`[harness] Total: ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// Render PNG heatmaps
const W = 900, H = 600;
const rgbaH = renderHeatmap(polarH, 50, 20000, W, H, 24);
const rgbaV = renderHeatmap(polarV, 50, 20000, W, H, 24);
const pngH = encodePNG(W, H, rgbaH);
const pngV = encodePNG(W, H, rgbaV);

const outH = path.join(outDir, `${runtag}_H.png`);
const outV = path.join(outDir, `${runtag}_V.png`);
fs.writeFileSync(outH, pngH);
fs.writeFileSync(outV, pngV);

fs.writeFileSync(path.join(outDir, `${runtag}_info.json`), JSON.stringify({
  runtag,
  horn: { throat: [100, 56], mouth: [400, 226], length: 500, segs: 6 },
  mesh: { count: mesh.elementCount, maxEdge_mm: mesh.maxElementSize_mm, fMaxValid_Hz: fMaxValid },
  freqs,
  polarH, polarV,
}, null, 2));

console.log(`[harness] Wrote ${outH}`);
console.log(`[harness] Wrote ${outV}`);
