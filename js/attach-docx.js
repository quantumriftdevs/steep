// DOCX is a ZIP of XML, not a zlib stream. No package dependency.
const MAX_XML = 8 * 1024 * 1024;
export async function docxText(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('DOCX exceeds 20 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer()), v = new DataView(bytes.buffer);
  const u16 = p => v.getUint16(p, true), u32 = p => v.getUint32(p, true);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === bytes.length) { end = p; break; }
  }
  if (end < 0 || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) throw new Error('Unsupported ZIP.');
  const count = u16(end + 10), size = u32(end + 12), start = u32(end + 16);
  if (count === 65535 || start === 0xffffffff || size === 0xffffffff || start + size > end) throw new Error('Unsupported ZIP64.');
  let p = start;
  for (let n = 0; n < count; n++) {
    if (p + 46 > start + size || u32(p) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
    const flags = u16(p + 8), method = u16(p + 10), packed = u32(p + 20), length = u32(p + 24);
    const names = u16(p + 28), extra = u16(p + 30), comment = u16(p + 32), offset = u32(p + 42);
    const next = p + 46 + names + extra + comment;
    if (next > start + size) throw new Error('Invalid ZIP name.');
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + names));
    p = next;
    if (name !== 'word/document.xml') continue;
    if ((flags & 1) || u16(p - (46 + names + extra + comment) + 34) || ![0, 8].includes(method) || length > MAX_XML || packed > bytes.length || offset + 30 > start) throw new Error('Unsupported DOCX entry.');
    if (u32(offset) !== 0x04034b50 || u16(offset + 8) !== method || (u16(offset + 6) & 1)) throw new Error('Invalid ZIP header.');
    const data = offset + 30 + u16(offset + 26) + u16(offset + 28);
    if (data + packed > start) throw new Error('Invalid ZIP data.');
    let stream = new Blob([bytes.subarray(data, data + packed)]).stream();
    if (method === 8) stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader(), chunks = []; let total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        total += value.length;
        if (total > MAX_XML || total > length) throw new Error('DOCX XML too large.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (total !== length) throw new Error('Incomplete DOCX XML.');
    const xml = await new Blob(chunks).text();
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsupported XML declarations.');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid DOCX XML.');
    const out = [], walk = node => {
      if (node.nodeType !== 1) return;
      if (node.localName === 't') { out.push(node.textContent); return; }
      if (node.localName === 'tab') out.push('\t');
      if (['br', 'cr'].includes(node.localName)) out.push('\n');
      for (const child of node.children) walk(child);
      if (node.localName === 'p') out.push('\n');
    };
    walk(doc.documentElement); return out.join('').trim();
  }
  throw new Error('DOCX document.xml missing.');
}
