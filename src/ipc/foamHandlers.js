// =======================================================
// FICHIER :  src/ipc/foamHandlers.js
// RÔLE    :  Gestionnaires IPC pour le backend CFD OpenFOAM (via WSL)
//
// La logique réelle vit dans foamRunner/foamVentRun (testables hors Electron).
// Ce fichier n'expose que la surface IPC.
// =======================================================
const { ipcMain, app } = require('electron');
const path = require('path');
const foam = require('./foamRunner');
const ventRun = require('./foamVentRun');

// La détection traverse WSL et coûte quelques secondes: on la mémorise.
let cachedEnv = null;

// Un seul calcul CFD à la fois: il sature déjà tous les cœurs.
let currentRun = null;

// Idem pour l'installation: apt ne supporte pas deux clients simultanés.
let currentInstall = null;

module.exports.registerFoamHandlers = () => {
    // Renvoie l'état du backend CFD. `refresh: true` force une nouvelle sonde,
    // par exemple après que l'utilisateur a installé OpenFOAM.
    ipcMain.handle('foam:check-availability', async (event, options = {}) => {
        if (cachedEnv && !options.refresh) return cachedEnv;
        try {
            cachedEnv = await foam.checkAvailability();
        } catch (error) {
            cachedEnv = {
                available: false,
                distro: null,
                reason: error?.message || String(error),
            };
        }
        return cachedEnv;
    });

    // Résout Navier-Stokes dans l'event et renvoie le champ de vitesse
    // échantillonné aux points du Field BEM.
    ipcMain.handle('foam:run-vent-cfd', async (event, spec = {}) => {
        if (currentRun) return { ok: false, reason: 'un calcul CFD est déjà en cours' };
        const controller = new AbortController();
        currentRun = controller;
        try {
            return await ventRun.runVentCase(spec, {
                workDir: path.join(app.getPath('userData'), 'cfd'),
                env: cachedEnv,
                signal: controller.signal,
                onProgress: payload => {
                    if (!event.sender.isDestroyed()) event.sender.send('foam:progress', payload);
                },
            });
        } catch (error) {
            return { ok: false, reason: error?.message || String(error) };
        } finally {
            currentRun = null;
        }
    });

    ipcMain.handle('foam:cancel', () => {
        if (!currentRun) return { cancelled: false };
        currentRun.abort();
        return { cancelled: true };
    });

    // Installe OpenFOAM dans une distribution WSL existante. Rien ici ne
    // demande de privilèges Windows : tout se passe en root dans la distro.
    ipcMain.handle('foam:install-openfoam', async (event, options = {}) => {
        if (currentInstall) return { ok: false, reason: 'une installation est déjà en cours' };
        const controller = new AbortController();
        currentInstall = controller;
        try {
            const result = await foam.installOpenFoam(options.distro || foam.PREFERRED_DISTRO, {
                version: options.version,
                signal: controller.signal,
                onLine: line => {
                    if (!event.sender.isDestroyed()) event.sender.send('foam:install-progress', line);
                },
            });
            // La sonde mémorisée décrit un système qui vient de changer.
            if (result.ok) cachedEnv = null;
            return result;
        } catch (error) {
            return { ok: false, reason: error?.message || String(error) };
        } finally {
            currentInstall = null;
        }
    });

    ipcMain.handle('foam:cancel-install', () => {
        if (!currentInstall) return { cancelled: false };
        currentInstall.abort();
        return { cancelled: true };
    });
};
