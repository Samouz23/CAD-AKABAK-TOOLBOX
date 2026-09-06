// =======================================================
// scripts/spl_harness.mjs
//
// Horn + driver SPL response harness.
//   - Default horn: Horn Studio default (6 segs, 100x56 → 400x226, L=500).
//   - Default driver: Beyma 8MI100 (pulled from driverDB.json).
//   - 1W/1m sweep, +6 dB for infinite baffle (2π radiation).
//   - Produces a PNG SPL curve in scripts/out/<tag>_SPL.png.
//   - Also writes scripts/out/<tag>_spl.json with raw data for regression.
//
// Usage:
//   node scripts/spl_harness.mjs [--runtag R] [--driver "Beyma 8MI100"]
//                                [--fmin 100] [--fmax 5000] [--ppo 12]
//                                [--vRMS 2.83] [--flat] [--wall 25]
// =======================================================

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  C_AIR,
  buildElements,
  solveBEM,
  computeFieldPressure,
  computeSourceForce,
} from '../src/js/bem/bemCore.js';

const RHO_AIR = 1.21;
const P_REF   = 2e-5;

// -------------------------------------------------------
//  CLI
// -------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const runtag   = opt('--runtag', 'spl1');
const driverName = opt('--driver', 'Beyma 8MI100');
const fMin     = parseFloat(opt('--fmin', '100'));
const fMax     = parseFloat(opt('--fmax', '5000'));
const ppo      = parseInt(opt('--ppo', '12'), 10);
const vRMS     = parseFloat(opt('--vRMS', '2.83'));   // 2.83 V = 1W into 8Ω reference
const wallMm   = parseFloat(opt('--wall', '25'));
const sourceMm = parseFloat(opt('--source', '20'));
// Akabak's "1W/1m" default is 2π half-space (flush-mounted / baffled).
// Add +6 dB unless --noBaffle passed (true 4π free-field).
const baffleGainDB = args.includes('--noBaffle') ? 0 : 6;
const srOverride = args.includes('--sr') ? parseFloat(opt('--sr', '1')) : null;   // force Sd/St ratio

// -------------------------------------------------------
//  Driver DB lookup
// -------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'src', 'js', 'panels', 'driver_db', 'database', 'driverDB.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const entry = db.find(d => d.name === driverName);
if (!entry) {
  console.error(`Driver "${driverName}" not found in DB.`);
  process.exit(1);
}
const p = entry.params;
const driver = {
  name:  entry.name,
  Sd_m2: (p.SDf ?? p.SDr ?? 0) * 1e-4,   // cm² → m²
  Mms:   p.Mms * 1e-3,                    // g → kg
  fs:    p.fs,
  Qms:   p.Qms,
  Re:    p.Re,
  BL:    p.BL,
  Le:    (p.Le || 0) * 1e-3,              // mH → H
};
driver.omega_s = 2 * Math.PI * driver.fs;
driver.Kms     = driver.omega_s * driver.omega_s * driver.Mms;
driver.Rms     = driver.omega_s * driver.Mms / driver.Qms;
console.log(`[spl] Driver = ${driver.name}`);
console.log(`      Sd=${(driver.Sd_m2*1e4).toFixed(0)} cm²  Mms=${(driver.Mms*1e3).toFixed(1)} g  fs=${driver.fs} Hz  Qms=${driver.Qms}`);
console.log(`      Re=${driver.Re} Ω  BL=${driver.BL} T·m  Le=${(driver.Le*1e3).toFixed(2)} mH`);
console.log(`      Kms=${driver.Kms.toFixed(0)} N/m  Rms=${driver.Rms.toFixed(3)} N·s/m`);

// -------------------------------------------------------
//  Horn (Horn Studio default) + mesh
// -------------------------------------------------------
function makeSegs(n) {
  const W0 = 100, H0 = 56, W1 = 400, H1 = 226, L = 500;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push({ w: W0 + t * (W1 - W0), h: H0 + t * (H1 - H0), l: i < n - 1 ? L / (n - 1) : 0 });
  }
  return out;
}

