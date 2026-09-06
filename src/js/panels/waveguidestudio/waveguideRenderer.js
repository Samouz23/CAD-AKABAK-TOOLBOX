// ====================================================================================================
// FICHIER :  src/js/panels/waveguideRenderer.js (VERSION FINALE - FUSION DE FORMES)
// RÔLE :     Implémente une méthode de morphing par fusion de formes (shape blending).
//            Elle combine une super-ellipse de base avec une superformule complexe,
//            tout en normalisant le résultat pour garantir une conformité parfaite à la loi d'aire.
// ====================================================================================================

import * as THREE from '../../lib/three.module.js';
import { OrbitControls } from '../../lib/OrbitControls.js';
import { generateDosc, computeIsophaseReport, checkPatentConditions } from './dosc/doscGenerator.js';

// --- GESTION DE LA SCÈNE ET DES OBJETS THREE.JS ---

const state = {
    scene: null, camera: null, renderer: null, controls: null,
    mesh: null, pointsMesh: null, interfacePointsMesh: null, throatCapPointsMesh: null,
    wireframeMesh: null, interfaceWireframeMesh: null, throatCapWireframeMesh: null,
    geometries: {}, // Stocke les géométries (waveguide, fullWaveguide, etc.) pour l'export
    container: null, frustumSize: 300,
    viewCubeRenderer: null, viewCubeScene: null, viewCubeCamera: null
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

    state.container = container;
    state.scene = new THREE.Scene();
    const aspect = container.clientWidth / container.clientHeight;
    state.frustumSize = 300;
    state.camera = new THREE.OrthographicCamera(
        state.frustumSize * aspect / -2, state.frustumSize * aspect / 2,
        state.frustumSize / 2, state.frustumSize / -2, 0.1, 100000
    );
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

    // --- View Cube ---
    initViewCube(container);

    const animate = () => {
        requestAnimationFrame(animate);
        state.controls.update();
        state.renderer.render(state.scene, state.camera);
        renderViewCube();
    };
    animate();

    new ResizeObserver(() => {
        if (!container || container.clientWidth === 0) return;
        const aspect = container.clientWidth / container.clientHeight;
        state.camera.left = -state.frustumSize * aspect / 2;
        state.camera.right = state.frustumSize * aspect / 2;
        state.camera.top = state.frustumSize / 2;
        state.camera.bottom = -state.frustumSize / 2;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(container.clientWidth, container.clientHeight);
    }).observe(container);
}

/**
 * Nettoie la scène 3D en supprimant tous les objets et en libérant la mémoire.
 */
export function clearScene() {
    [state.mesh, state.pointsMesh, state.interfacePointsMesh, state.throatCapPointsMesh,
     state.wireframeMesh, state.interfaceWireframeMesh, state.throatCapWireframeMesh].forEach(m => {
        if (m) {
            state.scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        }
    });
    state.mesh = state.pointsMesh = state.interfacePointsMesh = state.throatCapPointsMesh = null;
    state.wireframeMesh = state.interfaceWireframeMesh = state.throatCapWireframeMesh = null;
    state.geometries = {};
}

/**
 * Met à jour la visibilité des objets de la scène (surface, points et maillage).
 * @param {boolean} showSurface - Visibilité de la surface du guide d'ondes.
 * @param {boolean} showPoints - Visibilité des points de la géométrie.
 * @param {boolean} showMesh - Visibilité du maillage wireframe.
 */
export function updateVisibility(showSurface, showPoints, showMesh) {
    if (state.mesh) state.mesh.visible = showSurface;
    if (state.pointsMesh) state.pointsMesh.visible = showPoints;
    if (state.interfacePointsMesh) state.interfacePointsMesh.visible = showPoints;
    if (state.throatCapPointsMesh) state.throatCapPointsMesh.visible = showPoints;
    if (state.wireframeMesh) state.wireframeMesh.visible = showMesh;
    if (state.interfaceWireframeMesh) state.interfaceWireframeMesh.visible = showMesh;
    if (state.throatCapWireframeMesh) state.throatCapWireframeMesh.visible = showMesh;
}

/**
 * Renvoie les géométries générées pour les fonctions d'export.
 * @returns {object} - Un objet contenant les différentes géométries.
 */
export const getGeometries = () => state.geometries;

// --- Helpers: GCD / LCM for angular symmetry ---
function _gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
function _lcm(a, b) { return (a && b) ? Math.abs(a * b) / _gcd(a, b) : 0; }

/**
 * Compute the angular symmetry order from output shape + superformula.
 * Angular point count must be a multiple of this value for proper meshing.
 */
export function computeAngularDivisor(sfM, sfAmplitude, shapeControlActive) {
    let sym = 4; // base: super-ellipse / rectangle has 4-fold symmetry
    const m = Math.round(sfM || 0);
    if (shapeControlActive && m > 0 && sfAmplitude > 0) {
        sym = _lcm(4, m);
    }
    return Math.max(4, sym);
}

/**
 * Angular distribution that ALWAYS includes the 4 cardinal angles
 * (0, π/2, π, 3π/2) regardless of N. The remaining N-4 points are
 * distributed uniformly within each quadrant with perfect 4-fold symmetry.
 * This guarantees clean splits at x=0 and y=0 planes for any N ≥ 4.
 */
function computeUniformAngles(N) {
    if (N < 4) return Float64Array.from({ length: N }, (_, j) => (j / N) * 2 * Math.PI);
    
    const HALF_PI = Math.PI / 2;
    // Distribute remaining points across 4 quadrants as evenly as possible
    const extra = N - 4;
    const base = Math.floor(extra / 4);
    const remainder = extra % 4;
    // Each quadrant gets base points, first 'remainder' quadrants get one extra
    const perQuadrant = [base, base, base, base];
    for (let q = 0; q < remainder; q++) perQuadrant[q]++;
    
    const angles = new Float64Array(N);
    let idx = 0;
    for (let q = 0; q < 4; q++) {
        // Cardinal angle at start of quadrant
        angles[idx++] = q * HALF_PI;
        // Interior points within this quadrant
        const count = perQuadrant[q];
        for (let k = 1; k <= count; k++) {
            angles[idx++] = q * HALF_PI + (k / (count + 1)) * HALF_PI;
        }
    }
    return angles;
}

/**
 * ===================================================================================
 * CŒUR DE L'ALGORITHME : MORPHING PAR FUSION DE FORMES NORMALISÉES
 * ===================================================================================
 */
