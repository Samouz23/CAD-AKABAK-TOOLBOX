// ====================================================================================================
// FICHIER :  src/js/panels/waveguideRenderer.js (VERSION FINALE - FUSION DE FORMES)
// RÔLE :     Implémente une méthode de morphing par fusion de formes (shape blending).
//            Elle combine une super-ellipse de base avec une superformule complexe,
//            tout en normalisant le résultat pour garantir une conformité parfaite à la loi d'aire.
// ====================================================================================================

import * as THREE from '../../lib/three.module.js';
import { OrbitControls } from '../../lib/OrbitControls.js';

// --- GESTION DE LA SCÈNE ET DES OBJETS THREE.JS ---

const state = {
    scene: null, camera: null, renderer: null, controls: null,
    mesh: null, pointsMesh: null, interfacePointsMesh: null, throatCapPointsMesh: null,
    geometries: {} // Stocke les géométries (waveguide, fullWaveguide, etc.) pour l'export
};

/**
 * Initialise la scène 3D, la caméra, le renderer et les contrôles.
 * @param {HTMLElement} container - L'élément DOM qui contiendra le canvas 3D.
 */
export function initThreeJS(container) {
    if (state.renderer) {
        state.renderer.dispose();
        if (container.firstChild) container.removeChild(container.firstChild);
    }

    state.scene = new THREE.Scene();
    const aspect = container.clientWidth / container.clientHeight;
    const frustumSize = 300;
    state.camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 2000);
    state.camera.position.set(200, 200, 200);
    state.camera.lookAt(0, 0, 0);

    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(state.renderer.domElement);

    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dL = new THREE.DirectionalLight(0xffffff, 0.8);
    dL.position.set(1, 1, 1);
    state.scene.add(dL);

    const animate = () => {
        requestAnimationFrame(animate);
        state.controls.update();
        state.renderer.render(state.scene, state.camera);
    };
    animate();

    new ResizeObserver(() => {
        if (!container || container.clientWidth === 0) return;
        const aspect = container.clientWidth / container.clientHeight;
        state.camera.left = -frustumSize * aspect / 2;
        state.camera.right = frustumSize * aspect / 2;
        state.camera.top = frustumSize / 2;
        state.camera.bottom = -frustumSize / 2;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(container.clientWidth, container.clientHeight);
    }).observe(container);
}

/**
 * Nettoie la scène 3D en supprimant tous les objets et en libérant la mémoire.
 */
export function clearScene() {
    [state.mesh, state.pointsMesh, state.interfacePointsMesh, state.throatCapPointsMesh].forEach(m => {
        if (m) {
            state.scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        }
    });
    state.mesh = state.pointsMesh = state.interfacePointsMesh = state.throatCapPointsMesh = null;
    state.geometries = {};
}

/**
 * Met à jour la visibilité des objets de la scène (surface et points).
 * @param {boolean} showSurface - Visibilité de la surface du guide d'ondes.
 * @param {boolean} showPoints - Visibilité des points de la géométrie.
 */
export function updateVisibility(showSurface, showPoints) {
    if (state.mesh) state.mesh.visible = showSurface;
    if (state.pointsMesh) state.pointsMesh.visible = showPoints;
    if (state.interfacePointsMesh) state.interfacePointsMesh.visible = showPoints;
    if (state.throatCapPointsMesh) state.throatCapPointsMesh.visible = showPoints;
}

/**
 * Renvoie les géométries générées pour les fonctions d'export.
 * @returns {object} - Un objet contenant les différentes géométries.
 */
export const getGeometries = () => state.geometries;


/**
 * ===================================================================================
 * CŒUR DE L'ALGORITHME : MORPHING PAR FUSION DE FORMES NORMALISÉES
 * ===================================================================================
 */
