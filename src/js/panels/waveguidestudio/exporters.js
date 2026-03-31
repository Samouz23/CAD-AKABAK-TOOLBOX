// ====================================================================================================
// FICHIER :  src/js/panels/waveguidestudio/exporters.js
// RÔLE :     Gestion de l'export des fichiers (STL, CSV, MSH).
// ====================================================================================================

import * as THREE from '../../lib/three.module.js';
import { getSettings } from '../mainsettings/mainsettings.js';

function mergeGeometries(geometries) {
    const mergedVertices = [], mergedIndices = [];
    let vertexCountOffset = 0;
    for (const geom of geometries) {
        if (!geom || !geom.attributes.position) continue;
        mergedVertices.push(...geom.attributes.position.array);
        if (geom.index) {
            for (let i = 0; i < geom.index.count; i++) {
                mergedIndices.push(geom.index.array[i] + vertexCountOffset);
            }
        }
        vertexCountOffset += geom.attributes.position.count;
    }
    const mergedGeometry = new THREE.BufferGeometry();
    if (mergedVertices.length > 0) {
        mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mergedVertices, 3));
        mergedGeometry.setIndex(mergedIndices);
    }
    return mergedGeometry;
}

export function generateSTLString(geometry) {
    if (!geometry) return "";
    let stl = "solid waveguide\n";
    const pos = geometry.attributes.position;
    const indices = geometry.index ? geometry.index.array : null;
    if (indices) {
        for (let i = 0; i < indices.length; i += 3) {
            const v1 = new THREE.Vector3().fromBufferAttribute(pos, indices[i]);
            const v2 = new THREE.Vector3().fromBufferAttribute(pos, indices[i + 1]);
            const v3 = new THREE.Vector3().fromBufferAttribute(pos, indices[i + 2]);
            const n = new THREE.Triangle(v1, v2, v3).getNormal(new THREE.Vector3());
            stl += `facet normal ${n.x} ${n.y} ${n.z}\n    outer loop\n`;
            stl += `        vertex ${v1.x} ${v1.y} ${v1.z}\n        vertex ${v2.x} ${v2.y} ${v2.z}\n        vertex ${v3.x} ${v3.y} ${v3.z}\n`;
            stl += `    endloop\nendfacet\n`;
        }
    }
    return stl + "endsolid waveguide\n";
}

export function generateCSVString(geometry) {
    if (!geometry) return "";
    const pos = geometry.attributes.position;
    let csv = "";
    for (let i = 0; i < pos.count; i++) csv += `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}\n`;
    return csv;
}

export function generateProfileCSVString(geometry, config) {
    if (!geometry || !config) return "";
    const points = new Set(), pos = geometry.attributes.position, numLines = config.numLines, numProfilePoints = pos.count / numLines;
    const addPoint = (i, j) => {
        const idx = i * numLines + j;
        if (idx < pos.count) points.add(`${pos.getX(idx).toFixed(4)},${pos.getY(idx).toFixed(4)},${pos.getZ(idx).toFixed(4)}`);
    };
    for (let j = 0; j < numLines; j++) { addPoint(0, j); addPoint(numProfilePoints - 1, j); }
    const jH1 = 0, jH2 = numLines / 2, jV1 = numLines / 4, jV2 = 3 * numLines / 4;
    for (let i = 0; i < numProfilePoints; i++) { addPoint(i, jH1); addPoint(i, jH2); addPoint(i, jV1); addPoint(i, jV2); }
    return Array.from(points).join('\n');
}

export function generateMSHString(geometries) {
    let totalNodes = 0, totalElements = 0;
    geometries.forEach(g => { if (g.geometry) { totalNodes += g.geometry.attributes.position.count; if (g.geometry.index) totalElements += g.geometry.index.count / 3; } });
    if (totalNodes === 0 || totalElements === 0) return "";
    let msh = "$MeshFormat\n2.2 0 8\n$EndMeshFormat\n$PhysicalNames\n" + geometries.length + "\n";
    geometries.forEach((g, i) => { msh += `2 ${i + 1} "${g.name}"\n`; });
    msh += `$EndPhysicalNames\n$Nodes\n${totalNodes}\n`;
    let nodeIndex = 1;
    geometries.forEach(g => { if (g.geometry) { const vertices = g.geometry.attributes.position; for (let i = 0; i < vertices.count; i++) msh += `${nodeIndex++} ${vertices.getX(i)} ${vertices.getY(i)} ${vertices.getZ(i)}\n`; } });
    msh += "$EndNodes\n$Elements\n" + totalElements + "\n";
    let elementIndex = 1, nodeOffset = 0;
    geometries.forEach((g, i) => {
        if (g.geometry && g.geometry.index) {
            const indices = g.geometry.index.array, tag = i + 1;
            for (let j = 0; j < indices.length; j += 3) msh += `${elementIndex++} 2 2 ${tag} ${tag} ${indices[j]+1+nodeOffset} ${indices[j+1]+1+nodeOffset} ${indices[j+2]+1+nodeOffset}\n`;
            nodeOffset += g.geometry.attributes.position.count;
        }
    });
    return msh + "$EndElements\n";
}

