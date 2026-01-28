// =======================================================
// FICHIER : src/js/panels/manual.js
// =======================================================

const MANUAL_CONTENT = {
  en: {
    langLabel: 'Français',
    sections: [
      {
        title: 'Global',
        content: `
          <p><strong>This application is an assistant for speaker enclosure design.</strong> It was created to work with CAD software, AKABAK, as well as with the GMSH meshing application.</p>
          <h4 class="text-lg font-semibold text-white">Global Features</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Field Calculations:</strong> In the <strong>Geometry</strong>, <strong>Physics</strong> and <strong>Horn Expansion</strong> tools, you can enter calculations (e.g. <code>550*2-(8/11)</code>) in most fields. Press <strong>Enter</strong> to display the result.</li>
            <li><strong>Pop-out Windows:</strong> All tools have a button to open in a separate window. An option in the settings allows you to keep these windows "always on top".</li>
            <li><strong>Simplified Popups:</strong> Many tools (Driver Database, Mesh, Geometry, Notes) feature streamlined popup windows with optimized layouts for quick access to essential functions.</li>
            <li><strong>Escape Key:</strong> The Escape (Esc) key generally closes menus or modal windows.</li>
            <li><strong>Shift+Scroll:</strong> The Shift+Scroll key combination allows you to move faster in supported fields.</li>
          </ul>
        `
      },
      {
        title: 'Settings',
        content: `
          <p>This page allows you to configure the global operation of the application.</p>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Updates:</strong> Displays a log of the latest application changes.</li>
            <li><strong>Access Paths:</strong> Crucial section to link the Toolbox to your other software (Gmsh, working folders for imports/exports).</li>
            <li><strong>Display & Windows:</strong> Allows you to change the interface size (Small/Normal/Large) and manage the "always on top" option for pop-out windows.</li>
            <li><strong>UI Options:</strong> Customize the appearance with multiple color themes (Blue, Fire, White, Green), enable/disable scanlines effect, reduce animations, and choose button style (Striped or Solid).</li>
            <li><strong>Formula Templates:</strong> Modify LEM formula templates for Duct-Script and Horn-Script according to your preferences.</li>
            <li><strong>Shortcuts:</strong> Customize keyboard shortcuts for Waveguide Studio and main application functions.</li>
          </ul>
        `
      },
      {
        title: 'Geometry',
        content: `
          <p>A set of quick calculators for common geometric conversions and calculations.</p>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Unit Selector (mm/cm):</strong> Switch between millimeters and centimeters for calculations.</li>
            <li><strong>Interactive Calculators:</strong> Calculate volumes (parallelepiped, prism), convert diameter to area, or metric units to inches. Fields update automatically.</li>
          </ul>
        `
      },
      {
        title: 'Physics',
        content: `
          <p>Calculators dedicated to acoustic and electrical physics.</p>
          <h4 class="text-lg font-semibold text-white">Basic Calculators</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>P = U²/R Converter:</strong> Check the box for the value you want to find (Power, Resistance or Voltage).</li>
            <li><strong>Parallel Resistances:</strong> Calculates total impedance and automatically reports the result to the P=U²/R converter.</li>
            <li><strong>Frequency & Wavelength:</strong> Filling one field instantly updates all others (wavelength, 1/2, 1/4...).</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">SPL Calculator</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Sound level calculation:</strong> Calculate SPL (Sound Pressure Level) based on speaker sensitivity, input power, distance and number of speakers.</li>
            <li><strong>Interactive graph:</strong> Visualize the SPL curve as a function of distance with real-time update.</li>
            <li><strong>Color coding:</strong> Result changes color according to level (green < 85dB, yellow 85-100dB, orange 100-115dB, red > 115dB).</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Crossover Calculator</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Passive filters:</strong> Calculate component values (inductors, capacitors, resistors) for low-pass, high-pass or band-pass filters.</li>
            <li><strong>Topologies:</strong> Butterworth or Linkwitz-Riley, orders 1 to 4 (6 to 24 dB/octave).</li>
            <li><strong>Circuit diagrams:</strong> Visualize the filter schematic with calculated component values.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Enclosure Calculator</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Import from Driver Database:</strong> Select a driver from your database to automatically load its T&S parameters.</li>
            <li><strong>Sealed Enclosure:</strong> Calculate optimal volume according to different alignments (Qtc target, Butterworth, Bessel, etc.).</li>
            <li><strong>Bass-Reflex Enclosure:</strong> Vent sizing (diameter, length) and tuning frequency calculation with frequency response graphs.</li>
            <li><strong>Comparative graphs:</strong> Visualize and compare frequency responses of different configurations.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Calculation History</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Automatic save:</strong> All calculators allow you to save your calculations to history with a "Save to History" button.</li>
            <li><strong>Search and filtering:</strong> Easily find your previous calculations by type or text search.</li>
            <li><strong>Import/Export:</strong> Export your history in JSON to share or save it, and import existing histories.</li>
          </ul>
        `
      },
      {
        title: 'Mesh & Frequency',
        content: `
          <p>The interface to control the Gmsh meshing software and to generate frequency lists for simulations.</p>
          <h4 class="text-lg font-semibold text-white">Meshing (Gmsh)</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Manual/Auto Mode:</strong> Mesh all .step files in a folder (auto) or select a specific file (manual).</li>
            <li><strong>Series Mode:</strong> Launch multiple meshes of the same file with different mesh sizes (clmax) at once.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white">Frequency List</h4>
          <ul class="list-disc list-inside space-y-2">
            <li>Generate an optimized frequency list (with "zoom" zones at higher resolution) and copy it for your simulation software.</li>
          </ul>
        `
      },
      {
        title: 'Driver Database',
        content: `
          <p>Manage and consult your speaker driver database with advanced import and analysis tools.</p>
          
          <h4 class="text-lg font-semibold text-white">Search and Navigation</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Search by name:</strong> Quickly find a driver by typing its name in the search bar.</li>
            <li><strong>Advanced filters:</strong> Filter drivers by T&S parameter ranges (SD, Mms, fs, Qms, Re, BL, Le). Check desired parameters and set min/max values.</li>
            <li><strong>Virtualized list:</strong> Smooth navigation even with thousands of drivers thanks to performance optimization.</li>
          </ul>
          
          <h4 class="text-lg font-semibold text-white mt-4">Find Similar</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Smart comparison:</strong> Select a driver and click "Find Similar" to find drivers with similar parameters.</li>
            <li><strong>Normalized scoring:</strong> Results display a percentage difference based on selected parameters (SD, fs, Qms, etc.).</li>
            <li><strong>Customization:</strong> Choose which parameters to compare and the number of results (up to 10).</li>
            <li><strong>Difference details:</strong> View percentage differences for each compared parameter.</li>
          </ul>
          
          <h4 class="text-lg font-semibold text-white mt-4">Driver Import</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Manual import:</strong> Create a new driver sheet by filling in T&S parameters (SD, Mms, fs, Qms, Re, BL, Le, Volume).</li>
            <li><strong>Image import (OCR):</strong> Drag and drop a datasheet image and OCR automatically extracts parameters. Supports multiple formats and various units (mH, µH, cm², mm², g, kg, etc.).</li>
            <li><strong>Web Scrapper:</strong> Import drivers directly from online database https://loudspeakerdatabase.com. Select a brand, filter by membrane size (min/max or specific sizes), and launch scraping. Data is automatically extracted and added to your database.</li>
          </ul>
          
          <h4 class="text-lg font-semibold text-white mt-4">Sheet Management</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Editing:</strong> Directly modify driver sheet content and save your changes.</li>
            <li><strong>Copy:</strong> Copy sheet content to clipboard for use elsewhere.</li>
            <li><strong>Deletion:</strong> Permanently delete a driver from the database.</li>
            <li><strong>Smart parsing:</strong> System automatically recognizes different units and notation formats (comma/decimal points, scientific notations, comments).</li>
          </ul>
        `
      },
      {
        title: 'Notes',
        content: `
          <p>A simple file manager to organize your notes, images and documents related to your projects.</p>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Tree structure:</strong> Navigate through your notes folders.</li>
            <li><strong>Preview:</strong> Display .txt files, images (jpg, png...) and PDFs.</li>
            <li><strong>Editing:</strong> Modify and save your notes (.txt) directly in the application.</li>
          </ul>
        `
      },
      {
        title: 'Horn Expansion',
        content: `
          <p>Visual horn design tool based on segments. It allows you to compare manual geometry with ideal mathematical expansion laws.</p>
          <ul class="list-disc list-inside">
            <li><strong>Interactive graph:</strong> Visualizes your segments (solid lines) and the ideal curves (dotted lines) you select (Conical, Hypex, etc.).</li>
            <li><strong>Best-Fit:</strong> Analyzes your profile and calculates a similarity score (in %) for each mathematical law, helping you identify the closest theoretical profile.</li>
            <li><strong>Export To:</strong> Sends data to "Horn-Script", "Waveguide Studio", or "Directivity". When exporting to Directivity, the tool automatically calculates wall angles, expansion type, and cutoff frequency for advanced horn analysis.</li>
          </ul>
        `
      },
      {
        title: 'Directivity',
        content: `
          <p>Advanced directivity calculator for horns and waveguides with two operating modes.</p>
          <h4 class="text-lg font-semibold text-white">Simple Mode (Piston)</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Rectangular piston model:</strong> Calculates directivity based on mouth dimensions only (width × height).</li>
            <li><strong>Quick analysis:</strong> Provides beamwidth angles and Q-factor across frequency range (100 Hz - 16 kHz).</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Pro Mode (Hybrid Horn)</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Import from Horn Expansion:</strong> Click "Export To → Directivity" in Horn Expansion to automatically import horn geometry, wall angles, expansion type, and cutoff frequency.</li>
            <li><strong>Advanced modeling:</strong> Combines diffraction (low frequency) and geometric control (high frequency) for realistic horn behavior.</li>
            <li><strong>Expansion-aware:</strong> Takes into account expansion type (Conical, Exponential, Hypex, Parabolic, OS) for accurate predictions.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Visualization</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Results table:</strong> Displays horizontal/vertical beamwidth and Q-factor for each frequency.</li>
            <li><strong>Polar plot:</strong> Interactive polar diagram showing radiation pattern at selected frequency.</li>
            <li><strong>Heatmap:</strong> Frequency vs. angle visualization with color-coded directivity response.</li>
          </ul>
        `
      },
      {
        title: 'Waveguide Studio',
        content: `
          <p>Advanced parametric 3D design studio for waveguides and horns.</p>
          <ul class="list-disc list-inside">
            <li><strong>Profile and section design:</strong> The guide is generated from an expansion law (profile) and a section shape (defined by the "superformula").</li>
            <li><strong>3D/2D Visualization:</strong> An interactive 3D view allows you to visualize the waveguide, and a 2D view shows the section shape.</li>
            <li><strong>Export:</strong> Export geometry in <code>.STL</code> (3D printing), <code>.CSV</code> (coordinates) or <code>.MSH</code> (simulation).</li>
          </ul>
        `
      },
      {
        title: 'Script LEM Horn',
        content: `
          <p>LEM script generator for Akabak software, specialized in horn modeling.</p>
          <ul class="list-disc list-inside">
            <li><strong>Segment-based:</strong> Script is generated from a segment table.</li>
            <li><strong>Modules:</strong> Add pre-configured script blocks for rear load (Enclosure), bass-reflex (Vented Enclosure) or transmission line starter (Amorce TL).</li>
            <li><strong>Global copy:</strong> The "Copy formula" button assembles the complete script (driver + segments + modules) and copies it.</li>
          </ul>
        `
      },
      {
        title: 'Script LEM Duct',
        content: `
          <p>LEM script generator for Akabak, specialized in ducts and vents with variable section.</p>
          <ul class="list-disc list-inside">
            <li><strong>Ducts/Transitions structure:</strong> Define a succession of rectangular sections (Ducts) and the type of connection between them (Waveguide or Mass).</li>
            <li><strong>Copy by element:</strong> Click on the number of a duct or transition to copy only the LEM formula for that element.</li>
            <li><strong>Global copy:</strong> The "Copy Complete Script" button generates and copies the LEM script for the entire structure.</li>
          </ul>
        `
      }
    ]
  },
  fr: {
    langLabel: 'English',
    sections: [
      {
        title: 'Global',
        content: `
          <p><strong>Cette application est un assistant pour la conception d'enceintes.</strong> Elle a été créée pour fonctionner avec un logiciel de CAO, AKABAK, ainsi qu'avec l'application de maillage GMSH.</p>
          <h4 class="text-lg font-semibold text-white">Fonctionnalités Globales</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Calcul dans les champs :</strong> Dans les outils <strong>Geometry</strong>, <strong>Physics</strong> et <strong>Horn Expansion</strong>, vous pouvez saisir des calculs (ex: <code>550*2-(8/11)</code>) dans la plupart des cases. Appuyez sur <strong>Entrée</strong> pour que le résultat s'affiche.</li>
            <li><strong>Fenêtres Pop-out :</strong> Tous les outils disposent d'un bouton pour s'ouvrir dans une fenêtre séparée. Une option dans les réglages permet de garder ces fenêtres "toujours au premier plan".</li>
            <li><strong>Popups Simplifiés :</strong> De nombreux outils (Driver Database, Mesh, Geometry, Notes) disposent de fenêtres popup optimisées avec des interfaces épurées pour un accès rapide aux fonctions essentielles.</li>
            <li><strong>Touche Échap :</strong> La touche Échap (Esc) permet généralement de fermer les menus ou les fenêtres modales.</li>
            <li><strong>Touche Shift+Scroll :</strong> La combinaison de touche Shift+Scroll permet, dans les cases qui le permettent de se déplacer plus rapidement.</li>
          </ul>
        `
      },
      {
        title: 'Settings',
        content: `
          <p>Cette page vous permet de configurer le fonctionnement global de l'application.</p>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Mises à jour :</strong> Affiche un journal des dernières modifications de l'application.</li>
            <li><strong>Chemins d'Accès :</strong> Section cruciale pour lier la Toolbox à vos autres logiciels (Gmsh, dossiers de travail pour les imports/exports).</li>
            <li><strong>Affichage & Fenêtres :</strong> Permet de changer la taille de l'interface (Small/Normal/Large) et de gérer l'option "toujours au premier plan" des fenêtres pop-out.</li>
            <li><strong>Options UI :</strong> Personnalisez l'apparence avec plusieurs thèmes de couleur (Blue, Fire, White, Green), activez/désactivez l'effet scanlines, réduisez les animations et choisissez le style des boutons (Striped ou Solid).</li>
            <li><strong>Formula Templates :</strong> Modifiez les modèles de formules LEM pour Duct-Script et Horn-Script selon vos préférences.</li>
            <li><strong>Raccourcis :</strong> Personnalisez les raccourcis clavier pour Waveguide Studio et les fonctions principales de l'application.</li>
          </ul>
        `
      },
      {
        title: 'Geometry',
        content: `
          <p>Un ensemble de calculateurs rapides pour les conversions et calculs géométriques courants.</p>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Sélecteur d'unité (mm/cm) :</strong> Basculez entre millimètres et centimètres pour les calculs.</li>
            <li><strong>Calculateurs interactifs :</strong> Calculez des volumes (parallélépipède, prisme), convertissez un diamètre en aire, ou des unités métriques en pouces. Les champs se mettent à jour automatiquement.</li>
          </ul>
        `
      },
      {
        title: 'Physics',
        content: `
          <p>Des calculateurs dédiés à la physique acoustique et électrique.</p>
          <h4 class="text-lg font-semibold text-white">Calculateurs de Base</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Convertisseur P = U²/R :</strong> Cochez la case de la valeur que vous souhaitez trouver (Puissance, Résistance ou Tension).</li>
            <li><strong>Résistances en Parallèle :</strong> Calcule l'impédance totale et reporte automatiquement le résultat dans le convertisseur P=U²/R.</li>
            <li><strong>Fréquence & Longueur d'onde :</strong> Remplir un champ met à jour instantanément tous les autres (longueur d'onde, 1/2, 1/4...).</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">SPL Calculator</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Calcul de niveau sonore :</strong> Calculez le SPL (Sound Pressure Level) en fonction de la sensibilité du haut-parleur, de la puissance d'entrée, de la distance et du nombre d'enceintes.</li>
            <li><strong>Graphique interactif :</strong> Visualisez la courbe SPL en fonction de la distance avec mise à jour en temps réel.</li>
            <li><strong>Code couleur :</strong> Le résultat change de couleur selon le niveau (vert < 85dB, jaune 85-100dB, orange 100-115dB, rouge > 115dB).</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Crossover Calculator</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Filtres passifs :</strong> Calculez les valeurs des composants (inductances, condensateurs, résistances) pour des filtres passe-bas, passe-haut ou passe-bande.</li>
            <li><strong>Topologies :</strong> Butterworth ou Linkwitz-Riley, ordres 1 à 4 (6 à 24 dB/octave).</li>
            <li><strong>Diagrammes de circuit :</strong> Visualisez le schéma du filtre avec les valeurs des composants calculées.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Enclosure Calculator</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Import depuis Driver Database :</strong> Sélectionnez un driver de votre base de données pour charger automatiquement ses paramètres T&S.</li>
            <li><strong>Enceinte Close :</strong> Calcul du volume optimal selon différents alignements (Qtc target, Butterworth, Bessel, etc.).</li>
            <li><strong>Enceinte Bass-Reflex :</strong> Dimensionnement de l'évent (diamètre, longueur) et calcul de la fréquence d'accord avec graphiques de réponse en fréquence.</li>
            <li><strong>Graphiques comparatifs :</strong> Visualisez et comparez les réponses en fréquence de différentes configurations.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Historique des Calculs</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Sauvegarde automatique :</strong> Tous les calculateurs permettent de sauvegarder vos calculs dans l'historique avec un bouton "Save to History".</li>
            <li><strong>Recherche et filtrage :</strong> Retrouvez facilement vos calculs précédents par type ou par recherche textuelle.</li>
            <li><strong>Import/Export :</strong> Exportez votre historique en JSON pour le partager ou le sauvegarder, et importez des historiques existants.</li>
          </ul>
        `
      },
      {
        title: 'Mesh & Frequency',
        content: `
          <p>L'interface pour contrôler le logiciel de maillage Gmsh et pour générer des listes de fréquences pour les simulations.</p>
          <h4 class="text-lg font-semibold text-white">Maillage (Gmsh)</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Mode Manuel/Auto :</strong> Maillez tous les fichiers .step d'un dossier (auto) ou sélectionnez un fichier spécifique (manuel).</li>
            <li><strong>Mode Série :</strong> Lancez plusieurs maillages d'un même fichier avec différentes tailles de maille (clmax) en une seule fois.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white">Frequency List</h4>
          <ul class="list-disc list-inside space-y-2">
            <li>Générez une liste de fréquences optimisée (avec des zones de "zoom" à plus haute résolution) et copiez-la pour votre logiciel de simulation.</li>
          </ul>
        `
      },
      {
        title: 'Driver Database',
        content: `
          <p>Gérez et consultez votre base de données de haut-parleurs avec des outils avancés d'importation et d'analyse.</p>
          
          <h4 class="text-lg font-semibold text-white">Recherche et Navigation</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Recherche par nom :</strong> Trouvez rapidement un driver en tapant son nom dans la barre de recherche.</li>
            <li><strong>Filtres avancés :</strong> Filtrez les drivers par plages de paramètres T&S (SD, Mms, fs, Qms, Re, BL, Le). Cochez les paramètres souhaités et définissez des valeurs min/max.</li>
            <li><strong>Liste virtualisée :</strong> Navigation fluide même avec des milliers de drivers grâce à l'optimisation de performance.</li>
          </ul>
          
          <h4 class="text-lg font-semibold text-white mt-4">Find Similar</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Comparaison intelligente :</strong> Sélectionnez un driver et cliquez sur "Find Similar" pour trouver des drivers avec des paramètres similaires.</li>
            <li><strong>Scoring normalisé :</strong> Les résultats affichent un pourcentage de différence basé sur les paramètres sélectionnés (SD, fs, Qms, etc.).</li>
            <li><strong>Personnalisation :</strong> Choisissez quels paramètres comparer et le nombre de résultats (jusqu'à 10).</li>
            <li><strong>Détails des écarts :</strong> Visualisez les différences en pourcentage pour chaque paramètre comparé.</li>
          </ul>
          
          <h4 class="text-lg font-semibold text-white mt-4">Importation de Drivers</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Import manuel :</strong> Créez une nouvelle fiche driver en remplissant les paramètres T&S (SD, Mms, fs, Qms, Re, BL, Le, Volume).</li>
            <li><strong>Import par image (OCR) :</strong> Glissez-déposez une image de fiche technique et l'OCR extrait automatiquement les paramètres. Supporte les formats multiples et les unités variées (mH, µH, cm², mm², g, kg, etc.).</li>
            <li><strong>Web Scrapper :</strong> Importez des drivers directement depuis la base de données en ligne https://loudspeakerdatabase.com. Sélectionnez une marque, filtrez par taille de membrane (min/max ou tailles spécifiques), et lancez le scrapping. Les données sont extraites automatiquement et ajoutées à votre base.</li>
          </ul>
          
          <h4 class="text-lg font-semibold text-white mt-4">Gestion des Fiches</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Édition :</strong> Modifiez directement le contenu d'une fiche driver et sauvegardez vos changements.</li>
            <li><strong>Copie :</strong> Copiez le contenu d'une fiche dans le presse-papiers pour l'utiliser ailleurs.</li>
            <li><strong>Suppression :</strong> Supprimez définitivement un driver de la base de données.</li>
            <li><strong>Parsing intelligent :</strong> Le système reconnaît automatiquement les différentes unités et formats de notation (virgules/points décimaux, notations scientifiques, commentaires).</li>
          </ul>
        `
      },
      {
        title: 'Notes',
        content: `
          <p>Un gestionnaire de fichiers simple pour organiser vos notes, images et documents liés à vos projets.</p>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Arborescence :</strong> Naviguez dans vos dossiers de notes.</li>
            <li><strong>Prévisualisation :</strong> Affichez les fichiers .txt, les images (jpg, png...) et les PDF.</li>
            <li><strong>Édition :</strong> Modifiez et sauvegardez vos notes (.txt) directement dans l'application.</li>
          </ul>
        `
      },
      {
        title: 'Horn Expansion',
        content: `
          <p>Outil de conception visuelle de pavillons basé sur des segments. Il permet de comparer une géométrie manuelle à des lois d'expansion mathématiques idéales.</p>
          <ul class="list-disc list-inside">
            <li><strong>Graphique interactif :</strong> Visualise vos segments (lignes pleines) et les courbes idéales (lignes pointillées) que vous sélectionnez (Conique, Hypex, etc.).</li>
            <li><strong>Best-Fit :</strong> Analyse votre profil et calcule un score de similarité (en %) pour chaque loi mathématique, vous aidant à identifier le profil théorique le plus proche.</li>
            <li><strong>Export To :</strong> Envoie les données vers "Horn-Script", "Waveguide Studio" ou "Directivity". Lors de l'export vers Directivity, l'outil calcule automatiquement les angles de paroi, le type d'expansion et la fréquence de coupure pour une analyse avancée du pavillon.</li>
          </ul>
        `
      },
      {
        title: 'Directivité',
        content: `
          <p>Calculateur de directivité avancé pour pavillons et guides d'ondes avec deux modes de fonctionnement.</p>
          <h4 class="text-lg font-semibold text-white">Mode Simple (Piston)</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Modèle de piston rectangulaire :</strong> Calcule la directivité basée uniquement sur les dimensions de la bouche (largeur × hauteur).</li>
            <li><strong>Analyse rapide :</strong> Fournit les angles d'ouverture et le facteur Q sur toute la plage de fréquences (100 Hz - 16 kHz).</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Mode Pro (Pavillon Hybride)</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Import depuis Horn Expansion :</strong> Cliquez sur "Export To → Directivity" dans Horn Expansion pour importer automatiquement la géométrie du pavillon, les angles de paroi, le type d'expansion et la fréquence de coupure.</li>
            <li><strong>Modélisation avancée :</strong> Combine la diffraction (basses fréquences) et le contrôle géométrique (hautes fréquences) pour un comportement réaliste du pavillon.</li>
            <li><strong>Adaptation au type d'expansion :</strong> Prend en compte le type d'expansion (Conical, Exponential, Hypex, Parabolic, OS) pour des prédictions précises.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Visualisation</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Tableau de résultats :</strong> Affiche l'ouverture horizontale/verticale et le facteur Q pour chaque fréquence.</li>
            <li><strong>Diagramme polaire :</strong> Diagramme polaire interactif montrant le pattern de rayonnement à la fréquence sélectionnée.</li>
            <li><strong>Heatmap :</strong> Visualisation fréquence vs. angle avec réponse de directivité en code couleur.</li>
          </ul>
        `
      },
      {
        title: 'Waveguide Studio',
        content: `
          <p>Studio de conception 3D paramétrique avancé pour les guides d'ondes et pavillons.</p>
          <ul class="list-disc list-inside">
            <li><strong>Conception par profil et section :</strong> Le guide est généré à partir d'une loi d'expansion (profil) et d'une forme de section (définie par la "superformule").</li>
            <li><strong>Visualisation 3D/2D :</strong> Une vue 3D interactive permet de visualiser le guide d'onde, et une vue 2D montre la forme de la section.</li>
            <li><strong>Export :</strong> Exportez la géométrie en <code>.STL</code> (impression 3D), <code>.CSV</code> (coordonnées) ou <code>.MSH</code> (simulation).</li>
          </ul>
        `
      },
      {
        title: 'Script LEM Horn',
        content: `
          <p>Générateur de script LEM pour le logiciel Akabak, spécialisé dans la modélisation de pavillons (Horn).</p>
          <ul class="list-disc list-inside">
            <li><strong>Basé sur les segments :</strong> Le script est généré à partir d'un tableau de segments.</li>
            <li><strong>Modules :</strong> Ajoutez des blocs de script pré-configurés pour une charge arrière (Enclosure), bass-reflex (Vented Enclosure) ou une amorce de ligne de transmission (Amorce TL).</li>
            <li><strong>Copie globale :</strong> Le bouton "Copie formula" assemble le script complet (driver + segments + modules) et le copie.</li>
          </ul>
        `
      },
      {
        title: 'Script LEM Duct',
        content: `
          <p>Générateur de script LEM pour Akabak, spécialisé dans les conduits et évents à section variable.</p>
          <ul class="list-disc list-inside">
            <li><strong>Structure en Ducts/Transitions :</strong> Définissez une succession de sections rectangulaires (Ducts) et le type de liaison entre elles (Waveguide ou Mass).</li>
            <li><strong>Copie par élément :</strong> Cliquez sur le numéro d'un duct ou d'une transition pour copier uniquement la formule LEM de cet élément.</li>
            <li><strong>Copie globale :</strong> Le bouton "Copie Script Complet" génère et copie le script LEM pour l'ensemble de la structure.</li>
          </ul>
        `
      }
    ]
  }
};

