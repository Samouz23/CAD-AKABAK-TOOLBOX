// =======================================================
// FICHIER :  src/ipc/akabakLemHandlers.js
// RÔLE    :  Gestionnaire IPC pour la génération de fichiers LEM binaires (.akp)
//            via le script Python akabak_tool_v2.py
//
// Pipeline:  template → batch-insert components → wire → apply INI → rename → save
// =======================================================
const { ipcMain, dialog, app } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Map UI segment types to blob filenames and component type names
const BLOB_MAP = {
  duct:       { blob: 'duct_formula_ref.akb',       type: 'Duct',       width: 8 },
  waveguide:  { blob: 'waveguide_formula_ref.akb',  type: 'Waveguide',  width: 8 },
  enclosure:  { blob: 'encl_formula_ref.akb',        type: 'Encl',       width: 8 },
  enclosureVented: { blob: 'enclvented_formula_ref.akb', type: 'EnclVented', width: 8 },
  radiator:   { blob: 'radiator_ref.akb',            type: 'Radiator',   width: 4 },
};

// TEMPLATE_FINAL project name is 14 chars — rename must stay within this limit
const TEMPLATE_NAME_LEN = 14;

// Grid layout constants
// DynDriver sits at (56,11) with width 8, so its right edge is at x=64.
// Front port is at y=10, back port at y=16.
const FRONT_Y = 10;
const BACK_Y = 16;
const CHAIN_START_X = 64; // right edge of DynDriver
const MIN_LEAD_WIRES = 10; // minimum wires between driver and first component

/**
 * Run the Python tool with given args. Returns { stdout, stderr }.
 */
function runPython(pythonScript, cmdArgs, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile('python', [pythonScript, ...cmdArgs], { timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve({ stdout: stdout?.trim() || '', stderr: stderr?.trim() || '' });
      }
    });
  });
}

/**
 * Build an INI config string from the LEM config object.
 * 
 * Constants use sequential numbering across ALL segments (front then back):
 *   S1, S2, ... = widths (Duct WD / Waveguide WTh)
 *   D1, D2, ... = duct lengths
 *   L1, L2, ... = waveguide lengths
 *   T1, T2, ... = waveguide T-factors
 *   VF1, VF2, ... = volumes (only if user entered a value)
 *   Vb1, Vb2, ... = enclosure volumes
 *   Lb1, Lb2, ... = enclosure depths
 *
 * Component formulas reference these constants with @ prefix:
 *   Duct:      WD=@S{i}, HD=@H, Len=@D{i}, eta=@WOOD, VF=0 or @VF{i}
 *   Waveguide: HTh=@H, HMo=@H, WTh=@S{i}, WMo=@S{i+1}, Len=@L{i}, T=@T{i}
 *   Encl:      Vb=@Vb{i}, LenCab=@Lb{i}, etab=@WOOD
 */
