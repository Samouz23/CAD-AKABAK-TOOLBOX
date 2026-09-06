// =======================================================
// FICHIER :  src/js/bem/bemDomainWorker.js
// RÔLE    :  Worker du solveur BEM multi-domaine.
//            Concaténé APRÈS bemShared.js et bemDomainCore.js dans un blob
//            (un worker classique ne peut pas faire d'`import`).
//
//  Protocole :
//    {type:'compute', id, mshContent, config, opts}
//      → {type:'progress', id, ev}*
//      → {type:'done', id, result} | {type:'error', id, message}
//    {type:'abort', id}
// =======================================================

'use strict';

const _abortedDomainJobs = Object.create(null);
// Dernier modèle résolu par CE worker : garder les solutions surfaciques permet
// de rejouer les nappes d'observation sans réassembler ni refactoriser.
let _domainCache = null;

self.onmessage = function (e) {
  const msg = e.data || {};
  if (msg.type === 'abort') { _abortedDomainJobs[msg.id] = true; return; }
  if (msg.type !== 'computeDomain' && msg.type !== 'computeFields') return;
  try {
    if (msg.type === 'computeFields') runFieldCompute(msg.id, msg.opts || {});
    else runDomainCompute(msg.id, msg.mshContent, msg.config || {}, msg.opts || {});
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err && err.message ? err.message : String(err) });
  }
};

/** Points de nappe : le panneau les fournit en mm, le modèle travaille à l'échelle du maillage. */
function scaleFields(rawFields, scale) {
  return (rawFields || []).map(f => ({
    id: f.id,
    name: f.name,
    type: f.type,
    withVelocity: !!f.withVelocity,
    points: (f.points_mm || []).map(p => [p[0] * scale, p[1] * scale, p[2] * scale]),
  }));
}

/** Rejoue UNIQUEMENT les nappes sur les fréquences déjà résolues par ce worker. */
function runFieldCompute(id, opts) {
  const cache = _domainCache;
  if (!cache || !cache.sols.size) {
    throw new Error('No cached BEM solution in this worker — run Start Sim first.');
  }
  const fields = scaleFields(opts.fields, cache.scale);
  const fieldResults = [];
  const freqs = [...cache.sols.keys()].sort((a, b) => a - b);
  freqs.forEach((f, i) => {
    if (_abortedDomainJobs[id]) return;
    for (const field of fields) {
      fieldResults.push(evaluateField(field, f, cache.model, cache.sols.get(f), cache.fieldDomains));
    }
    self.postMessage({ type: 'progress', id, ev: {
      phase: 'freqDone', freqIndex: i, freqCount: freqs.length, freq: f, elapsed_ms: 0,
    }});
  });
  self.postMessage({ type: 'done', id, result: { freqs, fieldResults, aborted: !!_abortedDomainJobs[id] } });
  delete _abortedDomainJobs[id];
}

