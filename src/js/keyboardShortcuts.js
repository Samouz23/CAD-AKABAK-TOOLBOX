/**
 * Système de raccourcis clavier adaptatif
 * Détecte automatiquement les touches pressées et les associe aux actions
 */

class KeyboardShortcutManager {
  constructor() {
    this.shortcuts = new Map();
    this.recordingMode = false;
    this.recordingAction = null;
    this.currentKeys = new Set();
    this.init();
  }

  init() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    document.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  /**
   * Normalise la combinaison de touches en string
   */
  normalizeKey(event) {
    const parts = [];
    
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    
    // Ajouter la touche principale (pas les modificateurs)
    const key = event.key.toLowerCase();
    if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
      parts.push(key);
    }
    
    return parts.join('+');
  }

  /**
   * Enregistrer un raccourci
   * @param {string} action - Nom de l'action
   * @param {Function} callback - Fonction à exécuter
   * @param {string} defaultShortcut - Raccourci par défaut (optionnel)
   */
  register(action, callback, defaultShortcut = null) {
    this.shortcuts.set(action, {
      callback,
      shortcut: defaultShortcut,
      description: action
    });
  }

  /**
   * Assigner un raccourci à une action
   */
  assignShortcut(action, shortcutString) {
    const shortcutData = this.shortcuts.get(action);
    if (shortcutData) {
      shortcutData.shortcut = shortcutString;
      this.saveToLocalStorage();
    }
  }

  /**
   * Gérer l'événement keydown
   */
  handleKeyDown(event) {
    // Ne pas intercepter dans les inputs/textarea/contenteditable
    const targetTag = event.target.tagName;
    const isEditable = event.target.isContentEditable;
    
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag) || isEditable) {
      // Autoriser uniquement les raccourcis avec Ctrl/Alt/Meta ET vérifier qu'il y a bien un raccourci enregistré
      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        return; // Laisser passer la frappe normale
      }
      
      // Vérifier si ce combo est effectivement un raccourci enregistré
      const keyCombo = this.normalizeKey(event);
      let hasShortcut = false;
      for (const [action, data] of this.shortcuts.entries()) {
        if (data.shortcut === keyCombo) {
          hasShortcut = true;
          break;
        }
      }
      
      // Si aucun raccourci n'est enregistré pour cette combinaison, laisser passer
      if (!hasShortcut) {
        return;
      }
    }

    const keyCombo = this.normalizeKey(event);
    
    // Vérifier si ce raccourci correspond à une action
    for (const [action, data] of this.shortcuts.entries()) {
      if (data.shortcut === keyCombo) {
        event.preventDefault();
        event.stopPropagation();
        data.callback(event);
        return;
      }
    }
  }

  handleKeyUp(event) {
    const key = event.key?.toLowerCase?.();
    if (key) {
      this.currentKeys.delete(key);
    }
  }

  /**
   * Sauvegarder les raccourcis dans localStorage
   */
  saveToLocalStorage() {
    const data = {};
    for (const [action, shortcutData] of this.shortcuts.entries()) {
      data[action] = shortcutData.shortcut;
    }
    localStorage.setItem('keyboardShortcuts', JSON.stringify(data));
  }

  /**
   * Charger les raccourcis depuis localStorage
   */
  loadFromLocalStorage() {
    const saved = localStorage.getItem('keyboardShortcuts');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        for (const [action, shortcut] of Object.entries(data)) {
          if (this.shortcuts.has(action)) {
            this.shortcuts.get(action).shortcut = shortcut;
          }
        }
      } catch (error) {
        console.error('Erreur lors du chargement des raccourcis:', error);
      }
    }
  }

  /**
   * Obtenir la liste des raccourcis
   */
  getShortcutsList() {
    const list = [];
    for (const [action, data] of this.shortcuts.entries()) {
      list.push({
        action,
        shortcut: data.shortcut || 'Non assigné',
        description: data.description
      });
    }
    return list;
  }

  /**
   * Réinitialiser tous les raccourcis
   */
  reset() {
    for (const [action, data] of this.shortcuts.entries()) {
      data.shortcut = null;
    }
    localStorage.removeItem('keyboardShortcuts');
  }
}

// Instance globale
window.keyboardShortcuts = new KeyboardShortcutManager();

// Initialisation à vide - les raccourcis seront configurés depuis Waveguide Studio
document.addEventListener('DOMContentLoaded', () => {
  const km = window.keyboardShortcuts;
  
  // Charger les raccourcis sauvegardés depuis le localStorage
  km.loadFromLocalStorage();
  
  console.log('Raccourcis clavier chargés:', km.getShortcutsList());
});

// Export pour modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KeyboardShortcutManager;
}
