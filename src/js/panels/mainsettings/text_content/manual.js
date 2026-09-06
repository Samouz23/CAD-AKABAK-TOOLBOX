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
          <p><strong>This application is an assistant for speaker enclosure design.</strong> It connects geometry, acoustic calculations, AKABAK and Gmsh in one workspace.</p>
          <h4 class="text-lg font-semibold text-white">Global Features</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Field Calculations:</strong> In the <strong>Geometry</strong>, <strong>Calculator</strong> and <strong>Horn Expansion</strong> tools, you can enter calculations (e.g. <code>550*2-(8/11)</code>) in most fields. Press <strong>Enter</strong> to display the result.</li>
            <li><strong>Pop-out Windows:</strong> All tools have a button to open in a separate window. An option in the settings allows you to keep these windows "always on top".</li>
            <li><strong>Simplified Popups:</strong> Many tools (Driver Database, Mesh, Geometry, Notes) feature streamlined popup windows with optimized layouts for quick access to essential functions.</li>
            <li><strong>Escape Key:</strong> The Escape (Esc) key generally closes menus or modal windows.</li>
            <li><strong>Shift+Scroll:</strong> The Shift+Scroll key combination allows you to move faster in supported fields.</li>
            <li><strong>Shortcuts:</strong> Open Settings to assign keys for panels, exports, splits, 3D display, points, interfaces, BEM elements and observation fields. Press Esc to close the current popup or menu.</li>
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
            <li><strong>UI Options:</strong> Customize the appearance with Default, Blue, or White themes, reduce animations, and choose button style (Striped or Solid).</li>
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
        title: 'Calculator',
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
            <li><strong>Export To:</strong> Sends the current segment profile to Akabak LEM, Waveguide Studio or BEM Solver. Waveguide export includes throat/mouth dimensions, length and expansion-law parameters; BEM export includes the equivalent horn geometry for directivity analysis.</li>
            <li><strong>Graph synchronization:</strong> Segment edits and expansion-law changes update the graph immediately. The graph tab can show the imported BEM result when the solver is connected.</li>
          </ul>
        `
      },
      {
        title: 'BEM Solver',
        content: `
          <p>Acoustic simulation tool for horns, waveguides and connected air volumes. The former Directivity calculator is now the BEM Solver panel.</p>
          <h4 class="text-lg font-semibold text-white">Study Configuration</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Mesh import:</strong> Load a Gmsh <code>.msh</code> surface mesh and inspect its physical groups in the 3D viewer.</li>
            <li><strong>Model tree:</strong> Organize surfaces into interior or exterior subdomains and assign interfaces between domains.</li>
            <li><strong>Components:</strong> Add an infinite baffle and a real meshed diaphragm to a subdomain. The diaphragm uses its dimensions, profile, axis, offsets and driver parameters.</li>
            <li><strong>Symmetry:</strong> Use none, horizontal, vertical or combined mirror symmetry to reduce the model while keeping the solver orientation-aware.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Solvers and Results</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Start Simulation:</strong> Calculates the acoustic response of all assigned subdomains and interfaces, then fills the result graphs.</li>
            <li><strong>Automatic preparation:</strong> Checks surface connections and directions, joins touching mesh points and reports problems before the calculation.</li>
            <li><strong>Directivity:</strong> Computes horizontal and vertical polar responses from the aperture, with far-field distance and angular sampling controls.</li>
            <li><strong>SPL coupling:</strong> Converts the BEM pressure and driven load into an on-axis SPL result and can use the selected driver's T&amp;S parameters.</li>
            <li><strong>Output filters:</strong> Add high-pass, low-pass, shelving or bell bands with Butterworth, Linkwitz-Riley or free-Q alignment. Each band can be bypassed. Filters are applied to the drive voltage, so no new simulation is needed.</li>
            <li><strong>Frozen curves:</strong> Press <strong>Freeze curve</strong> to keep the current SPL and excursion on screen, then change the voltage, the filters or the geometry and compare. Frozen curves can be renamed, recoloured, hidden and are saved in the study file.</li>
            <li><strong>Excursion:</strong> The Excursion tab shows the one-way peak cone travel in mm for the same operating point as the SPL tab. Enter the driver Xmax to draw the limit line; the cursor then reads how many dB of level remain before the limit.</li>
            <li><strong>Diagnostics:</strong> Read the messages below the viewer. They identify missing surfaces, incorrect connections, mesh problems and unreliable results.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Tree and Viewer Actions</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Double-click:</strong> Double-click a subdomain, interface, surface or component to open its properties.</li>
            <li><strong>Right-click a subdomain:</strong> Add an infinite baffle or a diaphragm. Right-click a component to remove it.</li>
            <li><strong>Right-click other items:</strong> Rename or remove an interface or surface. Right-click a surface in the 3D viewer to assign it to a subdomain, interface or the unused Repository.</li>
            <li><strong>Drag and drop:</strong> Move items within the tree to organize the study. A surface can be dropped onto another subdomain or interface.</li>
            <li><strong>Visibility:</strong> Use the eye checkbox to show or hide an item in the viewer. For a field, it also decides whether the field is calculated.</li>
            <li><strong>Expand/collapse:</strong> Click the arrow beside an item to show or hide its children. Press <strong>Esc</strong> to close menus and popups.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Observation Fields</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Plane:</strong> Add a rectangular observation surface with configurable width, height, spacing and position.</li>
            <li><strong>Balloon:</strong> Add a spherical angular grid to inspect the full radiation field and optionally deform it into a 3D directivity balloon.</li>
            <li><strong>Level/phase:</strong> Display field magnitude in dB or phase using a cyclic ±180° color scale. Only checked fields are calculated.</li>
            <li><strong>Start field:</strong> Recalculate checked fields from the last simulation. If the mesh or model changed, run Start Simulation again first.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Air Flow and CFD</h4>
          <p>The BEM describes air as a linear acoustic wave. That holds everywhere except inside a port, where the flow separates from the walls, sheds vortices and loses energy to viscosity. To see the real air velocity and the turbulence in a vent, the port has to be solved with the Navier-Stokes equations.</p>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Air flow display:</strong> In a field's properties, the Air Flow section shows particle velocity instead of pressure. Use the logarithmic colour scale when a cabinet and a port are on the same map, as they differ by a factor of a thousand.</li>
            <li><strong>Navier-Stokes coupling:</strong> Tick <strong>Solve the port with CFD</strong>, choose the vent subdomain, then press <strong>Start CFD</strong>. OpenFOAM solves the duct at the flow rate the BEM computed for your voltage and frequency, and the result replaces the field wherever the CFD mesh reaches. Outside the duct the BEM result is kept.</li>
            <li><strong>Cost:</strong> Draft uses a coarse mesh with no boundary layer and finishes in seconds. Normal uses a fine mesh with wall layers and takes minutes to hours. Halving the base cell multiplies the cell count by eight.</li>
            <li><strong>Validity:</strong> Turbulence does not scale with level. If the drive voltage, a filter or the frequency changes, the CFD result is dropped and must be recomputed. The SPL, being linear, does not need a new simulation.</li>
            <li><strong>Backend:</strong> OpenFOAM runs inside WSL, the Linux subsystem of Windows. The <strong>CFD backend</strong> window reports exactly what is missing and can install OpenFOAM for you. Only creating the Linux distribution itself needs administrator rights, and the window gives the exact command to run.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Projects and Limits</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>TBBS:</strong> Save and restore the mesh, model tree, components, observation settings, frequency range and completed results in a <code>.TBBS</code> study file.</li>
            <li><strong>Mesh quality:</strong> Refine the mesh until the largest element is suitable for the highest frequency. Above the reported valid frequency, errors are dominated by spatial resolution.</li>
            <li><strong>Current limitation:</strong> An unbaffled exterior can show irregular frequencies because Burton-Miller/CHIEF stabilization is not implemented.</li>
          </ul>
        `
      },
      {
        title: 'Waveguide Studio',
        content: `
          <p>Advanced parametric 3D design studio for waveguides and horns.</p>
          <ul class="list-disc list-inside">
            <li><strong>Profile and section design:</strong> Generate a guide from Conical, Exponential, Hypex, Parabolic, OS and DOSC laws, with rectangular, circular or superformula sections.</li>
            <li><strong>Adapters and splits:</strong> Configure throat adapters, input/output shapes, horizontal/vertical splits and optional interfaces for simulation-ready geometry.</li>
            <li><strong>3D/2D visualization:</strong> The 3D viewer and profile/section graphs update together whenever a parameter changes.</li>
            <li><strong>Export:</strong> Export STL, full or profile CSV, DXF sections, Onshape CSV and Gmsh <code>.MSH</code> with physical surface groups.</li>
            <li><strong>Export To BEM:</strong> Send the generated profile to BEM Solver for directivity. The profile and mouth dimensions are transferred automatically.</li>
            <li><strong>Solver Sync:</strong> After an initial BEM run, enable Sync to rebuild the simulation mesh and recalculate the results after geometry changes. The status shows each step and refreshes the Graph tab.</li>
            <li><strong>Sync protection:</strong> Changing Interface or Split while Sync is active requires confirmation because the current simulation would no longer match the geometry. Disable Sync first when changing these settings manually.</li>
          </ul>
        `
      },
      {
        title: 'Horn Studio',
        content: `
          <p>Standalone horn design workbench with a live geometry preview, segment editor and BEM results graph.</p>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Segment editor:</strong> Create and edit the throat-to-mouth profile, reorder or split sections and inspect the generated geometry in 2D/3D.</li>
            <li><strong>Graph:</strong> Compare the measured segment profile with selectable ideal expansion laws and view the BEM result in the Graph tab.</li>
            <li><strong>Import from Horn Expansion:</strong> The Export To action transfers the current segments directly into Horn Studio.</li>
            <li><strong>BEM Sync:</strong> With Sync enabled, a geometry edit is debounced, a new Gmsh mesh is generated, the mesh is imported into the embedded BEM Solver and the simulation is rerun.</li>
            <li><strong>Result refresh:</strong> After a successful synchronized run, the BEM curves are refreshed in the Horn Studio Graph tab without changing the active design tab.</li>
            <li><strong>Configuration protection:</strong> Interface and horizontal/vertical split changes are confirmed because they require a new simulation setup and invalidate the previous result.</li>
          </ul>
        `
      },
      {
        title: 'Akabak LEM',
        content: `
          <p>Unified Akabak LEM editor for front-wave and back-wave acoustic chains.</p>
          <ul class="list-disc list-inside">
            <li><strong>Two independent waves:</strong> Build the front and rear acoustic paths of the selected driver separately.</li>
            <li><strong>Segment types:</strong> Combine Duct, Waveguide and sealed or vented Enclosure elements in each chain.</li>
            <li><strong>Transitions:</strong> Connect consecutive ducts with a Waveguide transition or an acoustic Mass transition, with automatic T-factor calculations for waveguides.</li>
            <li><strong>Driver picker:</strong> Search the Driver Database and use the selected driver's parameters in the generated project.</li>
            <li><strong>Units and editing:</strong> Switch between mm and inch, insert/delete/reorder segments, clear a wave and edit global constants such as wood thickness and damping.</li>
            <li><strong>Export:</strong> Copy the complete LEM formulas or generate a binary <code>.AKP</code> project through the Python Akabak toolchain.</li>
          </ul>
        `
      },
      {
        title: 'Akabak LEM Templates',
        content: `
          <p>Formula templates shared by the Akabak LEM editor and the settings panel.</p>
          <ul class="list-disc list-inside">
            <li><strong>Available templates:</strong> Duct, Waveguide Transition, Mass Transition, constant-height Waveguide, sealed Enclosure and vented Enclosure.</li>
            <li><strong>Grid and code modes:</strong> Edit assignment lines in the grid or inspect the complete formula in the code editor.</li>
            <li><strong>Per-element copy:</strong> Copy an individual segment formula or the complete generated chain for use in Akabak.</li>
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
          <p><strong>Cette application est un assistant pour la conception d'enceintes.</strong> Elle relie la géométrie, les calculs acoustiques, AKABAK et Gmsh dans un seul espace de travail.</p>
          <h4 class="text-lg font-semibold text-white">Fonctionnalités Globales</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Calcul dans les champs :</strong> Dans les outils <strong>Geometry</strong>, <strong>Calculator</strong> et <strong>Horn Expansion</strong>, vous pouvez saisir des calculs (ex: <code>550*2-(8/11)</code>) dans la plupart des cases. Appuyez sur <strong>Entrée</strong> pour que le résultat s'affiche.</li>
            <li><strong>Fenêtres Pop-out :</strong> Tous les outils disposent d'un bouton pour s'ouvrir dans une fenêtre séparée. Une option dans les réglages permet de garder ces fenêtres "toujours au premier plan".</li>
            <li><strong>Popups Simplifiés :</strong> De nombreux outils (Driver Database, Mesh, Geometry, Notes) disposent de fenêtres popup optimisées avec des interfaces épurées pour un accès rapide aux fonctions essentielles.</li>
            <li><strong>Touche Échap :</strong> La touche Échap (Esc) permet généralement de fermer les menus ou les fenêtres modales.</li>
            <li><strong>Touche Shift+Scroll :</strong> La combinaison Shift+Scroll permet, dans les cases qui le permettent, de se déplacer plus rapidement.</li>
            <li><strong>Raccourcis :</strong> Ouvrez Settings pour attribuer des touches aux panneaux, exports, séparations, affichage 3D, points, interfaces, éléments BEM et champs d'observation. Appuyez sur Échap pour fermer la fenêtre ou le menu courant.</li>
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
            <li><strong>Options UI :</strong> Personnalisez l'apparence avec plusieurs thèmes de couleur (Blue, Fire, White, Green), réduisez les animations et choisissez le style des boutons (Striped ou Solid).</li>
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
        title: 'Calculator',
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
            <li><strong>Export To :</strong> Envoie le profil courant vers Akabak LEM, Waveguide Studio ou BEM Solver. L'export Waveguide contient les dimensions gorge/bouche, la longueur et la loi d'expansion ; l'export BEM prépare la géométrie équivalente pour l'analyse de directivité.</li>
            <li><strong>Synchronisation du graphique :</strong> Les modifications de segments et de loi d'expansion mettent immédiatement à jour le graphique. L'onglet Graph peut afficher le résultat BEM importé lorsque le solveur est connecté.</li>
          </ul>
        `
      },
      {
        title: 'BEM Solver',
        content: `
          <p>Outil de simulation acoustique pour pavillons, guides d'ondes et volumes d'air reliés. L'ancien calculateur de directivité est devenu le panneau BEM Solver.</p>
          <h4 class="text-lg font-semibold text-white">Configuration de l'étude</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Import du maillage :</strong> Chargez un maillage de surface Gmsh <code>.msh</code> et inspectez ses groupes physiques dans le viewer 3D.</li>
            <li><strong>Arbre du modèle :</strong> Organisez les surfaces dans des sous-domaines intérieurs ou extérieurs et affectez les interfaces entre domaines.</li>
            <li><strong>Composants :</strong> Ajoutez un baffle infini et un diaphragme réellement maillé à un sous-domaine. Le diaphragme utilise ses dimensions, son profil, son axe, ses décalages et les paramètres du driver.</li>
            <li><strong>Symétrie :</strong> Utilisez aucune symétrie, une symétrie horizontale, verticale ou combinée pour réduire le modèle, avec orientation automatique des surfaces.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Solveurs et résultats</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Start Simulation :</strong> Calcule la réponse acoustique de tous les sous-domaines et interfaces affectés, puis remplit les graphiques de résultats.</li>
            <li><strong>Préparation automatique :</strong> Vérifie les connexions et le sens des surfaces, raccorde les points de maillage qui se touchent et signale les problèmes avant le calcul.</li>
            <li><strong>Directivité :</strong> Calcule les réponses polaires horizontale et verticale depuis l'ouverture, avec réglage de la distance de champ lointain et du pas angulaire.</li>
            <li><strong>Couplage SPL :</strong> Convertit la pression BEM et la charge pilotée en résultat SPL sur l'axe, avec utilisation possible des paramètres T&amp;S du driver sélectionné.</li>
            <li><strong>Diagnostics :</strong> Lisez les messages affichés sous le viewer. Ils signalent les surfaces manquantes, les mauvaises connexions, les problèmes de maillage et les résultats peu fiables.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Actions dans l'arbre et le viewer</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Double-clic :</strong> Double-cliquez sur un sous-domaine, une interface, une surface ou un composant pour ouvrir ses propriétés.</li>
            <li><strong>Clic droit sur un sous-domaine :</strong> Ajoutez un baffle infini ou un diaphragme. Faites un clic droit sur un composant pour le supprimer.</li>
            <li><strong>Clic droit sur les autres éléments :</strong> Renommez ou supprimez une interface ou une surface. Dans le viewer 3D, faites un clic droit sur une surface pour l'affecter à un sous-domaine, une interface ou au Repository inutilisé.</li>
            <li><strong>Glisser-déposer :</strong> Déplacez les éléments dans l'arbre pour organiser l'étude. Une surface peut être déposée sur un autre sous-domaine ou une interface.</li>
            <li><strong>Visibilité :</strong> La case avec l'œil affiche ou masque un élément dans le viewer. Pour un champ, elle décide aussi s'il sera calculé.</li>
            <li><strong>Ouvrir/fermer :</strong> Cliquez sur la flèche d'un élément pour afficher ou masquer ses enfants. Appuyez sur <strong>Échap</strong> pour fermer les menus et fenêtres.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Champs d'observation</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Plan :</strong> Ajoutez une surface d'observation rectangulaire avec largeur, hauteur, espacement et position réglables.</li>
            <li><strong>Ballon :</strong> Ajoutez une grille angulaire sphérique pour inspecter le champ rayonné et la déformer en ballon de directivité 3D.</li>
            <li><strong>Niveau/phase :</strong> Affichez le niveau en dB ou la phase avec une échelle cyclique ±180°. Seuls les champs cochés sont calculés.</li>
            <li><strong>Start field :</strong> Recalculez les champs cochés à partir de la dernière simulation. Si le maillage ou le modèle a changé, relancez d'abord Start Simulation.</li>
          </ul>
          <h4 class="text-lg font-semibold text-white mt-4">Projets et limites</h4>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>TBBS :</strong> Sauvegardez et restaurez le maillage, l'arbre, les composants, les réglages d'observation, la plage de fréquences et les résultats dans un fichier d'étude <code>.TBBS</code>.</li>
            <li><strong>Qualité du maillage :</strong> Raffinez le maillage pour que le plus grand élément soit adapté à la fréquence maximale. Au-delà de la fréquence valide indiquée, l'erreur vient surtout de la résolution spatiale.</li>
            <li><strong>Limite actuelle :</strong> Un domaine extérieur non bafflé peut présenter des fréquences irrégulières, car la stabilisation Burton-Miller/CHIEF n'est pas implémentée.</li>
          </ul>
        `
      },
      {
        title: 'Waveguide Studio',
        content: `
          <p>Studio de conception 3D paramétrique avancé pour les guides d'ondes et pavillons.</p>
          <ul class="list-disc list-inside">
            <li><strong>Conception du profil et de la section :</strong> Générez un guide avec les lois Conique, Exponentielle, Hypex, Parabolique, OS et DOSC, et des sections rectangulaires, circulaires ou à superformule.</li>
            <li><strong>Adaptateurs et séparations :</strong> Configurez les adaptateurs de gorge, les formes d'entrée/sortie, les séparations horizontale/verticale et les interfaces optionnelles de simulation.</li>
            <li><strong>Visualisation 3D/2D :</strong> Le viewer 3D et les graphiques de profil/section se mettent à jour ensemble à chaque changement de paramètre.</li>
            <li><strong>Exports :</strong> Exportez en STL, CSV complet ou de profil, sections DXF, CSV Onshape et Gmsh <code>.MSH</code> avec groupes de surfaces physiques.</li>
            <li><strong>Export vers BEM :</strong> Envoyez le profil généré au BEM Solver pour la directivité. Le profil et les dimensions de bouche sont transférés automatiquement.</li>
            <li><strong>Sync Solver :</strong> Après un premier calcul BEM, activez Sync pour reconstruire le maillage de simulation et recalculer les résultats après chaque modification de géométrie. Le statut indique chaque étape et actualise l'onglet Graph.</li>
            <li><strong>Protection Sync :</strong> Modifier Interface ou Split avec Sync actif demande confirmation, car la simulation ne correspondrait plus à la géométrie. Désactivez Sync avant de modifier ces réglages manuellement.</li>
          </ul>
        `
      },
      {
        title: 'Horn Studio',
        content: `
          <p>Atelier autonome de conception de pavillons avec aperçu géométrique en direct, éditeur de segments et graphique des résultats BEM.</p>
          <ul class="list-disc list-inside space-y-2">
            <li><strong>Éditeur de segments :</strong> Créez et modifiez le profil gorge-bouche, réordonnez ou divisez les sections et inspectez la géométrie en 2D/3D.</li>
            <li><strong>Graphique :</strong> Comparez le profil des segments aux lois d'expansion idéales et affichez le résultat BEM dans l'onglet Graph.</li>
            <li><strong>Import depuis Horn Expansion :</strong> Export To transfère directement les segments courants vers Horn Studio.</li>
            <li><strong>Sync BEM :</strong> Avec Sync activé, une modification de géométrie est regroupée après un court délai, un nouveau maillage Gmsh est généré, importé dans le BEM intégré puis recalculé.</li>
            <li><strong>Mise à jour du résultat :</strong> Après un calcul synchronisé réussi, les courbes BEM sont rafraîchies dans l'onglet Graph sans changer l'onglet de conception actif.</li>
            <li><strong>Protection de configuration :</strong> Les changements d'Interface et de séparation horizontale/verticale sont confirmés, car ils nécessitent une nouvelle configuration de simulation et invalident le résultat précédent.</li>
          </ul>
        `
      },
      {
        title: 'Akabak LEM',
        content: `
          <p>Éditeur Akabak LEM unifié pour construire séparément les chaînes acoustiques avant et arrière.</p>
          <ul class="list-disc list-inside">
            <li><strong>Deux ondes indépendantes :</strong> Construisez séparément le chemin acoustique avant et arrière du driver sélectionné.</li>
            <li><strong>Types de segments :</strong> Combinez des éléments Duct, Waveguide et Enclosure close ou bass-reflex dans chaque chaîne.</li>
            <li><strong>Transitions :</strong> Reliez deux ducts consécutifs par une transition Waveguide ou une masse acoustique, avec calcul automatique des facteurs T des waveguides.</li>
            <li><strong>Sélecteur de driver :</strong> Recherchez un driver dans Driver Database et utilisez ses paramètres pour le projet généré.</li>
            <li><strong>Unités et édition :</strong> Basculez entre mm et pouces, insérez/supprimez/réordonnez des segments, effacez une onde et modifiez les constantes globales.</li>
            <li><strong>Export :</strong> Copiez les formules LEM complètes ou générez un projet binaire <code>.AKP</code> avec la chaîne d'outils Python Akabak.</li>
          </ul>
        `
      },
      {
        title: 'Templates Akabak LEM',
        content: `
          <p>Templates de formules partagés par l'éditeur Akabak LEM et le panneau Settings.</p>
          <ul class="list-disc list-inside">
            <li><strong>Templates disponibles :</strong> Duct, transition Waveguide, transition Mass, Waveguide à hauteur constante, Enclosure close et Enclosure bass-reflex.</li>
            <li><strong>Modes grille et code :</strong> Modifiez les lignes d'affectation dans la grille ou inspectez la formule complète dans l'éditeur de code.</li>
            <li><strong>Copie par élément :</strong> Copiez la formule d'un segment ou toute la chaîne générée pour l'utiliser dans Akabak.</li>
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
