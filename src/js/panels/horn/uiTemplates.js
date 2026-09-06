// ====================================================================================================
// FICHIER :  src/js/panels/horn/uiTemplates.js
// RÔLE :     Génération des templates HTML pour le panneau Horn.
// ====================================================================================================

import { expansionTypes, chartColors } from './config.js';

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
    <div id="edit-view" class="p-6 text-green-400 h-full flex flex-col">
        <div class="flex justify-between items-center mb-4 flex-shrink-0">
            <div class="flex items-center space-x-4">
                <h1 class="text-4xl font-bold text-white">Horn Expansion</h1>
                <div class="flex items-center space-x-2">
                    <button class="horn-tab-btn action-btn text-sm px-4 py-1.5 bg-green-700" data-horn-tab="value">Value</button>
                    <button class="horn-tab-btn action-btn text-sm px-4 py-1.5" data-horn-tab="graph">Graph</button>
                    <button class="horn-tab-btn action-btn text-sm px-4 py-1.5" data-horn-tab="both">Both</button>
                </div>
            </div>
            <div class="flex items-center space-x-4">
                 <button id="unit-switch-btn" class="action-btn w-20">mm</button>
                 <div class="relative">
                    <button id="export-to-btn" class="action-btn">Export To..</button>
                    <div id="export-options" class="hidden absolute right-0 mt-2 w-48 bg-gray-900 border themed-border rounded-md shadow-lg z-20">
                        <a href="#" class="block px-4 py-2 text-sm text-gray-300 themed-hover-bg" data-target="akabak_lem">Akabak LEM</a>
                        <a href="#" class="block px-4 py-2 text-sm text-gray-300 themed-hover-bg" data-target="waveguide">Waveguide Studio</a>
                        <a href="#" class="block px-4 py-2 text-sm text-gray-300 themed-hover-bg" data-target="hornstudio">Horn Studio</a>
                    </div>
                 </div>
            </div>
        </div>
        
        <div class="flex-grow flex flex-col overflow-hidden space-y-4">
            <div id="main-content-area" class="flex flex-col flex-grow min-h-0 space-y-4">
                <div id="table-container" class="flex flex-col flex-grow min-h-0">
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
                </div>
            </div>
            
            <div id="graphs-container" class="flex-grow flex flex-col min-h-0">
                <div id="os-se-params-container" class="hidden items-center justify-center flex-wrap gap-x-4 gap-y-2 p-3 mb-2 bg-gray-900/50 border border-gray-700 rounded-md flex-shrink-0">
                </div>
                <div class="graph-widget-header flex justify-between items-center mb-2 flex-shrink-0">
                    
                    <div id="graph-controls-left" class="flex items-center space-x-4 flex-shrink-0">
                        <div id="expansion-selectors-container" class="flex items-center space-x-4 flex-shrink-0">
                            <div class="flex items-center space-x-2"><span class="font-bold" style="color:${chartColors.w};">Width:</span><select class="graph-expansion-select" data-param="w">${expansionOptionsHtml}</select></div>
                            <div class="flex items-center space-x-2"><span class="font-bold" style="color:${chartColors.h};">Height:</span><select class="graph-expansion-select" data-param="h">${expansionOptionsHtml}</select></div>
                            <div class="flex items-center space-x-2"><span class="font-bold" style="color:${chartColors.s};">Area:</span><select class="graph-expansion-select" data-param="s">${expansionOptionsHtml}</select></div>
                        </div>
                        <div id="extra-params-container" class="flex items-center space-x-2 flex-wrap gap-2"></div>
                    </div>

                    <div id="best-fit-container" class="flex-grow flex justify-center px-4">
                        <div id="best-fit-results" class="text-center text-xs text-gray-300 font-mono whitespace-pre-wrap p-2 border border-gray-700 rounded-md bg-gray-900/50 max-w-2xl"></div>
                    </div>

                    <div id="graph-controls-right" class="flex items-center space-x-2 flex-shrink-0">
                        <button data-scale="dim" class="y-axis-toggle-btn action-btn bg-pink-700">Dims</button>
                        <button data-scale="surf" class="y-axis-toggle-btn action-btn">Area</button>
                        <button data-scale="os-se" class="y-axis-toggle-btn action-btn">OS-SE</button>
                        <div class="border-l border-gray-600 pl-2 ml-2">
                             <button id="export-osse-csv-btn" class="action-btn">Export OS-SE CSV</button>
                             <button id="best-fit-btn" class="action-btn">Best-Fit</button>
                             <button id="clear-all-btn" class="action-btn ml-2">Clear</button>
                        </div>
                    </div>
                </div>
                <div class="relative flex-grow"><canvas id="main-chart"></canvas></div>
            </div>
        </div>
    </div>
    
    <div id="spacing-modal-overlay" class="hidden fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div class="bg-gray-900 border themed-border rounded-lg p-6 shadow-2xl w-80 relative text-white">
            <h2 class="text-xl font-bold mb-4 text-center">Point Spacing</h2>
            <p class="text-gray-300 text-sm mb-4 text-center">Enter spacing in mm (1mm = every 1mm)</p>
            <input id="spacing-input" type="number" min="0.1" step="0.1" value="2" class="form-input w-full mb-4">
            <div class="flex space-x-2">
                <button id="spacing-cancel-btn" class="action-btn flex-1 bg-gray-700">Cancel</button>
                <button id="spacing-ok-btn" class="action-btn flex-1 bg-green-700">Export</button>
            </div>
        </div>
    </div>

    <div id="wave-select-modal-overlay" class="hidden fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div class="bg-gray-900 border themed-border rounded-lg p-6 shadow-2xl w-80 relative text-white">
            <h2 class="text-xl font-bold mb-4 text-center">Export to Akabak LEM</h2>
            <p class="text-gray-300 text-sm mb-4 text-center">Select the wave to export the segments to</p>
            <div class="grid grid-cols-2 gap-2 mb-2">
                <button id="wave-select-front-btn" class="action-btn bg-green-700">Front Wave</button>
                <button id="wave-select-back-btn" class="action-btn bg-green-700">Back Wave</button>
            </div>
            <button id="wave-select-cancel-btn" class="action-btn w-full bg-gray-700">Cancel</button>
        </div>
    </div>
    </div>
    `;
}
