// =======================================================
// FICHIER :  src/features.js
// RÔLE    :  Point central pour activer ou désactiver
//            les modules et fonctionnalités de l'application.
// =======================================================

// Pour activer une fonctionnalité, mettez sa valeur à 'true'.
// Pour la désactiver, mettez sa valeur à 'false'.

export const isNasEnabled = false;               // Gère la fonctionnalité SIM-DB (Synology NAS)
export const isOrdersManagerEnabled = true;      // Gère le nouveau module de Gestion de Commandes
export const isDriverOcrEnabled = false;         // Active l'import de drivers par OCR
export const isEnclosureCalculatorEnabled = false; // Active le calculateur d'enceintes dans Physics

// Export par défaut pour compatibilité
export default {
  isNasEnabled,
  isOrdersManagerEnabled,
  isDriverOcrEnabled,
  isEnclosureCalculatorEnabled,
};    