function createGeometryFromProfile(config, profileDataH, profileDataV, totalLength, domRoot) {
    // Vérification pour éviter une erreur si profileData est vide
    if (profileDataH.length === 0) {
        return { vertices: [], finalDimensions: { width: 0, height: 0 } };
    }

    const isAniso = config.flareMode === 'anisotrope' && profileDataV && profileDataV.length === profileDataH.length;

    const N = config.numLines;
    const axialPoints = profileDataH.length;

    // --- Fonctions utilitaires internes ---
    const clamp = (val, min, max) => Math.max(min, Math.min(val, max));
    const ease = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };

    const superformula = (theta, opts) => {
        const { m = 4, a = 1, b = 1, n1 = 2, n2 = 2, n3 = 2 } = opts;
        if (a === 0 || b === 0 || n1 === 0) return 0;
        const term1 = Math.pow(Math.abs(Math.cos(m * theta / 4) / a), n2);
        const term2 = Math.pow(Math.abs(Math.sin(m * theta / 4) / b), n3);
        const result = Math.pow(term1 + term2, -1 / n1);
        return isNaN(result) ? 1 : result;
    };

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
    } else if (config.inputShape === 'rounded_rectangle') {
        ratio_in = config.throatHeight > 0 ? config.throatHeight / config.throatWidth : 1.0;
        const min_side_in = Math.min(config.throatWidth, config.throatHeight);
        const norm_r_in = min_side_in > 0
            ? clamp((config.throatRadius || 0) / (min_side_in / 2), 0, 1)
            : 0;
        // Same mapping as mouth: r=full → circle (n=2), r=0 → near-rectangle (n=8)
        n_in = 2.0 + (1.0 - norm_r_in) * 6.0;
    }

    let n_out = 2.0, ratio_out = 1.0;
    let mouthWidth = profileDataH[profileDataH.length-1].point.x * 2;
    let mouthHeight = mouthWidth;

    // In anisotrope mode, the mouth dimensions come from the two profiles
    if (isAniso) {
        mouthHeight = profileDataV[profileDataV.length-1].point.x * 2;
        ratio_out = mouthHeight / mouthWidth;
    }
    
    if (config.outputShape === 'rectangle' || config.outputShape === 'rounded_rectangle') {
        if (!isAniso) {
            const wId = `#wg-d-out-${config.outputShape === 'rectangle' ? 'rect' : 'rounded-rect'}-w`;
            const hId = `#wg-d-out-${config.outputShape === 'rectangle' ? 'rect' : 'rounded-rect'}-h`;
            mouthWidth  = parseFloat(domRoot.querySelector(wId).value) || 200;
            mouthHeight = parseFloat(domRoot.querySelector(hId).value) || 100;
            ratio_out = mouthHeight > 0 ? mouthHeight / mouthWidth : 1.0;
        }
        
        if (config.outputShape === 'rounded_rectangle') {
            const min_side = Math.min(mouthWidth, mouthHeight);
            const normalized_radius = clamp(config.outputRoundedRectRadius / (min_side / 2), 0, 1);
            n_out = 2.0 + (1.0 - normalized_radius) * 6.0;
        } else {
            n_out = 50.0; // High exponent → SE very close to true rectangle
        }
    }

    // --- Throat Adapter: third control point at z = L_adapter (= entry of
    // the main horn). Used for piecewise SHAPE interpolation only; the radial
    // profile is already computed correctly per-axis by profileGenerator. ---
    const adapterEnabled = !!(config.throatAdapter && config.throatAdapter.enabled
                              && config.throatAdapter.length > 0);
    let n_adMouth = n_in;
    let zSwitch = 0;
    if (adapterEnabled) {
        const ad = config.throatAdapter;
        zSwitch = ad.length;
        if (ad.mouthShape === 'rectangle') {
            n_adMouth = 8.0;
        } else if (ad.mouthShape === 'rounded_rectangle') {
            const w = ad.mouthRoundW > 0 ? ad.mouthRoundW : 1;
            const h = ad.mouthRoundH > 0 ? ad.mouthRoundH : w;
            const min_side = Math.min(w, h);
            const norm_r = min_side > 0 ? clamp((ad.mouthRoundR || 0) / (min_side / 2), 0, 1) : 0;
            n_adMouth = 2.0 + (1.0 - norm_r) * 6.0;
        } else {
            n_adMouth = 2.0; // circle
        }
    }
    
    // --- Uniform angular sampling with symmetry constraint ---
    const angles = computeUniformAngles(N);

    // Prépare la forme unitaire de la superformule pour la fusion.
    // Rot rotates the pattern (evaluated angle) while Aspect stretches it on Y,
    // matching ATH4's GCurve.Rot / GCurve.AspectRatio (default 0 / 1 = no-op).
    const sfRotRad = ((config.superformula.rot || 0) * Math.PI / 180);
    const sfAspect = config.superformula.aspect || 1;
    const sf_points_raw = Array.from({ length: N }, (_, j) => {
        const angle = angles[j];
        const r = superformula(angle - sfRotRad, config.superformula);
        return { x: r * Math.cos(angle), y: r * sfAspect * Math.sin(angle) };
    });
    const sf_area = calculatePolygonArea(sf_points_raw);
    const sf_scale = sf_area > 1e-9 ? Math.sqrt(Math.PI / sf_area) : 1;
    const sf_unit_points = sf_points_raw.map(p => ({ x: p.x * sf_scale, y: p.y * sf_scale }));

    // --- ÉTAPE 2: Générer les vertices ---
    const vertices = [];
    const useShapeControl = config.useShapeControl && config.shapeLength > 0 && totalLength > config.shapeLength;

    // Rectangle blending zone: smoothly transition to true rectangle over last slices
    const needsRectBlend = config.outputShape === 'rectangle' && config.inputShape !== 'rectangle';
    const RECT_BLEND_SLICES = needsRectBlend ? Math.max(4, Math.ceil(axialPoints * 0.12)) : 0;
    const rectBlendStart = axialPoints - RECT_BLEND_SLICES;
    
    // Fonction pour générer les points d'un rectangle strict (coins à 90°)
    const generateStrictRectanglePoints = (numPoints, w, h) => {
        const points = [];
        for (let j = 0; j < numPoints; j++) {
            const angle = angles[j];
            const cos_a = Math.cos(angle);
            const sin_a = Math.sin(angle);
            const r = 1.0 / Math.max(Math.abs(cos_a) / w, Math.abs(sin_a) / h);
            points.push({ x: r * cos_a, y: r * sin_a });
        }
        return points;
    };

    for (let i = 0; i < axialPoints; i++) {
        const z = profileDataH[i].point.y;
        const t_axial = totalLength > 0 ? z / totalLength : 0;

        // In anisotrope mode, area = π * rH * rV ; otherwise area = π * rH²
        const rH = profileDataH[i].point.x;
        const rV = isAniso ? profileDataV[i].point.x : rH;
        const targetArea = Math.PI * rH * rV;

        let blended_unit_points;
        
        // Si c'est un rectangle en entrée ET en sortie -> utilise le rectangle strict comme base
        // (désactivé quand le Throat Adapter est actif: il faut alors un morph
        // à trois points de contrôle, donc on passe par la super-ellipse.)
        if (!adapterEnabled && config.inputShape === 'rectangle' && config.outputShape === 'rectangle') {
            // In anisotrope mode, ratio comes from the two profiles
            let ratio_base;
            if (isAniso) {
                ratio_base = rV / rH;
            } else {
                ratio_base = ratio_in * (1 - t_axial) + ratio_out * t_axial;
            }
            // On génère des points de rectangle strict
            const w_rect = Math.sqrt(Math.PI / ratio_base);
            const h_rect = w_rect * ratio_base;
            const rect_points = generateStrictRectanglePoints(N, w_rect, h_rect);
            
            // b) Calcule l'amplitude de la déformation par la superformule
            let effective_amplitude = 0;
            if (useShapeControl && z <= config.shapeLength) {
                 const shape_influence = Math.sin(Math.PI * z / config.shapeLength);
                 effective_amplitude = config.superformula.amplitude * shape_influence;
            }
            
            // c) Fusionne le rectangle strict avec la superformula pour le shaping
            blended_unit_points = Array.from({ length: N }, (_, j) => {
                const angle = angles[j];
                const r_rect = Math.hypot(rect_points[j].x, rect_points[j].y);
                const r_sf_unit = Math.hypot(sf_unit_points[j].x, sf_unit_points[j].y);
                const r_blended = r_rect * (1 - effective_amplitude) + r_sf_unit * effective_amplitude;
                return { x: r_blended * Math.cos(angle), y: r_blended * Math.sin(angle) };
            });
        } else {
            // Cas standard : super-ellipse + superformule
            // a) Calcule la super-ellipse de base (interpolation gorge -> bouche).
            //    Avec Throat Adapter: morph par morceaux
            //      [0, L_ad]              : n_in   -> n_adMouth
            //      [L_ad, totalLength]    : n_adMouth -> n_out
            let n_base;
            if (adapterEnabled && totalLength > zSwitch + 1e-9) {
                if (z <= zSwitch) {
                    const tA = zSwitch > 1e-9 ? z / zSwitch : 1;
                    const wA = ease(tA);
                    n_base = n_in * (1 - wA) + n_adMouth * wA;
                } else {
                    const tB = (z - zSwitch) / (totalLength - zSwitch);
                    const wB = ease(tB);
                    n_base = n_adMouth * (1 - wB) + n_out * wB;
                }
            } else {
                const w_base = ease(t_axial);
                n_base = n_in * (1 - w_base) + n_out * w_base;
            }
            const w_base = ease(t_axial);
            // In anisotrope mode, ratio comes from the two profile curves
            let ratio_base;
            if (isAniso) {
                ratio_base = rV / rH;
            } else {
                ratio_base = ratio_in * (1 - w_base) + ratio_out * w_base;
            }
            const a_base_unit = Math.sqrt(Math.PI / ratio_base); // 'a' pour une super-ellipse d'aire PI
            const b_base_unit = a_base_unit * ratio_base;

            // b) Calcule l'amplitude de la déformation par la superformule
            let effective_amplitude = 0;
            if (useShapeControl && z <= config.shapeLength) {
                 const shape_influence = Math.sin(Math.PI * z / config.shapeLength);
                 effective_amplitude = config.superformula.amplitude * shape_influence;
            }
            
            // c) Génère la forme finale en fusionnant la super-ellipse et la superformule
            blended_unit_points = Array.from({ length: N }, (_, j) => {
                const angle = angles[j];
                const term1 = Math.abs(Math.cos(angle)) ** n_base;
                const term2 = Math.abs(Math.sin(angle)) ** n_base;
                const r_base_unit = (term1 / (a_base_unit ** n_base) + term2 / (b_base_unit ** n_base)) ** (-1 / n_base);
                const r_sf_unit = Math.hypot(sf_unit_points[j].x, sf_unit_points[j].y);
                const r_blended = r_base_unit * (1 - effective_amplitude) + r_sf_unit * effective_amplitude;
                return { x: r_blended * Math.cos(angle), y: r_blended * Math.sin(angle) };
            });
        }

        // d-bis) Smooth blend toward true rectangle for the last slices
        if (needsRectBlend && i >= rectBlendStart) {
            const t_rect = (i - rectBlendStart) / Math.max(1, axialPoints - 1 - rectBlendStart); // 0→1
            const t_smooth = t_rect * t_rect * (3 - 2 * t_rect); // smoothstep
            // True rectangle with the current slice's aspect ratio (unit area ≈ π)
            let ratio_cur;
            if (isAniso) {
                ratio_cur = rV / rH;
            } else {
                ratio_cur = ratio_in * (1 - ease(t_axial)) + ratio_out * ease(t_axial);
            }
            const w_r = Math.sqrt(Math.PI / ratio_cur);
            const h_r = w_r * ratio_cur;
            for (let j = 0; j < N; j++) {
                const angle = angles[j];
                const cos_a = Math.cos(angle);
                const sin_a = Math.sin(angle);
                const r_se = Math.hypot(blended_unit_points[j].x, blended_unit_points[j].y);
                const r_rect = 1.0 / Math.max(Math.abs(cos_a) / w_r, Math.abs(sin_a) / h_r);
                const r_final = r_se * (1 - t_smooth) + r_rect * t_smooth;
                blended_unit_points[j] = { x: r_final * cos_a, y: r_final * sin_a };
            }
        }

        // d) Normalise la forme fusionnée pour qu'elle ait l'aire requise
        const blended_area = calculatePolygonArea(blended_unit_points);
        const final_scale = blended_area > 1e-9 ? Math.sqrt(targetArea / blended_area) : 0;

        // Keep the very first slice (throat) EXACTLY at requested dimensions.
        // Area normalization is polygon-based and can drift a few microns on X/Y.
        const scaledPoints = blended_unit_points.map(p => ({ x: p.x * final_scale, y: p.y * final_scale }));
        if (i === 0) {
            let maxAbsX = 0;
            let maxAbsY = 0;
            for (let j = 0; j < scaledPoints.length; j++) {
                const px = Math.abs(scaledPoints[j].x);
                const py = Math.abs(scaledPoints[j].y);
                if (px > maxAbsX) maxAbsX = px;
                if (py > maxAbsY) maxAbsY = py;
            }

            if (config.inputShape === 'circle') {
                const targetHalf = Math.max(0, (config.dIn || 0) / 2);
                if (targetHalf > 0 && maxAbsX > 1e-12) {
                    const s = targetHalf / maxAbsX;
                    for (let j = 0; j < scaledPoints.length; j++) {
                        scaledPoints[j].x *= s;
                        scaledPoints[j].y *= s;
                    }
                }
            } else {
                const targetHalfW = Math.max(0, (config.throatWidth || 0) / 2);
                const targetHalfH = Math.max(0, (config.throatHeight || 0) / 2);
                const sx = (targetHalfW > 0 && maxAbsX > 1e-12) ? (targetHalfW / maxAbsX) : 1;
                const sy = (targetHalfH > 0 && maxAbsY > 1e-12) ? (targetHalfH / maxAbsY) : 1;
                for (let j = 0; j < scaledPoints.length; j++) {
                    scaledPoints[j].x *= sx;
                    scaledPoints[j].y *= sy;
                }
            }
        }

        scaledPoints.forEach(p => {
            vertices.push(p.x, p.y, z);
        });
    }

    // The smooth rect blending (step d-bis) already ensures the last slice is a
    // true rectangle, so no rect cap is needed.
    let totalAxialPoints = axialPoints;

    // --- ÉTAPE 3: Calculer les dimensions finales pour l'UI ---
    const finalSliceStartIndex = (totalAxialPoints - 1) * N * 3;
    let finalWidth = 0, finalHeight = 0;
    if (vertices.length >= finalSliceStartIndex + N*3) {
      for (let j = 0; j < N; j++) {
          finalWidth  = Math.max(finalWidth,  Math.abs(vertices[finalSliceStartIndex + j * 3]));
          finalHeight = Math.max(finalHeight, Math.abs(vertices[finalSliceStartIndex + j * 3 + 1]));
      }
    }
    
    return { vertices, finalDimensions: { width: finalWidth * 2, height: finalHeight * 2 }, totalAxialPoints };
}


