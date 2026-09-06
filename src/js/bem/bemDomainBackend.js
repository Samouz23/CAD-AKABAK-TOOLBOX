// =======================================================
// FICHIER :  src/js/bem/bemDomainBackend.js
// RÔLE    :  Façade thread principal du solveur BEM multi-domaine.
//            Construit le blob du worker (bemShared + bemDomainCore +
//            bemGalerkin + bemDomainWorker), répartit les fréquences sur un
//            pool adaptatif, puis fusionne les résultats dans l'ordre croissant.
// =======================================================

const DOMAIN_WORKER_SOURCES = [
  './js/bem/bemShared.js',
  './js/bem/bemDomainCore.js',
  './js/bem/bemGalerkin.js',
  './js/bem/bemDomainWorker.js',
];

let _blobUrl = null;
let _pool = [];
let _jobSeq = 0;
let _activeJobId = null;
let _activeAbort = null;

// Matrice complexe A: 16*Nt² octets. La marge couvre les vecteurs, le modèle,
// le tas JS et les allocations temporaires de chaque worker.
const DOMAIN_MEMORY_BUDGET_BYTES = 1536 * 1024 * 1024;
const DOMAIN_BYTES_PER_UNKNOWN_SQUARED = 24;

async function getBlobUrl() {
  if (_blobUrl) return _blobUrl;
  const parts = [];
  for (const path of DOMAIN_WORKER_SOURCES) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} fetch failed: ${res.status}`);
    parts.push(`// ==== ${path} ====\n` + await res.text());
  }
  _blobUrl = URL.createObjectURL(new Blob([parts.join('\n\n')], { type: 'application/javascript' }));
  return _blobUrl;
}

async function getPool(size) {
  const target = Math.max(1, Math.min(32, size));
  if (_pool.length === target) return _pool;
  _pool.forEach(worker => worker.terminate());
  const url = await getBlobUrl();
  _pool = Array.from({ length: target }, () => new Worker(url));
  return _pool;
}

function defaultPoolSize() {
  const threads = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  return Math.max(1, threads - 2);
}

function estimateUnknownCount(mshContent, config) {
  const physical = new Set();
  const elementary = new Set();
  for (const item of [...(config.subdomains || []), ...(config.interfaces || [])]) {
    for (const surface of item.surfaces || []) {
      const [kind, rawTag] = String(surface.surfaceId || '').split(':');
      const tag = parseInt(rawTag, 10);
      if (!Number.isFinite(tag)) continue;
      (kind === 'p' ? physical : elementary).add(tag);
    }
  }

  const lines = mshContent.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === '$Elements');
  if (start < 0) return 2000;
  const count = parseInt(lines[start + 1], 10) || 0;
  let assigned = 0;
  let interfaces = 0;
  const interfaceIds = new Set((config.interfaces || []).flatMap(item =>
    (item.surfaces || []).map(surface => surface.surfaceId)
  ));
  for (let index = start + 2; index < Math.min(lines.length, start + 2 + count); index++) {
    const parts = lines[index].trim().split(/\s+/).map(Number);
    if (parts[1] !== 2) continue;
    const numTags = parts[2] || 0;
    const physicalTag = numTags >= 1 ? parts[3] : null;
    const elementaryTag = numTags >= 2 ? parts[4] : null;
    const surfaceId = physical.has(physicalTag)
      ? `p:${physicalTag}`
      : (elementary.has(elementaryTag) ? `e:${elementaryTag}` : null);
    if (!surfaceId) continue;
    assigned++;
    if (interfaceIds.has(surfaceId)) interfaces++;
  }
  const diaphragmTris = (config.diaphragms || []).reduce((sum, d) => sum + (d.tris?.length || 0), 0);
  return Math.max(1, assigned + interfaces + diaphragmTris);
}

function choosePoolSize(mshContent, config, frequencyCount, requestedSize) {
  const unknowns = estimateUnknownCount(mshContent, config);
  const bytesPerWorker = DOMAIN_BYTES_PER_UNKNOWN_SQUARED * unknowns * unknowns;
  const memoryCap = Math.max(1, Math.floor(DOMAIN_MEMORY_BUDGET_BYTES / Math.max(1, bytesPerWorker)));
  return Math.max(1, Math.min(frequencyCount, requestedSize || defaultPoolSize(), memoryCap, 32));
}

