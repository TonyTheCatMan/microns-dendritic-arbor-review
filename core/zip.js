/** Minimal standard ZIP32, stored entries, UTF-8 names, CRC32 validation.
 * No compression changes the bytes of scientific evidence. ZIP64 is rejected.
 */
import { invariant } from './model.js';
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const table = Uint32Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
export function safePath(path) { invariant(typeof path === 'string' && path.length > 0 && path.length < 65536 && !path.startsWith('/') && !path.includes('\\') && !path.includes(':') && !path.split('/').some(p => !p || p === '.' || p === '..') && !/[\x00-\x1f]/.test(path), 'ZIP_PATH', 'Unsafe ZIP entry name'); return path; }
export async function bytesOf(value) { if (typeof value === 'string') return encoder.encode(value); if (value instanceof Uint8Array) return value; if (value instanceof ArrayBuffer) return new Uint8Array(value); if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer()); throw new TypeError('Expected string, Uint8Array, ArrayBuffer or Blob'); }
export async function createZip(entries) {
  invariant(entries.length < 65535, 'ZIP_SIZE', 'Too many ZIP entries');
  const chunks = [], central = [], seen = new Set(); let offset = 0;
  for (const entry of entries) {
    safePath(entry.path); invariant(!seen.has(entry.path), 'ZIP_DUPLICATE', 'Duplicate ZIP filename'); seen.add(entry.path);
    const name = encoder.encode(entry.path), data = await bytesOf(entry.data), crc = crc32(data);
    invariant(data.length < 0xffffffff && offset < 0xffffffff, 'ZIP_SIZE', 'ZIP32 entry exceeds 4 GiB');
    const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint16(12, 33, true);
    l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, name.length, true); local.set(name, 30);
    const head = new Uint8Array(46 + name.length), c = new DataView(head.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); head.set(name, 46);
    chunks.push(local, data); central.push(head); offset += local.length + data.length;
  }
  const centralSize = central.reduce((sum, c) => sum + c.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
  invariant(offset + centralSize < 0xffffffff, 'ZIP_SIZE', 'ZIP32 archive exceeds 4 GiB');
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}
export async function readZip(input, { maxBytes = 1024 * 1024 * 1024, maxFiles = 10000 } = {}) {
  const bytes = await bytesOf(input); invariant(bytes.length <= maxBytes, 'ZIP_SIZE', 'Import exceeds 1 GiB; split the evidence package');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  invariant(end >= 0, 'ZIP_INVALID', 'ZIP central directory is missing');
  invariant(view.getUint16(end + 4, true) === 0 && view.getUint16(end + 6, true) === 0, 'ZIP_MULTIDISK', 'Multi-disk ZIP is unsupported');
  const count = view.getUint16(end + 10, true), centralSize = view.getUint32(end + 12, true), centralOffset = view.getUint32(end + 16, true);
  invariant(count < 65535 && count <= maxFiles && centralOffset + centralSize === end && view.getUint16(end + 8, true) === count, 'ZIP_DIRECTORY', 'ZIP32 directory is invalid or too large');
  const files = new Map(); let pos = centralOffset, total = 0;
  for (let i = 0; i < count; i++) {
    invariant(pos + 46 <= end && view.getUint32(pos, true) === 0x02014b50, 'ZIP_ENTRY', 'Invalid ZIP directory entry');
    const flags = view.getUint16(pos + 8, true), method = view.getUint16(pos + 10, true), crc = view.getUint32(pos + 16, true), compressed = view.getUint32(pos + 20, true), length = view.getUint32(pos + 24, true), nameLen = view.getUint16(pos + 28, true), extraLen = view.getUint16(pos + 30, true), commentLen = view.getUint16(pos + 32, true), offset = view.getUint32(pos + 42, true);
    invariant(pos + 46 + nameLen + extraLen + commentLen <= end, 'ZIP_ENTRY', 'Truncated ZIP name');
    const path = safePath(decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen)));
    invariant(!files.has(path), 'ZIP_DUPLICATE', 'Duplicate ZIP filename');
    invariant(!(flags & 1) && [0, 8].includes(method) && compressed < 0xffffffff && length < 0xffffffff, 'ZIP_ENCODING', 'Encrypted, ZIP64 or unsupported compressed ZIP');
    invariant(offset + 30 < centralOffset && view.getUint32(offset, true) === 0x04034b50, 'ZIP_LOCAL', 'Missing local ZIP header');
    const localNameLen = view.getUint16(offset + 26, true), start = offset + 30 + localNameLen + view.getUint16(offset + 28, true);
    invariant(start + compressed <= centralOffset && decoder.decode(bytes.subarray(offset + 30, offset + 30 + localNameLen)) === path, 'ZIP_LOCAL', 'ZIP local entry differs from directory');
    total += length; invariant(total <= maxBytes, 'ZIP_SIZE', 'Unpacked import exceeds size limit');
    let data = bytes.slice(start, start + compressed);
    if (method === 8) {
      invariant(typeof DecompressionStream !== 'undefined', 'ZIP_DEFLATE', 'This browser cannot import deflated ZIP; use the original application ZIP');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const reader = stream.getReader(), pieces = []; let outputSize = 0;
      while (true) { const item = await reader.read(); if (item.done) break; outputSize += item.value.length; if (outputSize > length || outputSize > maxBytes) { await reader.cancel(); invariant(false, 'ZIP_SIZE', 'Deflated data exceeds declared length'); } pieces.push(item.value); }
      data = new Uint8Array(outputSize); let cursor = 0; for (const piece of pieces) { data.set(piece, cursor); cursor += piece.length; }
    }
    invariant(data.length === length && crc32(data) === crc, 'ZIP_CRC', `ZIP integrity check failed: ${path}`);
    files.set(path, data); pos += 46 + nameLen + extraLen + commentLen;
  }
  invariant(pos === end, 'ZIP_DIRECTORY', 'Unexpected directory bytes');
  return files;
}
