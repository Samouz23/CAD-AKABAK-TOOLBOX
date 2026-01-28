// ====================================================================================================
// FICHIER :  src/js/panels/waveguidestudio/profileGenerator.js
// RÔLE :     Génération du profil du waveguide et récupération de la configuration depuis l'UI.
// ====================================================================================================

import * as THREE from '../../lib/three.module.js';
import * as Formulas from './Formulas.js';

export function getConfigFromUI(dom) {
    const inputShape = dom.root.querySelector('#wg-input-shape').value;
    let throatWidth = 0, throatHeight = 0, throatDiameter = 25.4;

    if (inputShape === 'circle') {
      throatDiameter = parseFloat(dom.root.querySelector('#wg-d-in-circle').value) || 25.4;
    } else if (inputShape === 'rectangle') {
      throatWidth  = parseFloat(dom.root.querySelector('#wg-d-in-rect-w').value) || 20;
      throatHeight = parseFloat(dom.root.querySelector('#wg-d-in-rect-h').value) || 10;
      // On conserve la compat. interne en utilisant un Ø équivalent surface
      throatDiameter = 2 * Math.sqrt((throatWidth * throatHeight) / Math.PI);
    }

    const config = {
      // ↓ garde dIn pour le profil axial (rayon initial)
      dIn: throatDiameter,
      inputShape,
      throatWidth,
      throatHeight,

      numLines: parseInt(dom.wgLines.value) || 48,
      pointsPerSegment: parseInt(dom.wgPoints.value) || 20,
      sourceAngularPoints: parseInt(dom.wgSourceAngularPoints.value) || parseInt(dom.wgLines.value) || 100,
      sourceAxialPoints: parseInt(dom.wgSourceAxialPoints.value) || 5,
      interfaceAngularPoints: parseInt(dom.wgInterfaceAngularPoints.value) || parseInt(dom.wgLines.value) || 100,
      interfaceAxialPoints: parseInt(dom.wgInterfaceAxialPoints.value) || 10,
      segmentCount: parseInt(dom.wgSegmentCount.value),
      segments: [],
      useShapeControl: dom.wgShapeSwitch.checked,
      shapeLength: parseFloat(dom.wgShapeLength.value) || 40,
      outputShape: dom.wgOutputShape.value,
      outputRoundedRectRadius: parseFloat(dom.root.querySelector('#wg-d-out-rounded-rect-r').value) || 0,
      superformula: {
        m: parseFloat(dom.sfM.value) || 0, a: parseFloat(dom.sfA.value) || 1, b: parseFloat(dom.sfB.value) || 1,
        n1: parseFloat(dom.sfN1.value) || 1, n2: parseFloat(dom.sfN2.value) || 1, n3: parseFloat(dom.sfN3.value) || 1,
        amplitude: (parseFloat(dom.sfAmplitude.value) || 0) / 100.0,
      },
      throatMeshFactor: parseFloat(dom.wgThroatMeshFactor.value) || 0,
      mouthMeshFactor: parseFloat(dom.wgMouthMeshFactor.value) || 0,
      split: { horizontal: dom.wgSplitHorizontal.checked, vertical: dom.wgSplitVertical.checked },
      interface: {
        tipOffset: parseFloat(dom.interfaceTipOffset.value) || 30,
        bulgeRadius: parseFloat(dom.interfaceBulgeRadius.value) || 20,
        bulgeZ: parseFloat(dom.interfaceBulgeZ.value) || 10,
      }
    };

    for (let i = 1; i <= config.segmentCount; i++) {
        const isMulti = config.segmentCount === 2;
        const lawSelector = `#wg-expansion-law-${isMulti ? '2-' : ''}${i}`;
        const lengthSelector = `#wg-length-${isMulti ? '2-' : ''}${i}`;
        const law = dom.root.querySelector(lawSelector).value;
        const length = parseFloat(dom.root.querySelector(lengthSelector).value) || 100;
        const opts = {};

        if (law === 'OS-SE') ['k', 'a', 's', 'q', 'n'].forEach(p => { opts[p] = parseFloat(dom.root.querySelector(`#wg-os-se-${p}-${i}`).value); });
        else if (law === 'OS') opts.theta = parseFloat(dom.root.querySelector(`#wg-os-theta-${i}`).value) || 0;
        else if (law === 'Conical') opts.theta = parseFloat(dom.root.querySelector(`#wg-conical-theta-${i}`).value) || 0;
        else if (['Exponential', 'Parabolic'].includes(law)) opts.fc = parseFloat(dom.root.querySelector(`#wg-${law.toLowerCase()}-fc-${i}`).value) || 400;
        else if (law === 'Hypex') { opts.fc = parseFloat(dom.root.querySelector(`#wg-hypex-fc-${i}`).value) || 400; opts.T = parseFloat(dom.root.querySelector(`#wg-hypex-t-${i}`).value) || 1.0; }
        config.segments.push({ law, length, opts });
    }
    return config;
}