/**
 * Génère et retourne le contenu HTML complet du mode d'emploi.
 * Conçu pour être inséré dans une modale ; chaque section est un accordéon.
 */
export function getManualHtml(lang = 'en') {
  const arrowSVG = `<svg class="w-4 h-4 transition-transform duration-300 toggle-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
  const content = MANUAL_CONTENT[lang];

  const sectionsHtml = content.sections.map(section => `
    <div class="control-group">
      <div class="control-label-toggle text-xl"><span>${section.title}</span>${arrowSVG}</div>
      <div class="p-4 overflow-hidden text-gray-400 space-y-4">
        ${section.content}
      </div>
    </div>
  `).join('');

  return `
    <div class="space-y-4 text-gray-300" id="help-manual-content" data-lang="${lang}">
      <div class="flex justify-end mb-4">
        <button id="manual-lang-toggle" class="action-btn text-sm px-4 py-2 flex items-center gap-2 hover:scale-105 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <span>${content.langLabel}</span>
        </button>
      </div>
      ${sectionsHtml}
    </div>
  `;
}

/**
 * Active le comportement accordéon du manuel (à appeler après insertion du HTML).
 */
export function initializeManualPanel(rootElement) {
  if (!rootElement) return;

  // Language toggle functionality
  const langToggle = rootElement.querySelector('#manual-lang-toggle');
  const manualContent = rootElement.querySelector('#help-manual-content');
  
  if (langToggle && manualContent) {
    langToggle.addEventListener('click', () => {
      const currentLang = manualContent.dataset.lang || 'en';
      const newLang = currentLang === 'en' ? 'fr' : 'en';
      
      // Replace the entire manual content with new language
      const newHtml = getManualHtml(newLang);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newHtml;
      const newContent = tempDiv.firstElementChild;
      
      manualContent.replaceWith(newContent);
      
      // Re-initialize the panel with new content
      initializeManualPanel(rootElement);
    });
  }

  const toggles = rootElement.querySelectorAll('.control-label-toggle');
  toggles.forEach((header, idx) => {
    const content = header.nextElementSibling;
    const arrow = header.querySelector('.toggle-arrow');

    // fermé par défaut…
    content.style.maxHeight = '0px';

    // …sauf la première section qu’on ouvre pour montrer que “ça vit”
    if (idx === 0) {
      content.style.maxHeight = content.scrollHeight + 'px';
      arrow?.classList.add('rotate-180');
    }

    header.addEventListener('click', () => {
      const isOpen = content.style.maxHeight !== '0px';
      content.style.maxHeight = isOpen ? '0px' : content.scrollHeight + 'px';
      arrow?.classList.toggle('rotate-180', !isOpen);
    });
  });
}
