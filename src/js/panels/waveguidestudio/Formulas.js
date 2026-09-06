// ====================================================================================================
// FICHIER :  src/js/utils/waveguideFormulas.js
// RÔLE :     Contient les formules mathématiques pour la génération des guides d'ondes.
// ====================================================================================================

// --- CONSTANTES ---

const C_SOUND = 343000; // Vitesse du son en mm/s

// --- LOIS D'EXPANSION ---

export const expansionLaws = {
    'OS-SE': {
        formula: (z, L, opts) => {
            const { k = 1.0, r0 = 12.7, a = 45.0, s = 0.7, q = 0.998, n = 5.0, t = 0.0 } = opts;
            const t_rad = t * (Math.PI / 180);
            const a_rad = a * (Math.PI / 180);
            const kr0 = k * r0;
            const gosPartSqrt = Math.pow(kr0, 2) + 2 * kr0 * z * Math.tan(t_rad) + Math.pow(z, 2) * Math.pow(Math.tan(a_rad), 2);
            if (gosPartSqrt < 0) return r0;
            const gosPart = Math.sqrt(gosPartSqrt) + r0 * (1 - k);
            let termPart = 0;
            if (L > 0 && q > 0 && s !== 0) {
                const innerBase = (q * z) / L;
                if (innerBase >= 0 && innerBase <= 1) {
                    const innerTerm = 1 - Math.pow(innerBase, n);
                    if (innerTerm >= 0) { termPart = (s * L / q) * (1 - Math.pow(innerTerm, 1 / n)); }
                }
            }
            const result = gosPart + termPart;
            return isNaN(result) ? r0 : result;
        }
    },
    'OS': {
        formula: (z, L, opts) => {
            const { r0 = 12.7, theta = 45 } = opts;
            return Math.sqrt(Math.pow(r0, 2) + Math.pow(z * Math.tan(theta * (Math.PI / 180)), 2));
        }
    },
    'Conical': {
        formula: (z, L, opts) => {
            const { r0 = 12.7, theta = 45 } = opts;
            return r0 + z * Math.tan(theta * (Math.PI / 180));
        }
    },
    'Exponential': {
        formula: (z, L, opts) => {
            const { r0 = 12.7, fc = 400 } = opts;
            if (r0 <= 0 || fc <= 0) return r0;
            const m = (4 * Math.PI * fc) / C_SOUND;
            return r0 * Math.exp(m * z / 2);
        }
    },
    'Parabolic': {
        formula: (z, L, opts) => {
            const { r0 = 12.7, fc = 400 } = opts;
            if (r0 <= 0 || fc <= 0) return r0;
            const x0 = C_SOUND / (Math.PI * fc);
            return r0 * (1 + z / x0);
        }
    },
    'Hypex': {
        formula: (z, L, opts) => {
            const { r0 = 12.7, fc = 400, T = 1.0 } = opts;
            if (r0 <= 0 || fc <= 0) return r0;
            const m = (4 * Math.PI * fc) / C_SOUND;
            return r0 * (Math.cosh(m * z / 2) + T * Math.sinh(m * z / 2));
        }
    },
    'Bessel': {
        formula: (z, L, opts) => {
            const { r0 = 12.7, fc = 400, b = 1.0 } = opts;
            if (r0 <= 0 || fc <= 0 || b <= 0) return r0;
            const x0 = C_SOUND / (2 * Math.PI * fc);
            return r0 * Math.pow(1 + z / x0, b);
        }
    }
};

// --- FORMULES DE FORME ---

export const superformula = (theta, opts) => {
    const { m = 4, a = 1, b = 1, n1 = 2, n2 = 2, n3 = 2 } = opts;
    if (a === 0 || b === 0 || n1 === 0) return 0;
    const term1 = Math.pow(Math.abs(Math.cos(m * theta / 4) / a), n2);
    const term2 = Math.pow(Math.abs(Math.sin(m * theta / 4) / b), n3);
    const result = Math.pow(term1 + term2, -1 / n1);
    return isNaN(result) ? 1 : result;
};

// --- FONCTIONS UTILITAIRES GÉOMÉTRIQUES ---

export function calculatePolygonArea(points) {
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        area += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(area) / 2.0;
}