export function createProfileData(config) {
    const profileData = [];
    const totalLength = config.segments.reduce((acc, seg) => acc + seg.length, 0);
    if (totalLength <= 0) return [];
    
    const THROAT_MESH_DISTANCE = 20, MOUTH_MESH_DISTANCE = 20;
    const throatMultiplier = (config.throatMeshFactor > 0) ? (config.throatMeshFactor * 2) : 1;
    const mouthMultiplier = (config.mouthMeshFactor > 0) ? (config.mouthMeshFactor * 2) : 1;
    const baseZStep = totalLength / (config.pointsPerSegment * config.segmentCount);

    let currentAbsoluteZ = 0, currentSegmentIndex = 0, currentSegmentLocalZ = 0;
    let segmentStartRadius = config.dIn / 2;

    profileData.push({ point: new THREE.Vector2(segmentStartRadius, 0), rawRadius: segmentStartRadius, isValid: true });

    while (currentAbsoluteZ < totalLength - 1e-6) {
        const currentSegment = config.segments[currentSegmentIndex];
        if (!currentSegment) break;
        const formula = Formulas.expansionLaws[currentSegment.law]?.formula;
        if (!formula) break;
        
        let effectiveZStep = baseZStep;
        if (currentAbsoluteZ < THROAT_MESH_DISTANCE) effectiveZStep /= throatMultiplier;
        if (currentAbsoluteZ > totalLength - MOUTH_MESH_DISTANCE) effectiveZStep /= mouthMultiplier;
        
        const remainingInCurrentSegment = currentSegment.length - currentSegmentLocalZ;
        const remainingInTotalLength = totalLength - currentAbsoluteZ;
        let step = Math.min(effectiveZStep, remainingInCurrentSegment, remainingInTotalLength);
        if (step <= 1e-6) break;
        
        const nextAbsoluteZ = currentAbsoluteZ + step;
        const nextSegmentLocalZ = currentSegmentLocalZ + step;
        
        const opts = { ...currentSegment.opts, r0: segmentStartRadius, L: currentSegment.length };
        const rawComputedRadius = formula(nextSegmentLocalZ, currentSegment.length, opts);
        const lastRawRadius = profileData[profileData.length - 1].rawRadius;
        const isValid = rawComputedRadius >= lastRawRadius - 1e-6;
        
        profileData.push({ point: new THREE.Vector2(rawComputedRadius, nextAbsoluteZ), rawRadius: rawComputedRadius, isValid: isValid });
        
        currentAbsoluteZ = nextAbsoluteZ;
        currentSegmentLocalZ = nextSegmentLocalZ;

        if (currentSegmentLocalZ >= currentSegment.length - 1e-6 && currentSegmentIndex < config.segments.length - 1) {
            currentSegmentIndex++;
            currentSegmentLocalZ = 0;
            segmentStartRadius = rawComputedRadius;
        }
    }
    
    if (profileData.length > 0 && Math.abs(profileData[profileData.length - 1].point.y - totalLength) > 1e-6) {
        const lastSegment = config.segments[config.segments.length - 1];
        const formula = Formulas.expansionLaws[lastSegment.law]?.formula;
        const opts = { ...lastSegment.opts, r0: segmentStartRadius, L: lastSegment.length };
        const rawComputedRadius = formula(lastSegment.length, lastSegment.length, opts);
        const isValid = rawComputedRadius >= profileData[profileData.length - 1].rawRadius - 1e-6;
        profileData.push({ point: new THREE.Vector2(rawComputedRadius, totalLength), rawRadius: rawComputedRadius, isValid: isValid });
    }
    return profileData;
}