function buildIniConfig(config) {
  const lines = [];
  const gc = config.globalConstants || {};

  // === Page 1: CONSTANTE / DIMENSION / PPBOX / TOOLS (Block 1 in .akp, ~398B) ===
  const page1 = [];
  page1.push('//////////CONSTANTE//////////');
  page1.push(`WOOD_THICKNESS = ${gc.woodThickness || '18'}`);
  page1.push(`RMIN           = 70`);
  page1.push(`DAMPING        = ${gc.damping || '0.1'}`);
  page1.push(`WOOD           = ${gc.wood || '0.05'}`);
  page1.push('');
  page1.push("//////////NOMBRE D'UNITES//////////");
  page1.push('N =1');
  page1.push('');
  page1.push('//////////DIMENSION//////////');
  if (gc.height) page1.push(`HEIGHT = ${gc.height}`);
  if (gc.width) page1.push(`WIDTH  = ${gc.width}`);
  if (gc.dept) page1.push(`DEPT   = ${gc.dept}`);
  page1.push('');
  page1.push('//////////PPBOX RADIATION//////////');
  page1.push('MOUTH_H = HEIGHT');
  page1.push('MOUTH_D = WIDTH - 2*WOOD_THICKNESS');
  page1.push('');
  page1.push('//////////TOOLS//////////');
  page1.push('IB = (HEIGHT/n)/2');

  // === Page 2: HP driver params + H + component dimensions (Block 2 in .akp, ~1206B) ===
  const page2 = [];

  // Driver params
  if (config.driver) {
    const d = config.driver;
    // Strip non-ASCII characters (e.g. Ω) — .akp uses ASCII-only strings
    const safeName = (d.name || 'Unknown').replace(/[^\x20-\x7E]/g, '');
    page2.push(`// HP UTILISE : [${safeName}]`);
    if (d.SDf) page2.push(`SDf=${d.SDf}`);
    if (d.SDr) page2.push(`SDr=${d.SDr || d.SDf}`);
    if (d.Mms) page2.push(`Mms=${d.Mms}`);
    if (d.fs)  page2.push(`fs=${d.fs}`);
    if (d.Qms) page2.push(`Qms=${d.Qms}`);
    if (d.Re)  page2.push(`Re=${d.Re}`);
    if (d.BL)  page2.push(`BL=${d.BL}`);
    if (d.Le)  page2.push(`Le=${d.Le}`);
  }

  page2.push('');
  page2.push('// Hauteur Globale');
  page2.push('H = @HEIGHT*@n - (2*@n)*@WOOD_THICKNESS');

  // Collect all segments sequentially (front then back)
  const allWaves = [
    { segs: config.frontWave || [], label: 'front' },
    { segs: config.backWave || [], label: 'back' },
  ];

  // Per-type counters with adjacency tracking (matches frontend logic)
  let ductNum = 0, wgNum = 0;
  const ductSegs = [], wgSegs = [], enclSegs = [];
  const allSegsOrdered = [];

  allWaves.forEach(({ segs }) => {
    const localDuctNums = [];
    // First pass: assign duct numbers
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const p = seg.params || {};
      if (seg.type === 'duct') {
        ductNum++;
        localDuctNums[i] = ductNum;
        ductSegs.push({ num: ductNum, seg, p });
      }
      allSegsOrdered.push(seg);
    }
    // Second pass: waveguides with adjacency info
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const p = seg.params || {};
      if (seg.type === 'waveguide') {
        wgNum++;
        const prevDuctNum = (i > 0 && segs[i - 1].type === 'duct') ? localDuctNums[i - 1] : null;
        const nextDuctNum = (i < segs.length - 1 && segs[i + 1].type === 'duct') ? localDuctNums[i + 1] : null;
        wgSegs.push({ num: wgNum, seg, p, prevDuctNum, nextDuctNum });
      } else if (seg.type === 'enclosure') {
        enclSegs.push({ seg, p });
      }
    }
  });

  // Duct widths (D) and lengths (DL)
  if (ductSegs.length > 0) {
    page2.push('');
    page2.push('// Largeurs des Ducts (D)');
    ductSegs.forEach(({ num, p }) => {
      if (p.WD !== undefined && p.WD !== '') page2.push(`D${num} = ${p.WD}`);
    });
    page2.push('// Longueurs des Ducts (DL)');
    ductSegs.forEach(({ num, p }) => {
      if (p.Len !== undefined && p.Len !== '') page2.push(`DL${num} = ${p.Len}`);
    });
  }

  // Waveguide widths (S) — with deduplication and D-references for between-ducts
  if (wgSegs.length > 0) {
    const sLines = [];
    const definedS = new Set();
    for (let w = 0; w < wgSegs.length; w++) {
      const wg = wgSegs[w];
      const sThroatIdx = wg.num;
      const sMouthIdx = wg.num + 1;
      if (!definedS.has(sThroatIdx)) {
        definedS.add(sThroatIdx);
        if (wg.prevDuctNum != null) {
          sLines.push(`S${sThroatIdx} = D${wg.prevDuctNum}`);
        } else {
          const wth = wg.p.WTh;
          if (wth !== undefined && wth !== '') sLines.push(`S${sThroatIdx} = ${wth}`);
        }
      }
      if (!definedS.has(sMouthIdx)) {
        definedS.add(sMouthIdx);
        if (wg.nextDuctNum != null) {
          sLines.push(`S${sMouthIdx} = D${wg.nextDuctNum}`);
        } else {
          const wmo = wg.p.WMo;
          if (wmo !== undefined && wmo !== '') sLines.push(`S${sMouthIdx} = ${wmo}`);
        }
      }
    }
    if (sLines.length > 0) {
      page2.push('');
      page2.push('// Horn Width (S)');
      sLines.forEach(l => page2.push(l));
    }
    page2.push('// Horn Length (L)');
    wgSegs.forEach(({ num, p }) => {
      if (p.Len !== undefined && p.Len !== '') page2.push(`L${num} = ${p.Len}`);
    });
    page2.push('// T-Factor (T)');
    wgSegs.forEach(({ num, p }) => {
      if (p.T !== undefined && p.T !== '') page2.push(`T${num} = ${p.T}`);
    });
  }

  // Volumes (VF) — global counter to avoid conflicts between duct/waveguide
  const vfEntries = [];
  let vfNum = 0;
  allSegsOrdered.forEach(seg => {
    const p = seg.params || {};
    if (p.VF && p.VF !== '' && p.VF !== '0') {
      vfNum++;
      vfEntries.push({ num: vfNum, val: p.VF });
    }
  });
  if (vfEntries.length > 0) {
    page2.push('// Volumes (VF)');
    vfEntries.forEach(({ num, val }) => page2.push(`VF${num} = ${val}`));
  }

  // Enclosure (single Vb/Lb)
  if (enclSegs.length > 0) {
    const { seg, p } = enclSegs[0];
    page2.push('');
    page2.push('// Enclosure Definition');
    if (p.VB !== undefined && p.VB !== '') page2.push(`Vb=${p.VB}*@N`);
    if (p.LenCab !== undefined && p.LenCab !== '') page2.push(`Lb=${p.LenCab}`);
    if (seg.ventedMode === 'vented') {
      if (p.portLen !== undefined && p.portLen !== '') page2.push(`PortLen=${p.portLen}`);
      if (p.portDD !== undefined && p.portDD !== '') page2.push(`dD = ${p.portDD}`);
      if (p.portWD !== undefined && p.portWD !== '') page2.push(`wDP = ${p.portWD}`);
      if (p.portHD !== undefined && p.portHD !== '') page2.push(`hDP = ${p.portHD}`);
    }
  }

  // Source voltage
  if (config.modules?.source?.voltage) {
    page2.push('');
    page2.push('// Source');
    page2.push(`Vg=${config.modules.source.voltage}`);
  }

  // Store raw constants blocks for Python tool
  // Page 1 = CONSTANTE/DIMENSION (smallest block in .akp, ~398B)
  // Page 2 = HP driver + component dimensions (largest block in .akp, ~1206B)
  // Page 3 = Layout/graph page: //1M header + copy of CONSTANTE (medium block, ~439B)
  lines.push('[raw_constants_page1]');
  lines.push(page1.join('\n'));
  lines.push('');
  lines.push('[raw_constants_page2]');
  lines.push(page2.join('\n'));
  lines.push('');
  // Page 3: graph/layout page = //1M prefix + same CONSTANTE content as page1
  const page3 = ['//1M', 'Z1 = 1000', 'Y1 = -@IB+10', 'Z2 = 0', '', ...page1];
  lines.push('[raw_constants_page3]');
  lines.push(page3.join('\n'));
  lines.push('');

  // --- Component formula sections ---
  // File-order is REVERSED: find_insertion_point() inserts at beginning of
  // component zone, so the last inserted component of each type becomes index 0.
  // We insert left-to-right (closest first), so file Type.0 = farthest.
  // To match, we assign reversed type indices: first in allSegs → Type.(N-1).

  // First pass: count how many components of each type
  const typeTotals = {};
  allSegsOrdered.forEach((seg) => {
    const isVented = seg.type === 'enclosure' && seg.ventedMode === 'vented';
    const blobKey = isVented ? 'enclosureVented' : seg.type;
    const blobInfo = BLOB_MAP[blobKey];
    if (!blobInfo) return;
    typeTotals[blobInfo.type] = (typeTotals[blobInfo.type] || 0) + 1;
  });

  // Second pass: emit sections with reversed type indices
  const typeCounters = {};
  const NAME_PREFIXES = { Duct: 'Du', Waveguide: 'Wg', Encl: 'Encl', EnclVented: 'Encl' };
  let ductFormulaNum = 0, wgFormulaNum = 0;
  // Build a global VF index map: for each segment with VF, track its global VF number
  const vfIndexMap = new Map();
  let vfGlobalNum = 0;
  allSegsOrdered.forEach((seg) => {
    const p = seg.params || {};
    if (p.VF && p.VF !== '' && p.VF !== '0') {
      vfGlobalNum++;
      vfIndexMap.set(seg, vfGlobalNum);
    }
  });

  allSegsOrdered.forEach((seg) => {
    const isVented = seg.type === 'enclosure' && seg.ventedMode === 'vented';
    const blobKey = isVented ? 'enclosureVented' : seg.type;
    const blobInfo = BLOB_MAP[blobKey];
    if (!blobInfo) return;

    const typeName = blobInfo.type;
    if (!typeCounters[typeName]) typeCounters[typeName] = 0;
    const seqIdx = typeCounters[typeName]++;
    const typeIdx = (typeTotals[typeName] - 1) - seqIdx;

    lines.push(`[${typeName}.${typeIdx}]`);

    const p = seg.params || {};
    if (seg.type === 'duct') {
      ductFormulaNum++;
      lines.push(`WD  = @D${ductFormulaNum}`);
      lines.push(`HD  = @H`);
      lines.push(`Len = @DL${ductFormulaNum}`);
      lines.push(`eta = @WOOD`);
      // VF: reference global VF constant if specified, else 0
      const vfIdx = vfIndexMap.get(seg);
      lines.push(`Vf = ${vfIdx ? '@VF' + vfIdx : '0'}`);
      lines.push(`Visc = 1`);
    } else if (seg.type === 'waveguide') {
      wgFormulaNum++;
      lines.push(`HTh = @H`);
      lines.push(`HMo = @H`);
      lines.push(`WTh = @S${wgFormulaNum}`);
      lines.push(`WMo = @S${wgFormulaNum + 1}`);
      lines.push(`Len = @L${wgFormulaNum}`);
      lines.push(`T   = @T${wgFormulaNum}`);
      // VF: reference global VF constant if specified, else 0
      const vfIdx = vfIndexMap.get(seg);
      lines.push(`Vf = ${vfIdx ? '@VF' + vfIdx : '0'}`);
    } else if (seg.type === 'enclosure') {
      lines.push(`Vb   = @Vb`);
      lines.push(`Lb   = @Lb`);
      lines.push(`etab = @WOOD`);
      if (isVented) {
        lines.push(`Len  = @PortLen`);
        const portShape = seg.portShape || p.portShape || 'circle';
        if (portShape === 'circle') {
          lines.push(`dD   = @dD`);
        } else {
          lines.push(`WD   = @wDP`);
          lines.push(`HD   = @hDP`);
        }
        lines.push(`etav = @WOOD`);
      }
    }
    lines.push('');
  });

  // --- Component names (same reversed indices as formulas) ---
  lines.push('[names]');
  const nameCounters = {};
  allSegsOrdered.forEach((seg) => {
    const isVented = seg.type === 'enclosure' && seg.ventedMode === 'vented';
    const blobKey = isVented ? 'enclosureVented' : seg.type;
    const blobInfo = BLOB_MAP[blobKey];
    if (!blobInfo) return;
    const typeName = blobInfo.type;
    if (!nameCounters[typeName]) nameCounters[typeName] = 0;
    const seqIdx = nameCounters[typeName]++;
    const typeIdx = (typeTotals[typeName] - 1) - seqIdx;
    const prefix = NAME_PREFIXES[typeName] || typeName.substring(0, 2);
    lines.push(`${typeName}.${typeIdx} = ${prefix}${seqIdx + 1}`);
  });
  lines.push('');

  return lines.join('\n');
}

