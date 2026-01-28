// =======================================================
// FICHIER :  src/js/utils/acousticMath.js
// RÔLE    :  Fonctions mathématiques pour calculs acoustiques
// =======================================================

/**
 * Speed of sound in m/s at 20°C
 */
export const SPEED_OF_SOUND = 344;

/**
 * Bessel function of the first kind, order 1
 * Using series expansion for accurate results
 * @param {number} x - Input value
 * @returns {number} J1(x)
 */
export function besselJ1(x) {
  if (x === 0) return 0;
  
  const absX = Math.abs(x);
  let result = 0;
  
  // Series expansion: J1(x) = (x/2) * sum from k=0 to infinity of:
  // (-1)^k / (k! * (k+1)!) * (x/2)^(2k)
  
  const maxIterations = 50;
  let term = absX / 2; // First term (k=0)
  result = term;
  
  for (let k = 1; k < maxIterations; k++) {
    term *= -(absX * absX) / (4 * k * (k + 1));
    result += term;
    
    // Early exit if term becomes negligible
    if (Math.abs(term) < 1e-15) break;
  }
  
  return x < 0 ? -result : result;
}

/**
 * Calculate 2*J1(u)/u for directivity patterns
 * @param {number} u - Parameter (k * dimension * sin(angle))
 * @returns {number} Normalized directivity value
 */
export function directivityFunction(u) {
  if (Math.abs(u) < 1e-10) return 1; // Limit as u → 0
  
  return (2 * besselJ1(u)) / u;
}

/**
 * Calculate sinc function: sin(u)/u
 * @param {number} u - Input value
 * @returns {number} sinc(u)
 */
export function sinc(u) {
  if (Math.abs(u) < 1e-10) return 1;
  return Math.sin(u) / u;
}

/**
 * Convert linear amplitude to dB
 * @param {number} amplitude - Linear amplitude (0 to 1)
 * @returns {number} dB value
 */
export function linearToDb(amplitude) {
  if (amplitude <= 0) return -Infinity;
  return 20 * Math.log10(amplitude);
}

/**
 * Convert dB to linear amplitude
 * @param {number} db - dB value
 * @returns {number} Linear amplitude
 */
export function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

/**
 * Clamp value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate wave number k = 2π/λ = 2πf/c
 * @param {number} frequency - Frequency in Hz
 * @returns {number} Wave number in rad/m
 */
export function calculateWaveNumber(frequency) {
  return (2 * Math.PI * frequency) / SPEED_OF_SOUND;
}

/**
 * Calculate wavelength λ = c/f
 * @param {number} frequency - Frequency in Hz
 * @returns {number} Wavelength in meters
 */
export function calculateWavelength(frequency) {
  return SPEED_OF_SOUND / frequency;
}
