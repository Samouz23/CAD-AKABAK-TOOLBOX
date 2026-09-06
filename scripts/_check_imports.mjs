// Jetable : liste les imports relatifs dont le fichier cible n'existe pas.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const bad = [];

function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const f = path.join(dir, e.name);
        if (e.isDirectory()) { walk(f); continue; }
        if (!/\.(js|mjs)$/.test(e.name)) continue;
        const src = fs.readFileSync(f, 'utf8');
        const re = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g;
        let m;
        while ((m = re.exec(src))) {
            const target = path.resolve(path.dirname(f), m[1]);
            if (!fs.existsSync(target)) {
                bad.push(`${path.relative(root, f)}  ->  ${m[1]}`);
            }
        }
    }
}

walk(path.join(root, 'src'));
walk(path.join(root, 'scripts'));
console.log(bad.length ? bad.join('\n') : 'aucun import relatif casse');
