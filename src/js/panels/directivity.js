// =======================================================
// FICHIER :  src/js/panels/directivity.js
// RÔLE    :  Calculateur de directivité horizontale et verticale d'un pavillon
//            Modes: Simple (Piston) & Pro (Horn Hybrid Model)
// =======================================================

import { 
  SPEED_OF_SOUND, 
  besselJ1, 
  directivityFunction, 
  sinc, 
  linearToDb, 
  calculateWaveNumber,
  calculateWavelength,
  clamp 
} from '../utils/acousticMath.js';

// Global state for imported geometry data
let advancedGeometryData = null;

// Event listeners storage for cleanup
let polarSliderListener = null;
let polarHCheckListener = null;
let polarVCheckListener = null;
let heatmapRadioListeners = [];

export function getDirectivityPanelHtml() {
  return `
<div class="p-6 text-green-400 h-full flex flex-col">
  <div class="flex justify-between items-center mb-6 flex-shrink-0">
    <h1 class="text-4xl font-bold text-white">Directivity Calculator</h1>
    <div id="mode-indicator" class="px-4 py-2 rounded-lg bg-gray-800 border border-gray-600">
      <span class="text-sm text-gray-400">Mode: </span>
      <span id="mode-label" class="text-sm font-semibold text-green-400">Simple</span>
    </div>
  </div>

  <div class="flex-grow overflow-y-auto space-y-6">
    <!-- Input Parameters -->
    <div class="bg-gray-900 border border-gray-700 rounded-lg p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold text-white">Mouth Dimensions</h3>
        <button id="clear-import-btn" class="action-btn bg-red-700 hover:bg-red-800 hidden">
          Clear Import
        </button>
      </div>
      
      <div class="grid grid-cols-2 gap-6">
        <div>
          <label class="block text-sm text-gray-400 mb-2">Width (mm)</label>
          <input type="number" id="mouth-width" class="form-input w-full" value="200" min="1" step="1">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-2">Height (mm)</label>
          <input type="number" id="mouth-height" class="form-input w-full" value="100" min="1" step="1">
        </div>
      </div>

      <!-- Advanced Parameters (Pro Mode) -->
      <div id="advanced-params" class="mt-6 pt-6 border-t border-gray-700 hidden">
        <h4 class="text-sm font-semibold text-gray-300 mb-4">Horn Geometry (Imported)</h4>
        <div class="grid grid-cols-4 gap-4">
          <div>
            <label class="block text-xs text-gray-400 mb-1">H Wall Angle (°)</label>
            <input type="text" id="wall-angle-h" class="form-input w-full bg-gray-800" readonly>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">V Wall Angle (°)</label>
            <input type="text" id="wall-angle-v" class="form-input w-full bg-gray-800" readonly>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Expansion Type</label>
            <input type="text" id="expansion-type" class="form-input w-full bg-gray-800" readonly>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Cutoff Freq (Hz)</label>
            <input type="text" id="cutoff-freq" class="form-input w-full bg-gray-800" readonly>
          </div>
        </div>
      </div>

      <button id="calculate-directivity-btn" class="action-btn bg-black-600 themed-hover-bg w-full mt-6">
        Calculate
      </button>
    </div>

    <!-- Results with Tabs -->
    <div id="directivity-results" class="bg-gray-900 border border-gray-700 rounded-lg p-6 hidden">
      <h3 class="text-lg font-semibold text-white mb-4">Results</h3>
      
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="bg-gray-800 border border-gray-600 rounded p-4">
          <div class="text-xs text-gray-400 mb-1">Horizontal Coverage @ 1kHz</div>
          <div id="horizontal-coverage" class="text-2xl font-bold text-accent">
            <!-- Will be filled -->
          </div>
        </div>
        <div class="bg-gray-800 border border-gray-600 rounded p-4">
          <div class="text-xs text-gray-400 mb-1">Vertical Coverage @ 1kHz</div>
          <div id="vertical-coverage" class="text-2xl font-bold text-accent">
            <!-- Will be filled -->
          </div>
        </div>
      </div>

      <!-- Tabbed Interface -->
      <div class="mb-4">
        <div class="flex space-x-2 border-b border-gray-700 mb-4">
          <button class="tab-btn active px-6 py-2 text-sm font-semibold border-b-2 border-accent text-accent" data-tab="table">
            Data Table
          </button>
          <button class="tab-btn px-6 py-2 text-sm font-semibold border-b-2 border-transparent text-gray-400 hover:text-white" data-tab="polar">
            Polar Plot
          </button>
          <button class="tab-btn px-6 py-2 text-sm font-semibold border-b-2 border-transparent text-gray-400 hover:text-white" data-tab="heatmap">
            Directivity Map
          </button>
        </div>

        <!-- Tab Content -->
        <div id="tab-content">
          <!-- Tab 1: Data Table -->
          <div id="table-tab" class="tab-content">
            <div id="frequency-table" class="overflow-x-auto">
              <!-- Table will be inserted here -->
            </div>
          </div>

          <!-- Tab 2: Polar Plot -->
          <div id="polar-tab" class="tab-content hidden">
            <div class="mb-4 flex items-center justify-between">
              <div class="flex items-center space-x-4 flex-grow">
                <label class="text-sm text-gray-400">Select Frequency:</label>
                <input type="range" id="polar-freq-slider" min="0" max="7" value="3" step="1" 
                       class="flex-grow h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer">
                <span id="polar-freq-label" class="text-sm font-semibold text-white w-24 text-right">1 kHz</span>
              </div>
              <div class="flex items-center space-x-4 ml-6">
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" id="show-horizontal" checked class="form-checkbox h-4 w-4 text-red-500">
                  <span class="text-sm text-gray-300">Horizontal</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" id="show-vertical" checked class="form-checkbox h-4 w-4 text-green-500">
                  <span class="text-sm text-gray-300">Vertical</span>
                </label>
              </div>
            </div>
            <div class="bg-gray-800 rounded-lg p-4" style="height: 600px;">
              <canvas id="polar-chart"></canvas>
            </div>
            <div class="mt-4 text-xs text-gray-400 text-center">
              <span class="inline-block w-3 h-3 bg-red-500 mr-1"></span> Horizontal (Width)
              <span class="inline-block w-3 h-3 bg-green-500 ml-4 mr-1"></span> Vertical (Height)
            </div>
          </div>

          <!-- Tab 3: Heatmap -->
          <div id="heatmap-tab" class="tab-content hidden">
            <div class="mb-4 flex items-center justify-end space-x-4">
              <label class="flex items-center space-x-2 cursor-pointer">
                <input type="radio" name="heatmap-axis" value="horizontal" checked class="form-radio h-4 w-4 text-red-500">
                <span class="text-sm text-gray-300">Horizontal (Width)</span>
              </label>
              <label class="flex items-center space-x-2 cursor-pointer">
                <input type="radio" name="heatmap-axis" value="vertical" class="form-radio h-4 w-4 text-green-500">
                <span class="text-sm text-gray-300">Vertical (Height)</span>
              </label>
            </div>
            <div class="bg-gray-800 rounded-lg p-4" style="height: 600px;">
              <canvas id="heatmap-chart"></canvas>
            </div>
            <div class="mt-4 text-xs text-gray-400 text-center">
              Color Scale: <span class="text-red-400">0 dB</span> → <span class="text-blue-400">-24 dB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

export function initializeDirectivityPanel(rootElement) {
  // DOM elements
  const calculateBtn = rootElement.querySelector('#calculate-directivity-btn');
  const resultsDiv = rootElement.querySelector('#directivity-results');
  const mouthWidthInput = rootElement.querySelector('#mouth-width');
  const mouthHeightInput = rootElement.querySelector('#mouth-height');
  const clearImportBtn = rootElement.querySelector('#clear-import-btn');
  const advancedParamsDiv = rootElement.querySelector('#advanced-params');
  const modeLabel = rootElement.querySelector('#mode-label');
  
  // Tab buttons
  const tabBtns = rootElement.querySelectorAll('.tab-btn');
  const tabContents = rootElement.querySelectorAll('.tab-content');
  
  // Charts
  let polarChart = null;
  let heatmapChart = null;
  let currentResults = null;
  
  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      // Update button styles
      tabBtns.forEach(b => {
        b.classList.remove('active', 'border-accent', 'text-accent');
        b.classList.add('border-transparent', 'text-gray-400');
      });
      btn.classList.add('active', 'border-accent', 'text-accent');
      btn.classList.remove('border-transparent', 'text-gray-400');
      
      // Show/hide content
      tabContents.forEach(content => content.classList.add('hidden'));
      rootElement.querySelector(`#${targetTab}-tab`).classList.remove('hidden');
      
      // Render charts when switching to them
      if (currentResults) {
        if (targetTab === 'polar') {
          if (polarChart) {
            polarChart.destroy();
            polarChart = null;
          }
          polarChart = renderPolarPlot(currentResults, rootElement);
        } else if (targetTab === 'heatmap') {
          if (heatmapChart) {
            heatmapChart.destroy();
            heatmapChart = null;
          }
          heatmapChart = renderHeatmap(currentResults, rootElement);
        }
      }
    });
  });
  
  // Listen for imported data from Horn Expansion
  window.panelEvents.addEventListener('export-to-directivity', (event) => {
    const data = event.detail;
    advancedGeometryData = {
      lastSegmentWidth: data.lastSegmentWidth,
      lastSegmentHeight: data.lastSegmentHeight,
      calculatedWallAngleH: data.calculatedWallAngleH,
      calculatedWallAngleV: data.calculatedWallAngleV,
      expansionType: data.expansionType,
      cutoffFrequency: data.cutoffFrequency
    };
    
    // Update UI
    mouthWidthInput.value = data.lastSegmentWidth;
    mouthHeightInput.value = data.lastSegmentHeight;
    rootElement.querySelector('#wall-angle-h').value = data.calculatedWallAngleH.toFixed(2);
    rootElement.querySelector('#wall-angle-v').value = data.calculatedWallAngleV.toFixed(2);
    rootElement.querySelector('#expansion-type').value = data.expansionType;
    rootElement.querySelector('#cutoff-freq').value = data.cutoffFrequency.toFixed(0);
    
    advancedParamsDiv.classList.remove('hidden');
    clearImportBtn.classList.remove('hidden');
    modeLabel.textContent = 'Pro';
    modeLabel.classList.remove('text-green-400');
    modeLabel.classList.add('text-purple-400');
    
    // Auto-calculate
    calculateBtn.click();
  });
  
  // Clear import button
  clearImportBtn.addEventListener('click', () => {
    advancedGeometryData = null;
    advancedParamsDiv.classList.add('hidden');
    clearImportBtn.classList.add('hidden');
    modeLabel.textContent = 'Simple';
    modeLabel.classList.remove('text-purple-400');
    modeLabel.classList.add('text-green-400');
  });
  
  // Calculate button
  calculateBtn.addEventListener('click', () => {
    const width = parseFloat(mouthWidthInput.value);
    const height = parseFloat(mouthHeightInput.value);
    
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
      alert('Please enter valid mouth dimensions.');
      return;
    }
    
    // Destroy existing charts
    if (polarChart) {
      polarChart.destroy();
      polarChart = null;
    }
    if (heatmapChart) {
      heatmapChart.destroy();
      heatmapChart = null;
    }
    
    currentResults = calculateDirectivity(width, height, advancedGeometryData);
    displayResults(currentResults, rootElement);
    resultsDiv.classList.remove('hidden');
    
    // Scroll to results
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

/**
 * Main calculation function
 * Supports both Simple Mode (Piston) and Pro Mode (Hybrid Horn)
 */
function calculateDirectivity(width, height, advancedData) {
  // Convert mm to meters
  const widthM = width / 1000;
  const heightM = height / 1000;
  
  // Frequencies to analyze
  const frequencies = [100, 200, 500, 1000, 2000, 4000, 8000, 16000];
  
  const isProMode = advancedData !== null;
  
  const results = frequencies.map(freq => {
    let horizontalAngle, verticalAngle;
    
    if (isProMode) {
      // PRO MODE: Hybrid Horn Model
      horizontalAngle = calculateHornAngle(
        freq, 
        widthM, 
        advancedData.calculatedWallAngleH,
        advancedData.calculatedWallAngleV,
        true, // isHorizontal
        advancedData.expansionType
      );
      verticalAngle = calculateHornAngle(
        freq, 
        heightM, 
        advancedData.calculatedWallAngleH,
        advancedData.calculatedWallAngleV,
        false, // isHorizontal
        advancedData.expansionType
      );
    } else {
      // SIMPLE MODE: Rectangular Piston Model
      horizontalAngle = calculatePistonAngle(widthM, freq);
      verticalAngle = calculatePistonAngle(heightM, freq);
    }
    
    // Q-factors using Q ≈ 40,000 / (θH × θV)
    const qFactor = calculateQFactor(horizontalAngle, verticalAngle);
    
    return {
      frequency: freq,
      horizontalAngle: horizontalAngle,
      verticalAngle: verticalAngle,
      qHorizontal: qFactor,
      qVertical: qFactor
    };
  });
  
  return {
    results,
    widthM,
    heightM,
    isProMode,
    advancedData
  };
}

/**
 * SIMPLE MODE: Rectangular Piston in Infinite Baffle
 * Beamwidth Formula (-6dB): θ ≈ 2 * arcsin(1.43 * c / (π * f * Dimension))
 */
function calculatePistonAngle(dimension, frequency) {
  const wavelength = SPEED_OF_SOUND / frequency;
  const ratio = (1.43 * SPEED_OF_SOUND) / (Math.PI * frequency * dimension);
  
  // Clamp to avoid arcsin domain errors
  if (ratio >= 1) {
    return 180; // Omnidirectional (dimension too small)
  }
  
  const angleRad = 2 * Math.asin(ratio);
  const angleDeg = (angleRad * 180) / Math.PI;
  
  return Math.min(180, angleDeg);
}

/**
 * PRO MODE: Hybrid Horn Model
 * Combines Diffraction (Low Freq) and Geometric Control (High Freq)
 */
function calculateHornAngle(frequency, dimension, wallAngleH, wallAngleV, isHorizontal, expansionType) {
  // 1. Calculate diffraction angle (piston model)
  const thetaDiff = calculatePistonAngle(dimension, frequency);
  
  // 2. Get appropriate wall angle for this axis
  const thetaWall = isHorizontal ? wallAngleH : wallAngleV;
  
  // 3. Determine final angle based on expansion type
  let thetaFinal;
  
  if (expansionType === 'Conical' || expansionType === 'OS') {
    // Constant Directivity: Beam narrows until it hits wall angle, then stays constant
    thetaFinal = Math.max(thetaDiff, thetaWall);
  } else if (expansionType === 'Exponential' || expansionType === 'Hypex' || expansionType === 'Parabolic') {
    // Exponential/Hyperbolic: Apply narrowing factor as frequency increases
    const narrowingFactor = Math.pow(2000 / frequency, 0.5);
    thetaFinal = Math.max(thetaDiff, thetaWall * narrowingFactor);
  } else {
    // Default to piston model
    thetaFinal = thetaDiff;
  }
  
  return Math.min(180, thetaFinal);
}

/**
 * Calculate Q-factor (directivity factor)
 * Formula: Q ≈ 40,000 / (θH × θV)
 * where θH and θV are the -6dB beamwidth angles in degrees
 */
function calculateQFactor(horizontalAngle, verticalAngle) {
  const q = 40000 / (horizontalAngle * verticalAngle);
  
  return Math.max(1, q);
}

/**
 * Display results in table and summary cards
 */
function displayResults(data, rootElement) {
  const { results } = data;
  
  // Update summary cards
  const result1kHz = results.find(r => r.frequency === 1000);
  if (result1kHz) {
    rootElement.querySelector('#horizontal-coverage').textContent = 
      `${result1kHz.horizontalAngle.toFixed(0)}°`;
    rootElement.querySelector('#vertical-coverage').textContent = 
      `${result1kHz.verticalAngle.toFixed(0)}°`;
  }
  
  // Display frequency table
  displayFrequencyTable(results, rootElement);
}

function displayFrequencyTable(results, rootElement) {
  const tableContainer = rootElement.querySelector('#frequency-table');
  
  const tableHtml = `
    <table class="w-full text-sm">
      <thead class="text-xs uppercase bg-gray-800 text-gray-400">
        <tr>
          <th class="px-6 py-3 text-left">Frequency</th>
          <th class="px-6 py-3 text-center">H Coverage</th>
          <th class="px-6 py-3 text-center">V Coverage</th>
          <th class="px-6 py-3 text-center">Q-H</th>
          <th class="px-6 py-3 text-center">Q-V</th>
        </tr>
      </thead>
      <tbody class="text-gray-300">
        ${results.map((r, idx) => `
          <tr class="${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/50'} border-b border-gray-700 hover:bg-gray-700/30">
            <td class="px-6 py-3 font-medium text-white">${formatFrequency(r.frequency)}</td>
            <td class="px-6 py-3 text-center ${getCoverageColorClass(r.horizontalAngle)}">${r.horizontalAngle.toFixed(0)}°</td>
            <td class="px-6 py-3 text-center ${getCoverageColorClass(r.verticalAngle)}">${r.verticalAngle.toFixed(0)}°</td>
            <td class="px-6 py-3 text-center">${r.qHorizontal.toFixed(1)}</td>
            <td class="px-6 py-3 text-center">${r.qVertical.toFixed(1)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  tableContainer.innerHTML = tableHtml;
}

/**
 * Render interactive polar plot
 */
function renderPolarPlot(data, rootElement) {
  const canvas = rootElement.querySelector('#polar-chart');
  const slider = rootElement.querySelector('#polar-freq-slider');
  const freqLabel = rootElement.querySelector('#polar-freq-label');
  const showHorizontal = rootElement.querySelector('#show-horizontal');
  const showVertical = rootElement.querySelector('#show-vertical');
  
  const { results, widthM, heightM } = data;
  
  // Initial frequency
  let currentFreqIndex = 3; // 1kHz
  
  // Get chart instance from canvas if it exists
  let chart = Chart.getChart(canvas);
  if (chart) {
    chart.destroy();
  }
  chart = null;
  
  const updateChart = () => {
    const freq = results[currentFreqIndex].frequency;
    freqLabel.textContent = formatFrequency(freq);
    
    // Generate polar data
    const angles = [];
    const horizontalData = [];
    const verticalData = [];
    
    for (let angle = 0; angle <= 180; angle += 2) {
      angles.push(angle);
      
      // Calculate intensity for horizontal plane
      const hIntensity = calculatePolarIntensity(angle, freq, widthM);
      horizontalData.push(hIntensity);
      
      // Calculate intensity for vertical plane
      const vIntensity = calculatePolarIntensity(angle, freq, heightM);
      verticalData.push(vIntensity);
    }
    
    // Create symmetric data (-180 to 180)
    const fullAngles = [...angles.map(a => -a).reverse().slice(0, -1), ...angles];
    const fullHData = [...horizontalData.reverse().slice(0, -1), ...horizontalData];
    const fullVData = [...verticalData.reverse().slice(0, -1), ...verticalData];
    
    // Destroy existing chart from canvas
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
      existingChart.destroy();
    }
    
    // Build datasets based on visibility
    const datasets = [];
    if (showHorizontal.checked) {
      datasets.push({
        label: 'Horizontal (Width)',
        data: fullHData,
        backgroundColor: 'rgba(255, 99, 132, 0.3)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 2
      });
    }
    if (showVertical.checked) {
      datasets.push({
        label: 'Vertical (Height)',
        data: fullVData,
        backgroundColor: 'rgba(75, 192, 192, 0.3)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2
      });
    }
    
    // Create new chart
    chart = new Chart(canvas, {
      type: 'polarArea',
      data: {
        labels: [], // Empty labels to remove angle text
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            beginAtZero: true,
            max: 1,
            ticks: {
              stepSize: 0.2,
              color: '#9ca3af',
              callback: (value) => `${(value * 100).toFixed(0)}%`,
              font: {
                size: 11
              }
            },
            grid: {
              color: '#374151'
            },
            pointLabels: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#fff',
              font: {
                size: 13,
                weight: 'bold'
              },
              padding: 15
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.parsed.r;
                const db = linearToDb(value);
                return `${context.dataset.label}: ${(value * 100).toFixed(1)}% (${db.toFixed(1)} dB)`;
              }
            }
          }
        }
      }
    });
  };
  
  // Remove old event listeners if they exist
  if (polarSliderListener) {
    slider.removeEventListener('input', polarSliderListener);
  }
  if (polarHCheckListener) {
    showHorizontal.removeEventListener('change', polarHCheckListener);
  }
  if (polarVCheckListener) {
    showVertical.removeEventListener('change', polarVCheckListener);
  }
  
  // Create new event listeners
  polarSliderListener = (e) => {
    currentFreqIndex = parseInt(e.target.value);
    updateChart();
  };
  
  polarHCheckListener = () => updateChart();
  polarVCheckListener = () => updateChart();
  
  // Add event listeners
  slider.addEventListener('input', polarSliderListener);
  showHorizontal.addEventListener('change', polarHCheckListener);
  showVertical.addEventListener('change', polarVCheckListener);
  
  // Initial render
  updateChart();
  
  return chart;
}

