// =======================================================
// FICHIER :  src/popup/basicCalculatorsWindows.js
// RÔLE    :  Affichage des calculateurs physics basic en mode popup compact
//            Chaque calculateur a son propre HTML optimisé pour être minimal
// =======================================================

import { PhysicsIcons } from '../../panels/physics/icons.js';
import { getWindowControlsHtml, initializeWindowControls, getWindowControlsStyles } from '../common/windowControls.js';

/**
 * Génère le HTML pour le calculateur Loi d'Ohm
 */
export function getBasicOhmHtml() {
  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('P = U²/R Converter')}
      
      <div class="calc-content flex-grow space-y-4">
        <div>
          <input type="radio" name="popup-ohm-target" value="ohm-p" id="popup-radio-ohm-p" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--theme-accent);">
          <label for="popup-radio-ohm-p" class="ml-2" style="color: var(--text-subtitle); font-size: 13px; font-weight: 500;">Power (W)</label>
          <input type="text" id="popup-ohm-p" class="calc-input mt-1">
        </div>
        
        <div>
          <input type="radio" name="popup-ohm-target" value="ohm-r" id="popup-radio-ohm-r" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--theme-accent);">
          <label for="popup-radio-ohm-r" class="ml-2" style="color: var(--text-subtitle); font-size: 13px; font-weight: 500;">Resistance (Ω)</label>
          <input type="text" id="popup-ohm-r" class="calc-input mt-1">
        </div>
        
        <div>
          <input type="radio" name="popup-ohm-target" value="ohm-u" id="popup-radio-ohm-u" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--theme-accent);">
          <label for="popup-radio-ohm-u" class="ml-2" style="color: var(--text-subtitle); font-size: 13px; font-weight: 500;">Voltage (V)</label>
          <input type="text" id="popup-ohm-u" class="calc-input mt-1" disabled>
        </div>
      </div>
    ${getCommonStyles()}
  `;
}

/**
 * Génère le HTML pour le calculateur de résistances parallèles
 */
export function getBasicParallelHtml() {
  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Parallel Resistors')}
      
      <div class="calc-content flex-grow space-y-4">
        <div>
          <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Number of Speakers</label>
          <input type="text" id="popup-para-count" class="calc-input">
        </div>
        <div>
          <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Resistance per Speaker (Ω)</label>
          <input type="text" id="popup-para-r-indiv" class="calc-input">
        </div>
        <div class="calc-result" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background-color: var(--bg-control-group); border-radius: 4px; border: 1px solid var(--theme-accent-dark); margin-top: 8px;">
          <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 600;">Total Resistance (Ω)</label>
          <span id="popup-para-r-total" class="result-value" style="color: var(--theme-accent); font-size: 18px; font-weight: 700; font-family: 'Courier New', monospace;">0.00</span>
        </div>
      </div>
    ${getCommonStyles()}
  `;
}

/**
 * Génère le HTML pour le calculateur de fréquence et longueur d'onde
 */
