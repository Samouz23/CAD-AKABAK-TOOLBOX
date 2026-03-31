// ====================================================================================================
// FICHIER :  src/js/panels/horn/tableManager.js
// RÔLE :     Gestion de la table des segments, CRUD, conversion d'unités, import CSV.
// ====================================================================================================

import { defaultSegments } from './config.js';

// --- Conversion d'unités ---

export const convertToMm = (value, unit) => (unit === 'cm' ? value * 10 : value);
export const convertFromMm = (value, unit) => (unit === 'cm' ? value / 10 : value);
export const getSurfaceFactor = (unit) => (unit === 'cm' ? 100 : 1);

// --- Lecture des données de la table ---

export function getTableData(getRawSegments, state, dom) {
    const { segmentCount, currentUnit } = state;
    const { tableBody } = dom;

    const data = { w: [], h: [], s: [], totalL: 0 };
    const rawSegments = [];
    let cumulativeL = 0;

    for (let i = 0; i < segmentCount; i++) {
        const row = tableBody.querySelector(`tr[data-index="${i}"]`);
        if (!row || row.style.display === 'none') continue;
        const w_mm = convertToMm(parseFloat(row.querySelector('.segment-w').value) || 0, currentUnit);
        const h_mm = convertToMm(parseFloat(row.querySelector('.segment-h').value) || 0, currentUnit);
        const l_mm = (i === segmentCount - 1) ? 0 : (convertToMm(parseFloat(row.querySelector('.segment-l').value) || 0, currentUnit));
        const s_mm2 = w_mm * h_mm;
        rawSegments.push({ index: i, w: w_mm, h: h_mm, l: l_mm, s: s_mm2, cumulativeL });
        data.w.push({ x: cumulativeL, y: w_mm });
        data.h.push({ x: cumulativeL, y: h_mm });
        data.s.push({ x: cumulativeL, y: s_mm2 });
        cumulativeL += l_mm;
    }
    data.totalL = cumulativeL;
    if (segmentCount > 0 && rawSegments.length > 0) {
        const lastSegment = rawSegments[rawSegments.length - 1];
        data.w.push({ x: cumulativeL, y: lastSegment.w });
        data.h.push({ x: cumulativeL, y: lastSegment.h });
        data.s.push({ x: cumulativeL, y: lastSegment.s });
    }
    return getRawSegments ? rawSegments : data;
}

// --- Mise à jour de l'affichage de la table ---

export function updateTableUI(segmentsData, state, dom) {
    const surfFactor = getSurfaceFactor(state.currentUnit);
    dom.tableBody.querySelectorAll('.segment-row').forEach((row, i) => {
        if (i < segmentsData.length) {
            const segData = segmentsData[i];
            row.querySelector('.segment-w').value = segData.w ? convertFromMm(segData.w, state.currentUnit).toFixed(1) : '';
            row.querySelector('.segment-h').value = segData.h ? convertFromMm(segData.h, state.currentUnit).toFixed(1) : '';
            if (i < segmentsData.length - 1) {
                row.querySelector('.segment-l').value = segData.l ? convertFromMm(segData.l, state.currentUnit).toFixed(1) : '';
            } else {
                row.querySelector('.segment-l').value = '';
            }
            const surfaceValue = segData.w * segData.h;
            row.querySelector('.segment-s-input').value = surfaceValue ? (surfaceValue / surfFactor).toFixed(0) : '';
        }
    });
}

// --- Visibilité et état des segments ---

export function updateVisibleSegments(state, dom, updateChartFn) {
    dom.tableBody.querySelectorAll('.segment-row').forEach((row, i) => {
        row.style.display = i < state.segmentCount ? 'table-row' : 'none';
    });
    updateSegmentsState(state, dom, updateChartFn);
}

function updateSegmentsState(state, dom, updateChartFn) {
    const rows = dom.tableBody.querySelectorAll('.segment-row');
    for (let i = 0; i < state.segmentCount; i++) {
        const row = rows[i];
        if (!row) continue;
        const lengthInput = row.querySelector('.segment-l');
        lengthInput.disabled = (i === state.segmentCount - 1);
        if (i === state.segmentCount - 1) lengthInput.value = '';
    }
    updateChartFn();
}

// --- Insertion / Suppression de segments ---