function createGeometryFromProfile(config, profileData, totalLength, domRoot) {
    // Vérification pour éviter une erreur si profileData est vide
    if (profileData.length === 0) {
        return { vertices: [], finalDimensions: { width: 0, height: 0 } };
    }

    const N = config.numLines;
    const axialPoints = profileData.length; // <-- CORRECTION : On utilise le nombre de points du profil

    // --- Fonctions utilitaires internes ---
    const clamp = (val, min, max) => Math.max(min, Math.min(val, max));
    const ease = (t, g = 0.65) => clamp(t, 0, 1) ** g;

    // Formule de la superformule
    const superformula = (theta, opts) => {
        const { m = 4, a = 1, b = 1, n1 = 2, n2 = 2, n3 = 2 } = opts;
        if (a === 0 || b === 0 || n1 === 0) return 0;
        const term1 = Math.pow(Math.abs(Math.cos(m * theta / 4) / a), n2);
        const term2 = Math.pow(Math.abs(Math.sin(m * theta / 4) / b), n3);
        const result = Math.pow(term1 + term2, -1 / n1);
        return isNaN(result) ? 1 : result;
    };

    // Calcule l'aire d'un polygone à partir de ses points
    const calculatePolygonArea = (points) => {
        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            area += p1.x * p2.y - p2.x * p1.y;
        }
        return Math.abs(area) / 2.0;
    };
    
    // --- ÉTAPE 1: Définir les paramètres de début et de fin ---
    let n_in = 2.0, ratio_in = 1.0;
    if (config.inputShape === 'rectangle') {
        n_in = 8.0;
        ratio_in = config.throatHeight > 0 ? config.throatHeight / config.throatWidth : 1.0;
    }

    let n_out = 2.0, ratio_out = 1.0;
    let mouthWidth = profileData[profileData.length-1].point.x * 2;
    let mouthHeight = mouthWidth;
    
    if (config.outputShape === 'rectangle' || config.outputShape === 'rounded_rectangle') {
        const wId = `#wg-d-out-${config.outputShape === 'rectangle' ? 'rect' : 'rounded-rect'}-w`;
        const hId = `#wg-d-out-${config.outputShape === 'rectangle' ? 'rect' : 'rounded-rect'}-h`;
        mouthWidth  = parseFloat(domRoot.querySelector(wId).value) || 200;
        mouthHeight = parseFloat(domRoot.querySelector(hId).value) || 100;
        ratio_out = mouthHeight > 0 ? mouthHeight / mouthWidth : 1.0;
        
        if (config.outputShape === 'rounded_rectangle') {
            const min_side = Math.min(mouthWidth, mouthHeight);
            const normalized_radius = clamp(config.outputRoundedRectRadius / (min_side / 2), 0, 1);
            n_out = 2.0 + (1.0 - normalized_radius) * 6.0;
        } else {
            n_out = 8.0;
        }
    }
    
    // Prépare la forme unitaire de la superformule pour la fusion
    const sf_points_raw = Array.from({ length: N }, (_, j) => {
        const angle = (j / N) * 2 * Math.PI;
        const r = superformula(angle, config.superformula);
        return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
    });
    const sf_area = calculatePolygonArea(sf_points_raw);
    const sf_scale = sf_area > 1e-9 ? Math.sqrt(Math.PI / sf_area) : 1;
    const sf_unit_points = sf_points_raw.map(p => ({ x: p.x * sf_scale, y: p.y * sf_scale }));

    // --- ÉTAPE 2: Générer les vertices ---
    const vertices = [];
    const useShapeControl = config.useShapeControl && config.shapeLength > 0 && totalLength > config.shapeLength;

    for (let i = 0; i < axialPoints; i++) { // <-- CORRECTION : Boucle sur les points du profil
        const z = profileData[i].point.y; // <-- CORRECTION : On prend le Z directement
        const t_axial = totalLength > 0 ? z / totalLength : 0; // <-- CORRECTION : On recalcule t_axial
        const targetArea = Math.PI * profileData[i].point.x ** 2; // <-- CORRECTION : On prend le rayon directement

        // a) Calcule la super-ellipse de base (interpolation gorge -> bouche)
        const w_base = ease(t_axial);
        const n_base = n_in * (1 - w_base) + n_out * w_base;
        const ratio_base = ratio_in * (1 - w_base) + ratio_out * w_base;
        const a_base_unit = Math.sqrt(Math.PI / ratio_base); // 'a' pour une super-ellipse d'aire PI
        const b_base_unit = a_base_unit * ratio_base;

        // b) Calcule l'amplitude de la déformation par la superformule
        let effective_amplitude = 0;
        if (useShapeControl && z <= config.shapeLength) {
             const shape_influence = Math.sin(Math.PI * z / config.shapeLength);
             effective_amplitude = config.superformula.amplitude * shape_influence;
        }
        
        // c) Génère la forme finale en fusionnant la super-ellipse et la superformule
        const blended_unit_points = Array.from({ length: N }, (_, j) => {
            const angle = (j / N) * 2 * Math.PI;
            
            // Rayon de la super-ellipse unitaire
            const term1 = Math.abs(Math.cos(angle)) ** n_base;
            const term2 = Math.abs(Math.sin(angle)) ** n_base;
            const r_base_unit = (term1 / (a_base_unit ** n_base) + term2 / (b_base_unit ** n_base)) ** (-1 / n_base);

            // Rayon de la superformule unitaire
            const r_sf_unit = Math.hypot(sf_unit_points[j].x, sf_unit_points[j].y);

            // Fusion des deux rayons
            const r_blended = r_base_unit * (1 - effective_amplitude) + r_sf_unit * effective_amplitude;

            return { x: r_blended * Math.cos(angle), y: r_blended * Math.sin(angle) };
        });

        // d) Normalise la forme fusionnée pour qu'elle ait l'aire requise
        const blended_area = calculatePolygonArea(blended_unit_points);
        const final_scale = blended_area > 1e-9 ? Math.sqrt(targetArea / blended_area) : 0;
        
        blended_unit_points.forEach(p => {
            vertices.push(p.x * final_scale, p.y * final_scale, z);
        });
    }

    // --- ÉTAPE 3: Calculer les dimensions finales pour l'UI ---
    const finalSliceStartIndex = (axialPoints - 1) * N * 3;
    let finalWidth = 0, finalHeight = 0;
    if (vertices.length >= finalSliceStartIndex + N*3) {
      for (let j = 0; j < N; j++) {
          finalWidth  = Math.max(finalWidth,  Math.abs(vertices[finalSliceStartIndex + j * 3]));
          finalHeight = Math.max(finalHeight, Math.abs(vertices[finalSliceStartIndex + j * 3 + 1]));
      }
    }
    
    return { vertices, finalDimensions: { width: finalWidth * 2, height: finalHeight * 2 } };
}


