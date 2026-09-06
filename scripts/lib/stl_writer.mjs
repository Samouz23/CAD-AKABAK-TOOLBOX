// ====================================================================================================
// scripts/lib/stl_writer.mjs
// Binary STL writer. Input: { vertices: Float32Array, indices: Uint32Array }
// Output: ArrayBuffer (binary STL format).
// ====================================================================================================

export function writeBinarySTL(meshes, header = 'DOSC export') {
    const list = Array.isArray(meshes) ? meshes : [meshes];
    let total = 0;
    for (const m of list) if (m?.indices) total += m.indices.length / 3;

    const buf = new ArrayBuffer(80 + 4 + total * 50);
    const view = new DataView(buf);
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < Math.min(80, header.length); i++) u8[i] = header.charCodeAt(i);
    view.setUint32(80, total, true);

    let off = 84;
    for (const m of list) {
        if (!m?.vertices || !m?.indices) continue;
        const v = m.vertices, idx = m.indices;
        for (let i = 0; i < idx.length; i += 3) {
            const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
            const ax = v[a], ay = v[a + 1], az = v[a + 2];
            const bx = v[b], by = v[b + 1], bz = v[b + 2];
            const cx = v[c], cy = v[c + 1], cz = v[c + 2];
            const ux = bx - ax, uy = by - ay, uz = bz - az;
            const wx = cx - ax, wy = cy - ay, wz = cz - az;
            let nx = uy * wz - uz * wy;
            let ny = uz * wx - ux * wz;
            let nz = ux * wy - uy * wx;
            const ln = Math.hypot(nx, ny, nz) || 1;
            nx /= ln; ny /= ln; nz /= ln;
            view.setFloat32(off,      nx, true);
            view.setFloat32(off + 4,  ny, true);
            view.setFloat32(off + 8,  nz, true);
            view.setFloat32(off + 12, ax, true);
            view.setFloat32(off + 16, ay, true);
            view.setFloat32(off + 20, az, true);
            view.setFloat32(off + 24, bx, true);
            view.setFloat32(off + 28, by, true);
            view.setFloat32(off + 32, bz, true);
            view.setFloat32(off + 36, cx, true);
            view.setFloat32(off + 40, cy, true);
            view.setFloat32(off + 44, cz, true);
            view.setUint16 (off + 48, 0,  true);
            off += 50;
        }
    }
    return Buffer.from(buf);
}