// --- RADIAL HORN DISTORTION ---

/**
 * Compute the z-offset for a single coordinate due to radial distortion.
 * The offset is maximum at the center (coord=0) and zero at the edges (coord=±halfExtent).
 * @param {number} coord - The x or y coordinate of the point.
 * @param {number} halfExtent - The half-width or half-height of the section.
 * @param {number} height - The sagitta (max displacement at center).
 * @param {string} type - 'linear' or 'arced'.
 * @returns {number} The z-offset to add.
 */
function computeRadialOffset(coord, halfExtent, height, type) {
    if (halfExtent < 1e-6 || height < 1e-6) return 0;
    const absCoord = Math.abs(coord);
    if (absCoord >= halfExtent) return 0;

    if (type === 'linear') {
        // Triangular: maximum at center, drops linearly to zero at edges
        return height * (1 - absCoord / halfExtent);
    } else if (type === 'arced') {
        // Circular arc: maximum at center, zero at edges
        // Sagitta formula: R = (halfExtent² + height²) / (2·height)
        // Offset(x) = height - (R - sqrt(R² - x²))
        const R = (halfExtent * halfExtent + height * height) / (2 * height);
        const sqrtTerm = Math.sqrt(Math.max(0, R * R - coord * coord));
        return height - (R - sqrtTerm);
    }
    return 0;
}

/**
 * Check if radial distortion is active.
 */
function hasRadialDistortion(radialConfig) {
    if (!radialConfig || !radialConfig.enabled) return false;
    return radialConfig.upDown.height > 0 || radialConfig.leftRight.height > 0;
}

/**
 * Apply radial distortion to the main waveguide flat vertices array.
 * Per-slice: uses actual vertex extents for accurate scaling.
 * The Height parameter specifies the sagitta at the mouth; intermediate
 * slices scale proportionally to their local half-dimension.
 */
function applyRadialDistortionToVertices(arr, numLines, numSlices, radialConfig) {
    if (!hasRadialDistortion(radialConfig)) return;

    const hasUD = radialConfig.upDown.height > 0;
    const hasLR = radialConfig.leftRight.height > 0;

    // Find mouth dimensions (last slice)
    const lastStart = (numSlices - 1) * numLines * 3;
    let mouthHalfW = 0, mouthHalfH = 0;
    for (let j = 0; j < numLines; j++) {
        const idx = lastStart + j * 3;
        mouthHalfW = Math.max(mouthHalfW, Math.abs(arr[idx]));
        mouthHalfH = Math.max(mouthHalfH, Math.abs(arr[idx + 1]));
    }

    for (let i = 0; i < numSlices; i++) {
        const sliceStart = i * numLines * 3;
        // Axial progression: 0 at throat, 1 at mouth → throat stays flat
        const t_axial = numSlices > 1 ? i / (numSlices - 1) : 0;

        // Compute actual local half-dimensions of this slice
        let localHalfW = 0, localHalfH = 0;
        for (let j = 0; j < numLines; j++) {
            const idx = sliceStart + j * 3;
            localHalfW = Math.max(localHalfW, Math.abs(arr[idx]));
            localHalfH = Math.max(localHalfH, Math.abs(arr[idx + 1]));
        }

        // Scale sagitta proportionally to local / mouth dimension AND axial position
        const h_lr = hasLR && mouthHalfW > 1e-6
            ? radialConfig.leftRight.height * (localHalfW / mouthHalfW) * t_axial : 0;
        const h_ud = hasUD && mouthHalfH > 1e-6
            ? radialConfig.upDown.height * (localHalfH / mouthHalfH) * t_axial : 0;

        for (let j = 0; j < numLines; j++) {
            const idx = sliceStart + j * 3;
            let dz = 0;

            if (h_lr > 1e-6) {
                dz += computeRadialOffset(arr[idx], localHalfW, h_lr, radialConfig.leftRight.type);
            }
            if (h_ud > 1e-6) {
                dz += computeRadialOffset(arr[idx + 1], localHalfH, h_ud, radialConfig.upDown.type);
            }

            arr[idx + 2] += dz;
        }
    }
}

/**
 * Apply radial distortion to a BufferGeometry using interpolated dimensions.
 * Used for interface/throat cap geometries that don't have a known slice structure.
 */