/**
 * Calculate polar intensity at a given angle
 */
function calculatePolarIntensity(angleDeg, frequency, dimension) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const k = calculateWaveNumber(frequency);
  const u = (k * dimension / 2) * Math.sin(angleRad);
  
  // Use sinc function for rectangular piston
  const intensity = Math.pow(sinc(u), 2);
  
  return intensity;
}

/**
 * Render heatmap (frequency vs angle)
 */
function renderHeatmap(data, rootElement) {
  const canvas = rootElement.querySelector('#heatmap-chart');
  const heatmapAxisRadios = rootElement.querySelectorAll('input[name="heatmap-axis"]');
  const { results, widthM, heightM, isProMode, advancedData } = data;
  
  // Get chart instance from canvas if it exists
  let chart = Chart.getChart(canvas);
  if (chart) {
    chart.destroy();
  }
  chart = null;
  
  const updateHeatmap = () => {
    const selectedAxis = rootElement.querySelector('input[name="heatmap-axis"]:checked').value;
    const useHorizontal = selectedAxis === 'horizontal';
    const dimension = useHorizontal ? widthM : heightM;
    
    // Frequency range (logarithmic)
    const frequencies = [];
    for (let f = 100; f <= 20000; f *= 1.2) {
      frequencies.push(Math.round(f));
    }
    
    // Angle range
    const angles = [];
    for (let a = -90; a <= 90; a += 2) {
      angles.push(a);
    }
    
    // Generate heatmap data
    const heatmapData = [];
    
    frequencies.forEach(freq => {
      angles.forEach(angle => {
        let effectiveDimension = dimension;
        
        // In Pro Mode, adjust effective dimension to match calculated beamwidth
        if (isProMode) {
          const targetAngle = calculateHornAngle(
            freq, 
            dimension,
            advancedData.calculatedWallAngleH,
            advancedData.calculatedWallAngleV,
            useHorizontal,
            advancedData.expansionType
          );
          effectiveDimension = calculateEffectiveDimension(freq, targetAngle);
        }
        
        const intensity = calculatePolarIntensity(Math.abs(angle), freq, effectiveDimension);
        const db = linearToDb(intensity);
        
        heatmapData.push({
          x: freq,
          y: angle,
          v: clamp(db, -24, 0)
        });
      });
    });
    
    // Destroy existing chart from canvas
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
      existingChart.destroy();
    }
    
    // Create heatmap
    chart = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: useHorizontal ? 'Horizontal Directivity' : 'Vertical Directivity',
          data: heatmapData,
          backgroundColor: (context) => {
            const value = context.raw.v;
            return dbToColor(value);
          },
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'logarithmic',
            title: {
              display: true,
              text: 'Frequency (Hz)',
              color: '#fff',
              font: {
                size: 13,
                weight: 'bold'
              }
            },
            ticks: {
              color: '#9ca3af',
              font: {
                size: 11
              },
              callback: (value) => {
                if (value >= 1000) return `${value / 1000}k`;
                return value;
              }
            },
            grid: {
              color: '#374151'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Angle (°)',
              color: '#fff',
              font: {
                size: 13,
                weight: 'bold'
              }
            },
            ticks: {
              color: '#9ca3af',
              font: {
                size: 11
              }
            },
            grid: {
              color: '#374151'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const freq = context.raw.x;
                const angle = context.raw.y;
                const db = context.raw.v;
                return `${formatFrequency(freq)} @ ${angle}°: ${db.toFixed(1)} dB`;
              }
            }
          }
        }
      }
    });
  };
  
  // Remove old event listeners
  heatmapRadioListeners.forEach(listener => {
    heatmapAxisRadios.forEach(radio => {
      radio.removeEventListener('change', listener);
    });
  });
  heatmapRadioListeners = [];
  
  // Create new event listener
  const radioListener = () => updateHeatmap();
  heatmapRadioListeners.push(radioListener);
  
  // Add event listeners
  heatmapAxisRadios.forEach(radio => {
    radio.addEventListener('change', radioListener);
  });
  
  // Initial render
  updateHeatmap();
  
  return chart;
}