// Same mesh builder as scripts/bem_harness.mjs (copied to stay in sync).
function buildHornQuarterMesh(segs, opts = {}) {
  const targetWallSize_mm     = opts.targetWallSize_mm     || 50;
  const targetSourceSize_mm   = opts.targetSourceSize_mm   || 20;
  const targetApertureSize_mm = opts.targetApertureSize_mm || targetWallSize_mm;
  const transMin = opts.transMin || 3;
  const axialMin = opts.axialMin || 2;

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
  for (let i = 0; i < segs.length - 1; i++) zs.push(zs[zs.length - 1] + Math.max(0, Number(segs[i].l) || 0));
  const totalZ = zs[zs.length - 1];

  const Ws = segs.map(s => Number(s.w) / 2);
  const Hs = segs.map(s => Number(s.h) / 2);
  const divForSize = (extent, size, min) => Math.max(min, Math.round(extent / size));

  const surfaces = [];
  // Throat
  {
    const triangles = [];
    const nX = divForSize(Ws[0], targetSourceSize_mm, transMin);
    const nY = divForSize(Hs[0], targetSourceSize_mm, transMin);
    for (let i = 0; i < nX; i++) for (let j = 0; j < nY; j++) {
      const x0 = i/nX*Ws[0], x1 = (i+1)/nX*Ws[0];
      const y0 = j/nY*Hs[0], y1 = (j+1)/nY*Hs[0];
      triangles.push({ v0:[x0,y0,0], v1:[x0,y1,0], v2:[x1,y0,0] });
      triangles.push({ v0:[x1,y0,0], v1:[x0,y1,0], v2:[x1,y1,0] });
    }
    surfaces.push({ tag: 1, triangles });
  }
  // Walls
  for (let seg = 0; seg < segs.length - 1; seg++) {
    const z0 = zs[seg], z1 = zs[seg+1];
    const segLen = z1 - z0; if (segLen <= 1e-6) continue;
    const w0 = Ws[seg], w1 = Ws[seg+1];
    const h0 = Hs[seg], h1 = Hs[seg+1];
    const Nz = divForSize(segLen, targetWallSize_mm, axialMin);
    const NyWall = divForSize(Math.max(h0,h1), targetWallSize_mm, transMin);
    const NxWall = divForSize(Math.max(w0,w1), targetWallSize_mm, transMin);
    const xTris = [];
    for (let i = 0; i < Nz; i++) for (let j = 0; j < NyWall; j++) {
      const t0=i/Nz,t1=(i+1)/Nz,s0=j/NyWall,s1=(j+1)/NyWall;
      const za=z0+t0*segLen,zb=z0+t1*segLen;
      const wa=w0+t0*(w1-w0),wb=w0+t1*(w1-w0);
      const ha=h0+t0*(h1-h0),hb=h0+t1*(h1-h0);
      const pAA=[wa,s0*ha,za],pAB=[wa,s1*ha,za],pBA=[wb,s0*hb,zb],pBB=[wb,s1*hb,zb];
      xTris.push({v0:pAA,v1:pAB,v2:pBA}); xTris.push({v0:pBA,v1:pAB,v2:pBB});
    }
    surfaces.push({ tag: 100+seg, triangles: xTris });
    const yTris = [];
    for (let i = 0; i < Nz; i++) for (let j = 0; j < NxWall; j++) {
      const t0=i/Nz,t1=(i+1)/Nz,s0=j/NxWall,s1=(j+1)/NxWall;
      const za=z0+t0*segLen,zb=z0+t1*segLen;
      const wa=w0+t0*(w1-w0),wb=w0+t1*(w1-w0);
      const ha=h0+t0*(h1-h0),hb=h0+t1*(h1-h0);
      const pAA=[s0*wa,ha,za],pAB=[s1*wa,ha,za],pBA=[s0*wb,hb,zb],pBB=[s1*wb,hb,zb];
      yTris.push({v0:pAA,v1:pBA,v2:pAB}); yTris.push({v0:pAB,v1:pBA,v2:pBB});
    }
    surfaces.push({ tag: 200+seg, triangles: yTris });
  }
  // Mouth
  {
    const nLast = segs.length - 1;
    const Wm = Ws[nLast], Hm = Hs[nLast];
    const triangles = [];
    const nX = divForSize(Wm, targetApertureSize_mm, transMin);
    const nY = divForSize(Hm, targetApertureSize_mm, transMin);
    for (let i = 0; i < nX; i++) for (let j = 0; j < nY; j++) {
      const x0=i/nX*Wm,x1=(i+1)/nX*Wm,y0=j/nY*Hm,y1=(j+1)/nY*Hm;
      triangles.push({v0:[x0,y0,totalZ],v1:[x1,y0,totalZ],v2:[x0,y1,totalZ]});
      triangles.push({v0:[x1,y0,totalZ],v1:[x1,y1,totalZ],v2:[x0,y1,totalZ]});
    }
    surfaces.push({ tag: 999, triangles });
  }
  const roleMap = new Map();
  roleMap.set(1, 'source'); roleMap.set(999, 'aperture');
  for (let seg = 0; seg < segs.length - 1; seg++) { roleMap.set(100+seg,'wall'); roleMap.set(200+seg,'wall'); }
  const elementCount = surfaces.reduce((s, sf) => s + sf.triangles.length, 0);
  const nLast = segs.length - 1;
  const maxEdge = Math.max(
    Ws[nLast] / divForSize(Ws[nLast], targetApertureSize_mm, transMin),
    Hs[nLast] / divForSize(Hs[nLast], targetApertureSize_mm, transMin),
  );
  return { surfaces, roleMap, totalLength_mm: totalZ, elementCount, maxElementSize_mm: maxEdge };
}

