// ====================================================================================================
// FICHIER :  src/js/panels/waveguidestudio/profileGenerator.js
// RÔLE :     Génération du profil du waveguide et récupération de la configuration depuis l'UI.
// ====================================================================================================

import * as THREE from '../../lib/three.module.js';
import * as Formulas from './Formulas.js';

export function getConfigFromUI(dom) {
    const inputShape = dom.root.querySelector('#wg-input-shape').value;
    let throatWidth = 0, throatHeight = 0, throatDiameter = 25.4, throatRadius = 0;

    if (inputShape === 'circle') {
      throatDiameter = parseFloat(dom.root.querySelector('#wg-d-in-circle').value) || 25.4;
    } else if (inputShape === 'rectangle') {
      throatWidth  = parseFloat(dom.root.querySelector('#wg-d-in-rect-w').value) || 20;
      throatHeight = parseFloat(dom.root.querySelector('#wg-d-in-rect-h').value) || 10;
      throatDiameter = 2 * Math.sqrt((throatWidth * throatHeight) / Math.PI);
    } else if (inputShape === 'rounded_rectangle') {
      throatWidth  = parseFloat(dom.root.querySelector('#wg-d-in-rounded-rect-w').value) || 40;
      throatHeight = parseFloat(dom.root.querySelector('#wg-d-in-rounded-rect-h').value) || 25;
      throatRadius = parseFloat(dom.root.querySelector('#wg-d-in-rounded-rect-r').value) || 0;
      // Clamp radius to half the smallest side
      const rMax = Math.min(throatWidth, throatHeight) / 2;
      throatRadius = Math.max(0, Math.min(throatRadius, rMax));
      // Equivalent area of a rounded rectangle: A = W*H - (4 - pi)*r^2
      const area = Math.max(1e-9, throatWidth * throatHeight - (4 - Math.PI) * throatRadius * throatRadius);
      throatDiameter = 2 * Math.sqrt(area / Math.PI);
    }

    // Rendering resolution stays high and independent from the Gmsh export settings.
    const numLines = 160;

    const num = (sel, dflt) => {
      const v = parseFloat((dom.root.querySelector(sel) || {}).value);
      return Number.isFinite(v) ? v : dflt;
    };

    const config = {
      dIn: throatDiameter,
      inputShape,
      throatWidth,
      throatHeight,
      throatRadius,

      // 'horn' (par défaut) | 'dosc' — cf. dosc/doscGenerator.js
      waveguideType: (dom.root.querySelector('#wg-waveguide-type') || {}).value || 'horn',
      dosc: {
        throatDiameter: num('#wg-dosc-throat-d', 35),
        mouthHeight:    num('#wg-dosc-mouth-h', 220),
        mouthWidth:     num('#wg-dosc-mouth-w', 30),
        depth:          num('#wg-dosc-depth', 244),
        filletRadius:   num('#wg-dosc-fillet-r', 3),
        prismHeightPct: num('#wg-dosc-prism-height', 0),
        prismWidthPct:  num('#wg-dosc-prism-width', 0),
        wavefrontGradePct: num('#wg-dosc-wavefront-grade', 0),
      },

      numLines,
    pointsPerSegment: 140,
    sourceAxialPoints: 16,
    interfaceAxialPoints: 24,
      segmentCount: 1,
      flareMode: (dom.root.querySelector('#wg-flare-mode') || {}).value || 'isotrope',
      segments: [],
      useShapeControl: dom.wgShapeSwitch.checked,
      shapeLength: parseFloat(dom.wgShapeLength.value) || 40,
      outputShape: dom.wgOutputShape.value,
      outputRoundedRectRadius: parseFloat(dom.root.querySelector('#wg-d-out-rounded-rect-r').value) || 0,
      superformula: {
        m: parseFloat(dom.sfM.value) || 4, a: parseFloat(dom.sfA.value) || 1, b: parseFloat(dom.sfB.value) || 1,
        n1: parseFloat(dom.sfN1.value) || 1, n2: parseFloat(dom.sfN2.value) || 1, n3: parseFloat(dom.sfN3.value) || 1,
        amplitude: (parseFloat(dom.sfAmplitude.value) || 0) / 100,
        // ATH4-style GCurve.Rot / GCurve.AspectRatio
        rot: parseFloat((dom.sfRot || {}).value) || 0,
        aspect: parseFloat((dom.sfAspect || {}).value) || 1,
      },
      split: { horizontal: dom.wgSplitHorizontal.checked, vertical: dom.wgSplitVertical.checked },
      interface: {
        tipOffset: parseFloat(dom.interfaceTipOffset.value) || 30,
      },
      throatAngle: {
        enabled: true,
        // The UI lets the user choose how the entered value is interpreted:
        //   - "half" (default, legacy / Hornresp / ATH4 convention): the value
        //     IS the half-angle from the axis (slope = tan(value)).
        //   - "full" : the value is the FULL cone angle as measured in CAD
        //     between the two opposite walls of the cone (e.g. when picking
        //     two opposite edges of a compression-driver exit). It must be
        //     halved internally to obtain the slope half-angle.
        // We always store the resolved HALF-ANGLE in `angle` so downstream
        // code (formulas, snapFirstSegmentSlope, applyThroatAngleShift, etc.)
        // can keep treating `angle` as a half-angle without changes.
        angle: (() => {
            const raw = parseFloat((dom.root.querySelector('#wg-throat-angle') || {}).value) || 0;
            const mode = ((dom.root.querySelector('#wg-throat-angle-mode') || {}).value) || 'half';
            return mode === 'full' ? raw / 2 : raw;
        })(),
      },
      throatAdapter: {
        enabled: !!(dom.root.querySelector('#wg-adapter-switch') || {}).checked,
        length: parseFloat((dom.root.querySelector('#wg-adapter-length') || {}).value) || 0,
        law: (dom.root.querySelector('#wg-adapter-law') || {}).value || 'linear',
        thetaH: parseFloat((dom.root.querySelector('#wg-adapter-theta-h') || {}).value) || 0,
        thetaV: parseFloat((dom.root.querySelector('#wg-adapter-theta-v') || {}).value) || 0,
        // Mouth = shape at the END of the adapter (= entry of the main horn).
        // Defaults to circle when the corresponding inputs are absent.
        mouthShape: (dom.root.querySelector('#wg-adapter-mouth-shape') || {}).value || 'circle',
        mouthCircleD: parseFloat((dom.root.querySelector('#wg-d-am-circle') || {}).value) || 0,
        mouthRectW:   parseFloat((dom.root.querySelector('#wg-d-am-rect-w') || {}).value) || 0,
        mouthRectH:   parseFloat((dom.root.querySelector('#wg-d-am-rect-h') || {}).value) || 0,
        mouthRoundW:  parseFloat((dom.root.querySelector('#wg-d-am-rounded-rect-w') || {}).value) || 0,
        mouthRoundH:  parseFloat((dom.root.querySelector('#wg-d-am-rounded-rect-h') || {}).value) || 0,
        mouthRoundR:  parseFloat((dom.root.querySelector('#wg-d-am-rounded-rect-r') || {}).value) || 0,
      },
      arcedHorn: {
        enabled: !!(dom.root.querySelector('#wg-arced-horn-switch') || {}).checked,
        upDown: {
          angle: parseFloat((dom.root.querySelector('#wg-arced-ud-angle') || {}).value) || 0,
        },
        leftRight: {
          angle: parseFloat((dom.root.querySelector('#wg-arced-lr-angle') || {}).value) || 0,
        }
      },
      radial: {
        enabled: !!(dom.root.querySelector('#wg-radial-switch') || {}).checked,
        upDown: {
          type: (dom.root.querySelector('#wg-radial-ud-type') || {}).value || 'straight',
          height: parseFloat((dom.root.querySelector('#wg-radial-ud-height') || {}).value) || 0,
        },
        leftRight: {
          type: (dom.root.querySelector('#wg-radial-lr-type') || {}).value || 'straight',
          height: parseFloat((dom.root.querySelector('#wg-radial-lr-height') || {}).value) || 0,
        }
      }
    };

    // Single segment — always use #wg-expansion-law-1 and #wg-length-1
    const law = dom.root.querySelector('#wg-expansion-law-1').value;
    const length = parseFloat(dom.root.querySelector('#wg-length-1').value) || 100;
    const opts = {};
    const optsV = {}; // V-axis overrides for anisotrope mode

    if (law === 'OS-SE') {
        ['k', 'a', 's', 'q', 'n'].forEach(p => { opts[p] = parseFloat(dom.root.querySelector(`#wg-os-se-${p}-1`).value); });
        // Pass throat angle as native 't' parameter of the GOS formula
        if (config.throatAngle && config.throatAngle.angle > 0) {
            opts.t = config.throatAngle.angle;
        }
        if (config.flareMode === 'anisotrope') {
            ['k', 'a', 's', 'q', 'n'].forEach(p => { optsV[p] = parseFloat(dom.root.querySelector(`#wg-os-se-${p}-v-1`).value); });
            if (config.throatAngle && config.throatAngle.angle > 0) {
                optsV.t = config.throatAngle.angle;
            }
        }
    } else if (law === 'OS') {
        opts.theta = parseFloat(dom.root.querySelector('#wg-os-theta-1').value) || 0;
        if (config.flareMode === 'anisotrope') {
            optsV.theta = parseFloat(dom.root.querySelector('#wg-os-theta-v-1').value) || 0;
        }
    } else if (law === 'Hypex') {
        opts.fc = parseFloat(dom.root.querySelector('#wg-hypex-fc-1').value) || 400;
        opts.T = parseFloat(dom.root.querySelector('#wg-hypex-t-1').value) || 1.0;
        if (config.flareMode === 'anisotrope') {
            optsV.fc = parseFloat(dom.root.querySelector('#wg-hypex-fc-v-1').value) || 400;
            optsV.T = parseFloat(dom.root.querySelector('#wg-hypex-t-v-1').value) || 1.0;
        }
    } else if (law === 'Bessel') {
        opts.fc = parseFloat(dom.root.querySelector('#wg-bessel-fc-1').value) || 400;
        opts.b = parseFloat(dom.root.querySelector('#wg-bessel-b-1').value) || 1.0;
        if (config.flareMode === 'anisotrope') {
            optsV.fc = parseFloat(dom.root.querySelector('#wg-bessel-fc-v-1').value) || 400;
            optsV.b = parseFloat(dom.root.querySelector('#wg-bessel-b-v-1').value) || 1.0;
        }
    }

    config.segments.push({ law, length, opts });
    if (config.flareMode === 'anisotrope') {
        config.segmentsV = [{ law, length, opts: optsV }];
    }

    // When the throat adapter is enabled, the H/V axes diverge by design,
    // so we force anisotropic processing internally. The user's flareMode
    // toggle still controls whether the MAIN horn law differs between axes:
    //   isotrope  -> mirror segments into segmentsV (same law, same opts)
    //   anisotrope -> keep distinct opts for V already populated above
    if (config.throatAdapter.enabled && config.throatAdapter.length > 0) {
        if (!config.segmentsV) {
            config.segmentsV = config.segments.map(s => ({
                law: s.law, length: s.length, opts: { ...s.opts },
            }));
        }
        config.flareMode = 'anisotrope';
    }

    return config;
}

