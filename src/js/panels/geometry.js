// =======================================================
// FICHIER :  src/js/panels/geometry.js (VERSION FINALE AVEC CALCULS)
// Ce code est complet et prêt à l'emploi.
// =======================================================

import { showGeometryCalculatorSelector } from '../popup/geometry/geometry.js';
import { safeEvaluateMath } from './horn.js';

export function getGeometryPanelHtml() {
  // Le HTML est modifié pour permettre la saisie de calculs (ex: "500/2")
  // Nous changeons type="number" en type="text" et ajoutons la classe "calculable-input"
  return `
    <div class="p-6 text-green-400 h-full flex flex-col">
      <div class="flex justify-between items-center mb-6 flex-shrink-0">
        <h1 class="text-4xl font-bold text-white">Geometry</h1>
        <button id="pop-out-btn" data-tool="geometry" title="Open in a new window" class="btn btn--ghost p-2 ml-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </button>
      </div>

      <div class="flex items-center justify-center my-4 space-x-4 text-xl flex-shrink-0">
        <span>MM</span>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="unit-toggle" class="sr-only peer">
          <div class="toggle-track w-14 h-7 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
        </label>
        <span>CM</span>
      </div>

      <div id="geometry-calculators" class="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8 flex-grow overflow-y-auto pr-2">
        <section class="calc-section">
          <h2 class="calc-title">Rectangular volume calculator</h2>
          <div class="space-y-2">
            <div><label>Area (<span class="unit-label">mm</span>²)</label><input type="text" id="para-s" class="form-input calculable-input"></div>
            <div><label>Length (<span class="unit-label">mm</span>)</label><input type="text" id="para-l" class="form-input calculable-input"></div>
            <div><label>Speaker Volume (L)</label><input type="text" id="para-v-hp" class="form-input calculable-input" value="0"></div>
            <div class="pt-2"><label>Total Volume (L)</label><span id="para-v-total" class="form-output">0.000</span></div>
          </div>
        </section>

        <section class="calc-section">
          <h2 class="calc-title">Triangular prism volume calculator</h2>
          <div class="space-y-2">
            <p class="text-xs text-gray-400">Select the value to calculate:</p>
            <div>
              <input type="radio" name="prism-calc" value="v" id="radio-prism-v" checked>
              <label for="radio-prism-v" class="ml-2">Volume (L)</label>
              <input type="text" id="prism-v" class="form-input calculable-input" disabled>
            </div>
            <div>
              <input type="radio" name="prism-calc" value="h" id="radio-prism-h">
              <label for="radio-prism-h" class="ml-2">Height (<span class="unit-label">mm</span>)</label>
              <input type="text" id="prism-h" class="form-input calculable-input">
            </div>
            <div>
              <input type="radio" name="prism-calc" value="w" id="radio-prism-w">
              <label for="radio-prism-w" class="ml-2">Width (<span class="unit-label">mm</span>)</label>
              <input type="text" id="prism-w" class="form-input calculable-input">
            </div>
            <div>
              <input type="radio" name="prism-calc" value="d" id="radio-prism-d">
              <label for="radio-prism-d" class="ml-2">Depth (<span class="unit-label">mm</span>)</label>
              <input type="text" id="prism-d" class="form-input calculable-input">
            </div>
          </div>
        </section>

        <section class="calc-section">
          <h2 class="calc-title">Diameter ⇄ Area</h2>
          <div class="space-y-2">
            <div><label>Diameter (<span class="unit-label">mm</span>)</label><input type="text" id="dia-d" class="form-input calculable-input"></div>
            <div><label>Area (<span class="unit-label">mm</span>²)</label><input type="text" id="dia-a" class="form-input calculable-input"></div>
            <div><label>Radius (<span class="unit-label">mm</span>)</label><input type="text" id="dia-r" class="form-input calculable-input"></div>
          </div>
        </section>

        <section class="calc-section">
          <h2 class="calc-title">Metric ⇄ Inch</h2>
          <div class="space-y-2">
            <div><label>Value (<span class="unit-label">mm</span>)</label><input type="text" id="conv-metric" class="form-input calculable-input"></div>
            <div><label>Value (Inches)</label><input type="text" id="conv-inch" class="form-input calculable-input"></div>
          </div>
        </section>
      </div>
    </div>
  `;
}

