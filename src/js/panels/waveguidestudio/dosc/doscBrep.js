// ====================================================================================================
// FICHIER :  src/js/panels/waveguidestudio/dosc/doscBrep.js
// RÔLE :     Génération d'un .geo B-Rep EXACT du DOSC — primitives OpenCASCADE,
//            booléens et congé natif, comme une modélisation Onshape.
//            Aucun échantillonnage, aucun loft, aucune B-spline approchée.
// ====================================================================================================
//
// Pourquoi ce module double `doscGenerator.js` :
//   `doscGenerator.js` échantillonne le niveau zéro d'un champ implicite
//   (rounded-min) en anneaux de points, puis l'export les relofte via OCC
//   ThruSections. C'est robuste et rapide — parfait pour le preview 3D — mais
//   la surface exportée reste une B-spline qui APPROXIME un cône, avec les
//   artefacts de paramétrisation que ça implique (coutures, plis, iso-courbes
//   visibles à chaque section).
//
//   Or la géométrie DOSC est intégralement descriptible par des primitives
//   canoniques : un cône, deux plans, et un congé. Ce module la construit donc
//   telle quelle, ce qui donne un STEP dont les faces sont des
//   `Geom_ConicalSurface` / `Geom_Plane` / surface de congé exactes, et un
//   maillage GMSH dont la finesse ne dépend plus que de `clmax`.
//
// ----------------------------------------------------------------------------------------------------
// REPÈRE
// ----------------------------------------------------------------------------------------------------
// Convention d'export de l'app : gorge en z = -D, bouche en z = 0, interface
// éventuelle jusqu'à z = +tipOffset. C'est le même repère que celui produit par
// `extractSlicesForSTEP` (`z - totalLength`), donc les deux chemins d'export
// sont interchangeables.
//
// Avec z le repère d'export et z_loc = z + D le repère du brevet :
//     R_h(z) = O/2 + (z + D)·tanα        cône du carter
//     X_h(z) = i/2 - z·tanα              nappes de biseau du carter
//     R_b(z) = (z + D)·tanα_b            cône du corps
//     X_b(z) = t/2 - z·tanα_x            nappes du corps, offset parallèle de t/2
//
// α_b = pente du cône du corps, α_x = pente de son biseau. α_b = α_x = α donne le
// guide isophasique du brevet ; α_x < α amincit le losange et courbe le front
// d'onde (§4 de doscGenerator.js).
//
// Brevet rev. 28-29 : l'apex du corps est au plan de gorge. Rev. 31 : l'arête 14
// est au plan de bouche. Le corps couvre donc EXACTEMENT [0, D], comme le carter.
//
// Deux dégénérescences du brevet doivent être levées, et le SENS de la levée
// compte acoustiquement :
//
//  · Arête de fuite (épaisseur nulle en z = D) → OFFSET PARALLÈLE des deux nappes
//    (x0 = t/2), PAS un plafonnement `max(t/2, ...)`. Le plafonnement créait deux
//    faces AXIALES de ~2 mm juste à la sortie de la fente : un méplat parallèle
//    à l'écoulement, donc diffractant. L'offset garde la pente α jusqu'au bout,
//    donc |n_z| = sinα reste exact et l'isophasicité est préservée ; le jeu de
//    biseau reste constant, à (i - t)/2 · cosα au lieu de (i/2)·cosα.
//
//  · Apex du cône du corps (rayon nul en z = 0) → tronqué à `noseRadius`. Un apex
//    ponctuel exact rend la paramétrisation du cône dégénérée : sur une révolution
//    complète, ni Frontal-Delaunay ni Delaunay ne maillent la face (vérifié —
//    gmsh bascule sur MeshAdapt et ne termine pas). La troncature est aussi la
//    seule version usinable. À 0,25 mm le nez recule de 0,66 mm sur 244 mm.
//
// ----------------------------------------------------------------------------------------------------
// SÉLECTION DES ARÊTES À CONGÉDIER
// ----------------------------------------------------------------------------------------------------
// Après le booléen, les tags OCC sont imprévisibles : il faut retrouver l'arête
// de pli (cône ∩ nappe de biseau) géométriquement. Le test est
//
//     bbox.dz > tol   ET   bbox.dx > tol
//
// et il isole exactement les bonnes arêtes :
//   · pli cône∩biseau  → portée sur un plan INCLINÉ, donc x ET z varient   ✓
//   · cercle de gorge, contour de bouche, face d'arête de fuite
//                       → à z constant, dz = 0                             ✗
//   · arêtes de plan de coupe (split) → le split est appliqué APRÈS le
//                       congé, elles n'existent pas encore                 ✗
// ====================================================================================================

