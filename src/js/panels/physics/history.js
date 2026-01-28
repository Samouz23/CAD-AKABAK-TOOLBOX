// =================================================================================
// FICHIER : src/js/panels/physics/history.js
// RÔLE    : Gestion de l'historique des calculs avec sauvegarde/chargement
// =================================================================================

import { PhysicsIcons } from './icons.js';

const STORAGE_KEY = 'physics_calculation_history';
let historyData = [];

export function getHistoryHtml() {
  return `
    <div class="space-y-6">
      
      <section class="calc-section">
        <div class="flex justify-between items-center mb-4">
          <h2 class="calc-title mb-0">Calculation History</h2>
          <div class="flex space-x-2">
            <button id="export-history" class="action-btn text-sm flex items-center space-x-1">
              ${PhysicsIcons.export}
              <span>Export</span>
            </button>
            <button id="import-history" class="action-btn text-sm flex items-center space-x-1">
              ${PhysicsIcons.import}
              <span>Import</span>
            </button>
            <button id="clear-history" class="btn btn--ghost text-sm text-red-400 flex items-center space-x-1">
              ${PhysicsIcons.delete}
              <span>Clear All</span>
            </button>
          </div>
        </div>

        <!-- Search/Filter -->
        <div class="mb-4 relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            ${PhysicsIcons.search}
          </div>
          <input 
            type="text" 
            id="history-search" 
            class="form-input pl-10" 
          >
        </div>

        <!-- History List -->
        <div id="history-list" class="space-y-2 max-h-[600px] overflow-y-auto">
          <!-- History items will be populated here -->
        </div>

        <div id="history-empty" class="text-center py-12 text-gray-500 hidden">
          <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="text-lg">No calculations saved yet</p>
        </div>

      </section>

      <!-- Statistics -->
      <section class="calc-section">
        <h2 class="calc-title">Statistics</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-gray-800 p-4 rounded text-center">
            <div class="text-3xl font-bold text-pink-600" id="stat-total">0</div>
            <div class="text-xs text-gray-400 mt-1">Total</div>
          </div>
          <div class="bg-gray-800 p-4 rounded text-center">
            <div class="text-3xl font-bold text-green-400" id="stat-today">0</div>
            <div class="text-xs text-gray-400 mt-1">Today</div>
          </div>
          <div class="bg-gray-800 p-4 rounded text-center">
            <div class="text-3xl font-bold text-yellow-400" id="stat-week">0</div>
            <div class="text-xs text-gray-400 mt-1">Week</div>
          </div>
          <div class="bg-gray-800 p-4 rounded text-center">
            <div class="text-lg font-bold text-blue-400" id="stat-favorite">-</div>
            <div class="text-xs text-gray-400 mt-1">Most Used</div>
          </div>
        </div>
      </section>

      <!-- Hidden file input for import -->
      <input type="file" id="history-file-input" accept=".json" class="hidden">

    </div>
  `;
}

export function initializeHistory() {
  loadHistory();
  renderHistory();
  updateStatistics();

  // Search functionality
  const searchInput = document.getElementById('history-search');
  searchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    renderHistory(query);
  });

  // Clear all history
  document.getElementById('clear-history')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all calculation history? This cannot be undone.')) {
      historyData = [];
      saveHistory();
      renderHistory();
      updateStatistics();
    }
  });

  // Export history
  document.getElementById('export-history')?.addEventListener('click', () => {
    exportHistory();
  });

  // Import history
  document.getElementById('import-history')?.addEventListener('click', () => {
    document.getElementById('history-file-input').click();
  });

  document.getElementById('history-file-input')?.addEventListener('change', (e) => {
    importHistory(e.target.files[0]);
  });
}

export function addToHistory(calculationType, details) {
  const entry = {
    id: Date.now(),
    type: calculationType,
    details: details,
    timestamp: new Date().toISOString(),
    favorite: false
  };

  historyData.unshift(entry); // Add to beginning
  
  // Keep only last 500 entries
  if (historyData.length > 500) {
    historyData = historyData.slice(0, 500);
  }

  saveHistory();
  renderHistory();
  updateStatistics();

  // Show success notification
  showNotification('Saved to history ✓');
}

function loadHistory() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      historyData = JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load history:', error);
    historyData = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyData));
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

