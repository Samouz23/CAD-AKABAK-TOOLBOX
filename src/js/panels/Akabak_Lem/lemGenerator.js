// ====================================================================================================
// FICHIER :  src/js/panels/Akabak_Lem/lemGenerator.js
// RÔLE    :  Construit la configuration JSON pour la génération du fichier LEM binaire (.akp)
//            et communique avec le processus principal via IPC pour appeler le script Python.
// ====================================================================================================

/**
 * Build a complete LEM project configuration from UI state.
 * This config is serialized to JSON and sent to the Python tool via IPC.
 *
 * @param {Object} options
 * @param {Object|null} options.driver - Driver T/S parameters (or null)
 * @param {Array} options.frontWave - Front wave component chain
 * @param {Array} options.backWave  - Back wave component chain
 * @param {Object} options.modules  - Sidebar module values (VF, Source, Filter)
 * @returns {Object} Complete LEM config ready for JSON serialization
 */
export function buildLemProjectConfig({ driver, frontWave, backWave, modules }) {
  const components = [];
  let nextX = 0;
  const GRID_SPACING = 10; // grid units between components

  // ── Driver (always first, centered) ──
  if (driver) {
    components.push({
      type: 'DynDriver',
      name: sanitizeName(driver.name || 'Dyn1'),
      x: nextX,
      y: 0,
      params: {
        SDf: driver.SDf,
        SDr: driver.SDr,
        Mms: driver.Mms,
        fs: driver.fs,
        Qms: driver.Qms,
        Re: driver.Re,
        BL: driver.BL,
        Le: driver.Le,
      },
    });
    nextX += GRID_SPACING;
  }

  // ── Source (if provided) ──
  if (modules.source?.voltage) {
    components.push({
      type: 'Source',
      name: 'Src1',
      x: -GRID_SPACING,
      y: 0,
      params: {
        voltage: modules.source.voltage,
        impedance: modules.source.impedance || null,
      },
    });
  }

  // ── Filter (if provided) ──
  if (modules.filter?.frequency) {
    components.push({
      type: 'Filter',
      name: 'Flt1',
      x: -GRID_SPACING * 2,
      y: 0,
      params: {
        type: modules.filter.type || 'LP',
        order: parseInt(modules.filter.order) || 2,
        frequency: parseFloat(modules.filter.frequency),
      },
    });
  }

  // ── Front Wave chain (connected to driver front port) ──
  let frontX = nextX;
  frontWave.forEach((comp, i) => {
    const mapped = mapComponentToAkabak(comp, `F_${i + 1}`, frontX, 0);
    if (mapped) {
      components.push(mapped);
      frontX += GRID_SPACING;
    }
  });

  // Front radiator at the end
  components.push({
    type: 'Radiator',
    name: 'RadF',
    x: frontX,
    y: 0,
    params: {},
  });

  // ── Back Wave chain (connected to driver rear port) ──
  let backX = nextX;
  const backY = 8; // offset vertically from front wave
  backWave.forEach((comp, i) => {
    const mapped = mapComponentToAkabak(comp, `B_${i + 1}`, backX, backY);
    if (mapped) {
      components.push(mapped);
      backX += GRID_SPACING;
    }
  });

  // ── VF volumes ──
  if (modules.vf1) {
    components.push({
      type: 'VolumeField',
      name: 'VF1',
      params: { volume: parseFloat(modules.vf1) },
    });
  }
  if (modules.vf2) {
    components.push({
      type: 'VolumeField',
      name: 'VF2',
      params: { volume: parseFloat(modules.vf2) },
    });
  }

  // ── GND (always present) ──
  components.push({
    type: 'GND',
    name: 'Gnd',
    x: 0,
    y: 0,
    params: {},
  });

  return {
    version: '1.0',
    components,
    wires: computeWires(components),
  };
}

/**
 * Map a UI segment to an Akabak component definition.
 */
function mapComponentToAkabak(comp, name, x, y) {
  const blobTypeMap = {
    duct: 'Duct',
    waveguide: 'Waveguide',
    enclosure: 'Encl',
  };

  const akType = blobTypeMap[comp.type];
  if (!akType) return null;

  const result = {
    type: comp.ventedMode === 'vented' ? 'EnclVented' : akType,
    name: sanitizeName(name),
    x,
    y,
    params: { ...comp.params },
  };

  return result;
}

/**
 * Auto-compute wire connections between sequential components.
 * Simple left-to-right chain for now.
 */
function computeWires(components) {
  // Wire generation is handled by the Python tool based on component positions.
  // We just pass the component list; the tool auto-connects adjacent ports.
  return [];
}

/**
 * Sanitize name for Akabak compatibility (ASCII only, no spaces).
 */
function sanitizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 30);
}
