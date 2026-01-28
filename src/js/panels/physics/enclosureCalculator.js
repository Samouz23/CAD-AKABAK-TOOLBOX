// =================================================================================
// FICHIER : src/js/panels/physics/enclosureCalculator.js
// RÔLE    : Calculateur d'enceintes close et bass-reflex selon paramètres T/S
// =================================================================================

import { PhysicsIcons } from './icons.js';
import { getChartThemeColors, registerChartForThemeUpdates } from '../../utils/chartThemeHelper.js';

let driverDatabase = [];
let selectedDriver = null;
let responseChart = null;

// ========== FORMULES QSPEAKERS (from SPL.py) ==========

// Calculate Qes from T/S parameters
function calculateQes(params) {
  // Use Qes directly if available in driver specs
  if (params.Qes && params.Qes > 0) return params.Qes;
  if (params.QES && params.QES > 0) return params.QES;
  
  // Calculate from Qts and Qms: 1/Qes = 1/Qts - 1/Qms
  const Qts = params.Qts;
  const Qms = params.Qms;
  if (Qts && Qms && Qts > 0 && Qms > 0) {
    const Qes = 1 / (1/Qts - 1/Qms);
    if (Qes > 0) return Qes;
  }
  
  // Formula: Qes = (2π × fs × Mms × Re) / (BL²)
  const { Re = 0, Mms = 0, BL = 0, fs = 0 } = params;
  if (Re > 0 && Mms > 0 && BL > 0 && fs > 0) {
    const Mms_kg = Mms / 1000; // Convert g to kg
    return (2 * Math.PI * fs * Mms_kg * Re) / (BL * BL);
  }
  
  return 0;
}

// Calculate Qms from T/S parameters
function calculateQms(params) {
  // Use Qms directly if available in driver specs
  if (params.Qms && params.Qms > 0) return params.Qms;
  if (params.QMS && params.QMS > 0) return params.QMS;
  
  const { SDf = 0, Mms = 0, Rms = 0, Cms = 0 } = params;
  if (SDf === 0 || Mms === 0 || Rms === 0 || Cms === 0) return 0;
  return (SDf / 1000000 * Math.sqrt(Mms / 1000 * Cms / 1000)) / Rms;
}

// Calculate Qts from Qes and Qms
function calculateQts(params) {
  // Use Qts directly if available in driver specs
  if (params.Qts && params.Qts > 0) return params.Qts;
  
  const Qes = calculateQes(params);
  const Qms = params.Qms || 0;
  
  console.log('calculateQts - Qes:', Qes, 'Qms:', Qms);
  
  if (Qes > 0 && Qms > 0) {
    const Qts = (Qes * Qms) / (Qes + Qms);
    console.log('Calculated Qts:', Qts);
    return Qts;
  }
  
  console.warn('Cannot calculate Qts, missing parameters');
  return 0;
}

// Calculate Vas (equivalent compliance volume)
function calculateVas(params) {
  // Use Vas directly if available in driver specs
  if (params.Vas && params.Vas > 0) return params.Vas;
  if (params.VAS && params.VAS > 0) return params.VAS;
  
  // Formula: Vas = ρ × c² × Sd² × Cms
  // Where Cms = 1 / ((2π × fs)² × Mms)
  const { fs = 0, Mms = 0, SDf = 0 } = params;
  if (fs === 0 || Mms === 0 || SDf === 0) return 0;
  
  const Mms_kg = Mms / 1000; // Convert g to kg
  const Sd_m2 = SDf / 10000; // Convert cm² to m²
  const omega = 2 * Math.PI * fs;
  const Cms = 1 / (omega * omega * Mms_kg); // m/N
  
  const rho = 1.18; // kg/m³ (air density)
  const c = 343; // m/s (speed of sound)
  
  const Vas_m3 = rho * c * c * Sd_m2 * Sd_m2 * Cms;
  return Vas_m3 * 1000; // Convert m³ to liters
}

