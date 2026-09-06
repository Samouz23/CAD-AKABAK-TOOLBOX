// =================================================================================
// FICHIER : src/js/panels/physics/crossoverCalculator.js
// RÔLE    : Calculateur de filtres audio passifs (Crossover) selon spécifications techniques
// =================================================================================

export function getCrossoverCalculatorHtml() {
  return `
    <div id="crossover-root" class="space-y-6 relative">
      
      <!-- Filter Calculator -->
      <section class="calc-section">
        <div class="flex items-center justify-between mb-1">
          <h2 class="calc-title mb-0">Passive Audio Crossover Filter Calculator</h2>
          <button id="cross-presets-btn" class="wg-preset-toggle-btn" title="Crossover Presets" style="position: static;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>

        <!-- Modal Presets (Toast central avec blur) -->
        <div id="cross-presets-modal-overlay" class="wg-presets-modal-overlay hidden">
          <div class="wg-presets-modal">
            <div class="wg-presets-header">
              <div>
                <h2 class="wg-presets-title">Crossover Presets</h2>
                <p class="wg-presets-subtitle">Save and load crossover configurations</p>
              </div>
              <button id="cross-presets-panel-close" class="wg-presets-close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div id="cross-presets-list" class="wg-presets-list"></div>
            <div class="wg-presets-save-row">
              <input id="cross-preset-name-input" type="text" class="wg-preset-name-input" placeholder="Preset name...">
              <button id="cross-preset-save-btn" class="wg-preset-save-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Save
              </button>
            </div>
          </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          <!-- Input Section (LEFT) -->
          <div class="space-y-4">
            
            <div>
              <label class="block mb-2 text-sm font-semibold text-gray-300">Filter Type</label>
              <select id="cross-filter-type" class="form-input">
                <option value="lowpass">Low-Pass</option>
                <option value="highpass">High-Pass</option>
                <option value="bandpass">Band-Pass</option>
              </select>
            </div>

            <div>
              <label class="block mb-2 text-sm font-semibold text-gray-300">Topology</label>
              <select id="cross-topology" class="form-input">
                <option value="butterworth">Butterworth</option>
                <option value="linkwitz-riley">Linkwitz-Riley</option>
              </select>
            </div>

            <div>
              <label class="block mb-1">Cutoff Frequency (Hz)</label>
              <input type="text" id="cross-freq" class="form-input" value="2000">
            </div>

            <div id="bandpass-high-freq" class="hidden">
              <label class="block mb-1">High Frequency (Hz) - Band-Pass</label>
              <input type="text" id="cross-freq-high" class="form-input" value="5000">
            </div>

            <div>
              <label class="block mb-1">Speaker Impedance (Ω)</label>
              <input type="text" id="cross-impedance" class="form-input" value="8">
            </div>

            <div>
              <label class="block mb-1">Filter Order</label>
              <select id="cross-order" class="form-input">
                <option value="1">Order 1 (6 dB/oct)</option>
                <option value="2" selected>Order 2 (12 dB/oct)</option>
                <option value="3">Order 3 (18 dB/oct)</option>
                <option value="4">Order 4 (24 dB/oct)</option>
              </select>
            </div>

          </div>

          <!-- Results Section (RIGHT) -->
          <div class="space-y-4">
            <h3 class="text-lg font-semibold mb-3">Component Values</h3>
            
            <div id="crossover-results" class="space-y-3">
              <!-- Results will be populated here -->
            </div>

          </div>

        </div>

        <!-- Circuit Diagram (Full Width) -->
        <div class="mt-6">
          <button id="toggle-circuit-diagram" class="w-full p-4 bg-gray-800 rounded hover:bg-gray-700 transition-colors flex items-center justify-between">
            <h3 class="text-lg font-semibold">Circuit Diagram</h3>
            <span id="diagram-toggle-icon" class="text-2xl">▼</span>
          </button>
          <div id="circuit-diagram-container" class="hidden mt-2 p-4 bg-gray-800 rounded">
            <div id="circuit-diagram" class="circuit-diagram-container">
              <!-- Diagram will be shown here -->
            </div>
          </div>
        </div>

      </section>

    </div>
  `;
}

