// ====================================================================================================
// FICHIER :  src/js/panels/horn.js (VERSION FINALE CORRIGÉE ET MODIFIÉE)
// ====================================================================================================

const defaultSegments = [
    { w: 100, h: 56.4, l: 88 }, { w: 115, h: 65.0, l: 624 }, { w: 280, h: 158.2, l: 229 },
    { w: 400, h: 226.0, l: 260 }, { w: 590, h: 333.3, l: 445 }, { w: 1100, h: 621.5, l: 350 },
];

const C_SOUND = 344000;
const expansionTypes = ['Conical', 'Exponential', 'Parabolic', 'Hypex', 'OS'];
const chartColors = { w: '#ff0000ff', h: '#00ffa2ff', s: '#ff00eaff', os: '#ffbb00ff' };

// Parser mathématique sécurisé sans eval() ni Function()
export function safeEvaluateMath(expression) {
    const expr = expression.trim().replace(/\s+/g, '');
    
    // Vérifier si c'est déjà un nombre simple
    const simpleNum = parseFloat(expr);
    if (!isNaN(simpleNum) && /^-?\d+\.?\d*$/.test(expr)) {
        return simpleNum;
    }
    
    let pos = 0;
    
    const peek = () => expr[pos];
    const consume = () => expr[pos++];
    
    const parseNumber = () => {
        let num = '';
        while (pos < expr.length && /[0-9.]/.test(peek())) {
            num += consume();
        }
        return parseFloat(num);
    };
    
    const parseFactor = () => {
        // Gérer les nombres négatifs
        if (peek() === '-') {
            consume();
            return -parseFactor();
        }
        
        if (peek() === '+') {
            consume();
            return parseFactor();
        }
        
        // Gérer les parenthèses
        if (peek() === '(') {
            consume(); // '('
            const result = parseExpression();
            consume(); // ')'
            return result;
        }
        
        // Gérer les fonctions Math
        if (expr.substr(pos, 5) === 'Math.') {
            pos += 5;
            const funcName = expr.substr(pos, 4);
            
            if (funcName === 'sqrt') {
                pos += 4;
                consume(); // '('
                const arg = parseExpression();
                consume(); // ')'
                return Math.sqrt(arg);
            } else if (funcName.startsWith('sin')) {
                pos += 3;
                consume(); // '('
                const arg = parseExpression();
                consume(); // ')'
                return Math.sin(arg);
            } else if (funcName.startsWith('cos')) {
                pos += 3;
                consume(); // '('
                const arg = parseExpression();
                consume(); // ')'
                return Math.cos(arg);
            } else if (funcName.startsWith('tan')) {
                pos += 3;
                consume(); // '('
                const arg = parseExpression();
                consume(); // ')'
                return Math.tan(arg);
            } else if (funcName.startsWith('abs')) {
                pos += 3;
                consume(); // '('
                const arg = parseExpression();
                consume(); // ')'
                return Math.abs(arg);
            } else if (funcName.startsWith('pow')) {
                pos += 3;
                consume(); // '('
                const arg1 = parseExpression();
                consume(); // ','
                const arg2 = parseExpression();
                consume(); // ')'
                return Math.pow(arg1, arg2);
            } else if (funcName.startsWith('PI')) {
                pos += 2;
                return Math.PI;
            }
        }
        
        return parseNumber();
    };
    
    const parseTerm = () => {
        let result = parseFactor();
        
        while (pos < expr.length && (peek() === '*' || peek() === '/')) {
            const op = consume();
            const right = parseFactor();
            if (op === '*') result *= right;
            else result /= right;
        }
        
        return result;
    };
    
    const parseExpression = () => {
        let result = parseTerm();
        
        while (pos < expr.length && (peek() === '+' || peek() === '-')) {
            const op = consume();
            const right = parseTerm();
            if (op === '+') result += right;
            else result -= right;
        }
        
        return result;
    };
    
    try {
        const result = parseExpression();
        if (typeof result === 'number' && isFinite(result)) {
            return result;
        }
        throw new Error('Résultat non numérique');
    } catch (error) {
        throw new Error(`Erreur de parsing: ${error.message}`);
    }
}

const expansionFormulas = {
    Conical: (s0, sL, L, x) => {
        if (L <= 0 || s0 < 0 || sL < 0) return s0;
        const r0 = Math.sqrt(s0); const rL = Math.sqrt(sL);
        const rx = r0 + (rL - r0) * (x / L); return rx * rx;
    },
    Exponential: (s0, sL, L, x, opts) => {
        if (s0 <= 0) return s0; const fc = opts?.fc ?? 400;
        const m = (4 * Math.PI * fc) / C_SOUND; return s0 * Math.exp(m * x);
    },
    Parabolic: (s0, sL, L, x, opts) => {
        if (s0 <= 0) return s0; const fc = opts?.fc ?? 400;
        const x0 = C_SOUND / (Math.PI * fc); return s0 * Math.pow(1 + x / x0, 2);
    },
    Hypex: (s0, sL, L, x, opts) => {
        if (s0 <= 0) return s0; const fc = opts?.fc ?? 100; const T = opts?.T ?? 1.0;
        const m = (4 * Math.PI * fc) / C_SOUND; const y0 = Math.sqrt(s0);
        const y = y0 * (Math.cosh(m * x / 2) + T * Math.sinh(m * x / 2)); return y * y;
    },
    OS: (s0, sL, L, x, opts) => {
        if (s0 <= 0) return 0; const theta = opts?.theta ?? 45;
        const y0 = Math.sqrt(s0); const theta_rad = theta * (Math.PI / 180);
        return Math.pow(y0, 2) + Math.pow(Math.tan(theta_rad) * x, 2);
    },
};
const dimensionFormulas = {
    'OS-SE': (x, L, opts) => {
        const { k=1.0, r=18.0, t=5.0, a=40.0, s=0.7, q=0.996, n=5.0 } = opts;
        const t_rad = t * (Math.PI/180); const a_rad = a * (Math.PI/180);
        const sqrtContent = Math.pow(k*r,2) + 2*k*r*x*Math.tan(t_rad) + Math.pow(x,2)*Math.pow(Math.tan(a_rad),2);
        if (sqrtContent < 0) return NaN; const part1 = Math.sqrt(sqrtContent) - r*(k-1);
        let part2 = 0;
        if (L > 0 && q !== 0) {
            const innerPowerBase = (q * x) / L;
            if (innerPowerBase >= 0 && innerPowerBase <= 1) {
                const innerTerm = 1 - Math.pow(innerPowerBase, n);
                if(innerTerm < 0) return part1;
                const powerTerm = Math.pow(innerTerm, 1 / n);
                if (!isNaN(powerTerm)) { part2 = (L * s / q) * (1 - powerTerm); }
            }
        }
        const result = part1 + part2; return isNaN(result) ? 0 : result;
    }
};