/**
 * Résout le modèle multi-domaine.
 *
 * @param {string} mshContent      contenu brut du .msh importé
 * @param {object} config          { symmetry, subdomains[], interfaces[] } — voir bemDomainCore
 * @param {object} opts            { freqs[], distance_m, angleStep, angleMax, fields[], flowSurfaces[], onProgress }
 * @returns {Promise<{freqs, polarH, polarV, power, onAxis, drivenLoad, fieldResults, surfaceFlow, meshInfo, aborted}>}
 */
export async function solveBemDomains(mshContent, config, opts = {}) {
  const frequencies = (opts.freqs?.length ? opts.freqs : [1000]).slice().sort((a, b) => b - a);
  const poolSize = choosePoolSize(mshContent, config, frequencies.length, opts.poolSize);
  const pool = await getPool(poolSize);
  const id = ++_jobSeq;
  _activeJobId = id;

  return new Promise((resolve, reject) => {
    const subsets = Array.from({ length: poolSize }, () => []);
    frequencies.forEach((frequency, index) => subsets[index % poolSize].push(frequency));

    const doneByWorker = new Array(poolSize).fill(0);
    const prepareByWorker = new Array(poolSize).fill(0);
    let meshInfo = null;
    let prepareDiagnostics = null;
    let settled = false;
    let lastProgressAt = 0;
    const cancelWorkers = [];

    const emitProgress = (event, force = false) => {
      if (!opts.onProgress) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (!force && now - lastProgressAt < 50) return;
      lastProgressAt = now;
      opts.onProgress(event);
    };

    const finishError = (error) => {
      if (settled) return;
      settled = true;
      _pool.forEach(worker => worker.terminate());
      _pool = [];
      cancelWorkers.forEach(cancel => cancel(error));
      cleanupActiveJob(id);
      reject(error);
    };

    const workerPromises = pool.map((worker, workerIndex) => new Promise((workerResolve, workerReject) => {
      const workerId = id * 100 + workerIndex;
      const mine = subsets[workerIndex];
      let localDone = 0;

      const onMessage = (event) => {
        const msg = event.data;
        if (!msg || msg.id !== workerId) return;
        if (msg.type === 'progress') {
          const ev = msg.ev || {};
          if (ev.phase === 'meshReady' && !meshInfo) {
            meshInfo = ev.meshInfo;
            emitProgress({ ...ev, workers: poolSize }, true);
          } else if (ev.phase === 'prepare') {
            prepareByWorker[workerIndex] = ev.subProgress || 0;
            emitProgress({
              phase: 'prepare',
              subProgress: prepareByWorker.reduce((sum, value) => sum + value, 0) / poolSize,
              workers: poolSize,
            });
          } else if (ev.phase === 'prepareDone') {
            if (!prepareDiagnostics) prepareDiagnostics = ev.diagnostics;
          } else if (ev.phase === 'solve') {
            emitProgress({
              ...ev,
              freqIndex: doneByWorker.reduce((sum, value) => sum + value, 0),
              freqCount: frequencies.length,
              workers: poolSize,
            });
          } else if (ev.phase === 'freqDone') {
            localDone++;
            doneByWorker[workerIndex] = localDone;
            emitProgress({
              ...ev,
              freqIndex: doneByWorker.reduce((sum, value) => sum + value, 0) - 1,
              freqCount: frequencies.length,
              workers: poolSize,
            }, true);
          }
        } else if (msg.type === 'done') {
          cleanup();
          workerResolve(msg.result);
        } else if (msg.type === 'error') {
          cleanup();
          workerReject(new Error(msg.message));
        }
      };
      const onError = (error) => {
        cleanup();
        workerReject(new Error(error?.message || 'BEM worker crashed'));
      };
      function cleanup() {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      }
      cancelWorkers.push((error) => {
        cleanup();
        workerReject(error);
      });

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({
        type: 'computeDomain',
        id: workerId,
        mshContent,
        config,
        opts: {
          freqs: mine,
          distance_m: opts.distance_m,
          angleStep: opts.angleStep,
          angleMax: opts.angleMax,
          fields: opts.fields || [],
          flowSurfaces: opts.flowSurfaces || [],
        },
      });
    }));

    _activeAbort = () => finishError(new Error('BEM simulation aborted.'));

    Promise.all(workerPromises).then(results => {
      if (settled) return;
      settled = true;
      const merged = { freqs: [], polarH: [], polarV: [], power: [], onAxis: [], drivenLoad: [], fieldResults: [], surfaceFlow: [] };
      results.forEach(result => {
        merged.polarH.push(...(result.polarH || []));
        merged.polarV.push(...(result.polarV || []));
        merged.power.push(...(result.power || []));
        merged.onAxis.push(...(result.onAxis || []));
        merged.drivenLoad.push(...(result.drivenLoad || []));
        merged.fieldResults.push(...(result.fieldResults || []));
        merged.surfaceFlow.push(...(result.surfaceFlow || []));
      });
      for (const key of ['polarH', 'polarV', 'power', 'onAxis', 'drivenLoad', 'fieldResults', 'surfaceFlow']) {
        merged[key].sort((a, b) => a.f - b.f);
      }
      merged.freqs = merged.polarH.map(item => item.f);
      cleanupActiveJob(id);
      resolve({
        ...merged,
        meshInfo: meshInfo || results[0]?.meshInfo,
        prepareDiagnostics: prepareDiagnostics || results[0]?.prepareDiagnostics || [],
        workers: poolSize,
        aborted: false,
      });
    }).catch(finishError);
  });
}