function applyRadialDistortionToGeometry(geometry, radialConfig, mouthHalfW, mouthHalfH, throatHalfW, throatHalfH, totalLength) {
    if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
    if (!hasRadialDistortion(radialConfig)) return;

    const hasUD = radialConfig.upDown.height > 0;
    const hasLR = radialConfig.leftRight.height > 0;

    // The exporters read `userData.preciseVertices` (Float64 mirror) in
    // preference to the Float32 attribute — it must receive the SAME warp,
    // otherwise STEP/MSH come out undistorted.
    const buffers = [geometry.attributes.position.array];
    if (geometry.userData && geometry.userData.preciseVertices) {
        buffers.push(geometry.userData.preciseVertices);
    }

    for (const arr of buffers) {
        for (let i = 0; i < arr.length; i += 3) {
            const x = arr[i], y = arr[i + 1], z = arr[i + 2];
            const t = totalLength > 1e-6 ? Math.max(0, Math.min(1, z / totalLength)) : 0;

            // Interpolate local half-dimensions
            const localHalfW = throatHalfW + (mouthHalfW - throatHalfW) * t;
            const localHalfH = throatHalfH + (mouthHalfH - throatHalfH) * t;

            // Scale by axial position so throat stays flat
            const h_lr = hasLR && mouthHalfW > 1e-6
                ? radialConfig.leftRight.height * (localHalfW / mouthHalfW) * t : 0;
            const h_ud = hasUD && mouthHalfH > 1e-6
                ? radialConfig.upDown.height * (localHalfH / mouthHalfH) * t : 0;

            let dz = 0;
            if (h_lr > 1e-6 && localHalfW > 1e-6) {
                dz += computeRadialOffset(x, localHalfW, h_lr, radialConfig.leftRight.type);
            }
            if (h_ud > 1e-6 && localHalfH > 1e-6) {
                dz += computeRadialOffset(y, localHalfH, h_ud, radialConfig.upDown.type);
            }

            arr[i + 2] += dz;
        }
    }
    geometry.attributes.position.needsUpdate = true;
}

// --- FONCTION PRINCIPALE DE GÉNÉRATION ET D'AFFICHAGE ---
export function generateAndDisplayWaveguide(config, profileDataH, profileDataV, buildInterface, domRoot) {
    clearScene();
    if (profileDataH.length < 2) return { finalDimensions: { width: 0, height: 0 }, vertices: [] };

    // Total length includes the throat adapter when enabled — derive it from
    // the actual profile (last sample's z) to avoid double-bookkeeping.
    const adapterLength = (config.throatAdapter && config.throatAdapter.enabled)
        ? (config.throatAdapter.length || 0) : 0;
    const mainLength = config.segments.reduce((acc, seg) => acc + seg.length, 0);
    const totalLength = mainLength + adapterLength;
    const { vertices, finalDimensions, totalAxialPoints } = createGeometryFromProfile(config, profileDataH, profileDataV, totalLength, domRoot);
    
    // Le nombre de points axial inclut la tranche rectangulaire de cap
    const numProfilePoints = totalAxialPoints;
    const effectiveTotalLength = totalLength;

    // Apply radial distortion to the main vertices before any mesh creation
    applyRadialDistortionToVertices(vertices, config.numLines, numProfilePoints, config.radial);

    // Appliquer le split aux vertices pour l'affichage des points
    const { splitVertices, splitColors } = applySplitToVertices(config, vertices, profileDataH, numProfilePoints);
    
    const validationGeom = new THREE.BufferGeometry();
    validationGeom.setAttribute('position', new THREE.Float32BufferAttribute(splitVertices, 3));
    validationGeom.setAttribute('color', new THREE.Float32BufferAttribute(splitColors, 3));
    state.pointsMesh = new THREE.Points(validationGeom, new THREE.PointsMaterial({ size: 1.5, vertexColors: true }));
    state.scene.add(state.pointsMesh);

    // Wireframe (maillage) pour le guide d'ondes
    const wireframeGeom = createGridWireframeGeometry(config, vertices, numProfilePoints);
    state.wireframeMesh = new THREE.LineSegments(wireframeGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 }));
    state.scene.add(state.wireframeMesh);

    state.geometries.waveguide = createMeshFromVertices(config, vertices, numProfilePoints);
    state.geometries.fullWaveguide = createMeshFromVertices({ ...config, split: { horizontal: false, vertical: false } }, vertices, numProfilePoints);
    
    const geomsToMerge = [state.geometries.waveguide];
    if (buildInterface) {
        // <-- CORRECTION : On passe les vertices de la gorge à la fonction
        const throatSliceVertices = vertices.slice(0, config.numLines * 3);
        const ifaceResult = createInterfaceGeometry(config, numProfilePoints, effectiveTotalLength, vertices);
        state.geometries.interface = ifaceResult.merged;
        state.geometries.interfaceWall = ifaceResult.wall;
        state.geometries.interfaceFace = ifaceResult.face;
        state.geometries.throatCap = createThroatCapGeometry(config, throatSliceVertices);
        
        // Stocker aussi les versions complètes (sans split) pour l'export
        const fullIfaceResult = createInterfaceGeometry({ ...config, split: { horizontal: false, vertical: false } }, numProfilePoints, effectiveTotalLength, vertices);
        state.geometries.fullInterface = fullIfaceResult.merged;
        state.geometries.fullInterfaceWall = fullIfaceResult.wall;
        state.geometries.fullInterfaceFace = fullIfaceResult.face;
        state.geometries.fullThroatCap = createThroatCapGeometry({ ...config, split: { horizontal: false, vertical: false } }, throatSliceVertices);
        
        // Apply radial distortion to interface/throat cap BEFORE merging
        // Main waveguide vertices were already distorted; interface/throat generate their own z grids.
        if (hasRadialDistortion(config.radial)) {
            const N = config.numLines;
            let throatHalfW = 0, throatHalfH = 0;
            for (let j = 0; j < N && j * 3 + 1 < vertices.length; j++) {
                throatHalfW = Math.max(throatHalfW, Math.abs(vertices[j * 3]));
                throatHalfH = Math.max(throatHalfH, Math.abs(vertices[j * 3 + 1]));
            }
            const mouthHalfW = finalDimensions.width / 2;
            const mouthHalfH = finalDimensions.height / 2;

            const radialTx = (g) => applyRadialDistortionToGeometry(
                g, config.radial, mouthHalfW, mouthHalfH, throatHalfW, throatHalfH, effectiveTotalLength
            );

            ['interface', 'interfaceWall', 'interfaceFace', 'throatCap',
             'fullInterface', 'fullInterfaceWall', 'fullInterfaceFace', 'fullThroatCap'].forEach(key => {
                if (state.geometries[key]) radialTx(state.geometries[key]);
            });
        }

        geomsToMerge.push(state.geometries.interface, state.geometries.throatCap);
        // On vérifie que les géométries existent avant de créer les points
        // Les points utilisent les géométries avec split appliqué
        if (state.geometries.interface?.attributes?.position?.count > 0) {
            state.interfacePointsMesh = new THREE.Points(state.geometries.interface.clone(), new THREE.PointsMaterial({ size: 1.5, color: 0x00FFFF }));
            state.scene.add(state.interfacePointsMesh);
            // Wireframe interface
            const ifaceWireGeom = new THREE.WireframeGeometry(state.geometries.interface);
            state.interfaceWireframeMesh = new THREE.LineSegments(ifaceWireGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 }));
            state.scene.add(state.interfaceWireframeMesh);
        }
        if (state.geometries.throatCap?.attributes?.position?.count > 0) {
            state.throatCapPointsMesh = new THREE.Points(state.geometries.throatCap.clone(), new THREE.PointsMaterial({ size: 1.5, color: 0xFFFF00 }));
            state.scene.add(state.throatCapPointsMesh);
            // Wireframe throat cap
            const tcWireGeom = new THREE.WireframeGeometry(state.geometries.throatCap);
            state.throatCapWireframeMesh = new THREE.LineSegments(tcWireGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 }));
            state.scene.add(state.throatCapWireframeMesh);
        }
    }
    
    const finalGeometry = mergeGeometries(geomsToMerge);
    if (!finalGeometry.attributes.position || finalGeometry.attributes.position.count === 0) return { finalDimensions, vertices };

    // Build effective radial config by merging Radial auto + Arced Horn manual
    const effectiveRadial = buildEffectiveRadial(config, finalDimensions, effectiveTotalLength);

    // Apply radial arc transform to all geometries (before translate)
    if (hasRadialArc(effectiveRadial)) {
        const txGeom = (g) => applyRadialArcToGeometry(g, effectiveTotalLength, effectiveRadial);

        // Export geometries
        Object.values(state.geometries).forEach(txGeom);

        // Merged display geometry
        txGeom(finalGeometry);

        // Scene display geometries (clones / wireframe copies, independent from state.geometries)
        if (state.pointsMesh) txGeom(state.pointsMesh.geometry);
        if (state.wireframeMesh) txGeom(state.wireframeMesh.geometry);
        if (state.interfacePointsMesh) txGeom(state.interfacePointsMesh.geometry);
        if (state.interfaceWireframeMesh) txGeom(state.interfaceWireframeMesh.geometry);
        if (state.throatCapPointsMesh) txGeom(state.throatCapPointsMesh.geometry);
        if (state.throatCapWireframeMesh) txGeom(state.throatCapWireframeMesh.geometry);

        // Flat vertices array (for return value / export)
        applyRadialArcToArray(vertices, effectiveTotalLength, effectiveRadial);
    }

    finalGeometry.translate(0, 0, -effectiveTotalLength);
    if (state.pointsMesh) state.pointsMesh.geometry.translate(0, 0, -effectiveTotalLength);
    if (state.wireframeMesh) state.wireframeMesh.geometry.translate(0, 0, -effectiveTotalLength);
    if (state.interfacePointsMesh) state.interfacePointsMesh.geometry.translate(0, 0, -effectiveTotalLength);
    if (state.interfaceWireframeMesh) state.interfaceWireframeMesh.geometry.translate(0, 0, -effectiveTotalLength);
    if (state.throatCapPointsMesh) state.throatCapPointsMesh.geometry.translate(0, 0, -effectiveTotalLength);
    if (state.throatCapWireframeMesh) state.throatCapWireframeMesh.geometry.translate(0, 0, -effectiveTotalLength);
    
    finalGeometry.computeVertexNormals();
    state.mesh = new THREE.Mesh(finalGeometry, new THREE.MeshNormalMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    state.scene.add(state.mesh);
    
    state.geometries.mesh = finalGeometry;

    fitCameraToScene();

    return { finalDimensions, vertices };
}


