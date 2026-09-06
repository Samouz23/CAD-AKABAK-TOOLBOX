// =======================================================
// FILE: src/js/panels/updates.js
// =======================================================

export function getUpdatesHtml() {
  return `
    <div class="p-4 overflow-hidden">
<h3 class="text-lg font-semibold text-white">Version 3.0.1</h3>
      <ul class="list-disc list-inside space-y-1 text-gray-300 mb-4">
        <li><strong>New:</strong> CFD port solver — the air flow inside a vent is now solved with OpenFOAM (Navier-Stokes), showing the real air velocity, the separation and the vortices that the acoustic solver cannot describe</li>
        <li><strong>New:</strong> Guided CFD backend setup — the app detects what is missing (WSL, Linux distribution, OpenFOAM), explains it in plain words and can install OpenFOAM for you without administrator rights</li>
        <li><strong>New:</strong> Output filters — high-pass, low-pass, shelving and bell bands with Butterworth, Linkwitz-Riley or free-Q alignment, per-band bypass, applied without re-running the simulation</li>
        <li><strong>New:</strong> Frozen curves — freeze the current response to compare voltages, filters or geometries on the same graph, saved with the study</li>
        <li><strong>New:</strong> Excursion graph — cone travel in mm beside the SPL graph, with the driver Xmax limit line and the remaining headroom in dB under the cursor</li>
        <li><strong>Improved:</strong> Air flow field settings are documented in English and the colour scale can switch between linear and logarithmic</li>
        <li><strong>Fixed:</strong> A CFD result is now dropped automatically when the port velocity changes, because a turbulent flow does not scale with level</li>
      </ul>
    </div>
  `;
}


