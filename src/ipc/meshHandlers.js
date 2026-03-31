// =======================================================
// FICHIER :  src/ipc/meshHandlers.js
// RÔLE    :  Gestionnaires IPC pour le maillage (GMSH)
// =======================================================
const { ipcMain, dialog } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function parseStepShellGroups(stepContent) {
    const dataStart = stepContent.indexOf('DATA;');
    if (dataStart === -1) throw new Error('Invalid STEP file: no DATA section found');

    const normalized = stepContent.substring(dataStart).replace(/\r?\n/g, ' ');
    const shellRegex = /(?:OPEN_SHELL|CLOSED_SHELL)\s*\(\s*'[^']*'\s*,\s*\(([^)]+)\)/g;
    const shellGroups = [];
    let match;

    while ((match = shellRegex.exec(normalized)) !== null) {
        const refs = match[1]
            .split(',')
            .map(ref => ref.trim())
            .filter(ref => ref.startsWith('#'));
        shellGroups.push(refs.length);
    }

    if (shellGroups.length === 0) {
        throw new Error('No surface bodies (shells) found in STEP file.');
    }

    return shellGroups;
}

function parseMshPhysicalNames(mshPath) {
    const raw = fs.readFileSync(mshPath, 'utf-8');
    const lines = raw.split(/\r?\n/);
    let section = null;
    const tagToName = {};
    const nameToTag = {};
    const orderedTags = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('$') && !trimmed.startsWith('$End')) {
            section = trimmed;
            continue;
        }
        if (trimmed.startsWith('$End')) {
            section = null;
            continue;
        }
        if (section !== '$PhysicalNames') continue;

        const match = trimmed.match(/^(\d+)\s+(\d+)\s+"([^"]+)"/);
        if (!match) continue;

        const tag = parseInt(match[2], 10);
        const name = match[3];
        orderedTags.push(tag);
        tagToName[tag] = name;
        nameToTag[name] = tag;
    }

    return { tagToName, nameToTag, orderedTags };
}

function sanitizePositiveNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function buildNamedPhysicalGroups(groups) {
    let surfaceIndex = 1;

    return groups.map(group => ({
        ...group,
        name: `S${surfaceIndex++}`,
    }));
}

function createDefaultPhysicalGroups(shellGroups, defaultMeshSize, defaultCurveMeshSize) {
    return buildNamedPhysicalGroups(shellGroups.map((_, index) => ({
        shellIndices: [index],
        meshSize: defaultMeshSize,
        curveMeshSize: defaultCurveMeshSize,
        isInterface: false,
    })));
}