export function getBasicWavelengthHtml() {
  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Frequency & Wavelength')}
      
      <div class="calc-content flex-grow space-y-4">
        <div>
          <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Frequency (Hz)</label>
          <input type="text" id="popup-wave-freq" class="calc-input">
        </div>
        <div>
          <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Wavelength (m)</label>
          <input type="text" id="popup-wave-lambda" class="calc-input">
        </div>
        <div>
          <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">1/2 Wave (m)</label>
          <input type="text" id="popup-wave-half" class="calc-input">
        </div>
        <div>
          <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">1/4 Wave (m)</label>
          <input type="text" id="popup-wave-quarter" class="calc-input">
        </div>
      </div>
    ${getCommonStyles()}
  `;
}

/**
 * Retourne les styles CSS communs
 */
function getCommonStyles() {
  return `
    <style>
      .calc-input {
        width: 100%;
        padding: 10px 12px;
        background-color: var(--bg-control-group);
        border: 1px solid var(--border-secondary);
        border-radius: 4px;
        color: var(--text-body);
        font-size: 14px;
        font-family: inherit;
        transition: border-color 0.2s;
      }
      .calc-input:focus {
        outline: none;
        border-color: var(--theme-accent);
      }
      .calc-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    </style>
  `;
}

/**
 * Initialise la logique d'un calculateur basic
 */
export function initializeBasicCalculatorPopup() {
  console.log('[Basic Popup] Initialisation...');
  
  // Initialiser les contrôles de fenêtre avec le helper commun
  initializeWindowControls();

  // Détecte quel calculateur est chargé
  let calculatorId = null;
  if (document.getElementById('popup-ohm-p')) calculatorId = 'ohm';
  else if (document.getElementById('popup-para-count')) calculatorId = 'parallel';
  else if (document.getElementById('popup-wave-freq')) calculatorId = 'wavelength';

  if (!calculatorId) return;

  // Initialise selon le type de calculateur
  switch (calculatorId) {
    case 'ohm':
      initOhmCalculator();
      break;
    case 'parallel':
      initParallelCalculator();
      break;
    case 'wavelength':
      initWavelengthCalculator();
      break;
  }
}

/**
 * Calculateur Loi d'Ohm
 */
function initOhmCalculator() {
  const inputs = {
    p: document.getElementById('popup-ohm-p'),
    r: document.getElementById('popup-ohm-r'),
    u: document.getElementById('popup-ohm-u')
  };

  const radios = document.querySelectorAll('input[name="popup-ohm-target"]');
  
  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      Object.values(inputs).forEach(input => input.disabled = false);
      const target = radio.value.replace('ohm-', '');
      inputs[target].disabled = true;
      calculate();
    });
  });

  const calculate = () => {
    const p = parseFloat(inputs.p.value) || 0;
    const r = parseFloat(inputs.r.value) || 0;
    const u = parseFloat(inputs.u.value) || 0;
    const target = document.querySelector('input[name="popup-ohm-target"]:checked').value.replace('ohm-', '');

    if (target === 'p' && r && u) inputs.p.value = (u * u / r).toFixed(2);
    else if (target === 'r' && p && u) inputs.r.value = (u * u / p).toFixed(2);
    else if (target === 'u' && p && r) inputs.u.value = Math.sqrt(p * r).toFixed(2);
  };

  Object.values(inputs).forEach(input => input.addEventListener('input', calculate));
  calculate();
}

/**
 * Calculateur résistances parallèles
 */
function initParallelCalculator() {
  const count = document.getElementById('popup-para-count');
  const rIndiv = document.getElementById('popup-para-r-indiv');
  const rTotal = document.getElementById('popup-para-r-total');

  const calculate = () => {
    const n = parseFloat(count.value) || 0;
    const r = parseFloat(rIndiv.value) || 0;
    if (n && r) {
      rTotal.textContent = (r / n).toFixed(2);
    } else {
      rTotal.textContent = '0.00';
    }
  };

  count.addEventListener('input', calculate);
  rIndiv.addEventListener('input', calculate);
}

/**
 * Calculateur fréquence/longueur d'onde
 */
function initWavelengthCalculator() {
  const freq = document.getElementById('popup-wave-freq');
  const lambda = document.getElementById('popup-wave-lambda');
  const half = document.getElementById('popup-wave-half');
  const quarter = document.getElementById('popup-wave-quarter');

  const SPEED_OF_SOUND = 343; // m/s

  const calculateFromFreq = () => {
    const f = parseFloat(freq.value) || 0;
    if (f) {
      const l = SPEED_OF_SOUND / f;
      lambda.value = l.toFixed(4);
      half.value = (l / 2).toFixed(4);
      quarter.value = (l / 4).toFixed(4);
    }
  };

  const calculateFromLambda = () => {
    const l = parseFloat(lambda.value) || 0;
    if (l) {
      freq.value = (SPEED_OF_SOUND / l).toFixed(2);
      half.value = (l / 2).toFixed(4);
      quarter.value = (l / 4).toFixed(4);
    }
  };

  freq.addEventListener('input', calculateFromFreq);
  lambda.addEventListener('input', calculateFromLambda);
}
