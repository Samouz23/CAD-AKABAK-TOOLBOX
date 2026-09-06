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
const FETCH_RETRIES = 2; // Retries for transient errors (5xx / network), 429 is NOT retried here
const FETCH_RETRY_BASE_DELAY = 800; // ms, doubles each retry
const DETAIL_FETCH_DELAY = 350; // ms between individual driver-detail requests to avoid rate limiting
const GLOBAL_MIN_INTERVAL = 350; // ms, minimum spacing enforced between ANY outgoing request
const RATE_LIMIT_COOLDOWN = 60000; // ms, once a 429 is seen, refuse new requests for this long

// Module-level circuit breaker: shared across all searches so we stop hammering
// the site the moment it starts responding 429, instead of retrying into a longer ban.
let lastRequestAt = 0;
let rateLimitedUntil = 0;

class RateLimitError extends Error {
  constructor(message, retryInMs) {
    super(message);
    this.name = 'RateLimitError';
    this.retryInMs = retryInMs;
  }
}

function msToClock(ms) {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s}s`;
}

function parseRetryAfterMs(response) {
  const header = typeof response.headers?.get === 'function' ? response.headers.get('Retry-After') : null;
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const dateMs = Date.parse(header);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

async function throttleGlobal() {
  const wait = Math.max(0, lastRequestAt + GLOBAL_MIN_INTERVAL - Date.now());
  if (wait > 0) await delay(wait);
  lastRequestAt = Date.now();
}

function normalizeBrandKey(value) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Matches user input against known brands ignoring case/spaces/punctuation
// (e.g. "oberton", "OBERTON", "sb audience" or "sbaudience" all resolve correctly).
// Falls back to the raw trimmed input when no known brand matches, so any exact
// slug typed by the user still works.
export function resolveBrandId(rawInput) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return trimmed;
  const key = normalizeBrandKey(trimmed);
  const match = SCRAPPER_BRANDS.find(b => normalizeBrandKey(b.id) === key || normalizeBrandKey(b.label) === key);
  return match ? match.id : trimmed;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
  if (Date.now() < rateLimitedUntil) {
    throw new RateLimitError(`Rate limited by the site, retry in ${msToClock(rateLimitedUntil - Date.now())}`, rateLimitedUntil - Date.now());
  }
  let lastErr;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    await throttleGlobal();
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 429) {
          // Don't hammer further: back off immediately and let all callers bail out
          const retryMs = parseRetryAfterMs(response) ?? RATE_LIMIT_COOLDOWN;
          rateLimitedUntil = Date.now() + Math.max(retryMs, RATE_LIMIT_COOLDOWN);
          throw new RateLimitError(`Rate limited by the site (HTTP 429), retry in ${msToClock(rateLimitedUntil - Date.now())}`, rateLimitedUntil - Date.now());
        }
        if (response.status >= 500 && attempt < FETCH_RETRIES) {
          await delay(FETCH_RETRY_BASE_DELAY * (attempt + 1));
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      lastErr = err;
      if (attempt < FETCH_RETRIES) {
        await delay(FETCH_RETRY_BASE_DELAY * (attempt + 1));
        continue;
      }
    }
  }
  throw lastErr;
}

function addOffsetSegment(url, offset) {
  if (offset === 0) return url;
  const [base, query] = url.split('?');
  const suffix = query ? `?${query}` : '';
  return `${base}/offset=${offset}${suffix}`;
}

async function collectPaginatedLinks(searchUrl) {
  const links = new Set();
  let pagesFailed = 0;
  for (let pageIndex = 0; pageIndex < MAX_OFFSETS; pageIndex++) {
    const offset = pageIndex * OFFSET_STEP;
    const pageUrl = addOffsetSegment(searchUrl, offset);
    let html;
    try {
      html = await fetchHtml(pageUrl);
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      // Keep links already collected instead of losing everything on one bad page
      console.error('Pagination page failed', pageUrl, err);
      pagesFailed += 1;
      break;
    }
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
  return { links: Array.from(links), pagesFailed };
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
  const failedLinks = [];
  let pagesFailed = 0;
  let rateLimitError = null;

  for (const searchUrl of urls) {
    if (rateLimitError) break;
    try {
      const { links, pagesFailed: failedForUrl } = await collectPaginatedLinks(searchUrl);
      pagesFailed += failedForUrl;

      for (const link of links) {
        if (rateLimitError) break;
        try {
          const detail = await scrapeDriverDetail(link);
          if (detail) results.push(detail);
          else failedLinks.push(link);
        } catch (err) {
          if (err instanceof RateLimitError) { rateLimitError = err; break; }
          console.error('Scrape detail failed', link, err);
          failedLinks.push(link);
        }
        // Throttle so we don't get rate-limited (429) mid-scrape and silently lose drivers
        await delay(DETAIL_FETCH_DELAY);
      }
    } catch (err) {
      if (err instanceof RateLimitError) { rateLimitError = err; continue; }
      console.error('Scrape search page failed', searchUrl, err);
    }
  }

  return { urls, results, failedLinks, pagesFailed, rateLimitError };
}

function renderOptionsHtml(options) {
  return options.map(opt => `<option value="${opt.id}">${opt.label}</option>`).join('');
}

function renderResultRow(result, index) {
  const p = result.params || {};
  const order = [
    ['SDf', p.SDf, 'cm²'], ['SDr', p.SDr, 'cm²'], ['Mms', p.Mms, 'g'],
    ['fs', p.fs, 'Hz'], ['Qms', p.Qms, ''], ['Re', p.Re, 'Ω'],
    ['BL', p.BL, 'N/A'], ['Le', p.Le, 'mH']
  ];
  const chips = order.map(([k, v, u]) => v === undefined || v === null || v === '' ? '' :
    `<span class="scrp-param"><span class="scrp-param-k">${k}</span><span class="scrp-param-v">${v}${u ? ` <span style="opacity:.6;font-weight:500">${u}</span>` : ''}</span></span>`
  ).join('');
  return `
    <div class="scrp-result" data-result-index="${index}">
      <div class="scrp-result-head">
        <div style="min-width: 0;">
          <div class="scrp-result-name">${result.name}</div>
          <a href="${result.sourceUrl}" target="_blank" rel="noopener" class="scrp-result-src" title="${result.sourceUrl}">${result.sourceUrl}</a>
        </div>
        <button class="scrp-save-btn" data-action="save-result">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>Save</span>
        </button>
      </div>
      <div class="scrp-result-params">${chips}</div>
    </div>
  `;
}

function renderResults(container, results) {
  if (!results.length) {
    container.innerHTML = '<div class="scrp-empty">No result. Try different filters or launch a search.</div>';
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

function getScrapperStyles() {
  return `
    <style id="scrapper-panel-styles">
      .scrp-root { padding: 24px; height: 100%; display: flex; flex-direction: column; gap: 18px; min-height: 0; }
      .scrp-card { background: rgba(0,0,0,0.28); border: 1px solid var(--border-secondary, #374151); border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 16px; }
      .scrp-row { display: grid; grid-template-columns: 1fr; gap: 16px; }
      @media (min-width: 900px) { .scrp-row { grid-template-columns: 280px 1fr; } }

      .scrp-label { display: block; color: var(--text-subtitle, #d1d5db); font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 8px; }
      .scrp-select { width: 100%; padding: 10px 12px; background: rgba(0,0,0,0.35); border: 1px solid var(--border-secondary, #4b5563); border-radius: 10px; color: var(--text-body, #fff); font-size: 14px; font-family: inherit; appearance: none; cursor: pointer; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px; transition: border-color .18s, box-shadow .18s; }
      .scrp-select:focus { outline: none; border-color: var(--border-primary, #e91e63); box-shadow: 0 0 0 3px rgba(233,30,99,0.2); }

      .scrp-size-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .scrp-size-counter { color: var(--text-muted, #9ca3af); font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,0.05); }
      .scrp-size-counter.has-selection { color: white; background: var(--border-primary, #e91e63); }
      .scrp-size-toggle { background: transparent; border: none; color: var(--text-muted, #9ca3af); font-size: 11px; font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: all .18s; text-transform: uppercase; letter-spacing: .4px; }
      .scrp-size-toggle:hover { color: var(--border-primary, #e91e63); background: rgba(233,30,99,0.08); }

      .scrp-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 6px; }
      .scrp-chip { position: relative; cursor: pointer; user-select: none; }
      .scrp-chip input { position: absolute; opacity: 0; pointer-events: none; }
      .scrp-chip-body { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-secondary, #4b5563); border-radius: 8px; color: var(--text-body, #e5e7eb); font-size: 12.5px; font-weight: 500; transition: all .18s ease; text-align: center; }
      .scrp-chip:hover .scrp-chip-body { border-color: var(--border-primary, #e91e63); color: white; background: rgba(233,30,99,0.06); }
      .scrp-chip input:checked + .scrp-chip-body { background: var(--border-primary, #e91e63); border-color: var(--border-primary, #e91e63); color: white; box-shadow: 0 2px 8px rgba(233,30,99,0.25); font-weight: 600; }
      .scrp-chip input:focus-visible + .scrp-chip-body { box-shadow: 0 0 0 3px rgba(233,30,99,0.35); }

      .scrp-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .scrp-btn { padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .18s ease; font-family: inherit; border: 1px solid transparent; display: inline-flex; align-items: center; gap: 8px; }
      .scrp-btn-primary { background: var(--border-primary, #e91e63); color: white; box-shadow: 0 4px 14px rgba(233,30,99,0.28); }
      .scrp-btn-primary:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.08); box-shadow: 0 6px 18px rgba(233,30,99,0.38); }
      .scrp-btn-ghost { background: transparent; color: var(--text-muted, #cbd5e1); border-color: var(--border-secondary, #4b5563); }
      .scrp-btn-ghost:hover:not(:disabled) { color: white; border-color: var(--text-muted, #9ca3af); background: rgba(255,255,255,0.04); }
      .scrp-btn:disabled { opacity: .5; cursor: not-allowed; }
      .scrp-btn .scrp-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: scrpSpin .7s linear infinite; }
      @keyframes scrpSpin { to { transform: rotate(360deg); } }

      .scrp-status { display: flex; align-items: center; gap: 10px; color: var(--text-muted, #9ca3af); font-size: 12.5px; min-height: 20px; }
      .scrp-status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted, #9ca3af); flex-shrink: 0; }
      .scrp-status.is-loading .scrp-status-dot { background: var(--border-primary, #e91e63); animation: scrpPulse 1s ease-in-out infinite; }
      .scrp-status.is-success .scrp-status-dot { background: rgb(34,197,94); }
      .scrp-status.is-error .scrp-status-dot { background: rgb(239,68,68); }
      @keyframes scrpPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(1.4); } }

      /* Results */
      .scrp-results { overflow-y: auto; flex-grow: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; scrollbar-width: thin; scrollbar-color: var(--border-secondary,#4b5563) transparent; }
      .scrp-results::-webkit-scrollbar { width: 8px; }
      .scrp-results::-webkit-scrollbar-thumb { background: var(--border-secondary, #4b5563); border-radius: 4px; }
      .scrp-empty { text-align: center; padding: 48px 24px; color: var(--text-muted, #9ca3af); font-size: 13px; }

      .scrp-result { background: rgba(0,0,0,0.28); border: 1px solid var(--border-secondary, #374151); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; transition: border-color .18s ease, transform .18s ease; }
      .scrp-result:hover { border-color: var(--border-primary, #e91e63); }
      .scrp-result.is-saved { border-color: rgba(34,197,94,0.4); background: rgba(34,197,94,0.06); }
      .scrp-result-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .scrp-result-name { color: var(--text-body, #fff); font-size: 14px; font-weight: 600; }
      .scrp-result-src { color: var(--text-muted, #6b7280); font-size: 11px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; display: inline-block; }
      .scrp-result-params { display: flex; flex-wrap: wrap; gap: 6px; }
      .scrp-param { display: inline-flex; align-items: baseline; gap: 4px; padding: 3px 9px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 999px; font-size: 11.5px; font-variant-numeric: tabular-nums; color: var(--text-body, #e5e7eb); }
      .scrp-param-k { color: var(--text-muted, #9ca3af); font-weight: 500; }
      .scrp-param-v { font-weight: 600; }
      .scrp-save-btn { padding: 7px 14px; border-radius: 8px; border: 1px solid var(--border-primary, #e91e63); background: transparent; color: var(--border-primary, #e91e63); font-size: 12px; font-weight: 600; cursor: pointer; transition: all .18s; font-family: inherit; flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; }
      .scrp-save-btn:hover { background: var(--border-primary, #e91e63); color: white; }
      .scrp-save-btn.is-saved { border-color: rgb(34,197,94); color: rgb(34,197,94); background: transparent; cursor: default; }
      .scrp-save-btn.is-saved:hover { background: transparent; color: rgb(34,197,94); }
    </style>
  `;
}

export function renderScrapperView({ container, onAddDriver }) {
  const sizeOptionsHtml = SCRAPPER_MEMBRANE_SIZES.map(opt => `
    <label class="scrp-chip">
      <input type="checkbox" data-size-id="${opt.id}">
      <span class="scrp-chip-body">${opt.label}</span>
    </label>
  `).join('');

  container.innerHTML = `
    ${getScrapperStyles()}
    <div class="scrp-root">
      <div class="scrp-card">
        <div class="scrp-row">
          <div>
            <label class="scrp-label" for="scrapper-brand">Brand</label>
            <select id="scrapper-brand" class="scrp-select">${renderOptionsHtml(SCRAPPER_BRANDS)}</select>
            <input type="text" id="scrapper-brand-custom" class="scrp-select" style="margin-top:8px" placeholder="Or type a custom brand slug (e.g. Peerless, ScanSpeak)…">
          </div>
          <div>
            <div class="scrp-size-header">
              <span class="scrp-label" style="margin-bottom:0">Driver size(s)</span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span id="scrapper-size-counter" class="scrp-size-counter">0 selected</span>
                <button type="button" id="scrapper-check-all" class="scrp-size-toggle">Select all</button>
              </div>
            </div>
            <div id="scrapper-size-list" class="scrp-chips">
              ${sizeOptionsHtml}
            </div>
          </div>
        </div>
        <div class="scrp-actions">
          <button id="scrapper-run" class="scrp-btn scrp-btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <span>Search</span>
          </button>
          <button id="scrapper-add-all" class="scrp-btn scrp-btn-ghost" disabled>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Add all</span>
          </button>
        </div>
        <div id="scrapper-status" class="scrp-status">
          <span class="scrp-status-dot"></span>
          <span class="scrp-status-text">Ready to search.</span>
        </div>
      </div>
      <div id="scrapper-results" class="scrp-results"></div>
    </div>
  `;

  const brandSelect = container.querySelector('#scrapper-brand');
  const brandCustomInput = container.querySelector('#scrapper-brand-custom');
  const sizeList = container.querySelector('#scrapper-size-list');
  const checkAllBtn = container.querySelector('#scrapper-check-all');
  const sizeCounter = container.querySelector('#scrapper-size-counter');
  const runBtn = container.querySelector('#scrapper-run');
  const addAllBtn = container.querySelector('#scrapper-add-all');
  const statusEl = container.querySelector('#scrapper-status');
  const statusText = statusEl.querySelector('.scrp-status-text');
  const resultsEl = container.querySelector('#scrapper-results');

  const state = { results: [] };

  const setStatus = (text, tone) => {
    statusText.textContent = text;
    statusEl.classList.remove('is-loading', 'is-success', 'is-error');
    if (tone) statusEl.classList.add(`is-${tone}`);
  };

  const updateSizeCounter = () => {
    const checked = sizeList.querySelectorAll('input[data-size-id]:checked').length;
    const total = sizeList.querySelectorAll('input[data-size-id]').length;
    sizeCounter.textContent = checked === 0 ? '0 selected' : `${checked} selected`;
    sizeCounter.classList.toggle('has-selection', checked > 0);
    checkAllBtn.textContent = checked === total ? 'Clear' : 'Select all';
  };

  // Pré-sélectionner "any" si présent
  const anyCheckbox = sizeList.querySelector('[data-size-id="any"]');
  if (anyCheckbox) anyCheckbox.checked = true;
  updateSizeCounter();

  sizeList.addEventListener('change', updateSizeCounter);

  checkAllBtn.addEventListener('click', () => {
    const boxes = sizeList.querySelectorAll('input[data-size-id]');
    const allChecked = Array.from(boxes).every(b => b.checked);
    boxes.forEach(cb => { cb.checked = !allChecked; });
    updateSizeCounter();
  });

  const setRunLoading = (loading) => {
    if (loading) {
      runBtn.disabled = true;
      runBtn.innerHTML = '<span class="scrp-spinner"></span><span>Searching…</span>';
    } else {
      runBtn.disabled = false;
      runBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><span>Search</span>';
    }
  };

  async function handleRun() {
    const customBrand = (brandCustomInput.value || '').trim();
    const brandId = resolveBrandId(customBrand || brandSelect.value);
    const checkedIds = Array.from(sizeList.querySelectorAll('input[data-size-id]:checked')).map(el => el.dataset.sizeId);
    const selectedSizeIds = checkedIds.includes('any') ? [] : checkedIds;
    const selectedOptions = SCRAPPER_MEMBRANE_SIZES.filter(opt => selectedSizeIds.includes(opt.id));

    setRunLoading(true);
    setStatus('Searching (multi-page)…', 'loading');
    addAllBtn.disabled = true;
    try {
      const { results, failedLinks, pagesFailed, rateLimitError } = await scrapeSearchPage({ brand: brandId, selectedOptions });
      state.results = results;
      const foundText = `${results.length} driver${results.length === 1 ? '' : 's'} found.`;
      if (rateLimitError) {
        setStatus(`${foundText} ${rateLimitError.message}.`, 'error');
      } else {
        const issues = failedLinks.length + pagesFailed;
        const warnText = issues ? ` ${issues} driver${issues === 1 ? '' : 's'} could not be loaded — try Search again to retry.` : '';
        setStatus(foundText + warnText, results.length ? (issues ? 'loading' : 'success') : null);
      }
      addAllBtn.disabled = !results.length;
      renderResults(resultsEl, state.results);
    } catch (err) {
      setStatus(`Error: ${err.message}`, 'error');
      renderResults(resultsEl, []);
    } finally {
      setRunLoading(false);
    }
  }

  async function handleAddAll() {
    if (!onAddDriver || !state.results.length) {
      setStatus('No results to add.', 'error');
      return;
    }
    addAllBtn.disabled = true;
    setStatus('Adding all results…', 'loading');
    let added = 0;
    for (const result of state.results) {
      const driverContent = toDriverContent(result);
      const driver = { name: result.name, content: driverContent, params: result.params };
      try {
        await onAddDriver(driver);
        added += 1;
      } catch (err) {
        console.error('Add all error', err);
      }
    }
    setStatus(`${added} driver${added === 1 ? '' : 's'} added to the database.`, 'success');
    resultsEl.querySelectorAll('.scrp-result').forEach(el => el.classList.add('is-saved'));
    resultsEl.querySelectorAll('.scrp-save-btn').forEach(btn => {
      btn.classList.add('is-saved');
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Saved</span>';
    });
    addAllBtn.disabled = false;
  }

  async function handleSave(result, btn, card) {
    if (!onAddDriver) return;
    btn.disabled = true;
    setStatus(`Saving ${result.name}…`, 'loading');
    const driverContent = toDriverContent(result);
    const driver = { name: result.name, content: driverContent, params: result.params };
    const saveResult = await onAddDriver(driver);
    if (saveResult?.success || saveResult === true) {
      setStatus(`${result.name} added to the database.`, 'success');
      card.classList.add('is-saved');
      btn.classList.add('is-saved');
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Saved</span>';
    } else {
      setStatus(`Error while saving: ${saveResult?.error || 'unknown'}`, 'error');
      btn.disabled = false;
    }
  }

  runBtn.addEventListener('click', handleRun);
  addAllBtn.addEventListener('click', handleAddAll);

  resultsEl.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('[data-action="save-result"]');
    if (!actionBtn || actionBtn.disabled) return;
    const card = actionBtn.closest('[data-result-index]');
    if (!card) return;
    const index = Number(card.dataset.resultIndex);
    const result = state.results[index];
    if (result) handleSave(result, actionBtn, card);
  });
}
