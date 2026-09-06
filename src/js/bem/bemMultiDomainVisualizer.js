// =======================================================
// FICHIER :  src/js/bem/bemMultiDomainVisualizer.js
// RÔLE    :  Visualisation des résultats BEM multi-domaine
//            Génère des graphiques polaires et contours
// =======================================================

'use strict';

/**
 * Create a polar directivity plot using Canvas
 */
export function createPolarPlot(canvasId, polarData, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error(`Canvas ${canvasId} not found`);
    return;
  }
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.4;
  
  const {
    title = 'Polar Directivity',
    showGrid = true,
    showLabels = true,
    backgroundColor = '#1a1a1a',
    gridColor = '#444',
    textColor = '#fff',
    lineColor = '#00ff00',
    lineWidth = 2
  } = options;
  
  // Clear canvas
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  
  // Draw grid circles and radial lines
  if (showGrid) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    
    // Concentric circles (0, -6, -12, -18, -24, -30 dB)
    for (let i = 0; i <= 5; i++) {
      const r = radius * (1 - i * 0.2);
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
      ctx.stroke();
      
      if (showLabels) {
        const dB = -i * 6;
        ctx.fillStyle = textColor;
        ctx.font = '10px Arial';
        ctx.fillText(`${dB} dB`, centerX + 5, centerY - r);
      }
    }
    
    // Radial lines every 30 degrees
    for (let angle = 0; angle < 360; angle += 30) {
      const rad = (angle - 90) * Math.PI / 180;
      const x = centerX + radius * Math.cos(rad);
      const y = centerY + radius * Math.sin(rad);
      
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.stroke();
      
      if (showLabels) {
        const labelRad = (angle - 90) * Math.PI / 180;
        const labelX = centerX + (radius + 20) * Math.cos(labelRad);
        const labelY = centerY + (radius + 20) * Math.sin(labelRad);
        ctx.fillStyle = textColor;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${angle}°`, labelX, labelY);
      }
    }
  }
  
  // Draw polar data
  if (polarData && polarData.dB) {
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    
    for (let i = 0; i < polarData.angles.length; i++) {
      const angle = polarData.angles[i];
      const dB = polarData.dB[i];
      
      // Clamp dB to -30..0 range for visualization
      const clampedDB = Math.max(-30, Math.min(0, dB));
      const normalizedRadius = radius * (1 + clampedDB / 30);
      
      // Convert angle to canvas coordinates (0° = up, clockwise)
      const rad = (angle - 90) * Math.PI / 180;
      const x = centerX + normalizedRadius * Math.cos(rad);
      const y = centerY + normalizedRadius * Math.sin(rad);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.closePath();
    ctx.stroke();
  }
  
  // Draw title
  if (title) {
    ctx.fillStyle = textColor;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, centerX, 20);
  }
  
  // Draw frequency label
  if (polarData && polarData.frequency) {
    ctx.fillStyle = textColor;
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${polarData.frequency} Hz`, centerX, height - 10);
  }
}

/**
 * Create a contour plot (frequency vs angle) using Canvas
 */
export function createContourPlot(canvasId, contourData, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error(`Canvas ${canvasId} not found`);
    return;
  }
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  const {
    title = 'Directivity Contour',
    minDB = -50,
    maxDB = 0,
    colormap = 'jet'
  } = options;
  
  // Clear canvas
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  
  if (!contourData || !contourData.data) {
    return;
  }
  
  const { frequencies, angles, data } = contourData;
  
  const marginLeft = 50;
  const marginRight = 100;
  const marginTop = 40;
  const marginBottom = 40;
  
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  
  // Draw contour
  const numFreqs = frequencies.length;
  const numAngles = angles.length;
  
  for (let fi = 0; fi < numFreqs - 1; fi++) {
    for (let ai = 0; ai < numAngles - 1; ai++) {
      const x = marginLeft + (fi / (numFreqs - 1)) * plotWidth;
      const y = marginTop + (ai / (numAngles - 1)) * plotHeight;
      const w = plotWidth / (numFreqs - 1);
      const h = plotHeight / (numAngles - 1);
      
      const value = data[fi][ai];
      const normalizedValue = (value - minDB) / (maxDB - minDB);
      const color = getColorFromValue(normalizedValue, colormap);
      
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }
  }
  
  // Draw axes
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(marginLeft, marginTop);
  ctx.lineTo(marginLeft, height - marginBottom);
  ctx.lineTo(width - marginRight, height - marginBottom);
  ctx.stroke();
  
  // Draw labels
  ctx.fillStyle = '#fff';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  
  // X-axis labels (frequency)
  for (let i = 0; i < frequencies.length; i += Math.ceil(frequencies.length / 5)) {
    const x = marginLeft + (i / (numFreqs - 1)) * plotWidth;
    const freq = frequencies[i];
    ctx.fillText(`${freq}`, x, height - marginBottom + 20);
  }
  
  // Y-axis labels (angle)
  ctx.textAlign = 'right';
  for (let i = 0; i < angles.length; i += Math.ceil(angles.length / 5)) {
    const y = marginTop + (i / (numAngles - 1)) * plotHeight;
    const angle = angles[i];
    ctx.fillText(`${angle}°`, marginLeft - 10, y + 4);
  }
  
  // Axis titles
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Frequency (Hz)', width / 2, height - 5);
  
  ctx.save();
  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Angle (deg)', 0, 0);
  ctx.restore();
  
  // Title
  ctx.font = 'bold 16px Arial';
  ctx.fillText(title, width / 2, 20);
  
  // Draw colorbar
  drawColorbar(ctx, width - marginRight + 20, marginTop, 30, plotHeight, minDB, maxDB, colormap);
}

