// =======================================================
// FICHIER :  src/popup/geometryCalculators.js
// RÔLE    :  Affichage des calculateurs geometry en mode popup compact
//            Chaque calculateur a son propre HTML optimisé pour être minimal
// =======================================================

import { getWindowControlsHtml, initializeWindowControls, getWindowControlsStyles } from '../common/windowControls.js';
import { safeEvaluateMath } from '../../panels/horn/formulas.js';

/**
 * Génère le HTML pour le calculateur rectangulaire
 */
export function getGeometryRectangularHtml() {
  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Rectangular Volume')}
      
      <div class="calc-content flex-grow">
        <div class="space-y-4">
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Area (<span class="unit-label">mm</span>²)</label>
            <input type="text" id="popup-para-s" class="calc-input" placeholder="0">
          </div>
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Length (<span class="unit-label">mm</span>)</label>
            <input type="text" id="popup-para-l" class="calc-input" placeholder="0">
          </div>
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Speaker Volume (L)</label>
            <input type="text" id="popup-para-v-hp" class="calc-input" placeholder="0" value="0">
          </div>
          <div class="calc-result" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background-color: var(--bg-control-group); border-radius: 4px; border: 1px solid var(--theme-accent-dark); margin-top: 8px;">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 600;">Total Volume (L)</label>
            <span id="popup-para-v-total" class="result-value" style="color: var(--theme-accent); font-size: 18px; font-weight: 700; font-family: 'Courier New', monospace;">0.000</span>
          </div>
        </div>
      </div>
      
      <div class="calc-footer" style="padding-top: 16px; border-top: 1px solid var(--border-secondary); display: flex; justify-content: center; margin-top: auto;">
        <div class="unit-toggle-container" style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 12px; color: var(--text-muted);">MM</span>
          <label class="unit-toggle" style="position: relative; display: inline-block; width: 48px; height: 24px;">
            <input type="checkbox" id="popup-unit-toggle" style="opacity: 0; width: 0; height: 0;">
            <div class="unit-toggle-slider"></div>
          </label>
          <span style="font-size: 12px; color: var(--text-muted);">CM</span>
        </div>
      </div>
    ${getCommonStyles()}
  `;
}

/**
 * Génère le HTML pour le calculateur de prisme triangulaire
 */
export function getGeometryPrismHtml() {
  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Triangular Prism')}
      
      <div class="calc-content flex-grow">
        <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 12px;">Select the value to calculate:</p>
        <div class="space-y-3">
          <div class="radio-field" style="display: flex; align-items: center; gap: 8px;">
            <input type="radio" name="popup-prism-calc" value="v" id="popup-radio-prism-v" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--theme-accent);">
            <label for="popup-radio-prism-v" style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; min-width: 140px; cursor: pointer;">Volume (L)</label>
            <input type="text" id="popup-prism-v" class="calc-input" disabled style="flex: 1;">
          </div>
          <div class="radio-field" style="display: flex; align-items: center; gap: 8px;">
            <input type="radio" name="popup-prism-calc" value="h" id="popup-radio-prism-h" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--theme-accent);">
            <label for="popup-radio-prism-h" style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; min-width: 140px; cursor: pointer;">Height (<span class="unit-label">mm</span>)</label>
            <input type="text" id="popup-prism-h" class="calc-input" style="flex: 1;">
          </div>
          <div class="radio-field" style="display: flex; align-items: center; gap: 8px;">
            <input type="radio" name="popup-prism-calc" value="w" id="popup-radio-prism-w" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--theme-accent);">
            <label for="popup-radio-prism-w" style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; min-width: 140px; cursor: pointer;">Width (<span class="unit-label">mm</span>)</label>
            <input type="text" id="popup-prism-w" class="calc-input" style="flex: 1;">
          </div>
          <div class="radio-field" style="display: flex; align-items: center; gap: 8px;">
            <input type="radio" name="popup-prism-calc" value="d" id="popup-radio-prism-d" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--theme-accent);">
            <label for="popup-radio-prism-d" style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; min-width: 140px; cursor: pointer;">Depth (<span class="unit-label">mm</span>)</label>
            <input type="text" id="popup-prism-d" class="calc-input" style="flex: 1;">
          </div>
        </div>
      </div>
      
      <div class="calc-footer" style="padding-top: 16px; border-top: 1px solid var(--border-secondary); display: flex; justify-content: center; margin-top: auto;">
        <div class="unit-toggle-container" style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 12px; color: var(--text-muted);">MM</span>
          <label class="unit-toggle" style="position: relative; display: inline-block; width: 48px; height: 24px;">
            <input type="checkbox" id="popup-unit-toggle" style="opacity: 0; width: 0; height: 0;">
            <div class="unit-toggle-slider"></div>
          </label>
          <span style="font-size: 12px; color: var(--text-muted);">CM</span>
        </div>
      </div>
    ${getCommonStyles()}
  `;
}

