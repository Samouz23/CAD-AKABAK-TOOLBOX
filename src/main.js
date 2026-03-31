// =======================================================
// FICHIER :  src/main.js
// RÔLE    :  Point d'entrée principal et chef d'orchestre de l'application.
//            Gère le cycle de vie de l'app, la création des fenêtres
//            et l'enregistrement des gestionnaires IPC.
// =======================================================
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// --- 1. IMPORTATION DE LA LOGIQUE CORE ---
const featuresModule = require('./features.js');
const features = featuresModule.default || featuresModule;
const { createMainWindow, createSplashWindow, createToolWindow } = require('./core/windowManager');


// --- 2. IMPORTATION ET ENREGISTREMENT DES GESTIONNAIRES IPC ---
const { registerFileSystemHandlers } = require('./ipc/fileSystemHandlers');
const { registerMeshHandlers } = require('./ipc/meshHandlers');
const { registerSettingsHandlers } = require('./ipc/mainsettingsHandlers.js');
const { registerAkabakLemHandlers } = require('./ipc/akabakLemHandlers');

registerFileSystemHandlers();
registerMeshHandlers();
registerSettingsHandlers();
registerAkabakLemHandlers();


// --- 3. GESTIONNAIRES IPC GLOBAUX ---

// [MODIFIÉ] Permet au renderer de connaître les fonctionnalités activées.
ipcMain.handle('features:get-all', () => {
    return {
        isDriverOcrEnabled: features.isDriverOcrEnabled,
        isEnclosureCalculatorEnabled: features.isEnclosureCalculatorEnabled
    };
});

ipcMain.on('open-tool-in-new-window', (event, { toolName, title }) => {
    createToolWindow({ toolName, title });
});

// --- Physical Preview popup: store data, open window, retrieve data ---
let pendingMeshPreviewData = null;
let lastPreviewState = null;
let lastPreviewConfig = null;
let meshPreviewWindow = null;

ipcMain.on('open-mesh-preview', (event, data) => {
    // Merge saved state into new data if available
    if (lastPreviewState) {
        data.savedState = lastPreviewState;
    }
    pendingMeshPreviewData = data;
    // Keep a copy of the config for quick-remesh
    lastPreviewConfig = { ...data };
    delete lastPreviewConfig.savedState;

    // Reuse existing window if still open
    if (meshPreviewWindow && !meshPreviewWindow.isDestroyed()) {
        meshPreviewWindow.webContents.send('reload-preview', data);
        meshPreviewWindow.focus();
        return;
    }

    meshPreviewWindow = createToolWindow({ toolName: 'mesh-preview', title: 'Physical Preview' });
    meshPreviewWindow.on('closed', () => { meshPreviewWindow = null; });
});
ipcMain.handle('get-mesh-preview-data', () => {
    const data = pendingMeshPreviewData;
    pendingMeshPreviewData = null;
    return data;
});
ipcMain.on('save-preview-state', (event, state) => {
    lastPreviewState = state;
});
ipcMain.handle('get-last-preview-state', () => {
    if (!lastPreviewState || !lastPreviewConfig) return null;
    return { state: lastPreviewState, config: lastPreviewConfig };
});
ipcMain.on('show-mesh-preview', () => {
    if (meshPreviewWindow && !meshPreviewWindow.isDestroyed()) {
        meshPreviewWindow.focus();
        return;
    }
    // Reopen with last config + saved state
    if (lastPreviewConfig) {
        const data = { ...lastPreviewConfig };
        if (lastPreviewState) {
            data.savedState = lastPreviewState;
            if (lastPreviewState.currentMshPath) {
                data.mshPath = lastPreviewState.currentMshPath;
            }
        }
        pendingMeshPreviewData = data;
        meshPreviewWindow = createToolWindow({ toolName: 'mesh-preview', title: 'Physical Preview' });
        meshPreviewWindow.on('closed', () => { meshPreviewWindow = null; });
    }
});

// [NOUVEAU] Gestionnaire pour les actions de fenêtre (minimize, maximize, close)
// Cible la fenêtre qui a envoyé l'événement, pas la fenêtre principale
ipcMain.on('window-action', (event, action) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
        console.error('window-action: Aucune fenêtre trouvée pour l\'event sender');
        return;
    }
    
    console.log(`window-action: ${action} sur fenêtre ID ${window.id}`);
    
    switch (action) {
        case 'minimize':
            window.minimize();
            break;
        case 'maximize':
            if (window.isMaximized()) {
                window.unmaximize();
            } else {
                window.maximize();
            }
            break;
        case 'close':
            window.close();
            break;
        default:
            console.error(`window-action: Action inconnue "${action}"`);
    }
});


// --- 4. CYCLE DE VIE DE L'APPLICATION ---

app.whenReady().then(() => {
    const splashWindow = createSplashWindow();
    const mainWindow = createMainWindow();

    const windowReadyPromise = new Promise(resolve => {
        mainWindow.once('ready-to-show', resolve);
    });

    const minDelayPromise = new Promise(resolve => {
        setTimeout(resolve, 2500);
    });

    Promise.all([windowReadyPromise, minDelayPromise]).then(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});