// QSpeakers sealed box formula (SPL.py line 11)
function gainSealed(f, fs, Vas, Vb, Qts) {
  const vr = Vb / Vas;
  const A = 1 + vr;
  const Qtc = Qts * Math.sqrt(A);
  const fc = fs * Math.sqrt(A);
  
  const num = Math.pow(f / fc, 2);
  const denom = Math.sqrt(Math.pow(f / fc, 4) - Math.pow(f / fc, 2) * (1 - 1 / (Qtc * Qtc)) + 1);
  
  return 20 * Math.log10(num / denom);
}

// QSpeakers ported box formula (SPL.py line 15)
function gainPorted(f, fs, Vas, Vb, fb, Qts, Ql = 7) {
  const vr = Vb / Vas;
  const h = fb / fs;
  
  const num = Math.pow(f / fs, 4);
  const term1 = Math.pow(f / fs, 4) - (1 + vr + Qts / Ql / h) * Math.pow(f / fs, 2) + vr + Qts / Ql;
  const term2 = Math.pow(Qts / h * (Math.pow(f / fs, 2) - 1), 2);
  const denom = Math.sqrt(term1 * term1 + term2);
  
  return 20 * Math.log10(num / denom);
}

// QSpeakers pipe resonance magnitude (SPL.py line 20)
function pipeMag(f, fres, Q = 3) {
  const num = Math.pow(f / fres, 2);
  const denom = Math.sqrt(Math.pow(f / fres, 4) - Math.pow(f / fres, 2) * (1 - 1 / (Q * Q)) + 1);
  return num / denom;
}

// ========== DATABASE & PARSING ==========

async function loadDriverDatabase() {
  try {
    if (window.electronAPI && window.electronAPI.getAllDrivers) {
      const drivers = await window.electronAPI.getAllDrivers();
      driverDatabase = drivers.map(driver => ({
        ...driver,
        params: driver.params || parseDriverParams(driver.content)
      }));
      return driverDatabase;
    } else {
      console.warn('Electron API not available');
      return [];
    }
  } catch (error) {
    console.error('Error loading driver database:', error);
    return [];
  }
}

function parseDriverParams(content) {
  const params = {};
  const lines = content.split(/[\r\n]+/);
  
  for (const line of lines) {
    // Support parameters like: fs=31, Qts=0.45, SDf=540, VAS=50.2, etc.
    const match = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*([0-9.]+)/);
    if (match) {
      const key = match[1];
      const value = parseFloat(match[2]);
      params[key] = value;
      
      // Handle common variations (uppercase/lowercase)
      if (key.toLowerCase() === 'vas') params.Vas = value;
      if (key.toLowerCase() === 'qts') params.Qts = value;
      if (key.toLowerCase() === 'qes') params.Qes = value;
      if (key.toLowerCase() === 'qms') params.Qms = value;
      if (key === 'SDf' || key === 'SD') params.SDf = value;
    }
  }
  
  console.log('Parsed driver params:', params);
  return params;
}

// ========== HTML TEMPLATE ==========

