// =======================================================
// FICHIER :  src/ipc/foamResults.js
// RÔLE    :  Lecture des sondes OpenFOAM et projection sur le champ BEM
//
// La CFD fournit une série temporelle en chaque point, alors que le Field du
// solveur BEM stocke un champ harmonique complexe. On décompose donc le signal
// CFD en:
//   - une composante continue  (écoulement moyen / jet net dans l'event)
//   - la fondamentale à la fréquence d'excitation, sous la forme
//     u(t) ≈ A·cos(ωt) + B·sin(ωt), exactement la convention de bemFieldSpeeds
//   - un résidu, tout ce que l'acoustique linéaire ne peut pas produire:
//     harmoniques, décrochage, turbulence.
// =======================================================

// OpenFOAM ecrit GREAT (1e300) sur chaque composante d'une sonde situee hors du
// maillage au lieu de l'omettre. La grille du Field debordant largement du
// conduit, ces points doivent etre masques et non interpretes comme du fluide.
const FOAM_GREAT = 1e30;

/**
 * Parse un fichier de sondes OpenFOAM (postProcessing/<nom>/<t0>/<champ>).
 * Gère indifféremment les champs scalaires et vectoriels.
 * @param {string} text
 * @returns {{positions: number[][], times: number[], values: number[][][],
 *            components: number, valid: boolean[]}}
 *          values[timeIndex][probeIndex] = tableau de composantes
 */
function parseProbes(text) {
    const positions = [];
    const times = [];
    const values = [];
    let components = 0;

    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;

        if (line.startsWith('#')) {
            const m = /^#\s*Probe\s+(\d+)\s*\(([^)]*)\)/.exec(line);
            if (m) {
                positions[parseInt(m[1], 10)] = m[2].trim().split(/\s+/).map(Number);
            }
            continue;
        }

        // Les vecteurs sont parenthésés; les scalaires sont de simples colonnes.
        const vectors = line.match(/\(([^)]*)\)/g);
        const timeToken = parseFloat(line);
        if (!Number.isFinite(timeToken)) continue;

        let row;
        if (vectors) {
            row = vectors.map(v => v.slice(1, -1).trim().split(/\s+/).map(Number));
        } else {
            const parts = line.split(/\s+/).map(Number);
            row = parts.slice(1).map(v => [v]);
        }
        if (!row.length) continue;
        components = row[0].length;
        times.push(timeToken);
        values.push(row);
    }

    const probeCount = values.length ? values[0].length : 0;
    const valid = new Array(probeCount).fill(true);
    for (const row of values) {
        for (let p = 0; p < probeCount; p++) {
            if (row[p].some(v => !Number.isFinite(v) || Math.abs(v) >= FOAM_GREAT)) valid[p] = false;
        }
    }

    return { positions, times, values, components, valid };
}

/**
 * Décompose la série temporelle de chaque sonde à la fréquence d'excitation.
 *
 * L'intégration ne porte que sur un nombre entier de périodes en fin de calcul,
 * ce qui écarte le régime transitoire de démarrage et évite la fuite spectrale
 * d'une fenêtre tronquée.
 *
 * @param {{times: number[], values: number[][][], components: number}} probes
 * @param {number} freq - fréquence d'excitation (Hz)
 * @param {number} [periods] - nombre de périodes analysées en fin de série
 * @returns {{mean: Float64Array, cos: Float64Array, imag: Float64Array,
 *            residualRms: Float64Array, probeCount: number, components: number,
 *            window: {from: number, to: number, samples: number}}}
 */
