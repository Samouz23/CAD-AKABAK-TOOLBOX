// =======================================================
// FICHIER :  src/ipc/ordersHandlers.js
// RÔLE    :  Point d'entrée pour tous les gestionnaires IPC des commandes
// =======================================================

// Importer tous les gestionnaires
const { registerClientsHandlers } = require('./orders/clientsHandlers');
const { registerProjectsHandlers } = require('./orders/projectsHandlers');
const { registerAccountingHandlers } = require('./orders/accountingHandlers');
const { registerPdfHandlers } = require('./orders/pdfHandlers');
const { registerUtilitiesHandlers } = require('./orders/utilitiesHandlers');

// --- ENREGISTREMENT DE TOUS LES GESTIONNAIRES ---
module.exports.registerOrdersHandlers = () => {
    registerClientsHandlers();
    registerProjectsHandlers();
    registerAccountingHandlers();
    registerPdfHandlers();
    registerUtilitiesHandlers();
};