export async function exportFileInDirectory(content, directory, fileName, statusButton) {
    const showStatus = (message, isError = false) => {
        if (!statusButton) return;
        const originalText = statusButton.textContent;
        statusButton.textContent = message;
        statusButton.classList.toggle('text-red-400', isError);
        statusButton.classList.toggle('text-green-400', !isError);
        setTimeout(() => { statusButton.textContent = originalText; statusButton.classList.remove('text-red-400', 'text-green-400'); }, 3000);
    };
    if (!content) { showStatus("Content Error", true); return; }
    if (!directory) { showStatus("Path missing!", true); return; }
    const result = await window.electronAPI.saveFileInDirectory({ directory, fileName, content });
    if (result.success) showStatus("Exported!");
    else { console.error(`Error exporting to ${directory}\\${fileName}:`, result.error); showStatus("File Error!", true); }
}

export async function exportSTL(getGeometries, lastConfig, exportButton) {
    const { waveguide, interface: iface, throatCap } = getGeometries();
    const finalGeom = mergeGeometries([waveguide, iface, throatCap].filter(Boolean));
    const totalLength = lastConfig.segments.reduce((acc, seg) => acc + seg.length, 0);
    finalGeom.translate(0, 0, -totalLength);

    if (finalGeom) { 
        const s = await getSettings(); 
        const c = generateSTLString(finalGeom); 
        const stlPath = s.paths.dataRoot ? `${s.paths.dataRoot}\\STL-out` : '';
        await exportFileInDirectory(c, stlPath, 'waveguide.stl', exportButton); 
    }
}

export async function exportCSV(getGeometries, exportButton) {
    const geom = getGeometries().waveguide;
    if (geom) { 
        const s = await getSettings(); 
        const c = generateCSVString(geom); 
        const csvPath = s.paths.dataRoot ? `${s.paths.dataRoot}\\CSV-out` : '';
        await exportFileInDirectory(c, csvPath, 'waveguide_points_full.csv', exportButton); 
    }
}

export async function exportProfileCSV(getGeometries, lastConfig, exportButton) {
    const geom = getGeometries().fullWaveguide;
    if (geom) { 
        const s = await getSettings(); 
        const c = generateProfileCSVString(geom, lastConfig); 
        const csvPath = s.paths.dataRoot ? `${s.paths.dataRoot}\\CSV-out` : '';
        await exportFileInDirectory(c, csvPath, 'waveguide_profile.csv', exportButton); 
    }
}

export async function exportMSH(getGeometries, lastConfig, buildInterface, exportButton) {
    const geoms = getGeometries();
    if (!geoms.waveguide) return;
    const totalLength = lastConfig.segments.reduce((acc, seg) => acc + seg.length, 0);
    const translationZ = -totalLength;
    const geomsToExport = [{ geometry: geoms.waveguide.clone().translate(0, 0, translationZ), name: "waveguide_surface" }];
    if (buildInterface) {
        if (geoms.interface) geomsToExport.push({ geometry: geoms.interface.clone().translate(0, 0, translationZ), name: "interface_surface" });
        if (geoms.throatCap) geomsToExport.push({ geometry: geoms.throatCap.clone().translate(0, 0, translationZ), name: "throat_cap_surface" });
    }
    const settings = await getSettings();
    const content = generateMSHString(geomsToExport);
    const meshPath = settings.paths.dataRoot ? `${settings.paths.dataRoot}\\Mesh-out` : '';
    await exportFileInDirectory(content, meshPath, 'waveguide_sim.msh', exportButton);
}