export function getHornPanelHtml() {
    const segmentRowsHtml = Array.from({ length: 20 }, (_, i) => `
  <tr class="segment-row" data-index="${i}" style="display: none;">
    <td class="p-1 h-12 text-center align-middle font-bold text-gray-400">${i + 1}</td>
    <td class="p-1 h-12 align-middle">
      <input type="text" data-col="w" class="form-input segment-w h-full w-full">
    </td>
    <td class="p-1 h-12 align-middle">
      <input type="text" data-col="h" class="form-input segment-h h-full w-full">
    </td>
    <td class="p-1 h-12 align-middle">
      <input type="text" data-col="l" class="form-input segment-l h-full w-full disabled:bg-gray-700">
    </td>
    <td class="p-1 h-12 align-middle">
      <input type="text" data-col="s" class="form-input segment-s-input h-full w-full">
    </td>
  </tr>
`).join('');
    const expansionOptionsHtml = expansionTypes.map(t => `<option value="${t}">${t}</option>`).join('');
    
    return `
    <div class="p-6 text-green-400 h-full flex flex-col">
        <div class="flex justify-between items-center mb-4 flex-shrink-0">
            <div class="flex items-center space-x-4">
                <h1 class="text-4xl font-bold text-white">Horn Expansion</h1>
                <button id="import-btn" class="action-btn">Import</button>
            </div>
            <div class="flex items-center space-x-4">
                 <button id="unit-switch-btn" class="action-btn w-20">mm</button>
                 <div class="relative">
                    <button id="export-to-btn" class="action-btn">Export To..</button>
                    <div id="export-options" class="hidden absolute right-0 mt-2 w-48 bg-gray-900 border themed-border rounded-md shadow-lg z-20">
                        <a href="#" class="block px-4 py-2 text-sm text-gray-300 themed-hover-bg" data-target="hornscript">Horn-Script LEM</a>
                        <a href="#" class="block px-4 py-2 text-sm text-gray-300 themed-hover-bg" data-target="waveguide">Waveguide Studio</a>
                        <a href="#" class="block px-4 py-2 text-sm text-gray-300 themed-hover-bg" data-target="directivity">Directivity</a>
                    </div>
                 </div>
            </div>
        </div>
        
        <div class="flex-grow flex flex-col overflow-hidden space-y-4">
            <div id="main-content-area" class="flex flex-col space-y-4">
                <div id="os-se-params-container" class="hidden items-center justify-center flex-wrap gap-x-4 gap-y-2 p-3 bg-gray-900/50 border border-gray-700 rounded-md">
                    <!-- OS-SE params will be injected here -->
                </div>
                <div id="table-container" class="flex-shrink-0 flex flex-col" style="height: 280px;">
                    <div class="flex-grow overflow-y-auto pr-2">
                        <table class="w-full text-sm max-w-4xl border-separate border-spacing-0">
                            <thead class="sticky top-0 bg-black z-10"><tr class="text-white">
                                <th class="w-8">#</th>
                                <th class="w-20" data-unit-label="dim">Width (mm)</th><th class="w-20" data-unit-label="dim">Height (mm)</th>
                                <th class="w-20" data-unit-label="dim">Length (mm)</th><th class="w-20" data-unit-label="surf">Area (mm²)</th>
                            </tr></thead>
                            <tbody id="segments-table-body">${segmentRowsHtml}</tbody>
                        </table>
                    </div>
                </div>
                <div id="segment-controls" class="flex-shrink-0 pt-2 flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                        <label for="segment-count">Segments:</label>
                        <input type="text" id="segment-count" min="1" max="20" value="6" class="form-input form-input-sm w-16">
                        <div class="flex items-center">
                           <div class="flex flex-col">
                               <button id="insert-before-btn" title="Insert before" class="h-4 w-4 flex items-center justify-center text-white hover:bg-green-700">▲</button>
                               <button id="insert-after-btn" title="Insert after" class="h-4 w-4 flex items-center justify-center text-white hover:bg-green-700">▼</button>
                           </div>
                           <button id="delete-segment-btn" title="Delete segment" class="h-8 w-8 ml-2 flex items-center justify-center text-2xl text-white bg-red-700 hover:bg-red-800 rounded">×</button>
                        </div>
                    </div>
                    <div id="params-container" class="flex-grow flex items-center space-x-4 ml-4">
                        <div id="extra-params-container" class="flex items-center space-x-2 flex-wrap gap-2"></div>
                    </div>
                </div>
            </div>
            
            <div id="graphs-container" class="flex-grow flex flex-col min-h-0">
                <div class="graph-widget-header flex justify-between items-center mb-2 flex-shrink-0">
                    
                    <div id="graph-controls-left" class="flex items-center space-x-4 flex-shrink-0">
                        <div id="expansion-selectors-container" class="flex items-center space-x-4 flex-shrink-0">
                            <div class="flex items-center space-x-2"><span class="font-bold" style="color:${chartColors.w};">Width:</span><select class="graph-expansion-select" data-param="w">${expansionOptionsHtml}</select></div>
                            <div class="flex items-center space-x-2"><span class="font-bold" style="color:${chartColors.h};">Height:</span><select class="graph-expansion-select" data-param="h">${expansionOptionsHtml}</select></div>
                            <div class="flex items-center space-x-2"><span class="font-bold" style="color:${chartColors.s};">Area:</span><select class="graph-expansion-select" data-param="s">${expansionOptionsHtml}</select></div>
                        </div>
                    </div>

                    <div id="best-fit-container" class="flex-grow flex justify-center px-4">
                        <div id="best-fit-results" class="text-center text-xs text-gray-300 font-mono whitespace-pre-wrap p-2 border border-gray-700 rounded-md bg-gray-900/50 max-w-2xl"></div>
                    </div>

                    <div id="graph-controls-right" class="flex items-center space-x-2 flex-shrink-0">
                        <button data-scale="dim" class="y-axis-toggle-btn action-btn bg-pink-700">Dims</button>
                        <button data-scale="surf" class="y-axis-toggle-btn action-btn">Area</button>
                        <button data-scale="os-se" class="y-axis-toggle-btn action-btn">OS-SE</button>
                        <div class="border-l border-gray-600 pl-2 ml-2">
                             <button id="best-fit-btn" class="action-btn">Best-Fit</button>
                             <button id="clear-all-btn" class="action-btn ml-2">Clear</button>
                        </div>
                    </div>
                </div>
                <div class="relative flex-grow"><canvas id="main-chart"></canvas></div>
            </div>
        </div>
    </div>
    <button id="toggle-graph-btn" class="w-10 h-10 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded-full border-2 border-white transition-all" title="Hide Graph" style="position: fixed; bottom: 1rem; right: 1rem; z-index: 9999;">
        <svg id="toggle-graph-arrow" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    </button>
    `;
}

