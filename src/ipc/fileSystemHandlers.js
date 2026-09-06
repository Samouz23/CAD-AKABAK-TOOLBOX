// =======================================================
// FICHIER :  src/ipc/fileSystemHandlers.js
// RÔLE    :  Gestionnaires IPC pour le système de fichiers
// =======================================================
const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path'); // 'path' est utilisé ici en toute sécurité
const { globSync } = require('glob');
const { getSettings } = require('../core/settings');

// --- ENREGISTREMENT DES GESTIONNAIRES ---
module.exports.registerFileSystemHandlers = () => {
    // --- Driver DB path resolution (portable & writable) ---
    const path = require('path');
    const fs = require('fs');

    function getUserDataDbPath() {
        const userDataDir = app.getPath('userData');
        return path.join(userDataDir, 'driverDB.json');
    }

    function getWaveguidePresetsPath() {
        const dbDir = path.join(__dirname, '../js/panels/waveguidestudio/database');
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        return path.join(dbDir, 'waveguidePresets.json');
    }

    function getHornPresetsPath() {
        const dbDir = path.join(__dirname, '../js/panels/hornstudio/database');
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        return path.join(dbDir, 'hornPresets.json');
    }

    function getBundledDbPath() {
        return path.join(__dirname, '../js/panels/driver_db/database/driverDB.json');
    }

    function getCrossoverPresetsPath() {
        const dbDir = path.join(__dirname, '../js/panels/physics/database');
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        return path.join(dbDir, 'crossoverPresets.json');
    }

    function ensureUserDbInitialized() {
        const userDb = getUserDataDbPath();
        if (!fs.existsSync(userDb)) {
            try {
                const bundled = getBundledDbPath();
                if (fs.existsSync(bundled)) {
                    const content = fs.readFileSync(bundled, 'utf8');
                    fs.mkdirSync(path.dirname(userDb), { recursive: true });
                    fs.writeFileSync(userDb, content, 'utf8');
                } else {
                    fs.mkdirSync(path.dirname(userDb), { recursive: true });
                    fs.writeFileSync(userDb, '[]', 'utf8');
                }
            } catch (err) {
                // As a last resort, create empty DB
                try {
                    fs.mkdirSync(path.dirname(userDb), { recursive: true });
                    fs.writeFileSync(userDb, '[]', 'utf8');
                } catch (_) { /* ignore */ }
            }
        }
        return userDb;
    }
    // --- [NOUVEAU] Handlers pour la manipulation des chemins ---
    ipcMain.handle('path:join', (event, ...args) => {
        return path.join(...args);
    });
    ipcMain.handle('path:is-absolute', (event, p) => {
        return path.isAbsolute(p);
    });

    ipcMain.handle('fs:read-file', (event, filePath) => {
        return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
    });

    ipcMain.handle('fs:save-file', (event, { filePath, content }) => {
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content, 'utf8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fs:list-directory', async (event, dirPath) => {
        try {
            await fs.promises.mkdir(dirPath, { recursive: true });
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            return { success: true, entries: entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() })) };
        } catch (error) {
            return { success: true, entries: [] };
        }
    });

    ipcMain.handle('save-file-in-directory', async (event, { directory, fileName, content }) => {
        if (!directory || !fileName || content === undefined) {
            return { success: false, error: 'Arguments manquants.' };
        }
        try {
            await fs.promises.mkdir(directory, { recursive: true });
            const parsed = path.parse(fileName);
            let candidate = fileName;
            let filePath = path.join(directory, candidate);
            let counter = 1;
            while (fs.existsSync(filePath)) {
                candidate = `${parsed.name} ${counter}${parsed.ext}`;
                filePath = path.join(directory, candidate);
                counter += 1;
            }
            await fs.promises.writeFile(filePath, content, 'utf-8');
            return { success: true, path: filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('dialog:openFile', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'Fichiers de données', extensions: ['txt', 'csv'] },
                { name: 'Tous les fichiers', extensions: ['*'] }
            ]
        });
        if (canceled || filePaths.length === 0) return null;
        return fs.readFileSync(filePaths[0], 'utf-8');
    });

    ipcMain.handle('dialog:select-file', async (event, options) => {
        const dialogOptions = {
            properties: ['openFile'],
            filters: options?.filters || [{ name: 'Tous les fichiers', extensions: ['*'] }]
        };
        const { canceled, filePaths } = await dialog.showOpenDialog(dialogOptions);
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('dialog:save-file', async (event, { defaultPath, filters, content } = {}) => {
        try {
            const { canceled, filePath } = await dialog.showSaveDialog({
                defaultPath,
                filters: filters || [{ name: 'Tous les fichiers', extensions: ['*'] }]
            });
            if (canceled || !filePath) return { success: false, canceled: true };
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content ?? '', 'utf8');
            return { success: true, filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('dialog:select-directory', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('db:get-all-drivers', () => {
        const dbPath = ensureUserDbInitialized();
        try {
            const dbContent = fs.readFileSync(dbPath, 'utf8');
            return JSON.parse(dbContent);
        } catch (err) {
            return [];
        }
    });

    ipcMain.handle('db:delete-driver', (event, driverName) => {
        try {
            const dbPath = ensureUserDbInitialized();
            if (!fs.existsSync(dbPath)) return { success: false, error: 'Database not found' };
            
            const dbContent = fs.readFileSync(dbPath, 'utf8');
            const drivers = JSON.parse(dbContent);
            
            const filteredDrivers = drivers.filter(d => d.name !== driverName);
            
            if (filteredDrivers.length === drivers.length) {
                return { success: false, error: 'Driver not found' };
            }
            
            fs.writeFileSync(dbPath, JSON.stringify(filteredDrivers, null, 2), 'utf8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('db:add-driver', (event, driver) => {
        try {
            const dbPath = ensureUserDbInitialized();
            let drivers = [];
            
            if (fs.existsSync(dbPath)) {
                const dbContent = fs.readFileSync(dbPath, 'utf8');
                drivers = JSON.parse(dbContent);
            }
            
            // Vérifier si le driver existe déjà
            const existingIndex = drivers.findIndex(d => d.name === driver.name);
            if (existingIndex >= 0) {
                drivers[existingIndex] = driver;
            } else {
                drivers.push(driver);
            }
            
            fs.writeFileSync(dbPath, JSON.stringify(drivers, null, 2), 'utf8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('db:get-driver-by-id', (event, driverName) => {
        if (!driverName) return null;
        const dbPath = ensureUserDbInitialized();
        if (!fs.existsSync(dbPath)) return null;
        try {
            const dbContent = fs.readFileSync(dbPath, 'utf8');
            const drivers = JSON.parse(dbContent);
            const driver = drivers.find(d => d.name === driverName);
            if (!driver || !driver.params) return null;
            return driver.params;
        } catch (err) {
            return null;
        }
    });

    ipcMain.handle('notes:get-file-tree', () => {
        const { dataRoot } = getSettings().paths;
        if (!dataRoot) return [];
        const notesPath = path.join(dataRoot, 'notes');
        if (!fs.existsSync(notesPath)) fs.mkdirSync(notesPath, { recursive: true });
        
        function readDirRecursive(dir) {
            return fs.readdirSync(dir, { withFileTypes: true })
                .map(d => {
                    const res = path.resolve(dir, d.name);
                    return d.isDirectory()
                        ? { name: d.name, type: 'folder', fullPath: res, children: readDirRecursive(res) }
                        : { name: d.name, type: 'file', path: res };
                })
                .sort((a, b) => (a.type === 'folder' ? -1 : 1) - (b.type === 'folder' ? -1 : 1) || a.name.localeCompare(b.name));
        }
        return readDirRecursive(notesPath);
    });

    // --- Waveguide Presets ---
    ipcMain.handle('waveguide-presets:get-all', () => {
        const presetsPath = getWaveguidePresetsPath();
        if (!fs.existsSync(presetsPath)) return [];
        try {
            return JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
        } catch { return []; }
    });

    ipcMain.handle('waveguide-presets:save', (event, preset) => {
        try {
            const presetsPath = getWaveguidePresetsPath();
            let presets = [];
            if (fs.existsSync(presetsPath)) {
                presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
            }
            const existingIndex = presets.findIndex(p => p.name === preset.name);
            if (existingIndex >= 0) {
                presets[existingIndex] = preset;
            } else {
                presets.push(preset);
            }
            fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2), 'utf8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('waveguide-presets:delete', (event, presetName) => {
        try {
            const presetsPath = getWaveguidePresetsPath();
            if (!fs.existsSync(presetsPath)) return { success: false, error: 'No presets file' };
            let presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
            const filtered = presets.filter(p => p.name !== presetName);
            if (filtered.length === presets.length) return { success: false, error: 'Preset not found' };
            fs.writeFileSync(presetsPath, JSON.stringify(filtered, null, 2), 'utf8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // --- Horn Studio Presets ---
    ipcMain.handle('horn-presets:get-all', () => {
        const presetsPath = getHornPresetsPath();
        if (!fs.existsSync(presetsPath)) return [];
        try {
            return JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
        } catch { return []; }
    });

    ipcMain.handle('horn-presets:save', (event, preset) => {
        try {
            const presetsPath = getHornPresetsPath();
            let presets = [];
            if (fs.existsSync(presetsPath)) {
                presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
            }
            const existingIndex = presets.findIndex(p => p.name === preset.name);
            if (existingIndex >= 0) {
                presets[existingIndex] = preset;
            } else {
                presets.push(preset);
            }
            fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2), 'utf8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('horn-presets:delete', (event, presetName) => {
        try {
            const presetsPath = getHornPresetsPath();
            if (!fs.existsSync(presetsPath)) return { success: false, error: 'No presets file' };
            let presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
            const filtered = presets.filter(p => p.name !== presetName);
            if (filtered.length === presets.length) return { success: false, error: 'Preset not found' };
            fs.writeFileSync(presetsPath, JSON.stringify(filtered, null, 2), 'utf8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // --- Crossover Presets ---
    ipcMain.handle('crossover-presets:get-all', () => {
        const presetsPath = getCrossoverPresetsPath();
        if (!fs.existsSync(presetsPath)) return [];
        try {
            return JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
        } catch { return []; }
    });

    ipcMain.handle('crossover-presets:save', (event, preset) => {
        try {
            const presetsPath = getCrossoverPresetsPath();
            let presets = [];
            if (fs.existsSync(presetsPath)) {
                presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
            }
            const existingIndex = presets.findIndex(p => p.name === preset.name);
            if (existingIndex >= 0) {
                presets[existingIndex] = preset;
            } else {
                presets.push(preset);
            }
            fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2), 'utf8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('crossover-presets:delete', (event, presetName) => {
        try {
            const presetsPath = getCrossoverPresetsPath();
            if (!fs.existsSync(presetsPath)) return { success: false, error: 'No presets file' };
            let presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
            const filtered = presets.filter(p => p.name !== presetName);
            if (filtered.length === presets.length) return { success: false, error: 'Preset not found' };
            fs.writeFileSync(presetsPath, JSON.stringify(filtered, null, 2), 'utf8');
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
};