// -------------------------------------------------------
//  Minimal PNG encoder
// -------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); t[n]=c>>>0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i=0;i<buf.length;i++) c=CRC_TABLE[(c^buf[i])&0xff]^(c>>>8); return (c^0xffffffff)>>>0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { raw[y*(stride+1)] = 0; rgba.copy(raw, y*(stride+1)+1, y*stride, y*stride+stride); }
  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

function drawLine(rgba, W, H, x0, y0, x1, y1, color) {
  let dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0|0, y = y0|0;
  while (true) {
    if (x >= 0 && x < W && y >= 0 && y < H) {
      const i = (y*W + x) * 4;
      rgba[i] = color[0]; rgba[i+1] = color[1]; rgba[i+2] = color[2]; rgba[i+3] = 255;
    }
    if (x === x1 && y === y1) break;
    const e2 = 2*err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
}
function drawLineThick(rgba, W, H, x0, y0, x1, y1, color, thickness=2) {
  for (let dy = -Math.floor(thickness/2); dy <= Math.floor(thickness/2); dy++)
    for (let dx = -Math.floor(thickness/2); dx <= Math.floor(thickness/2); dx++)
      drawLine(rgba, W, H, x0+dx, y0+dy, x1+dx, y1+dy, color);
}
function drawText(rgba, W, H, x, y, text, color) {
  // 5x7 pixel font for digits, '-', '.', 'k', 'H', 'z', 'd', 'B', ':', space
  const font = {
    '0':'01110 10001 10011 10101 11001 10001 01110','1':'00100 01100 00100 00100 00100 00100 01110',
    '2':'01110 10001 00001 00010 00100 01000 11111','3':'11110 00001 00001 01110 00001 00001 11110',
    '4':'00010 00110 01010 10010 11111 00010 00010','5':'11111 10000 11110 00001 00001 10001 01110',
    '6':'01110 10001 10000 11110 10001 10001 01110','7':'11111 00001 00010 00100 01000 01000 01000',
    '8':'01110 10001 10001 01110 10001 10001 01110','9':'01110 10001 10001 01111 00001 10001 01110',
    '-':'00000 00000 00000 11111 00000 00000 00000','.':'00000 00000 00000 00000 00000 00000 00100',
    'k':'10000 10010 10100 11000 10100 10010 10001','H':'10001 10001 10001 11111 10001 10001 10001',
    'z':'11111 00010 00100 01000 10000 11111 00000','d':'00001 00001 01111 10001 10001 10001 01111',
    'B':'11110 10001 10001 11110 10001 10001 11110',':':'00000 00100 00000 00000 00100 00000 00000',
    'S':'01111 10000 10000 01110 00001 00001 11110','P':'11110 10001 10001 11110 10000 10000 10000',
    'L':'10000 10000 10000 10000 10000 10000 11111','A':'01110 10001 10001 11111 10001 10001 10001',
    'M':'10001 11011 10101 10001 10001 10001 10001','R':'11110 10001 10001 11110 10100 10010 10001',
    'e':'00000 00000 01110 10001 11111 10000 01110','f':'00110 01001 01000 11110 01000 01000 01000',
    't':'01000 11100 01000 01000 01000 01001 00110','/':'00001 00001 00010 00100 01000 10000 10000',
    'x':'00000 00000 10001 01010 00100 01010 10001','w':'10001 10001 10001 10101 10101 11011 10001',
    '1p':'01100 00100 00100 00100 00100 00100 01110', // placeholder
    '(':'00010 00100 01000 01000 01000 00100 00010', ')':'01000 00100 00010 00010 00010 00100 01000',
    'Q':'01110 10001 10001 10001 10101 10010 01101','b':'10000 10000 11110 10001 10001 10001 11110',
    'q':'01111 10001 10001 01111 00001 00001 00001','r':'10110 11001 10000 10000 10000 10000 10000',
    'F':'11111 10000 10000 11110 10000 10000 10000','u':'00000 00000 10001 10001 10001 10011 01101',
    'n':'00000 00000 10110 11001 10001 10001 10001','a':'00000 00000 01110 00001 01111 10001 01111',
    'o':'00000 00000 01110 10001 10001 10001 01110','i':'00100 00000 01100 00100 00100 00100 01110',
    's':'00000 00000 01111 10000 01110 00001 11110','h':'10000 10000 10110 11001 10001 10001 10001',
    'g':'00000 00000 01111 10001 01111 00001 01110','l':'01100 00100 00100 00100 00100 00100 01110',
    'p':'00000 00000 11110 10001 11110 10000 10000','m2':'10001 11011 10101 10001 10001 10001 10001',
    'y':'10001 10001 01010 00100 00100 00100 00100','c':'01110 10001 10000 10000 10000 10001 01110',
    ' ':'00000 00000 00000 00000 00000 00000 00000',
    ',':'00000 00000 00000 00000 00100 00100 01000','=':'00000 00000 11111 00000 11111 00000 00000',
    '[':'01110 01000 01000 01000 01000 01000 01110',']':'01110 00010 00010 00010 00010 00010 01110',
  };
  for (let ci = 0; ci < text.length; ci++) {
    const ch = text[ci];
    const glyph = font[ch] || font[' '];
    const rows = glyph.split(' ');
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      if (rows[r][c] === '1') {
        const px = x + ci*6 + c, py = y + r;
        if (px>=0 && px<W && py>=0 && py<H) {
          const i = (py*W + px)*4;
          rgba[i]=color[0]; rgba[i+1]=color[1]; rgba[i+2]=color[2]; rgba[i+3]=255;
        }
      }
    }
  }
}

