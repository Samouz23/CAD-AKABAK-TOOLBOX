// =======================================================
// FILE: src/js/panels/updates.js
// =======================================================

export function getUpdatesHtml() {
  return `
    <div class="p-4 overflow-hidden">
      <h3 class="text-lg font-semibold text-white">Version 1.1.0</h3>
      <ul class="list-disc list-inside space-y-1 text-gray-300 mb-4">
        <li><strong>New:</strong> Akabak LEM circuit editor — drag-and-drop lumped element modeling with AKP binary export</li>
        <li><strong>New:</strong> HornStudio — interactive horn designer with live preview & formula generation</li>
        <li><strong>New:</strong> 3D Mesh Preview — Three.js viewer with per-surface color coding, orbit controls & multi-format export (STL, OBJ, Collada)</li>
        <li><strong>New:</strong> Waveguide presets database — save/load/delete throat and mouth configurations</li>
        <li><strong>New:</strong> Formula templates system — centralized Duct, Waveguide, Enclosure templates with grid/code editor</li>
        <li><strong>New:</strong> Feature flags system for safe experimental feature rollout (OCR import, Enclosure calculator)</li>
        <li><strong>New:</strong> Integrated Akabak help documentation (40+ reference chapters)</li>
        <li><strong>Refactor:</strong> Horn module split from monolith (1400+ lines) to modular architecture (config, chart, formulas, exporters, tableManager)</li>
        <li><strong>Refactor:</strong> Mesh module refactored into modular directory with dedicated popup components</li>
        <li><strong>Improved:</strong> Mesh handlers — STEP parsing, physical group management, mirror symmetry, smart surface naming</li>
        <li><strong>Improved:</strong> Main settings panel — collapsible sections, LEM template selector, theme picker</li>
        <li><strong>Improved:</strong> IPC/Preload layer expanded with LEM, mesh preview & waveguide preset APIs</li>
        <li><strong>Removed:</strong> Deprecated NAS client, NAS handlers & orders handlers</li>
      </ul>
      <h3 class="text-lg font-semibold text-white">Version 1.0.3</h3>
      <ul class="list-disc list-inside space-y-1 text-gray-300 mb-4">
        <li>Added directivity module</li>
        <li>Simplified and improved Geometry, basics calculator, mesh and driver db popups</li>
      </ul>
    </div>
  `;
}


