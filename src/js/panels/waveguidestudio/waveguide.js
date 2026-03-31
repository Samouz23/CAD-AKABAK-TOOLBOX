// ====================================================================================================
// FICHIER :  waveguide.js (VERSION REFACTORISEE - ORCHESTRATEUR)
// ROLE :     Orchestre les modules du waveguide studio.
// ====================================================================================================

import * as Renderer from './waveguideRenderer.js';
import { validateWaveguideConfig } from './config.js';
import { getWaveguidePanelHtml } from './uiTemplates.js';
import { getConfigFromUI, createProfileData } from './profileGenerator.js';
import * as Exporters from './exporters.js';
import * as EventHandlers from './eventHandlers.js';

export { getWaveguidePanelHtml };

const state = { chart2D: null, hotkeySettings: {}, lastConfig: {}, lastVertices: [] };
const dom = {};

export function initializeWaveguidePanel(rootElement) {
    queryDOMElements(rootElement);
    Renderer.initThreeJS(dom.wgPreviewContainer);
    init2DChart();
    
    const hotkeyHandler = EventHandlers.createHotkeyHandler(state, dom);
    
    const callbacks = {
        handleGenericInputChange: (event) => {
            if (event.target.closest('#superformula-group')) EventHandlers.update2DChart(state, dom);
            if (event.target.tagName === 'SELECT') updateUI();
            generateAndRenderWaveguide();
        },
        updateVisibility: () => Renderer.updateVisibility(dom.wgShowSurface.checked, dom.wgShowPoints.checked),
        resetToDefaults,
        closeExportModal: () => dom.wgExportModalOverlay.classList.add('hidden'),
        exportSTL: () => Exporters.exportSTL(Renderer.getGeometries, state.lastConfig, dom.wgExportStlModalBtn),
        exportCSV: () => Exporters.exportCSV(Renderer.getGeometries, dom.wgExportCsvFullModalBtn),
        exportProfileCSV: () => Exporters.exportProfileCSV(Renderer.getGeometries, state.lastConfig, dom.wgExportCsvProfileModalBtn),
        exportMSH: () => Exporters.exportMSH(Renderer.getGeometries, state.lastConfig, dom.wgBuildInterface.checked, dom.wgExportMshModalBtn),
        applyImportedParams: (params) => EventHandlers.applyImportedParams(params, dom, updateUI, generateAndRenderWaveguide)
    };
    
    EventHandlers.initEventListeners(rootElement, dom, callbacks);
    EventHandlers.loadAndApplyHotkeys(state, dom, hotkeyHandler);
    initPresetListeners(rootElement);
    updateUI();
    
    setTimeout(() => {
        const panels = rootElement.querySelectorAll('.control-label-toggle+div');
        panels.forEach(p => { p.classList.add('no-transition'); p.offsetHeight; p.classList.remove('no-transition'); });
        generateAndRenderWaveguide();
        EventHandlers.update2DChart(state, dom);
    }, 150);
}

function queryDOMElements(root) {
    const ids = [
        'wg-error-container', 'wg-export-btn', 'wg-reset-btn', 'wg-show-points',
        'wg-show-surface', 'wg-build-interface', 'wg-split-horizontal', 'wg-split-vertical',
        'wg-d-in', 'wg-preview-container', 'wg-segment-count', 'wg-shape-switch',
        'wg-shape-params-container', 'wg-output-shape', 'wg-d-out-circle',
        'wg-export-modal-overlay', 'wg-export-modal-close-btn', 'wg-export-stl-modal-btn',
        'wg-export-csv-full-modal-btn', 'wg-export-csv-profile-modal-btn', 'wg-export-msh-modal-btn',
        'wg-lines', 'wg-points', 'wg-interface-mesh', 'wg-throat-cap-rings',
        'wg-source-angular-points', 'wg-source-axial-points',
        'wg-interface-angular-points', 'wg-interface-axial-points',
        'wg-shape-length', 'sf-m', 'sf-a', 'sf-b', 'sf-n1', 'sf-n2', 'sf-n3', 'sf-amplitude',
        'wg-throat-mesh-factor', 'wg-mouth-mesh-factor', 'interface-tip-offset',
        'interface-bulge-radius', 'interface-bulge-z', 'wg-w-out-calc', 'wg-h-out-calc',
        'wg-w-out-calc-rounded', 'wg-h-out-calc-rounded',
        'wg-input-shape', 'wg-d-in-circle', 'wg-d-in-rect-w', 'wg-d-in-rect-h',
        'wg-input-circle-container', 'wg-input-rect-container'
    ];
    ids.forEach(id => {
        const key = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
        dom[key] = root.querySelector(`#${id}`);
    });
    dom.root = root;
}

