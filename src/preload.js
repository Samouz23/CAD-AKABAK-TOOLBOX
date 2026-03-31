// =======================================================
// FICHIER :  src/preload.js
// =======================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- [CORRECTION CRITIQUE] On expose les handlers IPC, pas les fonctions Node directes ---
  joinPath: (...args) => ipcRenderer.invoke('path:join', ...args),
  isPathAbsolute: (p) => ipcRenderer.invoke('path:is-absolute', p),

  // --- Général ---
  openToolInNewWindow: (tool) => ipcRenderer.send('open-tool-in-new-window', tool),
  getToolNameToLoad: () => process.argv.find(arg => arg.startsWith('--tool='))?.split('=')[1] || null,
  getFeatures: () => ipcRenderer.invoke('features:get-all'),
  openPath: (filePath) => ipcRenderer.send('shell:open-path', filePath),

  // --- Settings ---
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  setZoom: (level) => ipcRenderer.send('set-zoom', level),
  
  // --- Fichiers & Dialogues Locaux ---
  readFile: (filePath) => ipcRenderer.invoke('fs:read-file', filePath),
  saveFile: (args) => ipcRenderer.invoke('fs:save-file', args),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  selectFile: (options) => ipcRenderer.invoke('dialog:select-file', options),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  saveFileInDirectory: (args) => ipcRenderer.invoke('save-file-in-directory', args),
  selectMeshFile: () => ipcRenderer.invoke('select-mesh-file'),

  // --- Panneaux Spécifiques ---
  getAllDrivers: () => ipcRenderer.invoke('db:get-all-drivers'),
  deleteDriver: (driverName) => ipcRenderer.invoke('db:delete-driver', driverName),
  addDriver: (driver) => ipcRenderer.invoke('db:add-driver', driver),
  getDriverById: (driverId) => ipcRenderer.invoke('db:get-driver-by-id', driverId),
  getNotesTree: () => ipcRenderer.invoke('notes:get-file-tree'),
  runMesh: (args) => ipcRenderer.invoke('run-mesh', args),
  parseMshPreview: (mshPath) => ipcRenderer.invoke('parse-msh-preview', mshPath),
  applyMirrorMsh: (args) => ipcRenderer.invoke('apply-mirror-msh', args),
  openMeshPreview: (data) => ipcRenderer.send('open-mesh-preview', data),
  showMeshPreview: () => ipcRenderer.send('show-mesh-preview'),
  getMeshPreviewData: () => ipcRenderer.invoke('get-mesh-preview-data'),
  savePreviewState: (state) => ipcRenderer.send('save-preview-state', state),
  onReloadPreview: (callback) => ipcRenderer.on('reload-preview', (event, data) => callback(data)),
  getLastPreviewState: () => ipcRenderer.invoke('get-last-preview-state'),
  remeshPreview: (args) => ipcRenderer.invoke('remesh-preview', args),
  exportMesh: (args) => ipcRenderer.invoke('export-mesh', args),

  // --- Actions de fenêtre et Alias ---
  saveDriverData: (args) => ipcRenderer.invoke('fs:save-file', args),
  saveNote: (args) => ipcRenderer.invoke('fs:save-file', args),
  windowAction: (action) => ipcRenderer.send('window-action', action),

  // --- Akabak LEM ---
  generateLemFile: (args) => ipcRenderer.invoke('akabak-lem:generate', args),

  // --- Waveguide Presets ---
  getWaveguidePresets: () => ipcRenderer.invoke('waveguide-presets:get-all'),
  saveWaveguidePreset: (preset) => ipcRenderer.invoke('waveguide-presets:save', preset),
  deleteWaveguidePreset: (name) => ipcRenderer.invoke('waveguide-presets:delete', name),
});