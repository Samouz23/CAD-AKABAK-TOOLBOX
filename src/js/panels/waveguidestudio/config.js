// ====================================================================================================
// FICHIER :  src/js/panels/waveguidestudio/config.js
// RÔLE :     Configuration des inputs et validation du waveguide.
// ====================================================================================================

export const inputConfigs = {
    'wg-length-': { min: 0, max: 1000, step: 10, shiftStep: 50 },
    'wg-os-se-k-': { min: 1, max: 10, step: 0.1, shiftStep: 1 },
    'wg-os-se-s-': { min: 0, max: 2, step: 0.1, shiftStep: 0.5 },
    'wg-os-se-q-': { min: 0.99, max: 1, step: 0.001, shiftStep: 0.01 },
    'wg-os-se-n-': { min: 2, max: 10, step: 1, shiftStep: 2 },
    'wg-os-se-a-': { min: 0, max: 90, step: 1, shiftStep: 10 },
    'wg-os-theta-': { min: 0, max: 90, step: 1, shiftStep: 10 },
    'wg-conical-theta-': { min: 0, max: 90, step: 1, shiftStep: 10 },
    'wg-exponential-fc-': { min: 50, max: 5000, step: 100, shiftStep: 500 },
    'wg-parabolic-fc-': { min: 50, max: 5000, step: 100, shiftStep: 500 },
    'wg-hypex-fc-': { min: 50, max: 5000, step: 100, shiftStep: 500 },
    'wg-hypex-t-': { min: 0, max: 2, step: 0.1, shiftStep: 0.5 },
    'sf-b': { min: 0, max: 2, step: 0.1, shiftStep: 0.5 },
    'sf-n1': { min: 0, max: 8, step: 0.1, shiftStep: 1 },
    'sf-n3': { min: 0, max: 50, step: 0.1, shiftStep: 1 },
    'sf-n2': { min: 0, max: 20, step: 1, shiftStep: 5 },
    'sf-m': { min: 0, max: 10, step: 1, shiftStep: 2 },
    'sf-a': { min: 0, max: 2, step: 0.1, shiftStep: 0.5 },
    'sf-amplitude': { min: 0, max: 1000, step: 1, shiftStep: 10 },
    'wg-throat-mesh-factor': { min: 0, max: 10, step: 1, shiftStep: 1 },
    'wg-mouth-mesh-factor': { min: 0, max: 10, step: 1, shiftStep: 1 },
    'wg-source-angular-points': { min: 3, max: 200, step: 1, shiftStep: 10 },
    'wg-source-axial-points': { min: 1, max: 50, step: 1, shiftStep: 5 },
    'wg-interface-angular-points': { min: 3, max: 200, step: 1, shiftStep: 10 },
    'wg-interface-axial-points': { min: 2, max: 50, step: 1, shiftStep: 5 },
    'interface-tip-offset': { min: 1, max: 100, step: 1, shiftStep: 10 },
    'interface-bulge-radius': { min: 0, max: 100, step: 1, shiftStep: 10 },
    'interface-bulge-z': { min: 1, max: 100, step: 1, shiftStep: 10 },
    'wg-d-out-rounded-rect-r' : { min: 0, max: 60, step: 1, shiftStep: 10 }
};

export function validateWaveguideConfig(cfg) {
    if (cfg.dIn <= 0) return "The throat diameter must be positive.";
    if (cfg.numLines < 4) return "The number of lines must be at least 4.";
    if (cfg.pointsPerSegment < 3) return "The number of points per line must be at least 3.";
    for (const seg of cfg.segments) {
        if (seg.length <= 0) return "The segment length must be positive.";
    }
    return null;
}