/**
 * Génère le HTML pour le calculateur de prisme à section trapézoïdale
 */
export function getGeometryTrapezoidalHtml() {
  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Trapezoidal Prism')}
      <div class="calc-content flex-grow">
        <div class="space-y-4">
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Height 1 (<span class="unit-label">mm</span>)</label>
            <input type="text" id="popup-trap-h1" class="calc-input" placeholder="0">
          </div>
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Height 2 (<span class="unit-label">mm</span>)</label>
            <input type="text" id="popup-trap-h2" class="calc-input" placeholder="0">
          </div>
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Width (<span class="unit-label">mm</span>)</label>
            <input type="text" id="popup-trap-w" class="calc-input" placeholder="0">
          </div>
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Depth (<span class="unit-label">mm</span>)</label>
            <input type="text" id="popup-trap-d" class="calc-input" placeholder="0">
          </div>
          <div class="calc-result" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background-color: var(--bg-control-group); border-radius: 4px; border: 1px solid var(--theme-accent-dark); margin-top: 8px;">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 600;">Total Volume (L)</label>
            <span id="popup-trap-v" class="result-value" style="color: var(--theme-accent); font-size: 18px; font-weight: 700; font-family: 'Courier New', monospace;">0.000</span>
          </div>
        </div>
      </div>
      <div class="calc-footer" style="padding-top: 16px; border-top: 1px solid var(--border-secondary); display: flex; justify-content: center; margin-top: auto;">
        <div class="unit-toggle-container" style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 12px; color: var(--text-muted);">MM</span>
          <label class="unit-toggle" style="position: relative; display: inline-block; width: 48px; height: 24px;">
            <input type="checkbox" id="popup-unit-toggle" style="opacity: 0; width: 0; height: 0;">
            <div class="unit-toggle-slider"></div>
          </label>
          <span style="font-size: 12px; color: var(--text-muted);">CM</span>
        </div>
      </div>
    ${getCommonStyles()}
  `;
}

/**
 * Génère le HTML pour le calculateur diamètre
 */
export function getGeometryDiameterHtml() {
  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Diameter ⇄ Area')}
      
      <div class="calc-content flex-grow">
        <div class="space-y-4">
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Diameter (<span class="unit-label">mm</span>)</label>
            <input type="text" id="popup-dia-d" class="calc-input" placeholder="0">
          </div>
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Area (<span class="unit-label">mm</span>²)</label>
            <input type="text" id="popup-dia-a" class="calc-input" placeholder="0">
          </div>
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Radius (<span class="unit-label">mm</span>)</label>
            <input type="text" id="popup-dia-r" class="calc-input" placeholder="0">
          </div>
        </div>
      </div>
      
      <div class="calc-footer" style="padding-top: 16px; border-top: 1px solid var(--border-secondary); display: flex; justify-content: center; margin-top: auto;">
        <div class="unit-toggle-container" style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 12px; color: var(--text-muted);">MM</span>
          <label class="unit-toggle" style="position: relative; display: inline-block; width: 48px; height: 24px;">
            <input type="checkbox" id="popup-unit-toggle" style="opacity: 0; width: 0; height: 0;">
            <div class="unit-toggle-slider"></div>
          </label>
          <span style="font-size: 12px; color: var(--text-muted);">CM</span>
        </div>
      </div>
    ${getCommonStyles()}
  `;
}

/**
 * Génère le HTML pour le calculateur de conversion
 */