export function createProfileData(config) {
    let result;
    if (config.flareMode === 'anisotrope' && config.segmentsV) {
        result = generateCoupledProfiles(config);
    } else {
        const profileH = generateSingleProfile(config, config.segments);
        result = { profileH, profileV: null };
    }

    // Enforce that the very first axial segment has EXACTLY the requested
    // throat angle, even after adaptive resampling. This is what the user
    // physically measures at the throat opening.
    if (config.throatAngle && config.throatAngle.enabled && config.throatAngle.angle > 0) {
        const slope = Math.tan(config.throatAngle.angle * (Math.PI / 180));
        const r0 = config.dIn / 2;
        snapFirstSegmentSlope(result.profileH, slope, r0);
        if (result.profileV) snapFirstSegmentSlope(result.profileV, slope, r0);
    }

    return result;
}

/**
 * Override the radius of the SECOND profile point so that the slope of the
 * first axial segment equals exactly tan(throatAngle). This guarantees that
 * the rendered geometry's throat wall is at the requested angle, regardless
 * of the adaptive sub-sampling. Subsequent points are unchanged.
 */
function snapFirstSegmentSlope(profile, slopeTan, r0) {
    if (!profile || profile.length < 2) return;
    const z0 = profile[0].point.y;
    const z1 = profile[1].point.y;
    if (z1 - z0 <= 1e-9) return;
    const targetR1 = r0 + (z1 - z0) * slopeTan;
    if (!isFinite(targetR1)) return;
    profile[1].point = new THREE.Vector2(targetR1, z1);
    profile[1].rawRadius = targetR1;
    // Maintain monotonicity: if next point ends up smaller, lift it.
    for (let i = 2; i < profile.length; i++) {
        if (profile[i].rawRadius < profile[i - 1].rawRadius) {
            const z = profile[i].point.y;
            profile[i] = {
                point: new THREE.Vector2(profile[i - 1].rawRadius, z),
                rawRadius: profile[i - 1].rawRadius,
                isValid: profile[i].isValid
            };
        } else {
            break;
        }
    }
}

