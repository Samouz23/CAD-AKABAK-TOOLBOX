// ====================================================================================================
// FICHIER :  src/js/panels/waveguidestudio/eventHandlers.js
// RÔLE :     Gestion des événements et des interactions utilisateur.
// ====================================================================================================

import { inputConfigs } from './config.js';
import * as Formulas from './Formulas.js';
import { getSettings } from '../mainsettings/mainsettings.js';

function blockLettersInAllInputs(rootElement) {
    rootElement.querySelectorAll('input[type="text"]').forEach(input => {
        input.addEventListener('keydown', (e) => {
            // Autoriser les touches de contrôle et de navigation
            const allowedKeys = [
                'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
                'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
                'Home', 'End'
            ];
            
            // Autoriser Ctrl/Cmd + touches (copier/coller/etc.)
            if (e.ctrlKey || e.metaKey) {
                return;
            }
            
            // Si c'est une touche autorisée, laisser passer
            if (allowedKeys.includes(e.key)) {
                return;
            }
            
            // Bloquer toutes les lettres (a-z, A-Z)
            if (/^[a-zA-Z]$/.test(e.key)) {
                e.preventDefault();
            }
        });
        
        // Bloquer aussi le collage de lettres
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            // Ne garder que les chiffres, points, signes moins et espaces
            const cleanedText = pastedText.replace(/[a-zA-Z]/g, '');
            document.execCommand('insertText', false, cleanedText);
        });
    });
}

export function initEventListeners(rootElement, dom, callbacks) {
    rootElement.querySelectorAll('input, select').forEach(el => {
        if (!['wg-show-points', 'wg-show-surface'].includes(el.id)) el.addEventListener('input', callbacks.handleGenericInputChange);
    });
    dom.wgShowPoints.addEventListener('input', callbacks.updateVisibility);
    dom.wgShowSurface.addEventListener('input', callbacks.updateVisibility);
    dom.wgResetBtn.addEventListener('click', callbacks.resetToDefaults);
    dom.wgExportBtn.addEventListener('click', () => { if (!dom.wgExportBtn.disabled) dom.wgExportModalOverlay.classList.remove('hidden'); });
    dom.wgExportModalCloseBtn.addEventListener('click', callbacks.closeExportModal);
    dom.wgExportModalOverlay.addEventListener('click', (e) => { if (e.target === dom.wgExportModalOverlay) callbacks.closeExportModal(); });
    dom.wgExportStlModalBtn.addEventListener('click', async () => { await callbacks.exportSTL(); setTimeout(callbacks.closeExportModal, 500); });
    dom.wgExportCsvFullModalBtn.addEventListener('click', async () => { await callbacks.exportCSV(); setTimeout(callbacks.closeExportModal, 500); });
    dom.wgExportCsvProfileModalBtn.addEventListener('click', async () => { await callbacks.exportProfileCSV(); setTimeout(callbacks.closeExportModal, 500); });
    dom.wgExportMshModalBtn.addEventListener('click', async () => { await callbacks.exportMSH(); setTimeout(callbacks.closeExportModal, 500); });
    
    rootElement.querySelectorAll('.control-label-toggle').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling, arrow = header.querySelector('svg');
            if (content.style.maxHeight && content.style.maxHeight !== '0px') {
                content.style.maxHeight = '0px'; arrow.classList.remove('rotate-180');
            } else {
                content.style.maxHeight = content.scrollHeight + "px"; arrow.classList.add('rotate-180');
            }
        });
    });
    
    blockLettersInAllInputs(rootElement);
    addWheelListenersToInputs(rootElement);
    window.panelEvents.addEventListener('export-to-waveguide', (e) => callbacks.applyImportedParams(e.detail));
}