// --- LOGIQUE D'INITIALISATION ---
export function initializeHornPanel(rootElement) {
    let segmentCount = 6, mainChart = null, focusedRowIndex = -1;
    let currentUnit = 'mm', yAxisMode = 'dim'; 
    
    // Utiliser des variables globales séparées pour conserver l'état pendant la session
    // Se réinitialise à la fermeture de l'app
    // Index: 0=Width, 1=Ideal W, 2=Height, 3=Ideal H, 4=Area, 5=Ideal Area, 6=OS-SE
    
    // État pour les modes normaux (dim et area)
    if (!window.hornDatasetVisibilityNormal) {
        window.hornDatasetVisibilityNormal = [true, true, true, true, true, true, false];
    }
    
    // État pour le mode OS-SE (Area et Ideal Area cachées par défaut)
    if (!window.hornDatasetVisibilityOsSe) {
        window.hornDatasetVisibilityOsSe = [false, false, false, false, false, false, true];
    }
    
    // État de visibilité du graphique (visible par défaut)
    if (window.hornGraphVisible === undefined) {
        window.hornGraphVisible = true;
    }
    
    let datasetVisibility = [...window.hornDatasetVisibilityNormal];
    let previousVisibility = null;
    
    const defaultVisibility = [true,true,true,true,true,true,false];
    const segmentCountInput = rootElement.querySelector('#segment-count');
    const tableBody = rootElement.querySelector('#segments-table-body');
    const graphsContainer = rootElement.querySelector('#graphs-container');
    const clearBtn = rootElement.querySelector('#clear-all-btn');
    const bestFitBtn = rootElement.querySelector('#best-fit-btn');
    const insertAfterBtn = rootElement.querySelector('#insert-after-btn');
    const insertBeforeBtn = rootElement.querySelector('#insert-before-btn');
    const deleteSegmentBtn = rootElement.querySelector('#delete-segment-btn');
    const extraParamsContainer = rootElement.querySelector('#extra-params-container');
    const bestFitResults = rootElement.querySelector('#best-fit-results');
    const unitSwitchBtn = rootElement.querySelector('#unit-switch-btn');
    const importBtn = rootElement.querySelector('#import-btn');
    const exportToBtn = rootElement.querySelector('#export-to-btn');
    const exportOptions = rootElement.querySelector('#export-options');
    const tableContainer = rootElement.querySelector('#table-container');
    const osSeParamsContainer = rootElement.querySelector('#os-se-params-container');
    const expansionSelectorsContainer = rootElement.querySelector('#expansion-selectors-container');
    const bestFitContainer = rootElement.querySelector('#best-fit-container');
    const graphControlsLeft = rootElement.querySelector('#graph-controls-left');
    const graphControlsRight = rootElement.querySelector('#graph-controls-right');
    const toggleGraphBtn = rootElement.querySelector('#toggle-graph-btn');
    const toggleGraphArrow = rootElement.querySelector('#toggle-graph-arrow');
    const segmentControls = rootElement.querySelector('#segment-controls');

    const convertToMm = (value, unit) => (unit === 'cm' ? value * 10 : value);
    const convertFromMm = (value, unit) => (unit === 'cm' ? value / 10 : value);
    const getSurfaceFactor = (unit) => (unit === 'cm' ? 100 : 1);

    const enableInlineCalculation = (inputElement) => {
        // Éviter d'ajouter plusieurs fois le listener
        if (inputElement.dataset.hasCalculation === 'true') return;
        inputElement.dataset.hasCalculation = 'true';
        
        inputElement.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const expression = inputElement.value.trim();
                
                // Ne rien faire si le champ est vide
                if (!expression) return;
                
                // Vérifier si c'est déjà un nombre simple
                const simpleNumber = parseFloat(expression);
                if (!isNaN(simpleNumber) && /^-?\d+\.?\d*$/.test(expression)) {
                    return; // Pas besoin d'évaluer un nombre simple
                }
                
                try {
                    const result = safeEvaluateMath(expression);
                    inputElement.value = result;
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                } catch (error) { 
                    console.warn("Expression invalide:", expression, "| Erreur:", error.message); 
                }
            }
        });
    };

    function enableMouseWheelAdjustment(inputElement) {
        inputElement.addEventListener('wheel', (event) => {
            event.preventDefault();
            const currentValue = parseFloat(inputElement.value);
            if (isNaN(currentValue)) return;
            let step = parseFloat(inputElement.step) || 1;
            if (event.shiftKey) step *= 10;
            if (event.ctrlKey) step /= 10;
            const direction = event.deltaY < 0 ? 1 : -1;
            let newValue = currentValue + (step * direction);
            
            const min = parseFloat(inputElement.min);
            const max = parseFloat(inputElement.max);
            if (!isNaN(min)) newValue = Math.max(min, newValue);
            if (!isNaN(max)) newValue = Math.min(max, newValue);

            const precision = (String(step).split('.')[1] || '').length;
            inputElement.value = newValue.toFixed(precision);
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        }, { passive: false });
    }
    
    function handleExport(targetPanel) {
      if (targetPanel === 'hornscript') {
        const segments = getTableData(true);
        if (segments.length === 0) return;
        const payload = { segments, count: segmentCount, unit: currentUnit };
    
        window.showTool('hornscript', 'Horn-Script LEM');
    
        setTimeout(() => {
          window.panelEvents.dispatchEvent(
            new CustomEvent('export-to-hornscript', { detail: payload })
          );
        }, 100);
      }
      else if (targetPanel === 'waveguide') {
          const params = {};
        
          if (yAxisMode === 'os-se') {
            osSeParamsContainer.querySelectorAll('input')
              .forEach(input => { params[input.id] = parseFloat(input.value) || 0; });
        
          } else {
            const raw = getTableData(true);
            if (raw.length < 2) return;
        
            params.s0 = raw[0].w * raw[0].h;
            params.sL = raw[raw.length - 1].w * raw[raw.length - 1].h;
            params.L  = raw.slice(0, -1).reduce((acc, s) => acc + s.l, 0);
        
            const r0 = Math.sqrt(params.s0 / Math.PI);
            if (isFinite(r0) && r0 > 0) params.r0 = r0;
        
            // Toujours récupérer la loi d'expansion depuis le sélecteur Area (data-param="s")
            const areaLawSelect = rootElement.querySelector('.graph-expansion-select[data-param="s"]');
            const law = areaLawSelect ? areaLawSelect.value : null;
        
            const getNum = (ids) => {
              for (const id of ids) {
                const el = rootElement.querySelector(id);
                if (el) {
                  const v = parseFloat(el.value);
                  if (isFinite(v)) return v;
                }
              }
              return undefined;
            };
        
            // Si on a une loi d'expansion valide pour l'area, l'exporter avec ses variables
            if (law && law.trim()) {
              params['expansion-law'] = law;
        
              if (law === 'Hypex') {
                const fc = getNum(['#param-input-fc-s']);
                const T  = getNum(['#param-input-T-s']);
                if (fc !== undefined) params.fc = fc;
                if (T  !== undefined) params.T  = T;
              } else if (law === 'Exponential' || law === 'Parabolic') {
                const fc = getNum(['#param-input-fc-s']);
                if (fc !== undefined) params.fc = fc;
              } else if (law === 'OS') {
                const theta = getNum(['#param-input-theta-s']);
                if (theta !== undefined) params.theta = theta;
              } else if (law === 'Conical') {
                const theta = getNum(['#param-input-theta-s']);
                if (theta !== undefined) params.theta = theta;
              }
            }
          }
        
          window.showTool('waveguide', 'Waveguide Studio');
          setTimeout(() => {
            console.log('[Horn→Waveguide] exporting params:', params); 
            window.panelEvents.dispatchEvent(
              new CustomEvent('export-to-waveguide', { detail: params })
            );
          }, 200);
      }
      else if (targetPanel === 'directivity') {
        const raw = getTableData(true);
        if (raw.length < 2) {
          alert('Please define at least 2 segments before exporting to Directivity.');
          return;
        }
        
        // Get last segment dimensions (mouth)
        const lastSegment = raw[raw.length - 1];
        const lastSegmentWidth = lastSegment.w;
        const lastSegmentHeight = lastSegment.h;
        
        // Calculate wall angles separately for horizontal and vertical
        const secondLastSegment = raw[raw.length - 2];
        const deltaWidth = lastSegment.w - secondLastSegment.w;
        const deltaHeight = lastSegment.h - secondLastSegment.h;
        const length = secondLastSegment.l;
        
        // Calculate horizontal wall angle (based on width)
        const halfAngleRadH = Math.atan((deltaWidth / 2) / length);
        const calculatedWallAngleH = (halfAngleRadH * 180 / Math.PI) * 2;
        
        // Calculate vertical wall angle (based on height)
        const halfAngleRadV = Math.atan((deltaHeight / 2) / length);
        const calculatedWallAngleV = (halfAngleRadV * 180 / Math.PI) * 2;
        
        // Get expansion type from best-fit results instead of selector
        let expansionType = 'Conical';
        const bestFitText = bestFitResults.textContent;
        if (bestFitText && bestFitText.trim()) {
          // Parse best-fit results (format: "EXPO: 95% Fc:80 | HYPE: 88% Fc:90 T:0.5 | PARA: 10% Fc:625 | CONI: 0%")
          const expansionMap = {
            'EXPO': 'Exponential',
            'HYPE': 'Hypex',
            'PARA': 'Parabolic',
            'CONI': 'Conical'
          };
          
          let maxPercentage = -1;
          let bestExpansion = 'Conical';
          
          // Extract all percentages
          const matches = bestFitText.matchAll(/(EXPO|HYPE|PARA|CONI):\s*(\d+)%/gi);
          for (const match of matches) {
            const type = match[1].toUpperCase();
            const percentage = parseInt(match[2]);
            if (percentage > maxPercentage) {
              maxPercentage = percentage;
              bestExpansion = expansionMap[type] || 'Conical';
            }
          }
          
          if (maxPercentage >= 0) {
            expansionType = bestExpansion;
          }
        }
        // Fallback to selector if no best-fit available
        if (!bestFitText || !bestFitText.trim()) {
          const lawSelect = rootElement.querySelector('.graph-expansion-select[data-param="s"]');
          expansionType = lawSelect ? lawSelect.value : 'Conical';
        }
        
        // Calculate cutoff frequency (Fc = c / (4 * sqrt(S0)))
        const s0 = raw[0].w * raw[0].h; // Throat area in mm²
        const s0M = s0 / 1000000; // Convert to m²
        const cutoffFrequency = 344 / (4 * Math.sqrt(s0M)); // Use 344 m/s not C_SOUND (mm/s)
        
        const payload = {
          lastSegmentWidth,
          lastSegmentHeight,
          calculatedWallAngleH,
          calculatedWallAngleV,
          expansionType,
          cutoffFrequency
        };
        
        window.showTool('directivity', 'Directivity Calculator');
        
        setTimeout(() => {
          console.log('[Horn→Directivity] exporting data:', payload);
          window.panelEvents.dispatchEvent(
            new CustomEvent('export-to-directivity', { detail: payload })
          );
        }, 100);
      }
    }

    // ### NOUVELLE FONCTIONNALITÉ D'IMPORTATION ###
    function parseAndLoadCsv(csvContent) {
        const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return;
    
        let importedSegments = [];
    
        // Heuristique : vérifie la présence de virgules dans la première ligne pour déterminer le format
        if (lines[0].includes(',')) {
            // --- FORMAT 1: largeur,hauteur,longueur ---
            importedSegments = lines.map(line => {
                const parts = line.split(',').map(p => parseFloat(p.trim()));
                if (parts.length >= 3 && parts.slice(0, 3).every(p => isFinite(p))) {
                    return { w: parts[0], h: parts[1], l: parts[2] };
                }
                return null;
            }).filter(Boolean); // Supprime les lignes qui n'ont pas pu être analysées
    
            // La longueur du dernier segment doit être 0, car c'est la fin du pavillon
            if (importedSegments.length > 0) {
                importedSegments[importedSegments.length - 1].l = 0;
            }
    
        } else {
            // --- FORMAT 2: alternance surface (mm2) / longueur (mm) ---
            const values = lines.map(line => {
                const num = parseFloat(line);
                if (!isFinite(num)) return null;
                if (line.toLowerCase().includes('mm2')) return { type: 'area', value: num };
                if (line.toLowerCase().includes('mm')) return { type: 'length', value: num };
                return null;
            }).filter(Boolean);
    
            // Attend une séquence : Surface, Longueur, Surface, Longueur, ...
            if (values.length > 0 && values[0].type === 'area') {
                for (let i = 0; i < values.length; i++) {
                    if (values[i].type === 'area') {
                        const s = values[i].value;
                        const dim = Math.sqrt(s);
                        // La longueur est la valeur suivante, si elle existe et est de type 'longueur'
                        const l = (i + 1 < values.length && values[i + 1].type === 'length')
                            ? values[i + 1].value
                            : 0;
                        importedSegments.push({ w: dim, h: dim, l: l, s: s });
                    }
                }
            }
        }
    
        if (importedSegments.length > 0) {
            const finalSegments = importedSegments.slice(0, 20); // Limite à 20 segments
            segmentCount = finalSegments.length;
            segmentCountInput.value = segmentCount;
            
            // Réinitialise la table avant de charger les nouvelles données
            tableBody.querySelectorAll('input').forEach(input => input.value = '');
            
            updateTableUI(finalSegments);
            updateVisibleSegments();
            bestFitResults.textContent = ''; // Efface les résultats du Best-Fit après l'import
        } else {
            alert('Le fichier n\'a pas pu être analysé. Veuillez vérifier le format et le contenu.');
        }
    }

    importBtn.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.csv,.txt';
        fileInput.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = event => {
                parseAndLoadCsv(event.target.result);
            };
            reader.readAsText(file);
        };
        fileInput.click();
    });

    function updateExtraParamsUI() {
        const persistedParams = {};
        extraParamsContainer.querySelectorAll('input').forEach(input => {
            persistedParams[input.id] = input.value;
        });
        extraParamsContainer.innerHTML = '';
        const neededParams = new Set();
        ['w', 'h', 's'].forEach(param => {
            const selectElement = rootElement.querySelector(`.graph-expansion-select[data-param="${param}"]`);
            if (!selectElement) return;
            const type = selectElement.value;
            if (type === 'Hypex') { neededParams.add(`fc-${param}`); neededParams.add(`T-${param}`); }
            else if (type === 'Exponential' || type === 'Parabolic') { neededParams.add(`fc-${param}`); }
            else if (type === 'OS') { neededParams.add(`theta-${param}`); }
        });
        const paramLabels = { fc: 'Fc', T: 'T', theta: 'θ' };
        neededParams.forEach(p_key => {
            const [paramName, paramType] = p_key.split('-');
            const inputId = `param-input-${p_key}`; const label = paramLabels[paramName] || paramName;
            let defaultValue = '400';
            if (paramName === 'T') defaultValue = '1.0'; if (paramName === 'theta') defaultValue = '45';
            if (rootElement.querySelector(`.graph-expansion-select[data-param="${paramType}"]`)?.value === 'Hypex' && paramName === 'fc') defaultValue = '100';
            const value = persistedParams[inputId] ?? defaultValue;
            extraParamsContainer.innerHTML += `<div class="flex items-center space-x-1"><label for="${inputId}" class="text-sm font-bold">${label}(${paramType.toUpperCase()}):</label><input type="text" id="${inputId}" value="${value}" class="form-input form-input-sm w-16"></div>`;
        });
        extraParamsContainer.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', updateChart);
            enableInlineCalculation(input);
            enableMouseWheelAdjustment(input);
        });
    }

    function generateOsSeParamsUI() {
        const params = { L: 'L', k: 'k', r: 'r', t: 't', a: 'α', s: 's', q: 'q', n: 'n' };
        const defaults = { L: '170', k: '1', r: '18', t: '5', a: '40', s: '0.7', q: '0.996', n: '5' };
        const constraints = {
            k: { min: 1, max: 10, step: 0.1 },
            a: { min: 0, max: 90, step: 1 },
            s: { min: 0, max: 2, step: 0.1 },
            q: { min: 0.99, max: 1, step: 0.001 },
            n: { min: 2, max: 10, step: 1 },
            L: { min: 0, max: 1000, step: 10 },
            r: { min: 1, max: 200, step: 1 },
            t: { min: 0, max: 90, step: 1 }
        };

        osSeParamsContainer.innerHTML = Object.entries(params).map(([key, label]) => {
            const c = constraints[key] || {};
            const minAttr = c.min !== undefined ? `min="${c.min}"` : '';
            const maxAttr = c.max !== undefined ? `max="${c.max}"` : '';
            const stepAttr = c.step !== undefined ? `step="${c.step}"` : '';
            return `
            <div class="flex items-center space-x-1">
                <label for="os-se-param-${key}" class="text-sm font-bold">${label}:</label>
                <input type="text" id="os-se-param-${key}" value="${defaults[key]}" class="form-input form-input-sm w-20" ${minAttr} ${maxAttr} ${stepAttr}>
            </div>
        `}).join('');

        osSeParamsContainer.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', updateChart);
            enableInlineCalculation(input);
            enableMouseWheelAdjustment(input);
        });
    }
    
    function generateIdealCurve(param) {
        if (param === 'os-se') {
            const opts = {};
            ['L', 'k', 'r', 't', 'a', 's', 'q', 'n'].forEach(key => {
                opts[key] = parseFloat(rootElement.querySelector(`#os-se-param-${key}`)?.value) || 0;
            });
            if (opts.L <= 0) return [];
            const idealPoints = [];
            const steps = 100;
            for (let i = 0; i <= steps; i++) {
                const x = (i / steps) * opts.L;
                const y_val_dim = dimensionFormulas['OS-SE'](x, opts.L, opts);
                const y_val_surf = Math.PI * Math.pow(y_val_dim, 2);
                if (isFinite(y_val_surf)) idealPoints.push({ x, y: y_val_surf });
            }
            return idealPoints;
        }
    
        const select = rootElement.querySelector(`.graph-expansion-select[data-param="${param}"]`);
        if (!select) return [];
        const type = select.value;
        if (expansionFormulas[type]) {
            const allSegments = getTableData(true);
            if (allSegments.length === 0) return [];
            if (allSegments.length < 2 && yAxisMode !== 'os-se') return [];

            const totalLength = allSegments.reduce((acc, seg) => acc + seg.l, 0);
            if (totalLength <= 0) return [];

            const startSegment = allSegments[0];
            const endSegment = allSegments[allSegments.length - 1];
            const startVal = (param === 's') ? startSegment.s : (param === 'w' ? startSegment.w : startSegment.h);
            const endVal = (param === 's') ? endSegment.s : (param === 'w' ? endSegment.w : endSegment.h);
            if (startVal <= 0) return [];

            const s0 = (param === 's') ? startVal : startVal * startVal;
            const sL = (param === 's') ? endVal : endVal * endVal;
            const opts = {};

            if (type === 'Hypex') { opts.fc = parseFloat(rootElement.querySelector(`#param-input-fc-${param}`)?.value) || 100; opts.T = parseFloat(rootElement.querySelector(`#param-input-T-${param}`)?.value) || 1.0; }
            else if (type === 'Exponential' || type === 'Parabolic') { opts.fc = parseFloat(rootElement.querySelector(`#param-input-fc-${param}`)?.value) || 400; }
            else if (type === 'OS') { opts.theta = parseFloat(rootElement.querySelector(`#param-input-theta-${param}`)?.value) || 45; }

            const idealSurfaceCurve = generateIdealCurveFor(type, s0, sL, totalLength, opts);
            const points = idealSurfaceCurve.map(point => {
                const y_val_mm = (param === 's') ? point.y : Math.sqrt(point.y);
                return { x: point.x, y: y_val_mm };
            });
            return points.filter(p => isFinite(p.y));
        }
        return [];
    }

    function insertSegment(index, before = false) {
      if (segmentCount >= 20) return;
      const rows = Array.from(tableBody.querySelectorAll('.segment-row'));
      const values = [];
      for (let i = 0; i < segmentCount; i++) {
        values.push({
          w: rows[i].querySelector('.segment-w').value,
          h: rows[i].querySelector('.segment-h').value,
          l: rows[i].querySelector('.segment-l').value,
          s: rows[i].querySelector('.segment-s-input').value
        });
      }
      const insertionPoint = before ? index : index + 1;
      values.splice(insertionPoint, 0, { w: '', h: '', l: '', s: '' });
      segmentCount++; segmentCountInput.value = segmentCount;
    
      rows.forEach((row, i) => {
        if (i < values.length) {
          row.querySelector('.segment-w').value = values[i].w;
          row.querySelector('.segment-h').value = values[i].h;
          row.querySelector('.segment-l').value = values[i].l;
          row.querySelector('.segment-s-input').value = values[i].s;
        }
      });
      updateVisibleSegments();
    }

    function deleteSegment(index) {
        if (segmentCount <= 1) return;
        const rows = Array.from(tableBody.querySelectorAll('.segment-row'));
        const kept = [];
        for (let i = 0; i < segmentCount; i++) {
            if (i === index) continue;
            kept.push({
            w: rows[i].querySelector('.segment-w').value,
            h: rows[i].querySelector('.segment-h').value,
            l: rows[i].querySelector('.segment-l').value,
            s: rows[i].querySelector('.segment-s-input').value
            });
        }
        segmentCount--; segmentCountInput.value = segmentCount; focusedRowIndex = -1;
        rows.forEach((row, i) => {
            if (i < kept.length) {
            row.querySelector('.segment-w').value = kept[i].w;
            row.querySelector('.segment-h').value = kept[i].h;
            row.querySelector('.segment-l').value = kept[i].l;
            row.querySelector('.segment-s-input').value = kept[i].s;
            } else {
            row.querySelector('.segment-w').value = '';
            row.querySelector('.segment-h').value = '';
            row.querySelector('.segment-l').value = '';
            row.querySelector('.segment-s-input').value = '';
            }
        });
        updateVisibleSegments();
    }

    function updateVisibleSegments() { 
        tableBody.querySelectorAll('.segment-row').forEach((row, i) => { row.style.display = i < segmentCount ? 'table-row' : 'none'; });
        updateSegmentsState();
    }

    function updateSegmentsState() {
        const rows = tableBody.querySelectorAll('.segment-row');
        for (let i = 0; i < segmentCount; i++) {
            const row = rows[i]; if(!row) continue;
            const lengthInput = row.querySelector('.segment-l');
            lengthInput.disabled = (i === segmentCount - 1);
            if (i === segmentCount - 1) lengthInput.value = '';
        }
        updateChart();
    }

    function getTableData(getRawSegments = false) {
        const data = { w: [], h: [], s: [], totalL: 0 }; const rawSegments = []; let cumulativeL = 0;
        for (let i = 0; i < segmentCount; i++) {
            const row = tableBody.querySelector(`tr[data-index="${i}"]`); if (!row || row.style.display === 'none') continue;
            const w_mm = convertToMm(parseFloat(row.querySelector('.segment-w').value) || 0, currentUnit);
            const h_mm = convertToMm(parseFloat(row.querySelector('.segment-h').value) || 0, currentUnit);
            const l_mm = (i === segmentCount - 1) ? 0 : (convertToMm(parseFloat(row.querySelector('.segment-l').value) || 0, currentUnit));
            const s_mm2 = w_mm * h_mm;
            rawSegments.push({ index: i, w: w_mm, h: h_mm, l: l_mm, s: s_mm2, cumulativeL });
            data.w.push({ x: cumulativeL, y: w_mm }); data.h.push({ x: cumulativeL, y: h_mm });
            data.s.push({ x: cumulativeL, y: s_mm2 }); cumulativeL += l_mm;
        }
        data.totalL = cumulativeL;
        if (segmentCount > 0 && rawSegments.length > 0) {
            const lastSegment = rawSegments[rawSegments.length - 1];
            data.w.push({ x: cumulativeL, y: lastSegment.w }); data.h.push({ x: cumulativeL, y: lastSegment.h });
            data.s.push({ x: cumulativeL, y: lastSegment.s });
        }
        return getRawSegments ? rawSegments : data;
    }

    function updateTableUI(segmentsData) {
        const surfFactor = getSurfaceFactor(currentUnit);
        tableBody.querySelectorAll('.segment-row').forEach((row, i) => {
            if (i < segmentsData.length) {
                const segData = segmentsData[i];
                row.querySelector('.segment-w').value = segData.w ? convertFromMm(segData.w, currentUnit).toFixed(1) : '';
                row.querySelector('.segment-h').value = segData.h ? convertFromMm(segData.h, currentUnit).toFixed(1) : '';
                if (i < segmentsData.length - 1) {
                    row.querySelector('.segment-l').value = segData.l ? convertFromMm(segData.l, currentUnit).toFixed(1) : '';
                } else { row.querySelector('.segment-l').value = ''; }
                const surfaceValue = segData.w * segData.h;
                row.querySelector('.segment-s-input').value = surfaceValue ? (surfaceValue / surfFactor).toFixed(0) : '';
            }
        });
    }

    function updateChart() {
        if (!mainChart) return;
        
        const idealCurveOsSe = generateIdealCurve('os-se');
        const data = getTableData();
        const idealCurveW = generateIdealCurve('w');
        const idealCurveH = generateIdealCurve('h');
        const idealCurveS = generateIdealCurve('s');

        let maxX = data.totalL;
        if (yAxisMode === 'os-se') {
            maxX = parseFloat(rootElement.querySelector('#os-se-param-L')?.value) || data.totalL;
        }
        
        const displayFactor = currentUnit === 'cm' ? 0.1 : 1;
        const displaySurfFactor = getSurfaceFactor(currentUnit);

        mainChart.options.scales.x.max = maxX * displayFactor;
        
        mainChart.data.datasets[0].data = data.w.map(p => ({ x: p.x * displayFactor, y: p.y * displayFactor }));
        mainChart.data.datasets[1].data = idealCurveW.map(p => ({ x: p.x * displayFactor, y: p.y * displayFactor }));
        mainChart.data.datasets[2].data = data.h.map(p => ({ x: p.x * displayFactor, y: p.y * displayFactor }));
        mainChart.data.datasets[3].data = idealCurveH.map(p => ({ x: p.x * displayFactor, y: p.y * displayFactor }));
        mainChart.data.datasets[4].data = data.s.map(p => ({ x: p.x * displayFactor, y: p.y / displaySurfFactor }));
        mainChart.data.datasets[5].data = idealCurveS.map(p => ({ x: p.x * displayFactor, y: p.y / displaySurfFactor }));
        mainChart.data.datasets[6].data = idealCurveOsSe.map(p => ({ x: p.x * displayFactor, y: p.y / displaySurfFactor }));

        const useProximityTooltip = true;
        if (mainChart.options?.interaction) {
            mainChart.options.interaction.intersect = useProximityTooltip;
            mainChart.options.interaction.mode = 'nearest';
        } else {
            mainChart.options.interaction = { mode: 'nearest', intersect: useProximityTooltip };
        }
        if (mainChart.options?.plugins?.tooltip) {
            mainChart.options.plugins.tooltip.intersect = useProximityTooltip;
            mainChart.options.plugins.tooltip.mode = 'nearest';
        }

        const xScale = mainChart.scales?.x;
        if (xScale) {
            const oneCmInDisplayUnits = currentUnit === 'cm' ? 1 : 10;
            const thresholdPx = Math.abs(xScale.getPixelForValue(oneCmInDisplayUnits) - xScale.getPixelForValue(0));
            const hitRadiusPx = Math.max(6, Math.min(40, thresholdPx));
            const targetDatasets = [0, 1, 2, 3, 4, 5, 6];
            targetDatasets.forEach(idx => {
                const ds = mainChart.data.datasets[idx];
                if (!ds) return;
                ds.pointHitRadius = hitRadiusPx;
                ds.hitRadius = hitRadiusPx;
                ds.hoverRadius = Math.max(6, Math.min(16, hitRadiusPx));
            });
        }

        const relevantDatasetsForMode = {
            'dim': [0, 1, 2, 3],
            'surf': [4, 5, 6],
            'os-se': [4, 5, 6] 
        };

        datasetVisibility.forEach((userWantsVisible, i) => {
            const isRelevant = relevantDatasetsForMode[yAxisMode].includes(i);
            const finalVisibility = userWantsVisible && isRelevant;
            mainChart.setDatasetVisibility(i, finalVisibility);
        });

        mainChart.update('none');
    }

    function clearValues() {
        tableBody.querySelectorAll('input').forEach(input => input.value = '');
        segmentCount = 6; segmentCountInput.value = 6; bestFitResults.textContent = '';
        updateVisibleSegments();
    }
    
    function applyDefaultValues() {
        segmentCount = defaultSegments.length; segmentCountInput.value = segmentCount;
        updateTableUI(defaultSegments); updateVisibleSegments(); 
    }

    function customLegendClickHandler(e, legendItem) {
        datasetVisibility[legendItem.datasetIndex] = !datasetVisibility[legendItem.datasetIndex];
        
        // Sauvegarder l'état de visibilité dans la variable globale appropriée
        if (yAxisMode === 'os-se') {
            window.hornDatasetVisibilityOsSe = [...datasetVisibility];
        } else {
            window.hornDatasetVisibilityNormal = [...datasetVisibility];
        }
        
        updateChart();
    }

    function createChart() {
        if (mainChart) {
            mainChart.destroy();
        }
        const yDimUnitLabel = `Dimensions (${currentUnit})`; 
        const ySurfUnitLabel = `Area (${currentUnit}²)`;
        const dimUnitLabel = currentUnit;
        const surfUnitLabel = `${currentUnit}²`;
        const xUnitLabel = `Length (${currentUnit})`;
        const canvas = rootElement.querySelector('#main-chart');

        mainChart = new Chart(canvas, { 
            type: 'line', 
            data: { 
                datasets: [ 
                    { label: 'Width', data: [], borderColor: chartColors.w, tension: 0, pointStyle: 'circle', radius: 4, yAxisID: 'yDimensions' }, 
                    { label: 'Ideal (W)', data: [], borderColor: chartColors.w, borderDash: [5, 5], pointRadius: 2, yAxisID: 'yDimensions' }, 
                    { label: 'Height', data: [], borderColor: chartColors.h, tension: 0, pointStyle: 'circle', radius: 4, yAxisID: 'yDimensions' }, 
                    { label: 'Ideal (H)', data: [], borderColor: chartColors.h, borderDash: [5, 5], pointRadius: 2, yAxisID: 'yDimensions' }, 
                    { label: 'Area', data: [], borderColor: chartColors.s, tension: 0, pointStyle: 'circle', radius: 4, yAxisID: 'ySurface' }, 
                    { label: 'Ideal (Area)', data: [], borderColor: chartColors.s, borderDash: [5, 5], pointRadius: 2, yAxisID: 'ySurface' },
                    { 
                        label: 'OS-SE', 
                        data: [], 
                        borderColor: chartColors.os, 
                        borderWidth: 2,
                        tension: 0.1, 
                        pointStyle: 'line', 
                        radius: 0,
                        pointHitRadius: 20,
                        hitRadius: 20,
                        hoverRadius: 6,
                        yAxisID: 'ySurface'
                    }
                ]
            }, 
            options: { 
                responsive: true, maintainAspectRatio: false, 
                interaction: { mode: 'nearest', intersect: false },
                plugins: { 
                    legend: { position: 'top', labels: { color: '#a0aec0' }, onClick: customLegendClickHandler },
                    tooltip: {
                        mode: 'nearest',
                        intersect: false,
                        callbacks: {
                            label: (ctx) => {
                                const yVal = ctx.parsed?.y;
                                const unit = ctx.dataset?.yAxisID === 'ySurface' ? surfUnitLabel : dimUnitLabel;
                                if (!isFinite(yVal)) return ctx.dataset.label || '';

                                const xScale = ctx.chart?.scales?.x;
                                const caretX = ctx.chart?.tooltip?.caretX;
                                const xFromCursor = (xScale && isFinite(caretX)) ? xScale.getValueForPixel(caretX) : ctx.parsed?.x;
                                if (!isFinite(xFromCursor)) return ctx.dataset.label || '';

                                return `${ctx.dataset.label}: ${Math.round(yVal)} ${unit} @ ${Math.round(xFromCursor)} ${currentUnit}`;
                            }
                        }
                    }
                }, 
                scales: { 
                    x: { type: 'linear', title: { display: true, text: xUnitLabel, color: '#a0aec0' }, ticks: { color: '#a0aec0' }, grid: { color: '#2D3748' } }, 
                    yDimensions: { 
                        display: (yAxisMode === 'dim'),
                        type: 'linear', position: 'left',
                        ticks: { color: '#a0aec0' }, grid: { color: '#2D3748' },
                        title: { display: true, text: yDimUnitLabel, color: '#a0aec0' }
                    },
                    ySurface: { 
                        display: (yAxisMode === 'surf' || yAxisMode === 'os-se'),
                        type: 'linear', position: 'right', 
                        ticks: { color: chartColors.s }, grid: { drawOnChartArea: false }, 
                        title: { display: true, text: ySurfUnitLabel, color: chartColors.s} 
                    } 
                } 
            } 
        });
    }
    
    // ### MODIFIÉ : Gestion de l'UI et masquage des sélecteurs en mode OS-SE ###
    function setYAxisMode(mode) {
        if (!mainChart) return;
        
        // Sauvegarder l'état actuel dans la variable globale appropriée
        if (yAxisMode === 'os-se') {
            window.hornDatasetVisibilityOsSe = [...datasetVisibility];
        } else {
            window.hornDatasetVisibilityNormal = [...datasetVisibility];
        }
        
        yAxisMode = mode;
        const isOsSeMode = mode === 'os-se';
        
        // Charger l'état approprié pour le nouveau mode
        if (isOsSeMode) {
            datasetVisibility = [...window.hornDatasetVisibilityOsSe];
        } else {
            datasetVisibility = [...window.hornDatasetVisibilityNormal];
        }
        
        rootElement.querySelectorAll('.y-axis-toggle-btn').forEach(b => {
            b.classList.remove('bg-pink-700');
        });
        const activeButton = rootElement.querySelector(`.y-axis-toggle-btn[data-scale="${mode}"]`);
        if (activeButton) {
            activeButton.classList.add('bg-pink-700');
        }
        
        tableContainer.style.display = isOsSeMode ? 'none' : 'flex';
        osSeParamsContainer.style.display = isOsSeMode ? 'flex' : 'none';
        
        // MODIFICATION : Cache la boîte de sélection des lois en mode OS-SE
        if (isOsSeMode) {
            expansionSelectorsContainer.style.display = 'none'; // Caché
            bestFitContainer.style.display = 'none';
        } else {
            expansionSelectorsContainer.style.display = 'flex'; // Visible
            bestFitContainer.style.display = 'flex';
        }

        graphsContainer.classList.toggle('flex-grow', !isOsSeMode);
        graphsContainer.classList.toggle('h-full', isOsSeMode);
        
        createChart();
        updateChart();
    }
    
    function toggleGraphVisibility() {
        window.hornGraphVisible = !window.hornGraphVisible;
        
        if (window.hornGraphVisible) {
            // Montrer le graphique
            graphsContainer.style.display = 'flex';
            tableContainer.style.height = '280px';
            toggleGraphBtn.title = 'Hide Graph';
            toggleGraphArrow.style.transform = 'rotate(0deg)';
        } else {
            // Cacher le graphique
            graphsContainer.style.display = 'none';
            tableContainer.style.height = 'calc(100vh - 300px)';
            toggleGraphBtn.title = 'Show Graph';
            toggleGraphArrow.style.transform = 'rotate(180deg)';
        }
        // S'assurer que les contrôles de segments restent visibles
        if (segmentControls) {
            segmentControls.style.display = 'flex';
        }
    }
    
    // Appliquer l'état initial au chargement
    function applyInitialGraphState() {
        if (!window.hornGraphVisible) {
            graphsContainer.style.display = 'none';
            tableContainer.style.height = 'calc(100vh - 300px)';
            toggleGraphBtn.title = 'Show Graph';
            toggleGraphArrow.style.transform = 'rotate(180deg)';
        }
        // S'assurer que les contrôles de segments sont toujours visibles
        if (segmentControls) {
            segmentControls.style.display = 'flex';
        }
    }
    
    function findBestFit() {
        bestFitResults.textContent = 'Analyzing...';
        setTimeout(() => {
            const rawSurfaceData = getTableData().s;
            if (rawSurfaceData.length < 2) { bestFitResults.textContent = "Error: at least 2 segments required."; return; }
            const offsetX = rawSurfaceData[0].x;
            const realPoints = rawSurfaceData.map(p => ({ x: p.x - offsetX, y: p.y }));
            const s0 = realPoints[0].y;
            const sL = realPoints[realPoints.length - 1].y;
            const L = realPoints[realPoints.length - 1].x;
            if (s0 <= 0 || L <= 0) { bestFitResults.textContent = "Error: S0 and L > 0 required."; return; }
            let results = [];
            results.push({ profile: 'Conical', error: calculateFitError(realPoints, generateIdealCurveFor('Conical', s0, sL, L, {})), params: {} });
            let bestExpo = { error: Infinity, fc: null };
            for (let fc = 50; fc <= 1500; fc += 5) {
                const error = calculateFitError(realPoints, generateIdealCurveFor('Exponential', s0, sL, L, { fc }));
                if (error < bestExpo.error) bestExpo = { error, fc };
            }
            results.push({ profile: 'Exponential', error: bestExpo.error, params: { Fc: bestExpo.fc }});
            let bestPara = { error: Infinity, fc: null };
            for (let fc = 50; fc <= 1500; fc += 5) {
                const error = calculateFitError(realPoints, generateIdealCurveFor('Parabolic', s0, sL, L, { fc }));
                if (error < bestPara.error) bestPara = { error, fc };
            }
            results.push({ profile: 'Parabolic', error: bestPara.error, params: { Fc: bestPara.fc }});
            let bestHypex = { error: Infinity, fc: null, T: null };
            for (let fc = 50; fc <= 1500; fc += 20) {
                for (let T = 0.5; T <= 1.5; T += 0.1) {
                    const t_fixed = parseFloat(T.toFixed(1));
                    const error = calculateFitError(realPoints, generateIdealCurveFor('Hypex', s0, sL, L, { fc, T: t_fixed }));
                    if (error < bestHypex.error) bestHypex = { error, fc, T: t_fixed };
                }
            }
            results.push({ profile: 'Hypex', error: bestHypex.error, params: { Fc: bestHypex.fc, T: bestHypex.T }});
            results.sort((a, b) => a.error - b.error);
            const maxError = Math.max(...results.filter(r => isFinite(r.error) && r.error > 0).map(r => r.error));
            const resultsString = results.map(res => {
                const score = isFinite(res.error) ? Math.max(0, (1 - (res.error / (maxError + 1e-9))) * 100) : 0;
                let paramsString = ""; if (res.params.Fc) paramsString += ` Fc:${res.params.Fc}`; if (res.params.T) paramsString += ` T:${res.params.T}`;
                return `${res.profile.substring(0,4).toUpperCase()}: ${score.toFixed(0)}%${paramsString}`;
            }).join(' | ');
            bestFitResults.textContent = resultsString;
        }, 10);
    }

    function calculateFitError(realPoints, idealPoints) {
        if (realPoints.length < 2 || idealPoints.length < 2) return Infinity;
        let sumOfSquares = 0; let pointsCompared = 0;
        for (const realPoint of realPoints) {
            let p1 = null, p2 = null;
            for (let i = 0; i < idealPoints.length - 1; i++) {
                if (idealPoints[i].x <= realPoint.x && realPoint.x <= idealPoints[i + 1].x) {
                    p1 = idealPoints[i]; p2 = idealPoints[i + 1]; break;
                }
            }
            if (p1 && p2) {
                let idealY; const dx = p2.x - p1.x;
                if (dx === 0) { idealY = p1.y; } else {
                    const t = (realPoint.x - p1.x) / dx; idealY = p1.y + t * (p2.y - p1.y);
                }
                if(isFinite(idealY)) {
                    const error = realPoint.y - idealY; sumOfSquares += error * error; pointsCompared++;
                }
            }
        }
        if (pointsCompared === 0) return Infinity;
        return Math.sqrt(sumOfSquares / pointsCompared);
    }
    
    function generateIdealCurveFor(type, s0, sL, L, opts) {
        const formula = expansionFormulas[type]; if (!formula || s0 <= 0 || L <= 0) return [];
        const steps = 50; const idealPoints = [];
        for (let i = 0; i <= steps; i++) {
            const x_relative = (i / steps) * L;
            const calculatedArea = formula(s0, sL, L, x_relative, opts);
            if (isFinite(calculatedArea)) { idealPoints.push({ x: x_relative, y: calculatedArea }); }
        }
        return idealPoints;
    }
    
    exportToBtn.addEventListener('click', () => { exportOptions.classList.toggle('hidden'); });
    exportOptions.addEventListener('click', (e) => {
        e.preventDefault(); const target = e.target.closest('a');
        if (target && target.dataset.target) { handleExport(target.dataset.target); }
    });
    document.addEventListener('click', (e) => {
        if (!exportToBtn.contains(e.target)) { exportOptions.classList.add('hidden'); }
    });
    
    segmentCountInput.addEventListener('input', () => { segmentCount = Math.max(1, Math.min(20, parseInt(segmentCountInput.value, 10) || 1)); segmentCountInput.value = segmentCount; updateVisibleSegments(); });
    clearBtn.addEventListener('click', clearValues);
    bestFitBtn.addEventListener('click', findBestFit);
    toggleGraphBtn.addEventListener('click', toggleGraphVisibility);
    
    tableBody.addEventListener('input', e => {
        if (!e.target.matches('input')) return;
        bestFitResults.textContent = ''; const input = e.target;
        const row = input.closest('.segment-row'); if (!row) return;
        const wInput = row.querySelector('.segment-w'); const hInput = row.querySelector('.segment-h');
        const sInput = row.querySelector('.segment-s-input'); const changedCol = input.dataset.col;
        
        if (changedCol === 'w' || changedCol === 'h') {
            const w = convertToMm(parseFloat(wInput.value) || 0, currentUnit);
            const h = convertToMm(parseFloat(hInput.value) || 0, currentUnit);
            sInput.value = (w * h / getSurfaceFactor(currentUnit)).toFixed(0);
        } else if (changedCol === 's') {
            const s_unit = parseFloat(sInput.value) || 0;
            const s_mm2 = s_unit * getSurfaceFactor(currentUnit);
            const w_mm = convertToMm(parseFloat(wInput.value) || 0, currentUnit);
            const h_mm = convertToMm(parseFloat(hInput.value) || 0, currentUnit);
            if (s_mm2 > 0) {
                if (w_mm > 0 && h_mm > 0) {
                    const ratio = w_mm / h_mm; const new_h = Math.sqrt(s_mm2 / ratio); const new_w = new_h * ratio;
                    wInput.value = convertFromMm(new_w, currentUnit).toFixed(1);
                    hInput.value = convertFromMm(new_h, currentUnit).toFixed(1);
                } else {
                    const dim = Math.sqrt(s_mm2);
                    wInput.value = convertFromMm(dim, currentUnit).toFixed(1);
                    hInput.value = convertFromMm(dim, currentUnit).toFixed(1);
                }
            }
        }
        updateChart();
    });

    tableBody.addEventListener('focusin', e => { const row = e.target.closest('.segment-row'); if(row) { focusedRowIndex = parseInt(row.dataset.index, 10); } });
    graphsContainer.addEventListener('change', e => { if (e.target.classList.contains('graph-expansion-select')) { updateExtraParamsUI(); updateChart(); } });
    graphsContainer.addEventListener('click', e => { if (e.target.classList.contains('y-axis-toggle-btn')) { setYAxisMode(e.target.dataset.scale); } });
    unitSwitchBtn.addEventListener('click', () => {
        const dataInMm = getTableData(true);
        currentUnit = currentUnit === 'mm' ? 'cm' : 'mm';
        unitSwitchBtn.textContent = currentUnit;
        const dimUnitLabel = `(${currentUnit})`; const surfUnitLabel = `(${currentUnit}²)`;
        rootElement.querySelectorAll('[data-unit-label="dim"]').forEach(el => el.textContent = el.textContent.split('(')[0] + dimUnitLabel);
        rootElement.querySelectorAll('[data-unit-label="surf"]').forEach(el => el.textContent = el.textContent.split('(')[0] + surfUnitLabel);
        updateTableUI(dataInMm);
        createChart();
        updateChart();
    });

    deleteSegmentBtn.addEventListener('click', () => {
        if (focusedRowIndex > -1) deleteSegment(focusedRowIndex);
        else if (segmentCount > 1) deleteSegment(segmentCount - 1);
    });
    insertBeforeBtn.addEventListener('click', () => {
        if (focusedRowIndex > -1) insertSegment(focusedRowIndex, true);
    });
    insertAfterBtn.addEventListener('click', () => {
        if (focusedRowIndex > -1) insertSegment(focusedRowIndex, false);
    });

    tableBody.addEventListener('keydown', e => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        if (!e.target.matches('input')) return;
        e.preventDefault();
        const currentInput = e.target; const currentRow = currentInput.closest('tr');
        const currentIndex = parseInt(currentRow.dataset.index, 10);
        const currentCol = currentInput.dataset.col;
        const colsOrder = ['w', 'h', 'l', 's'];
        const currentColIndex = colsOrder.indexOf(currentCol);
        let nextRow = currentIndex; let nextColIndex = currentColIndex;
        switch(e.key) {
            case 'ArrowUp':   nextRow = Math.max(0, currentIndex - 1); break;
            case 'ArrowDown': nextRow = Math.min(segmentCount - 1, currentIndex + 1); break;
            case 'ArrowLeft':  nextColIndex = Math.max(0, currentColIndex - 1); break;
            case 'ArrowRight': nextColIndex = Math.min(colsOrder.length - 1, currentColIndex + 1); break;
        }
        const nextInput = tableBody.querySelector(`tr[data-index="${nextRow}"] input[data-col="${colsOrder[nextColIndex]}"]`);
        if (nextInput && !nextInput.disabled) { nextInput.focus(); nextInput.select(); }
    });
    
    createChart();
    applyDefaultValues();
    updateExtraParamsUI();
    generateOsSeParamsUI();
    setYAxisMode('dim');
    applyInitialGraphState();
    
    const allCalculableInputs = Array.from(rootElement.querySelectorAll('input[type="text"]'));
    allCalculableInputs.forEach(input => {
        if (input && input.id !== 'horn-driver-search') {
            enableInlineCalculation(input);
        }
    });
}