/**
 * Anisotropic mode: generate H and V profiles that share the SAME Z positions.
 * Adaptive weights are computed as max(curvatureH, curvatureV) so that both
 * profiles get adequate resolution where either one curves.
 */
function generateCoupledProfiles(config) {
    const segH = config.segments;
    const segV = config.segmentsV;
    const adapter = config.throatAdapter;
    const adapterEnabled = !!(adapter && adapter.enabled && adapter.length > 0);

    const mainLength = segH.reduce((acc, seg) => acc + seg.length, 0);
    const totalLength = mainLength + (adapterEnabled ? adapter.length : 0);
    if (totalLength <= 0) return { profileH: [], profileV: null };

    const targetPointCount = Math.max(5, config.pointsPerSegment);
    const r0 = config.dIn / 2;
    const oversampleN = Math.max(500, targetPointCount * 10);
    const throatAngleDeg = (config.throatAngle && config.throatAngle.angle) || 0;

    let rawH, rawV;
    if (adapterEnabled) {
        rawH = computeRawProfileWithAdapter(r0, adapter, adapter.thetaH, segH, throatAngleDeg, totalLength, oversampleN);
        rawV = computeRawProfileWithAdapter(r0, adapter, adapter.thetaV, segV, throatAngleDeg, totalLength, oversampleN);
    } else {
        rawH = computeRawProfile(r0, segH, totalLength, oversampleN);
        rawV = computeRawProfile(r0, segV, totalLength, oversampleN);
        // Apply throat angle correction for non-OS-SE laws (OS-SE has native t param)
        if (config.throatAngle && config.throatAngle.enabled && throatAngleDeg > 0
            && segH[0].law !== 'OS-SE') {
            applyThroatAngleShift(rawH, segH, r0, throatAngleDeg, totalLength);
            applyThroatAngleShift(rawV, segV, r0, throatAngleDeg, totalLength);
        }
    }

    if (rawH.length < 2 || rawV.length < 2) {
        const fallback = [{ point: new THREE.Vector2(r0, 0), rawRadius: r0, isValid: true }];
        return { profileH: fallback, profileV: [...fallback] };
    }

    // Adaptive weights: inverse-radius based for BEM aspect ratio balance
    // Use min radius of both profiles at each Z
    const weights = new Float64Array(oversampleN);
    const rMin = Math.min(rawH[0].radius, rawV[0].radius);

    for (let i = 0; i < oversampleN; i++) {
        const rH = rawH[i].radius;
        const rV = rawV[i].radius;
        const r = Math.max(rH, rV); // use larger radius for conservative spacing
        const dz = rawH[i + 1].z - rawH[i].z;
        const drH = rawH[i + 1].radius - rawH[i].radius;
        const drV = rawV[i + 1].radius - rawV[i].radius;

        // Primary: inverse radius → matches angular element size
        const radiusWeight = r > 1e-6 ? rMin / r : 1;

        // Secondary: max curvature of both profiles
        const curvH = dz > 1e-9 ? Math.abs(drH / dz) : 0;
        const curvV = dz > 1e-9 ? Math.abs(drV / dz) : 0;
        const curvatureBoost = Math.min(Math.max(curvH, curvV) * 0.3, 1.0);

        weights[i] = radiusWeight + curvatureBoost;
    }

    const mouthZoneLen = Math.max(2, Math.min(totalLength * 0.02, 10));
    const mouthZoneStart = totalLength - mouthZoneLen;

    for (let i = 0; i < oversampleN; i++) {
        const z = rawH[i].z;
        if (z >= mouthZoneStart) {
            const t = (z - mouthZoneStart) / mouthZoneLen;
            weights[i] *= 1 + t * t;
        }
    }

    // Cumulative distribution
    const cumWeights = new Float64Array(oversampleN + 1);
    for (let i = 0; i < oversampleN; i++) {
        cumWeights[i + 1] = cumWeights[i] + weights[i];
    }
    const totalWeight = cumWeights[oversampleN];

    // Place points at shared Z positions using inverse CDF
    const profileH = [];
    const profileV = [];

    // First point
    profileH.push({ point: new THREE.Vector2(rawH[0].radius, 0), rawRadius: rawH[0].radius, isValid: true });
    profileV.push({ point: new THREE.Vector2(rawV[0].radius, 0), rawRadius: rawV[0].radius, isValid: true });

    for (let k = 1; k < targetPointCount - 1; k++) {
        const targetCum = (k / (targetPointCount - 1)) * totalWeight;

        let lo = 0, hi = oversampleN;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cumWeights[mid + 1] < targetCum) lo = mid + 1;
            else hi = mid;
        }

        const idx = Math.min(lo, oversampleN - 1);
        const segWeight = cumWeights[idx + 1] - cumWeights[idx];
        const frac = segWeight > 1e-12 ? (targetCum - cumWeights[idx]) / segWeight : 0;

        const z = rawH[idx].z + frac * (rawH[idx + 1].z - rawH[idx].z);
        const rH = rawH[idx].radius + frac * (rawH[idx + 1].radius - rawH[idx].radius);
        const rV = rawV[idx].radius + frac * (rawV[idx + 1].radius - rawV[idx].radius);

        const prevH = profileH[profileH.length - 1].rawRadius;
        const prevV = profileV[profileV.length - 1].rawRadius;

        profileH.push({ point: new THREE.Vector2(rH, z), rawRadius: rH, isValid: rH >= prevH - 1e-6 });
        profileV.push({ point: new THREE.Vector2(rV, z), rawRadius: rV, isValid: rV >= prevV - 1e-6 });
    }

    // Last point
    const lastH = rawH[rawH.length - 1];
    const lastV = rawV[rawV.length - 1];
    const prevH = profileH[profileH.length - 1].rawRadius;
    const prevV = profileV[profileV.length - 1].rawRadius;
    profileH.push({ point: new THREE.Vector2(lastH.radius, totalLength), rawRadius: lastH.radius, isValid: lastH.radius >= prevH - 1e-6 });
    profileV.push({ point: new THREE.Vector2(lastV.radius, totalLength), rawRadius: lastV.radius, isValid: lastV.radius >= prevV - 1e-6 });

    return { profileH, profileV };
}