function renderSPL(curve, freqsLog, splMin, splMax, W=1200, H=600) {
  const padL = 70, padT = 40, padR = 30, padB = 60;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const rgba = Buffer.alloc(W*H*4, 0);
  // Background
  for (let i = 0; i < rgba.length; i += 4) { rgba[i]=15; rgba[i+1]=16; rgba[i+2]=22; rgba[i+3]=255; }

  const logFMin = Math.log10(freqsLog[0]);
  const logFMax = Math.log10(freqsLog[freqsLog.length-1]);
  const xOf = f => padL + (Math.log10(f) - logFMin) / (logFMax - logFMin) * plotW;
  const yOf = spl => padT + (1 - (spl - splMin) / (splMax - splMin)) * plotH;

  // Grid lines: every 5 dB
  for (let spl = Math.ceil(splMin/5)*5; spl <= splMax; spl += 5) {
    const y = Math.round(yOf(spl));
    const col = (spl % 10 === 0) ? [70,75,90] : [45,48,60];
    for (let x = padL; x <= padL+plotW; x++) {
      const i=(y*W+x)*4; rgba[i]=col[0]; rgba[i+1]=col[1]; rgba[i+2]=col[2]; rgba[i+3]=255;
    }
    drawText(rgba, W, H, padL - 32, y - 3, String(spl), [180,180,200]);
  }
  // Freq ticks
  const allTicks = [50,75,100,150,200,300,400,500,700,1000,1500,2000,3000,5000,7000,10000,15000,20000];
  for (const f of allTicks) {
    if (f < freqsLog[0]*0.999 || f > freqsLog[freqsLog.length-1]*1.001) continue;
    const x = Math.round(xOf(f));
    for (let y = padT; y <= padT+plotH; y++) {
      const i=(y*W+x)*4; rgba[i]=40; rgba[i+1]=42; rgba[i+2]=55; rgba[i+3]=255;
    }
    const label = f >= 1000 ? `${f/1000}k` : String(f);
    drawText(rgba, W, H, x - label.length*3, padT+plotH+8, label, [180,180,200]);
  }
  // Frame
  for (let x=padL;x<=padL+plotW;x++){const i=((padT)*W+x)*4;rgba[i]=150;rgba[i+1]=150;rgba[i+2]=160;rgba[i+3]=255;const j=((padT+plotH)*W+x)*4;rgba[j]=150;rgba[j+1]=150;rgba[j+2]=160;rgba[j+3]=255;}
  for (let y=padT;y<=padT+plotH;y++){const i=(y*W+padL)*4;rgba[i]=150;rgba[i+1]=150;rgba[i+2]=160;rgba[i+3]=255;const j=(y*W+padL+plotW)*4;rgba[j]=150;rgba[j+1]=150;rgba[j+2]=160;rgba[j+3]=255;}

  // Curve
  const red = [244, 63, 94];
  for (let i = 1; i < curve.length; i++) {
    const x0 = Math.round(xOf(curve[i-1].f));
    const y0 = Math.round(yOf(curve[i-1].spl));
    const x1 = Math.round(xOf(curve[i].f));
    const y1 = Math.round(yOf(curve[i].spl));
    drawLineThick(rgba, W, H, x0, y0, x1, y1, red, 2);
  }

  // Titles
  drawText(rgba, W, H, padL, 10, `SPL 1w/1m dB`, [210,210,220]);
  drawText(rgba, W, H, W/2 - 40, H - 20, `Frequency Hz`, [180,180,200]);
  return rgba;
}

