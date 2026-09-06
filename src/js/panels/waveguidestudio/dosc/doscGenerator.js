// ====================================================================================================
// FICHIER :  src/js/panels/waveguidestudio/dosc/doscGenerator.js
// RÔLE :     Générateur de géométrie DOSC (Wavefront Sculpture Technology),
//            dérivé du brevet US 5,163,167 (C. Heil, « Sound wave guide »).
//
//            Module PUR : aucune dépendance DOM / Three.js / Electron.
//            Importable tel quel depuis Node (cf. scripts/dosc_harness.mjs).
// ====================================================================================================
//
// ####################################################################################################
// # 1. DÉRIVATION DU MODÈLE GÉOMÉTRIQUE À PARTIR DU BREVET
// ####################################################################################################
//
// 1.1 Ce que décrit le brevet
// ---------------------------
// Le guide est fait de 3 pièces (col. 3 l. 50 → col. 4 l. 20) :
//   - deux coques symétriques (1, 2) qui forment le CARTER (« housing ») ; leur
//     surface intérieure définit le conduit ;
//   - un CORPS INTERNE (3, « internal body ») suspendu au centre.
// Le passage acoustique est l'espace entre les deux, et il « entoure le corps
// interne sur tous ses côtés, avec une largeur plus ou moins constante »
// (col. 4 l. 15-18). C'est donc un conduit ANNULAIRE.
//
// Forme du corps interne — revendications 28 à 34 et FIG. 9-12 :
//   (a) une première portion « generally conical surface extending from said
//       input orifice » : un CÔNE dont la pointe (12) pénètre l'orifice d'entrée ;
//   (b) une seconde portion « a pair of generally planar surfaces on opposite
//       sides of said longitudinal axis […] generally vertical […] converging
//       toward said output orifice to a generally vertically extending edge » :
//       DEUX PLANS verticaux convergents qui se rejoignent en l'arête (14)
//       située dans le plan de bouche ;
//   (c) rev. 33 : cône et plans s'intersectent, dans le plan horizontal de l'axe,
//       « at a point approximately one-half said predetermined distance », donc
//       à MI-PROFONDEUR ;
//   (d) rev. 34 : section verticale = triangle (apex à la gorge, base à la bouche),
//       section horizontale = losange aplati (apex à la gorge, 2e apex à la bouche).
//
// Forme du carter — revendication 32 : sa surface intérieure a « at least one
// first portion extending generally PARALLEL to said first portion of said
// internal body, and at least one second portion extending generally PARALLEL
// to said second portion ». Le carter est donc la surface OFFSET du corps :
// même cône, mêmes plans, décalés du jeu du passage.
//
// 1.2 La condition d'isophasicité, exactement
// -------------------------------------------
// Le brevet impose que « the shortest paths […] are all of practically equal
// length from the input orifice to the output orifice » (abstract, rev. 1).
//
// Clé : l'angle du cône ET celui du biseau sont LE MÊME (col. 4 l. 26-27,
// littéralement : « "a"=50°, angle of the cone input AND OF THE BEVEL OUTPUT »).
// Notons α le demi-angle au sommet (a = 2α ; l'exemple du brevet donne
// 2α ≈ 50°, et la condition de performance n°2 « a ≤ 30° » porte sur α).
//
// Sur le cône, les lignes de courant sont les génératrices : leur tangente fait
// l'angle α avec l'axe, donc dz/ds = cos α.
// Sur un plan de biseau incliné du MÊME angle α (mais rentrant au lieu de
// sortant), la ligne de plus grande pente axiale a aussi dz/ds = cos α.
//
// ⟹ Sur TOUTE la paroi, la ligne de courant vérifie dz/ds = cos α, donc
//
//        s(z) = z / cos α        (indépendant de l'azimut)
//
//    Tous les chemins entre le plan de gorge (z=0) et le plan de bouche (z=D)
//    mesurent exactement D / cos α : les plans z = cte sont les surfaces
//    isophases, et la bouche est un plan isophase. C'est EXACTEMENT l'énoncé
//    du brevet, et c'est exact (pas approché).
//
// Formulation intrinsèque, indépendante du paramétrage — utile pour valider
// n'importe quelle surface, y compris après congé :
//
//        ds/dz = 1 / |∇_S z|   et   |∇_S z| = sqrt(1 - n_z²)
//
//    où n est la normale unitaire à la surface. Donc
//
//        ISOPHASICITÉ  ⟺  |n_z| = sin α = constante sur toute la paroi.
//
//    (cône : n = (cosα·cosφ, cosα·sinφ, ∓sinα) → |n_z| = sinα ;
//     biseau : n = (cosα, 0, ±sinα) → |n_z| = sinα.)
//
// 1.3 Paramétrage à partir des 4 cotes utilisateur
// ------------------------------------------------
// Entrées : O = throatDiameter, i = mouthWidth, L = mouthHeight, D = depth.
// Repère : z axial (0 = plan de gorge, D = plan de bouche), x = largeur de la
// fente, y = hauteur de la fente. Toutes les cotes utilisateur portent sur le
// CARTER (c'est ce qu'on mesure sur la pièce).
//
// Le carter est un cône de demi-angle α partant du rayon O/2 en z=0 et
// atteignant L/2 en z=D dans la direction verticale (FIG. 3 / FIG. 8 : la
// section verticale est un pur cône qui va droit jusqu'à la bouche) :
//
//        L/2 = O/2 + D·tan α        ⟹    tan α = (L - O) / (2·D)                (1)
//
// Les deux nappes de biseau du carter sont les plans |x| = X_h(z) avec
//
//        X_h(z) = i/2 + (D - z)·tan α                                            (2)
//
// (inclinaison α, rentrante, et |x| = i/2 en z = D : la fente fait i de large).
//
// Le corps interne, parallèle au carter et distant du jeu :
//
//        R_b(z) = z·tan α           (apex à la gorge, rev. 28-29)                (3)
//        X_b(z) = (D - z)·tan α     (arête 14 en x = 0, z = D, rev. 31)          (4)
//
// Jeu (distance normale carter↔corps) :
//   - région conique : (R_h - R_b)·cos α = (O/2)·cos α          = constante
//   - région biseau  : (X_h - X_b)·cos α = (i/2)·cos α          = constante
// D'où la formule du brevet « width more or less constant » : le jeu est
// constant par région, et vaut (O/2)cosα côté cône, (i/2)cosα côté biseau.
// Comme dans le brevet (O=35, i=30) les deux sont très proches.
//
// 1.4 Sections droites, et localisation du pli
// --------------------------------------------
// À une cote z donnée, la section du carter est l'INTERSECTION d'un disque et
// d'une bande :
//        Ω_h(z) = { r ≤ R_h(z) } ∩ { |x| ≤ X_h(z) }
// idem pour le corps avec (R_b, X_b). Le contour est donc un arc de cercle
// raccordé à deux segments droits : le raccord est le PLI (arête vive).
//
// Le pli n'existe que là où X < R. Son point de départ (« fold onset ») est
//        X_h(z) = R_h(z)  ⟹  z*_h = D/2 + (i - O) / (4·tan α)                   (5)
//        X_b(z) = R_b(z)  ⟹  z*_b = D/2                                         (6)
// (6) redonne EXACTEMENT la revendication 33 : intersection cône/plans du corps
// à mi-profondeur. (5) donne, sur l'exemple du brevet (O=35, i=30, D=244,
// tanα=0,3791) : z*_h = 122 - 3,3 = 118,7 mm ≈ A = 122 mm. ✓
//
// La courbe de pli du corps atteint le plan de bouche à |cos φ| = 0, c'est-à-dire
// φ = ±90° : à la bouche, le corps se réduit à l'arête verticale 14, avec deux
// encoches en V en haut et en bas — c'est littéralement la FIG. 6. ✓
// La courbe de pli du carter atteint le plan de bouche à |cos φ| = i/L : le
// contour de bouche est donc un rectangle i × L dont les deux petits côtés sont
// remplacés par des arcs de rayon L/2 (flèche = L/2 - sqrt((L/2)²-(i/2)²), soit
// 1,0 mm sur l'exemple du brevet) — le rectangle de la FIG. 6. ✓
//
// ####################################################################################################
// # 2. LE CONGÉ (fillet) SANS CASSER L'ISOPHASICITÉ
// ####################################################################################################
//
// Le pli décrit ci-dessus est une arête vive : la normale y saute de
// (cosα·cosφ, cosα·sinφ, -sinα) à (cosα, 0, +sinα), soit un dièdre de 2α
// (≈ 42° sur l'exemple du brevet). Discontinuité G0 ⟹ diffraction + mauvais
// maillage. On la remplace par un congé de rayon contrôlé.
//
// 2.1 Pourquoi un congé « par section 2D » ne suffit pas
// -----------------------------------------------------
// Près de φ = 0 la courbe de pli court le long de y : le pli est alors un
// coude AXIAL (le rayon polaire passe de pente +tanα à -tanα en z*), et il
// n'apparaît PAS comme un coin dans la section z = cte. Arrondir chaque
// section 2D indépendamment ne l'adoucirait donc pas du tout. Le congé doit
// être appliqué dans le plan NORMAL à la courbe de pli → congé 3D.
//
// 2.2 Construction retenue : rounded-min sur les distances aux deux nappes
// -----------------------------------------------------------------------
// On décrit chaque paroi comme le bord du domaine où deux distances signées
// (positives « côté matière » pour le corps / « côté fluide » pour le carter)
// sont positives :
//        d_cone(P) = (R(z) - r) · cos α          r = hypot(x, y)
//        d_bev (P) = (X(z) - |x|) · cos α
// (les facteurs cos α convertissent l'écart radial/latéral en DISTANCE
// PERPENDICULAIRE réelle à la nappe, ce qui est indispensable pour que le
// rayon du congé soit métrique.)
//
// Surface vive :   min(d_cone, d_bev) = 0
// Surface congée : smin_ρ(d_cone, d_bev) = 0   avec le « rounded min » quadrique
//
//        smin_ρ(a,b) = (a<ρ && b<ρ) ? ρ - hypot(ρ-a, ρ-b) : min(a,b)
//
// Propriétés utiles ici :
//   - STRICTEMENT LOCAL : hors de la bande où a et b sont tous deux < ρ, la
//     surface est rigoureusement inchangée, donc |n_z| = sinα y reste exact et
//     l'isophasicité du brevet est intégralement préservée ailleurs.
//   - raccord G1, comme un congé circulaire de CAO.
//
// 2.2 bis  CALIBRATION : ρ n'est PAS le rayon du congé
// ----------------------------------------------------
// Le rounded-min quadrique ne donne le cercle exact de rayon ρ que pour deux
// nappes ORTHOGONALES ; pour un dièdre quelconque, le lieu est une ellipse.
// Il faut donc relier ρ au rayon de courbure réellement obtenu, sinon le
// « rayon contrôlé » n'a aucun sens métrique.
//
// (a) Forme close du méridien à φ = 0. Sur le rayon φ = 0 on a
//        a = (R(z) - r)·cosα ,  b = (X(z) - r)·cosα ,  p ≡ ρ/cosα
//     et la demi-somme (R+X)/2 ≡ K est CONSTANTE en z (les pentes +tanα et
//     -tanα se compensent), tandis que l'écart s ≡ R - X = 2·tanα·(z - z*).
//     Le niveau zéro (ρ-a)² + (ρ-b)² = ρ² se résout alors exactement :
//
//        r(z) = K - p + ½·√(2p² - s²)          pour |s| < p                      (8)
//
//     r'(z) = -s·tanα/√(2p²-s²) : il vaut 0 au sommet (s = 0) et exactement
//     ±tanα en |s| = p — le raccord est donc G1 avec le cône et le biseau, et
//     le congé occupe la bande axiale |z - z*| < p/(2 tanα).
//
// (b) Où la courbure est-elle maximale ? En dérivant (8) :
//        κ(s) = 4·tan²α·p² / [ 2p² - s²(1 - tan²α) ]^{3/2}
//     Pour α < 45°, κ CROÎT avec |s| : le maximum de courbure est atteint aux
//     LIGNES DE TANGENCE (|s| = p), pas au sommet. (C'est le pic de courbure
//     inhérent à tout raccord G1 ; il est fini, contrairement au pli vif.)
//     En |s| = p :
//
//        R_min = ρ / sin²(2α)                                                    (9)
//
//     (le rayon au sommet vaut ρ·cosα/(√2·sin²α), soit 2,31 × plus grand pour
//     α ≈ 21° — c'est bien R_min qui dimensionne maillage et diffraction.)
//
// (c) Comment ce rayon varie-t-il le long de l'arête ? L'angle dièdre du pli
//     dépend de l'azimut : entre la normale du cône (cosα·cosφ, cosα·sinφ,
//     -sinα) et celle du biseau (cosα, 0, sinα), l'angle INTÉRIEUR γ vérifie
//
//        cos γ(φ) = sin²α - cos²α·|cos φ|                                       (10)
//
//     Sur l'exemple du brevet γ passe de π - 2α = 138,5° en φ = 0 (le pli
//     axial franc de mi-profondeur) à 82,8° en φ = ±90° (le coin de la fente).
//     Or le rounded-min quadrique est le CERCLE EXACT de rayon ρ quand γ = 90°,
//     et (9) montre qu'il donne R_min = ρ/sin²(2α) = 2,28·ρ en φ = 0.
//
//     Donc, avec un ρ CONSTANT le long de l'arête :
//        · là où le pli est ~orthogonal (coin de fente, γ ≈ 83-90°),
//          R_min ≈ ρ — le congé est un vrai congé circulaire de rayon ρ ;
//        · là où le pli est obtus (φ → 0), R_min ≈ 2,3·ρ — le raccord est
//          plus généreux, ce qui est exactement souhaitable puisque le pli y
//          est déjà moins agressif.
//     `filletRadius` = ρ est ainsi une BORNE INFÉRIEURE du rayon de courbure
//     sur tout le congé. C'est la grandeur utile : c'est elle qui dimensionne
//     la taille d'élément du maillage et la diffraction résiduelle.
//     `scripts/dosc_harness.mjs` le vérifie en mesurant la courbure du méridien
//     à plusieurs azimuts.
//
//     (Un ρ modulé par azimut pour égaliser R_min a été essayé : il impose un
//     ρ 6× plus grand près du coin de fente, ce qui multiplie d'autant le
//     déficit de longueur de chemin δ pour un gain nul. Abandonné.)
//
// 2.3 Effet du congé sur la longueur de chemin, quantifié
// ------------------------------------------------------
// Point capital : le congé NE DÉCALE PAS la bouche. Remplacer un coin qui dévie
// la tangente de 2ψ par un raccord tangent conserve exactement l'avancée
// axiale — pour un arc de rayon R :
//        Δz(arc) = ∫ R cos t dt (t: -ψ→ψ) = 2R sin ψ
//        Δz(vif) = 2·(R tan ψ)·cos ψ       = 2R sin ψ        → identiques
// Le congé se contente donc de RACCOURCIR la longueur de chemin d'un déficit
// local (de l'ordre de 2R(tan ψ - ψ) pour un arc circulaire). Comme ψ varie le
// long de l'arête — 2ψ = 2α près de φ = 0, et → 0 quand le pli s'éteint — ce
// déficit varie, et c'est CELA qui crée la dispersion résiduelle δ.
//
// Le déficit est homogène de degré 1 en ρ : δ ∝ filletRadius, exactement.
// Le critère du brevet (condition n°3, col. 5 l. 17-19) est δ ≤ λ₂/4, soit
// 5,4 mm à 16 kHz. Mesuré sur l'exemple du brevet, δ ≈ 0,31 mm/mm de congé :
// même au rayon maximal admissible on reste sous 35 % du budget. Le congé est
// donc acoustiquement quasi gratuit — et `computeIsophaseReport()` ci-dessous
// le MESURE au lieu de le supposer (intégration numérique des lignes de courant
// sur la surface congée, cf. §1.2 pour le critère intrinsèque |n_z| = sin α).
//
// ####################################################################################################
// # 3. DÉGÉNÉRESCENCES À TRAITER (sinon loft OCC / maillage gmsh cassés)
// ####################################################################################################
//  - Nez du corps : R_b(0) = 0 → anneau ponctuel. On démarre l'empilement à la
//    cote où R_b = `noseRadius` (0,25 mm) et on ferme par un disque plan.
//  - Arête de fuite : X_b(D) = 0 → anneau dégénéré (segment). On l'épaissit par
//    OFFSET PARALLÈLE des deux nappes (x0 = edgeThickness/2), et NON par
//    plafonnement : un `max()` créerait deux faces axiales à la sortie de la
//    fente, donc un méplat parallèle à l'écoulement, diffractant. L'offset garde
//    la pente jusqu'au bout, donc |n_z| reste constant.
//
// ####################################################################################################
// # 4. COURBURE DU FRONT D'ONDE (hors brevet)
// ####################################################################################################
//
// Le brevet ne décrit qu'un guide ISOPHASIQUE : front plat en sortie, c'est ce
// qui permet d'empiler les unités sans interférence (condition WST). Un système
// à courbure constante (type A15) veut au contraire un front CONVEXE.
//
// Mécanisme. L'isophasicité vient de ce que les DEUX parois ont la même pente α,
// donc avancent au même rythme ds/dz = 1/cos α : les fronts d'onde sont les
// plans z = cte. Courber le front EXIGE donc de rompre cette égalité : une
// différence de marche centre↔bord EST la perte d'isophasicité, par définition.
// Ce qu'on préserve, c'est la cohérence du front (pas de dispersion parasite),
// pas sa planéité.
//
// DEUX RÉGLAGES INDÉPENDANTS, et ils se composent.
//
// Le déphasage total centre↔bord se factorise remarquablement. Avec α_b la pente
// du CÔNE du corps et α_x celle de son BISEAU :
//
//   Δ = [D/cosα_b − D/cosα]            retard du bord (cônes, φ = ±90°)
//     + [D/cosα − z*_b/cosα_b − (D−z*_b)/cosα_x]   avance du centre (biseaux, φ≈0)
//     = (D − z*_b)·(1/cos α_b − 1/cos α_x)                                   (11)
//        avec z*_b = (t/2 + D·tan α_x) / (tan α_b + tan α_x)                  (11b)
//
// Le terme du carter disparaît : Δ ne dépend QUE de l'écart entre les deux pentes
// du corps. Conséquences directes, toutes vérifiées par la mesure :
//   • α_x = α_b (corps à pente uniforme) ⇒ Δ = 0, quel que soit α_b.
//   • α_b = α ⇒ Δ piloté par le seul biseau.
//
// RÉGLAGE 1 — `prismHeightPct` : pilote α_b, donc la demi-hauteur du prisme à la
// bouche, D·tan α_b. 0 % = brevet (α_b = α) ; +100 % = le prisme ne laisse plus
// que le jeu minimal ; −100 % = il n'est plus haut que le diamètre de gorge.
//
// RÉGLAGE 2 — `prismWidthPct` : pilote α_x, donc la largeur du losange, INDÉ-
// PENDAMMENT de la hauteur. 0 % = brevet (α_x = α) ; +100 % = le losange touche
// le biseau du carter ; −100 % = il dégénère en lame d'épaisseur constante t.
//
// C'est le DÉCOUPLAGE des deux qui crée le déphasage : par (11), tant que
// α_x = α_b le guide reste isophasique quelle que soit la hauteur, et c'est
// l'écart entre les deux pentes — donc entre les deux réglages — qui courbe le
// front. Les régler ensemble (l'ancien `bodyGrowthPct`) ne donnait jamais rien.
//
// SENS UTILE. Rendre le prisme plus MINCE que le brevet (largeur < 0 %) avance
// le centre → front convexe « ) » → la directivité verticale s'ÉLARGIT au lieu
// de se resserrer en fréquence. L'épaissir (largeur > 0 %) fait l'inverse, mais
// la plage y est très courte (le losange doit rester dans le carter) :
//   • avance du centre : jusqu'à Δ(α_x = 0) ≈ 16,8 mm à hauteur 0 %
//   • retard du centre : ≈ 2,5 mm seulement
// Une cible de 8 à 12 mm n'est donc atteignable qu'en amincissant.
//
// L'avance de centre Δ n'est PLUS une consigne : à hauteur fixée elle est une
// bijection de la largeur (11 est monotone en α_x), donc les deux ne peuvent pas
// être des entrées séparées. On saisit la largeur, on LIT Δ et l'angle de front
// équivalent (12) dans le diagnostic.
//
//        σ(θ) = (L/θ)·(1 − cos(θ/2))                                          (12)
//
// LEVIER ÉCARTÉ, mesuré : le « diamant ventru » (bosse sur le méridien, extré-
// mités figées). Le gain de marche est QUADRATIQUE en amplitude : même en fermant
// 100 % du passage (bosse de 17,5 mm) il ne rend que 2,73 mm. Inexploitable.
//
// MESURE. Δ = `(body[φ90] − body[φ0]) + (housing[φ0] − housing[φ90])`. Moyenner
// sur les azimuts dilue de ~20 % ; ne lire que φ = 90° sous-estime d'un facteur ~2.
//
// ####################################################################################################
// # 5. POURQUOI LE RÉGLAGE 2 SEUL NE DONNE PAS UNE DIRECTIVITÉ CONSTANTE
// ####################################################################################################
//
// Diagnostic mesuré (pas supposé) : à la bouche, X_b(D) = t/2 (≈0,75 mm) est
// MICROSCOPIQUE devant R_b(D) = bodyMouthHalfHeight (≈90 mm). Le contour du
// corps à z=D est donc une paroi plate (le biseau, à x = ±X_b(D)) qui court sur
// PRESQUE TOUTE la hauteur — de y=0 jusqu'à y ≈ R_b(D) — et ne rejoint le cône
// (l'arc arrondi du bout) que sur les tout derniers dixièmes de mm. Or le
// biseau est une paroi Y-INVARIANTE (le réglage 2 lui donne une pente UNIQUE,
// indépendante de y) : le déphasage qu'il introduit est donc IDENTIQUE à
// n'importe quelle hauteur y du biseau, et ne varie qu'au tout dernier instant,
// dans la fraction de la fente occupée par le cône.
//
// Acoustiquement, ça revient à un piston plat (phase quasi constante sur
// ~99,9 % de l'ouverture) avec une correction concentrée sur une frange
// négligeable — pas à un front convexe. La théorie de la directivité constante
// (Keele, waveguides CD) exige au contraire que la phase varie EN CONTINU sur
// toute l'ouverture, à peu près comme un arc circulaire : c'est ce qui manque,
// et c'est pourquoi la directivité mesurée se resserre en fréquence au lieu de
// rester constante, quelle que soit l'amplitude de `centreAdvanceMm` essayée.
//
// RÉGLAGE 3 — `wavefrontGradePct` : rend la pente du biseau CROISSANTE avec la
// hauteur y, au lieu d'une pente unique. Le chemin s'allonge vers le bord, donc
// le bord retarde progressivement sur le centre : un vrai gradient de phase
// réparti, et non une correction concentrée. C'est exactement « courber le
// prisme » — le biseau cesse d'être un plan Y-invariant.
//
//        tanBevel(y) = tanBevelCentre + (tanBevelMax − tanBevelCentre)·(y/yMax)²   (13)
//
// Blend QUADRATIQUE (approximation petit-angle d'un arc circulaire), yMax =
// bodyMouthHalfHeight. La cible est `tanBevelMax` (limite géométrique : le corps
// doit rester dans le carter), et NON la pente du cône — viser le cône rendrait
// le réglage inopérant dès que centreAdvanceMm = 0, les deux pentes y étant déjà
// égales. Le réglage est donc AUTONOME et se compose avec le réglage 2.
// 0 % = pente unique sur toute la paroi, comportement d'avant §5.
//
// Portée : ce réglage vit dans `doscGenerator.js` (preview 3D + maillage BEM) et
// dans `doscBrep.js` (export STEP/MSH), où le corps cesse d'être un trapèze
// extrudé en Y pour devenir un ThruSections à travers des trapèzes dont la
// demi-largeur de gorge suit (13).
// ====================================================================================================