export function getEnclosureCalculatorHtml() {
  return `
    <div class="space-y-6">
      
      <!-- Driver Selection -->
      <section class="calc-section">
        <h2 class="calc-title">Speaker Enclosure Simulator</h2>
        
        <div class="mb-4">
          <label class="block mb-2 text-sm font-semibold text-gray-300">Select Driver from Database</label>
          <div class="relative">
            <input type="search" 
                   id="enclosure-driver-search" 
                   placeholder="Search (e.g., BC, Dayton, Peerless)..." 
                   class="form-input w-full">
            <div id="enclosure-driver-list" 
                 class="absolute z-20 w-full bg-gray-900 border border-gray-700 mt-1 rounded-md hidden max-h-60 overflow-y-auto">
            </div>
          </div>
          <div id="selected-driver-display" class="mt-3 p-4 bg-gray-800 rounded-md hidden">
            <div class="flex justify-between items-center">
              <div>
                <h3 class="font-bold text-white" id="selected-driver-name">No driver selected</h3>
                <div class="grid grid-cols-4 gap-2 mt-2 text-sm text-gray-300" id="selected-driver-params">
                </div>
              </div>
              <button id="clear-driver-btn" class="text-red-400 hover:text-red-300">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Enclosure Type -->
      <section class="calc-section">
        <h2 class="calc-title">Enclosure Type</h2>
        <div class="flex space-x-4">
          <button id="enclosure-type-closed" class="flex-1 p-4 rounded-md bg-gray-700 hover:bg-gray-600 transition-colors border-2 border-transparent">
            <div class="text-lg font-bold text-white">Closed Box</div>
            <div class="text-sm text-gray-400 mt-1">Sealed enclosure</div>
          </button>
          <button id="enclosure-type-bassreflex" class="flex-1 p-4 rounded-md bg-gray-700 hover:bg-gray-600 transition-colors border-2 border-transparent">
            <div class="text-lg font-bold text-white">Bass-Reflex</div>
            <div class="text-sm text-gray-400 mt-1">Vented (QB3 alignment)</div>
          </button>
        </div>
      </section>

      <!-- Calculator -->
      <section class="calc-section">
        <!-- Inputs + Summary -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          
          <!-- Inputs (2 columns) -->
          <div class="md:col-span-2 space-y-4">
            
            <div id="closed-box-inputs">
              <h3 class="text-lg font-semibold mb-3 text-white">Sealed Enclosure</h3>
              
              <div>
                <label class="block mb-1 text-sm text-gray-300">Volume (Liters)</label>
                <input type="number" id="closed-volume" class="form-input" placeholder="Enter volume" step="0.1">
              </div>

              <div class="mt-3">
                <label class="block mb-1 text-xs text-gray-400">Resonance fb (Hz)</label>
                <input type="text" id="closed-fb" class="form-input form-input-sm" readonly>
              </div>
            </div>

            <div id="bassreflex-inputs" class="hidden">
              <h3 class="text-lg font-semibold mb-3 text-white">Bass-Reflex (QB3)</h3>
              
              <div>
                <label class="block mb-1 text-sm text-gray-300">Volume (L)</label>
                <input type="number" id="br-volume" class="form-input" placeholder="Volume" step="0.1">
              </div>

              <div class="border-t border-gray-700 mt-4 pt-3">
                <h4 class="text-sm font-semibold mb-2 text-white">Port</h4>
                
                <div class="grid grid-cols-3 gap-3">
                  <div>
                    <label class="block mb-1 text-xs text-gray-400">Surface (cm²)</label>
                    <input type="number" id="port-surface" class="form-input form-input-sm" placeholder="Sp" step="1">
                  </div>
                  <div>
                    <label class="block mb-1 text-xs text-gray-400">Length (cm)</label>
                    <input type="number" id="port-length" class="form-input form-input-sm" placeholder="Lp" step="0.1">
                  </div>
                  <div>
                    <label class="block mb-1 text-xs text-gray-400">fb (Hz)</label>
                    <input type="text" id="br-fb" class="form-input form-input-sm" readonly>
                  </div>
                </div>
                
                <div class="mt-2 text-xs text-gray-400">
                  <span>Port resonance:</span> <span id="port-resonance" class="text-white">—</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Summary (1 column) -->
          <div id="enclosure-results" class="bg-gray-800 rounded p-4">
            <h4 class="font-bold text-white mb-3">Summary</h4>
            <div id="enclosure-summary" class="space-y-2 text-sm text-gray-300">
              <p>Select a driver and calculate to see results</p>
            </div>
          </div>

        </div>

        <!-- Chart Controls + Graph -->
        <div class="space-y-4">
          <div class="flex items-center justify-between bg-gray-800 rounded p-3">
            <h3 class="text-lg font-semibold text-white">Frequency Response</h3>
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <label class="text-xs text-gray-400">Freq Min:</label>
                <input type="number" id="chart-freq-min" class="form-input form-input-sm w-20" value="20" min="10" max="100">
                <label class="text-xs text-gray-400">Max:</label>
                <input type="number" id="chart-freq-max" class="form-input form-input-sm w-20" value="200" min="100" max="1000">
              </div>
              <div class="flex items-center gap-2">
                <label class="text-xs text-gray-400">SPL Min:</label>
                <input type="number" id="chart-spl-min" class="form-input form-input-sm w-20" value="-20" step="5">
                <label class="text-xs text-gray-400">Max:</label>
                <input type="number" id="chart-spl-max" class="form-input form-input-sm w-20" value="10" step="5">
              </div>
              <button id="chart-reset-zoom" class="btn btn-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs">Reset</button>
            </div>
          </div>
          <div class="bg-gray-800 rounded p-4" style="height: 500px;">
            <canvas id="enclosure-response-chart"></canvas>
          </div>
        </div>

      </section>

    </div>
  `;
}