function cleanupActiveJob(id) {
  if (_activeJobId !== id) return;
  _activeJobId = null;
  _activeAbort = null;
}

/**
 * Recalcule UNIQUEMENT les nappes d'observation, sur les fréquences déjà
 * résolues : chaque worker du pool a gardé ses solutions surfaciques, il ne
 * reste que l'intégrale de représentation à refaire.
 *
 * @param {Array} fields  [{ id, name, type, points_mm }]
 * @returns {Promise<{freqs, fieldResults, workers}>}
 */
export async function solveBemFields(fields, opts = {}) {
  if (!_pool.length) throw new Error('No BEM solution in memory — run Start Sim first.');
  const pool = _pool;
  const id = ++_jobSeq;
  _activeJobId = id;

  return new Promise((resolve, reject) => {
    let settled = false;
    let done = 0;
    const cancelWorkers = [];
    const finishError = (error) => {
      if (settled) return;
      settled = true;
      cancelWorkers.forEach(cancel => cancel(error));
      cleanupActiveJob(id);
      reject(error);
    };

    const workerPromises = pool.map((worker, workerIndex) => new Promise((workerResolve, workerReject) => {
      const workerId = id * 100 + workerIndex;
      const onMessage = (event) => {
        const msg = event.data;
        if (!msg || msg.id !== workerId) return;
        if (msg.type === 'progress') {
          done++;
          opts.onProgress?.({ ...msg.ev, freqIndex: done - 1, workers: pool.length });
        } else if (msg.type === 'done') {
          cleanup();
          workerResolve(msg.result);
        } else if (msg.type === 'error') {
          cleanup();
          workerReject(new Error(msg.message));
        }
      };
      const onError = (error) => {
        cleanup();
        workerReject(new Error(error?.message || 'BEM worker crashed'));
      };
      function cleanup() {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      }
      cancelWorkers.push((error) => { cleanup(); workerReject(error); });

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({ type: 'computeFields', id: workerId, opts: { fields } });
    }));

    _activeAbort = () => {
      pool.forEach((worker, i) => worker.postMessage({ type: 'abort', id: id * 100 + i }));
    };

    Promise.all(workerPromises).then(results => {
      if (settled) return;
      settled = true;
      const fieldResults = [];
      const freqs = [];
      results.forEach(result => {
        fieldResults.push(...(result.fieldResults || []));
        freqs.push(...(result.freqs || []));
      });
      fieldResults.sort((a, b) => a.f - b.f);
      freqs.sort((a, b) => a - b);
      cleanupActiveJob(id);
      resolve({ freqs, fieldResults, workers: pool.length });
    }).catch(finishError);
  });
}

/** Arrête immédiatement tous les calculs du pool actif. */
export function abortBemDomains() {
  if (_activeJobId == null) return;
  _activeAbort?.();
}
