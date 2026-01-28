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
    simDbPath: "",
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
  showStartupInfo: true
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
    }
});

// Créer les sous-dossiers au démarrage si dataRoot est configuré
appSettings = store.get('settings', defaultSettings);
if (appSettings.paths?.dataRoot) {
  ensureDataRootSubfolders(appSettings.paths.dataRoot);
}

function ensureDataRootSubfolders(dataRootPath) {
  if (!dataRootPath || dataRootPath.trim() === '') return;
  
  const subfolders = ['Mesh-out', 'STL-out', 'CSV-out'];
  
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