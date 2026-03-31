// ====================================================================================================
// FICHIER :  src/js/panels/hornstudio/foldingEditor.js
// RÔLE :     Éditeur interactif de pliage 2D pour pavillon à hauteur constante.
//            Permet de déplacer, pivoter et replier les segments du pavillon sur le graphique 2D
//            tout en conservant la loi d'expansion.
// ====================================================================================================

// ====================================================================================================
// ÉTAT DU PLIAGE
// ====================================================================================================

export function createFoldingState() {
    return {
        enabled: false,
        jointAngles: [],       // angle de rotation (rad) à chaque jonction entre segments
        lockedJoints: new Set([0]), // jonction 0 (gorge) verrouillée par défaut
        jointPositions: [],    // positions calculées {x, y} de chaque jonction
        segmentDirections: [], // direction (rad) de chaque segment

        // Interaction
        dragInfo: null,        // { type: 'joint'|'segment', index, startMouse, startAngle }
        hoveredJoint: -1,
        hoveredSegment: -1,

        // Vue (pan/zoom)
        panX: 0,
        panY: 0,
        zoom: 1,
        isPanning: false,
        lastPanMouse: null,

        // Références
        _canvas: null,
        _boundHandlers: null,
    };
}

// ====================================================================================================
// CALCUL DES POSITIONS DE JONCTION
// ====================================================================================================

/**
 * Calcule les positions (x, y) de chaque jonction à partir des segments et des angles de pliage.
 * Joint 0 = début du premier segment (gorge).
 * Joint i = fin du segment i-1 = début du segment i.
 * Joint n = fin du dernier segment (bouche).
 *
 * @param {Array} segments - Tableau de segments [{w, h, l, s}, ...]
 * @param {Array} jointAngles - Angle de rotation (rad) à chaque jonction [0, angle1, angle2, ...]
 * @returns {{ positions: Array<{x,y}>, directions: Array<number> }}
 */
export function computeJointPositions(segments, jointAngles) {
    const n = segments.length;
    const positions = [{ x: 0, y: 0 }];
    const directions = [];
    let currentAngle = 0; // direction initiale = vers la droite

    for (let i = 0; i < n; i++) {
        // Appliquer l'angle de rotation à cette jonction
        if (jointAngles[i] !== undefined) {
            currentAngle += jointAngles[i];
        }
        directions.push(currentAngle);

        const len = segments[i].l;
        const lastPos = positions[positions.length - 1];
        positions.push({
            x: lastPos.x + len * Math.cos(currentAngle),
            y: lastPos.y + len * Math.sin(currentAngle)
        });
    }

    // positions.length = n+1, directions.length = n
    return { positions, directions };
}

// ====================================================================================================
// CALCUL DES PLANCHES DE RENVOI D'ANGLE OPTIMALES
// ====================================================================================================

/**
 * Pour un angle donné entre deux segments, calcule la planche de renvoi optimale.
 * La planche est placée sur la bissectrice de l'angle et sa longueur est calculée
 * pour que la section effective suive au mieux la loi d'expansion.
 *
 * @param {number} angle - Angle de rotation en radians entre les deux segments
 * @param {number} widthBefore - Largeur du segment avant l'angle
 * @param {number} widthAfter - Largeur du segment après l'angle
 * @returns {{ bisectorAngle: number, boardLength: number, boardPositions: Array }}
 */
function computeAngleDeflectionBoard(angle, widthBefore, widthAfter, jointPos, dirBefore, dirAfter) {
    if (Math.abs(angle) < 0.01) return null; // Pas de planche si l'angle est trop faible

    // Bissectrice = moyenne des deux directions
    const bisectorAngle = (dirBefore + dirAfter) / 2;

    // Largeur moyenne à cette jonction pour la planche de renvoi
    const avgWidth = (widthBefore + widthAfter) / 2;

    // La longueur de la planche dépend de l'angle : plus l'angle est grand, plus la planche est longue
    // On utilise la formule : longueur = avgWidth / (2 * cos(angle/2))
    // pour que la planche couvre toute la section
    const halfAngle = Math.abs(angle) / 2;
    const boardLength = avgWidth / (2 * Math.cos(halfAngle));

    // Déterminer de quel côté placer la planche (côté intérieur de l'angle)
    const sign = angle > 0 ? -1 : 1;

    // Points de la planche de renvoi (perpendiculaire à la bissectrice)
    const perpAngle = bisectorAngle + Math.PI / 2;
    const halfBoard = boardLength / 2;
    const boardPositions = [
        {
            x: jointPos.x + sign * halfBoard * Math.cos(perpAngle),
            y: jointPos.y + sign * halfBoard * Math.sin(perpAngle)
        },
        {
            x: jointPos.x - sign * halfBoard * Math.cos(perpAngle),
            y: jointPos.y - sign * halfBoard * Math.sin(perpAngle)
        }
    ];

    return { bisectorAngle, boardLength, boardPositions, perpAngle, sign };
}

