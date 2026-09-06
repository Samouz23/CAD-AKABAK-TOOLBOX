// =======================================================
// FICHIER :  src/js/bem/bemHornBackend.js
// RÔLE    :  Backend BEM « auto » pour la directivité de pavillon.
//            À partir des segments rectangulaires issus de Horn Studio,
//            ce module :
//              1. génère automatiquement un QUART de maillage (x≥0, y≥0)
//                 avec rôles auto-assignés :
//                    • gorge (z = 0)     → source (piston)
//                    • parois latérales  → wall (rigide)
//                    • bouche (z = L)    → aperture (Robin Z = ρc)
//              2. résout le BEM avec symétrie HV (mirror Greens)
//                 → matrice N×N d'un quart, champ complet reconstitué.
//              3. calcule la directivité H et V (±90°) et la SPL axiale
//                 à plusieurs fréquences — rendu en quelques secondes.
//
//  Le calcul est exécuté dans un Web Worker (bemWorker.js) pour ne
//  jamais bloquer le thread UI principal.
// =======================================================

import { C_AIR } from './bemCore.js';

// ============================================================
// WORKER POOL
// ------------------------------------------------------------
// Une seule fois on fetch le source du worker et on le met dans un Blob URL
// (CSP: worker-src blob:). Puis on instancie N workers pour paralléliser le
// calcul des fréquences sur tous les cœurs CPU.
// ============================================================
let _workerBlobUrl = null;
let _pool = null;            // array of Worker
let _poolSize = 0;
let _jobSeq = 0;

// Sources concaténées dans le blob, dans cet ordre. bemShared.js doit venir en
// premier : il définit les primitives (noyaux, quadrature, LU, parseMSH) que
// bemWorker.js consomme. Un worker classique ne peut pas faire d'`import`, la
// concaténation remplace donc le module system — mais sans recopier le code,
// contrairement à la situation précédente où les noyaux étaient triplés.
const WORKER_SOURCES = [
  './js/bem/bemShared.js',
  './js/bem/bemWorker.js',
];

async function getWorkerBlobUrl() {
  if (_workerBlobUrl) return _workerBlobUrl;
  const parts = [];
  for (const path of WORKER_SOURCES) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} fetch failed: ${res.status}`);
    parts.push(`// ==== ${path} ====\n` + await res.text());
  }
  const blob = new Blob([parts.join('\n\n')], { type: 'application/javascript' });
  _workerBlobUrl = URL.createObjectURL(blob);
  return _workerBlobUrl;
}

/**
 * Crée (ou récupère) un pool de N workers. N = hardwareConcurrency - 2,
 * borné entre 1 et 32 pour éviter de saturer sur de gros CPU.
 * Le pool est ré-utilisé entre runs pour éviter le coût de démarrage.
 */
async function getPool(desiredSize) {
  const url = await getWorkerBlobUrl();
  const target = Math.max(1, Math.min(32, desiredSize));
  if (_pool && _poolSize === target) return _pool;
  if (_pool) {
    // Resize: kill & recreate (rare)
    for (const w of _pool) w.terminate();
    _pool = null; _poolSize = 0;
  }
  _pool = [];
  for (let i = 0; i < target; i++) _pool.push(new Worker(url));
  _poolSize = target;
  return _pool;
}

// Budget mémoire total consenti aux matrices denses du solveur couplé, toutes
// instances de worker confondues.
const COUPLED_MEMORY_BUDGET_BYTES = 768 * 1024 * 1024;

/**
 * Nombre d'éléments annoncé par l'en-tête `$Elements` du .msh. C'est une borne
 * supérieure (elle compte aussi les éléments non triangulaires), ce qui est
 * exactement ce qu'on veut pour dimensionner une réserve mémoire.
 */
function estimateMshElementCount(msh) {
  const i = msh.indexOf('$Elements');
  if (i < 0) return 2000;
  const nl = msh.indexOf('\n', i);
  const n = parseInt((msh.slice(nl + 1, nl + 40).match(/\d+/) || [])[0], 10);
  return Number.isFinite(n) && n > 0 ? n : 2000;
}

function defaultPoolSize() {
  const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  // On garde 2 threads pour l'UI + système. Sur 32T → 30 workers.
  return Math.max(1, hc - 2);
}

/**
 * Fréquence max valide pour le maillage (règle λ/3 conservatrice).
 */
export function maxValidFrequency(maxElementSize_mm) {
  const edge_m = maxElementSize_mm / 1000;
  if (edge_m <= 0) return 20000;
  return C_AIR / (3 * edge_m);
}

/**
 * Sélectionne un jeu de fréquences dans la plage utile, centré sur les octaves.
 * Les valeurs ne sont PAS arrondies : Akabak balaie en log pur et ses exports
 * portent la fréquence exacte, indispensable pour superposer les courbes.
 */