export function insertSegment(index, before, state, dom, updateChartFn) {
    if (state.segmentCount >= 20) return;
    const rows = Array.from(dom.tableBody.querySelectorAll('.segment-row'));
    const values = [];
    for (let i = 0; i < state.segmentCount; i++) {
        values.push({
            w: rows[i].querySelector('.segment-w').value,
            h: rows[i].querySelector('.segment-h').value,
            l: rows[i].querySelector('.segment-l').value,
            s: rows[i].querySelector('.segment-s-input').value
        });
    }
    const insertionPoint = before ? index : index + 1;
    values.splice(insertionPoint, 0, { w: '', h: '', l: '', s: '' });
    state.segmentCount++;
    dom.segmentCountInput.value = state.segmentCount;

    rows.forEach((row, i) => {
        if (i < values.length) {
            row.querySelector('.segment-w').value = values[i].w;
            row.querySelector('.segment-h').value = values[i].h;
            row.querySelector('.segment-l').value = values[i].l;
            row.querySelector('.segment-s-input').value = values[i].s;
        }
    });
    updateVisibleSegments(state, dom, updateChartFn);
}

export function deleteSegment(index, state, dom, updateChartFn) {
    if (state.segmentCount <= 1) return;
    const rows = Array.from(dom.tableBody.querySelectorAll('.segment-row'));
    const kept = [];
    for (let i = 0; i < state.segmentCount; i++) {
        if (i === index) continue;
        kept.push({
            w: rows[i].querySelector('.segment-w').value,
            h: rows[i].querySelector('.segment-h').value,
            l: rows[i].querySelector('.segment-l').value,
            s: rows[i].querySelector('.segment-s-input').value
        });
    }
    state.segmentCount--;
    dom.segmentCountInput.value = state.segmentCount;
    state.focusedRowIndex = -1;

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
    updateVisibleSegments(state, dom, updateChartFn);
}

// --- Réinitialisation ---

export function clearValues(state, dom, updateChartFn) {
    dom.tableBody.querySelectorAll('input').forEach(input => input.value = '');
    state.segmentCount = 6;
    dom.segmentCountInput.value = 6;
    dom.bestFitResults.textContent = '';
    updateVisibleSegments(state, dom, updateChartFn);
}

export function applyDefaultValues(state, dom, updateChartFn) {
    state.segmentCount = defaultSegments.length;
    dom.segmentCountInput.value = state.segmentCount;
    updateTableUI(defaultSegments, state, dom);
    updateVisibleSegments(state, dom, updateChartFn);
}

// --- Import CSV ---

export function parseAndLoadCsv(csvContent, state, dom, updateChartFn) {
    const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) return;

    let importedSegments = [];

    if (lines[0].includes(',')) {
        importedSegments = lines.map(line => {
            const parts = line.split(',').map(p => parseFloat(p.trim()));
            if (parts.length >= 3 && parts.slice(0, 3).every(p => isFinite(p))) {
                return { w: parts[0], h: parts[1], l: parts[2] };
            }
            return null;
        }).filter(Boolean);

        if (importedSegments.length > 0) {
            importedSegments[importedSegments.length - 1].l = 0;
        }
    } else {
        const values = lines.map(line => {
            const num = parseFloat(line);
            if (!isFinite(num)) return null;
            if (line.toLowerCase().includes('mm2')) return { type: 'area', value: num };
            if (line.toLowerCase().includes('mm')) return { type: 'length', value: num };
            return null;
        }).filter(Boolean);

        if (values.length > 0 && values[0].type === 'area') {
            for (let i = 0; i < values.length; i++) {
                if (values[i].type === 'area') {
                    const s = values[i].value;
                    const dim = Math.sqrt(s);
                    const l = (i + 1 < values.length && values[i + 1].type === 'length') ? values[i + 1].value : 0;
                    importedSegments.push({ w: dim, h: dim, l: l, s: s });
                }
            }
        }
    }

    if (importedSegments.length > 0) {
        const finalSegments = importedSegments.slice(0, 20);
        state.segmentCount = finalSegments.length;
        dom.segmentCountInput.value = state.segmentCount;
        dom.tableBody.querySelectorAll('input').forEach(input => input.value = '');
        updateTableUI(finalSegments, state, dom);
        updateVisibleSegments(state, dom, updateChartFn);
        dom.bestFitResults.textContent = '';
    } else {
        alert('Le fichier n\'a pas pu être analysé. Veuillez vérifier le format et le contenu.');
    }
}