// ====================================================================================================
// DESSIN SUR LE CANVAS
// ====================================================================================================

/**
 * Dessine le pavillon plié sur le canvas 2D.
 */
export function drawFoldedHorn(canvas, segments, foldingState, genDom, rootElement, genState) {
    if (!canvas || !segments || segments.length < 2) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;

    // Fond
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, cw, ch);

    // Initialiser les angles si nécessaire
    if (foldingState.jointAngles.length !== segments.length) {
        foldingState.jointAngles = new Array(segments.length).fill(0);
    }

    // Calcul des positions
    const { positions, directions } = computeJointPositions(segments, foldingState.jointAngles);
    foldingState.jointPositions = positions;
    foldingState.segmentDirections = directions;

    // Largeur du canal à chaque joint (suit la loi d'expansion)
    const n = segments.length;
    const halfWidths = [];
    for (let i = 0; i < n; i++) {
        halfWidths.push(segments[i].w / 2);
    }
    // Bouche : extrapoler la largeur à la fin du dernier segment
    if (n >= 2) {
        const growth = segments[n - 1].w - segments[n - 2].w;
        halfWidths.push((segments[n - 1].w + Math.max(0, growth)) / 2);
    } else {
        halfWidths.push(segments[n - 1].w / 2);
    }
    const plankT = 18; // épaisseur planche en mm

    // --- Déterminer l'échelle et le centrage automatique ---
    const allX = positions.map(p => p.x);
    const allY = positions.map(p => p.y);
    const maxHalfW = Math.max(...halfWidths);
    const wallMargin = maxHalfW + plankT + 30;
    const minX = Math.min(...allX) - wallMargin;
    const maxX = Math.max(...allX) + wallMargin;
    const minY = Math.min(...allY) - wallMargin;
    const maxY = Math.max(...allY) + wallMargin;

    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;
    const margin = 60;
    const availW = cw - 2 * margin;
    const availH = ch - 2 * margin;

    const autoScale = Math.min(availW / worldW, availH / worldH) * 0.85;
    const scale = autoScale * foldingState.zoom;

    const centerWorldX = (minX + maxX) / 2;
    const centerWorldY = (minY + maxY) / 2;

    // Transformation monde → écran
    const toScreen = (wx, wy) => ({
        sx: cw / 2 + (wx - centerWorldX) * scale + foldingState.panX,
        sy: ch / 2 - (wy - centerWorldY) * scale + foldingState.panY  // Y inversé
    });
    const toWorld = (sx, sy) => ({
        wx: (sx - cw / 2 - foldingState.panX) / scale + centerWorldX,
        wy: -(sy - ch / 2 - foldingState.panY) / scale + centerWorldY
    });

    // Stocker pour l'interaction
    foldingState._toScreen = toScreen;
    foldingState._toWorld = toWorld;
    foldingState._scale = scale;

    // =========================================================================
    // Calcul des coins de mur (miter join pour planches connectées)
    // =========================================================================
    const wallCorners = [];
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const hw = halfWidths[i];
        let miterPerp, miterFactor;

        if (i === 0) {
            miterPerp = directions[0] + Math.PI / 2;
            miterFactor = 1;
        } else if (i >= directions.length) {
            miterPerp = directions[directions.length - 1] + Math.PI / 2;
            miterFactor = 1;
        } else {
            const dirBefore = directions[i - 1];
            const dirAfter = directions[i];
            const halfTurn = (dirAfter - dirBefore) / 2;
            miterPerp = dirBefore + halfTurn + Math.PI / 2;
            const cosHalf = Math.cos(halfTurn);
            miterFactor = Math.abs(cosHalf) > 0.15 ? 1 / cosHalf : Math.sign(cosHalf || 1) / 0.15;
        }

        wallCorners.push({
            topInner:  { x: pos.x + hw * miterFactor * Math.cos(miterPerp), y: pos.y + hw * miterFactor * Math.sin(miterPerp) },
            topOuter:  { x: pos.x + (hw + plankT) * miterFactor * Math.cos(miterPerp), y: pos.y + (hw + plankT) * miterFactor * Math.sin(miterPerp) },
            botInner:  { x: pos.x - hw * miterFactor * Math.cos(miterPerp), y: pos.y - hw * miterFactor * Math.sin(miterPerp) },
            botOuter:  { x: pos.x - (hw + plankT) * miterFactor * Math.cos(miterPerp), y: pos.y - (hw + plankT) * miterFactor * Math.sin(miterPerp) },
        });
    }
    foldingState._wallCorners = wallCorners;

    // =========================================================================
    // Grille de fond légère
    // =========================================================================
    drawGrid(ctx, cw, ch, scale, centerWorldX, centerWorldY, foldingState);

    // =========================================================================
    // Baffle du haut-parleur
    // =========================================================================
    drawBaffle(ctx, segments, positions, directions, foldingState, genState, toScreen, scale, halfWidths);

    // =========================================================================
    // Courbes d'expansion idéale en pointillé à chaque angle
    // =========================================================================
    drawIdealExpansionGuides(ctx, segments, positions, directions, foldingState, toScreen, scale, halfWidths);

    // =========================================================================
    // Planches de mur (vue de côté, loi d'expansion)
    // =========================================================================
    const plankStroke = '#c8915a';
    const plankFill = 'rgba(200, 145, 90, 0.18)';
    const plankHoverFill = 'rgba(200, 145, 90, 0.35)';

    for (let i = 0; i < segments.length; i++) {
        if (i + 1 >= positions.length) break;
        const isHovered = (foldingState.hoveredSegment === i);

        // Planche du haut (mur supérieur)
        const topCorners = [
            wallCorners[i].topOuter,
            wallCorners[i + 1].topOuter,
            wallCorners[i + 1].topInner,
            wallCorners[i].topInner,
        ];
        ctx.fillStyle = isHovered ? plankHoverFill : plankFill;
        drawPolygon(ctx, topCorners, toScreen);
        ctx.fill();
        ctx.strokeStyle = plankStroke;
        ctx.lineWidth = 1.5;
        drawPolygonStroke(ctx, topCorners, toScreen);

        // Planche du bas (mur inférieur)
        const botCorners = [
            wallCorners[i].botInner,
            wallCorners[i + 1].botInner,
            wallCorners[i + 1].botOuter,
            wallCorners[i].botOuter,
        ];
        ctx.fillStyle = isHovered ? plankHoverFill : plankFill;
        drawPolygon(ctx, botCorners, toScreen);
        ctx.fill();
        ctx.strokeStyle = plankStroke;
        ctx.lineWidth = 1.5;
        drawPolygonStroke(ctx, botCorners, toScreen);

        // Axe central du segment (pointillé)
        const p0 = positions[i];
        const p1 = positions[i + 1];
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        const s0 = toScreen(p0.x, p0.y);
        const s1 = toScreen(p1.x, p1.y);
        ctx.beginPath();
        ctx.moveTo(s0.sx, s0.sy);
        ctx.lineTo(s1.sx, s1.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label du segment
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        const sMid = toScreen(midX, midY);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#aaa';
        ctx.textAlign = 'center';
        ctx.fillText(`S${i + 1}: ${segments[i].l.toFixed(0)}mm`, sMid.sx, sMid.sy - 8);

        // Annotation d'angle
        if (Math.abs(foldingState.jointAngles[i] || 0) > 0.005) {
            const angleDeg = ((foldingState.jointAngles[i] || 0) * 180 / Math.PI).toFixed(1);
            const sJ = toScreen(p0.x, p0.y);
            ctx.font = 'bold 11px monospace';
            ctx.fillStyle = '#ff8800';
            ctx.textAlign = 'center';
            ctx.fillText(`${angleDeg}°`, sJ.sx, sJ.sy - 18);
        }
    }

    // Fermeture gorge (trait vert)
    ctx.strokeStyle = '#00ffa2';
    ctx.lineWidth = 2;
    const sThTop = toScreen(wallCorners[0].topInner.x, wallCorners[0].topInner.y);
    const sThBot = toScreen(wallCorners[0].botInner.x, wallCorners[0].botInner.y);
    ctx.beginPath();
    ctx.moveTo(sThTop.sx, sThTop.sy);
    ctx.lineTo(sThBot.sx, sThBot.sy);
    ctx.stroke();

    // Fermeture bouche (trait rouge)
    const lastWc = wallCorners.length - 1;
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    const sMoTop = toScreen(wallCorners[lastWc].topInner.x, wallCorners[lastWc].topInner.y);
    const sMoBot = toScreen(wallCorners[lastWc].botInner.x, wallCorners[lastWc].botInner.y);
    ctx.beginPath();
    ctx.moveTo(sMoTop.sx, sMoTop.sy);
    ctx.lineTo(sMoBot.sx, sMoBot.sy);
    ctx.stroke();

    // =========================================================================
    // Planches de renvoi d'angle
    // =========================================================================
    drawDeflectionBoards(ctx, segments, positions, directions, foldingState, toScreen, scale, wallCorners, halfWidths, plankT);

    // =========================================================================
    // Points de jonction (draggables)
    // =========================================================================
    for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const s = toScreen(p.x, p.y);
        const isLocked = foldingState.lockedJoints.has(i);
        const isHovered = (foldingState.hoveredJoint === i);
        const isDragged = foldingState.dragInfo && foldingState.dragInfo.index === i;
        const radius = (isHovered || isDragged) ? 10 : 7;

        // Cercle extérieur
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, radius, 0, Math.PI * 2);
        if (isLocked) {
            ctx.fillStyle = isDragged ? '#ffcc00' : '#e6b800';
            ctx.strokeStyle = '#fff';
        } else {
            ctx.fillStyle = isDragged ? '#00ff88' : (isHovered ? '#00dd66' : '#00aa44');
            ctx.strokeStyle = '#fff';
        }
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();

        // Icône cadenas pour les points verrouillés
        if (isLocked) {
            ctx.font = '8px monospace';
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔒', s.sx, s.sy);
            ctx.textBaseline = 'alphabetic';
        }

        // Label index
        ctx.font = '9px monospace';
        ctx.fillStyle = '#888';
        ctx.textAlign = 'center';
        ctx.fillText(`J${i}`, s.sx, s.sy + radius + 12);
    }

    // =========================================================================
    // Légende
    // =========================================================================
    drawLegend(ctx, cw, ch, foldingState);

    // =========================================================================
    // Instructions
    // =========================================================================
    ctx.font = '10px monospace';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'left';
    ctx.fillText('Drag joints to fold • Shift = snap 45° • Right-click = lock/unlock • Scroll = zoom • Middle-click = pan', 10, ch - 10);
}

