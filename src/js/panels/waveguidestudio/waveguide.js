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
import {
    initializeBemSolverPanel,
    importBemMeshContent,
    rerunBemSolver,
    hasCompletedBemSimulation,
    refreshBemGraphs,
} from '../bemsolver/bemSolver.js';

export { getWaveguidePanelHtml };

const state = {
    chart2D: null, hotkeySettings: {}, lastConfig: {}, lastVertices: [], activeTab: 'view3d',
    lastProfileH: null, lastProfileV: null, lastFinalDimensions: null,
    solverSync: false, solverSyncTimer: null, solverSyncRunning: false, solverSyncPending: false,
};
const dom = {};

const activeGeometries = () => Renderer.getGeometries();

export function initializeWaveguidePanel(rootElement) {
    queryDOMElements(rootElement);
    initTabs(rootElement);
    Renderer.initThreeJS(dom.wgPreviewContainer);
    init2DChart();
    initializeBemSolverPanel(rootElement);
    const solverSyncToggle = rootElement.querySelector('#wg-solver-sync');
    solverSyncToggle?.addEventListener('change', () => {
        if (solverSyncToggle.checked && !hasCompletedBemSimulation()) {
            solverSyncToggle.checked = false;
            setSolverSyncStatus('Run the first simulation manually in Solver.', true);
            return;
        }
        state.solverSync = solverSyncToggle.checked;
        setSolverSyncStatus(state.solverSync ? 'Sync enabled' : '');
        if (state.solverSync) scheduleSolverSync();
    });
    // Interface/split changes while synced silently invalidate the BEM mesh topology,
    // so warn before letting them through (must be registered before the generic
    // input listener added by EventHandlers.initEventListeners).
    [dom.wgBuildInterface, dom.wgSplitHorizontal, dom.wgSplitVertical].forEach(el => guardSyncSensitiveCheckbox(el, () => state.solverSync));

    const hotkeyHandler = EventHandlers.createHotkeyHandler(state, dom);
    
    const callbacks = {
        handleGenericInputChange: (event) => {
            if (event.target.closest('#superformula-group')) EventHandlers.update2DChart(state, dom);
            if (event.target.tagName === 'SELECT' || event.target.type === 'checkbox') updateUI();
            generateAndRenderWaveguide();

        },
        updateVisibility: () => {
            Renderer.updateVisibility(dom.wgShowSurface.checked, dom.wgShowPoints.checked, dom.wgShowMesh.checked);
        },
        resetToDefaults,
        closeExportModal: () => dom.wgExportModalOverlay.classList.add('hidden'),
        exportSTL: () => Exporters.exportSTL(activeGeometries, state.lastConfig, dom.wgExportStlModalBtn),
        exportCSV: () => Exporters.exportCSV(activeGeometries, dom.wgExportCsvFullModalBtn),
        exportProfileCSV: () => Exporters.exportProfileCSV(activeGeometries, state.lastConfig, dom.wgExportCsvProfileModalBtn),
        exportDXF: () => Exporters.exportDXFSections(activeGeometries, state.lastConfig, dom.wgExportDxfModalBtn),
        exportOnshapeCSV: () => Exporters.exportOnshapeCSV(activeGeometries, state.lastConfig, dom.wgExportOnshapeModalBtn),
        exportSTEP: () => {
            // Always export all sections
            return Exporters.exportSTEP(activeGeometries, state.lastConfig, dom.wgBuildInterface.checked, 0, dom.wgExportStepModalBtn);
        },
        exportMSHDelaunay: () => Exporters.exportMSHDelaunay(activeGeometries, state.lastConfig, dom.wgBuildInterface.checked, 0, getMeshSettings(), dom.wgExportMshModalBtn),
        exportToSolver: () => exportWaveguideToSolver(),
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
        'wg-show-mesh', 'wg-show-surface', 'wg-build-interface', 'wg-split-horizontal', 'wg-split-vertical',
        'wg-d-in', 'wg-preview-container', 'wg-flare-mode', 'wg-shape-switch',
        'wg-shape-params-container', 'wg-output-shape', 'wg-d-out-circle',
        'wg-export-modal-overlay', 'wg-export-modal-close-btn', 'wg-export-stl-modal-btn',
        'wg-export-csv-full-modal-btn', 'wg-export-csv-profile-modal-btn', 'wg-export-msh-modal-btn',
        'wg-export-dxf-modal-btn', 'wg-csv-toggle-btn', 'wg-csv-sub-panel',
        'wg-export-onshape-modal-btn',
        'wg-export-step-modal-btn',
        'wg-export-solver-modal-btn', 'wg-export-msh-modal-btn',
        'wg-source-clmax', 'wg-source-curv', 'wg-source-adaptive',
        'wg-horn-clmax', 'wg-horn-curv', 'wg-horn-adaptive',
        'wg-interface-clmax', 'wg-interface-curv', 'wg-interface-adaptive',
        'wg-shape-length', 'sf-m', 'sf-a', 'sf-b', 'sf-n1', 'sf-n2', 'sf-n3', 'sf-amplitude',
        'sf-rot', 'sf-aspect',
        'interface-tip-offset',
        'interface-bulge-radius', 'interface-bulge-z', 'wg-w-out-calc', 'wg-h-out-calc',
        'wg-w-out-calc-rounded', 'wg-h-out-calc-rounded',
        'wg-input-shape', 'wg-d-in-circle', 'wg-d-in-rect-w', 'wg-d-in-rect-h',
        'wg-d-in-rounded-rect-w', 'wg-d-in-rounded-rect-h', 'wg-d-in-rounded-rect-r',
        'wg-input-circle-container', 'wg-input-rect-container', 'wg-input-rounded-rect-container',
        'wg-throat-shape-block', 'wg-throat-shape-mount-geometry', 'wg-throat-shape-mount-adapter',
        'wg-adapter-switch', 'wg-adapter-length', 'wg-adapter-law',
        'wg-adapter-theta-h', 'wg-adapter-theta-v', 'wg-adapter-panel',
        'wg-adapter-mouth-shape',
        'wg-am-circle-container', 'wg-am-rect-container', 'wg-am-rounded-rect-container',
        'wg-d-am-circle', 'wg-d-am-rect-w', 'wg-d-am-rect-h',
        'wg-d-am-rounded-rect-w', 'wg-d-am-rounded-rect-h', 'wg-d-am-rounded-rect-r'
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

function initTabs(rootElement) {
    const tabBtns = rootElement.querySelectorAll('.wg-tab-btn');
    const tabContents = rootElement.querySelectorAll('.wg-tab-content');
    const chartCanvas = rootElement.querySelector('#wg-2d-chart');
    const previewContainer = rootElement.querySelector('#wg-preview-container');
    const shapeTab = rootElement.querySelector('#wg-tab-shape');
    const view3dTab = rootElement.querySelector('#wg-tab-view3d');
    const both2d = rootElement.querySelector('#wg-both-2d');
    const both3d = rootElement.querySelector('#wg-both-3d');

    view3dTab.appendChild(previewContainer);

    function switchToTab(tabName) {
        state.activeTab = tabName;
        // Highlight active button
        tabBtns.forEach(b => b.classList.toggle('bg-green-700', b.dataset.wgTab === tabName));
        // Show/hide content panels
        tabContents.forEach(el => el.classList.toggle('hidden', el.id !== `wg-tab-${tabName}`));

        // Move shared elements to the active tab's containers
        if (tabName === 'both') {
            both2d.appendChild(chartCanvas);
            both3d.appendChild(previewContainer);
        } else if (tabName === 'shape') {
            shapeTab.appendChild(chartCanvas);
        } else if (tabName === 'view3d') {
            view3dTab.appendChild(previewContainer);
        } else if (tabName === 'directivity') {
            refreshBemGraphs(rootElement.querySelector('#wg-tab-directivity'));
        }

        // Resize after reparenting
        requestAnimationFrame(() => {
            if (state.chart2D) {
                state.chart2D.resize();
                // Refresh 2D chart data when becoming visible (shape/both)
                if (tabName === 'shape' || tabName === 'both') {
                    EventHandlers.update2DChart(state, dom);
                }
            }
            if (dom.wgPreviewContainer && (tabName === 'view3d' || tabName === 'both')) {
                const evt = new Event('resize');
                window.dispatchEvent(evt);
            }
        });
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchToTab(btn.dataset.wgTab));
    });
}