// -------------------------------------------------------
//  BEM + coupling
// -------------------------------------------------------
const segs = makeSegs(6);
const mesh = buildHornQuarterMesh(segs, {
  targetWallSize_mm: wallMm,
  targetSourceSize_mm: sourceMm,
  targetApertureSize_mm: wallMm,
});
const elements = buildElements(mesh.surfaces, 0.001, mesh.roleMap);

// Horn throat area (full, not quarter): Ws[0] * Hs[0] * 4 = (100 * 56) mm² = 5600 mm² = 0.0056 m²
const throatArea_m2 = (100 * 56) * 1e-6;
const hornLength_m = mesh.totalLength_mm * 1e-3;
console.log(`[spl] Mesh: ${mesh.elementCount} triangles, St = ${(throatArea_m2*1e4).toFixed(1)} cm², Sd/St = ${(driver.Sd_m2/throatArea_m2).toFixed(2)}`);

// Frequency grid (log, ppo per octave)
const freqs = [];
{
  const nSteps = Math.round(Math.log2(fMax / fMin) * ppo);
  for (let i = 0; i <= nSteps; i++) freqs.push(Math.round(Math.pow(2, Math.log2(fMin) + i / ppo)));
}
console.log(`[spl] Sweep ${freqs.length} freqs from ${freqs[0]} to ${freqs[freqs.length-1]} Hz`);