const TWO_PI = Math.PI * 2;
const C_AIR_MM_S = 343000; // célérité en mm/s, cohérente avec waveguide.js

// Fraction de la demi-cote locale que le congé peut consommer. Le rayon demandé
// est BORNÉ PAR LA TAILLE LOCALE DE LA SECTION, pas seulement par les cotes de
// bouche : près de l'arête de fuite le corps est une lame de 2·minX (0,4 mm)
// d'épaisseur, et un congé de 3 mm y serait géométriquement absurde — le niveau
// zéro du blend s'y écrase en une courbe à très forte courbure, ce qui d'une
// part n'a aucun sens (arrondir à R=3 le bout d'une lame de 0,4 mm), d'autre
// part fait exploser le raffinement de gmsh piloté par la courbure.
// Même raisonnement au nez du corps (rayon 0,25 mm).
const FILLET_LOCAL_FRACTION = 0.5;

/**
 * Minimum ADOUCI (polynomial, C1). Un `min` dur sur ρ(z) créerait un point
 * anguleux dans la loi de rayon, donc un pic de courbure sur la surface — c'est
 * précisément le défaut qu'on cherche à supprimer. Mesuré : le min dur faisait
 * chuter le rayon de courbure garanti à 0,48·ρ près de l'arête de fuite.
 */
