export const SCRAPPER_BASE_URL = 'https://loudspeakerdatabase.com';

// Brands disponibles - a mettre a jour avec discoverBrandsAndSizes.js
export const SCRAPPER_BRANDS = [
  { id: '18Sound', label: '18 Sound' },
  { id: 'BC', label: 'B&C' },
  { id: 'Beyma', label: 'Beyma' },
  { id: 'BMS', label: 'BMS' },
  { id: 'Celestion', label: 'Celestion' },
  { id: 'CerwinVega', label: 'Cerwin Vega' },
  { id: 'DAS', label: 'DAS' },
  { id: 'Faital', label: 'Faital' },
  { id: 'Eminence', label: 'Eminence' },
  { id: 'Ciare', label: 'Ciare' },
  { id: 'Dayton', label: 'Dayton' },
  { id: 'FANE', label: 'FANE' },
  { id: 'Focal', label: 'Focal' },
  { id: 'Fostex', label: 'Fostex' },
  { id: 'LaVoce', label: 'LaVoce' },
  { id: 'MONACOR', label: 'Monacor' },
  { id: 'Pioneer', label: 'Pioneer' },
  { id: 'PrecisionDevices', label: 'Precision Devices' },
  { id: 'RCF', label: 'RCF' },
  { id: 'Radian', label: 'Radian' },
  { id: 'SB', label: 'SB Acoustique' },
  { id: 'SEAS', label: 'SEAS' },
  { id: 'TangBand', label: 'Tang Band' },
  { id: 'VISATON', label: 'VISATON' }
];

// Tailles disponibles - multi-sélection possible
// Supporte min/max pour les intervalles et sizes pour des valeurs exactes
export const SCRAPPER_MEMBRANE_SIZES = [
  { id: 'lt1', label: '<1"', min: null, max: 1, sizes: [] },
  { id: '1-5', label: '1" a 5"', min: 1, max: 5, sizes: [] },
  { id: '5', label: '5"', min: 5, max: 5, sizes: [5] },
  { id: '6', label: '6"', min: 6, max: 6, sizes: [6] },
  { id: '6-8', label: '6" a 8"', min: 6, max: 8, sizes: [] },
  { id: '8', label: '8"', min: 8, max: 8, sizes: [8] },
  { id: '10', label: '10"', min: 10, max: 10, sizes: [10] },
  { id: '12', label: '12"', min: 12, max: 12, sizes: [12] },
  { id: '15', label: '15"', min: 15, max: 15, sizes: [15] },
  { id: '18', label: '18"', min: 18, max: 18, sizes: [18] },
  { id: '8-12', label: '8" a 12"', min: 8, max: 12, sizes: [] },
  { id: '10-15', label: '10" a 15"', min: 10, max: 15, sizes: [] },
  { id: '12-18', label: '12" a 18"', min: 12, max: 18, sizes: [] },
  { id: '18-21', label: '18" a 21"', min: 18, max: 21, sizes: [] },
  { id: '21', label: '21"', min: 21, max: 21, sizes: [21] },
  { id: '24', label: '24"', min: 24, max: 24, sizes: [24] },
  { id: 'gt24', label: '>24"', min: 25, max: null, sizes: [] }
];

export const SCRAPE_PARAM_KEYS = ['SD', 'Mms', 'fs', 'Qms', 'Re', 'BL', 'Le'];

export async function loadTestDatabase() {
  const response = await fetch(new URL('./testDatabase.json', import.meta.url));
  return response.json();
}
