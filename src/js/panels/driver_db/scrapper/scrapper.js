import { SCRAPPER_BASE_URL, SCRAPPER_BRANDS, SCRAPPER_MEMBRANE_SIZES } from './config.js';

const PARAM_SELECTORS = {
  SD: '[data-highlight="sd"] .value b',
  Mms: '[data-highlight="mms"] .value b',
  fs: '[data-highlight="fs"] .value b',
  Qms: '[data-highlight="qms"] .value b',
  Re: '[data-highlight="re"] .value b',
  BL: '[data-highlight="bl"] .value b',
  Le: '[data-highlight="le"] .value b'
};

const leEncoded = encodeURIComponent('≤');
const OFFSET_STEP = 40; // Site loads 40 results per "page"
const MAX_OFFSETS = 50; // Safety limit for offset pagination (50*40 = 2000 results)

function buildRangeSegment(min, max) {
  if (min != null && max != null) return `${min.toFixed(1)}${leEncoded}size_in${leEncoded}${max.toFixed(1)}`;
  if (min != null) return `${min.toFixed(1)}${leEncoded}size_in`;
  if (max != null) return `size_in${leEncoded}${max.toFixed(1)}`;
  return '';
}

function buildUrlsForOption(brand, option) {
  const brandSegment = `brand=${encodeURIComponent(brand)}`;

  // Priorité aux min/max si fournis
  if (option && (option.min != null || option.max != null)) {
    const seg = buildRangeSegment(option.min ?? null, option.max ?? null);
    const suffix = seg ? `/${seg}` : '';
    return [`${SCRAPPER_BASE_URL}/search/${brandSegment}${suffix}`];
  }

  // Sinon, utiliser la liste sizes
  if (option?.sizes && option.sizes.length) {
    return option.sizes.map(size => {
      const seg = buildRangeSegment(size, size);
      return `${SCRAPPER_BASE_URL}/search/${brandSegment}/${seg}`;
    });
  }

  // Fallback: aucune taille => base
  return [`${SCRAPPER_BASE_URL}/search/${brandSegment}`];
}

function buildUrlsForSizes(brand, selectedOptions) {
  if (!selectedOptions || selectedOptions.length === 0) {
    return [`${SCRAPPER_BASE_URL}/search/brand=${encodeURIComponent(brand)}`];
  }
  const urls = [];
  selectedOptions.forEach(opt => {
    buildUrlsForOption(brand, opt).forEach(u => urls.push(u));
  });
  // Déduplication
  return Array.from(new Set(urls));
}