function smoothMin(a, b, k) {
    if (!(k > 0)) return Math.min(a, b);
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
    return b * (1 - h) + a * h - k * h * (1 - h);
}

/** Rayon de congé effectif à la cote z : demandé, borné par la cote locale. */
function localRho(sheet, z, filletRadius) {
    if (!(filletRadius > 0)) return 0;
    const f = FILLET_LOCAL_FRACTION;
    const k = 0.35 * filletRadius;
    // Là où les plafonds sont largement au-dessus du rayon demandé (toute la
    // zone du pli, qui est ce qui compte), smoothMin rend exactement
    // filletRadius : l'adoucissement ne joue qu'au voisinage du plafond.
    return Math.max(0, smoothMin(smoothMin(filletRadius, f * sheet.R(z), k), f * sheet.X(z, 0), k));
}

/** Expose le rayon effectif : les tests en ont besoin pour situer la bande. */
export function effectiveFilletRadius(sheet, z, filletRadius) {
    return localRho(sheet, z, filletRadius);
}

/**
 * dρ/dz. `localRho` étant désormais un empilement de smoothMin, la dérivée
 * analytique serait fastidieuse et fragile ; une différence centrée sur une
 * fonction C1 et peu coûteuse est plus sûre. Le pas est petit devant l'échelle
 * de variation (millimétrique) et grand devant l'epsilon machine.
 */