/**
 * Draw a colorbar legend
 */
function drawColorbar(ctx, x, y, width, height, minValue, maxValue, colormap) {
  const steps = 100;
  const stepHeight = height / steps;
  
  for (let i = 0; i < steps; i++) {
    const value = i / steps;
    const color = getColorFromValue(value, colormap);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + height - i * stepHeight, width, stepHeight);
  }
  
  // Draw border
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
  
  // Draw labels
  ctx.fillStyle = '#fff';
  ctx.font = '10px Arial';
  ctx.textAlign = 'left';
  
  const numLabels = 5;
  for (let i = 0; i <= numLabels; i++) {
    const value = minValue + (maxValue - minValue) * (i / numLabels);
    const labelY = y + height - (i / numLabels) * height;
    ctx.fillText(`${value.toFixed(0)} dB`, x + width + 5, labelY + 4);
  }
}

/**
 * Get color from normalized value (0..1) using colormap
 */
function getColorFromValue(value, colormap = 'jet') {
  value = Math.max(0, Math.min(1, value));
  
  if (colormap === 'jet') {
    // Jet colormap: blue -> cyan -> green -> yellow -> red
    let r, g, b;
    
    if (value < 0.125) {
      r = 0;
      g = 0;
      b = 0.5 + value * 4;
    } else if (value < 0.375) {
      r = 0;
      g = (value - 0.125) * 4;
      b = 1;
    } else if (value < 0.625) {
      r = (value - 0.375) * 4;
      g = 1;
      b = 1 - (value - 0.375) * 4;
    } else if (value < 0.875) {
      r = 1;
      g = 1 - (value - 0.625) * 4;
      b = 0;
    } else {
      r = 1 - (value - 0.875) * 4;
      g = 0;
      b = 0;
    }
    
    r = Math.floor(r * 255);
    g = Math.floor(g * 255);
    b = Math.floor(b * 255);
    
    return `rgb(${r},${g},${b})`;
  }
  
  // Default grayscale
  const gray = Math.floor(value * 255);
  return `rgb(${gray},${gray},${gray})`;
}

/**
 * Create comparison plot (BEM vs Akabak)
 */
export function createComparisonPlot(canvasId, bemData, akabakData, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error(`Canvas ${canvasId} not found`);
    return;
  }
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  const {
    title = 'BEM vs Akabak Comparison',
    backgroundColor = '#1a1a1a',
    gridColor = '#444',
    textColor = '#fff',
    bemColor = '#00ff00',
    akabakColor = '#ff0000'
  } = options;
  
  // Clear canvas
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  
  const marginLeft = 60;
  const marginRight = 40;
  const marginTop = 40;
  const marginBottom = 40;
  
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  
  // Draw axes
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(marginLeft, marginTop);
  ctx.lineTo(marginLeft, height - marginBottom);
  ctx.lineTo(width - marginRight, height - marginBottom);
  ctx.stroke();
  
  // Draw grid
  for (let i = 0; i <= 10; i++) {
    const y = marginTop + (i / 10) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(marginLeft, y);
    ctx.lineTo(width - marginRight, y);
    ctx.stroke();
  }
  
  // Plot BEM data
  if (bemData && bemData.angles && bemData.dB) {
    ctx.strokeStyle = bemColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < bemData.angles.length; i++) {
      const angle = bemData.angles[i];
      const dB = bemData.dB[i];
      
      const x = marginLeft + ((angle + 90) / 180) * plotWidth;
      const y = height - marginBottom - ((dB + 30) / 30) * plotHeight;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  
  // Plot Akabak data
  if (akabakData && akabakData.length > 0) {
    ctx.strokeStyle = akabakColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < akabakData.length; i++) {
      const angle = akabakData[i].angle;
      const dB = akabakData[i].dB;
      
      const x = marginLeft + ((angle + 90) / 180) * plotWidth;
      const y = height - marginBottom - ((dB + 30) / 30) * plotHeight;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  
  // Draw labels
  ctx.fillStyle = textColor;
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  
  // X-axis labels
  for (let angle = -90; angle <= 90; angle += 30) {
    const x = marginLeft + ((angle + 90) / 180) * plotWidth;
    ctx.fillText(`${angle}°`, x, height - marginBottom + 20);
  }
  
  // Y-axis labels
  ctx.textAlign = 'right';
  for (let dB = -30; dB <= 0; dB += 6) {
    const y = height - marginBottom - ((dB + 30) / 30) * plotHeight;
    ctx.fillText(`${dB} dB`, marginLeft - 10, y + 4);
  }
  
  // Title
  ctx.fillStyle = textColor;
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, 20);
  
  // Legend
  ctx.textAlign = 'left';
  ctx.font = '12px Arial';
  ctx.fillStyle = bemColor;
  ctx.fillRect(width - marginRight - 120, marginTop + 10, 20, 2);
  ctx.fillText('BEM Multi-Domain', width - marginRight - 95, marginTop + 15);
  
  ctx.fillStyle = akabakColor;
  ctx.fillRect(width - marginRight - 120, marginTop + 30, 20, 2);
  ctx.fillText('Akabak Reference', width - marginRight - 95, marginTop + 35);
}