export function initializeGeometryPanel() {
  // Rendre la fonction popup accessible globalement
  window.showGeometryCalculatorSelector = showGeometryCalculatorSelector;

  const unitToggle = document.getElementById('unit-toggle');
  let currentUnit = 'mm';

  const updateUnitLabels = () => {
    currentUnit = unitToggle.checked ? 'cm' : 'mm';
    document.querySelectorAll('.unit-label').forEach(label => label.textContent = currentUnit);
  };

  // --- CALCULATEUR 1: PARALLÉLÉPIPÈDE ---
  const paraS = document.getElementById('para-s'), paraL = document.getElementById('para-l'), paraVHp = document.getElementById('para-v-hp'), paraVTotal = document.getElementById('para-v-total');
  const calculateParaVolume = () => {
    const factor = (currentUnit === 'cm') ? 10 : 1;
    const s = (parseFloat(paraS.value) || 0) * factor * factor, l = (parseFloat(paraL.value) || 0) * factor, vHp = parseFloat(paraVHp.value) || 0;
    paraVTotal.textContent = ((s * l) / 1e6 - vHp).toFixed(3);
  };

  // --- CALCULATEUR 2: PRISME TRIANGULAIRE ---
  const prismInputs = { v: document.getElementById('prism-v'), h: document.getElementById('prism-h'), w: document.getElementById('prism-w'), d: document.getElementById('prism-d') };
  const calculatePrismVolume = () => {
    const factor = (currentUnit === 'cm') ? 10 : 1;
    const target = document.querySelector('input[name="prism-calc"]:checked').value;
    const v = parseFloat(prismInputs.v.value) || 0, h = (parseFloat(prismInputs.h.value) || 0) * factor, w = (parseFloat(prismInputs.w.value) || 0) * factor, d = (parseFloat(prismInputs.d.value) || 0) * factor;

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
  document.querySelectorAll('input[name="prism-calc"]').forEach(radio => {
    radio.addEventListener('change', e => {
      Object.values(prismInputs).forEach(input => input.disabled = false);
      prismInputs[e.target.value].disabled = true;
    });
  });

  // --- CALCULATEUR 3: DIAMÈTRE <-> AIRE <-> RAYON ---
  const diaD = document.getElementById('dia-d'), diaA = document.getElementById('dia-a'), diaR = document.getElementById('dia-r');
  const calculateDiaFromD = () => {
    const d = parseFloat(diaD.value) || 0;
    diaR.value = (d / 2).toFixed(3);
    diaA.value = (Math.PI * (d / 2) ** 2).toFixed(2);
  };
  const calculateDiaFromA = () => {
    const a = parseFloat(diaA.value) || 0;
    const r = Math.sqrt(a / Math.PI);
    diaR.value = r.toFixed(3);
    diaD.value = (r * 2).toFixed(2);
  };
  const calculateDiaFromR = () => {
    const r = parseFloat(diaR.value) || 0;
    diaD.value = (r * 2).toFixed(2);
    diaA.value = (Math.PI * r ** 2).toFixed(2);
  };

  // --- CALCULATEUR 4: MÉTRIQUE <-> POUCES ---
  const convMetric = document.getElementById('conv-metric'), convInch = document.getElementById('conv-inch');
  const calculateMetricToInch = () => {
    const factor = (currentUnit === 'cm') ? 2.54 : 25.4;
    convInch.value = ((parseFloat(convMetric.value) || 0) / factor).toFixed(4);
  };
  const calculateInchToMetric = () => {
    const factor = (currentUnit === 'cm') ? 2.54 : 25.4;
    convMetric.value = ((parseFloat(convInch.value) || 0) * factor).toFixed(2);
  };

  // --- GESTION CENTRALE DES ÉVÉNEMENTS ---
  const container = document.getElementById('geometry-calculators');
  container.addEventListener('input', e => {
    const targetId = e.target.id;
    if (targetId.startsWith('para-')) calculateParaVolume();
    else if (targetId.startsWith('prism-')) calculatePrismVolume();
    else if (targetId === 'dia-d') calculateDiaFromD();
    else if (targetId === 'dia-a') calculateDiaFromA();
    else if (targetId === 'dia-r') calculateDiaFromR();
    else if (targetId === 'conv-metric') calculateMetricToInch();
    else if (targetId === 'conv-inch') calculateInchToMetric();
  });
  
  unitToggle.addEventListener('change', () => {
    updateUnitLabels();
    calculateParaVolume();
    calculatePrismVolume();
    calculateMetricToInch();
  });
  
  // =======================================================
  // DÉBUT DE LA NOUVELLE FONCTIONNALITÉ AJOUTÉE
  // =======================================================

  // Cette fonction gère le calcul des expressions mathématiques
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
        // calculs de la page (comme le volume total) se mettent à jour.
        input.dispatchEvent(new Event('input', { bubbles: true }));

      } catch (error) {
        // Si le calcul échoue (ex: "1+/2"), on ne fait rien et on log l'erreur.
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

  // On applique ces écouteurs à tous nos champs de saisie
  document.querySelectorAll('.calculable-input').forEach(input => {
    input.addEventListener('keydown', handleCalculationOnEnter);
    input.addEventListener('blur', handleCalculationOnBlur);
  });
  
  // =======================================================
  // FIN DE LA NOUVELLE FONCTIONNALITÉ AJOUTÉE
  // =======================================================

  // Initialisation au chargement
  updateUnitLabels();
}