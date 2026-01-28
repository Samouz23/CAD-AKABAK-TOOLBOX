/**
 * Script de découverte des marques et tailles de membrane disponibles
 * sur loudspeakerdatabase.com
 * 
 * Usage en CLI:
 * node discoverBrandsAndSizes.js
 * 
 * Output: Affiche JSON avec marques et tailles pour copie-coller dans config.js
 */

const BASE_URL = 'https://loudspeakerdatabase.com';
const MAX_SEARCH_PAGES = 5; // Nombre max de pages de recherche à explorer
const MAX_PRODUCT_PAGES = 80; // Nombre max de fiches produit à échantillonner

async function fetchHtml(url) {
  console.log(`[FETCH] ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

// Récupère la première page de recherche et jusqu'à MAX_SEARCH_PAGES-1 pages supplémentaires si elles existent
async function collectSearchPages() {
  const pages = [];
  const visited = new Set();

  async function addPage(url) {
    if (visited.has(url)) return;
    visited.add(url);
    const html = await fetchHtml(url);
    pages.push({ url, html });
    return html;
  }

  // Page principale
  const mainUrl = `${BASE_URL}/search/`;
  const mainHtml = await addPage(mainUrl);

  // Trouver des liens de pagination
  const doc = new DOMParser().parseFromString(mainHtml, 'text/html');
  const pageLinks = Array.from(doc.querySelectorAll('a[href*="page="]'))
    .map(a => a.getAttribute('href'))
    .filter(Boolean)
    .map(href => new URL(href, BASE_URL).href);

  for (const link of pageLinks.slice(0, MAX_SEARCH_PAGES - 1)) {
    try {
      await addPage(link);
    } catch (err) {
      console.warn('Pagination fetch failed:', link, err.message);
    }
  }

  return pages;
}

function extractBrands(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  
  // Les URLs sont au format /MARQUE/MODELE
  const brandLinks = new Set();
  
  Array.from(doc.querySelectorAll('a[href]')).forEach(a => {
    const href = a.getAttribute('href');
    if (href && !href.startsWith('http') && href !== '/') {
      // Format: /BRAND/MODEL ou /BRAND/MODEL/details
      const parts = href.split('/').filter(p => p.length > 0);
      if (parts.length >= 1) {
        const brand = parts[0];
        // Ignorer les routes spéciales
        if (brand && !['search', 'api', 'assets', 'images', 'static'].includes(brand.toLowerCase())) {
          brandLinks.add(brand);
        }
      }
    }
  });
  
  return Array.from(brandLinks).sort();
}

function extractSizes(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const sizeSet = new Set();
  
  // Chercher les données de taille dans les attributs data ou texte
  // Pattern: "8"", "10"", "12"", "15"", "18"", etc.
  const textContent = doc.body.innerText || '';
  
  // Matcher les tailles en pouces (format: "8"" ou "8 inch" ou "8in")
  const sizeMatches = textContent.match(/(\d+(?:\.\d+)?)\s*[""″"inch"|in]/gi);
  if (sizeMatches) {
    sizeMatches.forEach(match => {
      const num = match.match(/(\d+(?:\.\d+)?)/);
      if (num) sizeSet.add(parseFloat(num[1]));
    });
  }
  
  // Aussi chercher dans les attributs data ou data-size
  Array.from(doc.querySelectorAll('[data-size], [data-inches], .size')).forEach(el => {
    const sizeText = el.textContent || el.getAttribute('data-size') || el.getAttribute('data-inches');
    if (sizeText) {
      const num = sizeText.match(/(\d+(?:\.\d+)?)/);
      if (num) sizeSet.add(parseFloat(num[1]));
    }
  });
  
  return Array.from(sizeSet)
    .filter(v => !isNaN(v) && v > 0 && v < 50) // Filtre: tailles réalistes de haut-parleurs
    .sort((a, b) => a - b);
}

async function discover() {
  console.log('=== Decouverte des marques et tailles ===\n');
  
  try {
    // 1. Collecter plusieurs pages de recherche
    console.log('[STEP 1] Recuperation des pages de recherche...');
    const searchPages = await collectSearchPages();
    console.log(`[INFO] ${searchPages.length} page(s) de recherche chargees`);

    // 2. Extraire les marques depuis les pages de recherche
    const brandsSet = new Set();
    const productLinks = new Set();
    searchPages.forEach(({ html, url }) => {
      extractBrands(html).forEach(b => brandsSet.add(b));
      const doc = new DOMParser().parseFromString(html, 'text/html');
      Array.from(doc.querySelectorAll('a[href]')).forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('http')) {
          const parts = href.split('/').filter(Boolean);
          if (parts.length >= 2) {
            productLinks.add(new URL(href, BASE_URL).pathname);
          }
        }
      });
    });

    console.log(`\n[RESULT] ${brandsSet.size} marques trouvees dans les pages search`);
    console.log(`[INFO] ${productLinks.size} liens de produits trouves (dedup)`);

    // 3. Scraper un échantillon de fiches produit pour enrichir les marques et tailles
    const productArray = Array.from(productLinks).slice(0, MAX_PRODUCT_PAGES);
    const sizesSet = new Set();
    for (let i = 0; i < productArray.length; i++) {
      const path = productArray[i];
      try {
        const productHtml = await fetchHtml(`${BASE_URL}${path}`);
        const productDoc = new DOMParser().parseFromString(productHtml, 'text/html');
        const title = productDoc.querySelector('h1')?.textContent || '';
        const parts = title.split(/[\s\-\/]/);
        if (parts.length > 0 && parts[0].length > 1) {
          brandsSet.add(parts[0]);
        }
        // Extraire tailles depuis la fiche
        extractSizes(productHtml).forEach(s => sizesSet.add(s));
      } catch (err) {
        console.warn(`Erreur scraping produit ${i}: ${path} -> ${err.message}`);
      }
    }

    const brands = Array.from(brandsSet).sort();
    const sizes = Array.from(sizesSet).sort((a, b) => a - b);
    
    console.log(`\n[RESULT] ${brands.length} marques trouvees (total)`);
    console.log(`[RESULT] ${sizes.length} tailles trouvees\n`);
    
    if (brands.length === 0) {
      console.warn('Aucune marque trouvee - HTML peut avoir une structure differente');
      console.log('Affichage des 10 premiers liens pour debug:');
      const doc = new DOMParser().parseFromString(mainHtml, 'text/html');
      Array.from(doc.querySelectorAll('a[href]')).slice(0, 10).forEach((a, i) => {
        console.log(`  [${i}] ${a.getAttribute('href')}`);
      });
    }
    
    if (sizes.length === 0) {
      console.warn('Aucune taille trouvee - HTML peut avoir une structure differente');
    }
    
    // 2. Generer config JSON
    const brandsJson = brands.map(b => ({
      id: b,
      label: b
    }));
    
    const sizesJson = [
      { id: 'any', label: 'Toutes les tailles', sizes: [] },
      ...sizes.map(s => ({
        id: s.toString().replace('.', '_'),
        label: `${s}"`,
        sizes: [s]
      }))
    ];
    
    console.log('=== BRANDS CONFIG ===');
    console.log(JSON.stringify(brandsJson, null, 2));
    
    console.log('\n=== SIZES CONFIG ===');
    console.log(JSON.stringify(sizesJson, null, 2));
    
    console.log('\n=== SUMMARY ===');
    console.log(`Marques: ${brands.join(', ')}`);
    console.log(`Tailles (pouces): ${sizes.join(', ')}`);
    
  } catch (err) {
    console.error('ERREUR:', err.message);
    process.exit(1);
  }
}

// Main
if (typeof window === 'undefined') {
  // Node.js context
  console.error('Ce script doit etre execute dans un navigateur ou Electron.');
  console.error('Utilisez-le dans la DevTools console ou adapter pour Node.js avec node-fetch/jsdom.');
  process.exit(1);
} else {
  // Browser/Electron context
  discover().catch(err => {
    console.error('ERREUR:', err);
  });
}
