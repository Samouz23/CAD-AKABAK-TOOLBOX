// =======================================================
// FICHIER :  src/ipc/foamCase.js
// RÔLE    :  Géométrie et génération de cas OpenFOAM à partir du maillage BEM
//
// Pur Node, sans Electron ni scope worker: validable par un harnais.
// Le maillage BEM est une triangulation de surface en millimètres; OpenFOAM
// travaille en mètres, d'où le facteur MM_TO_M appliqué à l'export STL.
// =======================================================

const MM_TO_M = 0.001;

/**
 * Parse un .msh Gmsh 2.2 ASCII et regroupe les triangles par tag physique.
 * Volontairement autonome: bemDomainCore.js vit dans le scope worker et n'est
 * pas requérable depuis le processus principal.
 * @param {string} mshContent
 * @returns {{tris: Array, physicalNames: Record<number,string>, nodeCount: number}}
 */
function parseMshTriangles(mshContent) {
    const lines = String(mshContent).split(/\r?\n/);
    const nodes = new Map();
    const physicalNames = {};
    const tris = [];
    let section = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('$End')) { section = null; continue; }
        if (line.startsWith('$')) { section = line; continue; }
        if (!line) continue;

        if (section === '$PhysicalNames') {
            const m = /^(\d+)\s+(\d+)\s+"(.*)"$/.exec(line);
            if (m) physicalNames[parseInt(m[2], 10)] = m[3];
            continue;
        }
        if (section === '$Nodes') {
            const p = line.split(/\s+/);
            if (p.length >= 4) {
                nodes.set(parseInt(p[0], 10), [parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])]);
            }
            continue;
        }
        if (section === '$Elements') {
            const p = line.split(/\s+/).map(Number);
            if (p.length < 4 || p[1] !== 2) continue;   // 2 = triangle 3 nœuds
            const numTags = p[2];
            // Gmsh écrit 0 quand l'élément n'appartient à aucun groupe.
            const physicalTag = numTags >= 1 && p[3] > 0 ? p[3] : null;
            const elementaryTag = numTags >= 2 && p[4] > 0 ? p[4] : null;
            const off = 3 + numTags;
            const v0 = nodes.get(p[off]), v1 = nodes.get(p[off + 1]), v2 = nodes.get(p[off + 2]);
            if (!v0 || !v1 || !v2) continue;
            tris.push({ v0, v1, v2, physicalTag, elementaryTag });
        }
    }
    return { tris, physicalNames, nodeCount: nodes.size };
}

/**
 * Sélectionne les triangles d'un identifiant de surface de l'UI BEM
 * (`p:<tag>` = groupe physique, `e:<tag>` = groupe élémentaire).
 * @param {Array} tris
 * @param {string} surfaceId
 */
function trisForSurfaceId(tris, surfaceId) {
    const m = /^([pe]):(\d+)$/.exec(String(surfaceId || ''));
    if (!m) return [];
    const tag = parseInt(m[2], 10);
    return m[1] === 'p'
        ? tris.filter(t => t.physicalTag === tag)
        : tris.filter(t => t.elementaryTag === tag);
}

function triNormal(t) {
    const e1 = [t.v1[0] - t.v0[0], t.v1[1] - t.v0[1], t.v1[2] - t.v0[2]];
    const e2 = [t.v2[0] - t.v0[0], t.v2[1] - t.v0[1], t.v2[2] - t.v0[2]];
    const n = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const len = Math.hypot(n[0], n[1], n[2]);
    return { n: len > 0 ? [n[0] / len, n[1] / len, n[2] / len] : [0, 0, 1], area: len / 2 };
}

/**
 * Statistiques géométriques d'un groupe de triangles (unités du maillage, mm).
 * `planarity` = écart-type des normales; proche de 0 => surface plane, ce qui
 * permet de traiter une interface comme une section d'entrée/sortie.
 */