// ========== INITIALIZATION ==========

export async function initializeEnclosureCalculator() {
  await loadDriverDatabase();

  const driverSearchInput = document.getElementById('enclosure-driver-search');
  const driverListContainer = document.getElementById('enclosure-driver-list');
  const selectedDriverDisplay = document.getElementById('selected-driver-display');
  const selectedDriverName = document.getElementById('selected-driver-name');
  const selectedDriverParams = document.getElementById('selected-driver-params');
  const clearDriverBtn = document.getElementById('clear-driver-btn');
  
  const enclosureTypeClosedBtn = document.getElementById('enclosure-type-closed');
  const enclosureTypeBassreflexBtn = document.getElementById('enclosure-type-bassreflex');
  const closedBoxInputs = document.getElementById('closed-box-inputs');
  const bassreflexInputs = document.getElementById('bassreflex-inputs');
  
  const closedVolumeInput = document.getElementById('closed-volume');
  const brVolumeInput = document.getElementById('br-volume');
  const portSurfaceInput = document.getElementById('port-surface');
  const portLengthInput = document.getElementById('port-length');

  let currentEnclosureType = 'closed';

  // Auto-calculate on input change
  closedVolumeInput.addEventListener('input', () => {
    if (selectedDriver) calculateClosedBox();
  });

  brVolumeInput.addEventListener('input', () => {
    if (selectedDriver) calculateBassReflex();
  });

  portSurfaceInput.addEventListener('input', () => {
    if (selectedDriver) calculateBassReflex();
  });

  portLengthInput.addEventListener('input', () => {
    if (selectedDriver) calculateBassReflex();
  });

  // Close dropdown when clicking outside (defined ONCE)
  const closeDropdownHandler = (e) => {
    if (!driverSearchInput.contains(e.target) && !driverListContainer.contains(e.target)) {
      driverListContainer.classList.add('hidden');
    }
  };
  document.addEventListener('click', closeDropdownHandler);

  // Driver search
  driverSearchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    
    if (searchTerm.length < 2) {
      driverListContainer.classList.add('hidden');
      return;
    }

    const filteredDrivers = driverDatabase.filter(driver => 
      driver.name.toLowerCase().includes(searchTerm)
    ).slice(0, 20);

    if (filteredDrivers.length === 0) {
      driverListContainer.innerHTML = '<div class="p-3 text-gray-400">No drivers found</div>';
      driverListContainer.classList.remove('hidden');
      return;
    }

    driverListContainer.innerHTML = filteredDrivers.map(driver => `
      <div class="driver-search-item p-3 hover:bg-gray-700 cursor-pointer text-white border-b border-gray-800"
           data-driver='${JSON.stringify(driver).replace(/'/g, "&#39;")}'>
        ${driver.name}
      </div>
    `).join('');

    driverListContainer.classList.remove('hidden');
  });

  // Use event delegation on the container (prevents multiple listeners)
  driverListContainer.addEventListener('click', (e) => {
    const driverItem = e.target.closest('.driver-search-item');
    if (driverItem) {
      const driverData = JSON.parse(driverItem.getAttribute('data-driver').replace(/&#39;/g, "'"));
      selectDriver(driverData);
      driverListContainer.classList.add('hidden');
      driverSearchInput.value = '';
    }
  });

  function selectDriver(driver) {
    selectedDriver = driver;
    selectedDriverName.textContent = driver.name;
    
    const params = driver.params || {};
    selectedDriverParams.innerHTML = `
      <div><span class="text-gray-400">Sd:</span> ${params.SDf || params.SD || '—'} cm²</div>
      <div><span class="text-gray-400">fs:</span> ${params.fs || '—'} Hz</div>
      <div><span class="text-gray-400">Qts:</span> ${calculateQts(params).toFixed(3)}</div>
      <div><span class="text-gray-400">Vas:</span> ${calculateVas(params).toFixed(1)} L</div>
      <div><span class="text-gray-400">Qms:</span> ${params.Qms || '—'}</div>
      <div><span class="text-gray-400">Qes:</span> ${calculateQes(params).toFixed(3)}</div>
      <div><span class="text-gray-400">Re:</span> ${params.Re || '—'} Ω</div>
      <div><span class="text-gray-400">BL:</span> ${params.BL || '—'} T·m</div>
    `;
    
    selectedDriverDisplay.classList.remove('hidden');
  }

  clearDriverBtn.addEventListener('click', () => {
    selectedDriver = null;
    selectedDriverDisplay.classList.add('hidden');
  });

  // Enclosure type selection
  enclosureTypeClosedBtn.addEventListener('click', () => {
    currentEnclosureType = 'closed';
    enclosureTypeClosedBtn.classList.add('border-pink-600');
    enclosureTypeBassreflexBtn.classList.remove('border-pink-600');
    closedBoxInputs.classList.remove('hidden');
    bassreflexInputs.classList.add('hidden');
  });

  enclosureTypeBassreflexBtn.addEventListener('click', () => {
    currentEnclosureType = 'bassreflex';
    enclosureTypeBassreflexBtn.classList.add('border-pink-600');
    enclosureTypeClosedBtn.classList.remove('border-pink-600');
    bassreflexInputs.classList.remove('hidden');
    closedBoxInputs.classList.add('hidden');
  });

  // Chart axis controls
  const chartFreqMin = document.getElementById('chart-freq-min');
  const chartFreqMax = document.getElementById('chart-freq-max');
  const chartSplMin = document.getElementById('chart-spl-min');
  const chartSplMax = document.getElementById('chart-spl-max');
  const chartResetBtn = document.getElementById('chart-reset-zoom');

  function updateChartAxes() {
    if (!responseChart) return;
    
    const fMin = parseFloat(chartFreqMin.value) || 20;
    const fMax = parseFloat(chartFreqMax.value) || 200;
    const sMin = parseFloat(chartSplMin.value) || -20;
    const sMax = parseFloat(chartSplMax.value) || 10;

    responseChart.options.scales.x.min = fMin;
    responseChart.options.scales.x.max = fMax;
    responseChart.options.scales.y.min = sMin;
    responseChart.options.scales.y.max = sMax;
    
    responseChart.update('none'); // Smooth update without animation
  }

  chartFreqMin.addEventListener('input', updateChartAxes);
  chartFreqMax.addEventListener('input', updateChartAxes);
  chartSplMin.addEventListener('input', updateChartAxes);
  chartSplMax.addEventListener('input', updateChartAxes);

  chartResetBtn.addEventListener('click', () => {
    chartFreqMin.value = 20;
    chartFreqMax.value = 200;
    chartSplMin.value = -20;
    chartSplMax.value = 10;
    updateChartAxes();
  });

  // Initialize chart
  const ctx = document.getElementById('enclosure-response-chart');
  if (ctx && typeof Chart !== 'undefined') {
    // Récupérer les couleurs du thème actif
    const chartPrimary = getComputedStyle(document.documentElement).getPropertyValue('--chart-primary').trim() || 'rgb(236, 72, 153)';
    const chartGlow = getComputedStyle(document.documentElement).getPropertyValue('--chart-primary-glow').trim() || 'rgba(236, 72, 153, 0.2)';
    const chartText = getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() || '#9ca3af';
    const chartAxis = getComputedStyle(document.documentElement).getPropertyValue('--chart-axis').trim() || '#9ca3af';
    const chartGrid = getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() || 'rgba(156, 163, 175, 0.1)';
    
    responseChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'SPL (dB)',
          data: [],
          borderColor: chartPrimary,
          backgroundColor: chartGlow,
          borderWidth: 3,
          tension: 0.4,
          pointRadius: 0,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 300,
          easing: 'easeInOutQuad'
        },
        scales: {
          x: {
            type: 'logarithmic',
            min: 20,
            max: 200,
            title: { display: true, text: 'Frequency (Hz)', color: chartAxis, font: { size: 12, weight: 'bold' } },
            ticks: { color: chartAxis },
            grid: { color: chartGrid }
          },
          y: {
            min: -20,
            max: 10,
            title: { display: true, text: 'SPL (dB)', color: chartAxis, font: { size: 12, weight: 'bold' } },
            ticks: { color: chartAxis },
            grid: { color: chartGrid }
          }
        },
        plugins: {
          legend: { labels: { color: chartText, font: { size: 13, weight: 'bold' } } }
        }
      }
    });
    
    // Écouter les changements de thème
    window.addEventListener('themeChanged', () => {
      if (responseChart) {
        const newPrimary = getComputedStyle(document.documentElement).getPropertyValue('--chart-primary').trim();
        const newGlow = getComputedStyle(document.documentElement).getPropertyValue('--chart-primary-glow').trim();
        const newText = getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim();
        const newAxis = getComputedStyle(document.documentElement).getPropertyValue('--chart-axis').trim();
        const newGrid = getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim();
        
        responseChart.data.datasets[0].borderColor = newPrimary;
        responseChart.data.datasets[0].backgroundColor = newGlow;
        responseChart.options.scales.x.title.color = newAxis;
        responseChart.options.scales.x.ticks.color = newAxis;
        responseChart.options.scales.x.grid.color = newGrid;
        responseChart.options.scales.y.title.color = newAxis;
        responseChart.options.scales.y.ticks.color = newAxis;
        responseChart.options.scales.y.grid.color = newGrid;
        responseChart.options.plugins.legend.labels.color = newText;
        responseChart.update('none');
      }
    });
  }

  // Set default selection
  enclosureTypeClosedBtn.click();
}