// ====================================================================================================
// MODE DOSC (US 5,163,167) — cf. dosc/doscGenerator.js pour la dérivation
//
// Différence structurelle avec une corne : le conduit DOSC est ANNULAIRE. Il
// est délimité par DEUX surfaces — le carter (paroi extérieure) et le corps
// interne (le diffuseur central). On produit donc deux empilements d'anneaux
// indépendants, chacun ayant exactement la structure « numSlices × numLines »
// attendue par createMeshFromVertices / les exporteurs.
//
// Conventions préservées à l'identique : z = 0 à la gorge dans le générateur,
// puis translation de -depth en fin de fonction (gorge en z = -depth, bouche en
// z = 0, rayonnement vers +Z) comme pour les cornes.
// ====================================================================================================

/**
 * Cape en éventail fermant un anneau par un disque plan à la cote zPlane.
 * Même structure que createThroatCapGeometry, mais à cote libre : sert au nez
 * et à l'arête de fuite du corps interne DOSC.
 */
function createRingFanCap(config, ringPoints, zPlane, ringCount) {
    const N = config.numLines;
    const rings = Math.max(2, Math.min(ringCount, 40));
    const grid = [];
    // Centre d'abord : l'ordre bord→centre / centre→bord fixe le sens des normales.
    for (let j = 0; j < N; j++) grid.push(0, 0, zPlane);
    for (let i = 1; i <= rings; i++) {
        const s = i / rings;
        for (let j = 0; j < N; j++) grid.push(ringPoints[j * 3] * s, ringPoints[j * 3 + 1] * s, zPlane);
    }
    return createMeshFromVertices(config, grid, rings + 1);
}

/** Copie la tranche `sliceIndex` d'un empilement dans un tableau plat [x,y,z,…]. */
function doscSliceToFlat(stack, sliceIndex) {
    const N = stack.numLines;
    const out = new Array(N * 3);
    const base = sliceIndex * N * 3;
    for (let k = 0; k < N * 3; k++) out[k] = stack.vertices[base + k];
    return out;
}

/**
 * Génère et affiche la géométrie DOSC. Renvoie le même contrat que
 * generateAndDisplayWaveguide : { finalDimensions, vertices }.
 *
 * `state.geometries` reçoit :
 *   waveguide / fullWaveguide   → paroi du CARTER (empilement d'anneaux propre,
 *                                 donc directement exploitable par les
 *                                 exporteurs existants qui découpent par N)
 *   doscBody / fullDoscBody     → paroi du CORPS interne
 *   doscBodyNoseCap / TailCap   → fermetures du corps (cf. §3 du générateur)
 *   throatCap, interface*       → identiques au mode Horn
 *   doscMeta                    → paramètres dérivés + diagnostic d'isophasicité
 */
export function generateAndDisplayDosc(config, buildInterface, domRoot) {
    clearScene();

    const built = generateDosc({
        ...config.dosc,
        numLines: config.numLines,
        axialPoints: config.pointsPerSegment,
    });
    if (!built.ok) {
        return { finalDimensions: { width: 0, height: 0 }, vertices: [], error: built.error };
    }

    const { housing, body, params } = built;
    const depth = params.depth;
    const fullConfig = { ...config, split: { horizontal: false, vertical: false } };

    const housingVerts = Array.from(housing.vertices);
    const bodyVerts = Array.from(body.vertices);

    // --- Nuage de points (avec split appliqué) ---
    const pointPositions = [];
    const pointColors = [];
    const pushPoints = (arr, color) => {
        for (let k = 0; k < arr.length; k += 3) {
            const x = arr[k], y = arr[k + 1], z = arr[k + 2];
            if (config.split.horizontal && y < -0.001) continue;
            if (config.split.vertical && x < -0.001) continue;
            pointPositions.push(x, y, z);
            pointColors.push(color.r, color.g, color.b);
        }
    };
    pushPoints(housingVerts, new THREE.Color(0x00ff00));
    pushPoints(bodyVerts, new THREE.Color(0xff8800));

    const ptGeom = new THREE.BufferGeometry();
    ptGeom.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
    ptGeom.setAttribute('color', new THREE.Float32BufferAttribute(pointColors, 3));
    state.pointsMesh = new THREE.Points(ptGeom, new THREE.PointsMaterial({ size: 1.5, vertexColors: true }));
    state.scene.add(state.pointsMesh);

    // --- Wireframe : carter + corps ---
    const wireGeom = mergeGeometries([
        createGridWireframeGeometry(config, housingVerts, housing.numSlices),
        createGridWireframeGeometry(config, bodyVerts, body.numSlices),
    ]);
    state.wireframeMesh = new THREE.LineSegments(wireGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 }));
    state.scene.add(state.wireframeMesh);

    // --- Surfaces exportables ---
    state.geometries.waveguide = createMeshFromVertices(config, housingVerts, housing.numSlices);
    state.geometries.fullWaveguide = createMeshFromVertices(fullConfig, housingVerts, housing.numSlices);
    state.geometries.doscBody = createMeshFromVertices(config, bodyVerts, body.numSlices);
    state.geometries.fullDoscBody = createMeshFromVertices(fullConfig, bodyVerts, body.numSlices);
    // `doscShell` est la clé sur laquelle les exporteurs détectent le mode DOSC :
    // c'est l'empilement du carter, seul buffer à structure d'anneaux régulière.
    state.geometries.doscShell = state.geometries.fullWaveguide;
    state.geometries.fullDoscShell = state.geometries.fullWaveguide;

    // Fermetures du corps interne : nez (méplat de 2·noseRadius) et arête de
    // fuite (méplat de `edgeThickness`). Sans elles, le corps est une coque
    // ouverte et le volume fluide n'est pas défini.
    const bodyFirst = doscSliceToFlat(body, 0);
    const bodyLast = doscSliceToFlat(body, body.numSlices - 1);
    state.geometries.doscBodyNoseCap = createRingFanCap(config, bodyFirst, built.zBodyStart, 2);
    state.geometries.doscBodyTailCap = createRingFanCap(config, bodyLast, depth, 3);
    state.geometries.fullDoscBodyNoseCap = createRingFanCap(fullConfig, bodyFirst, built.zBodyStart, 2);
    state.geometries.fullDoscBodyTailCap = createRingFanCap(fullConfig, bodyLast, depth, 3);

    const geomsToMerge = [
        state.geometries.waveguide,
        state.geometries.doscBody,
        state.geometries.doscBodyNoseCap,
        state.geometries.doscBodyTailCap,
    ];

    if (buildInterface) {
        const throatSlice = doscSliceToFlat(housing, 0);
        const ifaceResult = createInterfaceGeometry(config, housing.numSlices, depth, housingVerts);
        state.geometries.interface = ifaceResult.merged;
        state.geometries.interfaceWall = ifaceResult.wall;
        state.geometries.interfaceFace = ifaceResult.face;
        state.geometries.throatCap = createThroatCapGeometry(config, throatSlice);

        const fullIface = createInterfaceGeometry(fullConfig, housing.numSlices, depth, housingVerts);
        state.geometries.fullInterface = fullIface.merged;
        state.geometries.fullInterfaceWall = fullIface.wall;
        state.geometries.fullInterfaceFace = fullIface.face;
        state.geometries.fullThroatCap = createThroatCapGeometry(fullConfig, throatSlice);

        geomsToMerge.push(state.geometries.interface, state.geometries.throatCap);

        if (state.geometries.interface?.attributes?.position?.count > 0) {
            state.interfacePointsMesh = new THREE.Points(state.geometries.interface.clone(), new THREE.PointsMaterial({ size: 1.5, color: 0x00FFFF }));
            state.scene.add(state.interfacePointsMesh);
            state.interfaceWireframeMesh = new THREE.LineSegments(
                new THREE.WireframeGeometry(state.geometries.interface),
                new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 }));
            state.scene.add(state.interfaceWireframeMesh);
        }
        if (state.geometries.throatCap?.attributes?.position?.count > 0) {
            state.throatCapPointsMesh = new THREE.Points(state.geometries.throatCap.clone(), new THREE.PointsMaterial({ size: 1.5, color: 0xFFFF00 }));
            state.scene.add(state.throatCapPointsMesh);
            state.throatCapWireframeMesh = new THREE.LineSegments(
                new THREE.WireframeGeometry(state.geometries.throatCap),
                new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 }));
            state.scene.add(state.throatCapWireframeMesh);
        }
    }

    // Diagnostic d'isophasicité : peu d'azimuts et pas d'intégration grossier,
    // pour rester interactif (~10 ms). Le générateur est appelé à chaque frappe
    // dans un champ ; avec les 25 azimuts × 2000 pas du harnais on paierait
    // plusieurs centaines de millisecondes par caractère.
    // L'analyse fine est dans scripts/dosc_harness.mjs.
    const report = computeIsophaseReport(built, { azimuthSamples: 9, fMaxHz: 16000, steps: 400 });
    state.geometries.doscMeta = {
        params,
        filletRadius: built.filletRadius,
        filletRequested: config.dosc.filletRadius,
        maxFilletRadius: built.maxFilletRadius,
        zBodyStart: built.zBodyStart,
        edgeThickness: built.edgeThickness,
        noseRadius: built.noseRadius,
        report,
        patent: checkPatentConditions(params, report),
        housingSlices: housing.numSlices,
        bodySlices: body.numSlices,
        // `generateDosc` arrondit numLines au multiple de 4 supérieur : les
        // exporteurs doivent utiliser CETTE valeur pour redécouper les anneaux.
        numLines: housing.numLines,
        depth,
    };

    const finalGeometry = mergeGeometries(geomsToMerge);
    if (!finalGeometry.attributes.position || finalGeometry.attributes.position.count === 0) {
        return { finalDimensions: { width: params.mouthWidth, height: params.mouthHeight }, vertices: housingVerts };
    }

    // Translation axiale : même convention que le mode Horn — SEULES les
    // géométries d'affichage sont translatées. Celles de `state.geometries`
    // restent en z ∈ [0, depth] : les exporteurs appliquent eux-mêmes le
    // décalage (cf. extractSlicesForSTEP / exportSTL). Les translater ici
    // provoquerait un double décalage à l'export.
    finalGeometry.translate(0, 0, -depth);
    [state.pointsMesh, state.wireframeMesh, state.interfacePointsMesh,
     state.interfaceWireframeMesh, state.throatCapPointsMesh, state.throatCapWireframeMesh]
        .forEach(m => { if (m) m.geometry.translate(0, 0, -depth); });

    finalGeometry.computeVertexNormals();
    state.mesh = new THREE.Mesh(finalGeometry, new THREE.MeshNormalMaterial({
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }));
    state.scene.add(state.mesh);
    state.geometries.mesh = finalGeometry;

    fitCameraToScene();

    return {
        finalDimensions: { width: params.mouthWidth, height: params.mouthHeight },
        vertices: housingVerts,
    };
}

