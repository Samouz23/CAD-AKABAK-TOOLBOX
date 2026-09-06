// =======================================================
// scripts/bem_galerkin_validate.mjs
//
// Valide le nouveau noyau Galerkin P1 (src/js/bem/bemGalerkin.js) contre la
// solution analytique EXACTE de la sphère pulsante (monopole rayonnant en
// espace libre, condition de vitesse normale uniforme imposée).
//
// p(r) = A e^{ikr}/r,  A = i*omega*rho*v0*a^2*e^{-ika} / (i*k*a - 1)
// (dérivée de dp/dr(a) = i*omega*rho*v0, cf. Kinsler & Frey).
//
// Usage : node scripts/bem_galerkin_validate.mjs
// =======================================================
import bemSharedModule from '../src/js/bem/bemShared.js';
import galerkinModule from '../src/js/bem/bemGalerkin.js';
const bemShared = bemSharedModule;
const galerkin = galerkinModule;

const C_AIR = 344, RHO_AIR = 1.21;

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  —  ' + detail : ''}`);
  if (!ok) failed++;
}

// ---- Maillage UV-sphère soudé (les pôles partagent un seul nœud) ----
function buildSphereMesh(radius, nLat, nLon) {
  const nodes = [];
  const idx = (i, j) => { // i: 0..nLat (latitude, 0=pole nord), j: 0..nLon-1
    if (i === 0) return 0;             // pôle nord unique
    if (i === nLat) return 1;          // pôle sud unique
    return 2 + (i - 1) * nLon + (j % nLon);
  };
  nodes.push([0, 0, radius]);   // pôle nord
  nodes.push([0, 0, -radius]);  // pôle sud
  for (let i = 1; i < nLat; i++) {
    const theta = Math.PI * i / nLat; // 0..pi
    const z = radius * Math.cos(theta);
    const r = radius * Math.sin(theta);
    for (let j = 0; j < nLon; j++) {
      const phi = 2 * Math.PI * j / nLon;
      nodes.push([r * Math.cos(phi), r * Math.sin(phi), z]);
    }
  }

  const elements = [];
  const addTri = (a, b, c) => {
    const v0 = nodes[a], v1 = nodes[b], v2 = nodes[c];
    const e1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
    const e2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
    const nx = e1[1]*e2[2]-e1[2]*e2[1], ny = e1[2]*e2[0]-e1[0]*e2[2], nz = e1[0]*e2[1]-e1[1]*e2[0];
    const len = Math.hypot(nx, ny, nz);
    const area = len / 2;
    if (area < 1e-12) return;
    // Normale sortante : doit pointer comme le centroïde (sphère centrée en 0).
    const cx = (v0[0]+v1[0]+v2[0])/3, cy=(v0[1]+v1[1]+v2[1])/3, cz=(v0[2]+v1[2]+v2[2])/3;
    // Convention du solveur (bemDomainCore.js) : la normale pointe VERS
    // L'EXTÉRIEUR DU DOMAINE ACOUSTIQUE qu'elle borde. Ici le domaine est
    // l'air EXTÉRIEUR à la sphère (r>a) : sortir de ce domaine au niveau de
    // la coque, c'est pointer VERS LE CENTRE (r décroissant).
    let n = [nx/len, ny/len, nz/len];
    if (n[0]*cx + n[1]*cy + n[2]*cz > 0) { [b, c] = [c, b]; return addTri(a, b, c); }
    elements.push({ nodes: [a, b, c], normal: n, area });
  };

  // Calotte nord
  for (let j = 0; j < nLon; j++) addTri(0, idx(1, j), idx(1, j + 1));
  // Bandes
  for (let i = 1; i < nLat - 1; i++) {
    for (let j = 0; j < nLon; j++) {
      addTri(idx(i, j), idx(i + 1, j), idx(i + 1, j + 1));
      addTri(idx(i, j), idx(i + 1, j + 1), idx(i, j + 1));
    }
  }
  // Calotte sud
  for (let j = 0; j < nLon; j++) addTri(1, idx(nLat - 1, j + 1), idx(nLat - 1, j));

  return { nodes, elements };
}

