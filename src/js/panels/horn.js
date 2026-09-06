// ====================================================================================================
// FICHIER :  src/js/panels/horn.js (ORCHESTRATEUR - VERSION REFACTORISEE)
// ROLE :     Orchestre les modules du panneau Horn Expansion.
// ====================================================================================================

import { defaultVisibility } from './horn/config.js';
import { getHornPanelHtml } from './horn/uiTemplates.js';
import { safeEvaluateMath } from './horn/formulas.js';
import { getTableData, getSurfaceFactor, applyDefaultValues } from './horn/tableManager.js';
import { createChart, updateChart, setYAxisMode } from './horn/chart.js';
import { updateExtraParamsUI, generateOsSeParamsUI, enableInlineCalculation, bindAllEvents, initHornTabs } from './horn/eventHandlers.js';

export { getHornPanelHtml, safeEvaluateMath };

export function initializeHornPanel(rootElement) {
    // --- Etat global (conserve pendant la session, reset a la fermeture) ---
    if (!window.hornDatasetVisibilityNormal) {
        window.hornDatasetVisibilityNormal = [true, true, true, true, true, true, false];
    }
    if (!window.hornDatasetVisibilityOsSe) {
        window.hornDatasetVisibilityOsSe = [false, false, false, false, false, false, true];
    }

    // --- Objet State ---
    const state = {
        segmentCount: 6,
        mainChart: null,
        focusedRowIndex: -1,
        currentUnit: 'mm',
        yAxisMode: 'surf',
        datasetVisibility: [...window.hornDatasetVisibilityNormal],
    };

    // --- Objet DOM ---
    const dom = {
        rootElement,
        segmentCountInput:             rootElement.querySelector('#segment-count'),
        tableBody:                     rootElement.querySelector('#segments-table-body'),
        mainContentArea:               rootElement.querySelector('#main-content-area'),
        graphsContainer:               rootElement.querySelector('#graphs-container'),
        clearBtn:                      rootElement.querySelector('#clear-all-btn'),
        bestFitBtn:                    rootElement.querySelector('#best-fit-btn'),
        insertAfterBtn:                rootElement.querySelector('#insert-after-btn'),
        insertBeforeBtn:               rootElement.querySelector('#insert-before-btn'),
        deleteSegmentBtn:              rootElement.querySelector('#delete-segment-btn'),
        extraParamsContainer:          rootElement.querySelector('#extra-params-container'),
        bestFitResults:                rootElement.querySelector('#best-fit-results'),
        unitSwitchBtn:                 rootElement.querySelector('#unit-switch-btn'),
        exportToBtn:                   rootElement.querySelector('#export-to-btn'),
        exportOptions:                 rootElement.querySelector('#export-options'),
        exportOsSeCsvBtn:              rootElement.querySelector('#export-osse-csv-btn'),
        tableContainer:                rootElement.querySelector('#table-container'),
        osSeParamsContainer:           rootElement.querySelector('#os-se-params-container'),
        expansionSelectorsContainer:   rootElement.querySelector('#expansion-selectors-container'),
        bestFitContainer:              rootElement.querySelector('#best-fit-container'),
        graphControlsLeft:             rootElement.querySelector('#graph-controls-left'),
        graphControlsRight:            rootElement.querySelector('#graph-controls-right'),
        segmentControls:               rootElement.querySelector('#segment-controls'),
    };

    if (dom.exportOsSeCsvBtn) dom.exportOsSeCsvBtn.style.display = 'none';

    // --- Raccourcis sur state (utilises par les sous-modules) ---
    state.getTableData = (raw) => getTableData(raw, state, dom);
    state.getSurfaceFactor = getSurfaceFactor;

    // --- Callback de mise a jour du graphique ---
    const updateChartFn = () => updateChart(state, dom);

    // --- Initialisation ---
    createChart(state, dom);
    applyDefaultValues(state, dom, updateChartFn);
    updateExtraParamsUI(state, dom, updateChartFn);
    generateOsSeParamsUI(dom, updateChartFn);
    setYAxisMode('surf', state, dom);
    initHornTabs(state, dom);

    // --- Liaison de tous les evenements ---
    bindAllEvents(state, dom, updateChartFn);

    // --- Inline calculation sur tous les inputs texte ---
    rootElement.querySelectorAll('input[type="text"]').forEach(enableInlineCalculation);
}
