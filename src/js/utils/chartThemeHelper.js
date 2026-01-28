// =================================================================================
// FICHIER : src/js/utils/chartThemeHelper.js
// RÔLE    : Utilitaire pour gérer les couleurs des graphiques selon le thème actif
// =================================================================================

/**
 * Récupère les couleurs du thème actif pour les graphiques
 * @returns {Object} Objet contenant toutes les couleurs du thème
 */
export function getChartThemeColors() {
  const root = document.documentElement;
  const getColor = (varName, fallback) => {
    const value = getComputedStyle(root).getPropertyValue(varName).trim();
    return value || fallback;
  };

  return {
    primary: getColor('--chart-primary', 'rgb(236, 72, 153)'),
    primaryGlow: getColor('--chart-primary-glow', 'rgba(236, 72, 153, 0.2)'),
    secondary: getColor('--chart-secondary', 'rgb(244, 114, 182)'),
    bg: getColor('--chart-bg', '#0f0f0f'),
    grid: getColor('--chart-grid', 'rgba(156, 163, 175, 0.1)'),
    text: getColor('--chart-text', '#9ca3af'),
    axis: getColor('--chart-axis', '#9ca3af'),
    borderPrimary: getColor('--border-primary', '#e91e8c')
  };
}

/**
 * Applique les couleurs du thème à un graphique Chart.js existant
 * @param {Chart} chart - Instance du graphique Chart.js
 * @param {Object} options - Options de personnalisation
 */
export function applyThemeToChart(chart, options = {}) {
  if (!chart) return;
  
  const colors = getChartThemeColors();
  const {
    datasetIndex = 0,
    updateGrid = true,
    updateLegend = true,
    updateAxes = true
  } = options;

  // Mettre à jour les couleurs du dataset
  if (chart.data.datasets[datasetIndex]) {
    chart.data.datasets[datasetIndex].borderColor = colors.primary;
    chart.data.datasets[datasetIndex].backgroundColor = colors.primaryGlow;
    if (chart.data.datasets[datasetIndex].pointBackgroundColor) {
      chart.data.datasets[datasetIndex].pointBackgroundColor = colors.primary;
    }
    if (chart.data.datasets[datasetIndex].pointBorderColor) {
      chart.data.datasets[datasetIndex].pointBorderColor = colors.primary;
    }
  }

  // Mettre à jour les axes
  if (updateAxes && chart.options.scales) {
    for (const axisKey of Object.keys(chart.options.scales)) {
      const axis = chart.options.scales[axisKey];
      if (axis.title) {
        axis.title.color = colors.axis;
      }
      if (axis.ticks) {
        axis.ticks.color = colors.axis;
      }
      if (updateGrid && axis.grid) {
        axis.grid.color = colors.grid;
      }
    }
  }

  // Mettre à jour la légende
  if (updateLegend && chart.options.plugins?.legend?.labels) {
    chart.options.plugins.legend.labels.color = colors.text;
  }

  // Appliquer les changements
  chart.update('none');
}

/**
 * Crée les options de base pour un graphique avec les couleurs du thème
 * @param {Object} customOptions - Options personnalisées à fusionner
 * @returns {Object} Options Chart.js avec les couleurs du thème
 */
export function getThemedChartOptions(customOptions = {}) {
  const colors = getChartThemeColors();

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: {
          color: colors.text,
          font: { size: 13, weight: 'bold' },
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.primary,
        borderWidth: 2,
        padding: 12,
        displayColors: true
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          color: colors.axis,
          font: { size: 12, weight: 'bold' }
        },
        ticks: {
          color: colors.axis,
          font: { size: 11 }
        },
        grid: {
          color: colors.grid,
          lineWidth: 1
        }
      },
      y: {
        title: {
          display: true,
          color: colors.axis,
          font: { size: 12, weight: 'bold' }
        },
        ticks: {
          color: colors.axis,
          font: { size: 11 }
        },
        grid: {
          color: colors.grid,
          lineWidth: 1
        }
      }
    }
  };

  // Fusionner avec les options personnalisées
  return mergeDeep(defaultOptions, customOptions);
}

/**
 * Enregistre un graphique pour qu'il soit automatiquement mis à jour lors des changements de thème
 * @param {Chart} chart - Instance du graphique Chart.js
 * @param {Function} updateCallback - Fonction de rappel optionnelle à appeler lors du changement de thème
 */
export function registerChartForThemeUpdates(chart, updateCallback = null) {
  const listener = () => {
    applyThemeToChart(chart);
    if (updateCallback && typeof updateCallback === 'function') {
      updateCallback();
    }
  };

  window.addEventListener('themeChanged', listener);
  
  // Sauvegarder la référence du listener pour pouvoir le retirer plus tard
  if (!chart._themeListener) {
    chart._themeListener = listener;
  }
}

/**
 * Désenregistre un graphique des mises à jour automatiques de thème
 * @param {Chart} chart - Instance du graphique Chart.js
 */
export function unregisterChartFromThemeUpdates(chart) {
  if (chart._themeListener) {
    window.removeEventListener('themeChanged', chart._themeListener);
    delete chart._themeListener;
  }
}

// Utilitaire pour fusionner profondément des objets
function mergeDeep(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = mergeDeep(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}