export function initializeCrossoverCalculator() {
  const freqInput = document.getElementById('cross-freq');
  const freqHighInput = document.getElementById('cross-freq-high');
  const impedanceInput = document.getElementById('cross-impedance');
  const orderSelect = document.getElementById('cross-order');
  const filterTypeSelect = document.getElementById('cross-filter-type');
  const topologySelect = document.getElementById('cross-topology');
  const resultsDiv = document.getElementById('crossover-results');
  const diagramDiv = document.getElementById('circuit-diagram');
  const bandpassDiv = document.getElementById('bandpass-high-freq');
  const diagramContainer = document.getElementById('circuit-diagram-container');
  const toggleDiagramBtn = document.getElementById('toggle-circuit-diagram');
  const diagramToggleIcon = document.getElementById('diagram-toggle-icon');

  // Toggle diagram visibility
  toggleDiagramBtn?.addEventListener('click', () => {
    const isHidden = diagramContainer.classList.contains('hidden');
    if (isHidden) {
      diagramContainer.classList.remove('hidden');
      diagramToggleIcon.textContent = '▲';
    } else {
      diagramContainer.classList.add('hidden');
      diagramToggleIcon.textContent = '▼';
    }
  });

  // Event listener for filter type
  filterTypeSelect.addEventListener('change', () => {
    const type = filterTypeSelect.value;
    if (type === 'bandpass') {
      bandpassDiv.classList.remove('hidden');
    } else {
      bandpassDiv.classList.add('hidden');
    }
    calculateCrossover();
  });

  // Event listener for topology
  topologySelect.addEventListener('change', () => {
    calculateCrossover();
  });

  // Calculate crossover components
  const calculateCrossover = () => {
    const freq = parseFloat(freqInput.value) || 2000;
    const freqHigh = parseFloat(freqHighInput.value) || 5000;
    const impedance = parseFloat(impedanceInput.value) || 8;
    const order = parseInt(orderSelect.value) || 2;
    const filterType = filterTypeSelect.value;
    const topology = topologySelect.value;

    let results = [];
    let diagram = '';

    if (filterType === 'highpass') {
      results = calculateHighPass(freq, impedance, order, topology);
      diagram = getHighPassDiagram(order);
    } else if (filterType === 'lowpass') {
      results = calculateLowPass(freq, impedance, order, topology);
      diagram = getLowPassDiagram(order);
    } else if (filterType === 'bandpass') {
      results = calculateBandPass(freq, freqHigh, impedance, order, topology);
      diagram = getBandPassDiagram(order);
    }

    displayResults(results, topology);
    diagramDiv.innerHTML = diagram;
  };

  // ========== CALCULS LOW-PASS ==========
  const calculateLowPass = (freq, impedance, order, topology) => {
    const C_base = 1 / (2 * Math.PI * freq * impedance);
    const L_base = impedance / (2 * Math.PI * freq);
    const results = [];

    if (topology === 'butterworth') {
      if (order === 1) {
        // BW1: Series L1
        const L1 = 1.0 * L_base;
        results.push({ component: 'L1', config: 'series', value: (L1 * 1000).toFixed(2), unit: 'mH' });
      } else if (order === 2) {
        // BW2: Series L1 -> Parallel C2
        const L1 = 1.414 * L_base;
        const C2 = 0.707 * C_base;
        results.push({ component: 'L1', config: 'series', value: (L1 * 1000).toFixed(2), unit: 'mH' });
        results.push({ component: 'C2', config: 'parallel', value: formatCapacitor(C2 * 1e6), unit: 'µF' });
      } else if (order === 3) {
        // BW3: Series L1 -> Parallel C2 -> Series L3
        const L1 = 1.500 * L_base;
        const C2 = 1.333 * C_base;
        const L3 = 0.500 * L_base;
        results.push({ component: 'L1', config: 'series', value: (L1 * 1000).toFixed(2), unit: 'mH' });
        results.push({ component: 'C2', config: 'parallel', value: formatCapacitor(C2 * 1e6), unit: 'µF' });
        results.push({ component: 'L3', config: 'series', value: (L3 * 1000).toFixed(2), unit: 'mH' });
      } else if (order === 4) {
        // BW4: Series L1 -> Parallel C2 -> Series L3 -> Parallel C4
        const L1 = 1.082 * L_base;
        const C2 = 1.577 * C_base;
        const L3 = 1.531 * L_base;
        const C4 = 0.383 * C_base;
        results.push({ component: 'L1', config: 'series', value: (L1 * 1000).toFixed(2), unit: 'mH' });
        results.push({ component: 'C2', config: 'parallel', value: formatCapacitor(C2 * 1e6), unit: 'µF' });
        results.push({ component: 'L3', config: 'series', value: (L3 * 1000).toFixed(2), unit: 'mH' });
        results.push({ component: 'C4', config: 'parallel', value: formatCapacitor(C4 * 1e6), unit: 'µF' });
      }
    } else if (topology === 'linkwitz-riley') {
      if (order === 1 || order === 3) {
        results.push({ component: 'N/A', config: '', value: 'LR n\'existe que pour ordres 2 et 4', unit: '' });
      } else if (order === 2) {
        // LR2: Series L1 -> Parallel C2
        const L1 = 2.0 * L_base;
        const C2 = 0.5 * C_base;
        results.push({ component: 'L1', config: 'series', value: (L1 * 1000).toFixed(2), unit: 'mH' });
        results.push({ component: 'C2', config: 'parallel', value: formatCapacitor(C2 * 1e6), unit: 'µF' });
      } else if (order === 4) {
        // LR4: Series L1 -> Parallel C2 -> Series L3 -> Parallel C4
        const L1 = 1.60 * L_base;
        const C2 = 1.58 * C_base;
        const L3 = 0.78 * L_base;
        const C4 = 0.51 * C_base;
        results.push({ component: 'L1', config: 'series', value: (L1 * 1000).toFixed(2), unit: 'mH' });
        results.push({ component: 'C2', config: 'parallel', value: formatCapacitor(C2 * 1e6), unit: 'µF' });
        results.push({ component: 'L3', config: 'series', value: (L3 * 1000).toFixed(2), unit: 'mH' });
        results.push({ component: 'C4', config: 'parallel', value: formatCapacitor(C4 * 1e6), unit: 'µF' });
      }
    }

    return results;
  };

  // ========== CALCULS HIGH-PASS ==========
  const calculateHighPass = (freq, impedance, order, topology) => {
    const C_base = 1 / (2 * Math.PI * freq * impedance);
    const L_base = impedance / (2 * Math.PI * freq);
    const results = [];

    if (topology === 'butterworth') {
      if (order === 1) {
        // BW1: Series C1
        const C1 = 1.0 * C_base;
        results.push({ component: 'C1', config: 'series', value: formatCapacitor(C1 * 1e6), unit: 'µF' });
      } else if (order === 2) {
        // BW2: Series C1 -> Parallel L2
        const C1 = 0.707 * C_base;
        const L2 = 1.414 * L_base;
        results.push({ component: 'C1', config: 'series', value: formatCapacitor(C1 * 1e6), unit: 'µF' });
        results.push({ component: 'L2', config: 'parallel', value: (L2 * 1000).toFixed(2), unit: 'mH' });
      } else if (order === 3) {
        // BW3: Series C1 -> Parallel L2 -> Series C3
        const C1 = 0.667 * C_base;
        const L2 = 0.750 * L_base;
        const C3 = 2.000 * C_base;
        results.push({ component: 'C1', config: 'series', value: formatCapacitor(C1 * 1e6), unit: 'µF' });
        results.push({ component: 'L2', config: 'parallel', value: (L2 * 1000).toFixed(2), unit: 'mH' });
        results.push({ component: 'C3', config: 'series', value: formatCapacitor(C3 * 1e6), unit: 'µF' });
      } else if (order === 4) {
        // BW4: Series C1 -> Parallel L2 -> Series C3 -> Parallel L4
        const C1 = 0.924 * C_base;
        const L2 = 0.634 * L_base;
        const C3 = 0.653 * C_base;
        const L4 = 2.613 * L_base;
        results.push({ component: 'C1', config: 'series', value: formatCapacitor(C1 * 1e6), unit: 'µF' });
        results.push({ component: 'L2', config: 'parallel', value: (L2 * 1000).toFixed(2), unit: 'mH' });
        results.push({ component: 'C3', config: 'series', value: formatCapacitor(C3 * 1e6), unit: 'µF' });
        results.push({ component: 'L4', config: 'parallel', value: (L4 * 1000).toFixed(2), unit: 'mH' });
      }
    } else if (topology === 'linkwitz-riley') {
      if (order === 1 || order === 3) {
        results.push({ component: 'N/A', config: '', value: 'LR only exists for orders 2 and 4', unit: '' });
      } else if (order === 2) {
        // LR2: Series C1 -> Parallel L2
        const C1 = 0.5 * C_base;
        const L2 = 2.0 * L_base;
        results.push({ component: 'C1', config: 'series', value: formatCapacitor(C1 * 1e6), unit: 'µF' });
        results.push({ component: 'L2', config: 'parallel', value: (L2 * 1000).toFixed(2), unit: 'mH' });
      } else if (order === 4) {
        // LR4: Series C1 -> Parallel L2 -> Series C3 -> Parallel L4
        const C1 = 0.53 * C_base;
        const L2 = 0.63 * L_base;
        const C3 = 1.06 * C_base;
        const L4 = 2.80 * L_base;
        results.push({ component: 'C1', config: 'series', value: formatCapacitor(C1 * 1e6), unit: 'µF' });
        results.push({ component: 'L2', config: 'parallel', value: (L2 * 1000).toFixed(2), unit: 'mH' });
        results.push({ component: 'C3', config: 'series', value: formatCapacitor(C3 * 1e6), unit: 'µF' });
        results.push({ component: 'L4', config: 'parallel', value: (L4 * 1000).toFixed(2), unit: 'mH' });
      }
    }

    return results;
  };

  // ========== CALCULS BAND-PASS ==========
  const calculateBandPass = (freqLow, freqHigh, impedance, order, topology) => {
    const resultsLow = calculateHighPass(freqLow, impedance, order, topology);
    const resultsHigh = calculateLowPass(freqHigh, impedance, order, topology);
    
    // Renommer les composants pour éviter les doublons
    const renumberedLow = resultsLow.map((r, i) => ({
      ...r,
      component: `HP-${r.component}`,
      config: `${r.config} (High-Pass @ ${freqLow}Hz)`
    }));
    
    const renumberedHigh = resultsHigh.map((r, i) => ({
      ...r,
      component: `LP-${r.component}`,
      config: `${r.config} (Low-Pass @ ${freqHigh}Hz)`
    }));
    
    return [...renumberedLow, ...renumberedHigh];
  };

  // ========== FORMAT CAPACITOR ==========
  const formatCapacitor = (valueUf) => {
    if (valueUf >= 1) {
      return valueUf.toFixed(2);
    } else if (valueUf >= 0.001) {
      return (valueUf * 1000).toFixed(2) + ' nF';
    } else {
      return (valueUf * 1e6).toFixed(2) + ' pF';
    }
  };

  // ========== DISPLAY RESULTS ==========
  const displayResults = (results, topology) => {
    const topologyName = topology === 'butterworth' ? 'Butterworth (BW)' : 'Linkwitz-Riley (LR)';
    const topologyNote = topology === 'butterworth' 
      ? '+3dB bump at cutoff' 
      : 'Flat response at sum (0dB)';
    
    let html = `
      <div class="mb-4 p-3 bg-gray-900 rounded border-l-4 border-green-500">
        <div class="text-base font-bold text-green-400">${topologyName}</div>
        <div class="text-xs text-gray-400 mt-1">${topologyNote}</div>
      </div>
    `;
    
    html += results.map(r => `
      <div class="flex flex-col bg-gray-800 p-3 rounded border border-gray-700">
        <div class="flex justify-between items-center">
          <span class="font-bold text-yellow-400">${r.component}</span>
          <span class="text-pink-500 font-bold text-lg">${r.value} ${r.unit}</span>
        </div>
        <div class="text-xs text-gray-400 mt-1">${r.config}</div>
      </div>
    `).join('');
    
    resultsDiv.innerHTML = html;
  };


  // ========== DIAGRAMMES HIGH-PASS ==========
  const getHighPassDiagram = (order) => {
    const baseStyle = {
      fontSize: '18',
      fontWeight: 'bold',
      stroke: '#1f2937',
      strokeWidth: '0.8',
      paintOrder: 'stroke'
    };

    if (order === 1) {
      return `
        <svg class="w-full h-auto" viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <!-- Input -->
          <line x1="20" y1="60" x2="60" y2="60" stroke="#ec4899" stroke-width="3" />
          <text x="25" y="48" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">IN</text>
          
          <!-- Capacitor C1 (série) -->
          <line x1="77" y1="35" x2="77" y2="85" stroke="#fbbf24" stroke-width="4" />
          <line x1="92" y1="35" x2="92" y2="85" stroke="#fbbf24" stroke-width="4" />
          <line x1="60" y1="60" x2="77" y2="60" stroke="#ec4899" stroke-width="3" />
          <line x1="92" y1="60" x2="132" y2="60" stroke="#ec4899" stroke-width="3" />
          <text x="67" y="27" fill="#fbbf24" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">C1</text>
          
          <!-- Speaker -->
          <circle cx="220" cy="60" r="32" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="204" y="70" fill="#10b981" font-size="24" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">🔊</text>
          <line x1="132" y1="60" x2="188" y2="60" stroke="#ec4899" stroke-width="3" />
          <line x1="252" y1="60" x2="290" y2="60" stroke="#ec4899" stroke-width="3" />
          
          <!-- Ground -->
          <line x1="290" y1="60" x2="290" y2="85" stroke="#9ca3af" stroke-width="3" />
          <line x1="278" y1="85" x2="302" y2="85" stroke="#9ca3af" stroke-width="4" />
          <line x1="281" y1="92" x2="299" y2="92" stroke="#9ca3af" stroke-width="3" />
          
          <text x="320" y="68" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">OUT</text>
        </svg>
      `;
    } else if (order === 2) {
      return `
        <svg class="w-full h-auto" viewBox="0 0 500 150" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <!-- Input -->
          <line x1="20" y1="75" x2="60" y2="75" stroke="#ec4899" stroke-width="3" />
          <text x="25" y="63" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">IN</text>
          
          <!-- Capacitor C1 -->
          <line x1="77" y1="48" x2="77" y2="102" stroke="#fbbf24" stroke-width="4" />
          <line x1="92" y1="48" x2="92" y2="102" stroke="#fbbf24" stroke-width="4" />
          <line x1="60" y1="75" x2="77" y2="75" stroke="#ec4899" stroke-width="3" />
          <line x1="92" y1="75" x2="132" y2="75" stroke="#ec4899" stroke-width="3" />
          <text x="67" y="40" fill="#fbbf24" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">C1</text>
          
          <!-- Junction -->
          <circle cx="200" cy="75" r="4" fill="#ec4899" />
          <line x1="132" y1="75" x2="200" y2="75" stroke="#ec4899" stroke-width="3" />
          
          <!-- Inductor L2 to ground -->
          <line x1="200" y1="75" x2="200" y2="95" stroke="#ec4899" stroke-width="3" />
          <path d="M 200 95 Q 190 107 200 119 Q 210 107 200 95" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="215" y="97" fill="#10b981" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">L2</text>
          
          <!-- Ground for L2 -->
          <line x1="200" y1="119" x2="200" y2="135" stroke="#9ca3af" stroke-width="3" />
          <line x1="188" y1="135" x2="212" y2="135" stroke="#9ca3af" stroke-width="4" />
          
          <!-- Speaker -->
          <circle cx="320" cy="75" r="38" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="300" y="86" fill="#10b981" font-size="26" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">🔊</text>
          <line x1="200" y1="75" x2="282" y2="75" stroke="#ec4899" stroke-width="3" />
          <line x1="358" y1="75" x2="400" y2="75" stroke="#ec4899" stroke-width="3" />
          
          <!-- Ground -->
          <line x1="400" y1="75" x2="400" y2="102" stroke="#9ca3af" stroke-width="3" />
          <line x1="388" y1="102" x2="412" y2="102" stroke="#9ca3af" stroke-width="4" />
          <line x1="391" y1="109" x2="409" y2="109" stroke="#9ca3af" stroke-width="3" />
          
          <text x="435" y="83" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">OUT</text>
        </svg>
      `;
    } else if (order === 3) {
      return `
        <svg class="w-full h-auto" viewBox="0 0 620 170" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <!-- Input -->
          <line x1="20" y1="85" x2="60" y2="85" stroke="#ec4899" stroke-width="3" />
          <text x="25" y="73" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">IN</text>
          
          <!-- Capacitor C1 -->
          <line x1="77" y1="58" x2="77" y2="112" stroke="#fbbf24" stroke-width="4" />
          <line x1="92" y1="58" x2="92" y2="112" stroke="#fbbf24" stroke-width="4" />
          <line x1="60" y1="85" x2="77" y2="85" stroke="#ec4899" stroke-width="3" />
          <line x1="92" y1="85" x2="132" y2="85" stroke="#ec4899" stroke-width="3" />
          <text x="67" y="50" fill="#fbbf24" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">C1</text>
          
          <!-- Junction 1 -->
          <circle cx="200" cy="85" r="4" fill="#ec4899" />
          <line x1="132" y1="85" x2="200" y2="85" stroke="#ec4899" stroke-width="3" />
          
          <!-- Inductor L2 to ground -->
          <line x1="200" y1="85" x2="200" y2="108" stroke="#ec4899" stroke-width="3" />
          <path d="M 200 108 Q 190 120 200 132 Q 210 120 200 108" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="215" y="110" fill="#10b981" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">L2</text>
          
          <!-- Ground for L2 -->
          <line x1="200" y1="132" x2="200" y2="150" stroke="#9ca3af" stroke-width="3" />
          <line x1="188" y1="150" x2="212" y2="150" stroke="#9ca3af" stroke-width="4" />
          
          <!-- Capacitor C3 -->
          <line x1="217" y1="58" x2="217" y2="112" stroke="#fbbf24" stroke-width="4" />
          <line x1="232" y1="58" x2="232" y2="112" stroke="#fbbf24" stroke-width="4" />
          <line x1="200" y1="85" x2="217" y2="85" stroke="#ec4899" stroke-width="3" />
          <line x1="232" y1="85" x2="272" y2="85" stroke="#ec4899" stroke-width="3" />
          <text x="207" y="50" fill="#fbbf24" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">C3</text>
          
          <!-- Speaker -->
          <circle cx="390" cy="85" r="42" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="368" y="96" fill="#10b981" font-size="28" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">🔊</text>
          <line x1="272" y1="85" x2="348" y2="85" stroke="#ec4899" stroke-width="3" />
          <line x1="432" y1="85" x2="475" y2="85" stroke="#ec4899" stroke-width="3" />
          
          <!-- Ground -->
          <line x1="475" y1="85" x2="475" y2="115" stroke="#9ca3af" stroke-width="3" />
          <line x1="463" y1="115" x2="487" y2="115" stroke="#9ca3af" stroke-width="4" />
          <line x1="466" y1="122" x2="484" y2="122" stroke="#9ca3af" stroke-width="3" />
          
          <text x="515" y="93" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">OUT</text>
        </svg>
      `;
    } else if (order === 4) {
      return `
        <svg class="w-full h-auto" viewBox="0 0 760 185" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <!-- Input -->
          <line x1="20" y1="92" x2="60" y2="92" stroke="#ec4899" stroke-width="3" />
          <text x="25" y="80" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">IN</text>
          
          <!-- Capacitor C1 -->
          <line x1="77" y1="65" x2="77" y2="119" stroke="#fbbf24" stroke-width="4" />
          <line x1="92" y1="65" x2="92" y2="119" stroke="#fbbf24" stroke-width="4" />
          <line x1="60" y1="92" x2="77" y2="92" stroke="#ec4899" stroke-width="3" />
          <line x1="92" y1="92" x2="132" y2="92" stroke="#ec4899" stroke-width="3" />
          <text x="67" y="57" fill="#fbbf24" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">C1</text>
          
          <!-- Junction 1 -->
          <circle cx="190" cy="92" r="4" fill="#ec4899" />
          <line x1="132" y1="92" x2="190" y2="92" stroke="#ec4899" stroke-width="3" />
          
          <!-- Inductor L2 to ground -->
          <line x1="190" y1="92" x2="190" y2="117" stroke="#ec4899" stroke-width="3" />
          <path d="M 190 117 Q 180 129 190 141 Q 200 129 190 117" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="145" y="117" fill="#10b981" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">L2</text>
          
          <!-- Ground for L2 -->
          <line x1="190" y1="141" x2="190" y2="157" stroke="#9ca3af" stroke-width="3" />
          <line x1="178" y1="157" x2="202" y2="157" stroke="#9ca3af" stroke-width="4" />
          
          <!-- Capacitor C3 -->
          <line x1="207" y1="65" x2="207" y2="119" stroke="#fbbf24" stroke-width="4" />
          <line x1="222" y1="65" x2="222" y2="119" stroke="#fbbf24" stroke-width="4" />
          <line x1="190" y1="92" x2="207" y2="92" stroke="#ec4899" stroke-width="3" />
          <line x1="222" y1="92" x2="262" y2="92" stroke="#ec4899" stroke-width="3" />
          <text x="197" y="57" fill="#fbbf24" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">C3</text>
          
          <!-- Junction 2 -->
          <circle cx="320" cy="92" r="4" fill="#ec4899" />
          <line x1="262" y1="92" x2="320" y2="92" stroke="#ec4899" stroke-width="3" />
          
          <!-- Inductor L4 to ground -->
          <line x1="320" y1="92" x2="320" y2="117" stroke="#ec4899" stroke-width="3" />
          <path d="M 320 117 Q 310 129 320 141 Q 330 129 320 117" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="335" y="117" fill="#10b981" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">L4</text>
          
          <!-- Ground for L4 -->
          <line x1="320" y1="141" x2="320" y2="157" stroke="#9ca3af" stroke-width="3" />
          <line x1="308" y1="157" x2="332" y2="157" stroke="#9ca3af" stroke-width="4" />
          
          <!-- Speaker -->
          <circle cx="470" cy="92" r="46" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="446" y="104" fill="#10b981" font-size="30" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">🔊</text>
          <line x1="320" y1="92" x2="424" y2="92" stroke="#ec4899" stroke-width="3" />
          <line x1="516" y1="92" x2="560" y2="92" stroke="#ec4899" stroke-width="3" />
          
          <!-- Ground -->
          <line x1="560" y1="92" x2="560" y2="122" stroke="#9ca3af" stroke-width="3" />
          <line x1="548" y1="122" x2="572" y2="122" stroke="#9ca3af" stroke-width="4" />
          <line x1="551" y1="129" x2="569" y2="129" stroke="#9ca3af" stroke-width="3" />
          
          <text x="605" y="100" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">OUT</text>
        </svg>
      `;
    }
    return '<p class="text-gray-400 text-sm">Schéma de circuit</p>';
  };

  // ========== DIAGRAMMES LOW-PASS ==========
  const getLowPassDiagram = (order) => {
    const baseStyle = {
      fontSize: '18',
      fontWeight: 'bold',
      stroke: '#1f2937',
      strokeWidth: '0.8',
      paintOrder: 'stroke'
    };

    if (order === 1) {
      return `
        <svg class="w-full h-auto" viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <!-- Input -->
          <line x1="20" y1="60" x2="60" y2="60" stroke="#ec4899" stroke-width="3" />
          <text x="25" y="48" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">IN</text>
          
          <!-- Inductor L1 (série) -->
          <path d="M 60 60 Q 72 38 84 60 Q 96 82 108 60 Q 120 38 132 60" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="83" y="30" fill="#10b981" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">L1</text>
          
          <!-- Speaker -->
          <circle cx="220" cy="60" r="32" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="204" y="70" fill="#10b981" font-size="24" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">🔊</text>
          <line x1="132" y1="60" x2="188" y2="60" stroke="#ec4899" stroke-width="3" />
          <line x1="252" y1="60" x2="290" y2="60" stroke="#ec4899" stroke-width="3" />
          
          <!-- Ground -->
          <line x1="290" y1="60" x2="290" y2="85" stroke="#9ca3af" stroke-width="3" />
          <line x1="278" y1="85" x2="302" y2="85" stroke="#9ca3af" stroke-width="4" />
          <line x1="281" y1="92" x2="299" y2="92" stroke="#9ca3af" stroke-width="3" />
          
          <text x="320" y="68" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">OUT</text>
        </svg>
      `;
    } else if (order === 2) {
      return `
        <svg class="w-full h-auto" viewBox="0 0 500 150" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <!-- Input -->
          <line x1="20" y1="75" x2="60" y2="75" stroke="#ec4899" stroke-width="3" />
          <text x="25" y="63" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">IN</text>
          
          <!-- Inductor L1 -->
          <path d="M 60 75 Q 72 53 84 75 Q 96 97 108 75 Q 120 53 132 75" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="83" y="45" fill="#10b981" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">L1</text>
          
          <!-- Junction -->
          <circle cx="200" cy="75" r="4" fill="#ec4899" />
          <line x1="132" y1="75" x2="200" y2="75" stroke="#ec4899" stroke-width="3" />
          
          <!-- Capacitor C2 to ground -->
          <line x1="200" y1="75" x2="200" y2="102" stroke="#ec4899" stroke-width="3" />
          <line x1="182" y1="108" x2="218" y2="108" stroke="#fbbf24" stroke-width="4" />
          <line x1="182" y1="120" x2="218" y2="120" stroke="#fbbf24" stroke-width="4" />
          <text x="225" y="97" fill="#fbbf24" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">C2</text>
          
          <!-- Ground for C2 -->
          <line x1="200" y1="120" x2="200" y2="135" stroke="#9ca3af" stroke-width="3" />
          <line x1="188" y1="135" x2="212" y2="135" stroke="#9ca3af" stroke-width="4" />
          
          <!-- Speaker -->
          <circle cx="320" cy="75" r="38" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="300" y="86" fill="#10b981" font-size="26" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">🔊</text>
          <line x1="200" y1="75" x2="282" y2="75" stroke="#ec4899" stroke-width="3" />
          <line x1="358" y1="75" x2="400" y2="75" stroke="#ec4899" stroke-width="3" />
          
          <!-- Ground -->
          <line x1="400" y1="75" x2="400" y2="102" stroke="#9ca3af" stroke-width="3" />
          <line x1="388" y1="102" x2="412" y2="102" stroke="#9ca3af" stroke-width="4" />
          <line x1="391" y1="109" x2="409" y2="109" stroke="#9ca3af" stroke-width="3" />
          
          <text x="435" y="83" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">OUT</text>
        </svg>
      `;
    } else if (order === 3) {
      return `
        <svg class="w-full h-auto" viewBox="0 0 620 170" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <!-- Input -->
          <line x1="20" y1="85" x2="60" y2="85" stroke="#ec4899" stroke-width="3" />
          <text x="25" y="73" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">IN</text>
          
          <!-- Inductor L1 -->
          <path d="M 60 85 Q 72 63 84 85 Q 96 107 108 85 Q 120 63 132 85" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="83" y="53" fill="#10b981" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">L1</text>
          
          <!-- Junction 1 -->
          <circle cx="200" cy="85" r="4" fill="#ec4899" />
          <line x1="132" y1="85" x2="200" y2="85" stroke="#ec4899" stroke-width="3" />
          
          <!-- Capacitor C2 to ground -->
          <line x1="200" y1="85" x2="200" y2="115" stroke="#ec4899" stroke-width="3" />
          <line x1="182" y1="121" x2="218" y2="121" stroke="#fbbf24" stroke-width="4" />
          <line x1="182" y1="133" x2="218" y2="133" stroke="#fbbf24" stroke-width="4" />
          <text x="225" y="110" fill="#fbbf24" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">C2</text>
          
          <!-- Ground for C2 -->
          <line x1="200" y1="133" x2="200" y2="150" stroke="#9ca3af" stroke-width="3" />
          <line x1="188" y1="150" x2="212" y2="150" stroke="#9ca3af" stroke-width="4" />
          
          <!-- Inductor L3 -->
          <path d="M 200 85 Q 212 63 224 85 Q 236 107 248 85 Q 260 63 272 85" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="223" y="53" fill="#10b981" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">L3</text>
          
          <!-- Speaker -->
          <circle cx="390" cy="85" r="42" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="368" y="96" fill="#10b981" font-size="28" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">🔊</text>
          <line x1="272" y1="85" x2="348" y2="85" stroke="#ec4899" stroke-width="3" />
          <line x1="432" y1="85" x2="475" y2="85" stroke="#ec4899" stroke-width="3" />
          
          <!-- Ground -->
          <line x1="475" y1="85" x2="475" y2="115" stroke="#9ca3af" stroke-width="3" />
          <line x1="463" y1="115" x2="487" y2="115" stroke="#9ca3af" stroke-width="4" />
          <line x1="466" y1="122" x2="484" y2="122" stroke="#9ca3af" stroke-width="3" />
          
          <text x="515" y="93" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">OUT</text>
        </svg>
      `;
    } else if (order === 4) {
      return `
        <svg class="w-full h-auto" viewBox="0 0 760 185" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
          <!-- Input -->
          <line x1="20" y1="92" x2="60" y2="92" stroke="#ec4899" stroke-width="3" />
          <text x="25" y="80" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">IN</text>
          
          <!-- Inductor L1 -->
          <path d="M 60 92 Q 72 70 84 92 Q 96 114 108 92 Q 120 70 132 92" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="83" y="60" fill="#10b981" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">L1</text>
          
          <!-- Junction 1 -->
          <circle cx="190" cy="92" r="4" fill="#ec4899" />
          <line x1="132" y1="92" x2="190" y2="92" stroke="#ec4899" stroke-width="3" />
          
          <!-- Capacitor C2 to ground -->
          <line x1="190" y1="92" x2="190" y2="122" stroke="#ec4899" stroke-width="3" />
          <line x1="172" y1="128" x2="208" y2="128" stroke="#fbbf24" stroke-width="4" />
          <line x1="172" y1="140" x2="208" y2="140" stroke="#fbbf24" stroke-width="4" />
          <text x="150" y="117" fill="#fbbf24" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">C2</text>
          
          <!-- Ground for C2 -->
          <line x1="190" y1="140" x2="190" y2="157" stroke="#9ca3af" stroke-width="3" />
          <line x1="178" y1="157" x2="202" y2="157" stroke="#9ca3af" stroke-width="4" />
          
          <!-- Inductor L3 -->
          <path d="M 190 92 Q 202 70 214 92 Q 226 114 238 92 Q 250 70 262 92" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="213" y="60" fill="#10b981" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">L3</text>
          
          <!-- Junction 2 -->
          <circle cx="320" cy="92" r="4" fill="#ec4899" />
          <line x1="262" y1="92" x2="320" y2="92" stroke="#ec4899" stroke-width="3" />
          
          <!-- Capacitor C4 to ground -->
          <line x1="320" y1="92" x2="320" y2="122" stroke="#ec4899" stroke-width="3" />
          <line x1="302" y1="128" x2="338" y2="128" stroke="#fbbf24" stroke-width="4" />
          <line x1="302" y1="140" x2="338" y2="140" stroke="#fbbf24" stroke-width="4" />
          <text x="343" y="117" fill="#fbbf24" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">C4</text>
          
          <!-- Ground for C4 -->
          <line x1="320" y1="140" x2="320" y2="157" stroke="#9ca3af" stroke-width="3" />
          <line x1="308" y1="157" x2="332" y2="157" stroke="#9ca3af" stroke-width="4" />
          
          <!-- Speaker -->
          <circle cx="470" cy="92" r="46" stroke="#10b981" fill="none" stroke-width="4" />
          <text x="446" y="104" fill="#10b981" font-size="30" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">🔊</text>
          <line x1="320" y1="92" x2="424" y2="92" stroke="#ec4899" stroke-width="3" />
          <line x1="516" y1="92" x2="560" y2="92" stroke="#ec4899" stroke-width="3" />
          
          <!-- Ground -->
          <line x1="560" y1="92" x2="560" y2="122" stroke="#9ca3af" stroke-width="3" />
          <line x1="548" y1="122" x2="572" y2="122" stroke="#9ca3af" stroke-width="4" />
          <line x1="551" y1="129" x2="569" y2="129" stroke="#9ca3af" stroke-width="3" />
          
          <text x="605" y="100" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
                stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">OUT</text>
        </svg>
      `;
    }
    return '<p class="text-gray-400 text-sm">Schéma de circuit</p>';
  };

  // ========== DIAGRAMMES BAND-PASS ==========
  const getBandPassDiagram = (order) => {
    const baseStyle = {
      fontSize: '17',
      fontWeight: 'bold',
      stroke: '#1f2937',
      strokeWidth: '0.8',
      paintOrder: 'stroke'
    };

    return `
      <svg class="w-full h-auto" viewBox="0 0 700 140" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <!-- Input -->
        <line x1="20" y1="70" x2="60" y2="70" stroke="#ec4899" stroke-width="3" />
        <text x="25" y="58" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
              stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">IN</text>
        
        <!-- HIGH-PASS SECTION -->
        <rect x="60" y="45" width="180" height="50" stroke="#fbbf24" fill="none" stroke-width="2" stroke-dasharray="5,5" rx="5" />
        <text x="100" y="35" fill="#fbbf24" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
              stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">HIGH-PASS</text>
        <text x="115" y="77" fill="#fbbf24" font-size="15" font-weight="bold">Ordre ${order}</text>
        
        <!-- Connection -->
        <line x1="240" y1="70" x2="280" y2="70" stroke="#ec4899" stroke-width="3" />
        
        <!-- LOW-PASS SECTION -->
        <rect x="280" y="45" width="180" height="50" stroke="#10b981" fill="none" stroke-width="2" stroke-dasharray="5,5" rx="5" />
        <text x="325" y="35" fill="#10b981" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
              stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">LOW-PASS</text>
        <text x="340" y="77" fill="#10b981" font-size="15" font-weight="bold">Ordre ${order}</text>
        
        <!-- Speaker -->
        <circle cx="540" cy="70" r="35" stroke="#10b981" fill="none" stroke-width="4" />
        <text x="520" y="80" fill="#10b981" font-size="24" font-weight="${baseStyle.fontWeight}" 
              stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">🔊</text>
        <line x1="460" y1="70" x2="505" y2="70" stroke="#ec4899" stroke-width="3" />
        <line x1="575" y1="70" x2="615" y2="70" stroke="#ec4899" stroke-width="3" />
        
        <!-- Ground -->
        <line x1="615" y1="70" x2="615" y2="95" stroke="#9ca3af" stroke-width="3" />
        <line x1="603" y1="95" x2="627" y2="95" stroke="#9ca3af" stroke-width="4" />
        <line x1="606" y1="102" x2="624" y2="102" stroke="#9ca3af" stroke-width="3" />
        
        <text x="650" y="78" fill="#9ca3af" font-size="${baseStyle.fontSize}" font-weight="${baseStyle.fontWeight}" 
              stroke="${baseStyle.stroke}" stroke-width="${baseStyle.strokeWidth}" paint-order="${baseStyle.paintOrder}">OUT</text>
      </svg>
    `;
  };
  // ========== EVENT LISTENERS ==========
  [freqInput, freqHighInput, impedanceInput].forEach(input => {
    input.addEventListener('input', calculateCrossover);
    
    // Enable inline calculation
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        try {
          const result = eval(input.value);
          if (typeof result === 'number' && isFinite(result)) {
            input.value = result;
            calculateCrossover();
          }
        } catch (error) {
          console.warn("Invalid expression");
        }
      }
    });
  });

  orderSelect.addEventListener('change', calculateCrossover);

  initCrossoverPresetListeners();

  // Initial calculation
  calculateCrossover();
}

