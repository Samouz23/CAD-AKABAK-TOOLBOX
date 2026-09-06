/**
 * Contrôle du backend CFD tel qu'il sera vu par l'application EMPAQUETÉE.
 *
 * Deux fautes de packaging sont silencieuses et pourtant fatales :
 *  - les scripts bash absents du paquet (ils ne sont pas sous src/) ;
 *  - les scripts enfermés dans app.asar, que WSL ne peut pas lire.
 * Ce harnais vérifie les deux, puis affiche le diagnostic réel de la machine.
 *
 * Usage: node scripts/foam_package_validate.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const foam = require(path.join(root, 'src', 'ipc', 'foamRunner.js'));

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  —  ${detail}` : ''}`);
};

console.log('=== Scripts bash requis ===');
// Tout script lancé par le code doit exister ET être livré : la liste est tirée
// des appels réels pour qu'un ajout oublié ressorte ici.
const called = new Set();
for (const file of ['foamRunner.js', 'foamVentRun.js', 'foamHandlers.js']) {
  const src = fs.readFileSync(path.join(root, 'src', 'ipc', file), 'utf8');
  for (const m of src.matchAll(/'([A-Za-z0-9_]+\.sh)'/g)) called.add(m[1]);
}
check('au moins un script référencé', called.size > 0, [...called].join(', '));
for (const name of called) {
  check(`${name} présent`, fs.existsSync(path.join(foam.FOAM_SCRIPTS_DIR, name)));
}

console.log('\n=== Fins de ligne (bash refuse le CRLF) ===');
for (const name of fs.readdirSync(foam.FOAM_SCRIPTS_DIR).filter(f => f.endsWith('.sh'))) {
  const text = fs.readFileSync(path.join(foam.FOAM_SCRIPTS_DIR, name), 'latin1');
  check(`${name} en LF`, !text.includes('\r'));
}

console.log('\n=== Configuration du paquet ===');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const extra = pkg.build?.extraResources || [];
const foamRes = extra.find(e => (e.from || e) === 'scripts/foam');
check('scripts/foam copié en extraResources', !!foamRes);
check('copié hors de l\'asar, sous resources/foam', foamRes?.to === 'foam', String(foamRes?.to));
// `files` ne couvre que src/ et node_modules : sans extraResources les scripts
// seraient purement et simplement absents du .exe.
check('src inclus dans files', (pkg.build?.files || []).some(f => f.startsWith('src')));

console.log('\n=== Résolution du dossier de scripts ===');
check('dossier résolu existant', fs.existsSync(foam.FOAM_SCRIPTS_DIR), foam.FOAM_SCRIPTS_DIR);
check('jamais à l\'intérieur d\'un asar', !foam.FOAM_SCRIPTS_DIR.includes('.asar'));

console.log('\n=== Diagnostic de cette machine ===');
const env = await foam.checkAvailability();
console.log(`  stage    : ${env.stage}`);
console.log(`  distro   : ${env.distro || '—'}`);
console.log(`  version  : ${env.version || '—'}`);
console.log(`  cores    : ${env.cores ?? '—'}`);
console.log(`  reason   : ${env.reason || '—'}`);
check('stage renseigné', typeof env.stage === 'string' && env.stage.length > 0);
check('un stage connu', ['ok', 'no-scripts', 'no-wsl', 'no-distro', 'no-openfoam', 'missing-tools'].includes(env.stage));

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