function dLocalRho(sheet, z, filletRadius) {
    if (!(filletRadius > 0)) return 0;
    const h = 1e-3;
    return (localRho(sheet, z + h, filletRadius) - localRho(sheet, z - h, filletRadius)) / (2 * h);
}

// ---------------------------------------------------------------------------------------------------
// Rounded-min quadrique : congé de rayon `rho` entre deux demi-espaces.
// ---------------------------------------------------------------------------------------------------
function roundedMin(a, b, rho) {
    if (!(rho > 0)) return Math.min(a, b);
    if (a < rho && b < rho) {
        const da = rho - a;
        const db = rho - b;
        return rho - Math.hypot(da, db);
    }
    return Math.min(a, b);
}

/**
 * Décrit une « nappe » DOSC : cône de rayon R(z) tronqué par la bande |x| ≤ X(z).
 * R et X sont affines en z, donc chaque portion garde une inclinaison CONSTANTE...
 * enfin, PAS TOUT à FAIT : le biseau peut maintenant avoir une pente qui varie
 * GRADUELLEMENT avec la hauteur y (cf. §5, `edgeTanBevel`/`yMax`) au lieu d'une
 * pente unique sur toute la paroi — c'est ce qui permet de répartir le
 * déphasage sur toute la fente plutôt que de le concentrer sur le dernier
 * dixième de millimètre près de la pointe (cf. §5).
 *
 * Les deux pentes de BASE sont DISSOCIÉES : le cône suit `tanCone`, le biseau
 * `tanBevel` (à y=0). Elles sont égales sur le carter et sur un corps
 * isophasique ; les rendre différentes sur le corps est ce qui courbe le front
 * d'onde (cf. §4).
 */
function makeSheet({ r0, x0, tanCone, tanBevel, edgeTanBevel, yMax, depth, minX = 0 }) {
    const tBc = tanBevel != null ? tanBevel : tanCone;
    // Pente à l'extrémité (y = ±yMax). Par défaut = pente au centre : aucune
    // variation avec y, comportement identique à avant l'introduction de §5.
    const tBe = edgeTanBevel != null ? edgeTanBevel : tBc;
    const yM = yMax > 0 ? yMax : 1;
    const cosAlpha = 1 / Math.hypot(1, tanCone);
    // Blend quadratique (approximation petit-angle d'un arc circulaire) : u²,
    // u = |y|/yMax ∈ [0,1]. u=0 au centre (pente = tBc), u=1 au bord (pente = tBe).
    const tanBevelAt = (y) => {
        const u = Math.min(1, Math.abs(y) / yM);
        return tBc + (tBe - tBc) * u * u;
    };
    return {
        // `tanAlpha` / `cosAlpha` / `sinAlpha` désignent la nappe CONIQUE.
        tanAlpha: tanCone, cosAlpha, sinAlpha: tanCone * cosAlpha,
        graded: Math.abs(tBe - tBc) > 1e-12,
        depth, r0, x0, minX,
        // Rayon de la portion conique : croît à la pente tanα du cône.
        R: (z) => r0 + z * tanCone,
        // Demi-largeur de la bande (biseau) : décroît à la pente locale tanBevelAt(y).
        X: (z, y = 0) => Math.max(minX, x0 + (depth - z) * tanBevelAt(y)),
        dXdz: (z, y = 0) => ((x0 + (depth - z) * tanBevelAt(y)) > minX ? -tanBevelAt(y) : 0),
        cosBevelAt: (y) => 1 / Math.hypot(1, tanBevelAt(y)),
    };
}

/**
 * Distance signée « intérieure » au bord de la nappe, en un point donné en
 * coordonnées cylindriques (r, phi, z). > 0 = du bon côté des deux nappes.
 *
 * `yRef` est la hauteur qui pilote la pente du biseau (§5). Elle est fournie par
 * l'appelant et NE dépend PAS de r : voir `gradeHeight` pour la raison.
 */
function sheetField(sheet, r, absCosPhi, z, filletRadius, yRef) {
    const dCone = (sheet.R(z) - r) * sheet.cosAlpha;
    const dBev = (sheet.X(z, yRef) - r * absCosPhi) * sheet.cosBevelAt(yRef);
    return roundedMin(dCone, dBev, localRho(sheet, z, filletRadius));
}

/** Bissection du contour à pente de biseau FIGÉE : champ monotone décroissant en r. */
function solveRadius(sheet, z, absCosPhi, filletRadius, yRef) {
    let lo = 0;
    let hi = sheet.R(z);
    if (!(hi > 0)) return 0;
    // Le champ est ≥ 0 en r = 0 et ≤ 0 en r = R(z) (car d_cone y est nul).
    if (sheetField(sheet, lo, absCosPhi, z, filletRadius, yRef) <= 0) return 0;
    for (let k = 0; k < 60; k++) {
        const mid = 0.5 * (lo + hi);
        if (sheetField(sheet, mid, absCosPhi, z, filletRadius, yRef) > 0) lo = mid;
        else hi = mid;
        if (hi - lo < 1e-10) break;
    }
    return 0.5 * (lo + hi);
}

/**
 * Hauteur servant de coordonnée de gradation (§5), prise sur le contour NON
 * gradé : c'est donc une fonction de (z, phi) SEULS.
 *
 * Indispensable. Si on lisait la hauteur du point courant (y = r·sinφ), X
 * dépendrait de r, et comme la pente croît avec y, augmenter r ÉLARGIRAIT la
 * bande : près de φ = 90° le champ redevient croissant en r, la bissection perd
 * sa précondition et le contour se replie sur lui-même. Mesuré avant ce
 * verrouillage : 42 tranches sur 75 non convexes, jusqu'à 82 coins inversés.
 */
function gradeHeight(sheet, z, absCosPhi, filletRadius) {
    if (!sheet.graded) return 0;
    const absSinPhi = Math.sqrt(Math.max(0, 1 - absCosPhi * absCosPhi));
    return solveRadius(sheet, z, absCosPhi, filletRadius, 0) * absSinPhi;
}

/**
 * Rayon polaire du contour de la nappe (congée) à la cote z et à l'azimut phi.
 */
export function sheetRadius(sheet, z, phi, filletRadius) {
    const absCosPhi = Math.abs(Math.cos(phi));
    return solveRadius(sheet, z, absCosPhi, filletRadius,
        gradeHeight(sheet, z, absCosPhi, filletRadius));
}

// ---------------------------------------------------------------------------------------------------
// Échantillonnage angulaire des anneaux — à ABSCISSE CURVILIGNE, pas à angle
// uniforme.
//
// Pourquoi : près de la bouche, la section du corps interne est une lame de
// ~0,4 mm d'épaisseur pour ~185 mm de haut. Sur un contour aussi allongé, un
// pas angulaire constant entasse la quasi-totalité des points au voisinage de
// y = 0 (y = X·tan φ) et laisse les grands côtés quasi vides : arêtes de 20 mm
// d'un côté, de 0,05 mm de l'autre. Inexploitable en maillage comme en loft.
//
// On répartit donc les points à pas d'arc constant. Le contour VIF fournit une
// abscisse curviligne en forme close (le congé, très local, ne la perturbe que
// marginalement — ce n'est qu'une distribution de points) :
//   pour X < R,  y_t = √(R² - X²),  φ_t = acos(X/R)
//   quart de périmètre  P₄ = y_t + R·(π/2 - φ_t)
//   s ≤ y_t          → point (X, s)            → φ = atan2(s, X)
//   s > y_t          → arc de rayon R          → φ = φ_t + (s - y_t)/R
//
// Les 4 azimuts cardinaux restent exactement présents (indices 0, m, 2m, 3m),
// ce qui garantit des plans de symétrie propres pour les splits H/V et une
// gorge circulaire échantillonnée régulièrement.
// ---------------------------------------------------------------------------------------------------