const curve = [];
const t0 = performance.now();
for (let fi = 0; fi < freqs.length; fi++) {
  const f = freqs[fi];
  const omega = 2 * Math.PI * f;
  const tf = performance.now();

  // BEM with unit throat velocity.  Aperture BC:
  //   default: Z=ρc (locally-reacting plane-wave absorber) — matches Akabak's
  //            horn cutoff transition best.
  //   --baffledZ: baffled-piston radiation Z (J1/StruveH1) — gives flatter LF
  //            at the expense of sharper cutoff.
  const sol = solveBEM(f, elements, 1, 'HV', undefined, {
    apertureBaffled: args.includes('--baffledZ'),
  });

  // Source force (complex), full-horn value (×4 mirror).  Per unit v_throat.
  const F = computeSourceForce(elements, sol.pressure, 'HV', 'source');
  // Mechanical load on driver diaphragm: Z_mec_load = F · (Sd/St)²
  const SR = srOverride !== null ? srOverride : (driver.Sd_m2 / throatArea_m2);
  const ZloadRe = F.re * SR * SR;
  const ZloadIm = F.im * SR * SR;

  // On-axis complex pressure at 1 m, 4π free-field, per unit v_throat.
  // Field point 1 m in front of the mouth on the axis (z = L + 1).
  // Rayleigh-I monopole-only from aperture (piston-in-baffle, matches Akabak's
  // far-field assumption for mouth-plane radiation).
  const pt = [0, 0, hornLength_m + 1];
  const p1m = computeFieldPressure(pt, sol.k, elements, sol.pressure, sol.normalDerivative, 'HV', { monopoleOnly: true, apertureOnly: true });

  // Driver coupled system (RMS-domain complex):
  //  V = I·(Re + jωLe) + BL·v_cone
  //  BL·I = [jωMms + Rms + Kms/(jω) + Z_mec_load] · v_cone
  // Solve for v_cone:
  //  v_cone = (BL·V/Ze) / [Zm + Z_mec_load + BL²/Ze]
  const ZeRe = driver.Re, ZeIm = omega * driver.Le;
  const ZmRe = driver.Rms,                                            ZmIm = omega*driver.Mms - driver.Kms/omega;
  // BL²/Ze (complex division)
  const ZeMag2 = ZeRe*ZeRe + ZeIm*ZeIm;
  const BL2_Ze_Re =  (driver.BL*driver.BL) * ZeRe / ZeMag2;
  const BL2_Ze_Im = -(driver.BL*driver.BL) * ZeIm / ZeMag2;
  const denomRe = ZmRe + ZloadRe + BL2_Ze_Re;
  const denomIm = ZmIm + ZloadIm + BL2_Ze_Im;
  // BL·V/Ze (V real, Ze complex)
  const numRe =  driver.BL * vRMS * ZeRe / ZeMag2;
  const numIm = -driver.BL * vRMS * ZeIm / ZeMag2;
  // v_cone = num / denom
  const denomMag2 = denomRe*denomRe + denomIm*denomIm;
  const vconeRe = (numRe*denomRe + numIm*denomIm) / denomMag2;
  const vconeIm = (numIm*denomRe - numRe*denomIm) / denomMag2;
  // v_throat = v_cone · Sd/St (complex, but Sd/St real)
  const vtRe = vconeRe * SR, vtIm = vconeIm * SR;
  // p at 1m, 4π: p1m_actual = v_throat · p1m_per_v
  const p1mRe = vtRe*p1m.re - vtIm*p1m.im;
  const p1mIm = vtRe*p1m.im + vtIm*p1m.re;
  const p1mMag = Math.sqrt(p1mRe*p1mRe + p1mIm*p1mIm);
  // Infinite baffle +6 dB (2π radiation) = ×2 pressure.
  const pFinal = p1mMag * Math.pow(10, baffleGainDB / 20);
  const spl = 20 * Math.log10(Math.max(1e-12, pFinal) / P_REF);

  curve.push({
    f, spl,
    vcone: Math.sqrt(vconeRe*vconeRe + vconeIm*vconeIm),
    zloadRe: ZloadRe, zloadIm: ZloadIm,
    fmag: Math.sqrt(F.re*F.re + F.im*F.im),
    p1m_re: p1m.re, p1m_im: p1m.im,
  });

  if (fi % Math.max(1, Math.floor(freqs.length/10)) === 0 || fi === freqs.length - 1) {
    console.log(`  f=${String(f).padStart(5)} Hz  SPL=${spl.toFixed(1)} dB   vcone=${curve[curve.length-1].vcone.toFixed(3)} m/s   ${(performance.now() - tf).toFixed(0)} ms`);
  }
}
console.log(`[spl] Total: ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// -------------------------------------------------------
//  Output: PNG SPL + JSON
// -------------------------------------------------------
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

// Auto scale Y axis to 80..120 dB or actual range +- margin
let splMinDyn = Math.min(...curve.map(c => c.spl));
let splMaxDyn = Math.max(...curve.map(c => c.spl));
const splMin = Math.floor((splMinDyn - 5) / 5) * 5;
const splMax = Math.ceil ((splMaxDyn + 5) / 5) * 5;
console.log(`[spl] SPL range observed: ${splMinDyn.toFixed(1)} .. ${splMaxDyn.toFixed(1)} dB`);

const rgba = renderSPL(curve, freqs, splMin, splMax, 1200, 600);
const png = encodePNG(1200, 600, rgba);
const outPng = path.join(outDir, `${runtag}_SPL.png`);
fs.writeFileSync(outPng, png);
fs.writeFileSync(path.join(outDir, `${runtag}_spl.json`), JSON.stringify({
  runtag, driver, horn: { throat:[100,56], mouth:[400,226], length:500, segs:6 },
  vRMS, baffleGainDB, throatArea_m2,
  mesh: { count: mesh.elementCount, maxEdge_mm: mesh.maxElementSize_mm },
  curve,
}, null, 2));

console.log(`[spl] Wrote ${outPng}`);