function generateSingleProfile(config, segments) {
    const totalLength = segments.reduce((acc, seg) => acc + seg.length, 0);
    if (totalLength <= 0) return [];

    const targetPointCount = Math.max(5, config.pointsPerSegment);
    const r0 = config.dIn / 2;

    // --- Phase 1: Oversample the profile uniformly (high resolution) ---
    const oversampleN = Math.max(500, targetPointCount * 10);
    const rawProfile = computeRawProfile(r0, segments, totalLength, oversampleN);

    // Apply throat angle correction for non-OS-SE laws (OS-SE has native t param)
    if (config.throatAngle && config.throatAngle.enabled && config.throatAngle.angle > 0
        && segments[0].law !== 'OS-SE') {
        applyThroatAngleShift(rawProfile, segments, r0, config.throatAngle.angle, totalLength);
    }

    if (rawProfile.length < 2) {
        return [{ point: new THREE.Vector2(r0, 0), rawRadius: r0, isValid: true }];
    }

    // --- Phase 2: Compute adaptive weights for BEM-quality aspect ratios ---
    // Key insight: angular spacing ∝ circumference ∝ radius.
    // To keep aspect ratio ≈ 1, axial spacing should also ∝ radius.
    // So weight ∝ 1/radius → more axial points where sections are small (throat)
    // and fewer where sections are large (mouth, where angular spacing is also large).
    const weights = new Float64Array(oversampleN);
    const rMin = rawProfile[0].radius;
    const rMax = rawProfile[rawProfile.length - 1].radius;

    for (let i = 0; i < oversampleN; i++) {
        const r = rawProfile[i].radius;
        const dz = rawProfile[i + 1].z - rawProfile[i].z;
        const dr = rawProfile[i + 1].radius - rawProfile[i].radius;

        // Primary: inverse radius weighting → matches angular element size
        const radiusWeight = r > 1e-6 ? rMin / r : 1;

        // Secondary: curvature-based (shape fidelity), capped contribution
        const curvature = dz > 1e-9 ? Math.abs(dr / dz) : 0;
        const curvatureBoost = Math.min(curvature * 0.3, 1.0);

        weights[i] = radiusWeight + curvatureBoost;
    }

    // Gentle mouth boost: just 2x at the very end (for the termination edge)
    const mouthZoneLen = Math.max(2, Math.min(totalLength * 0.02, 10));
    const mouthZoneStart = totalLength - mouthZoneLen;
    for (let i = 0; i < oversampleN; i++) {
        const z = rawProfile[i].z;
        if (z >= mouthZoneStart) {
            const t = (z - mouthZoneStart) / mouthZoneLen;
            weights[i] *= 1 + t * t; // gentle quadratic → max 2x at mouth tip
        }
    }

    // --- Phase 3: Build cumulative weight distribution ---
    const cumWeights = new Float64Array(oversampleN + 1);
    for (let i = 0; i < oversampleN; i++) {
        cumWeights[i + 1] = cumWeights[i] + weights[i];
    }
    const totalWeight = cumWeights[oversampleN];

    // --- Phase 4: Place target points using inverse CDF ---
    const profileData = [];

    // First point: always at z=0
    profileData.push({
        point: new THREE.Vector2(rawProfile[0].radius, 0),
        rawRadius: rawProfile[0].radius,
        isValid: true
    });

    for (let k = 1; k < targetPointCount - 1; k++) {
        const targetCum = (k / (targetPointCount - 1)) * totalWeight;

        // Binary search for the interval containing targetCum
        let lo = 0, hi = oversampleN;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cumWeights[mid + 1] < targetCum) lo = mid + 1;
            else hi = mid;
        }

        const idx = Math.min(lo, oversampleN - 1);
        const segWeight = cumWeights[idx + 1] - cumWeights[idx];
        const frac = segWeight > 1e-12 ? (targetCum - cumWeights[idx]) / segWeight : 0;

        const z = rawProfile[idx].z + frac * (rawProfile[idx + 1].z - rawProfile[idx].z);
        const radius = rawProfile[idx].radius + frac * (rawProfile[idx + 1].radius - rawProfile[idx].radius);
        const prevRadius = profileData[profileData.length - 1].rawRadius;

        profileData.push({
            point: new THREE.Vector2(radius, z),
            rawRadius: radius,
            isValid: radius >= prevRadius - 1e-6
        });
    }

    // Last point: always exactly at z=totalLength
    const lastRaw = rawProfile[rawProfile.length - 1];
    const prevRadius = profileData[profileData.length - 1].rawRadius;
    profileData.push({
        point: new THREE.Vector2(lastRaw.radius, totalLength),
        rawRadius: lastRaw.radius,
        isValid: lastRaw.radius >= prevRadius - 1e-6
    });

    return profileData;
}