function runDomainCompute(id, mshContent, config, opts) {
  const freqs = (opts.freqs && opts.freqs.length) ? opts.freqs.slice() : [1000];
  const distance_m = opts.distance_m != null ? opts.distance_m : 3;
  const angleStep = opts.angleStep != null ? opts.angleStep : 5;
  const angleMax = opts.angleMax != null ? opts.angleMax : 90;
  const fieldScale = config.scale != null ? config.scale : 0.001;
  const fields = scaleFields(opts.fields, fieldScale);
  // Surfaces dont on veut le débit volumique acoustique (évent, bouche...):
  // c'est cette grandeur qui pilote ensuite la CFD.
  const flowSurfaces = Array.isArray(opts.flowSurfaces) ? opts.flowSurfaces.slice() : [];

  const model = buildMultiDomainModel(mshContent, config);

  // Inconnues P1 : une par NŒUD (plus une par nœud d'interface), là où le P0
  // en comptait une par élément. Un maillage triangulaire ayant ~2× plus de
  // faces que de sommets, le système est en pratique plus PETIT qu'en P0.
  const dofs = buildGalerkinDofs(model);
  const nUnknowns = dofs.Np + dofs.Nq;

  // Le solveur est dense : 16·Nt² octets et O(Nt³) opérations. Au-delà de
  // quelques milliers d'inconnues, mieux vaut refuser franchement que laisser
  // l'onglet se figer puis mourir sur une allocation ratée.
  const bytes = 16 * nUnknowns * nUnknowns;
  if (bytes > 1.5 * 1024 * 1024 * 1024) {
    throw new Error(
      `Model too large: ${nUnknowns} unknowns would need ${(bytes / 1073741824).toFixed(1)} GB. ` +
      `Re-mesh coarser, or use a symmetry plane to cut the element count.`
    );
  }

  const radiating = pickRadiatingDomain(model);

  // Encombrement transverse du domaine rayonnant : sert au panneau à
  // dimensionner le modèle analytique de repli quand aucune géométrie Horn
  // Studio n'a été importée.
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const j of radiating.elemIdx) {
    const el = model.elements[j];
    for (const v of [el.v0, el.v1, el.v2]) {
      if (v[0] < xMin) xMin = v[0];
      if (v[0] > xMax) xMax = v[0];
      if (v[1] < yMin) yMin = v[1];
      if (v[1] > yMax) yMax = v[1];
    }
  }
  const symAll = model.symmetry === 'hv';
  const apertureBBox_mm = {
    width: (xMax - xMin) * 1000 * ((symAll || model.symmetry === 'v') ? 2 : 1),
    height: (yMax - yMin) * 1000 * ((symAll || model.symmetry === 'h') ? 2 : 1),
  };

  const meshInfo = {
    elementCount: model.elementCount,
    unknowns: nUnknowns,
    interfaceElements: dofs.Nq,
    maxElementSize_mm: model.maxElementSize_mm,
    // P1 (Galerkin) converge en O(h²) : ~3 éléments par longueur d'onde suffisent
    // là où le P0, en O(h), en demandait 6 à 10.
    fMaxValid_Hz: C_AIR / (3 * model.maxElementSize_m),
    symmetry: model.symmetry,
    apertureBBox_mm,
    unassigned: model.unassigned.map(u => ({ surfaceId: u.surfaceId, triangles: u.triangles, area_cm2: u.area * 1e4 })),
    normalConvention: model.normalConvention,
    // Une coque fermée dont les normales du maillage contredisent la convention
    // ABEC : la géométrie tranche, mais l'utilisateur doit le savoir.
    conventionOverrides: (model.orientation || [])
      .filter(o => o.conventionOverride)
      .map(o => o.domain),
    // Convention ABEC : la normale d'une interface doit pointer vers le PREMIER
    // sous-domaine. L'orientation ne s'en sert pas, mais un From/To inversé
    // rend l'arbre trompeur — le panneau le signale.
    interfacesToSwap: (model.interfaceChecks || [])
      .filter(c => !c.pointsToFrom)
      .map(c => ({ name: c.name, fromName: c.fromName, toName: c.toName })),
    domains: [...model.domains.values()].map(d => ({
      name: d.name, type: d.type, baffle: d.baffle, elements: d.elemIdx.length,
      closed: d.closed, closureResidual: d.closureResidual,
    })),
    // Akabak affiche le même chiffre : c'est le contrôle le plus direct que la
    // géométrie chargée est bien celle qu'on croit.
    volumes: [...model.domains.values()]
      .filter(d => d.type === 'interior')
      .map(d => ({ name: d.name, litres: Math.abs(d.signedVolume) * model.mirrorCount * 1000 })),
    radiatingDomain: radiating.name,
  };
  self.postMessage({ type: 'progress', id, ev: { phase: 'meshReady', meshInfo } });

  self.postMessage({ type: 'progress', id, ev: { phase: 'prepare', subProgress: 0 } });
  let lastPrep = 0;
  // `prepareMultiDomain` reste appelé pour ses DIAGNOSTICS (orientation, fermeture,
  // rowSumError) : le Galerkin n'utilise pas ses termes libres (il a sa matrice de
  // masse) mais l'utilisateur compte sur ces messages d'erreur de modèle.
  const prep = prepareMultiDomain(model, (frac) => {
    const now = nowMs();
    if (now - lastPrep > 60) {
      lastPrep = now;
      self.postMessage({ type: 'progress', id, ev: { phase: 'prepare', subProgress: frac } });
    }
  });
  self.postMessage({ type: 'progress', id, ev: { phase: 'prepareDone', diagnostics: prep.diagnostics } });

  const galerkinDeps = { domainMirrors, complexLUSolve, C_AIR };
  const nodesArr = galerkinNodeTable(model);
  const radiatingMirrors = domainMirrors(model, radiating);
  // Une nappe traverse potentiellement plusieurs domaines (l'intérieur du
  // pavillon ET l'air devant) : on garde donc les miroirs de chacun.
  const fieldDomains = [...model.domains.values()]
    .map(d => ({ d, mirrors: d === radiating ? radiatingMirrors : domainMirrors(model, d) }));
  // Les solutions surfaciques sont conservées : « Start field » les rejoue sans
  // réassembler la matrice, ce qui est l'essentiel du coût.
  _domainCache = { model, nodesArr, fieldDomains, scale: fieldScale, sols: new Map() };

  const polarH = [], polarV = [], power = [], onAxis = [], drivenLoad = [], fieldResults = [];
  const surfaceFlow = [];
  const flowMatchers = flowSurfaces.map(sid => ({ surfaceId: sid, match: surfaceIdMatcher(sid) }));
  const list = freqs.slice().sort((a, b) => a - b);

  for (let fi = 0; fi < list.length; fi++) {
    if (_abortedDomainJobs[id]) {
      finish(true, fi);
      return;
    }
    const f = list[fi];
    const t0 = nowMs();
    let lastReport = 0;

    const sol = solveMultiDomainGalerkin(f, model, galerkinDeps, {
      nodesArr,
      onProgress: (frac) => {
        const now = nowMs();
        if (now - lastReport > 60) {
          lastReport = now;
          self.postMessage({ type: 'progress', id, ev: {
            phase: 'solve', freqIndex: fi, freqCount: list.length, freq: f, subProgress: frac,
          }});
        }
      },
    });
    _domainCache.sols.set(f, sol);

    const ph = galerkinPolar(model, sol, radiating, 'H', distance_m, angleStep, angleMax, radiatingMirrors);
    const pv = galerkinPolar(model, sol, radiating, 'V', distance_m, angleStep, angleMax, radiatingMirrors);
    polarH.push({ f, angles: ph.angles, normalized: ph.normalized, phasesDeg: ph.phasesDeg });
    polarV.push({ f, angles: pv.angles, normalized: pv.normalized, phasesDeg: pv.phasesDeg });

    const bal = galerkinBalance(model, sol);
    power.push({ f, driven: bal.driven, radiated: bal.radiated, mismatch: bal.mismatch, cond: sol.condIndicator });

    // Pression sur l'axe, ramenée à 1 m : c'est la référence SPL usuelle.
    const axisIdx = ph.angles.reduce((bi, a, i) => Math.abs(a) < Math.abs(ph.angles[bi]) ? i : bi, 0);
    const pAxis = ph.pressureMags[axisIdx];
    onAxis.push({ f, p_ref: pAxis * distance_m, phaseDeg: ph.phasesDeg ? ph.phasesDeg[axisIdx] : 0 });

    // Impédance de rayonnement vue par la source, indispensable au couplage
    // électro-mécanique : sans elle le pavillon ne charge pas le moteur.
    const load = galerkinDrivenLoad(model, sol);
    drivenLoad.push({ f, re: load.re, im: load.im, area: load.area });

    for (const { surfaceId, match } of flowMatchers) {
      const uv = galerkinSurfaceVolumeVelocity(model, sol, match);
      surfaceFlow.push({ f, surfaceId, re: uv.re, im: uv.im, area: uv.area });
    }

    for (const field of fields) {
      fieldResults.push(evaluateField(field, f, model, sol, fieldDomains));
    }

    self.postMessage({ type: 'progress', id, ev: {
      phase: 'freqDone', freqIndex: fi, freqCount: list.length, freq: f,
      elapsed_ms: nowMs() - t0,
      mismatch: bal.mismatch, cond: sol.condIndicator,
    }});
  }

  finish(false, list.length);

  function finish(aborted, count) {
    self.postMessage({
      type: 'done', id,
      result: {
        freqs: list.slice(0, count),
        polarH, polarV, power, onAxis, drivenLoad, fieldResults, meshInfo,
        surfaceFlow,
        prepareDiagnostics: prep.diagnostics,
        aborted,
      },
    });
    delete _abortedDomainJobs[id];
  }
}