/** true quand le sélecteur Waveguide Type est sur « Dosc ». */
function isDoscMode() {
    return (dom.root.querySelector('#wg-waveguide-type') || {}).value === 'dosc';
}

/**
 * Bascule Horn / Dosc.
 *
 * En mode Dosc, tous les réglages de PROFIL sont masqués : le bloc Horn de
 * Main Settings et l'ensemble `#wg-default-controls` (Geometry, Throat Adapter,
 * Superformula, paramètres de loi, Arced Horn, Radial Horn). Main Settings
 * reste visible — il porte le sélecteur — ainsi que Mesh Settings et Interface,
 * qui sont hors de `#wg-default-controls` et restent donc pleinement
 * fonctionnels, comme demandé.
 */
function applyWaveguideTypeVisibility() {
    const dosc = isDoscMode();
    const hornMain = dom.root.querySelector('#wg-horn-main-settings');
    const doscMain = dom.root.querySelector('#wg-dosc-main-settings');
    const profileControls = dom.root.querySelector('#wg-default-controls');

    if (hornMain) hornMain.style.display = dosc ? 'none' : 'contents';
    if (doscMain) doscMain.style.display = dosc ? 'contents' : 'none';
    if (profileControls) profileControls.classList.toggle('hidden', dosc);

    // L'onglet Shape trace le profil 2D, qui n'a pas de sens sans loi
    // d'expansion : on masque son bouton en mode Dosc.
    dom.root.querySelectorAll('.wg-tab-btn').forEach(btn => {
        if (btn.dataset.wgTab === 'shape') btn.classList.toggle('hidden', dosc);
    });
    if (dosc && (state.activeTab === 'shape')) {
        dom.root.querySelector('.wg-tab-btn[data-wg-tab="view3d"]')?.click();
    }
}