// --- FONCTION PRINCIPALE DE GÉNÉRATION ET D'AFFICHAGE ---
export function generateAndDisplayWaveguide(config, profileData, buildInterface, domRoot) {
    clearScene();
    if (profileData.length < 2) return { finalDimensions: { width: 0, height: 0 }, vertices: [] };

    const totalLength = config.segments.reduce((acc, seg) => acc + seg.length, 0);
    const { vertices, finalDimensions } = createGeometryFromProfile(config, profileData, totalLength, domRoot);
    
    // <-- CORRECTION : Le nombre de points vient maintenant de la longueur du profil
    const numProfilePoints = profileData.length; 

    // Appliquer le split aux vertices pour l'affichage des points
    const { splitVertices, splitColors } = applySplitToVertices(config, vertices, profileData, numProfilePoints);
    
    const validationGeom = new THREE.BufferGeometry();
    validationGeom.setAttribute('position', new THREE.Float32BufferAttribute(splitVertices, 3));
    validationGeom.setAttribute('color', new THREE.Float32BufferAttribute(splitColors, 3));
    state.pointsMesh = new THREE.Points(validationGeom, new THREE.PointsMaterial({ size: 1.5, vertexColors: true }));
    state.scene.add(state.pointsMesh);

    state.geometries.waveguide = createMeshFromVertices(config, vertices, numProfilePoints);
    state.geometries.fullWaveguide = createMeshFromVertices({ ...config, split: { horizontal: false, vertical: false } }, vertices, numProfilePoints);
    
    const geomsToMerge = [state.geometries.waveguide];
    if (buildInterface) {
        // <-- CORRECTION : On passe les vertices de la gorge à la fonction
        const throatSliceVertices = vertices.slice(0, config.numLines * 3);
        state.geometries.interface = createInterfaceGeometry(config, numProfilePoints, totalLength, vertices);
        state.geometries.throatCap = createThroatCapGeometry(config, throatSliceVertices);
        
        // Stocker aussi les versions complètes (sans split) pour l'export
        state.geometries.fullInterface = createInterfaceGeometry({ ...config, split: { horizontal: false, vertical: false } }, numProfilePoints, totalLength, vertices);
        state.geometries.fullThroatCap = createThroatCapGeometry({ ...config, split: { horizontal: false, vertical: false } }, throatSliceVertices);
        
        geomsToMerge.push(state.geometries.interface, state.geometries.throatCap);
        // On vérifie que les géométries existent avant de créer les points
        // Les points utilisent les géométries avec split appliqué
        if (state.geometries.interface?.attributes?.position?.count > 0) {
            state.interfacePointsMesh = new THREE.Points(state.geometries.interface.clone(), new THREE.PointsMaterial({ size: 1.5, color: 0x00FFFF }));
            state.scene.add(state.interfacePointsMesh);
        }
        if (state.geometries.throatCap?.attributes?.position?.count > 0) {
            state.throatCapPointsMesh = new THREE.Points(state.geometries.throatCap.clone(), new THREE.PointsMaterial({ size: 1.5, color: 0xFFFF00 }));
            state.scene.add(state.throatCapPointsMesh);
        }
    }
    
    const finalGeometry = mergeGeometries(geomsToMerge);
    if (!finalGeometry.attributes.position || finalGeometry.attributes.position.count === 0) return { finalDimensions, vertices };
    
    finalGeometry.translate(0, 0, -totalLength);
    if (state.pointsMesh) state.pointsMesh.geometry.translate(0, 0, -totalLength);
    if (state.interfacePointsMesh) state.interfacePointsMesh.geometry.translate(0, 0, -totalLength);
    if (state.throatCapPointsMesh) state.throatCapPointsMesh.geometry.translate(0, 0, -totalLength);
    
    finalGeometry.computeVertexNormals();
    state.mesh = new THREE.Mesh(finalGeometry, new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }));
    state.scene.add(state.mesh);
    
    state.geometries.mesh = finalGeometry;

    return { finalDimensions, vertices };
}