// ====================================================================================================
// DESSIN DU BAFFLE (PLANCHE DU HP)
// ====================================================================================================

function drawBaffle(ctx, segments, positions, directions, foldingState, genState, toScreen, scale, halfWidths) {
    if (!positions.length || !segments.length) return;

    const dir0 = directions[0] || 0;
    const perpAngle = dir0 + Math.PI / 2;
    const backDir = dir0 + Math.PI;
    const pos0 = positions[0];

    // Dimensions du baffle : doit couvrir au moins la gorge
    const throatW = halfWidths[0] * 2;
    const hasDriver = genState?.selectedDriverData?.diameterMm > 0;
    const baffleMm = hasDriver ? genState.selectedDriverData.diameterMm + 50 : throatW + 80;
    const halfBaffle = baffleMm / 2;
    const baffleThickness = 18; // mm

    // 4 coins du rectangle baffle (derrière joint 0, perpendiculaire au segment 0)
    const corners = [
        { x: pos0.x + halfBaffle * Math.cos(perpAngle) + baffleThickness * Math.cos(backDir),
          y: pos0.y + halfBaffle * Math.sin(perpAngle) + baffleThickness * Math.sin(backDir) },
        { x: pos0.x - halfBaffle * Math.cos(perpAngle) + baffleThickness * Math.cos(backDir),
          y: pos0.y - halfBaffle * Math.sin(perpAngle) + baffleThickness * Math.sin(backDir) },
        { x: pos0.x - halfBaffle * Math.cos(perpAngle),
          y: pos0.y - halfBaffle * Math.sin(perpAngle) },
        { x: pos0.x + halfBaffle * Math.cos(perpAngle),
          y: pos0.y + halfBaffle * Math.sin(perpAngle) },
    ];

    // Remplissage bois
    ctx.fillStyle = 'rgba(139, 90, 43, 0.35)';
    ctx.beginPath();
    const s0 = toScreen(corners[0].x, corners[0].y);
    ctx.moveTo(s0.sx, s0.sy);
    for (let c = 1; c < corners.length; c++) {
        const sc = toScreen(corners[c].x, corners[c].y);
        ctx.lineTo(sc.sx, sc.sy);
    }
    ctx.closePath();
    ctx.fill();

    // Contour
    ctx.strokeStyle = '#c0522d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const sc0 = toScreen(corners[0].x, corners[0].y);
    ctx.moveTo(sc0.sx, sc0.sy);
    for (let c = 1; c < corners.length; c++) {
        const sc = toScreen(corners[c].x, corners[c].y);
        ctx.lineTo(sc.sx, sc.sy);
    }
    ctx.closePath();
    ctx.stroke();

    // Ouverture gorge (trait pointillé vert)
    const halfThroat = halfWidths[0];
    ctx.strokeStyle = '#00ffa2';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    const sH0 = toScreen(pos0.x + halfThroat * Math.cos(perpAngle), pos0.y + halfThroat * Math.sin(perpAngle));
    const sH1 = toScreen(pos0.x - halfThroat * Math.cos(perpAngle), pos0.y - halfThroat * Math.sin(perpAngle));
    ctx.beginPath();
    ctx.moveTo(sH0.sx, sH0.sy);
    ctx.lineTo(sH1.sx, sH1.sy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    const label = hasDriver ? `Baffle ${baffleMm.toFixed(0)}mm` : 'Baffle';
    const sLabel = toScreen(
        pos0.x + (halfBaffle * 1.15) * Math.cos(perpAngle) + (baffleThickness / 2) * Math.cos(backDir),
        pos0.y + (halfBaffle * 1.15) * Math.sin(perpAngle) + (baffleThickness / 2) * Math.sin(backDir)
    );
    ctx.font = '9px monospace';
    ctx.fillStyle = '#c0522d';
    ctx.textAlign = 'center';
    ctx.fillText(label, sLabel.sx, sLabel.sy);
}

// ====================================================================================================
// DESSIN DES GUIDES D'EXPANSION IDÉALE AUX ANGLES
// ====================================================================================================

function drawIdealExpansionGuides(ctx, segments, positions, directions, foldingState, toScreen, scale, halfWidths) {
    for (let i = 1; i < directions.length; i++) {
        const angle = foldingState.jointAngles[i] || 0;
        if (Math.abs(angle) < 0.005) continue;

        const pos = positions[i];
        const dirBefore = directions[i - 1];

        // Extension idéale : continuer tout droit (pas de pliage)
        const idealDir = dirBefore;
        const segLen = (i < segments.length) ? segments[i].l : segments[segments.length - 1].l;
        const perpIdeal = idealDir + Math.PI / 2;

        const idealEnd = {
            x: pos.x + segLen * Math.cos(idealDir),
            y: pos.y + segLen * Math.sin(idealDir)
        };

        // Bords du canal (largeur variable qui suit l'expansion)
        const hwStart = halfWidths[i];
        const hwEnd = (i + 1 < halfWidths.length) ? halfWidths[i + 1] : hwStart;
        const idealTopStart = { x: pos.x + hwStart * Math.cos(perpIdeal), y: pos.y + hwStart * Math.sin(perpIdeal) };
        const idealTopEnd = { x: idealEnd.x + hwEnd * Math.cos(perpIdeal), y: idealEnd.y + hwEnd * Math.sin(perpIdeal) };
        const idealBotStart = { x: pos.x - hwStart * Math.cos(perpIdeal), y: pos.y - hwStart * Math.sin(perpIdeal) };
        const idealBotEnd = { x: idealEnd.x - hwEnd * Math.cos(perpIdeal), y: idealEnd.y - hwEnd * Math.sin(perpIdeal) };

        ctx.strokeStyle = 'rgba(255, 80, 80, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);

        // Murs idéaux (haut et bas)
        const sT0 = toScreen(idealTopStart.x, idealTopStart.y);
        const sT1 = toScreen(idealTopEnd.x, idealTopEnd.y);
        ctx.beginPath(); ctx.moveTo(sT0.sx, sT0.sy); ctx.lineTo(sT1.sx, sT1.sy); ctx.stroke();

        const sB0 = toScreen(idealBotStart.x, idealBotStart.y);
        const sB1 = toScreen(idealBotEnd.x, idealBotEnd.y);
        ctx.beginPath(); ctx.moveTo(sB0.sx, sB0.sy); ctx.lineTo(sB1.sx, sB1.sy); ctx.stroke();

        ctx.setLineDash([]);

        const sLabel = toScreen(idealEnd.x, idealEnd.y);
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(255, 80, 80, 0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('ideal', sLabel.sx, sLabel.sy - 6);
    }
}

// ====================================================================================================
// DESSIN DES PLANCHES DE RENVOI D'ANGLE
// ====================================================================================================

function drawDeflectionBoards(ctx, segments, positions, directions, foldingState, toScreen, scale, wallCorners, halfWidths, plankT) {
    for (let i = 1; i < directions.length; i++) {
        const angle = foldingState.jointAngles[i] || 0;
        if (Math.abs(angle) < 0.02) continue;

        const dirBefore = directions[i - 1];
        const dirAfter = directions[i];
        const pos = positions[i];
        const hw = halfWidths[i];

        // Côté concave : angle > 0 → tourne vers le haut → bot est concave
        //                angle < 0 → tourne vers le bas → top est concave
        const concaveIsBot = angle > 0;
        const concaveSign = concaveIsBot ? -1 : 1;

        // Perpendiculaires non-mitrées pour chaque segment au joint
        const perpBefore = dirBefore + Math.PI / 2;
        const perpAfter = dirAfter + Math.PI / 2;

        // Points non-mitrés sur le mur concave intérieur au joint
        const unmiteredA = {
            x: pos.x + concaveSign * hw * Math.cos(perpBefore),
            y: pos.y + concaveSign * hw * Math.sin(perpBefore)
        };
        const unmiteredB = {
            x: pos.x + concaveSign * hw * Math.cos(perpAfter),
            y: pos.y + concaveSign * hw * Math.sin(perpAfter)
        };

        // Point miter concave (pointe du triangle projetant dans le conduit)
        const miterPt = concaveIsBot ? wallCorners[i].botInner : wallCorners[i].topInner;

        // Triangle de renvoi d'angle : [unmiteredA, miterPt, unmiteredB]
        const triangle = [unmiteredA, miterPt, unmiteredB];

        ctx.fillStyle = 'rgba(220, 60, 60, 0.30)';
        drawPolygon(ctx, triangle, toScreen);
        ctx.fill();
        ctx.strokeStyle = 'rgba(220, 60, 60, 0.85)';
        ctx.lineWidth = 1.5;
        drawPolygonStroke(ctx, triangle, toScreen);

        // Label
        const cx = (unmiteredA.x + miterPt.x + unmiteredB.x) / 3;
        const cy = (unmiteredA.y + miterPt.y + unmiteredB.y) / 3;
        const sMid = toScreen(cx, cy);
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(220, 60, 60, 0.85)';
        ctx.textAlign = 'center';
        const angleDeg = Math.abs(angle * 180 / Math.PI).toFixed(1);
        ctx.fillText(`renvoi ${angleDeg}°`, sMid.sx, sMid.sy - 6);
    }
}

// ====================================================================================================
// DESSIN UTILITAIRE
// ====================================================================================================

function drawPolygon(ctx, corners, toScreen) {
    ctx.beginPath();
    for (let i = 0; i < corners.length; i++) {
        const s = toScreen(corners[i].x, corners[i].y);
        if (i === 0) ctx.moveTo(s.sx, s.sy);
        else ctx.lineTo(s.sx, s.sy);
    }
    ctx.closePath();
}

function drawPolygonStroke(ctx, corners, toScreen) {
    ctx.beginPath();
    for (let i = 0; i < corners.length; i++) {
        const s = toScreen(corners[i].x, corners[i].y);
        if (i === 0) ctx.moveTo(s.sx, s.sy);
        else ctx.lineTo(s.sx, s.sy);
    }
    ctx.closePath();
    ctx.stroke();
}

function drawGrid(ctx, cw, ch, scale, centerWorldX, centerWorldY, foldingState) {
    // Grille adaptative
    const rawStep = 50 / scale; // 50px de base
    const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const nice = [1, 2, 5, 10].find(n => n * pow >= rawStep) * pow || rawStep;
    const gridStep = nice;

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;

    const toScreenX = (wx) => cw / 2 + (wx - centerWorldX) * scale + foldingState.panX;
    const toScreenY = (wy) => ch / 2 - (wy - centerWorldY) * scale + foldingState.panY;

    const worldLeft = centerWorldX - (cw / 2 + foldingState.panX) / scale;
    const worldRight = centerWorldX + (cw / 2 - foldingState.panX) / scale;
    const worldBottom = centerWorldY - (ch / 2 - foldingState.panY) / scale;
    const worldTop = centerWorldY + (ch / 2 + foldingState.panY) / scale;

    const startX = Math.floor(worldLeft / gridStep) * gridStep;
    const startY = Math.floor(worldBottom / gridStep) * gridStep;

    for (let wx = startX; wx <= worldRight; wx += gridStep) {
        const sx = toScreenX(wx);
        if (sx < 0 || sx > cw) continue;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, ch);
        ctx.stroke();
    }
    for (let wy = startY; wy <= worldTop; wy += gridStep) {
        const sy = toScreenY(wy);
        if (sy < 0 || sy > ch) continue;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(cw, sy);
        ctx.stroke();
    }

    // Graduations
    ctx.fillStyle = '#444';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    for (let wx = startX; wx <= worldRight; wx += gridStep) {
        const sx = toScreenX(wx);
        if (sx < 20 || sx > cw - 20) continue;
        ctx.fillText(`${wx.toFixed(0)}`, sx, ch - 4);
    }
    ctx.textAlign = 'right';
    for (let wy = startY; wy <= worldTop; wy += gridStep) {
        const sy = toScreenY(wy);
        if (sy < 10 || sy > ch - 20) continue;
        ctx.fillText(`${wy.toFixed(0)}`, 30, sy + 3);
    }
}

function drawLegend(ctx, cw, ch, foldingState) {
    const x = cw - 200;
    let y = 16;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#c8915a';
    ctx.fillText('— Planches (murs)', x, y); y += 14;

    ctx.fillStyle = '#00ffa2';
    ctx.fillText('— Gorge', x, y); y += 14;

    ctx.fillStyle = '#ff4444';
    ctx.fillText('— Bouche', x, y); y += 14;

    ctx.fillStyle = 'rgba(255, 80, 80, 0.6)';
    ctx.fillText('--- Expansion idéale', x, y); y += 14;

    ctx.fillStyle = 'rgba(100, 180, 255, 0.8)';
    ctx.fillText('■ Planche de renvoi', x, y); y += 14;

    ctx.fillStyle = '#e6b800';
    ctx.fillText('● Joint verrouillé', x, y); y += 14;

    ctx.fillStyle = '#00aa44';
    ctx.fillText('● Joint libre', x, y);
}

// ====================================================================================================
// GESTION DES ÉVÉNEMENTS SOURIS
// ====================================================================================================

const JOINT_HIT_RADIUS = 14; // rayon de détection (pixels écran)
const SEGMENT_HIT_DISTANCE = 20;

/**
 * Trouve le joint le plus proche de la position souris (en coordonnées écran).
 */
function findHoveredJoint(mx, my, positions, toScreen) {
    let best = -1;
    let bestDist = JOINT_HIT_RADIUS;
    // Skip joints 0 and 1 (baffle/first plank is fixed)
    for (let i = 2; i < positions.length; i++) {
        const s = toScreen(positions[i].x, positions[i].y);
        const dx = mx - s.sx;
        const dy = my - s.sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    }
    return best;
}

/**
 * Trouve le segment le plus proche de la position souris.
 */
function findHoveredSegment(mx, my, positions, toScreen, numSegments) {
    let best = -1;
    let bestDist = SEGMENT_HIT_DISTANCE;
    // Skip segment 0 (baffle/first plank is fixed)
    for (let i = 1; i < numSegments; i++) {
        const s0 = toScreen(positions[i].x, positions[i].y);
        const s1 = toScreen(positions[i + 1].x, positions[i + 1].y);
        const dist = pointToSegmentDistance(mx, my, s0.sx, s0.sy, s1.sx, s1.sy);
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    }
    return best;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Quand on drag un joint, on fait pivoter le segment qui MÈNE à ce joint.
 * Joint i est à la fin du segment i-1. Dragger joint i = changer la direction du segment i-1
 * en changeant jointAngles[i-1] (l'angle au début du segment i-1).
 */
function handleJointDrag(jointIdx, mouseWorldX, mouseWorldY, foldingState, segments) {
    if (jointIdx <= 1) return; // Joint 0 = origine, Joint 1 = fin du segment fixe (baffle)

    // Le pivot est le joint AVANT celui qu'on drag
    const pivotIdx = jointIdx - 1;
    const pivotPos = foldingState.jointPositions[pivotIdx];

    // Direction voulue : du pivot vers la souris
    const dx = mouseWorldX - pivotPos.x;
    const dy = mouseWorldY - pivotPos.y;
    let desiredDir = Math.atan2(dy, dx);

    // Snap à 45° si Shift est enfoncé
    if (foldingState._shiftHeld) {
        const snap = Math.PI / 4;
        desiredDir = Math.round(desiredDir / snap) * snap;
    }

    // Angle cumulé AVANT le pivotIdx (somme des angles 0..pivotIdx-1)
    let cumBefore = 0;
    for (let k = 0; k < pivotIdx; k++) {
        cumBefore += foldingState.jointAngles[k] || 0;
    }

    // L'angle au pivot pour que le segment pivotIdx pointe vers la souris
    foldingState.jointAngles[pivotIdx] = desiredDir - cumBefore;
}

/**
 * Quand on drag un segment, on fait pivoter le segment autour de son joint de départ.
 * Changer jointAngles[segIdx] change la direction du segment segIdx.
 */
function handleSegmentDrag(segIdx, mouseWorldX, mouseWorldY, foldingState, segments) {
    const pivotPos = foldingState.jointPositions[segIdx];
    const dx = mouseWorldX - pivotPos.x;
    const dy = mouseWorldY - pivotPos.y;
    let desiredDir = Math.atan2(dy, dx);

    // Snap à 45° si Shift est enfoncé
    if (foldingState._shiftHeld) {
        const snap = Math.PI / 4;
        desiredDir = Math.round(desiredDir / snap) * snap;
    }

    // Angle cumulé AVANT segIdx
    let cumBefore = 0;
    for (let k = 0; k < segIdx; k++) {
        cumBefore += foldingState.jointAngles[k] || 0;
    }

    foldingState.jointAngles[segIdx] = desiredDir - cumBefore;
}

// ====================================================================================================
// ATTACHEMENT / DÉTACHEMENT DES ÉVÉNEMENTS
// ====================================================================================================

export function attachFoldingEvents(canvas, foldingState, segments, genDom, rootElement, genState, redrawCallback, onFoldEnd) {
    // Détacher les anciens handlers
    detachFoldingEvents(foldingState);

    const getMousePos = (e) => {
        const rect = canvas.getBoundingClientRect();
        return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
    };

    const onMouseDown = (e) => {
        const { mx, my } = getMousePos(e);
        const segs = genState.lastGenSegments;
        if (!segs || segs.length < 2) return;

        // Clic droit = lock/unlock
        if (e.button === 2) {
            e.preventDefault();
            const joint = findHoveredJoint(mx, my, foldingState.jointPositions, foldingState._toScreen);
            if (joint >= 0) {
                if (foldingState.lockedJoints.has(joint)) {
                    foldingState.lockedJoints.delete(joint);
                } else {
                    foldingState.lockedJoints.add(joint);
                }
                redrawCallback();
            }
            return;
        }

        // Clic milieu = pan
        if (e.button === 1) {
            e.preventDefault();
            foldingState.isPanning = true;
            foldingState.lastPanMouse = { x: mx, y: my };
            return;
        }

        // Clic gauche = drag joint ou segment
        if (e.button === 0) {
            foldingState._shiftHeld = e.shiftKey;
            const joint = findHoveredJoint(mx, my, foldingState.jointPositions, foldingState._toScreen);
            if (joint > 1) {
                // Joints 0-1 = fixes (baffle), joints 2+ sont draggables
                foldingState.dragInfo = {
                    type: 'joint',
                    index: joint,
                    startAngle: foldingState.jointAngles[joint] || 0
                };
                canvas.style.cursor = 'grabbing';
                return;
            }

            const seg = findHoveredSegment(mx, my, foldingState.jointPositions, foldingState._toScreen, segs.length);
            if (seg >= 0) {
                foldingState.dragInfo = {
                    type: 'segment',
                    index: seg,
                    startAngle: foldingState.jointAngles[seg] || 0
                };
                canvas.style.cursor = 'grabbing';
                return;
            }

            // Sinon, commencer un pan avec bouton gauche aussi
            foldingState.isPanning = true;
            foldingState.lastPanMouse = { x: mx, y: my };
        }
    };

    const onMouseMove = (e) => {
        const { mx, my } = getMousePos(e);
        const segs = genState.lastGenSegments;
        if (!segs || segs.length < 2 || !foldingState._toWorld) return;

        // Pan
        if (foldingState.isPanning && foldingState.lastPanMouse) {
            foldingState.panX += mx - foldingState.lastPanMouse.x;
            foldingState.panY += my - foldingState.lastPanMouse.y;
            foldingState.lastPanMouse = { x: mx, y: my };
            redrawCallback();
            return;
        }

        // Drag
        if (foldingState.dragInfo) {
            foldingState._shiftHeld = e.shiftKey;
            const world = foldingState._toWorld(mx, my);
            if (foldingState.dragInfo.type === 'joint') {
                handleJointDrag(foldingState.dragInfo.index, world.wx, world.wy, foldingState, segs);
            } else if (foldingState.dragInfo.type === 'segment') {
                handleSegmentDrag(foldingState.dragInfo.index, world.wx, world.wy, foldingState, segs);
            }
            redrawCallback();
            return;
        }

        // Hover
        const oldJoint = foldingState.hoveredJoint;
        const oldSeg = foldingState.hoveredSegment;
        foldingState.hoveredJoint = findHoveredJoint(mx, my, foldingState.jointPositions, foldingState._toScreen);
        foldingState.hoveredSegment = foldingState.hoveredJoint < 0
            ? findHoveredSegment(mx, my, foldingState.jointPositions, foldingState._toScreen, segs.length)
            : -1;

        if (foldingState.hoveredJoint > 1) {
            canvas.style.cursor = 'grab';
        } else if (foldingState.hoveredSegment >= 0) {
            canvas.style.cursor = 'grab';
        } else {
            canvas.style.cursor = 'default';
        }

        if (oldJoint !== foldingState.hoveredJoint || oldSeg !== foldingState.hoveredSegment) {
            redrawCallback();
        }
    };

    const onMouseUp = (e) => {
        const wasDragging = !!foldingState.dragInfo;
        if (foldingState.dragInfo) {
            foldingState.dragInfo = null;
            foldingState._shiftHeld = false;
            canvas.style.cursor = foldingState.hoveredJoint > 0 ? 'grab' : 'default';
        }
        if (foldingState.isPanning) {
            foldingState.isPanning = false;
            foldingState.lastPanMouse = null;
        }
        // Notifier la fin du drag pour mettre à jour la 3D
        if (wasDragging && onFoldEnd) onFoldEnd();
    };

    const onWheel = (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        foldingState.zoom *= factor;
        foldingState.zoom = Math.max(0.1, Math.min(20, foldingState.zoom));
        redrawCallback();
    };

    const onContextMenu = (e) => {
        e.preventDefault(); // Empêcher le menu contextuel natif
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    foldingState._canvas = canvas;
    foldingState._boundHandlers = { onMouseDown, onMouseMove, onMouseUp, onWheel, onContextMenu };
}

export function detachFoldingEvents(foldingState) {
    if (!foldingState._canvas || !foldingState._boundHandlers) return;
    const canvas = foldingState._canvas;
    const h = foldingState._boundHandlers;

    canvas.removeEventListener('mousedown', h.onMouseDown);
    canvas.removeEventListener('mousemove', h.onMouseMove);
    canvas.removeEventListener('mouseup', h.onMouseUp);
    canvas.removeEventListener('mouseleave', h.onMouseUp);
    canvas.removeEventListener('wheel', h.onWheel);
    canvas.removeEventListener('contextmenu', h.onContextMenu);

    foldingState._boundHandlers = null;
    foldingState._canvas = null;
}

// ====================================================================================================
// RÉINITIALISATION
// ====================================================================================================

export function resetFoldingState(foldingState, numSegments) {
    foldingState.jointAngles = new Array(numSegments).fill(0);
    foldingState.lockedJoints = new Set([0, 1]);
    foldingState.panX = 0;
    foldingState.panY = 0;
    foldingState.zoom = 1;
    foldingState.dragInfo = null;
    foldingState.hoveredJoint = -1;
    foldingState.hoveredSegment = -1;
}
