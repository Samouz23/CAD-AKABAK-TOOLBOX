# Module Physics - Documentation

## 📁 Structure

Le module Physics a été restructuré en modules séparés pour une meilleure organisation :

```
src/js/panels/physics/
├── power.js                  # Fichier principal avec système d'onglets
├── basicCalculators.js       # Calculateurs de base (Ohm, résistances, fréquence)
├── splCalculator.js          # Calculateur SPL avec graphique
├── crossoverCalculator.js    # Calculateur de filtres passifs (+ presets save/load)
└── database/
    └── crossoverPresets.json # Presets crossover sauvegardés
```

## 🎯 Fonctionnalités

### 1. Basic Tab
**Calculateurs de base** pour les calculs électriques et acoustiques essentiels :

- **Loi d'Ohm (P = U²/R)** : Calcul bidirectionnel de puissance, tension et résistance
- **Résistances parallèles** : Calcul de résistance totale pour plusieurs haut-parleurs
- **Fréquence & Longueur d'onde** : Conversions avec vitesse du son (343 m/s)
- Calculs inline : Tapez des expressions (ex: `550*2-(8/11)`) et appuyez sur Entrée

### 2. SPL Tab
**Calculateur de niveau de pression sonore** avec visualisation graphique :

- Calcul basé sur :
  - Sensibilité du haut-parleur (dB @ 1W/1m)
  - Puissance d'entrée (Watts)
  - Distance d'écoute (mètres)
  - Nombre de haut-parleurs (gain de couplage)
  
- **Graphique interactif** SPL vs Distance (Chart.js)
- **Guide de référence** avec niveaux sonores standards
- Codage couleur automatique selon niveau de dangerosité

**Formule utilisée :**
```
SPL = Sensitivity + 10*log10(Power) - 20*log10(Distance) + 3*log2(Speakers)
```

### 3. Crossover Tab
**Calculateur de filtres passifs** pour enceintes acoustiques :

- **Types de filtres** :
  - Passe-haut (tweeter protection)
  - Passe-bas (woofer filtering)
  - Passe-bande (midrange)
  
- **Ordres supportés** : 1er, 2e, 3e et 4e ordre (6 à 24 dB/octave)
- **Calcul des composants** : Condensateurs (µF) et inductances (mH)
- **Diagrammes de circuits** ASCII pour visualisation
- **Valeurs standards** pour composants audio

**Recommandations :**
- Utiliser des condensateurs non-polarisés (film)
- Inductances à noyau d'air pour les tweeters
- Vérifier les valeurs de puissance pour les composants

**Presets (sauvegarde/chargement) :**
- Bouton bookmark en haut de la section (même style que Waveguide Studio)
- Ouvre une modale listant les configurations enregistrées (nom, charger, supprimer)
- Sauvegarde tous les champs du formulaire (type de filtre, topologie, fréquences, impédance, ordre) sous un nom donné
- Persisté côté disque via IPC (`crossover-presets:get-all/save/delete`) dans `database/crossoverPresets.json`

## 🎨 Interface

### Système d'onglets
Navigation par onglets en haut du panneau :
- **Basic** : Calculateurs essentiels
- **SPL** : Pression sonore
- **Crossover** : Filtres passifs (+ presets)

### Cohérence UX
- **Même style** que les autres modules (Geometry, Settings)
- **Boutons uniformes** : `.action-btn` pour sauvegarde
- **Animations** : transitions fluides, respect du mode `reduced-motion`
- **Responsive** : grilles adaptatives (1 ou 2 colonnes)

## 🔧 Utilisation

### Sauvegarde d'un preset Crossover
```javascript
await window.electronAPI.saveCrossoverPreset({ name, values, savedAt });
const presets = await window.electronAPI.getCrossoverPresets();
await window.electronAPI.deleteCrossoverPreset(name);
```

### Calculs inline
Tous les champs d'entrée supportent les calculs :
```
Tapez : 2000/4
Appuyez : Entrée
Résultat : 500
```

## 📊 Graphiques

Le module SPL utilise **Chart.js** pour afficher le graphique SPL vs Distance.

**Configuration Chart.js :**
- Type : `line`
- Couleur : Rose (#ec4899)
- Responsive : Oui
- Axes : Distance (m) et SPL (dB)

**Fallback :** Si Chart.js n'est pas disponible, un message d'information s'affiche.

## 🔄 Mise à jour

Pour ajouter un nouveau calculateur :

1. Créer un fichier dans `src/js/panels/physics/`
2. Exporter `getXxxHtml()` et `initializeXxx()`
3. Importer dans `power.js`
4. Ajouter un onglet dans `getPowerPanelHtml()`
5. Initialiser dans `initializePowerPanel()`

## ⚙️ Configuration CSS

Les styles sont définis dans `src/css/input.css` :
- `.physics-tab` : Onglets de navigation
- `.physics-tab-content` : Contenus avec fade-in
- `.crossover-type-btn` : Boutons de type de filtre
- `.history-item` : Cartes d'historique avec hover

## 🚀 Performance

- **LocalStorage** : ~500 entrées max
- **Lazy render** : Seul l'onglet actif est initialisé
- **Debounce** : Recherche d'historique optimisée
- **Chart.js** : Canvas 2D pour performance graphique

## 📝 Notes techniques

- **Pas de jQuery** : Vanilla JavaScript uniquement
- **ES6 Modules** : Import/export standard
- **Event delegation** : Pour les éléments dynamiques
- **Mobile-ready** : Grilles responsive avec Tailwind

## 🎓 Formules de référence

### Loi d'Ohm
```
P = U² / R
U = √(P × R)
R = U² / P
```

### Résistances en parallèle (identiques)
```
R_total = R / n
où n = nombre de haut-parleurs
```

### Longueur d'onde
```
λ = c / f
où c = 343 m/s (vitesse du son)
```

### Crossover (2e ordre Butterworth)
```
L = (√2 × Z) / (2π × f)
C = 1 / (√2 × 2π × f × Z)
où Z = impédance, f = fréquence de coupure
```

---

**Version** : 2.0  
**Date** : Décembre 2025  
**Auteur** : Module Physics modernisé
