/**
 * ZIP 工具 — inflate / readZip / buildZip / crc32 / decodeText
 */

export async function inflate(compressed) {
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter(), r = ds.readable.getReader();
  w.write(compressed); w.close();
  const chunks = [];
  for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

export async function readZip(buffer) {
  const data = new Uint8Array(buffer), view = new DataView(buffer);
  let eocd = -1;
  for (let i = data.length - 22; i >= 0; i--)
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a ZIP file");
  const cdOff = view.getUint32(eocd + 16, true), cdN = view.getUint16(eocd + 8, true);
  const files = {}; let pos = cdOff;
  for (let i = 0; i < cdN; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;
    const comp = view.getUint16(pos + 10, true), csz = view.getUint32(pos + 20, true);
    const fnL = view.getUint16(pos + 28, true), exL = view.getUint16(pos + 30, true);
    const cmL = view.getUint16(pos + 32, true), lhOff = view.getUint32(pos + 42, true);
    const name = new TextDecoder("utf-8").decode(data.slice(pos + 46, pos + 46 + fnL));
    const lhEx = view.getUint16(lhOff + 28, true), ds2 = lhOff + 30 + fnL + lhEx;
    const raw = data.slice(ds2, ds2 + csz);
    files[name] = comp === 8 ? await inflate(raw) : raw;
    pos += 46 + fnL + exL + cmL;
  }
  return files;
}

export function crc32(data) {
  if (!crc32.t) {
    crc32.t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); crc32.t[i] = c; }
  }
  let c = 0xFFFFFFFF; for (let i = 0; i < data.length; i++) c = crc32.t[(c ^ data[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
}

export function buildZip(files) {
  const enc = new TextEncoder(), locals = [], centrals = []; let off = 0;
  const now = new Date();
  const dd = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const dt = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  for (const [name, data] of Object.entries(files)) {
    const nb = enc.encode(name), crc = crc32(data);
    const lh = new Uint8Array(30 + nb.length); const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(10, dt, true); lv.setUint16(12, dd, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, nb.length, true); lh.set(nb, 30); locals.push({ lh, data });
    const ch = new Uint8Array(46 + nb.length); const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(12, dt, true); cv.setUint16(14, dd, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, nb.length, true); cv.setUint32(42, off, true);
    ch.set(nb, 46); centrals.push(ch); off += 30 + nb.length + data.length;
  }
  const cdSz = centrals.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(off + cdSz + 22); let p = 0;
  for (const { lh, data } of locals) { out.set(lh, p); p += lh.length; out.set(data, p); p += data.length; }
  for (const ch of centrals) { out.set(ch, p); p += ch.length; }
  const ev = new DataView(out.buffer, p);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true); ev.setUint32(12, cdSz, true); ev.setUint32(16, off, true);
  return out.buffer;
}

export function decodeText(b) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); }
  catch { return new TextDecoder("gbk").decode(b); }
}