export function pickAutoFrequencies(fMin = 125, fMax = 4000, stepsPerOctave = 1) {
  const freqs = [];
  const logMin = Math.log2(fMin), logMax = Math.log2(fMax);
  const nSteps = Math.max(1, Math.round((logMax - logMin) * stepsPerOctave));
  for (let i = 0; i <= nSteps; i++) {
    const logF = logMin + (i / nSteps) * (logMax - logMin);
    freqs.push(Math.pow(2, logF));
  }
  return freqs;
}

/**
 * Lance le pipeline complet (mesh → solve BEM multi-fréquences → polaires H/V)
 * DANS UN WORKER SÉPARÉ. L'UI reste entièrement réactive.
 *
 * @returns {Promise<{
 *   freqs:number[], polarH:{f,angles,normalized}[], polarV:{f,angles,normalized}[],
 *   meshInfo:{elementCount:number, totalLength_mm:number, maxElementSize_mm:number, fMaxValid_Hz:number},
 *   aborted:boolean
 * }>}
 */
export async function computeBemDirectivity(segs, {
  freqs,
  mouthVelocity = 1,
  distance_m = 10,
  angleStep = 2,
  angleMax = 90,
  targetElementSize_mm,
  targetWallSize_mm,
  targetSourceSize_mm,
  targetApertureSize_mm,
  // Maillage Gmsh réel de Waveguide Studio, en mémoire. Quand il est fourni,
  // le worker résout le problème couplé intérieur / baffle infini dessus au
  // lieu de reconstruire un maillage paramétrique approximatif.
  mshContent = null,
  splitH = true,
  splitV = true,
  onProgress,
  shouldAbort,
  poolSize,
} = {}) {
  const list = (freqs && freqs.length) ? freqs.slice() : [250, 500, 1000, 2000, 4000];
  // Sort desc: HF generally slower → worker that gets the first job starts hardest
  list.sort((a, b) => b - a);

  // Le solveur couplé alloue une matrice dense complexe de 16·Nt² octets PAR
  // worker. À Nt ~ 1200 cela fait 23 Mo chacun : sans plafond, 30 workers
  // demanderaient ~700 Mo et feraient échouer l'allocation. On borne donc le
  // pool sur une estimation du nombre d'éléments lue dans l'en-tête du .msh.
  let memCap = Infinity;
  if (mshContent) {
    const nTri = estimateMshElementCount(mshContent);
    const bytesPerWorker = 16 * Math.pow(nTri * 1.15, 2); // marge pour le bloc u
    memCap = Math.max(1, Math.floor(COUPLED_MEMORY_BUDGET_BYTES / Math.max(bytesPerWorker, 1)));
  }
  const size = Math.max(1, Math.min(list.length, poolSize || defaultPoolSize(), memCap));
  const pool = await getPool(size);
  const jobIdBase = (++_jobSeq) * 10000;

  // Partition freqs round-robin: worker w gets indices w, w+size, w+2*size...
  const subsets = Array.from({ length: size }, () => []);
  for (let i = 0; i < list.length; i++) subsets[i % size].push(list[i]);

  // Shared abort flag
  let aborted = false;
  let abortChecker = null;
  if (shouldAbort) {
    abortChecker = setInterval(() => {
      if (shouldAbort()) {
        aborted = true;
        for (let w = 0; w < pool.length; w++) {
          pool[w].postMessage({ type: 'abort', id: jobIdBase + w });
        }
        clearInterval(abortChecker); abortChecker = null;
      }
    }, 100);
  }

  // Track overall progress across all workers
  const doneByWorker = new Array(size).fill(0);
  const subProgressByWorker = new Array(size).fill(0);
  const totalFreqs = list.length;
  let meshInfo = null;
  let progressThrottle = 0;

  const emitProgress = (ev) => {
    if (!onProgress) return;
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (ev && ev.phase === 'freqDone') {
      // always flush freqDone
      onProgress(ev);
      progressThrottle = now;
      return;
    }
    if (now - progressThrottle < 50) return;
    progressThrottle = now;
    onProgress(ev);
  };

  const workerPromises = pool.map((worker, w) => new Promise((resolve, reject) => {
    const wid = jobIdBase + w;
    const mine = subsets[w];
    if (!mine.length) return resolve({ polarH: [], polarV: [], aborted: false });

    const partialH = [], partialV = [];
    let localDone = 0;

    const onMessage = (e) => {
      const msg = e.data;
      if (!msg || msg.id !== wid) return;
      if (msg.type === 'progress') {
        const ev = msg.ev || {};
        if (ev.phase === 'meshReady' && !meshInfo) {
          meshInfo = ev.meshInfo;
        }
        if (ev.phase === 'solve') {
          subProgressByWorker[w] = (localDone + (ev.subProgress || 0)) / mine.length;
          const overallDone = doneByWorker.reduce((s, v) => s + v, 0);
          emitProgress({
            phase: 'solve',
            freq: ev.freq,
            freqIndex: overallDone,
            freqCount: totalFreqs,
            subProgress: 0, // overall progress baked in freqIndex
            workers: size,
          });
        }
        if (ev.phase === 'freqDone') {
          localDone++;
          doneByWorker[w] = localDone;
          // Capture each solution's polars from the worker's accumulated results?
          // Easier: worker already posts 'done' with its slice; we combine at the end.
          const overallDone = doneByWorker.reduce((s, v) => s + v, 0);
          emitProgress({
            phase: 'freqDone',
            freq: ev.freq,
            freqIndex: overallDone - 1,
            freqCount: totalFreqs,
            elapsed_ms: ev.elapsed_ms,
            workers: size,
          });
        }
      } else if (msg.type === 'done') {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        resolve(msg.result);
      } else if (msg.type === 'error') {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        reject(new Error(msg.message));
      }
    };
    const onError = (e) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      reject(new Error(e.message || 'Worker error'));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    worker.postMessage({
      type: 'compute',
      id: wid,
      segs,
      opts: {
        freqs: mine, mouthVelocity, distance_m, angleStep, angleMax,
        targetElementSize_mm,
        targetWallSize_mm,
        targetSourceSize_mm,
        targetApertureSize_mm,
        mshContent,
        splitH,
        splitV,
      },
    });
  }));

  let results;
  try {
    results = await Promise.all(workerPromises);
  } finally {
    if (abortChecker) { clearInterval(abortChecker); abortChecker = null; }
  }

  // Merge & sort by frequency ascending
  const polarH = [];
  const polarV = [];
  const splRaw = [];
  let sourceArea_m2 = 0, apertureArea_m2 = 0, hornLength_m = 0;
  for (const r of results) {
    if (!r) continue;
    if (r.aborted) aborted = true;
    if (r.polarH) polarH.push(...r.polarH);
    if (r.polarV) polarV.push(...r.polarV);
    if (r.splRaw) splRaw.push(...r.splRaw);
    if (r.meshInfo && !meshInfo) meshInfo = r.meshInfo;
    if (r.sourceArea_m2)   sourceArea_m2   = r.sourceArea_m2;
    if (r.apertureArea_m2) apertureArea_m2 = r.apertureArea_m2;
    if (r.hornLength_m)    hornLength_m    = r.hornLength_m;
  }
  polarH.sort((a, b) => a.f - b.f);
  polarV.sort((a, b) => a.f - b.f);
  splRaw.sort((a, b) => a.f - b.f);

  return {
    freqs: polarH.map(p => p.f),
    polarH, polarV, splRaw,
    sourceArea_m2, apertureArea_m2, hornLength_m,
    meshInfo: meshInfo || { elementCount: 0, totalLength_mm: 0, maxElementSize_mm: 0, fMaxValid_Hz: 20000 },
    aborted,
  };
}

