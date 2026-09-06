// =================================================================================
// FICHIER : src/js/panels/physics/power.js
// RÔLE    : Fichier principal du module Physics avec système d'onglets
// =================================================================================

import { isEnclosureCalculatorEnabled } from '../../../features.js';

import { getBasicCalculatorsHtml, initializeBasicCalculators } from './basicCalculators.js';
import { getSplCalculatorHtml, initializeSplCalculator } from './splCalculator.js';
import { getCrossoverCalculatorHtml, initializeCrossoverCalculator } from './crossoverCalculator.js';
import { getEnclosureCalculatorHtml, initializeEnclosureCalculator } from './enclosureCalculator.js';
import { showBasicCalculatorSelector } from '../../popup/basics/basicCalculators.js';

export function getPowerPanelHtml() {
  const arrowSVG = `<svg class="w-4 h-4 transition-transform duration-300 toggle-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
  
  return `
    <div class="p-6 text-green-400 h-full flex flex-col">
      <div class="flex justify-between items-center mb-6 flex-shrink-0">
        <h1 class="text-4xl font-bold text-white">Calculator</h1>
        <button id="pop-out-btn" data-tool="power" title="Open in a new window" class="btn btn--ghost p-2 ml-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </button>
      </div>

      <!-- Tabs Navigation -->
      <div class="flex space-x-2 mb-6 flex-shrink-0 border-b border-gray-700">
        <button class="physics-tab active px-4 py-2 font-semibold transition-all border-b-2 border-transparent hover:border-pink-600" data-tab="basic">
          Basic
        </button>
        <button class="physics-tab px-4 py-2 font-semibold transition-all border-b-2 border-transparent hover:border-pink-600" data-tab="spl">
          SPL
        </button>
        <button class="physics-tab px-4 py-2 font-semibold transition-all border-b-2 border-transparent hover:border-pink-600" data-tab="crossover">
          Crossover
        </button>
        ${isEnclosureCalculatorEnabled ? `
        <button class="physics-tab px-4 py-2 font-semibold transition-all border-b-2 border-transparent hover:border-pink-600" data-tab="enclosure">
          Enclosure
        </button>
        ` : ''}
      </div>

      <!-- Tab Contents -->
      <div id="physics-content" class="flex-grow overflow-y-auto pr-2">
        <div id="tab-basic" class="physics-tab-content active">
          ${getBasicCalculatorsHtml()}
        </div>
        <div id="tab-spl" class="physics-tab-content hidden">
          ${getSplCalculatorHtml()}
        </div>
        <div id="tab-crossover" class="physics-tab-content hidden">
          ${getCrossoverCalculatorHtml()}
        </div>
        ${isEnclosureCalculatorEnabled ? `
        <div id="tab-enclosure" class="physics-tab-content hidden">
          ${getEnclosureCalculatorHtml()}
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

export function initializePowerPanel() {
  // Rendre la fonction popup accessible globalement
  window.showBasicCalculatorSelector = showBasicCalculatorSelector;

  // Initialize tab switching
  const tabs = document.querySelectorAll('.physics-tab');
  const tabContents = document.querySelectorAll('.physics-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Update active states
      tabs.forEach(t => t.classList.remove('active', 'border-pink-600', 'text-pink-600'));
      tab.classList.add('active', 'border-pink-600', 'text-pink-600');
      
      // Show/hide content
      tabContents.forEach(content => {
        if (content.id === `tab-${targetTab}`) {
          content.classList.remove('hidden');
          content.classList.add('active');
        } else {
          content.classList.add('hidden');
          content.classList.remove('active');
        }
      });
    });
  });

  // Initialize all calculator modules
  initializeBasicCalculators();
  initializeSplCalculator();
  initializeCrossoverCalculator();
  if (isEnclosureCalculatorEnabled) {
    initializeEnclosureCalculator();
  }
}