export function getGeometryConversionHtml() {
  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Metric ⇄ Inch')}
      
      <div class="calc-content flex-grow">
        <div class="space-y-4">
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Value (<span class="unit-label">mm</span>)</label>
            <input type="text" id="popup-conv-metric" class="calc-input" placeholder="0">
          </div>
          <div class="calc-field">
            <label style="color: var(--text-subtitle); font-size: 13px; font-weight: 500; display: block; margin-bottom: 6px;">Value (Inches)</label>
            <input type="text" id="popup-conv-inch" class="calc-input" placeholder="0">
          </div>
        </div>
      </div>
      
      <div class="calc-footer" style="padding-top: 16px; border-top: 1px solid var(--border-secondary); display: flex; justify-content: center; margin-top: auto;">
        <div class="unit-toggle-container" style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 12px; color: var(--text-muted);">MM</span>
          <label class="unit-toggle" style="position: relative; display: inline-block; width: 48px; height: 24px;">
            <input type="checkbox" id="popup-unit-toggle" style="opacity: 0; width: 0; height: 0;">
            <div class="unit-toggle-slider"></div>
          </label>
          <span style="font-size: 12px; color: var(--text-muted);">CM</span>
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
      .unit-toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--bg-control-group);
        border: 1px solid var(--border-secondary);
        transition: .3s;
        border-radius: 24px;
      }
      .unit-toggle-slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 2px;
        bottom: 2px;
        background-color: var(--text-title);
        transition: .3s;
        border-radius: 50%;
      }
      .unit-toggle input:checked + .unit-toggle-slider {
        background-color: var(--theme-accent-dark);
      }
      .unit-toggle input:checked + .unit-toggle-slider:before {
        transform: translateX(24px);
      }
    </style>
  `;
}

/**
 * Évalue les expressions mathématiques dans les champs de saisie
 */
function setupCalculableInputs() {
  const evaluateExpression = (input) => {
    let expression = input.value.trim();
    
    // On vérifie si l'expression contient un opérateur de calcul
    if (['+', '-', '*', '/'].some(op => expression.includes(op))) {
      try {
        // On remplace la virgule par un point pour les nombres décimaux
        expression = expression.replace(/,/g, '.');
        
        // Utilisation de safeEvaluateMath pour évaluer l'expression de façon sécurisée
        const result = safeEvaluateMath(expression);
        
        // On met à jour la valeur du champ avec le résultat
        input.value = result;
        
        // On déclenche manuellement un événement "input" pour que les autres
        // calculs de la page se mettent à jour.
        input.dispatchEvent(new Event('input', { bubbles: true }));

      } catch (error) {
        console.error("Calculation error:", error);
      }
    }
  };

  // Gestion du calcul sur Entrée
  const handleCalculationOnEnter = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      evaluateExpression(event.target);
    }
  };

  // Gestion du calcul sur perte de focus (blur)
  const handleCalculationOnBlur = (event) => {
    evaluateExpression(event.target);
  };

  // Applique les écouteurs à tous les champs de calcul
  document.querySelectorAll('.calc-input:not([disabled])').forEach(input => {
    input.addEventListener('keydown', handleCalculationOnEnter);
    input.addEventListener('blur', handleCalculationOnBlur);
  });
}

/**
 * Initialise la logique d'un calculateur
 */
export function initializeGeometryCalculator() {
  console.log('[Geometry Popup] Initialisation...');
  
  // Initialiser les contrôles de fenêtre avec le helper commun
  initializeWindowControls();
  
  // Configurer les champs calculables
  setupCalculableInputs();

  // Détecte quel calculateur est chargé en fonction des éléments présents
  let calculatorId = null;
  if (document.getElementById('popup-para-s')) calculatorId = 'rectangular';
  else if (document.getElementById('popup-prism-v')) calculatorId = 'prism';
  else if (document.getElementById('popup-trap-h1')) calculatorId = 'trapezoidal';
  else if (document.getElementById('popup-dia-d')) calculatorId = 'diameter';
  else if (document.getElementById('popup-conv-metric')) calculatorId = 'conversion';

  if (!calculatorId) return;

  const unitToggle = document.getElementById('popup-unit-toggle');
  let currentUnit = 'mm';

  const updateUnitLabels = () => {
    currentUnit = unitToggle.checked ? 'cm' : 'mm';
    document.querySelectorAll('.unit-label').forEach(label => label.textContent = currentUnit);
  };

  if (unitToggle) {
    unitToggle.addEventListener('change', () => {
      updateUnitLabels();
      // Recalcule après changement d'unité
      const firstInput = document.querySelector('.calc-input:not(:disabled)');
      if (firstInput) {
        firstInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  // Initialise selon le type de calculateur
  switch (calculatorId) {
    case 'rectangular':
      initRectangularCalculator(() => currentUnit);
      break;
    case 'prism':
      initPrismCalculator(() => currentUnit);
      break;
    case 'trapezoidal':
      initTrapezoidalCalculator(() => currentUnit);
      break;
    case 'diameter':
      initDiameterCalculator();
      break;
    case 'conversion':
      initConversionCalculator(() => currentUnit);
      break;
  }
}

function initTrapezoidalCalculator(getCurrentUnit) {
  const inputs = {
    h1: document.getElementById('popup-trap-h1'),
    h2: document.getElementById('popup-trap-h2'),
    w: document.getElementById('popup-trap-w'),
    d: document.getElementById('popup-trap-d')
  };
  const volume = document.getElementById('popup-trap-v');

  const calculate = () => {
    const factor = (getCurrentUnit() === 'cm') ? 10 : 1;
    const h1 = (parseFloat(inputs.h1.value) || 0) * factor;
    const h2 = (parseFloat(inputs.h2.value) || 0) * factor;
    const w = (parseFloat(inputs.w.value) || 0) * factor;
    const d = (parseFloat(inputs.d.value) || 0) * factor;
    volume.textContent = (((h1 + h2) / 2 * w * d) / 1e6).toFixed(3);
  };

  Object.values(inputs).forEach(input => input.addEventListener('input', calculate));
}

/**
 * Calculateur rectangulaire
 */
function initRectangularCalculator(getCurrentUnit) {
  const paraS = document.getElementById('popup-para-s');
  const paraL = document.getElementById('popup-para-l');
  const paraVHp = document.getElementById('popup-para-v-hp');
  const paraVTotal = document.getElementById('popup-para-v-total');

  const calculate = () => {
    const factor = (getCurrentUnit() === 'cm') ? 10 : 1;
    const s = (parseFloat(paraS.value) || 0) * factor * factor;
    const l = (parseFloat(paraL.value) || 0) * factor;
    const vHp = parseFloat(paraVHp.value) || 0;
    paraVTotal.textContent = ((s * l) / 1e6 - vHp).toFixed(3);
  };

  [paraS, paraL, paraVHp].forEach(input => {
    input.addEventListener('input', calculate);
  });
}

/**
 * Calculateur prisme triangulaire
 */
function initPrismCalculator(getCurrentUnit) {
  const prismInputs = {
    v: document.getElementById('popup-prism-v'),
    h: document.getElementById('popup-prism-h'),
    w: document.getElementById('popup-prism-w'),
    d: document.getElementById('popup-prism-d')
  };

  const calculate = () => {
    const factor = (getCurrentUnit() === 'cm') ? 10 : 1;
    const target = document.querySelector('input[name="popup-prism-calc"]:checked').value;
    const v = parseFloat(prismInputs.v.value) || 0;
    const h = (parseFloat(prismInputs.h.value) || 0) * factor;
    const w = (parseFloat(prismInputs.w.value) || 0) * factor;
    const d = (parseFloat(prismInputs.d.value) || 0) * factor;

    let result = {};
    if (target === 'v') result.v = (0.5 * h * w * d) / 1e6;
    else if (target === 'h' && w && d) result.h = (v * 1e6 * 2) / (w * d);
    else if (target === 'w' && h && d) result.w = (v * 1e6 * 2) / (h * d);
    else if (target === 'd' && h && w) result.d = (v * 1e6 * 2) / (h * w);

    if (result.v !== undefined) prismInputs.v.value = result.v.toFixed(3);
    if (result.h !== undefined) prismInputs.h.value = (result.h / factor).toFixed(2);
    if (result.w !== undefined) prismInputs.w.value = (result.w / factor).toFixed(2);
    if (result.d !== undefined) prismInputs.d.value = (result.d / factor).toFixed(2);
  };

  document.querySelectorAll('input[name="popup-prism-calc"]').forEach(radio => {
    radio.addEventListener('change', e => {
      Object.values(prismInputs).forEach(input => input.disabled = false);
      prismInputs[e.target.value].disabled = true;
      calculate();
    });
  });

  Object.values(prismInputs).forEach(input => {
    input.addEventListener('input', calculate);
  });
}

/**
 * Calculateur diamètre
 */
function initDiameterCalculator() {
  initializeWindowControls();
  
  const diaD = document.getElementById('popup-dia-d');
  const diaA = document.getElementById('popup-dia-a');
  const diaR = document.getElementById('popup-dia-r');

  const calculateFromD = () => {
    const d = parseFloat(diaD.value) || 0;
    diaR.value = (d / 2).toFixed(3);
    diaA.value = (Math.PI * (d / 2) ** 2).toFixed(2);
  };

  const calculateFromA = () => {
    const a = parseFloat(diaA.value) || 0;
    const r = Math.sqrt(a / Math.PI);
    diaR.value = r.toFixed(3);
    diaD.value = (r * 2).toFixed(2);
  };

  const calculateFromR = () => {
    const r = parseFloat(diaR.value) || 0;
    diaD.value = (r * 2).toFixed(2);
    diaA.value = (Math.PI * r ** 2).toFixed(2);
  };

  diaD.addEventListener('input', calculateFromD);
  diaA.addEventListener('input', calculateFromA);
  diaR.addEventListener('input', calculateFromR);
}

/**
 * Calculateur conversion
 */
function initConversionCalculator(getCurrentUnit) {
  const convMetric = document.getElementById('popup-conv-metric');
  const convInch = document.getElementById('popup-conv-inch');

  const calculateToInch = () => {
    const factor = (getCurrentUnit() === 'cm') ? 2.54 : 25.4;
    convInch.value = ((parseFloat(convMetric.value) || 0) / factor).toFixed(4);
  };

  const calculateToMetric = () => {
    const factor = (getCurrentUnit() === 'cm') ? 2.54 : 25.4;
    convMetric.value = ((parseFloat(convInch.value) || 0) * factor).toFixed(2);
  };

  convMetric.addEventListener('input', calculateToInch);
  convInch.addEventListener('input', calculateToMetric);
}
