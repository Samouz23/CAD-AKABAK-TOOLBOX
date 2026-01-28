// =======================================================
// FICHIER :  src/core/nasClient.js
// RÔLE    :  Initialisation du client WebDAV pour le NAS
// =======================================================
const { createClient } = require("webdav");
const https = require('https');
const features = require('../features.js');

let synologyClient = null;

if (features.isNasEnabled) {
    try {
        // Le chemin est relatif à la racine du projet, car require résout à partir de l'emplacement du fichier
        const nasConfig = require('../js/panels/config.js'); 
        
        if (nasConfig && nasConfig.nas_ip && nasConfig.nas_user) {
            synologyClient = createClient(
                `https://${nasConfig.nas_ip}:5006`,
                {
                    username: nasConfig.nas_user,
                    password: nasConfig.nas_password,
                    // Permet d'ignorer les erreurs de certificat auto-signé
                    httpsAgent: new https.Agent({ rejectUnauthorized: false })
                }
            );
            console.log("[INFO] Client WebDAV initialisé avec succès.");
        } else {
            console.error("[ERREUR] La configuration dans './js/panels/config.js' est manquante ou invalide.");
        }
    } catch (e) {
        console.error("[ERREUR] Le fichier de configuration './js/panels/config.js' n'a pas pu être chargé. La fonctionnalité NAS est désactivée.");
        synologyClient = null;
    }
} else {
    console.log("[INFO] La fonctionnalité NAS est désactivée par la configuration.");
}

// --- EXPORTATION ---
// Exporte le client initialisé ou null si la fonctionnalité est désactivée/échouée
module.exports = { synologyClient };