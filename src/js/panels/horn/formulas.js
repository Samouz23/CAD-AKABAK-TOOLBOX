// ====================================================================================================
// FICHIER :  src/js/panels/horn/formulas.js
// RÔLE :     Formules mathématiques : expansion, dimension, best-fit, parsing math sécurisé.
// ====================================================================================================

import { C_SOUND } from './config.js';

// --- Fréquence de coupure depuis la longueur du pavillon ---

export function getFcFromHornLength(L_mm) {
    if (!isFinite(L_mm) || L_mm <= 0) return 0;
    const L_m = L_mm / 1000;
    return 116 / L_m;
}

// --- Parser mathématique sécurisé sans eval() ni Function() ---

export function safeEvaluateMath(expression) {
    const expr = expression.trim().replace(/\s+/g, '');
    
    const simpleNum = parseFloat(expr);
    if (!isNaN(simpleNum) && /^-?\d+\.?\d*$/.test(expr)) {
        return simpleNum;
    }
    
    let pos = 0;
    
    const peek = () => expr[pos];
    const consume = () => expr[pos++];
    
    const parseNumber = () => {
        let num = '';
        while (pos < expr.length && /[0-9.]/.test(peek())) {
            num += consume();
        }
        return parseFloat(num);
    };
    
    const parseFactor = () => {
        if (peek() === '-') { consume(); return -parseFactor(); }
        if (peek() === '+') { consume(); return parseFactor(); }
        
        if (peek() === '(') {
            consume();
            const result = parseExpression();
            consume();
            return result;
        }
        
        if (expr.substr(pos, 5) === 'Math.') {
            pos += 5;
            const funcName = expr.substr(pos, 4);
            
            if (funcName === 'sqrt') {
                pos += 4; consume();
                const arg = parseExpression();
                consume();
                return Math.sqrt(arg);
            } else if (funcName.startsWith('sin')) {
                pos += 3; consume();
                const arg = parseExpression();
                consume();
                return Math.sin(arg);
            } else if (funcName.startsWith('cos')) {
                pos += 3; consume();
                const arg = parseExpression();
                consume();
                return Math.cos(arg);
            } else if (funcName.startsWith('tan')) {
                pos += 3; consume();
                const arg = parseExpression();
                consume();
                return Math.tan(arg);
            } else if (funcName.startsWith('abs')) {
                pos += 3; consume();
                const arg = parseExpression();
                consume();
                return Math.abs(arg);
            } else if (funcName.startsWith('pow')) {
                pos += 3; consume();
                const arg1 = parseExpression();
                consume();
                const arg2 = parseExpression();
                consume();
                return Math.pow(arg1, arg2);
            } else if (funcName.startsWith('PI')) {
                pos += 2;
                return Math.PI;
            }
        }
        
        return parseNumber();
    };
    
    const parseTerm = () => {
        let result = parseFactor();
        while (pos < expr.length && (peek() === '*' || peek() === '/')) {
            const op = consume();
            const right = parseFactor();
            if (op === '*') result *= right;
            else result /= right;
        }
        return result;
    };
    
    const parseExpression = () => {
        let result = parseTerm();
        while (pos < expr.length && (peek() === '+' || peek() === '-')) {
            const op = consume();
            const right = parseTerm();
            if (op === '+') result += right;
            else result -= right;
        }
        return result;
    };
    
    try {
        const result = parseExpression();
        if (typeof result === 'number' && isFinite(result)) {
            return result;
        }
        throw new Error('Résultat non numérique');
    } catch (error) {
        throw new Error(`Erreur de parsing: ${error.message}`);
    }
}

// --- Lois d'expansion ---