export function getRadialDistanceForShape(theta, shape, params) {
    if (shape === 'circle') return params.radius;
    if (shape === 'rectangle' || shape === 'rounded_rectangle') {
        const w = params.width / 2, h = params.height / 2;
        const r = Math.max(0, Math.min(params.radius || 0, w, h));
        const angle = (theta % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const cos_t = Math.cos(angle), sin_t = Math.sin(angle);

        if (r === 0) { // Rectangle simple
            const rectAngle = Math.atan2(h, w);
            if (angle <= rectAngle || angle >= 2 * Math.PI - rectAngle) return w / Math.abs(cos_t);
            if (angle > rectAngle && angle <= Math.PI - rectAngle) return h / Math.abs(sin_t);
            if (angle > Math.PI - rectAngle && angle <= Math.PI + rectAngle) return w / Math.abs(cos_t);
            return h / Math.abs(sin_t);
        }

        const cx = w - r, cy = h - r;
        let distances = [];

        if (Math.abs(cos_t) > 1e-9) {
            const d = Math.abs(w / cos_t);
            if (d * Math.abs(sin_t) <= h) distances.push(d);
        }
        if (Math.abs(sin_t) > 1e-9) {
            const d = Math.abs(h / sin_t);
            if (d * Math.abs(cos_t) <= w) distances.push(d);
        }

        [[cx, cy], [-cx, cy], [-cx, -cy], [cx, -cy]].forEach(center => {
            const [ocx, ocy] = center;
            const b = -2 * (cos_t * ocx + sin_t * ocy), c = ocx * ocx + ocy * ocy - r * r, delta = b * b - 4 * c;
            if (delta >= 0) {
                const d = (-b + Math.sqrt(delta)) / 2;
                if (d > 0) {
                    if (Math.abs(d * cos_t) >= cx && Math.abs(d * sin_t) >= cy) distances.push(d);
                }
            }
        });
        return distances.length > 0 ? Math.min(...distances) : Math.hypot(w, h);
    }
    return 0;
}

export function getUnitShapePoints(shapeType, params, pointsPerSlice) {
    const phi = (params && params.superformula && typeof params.superformula.phase === 'number') ? params.superformula.phase : 0;

    if (shapeType === 'circle') {
        const pts = new Array(pointsPerSlice);
        for (let j = 0; j < pointsPerSlice; j++) {
            const theta = (j / pointsPerSlice) * 2 * Math.PI + phi;
            pts[j] = { x: Math.cos(theta), y: Math.sin(theta), r: 1.0, theta };
        }
        return pts;
    }

    if (shapeType === 'superformula') {
        const sf = params.superformula || {};
        const nSamp = Math.max(360, pointsPerSlice);
        const tmp = [];
        for (let k = 0; k < nSamp; k++) {
            const th = (k / nSamp) * 2 * Math.PI;
            const r0 = superformula(th, sf);
            tmp.push({ x: r0 * Math.cos(th), y: r0 * Math.sin(th) });
        }
        const A0 = calculatePolygonArea(tmp);
        const s0 = (A0 > 1e-9) ? Math.sqrt(Math.PI / A0) : 1.0;
        const amp = (typeof sf.amplitude === 'number') ? sf.amplitude : 1.0;

        const pts = new Array(pointsPerSlice);
        for (let j = 0; j < pointsPerSlice; j++) {
            const theta = (j / pointsPerSlice) * 2 * Math.PI + phi;
            const r_sf = superformula(theta, sf) * s0;
            const r = (1 - amp) * 1.0 + amp * r_sf;
            pts[j] = { x: r * Math.cos(theta), y: r * Math.sin(theta), r, theta };
        }

        const A = calculatePolygonArea(pts);
        if (A > 1e-9) {
            const s = Math.sqrt(Math.PI / A);
            pts.forEach(p => { p.x *= s; p.y *= s; p.r *= s; });
        }
        return pts;
    }

    const aspectRatio = (params && params.height && params.width) ? (params.height / params.width) : 1;
    const unitShapeParams = { width: 2, height: 2 * aspectRatio, radius: 0 };
    if (params && params.radius && params.width > 0) {
        unitShapeParams.radius = params.radius / (params.width / 2);
    }
    const pts = new Array(pointsPerSlice);
    for (let j = 0; j < pointsPerSlice; j++) {
        const theta = (j / pointsPerSlice) * 2 * Math.PI + phi;
        const r = getRadialDistanceForShape(theta, shapeType, unitShapeParams);
        pts[j] = { x: r * Math.cos(theta), y: r * Math.sin(theta), r, theta };
    }
    const Arect = calculatePolygonArea(pts);
    if (Arect > 1e-9) {
        const s = Math.sqrt(Math.PI / Arect);
        pts.forEach(p => { p.x *= s; p.y *= s; p.r *= s; });
    }
    return pts;
}