/**
 * Système de notifications toast moderne
 * Remplace les alertes natives par des notifications stylées
 */

class NotificationSystem {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    // Créer le conteneur de notifications s'il n'existe pas
    if (!document.getElementById('notification-container')) {
      this.container = document.createElement('div');
      this.container.id = 'notification-container';
      this.container.className = 'notification-container';
      document.body.appendChild(this.container);
    } else {
      this.container = document.getElementById('notification-container');
    }
  }

  /**
   * Affiche une notification
   * @param {string} message - Le message à afficher
   * @param {string} type - Type: 'success', 'error', 'warning', 'info'
   * @param {number} duration - Durée en ms (0 = permanent)
   */
  show(message, type = 'info', duration = 5000) {
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
    closeBtn.addEventListener('click', () => this.remove(notification));

    // Ajouter au conteneur
    this.container.appendChild(notification);

    // Animation d'entrée
    requestAnimationFrame(() => {
      notification.classList.add('notification--show');
    });

    // Auto-suppression si durée définie
    if (duration > 0) {
      setTimeout(() => this.remove(notification), duration);
    }

    return notification;
  }

  remove(notification) {
    notification.classList.remove('notification--show');
    notification.classList.add('notification--hide');
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }

  // Méthodes raccourcies
  success(message, duration = 5000) {
    return this.show(message, 'success', duration);
  }

  error(message, duration = 7000) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration = 6000) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration = 5000) {
    return this.show(message, 'info', duration);
  }

  // Dialogue de confirmation moderne
  async confirm(message, title = 'Confirmation', { cancelLabel = 'Cancel', confirmLabel = 'Confirm' } = {}) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'notification-modal';
      modal.innerHTML = `
        <div class="notification-modal__overlay"></div>
        <div class="notification-modal__content">
          <h3 class="notification-modal__title">${title}</h3>
          <p class="notification-modal__message">${message}</p>
          <div class="notification-modal__actions">
            <button class="btn btn--ghost notification-modal__btn-cancel">${cancelLabel}</button>
            <button class="btn btn--primary notification-modal__btn-confirm">${confirmLabel}</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const overlay = modal.querySelector('.notification-modal__overlay');
      const btnCancel = modal.querySelector('.notification-modal__btn-cancel');
      const btnConfirm = modal.querySelector('.notification-modal__btn-confirm');

      const close = (result) => {
        modal.classList.add('notification-modal--closing');
        setTimeout(() => {
          document.body.removeChild(modal);
          resolve(result);
        }, 300);
      };

      overlay.addEventListener('click', () => close(false));
      btnCancel.addEventListener('click', () => close(false));
      btnConfirm.addEventListener('click', () => close(true));

      // Animation d'entrée
      requestAnimationFrame(() => {
        modal.classList.add('notification-modal--show');
      });
    });
  }
}

// Instance globale
window.notify = new NotificationSystem();

// Export pour modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotificationSystem;
}