/**
 * Apply throat exit angle by z-shift of the natural expansion curve.
 *
 * Acoustically correct method (cf. ATH4 / Mabat): rather than ADDING a
 * correction that fades back to the natural slope (which makes dr/dz decrease
 * → concave horn), we EVALUATE the natural law on a translated z-window:
 *
 *     r(z) = r_nat(z + z*) - r_nat(z*) + r0
 *
 * where z* is chosen so that r_nat'(z*) = tan(throatAngle). The resulting
 * profile then satisfies:
 *   - r(0)  = r0                (throat radius preserved)
 *   - r'(0) = tan(throatAngle)  (exact throat angle)
 *   - r''(z) = r_nat''(z + z*)  (curvature is unchanged from the natural law)
 *
 * Since the underlying expansion laws (Bessel b≥1, Hypex, Exponential, OS,
 * Parabolic) are convex (r'' ≥ 0) on their domain, the corrected horn is
 * convex everywhere → no acoustic concavity, no spurious reflections.
 *
 * z* is found by bisection on r_nat'(z*) − tan(angle) over a wide bracket,
 * with a sampling fallback when the slope is non-monotonic or out of range.
 */
function applyThroatAngleShift(rawProfile, segments, r0, throatAngleDeg, totalLength) {
    if (!throatAngleDeg || rawProfile.length < 2 || totalLength <= 0) return;
    if (!segments || segments.length !== 1) return; // current UI is single-segment
    const seg = segments[0];
    const formula = Formulas.expansionLaws[seg.law]?.formula;
    if (!formula) return;

    const baseOpts = { ...seg.opts, r0, L: seg.length };
    const targetSlope = Math.tan(throatAngleDeg * (Math.PI / 180));

    const dzEps = Math.max(1e-5, totalLength * 1e-5);
    const slopeAt = (z) => {
        const r1 = formula(z, seg.length, baseOpts);
        const r2 = formula(z + dzEps, seg.length, baseOpts);
        if (isNaN(r1) || isNaN(r2)) return NaN;
        return (r2 - r1) / dzEps;
    };

    const slope0 = slopeAt(0);
    if (!isFinite(slope0) || Math.abs(slope0 - targetSlope) < 1e-7) return;

    // Bracket: convex laws have monotonically increasing slope, so search
    // backward (negative z*) when target < slope0 and forward when target > slope0.
    let zLo, zHi;
    if (targetSlope > slope0) {
        zLo = 0;
        zHi = totalLength * 5;
        // Expand if not bracketed
        for (let k = 0; k < 8 && slopeAt(zHi) < targetSlope; k++) zHi *= 2;
    } else {
        zHi = 0;
        zLo = -totalLength * 0.5;
        for (let k = 0; k < 8 && slopeAt(zLo) > targetSlope; k++) zLo *= 2;
    }

    let sLo = slopeAt(zLo);
    let sHi = slopeAt(zHi);

    let zOffset;
    if (!isFinite(sLo) || !isFinite(sHi) || (sLo - targetSlope) * (sHi - targetSlope) > 0) {
        // Fallback: dense sampling over [-L/2, 5L]
        const N = 400;
        const zMin = -totalLength * 0.5;
        const zMax = totalLength * 5;
        let bestZ = 0, bestDiff = Math.abs(slope0 - targetSlope);
        for (let i = 0; i <= N; i++) {
            const zi = zMin + (zMax - zMin) * i / N;
            const si = slopeAt(zi);
            if (!isFinite(si)) continue;
            const d = Math.abs(si - targetSlope);
            if (d < bestDiff) { bestDiff = d; bestZ = zi; }
        }
        zOffset = bestZ;
    } else {
        for (let iter = 0; iter < 80; iter++) {
            const zMid = 0.5 * (zLo + zHi);
            const sMid = slopeAt(zMid);
            if (!isFinite(sMid)) break;
            if ((sLo - targetSlope) * (sMid - targetSlope) <= 0) {
                zHi = zMid; sHi = sMid;
            } else {
                zLo = zMid; sLo = sMid;
            }
            if (Math.abs(zHi - zLo) < 1e-9 * Math.max(1, totalLength)) break;
        }
        zOffset = 0.5 * (zLo + zHi);
    }

    const rAtOffset = formula(zOffset, seg.length, baseOpts);
    if (!isFinite(rAtOffset)) return;

    // First pass: write the z-shifted profile.
    for (let i = 0; i < rawProfile.length; i++) {
        const z = rawProfile[i].z;
        const rShifted = formula(z + zOffset, seg.length, baseOpts);
        if (!isNaN(rShifted) && isFinite(rShifted)) {
            let r = rShifted - rAtOffset + r0;
            if (r < r0) r = r0;
            rawProfile[i].radius = r;
        }
    }

    // Residual slope correction: laws whose slope is independent of z (Bessel
    // with b=1, Parabolic, OS at z=0) can't be matched by z-shift alone — the
    // slope after shifting is still wrong. We close the gap with a LINEAR
    // ramp Δ·z. Since adding a linear function does not change r''(z), the
    // profile remains convex (no concavity introduced).
    const dzS = Math.max(1e-5, totalLength * 1e-5);
    const r1 = formula(zOffset, seg.length, baseOpts);
    const r2 = formula(zOffset + dzS, seg.length, baseOpts);
    const achievedSlope = (isFinite(r1) && isFinite(r2)) ? (r2 - r1) / dzS : NaN;
    if (isFinite(achievedSlope)) {
        const residual = targetSlope - achievedSlope;
        if (Math.abs(residual) > 1e-6) {
            for (let i = 0; i < rawProfile.length; i++) {
                let r = rawProfile[i].radius + residual * rawProfile[i].z;
                if (r < r0) r = r0;
                rawProfile[i].radius = r;
            }
            // If residual is negative, ensure final monotonicity (clamp any
            // descending step to the previous radius).
            if (residual < 0) {
                for (let i = 1; i < rawProfile.length; i++) {
                    if (rawProfile[i].radius < rawProfile[i - 1].radius) {
                        rawProfile[i].radius = rawProfile[i - 1].radius;
                    }
                }
            }
        }
    }
}