// ====================================================================================================
// PRESETS : Save / Load / Delete crossover configurations
// ====================================================================================================

function collectCrossoverFormValues(root) {
  const values = {};
  root.querySelectorAll('input[type="text"], select').forEach(el => {
    if (!el.id) return;
    values[el.id] = el.value;
  });
  return values;
}

function applyCrossoverFormValues(root, values) {
  if (!values) return;
  for (const [id, val] of Object.entries(values)) {
    const el = root.querySelector(`#${CSS.escape(id)}`);
    if (!el) continue;
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function initCrossoverPresetListeners() {
  const root = document.getElementById('crossover-root');
  if (!root) return;
  const presetsBtn = root.querySelector('#cross-presets-btn');
  const modalOverlay = root.querySelector('#cross-presets-modal-overlay');
  const closeBtn = root.querySelector('#cross-presets-panel-close');
  const saveBtn = root.querySelector('#cross-preset-save-btn');
  const nameInput = root.querySelector('#cross-preset-name-input');

  presetsBtn?.addEventListener('click', () => {
    const isHidden = modalOverlay.classList.contains('hidden');
    modalOverlay.classList.toggle('hidden', !isHidden);
    if (isHidden) refreshCrossoverPresetList(root);
  });

  closeBtn?.addEventListener('click', () => modalOverlay.classList.add('hidden'));
  modalOverlay?.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.add('hidden'); });

  saveBtn?.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    const values = collectCrossoverFormValues(root);
    const preset = { name, values, savedAt: new Date().toISOString() };
    const result = await window.electronAPI.saveCrossoverPreset(preset);
    if (result.success) {
      nameInput.value = '';
      refreshCrossoverPresetList(root);
    }
  });

  nameInput?.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') saveBtn.click();
  });
}

