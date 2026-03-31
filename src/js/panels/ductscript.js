// ====================================================================================================
// FICHIER :  src/js/panels/ductscript.js (VERSION AVEC MISE À JOUR EN TEMPS RÉEL)
// ====================================================================================================

import { defaultTemplates } from '../utils/formulaTemplates.js';

// --- HTML DU PANNEAU ---
export function getDuctscriptPanelHtml() {
    return `
    <div class="p-8 text-green-400 h-full flex flex-col font-mono">
        <div class="flex justify-between items-center mb-6 flex-shrink-0">
            <h1 class="text-4xl font-bold text-white">Duct-Script LEM</h1>
            <div class="flex items-center space-x-4">
                 <button id="unit-switch-btn" class="action-btn w-20">mm</button>
                 <div class="relative"><input type="search" id="horn-driver-search" placeholder="Search for a driver..." class="form-input w-64"><div id="horn-driver-list" class="absolute z-20 w-full bg-gray-900 border themed-border mt-1 rounded-md hidden max-h-60 overflow-y-auto"></div></div>
                 <button id="horn-driver-toggle" class="action-btn min-w-32 max-w-xs whitespace-nowrap overflow-hidden text-ellipsis">[ None ]</button>
            </div>
        </div>
        
        <div class="flex-grow flex flex-col justify-between">
            <div class="flex flex-row space-x-8 items-start">
                <div id="table-container" class="flex-shrink-0 flex flex-col">
                    <div class="flex-grow pr-2">
                        <table class="w-full text-base" style="max-width: 700px; border-spacing: 0 0.5rem; border-collapse: separate;">
                            <thead>
                                <tr class="text-white">
                                    <th class="w-16 p-2 text-left">#</th>
                                    <th class="p-2 text-left" data-unit-label="dim">Width (mm)</th>
                                    <th class="p-2 text-left" data-unit-label="dim">Length (mm)</th>
                                    <th class="w-24 p-2 text-center">Mode</th>
                                </tr>
                            </thead>
                            <tbody id="ducts-table-body">
                                <!-- Dynamically rendered by JavaScript -->
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div id="side-modules-container" style="display:flex; flex-direction:column; gap:20px; padding-top:32px; min-width:320px; padding-left:80px;">
                    <!-- VF MODULE -->
                    <div class="hornscript-module">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                            <button id="vf-toggle-btn" class="action-btn" style="flex:1;">Volume VF</button>
                        </div>
                        <div id="vf-inputs" style="display:none; flex-direction:column; gap:12px;">
                            <div style="display:flex; gap:8px; align-items:center;">
                                <button id="vf1-copy-btn" class="hornscript-copy-btn" title="Copy VF1">●</button>
                                <label class="hornscript-label" style="flex-shrink:0;">VF1 (Liters)</label>
                                <input id="vf1-input" type="text" class="form-input form-input-sm" style="flex:1;">
                            </div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <button id="vf2-copy-btn" class="hornscript-copy-btn" title="Copy VF2">●</button>
                                <label class="hornscript-label" style="flex-shrink:0;">VF2 (Liters)</label>
                                <input id="vf2-input" type="text" class="form-input form-input-sm" style="flex:1;">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="flex justify-between items-end flex-shrink-0">
                <div class="flex items-center space-x-4">
                    <label for="duct-count">Ducts:</label>
                    <input type="text" id="duct-count" min="1" max="20" value="4" class="form-input form-input-sm w-16">
                    <div class="flex items-center">
                       <div class="flex flex-col">
                           <button id="insert-before-btn" title="Insert before" class="h-4 w-4 flex items-center justify-center text-white hover:bg-green-700">▲</button>
                           <button id="insert-after-btn" title="Insert after" class="h-4 w-4 flex items-center justify-center text-white hover:bg-green-700">▼</button>
                       </div>
                       <button id="delete-duct-btn" title="Delete selected duct" class="h-8 w-8 ml-2 flex items-center justify-center text-2xl text-white bg-red-700 hover:bg-red-800 rounded">×</button>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <button id="clear-btn" class="action-btn w-32 bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Clear</button>
                    <button id="copy-formula-btn" class="action-btn w-64 bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Copy Formula</button>
                </div>
            </div>
        </div>
    </div>
    `;
}