function surfaceStats(tris) {
    if (!tris.length) return null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let area = 0;
    const nSum = [0, 0, 0];
    const cSum = [0, 0, 0];

    for (const t of tris) {
        const { n, area: a } = triNormal(t);
        area += a;
        for (let c = 0; c < 3; c++) {
            nSum[c] += n[c] * a;
            cSum[c] += ((t.v0[c] + t.v1[c] + t.v2[c]) / 3) * a;
            for (const v of [t.v0, t.v1, t.v2]) {
                if (v[c] < min[c]) min[c] = v[c];
                if (v[c] > max[c]) max[c] = v[c];
            }
        }
    }

    const nLen = Math.hypot(nSum[0], nSum[1], nSum[2]);
    // |somme des normales pondérées| / aire vaut 1 si toutes les normales sont
    // alignées, et chute dès que la surface se courbe ou se referme.
    const planarity = area > 0 ? nLen / area : 0;
    return {
        count: tris.length,
        area_mm2: area,
        bbox: { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] },
        centroid: area > 0 ? cSum.map(v => v / area) : [0, 0, 0],
        normal: nLen > 0 ? nSum.map(v => v / nLen) : [0, 0, 1],
        planarity,
    };
}

/**
 * Sérialise des triangles en un `solid` STL ASCII nommé.
 * OpenFOAM lit les STL multi-solides et fait de chaque solide une région,
 * ce qui permet d'attribuer une condition limite par surface BEM.
 * @param {Array} tris
 * @param {string} name - nom de région (sans espace)
 * @param {number} [scale] - facteur d'échelle (mm -> m par défaut)
 */
function stlSolid(tris, name, scale = MM_TO_M) {
    const out = [`solid ${name}`];
    for (const t of tris) {
        const { n } = triNormal(t);
        out.push(`  facet normal ${n[0].toExponential(6)} ${n[1].toExponential(6)} ${n[2].toExponential(6)}`);
        out.push('    outer loop');
        for (const v of [t.v0, t.v1, t.v2]) {
            out.push(`      vertex ${(v[0] * scale).toExponential(9)} ${(v[1] * scale).toExponential(9)} ${(v[2] * scale).toExponential(9)}`);
        }
        out.push('    endloop');
        out.push('  endfacet');
    }
    out.push(`endsolid ${name}`);
    return out.join('\n');
}

/**
 * Construit le STL multi-régions du domaine fluide de l'event.
 * @param {Array} tris - tous les triangles du maillage
 * @param {{wall: string[], inlet: string[], outlet: string[]}} groups
 *        identifiants de surface BEM par rôle CFD
 * @returns {{stl: string, regions: Record<string, object>}}
 */
function buildVentStl(tris, groups) {
    const parts = [];
    const regions = {};
    for (const [role, ids] of Object.entries(groups)) {
        const selected = [];
        for (const id of ids || []) selected.push(...trisForSurfaceId(tris, id));
        if (!selected.length) continue;
        regions[role] = surfaceStats(selected);
        parts.push(stlSolid(selected, role));
    }
    return { stl: parts.join('\n') + '\n', regions };
}

/**
 * Diamètre hydraulique d'une section: D_h = 4·A/P.
 * Le périmètre est estimé depuis la boîte englobante de la section, ce qui est
 * exact pour une fente rectangulaire et une bonne approximation sinon.
 * @param {object} stats - sortie de surfaceStats pour la section
 * @returns {number} diamètre hydraulique en mm
 */
function hydraulicDiameterMm(stats) {
    if (!stats || !(stats.area_mm2 > 0)) return 0;
    // On ignore l'épaisseur suivant la normale dominante pour ne garder que les
    // deux dimensions de la section.
    const size = stats.bbox.size.slice();
    const axis = stats.normal.map(Math.abs);
    const drop = axis.indexOf(Math.max(...axis));
    const dims = size.filter((_, i) => i !== drop).filter(d => d > 0);
    if (dims.length < 2) return 0;
    const perimeter = 2 * (dims[0] + dims[1]);
    return perimeter > 0 ? (4 * stats.area_mm2) / perimeter : 0;
}

/**
 * Duplique des triangles par symétrie plane et inverse leur orientation, afin
 * de reconstituer la géométrie complète depuis un demi-modèle BEM.
 * Simuler la géométrie entière plutôt que d'imposer un plan de symétrie évite
 * de brider artificiellement les modes de lâcher tourbillonnaire asymétriques.
 * @param {Array} tris
 * @param {number} axis - 0 = x, 1 = y, 2 = z
 * @param {number} [plane] - position du plan de symétrie (mm)
 */