function harmonicDecompose(probes, freq, periods = 1) {
    const { times, values, components } = probes;
    const probeCount = values.length ? values[0].length : 0;
    const valid = probes.valid || new Array(probeCount).fill(true);
    const period = 1 / freq;

    if (!times.length || !probeCount) {
        throw new Error('harmonicDecompose: aucune donnée de sonde');
    }

    const tEnd = times[times.length - 1];
    const tStart = tEnd - periods * period;
    let i0 = times.findIndex(t => t >= tStart - 1e-12);
    if (i0 < 0) i0 = 0;
    // Il faut au moins quelques points par période pour que la projection ait un sens.
    if (times.length - i0 < 8) i0 = Math.max(0, times.length - 8);

    const n = components;
    const mean = new Float64Array(probeCount * n);
    const cosA = new Float64Array(probeCount * n);
    const sinB = new Float64Array(probeCount * n);
    const residualRms = new Float64Array(probeCount);

    const omega = 2 * Math.PI * freq;
    let total = 0;

    // Intégration trapézoïdale pondérée par le pas de temps: pimpleFoam tourne
    // en pas adaptatif, l'échantillonnage n'est donc pas uniforme.
    for (let s = i0; s < times.length; s++) {
        const dt = s === i0
            ? (times[Math.min(s + 1, times.length - 1)] - times[s])
            : (times[s] - times[s - 1]);
        total += dt;
        const c = Math.cos(omega * times[s]);
        const sn = Math.sin(omega * times[s]);
        for (let p = 0; p < probeCount; p++) {
            if (!valid[p]) continue;
            const v = values[s][p];
            for (let k = 0; k < n; k++) {
                const base = p * n + k;
                mean[base] += v[k] * dt;
                cosA[base] += v[k] * c * dt;
                sinB[base] += v[k] * sn * dt;
            }
        }
    }

    if (!(total > 0)) throw new Error('harmonicDecompose: fenêtre temporelle vide');
    for (let i = 0; i < mean.length; i++) {
        mean[i] /= total;
        // Projection sur cos/sin: le facteur 2 vient de <cos²> = 1/2.
        cosA[i] *= 2 / total;
        sinB[i] *= 2 / total;
    }

    // Résidu: écart quadratique moyen entre le signal et sa reconstruction
    // continue + fondamentale, agrégé sur les composantes.
    const acc = new Float64Array(probeCount);
    for (let s = i0; s < times.length; s++) {
        const dt = s === i0
            ? (times[Math.min(s + 1, times.length - 1)] - times[s])
            : (times[s] - times[s - 1]);
        const c = Math.cos(omega * times[s]);
        const sn = Math.sin(omega * times[s]);
        for (let p = 0; p < probeCount; p++) {
            if (!valid[p]) continue;
            const v = values[s][p];
            let sq = 0;
            for (let k = 0; k < n; k++) {
                const base = p * n + k;
                const fit = mean[base] + cosA[base] * c + sinB[base] * sn;
                const d = v[k] - fit;
                sq += d * d;
            }
            acc[p] += sq * dt;
        }
    }
    for (let p = 0; p < probeCount; p++) residualRms[p] = Math.sqrt(acc[p] / total);

    return {
        mean,
        cos: cosA,
        imag: sinB,
        residualRms,
        valid,
        probeCount,
        components: n,
        window: { from: times[i0], to: tEnd, samples: times.length - i0 },
    };
}

/**
 * Met la décomposition d'un champ de vitesse au format attendu par le Field BEM:
 * deux Float32Array entrelacés (x,y,z) tels que v(t) = vRe·cos(ωt) + vIm·sin(ωt).
 * @param {ReturnType<harmonicDecompose>} decomposed
 * @returns {{vRe: Float32Array, vIm: Float32Array, vMean: Float32Array,
 *            turbulence: Float32Array, peak: Float32Array, valid: boolean[]}}
 */
function toFieldVelocity(decomposed) {
    const { cos, imag, mean, residualRms, probeCount, components } = decomposed;
    if (components !== 3) throw new Error('toFieldVelocity: champ vectoriel attendu');
    const valid = decomposed.valid || new Array(probeCount).fill(true);

    const vRe = new Float32Array(probeCount * 3);
    const vIm = new Float32Array(probeCount * 3);
    const vMean = new Float32Array(probeCount * 3);
    const peak = new Float32Array(probeCount);

    for (let p = 0; p < probeCount; p++) {
        let a2 = 0, b2 = 0, ab = 0;
        for (let k = 0; k < 3; k++) {
            const i = p * 3 + k;
            vRe[i] = cos[i];
            vIm[i] = imag[i];
            vMean[i] = mean[i];
            a2 += cos[i] * cos[i];
            b2 += imag[i] * imag[i];
            ab += cos[i] * imag[i];
        }
        // Demi-grand axe de l'ellipse décrite par le vecteur vitesse, même
        // formule que bemFieldSpeeds pour rester comparable au BEM.
        const m = (a2 + b2) / 2;
        peak[p] = Math.sqrt(m + Math.hypot((a2 - b2) / 2, ab));
    }

    return { vRe, vIm, vMean, turbulence: Float32Array.from(residualRms), peak, valid };
}

module.exports = {
    parseProbes,
    harmonicDecompose,
    toFieldVelocity,
};
