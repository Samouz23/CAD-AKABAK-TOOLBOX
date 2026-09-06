// =================================================================================
// FICHIER : src/js/panels/physics/splCalculator.js
// RÔLE    : Calculateur SPL (Sound Pressure Level) avec graphique interactif
// =================================================================================

import { PhysicsIcons } from './icons.js';
import { getChartThemeColors, registerChartForThemeUpdates } from '../../utils/chartThemeHelper.js';

export function getSplCalculatorHtml() {
  return `
    <div class="space-y-6">
      
      <section class="calc-section">
        <h2 class="calc-title">SPL Calculator</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          <!-- Input Section -->
          <div class="space-y-3">
            <div>
              <label class="block mb-1">Speaker Sensitivity (dB @ 1W/1m)</label>
              <input type="text" id="spl-sensitivity" class="form-input" value="88">
            </div>
            
            <div>
              <label class="block mb-1">Input Power (Watts)</label>
              <input type="text" id="spl-power" class="form-input" value="1">
            </div>
            
            <div>
              <label class="block mb-1">Distance (meters)</label>
              <input type="text" id="spl-distance" class="form-input" value="1">
            </div>

            <div>
              <label class="block mb-1">Number of Speakers</label>
              <input type="text" id="spl-speakers" class="form-input" value="1">
            </div>

            <div class="pt-4 border-t" style="border-color: var(--border-primary);">
              <label class="block mb-2 text-lg font-semibold" style="color: var(--text-heading);">Result</label>
              <div style="background: var(--card-bg); border: 2px solid var(--border-primary); box-shadow: var(--card-shadow); border-radius: var(--radius-lg); padding: 1rem; text-align: center;">
                <div class="text-4xl font-bold" style="color: var(--border-primary);" id="spl-result">88.0</div>
                <div class="text-sm mt-1" style="color: var(--text-muted);">dB SPL</div>
              </div>
            </div>
          </div>

          <!-- Graph Section -->
          <div>
            <h3 class="text-lg font-semibold mb-3" style="color: var(--text-heading);">SPL vs Distance</h3>
            <div style="background: var(--chart-bg); border: 2px solid var(--border-primary); box-shadow: var(--card-shadow); border-radius: var(--radius-lg); padding: 1rem; height: 400px;">
              <canvas id="spl-chart"></canvas>
            </div>
          </div>

        </div>
      </section>

    </div>
  `;
}

let splChart = null;

export function initializeSplCalculator() {
  const sensitivityInput = document.getElementById('spl-sensitivity');
  const powerInput = document.getElementById('spl-power');
  const distanceInput = document.getElementById('spl-distance');
  const speakersInput = document.getElementById('spl-speakers');
  const resultDisplay = document.getElementById('spl-result');

  // Calculate SPL
  const calculateSPL = () => {
    const sensitivity = parseFloat(sensitivityInput.value) || 88;
    const power = parseFloat(powerInput.value) || 1;
    const distance = parseFloat(distanceInput.value) || 1;
    const speakers = parseInt(speakersInput.value) || 1;

    // SPL = Sensitivity + 10*log10(Power) - 20*log10(Distance) + 3*log2(Speakers)
    const powerGain = 10 * Math.log10(power);
    const distanceLoss = 20 * Math.log10(distance);
    const speakerGain = speakers > 1 ? 3 * Math.log2(speakers) : 0;
    
    const spl = sensitivity + powerGain - distanceLoss + speakerGain;

    resultDisplay.textContent = spl.toFixed(1);

    // Update color based on SPL level
    if (spl < 85) {
      resultDisplay.className = 'text-4xl font-bold text-green-400';
    } else if (spl < 100) {
      resultDisplay.className = 'text-4xl font-bold text-yellow-400';
    } else if (spl < 115) {
      resultDisplay.className = 'text-4xl font-bold text-orange-400';
    } else {
      resultDisplay.className = 'text-4xl font-bold text-red-400';
    }

    updateChart(sensitivity, power, speakers);
  };

  // Update chart
  const updateChart = (sensitivity, power, speakers) => {
    const canvas = document.getElementById('spl-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Generate data points for distances from 0.5m to 20m
    const distances = [];
    const splValues = [];
    
    for (let d = 0.5; d <= 20; d += 0.5) {
      distances.push(d.toFixed(1));
      const powerGain = 10 * Math.log10(power);
      const distanceLoss = 20 * Math.log10(d);
      const speakerGain = speakers > 1 ? 3 * Math.log2(speakers) : 0;
      const spl = sensitivity + powerGain - distanceLoss + speakerGain;
      splValues.push(spl.toFixed(1));
    }

    // Destroy existing chart
    if (splChart) {
      splChart.destroy();
    }

    // Récupérer les couleurs du thème actif via CSS variables
    const colors = getChartThemeColors();
    
    // Create new chart (using Chart.js if available)
    if (typeof Chart !== 'undefined') {
      splChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: distances,
          datasets: [{
            label: 'SPL (dB)',
            data: splValues,
            borderColor: colors.primary,
            backgroundColor: colors.primaryGlow,
            borderWidth: 3,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: colors.primary,
            pointBorderColor: colors.primary,
            pointBorderWidth: 2,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              labels: { 
                color: colors.text,
                font: { size: 13, weight: 'bold' },
                padding: 15
              }
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              titleColor: colors.text,
              bodyColor: colors.text,
              borderColor: colors.primary,
              borderWidth: 2,
              padding: 12,
              displayColors: true,
              callbacks: {
                label: (context) => `${context.parsed.y} dB SPL`
              }
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: 'Distance (m)',
                color: colors.axis,
                font: { size: 12, weight: 'bold' }
              },
              ticks: { 
                color: colors.axis,
                font: { size: 11 }
              },
              grid: { 
                color: colors.grid,
                lineWidth: 1
              }
            },
            y: {
              title: {
                display: true,
                text: 'SPL (dB)',
                color: colors.axis,
                font: { size: 12, weight: 'bold' }
              },
              ticks: { 
                color: colors.axis,
                font: { size: 11 }
              },
              grid: { 
                color: colors.grid,
                lineWidth: 1
              }
            }
          }
        }
      });
      
      // Enregistrer le graphique pour les mises à jour automatiques de thème
      registerChartForThemeUpdates(splChart);
    } else {
      // Fallback if Chart.js not available
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Chart.js library required for graph visualization', canvas.width / 2, canvas.height / 2);
      ctx.fillText('SPL decreases as distance increases (inverse square law)', canvas.width / 2, canvas.height / 2 + 30);
    }
  };

  // Event listeners
  [sensitivityInput, powerInput, distanceInput, speakersInput].forEach(input => {
    input.addEventListener('input', calculateSPL);
    
    // Enable inline calculation
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        try {
          const result = eval(input.value);
          if (typeof result === 'number' && isFinite(result)) {
            input.value = result;
            calculateSPL();
          }
        } catch (error) {
          console.warn("Invalid expression");
        }
      }
    });
  });

  // Initial calculation
  calculateSPL();
}