/** Angles du premier quadrant, bornes incluses : m+1 valeurs de 0 à π/2. */
function quadrantAngles(R, X, m) {
    const HALF_PI = Math.PI / 2;
    const out = new Array(m + 1);
    if (!(R > 0) || X >= R) {
        // Pas de pli : le contour est un cercle, arc ∝ angle.
        for (let j = 0; j <= m; j++) out[j] = HALF_PI * (j / m);
        return out;
    }
    const yT = Math.sqrt(Math.max(0, R * R - X * X));
    const phiT = Math.acos(Math.min(1, X / R));
    const P4 = yT + R * (HALF_PI - phiT);
    for (let j = 0; j <= m; j++) {
        const s = (P4 * j) / m;
        out[j] = s <= yT ? Math.atan2(s, X) : phiT + (s - yT) / R;
    }
    out[0] = 0;
    out[m] = HALF_PI;
    return out;
}

/**
 * Anneau complet (4m angles croissants) obtenu en repliant le quadrant par les
 * deux symétries du contour (x → -x et y → -y).
 */
function ringAngles(R, X, m) {
    const A = quadrantAngles(R, X, m);
    const PI = Math.PI;
    const angles = new Array(4 * m);
    let w = 0;
    for (let j = 0; j < m; j++) angles[w++] = A[j];                 // [0, π/2)
    for (let j = 0; j < m; j++) angles[w++] = PI - A[m - j];        // [π/2, π)
    for (let j = 0; j < m; j++) angles[w++] = PI + A[j];            // [π, 3π/2)
    for (let j = 0; j < m; j++) angles[w++] = TWO_PI - A[m - j];    // [3π/2, 2π)
    return angles;
}

/**
 * Stations axiales : grille uniforme + raffinement autour de la cote de pli.
 * Le congé n'agit que sur une bande d'épaisseur ρ/(2 sin α) autour de z*, il
 * faut donc y placer assez de tranches pour que le loft la restitue.
 */
function axialStations(zStart, zEnd, count, foldZ, foldBandHalfWidth) {
    const span = zEnd - zStart;
    if (!(span > 0) || count < 2) return [zStart, zEnd];
    const set = [];
    for (let i = 0; i < count; i++) set.push(zStart + (span * i) / (count - 1));

    if (foldZ != null && foldBandHalfWidth > 0) {
        const half = Math.min(foldBandHalfWidth, span * 0.45);
        const nRefine = 14;
        for (let i = 0; i <= nRefine; i++) {
            const z = foldZ - half + (2 * half * i) / nRefine;
            if (z > zStart && z < zEnd) set.push(z);
        }
    }
    set.sort((a, b) => a - b);
    // Dédoublonnage : deux tranches trop proches font un loft OCC dégénéré.
    const minGap = Math.max(1e-4, span * 1e-4);
    const out = [set[0]];
    for (let i = 1; i < set.length; i++) {
        if (set[i] - out[out.length - 1] > minGap) out.push(set[i]);
    }
    out[out.length - 1] = zEnd;
    return out;
}

// ---------------------------------------------------------------------------------------------------
// Normale à la surface congée — gradient ANALYTIQUE.
//
// Les différences finies sont inutilisables ici : le champ contient |x|, dont
// la dérivée saute en x = 0 (azimuts ±90°, c'est-à-dire le haut et le bas de la
// fente) — une différence centrée y enjambe le pli et renvoie n'importe quoi.
//
//   a = (R(z) - r)·cosα        ∇a = cosα·( -x/r , -y/r , +tanα )
//   b = (X(z,y) - |x|)·cosB(y)  ∇b = cosB·( -sgn(x), ∂X/∂y - X·∂cosB/∂y/cosB, ∂X/∂z )
//   F = smin_ρ(a, b)           ∇F = wa·∇a + wb·∇b
// avec, sur la branche congée, wa = (ρ-a)/h, wb = (ρ-b)/h, h = hypot(ρ-a, ρ-b).
// Sur la branche vive, wa/wb = 1/0 selon le minimum.
//
// ρ dépendant de z (plafond local, cf. FILLET_LOCAL_FRACTION), il faut AUSSI le
// terme ∂F/∂ρ · dρ/dz — sinon la normale est fausse de ~20 % dans les zones
// plafonnées (nez, arête de fuite) :
//   ∂/∂ρ [ ρ - hypot(ρ-a, ρ-b) ] = 1 - [(ρ-a) + (ρ-b)] / h
// Avec ce terme le gradient est exact (à la non-différentiabilité près de |x| en
// x = 0 et du min du plafond, traitées par le sous-gradient symétrique).
//
// Cette forme close suppose une pente de biseau UNIQUE. Dès que la nappe est
// gradée (§5), la pente passe par `gradeHeight(z,φ)` — défini par une bissection,
// donc sans expression close en (x,y,z). On bascule alors sur la forme
// paramétrique r = ρ(z,φ), lisse et dépourvue de la valeur absolue, dont les
// deux dérivées se prennent par différence centrée. Les deux branches coïncident
// à grade = 0 (vérifié par le test |n_z| = sinα du harness).
// ---------------------------------------------------------------------------------------------------
export function surfaceNormal(sheet, x, y, z, filletRadius) {
    const r = Math.hypot(x, y);

    // Nappe gradée (§5) : le champ n'est plus une fonction close de (x,y,z), la
    // pente du biseau passant par `gradeHeight(z,φ)`. On dérive alors la surface
    // sous sa forme r = ρ(z,φ), lisse et sans la valeur absolue :
    //   n ∝ −( ρ_φ sinφ + ρ cosφ , ρ sinφ − ρ_φ cosφ , −ρ ρ_z )
    // (signe : normale rentrante, même convention que la branche analytique).
    if (sheet.graded) {
        const phi = Math.atan2(y, x);
        const hZ = 1e-3, hP = 1e-4;
        const rz = (sheetRadius(sheet, z + hZ, phi, filletRadius)
            - sheetRadius(sheet, z - hZ, phi, filletRadius)) / (2 * hZ);
        const rp = (sheetRadius(sheet, z, phi + hP, filletRadius)
            - sheetRadius(sheet, z, phi - hP, filletRadius)) / (2 * hP);
        const c = Math.cos(phi), s = Math.sin(phi);
        const nx = -(rp * s + r * c);
        const ny = -(r * s - rp * c);
        const nz = r * rz;
        const n = Math.hypot(nx, ny, nz) || 1;
        return { x: nx / n, y: ny / n, z: nz / n };
    }

    const cC = sheet.cosAlpha;
    const cB = sheet.cosBevelAt(0);
    const rho = localRho(sheet, z, filletRadius);

    const a = (sheet.R(z) - r) * cC;
    const b = (sheet.X(z, 0) - Math.abs(x)) * cB;

    const ir = r > 1e-12 ? 1 / r : 0;
    const gax = -cC * x * ir, gay = -cC * y * ir, gaz = cC * sheet.tanAlpha;
    // sgn(x) = 0 en x = 0 : c'est le sous-gradient symétrique, et de toute façon
    // wb y est nul dès que la nappe conique est la plus proche.
    const sgn = Math.abs(x) < 1e-12 ? 0 : (x > 0 ? 1 : -1);
    const gbx = -cB * sgn, gby = 0, gbz = cB * sheet.dXdz(z, 0);

    let wa, wb, wRho = 0;
    if (rho > 0 && a < rho && b < rho) {
        const da = rho - a, db = rho - b;
        const h = Math.hypot(da, db) || 1;
        wa = da / h; wb = db / h;
        wRho = 1 - (da + db) / h;
    } else {
        wa = a <= b ? 1 : 0;
        wb = 1 - wa;
    }

    let nx = wa * gax + wb * gbx;
    let ny = wa * gay + wb * gby;
    let nz = wa * gaz + wb * gbz + wRho * dLocalRho(sheet, z, filletRadius);
    const n = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / n, y: ny / n, z: nz / n };
}

/**
 * Longueur de la ligne de courant (plus grande pente axiale) d'un azimut donné,
 * intégrée sur la surface congée de zStart à zEnd.
 *
 * C'est LA mesure directe de l'isophasicité du brevet : on suit exactement le
 * « shortest path allowed in the passage » et on somme sa longueur.
 * Marche prédicteur/correcteur : un pas le long de la tangente de plus grande
 * pente, puis reprojection sur la surface (retour au rayon exact du contour).
 */