function renderHistory(searchQuery = '') {
  const listContainer = document.getElementById('history-list');
  const emptyState = document.getElementById('history-empty');
  
  if (!listContainer) return;

  let filteredData = historyData;
  
  // Apply search filter
  if (searchQuery) {
    filteredData = historyData.filter(entry => {
      const searchStr = `${entry.type} ${entry.details} ${formatDate(entry.timestamp)}`.toLowerCase();
      return searchStr.includes(searchQuery);
    });
  }

  if (filteredData.length === 0) {
    listContainer.innerHTML = '';
    emptyState?.classList.remove('hidden');
    return;
  }

  emptyState?.classList.add('hidden');

  listContainer.innerHTML = filteredData.map(entry => `
    <div class="history-item bg-gray-800 p-4 rounded flex items-start justify-between hover:bg-gray-750 transition-colors" data-id="${entry.id}">
      <div class="flex-grow">
        <div class="flex items-center space-x-2 mb-1">
          <span class="font-semibold text-pink-600">${entry.type}</span>
          ${entry.favorite ? `<span class="text-yellow-400">${PhysicsIcons.star}</span>` : ''}
        </div>
        <div class="text-sm text-gray-300">${entry.details}</div>
        <div class="text-xs text-gray-500 mt-1">${formatDate(entry.timestamp)}</div>
      </div>
      <div class="flex space-x-2 ml-4">
        <button class="toggle-favorite-btn text-gray-400 hover:text-yellow-400 transition-colors" data-id="${entry.id}" title="Toggle favorite">
          ${entry.favorite ? PhysicsIcons.star : PhysicsIcons.starOutline}
        </button>
        <button class="copy-history-btn text-gray-400 hover:text-green-400 transition-colors" data-id="${entry.id}" title="Copy to clipboard">
          ${PhysicsIcons.copy}
        </button>
        <button class="delete-history-btn text-gray-400 hover:text-red-400 transition-colors" data-id="${entry.id}" title="Delete">
          ${PhysicsIcons.delete}
        </button>
      </div>
    </div>
  `).join('');

  // Attach event listeners
  listContainer.querySelectorAll('.delete-history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      deleteHistoryItem(id);
    });
  });

  listContainer.querySelectorAll('.copy-history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      copyHistoryItem(id);
    });
  });

  listContainer.querySelectorAll('.toggle-favorite-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      toggleFavorite(id);
    });
  });
}

function deleteHistoryItem(id) {
  historyData = historyData.filter(entry => entry.id !== id);
  saveHistory();
  renderHistory();
  updateStatistics();
}

function copyHistoryItem(id) {
  const entry = historyData.find(e => e.id === id);
  if (entry) {
    const text = `${entry.type}\n${entry.details}\n${formatDate(entry.timestamp)}`;
    navigator.clipboard.writeText(text).then(() => {
      showNotification('Copied to clipboard ✓');
    }).catch(() => {
      showNotification('Failed to copy', 'error');
    });
  }
}

function toggleFavorite(id) {
  const entry = historyData.find(e => e.id === id);
  if (entry) {
    entry.favorite = !entry.favorite;
    saveHistory();
    renderHistory();
    updateStatistics();
  }
}

function updateStatistics() {
  const totalEl = document.getElementById('stat-total');
  const todayEl = document.getElementById('stat-today');
  const weekEl = document.getElementById('stat-week');
  const favoriteEl = document.getElementById('stat-favorite');

  if (!totalEl) return;

  const total = historyData.length;
  const today = historyData.filter(e => isToday(new Date(e.timestamp))).length;
  const week = historyData.filter(e => isThisWeek(new Date(e.timestamp))).length;

  // Find most used calculator type
  const typeCounts = {};
  historyData.forEach(e => {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  });
  const mostUsed = Object.keys(typeCounts).reduce((a, b) => 
    typeCounts[a] > typeCounts[b] ? a : b, '-'
  );

  totalEl.textContent = total;
  todayEl.textContent = today;
  weekEl.textContent = week;
  favoriteEl.textContent = mostUsed.split(' ')[0] || '-';
}

function exportHistory() {
  const dataStr = JSON.stringify(historyData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `physics-history-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showNotification('History exported ✓');
}

function importHistory(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (Array.isArray(imported)) {
        // Merge with existing history
        const existingIds = new Set(historyData.map(h => h.id));
        const newEntries = imported.filter(entry => !existingIds.has(entry.id));
        
        historyData = [...historyData, ...newEntries];
        historyData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        saveHistory();
        renderHistory();
        updateStatistics();
        
        showNotification(`Imported ${newEntries.length} new entries ✓`);
      } else {
        throw new Error('Invalid format');
      }
    } catch (error) {
      console.error('Import failed:', error);
      showNotification('Import failed - invalid file format', 'error');
    }
  };
  reader.readAsText(file);
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isToday(date) {
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
}

function isThisWeek(date) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return date >= weekAgo && date <= now;
}

function showNotification(message, type = 'success') {
  // Simple notification - you can enhance this with your notification system
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 px-6 py-3 rounded shadow-lg z-50 ${
    type === 'success' ? 'bg-green-600' : 'bg-red-600'
  } text-white flex items-center space-x-2`;
  
  const icon = type === 'success' 
    ? '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>'
    : '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>';
  
  notification.innerHTML = icon + `<span>${message}</span>`;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
