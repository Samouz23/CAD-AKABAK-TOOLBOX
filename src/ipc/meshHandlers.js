// =======================================================
// FICHIER :  src/ipc/meshHandlers.js
// RÔLE    :  Gestionnaires IPC pour le maillage (GMSH)
// =======================================================
const { ipcMain, dialog } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- ENREGISTREMENT DES GESTIONNAIRES ---
module.exports.registerMeshHandlers = () => {
    ipcMain.handle('select-mesh-file', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Sélectionner un fichier de géométrie',
            properties: ['openFile'],
            filters: [
                { name: 'Géométrie', extensions: ['step', 'stp', 'iges', 'igs', 'brep'] },
                { name: 'Tous les fichiers', extensions: ['*'] }
            ]
        });
        return canceled ? null : { canceled: false, filePaths: filePaths };
    });

    ipcMain.handle('run-mesh', async (event, args) => {
        const { gmshPath, downloadsPath, destPath, clmax, curv, fileNameSuffix, sourceFilePath } = args;
        try {
            let inputFile;
            if (sourceFilePath) {
                if (!fs.existsSync(sourceFilePath)) throw new Error(`Le fichier source n'existe pas : ${sourceFilePath}`);
                inputFile = sourceFilePath;
            } else {
                if (!downloadsPath || !fs.existsSync(downloadsPath)) throw new Error("Le dossier de téléchargements n'est pas configuré.");
                const files = fs.readdirSync(downloadsPath)
                    .filter(f => f.toLowerCase().endsWith('.step') || f.toLowerCase().endsWith('.stp'))
                    .map(f => ({ path: path.join(downloadsPath, f), mtime: fs.statSync(path.join(downloadsPath, f)).mtime }))
                    .sort((a, b) => b.mtime - a.mtime);

                if (files.length === 0) throw new Error('Aucun fichier .step/.stp trouvé dans les téléchargements.');
                inputFile = files[0].path;
            }

            fs.mkdirSync(destPath, { recursive: true });
            const baseName = path.parse(inputFile).name;
            const outputFileName = `${baseName}${fileNameSuffix}.msh`;
            const outputPath = path.join(destPath, outputFileName);
            
            const gmshArgs = [
                inputFile,
                '-3',
                '-setnumber', 'Mesh.CharacteristicLengthMax', clmax,
                '-setnumber', 'Mesh.MeshSizeFromCurvature', curv,
                '-format', 'msh2',
                '-o', outputPath
            ];

            return new Promise(resolve => {
                execFile(gmshPath, gmshArgs, (error, stdout, stderr) => {
                    if (error) {
                        resolve({ success: false, error: stderr || error.message });
                    } else {
                        resolve({ success: true, message: `Maillage ${path.basename(outputPath)} généré !` });
                    }
                });
            });
        } catch (e) {
            console.error("Erreur dans run-mesh:", e);
            return { success: false, error: e.message };
        }
    });
};