// --- GÉOMÉTRIES ADDITIONNELLES ET UTILITAIRES ---

/**
 * Build the effective radial config by merging auto-radial and manual arced horn settings.
 * Auto-radial computes arc height from the mouth dimensions (mouthDim / 4).
 * Manual arced horn overrides per-axis if its checkbox is on and type is 'arced'.
 */
function buildEffectiveRadial(config, finalDimensions, totalLength) {
    const result = {
        upDown: { type: 'straight', height: 0 },
        leftRight: { type: 'straight', height: 0 }
    };

    // Arced horn: convert angle (degrees) to arc height using sagitta
    // h = R - R·cos(θ/2), R = L / θ  =>  h = L/θ · (1 - cos(θ/2))
    if (config.arcedHorn && config.arcedHorn.enabled) {
        const udAngle = config.arcedHorn.upDown.angle;
        if (udAngle > 0) {
            const theta = udAngle * Math.PI / 180;
            const R = totalLength / theta;
            const h = R * (1 - Math.cos(theta / 2));
            result.upDown = { type: 'arced', height: h };
        }
        const lrAngle = config.arcedHorn.leftRight.angle;
        if (lrAngle > 0) {
            const theta = lrAngle * Math.PI / 180;
            const R = totalLength / theta;
            const h = R * (1 - Math.cos(theta / 2));
            result.leftRight = { type: 'arced', height: h };
        }
    }

    return result;
}

/**
 * Apply radial arc transform to a flat vertex array (or typed array) in place.
 * Up-Down bends in the YZ plane, Left-Right bends in the XZ plane.
 * Transforms are applied sequentially: UD first, then LR.
 */
function applyRadialArcToArray(arr, totalLength, radialConfig) {
    const hasUD = radialConfig.upDown && radialConfig.upDown.type === 'arced' && radialConfig.upDown.height > 0;
    const hasLR = radialConfig.leftRight && radialConfig.leftRight.type === 'arced' && radialConfig.leftRight.height > 0;
    if (!hasUD && !hasLR) return;

    const L = totalLength;
    const R_ud = hasUD ? (L * L) / (8 * radialConfig.upDown.height) + radialConfig.upDown.height / 2 : 0;
    const R_lr = hasLR ? (L * L) / (8 * radialConfig.leftRight.height) + radialConfig.leftRight.height / 2 : 0;

    for (let i = 0; i < arr.length; i += 3) {
        let x = arr[i], y = arr[i + 1], z = arr[i + 2];

        if (hasUD) {
            const theta = z / R_ud;
            const cosT = Math.cos(theta), sinT = Math.sin(theta);
            const newY = R_ud - (R_ud - y) * cosT;
            const newZ = (R_ud - y) * sinT;
            y = newY;
            z = newZ;
        }

        if (hasLR) {
            const theta = z / R_lr;
            const cosT = Math.cos(theta), sinT = Math.sin(theta);
            const newX = R_lr - (R_lr - x) * cosT;
            const newZ = (R_lr - x) * sinT;
            x = newX;
            z = newZ;
        }

        arr[i] = x;
        arr[i + 1] = y;
        arr[i + 2] = z;
    }
}

function applyRadialArcToGeometry(geometry, totalLength, radialConfig) {
    if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
    applyRadialArcToArray(geometry.attributes.position.array, totalLength, radialConfig);
    geometry.attributes.position.needsUpdate = true;
    // `createMeshFromVertices` stashed a Float64 mirror BEFORE the bend was
    // applied, and the exporters (STEP / MSH-Delaunay) read that mirror in
    // preference to the Float32 attribute. Without this the exported horn is
    // perfectly straight while the 3D preview shows the arc.
    const pv = geometry.userData && geometry.userData.preciseVertices;
    if (pv) applyRadialArcToArray(pv, totalLength, radialConfig);
}

function hasRadialArc(radialConfig) {
    if (!radialConfig) return false;
    const hasUD = radialConfig.upDown && radialConfig.upDown.type === 'arced' && radialConfig.upDown.height > 0;
    const hasLR = radialConfig.leftRight && radialConfig.leftRight.type === 'arced' && radialConfig.leftRight.height > 0;
    return hasUD || hasLR;
}

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

