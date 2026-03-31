// ====================================================================================================
// FICHIER :  src/js/panels/Akabak_Lem/segmentTypes.js
// RÔLE    :  Définitions des types de segments (Duct, Waveguide, Enclosure) avec colonnes
//            adaptatives, valeurs par défaut et templates de formules pour le panneau Akabak LEM.
// ====================================================================================================

export const SEGMENT_TYPES = {
  duct: {
    label: 'Duct',
    columns: [
      { key: 'WD',  label: 'Width',  unitLabel: 'dim', suffix: 'mm' },
      { key: 'HD',  label: 'Height', unitLabel: 'dim', suffix: 'mm' },
      { key: 'Len', label: 'Length', unitLabel: 'dim', suffix: 'mm' },
      { key: 'VF',  label: 'VF',     unitLabel: null,  suffix: 'L' },
    ],
    defaults: { WD: '', HD: '', Len: '', VF: '' },
    formulaTemplate: 'WD  = @{prefix}{i}\nHD  = @H\nLen = @{lenPrefix}{i}\neta = @WOOD',
    blobType: 'duct',
  },

  waveguide: {
    label: 'Waveguide',
    columns: [
      { key: 'WTh', label: 'W Throat', unitLabel: 'dim', suffix: 'mm' },
      { key: 'WMo', label: 'W Mouth',  unitLabel: 'dim', suffix: 'mm' },
      { key: 'Len', label: 'Length',    unitLabel: 'dim', suffix: 'mm' },
      { key: 'VF',  label: 'VF',       unitLabel: null,  suffix: 'L' },
    ],
    // Column order priority for canonical ordering (lower = earlier)
    columnOrder: 20,
    defaults: { WTh: '', WMo: '', Len: '', T: '', VF: '' },
    formulaTemplate: 'HTh = @H\nHMo = @H\nWTh = @{prefix}{i}\nWMo = @{prefix}{i+1}\nLen = @{lenPrefix}{i}\nT   = @{tPrefix}{i}',
    blobType: 'waveguide',
  },

  enclosure: {
    label: 'Enclosure',
    columns: [
      { key: 'VB',     label: 'Volume',  unitLabel: null,  suffix: 'L' },
      { key: 'LenCab', label: 'Depth',   unitLabel: 'dim', suffix: 'mm' },
    ],
    subTypeKey: 'ventedMode',
    subTypes: {
      sealed: {
        extraColumns: [],
        formulaTemplate: 'Vb   = @Vb{i}\nLb   = @Lb{i}\netab = @WOOD',
      },
      vented: {
        extraColumns: [
          { key: 'portLen', label: 'Port Len', unitLabel: 'dim', suffix: 'mm' },
        ],
        portShapes: {
          circle: {
            columns: [
              { key: 'portDD', label: 'Port Ø', unitLabel: 'dim', suffix: 'mm' },
            ],
          },
          rectangle: {
            columns: [
              { key: 'portWD', label: 'Port W', unitLabel: 'dim', suffix: 'mm' },
              { key: 'portHD', label: 'Port H', unitLabel: 'dim', suffix: 'mm' },
            ],
          },
        },
        formulaTemplate: 'Vb   = @Vb{i}\nLb   = @Lb{i}\nLen  = @PortLen{i}\n{portFormula}\netab = @WOOD\netav = @WOOD',
      },
    },
    defaults: { VB: '', LenCab: '', ventedMode: 'sealed', portShape: 'circle', portLen: '', portDD: '', portWD: '', portHD: '' },
    blobType: 'encl',
  },
};

/** Get all columns for a segment (including enclosure sub-type columns) */
export function getColumnsForSegment(segment, options = {}) {
  const type = SEGMENT_TYPES[segment.type];
  if (!type) return [];

  let cols = [...type.columns];

  // Hide WTh/WMo when all waveguides in the wave are between ducts
  if (segment.type === 'waveguide' && options.hideThroatMouth) {
    cols = cols.filter(c => c.key !== 'WTh' && c.key !== 'WMo');
  }

  if (segment.type === 'enclosure') {
    const mode = segment.params.ventedMode || 'sealed';
    const subType = type.subTypes[mode];
    if (subType.extraColumns) cols = [...cols, ...subType.extraColumns];
    if (mode === 'vented') {
      const shape = segment.params.portShape || 'circle';
      const shapeCols = subType.portShapes[shape]?.columns || [];
      cols = [...cols, ...shapeCols];
    }
  }

  return cols;
}

