// =======================================================
// FICHIER :  src/js/panels/drivers/imageImporter.js
// RÔLE    :  Import de driver par OCR — VERSION "GÉNIE v8.0" FINALE
// OBJECTIF : Précision chirurgicale sur les fiches techniques.
// =======================================================

let __ocrWorker = null;
let __isWorkerInitialized = false;

// Crée et initialise le worker une seule fois pour des performances maximales.
async function getOcrWorker() {
    if (!__ocrWorker) {
        // Nouvelle API Tesseract v5 : createWorker avec langue pré-chargée
        __ocrWorker = await Tesseract.createWorker('eng+fra');
        __isWorkerInitialized = true;
    }
    return __ocrWorker;
}

// =======================================================
// 1. PRÉ-TRAITEMENT D'IMAGE AVEC OPENCV.JS - VERSION OPTIMISÉE
// =======================================================
async function preprocessImageToBlob(file) {
    try {
        // Prétraitement simple avec Canvas API (pas besoin d'OpenCV)
        const canvas = await imageToCanvas(file);
        const ctx = canvas.getContext('2d');
        
        // Augmenter la taille pour améliorer la reconnaissance
        const scale = Math.max(2000 / canvas.height, 1.5);
        const newWidth = Math.floor(canvas.width * scale);
        const newHeight = Math.floor(canvas.height * scale);
        
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = newWidth;
        scaledCanvas.height = newHeight;
        const scaledCtx = scaledCanvas.getContext('2d');
        
        // Améliorer le contraste et la netteté
        scaledCtx.filter = 'contrast(1.5) brightness(1.1) grayscale(100%)';
        scaledCtx.drawImage(canvas, 0, 0, newWidth, newHeight);
        
        return new Promise(resolve => {
            scaledCanvas.toBlob(blob => {
                resolve(new File([blob], file.name.replace(/\.[^.]+$/, '_pre.png'), { type: 'image/png' }));
            }, 'image/png');
        });

    } catch (e) {
        console.error('Erreur durant le pré-traitement:', e);
        return file;
    }
}
// Utilitaire pour charger une image dans un canvas pour OpenCV
function imageToCanvas(file) {
    return new Promise(resolve => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// =======================================================
// 2. DICTIONNAIRES & PARSING "CHIRURGICAL" AMÉLIORÉ
// =======================================================
const PARAMS_DEF = {
  fs:  { aliases: ['fs', 'f\\s*s', 'resonant frequency', 'resonance frequency', 'free air resonance', 'free air'], unit: 'Hz', patterns: ['fs', 'f s', 'resonance.*frequency', 'resonant.*frequency'] },
  Qms: { aliases: ['qms', 'q\\s*ms', 'q\\s*m\\s*s', 'mechanical quality', 'mechanical q', 'q.*mechanical'], unit: '', patterns: ['qms', 'q ms', 'qm s'] },
  Qes: { aliases: ['qes', 'q\\s*es', 'q\\s*e\\s*s', 'electrical quality', 'electrical q', 'q.*electrical'], unit: '', patterns: ['qes', 'q es', 'qe s'] },
  Qts: { aliases: ['qts', 'q\\s*ts', 'q\\s*t\\s*s', 'total quality', 'total q', 'q.*total'], unit: '', patterns: ['qts', 'q ts', 'qt s'] },
  Re:  { aliases: ['re', 'r\\s*e', 'dcr', 'dc resistance', 'voice coil resistance', 'nominal impedance', 'impedance', 'dc.*resistance'], unit: 'Ω', patterns: ['re', 'r e', '^z$', 'impedance', 'resistance'] },
  Le:  { aliases: ['le', 'l\\s*e', 'inductance', 'voice coil inductance', 'coil.*inductance'], unit: 'H', patterns: ['le', 'l e', 'inductance'] },
  BL:  { aliases: ['bl', 'b\\s*l', 'force factor', 'bl factor', 'motor constant', 'force.*factor'], unit: 'N/A', patterns: ['bl', 'b l', '^bi$', 'force.*factor'] },
  Sd:  { aliases: ['sd', 's\\s*d', 'effective area', 'diaphragm area', 'cone area', 'effective surface', 'piston area', 'effective.*area'], unit: 'm²', patterns: ['sd', 's d', 'effective.*area', 'piston.*area'] },
  Mms: { aliases: ['mms', 'm\\s*ms', 'moving mass', 'diaphragm mass', 'moving.*mass'], unit: 'kg', patterns: ['mms', 'm ms', 'moving.*mass'] }
};

function normalizeUnit(value, unitStr, targetUnit) {
    if (!unitStr) return value;
    const unitClean = unitStr.toLowerCase().replace(/[\s\^°]/g, '').replace(/²/g, '2').replace(/[^a-z0-9µω]/g, '');
    
    // Conversions pour l'inductance (Le)
    if (targetUnit === 'H') {
        if (unitClean.includes('mh') || unitClean.match(/m.*h/)) return value * 1e-3;
        if (unitClean.includes('uh') || unitClean.includes('µh')) return value * 1e-6;
        if (unitClean.includes('h') && !unitClean.includes('ohm')) {
            // Si valeur > 0.1 H, probablement en mH
            if (value > 0.1) return value * 1e-3;
        }
    }
    
    // Conversions pour la surface (Sd)
    if (targetUnit === 'm²') {
        if (unitClean.includes('cm2') || unitClean.includes('cm') || unitClean.match(/c.*m.*2/)) return value * 1e-4;
        if (unitClean.includes('mm2') || unitClean.includes('mm')) return value * 1e-6;
        if (unitClean.includes('in2') || unitClean.includes('in') || unitClean.includes('ft')) return value * 0.00064516;
        if (unitClean.includes('m2') || unitClean.includes('m²')) return value;
        // Si pas d'unité mais valeur > 0.5, probablement cm²
        if (!unitClean && value > 0.5) return value * 1e-4;
    }
    
    // Conversions pour la masse (Mms)
    if (targetUnit === 'kg') {
        if (unitClean.match(/^g$/) || (unitClean.includes('g') && !unitClean.includes('k'))) return value * 1e-3;
        if (unitClean.includes('kg')) return value;
        // Si pas d'unité mais valeur > 1, probablement grammes
        if (!unitClean && value > 1) return value * 1e-3;
    }
    
    // Conversions pour la résistance (Re)
    if (targetUnit === 'Ω') {
        if (unitClean.includes('ohm') || unitClean.includes('ω') || unitClean.includes('o')) return value;
    }
    
    return value;
}

function extractParametersFromText(text) {
    const results = {};
    // Nettoyer le texte : remplacer virgules par points, supprimer caractères parasites
    const cleanText = text
        .replace(/[''`]/g, '')  // Supprimer apostrophes
        .replace(/(\d)\s*,\s*(\d)/g, '$1.$2')  // Virgule décimale → point
        .replace(/[|]/g, 'l')  // Corriger barre verticale en I
        .replace(/O(?=\d)/g, '0')  // O devant chiffre → 0
        .replace(/o(?=\d)/g, '0')  // o minuscule devant chiffre → 0
        .replace(/(?<=\d)O(?!\w)/g, '0')  // O après chiffre → 0
        .replace(/l(?<=\s)(?=\d)/g, '1');  // l devant chiffre après espace → 1

    console.log('OCR Raw Text:', text);
    console.log('Cleaned Text:', cleanText);

    // Stratégie 1 : Recherche par tableaux de valeurs
    // Format typique : "Parameter | Symbol | Value"
    const lines = cleanText.split(/\r?\n/);
    
    for (const line of lines) {
        const lineLower = line.toLowerCase();
        
        // Détecter les lignes avec des paramètres T&S
        for (const [paramKey, definition] of Object.entries(PARAMS_DEF)) {
            // Vérifier si la ligne contient l'un des patterns
            const hasPattern = definition.patterns.some(pattern => {
                const regex = new RegExp(`\\b${pattern}\\b`, 'i');
                return regex.test(lineLower);
            });
            
            if (hasPattern) {
                // Trouver la position du pattern dans la ligne
                let patternPosition = -1;
                for (const pattern of definition.patterns) {
                    const regex = new RegExp(`\\b${pattern}\\b`, 'i');
                    const match = lineLower.match(regex);
                    if (match) {
                        patternPosition = match.index;
                        break;
                    }
                }
                
                // Extraire toutes les valeurs numériques de la ligne avec leurs positions
                const valueMatches = [...line.matchAll(/([-+]?\d+\.?\d*)\s*([a-zA-Zµ²Ω°\/\s]+)?/g)];
                
                // Chercher la valeur la plus proche APRÈS le pattern
                let bestMatch = null;
                let minDistance = Infinity;
                
                for (const match of valueMatches) {
                    const value = parseFloat(match[1]);
                    const unit = match[2]?.trim();
                    const valuePosition = match.index;
                    
                    // La valeur doit être après le pattern et valide
                    if (valuePosition > patternPosition && isFinite(value) && value > 0 && value !== 1 && value !== 2) {
                        const distance = valuePosition - patternPosition;
                        if (distance < minDistance) {
                            minDistance = distance;
                            bestMatch = { value, unit };
                        }
                    }
                }
                
                if (bestMatch) {
                    const normalized = normalizeUnit(bestMatch.value, bestMatch.unit, definition.unit);
                    console.log(`Found ${paramKey}: ${bestMatch.value} ${bestMatch.unit || ''} → ${normalized} ${definition.unit}`);
                    results[paramKey] = normalized;
                }
            }
        }
    }
    
    // Stratégie 2 : Recherche contextuelle plus large (si stratégie 1 n'a pas tout trouvé)
    for (const [paramKey, definition] of Object.entries(PARAMS_DEF)) {
        if (results[paramKey]) continue; // Déjà trouvé
        
        const aliases = definition.aliases.join('|');
        // Recherche sur plusieurs lignes potentielles
        const regex = new RegExp(
            `(${aliases})\\s*[:=]?\\s*([\\w\\s]*)?([-+]?\\d+\\.?\\d*)\\s*([a-zA-Zµ²Ω°\\/]+)?`,
            'is'
        );
        
        const match = cleanText.match(regex);
        if (match) {
            const value = parseFloat(match[3]);
            const unit = match[4];
            if (isFinite(value) && value > 0) {
                results[paramKey] = normalizeUnit(value, unit, definition.unit);
            }
        }
    }
    
    return results;
}

// =======================================================
// 3. LOGIQUE PRINCIPALE DE LA VUE
// =======================================================
function getImageImportViewHtml() {
  return `
    <div class="p-6 h-full flex flex-col items-center justify-center text-center">
        <h2 class="text-3xl font-bold text-white mb-6">Import from Image</h2>
        <div id="image-drop-zone" class="w-full max-w-2xl h-64 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-green-500 transition-colors">
            <p class="text-white/80">Drag & drop a datasheet image here</p>
            <p class="text-gray-500 text-sm mt-2">or paste with Ctrl+V</p>
            <button id="image-upload-btn" class="btn btn--primary mt-4">Select File</button>
            <input type="file" id="image-file-input" class="hidden" accept="image/*">
        </div>
        <div id="ocr-status" class="h-10 mt-4 text-white/90"></div>
    </div>
  `;
}

export async function showImageImportView(viewContainer, navButtons, onDataExtractedCallback) {
    // Respect du feature flag OCR
    try {
        const features = await window.electronAPI.getFeatures();
        if (!features?.isDriverOcrEnabled) {
            viewContainer.innerHTML = `
                <div class="p-12 text-center text-white">
                    <h2 class="text-2xl font-bold mb-4">Image Import Disabled</h2>
                    <p class="text-white/80">The OCR/Image Import feature is disabled in Features.</p>
                </div>`;
            return;
        }
    } catch (_) { /* ignore and continue */ }

    viewContainer.innerHTML = getImageImportViewHtml();

  const dropZone = document.getElementById('image-drop-zone');
  const fileInput = document.getElementById('image-file-input');
  const uploadBtn = document.getElementById('image-upload-btn');
  const statusEl = document.getElementById('ocr-status');

  const handlePasteEvent = (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.includes('image')) processBlob(item.getAsFile());
    }
  };
  const cleanup = () => document.removeEventListener('paste', handlePasteEvent);
  navButtons.dbViewBtn.addEventListener('click', cleanup, { once: true });
  navButtons.importViewBtn.addEventListener('click', cleanup, { once: true });

  async function processBlob(inputFile) {
    cleanup();
    if (!inputFile) return;

    statusEl.innerHTML = `<div class="flex items-center justify-center gap-2"><div class="animate-spin w-5 h-5 rounded-full border-2 border-white/20 border-t-white"></div><span id="ocr-progress-text">Initializing OCR engine...</span></div>`;
    const progressText = document.getElementById('ocr-progress-text');
    
    const worker = await getOcrWorker();
    
    progressText.textContent = 'Preprocessing image...';
    const preprocessedBlob = await preprocessImageToBlob(inputFile);

    // Configuration OCR optimisée pour les fiches techniques
    await worker.setParameters({
        tessedit_char_whitelist: '0123456789.,ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzµΩ°²³/- ()@',
        preserve_interword_spaces: '1',
        tessedit_enable_doc_dict: '0',
        tessedit_enable_dict_correction: '0',
        classify_bln_numeric_mode: '1'
    });

    const psmPasses = [
        { psm: '6', name: "Uniform Block" },   // Meilleur pour les tableaux structurés
        { psm: '4', name: "Single Column" },   // Pour colonnes de données
        { psm: '11', name: "Sparse Text" },    // Pour texte éparpillé
    ];
    let allTexts = [];
    let mergedResults = {};

    for (const pass of psmPasses) {
        await worker.setParameters({ tessedit_pageseg_mode: pass.psm });
        
        // Afficher le statut sans logger (pour éviter le problème de clonage)
        const passName = `${pass.name} (${psmPasses.indexOf(pass) + 1}/${psmPasses.length})`;
        if (progressText) {
            progressText.textContent = `Recognizing (${passName})...`;
        }
        
        const { data: { text } } = await worker.recognize(preprocessedBlob);
        
        allTexts.push(text || '');
        const parsedData = extractParametersFromText(text || '');
        
        // Fusionne intelligemment : garde la meilleure valeur (non-zéro, plus précise)
        for (const [key, value] of Object.entries(parsedData)) {
            if (!mergedResults[key] || (value > 0 && mergedResults[key] === 0)) {
                mergedResults[key] = value;
            }
        }
    }
    
    progressText.textContent = 'Processing and validating...';
    
    // Post-traitement intelligent des valeurs
    // Détection automatique des unités incorrectes
    if (mergedResults.Sd) {
        // Si Sd > 0.1 m², probablement en cm² 
        if (mergedResults.Sd > 0.1) mergedResults.Sd *= 1e-4;
        // Si Sd encore trop grand (>0.5m²), c'était probablement en cm² sans conversion
        if (mergedResults.Sd > 0.5) mergedResults.Sd *= 1e-4;
    }
    
    if (mergedResults.Mms) {
        // Si Mms > 0.5 kg, probablement en grammes
        if (mergedResults.Mms > 0.5) mergedResults.Mms *= 1e-3;
        // Si encore > 1 kg, c'était en grammes
        if (mergedResults.Mms > 1) mergedResults.Mms *= 1e-3;
    }
    
    if (mergedResults.Le) {
        // Si Le > 0.1 H, probablement en mH
        if (mergedResults.Le > 0.1) mergedResults.Le *= 1e-3;
        // Si encore > 1 H, c'était en mH
        if (mergedResults.Le > 1) mergedResults.Le *= 1e-3;
    }
    
    // Calcul de Qts si manquant
    if (!mergedResults.Qts && mergedResults.Qms && mergedResults.Qes) {
        mergedResults.Qts = (mergedResults.Qes * mergedResults.Qms) / (mergedResults.Qes + mergedResults.Qms);
    }
    
    // Extraction du nom du driver
    const combinedText = allTexts.join('\n');
    const lines = combinedText.split('\n').map(l => l.trim()).filter(Boolean);
    const headerBan = /(specifications|parameters|thiele|small|technical|dimensions|voice|coil|magnet|diaphragm|suspensions|frequency|response)/i;
    const driverNamePatterns = [
        /([A-Z0-9]{2,}[-\s]?[A-Z0-9]{2,})/,  // Ex: "18SW115", "W18E001"
        /(\d{1,2}["']?\s*[A-Z]+\d+)/i,        // Ex: "18" SW115", "8 inch"
    ];
    
    let foundName = null;
    for (const line of lines.slice(0, 10)) {  // Cherche dans les 10 premières lignes
        if (headerBan.test(line)) continue;
        for (const pattern of driverNamePatterns) {
            const match = line.match(pattern);
            if (match) {
                foundName = match[1].trim();
                break;
            }
        }
        if (foundName) break;
    }
    
    mergedResults.name = foundName || 'Imported Driver';
    
    console.log('Extracted parameters:', mergedResults);
    onDataExtractedCallback(mergedResults);
  }

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => e.target.files.length && processBlob(e.target.files[0]));
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-green-500', 'bg-gray-800/50'); });
  dropZone.addEventListener('dragleave', (e) => dropZone.classList.remove('border-green-500', 'bg-gray-800/50'));
  dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('border-green-500', 'bg-gray-800/50'); if (e.dataTransfer.files.length) processBlob(e.dataTransfer.files[0]); });
  document.addEventListener('paste', handlePasteEvent);
}