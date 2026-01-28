// =======================================================
// FICHIER :  src/popup/geometry.js
// RÔLE    :  Gestion du popup intermédiaire de sélection de calculateur geometry
//            Permet de choisir quel calculateur ouvrir en popup
// =======================================================

/**
 * Affiche le dialogue de sélection de calculateur geometry
 * Inspiré du popup "Find Similar" de driver_db
 */
export function showGeometryCalculatorSelector() {
  // Supprime les popups existants
  removeGeometrySelectorPopup();

  const overlay = document.createElement('div');
  overlay.id = 'geometry-selector-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.15s ease-out;
  `;

  const toast = document.createElement('div');
  toast.id = 'geometry-selector-toast';
  toast.style.cssText = `
    min-width: 480px;
    max-width: 560px;
    background-color: var(--bg-panel);
    border: 2px solid var(--border-primary);
    border-radius: 8px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.2s ease-out;
  `;

  // Définition des calculateurs disponibles
  const calculators = [
    { id: 'rectangular', label: 'Rectangular Volume Calculator' },
    { id: 'prism', label: 'Triangular Prism Volume Calculator' },
    { id: 'diameter', label: 'Diameter ⇄ Area' },
    { id: 'conversion', label: 'Metric ⇄ Inch' }
  ];

  // Construction des options de calculateurs
  const calculatorOptions = calculators.map(calc => `
    <label class="calc-option" data-calc-id="${calc.id}" style="
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background-color: var(--bg-control-group);
      border: 1px solid var(--border-secondary);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    ">
      <input type="radio" name="geometry-calc" value="${calc.id}" style="
        cursor: pointer;
        width: 18px;
        height: 18px;
        accent-color: var(--theme-accent);
      ">
      <span style="color: var(--text-body); font-size: 14px; font-weight: 500; flex: 1;">${calc.label}</span>
    </label>
  `).join('');

  toast.innerHTML = `
    <div style="padding: 20px 24px; border-bottom: 1px solid var(--border-secondary); display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
      <div>
        <h2 style="color: var(--text-title); font-size: 18px; font-weight: 600; margin: 0 0 4px 0;">Open Geometry Calculator</h2>
        <p style="color: var(--text-muted); font-size: 13px; margin: 0;">Choose which calculator to open in a new window</p>
      </div>
      <button data-close-toast style="color: var(--text-muted); cursor: pointer; background: transparent; border: none; font-size: 24px; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    
    <div style="padding: 20px 24px; display: flex; flex-direction: column; gap: 12px;">
      ${calculatorOptions}
      <div id="geometry-selector-error" style="color: rgb(239, 68, 68); font-size: 13px; font-weight: 500; display: none; margin-top: 8px;"></div>
    </div>
    
    <div style="padding: 16px 24px; border-top: 1px solid var(--border-secondary); display: flex; justify-content: space-between; align-items: center; gap: 12px;">
      <span style="color: var(--text-muted); font-size: 11px;">Compact calculator view</span>
      <div style="display: flex; gap: 8px;">
        <button data-close-toast style="padding: 8px 16px; border-radius: 4px; border: 1px solid var(--border-secondary); background-color: transparent; color: var(--text-muted); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: inherit;">Cancel</button>
        <button id="open-calculator-btn" style="padding: 8px 16px; border-radius: 4px; border: none; background-color: var(--btn-primary-border); color: white; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit;">Open Calculator</button>
      </div>
    </div>
  `;

  overlay.appendChild(toast);
  document.body.appendChild(overlay);

  // Ajouter les événements hover pour les options
  const calcOptions = toast.querySelectorAll('.calc-option');
  calcOptions.forEach(option => {
    option.addEventListener('mouseenter', () => {
      option.style.borderColor = 'var(--theme-accent)';
      option.style.backgroundColor = 'var(--bg-hover)';
    });
    option.addEventListener('mouseleave', () => {
      option.style.borderColor = 'var(--border-secondary)';
      option.style.backgroundColor = 'var(--bg-control-group)';
    });
  });

  // Gestion des événements
  const closeButtons = toast.querySelectorAll('[data-close-toast]');
  closeButtons.forEach(btn => btn.addEventListener('click', removeGeometrySelectorPopup));

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) removeGeometrySelectorPopup();
  });

  const openBtn = toast.querySelector('#open-calculator-btn');
  const errorLabel = toast.querySelector('#geometry-selector-error');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      errorLabel.style.display = 'none';
      errorLabel.textContent = '';

      const selectedCalc = toast.querySelector('input[name="geometry-calc"]:checked');
      if (!selectedCalc) {
        errorLabel.textContent = 'Please select a calculator';
        errorLabel.style.display = 'block';
        return;
      }

      // Ouvre le calculateur sélectionné dans une vraie fenêtre popup
      const calculatorNames = {
        'rectangular': 'Rectangular Volume',
        'prism': 'Triangular Prism',
        'diameter': 'Diameter ⇄ Area',
        'conversion': 'Metric ⇄ Inch'
      };
      window.electronAPI.openToolInNewWindow({ 
        toolName: `geometry-${selectedCalc.value}`, 
        title: calculatorNames[selectedCalc.value] 
      });
      removeGeometrySelectorPopup();
    });
  }

  // Permet d'ouvrir avec Enter
  document.addEventListener('keydown', handleEnterKey);
}

function handleEnterKey(e) {
  if (e.key === 'Enter') {
    const openBtn = document.querySelector('#open-calculator-btn');
    if (openBtn) openBtn.click();
  }
}

function removeGeometrySelectorPopup() {
  const overlay = document.getElementById('geometry-selector-overlay');
  if (overlay) {
    overlay.remove();
  }
  document.removeEventListener('keydown', handleEnterKey);
}

// Ajouter les animations CSS si elles n'existent pas déjà
if (!document.querySelector('#geometry-popup-animations')) {
  const style = document.createElement('style');
  style.id = 'geometry-popup-animations';
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { 
        opacity: 0;
        transform: translateY(20px);
      }
      to { 
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
}
