// =======================================================
// FICHIER :  src/popup/notes/notesPopup.js
// RÔLE    :  Popup simple pour créer des notes rapides
// =======================================================

import { getWindowControlsHtml, initializeWindowControls, getWindowControlsStyles } from '../common/windowControls.js';

/**
 * Génère le HTML pour le popup notes
 */
export function getNotesPopupHtml() {
  return `
    ${getWindowControlsStyles()}
    ${getWindowControlsHtml('Quick Note')}
    
    <div class="calc-content flex-grow" style="padding: 16px; display: flex; flex-direction: column;">
      <textarea 
        id="note-content" 
        class="note-textarea" 
        placeholder="Write your note here..."
        style="flex-grow: 1; margin-bottom: 12px; min-height: 200px;"
      ></textarea>
      
      <button id="save-note-btn" class="save-btn">
        Save Note
      </button>
    </div>
    
    <!-- Conteneur pour les notifications -->
    <div id="notification-container" class="notification-container"></div>
    
    ${getCommonStyles()}
  `;
}

function getCommonStyles() {
  return `
    <style>
      .note-textarea {
        width: 100%;
        padding: 12px;
        background-color: var(--bg-control-group);
        border: 1px solid var(--border-secondary);
        border-radius: 6px;
        color: var(--text-body);
        font-size: 14px;
        font-family: inherit;
        resize: vertical;
        transition: border-color 0.2s;
      }
      
      .note-textarea:focus {
        outline: none;
        border-color: var(--theme-accent);
      }
      
      .save-btn {
        width: 100%;
        padding: 10px 16px;
        background-color: var(--theme-accent);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .save-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(233, 30, 140, 0.3);
      }
      
      .save-btn:active {
        transform: translateY(0);
      }
      
      .save-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    </style>
  `;
}

/**
 * Initialise le popup notes
 */
export function initializeNotesPopup() {
  console.log('[Notes Popup] Initialisation...');
  
  // Initialiser les contrôles de fenêtre
  initializeWindowControls();
  
  // Initialiser le système de notifications
  initNotifications();
  
  const saveBtn = document.getElementById('save-note-btn');
  const noteContent = document.getElementById('note-content');
  
  if (!saveBtn || !noteContent) {
    console.error('[Notes Popup] Required elements not found');
    return;
  }
  
  saveBtn.addEventListener('click', async () => {
    const content = noteContent.value.trim();
    
    if (!content) {
      showNotification('Please write something before saving.', 'error');
      return;
    }
    
    try {
      // Récupérer les settings pour obtenir le chemin dataRoot
      const settings = await window.electronAPI.getSettings();
      
      if (!settings?.paths?.dataRoot) {
        showNotification('Data root folder not configured in Settings.', 'error');
        return;
      }
      
      // Créer le chemin du dossier notes
      const notesFolder = `${settings.paths.dataRoot}\\notes`;
      
      // Demander le nom du fichier
      const fileName = await showFileNamePrompt();
      
      if (fileName) {
        // Désactiver le bouton pendant la sauvegarde
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        
        // Sauvegarder la note
        const filePath = `${notesFolder}\\${fileName}.txt`;
        const saveResult = await window.electronAPI.saveFile({
          filePath: filePath,
          content: content
        });
        
        if (saveResult.success) {
          showNotification(`Note saved: ${fileName}.txt`, 'success');
          noteContent.value = ''; // Vider le textarea
        } else {
          showNotification(`Error saving note: ${saveResult.error}`, 'error');
        }
        
        // Réactiver le bouton
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Note';
      }
    } catch (error) {
      console.error('[Notes Popup] Error saving note:', error);
      showNotification(`Error: ${error.message}`, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Note';
    }
  });
}

/**
 * Initialise le système de notifications
 */
function initNotifications() {
  if (!document.getElementById('notification-container')) {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
  }
}

/**
 * Affiche une notification
 */
function showNotification(message, type = 'info', duration = 5000) {
  const container = document.getElementById('notification-container');
  if (!container) return;
  
  const notification = document.createElement('div');
  notification.className = `notification notification--${type}`;
  
  // Icône selon le type
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  
  notification.innerHTML = `
    <div class="notification__icon">${icons[type] || icons.info}</div>
    <div class="notification__content">
      <div class="notification__message">${message}</div>
    </div>
    <button class="notification__close" aria-label="Close">×</button>
  `;

  // Bouton fermer
  const closeBtn = notification.querySelector('.notification__close');
  closeBtn.addEventListener('click', () => removeNotification(notification));

  // Ajouter au conteneur
  container.appendChild(notification);

  // Animation d'entrée
  requestAnimationFrame(() => {
    notification.classList.add('notification--show');
  });

  // Auto-suppression si durée définie
  if (duration > 0) {
    setTimeout(() => removeNotification(notification), duration);
  }
}

function removeNotification(notification) {
  notification.classList.remove('notification--show');
  notification.classList.add('notification--hide');
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}

/**
 * Affiche un prompt pour demander le nom du fichier
 */
function showFileNamePrompt() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background-color: var(--bg-panel);
      border: 2px solid var(--theme-accent);
      border-radius: 8px;
      padding: 24px;
      min-width: 300px;
    `;
    
    dialog.innerHTML = `
      <h3 style="color: var(--text-title); font-size: 18px; font-weight: 600; margin-bottom: 16px;">File Name</h3>
      <input type="text" id="file-name-input" placeholder="Enter file name..." style="width: 100%; padding: 10px 12px; background-color: var(--bg-control-group); border: 1px solid var(--border-secondary); border-radius: 4px; color: var(--text-body); font-size: 14px; margin-bottom: 16px;">
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="cancel-btn" style="padding: 8px 16px; background-color: var(--bg-secondary); color: var(--text-body); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600;">Cancel</button>
        <button id="confirm-btn" style="padding: 8px 16px; background-color: var(--theme-accent); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600;">Save</button>
      </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    const input = dialog.querySelector('#file-name-input');
    const cancelBtn = dialog.querySelector('#cancel-btn');
    const confirmBtn = dialog.querySelector('#confirm-btn');
    
    input.focus();
    
    const cleanup = () => overlay.remove();
    
    cancelBtn.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
    
    confirmBtn.addEventListener('click', () => {
      const fileName = input.value.trim();
      cleanup();
      resolve(fileName || null);
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const fileName = input.value.trim();
        cleanup();
        resolve(fileName || null);
      } else if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    });
  });
}