/**
 * Compute an oversampled profile at uniform z-spacing for curvature analysis.
 */
function computeRawProfile(r0, segments, totalLength, numPoints) {
    const raw = [];
    const step = totalLength / numPoints;

    // Pre-compute segment start positions and radii
    const segStarts = [{ z: 0, radius: r0 }];
    for (let s = 0; s < segments.length; s++) {
        const prev = segStarts[s];
        const seg = segments[s];
        const formula = Formulas.expansionLaws[seg.law]?.formula;
        if (!formula) break;
        const opts = { ...seg.opts, r0: prev.radius, L: seg.length };
        const endRadius = formula(seg.length, seg.length, opts);
        segStarts.push({ z: prev.z + seg.length, radius: isNaN(endRadius) ? prev.radius : endRadius });
    }

    raw.push({ z: 0, radius: r0 });

    for (let i = 1; i <= numPoints; i++) {
        const z = Math.min(i * step, totalLength);

        // Find which segment this z belongs to
        let segIdx = 0;
        for (let s = 0; s < segments.length - 1; s++) {
            if (z > segStarts[s + 1].z + 1e-9) segIdx = s + 1;
            else break;
        }

        const localZ = z - segStarts[segIdx].z;
        const seg = segments[segIdx];
        const formula = Formulas.expansionLaws[seg.law]?.formula;
        if (!formula) { raw.push({ z, radius: raw[raw.length - 1].radius }); continue; }

        const opts = { ...seg.opts, r0: segStarts[segIdx].radius, L: seg.length };
        const radius = formula(localZ, seg.length, opts);

        raw.push({ z, radius: isNaN(radius) ? raw[raw.length - 1].radius : radius });
    }

    return raw;
}