function init2DChart() {
    if (state.chart2D) state.chart2D.destroy();
    const ctx = dom.root.querySelector('#wg-2d-chart').getContext('2d');
    state.chart2D = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [{ data: [], borderColor: '#f472b6', borderWidth: 2, showLine: true, pointRadius: 0 }] },
        options: {
            responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: {
                x: { type: 'linear', position: 'center', ticks: { color: '#a0aec0' }, grid: { color: '#2D3748' } },
                y: { type: 'linear', position: 'center', ticks: { color: '#a0aec0' }, grid: { color: '#2D3748' } }
            }
        }
    });
}

function updateUI() {
    const segCount = parseInt(dom.wgSegmentCount.value);
    dom.root.querySelector('#wg-segment-1-params-wrapper').classList.remove('hidden');
    dom.root.querySelector('#wg-segment-2-params-wrapper').classList.toggle('hidden', segCount !== 2);
    toggleParamVisibility(1);
    if (segCount === 2) toggleParamVisibility(2);
    const outputShape = dom.wgOutputShape.value;
    dom.root.querySelector('#wg-segment-1-law-container').style.display = segCount === 1 ? 'contents' : 'none';
    dom.root.querySelector('#wg-segment-2-laws-container').style.display = segCount === 2 ? 'contents' : 'none';
    if (dom.wgShapeParamsContainer) dom.wgShapeParamsContainer.style.display = dom.wgShapeSwitch.checked ? 'contents' : 'none';
    dom.root.querySelector('#wg-output-circle-container').style.display = outputShape === 'circle' ? 'contents' : 'none';
    dom.root.querySelector('#wg-output-rect-container').style.display = outputShape === 'rectangle' ? 'contents' : 'none';
    dom.root.querySelector('#wg-output-rounded-rect-container').style.display = outputShape === 'rounded_rectangle' ? 'contents' : 'none';
    dom.root.querySelectorAll('.control-label-toggle').forEach(header => {
        const content = header.nextElementSibling;
        if (content && content.style.maxHeight && content.style.maxHeight !== '0px') content.style.maxHeight = content.scrollHeight + "px";
    });
    const inputShape = dom.root.querySelector('#wg-input-shape').value;
    dom.root.querySelector('#wg-input-circle-container').style.display = (inputShape === 'circle') ? 'contents' : 'none';
    dom.root.querySelector('#wg-input-rect-container').style.display   = (inputShape === 'rectangle') ? 'contents' : 'none';
}

function toggleParamVisibility(segIndex) {
    const segCount = parseInt(dom.wgSegmentCount.value);
    const lawSelector = segCount === 1 ? '#wg-expansion-law-1' : `#wg-expansion-law-2-${segIndex}`;
    const law = dom.root.querySelector(lawSelector).value;
    const wrapper = dom.root.querySelector(`#wg-segment-${segIndex}-params-wrapper`);
    if (!wrapper) return;
    wrapper.querySelectorAll('.control-group').forEach(el => el.classList.add('hidden'));
    const containerToShow = wrapper.querySelector(`#wg-${law.toLowerCase().replace(' ', '_')}-params-container-${segIndex}`);
    if (containerToShow) containerToShow.classList.remove('hidden');
}

function resetToDefaults() {
    dom.root.querySelectorAll('input[type="text"], input[type="checkbox"], select').forEach(el => {
        if (el.type === 'text') el.value = el.defaultValue;
        else if (el.type === 'checkbox') el.checked = el.defaultChecked;
        else if (el.tagName === 'SELECT') el.selectedIndex = 0;
    });
    updateUI(); 
    EventHandlers.update2DChart(state, dom); 
    generateAndRenderWaveguide();
}

