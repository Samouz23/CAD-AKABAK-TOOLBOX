// =======================================================
// FICHIER :  src/popup/mesh/meshSelector.js
// RÔLE    :  Fenêtre de sélection des outils Mesh à ouvrir en popup
// =======================================================

export function showMeshToolSelector() {
  const overlay = document.createElement('div');
  overlay.id = 'mesh-tool-selector-overlay';
  overlay.className = 'fixed inset-0 flex items-center justify-center z-[9999]';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';

  const dialog = document.createElement('div');
  dialog.className = 'p-8 rounded-lg shadow-2xl max-w-md w-full mx-4';
  dialog.style.backgroundColor = 'var(--bg-panel)';
  dialog.style.border = '2px solid var(--theme-accent)';

  dialog.innerHTML = `
    <h2 class="text-2xl font-bold mb-6 text-center" style="color: var(--theme-accent)">
      Choose Physical Tool
    </h2>
    <div class="space-y-3 mb-6">
      <label class="flex items-center p-4 rounded-lg cursor-pointer transition-all hover:bg-gray-700/50" 
             style="border: 2px solid transparent;">
        <input type="radio" name="mesh-tool" value="meshing" class="form-radio mr-3" checked>
        <div>
          <div class="font-bold text-white">Physical (Gmsh)</div>
          <div class="text-sm text-gray-400">Build physical groups with preview and export controls</div>
        </div>
      </label>
      <label class="flex items-center p-4 rounded-lg cursor-pointer transition-all hover:bg-gray-700/50"
             style="border: 2px solid transparent;">
        <input type="radio" name="mesh-tool" value="frequency-list" class="form-radio mr-3">
        <div>
          <div class="font-bold text-white">Frequency List</div>
          <div class="text-sm text-gray-400">Generate and manage frequency lists</div>
        </div>
      </label>
    </div>
    <div class="flex justify-end gap-3">
      <button id="mesh-selector-cancel" class="px-6 py-2 rounded-md font-medium transition-colors"
              style="background-color: var(--bg-secondary); color: white;">
        Cancel
      </button>
      <button id="mesh-selector-open" class="px-6 py-2 rounded-md font-medium transition-colors"
              style="background-color: var(--theme-accent); color: white;">
        Open
      </button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Hover effects
  const labels = dialog.querySelectorAll('label');
  labels.forEach(label => {
    const radio = label.querySelector('input[type="radio"]');
    
    label.addEventListener('mouseenter', () => {
      label.style.borderColor = 'var(--theme-accent)';
      label.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
    });
    
    label.addEventListener('mouseleave', () => {
      if (!radio.checked) {
        label.style.borderColor = 'transparent';
        label.style.backgroundColor = '';
      }
    });

    radio.addEventListener('change', () => {
      labels.forEach(l => {
        l.style.borderColor = 'transparent';
        l.style.backgroundColor = '';
      });
      if (radio.checked) {
        label.style.borderColor = 'var(--theme-accent)';
        label.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
      }
    });

    if (radio.checked) {
      label.style.borderColor = 'var(--theme-accent)';
      label.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
    }
  });

  // Buttons
  const cancelBtn = dialog.querySelector('#mesh-selector-cancel');
  const openBtn = dialog.querySelector('#mesh-selector-open');

  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  openBtn.addEventListener('click', () => {
    const selected = dialog.querySelector('input[name="mesh-tool"]:checked');
    if (selected) {
      const toolName = `mesh-${selected.value}`;
      window.electronAPI.openToolInNewWindow(toolName);
      document.body.removeChild(overlay);
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
}