/** Formatage sans notation exponentielle (le parseur .geo ne l'accepte pas partout). */
const n = (v) => Number(v).toFixed(9);

// Tolérance de planarité des bounding boxes OCC, en mm. Une face bornée par des
// arêtes de congé (B-splines) voit sa boîte gonflée : mesuré dz = 9e-5 sur la
// face de bouche, là où la plus petite face latérale fait 124 mm. 0,01 mm tombe
// très largement entre les deux.
const PLANAR_TOL = 1e-2;

/**
 * Bloc .geo qui retrouve les arêtes de pli d'un volume et y pose le congé.
 * `volExpr` est une expression .geo (tag littéral ou variable).
 */
function emitFillet(g, volExpr, prefix, rho) {
    if (!(rho > 0)) return;
    const p = prefix;
    g.push(`${p}s() = Abs(Boundary{ Volume{${volExpr}}; });`);
    g.push(`${p}c() = Unique(Abs(Boundary{ Surface{${p}s()}; }));`);
    g.push(`${p}n = 0;`);
    g.push(`For ${p}k In {0 : #${p}c()-1}`);
    g.push(`  ${p}bb() = BoundingBox Curve{${p}c(${p}k)};`);
    g.push(`  If ((${p}bb(5)-${p}bb(2) > 0.01) && (${p}bb(3)-${p}bb(0) > 0.01))`);
    g.push(`    ${p}f[${p}n] = ${p}c(${p}k); ${p}n = ${p}n + 1;`);
    g.push(`  EndIf`);
    g.push(`EndFor`);
    g.push(`If (${p}n > 0)`);
    g.push(`  Fillet{${volExpr}}{${p}f()}{${n(rho)}}`);
    g.push(`EndIf`);
}

/**
 * Supprime d'une liste de faces celles qui sont portées par un plan de coupe
 * (y ≡ 0 pour un split horizontal, x ≡ 0 pour un vertical).
 * `ob`/`cb` sont les délimiteurs d'indexation de la liste : `()` pour une liste
 * nommée, `[]` pour la sortie d'un `Extrude`.
 */
function emitDropCutPlanes(g, listName, ob, cb, prefix, split, fromIndex = 0) {
    if (!split || (!split.horizontal && !split.vertical)) return;
    const item = `${listName}${ob}${prefix}k${cb}`;
    const tests = [];
    if (split.horizontal) tests.push(`((Fabs(${prefix}q(1)) < ${PLANAR_TOL}) && (Fabs(${prefix}q(4)) < ${PLANAR_TOL}))`);
    if (split.vertical) tests.push(`((Fabs(${prefix}q(0)) < ${PLANAR_TOL}) && (Fabs(${prefix}q(3)) < ${PLANAR_TOL}))`);
    g.push(`For ${prefix}k In {${fromIndex} : #${listName}${ob}${cb}-1}`);
    g.push(`  ${prefix}q() = BoundingBox Surface{${item}};`);
    g.push(`  If (${tests.join(' || ')})`);
    g.push(`    Delete{ Surface{${item}}; }`);
    g.push(`  EndIf`);
    g.push(`EndFor`);
}

/** Même test bbox que `emitDropCutPlanes`, mais comme expression booléenne réutilisable dans un If. */
function cutPlaneCond(split, qVar) {
    const tests = [];
    if (split && split.horizontal) tests.push(`(Fabs(${qVar}(1)) < ${PLANAR_TOL} && Fabs(${qVar}(4)) < ${PLANAR_TOL})`);
    if (split && split.vertical) tests.push(`(Fabs(${qVar}(0)) < ${PLANAR_TOL} && Fabs(${qVar}(3)) < ${PLANAR_TOL})`);
    return tests.length ? tests.join(' || ') : '0';
}

