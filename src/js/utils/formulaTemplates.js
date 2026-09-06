// ====================================================================================================
// FICHIER : src/js/utils/formulaTemplates.js
// RÔLE   : Centralise les templates de formules par défaut, les métadonnées et les helpers
//          utilisés par mainsettings, hornscript et ductscript.
// ====================================================================================================

export const defaultTemplates = {
  // ── Akabak-LEM (new S{n}/L{n} model) ──
  duct:              'WD  = @S{i}\nHD  = @H\nLen = @L{i}\neta = @WOOD',
  ductTransitionW:   'HTh = @H\nHMo = @H\nWTh = @S{i}\nWMo = @S{i+1}\nLen = @LT{i}_{i+1}\nT   = 10',
  ductTransitionM:   'd1 = @S{i}\nd2 = @S{i+1}\n\n// hack qui nous permet de toujours obtenir w1 > w2\nk = Sign(d2 - d1)\nw1 = if(k + 1, d1, d2)\nw2 = if(k + 1, d2, d1)\n\n// formule issue du fichier excel de plans.systeme\n// adaptée pour l\'utilisation dans Akabak\npre_m = (Density / (pi * @H)) * ((((w1-w2) ^ 2) / (2*w1*w2)) * Ln((w1+w2)/(w1-w2)) + Ln(((w1+w2) ^ 2)/(4*w1*w2))) * 1000\n\nM = if(k, 0, pre_m)',
  hornSegmentConstH: 'HTh = @H\nHMo = @H\nWTh = @S{i}\nWMo = @S{i+1}\nLen = @L{i}\nT   = @T{i}',
  enclosureSealed:   'Vb   = @Vb{i}\nLb   = @Lb{i}\netab = @WOOD',
  enclosureVented:   'Vb   = @Vb{i}\nLb   = @Lb{i}\nLen  = @PortLen{i}\n{portFormula}\netab = @WOOD\netav = @WOOD',
};

export const templateMeta = {
  duct:              { label: 'Duct',                  group: 'Akabak-LEM', mode: 'grid', vars: ['{i} = section N'] },
  ductTransitionW:   { label: 'Waveguide Transition',  group: 'Akabak-LEM', mode: 'grid', vars: ['{i} = section N', '{i+1} = section N+1'] },
  ductTransitionM:   { label: 'Mass Transition',       group: 'Akabak-LEM', mode: 'code', vars: ['{i} = section N', '{i+1} = section N+1'] },
  hornSegmentConstH: { label: 'Waveguide',             group: 'Akabak-LEM', mode: 'grid', vars: ['{i} = section N', '{i+1} = section N+1'] },
  enclosureSealed:   { label: 'Enclosure (Sealed)',    group: 'Akabak-LEM', mode: 'grid', vars: ['{i} = enclosure N'] },
  enclosureVented:   { label: 'Enclosure (Vented)',    group: 'Akabak-LEM', mode: 'grid', vars: ['{i} = enclosure N'] },
};

/** Parse a template string into structured assignment lines (for grid editor) */
export function parseTemplateToLines(templateStr) {
  return templateStr.split('\n')
    .map(line => {
      const m = line.match(/^(\S+)\s*=\s*(.*)$/);
      if (m) return { param: m[1], value: m[2].trimEnd() };
      return null;
    })
    .filter(Boolean);
}

/** Serialize structured assignment lines back to a template string */
export function serializeLines(lines) {
  if (lines.length === 0) return '';
  const maxLen = Math.max(...lines.map(l => l.param.length));
  return lines.map(l => `${l.param.padEnd(maxLen)} = ${l.value}`).join('\n');
}

/** Generate a preview by substituting index variables with example values */
export function getPreview(templateStr, index = 3) {
  return templateStr
    .replace(/{i\+1}/g, String(index + 1))
    .replace(/{i\+2}/g, String(index + 2))
    .replace(/{i}/g, String(index))
    .replace(/{type}/g, 'O');
}