// ========== CALCULATION FUNCTIONS ==========

function calculateClosedBox() {
  if (!selectedDriver) return;

  const params = selectedDriver.params;
  const Vb = parseFloat(document.getElementById('closed-volume').value);
  const Qts = calculateQts(params);
  const Vas = calculateVas(params);
  const fs = params.fs;

  if (!Vb || Vb <= 0 || !Qts || !Vas) return;

  // Sealed box calculations
  const vr = Vb / Vas;
  const alpha = 1 + vr;
  const Qtc = Qts * Math.sqrt(alpha);
  const fc = fs * Math.sqrt(alpha);
  const fb = fc; // For sealed, fb = fc

  // Update display
  document.getElementById('closed-fb').value = fb.toFixed(1);

  console.log('Sealed Box - Qts:', Qts, 'Vas:', Vas, 'Vb:', Vb, 'fb:', fb);

  // Update summary
  updateSummary({
    type: 'Closed Box',
    driver: selectedDriver.name,
    volume: Vb.toFixed(1) + ' L',
    fb: fb.toFixed(1) + ' Hz',
    qts: Qts.toFixed(3)
  });

  // Update chart
  updateResponseChart('closed', { fs, Vas, Vb, Qts });
}

function calculateBassReflex() {
  if (!selectedDriver) return;

  const params = selectedDriver.params;
  const Vb = parseFloat(document.getElementById('br-volume').value);
  const Sp = parseFloat(document.getElementById('port-surface').value); // cm²
  const Lp_cm = parseFloat(document.getElementById('port-length').value); // cm
  const Qts = calculateQts(params);
  const Vas = calculateVas(params);
  const fs = params.fs;

  if (!Vb || Vb <= 0 || !Qts || !Vas) return;

  const c = 343; // m/s
  const Sp_m2 = Sp / 10000; // cm² to m²

  let fb, Lp, fres;

  // Mode 1: Volume only → Calculate fb from QB3 alignment, then calculate port length
  if (!Sp || !Lp_cm) {
    // QB3 alignment
    const alpha = (15 / Qts) - 15;
    const vr = Vb / Vas;
    fb = fs * Math.sqrt((alpha + 1) / vr);

    // If we have port surface, calculate needed length
    if (Sp && Sp > 0) {
      Lp = ((c / (2 * Math.PI * fb)) ** 2) * (Sp_m2 / (Vb / 1000)); // in meters
      document.getElementById('port-length').value = (Lp * 100).toFixed(1);
    }
  } 
  // Mode 2: Volume + Port Surface + Port Length → Calculate fb from port dimensions
  else {
    const Lp_m = Lp_cm / 100; // cm to m
    // fb from Helmholtz formula: fb = (c / (2π)) × √(Sp / (Vb × Lp))
    fb = (c / (2 * Math.PI)) * Math.sqrt(Sp_m2 / ((Vb / 1000) * Lp_m));
    Lp = Lp_m;
  }

  // Port resonance
  if (Sp && Sp > 0) {
    const Lcorr = (Lp || 0) + 1.7 * Math.sqrt(Sp_m2 / Math.PI);
    fres = c / (2 * Lcorr);
    document.getElementById('port-resonance').textContent = fres.toFixed(0) + ' Hz';
  }

  // Update display
  document.getElementById('br-fb').value = fb.toFixed(1);

  // Update summary
  updateSummary({
    type: 'Bass-Reflex QB3',
    driver: selectedDriver.name,
    volume: Vb.toFixed(1) + ' L',
    fb: fb.toFixed(1) + ' Hz',
    portSurface: Sp ? Sp.toFixed(1) + ' cm²' : '—',
    portLength: Lp ? (Lp * 100).toFixed(1) + ' cm' : '—',
    fres: fres ? fres.toFixed(0) + ' Hz' : '—'
  });

  // Update chart
  if (fres) {
    updateResponseChart('bassreflex', { fs, Vas, Vb, fb, Qts, fres });
  }
}