function updateUI() {
    applyWaveguideTypeVisibility();
    // En mode Dosc les panneaux de profil sont masqués : inutile (et risqué,
    // certains n'existent que côté Horn) de recalculer leur visibilité interne.
    if (isDoscMode()) {
        dom.root.querySelectorAll('.control-label-toggle').forEach(header => {
            const content = header.nextElementSibling;
            if (content && content.style.maxHeight && content.style.maxHeight !== '0px') {
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
        return;
    }

    dom.root.querySelector('#wg-segment-1-params-wrapper').classList.remove('hidden');
    toggleParamVisibility();
    const outputShape = dom.wgOutputShape.value;
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
    const inRoundedCt = dom.root.querySelector('#wg-input-rounded-rect-container');
    if (inRoundedCt) inRoundedCt.style.display = (inputShape === 'rounded_rectangle') ? 'contents' : 'none';

    // Flare mode: show/hide full V-axis panels and rename H panel titles
    const isAniso = dom.wgFlareMode && dom.wgFlareMode.value === 'anisotrope';
    [1].forEach(seg => {
        // Update H panel titles based on mode
        const osseTitle = dom.root.querySelector(`#wg-os-se-title-${seg}`);
        if (osseTitle) osseTitle.textContent = isAniso ? 'OS-SE Flare H' : 'OS-SE Parameters';
        const osTitle = dom.root.querySelector(`#wg-os-title-${seg}`);
        if (osTitle) osTitle.textContent = isAniso ? 'OS Flare H' : 'OS Parameters';
        const hypexTitle = dom.root.querySelector(`#wg-hypex-title-${seg}`);
        if (hypexTitle) hypexTitle.textContent = isAniso ? 'Hypex Flare H' : 'Hypex Parameters';
        const besselTitle = dom.root.querySelector(`#wg-bessel-title-${seg}`);
        if (besselTitle) besselTitle.textContent = isAniso ? 'Bessel Flare H' : 'Bessel Parameters';
    });
    toggleParamVisibility();

    // Arced Horn: show/hide panel
    const arcedOn = dom.root.querySelector('#wg-arced-horn-switch');
    const arcedPanel = dom.root.querySelector('#wg-arced-horn-panel');
    if (arcedOn && arcedPanel) {
        arcedPanel.classList.toggle('hidden', !arcedOn.checked);
    }

    // Throat Adapter: show/hide panel + reparent throat-shape block
    const adapterOn = dom.root.querySelector('#wg-adapter-switch');
    const adapterPanel = dom.root.querySelector('#wg-adapter-panel');
    if (adapterOn && adapterPanel) {
        adapterPanel.classList.toggle('hidden', !adapterOn.checked);

        // Move the throat-shape block between the Geometry panel and the
        // Throat Adapter panel based on the switch state. Both mount points
        // use a 2-column grid, so the children render identically.
        const block = dom.root.querySelector('#wg-throat-shape-block');
        const mountGeom = dom.root.querySelector('#wg-throat-shape-mount-geometry');
        const mountAdap = dom.root.querySelector('#wg-throat-shape-mount-adapter');
        if (block && mountGeom && mountAdap) {
            const desiredParent = adapterOn.checked ? mountAdap : mountGeom;
            if (block.parentElement !== desiredParent) desiredParent.appendChild(block);
        }

        // Adapter Mouth Shape sub-container visibility
        const amShape = (dom.root.querySelector('#wg-adapter-mouth-shape') || {}).value || 'circle';
        const amCircle = dom.root.querySelector('#wg-am-circle-container');
        const amRect   = dom.root.querySelector('#wg-am-rect-container');
        const amRound  = dom.root.querySelector('#wg-am-rounded-rect-container');
        if (amCircle) amCircle.style.display = amShape === 'circle' ? 'contents' : 'none';
        if (amRect)   amRect.style.display   = amShape === 'rectangle' ? 'contents' : 'none';
        if (amRound)  amRound.style.display  = amShape === 'rounded_rectangle' ? 'contents' : 'none';
    }

    // Radial Horn: show/hide panel
    const radialOn = dom.root.querySelector('#wg-radial-switch');
    const radialPanel = dom.root.querySelector('#wg-radial-panel');
    if (radialOn && radialPanel) {
        radialPanel.classList.toggle('hidden', !radialOn.checked);
    }

}

function toggleParamVisibility() {
    const law = dom.root.querySelector('#wg-expansion-law-1').value;
    const isAniso = dom.wgFlareMode && dom.wgFlareMode.value === 'anisotrope';
    const wrapper = dom.root.querySelector('#wg-segment-1-params-wrapper');
    if (!wrapper) return;
    wrapper.querySelectorAll('.control-group').forEach(el => el.classList.add('hidden'));
    const lawKey = law.toLowerCase().replace(' ', '_');
    const containerH = wrapper.querySelector(`#wg-${lawKey}-params-container-1`);
    if (containerH) containerH.classList.remove('hidden');
    const containerV = wrapper.querySelector(`#wg-${lawKey}-v-params-container-1`);
    if (containerV) containerV.classList.toggle('hidden', !isAniso);
}

function updateBemInfo(config, finalDimensions, profileH) {
    const infoEl = dom.root.querySelector('#wg-bem-info');
    if (!infoEl) return;

    const N = config.numLines;
    const mouthW = finalDimensions.width;
    const mouthH = finalDimensions.height;

    // Estimate mouth perimeter (super-ellipse approximation)
    const a = mouthW / 2, b = mouthH / 2;
    const perim = (a === b) ? 2 * Math.PI * a : Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

    // Worst angular edge at mouth: perimeter / N
    const hAngular = perim / N;

    // Worst axial edge: estimate from profile
    let hAxialMax = 0;
    if (profileH && profileH.length > 1) {
        for (let i = 1; i < profileH.length; i++) {
            const dz = profileH[i].point.y - profileH[i - 1].point.y;
            const dr = profileH[i].point.x - profileH[i - 1].point.x;
            const edge = Math.sqrt(dz * dz + dr * dr);
            if (edge > hAxialMax) hAxialMax = edge;
        }
    }

    const hMax = Math.max(hAngular, hAxialMax);
    const c = 343000; // mm/s
    const fMax = hMax > 0.01 ? Math.round(c / (6 * hMax)) : 99999;
    const fMaxAng = hAngular > 0.01 ? Math.round(c / (6 * hAngular)) : 99999;
    const fMaxAx = hAxialMax > 0.01 ? Math.round(c / (6 * hAxialMax)) : 99999;
    const aspectRatio = (hAxialMax > 0.01 && hAngular > 0.01) ? (Math.max(hAngular, hAxialMax) / Math.min(hAngular, hAxialMax)).toFixed(1) : '?';

    // Color code
    const color = fMax >= 15000 ? '#4f4' : fMax >= 8000 ? '#ff4' : '#f44';

    // Angular points needed for target frequencies
    const needed10k = Math.ceil(perim / (c / (6 * 10000)));
    const needed15k = Math.ceil(perim / (c / (6 * 15000)));
    const needed20k = Math.ceil(perim / (c / (6 * 20000)));

    const totalTris = N * (profileH ? profileH.length - 1 : 0) * 2;

    infoEl.innerHTML = `
        <span style="color:${color}">BEM f<sub>max</sub> ≈ <b>${(fMax/1000).toFixed(1)}k Hz</b></span> (λ/6)
        <br>Angular: ${hAngular.toFixed(1)}mm → ${(fMaxAng/1000).toFixed(1)}k · Axial: ${hAxialMax.toFixed(1)}mm → ${(fMaxAx/1000).toFixed(1)}k
        <br>Aspect: ${aspectRatio}:1 · Triangles: ${totalTris}
        <br><span style="color:#888">Ang. pts for 10k:${needed10k} · 15k:${needed15k} · 20k:${needed20k}</span>
    `;
}

function updateRadialInfo(config, finalDimensions) {
    const infoEl = dom.root.querySelector('#wg-radial-info');
    if (!infoEl) return;
    if (!config.radial || !config.radial.enabled) { infoEl.innerHTML = ''; return; }

    const lines = [];
    const halfW = finalDimensions.width / 2;
    const halfH = finalDimensions.height / 2;

    const hUD = config.radial.upDown.height;
    if (hUD > 0 && halfH > 1e-6 && config.radial.upDown.type === 'arced') {
        const R = (halfH * halfH + hUD * hUD) / (2 * hUD);
        lines.push(`UD: h=${hUD.toFixed(1)}mm → <b>R=${R.toFixed(1)}mm</b>`);
    } else if (hUD > 0) {
        lines.push(`UD: h=${hUD.toFixed(1)}mm (linear)`);
    }

    const hLR = config.radial.leftRight.height;
    if (hLR > 0 && halfW > 1e-6 && config.radial.leftRight.type === 'arced') {
        const R = (halfW * halfW + hLR * hLR) / (2 * hLR);
        lines.push(`LR: h=${hLR.toFixed(1)}mm → <b>R=${R.toFixed(1)}mm</b>`);
    } else if (hLR > 0) {
        lines.push(`LR: h=${hLR.toFixed(1)}mm (linear)`);
    }

    infoEl.innerHTML = lines.length ? lines.join('<br>') : '';
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

/**
 * Encart d'information du mode DOSC : cotes dérivées du brevet, isophasicité
 * MESURÉE sur la géométrie courante, et bande de fonctionnement déduite des
 * 5 conditions de performance de la colonne 5 du brevet.
 */
function updateDoscInfo() {
    const el = dom.root.querySelector('#wg-dosc-info');
    if (!el) return;
    const meta = activeGeometries()?.doscMeta;
    if (!meta) { el.innerHTML = ''; return; }

    const { params, report, patent, filletRadius, maxFilletRadius } = meta;
    const band = patent.band;
    const budget = report.budget;
    const ratio = budget > 0 ? report.delta / budget : 0;
    const deltaColor = ratio < 0.25 ? '#4f4' : ratio < 0.6 ? '#ff4' : '#f44';
    const clamped = filletRadius < (meta.filletRequested ?? filletRadius) - 1e-6;
    const growLine = (params.prismHeightPct !== 0 || params.prismWidthPct !== 0)
        ? `<br>prism h <b>${params.prismHeightPct.toFixed(0)}%</b> · w <b>${params.prismWidthPct.toFixed(0)}%</b>
           <span style="color:#888">· ½h ${params.bodyMouthHalfHeight.toFixed(1)}mm · ½w ${params.prismMaxHalfWidth.toFixed(1)}mm
           <br>· cone α ${params.alphaBodyDeg.toFixed(1)}° (${params.alphaBodyMinDeg.toFixed(1)}…${params.alphaBodyMaxDeg.toFixed(1)}°)
           · bevel α ${params.alphaBodyBevelDeg.toFixed(1)}°</span>`
        : '';
    // On affiche l'avance MESURÉE sur la géométrie (intégration des lignes de
    // courant), pas la valeur théorique : c'est elle qui dit ce qui sort vraiment.
    const curvLine = Math.abs(params.centreAdvanceMm) > 1e-6
        ? `<br>centre adv <b>${report.measuredPathDelta.toFixed(2)}</b>mm
           (théo ${params.centreAdvanceMm.toFixed(2)}, plage ${params.centreAdvanceMinMm.toFixed(1)}…${params.centreAdvanceMaxMm.toFixed(1)})
           <br><span style="color:#888">≈ <b>${report.measuredCurvatureDeg.toFixed(1)}°</b> front
           ${params.centreAdvanceMm > 0 ? '(convexe — élargit en HF)' : '(concave — resserre en HF)'}</span>`
        : '';
    const gradeLine = params.wavefrontGradePct > 0
        ? `<br>grade <b>${params.wavefrontGradePct.toFixed(0)}%</b>
           <span style="color:#888">· edge α ${params.alphaBodyEdgeDeg.toFixed(1)}° (centre ${params.alphaBodyBevelDeg.toFixed(1)}°, cone ${params.alphaBodyDeg.toFixed(1)}°)</span>`
        : '';

    el.innerHTML = `
        α = <b>${params.alphaDeg.toFixed(1)}°</b> (full ${(2 * params.alphaDeg).toFixed(1)}°)
        · fold @ z=<b>${params.foldOnsetHousing.toFixed(0)}</b>/<b>${params.foldOnsetBody.toFixed(0)}</b>mm
        <br>gap ${params.gapConical.toFixed(1)}/${params.gapBevel.toFixed(1)}mm
        · path <b>${params.refPathLength.toFixed(1)}</b>mm
        ${growLine}
        ${curvLine}
        ${gradeLine}
        <br><span style="color:${deltaColor}">isophase δ = <b>${report.delta.toFixed(3)}</b>mm</span>
        (${(ratio * 100).toFixed(0)}% of λ/4 @16k)
        <br>usable <b>${Math.round(band.f1)}</b>–<b>${Math.round(band.f2)}</b> Hz
        <span style="color:#888">· f₂ by ${band.f2Limiter}</span>
        <br><span style="color:#888">fillet R ${filletRadius.toFixed(2)}mm (max ${maxFilletRadius.toFixed(2)})
        ${clamped ? ' — clamped' : ''} · ${meta.housingSlices}+${meta.bodySlices} rings</span>
        ${params.alphaDeg > 30 ? '<br><span style="color:#f44">α &gt; 30° — patent condition 2 violated</span>' : ''}
    `;
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

    if (config.waveguideType === 'dosc') {
        const result = Renderer.generateAndDisplayDosc(config, dom.wgBuildInterface.checked, dom.root);
        if (result.error) {
            dom.wgErrorContainer.textContent = `Error: ${result.error}`;
            dom.wgErrorContainer.classList.remove('hidden');
            return;
        }
        state.lastVertices = result.vertices;
        // Pas de profil 1D en DOSC : le pont vers Directivity (modèle de corne
        // par tranches rectangulaires) ne s'applique pas. Le BEM, lui, passe
        // par la géométrie maillée et fonctionne normalement.
        state.lastProfileH = null;
        state.lastProfileV = null;
        state.lastFinalDimensions = result.finalDimensions;

        updateDoscInfo();
        Renderer.updateVisibility(dom.wgShowSurface.checked, dom.wgShowPoints.checked, dom.wgShowMesh.checked);
        if (result.vertices.length > 0) dom.wgExportBtn.disabled = false;
        scheduleSolverSync();
        return;
    }

    const { profileH, profileV } = createProfileData(config);
    const { finalDimensions, vertices } = Renderer.generateAndDisplayWaveguide(config, profileH, profileV, dom.wgBuildInterface.checked, dom.root);
    state.lastVertices = vertices;
    state.lastProfileH = profileH;
    state.lastProfileV = profileV;
    state.lastFinalDimensions = finalDimensions;
    scheduleSolverSync();

    dom.wgDOutCircle.value = (finalDimensions.width).toFixed(1);
    dom.wgWOutCalc.value = dom.wgWOutCalcRounded.value = finalDimensions.width.toFixed(1);
    dom.wgHOutCalc.value = dom.wgHOutCalcRounded.value = finalDimensions.height.toFixed(1);

    // Compute and display BEM mesh quality info
    updateBemInfo(config, finalDimensions, profileH);

    // Update radial height → radius info
    updateRadialInfo(config, finalDimensions);

    Renderer.updateVisibility(dom.wgShowSurface.checked, dom.wgShowPoints.checked, dom.wgShowMesh.checked);
    if (vertices.length > 0) dom.wgExportBtn.disabled = false;
}

function getMeshSettings() {
    const profile = (name, defaults) => {
        const clmax = parseFloat(dom[`wg${name}Clmax`]?.value);
        const curvature = parseFloat(dom[`wg${name}Curv`]?.value);
        return {
            clmax: Number.isFinite(clmax) && clmax > 0 ? clmax : defaults.clmax,
            curvature: Number.isFinite(curvature) ? Math.max(0, curvature) : defaults.curvature,
            adaptive: !!dom[`wg${name}Adaptive`]?.checked,
        };
    };
    return {
        source: profile('Source', { clmax: 4, curvature: 12 }),
        horn: profile('Horn', { clmax: 8, curvature: 16 }),
        interface: profile('Interface', { clmax: 8, curvature: 12 }),
    };
}

function getStandaloneSolverRoot() {
    return document.querySelector('#tool-wrapper-directivity #directivity-root');
}

function setSolverSyncStatus(message, isError = false) {
    const status = dom.root?.querySelector('#wg-solver-sync-status');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('text-red-400', isError);
    status.classList.toggle('text-gray-400', !isError);
}

function confirmSyncBreakingChange() {
    if (!window.notify?.confirm) return Promise.resolve(true);
    return window.notify.confirm(
        'Sync is enabled: changing the Interface or Split setting now will invalidate the current BEM solution and it will need to be solved again. '
        + 'To remove the interface or a split without losing your results, disable Sync first, revert the setting, then re-enable Sync to re-solve.',
        'This will invalidate the BEM solution'
    );
}

// Intercepts a checkbox's "input" event while Sync is on, reverts it until the
// user confirms, then re-dispatches it so the normal generic handler runs.
function guardSyncSensitiveCheckbox(checkbox, isSyncActive) {
    if (!checkbox) return;
    checkbox.addEventListener('input', (e) => {
        if (!isSyncActive() || checkbox.dataset.syncGuardBypass) return;
        const attemptedChecked = checkbox.checked;
        checkbox.checked = !attemptedChecked;
        e.stopImmediatePropagation();
        confirmSyncBreakingChange().then(ok => {
            if (!ok) return;
            checkbox.checked = attemptedChecked;
            checkbox.dataset.syncGuardBypass = '1';
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
            delete checkbox.dataset.syncGuardBypass;
        });
    }, true);
}

async function exportWaveguideToSolver() {
    const button = dom.wgExportSolverModalBtn;
    const originalText = button?.textContent || 'Generate mesh and open Solver';
    if (button) {
        button.disabled = true;
        button.textContent = 'Generating mesh...';
    }
    try {
        const { mshContent } = await Exporters.generateMSHForBEM(activeGeometries, state.lastConfig, getMeshSettings());
        window.showTool?.('directivity', 'BEM Solver');
        await importBemMeshContent(getStandaloneSolverRoot(), mshContent, 'waveguide_solver.msh');
        if (button) button.textContent = 'Imported';
        return true;
    } catch (error) {
        console.error('[Waveguide→Solver] export failed', error);
        if (button) button.textContent = `Error: ${error.message}`;
        return false;
    } finally {
        setTimeout(() => {
            if (!button) return;
            button.disabled = false;
            button.textContent = originalText;
        }, 1800);
    }
}

function scheduleSolverSync() {
    if (!state.solverSync) return;
    state.solverSyncPending = true;
    clearTimeout(state.solverSyncTimer);
    state.solverSyncTimer = setTimeout(runSolverSync, 600);
}

async function runSolverSync() {
    if (!state.solverSync || state.solverSyncRunning || !state.solverSyncPending) return;
    state.solverSyncPending = false;
    state.solverSyncRunning = true;
    try {
        setSolverSyncStatus('Generating mesh...');
        const { mshContent } = await Exporters.generateMSHForBEM(activeGeometries, state.lastConfig, getMeshSettings());
        const solverRoot = getStandaloneSolverRoot();
        await importBemMeshContent(solverRoot, mshContent, 'waveguide_sync.msh');
        setSolverSyncStatus('Solving...');
        await rerunBemSolver(solverRoot);
        setSolverSyncStatus('Graph up to date');
    } catch (error) {
        console.error('[Waveguide Solver SYNC] failed', error);
        setSolverSyncStatus(error.message || String(error), true);
    } finally {
        state.solverSyncRunning = false;
        if (state.solverSyncPending && state.solverSync) {
            clearTimeout(state.solverSyncTimer);
            state.solverSyncTimer = setTimeout(runSolverSync, 0);
        }
    }
}

function dispatchDirectivityUpdate(config, profileH, profileV, finalDimensions, sync = false, bemSettingsChanged = false) {
    if (!window.panelEvents || !profileH || profileH.length < 2) return;
    const sortedH = [...profileH].sort((a, b) => a.point.y - b.point.y);
    const sortedV = profileV && profileV.length >= 2
        ? [...profileV].sort((a, b) => a.point.y - b.point.y) : null;
    const sampleCount = Math.min(sortedH.length, 16);
    const zStart = sortedH[0].point.y;
    const zEnd = sortedH[sortedH.length - 1].point.y;
    const totalLength = Math.max(1e-6, zEnd - zStart);
    const interpolate = (profile, z) => {
        if (!profile) return sortedH[0].point.x;
        if (z <= profile[0].point.y) return profile[0].point.x;
        if (z >= profile[profile.length - 1].point.y) return profile[profile.length - 1].point.x;
        for (let i = 0; i < profile.length - 1; i++) {
            const a = profile[i].point, b = profile[i + 1].point;
            if (z >= a.y && z <= b.y) {
                const t = (z - a.y) / Math.max(1e-9, b.y - a.y);
                return a.x + t * (b.x - a.x);
            }
        }
        return profile[profile.length - 1].point.x;
    };
    const segments = [];
    for (let i = 0; i < sampleCount; i++) {
        const t = i / Math.max(1, sampleCount - 1);
        const z = zStart + t * totalLength;
        segments.push({
            w: 2 * interpolate(sortedH, z),
            h: 2 * interpolate(sortedV, z),
            l: i < sampleCount - 1 ? totalLength / (sampleCount - 1) : 0,
        });
    }
    const last = segments[segments.length - 1];
    const prev = segments[Math.max(0, segments.length - 2)];
    // La signature couvre les 16 segments rééchantillonnés ET le Z Offset de
    // l'interface : le maillage BEM dépend aussi de ce dernier, un changement
    // du seul offset doit donc déclencher un recalcul.
    const geometrySignature = JSON.stringify([
        segments.map(segment => [
            Number(segment.w.toFixed(5)), Number(segment.h.toFixed(5)), Number(segment.l.toFixed(5))
        ]),
        Number((config.interface?.tipOffset ?? 0).toFixed(5)),
    ]);
    // `bemSettingsChanged` : les réglages BEM (fmin/fmax/points par octave) ont
    // bougé sans que la géométrie change. Il faut alors passer outre le
    // dédoublonnage, sinon le recalcul demandé n'a jamais lieu.
    if (!sync && !bemSettingsChanged && state.lastDirectivityGeometrySignature === geometrySignature) return;
    state.lastDirectivityGeometrySignature = geometrySignature;
    const law = config.segments?.[0]?.law || 'Conical';
    const lawMap = { 'OS-SE': 'OS-SE', OS: 'OS', Hypex: 'Hypex', Bessel: 'Bessel' };

    window.panelEvents.dispatchEvent(new CustomEvent('export-to-directivity', {
        detail: {
            lastSegmentWidth: last.w,
            lastSegmentHeight: last.h,
            calculatedWallAngleH: 2 * Math.atan((last.w - prev.w) / 2 / Math.max(1, prev.l)) * 180 / Math.PI,
            calculatedWallAngleV: 2 * Math.atan((last.h - prev.h) / 2 / Math.max(1, prev.l)) * 180 / Math.PI,
            expansionType: lawMap[law] || 'Conical',
            cutoffFrequency: 116 / (totalLength / 1000),
            segments,
            sync,
            waveguideStudio: true,
            interfaceTipOffset: config.interface?.tipOffset ?? 0,
        },
    }));
}

// ====================================================================================================
// PRESETS : Save / Load / Delete waveguide configurations
// ====================================================================================================

function collectFormValues(root) {
    const values = {};
    root.querySelectorAll('input[type="text"], input[type="number"], select, input[type="checkbox"]').forEach(el => {
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