module.exports.registerAkabakLemHandlers = () => {

  ipcMain.handle('akabak-lem:generate', async (event, { config, defaultName }) => {
    try {
      // Ask user where to save
      const { filePath: savePath, canceled } = await dialog.showSaveDialog({
        title: 'Save LEM Project',
        defaultPath: defaultName || 'project_lem.akp',
        filters: [
          { name: 'AKAbak Project', extensions: ['akp'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (canceled || !savePath) return { success: false, canceled: true };

      // Locate Python tool, template, blobs
      const toolDir = path.join(__dirname, '..', '..', 'Akabak_retro_eng');
      const pythonScript = path.join(toolDir, 'akabak_tool_v2.py');
      const templatePath = path.join(toolDir, 'templates', 'TEMPLATE_FINAL.akp');
      const blobsDir = path.join(toolDir, 'blobs');

      if (!fs.existsSync(pythonScript)) {
        return { success: false, error: `Python tool not found: ${pythonScript}` };
      }
      if (!fs.existsSync(templatePath)) {
        return { success: false, error: `Template not found: ${templatePath}` };
      }

      const tempDir = app.getPath('temp');
      const ts = Date.now();
      let currentFile = templatePath;

      // Helper: run a step, producing a new temp file
      const stepFiles = [];
      const nextTemp = (label) => {
        const p = path.join(tempDir, `lem_${label}_${ts}.akp`);
        stepFiles.push(p);
        return p;
      };

      // ────────────────────────────────────────────
      // Step 1: batch-insert front-wave components
      // ────────────────────────────────────────────
      const frontSegs = config.frontWave || [];
      const frontGroups = groupByType(frontSegs);
      let frontX = CHAIN_START_X;

      for (const group of frontGroups) {
        const outFile = nextTemp(`front_${group.type}_${group.count}`);
        const blobPath = path.join(blobsDir, group.blob);
        if (!fs.existsSync(blobPath)) {
          return { success: false, error: `Blob not found: ${blobPath}` };
        }
        // Waveguides are taller — shift Y up by 1 to align ports with wires
        const yOffset = group.type === 'Waveguide' ? -1 : 0;
        await runPython(pythonScript, [
          'batch-insert', currentFile, outFile,
          '--blob', blobPath,
          '--count', String(group.count),
          '--start-x', String(frontX),
          '--start-y', String(FRONT_Y + yOffset),
        ]);
        currentFile = outFile;
        frontX += group.count * group.width;
      }

      // Check if front wave ends with an enclosure (no radiator needed)
      const frontHasEnclosure = frontSegs.some(s => s.type === 'enclosure' || s.type === 'enclosureVented');

      // Insert radiator at end of front wave ONLY if no enclosure
      // Radiator offset: 1 left, 2 down from chain end
      if (frontSegs.length > 0 && !frontHasEnclosure) {
        const outFile = nextTemp('front_radiator');
        await runPython(pythonScript, [
          'reposition', currentFile, outFile,
          '--comp', 'Radiator.1',
          '--pos', `${frontX - 1},${FRONT_Y + 2}`,
        ]);
        currentFile = outFile;
        frontX += 4; // Radiator width
      }

      // ────────────────────────────────────────────
      // Step 2: batch-insert back-wave components
      // ────────────────────────────────────────────
      const backSegs = config.backWave || [];
      const backGroups = groupByType(backSegs);
      let backX = CHAIN_START_X;

      for (const group of backGroups) {
        const outFile = nextTemp(`back_${group.type}_${group.count}`);
        const blobPath = path.join(blobsDir, group.blob);
        if (!fs.existsSync(blobPath)) {
          return { success: false, error: `Blob not found: ${blobPath}` };
        }
        // Waveguides are taller — shift Y up by 1 to align ports with wires
        const yOffset = group.type === 'Waveguide' ? -1 : 0;
        await runPython(pythonScript, [
          'batch-insert', currentFile, outFile,
          '--blob', blobPath,
          '--count', String(group.count),
          '--start-x', String(backX),
          '--start-y', String(BACK_Y + yOffset),
        ]);
        currentFile = outFile;
        backX += group.count * group.width;
      }

      // Check if back wave ends with an enclosure (no radiator needed)
      const backHasEnclosure = backSegs.some(s => s.type === 'enclosure' || s.type === 'enclosureVented');

      // Reposition template's Radiator.0 (HPR) ONLY if no enclosure
      // Radiator offset: 1 left, 4 down from chain end
      if (backSegs.length > 0 && !backHasEnclosure) {
        const outFile = nextTemp('back_radiator');
        await runPython(pythonScript, [
          'reposition', currentFile, outFile,
          '--comp', 'Radiator.0',
          '--pos', `${backX - 1},${BACK_Y + 4}`,
        ]);
        currentFile = outFile;
        backX += 4;
      }

      // ────────────────────────────────────────────
      // Step 3: Wire new components
      // ────────────────────────────────────────────
      // Wire count: N+1 if radiator present, N if enclosure terminates
      // Minimum MIN_LEAD_WIRES between driver and first component
      const frontChainWires = frontHasEnclosure ? frontSegs.length : frontSegs.length + 1;
      const backChainWires = backHasEnclosure ? backSegs.length : backSegs.length + 1;
      const frontWires = frontSegs.length > 0 ? Math.max(frontChainWires, MIN_LEAD_WIRES) : 0;
      const backWires = backSegs.length > 0 ? Math.max(backChainWires, MIN_LEAD_WIRES) : 0;

      if (frontWires + backWires > 0) {
        const wireBlob = path.join(blobsDir, 'wire_ref.akb');
        if (fs.existsSync(wireBlob)) {
          // Insert front wires at front-wave Y level
          if (frontWires > 0) {
            const outFile = nextTemp('wired_front');
            await runPython(pythonScript, [
              'wire', currentFile, outFile,
              '--blob', wireBlob,
              '--count', String(frontWires),
              '--x', String(CHAIN_START_X),
              '--y', String(FRONT_Y),
              '--spacing', '8',
              '--wirelen', '0',
            ]);
            currentFile = outFile;
          }
          // Insert back wires at back-wave Y level
          if (backWires > 0) {
            const outFile = nextTemp('wired_back');
            await runPython(pythonScript, [
              'wire', currentFile, outFile,
              '--blob', wireBlob,
              '--count', String(backWires),
              '--x', String(CHAIN_START_X),
              '--y', String(BACK_Y),
              '--spacing', '8',
              '--wirelen', '0',
            ]);
            currentFile = outFile;
          }
        }
      }

      // ────────────────────────────────────────────
      // Step 4: Apply INI config (formulas)
      // ────────────────────────────────────────────
      const iniContent = buildIniConfig(config);
      const iniPath = path.join(tempDir, `lem_config_${ts}.ini`);
      fs.writeFileSync(iniPath, iniContent, 'utf8');
      stepFiles.push(iniPath);

      {
        const outFile = nextTemp('configured');
        try {
          await runPython(pythonScript, [
            'apply', currentFile, outFile,
            '--config', iniPath,
          ]);
          // apply only saves when changes > 0; if outFile missing, keep current
          if (fs.existsSync(outFile)) {
            currentFile = outFile;
          }
        } catch (applyErr) {
          // Non-fatal: if apply fails, continue with current file
          console.error('LEM apply failed:', applyErr.message);
        }
      }

      // ────────────────────────────────────────────
      // Step 5: Rename project and copy to final
      // ────────────────────────────────────────────
      // Template name is 14 chars — truncate to fit
      let projectName = (defaultName || 'LEM_Project')
        .replace(/\.akp$/i, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .substring(0, TEMPLATE_NAME_LEN);
      if (!projectName) projectName = 'LEM_Project';

      await runPython(pythonScript, [
        'rename', currentFile, savePath,
        '--name', projectName,
      ]);

      // Cleanup temp files
      for (const f of stepFiles) {
        try { fs.unlinkSync(f); } catch (_) {}
      }

      return { success: true, path: savePath };

    } catch (err) {
      console.error('LEM handler error:', err);
      return { success: false, error: err.message };
    }
  });
};

/**
 * Group consecutive segments by their blob type for batch-insert.
 * E.g. [duct, duct, waveguide, duct] → [{duct,2}, {waveguide,1}, {duct,1}]
 */
function groupByType(segments) {
  const groups = [];
  for (const seg of segments) {
    const isVented = seg.type === 'enclosure' && seg.ventedMode === 'vented';
    const blobKey = isVented ? 'enclosureVented' : seg.type;
    const blobInfo = BLOB_MAP[blobKey];
    if (!blobInfo) continue;

    const last = groups[groups.length - 1];
    if (last && last.blob === blobInfo.blob) {
      last.count++;
    } else {
      groups.push({
        type: blobInfo.type,
        blob: blobInfo.blob,
        width: blobInfo.width,
        count: 1,
      });
    }
  }
  return groups;
}