export function flowLineLength(sheet, phi0, filletRadius, zStart, zEnd, steps = 2000) {
    const rho = filletRadius;
    let z = zStart;
    let r = sheetRadius(sheet, z, phi0, rho);
    let x = r * Math.cos(phi0);
    let y = r * Math.sin(phi0);
    let length = 0;
    const dz = (zEnd - zStart) / steps;

    for (let k = 0; k < steps; k++) {
        const n = surfaceNormal(sheet, x, y, z, rho);
        // Direction de plus grande pente axiale : projection de ẑ sur le plan tangent.
        let tx = -n.z * n.x;
        let ty = -n.z * n.y;
        let tz = 1 - n.z * n.z;
        const tn = Math.hypot(tx, ty, tz);
        if (!(tn > 1e-9)) break;
        tx /= tn; ty /= tn; tz /= tn;
        if (!(tz > 1e-9)) break;
        // Pas choisi pour avancer exactement de dz en axial : ds = dz / t_z.
        const ds = dz / tz;
        length += ds;
        x += tx * ds;
        y += ty * ds;
        z += tz * ds;
        // Reprojection : on ramène le point sur le contour exact à sa cote z.
        const phi = Math.atan2(y, x);
        const rExact = sheetRadius(sheet, z, phi, rho);
        x = rExact * Math.cos(phi);
        y = rExact * Math.sin(phi);
    }
    return length;
}

// ####################################################################################################
// # API PUBLIQUE
// ####################################################################################################

/**
 * Résout les paramètres dérivés (α, nappes, cotes de pli) à partir des 4 cotes
 * utilisateur, et signale les combinaisons invalides.
 *
 * @returns {{ok: boolean, error?: string, ...}}
 */
export function deriveDoscParams({ throatDiameter, mouthWidth, mouthHeight, depth, prismHeightPct, prismWidthPct, wavefrontGradePct, edgeThickness }) {
    const O = Number(throatDiameter);
    const i = Number(mouthWidth);
    const L = Number(mouthHeight);
    const D = Number(depth);

    if (!(O > 0)) return { ok: false, error: 'DOSC: throat diameter must be > 0.' };
    if (!(i > 0)) return { ok: false, error: 'DOSC: mouth width must be > 0.' };
    if (!(L > 0)) return { ok: false, error: 'DOSC: mouth height must be > 0.' };
    if (!(D > 0)) return { ok: false, error: 'DOSC: depth must be > 0.' };
    if (L <= O) {
        return { ok: false, error: `DOSC: mouth height (${L}) must exceed throat diameter (${O}) — the conical sheet cannot expand otherwise.` };
    }
    if (i >= L) {
        return { ok: false, error: `DOSC: mouth width (${i}) must be smaller than mouth height (${L}) — the output must be a slot.` };
    }

    // (1) tan α = (L - O) / (2 D)
    const tanAlpha = (L - O) / (2 * D);
    const alpha = Math.atan(tanAlpha);
    const cosAlpha = Math.cos(alpha);
    const sinAlpha = Math.sin(alpha);

    // Le pli doit rester à l'intérieur du guide : |i - O| < 2 D tanα = L - O.
    if (Math.abs(i - O) >= (L - O)) {
        return {
            ok: false,
            error: `DOSC: |mouthWidth - throatDiameter| (${Math.abs(i - O).toFixed(1)}) must stay below mouthHeight - throatDiameter (${(L - O).toFixed(1)}), otherwise the cone/bevel fold falls outside the guide.`,
        };
    }

    // Nappes (cf. §1.3). r0/x0 = valeurs en z=0 / z=D.
    const housing = { r0: O / 2, x0: i / 2 };
    const body = { r0: 0, x0: 0 };

    const tEdge = Math.max(0.25, Number(edgeThickness) || 1.5);

    // --- RÉGLAGE 1 : HAUTEUR du prisme (§4) ---
    // Pilote la pente du CÔNE du corps, donc la demi-hauteur à la bouche D·tanα_b.
    // Bidirectionnel : 0 % = brevet, +100 % = le prisme ne laisse que le jeu
    // minimal, −100 % = il n'est plus haut que le diamètre de gorge.
    const minMouthGap = Math.max(2, 0.25 * (O / 2));
    const alphaBodyMax = Math.atan(Math.max(0, L / 2 - minMouthGap) / D);
    const alphaBodyMin = Math.atan((O / 2) / D);
    const prismHeightRequestedPct = Number(prismHeightPct) || 0;
    const prismHeightAppliedPct = Math.max(-100, Math.min(100, prismHeightRequestedPct));
    const alphaBody = prismHeightAppliedPct >= 0
        ? alpha + Math.max(0, alphaBodyMax - alpha) * (prismHeightAppliedPct / 100)
        : alpha - Math.max(0, alpha - alphaBodyMin) * (-prismHeightAppliedPct / 100);
    const tanAlphaBody = Math.tan(alphaBody);
    const bodyMouthHalfHeight = D * tanAlphaBody;

    // --- RÉGLAGE 2 : LARGEUR du prisme (§4) ---
    // Pilote la pente du BISEAU du corps, indépendamment de la hauteur. C'est ce
    // découplage qui crée le déphasage : à pente égale (α_x = α_b) le guide reste
    // isophasique, quelle que soit la hauteur.
    // +100 % = le losange touche le biseau du carter ; −100 % = il dégénère en
    // lame d'épaisseur constante t, ce qui donne l'avance de centre MAXIMALE,
    // donc le front le plus convexe — le sens utile pour élargir en HF.
    const tanBevelMax = tanAlpha + (i - tEdge) / (2 * D);
    const prismWidthRequestedPct = Number(prismWidthPct) || 0;
    const prismWidthAppliedPct = Math.max(-100, Math.min(100, prismWidthRequestedPct));
    const tanBevelBody = prismWidthAppliedPct >= 0
        ? tanAlpha + Math.max(0, tanBevelMax - tanAlpha) * (prismWidthAppliedPct / 100)
        : tanAlpha * (1 + prismWidthAppliedPct / 100);
    const alphaBodyBevel = Math.atan(tanBevelBody);

    // --- DÉPHASAGE RÉSULTANT (éq. 11) : LECTURE, plus une consigne ---
    // À hauteur fixée, Δ est une bijection de la largeur : les deux ne peuvent pas
    // être des entrées séparées. On saisit la largeur, on lit Δ.
    const deltaOfBevel = (tanX) => {
        const zFold = (tEdge / 2 + D * tanX) / (tanAlphaBody + tanX);
        return (D - zFold) * (1 / Math.cos(alphaBody) - 1 / Math.cos(Math.atan(tanX)));
    };
    const centreAdvanceAppliedMm = deltaOfBevel(tanBevelBody);
    const centreAdvanceMaxMm = deltaOfBevel(0);              // largeur −100 %
    const centreAdvanceMinMm = deltaOfBevel(tanBevelMax);    // largeur +100 %

    // Angle de front équivalent, pour l'affichage (12).
    const curvatureDeg = curvatureFromSagitta(Math.max(0, centreAdvanceAppliedMm), L);
    const curvatureMaxDeg = curvatureFromSagitta(Math.max(0, centreAdvanceMaxMm), L);

    // Cotes réelles du losange, pour que les deux % restent lisibles en mm.
    const prismMaxHalfWidth = tanAlphaBody * (tEdge / 2 + D * tanBevelBody)
        / (tanAlphaBody + tanBevelBody);

    // --- RÉGLAGE 3 : gradation du front (§5) ---
    // Le biseau du réglage 2 est une paroi Y-INVARIANTE : sa pente est la même à
    // toute hauteur, donc le déphasage qu'il introduit est le même partout et le
    // front reste plat (piston) au lieu de s'incurver. Ici on fait CROÎTRE la
    // pente du biseau avec la hauteur y : le chemin s'allonge vers le bord, donc
    // le bord RETARDE progressivement sur le centre — un vrai gradient de phase.
    // On vise `tanBevelMax` (limite géométrique : le corps doit rester dans le
    // carter), PAS la pente du cône : viser le cône rendrait le réglage inopérant
    // dès que centreAdvanceMm = 0, puisque les deux pentes y sont déjà égales.
    const wavefrontGradeRequestedPct = Number(wavefrontGradePct) || 0;
    const wavefrontGradeAppliedPct = Math.max(0, Math.min(100, wavefrontGradeRequestedPct));
    const tanBevelEdge = tanBevelBody + Math.max(0, tanBevelMax - tanBevelBody) * (wavefrontGradeAppliedPct / 100);

    const foldOnsetHousing = D / 2 + (i - O) / (4 * tanAlpha);
    const foldOnsetBody = (tEdge / 2 + D * tanBevelBody) / (tanAlphaBody + tanBevelBody);

    // Jeux (distances perpendiculaires paroi↔corps) — cf. §1.3.
    // Aucun n'est constant dès qu'un des deux réglages est actif : c'est le
    // MAXIMUM qui pilote la condition n°1 du brevet.
    const gapConicalThroat = (O / 2) * cosAlpha;
    const gapConicalMouth = (L / 2 - bodyMouthHalfHeight) * cosAlpha;
    const gapConical = Math.max(gapConicalThroat, gapConicalMouth);
    const gapBevelMouth = ((i - tEdge) / 2) * cosAlpha;
    const gapBevelFold = ((i / 2 + (D - foldOnsetBody) * tanAlpha)
        - (tEdge / 2 + (D - foldOnsetBody) * tanBevelBody)) * cosAlpha;
    const gapBevel = Math.max(gapBevelMouth, gapBevelFold);

    return {
        ok: true,
        throatDiameter: O, mouthWidth: i, mouthHeight: L, depth: D,
        tanAlpha, alpha, alphaDeg: (alpha * 180) / Math.PI, cosAlpha, sinAlpha,
        housing, body,
        foldOnsetHousing, foldOnsetBody,
        gapConical, gapConicalThroat, gapConicalMouth, gapBevel,
        // Hauteur du prisme : demandée, appliquée, et pentes limites.
        prismHeightPct: prismHeightAppliedPct,
        prismHeightRequestedPct,
        alphaBodyMax, alphaBodyMaxDeg: (alphaBodyMax * 180) / Math.PI,
        alphaBodyMin, alphaBodyMinDeg: (alphaBodyMin * 180) / Math.PI,
        // Largeur du prisme : demandée, appliquée.
        prismWidthPct: prismWidthAppliedPct,
        prismWidthRequestedPct,
        tanBevelMax,
        // Déphasage centre↔bord RÉSULTANT, et bornes atteignables à cette hauteur.
        centreAdvanceMm: centreAdvanceAppliedMm,
        centreAdvanceMaxMm, centreAdvanceMinMm,
        curvatureDeg, curvatureMaxDeg,
        alphaBody, alphaBodyDeg: (alphaBody * 180) / Math.PI, tanAlphaBody,
        alphaBodyBevel, alphaBodyBevelDeg: (alphaBodyBevel * 180) / Math.PI,
        tanAlphaBodyBevel: tanBevelBody,
        // Gradation du front : demandée, appliquée, et pente d'arrivée au bord.
        wavefrontGradePct: wavefrontGradeAppliedPct,
        wavefrontGradeRequestedPct,
        tanBevelEdge, alphaBodyEdgeDeg: (Math.atan(tanBevelEdge) * 180) / Math.PI,
        bodyMouthHalfHeight, prismMaxHalfWidth,
        pathDelta: centreAdvanceAppliedMm,
        // Longueur de chemin de référence du brevet : D / cos α.
        refPathLength: D / cosAlpha,
        // Flèche des petits côtés de la fente (cf. §1.4) : la bouche est un
        // rectangle i × L dont les extrémités bombent de cette valeur.
        mouthEndBulge: L / 2 - Math.sqrt(Math.max(0, (L / 2) ** 2 - (i / 2) ** 2)),
    };
}