function buildPhysicalGeo(inputFile, shellGroups, config) {
    const defaultMeshSize = sanitizePositiveNumber(config.defaultMeshSize, 50);
    const defaultCurveMeshSize = sanitizePositiveNumber(config.defaultCurveMeshSize, defaultMeshSize);
    const groups = Array.isArray(config.groups) && config.groups.length > 0
        ? buildNamedPhysicalGroups(config.groups.map(group => ({
            shellIndices: Array.from(new Set((group.shellIndices || []).map(Number).filter(Number.isInteger))).sort((a, b) => a - b),
            meshSize: sanitizePositiveNumber(group.meshSize, defaultMeshSize),
            curveMeshSize: sanitizePositiveNumber(group.curveMeshSize, defaultCurveMeshSize),
            isInterface: Boolean(group.isInterface),
        })))
        : createDefaultPhysicalGroups(shellGroups, defaultMeshSize, defaultCurveMeshSize);

    const offsets = [];
    let offset = 0;
    for (const faceCount of shellGroups) {
        offsets.push(offset);
        offset += faceCount;
    }

    const coveredShells = new Set();
    for (const group of groups) {
        if (group.shellIndices.length === 0) {
            throw new Error('Each physical group must contain at least one surface.');
        }
        for (const shellIndex of group.shellIndices) {
            if (shellIndex < 0 || shellIndex >= shellGroups.length) {
                throw new Error(`Invalid surface index ${shellIndex + 1} in physical group.`);
            }
            if (coveredShells.has(shellIndex)) {
                throw new Error(`Surface ${shellIndex + 1} is assigned more than once.`);
            }
            coveredShells.add(shellIndex);
        }
    }

    if (coveredShells.size !== shellGroups.length) {
        throw new Error('All surfaces must be assigned to exactly one physical group.');
    }

    // Build surface refs per group (computed once, used for both Physical and Field)
    const groupSurfaceRefs = groups.map(group =>
        group.shellIndices.flatMap(shellIndex => {
            const shellOffset = offsets[shellIndex];
            return Array.from({ length: shellGroups[shellIndex] }, (_, i) => `surfs(${shellOffset + i})`);
        })
    );

    const geoLines = [
        'SetFactory("OpenCASCADE");',
        `Merge "${inputFile.replace(/\\/g, '/')}";`,
        'surfs() = Surface{:};',
    ];

    // Physical surface groups
    groups.forEach((group, gi) => {
        geoLines.push(`Physical Surface("${group.name}") = {${groupSurfaceRefs[gi].join(', ')}};`);
    });

    // Per-group mesh sizes via Background Field (Restrict per surface list)
    // This is the only reliable way to achieve different mesh sizes per surface in Gmsh.
    groups.forEach((group, gi) => {
        const sizeId   = gi * 2 + 1;
        const restId   = gi * 2 + 2;
        const refs     = groupSurfaceRefs[gi].join(', ');
        geoLines.push(`Field[${sizeId}] = MathEval;`);
        geoLines.push(`Field[${sizeId}].F = "${group.meshSize}";`);
        geoLines.push(`Field[${restId}] = Restrict;`);
        geoLines.push(`Field[${restId}].InField = ${sizeId};`);
        geoLines.push(`Field[${restId}].SurfacesList = {${refs}};`);
    });

    const minId = groups.length * 2 + 1;
    const restrictIds = groups.map((_, gi) => gi * 2 + 2).join(', ');
    geoLines.push(`Field[${minId}] = Min;`);
    geoLines.push(`Field[${minId}].FieldsList = {${restrictIds}};`);
    geoLines.push(`Background Field = ${minId};`);
    geoLines.push(`Mesh.CharacteristicLengthMax = ${defaultMeshSize};`);
    geoLines.push('Mesh.MeshSizeFromCurvature = 0;');

    return { geoContent: geoLines.join('\n'), groups };
}

function runExecFile(gmshPath, args) {
    return new Promise(resolve => {
        execFile(gmshPath, args, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, error: stderr || error.message });
                return;
            }
            resolve({ success: true, stdout, stderr });
        });
    });
}

async function buildPhysicalMesh({ gmshPath, inputFile, outputDir, outputFileName, config }) {
    const stepContent = fs.readFileSync(inputFile, 'utf-8');
    const shellGroups = parseStepShellGroups(stepContent);
    const { geoContent, groups } = buildPhysicalGeo(inputFile, shellGroups, config);
    const baseName = path.parse(outputFileName || inputFile).name;
    const geoPath = path.join(outputDir, `${baseName}_physical.geo`);
    const outputPath = path.join(outputDir, outputFileName || `${baseName}.msh`);

    fs.writeFileSync(geoPath, geoContent, 'utf-8');

    const gmshResult = await runExecFile(gmshPath, [geoPath, '-2', '-format', 'msh2', '-o', outputPath]);
    if (!gmshResult.success) {
        return gmshResult;
    }

    const physicalNames = parseMshPhysicalNames(outputPath);
    const shellTagMap = {};
    physicalNames.orderedTags.forEach((tag, index) => {
        shellTagMap[tag] = index;
    });

    return {
        success: true,
        outputPath,
        shellGroups,
        groups,
        shellTagMap,
        nameToTag: physicalNames.nameToTag,
    };
}

/**
 * Mirror a MSH 2.2 file across a symmetry plane and merge coincident nodes.
 * Interface surfaces keep the same Physical tag (recombined).
 * Subdomain surfaces get new Physical tags (separate left/right).
 * @param {string} mshPath - Path to the .msh file
 * @param {'H'|'V'} axis - H = mirror Y (Top Plane), V = mirror X (Right Plane)
 * @param {number[]} interfaceTags - Physical tag numbers that are interfaces (keep same tag)
 */
