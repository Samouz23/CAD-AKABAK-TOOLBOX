// ====================================================================================================
// FICHIER :  src/js/panels/horn/exporters.js
// RÔLE :     Gestion des exports (vers HornScript, Waveguide Studio, Directivity, CSV OS-SE).
// ====================================================================================================

import { getFcFromHornLength, dimensionFormulas } from './formulas.js';
import { exportFileInDirectory } from '../waveguidestudio/exporters.js';
import { getSettings } from '../mainsettings/mainsettings.js';

// --- Export vers les autres panneaux ---

export function handleExport(targetPanel, state, dom) {
    const { rootElement } = dom;
    const { currentUnit, yAxisMode } = state;

    if (targetPanel === 'akabak_lem') {
        const segments = state.getTableData(true);
        if (segments.length === 0) return;
        const payload = { segments, count: state.segmentCount, unit: currentUnit };
        window.showTool('akabak_lem', 'Akabak LEM');
        setTimeout(() => {
            window.panelEvents.dispatchEvent(new CustomEvent('export-to-hornscript', { detail: payload }));
        }, 100);
    }
    else if (targetPanel === 'waveguide') {
        const params = {};

        if (yAxisMode === 'os-se') {
            dom.osSeParamsContainer.querySelectorAll('input')
                .forEach(input => { params[input.id] = parseFloat(input.value) || 0; });
        } else {
            const raw = state.getTableData(true);
            if (raw.length < 2) return;

            params.s0 = raw[0].w * raw[0].h;
            params.sL = raw[raw.length - 1].w * raw[raw.length - 1].h;
            params.L = raw.slice(0, -1).reduce((acc, s) => acc + s.l, 0);

            const r0 = Math.sqrt(params.s0 / Math.PI);
            if (isFinite(r0) && r0 > 0) params.r0 = r0;

            const areaLawSelect = rootElement.querySelector('.graph-expansion-select[data-param="s"]');
            const law = areaLawSelect ? areaLawSelect.value : null;

            const getNum = (ids) => {
                for (const id of ids) {
                    const el = rootElement.querySelector(id);
                    if (el) { const v = parseFloat(el.value); if (isFinite(v)) return v; }
                }
                return undefined;
            };

            if (law && law.trim()) {
                params['expansion-law'] = law;
                if (law === 'Hypex') {
                    params.fc = getFcFromHornLength(params.L);
                    const T = getNum(['#param-input-T-s']);
                    if (T !== undefined) params.T = T;
                } else if (law === 'Exponential' || law === 'Parabolic') {
                    params.fc = getFcFromHornLength(params.L);
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
            window.panelEvents.dispatchEvent(new CustomEvent('export-to-waveguide', { detail: params }));
        }, 200);
    }
    else if (targetPanel === 'directivity') {
        handleExportDirectivity(state, dom);
    }
}

function handleExportDirectivity(state, dom) {
    const raw = state.getTableData(true);
    if (raw.length < 2) {
        alert('Please define at least 2 segments before exporting to Directivity.');
        return;
    }

    const lastSegment = raw[raw.length - 1];
    const secondLastSegment = raw[raw.length - 2];
    const deltaWidth = lastSegment.w - secondLastSegment.w;
    const deltaHeight = lastSegment.h - secondLastSegment.h;
    const length = secondLastSegment.l;

    const halfAngleRadH = Math.atan((deltaWidth / 2) / length);
    const calculatedWallAngleH = (halfAngleRadH * 180 / Math.PI) * 2;
    const halfAngleRadV = Math.atan((deltaHeight / 2) / length);
    const calculatedWallAngleV = (halfAngleRadV * 180 / Math.PI) * 2;

    let expansionType = 'Conical';
    const bestFitText = dom.bestFitResults.textContent;
    if (bestFitText && bestFitText.trim()) {
        const expansionMap = { 'EXPO': 'Exponential', 'HYPE': 'Hypex', 'PARA': 'Parabolic', 'CONI': 'Conical' };
        let maxPercentage = -1;
        let bestExpansion = 'Conical';
        const matches = bestFitText.matchAll(/(EXPO|HYPE|PARA|CONI):\s*(\d+)%/gi);
        for (const match of matches) {
            const type = match[1].toUpperCase();
            const percentage = parseInt(match[2]);
            if (percentage > maxPercentage) {
                maxPercentage = percentage;
                bestExpansion = expansionMap[type] || 'Conical';
            }
        }
        if (maxPercentage >= 0) expansionType = bestExpansion;
    }
    if (!bestFitText || !bestFitText.trim()) {
        const lawSelect = dom.rootElement.querySelector('.graph-expansion-select[data-param="s"]');
        expansionType = lawSelect ? lawSelect.value : 'Conical';
    }

    const s0 = raw[0].w * raw[0].h;
    const s0M = s0 / 1000000;
    const cutoffFrequency = 344 / (4 * Math.sqrt(s0M));

    const payload = {
        lastSegmentWidth: lastSegment.w,
        lastSegmentHeight: lastSegment.h,
        calculatedWallAngleH,
        calculatedWallAngleV,
        expansionType,
        cutoffFrequency
    };

    window.showTool('directivity', 'Directivity Calculator');
    setTimeout(() => {
        console.log('[Horn→Directivity] exporting data:', payload);
        window.panelEvents.dispatchEvent(new CustomEvent('export-to-directivity', { detail: payload }));
    }, 100);
}

// --- Export OS-SE CSV ---

export function generateOsSeCsvContent(spacingMm, dom) {
    const opts = {};
    ['L', 'k', 'r', 't', 'a', 's', 'q', 'n'].forEach(key => {
        const elem = dom.rootElement.querySelector(`#os-se-param-${key}`);
        const val = elem ? parseFloat(elem.value) : 0;
        opts[key] = isFinite(val) ? val : 0;
    });
    
    console.log('[OS-SE Export] Current params:', opts);
    if (!opts.L || opts.L <= 0) return '';

    const xs = [];
    for (let x = 0; x <= opts.L; x += spacingMm) {
        xs.push(x);
    }
    if (xs[xs.length - 1] < opts.L) xs.push(opts.L);

    const lines = [];
    xs.forEach(x => {
        const r = dimensionFormulas['OS-SE'](x, opts.L, opts);
        if (!isFinite(r)) return;
        const y = opts.L - x;
        lines.push(`${(0).toFixed(4)},${y.toFixed(4)},${r.toFixed(4)}`);
    });
    return lines.join('\n');
}

export async function exportOsSeCsv(dom) {
    return new Promise((resolve) => {
        const modal = dom.rootElement.querySelector('#spacing-modal-overlay');
        const input = dom.rootElement.querySelector('#spacing-input');
        const okBtn = dom.rootElement.querySelector('#spacing-ok-btn');
        const cancelBtn = dom.rootElement.querySelector('#spacing-cancel-btn');

        modal.classList.remove('hidden');
        input.focus();
        input.select();

        const cleanup = () => {
            modal.classList.add('hidden');
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            input.removeEventListener('keydown', handleKey);
        };

        const handleOk = async () => {
            const spacingMm = parseFloat(input.value);
            if (!isFinite(spacingMm) || spacingMm <= 0) {
                input.classList.add('border-red-500');
                setTimeout(() => input.classList.remove('border-red-500'), 1000);
                return;
            }
            cleanup();
            await performExport(spacingMm, dom);
            resolve();
        };

        const handleCancel = () => { cleanup(); resolve(); };
        const handleKey = (e) => { if (e.key === 'Enter') handleOk(); if (e.key === 'Escape') handleCancel(); };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        input.addEventListener('keydown', handleKey);
    });
}

async function performExport(spacingMm, dom) {
    const content = generateOsSeCsvContent(spacingMm, dom);
    if (!content) {
        if (dom.exportOsSeCsvBtn) {
            const originalText = dom.exportOsSeCsvBtn.textContent;
            dom.exportOsSeCsvBtn.textContent = 'Invalid OS-SE';
            dom.exportOsSeCsvBtn.classList.add('text-red-400');
            setTimeout(() => {
                dom.exportOsSeCsvBtn.textContent = originalText;
                dom.exportOsSeCsvBtn.classList.remove('text-red-400');
            }, 2500);
        }
        return;
    }

    const settings = await getSettings();
    const csvPath = settings?.paths?.dataRoot ? `${settings.paths.dataRoot}\\CSV-out` : '';
    const fileName = `horn_osse_curve_${spacingMm}mm.csv`;
    await exportFileInDirectory(content, csvPath, fileName, dom.exportOsSeCsvBtn);
}