/**
 * Génère le .geo B-Rep complet.
 *
 * @param {object}  o
 * @param {object}  o.params          sortie de `deriveDoscParams`
 * @param {number}  o.filletRadius    rayon de congé effectif (mm), 0 = arêtes vives
 * @param {number}  o.edgeThickness   épaisseur de l'arête de fuite du corps (mm)
 * @param {number}  o.noseRadius      troncature du nez du corps (mm)
 * @param {boolean} o.buildInterface  ajouter le prolongement de bouche
 * @param {number}  o.tipOffset       longueur de ce prolongement (mm)
 * @param {object}  [o.meshConfig]    { clmax, curvature } — présent = mode maillage
 * @param {object}  [o.split]         { horizontal, vertical }
 * @returns {string|null} le .geo, ou null si les cotes rendent la construction dégénérée
 */
export function generateGeoForDoscBRep({
    params,
    filletRadius = 0,
    edgeThickness = 1.5,
    noseRadius = 0.25,
    buildInterface = false,
    tipOffset = 0,
    meshConfig = null,
    split = { horizontal: false, vertical: false },
}) {
    if (!params || !params.ok) return null;

    const O = params.throatDiameter;
    const iW = params.mouthWidth;
    const L = params.mouthHeight;
    const D = params.depth;
    const tanA = params.tanAlpha;
    // Pentes du corps : cône (profil vertical) et biseau (losange, porte la
    // courbure du front d'onde — §4).
    const tanB = params.tanAlphaBody != null ? params.tanAlphaBody : tanA;
    const tanBx = params.tanAlphaBodyBevel != null ? params.tanAlphaBodyBevel : tanA;
    // §5 : pente du biseau à l'extrémité haute de la fente. Différente de `tanBx`
    // ⇒ le biseau n'est plus Y-invariant et l'extrusion simple ne suffit plus.
    const tanBxEdge = params.tanBevelEdge != null ? params.tanBevelEdge : tanBx;
    const graded = Math.abs(tanBxEdge - tanBx) > 1e-9;
    if (!(tanA > 0) || !(D > 0) || !(tanB > 0)) return null;

    const t = Math.max(0.25, edgeThickness);
    const rNose = Math.max(0.05, noseRadius);
    const rho = Math.max(0, filletRadius);
    // Vers la bouche le corps est une lame de `t` d'épaisseur, et son arête de
    // pli y meurt sur le sommet de l'arête de fuite : le congé doit s'y éteindre.
    // Limite mesurée (scripts/dosc_brep_harness.mjs) : ρ ≈ t/3.
    const rhoBody = Math.min(rho, 0.3 * t);

    // Cotes des esquisses (cf. en-tête).
    const XhT = iW / 2 + D * tanA;   // demi-largeur du biseau carter à la gorge
    const XhM = iW / 2;              // ... à la bouche
    const XbT = t / 2 + D * tanBx;   // demi-largeur du biseau corps à la gorge
    const RbM = D * tanB;            // rayon du cône du corps à la bouche
    const zNose = -D + rNose / tanB; // cote de la troncature de nez

    // Le corps doit rester plus mince que la fente, sinon il la bouche.
    if (!(t < iW) || !(zNose < 0)) return null;

    const H = Math.max(L, D);            // demi-extension en y des blocs d'esquisse
    const BIG = 4 * Math.max(L, D);      // demi-extension du bloc de coupe (split)
    const useIface = !!(buildInterface && tipOffset > 0);
    const hasSplit = !!(split && (split.horizontal || split.vertical));

    const g = [
        'SetFactory("OpenCASCADE");',
        'Geometry.Tolerance = 1e-6;',
        '',
        '// ==================== CARTER : cône ∩ biseau ====================',
        `Cone(1) = {0, 0, ${n(-D)}, 0, 0, ${n(D)}, ${n(O / 2)}, ${n(L / 2)}};`,
        '',
        '// Esquisse du biseau dans le plan XZ, extrudée en Y (sketch + extrude).',
        `Point(101) = {${n(-XhT)}, ${n(-H)}, ${n(-D)}, 1};`,
        `Point(102) = {${n(XhT)}, ${n(-H)}, ${n(-D)}, 1};`,
        `Point(103) = {${n(XhM)}, ${n(-H)}, 0, 1};`,
        `Point(104) = {${n(-XhM)}, ${n(-H)}, 0, 1};`,
        'Line(101) = {101, 102}; Line(102) = {102, 103};',
        'Line(103) = {103, 104}; Line(104) = {104, 101};',
        'Curve Loop(101) = {101, 102, 103, 104};',
        'Plane Surface(101) = {101};',
        `_eh[] = Extrude {0, ${n(2 * H)}, 0} { Surface{101}; };`,
        'BooleanIntersection(1000) = { Volume{1}; Delete; }{ Volume{_eh[1]}; Delete; };',
        '',
    ];

    g.push('// --- Congé sur l\'arête de pli du carter ---');
    emitFillet(g, '1000', '_h', rho);
    g.push('_hv() = Volume{:};');
    g.push('HV = _hv(0);');
    g.push('');

    // ---- Corps interne ----
    g.push('// ==================== CORPS INTERNE : cône ∩ biseau ====================');
    g.push(`Cone(900) = {0, 0, ${n(zNose)}, 0, 0, ${n(-zNose)}, ${n(rNose)}, ${n(RbM)}};`);
    g.push('');
    g.push('// Esquisse du corps : même biseau que le carter, offset à t/2 au lieu de i/2.');
    if (!graded) {
        g.push(`Point(201) = {${n(-XbT)}, ${n(-H)}, ${n(-D)}, 1};`);
        g.push(`Point(202) = {${n(XbT)}, ${n(-H)}, ${n(-D)}, 1};`);
        g.push(`Point(203) = {${n(t / 2)}, ${n(-H)}, 0, 1};`);
        g.push(`Point(204) = {${n(-t / 2)}, ${n(-H)}, 0, 1};`);
        g.push('Line(201) = {201, 202}; Line(202) = {202, 203};');
        g.push('Line(203) = {203, 204}; Line(204) = {204, 201};');
        g.push('Curve Loop(201) = {201, 202, 203, 204};');
        g.push('Plane Surface(201) = {201};');
        g.push(`_eb[] = Extrude {0, ${n(2 * H)}, 0} { Surface{201}; };`);
        g.push('BooleanIntersection(2000) = { Volume{900}; Delete; }{ Volume{_eb[1]}; Delete; };');
    } else {
        // Biseau gradé : la demi-largeur à la gorge suit tanBevel(y), quadratique
        // en y. On loft à travers des trapèzes plans — 4 points chacun, donc des
        // sections qu'OCC traite proprement, contrairement au loft échantillonné
        // du preview (96 points par anneau).
        const yMax = params.bodyMouthHalfHeight > 0 ? params.bodyMouthHalfHeight : RbM;
        // Le cône du corps plafonne à RbM = yMax : inutile de lofter jusqu'à H.
        // On déborde juste assez pour que l'intersection soit transversale, et on
        // PROLONGE la parabole au lieu de l'écrêter — un écrêtage casserait la
        // tangence, OCC en tirerait un solide invalide et l'intersection
        // renverrait le bloc de loft entier (mesuré : bbox y ±250 au lieu de ±107).
        const yEnd = 1.05 * Math.max(yMax, RbM);
        const K = 4;
        const ys = [];
        for (let k = -K; k <= K; k++) ys.push((yEnd * k) / K);
        const loops = [];
        const wires = [];
        ys.forEach((y, k) => {
            const u = Math.abs(y) / yMax;
            const Xk = t / 2 + D * (tanBx + (tanBxEdge - tanBx) * u * u);
            const b = 2100 + k * 10;
            g.push(`Point(${b + 1}) = {${n(-Xk)}, ${n(y)}, ${n(-D)}, 1};`);
            g.push(`Point(${b + 2}) = {${n(Xk)}, ${n(y)}, ${n(-D)}, 1};`);
            g.push(`Point(${b + 3}) = {${n(t / 2)}, ${n(y)}, 0, 1};`);
            g.push(`Point(${b + 4}) = {${n(-t / 2)}, ${n(y)}, 0, 1};`);
            g.push(`Line(${b + 1}) = {${b + 1}, ${b + 2}}; Line(${b + 2}) = {${b + 2}, ${b + 3}};`);
            g.push(`Line(${b + 3}) = {${b + 3}, ${b + 4}}; Line(${b + 4}) = {${b + 4}, ${b + 1}};`);
            g.push(`Curve Loop(${b + 1}) = {${b + 1}, ${b + 2}, ${b + 3}, ${b + 4}};`);
            loops.push(b + 1);
            wires.push(b + 1, b + 2, b + 3, b + 4);
        });
        g.push(`ThruSections(950) = {${loops.join(', ')}};`);
        g.push('BooleanIntersection(2000) = { Volume{900}; Delete; }{ Volume{950}; Delete; };');
        // ThruSections NE consomme PAS ses fils de section : restés libres, gmsh
        // les maille en 1D et le .msh exporté se retrouve avec ~7000 segments et
        // autant de nœuds orphelins par-dessus la coque (mesuré).
        g.push(`Recursive Delete { Curve{${wires.join(', ')}}; }`);
    }
    g.push('');
    g.push('// --- Congé sur l\'arête de pli du corps ---');
    emitFillet(g, '2000', '_b', rhoBody);
    // Après le congé le tag du corps est réattribué : c'est le seul volume ≠ HV.
    g.push('_av() = Volume{:};');
    g.push('BV = _av(0);');
    g.push('For _k In {0 : #_av()-1}');
    g.push('  If (_av(_k) != HV)');
    g.push('    BV = _av(_k);');
    g.push('  EndIf');
    g.push('EndFor');
    g.push('');

    // ---- Coupe de symétrie ----
    // Appliquée APRÈS les congés : avant, les arêtes du plan de coupe seraient
    // captées par le filtre de sélection des plis.
    if (hasSplit) {
        const x0 = split.vertical ? 0 : -BIG;
        const dx = split.vertical ? BIG : 2 * BIG;
        const y0 = split.horizontal ? 0 : -BIG;
        const dy = split.horizontal ? BIG : 2 * BIG;
        const z0 = -D - 10;
        const dz = D + 20 + (useIface ? tipOffset : 0);
        const box = `${n(x0)}, ${n(y0)}, ${n(z0)}, ${n(dx)}, ${n(dy)}, ${n(dz)}`;
        g.push('// ==================== Coupe de symétrie ====================');
        g.push(`Box(3500) = {${box}};`);
        g.push('BooleanIntersection(3600) = { Volume{HV}; Delete; }{ Volume{3500}; Delete; };');
        g.push('HV = 3600;');
        g.push(`Box(3501) = {${box}};`);
        g.push('BooleanIntersection(3601) = { Volume{BV}; Delete; }{ Volume{3501}; Delete; };');
        g.push('BV = 3601;');
        g.push('');
    }

    // ================== Passage en SURFACIQUE ==================
    // On ne garde que les parois : les volumes sont supprimés (non récursif, donc
    // les faces subsistent), les plans de coupe jetés, et les fermetures de gorge
    // et de bouche ne sont conservées que si l'interface est demandée — exactement
    // ce que montre le preview 3D.
    g.push('// ==================== Parois du carter ====================');
    g.push('_hb() = Abs(Boundary{ Volume{HV}; });');
    g.push('Delete{ Volume{HV}; }');
    g.push('_ht = -1; _htz = 1e30;');
    g.push('_hm = -1; _hmz = -1e30;');
    g.push('For _k In {0 : #_hb()-1}');
    g.push('  _q() = BoundingBox Surface{_hb(_k)};');
    g.push(`  If (_q(5) - _q(2) < ${PLANAR_TOL})`);
    g.push('    _zm = 0.5*(_q(5) + _q(2));');
    g.push('    If (_zm < _htz)');
    g.push('      _htz = _zm; _ht = _hb(_k);');
    g.push('    EndIf');
    g.push('    If (_zm > _hmz)');
    g.push('      _hmz = _zm; _hm = _hb(_k);');
    g.push('    EndIf');
    g.push('  EndIf');
    g.push('EndFor');

    // Groupe physique du carter, POUR LE BEM : sans lui gmsh écrit tous les
    // triangles avec un tag physique 0, indistincts, et l'assignation des
    // surfaces dans le solveur ne peut alors reposer que sur les tags
    // "elementary" d'OCC — imprévisibles après un booléen (cf. commentaire de
    // `emitFillet`) — donc silencieusement faux dès que la géométrie change.
    g.push('_hn = 0;');
    g.push('For _k In {0 : #_hb()-1}');
    g.push('  _s = _hb(_k);');
    g.push('  If (_s != _ht && _s != _hm)');
    g.push('    _q() = BoundingBox Surface{_s};');
    g.push(`    If (!(${cutPlaneCond(split, '_q')}))`);
    g.push('      _hkeep[_hn] = _s; _hn = _hn + 1;');
    g.push('    EndIf');
    g.push('  EndIf');
    g.push('EndFor');
    g.push('If (_hn > 0)');
    g.push('  Physical Surface("horn_surface") = {_hkeep()};');
    g.push('EndIf');
    emitDropCutPlanes(g, '_hb', '(', ')', '_hc', split);
    g.push('');

    if (useIface) {
        g.push('// ---- Interface : paroi extrudée depuis la face de bouche + face plane ----');
        g.push('If (_ht > 0)');
        g.push('  Physical Surface("throat_cap") = {_ht};');
        g.push('EndIf');
        g.push(`_ie[] = Extrude {0, 0, ${n(tipOffset)}} { Surface{_hm}; };`);
        g.push('Delete{ Volume{_ie[1]}; }');
        g.push('Delete{ Surface{_hm}; }');
        g.push('Physical Surface("interface_face") = {_ie[0]};');
        g.push('_iwn = 0;');
        g.push('For _k In {2 : #_ie[]-1}');
        g.push('  _s = _ie[_k];');
        g.push('  _q() = BoundingBox Surface{_s};');
        g.push(`  If (!(${cutPlaneCond(split, '_q')}))`);
        g.push('    _iwkeep[_iwn] = _s; _iwn = _iwn + 1;');
        g.push('  EndIf');
        g.push('EndFor');
        g.push('If (_iwn > 0)');
        g.push('  Physical Surface("interface_wall") = {_iwkeep()};');
        g.push('EndIf');
        emitDropCutPlanes(g, '_ie', '[', ']', '_ic', split, 2);
        g.push('');
    } else if (buildInterface) {
        // tipOffset == 0 : la bouche EST l'ouverture rayonnante, pas de collerette.
        g.push('// ---- Interface au ras de la bouche (tipOffset = 0) ----');
        g.push('If (_ht > 0)');
        g.push('  Physical Surface("throat_cap") = {_ht};');
        g.push('EndIf');
        g.push('If (_hm > 0)');
        g.push('  Physical Surface("mouth_cap") = {_hm};');
        g.push('EndIf');
        g.push('');
    } else {
        g.push('// ---- Sans interface : gorge et bouche restent ouvertes ----');
        g.push('If (_ht > 0)');
        g.push('  Delete{ Surface{_ht}; }');
        g.push('EndIf');
        g.push('If (_hm > 0)');
        g.push('  Delete{ Surface{_hm}; }');
        g.push('EndIf');
        g.push('');
    }

    g.push('// ==================== Parois du corps interne ====================');
    // Le corps est une coque fermée (nez + arête de fuite) dans le preview :
    // on garde donc toutes ses faces, seuls les plans de coupe sautent.
    g.push('_bb() = Abs(Boundary{ Volume{BV}; });');
    g.push('Delete{ Volume{BV}; }');
    g.push('_bn = 0;');
    g.push('For _k In {0 : #_bb()-1}');
    g.push('  _s = _bb(_k);');
    g.push('  _q() = BoundingBox Surface{_s};');
    g.push(`  If (!(${cutPlaneCond(split, '_q')}))`);
    g.push('    _bkeep[_bn] = _s; _bn = _bn + 1;');
    g.push('  EndIf');
    g.push('EndFor');
    g.push('If (_bn > 0)');
    g.push('  Physical Surface("body_surface") = {_bkeep()};');
    g.push('EndIf');
    emitDropCutPlanes(g, '_bb', '(', ')', '_bc', split);
    g.push('');

    // ---- Maillage ----
    // Chaque groupe physique reçoit son propre clmax via un champ `Constant`
    // scopé par `SurfacesList` (PAS un simple `Mesh.CharacteristicLengthMax`
    // global, qui écraserait tout à la plus petite valeur des trois profils
    // source/horn/interface — c'était le bug : la horn se retrouvait maillée
    // à la finesse de la source). `Constant.SurfacesList` doit être réglé sur
    // le champ lui-même (un `Restrict` autour ne suffit pas : `Constant`
    // n'applique `VIn` qu'aux entités de SA PROPRE liste).
    if (meshConfig) {
        const srcClmax = meshConfig.source?.clmax ?? meshConfig.clmax ?? 10;
        const hornClmax = meshConfig.horn?.clmax ?? meshConfig.clmax ?? 10;
        const ifaceClmax = meshConfig.interface?.clmax ?? meshConfig.clmax ?? 10;
        g.push('// ==================== Maillage ====================');
        g.push('Field[1] = Constant;');
        g.push(`Field[1].VIn = ${n(hornClmax)};`);
        g.push('If (_hn > 0)');
        g.push('  Field[1].SurfacesList = {_hkeep()};');
        g.push('EndIf');
        g.push('Field[2] = Constant;');
        g.push(`Field[2].VIn = ${n(hornClmax)};`); // body_surface : même profil que la horn
        g.push('If (_bn > 0)');
        g.push('  Field[2].SurfacesList = {_bkeep()};');
        g.push('EndIf');
        g.push('Field[3] = Constant;');
        g.push(`Field[3].VIn = ${n(srcClmax)};`);
        if (buildInterface) {
            // _ht is Delete{}d when !buildInterface — referencing it then would
            // error "Unknown surface" even though the JS variable is still > 0.
            g.push('If (_ht > 0)');
            g.push('  Field[3].SurfacesList = {_ht};');
            g.push('EndIf');
        }
        const bgFieldIds = [1, 2, 3];
        if (useIface) {
            g.push('Field[4] = Constant;');
            g.push(`Field[4].VIn = ${n(ifaceClmax)};`);
            g.push('Field[4].SurfacesList = {_ie[0]};');
            g.push('Field[5] = Constant;');
            g.push(`Field[5].VIn = ${n(ifaceClmax)};`);
            g.push('If (_iwn > 0)');
            g.push('  Field[5].SurfacesList = {_iwkeep()};');
            g.push('EndIf');
            bgFieldIds.push(4, 5);
        } else if (buildInterface) {
            g.push('Field[4] = Constant;');
            g.push(`Field[4].VIn = ${n(ifaceClmax)};`);
            g.push('If (_hm > 0)');
            g.push('  Field[4].SurfacesList = {_hm};');
            g.push('EndIf');
            bgFieldIds.push(4);
        }
        const minId = bgFieldIds.length + 1;
        g.push(`Field[${minId}] = Min;`);
        g.push(`Field[${minId}].FieldsList = {${bgFieldIds.join(', ')}};`);
        g.push(`Background Field = ${minId};`);
        const clmax = Math.max(srcClmax, hornClmax, ifaceClmax);
        g.push(`Mesh.CharacteristicLengthMax = ${n(clmax)};`); // filet de sécurité
        if (meshConfig.curvature != null) {
            g.push(`Mesh.MeshSizeFromCurvature = ${n(meshConfig.curvature)};`);
            // Plancher indispensable : le raffinement par courbure vise
            // 2π·R/curvature, donc un congé millimétrique demanderait des
            // éléments de 0,1 mm sur une arête de 185 mm — le mailleur n'en
            // sort plus. Le congé du carter (≫ clmax/10) n'est pas affecté.
            const clminFloor = Math.min(srcClmax, hornClmax, ifaceClmax);
            g.push(`Mesh.MeshSizeMin = ${n(clminFloor / 10)};`);
        }
        g.push('Mesh.Algorithm = 6;');
        g.push('');
    }

    return g.join('\n');
}
