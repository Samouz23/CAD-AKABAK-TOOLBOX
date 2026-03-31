// =======================================================
// FICHIER :  src/core/settings.js
// RÔLE    :  Gestion centralisée des paramètres avec electron-store
//            [FINAL] Le chemin "dataRoot" est restauré pour les modules généraux.
// =======================================================
const Store = require('electron-store');
const fs = require('fs');
const path = require('path');

// --- DÉFINITION DES PARAMÈTRES PAR DÉFAUT ---
const defaultSettings = {
  paths: {
    gmsh: "",
    downloads: "",
    dataRoot: "",
    driversFolder: ""
  },
  hotkeys: {
    split: "",
    surface: "",
    points: "",
    export: "",
    togglePanels: "",
    buildInterface: "",
    escape: "escape",
    minimize: ""
  },
  popupsAlwaysOnTop: false,
  showStartupInfo: true,
  abec: {
    lem: { eta: 0.001, etab: 0.001, etaD: 0.001, Rg: 0.1 },
    bem: {
      f1: 100, f2: 5000, numFreq: 24, abscissa: 'log',
      meshFreq: 3000, edgeLength: 10, sym: 'none',
      distance: 1, polarStart: -180, polarEnd: 180, polarPoints: 72,
      basePlane: 'xz', normalized: true, normType: 'PosPolar',
      bodeType: 'LeveldB', rho: 1.21, c: 344
    }
  }
};

// --- INITIALISATION DU STORE ---
const store = new Store();
let appSettings = store.get('settings', defaultSettings);

// --- FUSION ET MISE À JOUR ---
store.set('settings', { 
    ...defaultSettings, 
    ...appSettings, 
    paths: { 
        ...defaultSettings.paths, 
        ...(appSettings.paths || {}) 
    },
    hotkeys: {
        ...defaultSettings.hotkeys,
        ...(appSettings.hotkeys || {})
    },
    abec: {
        lem: { ...defaultSettings.abec.lem, ...(appSettings.abec?.lem || {}) },
        bem: { ...defaultSettings.abec.bem, ...(appSettings.abec?.bem || {}) }
    }
});

// Créer les sous-dossiers au démarrage si dataRoot est configuré
appSettings = store.get('settings', defaultSettings);
if (appSettings.paths?.dataRoot) {
  ensureDataRootSubfolders(appSettings.paths.dataRoot);
}

function ensureDataRootSubfolders(dataRootPath) {
  if (!dataRootPath || dataRootPath.trim() === '') return;
  
  const subfolders = ['Mesh-out', 'STL-out', 'CSV-out', 'ABEC-out'];
  
  try {
    // Vérifier que le dataRoot existe d'abord
    if (!fs.existsSync(dataRootPath)) {
      console.warn(`dataRoot path does not exist: ${dataRootPath}`);
      return;
    }
    
    // Créer les sous-dossiers s'ils n'existent pas
    subfolders.forEach(folder => {
      const folderPath = path.join(dataRootPath, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log(`Created folder: ${folderPath}`);
      }
    });
  } catch (error) {
    console.error('Error creating dataRoot subfolders:', error);
  }
}

function updateSettings(newSettings) {
  appSettings = newSettings;
  store.set('settings', appSettings);
  
  // Créer automatiquement les sous-dossiers si dataRoot est configuré
  if (newSettings.paths?.dataRoot) {
    ensureDataRootSubfolders(newSettings.paths.dataRoot);
  }
}

function getSettings() {
    return store.get('settings', defaultSettings);
}

function resetSettings() {
    appSettings = defaultSettings;
    store.set('settings', defaultSettings);
    return appSettings;
}

// --- EXPORTATIONS ---
module.exports = { 
    store,
    getSettings, 
    updateSettings, 
    resetSettings 
};