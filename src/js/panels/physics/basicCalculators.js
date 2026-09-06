// =================================================================================
// FICHIER : src/js/panels/physics/basicCalculators.js
// RÔLE    : Calculateurs de base (Loi d'Ohm, Résistances parallèles, Fréquence/Longueur d'onde)
// =================================================================================

import { PhysicsIcons } from './icons.js';

export function getBasicCalculatorsHtml() {
  return `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      
      <section class="calc-section">
        <h2 class="calc-title">P = U²/R Converter</h2>
        <div class="space-y-2">
          
          <!-- Champ Puissance -->
          <div>
            <input type="radio" name="ohm-target" value="ohm-p" id="radio-ohm-p">
            <label for="radio-ohm-p" class="ml-2">Power (W)</label>
            <input type="text" id="ohm-p" class="form-input">
          </div>
          
          <!-- Champ Résistance -->
          <div>
            <input type="radio" name="ohm-target" value="ohm-r" id="radio-ohm-r">
            <label for="radio-ohm-r" class="ml-2">Resistance (Ω)</label>
            <input type="text" id="ohm-r" class="form-input">
          </div>
          
          <!-- Champ Tension -->
          <div>
            <input type="radio" name="ohm-target" value="ohm-u" id="radio-ohm-u" checked>
            <label for="radio-ohm-u" class="ml-2">Voltage (V)</label>
            <input type="text" id="ohm-u" class="form-input" disabled>
          </div>

        </div>
      </section>
      
      <section class="calc-section">
        <h2 class="calc-title">Parallel Resistors</h2>
        <div class="space-y-2">
          <div>
            <label>Number of Speakers</label>
            <input type="text" id="para-count" class="form-input">
          </div>
          <div>
            <label>Resistance per Speaker (Ω)</label>
            <input type="text" id="para-r-indiv" class="form-input">
          </div>
          <div class="pt-2">
            <label>Total Resistance (Ω)</label>
            <span id="para-r-total" class="form-output">0.00</span>
          </div>

        </div>
      </section>

      <section class="calc-section">
        <div class="flex items-center justify-between mb-2">
          <h2 class="calc-title mb-0">Frequency & Wavelength</h2>
          <button id="wave-unit-toggle" style="background: color-mix(in srgb, var(--border-primary) 18%, transparent); color: var(--border-primary); font-size: 1rem; font-family: monospace; font-weight: bold; padding: 3px 14px; border-radius: 20px; border: none; cursor: pointer; transition: background 0.2s, color 0.2s;">m</button>
        </div>
        <div class="space-y-2">
          <div>
            <label>Frequency (Hz)</label>
            <input type="text" id="wave-freq" class="form-input">
          </div>
          <div>
            <label id="wave-lambda-label">Wavelength (m)</label>
            <input type="text" id="wave-lambda" class="form-input">
          </div>
          <div>
            <label id="wave-half-label">1/2 Wave (m)</label>
            <input type="text" id="wave-half" class="form-input">
          </div>
          <div>
            <label id="wave-quarter-label">1/4 Wave (m)</label>
            <input type="text" id="wave-quarter" class="form-input">
          </div>

        </div>
      </section>

    </div>
  `;
}