/** Generate a formula string for a segment at given index */
export function generateSegmentFormula(segment, index) {
  const type = SEGMENT_TYPES[segment.type];
  if (!type) return '';

  if (segment.type === 'enclosure') {
    const mode = segment.params.ventedMode || 'sealed';
    const subType = type.subTypes[mode];
    let formula = subType.formulaTemplate;
    formula = formula.replace(/{i}/g, String(index));

    if (mode === 'vented') {
      const shape = segment.params.portShape || 'circle';
      let portFormula = '';
      if (shape === 'circle') {
        portFormula = `dD   = @dD${index}`;
      } else {
        portFormula = `WD   = @wDP${index}\nHD   = @hDP${index}`;
      }
      formula = formula.replace('{portFormula}', portFormula);
    }

    return formula;
  }

  let formula = type.formulaTemplate;
  formula = formula
    .replace(/{prefix}/g, segment.type === 'duct' ? 'D' : 'S')
    .replace(/{lenPrefix}/g, segment.type === 'duct' ? 'DL' : 'L')
    .replace(/{tPrefix}/g, 'T')
    .replace(/{i}/g, String(index))
    .replace(/{i\+1}/g, String(index + 1));

  return formula;
}

/** Create a default segment of given type */
export function createDefaultSegment(type = 'duct') {
  const typeDef = SEGMENT_TYPES[type];
  if (!typeDef) return { type: 'duct', params: { ...SEGMENT_TYPES.duct.defaults } };
  return { type, params: { ...typeDef.defaults } };
}

/**
 * Calculate T-factors (Salmon) for all waveguide segments in a wave.
 * Salmon horn: S(z) = S_th * (cosh(k0·z) + T·sinh(k0·z))²
 * T_i = (η_i − cosh(k0·L_i)) / sinh(k0·L_i)   where η_i = √(S_mo_i / S_th_i)
 * k0 = ln(√(S_mouth_total / S_throat_total)) / L_total
 * Height cancels out in the ratios, so only widths matter.
 */
export function calculateWaveguideTFactors(segments, segmentCount) {
  // Collect waveguide indices
  const wgIndices = [];
  for (let i = 0; i < segmentCount; i++) {
    if (segments[i].type === 'waveguide') wgIndices.push(i);
  }
  if (wgIndices.length === 0) return;

  // Parse dimensions — resolve WTh/WMo from adjacent duct WD when hidden
  const dims = wgIndices.map(idx => {
    let WTh = parseFloat(segments[idx].params.WTh) || 0;
    let WMo = parseFloat(segments[idx].params.WMo) || 0;
    // If WTh/WMo are empty (hidden between-duct columns), use adjacent duct widths
    if (WTh === 0 && idx > 0 && segments[idx - 1].type === 'duct') {
      WTh = parseFloat(segments[idx - 1].params.WD) || 0;
    }
    if (WMo === 0 && idx < segmentCount - 1 && segments[idx + 1].type === 'duct') {
      WMo = parseFloat(segments[idx + 1].params.WD) || 0;
    }
    return { idx, WTh, WMo, Len: parseFloat(segments[idx].params.Len) || 0 };
  });

  const firstWTh = dims[0].WTh;
  const lastWMo = dims[dims.length - 1].WMo;
  const Ltotal = dims.reduce((sum, d) => sum + d.Len, 0);

  let k0 = 0;
  if (firstWTh > 0 && lastWMo > firstWTh && Ltotal > 0) {
    k0 = Math.log(Math.sqrt(lastWMo / firstWTh)) / Ltotal;
  }

  for (const d of dims) {
    let T = 1.0;
    if (d.WTh > 0 && d.WMo > 0 && d.Len > 0 && k0 > 0) {
      const eta = Math.sqrt(d.WMo / d.WTh);
      const k0L = k0 * d.Len;
      const sinhVal = Math.sinh(k0L);
      if (Math.abs(sinhVal) > 1e-10) {
        T = (eta - Math.cosh(k0L)) / sinhVal;
      }
    }
    // Store rounded value (empty string if dimensions incomplete)
    if (d.WTh > 0 && d.WMo > 0 && d.Len > 0) {
      segments[d.idx].params.T = T.toFixed(4);
    } else {
      segments[d.idx].params.T = '';
    }
  }
}

/** Calculate Fb (resonance frequency) for a vented enclosure segment */
export function calculateVentedFb(params) {
  const C_SOUND = 344000; // mm/s
  const Vb_liters = parseFloat(params.VB) || 0;
  const Len_mm = parseFloat(params.portLen) || 0;
  const Vb_mm3 = Vb_liters * 1e6;

  let Av_mm2 = 0;
  const shape = params.portShape || 'circle';
  if (shape === 'circle') {
    const dD = parseFloat(params.portDD) || 0;
    if (dD > 0) Av_mm2 = Math.PI * (dD / 2) ** 2;
  } else {
    const WD = parseFloat(params.portWD) || 0;
    const HD = parseFloat(params.portHD) || 0;
    if (WD > 0 && HD > 0) Av_mm2 = WD * HD;
  }

  if (Vb_mm3 > 0 && Len_mm > 0 && Av_mm2 > 0) {
    const effectiveLen = Len_mm + 0.95 * Math.sqrt(Av_mm2);
    return (C_SOUND / (2 * Math.PI)) * Math.sqrt(Av_mm2 / (Vb_mm3 * effectiveLen));
  }
  return null;
}