export const expansionFormulas = {
    Conical: (s0, sL, L, x) => {
        if (L <= 0 || s0 < 0 || sL < 0) return s0;
        const r0 = Math.sqrt(s0); const rL = Math.sqrt(sL);
        const rx = r0 + (rL - r0) * (x / L); return rx * rx;
    },
    Exponential: (s0, sL, L, x, opts) => {
        if (s0 <= 0) return s0;
        const fc = (opts?.fc && isFinite(opts.fc)) ? opts.fc : getFcFromHornLength(L);
        const m = (4 * Math.PI * fc) / C_SOUND; return s0 * Math.exp(m * x);
    },
    Parabolic: (s0, sL, L, x, opts) => {
        if (s0 <= 0) return s0;
        const fc = (opts?.fc && isFinite(opts.fc)) ? opts.fc : getFcFromHornLength(L);
        const x0 = C_SOUND / (Math.PI * fc); return s0 * Math.pow(1 + x / x0, 2);
    },
    Hypex: (s0, sL, L, x, opts) => {
        if (s0 <= 0) return s0;
        const fc = (opts?.fc && isFinite(opts.fc)) ? opts.fc : getFcFromHornLength(L);
        const T = opts?.T ?? 1.0;
        const m = (4 * Math.PI * fc) / C_SOUND; const y0 = Math.sqrt(s0);
        const y = y0 * (Math.cosh(m * x / 2) + T * Math.sinh(m * x / 2)); return y * y;
    },
    OS: (s0, sL, L, x, opts) => {
        if (s0 <= 0) return 0;
        const theta = opts?.theta ?? 45;
        const y0 = Math.sqrt(s0); const theta_rad = theta * (Math.PI / 180);
        return Math.pow(y0, 2) + Math.pow(Math.tan(theta_rad) * x, 2);
    },
};

export const dimensionFormulas = {
    'OS-SE': (x, L, opts) => {
        const { k=1.0, r=18.0, t=5.0, a=40.0, s=0.7, q=0.996, n=5.0 } = opts;
        const t_rad = t * (Math.PI/180); const a_rad = a * (Math.PI/180);
        const sqrtContent = Math.pow(k*r,2) + 2*k*r*x*Math.tan(t_rad) + Math.pow(x,2)*Math.pow(Math.tan(a_rad),2);
        if (sqrtContent < 0) return NaN;
        const part1 = Math.sqrt(sqrtContent) - r*(k-1);
        let part2 = 0;
        if (L > 0 && q !== 0) {
            const innerPowerBase = (q * x) / L;
            if (innerPowerBase >= 0 && innerPowerBase <= 1) {
                const innerTerm = 1 - Math.pow(innerPowerBase, n);
                if (innerTerm < 0) return part1;
                const powerTerm = Math.pow(innerTerm, 1 / n);
                if (!isNaN(powerTerm)) { part2 = (L * s / q) * (1 - powerTerm); }
            }
        }
        const result = part1 + part2;
        return isNaN(result) ? 0 : result;
    }
};

// --- Génération de courbe idéale pour un type donné ---

export function generateIdealCurveFor(type, s0, sL, L, opts) {
    const formula = expansionFormulas[type];
    if (!formula || s0 <= 0 || L <= 0) return [];

    // Scaling : la formule brute n'atterrit pas forcément sur sL à x=L.
    // On recale la courbe pour qu'elle passe par s0 ET sL (même logique que le générateur).
    const rawEnd = formula(s0, sL, L, L, opts);
    const needsScale = type !== 'Conical' && sL > 0 && rawEnd > 0 && Math.abs(rawEnd - sL) > 1;

    const steps = 50;
    const idealPoints = [];
    for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * L;
        let area = formula(s0, sL, L, x, opts);
        if (needsScale && isFinite(area) && area > s0 && rawEnd > s0) {
            const logRatio = Math.log(area / s0) / Math.log(rawEnd / s0);
            area = s0 * Math.pow(sL / s0, logRatio);
        }
        if (isFinite(area)) {
            idealPoints.push({ x, y: area });
        }
    }
    return idealPoints;
}

// --- Calcul d'erreur pour le best-fit ---

export function calculateFitError(realPoints, idealPoints) {
    if (realPoints.length < 2 || idealPoints.length < 2) return Infinity;
    let sumOfSquares = 0; let pointsCompared = 0;
    for (const realPoint of realPoints) {
        let p1 = null, p2 = null;
        for (let i = 0; i < idealPoints.length - 1; i++) {
            if (idealPoints[i].x <= realPoint.x && realPoint.x <= idealPoints[i + 1].x) {
                p1 = idealPoints[i]; p2 = idealPoints[i + 1]; break;
            }
        }
        if (p1 && p2) {
            let idealY;
            const dx = p2.x - p1.x;
            if (dx === 0) { idealY = p1.y; }
            else { const t = (realPoint.x - p1.x) / dx; idealY = p1.y + t * (p2.y - p1.y); }
            if (isFinite(idealY)) {
                const error = realPoint.y - idealY;
                sumOfSquares += error * error;
                pointsCompared++;
            }
        }
    }
    if (pointsCompared === 0) return Infinity;
    return Math.sqrt(sumOfSquares / pointsCompared);
}
