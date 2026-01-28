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
const { registerNasHandlers } = require('./ipc/nasHandlers');
const { registerFileSystemHandlers } = require('./ipc/fileSystemHandlers');
const { registerMeshHandlers } = require('./ipc/meshHandlers');
const { registerSettingsHandlers } = require('./ipc/mainsettingsHandlers.js');

// [IMPORT CONDITIONNEL] Orders handlers - permet la suppression du fichier
let registerOrdersHandlers = null;
if (features.isOrdersManagerEnabled) {
    try {
        ({ registerOrdersHandlers } = require('./ipc/ordersHandlers'));
    } catch (error) {
        console.warn('Impossible de charger ordersHandlers:', error.message);
    }
}

// [NOUVEAU] Stock handlers
const { setupStockHandlers } = require('./ipc/orders/stockHandlers');

if (features.isNasEnabled) {
    registerNasHandlers();
}
if (features.isOrdersManagerEnabled && registerOrdersHandlers) {
    registerOrdersHandlers();
}

registerFileSystemHandlers();
registerMeshHandlers();
registerSettingsHandlers();

// [NOUVEAU] Initialiser les handlers de stock
if (features.isOrdersManagerEnabled) {
    setupStockHandlers(app.getPath('userData'));
}


// --- 3. GESTIONNAIRES IPC GLOBAUX ---

// [MODIFIÉ] Permet au renderer de connaître les fonctionnalités activées.
ipcMain.handle('features:get-all', () => {
    return {
        isNasEnabled: features.isNasEnabled,
        isOrdersManagerEnabled: features.isOrdersManagerEnabled,
        isDriverOcrEnabled: features.isDriverOcrEnabled,
        isEnclosureCalculatorEnabled: features.isEnclosureCalculatorEnabled
    };
});

ipcMain.on('open-tool-in-new-window', (event, { toolName, title }) => {
    createToolWindow({ toolName, title });
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