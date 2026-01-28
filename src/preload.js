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
  
  // --- Commandes, Clients, Projets ---
  generateOrderPdf: (data) => ipcRenderer.invoke('orders:generate-pdf', data),
  generateCDCPdf: (data) => ipcRenderer.invoke('orders:generate-cdc-pdf', data),
  generateQuittancePdf: (data) => ipcRenderer.invoke('orders:generate-quittance-pdf', data),
  getNextInvoiceNumber: () => ipcRenderer.invoke('orders:get-next-invoice-number'),
  getAllClients: () => ipcRenderer.invoke('db:get-all-clients'),
  saveClient: (clientData) => ipcRenderer.invoke('db:save-client', clientData),
  deleteClient: (clientId) => ipcRenderer.invoke('db:delete-client', clientId),
  getAllProjects: () => ipcRenderer.invoke('db:get-all-projects'),
  saveProject: (projectData) => ipcRenderer.invoke('db:save-project', projectData),
  updateProject: (projectId, updatedData) => ipcRenderer.invoke('db:update-project', projectId, updatedData),
  deleteProject: (projectId) => ipcRenderer.invoke('db:delete-project', projectId),
  addProjectPayment: (data) => ipcRenderer.invoke('project:add-payment', data),
  addProjectTip: (data) => ipcRenderer.invoke('project:add-tip', data),


  // --- Lexique et Comptabilité ---
  // --- Comptabilité (via comptabilite.json) ---
  getAllTransactions: () => ipcRenderer.invoke('db:get-all-transactions'),
  addProjectPayment: (data) => ipcRenderer.invoke('project:add-payment', data),
  addProjectTip: (data) => ipcRenderer.invoke('project:add-tip', data),
  saveExpense: (expenseData) => ipcRenderer.invoke('expenses:save', expenseData),
  deleteExpense: (expenseId) => ipcRenderer.invoke('expenses:delete', expenseId),

  // --- Stock (Gestion d'inventaire avec système de fichiers) ---
  stockScan: () => ipcRenderer.invoke('stock:scan'),
  stockCreateFolder: (name, parentPath) => ipcRenderer.invoke('stock:create-folder', name, parentPath),
  stockRename: (oldPath, newName) => ipcRenderer.invoke('stock:rename', oldPath, newName),
  stockDelete: (itemPath) => ipcRenderer.invoke('stock:delete', itemPath),
  stockUpdateMetadata: (itemPath, updates) => ipcRenderer.invoke('stock:update-metadata', itemPath, updates),
  stockOpenFile: (itemPath) => ipcRenderer.invoke('stock:open-file', itemPath),
  stockGetRootPath: () => ipcRenderer.invoke('stock:get-root-path'),
  stockOpenFolder: (itemPath) => ipcRenderer.invoke('stock:open-folder', itemPath),

  // --- API pour le Synology NAS ---
  listSynologyDirectory: (path) => ipcRenderer.invoke('synology:list-directory', path),
  downloadSelectedFiles: (files) => ipcRenderer.invoke('synology:download-selected-files', files),
  uploadFilesToNas: (nasPath) => ipcRenderer.invoke('synology:upload-files', nasPath),
  uploadFolderToNas: (nasPath) => ipcRenderer.invoke('synology:upload-folder', nasPath),
  uploadPaths: (localPaths, nasPath) => ipcRenderer.invoke('synology:upload-paths', localPaths, nasPath),
  onUploadProgress: (callback) => ipcRenderer.on('upload-progress', callback),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback),
  moveNasItem: (sourcePath, targetFolderPath) => ipcRenderer.invoke('synology:move-item', sourcePath, targetFolderPath),
  deleteNasItem: (nasPath) => ipcRenderer.invoke('synology:delete-item', nasPath),
  
  // --- Actions de fenêtre et Alias ---
  saveDriverData: (args) => ipcRenderer.invoke('fs:save-file', args),
  saveNote: (args) => ipcRenderer.invoke('fs:save-file', args),
  windowAction: (action) => ipcRenderer.send('window-action', action),

   // =======================================================
  // [NOUVEAU] Fonctions exposées pour les nouvelles fonctionnalités
  // =======================================================
  getProjectFiles: (projectId) => ipcRenderer.invoke('project:get-files', projectId),
  openProjectFolder: (projectId) => ipcRenderer.invoke('project:open-folder', projectId),
  addProjectFiles: (projectId) => ipcRenderer.invoke('project:add-files', projectId),
  createBackup: () => ipcRenderer.invoke('backup:create'),
  openPath: (filePath) => ipcRenderer.send('shell:open-path', filePath), 
});