/**
 * Flèche centre↔bord (mm) d'un front cylindrique d'ouverture `deg` sur une
 * fente de hauteur L — équation (12).
 */
export function sagittaOfCurvature(deg, L) {
    const th = (Math.max(0, deg) * Math.PI) / 180;
    if (!(th > 1e-9)) return 0;
    return (L / th) * (1 - Math.cos(th / 2));
}

/**
 * Inverse de (12) : ouverture (°) donnant la flèche `s`. σ est strictement
 * croissante en θ, donc une bissection sur [0, 180°] converge sans condition.
 */
export function curvatureFromSagitta(s, L) {
    if (!(s > 0) || !(L > 0)) return 0;
    let lo = 0, hi = 180;
    if (sagittaOfCurvature(hi, L) < s) return hi;
    for (let k = 0; k < 80; k++) {
        const mid = 0.5 * (lo + hi);
        if (sagittaOfCurvature(mid, L) < s) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
}

/**
 * Ouverture de front d'onde maximale atteignable avec ces cotes (°).
 */
export function maxDoscCurvatureDeg(p) {
    return p && p.ok ? p.curvatureMaxDeg : 0;
}

/**
 * Rayon de congé maximal admissible. `filletRadius` est un vrai rayon de
 * courbure (cf. §2.2 bis), donc les bornes sont des bornes géométriques
 * directes : le congé arrondit le coin de la fente, il ne peut pas dépasser la
 * demi-largeur de fente ni le jeu du conduit.
 */
export function maxDoscFilletRadius(p) {
    if (!p || !p.ok) return 0;
    return Math.max(0, 0.40 * Math.min(
        p.mouthWidth / 2,          // rayon du coin de fente < demi-largeur
        p.gapConical,              // ne pas manger le passage côté cône
        p.gapBevel,                // ni côté biseau
        p.depth * p.sinAlpha,      // bande axiale du raccord << profondeur
    ));
}

/**
 * Rapport d'isophasicité : longueurs des lignes de courant sur les DEUX parois,
 * dispersion mesurée, et confrontation au critère du brevet (δ ≤ λ₂/4).
 */
export function computeIsophaseReport(built, { azimuthSamples = 25, fMaxHz = 16000, steps = 2000 } = {}) {
    const { params, sheets, filletRadius, zBodyStart } = built;
    const lengths = { housing: [], body: [] };

    for (let k = 0; k < azimuthSamples; k++) {
        // On balaye un quadrant : la géométrie est symétrique en x et en y.
        const phi = (Math.PI / 2) * (k / (azimuthSamples - 1));
        lengths.housing.push(flowLineLength(sheets.housing, phi, filletRadius, 0, params.depth, steps));
        lengths.body.push(flowLineLength(sheets.body, phi, filletRadius, zBodyStart, params.depth, steps));
    }

    const stat = (arr) => {
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        return { min, max, spread: max - min, mean: arr.reduce((a, b) => a + b, 0) / arr.length };
    };
    const h = stat(lengths.housing);
    const b = stat(lengths.body);

    const lambdaMax = C_AIR_MM_S / fMaxHz;
    const budget = lambdaMax / 4;
    // δ du brevet = écart max entre deux chemins possibles quelconques.
    // On le mesure PAR PAROI : quand la courbure est active les deux parois ont
    // volontairement des longueurs différentes, et cet écart-là n'est pas une
    // erreur — c'est le réglage. δ reste donc la dispersion AZIMUTALE résiduelle.
    const delta = Math.max(h.spread, b.spread);

    // Courbure réellement obtenue = déphasage TOTAL centre↔bord, donc la SOMME
    // des deux contributions : le retard du bord (φ=90°, gouverné par les cônes)
    // et l'avance du centre (φ=0, gouvernée par les biseaux). Ne lire que φ=90°
    // sous-estime d'un facteur ~2 dès que le cône bouge aussi.
    // Les corrections de nez s'annulent entre les deux termes.
    const last = azimuthSamples - 1;
    const measuredPathDelta = (lengths.body[last] - lengths.body[0])
        + (lengths.housing[0] - lengths.housing[last]);
    const measuredCurvatureDeg = curvatureFromSagitta(measuredPathDelta, params.mouthHeight);

    return {
        refPathLength: params.refPathLength,
        housing: h,
        body: b,
        measuredPathDelta,
        measuredCurvatureDeg,
        delta,
        fMaxHz,
        lambdaMax,
        budget,
        withinPatentCriterion: delta <= budget,
        // Fréquence jusqu'à laquelle δ ≤ λ/4 est respecté.
        fMaxIsophase: delta > 1e-9 ? C_AIR_MM_S / (4 * delta) : Infinity,
    };
}

/**
 * Bande de fonctionnement déduite des 5 conditions de performance du brevet
 * (col. 5 l. 10-24). Plutôt que de tester la géométrie contre des fréquences
 * arbitraires, on INVERSE les conditions : chacune borne f₁ (par le bas) ou f₂
 * (par le haut), ce qui donne directement la plage exploitable du guide.
 *
 *   1 · largeur de conduit < λ₂        ⟹  f₂ < c / w
 *   2 · α ≤ 30°                        ⟹  contrainte pure de forme
 *   3 · δ ≤ λ₂/4                       ⟹  f₂ ≤ c / (4δ)
 *   4 · L > λ₁                         ⟹  f₁ > c / L
 *   5 · i ≤ λ₂                         ⟹  f₂ ≤ c / i
 */
export function derivePatentBand(params, report) {
    const c = C_AIR_MM_S;
    const wMax = Math.max(params.gapConical, params.gapBevel);

    const f2Width = c / wMax;                                        // cond. 1
    const f2Delta = report.delta > 1e-9 ? c / (4 * report.delta) : Infinity; // cond. 3
    const f2Slot = c / params.mouthWidth;                            // cond. 5
    const f1Height = c / params.mouthHeight;                         // cond. 4

    const f2 = Math.min(f2Width, f2Delta, f2Slot);
    const limiter = f2 === f2Slot ? 'slot width i (cond. 5)'
        : f2 === f2Width ? 'conduit width w (cond. 1)'
            : 'path-length spread δ (cond. 3)';

    return {
        f1: f1Height,
        f2,
        f2Limiter: limiter,
        alphaOk: params.alphaDeg <= 30,                              // cond. 2
        details: { f2Width, f2Delta, f2Slot, f1Height, wMax },
        usable: f2 > f1Height && params.alphaDeg <= 30,
    };
}

/**
 * Les 5 conditions, formatées ligne par ligne pour l'UI, évaluées à la bande
 * effectivement déduite de la géométrie.
 */
export function checkPatentConditions(params, report) {
    const band = derivePatentBand(params, report);
    const lambda2 = C_AIR_MM_S / band.f2;
    const out = [
        { ok: true, text: `1· w = ${band.details.wMax.toFixed(1)}mm < λ₂ ${lambda2.toFixed(1)}mm` },
        { ok: band.alphaOk, text: `2· α = ${params.alphaDeg.toFixed(1)}° ${band.alphaOk ? '≤' : '>'} 30°` },
        { ok: true, text: `3· δ = ${report.delta.toFixed(3)}mm ≤ λ₂/4 ${(lambda2 / 4).toFixed(2)}mm` },
        { ok: band.usable, text: `4· L = ${params.mouthHeight.toFixed(0)}mm ⟹ f₁ ≥ ${Math.round(band.f1)} Hz` },
        { ok: band.usable, text: `5· i = ${params.mouthWidth.toFixed(0)}mm ⟹ f₂ ≤ ${Math.round(band.f2)} Hz` },
    ];
    return { band, lines: out };
}

/**
 * Génère la géométrie DOSC complète.
 *
 * @param {object} opts
 * @param {number} opts.throatDiameter  Ø de la gorge circulaire d'entrée (mm)
 * @param {number} opts.mouthHeight     hauteur de la fente de sortie (mm)
 * @param {number} opts.mouthWidth      largeur de la fente de sortie (mm)
 * @param {number} opts.depth           profondeur totale du guide (mm)
 * @param {number} [opts.filletRadius]  rayon du congé sur les plis (mm). 0 = arêtes vives.
 * @param {number} [opts.numLines]      points angulaires par anneau
 * @param {number} [opts.axialPoints]   tranches axiales (base, avant raffinement)
 * @param {number} [opts.noseRadius]    rayon du méplat de nez du corps (mm)
 * @param {number} [opts.edgeThickness] épaisseur de l'arête de fuite du corps (mm)
 * @param {number} [opts.prismHeightPct]    réglage 1 : hauteur du prisme, −100..+100 % (§4)
 * @param {number} [opts.prismWidthPct]     réglage 2 : largeur du prisme, −100..+100 % (§4)
 * @param {number} [opts.wavefrontGradePct] réglage 3 : gradation du biseau en hauteur, 0-100 % (§5)
 *
 * @returns {{ok:boolean, error?:string, params:object, housing:object, body:object,
 *            filletRadius:number, sheets:object, zBodyStart:number}}
 *          housing/body : { numLines, numSlices, zStations, vertices:Float64Array }
 *          `vertices` est un flux plat [x,y,z, …] ordonné tranche par tranche,
 *          exactement comme celui du renderer de cornes classiques.
 */
export function generateDosc(opts) {
    const edgeThickness = Math.max(0.25, opts.edgeThickness ?? 1.5);
    // Le solveur de courbure a besoin de `t` : la cote de reprise du biseau du
    // corps en dépend (éq. 11b).
    const params = deriveDoscParams({ ...opts, edgeThickness });
    if (!params.ok) return { ok: false, error: params.error };

    // Le repliage par quadrant impose un multiple de 4 (cf. ringAngles) — c'est
    // aussi ce qu'exige computeAngularDivisor côté cornes.
    const quadrantCount = Math.max(2, Math.round((opts.numLines || 100) / 4));
    const numLines = 4 * quadrantCount;
    const axialPoints = Math.max(8, Math.round(opts.axialPoints || 100));
    // Ces deux méplats ne sont PAS cosmétiques : ce sont eux qui décident si la
    // géométrie est loftable. Trop fins (0,25 / 0,4 mm au premier essai), les
    // dernières sections deviennent des lamelles quasi dégénérées et gmsh
    // n'arrive plus à optimiser le maillage des surfaces lofées (« N elements
    // remain invalid in surface »), en bouclant indéfiniment. 1 à 2 mm est le
    // bon ordre de grandeur — et c'est aussi ce qui est usinable.
    const noseRadius = Math.max(0.05, opts.noseRadius ?? 0.25);

    const rhoMax = maxDoscFilletRadius(params);
    const filletRadius = Math.max(0, Math.min(opts.filletRadius ?? 0, rhoMax));

    const { tanAlpha, cosAlpha, sinAlpha, depth, tanAlphaBody, tanAlphaBodyBevel } = params;

    const sheets = {
        housing: makeSheet({
            r0: params.housing.r0, x0: params.housing.x0,
            tanCone: tanAlpha, depth, minX: 0,
        }),
        body: makeSheet({
            r0: params.body.r0,
            // Arête de fuite épaissie par OFFSET PARALLÈLE des nappes, pas par
            // plafonnement : `max(t/2, ...)` créait deux faces axiales de ~2 mm
            // à la sortie de la fente — un méplat parallèle à l'écoulement, donc
            // diffractant. L'offset garde la pente α jusqu'au bout.
            x0: edgeThickness / 2,
            // Le CÔNE du corps porte la courbure au BORD de la fente (§4) ; son
            // BISEAU la porte au CENTRE (§4 bis). Les deux valent α dans le brevet.
            // `edgeTanBevel`/`yMax` (§5) font migrer la pente du biseau vers celle
            // du cône EN CONTINU sur toute la hauteur, au lieu que le seul point
            // de contact soit le dernier fragment de mm près du sommet.
            tanCone: tanAlphaBody, tanBevel: tanAlphaBodyBevel,
            edgeTanBevel: params.tanBevelEdge,
            yMax: params.bodyMouthHalfHeight,
            depth, minX: 0,
        }),
    };

    // Le corps démarre là où son cône atteint le rayon de méplat de nez.
    const zBodyStart = noseRadius / tanAlphaBody;
    if (zBodyStart >= depth * 0.5) {
        return { ok: false, error: 'DOSC: depth too small for the internal body nose — increase depth or mouth height.' };
    }

    // Le congé occupe la bande axiale |z - z*| < ρ/(2·sinα) — cf. §2.2 bis (a),
    // où p/(2 tanα) = ρ/(2 sinα). On raffine 2,5× plus large par sécurité.
    const foldBand = filletRadius > 0 ? (filletRadius / (2 * sinAlpha)) * 2.5 : 0;

    const buildStack = (sheet, zStart, zEnd, foldZ) => {
        const zStations = axialStations(zStart, zEnd, axialPoints, foldZ, foldBand);
        const vertices = new Float64Array(zStations.length * numLines * 3);
        let w = 0;
        for (const z of zStations) {
            // Distribution recalculée à chaque cote : la section évolue d'un
            // cercle (gorge) à une fente très allongée (bouche).
            const angles = ringAngles(sheet.R(z), sheet.X(z), quadrantCount);
            for (let j = 0; j < numLines; j++) {
                const phi = angles[j];
                const r = sheetRadius(sheet, z, phi, filletRadius);
                vertices[w++] = r * Math.cos(phi);
                vertices[w++] = r * Math.sin(phi);
                vertices[w++] = z;
            }
        }
        return { numLines, numSlices: zStations.length, zStations, vertices };
    };

    const housing = buildStack(sheets.housing, 0, depth, params.foldOnsetHousing);
    const body = buildStack(sheets.body, zBodyStart, depth, params.foldOnsetBody);

    return {
        ok: true,
        params,
        filletRadius,
        maxFilletRadius: rhoMax,
        sheets,
        zBodyStart,
        noseRadius,
        edgeThickness,
        housing,
        body,
    };
}

/**
 * Extrait les anneaux (liste de tranches, chacune une liste de points) d'un
 * empilement, en appliquant la translation axiale de la convention de l'app :
 * gorge en z = -depth, bouche en z = 0, rayonnement vers +Z.
 */
export function stackToSlices(stack, depth) {
    const { numLines, numSlices, vertices } = stack;
    const slices = [];
    for (let s = 0; s < numSlices; s++) {
        const points3D = [];
        for (let j = 0; j < numLines; j++) {
            const idx = (s * numLines + j) * 3;
            points3D.push({
                x: vertices[idx],
                y: vertices[idx + 1],
                z: vertices[idx + 2] - depth,
            });
        }
        slices.push({ points3D, origZ: vertices[(s * numLines) * 3 + 2] });
    }
    return slices;
}