function parseNumber(text) {
  if (!text) return null;
  const cleaned = text.replace(/,/g, '.').trim();
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchHtml(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function addOffsetSegment(url, offset) {
  if (offset === 0) return url;
  const [base, query] = url.split('?');
  const suffix = query ? `?${query}` : '';
  return `${base}/offset=${offset}${suffix}`;
}

async function collectPaginatedLinks(searchUrl) {
  const links = new Set();
  for (let pageIndex = 0; pageIndex < MAX_OFFSETS; pageIndex++) {
    const offset = pageIndex * OFFSET_STEP;
    const pageUrl = addOffsetSegment(searchUrl, offset);
    const html = await fetchHtml(pageUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pageLinks = extractDriverLinks(doc);

    let added = 0;
    pageLinks.forEach(link => {
      if (!links.has(link)) {
        links.add(link);
        added += 1;
      }
    });

    // Stop when the current offset does not bring any new driver link
    if (pageLinks.length === 0 || added === 0) break;
  }
  return Array.from(links);
}

function extractDriverLinks(doc) {
  const anchors = Array.from(doc.querySelectorAll('a[href]'));
  const links = anchors
    .map(a => a.getAttribute('href'))
    .filter(Boolean)
    .map(href => new URL(href, SCRAPPER_BASE_URL))
    .filter(url => {
      const path = url.pathname || '';
      if (!path || path === '/') return false;
      if (path.includes('/search')) return false;
      const parts = path.split('/').filter(Boolean);
      return parts.length >= 2; // brand + model segments
    })
    .map(url => url.href);
  return Array.from(new Set(links));
}

function extractParams(doc) {
  const values = Object.entries(PARAM_SELECTORS).reduce((acc, [key, selector]) => {
    const text = doc.querySelector(selector)?.textContent;
    acc[key] = parseNumber(text);
    return acc;
  }, {});

  if (!values.SD) return null;
  return {
    SDf: values.SD,
    SDr: values.SD,
    Mms: values.Mms ?? 0,
    fs: values.fs ?? 0,
    Qms: values.Qms ?? 0,
    Re: values.Re ?? 0,
    BL: values.BL ?? 0,
    Le: values.Le ?? 0
  };
}

async function scrapeDriverDetail(url) {
  const html = await fetchHtml(url);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const name = doc.querySelector('h1')?.textContent?.trim() || url;
  const params = extractParams(doc);
  if (!params) return null;
  return { name, params, sourceUrl: url };
}

async function scrapeSearchPage({ brand, selectedOptions }) {
  // Generer les URLs a scraper en fonction des options (min/max ou sizes)
  const urls = buildUrlsForSizes(brand, selectedOptions);
  const results = [];

  for (const searchUrl of urls) {
    try {
      const links = await collectPaginatedLinks(searchUrl);

      for (const link of links) {
        try {
          const detail = await scrapeDriverDetail(link);
          if (detail) results.push(detail);
        } catch (err) {
          console.error('Scrape detail failed', link, err);
        }
      }
    } catch (err) {
      console.error('Scrape search page failed', searchUrl, err);
    }
  }
  
  return { urls, results };
}

function renderOptionsHtml(options) {
  return options.map(opt => `<option value="${opt.id}">${opt.label}</option>`).join('');
}

function renderResultRow(result, index) {
  const p = result.params;
  const rows = [
    `SDf=${p.SDf}`,
    `SDr=${p.SDr}`,
    `Mms=${p.Mms}`,
    `fs=${p.fs}`,
    `Qms=${p.Qms}`,
    `Re=${p.Re}`,
    `BL=${p.BL}`,
    `Le=${p.Le}`
  ].join(' | ');
  return `
    <div class="p-3 rounded-md bg-gray-900/60 border border-gray-700 flex flex-col gap-1" data-result-index="${index}">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="font-semibold text-white">${result.name}</div>
        <div class="text-xs text-gray-400 truncate">${result.sourceUrl}</div>
      </div>
      <div class="text-sm text-gray-200">${rows}</div>
      <div class="text-right">
        <button class="btn btn--primary btn--sm" data-action="save-result">Enregistrer</button>
      </div>
    </div>
  `;
}

function renderResults(container, results) {
  if (!results.length) {
    container.innerHTML = '<div class="text-center text-gray-400">Aucun resultat pour ces filtres.</div>';
    return;
  }
  container.innerHTML = results.map(renderResultRow).join('');
}

function toDriverContent(result) {
  const p = result.params;
  const lines = [
    `SDf = ${p.SDf}`,
    `SDr = ${p.SDr}`,
    `Mms = ${p.Mms}`,
    `fs = ${p.fs}`,
    `Qms = ${p.Qms}`,
    `Re = ${p.Re}`,
    `BL = ${p.BL}`,
    `Le = ${p.Le}`,
    `// Source = ${result.sourceUrl}`
  ];
  return lines.join('\n');
}

export function renderScrapperView({ container, onAddDriver }) {
  const checkAllHtml = `
    <label class="flex items-center gap-2 text-sm text-gray-200 font-semibold">
      <input type="checkbox" class="form-checkbox" id="scrapper-check-all">
      <span>Check all</span>
    </label>
  `;
  const sizeOptionsHtml = SCRAPPER_MEMBRANE_SIZES.map(opt => `
    <label class="flex items-center gap-2 text-sm text-gray-200">
      <input type="checkbox" class="form-checkbox" data-size-id="${opt.id}">
      <span>${opt.label}</span>
    </label>
  `).join('');

  container.innerHTML = `
    <div class="p-4 h-full flex flex-col gap-4">
      <div class="grid md:grid-cols-4 gap-4 items-end">
        <label class="flex flex-col gap-2 text-sm text-gray-200">
          Brand
          <select id="scrapper-brand" class="form-input">${renderOptionsHtml(SCRAPPER_BRANDS)}</select>
        </label>
        <div class="flex flex-col gap-2 text-sm text-gray-200">
          <span class="font-semibold">Driver size(s) (multi-select)</span>
          <div id="scrapper-size-list" class="grid sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-52 overflow-auto border border-gray-700 rounded-md p-2 bg-black/30">
            ${checkAllHtml}
            ${sizeOptionsHtml}
          </div>
        </div>
        <button id="scrapper-run" class="btn btn--accent">Search</button>
        <button id="scrapper-add-all" class="btn btn--primary">Add All</button>
      </div>
      <div id="scrapper-status" class="text-sm text-gray-300">Ready to search.</div>
      <div id="scrapper-results" class="grid gap-3 overflow-auto flex-grow"></div>
    </div>
  `;

  const brandSelect = container.querySelector('#scrapper-brand');
  const sizeList = container.querySelector('#scrapper-size-list');
  const checkAllBox = container.querySelector('#scrapper-check-all');
  const runBtn = container.querySelector('#scrapper-run');
  const addAllBtn = container.querySelector('#scrapper-add-all');
  const statusEl = container.querySelector('#scrapper-status');
  const resultsEl = container.querySelector('#scrapper-results');

  const state = { results: [] };

  // Pré-sélectionner "Toutes les tailles"
  const anyCheckbox = sizeList.querySelector('[data-size-id="any"]');
  if (anyCheckbox) anyCheckbox.checked = true;

  if (checkAllBox) {
    checkAllBox.addEventListener('change', (evt) => {
      const shouldCheck = evt.target.checked;
      sizeList.querySelectorAll('input[data-size-id]').forEach(cb => {
        cb.checked = shouldCheck;
      });
    });
  }

  async function handleRun() {
    const brandId = brandSelect.value;
    const checkedIds = Array.from(sizeList.querySelectorAll('input[data-size-id]:checked')).map(el => el.dataset.sizeId);

    // Si "any" est coché ou rien d'autre, on ignore les filtres taille
    const selectedSizeIds = checkedIds.includes('any') ? [] : checkedIds;

    // Mapper ids -> options
    const selectedOptions = SCRAPPER_MEMBRANE_SIZES.filter(opt => selectedSizeIds.includes(opt.id));
    
    statusEl.textContent = 'Searching (multi-page)...';
    try {
      const { results } = await scrapeSearchPage({ brand: brandId, selectedOptions });
      state.results = results;
      statusEl.textContent = `Search done: ${results.length} drivers found.`;
      renderResults(resultsEl, state.results);
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
      renderResults(resultsEl, []);
    }
  }

  async function handleAddAll() {
    if (!onAddDriver || !state.results.length) {
      statusEl.textContent = 'No results to add.';
      return;
    }
    statusEl.textContent = 'Adding all results...';
    for (const result of state.results) {
      const driverContent = toDriverContent(result);
      const driver = { name: result.name, content: driverContent, params: result.params };
      try {
        await onAddDriver(driver);
      } catch (err) {
        console.error('Add all error', err);
      }
    }
    statusEl.textContent = 'All results added.';
  }

  async function handleSave(result) {
    if (!onAddDriver) return;
    statusEl.textContent = `Enregistrement de ${result.name}...`;
    const driverContent = toDriverContent(result);
    const driver = { name: result.name, content: driverContent, params: result.params };
    const saveResult = await onAddDriver(driver);
    if (saveResult?.success || saveResult === true) {
      statusEl.textContent = `${result.name} ajoute a la base.`;
    } else {
      statusEl.textContent = `Erreur pendant l'ajout: ${saveResult?.error || 'inconnue'}`;
    }
  }

  runBtn.addEventListener('click', handleRun);
  addAllBtn.addEventListener('click', handleAddAll);

  resultsEl.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('[data-action="save-result"]');
    if (!actionBtn) return;
    const card = actionBtn.closest('[data-result-index]');
    if (!card) return;
    const index = Number(card.dataset.resultIndex);
    const result = state.results[index];
    if (result) handleSave(result);
  });
}
