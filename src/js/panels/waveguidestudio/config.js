// ====================================================================================================
// FICHIER :  src/js/panels/waveguidestudio/config.js
// RÔLE :     Configuration des inputs et validation du waveguide.
// ====================================================================================================

import { deriveDoscParams } from './dosc/doscGenerator.js';

export const inputConfigs = {
    'wg-d-in-circle': { min: 1, max: 500, step: 0.001, shiftStep: 0.01 },
    'wg-d-in-rect-w': { min: 1, max: 500, step: 0.001, shiftStep: 0.01 },
    'wg-d-in-rect-h': { min: 1, max: 500, step: 0.001, shiftStep: 0.01 },
    'wg-lines': { min: 3, max: 400, step: 1, shiftStep: 10 },
    'wg-points': { min: 5, max: 500, step: 5, shiftStep: 25 },
    'wg-length-': { min: 0, max: 1000, step: 10, shiftStep: 50 },
    'wg-os-se-k-': { min: 1, max: 10, step: 0.1, shiftStep: 1 },
    'wg-os-se-k-v-': { min: 1, max: 10, step: 0.1, shiftStep: 1 },
    'wg-os-se-s-': { min: 0, max: 2, step: 0.1, shiftStep: 0.5 },
    'wg-os-se-s-v-': { min: 0, max: 2, step: 0.1, shiftStep: 0.5 },
    'wg-os-se-q-': { min: 0.99, max: 1, step: 0.001, shiftStep: 0.01 },
    'wg-os-se-q-v-': { min: 0.99, max: 1, step: 0.001, shiftStep: 0.01 },
    'wg-os-se-n-': { min: 2, max: 10, step: 1, shiftStep: 2 },
    'wg-os-se-n-v-': { min: 2, max: 10, step: 1, shiftStep: 2 },
    'wg-os-se-a-': { min: 0, max: 90, step: 1, shiftStep: 10 },
    'wg-os-se-a-v-': { min: 0, max: 90, step: 1, shiftStep: 10 },
    'wg-os-theta-': { min: 0, max: 90, step: 1, shiftStep: 10 },
    'wg-os-theta-v-': { min: 0, max: 90, step: 1, shiftStep: 10 },

    'wg-hypex-fc-': { min: 50, max: 5000, step: 100, shiftStep: 500 },
    'wg-hypex-fc-v-': { min: 50, max: 5000, step: 100, shiftStep: 500 },
    'wg-hypex-t-': { min: 0, max: 2, step: 0.1, shiftStep: 0.5 },
    'wg-hypex-t-v-': { min: 0, max: 2, step: 0.1, shiftStep: 0.5 },
    'wg-bessel-fc-': { min: 50, max: 5000, step: 100, shiftStep: 500 },
    'wg-bessel-fc-v-': { min: 50, max: 5000, step: 100, shiftStep: 500 },
    'wg-bessel-b-': { min: 0.1, max: 5, step: 0.1, shiftStep: 0.5 },
    'wg-bessel-b-v-': { min: 0.1, max: 5, step: 0.1, shiftStep: 0.5 },
    'wg-throat-angle': { min: 0, max: 89, step: 1, shiftStep: 5 },
    'wg-arced-ud-angle': { min: 0, max: 180, step: 5, shiftStep: 15 },
    'wg-arced-lr-angle': { min: 0, max: 180, step: 5, shiftStep: 15 },
    'wg-radial-ud-height': { min: 0, max: 200, step: 1, shiftStep: 10 },
    'wg-radial-lr-height': { min: 0, max: 200, step: 1, shiftStep: 10 },
    'sf-b': { min: 0, max: 2, step: 0.1, shiftStep: 0.5 },
    'sf-n1': { min: 0, max: 8, step: 0.1, shiftStep: 1 },
    'sf-n3': { min: 0, max: 50, step: 0.1, shiftStep: 1 },
    'sf-n2': { min: 0, max: 20, step: 1, shiftStep: 5 },
    'sf-m': { min: 0, max: 10, step: 1, shiftStep: 2 },
    'sf-a': { min: 0, max: 2, step: 0.1, shiftStep: 0.5 },
    'sf-amplitude': { min: 0, max: 1000, step: 1, shiftStep: 10 },
    'sf-rot': { min: 0, max: 360, step: 1, shiftStep: 15 },
    'sf-aspect': { min: 0.1, max: 5, step: 0.1, shiftStep: 0.5 },
    'wg-source-axial-points': { min: 1, max: 50, step: 1, shiftStep: 5 },
    'wg-interface-axial-points': { min: 2, max: 50, step: 1, shiftStep: 5 },
    'interface-tip-offset': { min: 1, max: 100, step: 1, shiftStep: 10 },
    'wg-d-out-rounded-rect-r' : { min: 0, max: 60, step: 1, shiftStep: 10 },
    'wg-d-in-rounded-rect-w' : { min: 1, max: 500, step: 0.001, shiftStep: 0.01 },
    'wg-d-in-rounded-rect-h' : { min: 1, max: 500, step: 0.001, shiftStep: 0.01 },
    'wg-d-in-rounded-rect-r' : { min: 0, max: 250, step: 0.001, shiftStep: 0.01 },
    'wg-adapter-length'      : { min: 1, max: 200, step: 0.5, shiftStep: 5 },
    'wg-adapter-theta-h'     : { min: 0, max: 89, step: 0.5, shiftStep: 5 },
    'wg-adapter-theta-v'     : { min: 0, max: 89, step: 0.5, shiftStep: 5 },

    // --- DOSC (US 5,163,167) ---
    'wg-dosc-throat-d'       : { min: 1, max: 300, step: 0.5, shiftStep: 5 },
    'wg-dosc-mouth-h'        : { min: 5, max: 1000, step: 5, shiftStep: 25 },
    'wg-dosc-mouth-w'        : { min: 1, max: 300, step: 1, shiftStep: 5 },
    'wg-dosc-depth'          : { min: 5, max: 1000, step: 5, shiftStep: 25 },
    'wg-dosc-fillet-r'       : { min: 0, max: 50, step: 0.5, shiftStep: 2 },
    // Croissance verticale du prisme, en % de la marge disponible.
    'wg-dosc-prism-height'   : { min: -100, max: 100, step: 5, shiftStep: 25 },
    // Différence de marche centre↔bord, en mm. Bornée par la géométrie et
    // fortement asymétrique (cf. §4 de doscGenerator.js) — le plafonnement réel
    // est calculé par `deriveDoscParams` et affiché dans l'encart DOSC.
    'wg-dosc-prism-width'    : { min: -100, max: 100, step: 5, shiftStep: 25 },
    // Gradation du biseau du centre vers le bord du corps (§5) : spécifiquement
    // ce qui manquait pour que la courbure du front tienne sur toute la bande.
    'wg-dosc-wavefront-grade': { min: 0, max: 100, step: 5, shiftStep: 25 },
};

export function validateWaveguideConfig(cfg) {
    if (cfg.numLines < 3) return "Angular points must be at least 3.";
    if (cfg.pointsPerSegment < 5) return "The number of axial points must be at least 5.";

    // En mode DOSC la géométrie ne vient PAS d'une loi d'expansion : les
    // contraintes portent sur les 4 cotes du guide. `deriveDoscParams` est la
    // source de vérité (elle contient la dérivation issue du brevet) — on ne
    // duplique pas ses règles ici, on relaie son message.
    if (cfg.waveguideType === 'dosc') {
        const d = cfg.dosc || {};
        const p = deriveDoscParams(d);
        if (!p.ok) return p.error;
        return null;
    }

    if (cfg.dIn <= 0) return "The throat diameter must be positive.";
    for (const seg of cfg.segments) {
        if (seg.length <= 0) return "The segment length must be positive.";
    }
    return null;
}