function createGridWireframeGeometry(config, vertices, numProfilePoints) {
    const pointsPerSlice = config.numLines;
    const splitPositions = [];
    const mapping = new Array(vertices.length / 3).fill(-1);
    let newIndex = 0;
    for (let i = 0; i < numProfilePoints; i++) {
        for (let j = 0; j < pointsPerSlice; j++) {
            const idx = i * pointsPerSlice + j;
            if (idx * 3 + 2 >= vertices.length) continue;
            const x = vertices[idx * 3], y = vertices[idx * 3 + 1], z = vertices[idx * 3 + 2];
            let keep = true;
            if (config.split.horizontal && y < -0.001) keep = false;
            if (config.split.vertical && x < -0.001) keep = false;
            if (keep) { splitPositions.push(x, y, z); mapping[idx] = newIndex++; }
        }
    }
    const lineIndices = [];
    for (let i = 0; i < numProfilePoints; i++) {
        for (let j = 0; j < pointsPerSlice; j++) {
            const idx = i * pointsPerSlice + j;
            // Ring connection: j -> (j+1) % N
            const nextJ = (j + 1) % pointsPerSlice;
            const idxNext = i * pointsPerSlice + nextJ;
            if (mapping[idx] !== -1 && mapping[idxNext] !== -1) {
                lineIndices.push(mapping[idx], mapping[idxNext]);
            }
            // Axial connection: i -> i+1
            if (i < numProfilePoints - 1) {
                const idxBelow = (i + 1) * pointsPerSlice + j;
                if (mapping[idx] !== -1 && mapping[idxBelow] !== -1) {
                    lineIndices.push(mapping[idx], mapping[idxBelow]);
                }
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(splitPositions, 3));
    geometry.setIndex(lineIndices);
    return geometry;
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
            // Alternate diagonal direction to eliminate systematic bias in surface normals
            // that causes sawtooth diffraction artifacts in BEM simulations
            if ((i + j) % 2 === 0) {
                // Diagonal: p1→p4
                if (mapping[p1] !== -1 && mapping[p3] !== -1 && mapping[p4] !== -1) indices.push(mapping[p1], mapping[p3], mapping[p4]);
                if (mapping[p1] !== -1 && mapping[p4] !== -1 && mapping[p2] !== -1) indices.push(mapping[p1], mapping[p4], mapping[p2]);
            } else {
                // Diagonal: p2→p3
                if (mapping[p1] !== -1 && mapping[p3] !== -1 && mapping[p2] !== -1) indices.push(mapping[p1], mapping[p3], mapping[p2]);
                if (mapping[p2] !== -1 && mapping[p3] !== -1 && mapping[p4] !== -1) indices.push(mapping[p2], mapping[p3], mapping[p4]);
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(splitVertices, 3));
    geometry.setIndex(indices);
    // Stash a Float64 copy of the (split-filtered) vertex stream so exporters
    // can read coordinates at full double precision. Three.js BufferAttribute
    // is Float32 only — that truncates 12.7 to 12.69999961... and ruins exact
    // dimensional output (STL diameter, STEP circle radius, etc.).
    geometry.userData.preciseVertices = new Float64Array(splitVertices);
    geometry.userData.numLines = pointsPerSlice;
    geometry.userData.numSlices = numProfilePoints;
    return geometry;
}

function validateGeometryAndGetPointColors(vertices, profileData, pointsPerSlice) {
    const numProfilePoints = Math.floor(vertices.length / 3 / pointsPerSlice);
    const pointsColors = [];
    const colorValid = new THREE.Color(0x00ff00), colorInvalid = new THREE.Color(0xff0000);

    // Tolérance pour bruit numérique (mm et relatif)
    const tolAbs = 0.05; // 5/100 mm
    const tolRel = 0.001; // 0.1 %

    // Enveloppe max : pour chaque angle j, le plus grand rayon vu jusqu'ici.
    // Si un rayon tombe sous cette enveloppe, la surface est concave à cet angle.
    const maxRadii = new Array(pointsPerSlice).fill(0);

    for (let i = 0; i < numProfilePoints; i++) {
        const profileIndex = Math.max(0, Math.min(
            profileData.length - 1,
            Math.round(i * (profileData.length - 1) / Math.max(1, (numProfilePoints - 1)))
        ));
        const isProfileMonotonic = !!profileData[profileIndex].isValid;
        let decreases = 0;
        const startIndex = i * pointsPerSlice * 3;

        for (let j = 0; j < pointsPerSlice; j++) {
            const r = Math.hypot(vertices[startIndex + j * 3], vertices[startIndex + j * 3 + 1]);
            if (i > 0) {
                const eps = Math.max(tolAbs, tolRel * maxRadii[j]);
                if (r + eps < maxRadii[j]) decreases++;
            }
            maxRadii[j] = Math.max(maxRadii[j], r);
        }

        // Flag concave dès qu'un seul rayon angulaire est sous son enveloppe max
        const isSliceConcave = (decreases >= 1);

        const sliceColor = (isProfileMonotonic && !isSliceConcave) ? colorValid : colorInvalid;
        for (let j = 0; j < pointsPerSlice; j++) {
            pointsColors.push(sliceColor.r, sliceColor.g, sliceColor.b);
        }
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
    const N = config.numLines;
    const mouthZ = totalLength;
    const zOffset = config.interface.tipOffset;
    const faceZ = mouthZ + zOffset;
    const arcedHorn = config.arcedHorn;
    const preserveArcedMouthZ = !!(arcedHorn && arcedHorn.enabled &&
        ((arcedHorn.upDown && arcedHorn.upDown.angle > 0) ||
         (arcedHorn.leftRight && arcedHorn.leftRight.angle > 0)));
    
    // Récupère les sommets de la bouche
    const mouthVertices = [];
    const startIndex = (numProfilePoints - 1) * N;
    for (let j = 0; j < N; j++) {
        const idx = (startIndex + j) * 3;
        mouthVertices.push(new THREE.Vector3(vertices[idx], vertices[idx + 1], vertices[idx + 2]));
    }
    
    // --- Partie 1 : mur perpendiculaire (bouche → plan avant) ---
    // Calcul du nombre de tranches axiales pour le mur
    let mouthPerimeter = 0;
    for (let j = 0; j < N; j++) {
        const next = (j + 1) % N;
        mouthPerimeter += mouthVertices[j].distanceTo(mouthVertices[next]);
    }
    const angularSpacing = mouthPerimeter / N;
    const wallAxialPoints = Math.max(2, Math.round(zOffset / angularSpacing));
    
    const wallGridPoints = [];
    for (let i = 0; i <= wallAxialPoints; i++) {
        const t = i / wallAxialPoints;
        for (let j = 0; j < N; j++) {
            const arcedOffset = preserveArcedMouthZ ? mouthVertices[j].z - mouthZ : 0;
            wallGridPoints.push(new THREE.Vector3(
                mouthVertices[j].x,
                mouthVertices[j].y,
                mouthZ + t * zOffset + arcedOffset
            ));
        }
    }
    const wallGeom = createMeshFromVertices(config, wallGridPoints.flatMap(p => [p.x, p.y, p.z]), wallAxialPoints + 1);
    
    // --- Partie 2 : surface plane (face avant) ---
    // Du bord vers le centre, mêmes anneaux que throatCap
    let avgRadius = 0;
    for (const v of mouthVertices) avgRadius += Math.hypot(v.x, v.y);
    avgRadius /= N;
    const faceAxialPoints = Math.max(2, Math.round(avgRadius / angularSpacing));
    
    const faceGridPoints = [];
    // Bord d'abord → centre : ordre inversé pour que les normales pointent en -Z
    // (cohérent avec les normales du horn/wall qui pointent vers l'intérieur du volume)
    for (let i = faceAxialPoints; i >= 1; i--) {
        const scale = i / faceAxialPoints;
        for (let j = 0; j < N; j++) {
            const arcedOffset = preserveArcedMouthZ ? (mouthVertices[j].z - mouthZ) * scale : 0;
            faceGridPoints.push(new THREE.Vector3(
                mouthVertices[j].x * scale,
                mouthVertices[j].y * scale,
                faceZ + arcedOffset
            ));
        }
    }
    // Centre en dernier
    for (let j = 0; j < N; j++) {
        faceGridPoints.push(new THREE.Vector3(0, 0, faceZ));
    }
    const faceGeom = createMeshFromVertices(config, faceGridPoints.flatMap(p => [p.x, p.y, p.z]), faceAxialPoints + 1);
    
    // Retourner mur et face séparément pour tags BEM distincts
    const merged = mergeGeometries([wallGeom, faceGeom]);
    return { wall: wallGeom, face: faceGeom, merged: merged || wallGeom };
}

function createThroatCapGeometry(config, throatVertices) {
    const N = config.numLines;
    const userAxialPoints = config.sourceAxialPoints || 5;
    
    if (!throatVertices || throatVertices.length === 0) return new THREE.BufferGeometry();

    // Extraire les points du contour de la gorge
    const throatContour = [];
    for (let j = 0; j < N; j++) {
        const idx = j * 3;
        throatContour.push(new THREE.Vector3(throatVertices[idx], throatVertices[idx + 1], 0));
    }
    
    // Calculer le périmètre et le rayon moyen de la gorge
    let throatPerimeter = 0;
    for (let j = 0; j < N; j++) {
        const next = (j + 1) % N;
        throatPerimeter += throatContour[j].distanceTo(throatContour[next]);
    }
    const angularSpacing = throatPerimeter / N;
    
    // Le rayon moyen détermine la distance centre→bord
    let avgRadius = 0;
    for (const v of throatContour) avgRadius += Math.hypot(v.x, v.y);
    avgRadius /= N;
    
    // Nombre optimal d'anneaux pour aspect ratio ≈ 1
    const optimalAxial = Math.max(2, Math.round(avgRadius / angularSpacing));
    const sourceAxialPoints = Math.min(Math.max(userAxialPoints, optimalAxial), 40);
    
    const gridPoints = [];
    
    // Distribuer les anneaux à espacement radial uniforme (pas quadratique)
    // Du bord (scale=1) vers le centre (scale→0), mais linéaire pour aspect ratio constant
    // L'anneau central (i=0) est un point unique
    
    // Centre d'abord
    const centerPoints = Array(N).fill(null).map(() => new THREE.Vector3(0, 0, 0));
    gridPoints.push(...centerPoints);
    
    for (let i = 1; i <= sourceAxialPoints; i++) {
        const scale = i / sourceAxialPoints;
        for (let j = 0; j < N; j++) {
            gridPoints.push(new THREE.Vector3(
                throatContour[j].x * scale,
                throatContour[j].y * scale,
                0
            ));
        }
    }
    
    return createMeshFromVertices(config, gridPoints.flatMap(p => [p.x, p.y, p.z]), sourceAxialPoints + 1);
}


// ====================================================================================================
// FIT CAMERA TO SCENE — auto-adjusts frustum so the entire horn is always visible
// ====================================================================================================

function fitCameraToScene() {
    if (!state.mesh) return;

    const box = new THREE.Box3().setFromObject(state.mesh);
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim < 1e-6) return;

    const padding = 1.4; // 40% margin
    state.frustumSize = maxDim * padding;

    const container = state.container;
    const aspect = container.clientWidth / container.clientHeight;
    state.camera.left   = -state.frustumSize * aspect / 2;
    state.camera.right  =  state.frustumSize * aspect / 2;
    state.camera.top    =  state.frustumSize / 2;
    state.camera.bottom = -state.frustumSize / 2;

    const diagonal = size.length();
    state.camera.near = 0.1;
    state.camera.far  = diagonal * 10 + 10000;

    state.camera.updateProjectionMatrix();
    // Only update the orbit target to the model center, keep camera position/orientation
    state.controls.target.copy(center);
    state.controls.update();
}


// ====================================================================================================
// VIEW CUBE — clickable orientation widget in the corner of the 3D viewport
// ====================================================================================================

function initViewCube(container) {
    // Small inset renderer for the view cube
    const cubeSize = 120;
    const cubeCanvas = document.createElement('canvas');
    cubeCanvas.width = cubeSize;
    cubeCanvas.height = cubeSize;
    cubeCanvas.style.cssText = `position:absolute;top:8px;right:8px;width:${cubeSize}px;height:${cubeSize}px;cursor:pointer;z-index:10;pointer-events:auto;border-radius:8px;`;
    container.appendChild(cubeCanvas);

    state.viewCubeRenderer = new THREE.WebGLRenderer({ canvas: cubeCanvas, alpha: true, antialias: true });
    state.viewCubeRenderer.setSize(cubeSize, cubeSize);
    state.viewCubeRenderer.setClearColor(0x000000, 0);

    state.viewCubeScene = new THREE.Scene();
    state.viewCubeCamera = new THREE.OrthographicCamera(-2.2, 2.2, 2.2, -2.2, 0.1, 100);

    // Ambient + directional light
    state.viewCubeScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dl = new THREE.DirectionalLight(0xffffff, 0.4);
    dl.position.set(2, 3, 4);
    state.viewCubeScene.add(dl);

    // --- Build transparent cube with dynamic face labels ---
    // Face info: normal direction, label text
    const faceData = [
        { normal: new THREE.Vector3( 1, 0, 0), text: 'Right' },  // +X (materialIndex 0)
        { normal: new THREE.Vector3(-1, 0, 0), text: 'Left'  },  // -X (materialIndex 1)
        { normal: new THREE.Vector3( 0, 1, 0), text: 'Top'   },  // +Y (materialIndex 2)
        { normal: new THREE.Vector3( 0,-1, 0), text: 'Bottom'},  // -Y (materialIndex 3)
        { normal: new THREE.Vector3( 0, 0, 1), text: 'Front' },  // +Z (materialIndex 4)
        { normal: new THREE.Vector3( 0, 0,-1), text: 'Back'  },  // -Z (materialIndex 5)
    ];

    // Create canvas textures for each face (will be updated each frame)
    const faceCanvases = [];
    const faceTextures = [];
    const materials = faceData.map((_, idx) => {
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 128;
        faceCanvases.push(c);
        const tex = new THREE.CanvasTexture(c);
        faceTextures.push(tex);
        return new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
        });
    });

    state._viewCubeFaceData = faceData;
    state._viewCubeFaceCanvases = faceCanvases;
    state._viewCubeFaceTextures = faceTextures;

    const cubeGeom = new THREE.BoxGeometry(2, 2, 2);
    const cubeMesh = new THREE.Mesh(cubeGeom, materials);
    state.viewCubeScene.add(cubeMesh);
    state._viewCubeMesh = cubeMesh;

    // Wireframe edges (white/grey line art)
    const edgesGeom = new THREE.EdgesGeometry(cubeGeom);
    const edgesMesh = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0xaaaaaa, linewidth: 1 }));
    state.viewCubeScene.add(edgesMesh);

    // Axis lines
    const axisLen = 1.5;
    const axisLabels = [
        { dir: [axisLen, 0, 0], color: 0xff4444, label: 'X' },
        { dir: [0, axisLen, 0], color: 0x44ff44, label: 'Y' },
        { dir: [0, 0, axisLen], color: 0x4488ff, label: 'Z' },
    ];
    axisLabels.forEach(({ dir, color }) => {
        const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(...dir)];
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
        state.viewCubeScene.add(line);
    });

    // Click handling — detect which face was clicked via raycasting
    cubeCanvas.addEventListener('click', (e) => {
        const rect = cubeCanvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), state.viewCubeCamera);
        const hits = raycaster.intersectObject(cubeMesh);

        if (hits.length > 0) {
            const faceIndex = hits[0].face.materialIndex;
            const viewMap = {
                0: { pos: [1, 0, 0]  },  // Right  (+X)
                1: { pos: [-1, 0, 0] },  // Left   (-X)
                2: { pos: [0, 1, 0]  },  // Top    (+Y)
                3: { pos: [0, -1, 0] },  // Bottom (-Y)
                4: { pos: [0, 0, 1]  },  // Front  (+Z)
                5: { pos: [0, 0, -1] },  // Back   (-Z)
            };
            const view = viewMap[faceIndex];
            if (view) setViewDirection(view.pos);
        }
    });
}

