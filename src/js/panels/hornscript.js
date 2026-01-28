// ====================================================================================================
// FICHIER :  src/js/panels/hornscript.js (VERSION AVEC MISE À JOUR EN TEMPS RÉEL)
// ====================================================================================================

// --- HTML DU PANNEAU ---
export function getHornscriptPanelHtml() {
    const segmentRowsHtml = Array.from({ length: 20 }, (_, i) => `
        <tr class="segment-row" data-index="${i}" style="display: none;">
            <td class="p-2 h-12 flex items-center justify-start">
                <button class="segment-copy-btn text-lg font-bold text-green-400 focus:outline-none"
                        data-index="${i}" title="Copy formula for segment ${i + 1}">
                    ${i + 1}
                </button>
            </td>
            <td class="p-2 h-12 align-middle">
                <input type="text" data-col="w" data-index="${i}" class="form-input segment-w h-full w-full">
            </td>
            <td class="p-2 h-12 align-middle">
                <input type="text" data-col="h" data-index="${i}" class="form-input segment-h h-full w-full">
            </td>
            <td class="p-2 h-12 align-middle">
                <input type="text" data-col="l" data-index="${i}" class="form-input segment-l h-full w-full disabled:bg-gray-700">
            </td>
            <td class="p-2 h-12 align-middle">
                <input type="text" data-col="s" data-index="${i}" class="form-input segment-s-input h-full w-full" disabled>
            </td>
        </tr>
    `).join('');

    const amorceTlRowsHtml = `
        <tr id="tl-amorce-row-o" style="display: none;">
            <td class="p-2 h-12 flex items-center justify-start">
                <button class="tl-copy-btn text-lg font-bold text-yellow-400 focus:outline-none"
                        data-type="O" title="Copy formula for segment O">O</button>
            </td>
            <td class="p-2 h-12 align-middle"><input type="text" class="form-input h-full w-full" disabled value="---"></td>
            <td class="p-2 h-12 align-middle"><input type="text" class="form-input h-full w-full" disabled value="---"></td>
            <td class="p-2 h-12 align-middle"><input id="tl-amorce-lo" type="text" data-col="l" class="form-input h-full w-full"></td>
            <td class="p-2 h-12 align-middle"><input type="text" class="form-input h-full w-full" disabled value="---"></td>
        </tr>
        <tr id="tl-amorce-row-d" style="display: none;">
            <td class="p-2 h-12 flex items-center justify-start">
                <button class="tl-copy-btn text-lg font-bold text-yellow-400 focus:outline-none"
                        data-type="D" title="Copy formula for segment D">D</button>
            </td>
            <td class="p-2 h-12 align-middle"><input type="text" class="form-input h-full w-full" disabled value="---"></td>
            <td class="p-2 h-12 align-middle"><input type="text" class="form-input h-full w-full" disabled value="---"></td>
            <td class="p-2 h-12 align-middle"><input id="tl-amorce-ld" type="text" data-col="l" class="form-input h-full w-full"></td>
            <td class="p-2 h-12 align-middle"><input type="text" class="form-input h-full w-full" disabled value="---"></td>
        </tr>
    `;

    return `
    <div class="p-6 text-green-400 h-full flex flex-col">
        <div class="flex justify-between items-center mb-4 flex-shrink-0">
            <div class="flex items-center space-x-4">
                <h1 class="text-4xl font-bold text-white">Horn-Script LEM</h1>
            </div>
            <div class="flex items-center space-x-4">
                <button id="unit-switch-btn" class="action-btn w-20">mm</button>
                <div class="relative">
                    <input type="search" id="horn-driver-search" placeholder="Search for a driver..." class="form-input w-64">
                    <div id="horn-driver-list" class="absolute z-20 w-full bg-gray-900 border themed-border mt-1 rounded-md hidden max-h-60 overflow-y-auto"></div>
                </div>
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
                                    <th class="p-2 text-left" data-unit-label="dim">Wd (mm)</th>
                                    <th class="p-2 text-left" data-unit-label="dim">Ht (mm)</th>
                                    <th class="p-2 text-left" data-unit-label="dim">Len (mm)</th>
                                    <th class="p-2 text-left" data-unit-label="surf">Area (mm²)</th>
                                </tr>
                            </thead>
                            <tbody id="segments-table-body">
                                ${amorceTlRowsHtml}${segmentRowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div id="side-modules-container" style="display:flex; flex-direction:column; gap:20px; padding-top:32px; min-width:320px; padding-left:80px;">
                    
                    <!-- TL STARTER MODULE -->
                    <div class="hornscript-module">
                        <button id="tl-amorce-toggle-btn" class="action-btn" style="width:100%;">TL Starter</button>
                    </div>
                    
                    <!-- ENCLOSURE MODULE -->
                    <div class="hornscript-module">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                            <button id="enclosure-copy-btn" class="hornscript-copy-btn" title="Copy formula">●</button>
                            <button id="enclosure-toggle-btn" class="action-btn" style="flex:1;">Enclosure</button>
                        </div>
                        <div id="enclosure-inputs" style="display:none; flex-direction:column; gap:12px;">
                            <div>
                                <label class="hornscript-label">VB (Liters)</label>
                                <input id="enclosure-vb" type="text" class="form-input form-input-sm" style="width:100%;">
                            </div>
                            <div>
                                <label class="hornscript-label" data-unit-label="dim">Lb (mm)</label>
                                <input id="enclosure-lb" type="text" class="form-input form-input-sm" style="width:100%;">
                            </div>
                        </div>
                    </div>
                    
                    <!-- VENTED ENCLOSURE MODULE -->
                    <div class="hornscript-module">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                            <button id="vented-enclosure-copy-btn" class="hornscript-copy-btn" title="Copy formula">●</button>
                            <button id="vented-enclosure-toggle-btn" class="action-btn" style="flex:1;">Vented Enclosure</button>
                        </div>
                        <div id="vented-enclosure-inputs" style="display:none; flex-direction:column; gap:12px;">
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                                <div>
                                    <label class="hornscript-label">VB (L)</label>
                                    <input id="vented-vb" type="text" class="form-input form-input-sm" style="width:100%;">
                                </div>
                                <div>
                                    <label class="hornscript-label" data-unit-label="dim">Lb (mm)</label>
                                    <input id="vented-lb" type="text" class="form-input form-input-sm" style="width:100%;">
                                </div>
                            </div>
                            <div>
                                <label class="hornscript-label" data-unit-label="dim">Len (mm)</label>
                                <input id="vented-len" type="text" class="form-input form-input-sm" style="width:100%;">
                            </div>
                            <div>
                                <label class="hornscript-label">Shape</label>
                                <button id="vented-shape-btn" class="action-btn" style="width:100%;">Circle</button>
                            </div>
                            <div id="vented-circle-inputs" style="display:flex; flex-direction:column;">
                                <label class="hornscript-label" data-unit-label="dim">dD (mm)</label>
                                <input id="vented-dd" type="text" class="form-input form-input-sm" style="width:100%;">
                            </div>
                            <div id="vented-rect-inputs" style="display:none; flex-direction:column; gap:12px;">
                                <div id="vented-hd-container" style="display:none;">
                                    <label class="hornscript-label" data-unit-label="dim">HD (mm)</label>
                                    <input id="vented-hd" type="text" class="form-input form-input-sm" style="width:100%;">
                                </div>
                                <div>
                                    <label class="hornscript-label" data-unit-label="dim">WD (mm)</label>
                                    <input id="vented-wd" type="text" class="form-input form-input-sm" style="width:100%;">
                                </div>
                            </div>
                            <div class="hornscript-fb-display">
                                <span id="vented-fb-display"></span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- VF MODULE -->
                    <div class="hornscript-module">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                            <button id="vf-copy-btn" class="hornscript-copy-btn" title="Copy formula">●</button>
                            <button id="vf-toggle-btn" class="action-btn" style="flex:1;">Volume VF</button>
                        </div>
                        <div id="vf-inputs" style="display:none; flex-direction:column; gap:12px;">
                            <div style="display:flex; gap:8px; align-items:center;">
                                <label class="hornscript-label" style="flex-shrink:0;">VF (Liters)</label>
                                <input id="horn-vf-input" type="text" class="form-input form-input-sm" style="flex:1;">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="flex justify-between items-end flex-shrink-0 pt-4">
                <div class="flex items-center space-x-4">
                    <label for="segment-count">Segments:</label>
                    <input type="text" id="segment-count" min="1" max="20" value="5" class="form-input form-input-sm w-16">
                    <div class="flex items-center">
                        <div class="flex flex-col">
                            <button id="insert-before-btn" title="Insert before" class="h-4 w-4 flex items-center justify-center text-white hover:bg-green-700">▲</button>
                            <button id="insert-after-btn" title="Insert after" class="h-4 w-4 flex items-center justify-center text-white hover:bg-green-700">▼</button>
                        </div>
                        <button id="delete-segment-btn" title="Delete segment" class="h-8 w-8 ml-2 flex items-center justify-center text-2xl text-white bg-red-700 hover:bg-red-800 rounded">×</button>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <button id="clear-btn" class="action-btn w-32 bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Clear</button>
                    <button id="copy-formula-btn" class="action-btn w-64 bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Copy formula</button>
                </div>
            </div>
        </div>
    </div>
    `;
}

