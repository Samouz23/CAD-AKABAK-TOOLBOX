// =======================================================
// scripts/bem_galerkin_worker_check.mjs
//
// Exécute le PIPELINE COMPLET DU WORKER (bemShared + bemDomainCore +
// bemGalerkin + bemDomainWorker concaténés, comme le fait bemDomainBackend)
// sur un vrai fichier .msh, en émulant `self` sous Node. Vérifie que le
// passage du solveur en Galerkin P1 ne casse rien et mesure le temps réel.
//
// Usage : node scripts/bem_galerkin_worker_check.mjs <fichier.msh> [fMin] [fMax] [ppo]
// =======================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const mshPath = process.argv[2];
if (!mshPath) { console.error('usage: node scripts/bem_galerkin_worker_check.mjs <file.msh> [fMin] [fMax] [ppo]'); process.exit(1); }
const mshContent = readFileSync(mshPath, 'utf8');

const fMin = Number(process.argv[3] || 500);
const fMax = Number(process.argv[4] || 4000);
const ppo = Number(process.argv[5] || 1);
const freqs = [];
for (let f = fMin; f <= fMax * 1.0001; f *= Math.pow(2, 1 / ppo)) freqs.push(Math.round(f));

// ---- Émulation du contexte worker ----
const messages = [];
let doneResult = null, errorMessage = null;
const selfStub = {
  onmessage: null,
  postMessage(msg) {
    messages.push(msg);
    if (msg.type === 'done') doneResult = msg.result;
    if (msg.type === 'error') errorMessage = msg.message;
    if (msg.type === 'progress') {
      const ev = msg.ev;
      if (ev.phase === 'meshReady') {
        const mi = ev.meshInfo;
        console.log(`  meshReady : ${mi.elementCount} éléments · ${mi.unknowns} inconnues · valide jusqu'à ~${(mi.fMaxValid_Hz / 1000).toFixed(1)} kHz`);
        console.log(`              domaines : ${mi.domains.map(d => `${d.name}[${d.type}${d.baffle ? ',baffle' : ''}] ${d.elements}el closed=${d.closed}`).join(' | ')}`);
        if (mi.unassigned.length) console.log(`              NON ASSIGNÉ : ${mi.unassigned.map(u => `${u.surfaceId} (${u.area_cm2.toFixed(1)}cm²)`).join(', ')}`);
      } else if (ev.phase === 'prepareDone') {
        console.log(`  prepareDone : ${ev.diagnostics.map(d => `${d.domain} closed=${d.closed} rowSumErr=${d.worstRowSumError.toExponential(2)}${d.flipped ? ' FLIPPED' : ''}`).join(' | ')}`);
      } else if (ev.phase === 'freqDone') {
        console.log(`  ${String(ev.freq).padStart(6)} Hz  ${(ev.elapsed_ms / 1000).toFixed(1)}s  mismatch=${(ev.mismatch * 100).toFixed(1)}%  cond=${ev.cond ? ev.cond.toExponential(2) : 'n/a'}`);
      }
    }
  },
};

const ctx = vm.createContext({ console, performance, self: selfStub });
for (const f of ['src/js/bem/bemShared.js', 'src/js/bem/bemDomainCore.js', 'src/js/bem/bemGalerkin.js', 'src/js/bem/bemDomainWorker.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
}

// ---- Découverte automatique des surfaces + config plausible ----
const api = vm.runInContext('({ parseMshBothTags, buildTaggedElements })', ctx);
const { tris, physicalNames } = api.parseMshBothTags(mshContent);
const byTag = new Map();
for (const t of tris) {
  const id = t.physicalTag != null ? `p:${t.physicalTag}` : `e:${t.elementaryTag}`;
  const name = t.physicalTag != null ? (physicalNames.get(t.physicalTag) || '') : '';
  const rec = byTag.get(id) || { id, name, count: 0 };
  rec.count++; byTag.set(id, rec);
}
console.log(`\nSurfaces du maillage : ${[...byTag.values()].map(r => `${r.id}${r.name ? '(' + r.name + ')' : ''}×${r.count}`).join(', ')}\n`);

const find = (re) => [...byTag.values()].filter(r => re.test(r.name.toLowerCase()));
const throat = find(/throat|source|piston/);
const iface = find(/interface_face|mouth_cap/);
const walls = [...byTag.values()].filter(r => !throat.includes(r) && !iface.includes(r));
if (!throat.length || !iface.length) {
  console.error('Impossible de déduire throat_cap / interface_face — ce script attend un maillage nommé (cf. correctif Physical Surface).');
  process.exit(1);
}

// Symétrie : un maillage réduit ne déborde jamais du côté négatif de son plan
// de coupe. La déclarer est indispensable, sinon le domaine paraît « non fermé ».
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const t of tris) for (const v of [t.v0, t.v1, t.v2]) {
  if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
  if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
}
const tolSym = 1e-6 * Math.max(maxX - minX, maxY - minY, 1);
const cutV = minX > -tolSym;  // rien en x<0 ⇒ plan de coupe x=0
const cutH = minY > -tolSym;  // rien en y<0 ⇒ plan de coupe y=0
const symmetry = (cutV && cutH) ? 'hv' : cutV ? 'v' : cutH ? 'h' : 'none';

const config = {
  symmetry,
  subdomains: [
    { id: 'in', name: 'Interior', type: 'interior', baffle: false, surfaces: [
      ...throat.map(r => ({ surfaceId: r.id, role: 'driven', velocity: 1 })),
      ...walls.map(r => ({ surfaceId: r.id, role: 'boundary' })),
    ] },
    { id: 'out', name: 'Exterior', type: 'exterior', baffle: false, surfaces: [] },
  ],
  interfaces: [{ id: 'if1', name: 'Mouth', fromId: 'in', toId: 'out', surfaces: iface.map(r => ({ surfaceId: r.id })) }],
};
console.log(`Config : driven=${throat.map(r => r.id)} walls=${walls.map(r => r.id)} interface=${iface.map(r => r.id)} symmetry=${symmetry}`);
console.log(`Fréquences : ${freqs.join(', ')} Hz\n`);

const t0 = Date.now();
selfStub.onmessage({ data: { type: 'computeDomain', id: 'job1', mshContent, config, opts: { freqs, distance_m: 2, angleStep: 15, angleMax: 90 } } });
const dt = (Date.now() - t0) / 1000;

if (errorMessage) { console.error(`\nERREUR worker : ${errorMessage}`); process.exit(1); }
if (!doneResult) { console.error('\nLe worker n\'a rien renvoyé.'); process.exit(1); }

console.log(`\nTerminé en ${dt.toFixed(1)}s pour ${doneResult.freqs.length} fréquences (${(dt / doneResult.freqs.length).toFixed(1)}s/fréquence)`);
console.log('\nPolaire H (normalisée sur l\'axe) :');
const angles = doneResult.polarH[0].angles;
console.log('   Hz  ' + angles.map(a => String(a).padStart(6)).join(''));
for (const p of doneResult.polarH) {
  console.log(String(p.f).padStart(5) + '  ' + p.normalized.map(v => v.toFixed(3).padStart(6)).join(''));
}