/**
 * Build an analytic adapter-radius function for one axis.
 *
 * The adapter is a transition between the throat (slope m0 at z=0) and the
 * entry of the main horn (slope m1 at z=L). The chosen "expansion law" only
 * affects the SHAPE of how the slope transitions from m0 to m1:
 *
 *   - Linear: linear slope ramp m(t) = m0 + (m1-m0)·t
 *             ⇒ r(z) = r0 + L·[m0·u + (m1-m0)·u²/2]                    (G1)
 *
 *   - OS:     smoothstep slope ramp m(t) = m0 + (m1-m0)·(3t² − 2t³)
 *             ⇒ r(z) = r0 + L·[m0·u + (m1-m0)·(u³ − u⁴/2)]            (G2)
 *
 *   - Bessel: power-½ slope ramp m(t) = m0 + (m1-m0)·√t
 *             ⇒ r(z) = r0 + L·[m0·u + (m1-m0)·(2/3)·u^1.5]            (G1)
 *
 * In all three, r(0)=r0, r'(0)=tan(throatAngle), r'(L)=tan(thetaAxis).
 * "OS" gives G2 continuity at BOTH endpoints (no curvature jump) → minimal
 * acoustic impedance discontinuity at adapter↔main junction.
 */
function buildAdapterRadiusFn(law, m0, m1, r0, L) {
    const dm = m1 - m0;
    if (law === 'OS') {
        return (z) => {
            const u = z / L;
            return r0 + L * (m0 * u + dm * (u * u * u - 0.5 * u * u * u * u));
        };
    }
    if (law === 'Bessel') {
        return (z) => {
            const u = Math.max(0, z / L);
            return r0 + L * (m0 * u + dm * (2 / 3) * Math.pow(u, 1.5));
        };
    }
    // Linear (default)
    return (z) => {
        const u = z / L;
        return r0 + L * (m0 * u + dm * 0.5 * u * u);
    };
}

/**
 * Solve for the z-shift that makes a natural expansion law have the requested
 * slope at z=0. Returns { zOffset, rAtOffset, residualSlope }. The residual
 * accounts for laws whose slope is constant w.r.t. z (Bessel b=1, Parabolic).
 *
 *     r_shifted(z) = r_nat(z + zOffset) − rAtOffset + r0_target
 *                    + residualSlope · z         ← linear correction (Δr''=0)
 */
function findSlopeShift(formula, segLength, baseOpts, targetSlope, totalLength) {
    const r0t = baseOpts.r0;
    const dzEps = Math.max(1e-5, totalLength * 1e-5);
    const slopeAt = (z) => {
        const r1 = formula(z, segLength, baseOpts);
        const r2 = formula(z + dzEps, segLength, baseOpts);
        if (isNaN(r1) || isNaN(r2)) return NaN;
        return (r2 - r1) / dzEps;
    };
    const slope0 = slopeAt(0);
    if (!isFinite(slope0)) return { zOffset: 0, rAtOffset: r0t, residualSlope: 0 };
    if (Math.abs(slope0 - targetSlope) < 1e-7) {
        return { zOffset: 0, rAtOffset: r0t, residualSlope: 0 };
    }

    let zLo, zHi;
    if (targetSlope > slope0) {
        zLo = 0; zHi = totalLength * 5;
        for (let k = 0; k < 8 && slopeAt(zHi) < targetSlope; k++) zHi *= 2;
    } else {
        zHi = 0; zLo = -totalLength * 0.5;
        for (let k = 0; k < 8 && slopeAt(zLo) > targetSlope; k++) zLo *= 2;
    }
    let sLo = slopeAt(zLo);
    let sHi = slopeAt(zHi);
    let zOffset;
    if (!isFinite(sLo) || !isFinite(sHi) || (sLo - targetSlope) * (sHi - targetSlope) > 0) {
        const N = 400;
        const zMin = -totalLength * 0.5;
        const zMax = totalLength * 5;
        let bestZ = 0, bestDiff = Math.abs(slope0 - targetSlope);
        for (let i = 0; i <= N; i++) {
            const zi = zMin + (zMax - zMin) * i / N;
            const si = slopeAt(zi);
            if (!isFinite(si)) continue;
            const d = Math.abs(si - targetSlope);
            if (d < bestDiff) { bestDiff = d; bestZ = zi; }
        }
        zOffset = bestZ;
    } else {
        for (let iter = 0; iter < 80; iter++) {
            const zMid = 0.5 * (zLo + zHi);
            const sMid = slopeAt(zMid);
            if (!isFinite(sMid)) break;
            if ((sLo - targetSlope) * (sMid - targetSlope) <= 0) { zHi = zMid; sHi = sMid; }
            else { zLo = zMid; sLo = sMid; }
            if (Math.abs(zHi - zLo) < 1e-9 * Math.max(1, totalLength)) break;
        }
        zOffset = 0.5 * (zLo + zHi);
    }
    const rAtOffset = formula(zOffset, segLength, baseOpts);
    if (!isFinite(rAtOffset)) return { zOffset: 0, rAtOffset: r0t, residualSlope: 0 };

    const r1 = formula(zOffset, segLength, baseOpts);
    const r2 = formula(zOffset + dzEps, segLength, baseOpts);
    const achieved = (isFinite(r1) && isFinite(r2)) ? (r2 - r1) / dzEps : NaN;
    const residualSlope = isFinite(achieved) ? (targetSlope - achieved) : 0;
    return { zOffset, rAtOffset, residualSlope };
}

