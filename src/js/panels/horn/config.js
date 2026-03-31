// ====================================================================================================
// FICHIER :  src/js/panels/horn/config.js
// RÔLE :     Constantes, valeurs par défaut et configuration du module Horn.
// ====================================================================================================

export const C_SOUND = 344000; // mm/s

export const expansionTypes = ['Conical', 'Exponential', 'Parabolic', 'Hypex', 'OS'];

export const chartColors = { w: '#ff0000ff', h: '#00ffa2ff', s: '#ff00eaff', os: '#ffbb00ff' };

export const defaultSegments = [
    { w: 100, h: 56.4, l: 88 },
    { w: 115, h: 65.0, l: 624 },
    { w: 280, h: 158.2, l: 229 },
    { w: 400, h: 226.0, l: 260 },
    { w: 590, h: 333.3, l: 445 },
    { w: 1100, h: 621.5, l: 350 },
];

export const defaultVisibility = [true, true, true, true, true, true, false];