function generateAndRenderWaveguide() {
    dom.wgErrorContainer.classList.add('hidden');
    dom.wgExportBtn.disabled = true;

    const config = getConfigFromUI(dom);
    state.lastConfig = config;

    const validationError = validateWaveguideConfig(config);
    if (validationError) {
        dom.wgErrorContainer.textContent = `Error: ${validationError}`;
        dom.wgErrorContainer.classList.remove('hidden');
        Renderer.clearScene();
        return;
    }
    
    const profileData = createProfileData(config);
    const { finalDimensions, vertices } = Renderer.generateAndDisplayWaveguide(config, profileData, dom.wgBuildInterface.checked, dom.root);
    state.lastVertices = vertices;

    dom.wgDOutCircle.value = (finalDimensions.width).toFixed(1);
    dom.wgWOutCalc.value = dom.wgWOutCalcRounded.value = finalDimensions.width.toFixed(1);
    dom.wgHOutCalc.value = dom.wgHOutCalcRounded.value = finalDimensions.height.toFixed(1);

    Renderer.updateVisibility(dom.wgShowSurface.checked, dom.wgShowPoints.checked);
    if (vertices.length > 0) dom.wgExportBtn.disabled = false;
}

// ====================================================================================================
// PRESETS : Save / Load / Delete waveguide configurations
// ====================================================================================================

function collectFormValues(root) {
    const values = {};
    root.querySelectorAll('input[type="text"], select, input[type="checkbox"]').forEach(el => {
        if (!el.id) return;
        if (el.type === 'checkbox') values[el.id] = el.checked;
        else values[el.id] = el.value;
    });
    return values;
}

function applyFormValues(root, values) {
    if (!values) return;
    for (const [id, val] of Object.entries(values)) {
        const el = root.querySelector(`#${CSS.escape(id)}`);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = val;
        else el.value = val;
    }
}

function initPresetListeners(rootElement) {
    const presetsBtn = rootElement.querySelector('#wg-presets-btn');
    const modalOverlay = rootElement.querySelector('#wg-presets-modal-overlay');
    const closeBtn = rootElement.querySelector('#wg-presets-panel-close');
    const saveBtn = rootElement.querySelector('#wg-preset-save-btn');
    const nameInput = rootElement.querySelector('#wg-preset-name-input');

    // Disable waveguide hotkeys while typing in the preset name input
    nameInput.addEventListener('focus', () => { state.presetsInputFocused = true; });
    nameInput.addEventListener('blur', () => { state.presetsInputFocused = false; });

    presetsBtn.addEventListener('click', () => {
        const isHidden = modalOverlay.classList.contains('hidden');
        modalOverlay.classList.toggle('hidden', !isHidden);
        if (isHidden) refreshPresetList(rootElement);
    });

    closeBtn.addEventListener('click', () => modalOverlay.classList.add('hidden'));
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.add('hidden'); });

    saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        const values = collectFormValues(rootElement);
        const preset = { name, values, savedAt: new Date().toISOString() };
        const result = await window.electronAPI.saveWaveguidePreset(preset);
        if (result.success) {
            nameInput.value = '';
            refreshPresetList(rootElement);
        }
    });

    // Block ALL keyboard events from propagating when input is focused
    ['keydown', 'keyup', 'keypress'].forEach(evtType => {
        nameInput.addEventListener(evtType, (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (evtType === 'keydown' && e.key === 'Enter') saveBtn.click();
        }, true);
    });
}

async function refreshPresetList(rootElement) {
    const listEl = rootElement.querySelector('#wg-presets-list');
    const presets = await window.electronAPI.getWaveguidePresets();

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
        loadBtn.addEventListener('click', async () => {
            const presetName = loadBtn.dataset.loadName;
            const preset = presets.find(p => p.name === presetName);
            if (!preset) return;
            applyFormValues(rootElement, preset.values);
            updateUI();
            EventHandlers.update2DChart(state, dom);
            generateAndRenderWaveguide();
            rootElement.querySelector('#wg-presets-modal-overlay').classList.add('hidden');
        });
    });

    listEl.querySelectorAll('.wg-preset-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const name = btn.dataset.deleteName;
            await window.electronAPI.deleteWaveguidePreset(name);
            refreshPresetList(rootElement);
        });
    });
}