/**
 * Build the oversampled raw profile for ONE axis when a Throat Adapter is
 * present. Anatomy of the resulting profile (z ∈ [0, totalLength]):
 *
 *   z ∈ [0, L_ad]                : analytic adapter (buildAdapterRadiusFn)
 *   z ∈ [L_ad, L_ad + L_main_i]  : main horn law slope-shifted so that
 *                                  r_main'(0_main) = adapter end slope
 *                                  ⇒ C¹ continuity at the junction
 *
 * The adapter's own G2 continuity (when law="OS") plus the main-horn z-shift
 * (curvature-preserving translation of the natural law) keeps the curvature
 * jump at the junction within the curvature of the natural main law itself —
 * acoustically equivalent to ATH4-style throat morphing.
 */
function computeRawProfileWithAdapter(r0, adapter, thetaEndDeg, mainSegments,
                                      throatAngleDeg, totalLength, numPoints) {
    const L_ad = adapter.length;
    const m0 = Math.tan(throatAngleDeg * (Math.PI / 180));
    const m1 = Math.tan(thetaEndDeg * (Math.PI / 180));
    const adapterRfn = buildAdapterRadiusFn(adapter.law, m0, m1, r0, L_ad);
    const r_endAdapter = adapterRfn(L_ad);

    // Pre-compute segment-start positions for the MAIN horn (z relative to L_ad)
    const mainStarts = [{ z: 0, radius: r_endAdapter }];
    for (let s = 0; s < mainSegments.length; s++) {
        const prev = mainStarts[s];
        const seg = mainSegments[s];
        const formula = Formulas.expansionLaws[seg.law]?.formula;
        if (!formula) break;
        const opts = { ...seg.opts, r0: prev.radius, L: seg.length };
        const endR = formula(seg.length, seg.length, opts);
        mainStarts.push({ z: prev.z + seg.length, radius: isNaN(endR) ? prev.radius : endR });
    }

    // Slope-shift parameters for the FIRST main segment so that its slope at
    // its local z=0 equals m1 (continuity with adapter).
    let firstShift = { zOffset: 0, rAtOffset: r_endAdapter, residualSlope: 0 };
    let firstOpts = null;
    const firstMain = mainSegments[0];
    const formula0 = Formulas.expansionLaws[firstMain && firstMain.law]?.formula;
    if (formula0 && firstMain.law !== 'OS-SE') {
        firstOpts = { ...firstMain.opts, r0: r_endAdapter, L: firstMain.length };
        firstShift = findSlopeShift(formula0, firstMain.length, firstOpts, m1, totalLength);
    } else if (firstMain && firstMain.law === 'OS-SE') {
        // OS-SE has a native throat-tangent parameter 't'. Set it to thetaEnd.
        firstOpts = { ...firstMain.opts, r0: r_endAdapter, L: firstMain.length, t: thetaEndDeg };
    }

    const step = totalLength / numPoints;
    const raw = [{ z: 0, radius: r0 }];
    for (let i = 1; i <= numPoints; i++) {
        const z = Math.min(i * step, totalLength);
        let r;
        if (z <= L_ad) {
            r = adapterRfn(z);
        } else {
            const zMain = z - L_ad;
            // Locate main segment
            let segIdx = 0;
            for (let s = 0; s < mainSegments.length - 1; s++) {
                if (zMain > mainStarts[s + 1].z + 1e-9) segIdx = s + 1;
                else break;
            }
            const seg = mainSegments[segIdx];
            const formula = Formulas.expansionLaws[seg.law]?.formula;
            const localZ = zMain - mainStarts[segIdx].z;
            if (!formula) {
                r = raw[raw.length - 1].radius;
            } else if (segIdx === 0 && formula0) {
                if (firstMain.law === 'OS-SE') {
                    r = formula(localZ, seg.length, firstOpts);
                } else {
                    const rShifted = formula(localZ + firstShift.zOffset, seg.length, firstOpts);
                    r = isFinite(rShifted)
                        ? (rShifted - firstShift.rAtOffset + r_endAdapter
                           + firstShift.residualSlope * localZ)
                        : raw[raw.length - 1].radius;
                }
            } else {
                const opts = { ...seg.opts, r0: mainStarts[segIdx].radius, L: seg.length };
                r = formula(localZ, seg.length, opts);
            }
            if (!isFinite(r) || isNaN(r)) r = raw[raw.length - 1].radius;
        }
        // Monotonicity safety
        if (r < raw[raw.length - 1].radius) r = raw[raw.length - 1].radius;
        raw.push({ z, radius: r });
    }
    return raw;
}