/**
 * Calculate effective dimension to achieve target angle
 */
function calculateEffectiveDimension(frequency, targetAngleDeg) {
  const ratio = Math.sin((targetAngleDeg * Math.PI) / (2 * 180));
  if (ratio <= 0) return 0.01; // Minimum dimension
  
  const dimension = (1.43 * SPEED_OF_SOUND) / (Math.PI * frequency * ratio);
  return dimension;
}

/**
 * Convert dB value to color (red = 0dB, blue = -24dB)
 */
function dbToColor(db) {
  // Normalize from -24..0 to 0..1
  const normalized = (db + 24) / 24;
  
  // Red (0dB) to Blue (-24dB) gradient
  const r = Math.round(255 * normalized);
  const g = 0;
  const b = Math.round(255 * (1 - normalized));
  
  return `rgba(${r}, ${g}, ${b}, 0.7)`;
}

// Utility functions
function formatFrequency(freq) {
  if (freq >= 1000) {
    return `${freq / 1000} kHz`;
  }
  return `${freq} Hz`;
}

function getCoverageColorClass(angle) {
  const angleNum = parseFloat(angle);
  if (angleNum > 120) return 'text-blue-400';
  if (angleNum > 60) return 'text-green-400';
  if (angleNum > 30) return 'text-yellow-400';
  return 'text-orange-400';
}