async function refreshCrossoverPresetList(root) {
  const listEl = root.querySelector('#cross-presets-list');
  const presets = await window.electronAPI.getCrossoverPresets();

  if (!presets || presets.length === 0) {
    listEl.innerHTML = '<div class="wg-presets-empty">No saved presets</div>';
    return;
  }

  listEl.innerHTML = presets.map(p => `
    <div class="wg-preset-item" data-preset-name="${p.name.replace(/"/g, '&quot;')}">
      <span class="wg-preset-item-name" title="${p.name.replace(/"/g, '&quot;')}">${p.name}</span>
      <button class="wg-preset-load-btn" data-load-name="${p.name.replace(/"/g, '&quot;')}" title="Load preset">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Load
      </button>
      <button class="wg-preset-delete-btn" data-delete-name="${p.name.replace(/"/g, '&quot;')}" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
  `).join('');

  listEl.querySelectorAll('.wg-preset-load-btn').forEach(loadBtn => {
    loadBtn.addEventListener('click', () => {
      const presetName = loadBtn.dataset.loadName;
      const preset = presets.find(p => p.name === presetName);
      if (!preset) return;
      applyCrossoverFormValues(root, preset.values);
      root.querySelector('#cross-presets-modal-overlay').classList.add('hidden');
    });
  });

  listEl.querySelectorAll('.wg-preset-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = btn.dataset.deleteName;
      await window.electronAPI.deleteCrossoverPreset(name);
      refreshCrossoverPresetList(root);
    });
  });
}