function mirrorTris(tris, axis, plane = 0) {
    const mirror = (v) => {
        const out = v.slice();
        out[axis] = 2 * plane - v[axis];
        return out;
    };
    // v1 et v2 sont permutés: la réflexion inverse le sens de parcours, donc la normale.
    return tris.concat(tris.map(t => ({
        v0: mirror(t.v0),
        v1: mirror(t.v2),
        v2: mirror(t.v1),
        physicalTag: t.physicalTag,
        elementaryTag: t.elementaryTag,
    })));
}

const FOAM_HEADER = (cls, object, location) => `FoamFile
{
    version     2.0;
    format      ascii;
    class       ${cls};${location ? `\n    location    "${location}";` : ''}
    object      ${object};
}
`;

const vec = (v) => `(${v.map(x => Number(x).toPrecision(9)).join(' ')})`;

/** Champ 0/ avec un bloc boundaryField par patch. */
function fieldFile(cls, name, dimensions, internal, patches) {
    const body = Object.entries(patches)
        .map(([patch, spec]) => `    ${patch}\n    {\n${spec.split('\n').map(l => `        ${l}`).join('\n')}\n    }`)
        .join('\n\n');
    return `${FOAM_HEADER(cls, name, '0')}
dimensions      ${dimensions};

internalField   uniform ${internal};

boundaryField
{
${body}
}
`;
}

/**
 * Réglages de maillage et de pas de temps.
 *
 * 'draft' sert à valider une chaîne complète en quelques minutes: maille de
 * fond grossière, un seul niveau de raffinement, aucune couche limite (les lois
 * de paroi de k-omega SST prennent le relais) et un Courant élevé permis par
 * PIMPLE. Les tendances sont exploitables, pas les valeurs absolues près de la
 * paroi. 'normal' est le réglage de production.
 */
const QUALITY_PRESETS = {
    draft: {
        baseCell_mm: 8,
        featureLevel: 1,
        surfaceLevel: [0, 1],
        wallLevel: [1, 1],
        portLevel: [0, 0],
        nSurfaceLayers: 0,
        maxCo: 2,
        stepsPerPeriod: 200,
        // Au-dela d'un correcteur externe PIMPLE se comporte en PISO, qui exige
        // Courant < 1: sur maillage grossier la vitesse en bouche fait exploser
        // le Courant, d'ou de vrais correcteurs externes et un schema temporel
        // du premier ordre, inconditionnellement stable.
        nOuterCorrectors: 3,
        ddtScheme: 'Euler',
    },
    normal: {
        baseCell_mm: 3,
        featureLevel: 2,
        surfaceLevel: [1, 2],
        wallLevel: [2, 3],
        portLevel: [1, 1],
        nSurfaceLayers: 3,
        maxCo: 1.5,
        stepsPerPeriod: 400,
        nOuterCorrectors: 2,
        ddtScheme: 'backward',
    },
};

/**
 * Construit un cas OpenFOAM transitoire (pimpleFoam) pour le domaine fluide
 * d'un event, à partir du maillage BEM et des paramètres du solveur.
 *
 * Le couplage est à sens unique: le BEM fixe le débit acoustique traversant
 * l'event, la CFD résout Navier-Stokes dans le conduit. C'est physiquement
 * justifié tant que la longueur d'onde reste très grande devant l'event, ce
 * qui est le cas aux fréquences d'accord.
 *
 * @param {object} spec
 * @param {string} spec.mshContent          - contenu du .msh du projet
 * @param {{wall:string[],inlet:string[],outlet:string[]}} spec.groups
 * @param {number|null} spec.mirrorAxis     - axe de symétrie à déplier (0=x), ou null
 * @param {number} spec.frequency_Hz
 * @param {number} spec.inletVelocity_ms    - amplitude crête de la vitesse débitante à l'entrée
 * @param {number[][]} [spec.probePoints_mm] - points de la grille Field à échantillonner
 * @param {number} [spec.periods]           - nombre de périodes simulées
 * @param {number} [spec.framesPerPeriod]
 * @param {number} [spec.baseCell_mm]      - remplace la taille de maille du préréglage
 * @param {'draft'|'normal'} [spec.quality] - 'draft' pour une mise au point rapide
 * @param {number} [spec.cores]
 * @returns {{files: Record<string,string>, info: object}}
 */