function mirrorMsh(mshPath, axis, interfaceTags) {
    const raw = fs.readFileSync(mshPath, 'utf-8');
    const lines = raw.split(/\r?\n/);
    const ifaceSet = new Set(interfaceTags);

    // ── Parse sections ──
    let physNames = [];     // raw lines from $PhysicalNames (including count line)
    let nodes = [];         // [{id, x, y, z}]
    let elements = [];      // [{id, type, tags:[], nodeIds:[]}]
    let section = null;
    let nodeCount = 0, elemCount = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('$') && !trimmed.startsWith('$End')) {
            section = trimmed;
            continue;
        }
        if (trimmed.startsWith('$End')) { section = null; continue; }

        if (section === '$PhysicalNames') {
            physNames.push(trimmed);
        } else if (section === '$Nodes') {
            if (nodes.length === 0 && nodeCount === 0) { nodeCount = parseInt(trimmed); continue; }
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 4) {
                nodes.push({ id: parseInt(parts[0]), x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3]) });
            }
        } else if (section === '$Elements') {
            if (elements.length === 0 && elemCount === 0) { elemCount = parseInt(trimmed); continue; }
            const parts = trimmed.split(/\s+/).map(Number);
            if (parts.length >= 4) {
                const id = parts[0];
                const type = parts[1];
                const numTags = parts[2];
                const tags = parts.slice(3, 3 + numTags);
                const nodeIds = parts.slice(3 + numTags);
                elements.push({ id, type, tags, nodeIds });
            }
        }
    }

    // ── Parse existing physical names to build tag→name map ──
    // Format: first line = count, then "dim tag "name""
    const tagToName = {};
    let maxPhysTag = 0;
    for (let i = 1; i < physNames.length; i++) {
        const match = physNames[i].match(/^(\d+)\s+(\d+)\s+"([^"]+)"/);
        if (match) {
            const tag = parseInt(match[2]);
            tagToName[tag] = match[3];
            if (tag > maxPhysTag) maxPhysTag = tag;
        }
    }

    // ── Build mirror tag map: subdomain tags → new tags, interface tags → same tag ──
    const mirrorTagMap = {};
    let nextPhysTag = maxPhysTag + 1;
    const newPhysNames = []; // additional physical names for mirrored subdomains

    for (const tag of Object.keys(tagToName).map(Number)) {
        if (ifaceSet.has(tag)) {
            mirrorTagMap[tag] = tag; // interface: keep same tag
        } else {
            mirrorTagMap[tag] = nextPhysTag;
            const origName = tagToName[tag] || `Surface_${tag}`;
            newPhysNames.push({ dim: 2, tag: nextPhysTag, name: `${origName}_mirror` });
            nextPhysTag++;
        }
    }

    // ── Tolerance for merging at symmetry plane ──
    const TOL = 1e-6;
    const axisIdx = axis === 'V' ? 0 : 1; // V = mirror X, H = mirror Y

    // ── Build mirror node map ──
    const maxNodeId = nodes.reduce((mx, n) => Math.max(mx, n.id), 0);
    const mirrorMap = {};
    const newNodes = [];
    let nextId = maxNodeId + 1;

    for (const n of nodes) {
        const coord = axisIdx === 0 ? n.x : n.y;
        if (Math.abs(coord) < TOL) {
            mirrorMap[n.id] = n.id;
        } else {
            const mx = axisIdx === 0 ? -n.x : n.x;
            const my = axisIdx === 1 ? -n.y : n.y;
            mirrorMap[n.id] = nextId;
            newNodes.push({ id: nextId, x: mx, y: my, z: n.z });
            nextId++;
        }
    }

    // ── Duplicate elements with mirrored nodes and updated tags ──
    const maxElemId = elements.reduce((mx, e) => Math.max(mx, e.id), 0);
    const newElements = [];
    let nextElemId = maxElemId + 1;

    for (const e of elements) {
        const mirroredNodeIds = e.nodeIds.map(nid => mirrorMap[nid]);
        const flipped = [...mirroredNodeIds];
        if (flipped.length >= 3) {
            const tmp = flipped[1];
            flipped[1] = flipped[2];
            flipped[2] = tmp;
        }
        // Update physical tag (first tag) for mirrored element
        const newTags = [...e.tags];
        if (newTags.length >= 1) {
            const origPhysTag = newTags[0];
            newTags[0] = mirrorTagMap[origPhysTag] !== undefined ? mirrorTagMap[origPhysTag] : origPhysTag;
        }
        newElements.push({ id: nextElemId, type: e.type, tags: newTags, nodeIds: flipped });
        nextElemId++;
    }

    // ── Rebuild PhysicalNames section ──
    const allPhysEntries = [];
    for (let i = 1; i < physNames.length; i++) {
        allPhysEntries.push(physNames[i]);
    }
    for (const np of newPhysNames) {
        allPhysEntries.push(`${np.dim} ${np.tag} "${np.name}"`);
    }

    // ── Write merged MSH file ──
    const allNodes = [...nodes, ...newNodes];
    const allElements = [...elements, ...newElements];

    const out = [];
    out.push('$MeshFormat');
    out.push('2.2 0 8');
    out.push('$EndMeshFormat');

    if (allPhysEntries.length > 0) {
        out.push('$PhysicalNames');
        out.push(String(allPhysEntries.length));
        for (const pn of allPhysEntries) out.push(pn);
        out.push('$EndPhysicalNames');
    }

    out.push('$Nodes');
    out.push(String(allNodes.length));
    for (const n of allNodes) {
        out.push(`${n.id} ${n.x} ${n.y} ${n.z}`);
    }
    out.push('$EndNodes');

    out.push('$Elements');
    out.push(String(allElements.length));
    for (const e of allElements) {
        out.push(`${e.id} ${e.type} ${e.tags.length} ${e.tags.join(' ')} ${e.nodeIds.join(' ')}`);
    }
    out.push('$EndElements');

    fs.writeFileSync(mshPath, out.join('\n'), 'utf-8');
}

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
        const { gmshPath, downloadsPath, destPath, clmax, curv, fileNameSuffix, sourceFilePath, physicalSurfaces, symmetryMirror, tempMode } = args;
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

            // Temp mode: output to OS temp directory instead of destPath
            const outputDir = tempMode
                ? path.join(os.tmpdir(), `toolbox-mesh-${Date.now()}`)
                : destPath;
            fs.mkdirSync(outputDir, { recursive: true });

            const baseName = path.parse(inputFile).name;
            const outputFileName = `${baseName}${fileNameSuffix}.msh`;
            const outputPath = path.join(outputDir, outputFileName);

            if (physicalSurfaces) {
                const buildResult = await buildPhysicalMesh({
                    gmshPath,
                    inputFile,
                    outputDir,
                    outputFileName,
                    config: {
                        defaultMeshSize: clmax,
                        defaultCurveMeshSize: clmax,
                    },
                });

                if (!buildResult.success) {
                    return { success: false, error: buildResult.error };
                }

                return {
                    success: true,
                    message: `Physical mesh ${path.basename(buildResult.outputPath)} generated!`,
                    outputPath: buildResult.outputPath,
                    sourceFilePath: inputFile,
                    shellTagMap: buildResult.shellTagMap,
                    defaultMeshSize: Number(clmax),
                    defaultCurveMeshSize: Number(clmax),
                };
            }
            
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
                        resolve({ success: true, message: `Maillage ${path.basename(outputPath)} généré !`, outputPath });
                    }
                });
            });
        } catch (e) {
            console.error("Erreur dans run-mesh:", e);
            return { success: false, error: e.message };
        }
    });

    // --- Parse MSH for 3D preview: returns Physical Surfaces with triangle data ---
    ipcMain.handle('parse-msh-preview', async (event, mshPath) => {
        try {
            const raw = fs.readFileSync(mshPath, 'utf-8');
            const lines = raw.split(/\r?\n/);
            let section = null;
            const nodesMap = {};
            let nodeCount = 0, elemCount = 0;
            const physTagToName = {};
            const surfaceTriangles = {}; // physTag -> [{v0, v1, v2}]

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('$') && !trimmed.startsWith('$End')) { section = trimmed; continue; }
                if (trimmed.startsWith('$End')) { section = null; continue; }

                if (section === '$PhysicalNames') {
                    const m = trimmed.match(/^(\d+)\s+(\d+)\s+"([^"]+)"/);
                    if (m) physTagToName[parseInt(m[2])] = m[3];
                } else if (section === '$Nodes') {
                    if (nodeCount === 0) { nodeCount = parseInt(trimmed); continue; }
                    const p = trimmed.split(/\s+/);
                    if (p.length >= 4) nodesMap[parseInt(p[0])] = [parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])];
                } else if (section === '$Elements') {
                    if (elemCount === 0) { elemCount = parseInt(trimmed); continue; }
                    const p = trimmed.split(/\s+/).map(Number);
                    if (p.length < 4) continue;
                    const type = p[1];
                    if (type !== 2) continue; // only triangles
                    const numTags = p[2];
                    const physTag = p[3]; // first tag = physical
                    const nids = p.slice(3 + numTags);
                    if (nids.length < 3) continue;
                    if (!surfaceTriangles[physTag]) surfaceTriangles[physTag] = [];
                    surfaceTriangles[physTag].push({
                        v0: nodesMap[nids[0]],
                        v1: nodesMap[nids[1]],
                        v2: nodesMap[nids[2]],
                    });
                }
            }

            const surfaces = Object.keys(surfaceTriangles).map(tag => ({
                tag: parseInt(tag),
                name: physTagToName[parseInt(tag)] || `S${tag}`,
                triangleCount: surfaceTriangles[tag].length,
                triangles: surfaceTriangles[tag],
            }));

            return { success: true, surfaces };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // --- Apply mirror to an existing MSH file ---
    ipcMain.handle('apply-mirror-msh', async (event, { mshPath, axis, interfaceTags }) => {
        try {
            mirrorMsh(mshPath, axis, interfaceTags || []);
            return { success: true, message: `Mirror (${axis}) applied successfully!` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // --- Remesh preview: rebuild physical mesh and optional mirror, keep in temp preview path ---
    ipcMain.handle('remesh-preview', async (event, { mshPath, mirror, physicalConfig }) => {
        try {
            let workingPath = mshPath;
            let interfaceTags = mirror?.interfaceTags || [];

            if (physicalConfig?.gmshPath && physicalConfig?.sourceFilePath) {
                const tempDir = path.dirname(mshPath);
                const rebuildResult = await buildPhysicalMesh({
                    gmshPath: physicalConfig.gmshPath,
                    inputFile: physicalConfig.sourceFilePath,
                    outputDir: tempDir,
                    outputFileName: path.basename(mshPath),
                    config: {
                        defaultMeshSize: physicalConfig.defaultMeshSize,
                        defaultCurveMeshSize: physicalConfig.defaultCurveMeshSize,
                        groups: physicalConfig.groups,
                    },
                });

                if (!rebuildResult.success) {
                    return { success: false, error: rebuildResult.error };
                }

                workingPath = rebuildResult.outputPath;
                interfaceTags = (physicalConfig.groups || [])
                    .filter(group => group.isInterface)
                    .map(group => rebuildResult.nameToTag[group.name])
                    .filter(tag => Number.isInteger(tag));
            }

            if (mirror && mirror.axis) {
                mirrorMsh(workingPath, mirror.axis, interfaceTags);
            }

            return { success: true, message: 'Preview remeshed.', mshPath: workingPath };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // --- Export mesh: optional mirror + copy to final destination ---
    ipcMain.handle('export-mesh', async (event, { mshPath, destPath, mirror, physicalConfig }) => {
        try {
            let workingPath = mshPath;
            let interfaceTags = mirror?.interfaceTags || [];

            if (physicalConfig?.gmshPath && physicalConfig?.sourceFilePath) {
                const tempDir = path.dirname(mshPath);
                const rebuildResult = await buildPhysicalMesh({
                    gmshPath: physicalConfig.gmshPath,
                    inputFile: physicalConfig.sourceFilePath,
                    outputDir: tempDir,
                    outputFileName: path.basename(mshPath),
                    config: {
                        defaultMeshSize: physicalConfig.defaultMeshSize,
                        defaultCurveMeshSize: physicalConfig.defaultCurveMeshSize,
                        groups: physicalConfig.groups,
                    },
                });

                if (!rebuildResult.success) {
                    return { success: false, error: rebuildResult.error };
                }

                workingPath = rebuildResult.outputPath;
                interfaceTags = (physicalConfig.groups || [])
                    .filter(group => group.isInterface)
                    .map(group => rebuildResult.nameToTag[group.name])
                    .filter(tag => Number.isInteger(tag));
            }

            if (mirror && mirror.axis) {
                mirrorMsh(workingPath, mirror.axis, interfaceTags);
            }
            fs.mkdirSync(destPath, { recursive: true });
            const fileName = path.basename(workingPath);
            const finalPath = path.join(destPath, fileName);
            fs.copyFileSync(workingPath, finalPath);

            // Clean up temp directory
            const tempDir = path.dirname(workingPath);
            if (path.basename(tempDir).startsWith('toolbox-mesh-')) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            return { success: true, message: `Exported ${fileName}`, outputPath: finalPath };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
};