function main() {
  const a = 0.1;      // rayon 10 cm
  const freq = 500;   // Hz — ka petit-ish pour rester dans une zone raisonnable
  const omega = 2 * Math.PI * freq;
  const k = omega / C_AIR;
  const v0 = 0.01;    // m/s, vitesse radiale uniforme (réelle)

  console.log(`\n=== Sphère pulsante — a=${a}m, f=${freq}Hz, ka=${(k*a).toFixed(3)} ===\n`);

  const mesh = buildSphereMesh(a, Number(process.argv[2] || 10), Number(process.argv[3] || 16));
  console.log(`  maillage : ${mesh.nodes.length} nœuds, ${mesh.elements.length} triangles`);

  const { M, S, D, N } = galerkin.assembleGalerkin(mesh, k, { singularOrder: Number(process.argv[4] || 3) });

  // q = dp/dn, n étant la normale "sortante du domaine" (donc pointant vers le
  // centre) : la vitesse physique v0 est radiale sortante (INTO le domaine),
  // donc v_n (le long de n) = -v0, cf. convention "Driven velocity is directed
  // INTO the domain ... v_n_outward = -velocity" (bem_multidomain_solver.md).
  const qRe = 0, qIm = -omega * RHO_AIR * v0;

  // rhs = S q  (q constant => rhs_i = qIm * i * Σ_j S_ij ... en complexe : S*(0+i*qIm))
  const rhs = new Float64Array(2 * N);
  for (let i = 0; i < N; i++) {
    let re = 0, im = 0;
    for (let j = 0; j < N; j++) {
      const sRe = S[2*(i*N+j)], sIm = S[2*(i*N+j)+1];
      // (sRe+i*sIm)*(qRe+i*qIm) = (sRe*qRe - sIm*qIm) + i(sRe*qIm + sIm*qRe)
      re += sRe*qRe - sIm*qIm;
      im += sRe*qIm + sIm*qRe;
    }
    rhs[2*i] = re; rhs[2*i+1] = im;
  }

  // A = 0.5*M + D  (M réelle -> imag=0)
  const A = new Float64Array(2 * N * N);
  for (let i = 0; i < N*N; i++) {
    A[2*i] = 0.5*M[i] + D[2*i];
    A[2*i+1] = D[2*i+1];
  }

  bemShared.complexLUSolve(A, rhs, N, { throwOnSingular: true, label: 'pulsating sphere' });

  // Solution analytique.
  const ka = k*a;
  // A_coef = i*omega*rho*v0*a^2*e^{-ika} / (i*k*a - 1)
  const denomRe = -1, denomIm = ka; // (i*ka - 1)
  const denomMag2 = denomRe*denomRe + denomIm*denomIm;
  const eIkaRe = Math.cos(-ka), eIkaIm = Math.sin(-ka); // e^{-ika}
  // numerator = i*omega*rho*v0*a^2 * (eIkaRe + i eIkaIm) = i*K*(eIkaRe+i*eIkaIm), K=omega*rho*v0*a^2
  const K = omega * RHO_AIR * v0 * a * a;
  const numRe = -K*eIkaIm, numIm = K*eIkaRe; // i*K*(cos+i sin) = K*(i*cos - sin) = -K*sin + i*K*cos
  const coefRe = (numRe*denomRe + numIm*denomIm) / denomMag2;
  const coefIm = (numIm*denomRe - numRe*denomIm) / denomMag2;
  // p(a) = coef * e^{ika}/a
  const eIkaRe2 = Math.cos(ka), eIkaIm2 = Math.sin(ka);
  const pAnaRe = (coefRe*eIkaRe2 - coefIm*eIkaIm2) / a;
  const pAnaIm = (coefRe*eIkaIm2 + coefIm*eIkaRe2) / a;
  const pAnaMag = Math.hypot(pAnaRe, pAnaIm);

  let sumRe = 0, sumIm = 0;
  for (let i = 0; i < N; i++) { sumRe += rhs[2*i]; sumIm += rhs[2*i+1]; }
  const pBemRe = sumRe/N, pBemIm = sumIm/N;
  const pBemMag = Math.hypot(pBemRe, pBemIm);

  console.log(`  analytique : p(a) = ${pAnaRe.toExponential(4)} + i${pAnaIm.toExponential(4)}  (|p|=${pAnaMag.toExponential(4)})`);
  console.log(`  BEM P1     : p(a) = ${pBemRe.toExponential(4)} + i${pBemIm.toExponential(4)}  (|p|=${pBemMag.toExponential(4)})`);
  const errPct = 100 * Math.hypot(pBemRe-pAnaRe, pBemIm-pAnaIm) / pAnaMag;
  console.log(`  écart : ${errPct.toFixed(2)}%`);
  check('P1 Galerkin BEM vs sphère pulsante analytique (<5%)', errPct < 5, `${errPct.toFixed(2)}%`);

  console.log(`\n================ ${failed ? failed + ' FAIL' : 'ALL PASS'} ================`);
  process.exitCode = failed ? 1 : 0;
}

main();