/**
 * Pression sur une nappe d'observation à une fréquence.
 *
 * La formule de représentation d'un domaine vaut la pression à l'intérieur de
 * CE domaine et zéro ailleurs : sommer tous les domaines donne donc le champ
 * correct où que tombe le point, dans le pavillon comme devant lui. Un domaine
 * bafflé est en revanche exclu derrière son baffle, où son modèle image n'a
 * pas de sens — sans quoi l'intérieur du pavillon, souvent situé derrière le
 * plan du baffle, serait annulé lui aussi.
 */
function evaluateField(field, f, model, sol, domains) {
  const n = field.points.length;
  const mag = new Array(n);
  const phaseDeg = new Array(n);
  // Vitesse particulaire : 3 composantes complexes par point, à plat, pour ne
  // pas transférer des dizaines de milliers de petits objets au thread principal.
  const withV = !!field.withVelocity;
  const vRe = withV ? new Float32Array(3 * n) : null;
  const vIm = withV ? new Float32Array(3 * n) : null;
  const re = new Float64Array(n), im = new Float64Array(n);
  const out = { re: 0, im: 0, vRe: [0, 0, 0], vIm: [0, 0, 0] };
  // Purement géométrique : calculé une fois, réutilisé à toutes les fréquences.
  if (withV && !field._mask) field._mask = fieldSurfaceMask(field.points, model.elements);
  const mask = withV ? field._mask : null;

  // L'intégrande ne dépend PAS du point d'observation : on l'aplatit une fois
  // par domaine, puis les milliers de points de la nappe ne coûtent plus que de
  // l'arithmétique. Boucler dans l'autre sens refaisait les transformées miroir
  // et les valeurs nodales pour chaque point.
  for (const { d, mirrors } of domains) {
    const cache = buildFieldQuadCache(
      model, sol.nodesArr, d, sol.omega, sol.pIndex, sol.qIndex, sol.pArr, sol.qArr, mirrors);
    const bafAx = d.baffleAxisIdx != null ? d.baffleAxisIdx : 2;
    const bafSign = d.baffleSign != null ? d.baffleSign : 1;
    for (let i = 0; i < n; i++) {
      const x = field.points[i];
      if (d.baffle && (x[bafAx] - d.baffleZ) * bafSign < 0) continue;
      evalFieldQuadCache(cache, x, sol.k, sol.omega, withV, out);
      re[i] += out.re; im[i] += out.im;
      if (!withV) continue;
      for (let c = 0; c < 3; c++) { vRe[3 * i + c] += out.vRe[c]; vIm[3 * i + c] += out.vIm[c]; }
    }
  }
  for (let i = 0; i < n; i++) {
    mag[i] = Math.hypot(re[i], im[i]);
    phaseDeg[i] = Math.atan2(im[i], re[i]) * 180 / Math.PI;
    // NaN plutôt que 0 : un point collé à une paroi n'a pas une vitesse nulle,
    // il n'en a AUCUNE d'exploitable — l'affichage doit pouvoir le distinguer.
    if (mask && !mask[i]) for (let c = 0; c < 3; c++) { vRe[3 * i + c] = NaN; vIm[3 * i + c] = NaN; }
  }
  return { id: field.id, name: field.name, type: field.type, f, mag, phaseDeg, vRe, vIm };
}

function nowMs() {
  return (typeof performance !== 'undefined') ? performance.now() : Date.now();
}