// --- LOGIQUE D'INITIALISATION ---
export function initializeHornscriptPanel(rootElement) {
    let segmentCount = 5, focusedRowIndex = -1;
    let allDrivers = [], selectedDriver = null;
    let currentUnit = 'mm'; 
    let templates = {}; 
    let moduleState = { on: false, ventedOn: false, ventedShape: 'circle', tlAmorceOn: false, vfOn: false };
    
    const segmentCountInput = rootElement.querySelector('#segment-count');
    const tableBody = rootElement.querySelector('#segments-table-body');
    const driverSearch = rootElement.querySelector('#horn-driver-search');
    const driverList = rootElement.querySelector('#horn-driver-list');
    const driverToggle = rootElement.querySelector('#horn-driver-toggle');
    const insertAfterBtn = rootElement.querySelector('#insert-after-btn');
    const insertBeforeBtn = rootElement.querySelector('#insert-before-btn');
    const deleteSegmentBtn = rootElement.querySelector('#delete-segment-btn');
    const enclosureCopyBtn = rootElement.querySelector('#enclosure-copy-btn');
    const ventedEnclosureCopyBtn = rootElement.querySelector('#vented-enclosure-copy-btn');
    const copyFormulaBtn = rootElement.querySelector('#copy-formula-btn');
    const clearBtn = rootElement.querySelector('#clear-btn');
    const unitSwitchBtn = rootElement.querySelector('#unit-switch-btn');
    const hornVfInput = rootElement.querySelector('#horn-vf-input');

    const C_SOUND = 344000;

    const convertToMm = (value, unit) => (unit === 'cm' ? value * 10 : value);
    const convertFromMm = (value, unit) => (unit === 'cm' ? value / 10 : value);
    const getSurfaceFactor = (unit) => (unit === 'cm' ? 100 : 1);

    const enableInlineCalculation = (inputElement) => {
        inputElement.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const expression = inputElement.value;
                try {
                    const result = eval(expression);
                    if (typeof result === 'number' && isFinite(result)) {
                        inputElement.value = result;
                        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                } catch (error) { console.warn("Expression invalide:", expression); }
            }
        });
    };

    function flashButtonColor(buttonEl, duration = 500) {
        const originalColor = window.getComputedStyle(buttonEl).color;
        buttonEl.style.setProperty('color', '#ec4899', 'important');
        buttonEl.style.pointerEvents = 'none';
        setTimeout(() => {
            buttonEl.style.color = '';
            buttonEl.style.pointerEvents = 'auto';
        }, duration);
    }
    
    function getTableData() {
        const rawSegments = [];
        for (let i = 0; i < segmentCount; i++) {
            const row = tableBody.querySelector(`tr[data-index="${i}"]`);
            if (!row || row.style.display === 'none') continue;
            const w_mm = convertToMm(parseFloat(row.querySelector('.segment-w').value) || 0, currentUnit);
            const h_mm = convertToMm(parseFloat(row.querySelector('.segment-h').value) || 0, currentUnit);
            const l_str = row.querySelector('.segment-l').value;
            const isLastSegment = (i === segmentCount - 1);
            const l_mm = isLastSegment ? 0 : (convertToMm(parseFloat(l_str) || 0, currentUnit));
            rawSegments.push({ index: i, w: w_mm, h: h_mm, l: l_mm });
        }
        return rawSegments;
    }
    
    function isConstantHeight() {
        const rawSegments = getTableData();
        if (rawSegments.length < 2) return true;
        const firstHeight = rawSegments[0].h;
        return rawSegments.every(seg => seg.h === firstHeight);
    }
    
    function updateVentRectInputsVisibility() {
        const hdContainer = rootElement.querySelector('#vented-hd-container');
        if (!hdContainer) return;
        const showHd = (moduleState.ventedShape === 'rectangle' && !isConstantHeight());
        hdContainer.style.display = showHd ? 'flex' : 'none';
    }

    function updateVentedEnclosureFb() {
        const fbDisplay = rootElement.querySelector('#vented-fb-display');
        if (!moduleState.ventedOn || !fbDisplay) { if (fbDisplay) fbDisplay.textContent = ''; return; }
        const Vb_liters = parseFloat(rootElement.querySelector('#vented-vb').value) || 0;
        const Len_mm = convertToMm(parseFloat(rootElement.querySelector('#vented-len').value) || 0, currentUnit);
        const Vb_mm3 = Vb_liters * 1000000;
        let Av_mm2 = 0;
        if (moduleState.ventedShape === 'circle') {
            const dD_mm = convertToMm(parseFloat(rootElement.querySelector('#vented-dd').value) || 0, currentUnit);
            if (dD_mm > 0) Av_mm2 = Math.PI * Math.pow(dD_mm / 2, 2);
        } else {
            const WD_mm = convertToMm(parseFloat(rootElement.querySelector('#vented-wd').value) || 0, currentUnit);
            let HD_mm = 0;
            if (isConstantHeight()) {
                const rawSegments = getTableData();
                HD_mm = rawSegments.length > 0 ? rawSegments[rawSegments.length - 1].h : 0;
            } else { HD_mm = convertToMm(parseFloat(rootElement.querySelector('#vented-hd').value) || 0, currentUnit); }
            if (WD_mm > 0 && HD_mm > 0) Av_mm2 = WD_mm * HD_mm;
        }
        if (Vb_mm3 > 0 && Len_mm > 0 && Av_mm2 > 0) {
            const effective_len_mm = Len_mm + (0.95 * Math.sqrt(Av_mm2));
            const Fb = (C_SOUND / (2 * Math.PI)) * Math.sqrt(Av_mm2 / (Vb_mm3 * effective_len_mm));
            fbDisplay.textContent = `Fb ≈ ${Fb.toFixed(2)} Hz`;
        } else { fbDisplay.textContent = ''; }
    }
    
    async function handleCopyFormula(buttonElement) {
        const scriptText = await generateLuaScript();
        const originalText = buttonElement.textContent;
        try {
            await navigator.clipboard.writeText(scriptText);
            buttonElement.textContent = 'Copied!';
            setTimeout(() => { buttonElement.textContent = originalText; }, 2000);
        } catch (err) { console.error('Error: ', err); buttonElement.textContent = 'Error'; }
    }
    
    function findPrefixFor(lineStart, template) {
        const regex = new RegExp(`^\\s*${lineStart}\\s*=\\s*@([a-zA-Z0-9_]+)`, 'm');
        const match = template.match(regex);
        return match ? match[1] : null;
    }

    async function generateLuaScript() {
        const scriptLines = [];
        if (selectedDriver && selectedDriver.name) {
            try {
                const driverParams = await window.electronAPI.getDriverById(selectedDriver.name);
                if (driverParams) {
                    scriptLines.push(`// HP UTILISE : [${selectedDriver.name}]`);
                    const LUA_PARAMS = ['SDf', 'SDr', 'Mms', 'fs', 'Qms', 'Re', 'BL', 'Le'];
                    LUA_PARAMS.forEach(key => { if (driverParams[key] !== undefined) { scriptLines.push(`${key} = ${driverParams[key]}`); } });
                    scriptLines.push('');
                }
            } catch (error) { console.error("Erreur driver:", error); }
        }
        
        if (moduleState.tlAmorceOn) {
            scriptLines.push('\n// Amorce TL');
            const lo_mm = convertToMm(parseFloat(rootElement.querySelector('#tl-amorce-lo').value) || 0, currentUnit);
            const ld_mm = convertToMm(parseFloat(rootElement.querySelector('#tl-amorce-ld').value) || 0, currentUnit);
            scriptLines.push(`LO = ${lo_mm.toFixed(1)}`);
            scriptLines.push(`LD = ${ld_mm.toFixed(1)}`);
        }
        
        const segmentsData = getTableData();
        if (segmentsData.length === 0) return "// Pas de segments définis";
        
        const allHeights = segmentsData.map(s => s.h);
        const uniqueHeights = [...new Set(allHeights)];
        scriptLines.push('\n// Global Dimensions (Height)');
        if (uniqueHeights.length === 1 && uniqueHeights[0] > 0) {
            scriptLines.push('H = @HEIGHT*@n - (2*@n)*@WOOD_THICKNESS');
        } else {
            allHeights.forEach((h, i) => scriptLines.push(`H${i + 1} = ${h.toFixed(1)}*@N`));
        }

        const template = isConstantHeight() ? templates.hornSegmentConstH : templates.hornSegmentVarH;
        
        const widthPrefix = findPrefixFor('WTh', template) || 'S';
        const lengthPrefix = findPrefixFor('Len', template) || 'L';
        const tFactorPrefix = findPrefixFor('T', template);
        
        scriptLines.push(`\n// Horn Width (${widthPrefix})`);
        segmentsData.forEach((seg, i) => {
            scriptLines.push(`${widthPrefix}${i + 1} = ${seg.w.toFixed(1)}`);
        });

        scriptLines.push(`\n// Horn Length (${lengthPrefix})`);
        segmentsData.forEach((seg, i) => { 
            if (i < segmentsData.length - 1) {
                scriptLines.push(`${lengthPrefix}${i + 1} = ${seg.l.toFixed(1)}`); 
            }
        });

        if (tFactorPrefix) {
            scriptLines.push(`\n// T-Factor (${tFactorPrefix})`);
            for (let i = 0; i < segmentsData.length - 1; i++) { 
                scriptLines.push(`${tFactorPrefix}${i + 1} = 10`); 
            }
        }
        
        if (moduleState.on) {
            scriptLines.push('\n// Enclosure Definition');
            const vb = rootElement.querySelector('#enclosure-vb').value || 0;
            const lb = convertToMm(parseFloat(rootElement.querySelector('#enclosure-lb').value) || 0, currentUnit);
            scriptLines.push(`Vb=${vb}*@N`); scriptLines.push(`Lb=${lb}`);
        } else if (moduleState.ventedOn) {
            scriptLines.push('\n// Vented Enclosure Definition');
            const vb = rootElement.querySelector('#vented-vb').value || 0; 
            const lb = convertToMm(parseFloat(rootElement.querySelector('#vented-lb').value) || 0, currentUnit); 
            const len = convertToMm(parseFloat(rootElement.querySelector('#vented-len').value) || 0, currentUnit);
            scriptLines.push(`Vb=${vb}*@N`); scriptLines.push(`Lb=${lb}`); scriptLines.push(`Len=${len}`);
            if (moduleState.ventedShape === 'circle') {
                const dd = convertToMm(parseFloat(rootElement.querySelector('#vented-dd').value) || 0, currentUnit);
                scriptLines.push(`dD = ${dd}`);
            } else {
                const wd = convertToMm(parseFloat(rootElement.querySelector('#vented-wd').value) || 0, currentUnit);
                scriptLines.push(`wDP = ${wd}`);
                if (!isConstantHeight()) { 
                    const hd = convertToMm(parseFloat(rootElement.querySelector('#vented-hd').value) || 0, currentUnit);
                    scriptLines.push(`hDP = ${hd}*@N`); 
                }
            }
        }
        
        // Ajouter le volume VF si présent
        const vf = hornVfInput.value.trim();
        if (vf) {
            scriptLines.push('\n// Volume');
            scriptLines.push(`VF = ${vf}`);
        }
        
        return scriptLines.join('\n');
    }

    function setupEnclosureListeners() {
        const enclosureToggleBtn = rootElement.querySelector('#enclosure-toggle-btn');
        const enclosureInputs = rootElement.querySelector('#enclosure-inputs');
        const ventedToggleBtn = rootElement.querySelector('#vented-enclosure-toggle-btn');
        const ventedInputs = rootElement.querySelector('#vented-enclosure-inputs');
        const ventedShapeBtn = rootElement.querySelector('#vented-shape-btn');
        const ventedCircleInputs = rootElement.querySelector('#vented-circle-inputs');
        const ventedRectInputs = rootElement.querySelector('#vented-rect-inputs');
        const tlAmorceToggleBtn = rootElement.querySelector('#tl-amorce-toggle-btn');
        const tlAmorceRowO = rootElement.querySelector('#tl-amorce-row-o');
        const tlAmorceRowD = rootElement.querySelector('#tl-amorce-row-d');
        
        enclosureToggleBtn.addEventListener('click', () => {
            moduleState.on = !moduleState.on;
            enclosureInputs.style.display = moduleState.on ? 'flex' : 'none';
            enclosureToggleBtn.classList.toggle('bg-pink-700', moduleState.on);
            if (moduleState.on) {
                moduleState.ventedOn = false;
                ventedInputs.style.display = 'none';
                ventedToggleBtn.classList.remove('bg-pink-700');
                updateVentedEnclosureFb();
            }
        });
        ventedToggleBtn.addEventListener('click', () => {
            moduleState.ventedOn = !moduleState.ventedOn;
            ventedInputs.style.display = moduleState.ventedOn ? 'flex' : 'none';
            ventedToggleBtn.classList.toggle('bg-pink-700', moduleState.ventedOn);
            if (moduleState.ventedOn) {
                moduleState.on = false;
                enclosureInputs.style.display = 'none';
                enclosureToggleBtn.classList.remove('bg-pink-700');
            }
            updateVentedEnclosureFb();
            updateVentRectInputsVisibility();
        });
        ventedShapeBtn.addEventListener('click', () => {
            moduleState.ventedShape = (moduleState.ventedShape === 'circle') ? 'rectangle' : 'circle';
            ventedShapeBtn.textContent = moduleState.ventedShape === 'circle' ? 'Circle' : 'Rectangle';
            ventedCircleInputs.style.display = moduleState.ventedShape === 'circle' ? 'flex' : 'none';
            ventedRectInputs.style.display = moduleState.ventedShape === 'circle' ? 'none' : 'flex';
            updateVentedEnclosureFb();
            updateVentRectInputsVisibility();
        });

        tlAmorceToggleBtn.addEventListener('click', () => {
            moduleState.tlAmorceOn = !moduleState.tlAmorceOn;
            tlAmorceToggleBtn.classList.toggle('bg-pink-700', moduleState.tlAmorceOn);
            const displayStyle = moduleState.tlAmorceOn ? 'table-row' : 'none';
            tlAmorceRowO.style.display = displayStyle;
            tlAmorceRowD.style.display = displayStyle;
        });
        
        // VF Module
        const vfToggleBtn = rootElement.querySelector('#vf-toggle-btn');
        const vfInputs = rootElement.querySelector('#vf-inputs');
        const vfCopyBtn = rootElement.querySelector('#vf-copy-btn');
        
        vfToggleBtn.addEventListener('click', () => {
            moduleState.vfOn = !moduleState.vfOn;
            vfInputs.style.display = moduleState.vfOn ? 'flex' : 'none';
            vfToggleBtn.classList.toggle('bg-pink-700', moduleState.vfOn);
        });
        
        vfCopyBtn.addEventListener('click', (e) => {
            const button = e.currentTarget;
            const textToCopy = 'VF = @VF';
            navigator.clipboard.writeText(textToCopy);
            flashButtonColor(button, 500);
        });

        const ventedInputsForFb = [rootElement.querySelector('#vented-vb'), rootElement.querySelector('#vented-len'), rootElement.querySelector('#vented-dd'), rootElement.querySelector('#vented-wd'), rootElement.querySelector('#vented-hd')];
        ventedInputsForFb.forEach(input => { if (input) input.addEventListener('input', updateVentedEnclosureFb); });
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
        updateVentedEnclosureFb();
        updateVentRectInputsVisibility();
    }
    
    function insertSegment(index, before = false) {
        if (segmentCount >= 20) return;
        const rows = Array.from(tableBody.querySelectorAll('.segment-row'));
        const values = [];
        for(let i=0; i < segmentCount; i++) {
            values.push({
                w: rows[i].querySelector('.segment-w').value,
                h: rows[i].querySelector('.segment-h').value,
                l: rows[i].querySelector('.segment-l').value,
            });
        }
        
        const insertionPoint = before ? index : index + 1;
        values.splice(insertionPoint, 0, { w: '', h: '', l: '' });

        segmentCount++; 
        segmentCountInput.value = segmentCount;

        rows.forEach((row, i) => {
             if (i < values.length) {
                row.querySelector('.segment-w').value = values[i].w;
                row.querySelector('.segment-h').value = values[i].h;
                row.querySelector('.segment-l').value = values[i].l;
             }
        });
        updateVisibleSegments();
    }

    function deleteSegment(index) {
        if (segmentCount <= 1) return; 
        const rows = Array.from(tableBody.querySelectorAll('.segment-row'));
        const valuesToKeep = [];
        for(let i=0; i < segmentCount; i++) {
            if(i === index) continue;
            valuesToKeep.push({
                w: rows[i].querySelector('.segment-w').value,
                h: rows[i].querySelector('.segment-h').value,
                l: rows[i].querySelector('.segment-l').value,
            });
        }
        segmentCount--; 
        segmentCountInput.value = segmentCount; 
        focusedRowIndex = -1; 
        
        rows.forEach((row, i) => {
             if (i < valuesToKeep.length) {
                row.querySelector('.segment-w').value = valuesToKeep[i].w;
                row.querySelector('.segment-h').value = valuesToKeep[i].h;
                row.querySelector('.segment-l').value = valuesToKeep[i].l;
             } else {
                row.querySelector('.segment-w').value = '';
                row.querySelector('.segment-h').value = '';
                row.querySelector('.segment-l').value = '';
             }
        });
        updateVisibleSegments();
    }

    function clearAll() {
        segmentCount = 5;
        segmentCountInput.value = segmentCount;
        
        tableBody.querySelectorAll('input').forEach(input => input.value = '');
        
        selectedDriver = null;
        driverToggle.textContent = '[ None ]';
        
        moduleState.on = false;
        moduleState.ventedOn = false;
        moduleState.tlAmorceOn = false;
        moduleState.vfOn = false;
        rootElement.querySelector('#enclosure-inputs').style.display = 'none';
        rootElement.querySelector('#enclosure-toggle-btn').classList.remove('bg-pink-700');
        rootElement.querySelector('#vented-enclosure-inputs').style.display = 'none';
        rootElement.querySelector('#vented-enclosure-toggle-btn').classList.remove('bg-pink-700');
        rootElement.querySelector('#tl-amorce-toggle-btn').classList.remove('bg-pink-700');
        rootElement.querySelector('#tl-amorce-row-o').style.display = 'none';
        rootElement.querySelector('#tl-amorce-row-d').style.display = 'none';
        rootElement.querySelector('#tl-amorce-lo').value = '';
        rootElement.querySelector('#tl-amorce-ld').value = '';
        rootElement.querySelector('#vf-inputs').style.display = 'none';
        rootElement.querySelector('#vf-toggle-btn').classList.remove('bg-pink-700');
        
        const moduleInputs = rootElement.querySelectorAll('#side-modules-container input');
        moduleInputs.forEach(input => input.value = '');
        
        hornVfInput.value = '';

        updateVisibleSegments();
    }

    async function loadDrivers() { try { allDrivers = await window.electronAPI.getAllDrivers(); } catch (error) { console.error("Failed to load drivers:", error); allDrivers = []; } }
    
    const refreshSettings = (newSettings) => {
        const defaultTemplates = {
            hornSegmentConstH: 'HTh = @H\nHMo = @H\nWTh = @S{i}\nWMo = @S{i+1}\nLen = @L{i}\nT   = @T{i}',
            hornSegmentVarH: 'HTh = @H{i}\nHMo = @H{i+1}\nWTh = @S{i}\nWMo = @S{i+1}\nLen = @L{i}\nT   = @T{i}',
            hornTlAmorce: 'WD  = @S1\nHD  = @H\nLen = @L{type}\neta = @WOOD',
        };
        templates = { ...defaultTemplates, ...newSettings?.templates };
        console.log("Horn-Script templates have been updated.");
    };

    copyFormulaBtn.addEventListener('click', (e) => handleCopyFormula(e.currentTarget));
    clearBtn.addEventListener('click', clearAll);
    segmentCountInput.addEventListener('input', () => { segmentCount = Math.max(1, Math.min(20, parseInt(segmentCountInput.value, 10) || 1)); segmentCountInput.value = segmentCount; updateVisibleSegments(); });
    
    tableBody.addEventListener('input', e => {
        if (!e.target.matches('input')) return;
        const input = e.target; const row = input.closest('.segment-row'); if (!row) return;
        const wInput = row.querySelector('.segment-w'); const hInput = row.querySelector('.segment-h');
        const sInput = row.querySelector('.segment-s-input');
        const w = parseFloat(wInput.value) || 0; const h = parseFloat(hInput.value) || 0;
        sInput.value = (w * h * getSurfaceFactor(currentUnit)).toFixed(0);
        updateVentedEnclosureFb();
        updateVentRectInputsVisibility();
    });

    tableBody.addEventListener('focusin', e => { const row = e.target.closest('.segment-row'); if(row) { focusedRowIndex = parseInt(row.dataset.index, 10); } });
    
    tableBody.addEventListener('click', e => {
        const button = e.target;
        
        if (button.classList.contains('segment-copy-btn')) {
            const segmentIndex = parseInt(button.dataset.index, 10);
            if(segmentIndex >= segmentCount - 1) return;
            const isConstantH = isConstantHeight(); const i = segmentIndex + 1;
            const template = isConstantH ? templates.hornSegmentConstH : templates.hornSegmentVarH;
            const formula = template.replace(/{i}/g, i).replace(/{i\+1}/g, i + 1);
            navigator.clipboard.writeText(formula);
            flashButtonColor(button, 500);
        }
        
        if (button.classList.contains('tl-copy-btn')) {
            const type = button.dataset.type;
            const formula = templates.hornTlAmorce.replace(/{type}/g, type);
            navigator.clipboard.writeText(formula);
            flashButtonColor(button, 500);
        }
    });

    tableBody.addEventListener('keydown', (e) => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        if (!e.target.matches('input[type="text"]')) return;
        e.preventDefault();
        const currentInput = e.target;
        const currentIndex = parseInt(currentInput.dataset.index);
        const currentCol = currentInput.dataset.col;
        const colOrder = ['w', 'h', 'l'];
        const currentColIndex = colOrder.indexOf(currentCol);
        let nextIndex = currentIndex;
        let nextColIndex = currentColIndex;
        if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
        if (e.key === 'ArrowDown') nextIndex = Math.min(segmentCount - 1, currentIndex + 1);
        if (e.key === 'ArrowLeft') nextColIndex = Math.max(0, currentColIndex - 1);
        if (e.key === 'ArrowRight') nextColIndex = Math.min(colOrder.length - 1, currentColIndex + 1);
        const nextColName = colOrder[nextColIndex];
        const nextInput = tableBody.querySelector(`input[data-index="${nextIndex}"][data-col="${nextColName}"]`);
        if (nextInput && !nextInput.disabled) {
            nextInput.focus();
            nextInput.select();
        }
    });
    
    deleteSegmentBtn.addEventListener('click', () => { if (focusedRowIndex > -1) { deleteSegment(focusedRowIndex); } else if (segmentCount > 1) { deleteSegment(segmentCount - 1); } });
    insertBeforeBtn.addEventListener('click', () => { if (focusedRowIndex > -1) insertSegment(focusedRowIndex, true); });
    insertAfterBtn.addEventListener('click', () => { if (focusedRowIndex > -1) insertSegment(focusedRowIndex, false); });
    driverSearch.addEventListener('input', () => { const term = driverSearch.value.toLowerCase(); if (!term) { driverList.classList.add('hidden'); return; } driverList.innerHTML = allDrivers.filter(d => d.name.toLowerCase().includes(term)).map(d => `<div class="p-2 hover:bg-green-700 cursor-pointer" data-name="${d.name}">${d.name}</div>`).join(''); driverList.classList.remove('hidden'); });
    driverList.addEventListener('click', e => { const target = e.target.closest('[data-name]'); if (target) { selectedDriver = { name: target.dataset.name }; driverToggle.textContent = `[ ${selectedDriver.name} ]`; driverList.classList.add('hidden'); driverSearch.value = ''; } });
    driverToggle.addEventListener('click', () => { selectedDriver = null; driverToggle.textContent = '[ None ]'; });
    
    enclosureCopyBtn.addEventListener('click', (e) => { 
        const button = e.currentTarget; 
        const textToCopy = "Vb = @Vb\nLb = @Lb\netab = @wood"; 
        navigator.clipboard.writeText(textToCopy);
        flashButtonColor(button, 500);
    });
    
    ventedEnclosureCopyBtn.addEventListener('click', (e) => {
        const button = e.currentTarget;
        let textToCopy = "Vb   = @Vb\nLb   = @Lb\nLen  = @Len\n";
        if (moduleState.ventedShape === 'circle') { textToCopy += "dD   = @dD"; }
        else { textToCopy += "WD   = @wDP\nHD   = @h"; if (!isConstantHeight()) textToCopy += "\nHD   = @hDP"; }
        textToCopy += "\netab = @wood\netav = @wood";
        navigator.clipboard.writeText(textToCopy);
        flashButtonColor(button, 500);
    });
    
    unitSwitchBtn.addEventListener('click', () => {
        const rows = Array.from(tableBody.querySelectorAll('.segment-row'));
        const valuesInMm = [];
        for(let i=0; i<segmentCount; i++){
            if(rows[i].style.display === 'none') continue;
            const wInput = rows[i].querySelector('.segment-w'); const hInput = rows[i].querySelector('.segment-h'); const lInput = rows[i].querySelector('.segment-l');
            const wVal = wInput.value.trim(); const hVal = hInput.value.trim(); const lVal = lInput.value.trim();
            valuesInMm.push({ w: wVal === '' ? null : convertToMm(parseFloat(wVal) || 0, currentUnit), h: hVal === '' ? null : convertToMm(parseFloat(hVal) || 0, currentUnit), l: lVal === '' ? null : convertToMm(parseFloat(lVal) || 0, currentUnit), });
        }
        currentUnit = currentUnit === 'mm' ? 'cm' : 'mm';
        unitSwitchBtn.textContent = currentUnit;
        const dimUnitLabel = `(${currentUnit})`;
        const surfUnitLabel = `(${currentUnit}²)`;
        rootElement.querySelectorAll('[data-unit-label="dim"]').forEach(el => el.textContent = el.textContent.split('(')[0] + dimUnitLabel);
        rootElement.querySelectorAll('[data-unit-label="surf"]').forEach(el => el.textContent = el.textContent.split('(')[0] + surfUnitLabel);
        rows.forEach((row, i) => {
            if (i < valuesInMm.length) {
                const segData = valuesInMm[i];
                row.querySelector('.segment-w').value = segData.w !== null ? convertFromMm(segData.w, currentUnit).toFixed(1) : '';
                row.querySelector('.segment-h').value = segData.h !== null ? convertFromMm(segData.h, currentUnit).toFixed(1) : '';
                row.querySelector('.segment-l').value = segData.l !== null ? convertFromMm(segData.l, currentUnit).toFixed(1) : '';
            }
        });
        const enclosureLb = rootElement.querySelector('#enclosure-lb');
        if (enclosureLb && enclosureLb.value.trim() !== '') {
            enclosureLb.value = convertFromMm(convertToMm(parseFloat(enclosureLb.value), currentUnit === 'mm' ? 'cm' : 'mm'), currentUnit).toFixed(1);
        }
        if(rows.length > 0 && rows[0].style.display !== 'none') {
            rows[0].querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
    
    window.panelEvents.addEventListener('export-to-hornscript', (e) => {
        const { segments, count, unit } = e.detail;
        segmentCount = count;
        segmentCountInput.value = count;
        if(currentUnit !== unit) {
            currentUnit = unit;
            unitSwitchBtn.textContent = unit;
            const dimUnitLabel = `(${unit})`;
            rootElement.querySelectorAll('[data-unit-label="dim"]').forEach(el => el.textContent = el.textContent.split('(')[0] + dimUnitLabel);
            rootElement.querySelectorAll('[data-unit-label="surf"]').forEach(el => el.textContent = el.textContent.split('(')[0] + `(${unit}²)`);
        }
        tableBody.querySelectorAll('input').forEach(input => input.value = '');
        tableBody.querySelectorAll('.segment-row').forEach((row, i) => {
            if(i < segments.length) {
                const segData = segments[i];
                row.querySelector('.segment-w').value = convertFromMm(segData.w, currentUnit).toFixed(1);
                row.querySelector('.segment-h').value = convertFromMm(segData.h, currentUnit).toFixed(1);
                if (i < segments.length - 1) {
                    row.querySelector('.segment-l').value = convertFromMm(segData.l, currentUnit).toFixed(1);
                }
                row.querySelector('.segment-w').dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        updateVisibleSegments();
    });
    
    window.panelEvents.addEventListener('settings-updated', (e) => {
        refreshSettings(e.detail.newSettings);
    });

    async function initialLoad() {
        const settings = await window.electronAPI.getSettings();
        refreshSettings(settings);
        updateVisibleSegments();
        setupEnclosureListeners();
        loadDrivers();
        const allCalculableInputs = Array.from(rootElement.querySelectorAll('input[type="text"]'));
        allCalculableInputs.forEach(input => {
            if (input && input.id !== 'horn-driver-search') {
                enableInlineCalculation(input);
            }
        });
    }

    initialLoad();
}