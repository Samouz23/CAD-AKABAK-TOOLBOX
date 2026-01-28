// =======================================================
// FICHIER :  src/ipc/settingsHandlers.js
// RÔLE    :  Gestionnaires IPC pour les paramètres de l'app
// =======================================================
const { ipcMain, BrowserWindow, dialog } = require('electron'); // Ajout de 'dialog'
const { getMainWindow } = require('../core/windowManager');
const { getSettings, updateSettings, resetSettings } = require('../core/settings');

// --- ENREGISTREMENT DES GESTIONNAIRES ---
module.exports.registerSettingsHandlers = () => {
    ipcMain.handle('settings:get', () => {
        return getSettings();
    });

    ipcMain.handle('settings:set', (event, newSettings) => {
        updateSettings(newSettings);
        const mainWindow = getMainWindow();
        BrowserWindow.getAllWindows().forEach(win => {
            // Ne pas rendre la fenêtre principale "alwaysOnTop"
            if (win.id !== mainWindow?.id) {
                win.setAlwaysOnTop(newSettings.popupsAlwaysOnTop);
            }
        });
        return { success: true };
    });

    ipcMain.handle('settings:reset', () => {
        const newSettings = resetSettings();
        const mainWindow = getMainWindow();
        BrowserWindow.getAllWindows().forEach(win => {
            if (win.id !== mainWindow?.id) {
                win.setAlwaysOnTop(newSettings.popupsAlwaysOnTop);
            }
        });
        // Après un reset, on recharge pour s'assurer que tout est bien réinitialisé, y compris les données.
        if (mainWindow) {
            mainWindow.reload();
        }
        return newSettings;
    });

    // --- [NOUVEAU] GESTIONNAIRE POUR CHANGER LE DOSSIER DE DONNÉES ---
    ipcMain.handle('settings:select-data-root', async () => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return { success: false, error: "Fenêtre principale non trouvée." };

        // 1. Ouvre la boîte de dialogue pour sélectionner un dossier
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Sélectionner le dossier de la base de données'
        });

        if (canceled || filePaths.length === 0) {
            return { success: false, canceled: true };
        }

        const newPath = filePaths[0];

        // 2. Met à jour les paramètres avec le nouveau chemin
        const currentSettings = getSettings();
        currentSettings.paths.dataRoot = newPath;
        updateSettings(currentSettings);

        // 3. Force le rechargement de la fenêtre. C'est l'étape la plus importante.
        // L'application va redémarrer et lire les nouveaux paramètres,
        // chargeant ainsi les données du nouveau dossier.
        mainWindow.reload();

        return { success: true, newPath: newPath };
    });

    ipcMain.on('set-zoom', (event, level) => {
        BrowserWindow.getAllWindows().forEach(win => win.webContents.setZoomFactor(level));
    });

    // [SUPPRIMÉ] Le handler 'window-action' est maintenant dans main.js et cible la fenêtre qui a envoyé l'événement
    // pour fonctionner avec tous les popups, pas seulement la fenêtre principale
};