function updateSummary(data) {
  const summaryDiv = document.getElementById('enclosure-summary');
  if (!summaryDiv) return;

  if (data.type.includes('Closed')) {
    summaryDiv.innerHTML = `
      <div class="space-y-1 text-sm">
        <div><span class="text-gray-400">Type:</span> <span class="text-white">${data.type}</span></div>
        <div><span class="text-gray-400">Driver:</span> <span class="text-white">${data.driver}</span></div>
        <div><span class="text-gray-400">Volume:</span> <span class="text-white">${data.volume}</span></div>
        <div><span class="text-gray-400">Resonance:</span> <span class="text-white">${data.fb}</span></div>
        <div><span class="text-gray-400">Qts:</span> <span class="text-white">${data.qts}</span></div>
      </div>
    `;
  } else {
    summaryDiv.innerHTML = `
      <div class="space-y-1 text-sm">
        <div><span class="text-gray-400">Type:</span> <span class="text-white">${data.type}</span></div>
        <div><span class="text-gray-400">Driver:</span> <span class="text-white">${data.driver}</span></div>
        <div><span class="text-gray-400">Volume:</span> <span class="text-white">${data.volume}</span></div>
        <div><span class="text-gray-400">fb:</span> <span class="text-white">${data.fb}</span></div>
        <div><span class="text-gray-400">Port Sp:</span> <span class="text-white">${data.portSurface}</span></div>
        <div><span class="text-gray-400">Port Lp:</span> <span class="text-white">${data.portLength}</span></div>
        <div><span class="text-gray-400">Port fres:</span> <span class="text-white">${data.fres}</span></div>
      </div>
    `;
  }
}

