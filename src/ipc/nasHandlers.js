// =======================================================
// FICHIER :  src/ipc/nasHandlers.js
// RÔLE    :  Gestionnaires IPC pour les interactions NAS
// =======================================================
const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { synologyClient } = require('../core/nasClient');
const { getMainWindow } = require('../core/windowManager');

// --- FONCTION DE VÉRIFICATION DU CLIENT NAS ---
function checkNasClient(handlerName) {
    if (!synologyClient) {
        console.error(`[ERREUR] Appel à '${handlerName}' mais le client NAS n'est pas initialisé.`);
        return { success: false, error: "Configuration du NAS manquante ou fonctionnalité désactivée." };
    }
    return null;
}

// --- FONCTION DE CALCUL DE LA TAILLE TOTALE ---
function calculateTotalSize(paths) {
    let total = 0;
    for (const p of paths) {
        if (!fs.existsSync(p)) continue;
        const stats = fs.statSync(p);
        if (stats.isDirectory()) {
            total += calculateTotalSize(fs.readdirSync(p).map(file => path.join(p, file)));
        } else {
            total += stats.size;
        }
    }
    return total;
}

// --- LOGIQUE D'ENVOI CENTRALISÉE AVEC PROGRESSION ---
async function uploadLocalPathsToNas(event, localPaths, nasDirectoryPath) {
    const error = checkNasClient('uploadLocalPathsToNas');
    if (error) return error;

    const totalSize = calculateTotalSize(localPaths);
    let uploadedSize = 0;

    event.sender.send('upload-progress', { type: 'start' });

    async function uploadDirectory(localDirPath, nasParentPath) {
        const dirName = path.basename(localDirPath);
        const nasCurrentPath = path.posix.join(nasParentPath, dirName);
        await synologyClient.createDirectory(nasCurrentPath);
        const items = fs.readdirSync(localDirPath);
        for (const item of items) {
            const localItemPath = path.join(localDirPath, item);
            const stats = fs.statSync(localItemPath);
            if (stats.isDirectory()) {
                await uploadDirectory(localItemPath, nasCurrentPath);
            } else {
                await uploadFile(localItemPath, nasCurrentPath);
            }
        }
    }

    async function uploadFile(localFilePath, nasParentPath) {
        const fileName = path.basename(localFilePath);
        const nasDestinationPath = path.posix.join(nasParentPath, fileName);
        const readStream = fs.createReadStream(localFilePath);
        const writeStream = synologyClient.createWriteStream(nasDestinationPath);

        readStream.on('data', (chunk) => {
            uploadedSize += chunk.length;
            const percent = totalSize > 0 ? (uploadedSize / totalSize) * 100 : 100;
            event.sender.send('upload-progress', {
                type: 'progress',
                percent: percent,
                message: `Envoi de: ${fileName}`
            });
        });

        readStream.pipe(writeStream);

        return new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', (err) => reject(new Error(`Erreur d'écriture pour ${fileName}: ${err.message}`)));
            readStream.on('error', (err) => reject(new Error(`Erreur de lecture pour ${fileName}: ${err.message}`)));
        });
    }

    try {
        for (const localPath of localPaths) {
            if (!fs.existsSync(localPath)) continue;
            const stats = fs.statSync(localPath);
            if (stats.isDirectory()) {
                await uploadDirectory(localPath, nasDirectoryPath);
            } else {
                await uploadFile(localPath, nasDirectoryPath);
            }
        }
        event.sender.send('upload-progress', { type: 'finish', message: 'Envoi terminé !' });
        return { success: true };
    } catch (uploadError) {
        console.error("[Upload] ERREUR GLOBALE:", uploadError);
        return { success: false, error: uploadError.message };
    }
}


// --- ENREGISTREMENT DES GESTIONNAIRES ---
module.exports.registerNasHandlers = () => {
    ipcMain.handle('synology:delete-item', async (event, nasPath) => {
        const error = checkNasClient('synology:delete-item'); if (error) return error;
        try { await synologyClient.deleteFile(nasPath); return { success: true }; } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('synology:move-item', async (event, sourcePath, targetFolderPath) => {
        const error = checkNasClient('synology:move-item'); if (error) return error;
        try { const itemName = path.posix.basename(sourcePath); const destinationPath = path.posix.join(targetFolderPath, itemName); await synologyClient.moveFile(sourcePath, destinationPath); return { success: true }; } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('synology:list-directory', async (event, directoryPath = '/') => {
        const error = checkNasClient('synology:list-directory'); if (error) return error;
        try { const directoryItems = await synologyClient.getDirectoryContents(directoryPath); const detailedItems = directoryItems.map(item => ({ name: item.basename, type: item.type, path: item.filename, size: item.size, lastModified: item.lastmod })); return { success: true, data: detailedItems }; } catch (err) { return { success: false, error: `Impossible de lister le contenu: ${err.message}` }; }
    });

    ipcMain.handle('synology:download-selected-files', async (event, filesToDownload) => {
        const error = checkNasClient('synology:download-selected-files');
        if (error) return error;
        if (!filesToDownload || filesToDownload.length === 0) return { success: false, error: 'Aucun fichier sélectionné.' };

        const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
            title: 'Sélectionner le dossier de destination',
            properties: ['openDirectory']
        });

        if (canceled || !filePaths || filePaths.length === 0) {
            return { success: false, wasCancelled: true };
        }
        const destinationDirectory = filePaths[0];
        const totalSize = filesToDownload.reduce((acc, file) => acc + file.size, 0);
        let downloadedSize = 0;

        event.sender.send('download-progress', { type: 'start' });

        try {
            for (const file of filesToDownload) {
                const localSavePath = path.join(destinationDirectory, file.name);
                const readStream = synologyClient.createReadStream(file.path);
                const writeStream = fs.createWriteStream(localSavePath);

                readStream.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    const percent = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 100;
                    event.sender.send('download-progress', {
                        type: 'progress',
                        percent: percent,
                        message: `Téléchargement de: ${file.name}`
                    });
                });
                readStream.pipe(writeStream);
                await new Promise((resolve, reject) => {
                    writeStream.on('finish', resolve);
                    writeStream.on('error', (err) => reject(new Error(`Erreur d'écriture pour ${file.name}: ${err.message}`)));
                    readStream.on('error', (err) => reject(new Error(`Erreur de lecture pour ${file.name}: ${err.message}`)));
                });
            }
            event.sender.send('download-progress', { type: 'finish', message: 'Téléchargement terminé !' });
            return { success: true };
        } catch (downloadError) {
            console.error("[Download] ERREUR GLOBALE:", downloadError);
            event.sender.send('download-progress', { type: 'error', message: downloadError.message });
            return { success: false, error: downloadError.message };
        }
    });

    ipcMain.handle('synology:upload-files', async (event, nasDirectoryPath) => {
        const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), { title: 'Sélectionner des fichiers à envoyer', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Tous les fichiers', extensions: ['*'] }] });
        if (canceled || filePaths.length === 0) return { success: false, wasCancelled: true };
        return await uploadLocalPathsToNas(event, filePaths, nasDirectoryPath);
    });

    ipcMain.handle('synology:upload-folder', async (event, nasDirectoryPath) => {
        const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), { title: 'Sélectionner un dossier à envoyer', properties: ['openDirectory', 'multiSelections'] });
        if (canceled || filePaths.length === 0) return { success: false, wasCancelled: true };
        return await uploadLocalPathsToNas(event, filePaths, nasDirectoryPath);
    });

    ipcMain.handle('synology:upload-paths', async (event, localPaths, nasDirectoryPath) => {
        return await uploadLocalPathsToNas(event, localPaths, nasDirectoryPath);
    });
};