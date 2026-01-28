// =======================================================
// FILE: src/js/panels/updates.js
// =======================================================

export function getUpdatesHtml() {
  return `
    <div class="p-4 overflow-hidden">
      <h3 class="text-lg font-semibold text-white">Version 1.0.3</h3>
      <ul class="list-disc list-inside space-y-1 text-gray-300 mb-4">
        <li>Added directivity module</li>
        <li>Simplified and improved Geometry, basics calculator, mesh and driver db popups</li>
      </ul>
<h3 class="text-lg font-semibold text-white">Version 1.0.2</h3>
      <ul class="list-disc list-inside space-y-1 text-gray-300 mb-4">
        <li>Added 2 new modules in Physics: SPL Calculator & Crossover Calculator</li>
        <li>Added web scraper for driver database from loudspeakerdatabase.com</li>
        <li>Added "Find Similar" feature to compare drivers by T&S parameters</li>
        <li>Smart JSON-based driver database with advanced filtering</li>
        <li>Added new mesh export features in Waveguide Studio</li>
        <li>Added bilingual manual (English/French) with language switcher</li>
        <li>Improved UI themes and customization options</li>
        <li>Minor bug fixes and performance improvements</li>
      </ul>
    </div>
  `;
}