export function initializeBasicCalculators() {
  // Safe math expression evaluator (no eval/Function)
  const evaluateMathExpression = (expr) => {
    try {
      // Remove spaces
      expr = expr.replace(/\s+/g, '');
      
      // Parse and evaluate expression safely
      const tokens = expr.match(/(\d+\.?\d*|[+\-*/()])/g);
      if (!tokens) return null;
      
      let pos = 0;
      
      const parseExpression = () => {
        let left = parseTerm();
        while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
          const op = tokens[pos++];
          const right = parseTerm();
          left = op === '+' ? left + right : left - right;
        }
        return left;
      };
      
      const parseTerm = () => {
        let left = parseFactor();
        while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
          const op = tokens[pos++];
          const right = parseFactor();
          left = op === '*' ? left * right : left / right;
        }
        return left;
      };
      
      const parseFactor = () => {
        if (tokens[pos] === '(') {
          pos++;
          const result = parseExpression();
          pos++; // skip ')'
          return result;
        }
        return parseFloat(tokens[pos++]);
      };
      
      return parseExpression();
    } catch (e) {
      return null;
    }
  };

  // Enable inline calculation helper - evaluate math expressions on Enter
  const enableInlineCalculation = (inputElement) => {
    inputElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        const expression = inputElement.value.trim();
        // Only try to evaluate if it contains operators
        if (/[+\-*/()]/.test(expression) && !/^\d+\.?\d*$/.test(expression)) {
          event.preventDefault();
          const result = evaluateMathExpression(expression);
          if (result !== null && isFinite(result)) {
            inputElement.value = result;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
    });
  };

  // === CALCULATEUR 1: LOI D'OHM ===
  const p_input = document.getElementById('ohm-p');
  const u_input = document.getElementById('ohm-u');
  const r_input = document.getElementById('ohm-r');
  
  if (!p_input || !u_input || !r_input) {
    console.error('Ohm calculator inputs not found');
    return;
  }
  
  const ohm_inputs = { 'ohm-p': p_input, 'ohm-r': r_input, 'ohm-u': u_input };
  
  const calculateOhm = () => {
    const targetId = document.querySelector('input[name="ohm-target"]:checked').value;
    const P = parseFloat(p_input.value);
    const U = parseFloat(u_input.value);
    const R = parseFloat(r_input.value);
    
    switch (targetId) {
      case 'ohm-p':
        if (!isNaN(U) && !isNaN(R)) p_input.value = (Math.pow(U, 2) / R).toFixed(2);
        break;
      case 'ohm-u':
        if (!isNaN(P) && !isNaN(R)) u_input.value = Math.sqrt(P * R).toFixed(2);
        break;
      case 'ohm-r':
        if (!isNaN(P) && !isNaN(U) && P > 0) r_input.value = (Math.pow(U, 2) / P).toFixed(2);
        break;
    }
  };
  
  [p_input, u_input, r_input].forEach(input => {
    input.addEventListener('input', calculateOhm);
    enableInlineCalculation(input);
  });

  document.querySelectorAll('input[name="ohm-target"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      Object.values(ohm_inputs).forEach(input => input.disabled = false);
      ohm_inputs[e.target.value].disabled = true;
      calculateOhm();
    });
  });

  // === CALCULATEUR 2: RÉSISTANCES EN PARALLÈLE ===
  const count = document.getElementById('para-count');
  const rIndiv = document.getElementById('para-r-indiv');
  const rTotal = document.getElementById('para-r-total');
  
  const calculateParallelR = () => {
    const numHP = parseInt(count.value, 10);
    const rHP = parseFloat(rIndiv.value);
    
    if (numHP > 0 && !isNaN(rHP) && rHP > 0) {
      const total = rHP / numHP;
      rTotal.textContent = total.toFixed(2);
    } else {
      rTotal.textContent = '0.00';
    }
  };
  
  [count, rIndiv].forEach(el => {
    el.addEventListener('input', calculateParallelR);
    enableInlineCalculation(el);
  });

  // Smart Tab: Transfer result to Ohm's Law calculator
  rIndiv.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !event.shiftKey) {
      const total = parseFloat(rTotal.textContent);
      if (!isNaN(total) && total > 0) {
        event.preventDefault();
        
        // Transfer to Ohm's Law resistance field
        r_input.value = total.toFixed(2);
        r_input.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Focus on Power input
        p_input.focus();
        p_input.select();
      }
    }
  });

  // === CALCULATEUR 3: FRÉQUENCE / LONGUEUR D'ONDE ===
  const freqInput = document.getElementById('wave-freq');
  const lambdaInput = document.getElementById('wave-lambda');
  const halfInput = document.getElementById('wave-half');
  const quarterInput = document.getElementById('wave-quarter');
  const waveUnitToggle = document.getElementById('wave-unit-toggle');
  const SPEED_OF_SOUND = 343;
  let waveInMm = false;

  const updateWaveLabels = () => {
    const unit = waveInMm ? 'mm' : 'm';
    waveUnitToggle.textContent = unit;
    waveUnitToggle.style.background = waveInMm
      ? 'var(--border-primary)'
      : 'color-mix(in srgb, var(--border-primary) 18%, transparent)';
    waveUnitToggle.style.color = waveInMm ? '#000' : 'var(--border-primary)';
    document.getElementById('wave-lambda-label').textContent = `Wavelength (${unit})`;
    document.getElementById('wave-half-label').textContent = `1/2 Wave (${unit})`;
    document.getElementById('wave-quarter-label').textContent = `1/4 Wave (${unit})`;
  };

  waveUnitToggle.addEventListener('click', () => {
    waveInMm = !waveInMm;
    const factor = waveInMm ? 1000 : 1 / 1000;
    [lambdaInput, halfInput, quarterInput].forEach(input => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) {
        input.value = waveInMm ? (val * 1000).toFixed(1) : (val / 1000).toFixed(3);
      }
    });
    updateWaveLabels();
  });

  const calculateWavelength = (event) => {
    const sourceId = event.target.id;
    const value = parseFloat(event.target.value);
    const decimals = waveInMm ? 1 : 3;
    const toM = (v) => waveInMm ? v / 1000 : v;
    const fromM = (v) => waveInMm ? v * 1000 : v;

    if (isNaN(value) || value <= 0) {
      if (sourceId !== 'wave-freq') freqInput.value = '';
      if (sourceId !== 'wave-lambda') lambdaInput.value = '';
      if (sourceId !== 'wave-half') halfInput.value = '';
      if (sourceId !== 'wave-quarter') quarterInput.value = '';
      return;
    }

    let lambda = 0; // always in meters internally
    switch (sourceId) {
      case 'wave-freq': lambda = SPEED_OF_SOUND / value; break;
      case 'wave-lambda': lambda = toM(value); break;
      case 'wave-half': lambda = toM(value) * 2; break;
      case 'wave-quarter': lambda = toM(value) * 4; break;
    }

    if (sourceId !== 'wave-freq') freqInput.value = (SPEED_OF_SOUND / lambda).toFixed(2);
    if (sourceId !== 'wave-lambda') lambdaInput.value = fromM(lambda).toFixed(decimals);
    if (sourceId !== 'wave-half') halfInput.value = fromM(lambda / 2).toFixed(decimals);
    if (sourceId !== 'wave-quarter') quarterInput.value = fromM(lambda / 4).toFixed(decimals);
  };

  [freqInput, lambdaInput, halfInput, quarterInput].forEach(input => {
    input.addEventListener('input', calculateWavelength);
    enableInlineCalculation(input);
  });

}
