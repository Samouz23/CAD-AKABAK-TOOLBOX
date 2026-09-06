// =======================================================
// FICHIER :  scripts/foam_probe_diag.mjs
// RÔLE    :  Diagnostic — profil de vitesse le long de l'axe de l'event à
//            partir des sondes déjà écrites, pour localiser une divergence.
// USAGE   :  node scripts/foam_probe_diag.mjs [nomDuCas]
// =======================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const foamResults = require(path.join(repo, 'src', 'ipc', 'foamResults.js'));

const caseName = process.argv[2] || 'vent-draft';
const ppDir = path.join(repo, '.foam-work', caseName, 'postProcessing', 'fieldProbes');
const stamp = fs.readdirSync(ppDir)[0];
const probes = foamResults.parseProbes(fs.readFileSync(path.join(ppDir, stamp, 'U'), 'utf8'));

console.log(`${probes.times.length} instants, ${probes.positions.length} sondes, `
    + `t final ${probes.times[probes.times.length - 1]}`);

// Evolution de la vitesse maximale: une croissance monotone signale la divergence.
console.log('\nt (ms)   |U|max   sonde   z(mm)');
for (let s = 0; s < probes.times.length; s++) {
    let best = 0, bi = 0;
    probes.values[s].forEach((v, i) => {
        const m = Math.hypot(v[0], v[1], v[2]);
        if (m > best) { best = m; bi = i; }
    });
    console.log(`${(probes.times[s] * 1000).toFixed(2).padStart(7)}  `
        + `${best.toFixed(2).padStart(8)}  ${String(bi).padStart(5)}  `
        + `${(probes.positions[bi][2] * 1000).toFixed(0).padStart(6)}`);
}

// Profil axial au dernier instant enregistre.
const last = probes.values[probes.values.length - 1];
console.log('\nz (mm)    Ux      Uy      Uz');
for (let i = 0; i < 36 && i < last.length; i++) {
    console.log(`${(probes.positions[i][2] * 1000).toFixed(0).padStart(6)}  `
        + last[i].map(v => v.toFixed(2).padStart(7)).join(' '));
}