/**
 * Pure main-thread helper — couples per-freq BEM raw data (F, p1m) with a
 * Thiele-Small driver to produce axial SPL at 1 m.
 *
 * @param splRaw  Array of {f, F_re, F_im, p1m_re, p1m_im}
 * @param sourceArea_m2  Mesh throat area (total, full horn), m²
 * @param driver  { Re, Le[mH], BL, Mms[g], SDf[cm²], Cms?[mm/N], Kms?, Rms?, fs?, Qms? }
 * @param vRMS  drive voltage RMS (default 2.83 V → 1 W / 8 Ω)
 * @param baffleGainDB  half-space gain (6 for flush-mounted, 0 else)
 * @returns {{freqs:number[], splDb:number[]}}
 */
export function coupleSPLFromRaw(splRaw, sourceArea_m2, driver, vRMS = 2.83, baffleGainDB = 6) {
  const Sd_cm2 = Number(driver.SDf || driver.Sd || 0);
  const Sd_m2  = Sd_cm2 * 1e-4;
  const St_m2  = sourceArea_m2;
  const SR     = (St_m2 > 0 && Sd_m2 > 0) ? (Sd_m2 / St_m2) : 1;
  const Re  = Number(driver.Re  || 6);
  const Le  = Number(driver.Le  || 0) * 1e-3;
  const BL  = Number(driver.BL  || 10);
  const Mms = Number(driver.Mms || 20) * 1e-3;
  const Rms = Number(driver.Rms || 0);
  let Kms = 0;
  if (driver.Cms)      Kms = 1 / (Number(driver.Cms) * 1e-3);
  else if (driver.Kms) Kms = Number(driver.Kms);
  else if (driver.fs)  Kms = Mms * Math.pow(2 * Math.PI * Number(driver.fs), 2);
  let RmsEff = Rms;
  if (!(RmsEff > 0) && driver.Qms && driver.fs) {
    RmsEff = (2 * Math.PI * Number(driver.fs) * Mms) / Number(driver.Qms);
  }
  const baffleGainLinear = Math.pow(10, baffleGainDB / 20);
  const freqs = splRaw.map(r => r.f);
  const splDb = new Array(splRaw.length);
  for (let i = 0; i < splRaw.length; i++) {
    const f = splRaw[i].f;
    const w = 2 * Math.PI * f;
    const ZmRe = RmsEff;
    const ZmIm = w * Mms - Kms / w;
    const ZeRe = Re;
    const ZeIm = w * Le;
    const ZloadRe = splRaw[i].F_re * SR * SR;
    const ZloadIm = splRaw[i].F_im * SR * SR;
    const Ze2 = ZeRe * ZeRe + ZeIm * ZeIm;
    const BLsqOverZeRe =  (BL * BL) * ZeRe / Ze2;
    const BLsqOverZeIm = -(BL * BL) * ZeIm / Ze2;
    const DRe = ZmRe + ZloadRe + BLsqOverZeRe;
    const DIm = ZmIm + ZloadIm + BLsqOverZeIm;
    const NRe =  BL * vRMS * ZeRe / Ze2;
    const NIm = -BL * vRMS * ZeIm / Ze2;
    const D2 = DRe * DRe + DIm * DIm;
    const vConeRe = (NRe * DRe + NIm * DIm) / D2;
    const vConeIm = (NIm * DRe - NRe * DIm) / D2;
    const vThRe = vConeRe * SR;
    const vThIm = vConeIm * SR;
    const pRe = splRaw[i].p1m_re * vThRe - splRaw[i].p1m_im * vThIm;
    const pIm = splRaw[i].p1m_re * vThIm + splRaw[i].p1m_im * vThRe;
    const pMag = Math.sqrt(pRe * pRe + pIm * pIm) * baffleGainLinear;
    splDb[i] = 20 * Math.log10(pMag / 2e-5);
  }
  return { freqs, splDb, SR, Sd_cm2, St_cm2: St_m2 * 1e4 };
}

