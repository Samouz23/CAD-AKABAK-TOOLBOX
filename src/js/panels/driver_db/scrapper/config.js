export const SCRAPPER_BASE_URL = 'https://loudspeakerdatabase.com';

// Brands disponibles - a mettre a jour avec discoverBrandsAndSizes.js
// NOTE: loudspeakerdatabase.com recense 200+ marques. Cette liste ne couvre que les plus
// courantes et verifiees manuellement (slug exact requis dans l'URL /search/brand=<slug>).
// Si une marque recherchee n'apparait pas ici, utiliser le champ "Custom brand" du panneau
// Search pour saisir directement le slug (visible dans l'URL de la marque sur le site).
export const SCRAPPER_BRANDS = [
  { id: '18Sound', label: '18 Sound' },
  { id: 'accuton', label: 'Accuton' },
  { id: 'ALPINE', label: 'Alpine' },
  { id: 'AudioSystem', label: 'Audio System' },
  { id: 'BC', label: 'B&C' },
  { id: 'Beyma', label: 'Beyma' },
  { id: 'BMS', label: 'BMS' },
  { id: 'Celestion', label: 'Celestion' },
  { id: 'CerwinVega', label: 'Cerwin Vega' },
  { id: 'Ciare', label: 'Ciare' },
  { id: 'DAS', label: 'D.A.S. Audio' },
  { id: 'Dayton', label: 'Dayton Audio' },
  { id: 'Eminence', label: 'Eminence' },
  { id: 'Faital', label: 'FaitalPRO' },
  { id: 'FANE', label: 'FANE' },
  { id: 'Focal', label: 'Focal' },
  { id: 'Fostex', label: 'Fostex' },
  { id: 'JL', label: 'JL Audio' },
  { id: 'LaVoce', label: 'LaVoce' },
  { id: 'MONACOR', label: 'Monacor' },
  { id: 'Morel', label: 'Morel' },
  { id: 'Oberton', label: 'Oberton' },
  { id: 'Peerless', label: 'Peerless' },
  { id: 'Pioneer', label: 'Pioneer' },
  { id: 'PrecisionDevices', label: 'Precision Devices' },
  { id: 'PURIFI', label: 'PURIFI' },
  { id: 'Radian', label: 'Radian' },
  { id: 'RCF', label: 'RCF' },
  { id: 'REDCATT', label: 'REDCATT' },
  { id: 'RockfordFosgate', label: 'Rockford Fosgate' },
  { id: 'SB', label: 'SB Acoustics' },
  { id: 'SBAudience', label: 'SB Audience' },
  { id: 'ScanSpeak', label: 'Scan-Speak' },
  { id: 'SEAS', label: 'SEAS' },
  { id: 'SICA', label: 'SICA' },
  { id: 'STX', label: 'STX' },
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