// --- GÉOMÉTRIES ADDITIONNELLES ET UTILITAIRES ---

function applySplitToVertices(config, vertices, profileData, numProfilePoints) {
    const pointsPerSlice = config.numLines;
    const splitVertices = [];
    const allColors = validateGeometryAndGetPointColors(vertices, profileData, pointsPerSlice);
    const splitColors = [];
    
    for (let i = 0; i < numProfilePoints; i++) {
        for (let j = 0; j < pointsPerSlice; j++) {
            const idx = i * pointsPerSlice + j;
            if (idx * 3 + 2 >= vertices.length) continue;
            const x = vertices[idx * 3];
            const y = vertices[idx * 3 + 1];
            const z = vertices[idx * 3 + 2];
            
            let keep = true;
            if (config.split.horizontal && y < -0.001) keep = false;
            if (config.split.vertical && x < -0.001) keep = false;
            
            if (keep) {
                splitVertices.push(x, y, z);
                splitColors.push(allColors[idx * 3], allColors[idx * 3 + 1], allColors[idx * 3 + 2]);
            }
        }
    }
    
    return { splitVertices, splitColors };
}

function createMeshFromVertices(config, vertices, numProfilePoints) {
    const pointsPerSlice = config.numLines;
    const splitVertices = [], mapping = new Array(vertices.length / 3).fill(-1);
    let newIndex = 0;
    for (let i = 0; i < numProfilePoints; i++) {
        for (let j = 0; j < pointsPerSlice; j++) {
            const idx = i * pointsPerSlice + j;
            if(idx * 3 + 2 >= vertices.length) continue; 
            const x = vertices[idx * 3], y = vertices[idx * 3 + 1], z = vertices[idx * 3 + 2];
            let keep = true;
            if (config.split.horizontal && y < -0.001) keep = false;
            if (config.split.vertical && x < -0.001) keep = false;
            if (keep) { splitVertices.push(x, y, z); mapping[idx] = newIndex++; }
        }
    }
    const indices = [];
    for (let i = 0; i < numProfilePoints - 1; i++) {
        for (let j = 0; j < pointsPerSlice; j++) {
            const nextJ = (j + 1) % pointsPerSlice;
            const p1 = i * pointsPerSlice + j, p2 = i * pointsPerSlice + nextJ;
            const p3 = (i + 1) * pointsPerSlice + j, p4 = (i + 1) * pointsPerSlice + nextJ;
            if (mapping[p1] !== -1 && mapping[p3] !== -1 && mapping[p2] !== -1) indices.push(mapping[p1], mapping[p3], mapping[p2]);
            if (mapping[p2] !== -1 && mapping[p3] !== -1 && mapping[p4] !== -1) indices.push(mapping[p2], mapping[p3], mapping[p4]);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(splitVertices, 3));
    geometry.setIndex(indices);
    return geometry;
}

function validateGeometryAndGetPointColors(vertices, profileData, pointsPerSlice) {
    const numProfilePoints = Math.floor(vertices.length / 3 / pointsPerSlice);
    const pointsColors = [];
    const colorValid = new THREE.Color(0x00ff00), colorInvalid = new THREE.Color(0xff0000);
    let lastSliceRadii = new Array(pointsPerSlice).fill(profileData[0]?.rawRadius || 0);

    // Tolérances plus robustes pour éviter les faux positifs (mm et relatif)
    const tolAbs = 0.05; // 5/100 mm
    const tolRel = 0.001; // 0.1 %

    // Estime la longueur totale en Z à partir des vertices
    const firstZ = vertices.length >= 3 ? vertices[2] : 0;
    const lastSliceStart = (numProfilePoints - 1) * pointsPerSlice * 3;
    const lastZ = vertices.length >= lastSliceStart + 3 ? vertices[lastSliceStart + 2] : firstZ;
    const totalZ = Math.max(0, lastZ - firstZ);

    for (let i = 0; i < numProfilePoints; i++) {
        // Meilleur mappage entre l'indice de tranche et les points du profil
        const profileIndex = Math.max(0, Math.min(
            profileData.length - 1,
            Math.round(i * (profileData.length - 1) / Math.max(1, (numProfilePoints - 1)))
        ));
        const isProfileMonotonic = !!profileData[profileIndex].isValid;
        let decreases = 0;
        const currentSliceRadii = [];
        const startIndex = i * pointsPerSlice * 3;
        const zCurr = vertices[startIndex + 2] || 0;

        for (let j = 0; j < pointsPerSlice; j++) {
            const r = Math.hypot(vertices[startIndex + j * 3], vertices[startIndex + j * 3 + 1]);
            currentSliceRadii.push(r);
            if (i > 0) {
                const eps = Math.max(tolAbs, tolRel * Math.abs(lastSliceRadii[j]));
                if (r + eps < lastSliceRadii[j]) decreases++;
            }
        }

        // Ignorer les faux positifs proches de la gorge (<=10% de la longueur ou <=10 mm)
        const nearThroat = totalZ > 0 ? ((zCurr - firstZ) <= Math.max(10, 0.1 * totalZ)) : (i <= Math.max(1, Math.floor(numProfilePoints * 0.1)));

        // On ne déclare la concavité que si une fraction significative des lignes diminue
        const concavityThreshold = Math.max(1, Math.floor(pointsPerSlice * 0.1)); // >= 10% des lignes
        const isSliceConcaveLongitudinally = !nearThroat && (decreases >= concavityThreshold);

        const sliceColor = (isProfileMonotonic && !isSliceConcaveLongitudinally) ? colorValid : colorInvalid;
        for (let j = 0; j < pointsPerSlice; j++) {
            pointsColors.push(sliceColor.r, sliceColor.g, sliceColor.b);
        }
        lastSliceRadii = currentSliceRadii;
    }
    return pointsColors;
}

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

function createInterfaceGeometry(config, numProfilePoints, totalLength, vertices) {
    const pointsPerSlice = config.numLines;
    const interfaceAngularPoints = config.interfaceAngularPoints || config.numLines;
    const interfaceAxialPoints = config.interfaceAxialPoints || 10;
    const mouthZ = totalLength;
    
    // On récupère les sommets de la bouche
    const mouthVertices = [];
    const startIndex = (numProfilePoints - 1) * pointsPerSlice;
    for (let j = 0; j < pointsPerSlice; j++) {
        const idx = (startIndex + j) * 3;
        mouthVertices.push(new THREE.Vector3(vertices[idx], vertices[idx + 1], vertices[idx + 2]));
    }
    
    const cubicBezier = (t, p0, p1, p2, p3) => (1-t)**3*p0 + 3*(1-t)**2*t*p1 + 3*(1-t)*t**2*p2 + t**3*p3;
    const gridPoints = [];
    
    // On génère les points avec le nombre personnalisé de points angulaires et axiaux
    for (let i = 0; i <= interfaceAxialPoints; i++) {
        const t = i / interfaceAxialPoints;
        for (let j = 0; j < interfaceAngularPoints; j++) {
            // Interpolation angulaire pour mapper les points de la bouche
            const angleFrac = j / interfaceAngularPoints;
            const mouthIndex = Math.floor(angleFrac * pointsPerSlice);
            const mouthIndexNext = (mouthIndex + 1) % pointsPerSlice;
            const localT = (angleFrac * pointsPerSlice) - mouthIndex;
            
            // Interpolation linéaire entre deux points de la bouche
            const startV = new THREE.Vector3(
                mouthVertices[mouthIndex].x * (1 - localT) + mouthVertices[mouthIndexNext].x * localT,
                mouthVertices[mouthIndex].y * (1 - localT) + mouthVertices[mouthIndexNext].y * localT,
                mouthVertices[mouthIndex].z * (1 - localT) + mouthVertices[mouthIndexNext].z * localT
            );
            
            const hypot = Math.hypot(startV.x, startV.y);
            const bulgeFactor = hypot > 1e-6 ? 1 + config.interface.bulgeRadius / hypot : 1;
            const p1 = new THREE.Vector3(startV.x * bulgeFactor, startV.y * bulgeFactor, mouthZ + config.interface.bulgeZ);
            const p2 = new THREE.Vector3(startV.x * 0.1, startV.y * 0.1, mouthZ + config.interface.tipOffset);
            gridPoints.push(new THREE.Vector3(
                cubicBezier(t, startV.x, p1.x, p2.x, 0),
                cubicBezier(t, startV.y, p1.y, p2.y, 0),
                cubicBezier(t, startV.z, p1.z, p2.z, mouthZ + config.interface.tipOffset)
            ));
        }
    }
    
    // Création du mesh avec les paramètres personnalisés
    const interfaceConfig = { ...config, numLines: interfaceAngularPoints };
    return createMeshFromVertices(interfaceConfig, gridPoints.flatMap(p => [p.x, p.y, p.z]), interfaceAxialPoints + 1);
}

function createThroatCapGeometry(config, throatVertices) {
    const sourceAngularPoints = config.sourceAngularPoints || config.numLines;
    const sourceAxialPoints = config.sourceAxialPoints || 5;
    const originalNumLines = config.numLines;
    
    if (!throatVertices || throatVertices.length === 0) return new THREE.BufferGeometry();

    const gridPoints = [];
    
    // Extraire les points du contour de la gorge depuis throatVertices
    const throatContour = [];
    for (let j = 0; j < originalNumLines; j++) {
        const idx = j * 3;
        throatContour.push(new THREE.Vector3(
            throatVertices[idx],
            throatVertices[idx + 1],
            0
        ));
    }
    
    // Les anneaux extérieurs sont des versions mises à l'échelle du contour de la gorge
    for (let i = 1; i <= sourceAxialPoints; i++) {
        const scale = i / sourceAxialPoints;
        for (let j = 0; j < sourceAngularPoints; j++) {
            // Interpolation angulaire pour mapper les points du contour de la gorge
            const angleFrac = j / sourceAngularPoints;
            const throatIndex = Math.floor(angleFrac * originalNumLines);
            const throatIndexNext = (throatIndex + 1) % originalNumLines;
            const localT = (angleFrac * originalNumLines) - throatIndex;
            
            // Interpolation linéaire entre deux points du contour
            const interpolatedX = throatContour[throatIndex].x * (1 - localT) + throatContour[throatIndexNext].x * localT;
            const interpolatedY = throatContour[throatIndex].y * (1 - localT) + throatContour[throatIndexNext].y * localT;
            
            gridPoints.push(new THREE.Vector3(
                interpolatedX * scale,
                interpolatedY * scale,
                0 // Tous les points sont sur le plan Z=0
            ));
        }
    }

    // L'anneau central est un seul point à l'origine répété pour chaque point angulaire
    const centerPoints = Array(sourceAngularPoints).fill(new THREE.Vector3(0, 0, 0));
    gridPoints.unshift(...centerPoints);
    
    // Le nombre de "cercles" est sourceAxialPoints + le point central
    const sourceConfig = { ...config, numLines: sourceAngularPoints };
    return createMeshFromVertices(sourceConfig, gridPoints.flatMap(p => [p.x, p.y, p.z]), sourceAxialPoints + 1);
}