/**
 * Interpolation (en pression normalisée) d'une polaire BEM à une fréquence
 * arbitraire entre les fréquences discrètes calculées.
 */
export function interpolateBemPolar(bemResults, plane, freq) {
  const table = plane === 'V' ? bemResults.polarV : bemResults.polarH;
  if (!table || !table.length) return null;
  if (freq <= table[0].f) return { angles: table[0].angles, normalized: table[0].normalized };
  if (freq >= table[table.length - 1].f) {
    const last = table[table.length - 1];
    return { angles: last.angles, normalized: last.normalized };
  }
  let lo = 0;
  for (let i = 0; i < table.length - 1; i++) {
    if (table[i].f <= freq && freq <= table[i + 1].f) { lo = i; break; }
  }
  const a = table[lo], b = table[lo + 1];
  const t = (Math.log2(freq) - Math.log2(a.f)) / (Math.log2(b.f) - Math.log2(a.f));
  const normalized = a.normalized.map((v, i) => v * (1 - t) + b.normalized[i] * t);
  return { angles: a.angles, normalized };
}

/**
 * Cherche la largeur -6 dB (full beamwidth) dans une polaire normalisée.
 */
export function polarBeamwidthMinus6(polar) {
  if (!polar || !polar.angles || polar.angles.length < 3) return 180;
  const target = Math.pow(10, -6 / 20);
  const n = polar.angles.length;
  const zeroIdx = polar.angles.indexOf(0);
  const findCross = (start, step) => {
    let prev = polar.normalized[start];
    let prevA = polar.angles[start];
    for (let i = start + step; i >= 0 && i < n; i += step) {
      const v = polar.normalized[i];
      const a = polar.angles[i];
      if (v <= target) {
        const t = (prev - target) / Math.max(1e-9, (prev - v));
        return prevA + t * (a - prevA);
      }
      prev = v; prevA = a;
    }
    return polar.angles[step > 0 ? n - 1 : 0];
  };
  const pos = Math.abs(findCross(zeroIdx >= 0 ? zeroIdx : 0, +1));
  const neg = Math.abs(findCross(zeroIdx >= 0 ? zeroIdx : n - 1, -1));
  return Math.min(180, pos + neg);
}