/**
 * Update face textures: visible faces get semi-transparent fill + label,
 * back-facing faces become fully transparent (no text).
 */
function updateViewCubeFaces() {
    if (!state._viewCubeFaceData || !state.viewCubeCamera) return;

    const camDir = new THREE.Vector3();
    state.viewCubeCamera.getWorldDirection(camDir);

    for (let i = 0; i < state._viewCubeFaceData.length; i++) {
        const { normal, text } = state._viewCubeFaceData[i];
        const canvas = state._viewCubeFaceCanvases[i];
        const tex = state._viewCubeFaceTextures[i];
        const ctx = canvas.getContext('2d');

        // Dot product: positive = face points toward camera (visible)
        const dot = normal.dot(camDir.clone().negate());

        ctx.clearRect(0, 0, 128, 128);

        if (dot > 0.05) {
            // Visible face: semi-transparent grey fill + white border + text
            const alpha = Math.min(1, dot * 1.2);
            ctx.fillStyle = `rgba(60, 60, 65, ${0.55 * alpha})`;
            ctx.fillRect(0, 0, 128, 128);
            ctx.strokeStyle = `rgba(180, 180, 180, ${0.7 * alpha})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, 126, 126);
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 64, 64);
        } else {
            // Back face: fully transparent, no text
            // (canvas already cleared)
        }

        tex.needsUpdate = true;
        // Adjust material opacity based on visibility
        const mat = state._viewCubeMesh.material[i];
        mat.opacity = dot > 0.05 ? 1.0 : 0.0;
    }
}

function renderViewCube() {
    if (!state.viewCubeRenderer || !state.viewCubeCamera || !state.camera) return;

    // Mirror the main camera's orientation but place at fixed distance
    const dir = new THREE.Vector3();
    state.camera.getWorldDirection(dir);
    state.viewCubeCamera.position.copy(dir.negate().multiplyScalar(5));
    state.viewCubeCamera.lookAt(0, 0, 0);
    // Match the main camera's up vector
    state.viewCubeCamera.up.copy(state.camera.up);
    state.viewCubeCamera.updateProjectionMatrix();

    // Update face visibility (text only on visible faces)
    updateViewCubeFaces();

    state.viewCubeRenderer.render(state.viewCubeScene, state.viewCubeCamera);
}

function setViewDirection(dirArray) {
    const target = state.controls.target.clone();
    const dist = state.camera.position.distanceTo(target);

    // OrbitControls uses spherical coords with Y as polar axis.
    // Looking exactly along Y causes gimbal lock (phi=0 or PI).
    // Offset slightly so the spherical conversion stays stable.
    const dir = new THREE.Vector3(...dirArray);
    if (Math.abs(dir.y) > 0.9) {
        // Top or bottom: nudge slightly toward -Z so it's not exactly on the pole
        dir.z -= 0.001;
    }
    dir.normalize();

    const newPos = target.clone().add(dir.multiplyScalar(dist));

    // Always keep Y-up — OrbitControls expects this and caches it
    state.camera.up.set(0, 1, 0);
    state.camera.position.copy(newPos);
    state.camera.lookAt(target);
    state.camera.updateProjectionMatrix();

    // Recreate controls to reset internal spherical state cleanly
    state.controls.dispose();
    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.target.copy(target);
    state.controls.update();
}