function buildCase(spec) {
    const {
        mshContent,
        groups,
        mirrorAxis = null,
        frequency_Hz,
        inletVelocity_ms,
        probePoints_mm = [],
        periods = 4,
        framesPerPeriod = 36,
        baseCell_mm,
        wallLevel,
        quality = 'normal',
        cores = 8,
    } = spec;

    if (!(frequency_Hz > 0)) throw new Error('buildCase: fréquence invalide');
    if (!(inletVelocity_ms > 0)) throw new Error('buildCase: vitesse d\'entrée invalide');
    const basePreset = QUALITY_PRESETS[quality];
    if (!basePreset) throw new Error(`buildCase: préréglage inconnu "${quality}"`);
    // Le raffinement de paroi se surcharge seul : il ne touche que les faces du
    // conduit, sans changer la maille de fond ni le pas de temps.
    const preset = wallLevel > 0
        ? { ...basePreset, wallLevel: [wallLevel, wallLevel] }
        : basePreset;
    const baseCell = baseCell_mm ?? preset.baseCell_mm;

    const parsed = parseMshTriangles(mshContent);
    let tris = parsed.tris;
    if (mirrorAxis !== null) tris = mirrorTris(tris, mirrorAxis);

    const { stl, regions } = buildVentStl(tris, groups);
    if (!regions.wall || !regions.inlet || !regions.outlet) {
        throw new Error('buildCase: le domaine fluide exige les régions wall, inlet et outlet');
    }

    // Boîte englobante du domaine fluide, en mètres, élargie de deux mailles
    // pour que le bloc de fond contienne strictement le STL.
    const all = surfaceStats([
        ...trisForSurfaceIds(tris, groups.wall),
        ...trisForSurfaceIds(tris, groups.inlet),
        ...trisForSurfaceIds(tris, groups.outlet),
    ]);
    const cell = baseCell * MM_TO_M;
    const pad = 2 * cell;
    const bMin = all.bbox.min.map(v => v * MM_TO_M - pad);
    const bMax = all.bbox.max.map(v => v * MM_TO_M + pad);
    const counts = [0, 1, 2].map(i => Math.max(4, Math.round((bMax[i] - bMin[i]) / cell)));

    // Point témoin du fluide: milieu de l'axe reliant les deux bouches.
    const inC = regions.inlet.centroid, outC = regions.outlet.centroid;
    const inside = [0, 1, 2].map(i => ((inC[i] + outC[i]) / 2) * MM_TO_M);

    // Sens d'écoulement entrant: normale de l'entrée orientée vers la sortie.
    const axisVec = [0, 1, 2].map(i => outC[i] - inC[i]);
    const dot = axisVec.reduce((s, v, i) => s + v * regions.inlet.normal[i], 0);
    const flowDir = regions.inlet.normal.map(v => (dot >= 0 ? v : -v));

    const dh_m = hydraulicDiameterMm(regions.inlet) * MM_TO_M;
    const period = 1 / frequency_Hz;
    const endTime = periods * period;

    // Turbulence d'entrée: 5 % d'intensité, échelle 7 % du diamètre hydraulique.
    const turbI = 0.05;
    const k0 = 1.5 * Math.pow(inletVelocity_ms * turbI, 2);
    const lTurb = 0.07 * (dh_m > 0 ? dh_m : 0.03);
    const omega0 = Math.sqrt(k0) / (Math.pow(0.09, 0.25) * lTurb);

    const files = {};

    files['constant/triSurface/vent.stl'] = stl;

    files['system/blockMeshDict'] = `${FOAM_HEADER('dictionary', 'blockMeshDict', 'system')}
scale   1;

vertices
(
    ${vec([bMin[0], bMin[1], bMin[2]])}
    ${vec([bMax[0], bMin[1], bMin[2]])}
    ${vec([bMax[0], bMax[1], bMin[2]])}
    ${vec([bMin[0], bMax[1], bMin[2]])}
    ${vec([bMin[0], bMin[1], bMax[2]])}
    ${vec([bMax[0], bMin[1], bMax[2]])}
    ${vec([bMax[0], bMax[1], bMax[2]])}
    ${vec([bMin[0], bMax[1], bMax[2]])}
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (${counts.join(' ')}) simpleGrading (1 1 1)
);

edges ();

// Entierement supprime par snappyHexMesh: le STL enferme tout le fluide.
boundary
(
    outer
    {
        type patch;
        faces
        (
            (0 3 2 1) (4 5 6 7) (0 1 5 4)
            (2 3 7 6) (0 4 7 3) (1 2 6 5)
        );
    }
);

mergePatchPairs ();
`;

    files['system/surfaceFeatureExtractDict'] = `${FOAM_HEADER('dictionary', 'surfaceFeatureExtractDict', 'system')}
vent.stl
{
    extractionMethod    extractFromSurface;
    includedAngle       150;
    subsetFeatures
    {
        nonManifoldEdges no;
        openEdges        yes;
    }
    writeObj            yes;
}
`;

    files['system/snappyHexMeshDict'] = `${FOAM_HEADER('dictionary', 'snappyHexMeshDict', 'system')}
castellatedMesh true;
snap            true;
addLayers       ${preset.nSurfaceLayers > 0};

geometry
{
    vent.stl
    {
        type triSurfaceMesh;
        name vent;
        regions
        {
            wall   { name wall;   }
            inlet  { name inlet;  }
            outlet { name outlet; }
        }
    }
}

castellatedMeshControls
{
    maxLocalCells       2000000;
    maxGlobalCells      20000000;
    minRefinementCells  10;
    maxLoadUnbalance    0.10;
    nCellsBetweenLevels 3;

    features
    (
        { file "vent.eMesh"; level ${preset.featureLevel}; }
    );

    refinementSurfaces
    {
        vent
        {
            level (${preset.surfaceLevel.join(' ')});
            regions
            {
                // La levre du flare gouverne le decrochage: c'est la zone raffinee.
                wall   { level (${preset.wallLevel.join(' ')}); patchInfo { type wall;  } }
                inlet  { level (${preset.portLevel.join(' ')}); patchInfo { type patch; } }
                outlet { level (${preset.portLevel.join(' ')}); patchInfo { type patch; } }
            }
        }
    }

    resolveFeatureAngle 30;
    refinementRegions   {}
    locationInMesh      ${vec(inside)};
    allowFreeStandingZoneFaces true;
}

snapControls
{
    nSmoothPatch        3;
    tolerance           2.0;
    nSolveIter          30;
    nRelaxIter          5;
    nFeatureSnapIter    10;
    implicitFeatureSnap false;
    explicitFeatureSnap true;
    multiRegionFeatureSnap false;
}

addLayersControls
{
    relativeSizes       true;
    layers
    {
        wall { nSurfaceLayers ${preset.nSurfaceLayers}; }
    }
    expansionRatio      1.2;
    finalLayerThickness 0.5;
    minThickness        0.1;
    nGrow               0;
    featureAngle        130;
    nRelaxIter          5;
    nSmoothSurfaceNormals 1;
    nSmoothNormals      3;
    nSmoothThickness    10;
    maxFaceThicknessRatio 0.5;
    maxThicknessToMedialRatio 0.3;
    minMedialAxisAngle  90;
    nBufferCellsNoExtrude 0;
    nLayerIter          50;
}

meshQualityControls
{
    #includeEtc "caseDicts/meshQualityDict"

    // Propres a snappyHexMesh, absents du dictionnaire qualite generique.
    nSmoothScale    4;
    errorReduction  0.75;

    // Criteres assouplis tolerables pendant l'ajout de couches limites.
    relaxed
    {
        maxNonOrtho 75;
    }
}

writeFlags ( scalarLevels layerSets layerFields );
mergeTolerance 1e-6;
`;

    const probeBlock = probePoints_mm.length
        ? `
    fieldProbes
    {
        type            probes;
        libs            (sampling);
        // Sans ça une sonde reçoit la valeur CONSTANTE de sa cellule : tous les
        // points de nappe d'une même cellule sortent identiques et la carte
        // s'affiche en aplats de la taille des cellules, même très finement
        // maillée. cellPoint interpole aux sommets puis dans la cellule.
        interpolationScheme cellPoint;
        writeControl    adjustableRunTime;
        writeInterval   ${(period / framesPerPeriod).toPrecision(6)};
        fields          (U p vorticity);
        probeLocations
        (
${probePoints_mm.map(p => `            ${vec(p.map(v => v * MM_TO_M))}`).join('\n')}
        );
    }
`
        : '';

    files['system/controlDict'] = `${FOAM_HEADER('dictionary', 'controlDict', 'system')}
application     pimpleFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         ${endTime.toPrecision(6)};

deltaT          ${(period / 4000).toPrecision(6)};
writeControl    adjustableRunTime;
writeInterval   ${period.toPrecision(6)};
purgeWrite      ${periods + 1};

writeFormat     binary;
writePrecision  8;
writeCompression off;
timeFormat      general;
timePrecision   8;
runTimeModifiable true;

adjustTimeStep  yes;
maxCo           ${preset.maxCo};
maxDeltaT       ${(period / preset.stepsPerPeriod).toPrecision(6)};

functions
{
    // Doit preceder les sondes: celles-ci echantillonnent un champ deja calcule.
    vorticity
    {
        type            vorticity;
        libs            (fieldFunctionObjects);
        writeControl    writeTime;
    }

    Q
    {
        type            Q;
        libs            (fieldFunctionObjects);
        writeControl    writeTime;
    }
${probeBlock}}
`;

    files['system/fvSchemes'] = `${FOAM_HEADER('dictionary', 'fvSchemes', 'system')}
ddtSchemes
{
    default         ${preset.ddtScheme};
}

gradSchemes
{
    default         Gauss linear;
}

divSchemes
{
    default         none;
    div(phi,U)      Gauss limitedLinearV 1;
    div(phi,k)      Gauss limitedLinear 1;
    div(phi,omega)  Gauss limitedLinear 1;
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}

laplacianSchemes
{
    default         Gauss linear corrected;
}

interpolationSchemes
{
    default         linear;
}

snGradSchemes
{
    default         corrected;
}

// k-omega SST est un modele bas-Reynolds: il lui faut la distance a la paroi,
// recalculee a chaque pas car le maillage ne bouge pas mais l'API l'exige.
wallDist
{
    method          meshWave;
}
`;

    files['system/fvSolution'] = `${FOAM_HEADER('dictionary', 'fvSolution', 'system')}
solvers
{
    p
    {
        solver          GAMG;
        tolerance       1e-06;
        relTol          0.01;
        smoother        GaussSeidel;
    }

    pFinal
    {
        $p;
        relTol          0;
    }

    "(U|k|omega)"
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-08;
        relTol          0.01;
    }

    "(U|k|omega)Final"
    {
        $U;
        relTol          0;
    }
}

PIMPLE
{
    nOuterCorrectors          ${preset.nOuterCorrectors};
    nCorrectors               2;
    nNonOrthogonalCorrectors  1;
}

// Sous-relaxation des correcteurs externes uniquement: la derniere iteration
// de chaque pas de temps reste non relaxee, donc la solution transitoire n'est
// pas biaisee. Empeche k de devenir negatif et de faire diverger omega.
relaxationFactors
{
    fields
    {
        p               0.3;
        pFinal          1;
    }
    equations
    {
        "(U|k|omega)"       0.7;
        "(U|k|omega)Final"  1;
    }
}
`;

    files['system/decomposeParDict'] = `${FOAM_HEADER('dictionary', 'decomposeParDict', 'system')}
numberOfSubdomains ${cores};

method          scotch;
`;

    // Garde-fou numerique: une cellule degeneree pres de la levre suffit a
    // emballer la vitesse locale, ce qui effondre le pas de temps adaptatif et
    // fige le calcul. Le plafond est place tres au-dessus de tout ecoulement
    // physiquement atteignable dans un event, il n'altere donc pas la solution.
    files['constant/fvOptions'] = `${FOAM_HEADER('dictionary', 'fvOptions', 'constant')}
limitU
{
    type            limitVelocity;
    active          yes;
    selectionMode   all;
    max             ${(20 * inletVelocity_ms).toPrecision(4)};
}
`;

    files['constant/transportProperties'] = `${FOAM_HEADER('dictionary', 'transportProperties', 'constant')}
transportModel  Newtonian;

nu              1.5e-05;
`;

    files['constant/turbulenceProperties'] = `${FOAM_HEADER('dictionary', 'turbulenceProperties', 'constant')}
simulationType  RAS;

RAS
{
    RASModel        kOmegaSST;
    turbulence      on;
    printCoeffs     on;
}
`;

    files['0/U'] = fieldFile('volVectorField', 'U', '[0 1 -1 0 0 0 0]', '(0 0 0)', {
        wall: 'type            noSlip;',
        // Debit acoustique impose par le BEM: alternatif, donc l'entree devient
        // periodiquement une sortie, ce que uniformFixedValue gere sans reserve.
        inlet: `type            uniformFixedValue;
uniformValue
{
    type        sine;
    frequency   ${frequency_Hz.toPrecision(8)};
    amplitude   ${inletVelocity_ms.toPrecision(8)};
    scale       ${vec(flowDir)};
    level       (0 0 0);
}`,
        outlet: `type            pressureInletOutletVelocity;
value           uniform (0 0 0);`,
    });

    files['0/p'] = fieldFile('volScalarField', 'p', '[0 2 -2 0 0 0 0]', '0', {
        wall: 'type            zeroGradient;',
        inlet: 'type            zeroGradient;',
        // Pression TOTALE et non statique: a chaque inversion de cycle le fluide
        // rentre par la bouche, et une pression statique imposee ne s'oppose pas
        // a l'energie cinetique entrante, ce qui emballe le reflux. Ici
        // p = p0 - |U|^2/2 en entree, ce qui freine naturellement.
        outlet: `type            totalPressure;
p0              uniform 0;
value           uniform 0;`,
    });

    files['0/k'] = fieldFile('volScalarField', 'k', '[0 2 -2 0 0 0 0]', k0.toPrecision(6), {
        wall: `type            kqRWallFunction;
value           uniform ${k0.toPrecision(6)};`,
        inlet: `type            inletOutlet;
inletValue      uniform ${k0.toPrecision(6)};
value           uniform ${k0.toPrecision(6)};`,
        outlet: `type            inletOutlet;
inletValue      uniform ${k0.toPrecision(6)};
value           uniform ${k0.toPrecision(6)};`,
    });

    files['0/omega'] = fieldFile('volScalarField', 'omega', '[0 0 -1 0 0 0 0]', omega0.toPrecision(6), {
        wall: `type            omegaWallFunction;
value           uniform ${omega0.toPrecision(6)};`,
        inlet: `type            inletOutlet;
inletValue      uniform ${omega0.toPrecision(6)};
value           uniform ${omega0.toPrecision(6)};`,
        outlet: `type            inletOutlet;
inletValue      uniform ${omega0.toPrecision(6)};
value           uniform ${omega0.toPrecision(6)};`,
    });

    files['0/nut'] = fieldFile('volScalarField', 'nut', '[0 2 -1 0 0 0 0]', '0', {
        wall: `type            nutkWallFunction;
value           uniform 0;`,
        inlet: 'type            calculated;\nvalue           uniform 0;',
        outlet: 'type            calculated;\nvalue           uniform 0;',
    });

    return {
        files,
        info: {
            regions,
            bbox_m: { min: bMin, max: bMax },
            blockCounts: counts,
            baseCell_mm: baseCell,
            quality,
            locationInMesh_m: inside,
            flowDir,
            hydraulicDiameter_mm: dh_m / MM_TO_M,
            frequency_Hz,
            inletVelocity_ms,
            period_s: period,
            endTime_s: endTime,
            k0,
            omega0,
            probeCount: probePoints_mm.length,
            triangleCount: tris.length,
        },
    };
}

/** Concatène les triangles de plusieurs identifiants de surface. */
function trisForSurfaceIds(tris, ids) {
    const out = [];
    for (const id of ids || []) out.push(...trisForSurfaceId(tris, id));
    return out;
}

module.exports = {
    MM_TO_M,
    QUALITY_PRESETS,
    parseMshTriangles,
    trisForSurfaceId,
    trisForSurfaceIds,
    triNormal,
    surfaceStats,
    stlSolid,
    buildVentStl,
    hydraulicDiameterMm,
    mirrorTris,
    buildCase,
};