function updateResponseChart(type, params) {
  if (!responseChart) return;

  const frequencies = [];
  const amplitudes = [];

  // Get current chart range from inputs
  const chartFreqMin = document.getElementById('chart-freq-min');
  const chartFreqMax = document.getElementById('chart-freq-max');
  const fMin = chartFreqMin ? parseFloat(chartFreqMin.value) || 20 : 20;
  const fMax = chartFreqMax ? parseFloat(chartFreqMax.value) || 200 : 200;
  const steps = 300; // More points for smoother curve

  for (let i = 0; i < steps; i++) {
    const f = fMin * Math.pow(fMax / fMin, i / (steps - 1));
    frequencies.push(f.toFixed(1));

    let amplitude;
    if (type === 'closed') {
      // QSpeakers sealed formula
      amplitude = gainSealed(f, params.fs, params.Vas, params.Vb, params.Qts);
    } else {
      // QSpeakers ported formula + pipe resonance
      const gain = gainPorted(f, params.fs, params.Vas, params.Vb, params.fb, params.Qts);
      const pipeFactor = pipeMag(f, params.fres, 3);
      amplitude = 20 * Math.log10(Math.pow(10, gain / 20) * pipeFactor);
    }

    amplitudes.push(amplitude);
  }

  responseChart.data.labels = frequencies;
  responseChart.data.datasets[0].data = amplitudes;
  responseChart.update('active'); // Smooth animation
}