export function addWheelListenersToInputs(rootElement) {
    const sortedConfigKeys = Object.keys(inputConfigs).sort((a, b) => b.length - a.length);
    const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

    rootElement.querySelectorAll('input[type="text"]').forEach(input => {
        // --- GESTION DE LA MOLETTE (WHEEL) ---
        input.addEventListener('wheel', e => {
            e.preventDefault();
            const configKey = sortedConfigKeys.find(k => input.id.startsWith(k));
            const config = configKey ? inputConfigs[configKey] : null;
            const currentValue = parseFloat(input.value);
            if (isNaN(currentValue)) return;
            
            let step = (input.id === 'wg-lines') ? 4 : (config?.step || 1);
            if (e.shiftKey) step = config?.shiftStep || step * 10;
            if (e.altKey) step /= 10;
            
            let newValue = currentValue + (e.deltaY < 0 ? 1 : -1) * step;
            if (config?.min !== undefined) newValue = clamp(newValue, config.min, config.max);
            if (input.id === 'wg-lines') newValue = Math.max(4, Math.round(newValue / 4) * 4);
            
            const precision = (config && String(config.step).includes('.')) ? String(config.step).split('.')[1].length : 0;
            input.value = newValue.toFixed(precision);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // --- GESTION DE LA VALIDATION EN TEMPS RÉEL (INPUT) ---
        input.addEventListener('input', () => {
             const configKey = sortedConfigKeys.find(k => input.id.startsWith(k));
             if (configKey) {
                const config = inputConfigs[configKey], value = parseFloat(input.value);
                if (!isNaN(value)) {
                    const clamped = clamp(value, config.min, config.max);
                    if (clamped !== value) input.value = clamped;
                }
             }
        });

        // --- NOUVEAU : GESTION DE LA CORRECTION FINALE (CHANGE) ---
        if (input.id === 'wg-lines') {
            input.addEventListener('change', () => {
                const value = parseInt(input.value);
                if (!isNaN(value)) {
                    const correctedValue = Math.max(4, Math.round(value / 4) * 4);
                    if (correctedValue !== value) {
                        input.value = correctedValue;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            });
        }
    });

    rootElement.querySelectorAll('select').forEach(select => {
        select.addEventListener('wheel', e => {
            e.preventDefault();
            const direction = e.deltaY < 0 ? -1 : 1;
            const newIndex = select.selectedIndex + direction;
            if (newIndex >= 0 && newIndex < select.options.length) {
                select.selectedIndex = newIndex;
                select.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    });
}

export async function loadAndApplyHotkeys(state, dom, handleHotkeys) {
    state.hotkeySettings = (await getSettings()).hotkeys || {};
    document.removeEventListener('keydown', handleHotkeys);
    document.addEventListener('keydown', handleHotkeys);
}

const normalizeHotkeyEvent = (event) => {
    const parts = [];
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');

    const key = event.key.toLowerCase();
    const isModifier = ['control', 'shift', 'alt', 'meta'].includes(key);
    if (!isModifier) {
        if (key === ' ') parts.push('space');
        else parts.push(key);
    }

    if (parts.length === 0) return '';
    return parts.join('+');
};

export function createHotkeyHandler(state, dom) {
    return function handleHotkeys(event) {
        if (dom.root.offsetParent === null) return;
        if (state.presetsInputFocused) return;
        // Les raccourcis fonctionnent maintenant même dans les inputs
        // if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) && !event.ctrlKey && !event.altKey && !event.metaKey) return;

        const hk = state.hotkeySettings || {};
        const keyCombo = normalizeHotkeyEvent(event);
        if (!keyCombo) return;

        const collapseAllPanels = () => {
            dom.root.querySelectorAll('.control-label-toggle').forEach(header => {
                const content = header.nextElementSibling, arrow = header.querySelector('svg');
                if (content.style.maxHeight && content.style.maxHeight !== '0px') {
                    content.style.maxHeight = '0px'; arrow.classList.remove('rotate-180');
                }
            });
        };

        const actions = {};
        if (hk.split) actions[hk.split.toLowerCase()] = () => { const newState = !dom.wgSplitHorizontal.checked; dom.wgSplitHorizontal.checked = dom.wgSplitVertical.checked = newState; dom.wgSplitVertical.dispatchEvent(new Event('input')); };
        if (hk.surface) actions[hk.surface.toLowerCase()] = () => dom.wgShowSurface.click();
        if (hk.points) actions[hk.points.toLowerCase()] = () => dom.wgShowPoints.click();
        if (hk.buildInterface) actions[hk.buildInterface.toLowerCase()] = () => dom.wgBuildInterface.click();
        if (hk.export) actions[hk.export.toLowerCase()] = () => { if (!dom.wgExportBtn.disabled) dom.wgExportModalOverlay.classList.remove('hidden'); };
        if (hk.togglePanels) actions[hk.togglePanels.toLowerCase()] = collapseAllPanels;

        const action = actions[keyCombo.toLowerCase()];
        if (action) { event.preventDefault(); action(); }
    };
}

export function update2DChart(state, dom) {
    if (!state.chart2D || !state.chart2D.chartArea || state.chart2D.chartArea.height === 0) return;
    const sfOptions = { m: parseFloat(dom.sfM.value) || 0, a: parseFloat(dom.sfA.value) || 1, b: parseFloat(dom.sfB.value) || 1, n1: parseFloat(dom.sfN1.value) || 1, n2: parseFloat(dom.sfN2.value) || 1, n3: parseFloat(dom.sfN3.value) || 1 };
    const sfPoints = [];
    for (let i = 0; i <= 360; i++) {
        const theta = i * 2 * Math.PI / 360;
        const r = Formulas.superformula(theta, sfOptions);
        sfPoints.push({ x: r * Math.cos(theta), y: r * Math.sin(theta) });
    }
    state.chart2D.data.datasets[0].data = sfPoints;
    if (sfPoints.length === 0) { state.chart2D.update(); return; }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    sfPoints.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    const deltaX = (maxX - minX) * 1.1 || 2, deltaY = (maxY - minY) * 1.1 || 2;
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const chartRatio = state.chart2D.chartArea.width / state.chart2D.chartArea.height;
    let finalX, finalY;
    if (deltaX / deltaY > chartRatio) { finalX = deltaX; finalY = deltaX / chartRatio; } else { finalY = deltaY; finalX = deltaY * chartRatio; }
    state.chart2D.options.scales.x.min = centerX - finalX / 2; state.chart2D.options.scales.x.max = centerX + finalX / 2;
    state.chart2D.options.scales.y.min = centerY - finalY / 2; state.chart2D.options.scales.y.max = centerY + finalY / 2;
    state.chart2D.update();
}

export function applyImportedParams(params, dom, updateUI, generateAndRenderWaveguide) {
    if (!params) return;
    dom.wgSegmentCount.value = '1';
    
    if (params['os-se-param-k']) {
        const lawEl = dom.root.querySelector('#wg-expansion-law-1');
        if (lawEl) lawEl.value = 'OS-SE';
        
        if (params['os-se-param-L']) {
            const lengthEl = dom.root.querySelector('#wg-length-1');
            if (lengthEl) lengthEl.value = params['os-se-param-L'];
        }
        if (params['os-se-param-r'] && dom.wgDIn) dom.wgDIn.value = (parseFloat(params['os-se-param-r']) * 2).toFixed(2);
        ['k', 'a', 's', 'q', 'n'].forEach(p => {
            if (params[`os-se-param-${p}`]) {
                const el = dom.root.querySelector(`#wg-os-se-${p}-1`);
                if (el) el.value = params[`os-se-param-${p}`];
            }
        });
    } else if (params['expansion-law']) {
        const law = params['expansion-law'];
        const lawEl = dom.root.querySelector('#wg-expansion-law-1');
        if (lawEl) {
            lawEl.value = law;
            // Déclencher l'événement change pour mettre à jour l'UI
            lawEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        if (params['L']) {
            const lengthEl = dom.root.querySelector('#wg-length-1');
            if (lengthEl) lengthEl.value = params['L'];
        }
        if (params['r0'] && dom.wgDIn) dom.wgDIn.value = (parseFloat(params['r0']) * 2).toFixed(2);
        
        // Attendre que l'UI soit mise à jour avant de définir les paramètres
        setTimeout(() => {
            switch(law) {
                case 'Hypex':
                    if (params['fc']) {
                        const fcEl = dom.root.querySelector('#wg-hypex-fc-1');
                        if (fcEl) fcEl.value = params['fc'];
                    }
                    if (params['T']) {
                        const tEl = dom.root.querySelector('#wg-hypex-t-1');
                        if (tEl) tEl.value = params['T'];
                    }
                    break;
                case 'Exponential':
                case 'Parabolic':
                    if (params['fc']) {
                        const fcEl = dom.root.querySelector(`#wg-${law.toLowerCase()}-fc-1`);
                        if (fcEl) fcEl.value = params['fc'];
                    }
                    break;
                case 'OS':
                    if (params['theta']) {
                        const thetaEl = dom.root.querySelector('#wg-os-theta-1');
                        if (thetaEl) thetaEl.value = params['theta'];
                    }
                    break;
                case 'Conical':
                    if (params['theta']) {
                        const thetaEl = dom.root.querySelector('#wg-conical-theta-1');
                        if (thetaEl) thetaEl.value = params['theta'];
                    }
                    break;
            }
        }, 50);
    } else if (typeof params.s0 === 'number' && typeof params.sL === 'number' && typeof params.L  === 'number') {
        const lengthEl = dom.root.querySelector('#wg-length-1');
        if (lengthEl) lengthEl.value = params.L;
        const r0 = Math.sqrt(params.s0 / Math.PI);
        if (isFinite(r0) && r0 > 0 && dom.wgDIn) dom.wgDIn.value = (2 * r0).toFixed(2);
    } else {
        return;
    }
    updateUI();
    generateAndRenderWaveguide();
}