// --- LOGIQUE D'INITIALISATION ---
export function initializeDuctscriptPanel(rootElement) {
    let ductCount = 4;
    let data;
    let focusedRowIndex = -1;
    let currentUnit = 'mm';
    let templates = {};

    const getDefaultData = () => Array(20).fill(null).map(() => ({
        width: '', length: '', transitionLength: '', mode: 'W'
    }));

    data = getDefaultData();

    const ductCountInput = rootElement.querySelector('#duct-count');
    const tableBody = rootElement.querySelector('#ducts-table-body');
    const insertBeforeBtn = rootElement.querySelector('#insert-before-btn');
    const insertAfterBtn = rootElement.querySelector('#insert-after-btn');
    const deleteDuctBtn = rootElement.querySelector('#delete-duct-btn');
    const copyFormulaBtn = rootElement.querySelector('#copy-formula-btn');
    const clearBtn = rootElement.querySelector('#clear-btn');
    const driverSearch = rootElement.querySelector('#horn-driver-search');
    const driverList = rootElement.querySelector('#horn-driver-list');
    const driverToggle = rootElement.querySelector('#horn-driver-toggle');
    const unitSwitchBtn = rootElement.querySelector('#unit-switch-btn');
    const vf1Input = rootElement.querySelector('#vf1-input');
    const vf2Input = rootElement.querySelector('#vf2-input');
    
    let allDrivers = [], selectedDriver = null;
    
    function enableCalculationOnEnter(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const input = event.target;
            const expression = input.value.replace(',', '.');
            if (!['+', '-', '*', '/'].some(op => expression.includes(op))) return;
            try {
                const result = new Function('return ' + expression)();
                if (typeof result === 'number' && isFinite(result)) {
                    input.value = result;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            } catch (error) { console.warn("Invalid calculation expression:", expression); }
        }
    }

    const convertToMm = (value, unit) => (unit === 'cm' ? value * 10 : value);
    const convertFromMm = (value, unit) => (unit === 'cm' ? value / 10 : value);

    function copyToClipboardPink(buttonEl, text) {
        navigator.clipboard.writeText(text).then(() => {
            const isGray = buttonEl.classList.contains('text-gray-400');
            buttonEl.classList.remove('text-green-400', 'text-gray-400');
            buttonEl.classList.add('text-pink-500');
            setTimeout(() => {
                buttonEl.classList.remove('text-pink-500');
                if(isGray) buttonEl.classList.add('text-gray-400');
                else buttonEl.classList.add('text-green-400');
            }, 2000);
        }).catch(err => console.error("Copy error:", err));
    }

    function flashButtonColor(buttonEl, duration = 500) {
        const originalColor = window.getComputedStyle(buttonEl).color;
        buttonEl.style.setProperty('color', '#ec4899', 'important');
        buttonEl.style.pointerEvents = 'none';
        setTimeout(() => {
            buttonEl.style.color = '';
            buttonEl.style.pointerEvents = 'auto';
        }, duration);
    }

    function copyToClipboardFeedback(element, textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = element.textContent;
            element.textContent = 'Copied!';
            element.classList.add('text-pink-500');
            setTimeout(() => {
                element.textContent = originalText;
                element.classList.remove('text-pink-500');
            }, 2000);
        }).catch(err => console.error("Copy error:", err));
    }

    function syncDataFromDOM() {
        tableBody.querySelectorAll('tr[data-duct-index]').forEach((row, i) => {
            if (i < ductCount) {
                data[i].width = row.querySelector('.duct-input[data-col="width"]').value;
                data[i].length = row.querySelector('.duct-input[data-col="length"]').value;
                const transitionInput = row.nextElementSibling?.querySelector('.transition-len-input');
                if(transitionInput) data[i].transitionLength = transitionInput.value;
            }
        });
    }
    
    function findPrefixFor(lineStart, template) {
        const regex = new RegExp(`^\\s*${lineStart}\\s*=\\s*@([a-zA-Z0-9_]+)`, 'm');
        const match = template.match(regex);
        return match ? match[1] : null;
    }

    function renderTable() {
        const activeElement = document.activeElement;
        const activeIndex = activeElement?.dataset.index;
        const activeCol = activeElement?.dataset.col;
        tableBody.innerHTML = '';
        for (let i = 0; i < ductCount; i++) {
            const duct = data[i];
            const ductRow = document.createElement('tr');
            ductRow.dataset.ductIndex = i;
            ductRow.dataset.rowIndex = i;
            ductRow.innerHTML = `<td class="p-2 h-12 text-center align-middle" title="Copy formula for Duct ${i + 1}"><button class="copy-duct-btn text-lg font-bold text-green-400 focus:outline-none" data-index="${i}">${i + 1}</button></td><td class="p-1 h-12"><input type="text" class="form-input duct-input h-full" data-index="${i}" data-col="width" value="${duct.width}"></td><td class="p-1 h-12"><input type="text" class="form-input duct-input h-full" data-index="${i}" data-col="length" value="${duct.length}"></td><td class="p-1 h-12 text-center"></td>`;
            tableBody.appendChild(ductRow);
            if (i < ductCount - 1) {
                const transitionRow = document.createElement('tr');
                transitionRow.dataset.rowIndex = i + 0.5;
                const isMassMode = data[i].mode === 'M';
                transitionRow.innerHTML = `<td class="p-2 h-12 text-center align-middle" title="Copy formula for transition ${i + 1}-${i + 2}"><button class="copy-transition-btn text-lg font-bold text-gray-400 focus:outline-none" data-index="${i}">${i + 1}-${i + 2}</button></td><td class="p-1 h-12"><input type="text" class="form-input h-full" disabled value="---" style="background-color:#1a202c;"></td><td class="p-1 h-12"><input type="text" class="form-input transition-len-input h-full" data-index="${i}" data-col="transitionLength" value="${data[i].transitionLength}" ${isMassMode ? 'disabled style="background-color:#1a202c;"' : ''}></td><td class="p-1 h-12 text-center"><button class="mode-switch-btn action-btn w-16 h-full ${isMassMode ? 'bg-yellow-600' : ''}" data-index="${i}" style="${!isMassMode ? 'border-color: var(--btn-primary-border);' : ''}">${data[i].mode}</button></td>`;
                tableBody.appendChild(transitionRow);
            }
        }
        if(activeIndex && activeCol) {
            const newActiveElement = rootElement.querySelector(`input[data-index="${activeIndex}"][data-col="${activeCol}"]`);
            if(newActiveElement) newActiveElement.focus();
        }
    }
    
    function insertDuct(index, before = false) {
        if(ductCount >= 20) return;
        syncDataFromDOM();
        const insertionPoint = before ? index : index + 1;
        data.splice(insertionPoint, 0, { width: '', length: '', transitionLength: '', mode: 'W'});
        data.pop();
        ductCount++;
        ductCountInput.value = ductCount;
        renderTable();
    }
    
    function deleteDuct(index) {
        if(ductCount <= 1) return;
        syncDataFromDOM();
        data.splice(index, 1);
        data.push({ width: '', length: '', transitionLength: '', mode: 'W'});
        ductCount--;
        ductCountInput.value = ductCount;
        focusedRowIndex = -1;
        renderTable();
    }

    async function generateFullLuaScript() {
        syncDataFromDOM();
        const scriptLines = [];
        if (selectedDriver && selectedDriver.name) {
            try {
                const driverParams = await window.electronAPI.getDriverById(selectedDriver.name);
                if (driverParams) {
                    scriptLines.push(`// HP UTILISE : [${selectedDriver.name}]`);
                    const LUA_PARAMS = ['SDf', 'SDr', 'Mms', 'fs', 'Qms', 'Re', 'BL', 'Le'];
                    LUA_PARAMS.forEach(key => { if (driverParams[key] !== undefined) scriptLines.push(`${key} = ${driverParams[key]}`); });
                    scriptLines.push('');
                }
            } catch (error) { console.error("Driver error:", error); }
        }
        
        scriptLines.push('// Hauteur Globale\nH = @HEIGHT*@n - (2*@n)*@WOOD_THICKNESS\n');
        
        const widthPrefix = findPrefixFor('WD', templates.duct) || 'D';
        const lengthPrefix = findPrefixFor('Len', templates.duct) || 'DL';

        const widths = [], lengths = [], transitionLengths = [];
        for (let i = 0; i < ductCount; i++) {
            widths.push(`${widthPrefix}${i + 1} = ${data[i].width || 0}`);
            lengths.push(`${lengthPrefix}${i + 1} = ${data[i].length || 0}`); 
            if (i < ductCount - 1 && data[i].mode === 'W' && data[i].transitionLength) {
                transitionLengths.push(`L${i+1}${i+2} = ${data[i].transitionLength || 0}`);
            }
        }
        scriptLines.push(`// Largeurs des Ducts (${widthPrefix})\n` + widths.join('\n'));
        scriptLines.push(`\n// Longueurs des Ducts (${lengthPrefix})\n` + lengths.join('\n'));
        if (transitionLengths.length > 0) {
            scriptLines.push('\n// Longueurs des Transitions (Waveguides)\n' + transitionLengths.join('\n'));
        }
        
        // Ajouter les volumes VF si présents
        const vf1 = vf1Input.value.trim();
        const vf2 = vf2Input.value.trim();
        if (vf1 || vf2) {
            scriptLines.push('\n// Volumes');
            if (vf1) scriptLines.push(`VF1 = ${vf1}`);
            if (vf2) scriptLines.push(`VF2 = ${vf2}`);
        }
        
        return scriptLines.join('\n');
    }

    function clearAll() {
        data = getDefaultData();
        ductCount = 4;
        ductCountInput.value = ductCount;
        selectedDriver = null;
        driverToggle.textContent = '[ None ]';
        vf1Input.value = '';
        vf2Input.value = '';
        const vfToggleBtn = rootElement.querySelector('#vf-toggle-btn');
        const vfInputs = rootElement.querySelector('#vf-inputs');
        if (vfToggleBtn && vfInputs) {
            vfInputs.style.display = 'none';
            vfToggleBtn.classList.remove('bg-pink-700');
        }
        renderTable();
    }

    async function loadDrivers() {
        try { allDrivers = await window.electronAPI.getAllDrivers(); }
        catch (error) { console.error("Failed to load drivers:", error); allDrivers = []; }
    }

    const refreshSettings = (newSettings) => {
        templates = { ...defaultTemplates, ...newSettings?.templates };
    };

    ductCountInput.addEventListener('input', () => {
        ductCount = Math.max(1, Math.min(20, parseInt(ductCountInput.value, 10) || 1));
        ductCountInput.value = ductCount;
        renderTable();
    });
    ductCountInput.addEventListener('keydown', enableCalculationOnEnter);
    
    insertBeforeBtn.addEventListener('click', () => { if (focusedRowIndex > -1) insertDuct(focusedRowIndex, true); });
    insertAfterBtn.addEventListener('click', () => { if (focusedRowIndex > -1) insertDuct(focusedRowIndex, false); });
    deleteDuctBtn.addEventListener('click', () => { if (focusedRowIndex > -1) deleteDuct(focusedRowIndex); });
    copyFormulaBtn.addEventListener('click', async (e) => copyToClipboardFeedback(e.currentTarget, await generateFullLuaScript()));
    clearBtn.addEventListener('click', clearAll);

    tableBody.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('mode-switch-btn')) {
            const index = parseInt(target.dataset.index, 10);
            syncDataFromDOM();
            data[index].mode = data[index].mode === 'W' ? 'M' : 'W';
            renderTable();
        } else if (target.classList.contains('copy-duct-btn')) {
            const index = parseInt(target.dataset.index, 10);
            const formula = templates.duct.replace(/{i\+1}/g, index + 1);
            copyToClipboardPink(target, formula);
            flashButtonColor(target, 500);
        } else if (target.classList.contains('copy-transition-btn')) {
            const index = parseInt(target.dataset.index, 10);
            const mode = data[index].mode;
            const template = (mode === 'M') ? templates.ductTransitionM : templates.ductTransitionW;
            const formula = template.replace(/{i\+1}/g, index + 1).replace(/{i\+2}/g, index + 2);
            copyToClipboardPink(target, formula);
            flashButtonColor(target, 500);
        }
    });
    
    tableBody.addEventListener('input', (e) => {
        const target = e.target;
        const index = parseInt(target.dataset.index, 10);
        const col = target.dataset.col;
        if (target.classList.contains('duct-input')) data[index][col] = target.value;
        if (target.classList.contains('transition-len-input')) data[index].transitionLength = target.value;
    });

    tableBody.addEventListener('focusin', e => {
        const row = e.target.closest('tr[data-duct-index]');
        if (row) focusedRowIndex = parseInt(row.dataset.ductIndex, 10);
    });

    tableBody.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('input[type="text"]')) {
            enableCalculationOnEnter(e);
            return;
        }
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) || !e.target.matches('input')) return;
        e.preventDefault();
        const currentInput = e.target;
        const currentRow = currentInput.closest('tr');
        const nextRowIndex = parseFloat(currentRow.dataset.rowIndex) + (e.key === 'ArrowUp' ? -0.5 : e.key === 'ArrowDown' ? 0.5 : 0);
        let nextColName = currentInput.dataset.col;
        if (e.key === 'ArrowLeft' && nextColName === 'length') nextColName = 'width';
        if (e.key === 'ArrowRight' && nextColName === 'width') nextColName = 'length';
        const nextRow = tableBody.querySelector(`tr[data-row-index="${nextRowIndex}"]`);
        if (nextRow) {
            const nextInput = nextRow.querySelector(`input[data-col="${nextColName}"]`);
            if (nextInput && !nextInput.disabled) {
                nextInput.focus();
                nextInput.select();
            }
        }
    });
    
    unitSwitchBtn.addEventListener('click', () => {
        syncDataFromDOM();
        const oldUnit = currentUnit;
        currentUnit = oldUnit === 'mm' ? 'cm' : 'mm';
        unitSwitchBtn.textContent = currentUnit;
        rootElement.querySelectorAll('[data-unit-label="dim"]').forEach(el => el.textContent = `${el.textContent.split('(')[0].trim()} (${currentUnit})`);
        tableBody.querySelectorAll('input[type="text"]').forEach(input => {
            if (input.disabled || !input.value) return;
            const valueInMm = convertToMm(parseFloat(input.value) || 0, oldUnit);
            input.value = (convertFromMm(valueInMm, currentUnit)).toFixed(1);
        });
        syncDataFromDOM();
    });

    driverSearch.addEventListener('input', () => {
        const term = driverSearch.value.toLowerCase();
        driverList.classList.toggle('hidden', !term);
        if (term) driverList.innerHTML = allDrivers.filter(d => d.name.toLowerCase().includes(term)).map(d => `<div class="p-2 hover:bg-green-700 cursor-pointer" data-name="${d.name}">${d.name}</div>`).join('');
    });
    
    driverList.addEventListener('click', e => {
        const target = e.target.closest('[data-name]');
        if (target) {
            selectedDriver = { name: target.dataset.name };
            driverToggle.textContent = `[ ${selectedDriver.name} ]`;
            driverList.classList.add('hidden');
            driverSearch.value = '';
        }
    });

    driverToggle.addEventListener('click', () => {
        selectedDriver = null;
        driverToggle.textContent = '[ None ]';
    });
    
    // VF Module
    const vfToggleBtn = rootElement.querySelector('#vf-toggle-btn');
    const vfInputs = rootElement.querySelector('#vf-inputs');
    const vf1CopyBtn = rootElement.querySelector('#vf1-copy-btn');
    const vf2CopyBtn = rootElement.querySelector('#vf2-copy-btn');
    
    if (vfToggleBtn && vfInputs) {
        vfToggleBtn.addEventListener('click', () => {
            const isOpen = vfInputs.style.display === 'flex';
            vfInputs.style.display = isOpen ? 'none' : 'flex';
            vfToggleBtn.classList.toggle('bg-pink-700', !isOpen);
        });

        if (vf1CopyBtn) {
            vf1CopyBtn.addEventListener('click', (e) => {
                const button = e.currentTarget;
                navigator.clipboard.writeText('VF1 = @VF1');
                flashButtonColor(button, 500);
            });
        }

        if (vf2CopyBtn) {
            vf2CopyBtn.addEventListener('click', (e) => {
                const button = e.currentTarget;
                navigator.clipboard.writeText('VF2 = @VF2');
                flashButtonColor(button, 500);
            });
        }
    }

    window.panelEvents.addEventListener('settings-updated', (e) => {
        refreshSettings(e.detail.newSettings);
    });
    
    async function initialLoad() {
        const settings = await window.electronAPI.getSettings();
        refreshSettings(settings);
        renderTable();
        loadDrivers();
    }

    initialLoad();
}