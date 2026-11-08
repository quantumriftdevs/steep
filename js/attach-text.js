import { docxText } from './attach-docx.js';
const LIMIT = 60000;
const CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/legacy/build/';
let pdfLoader;
function loadPDF() {
  if (!pdfLoader) pdfLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.type = 'module';
    const event = 'steep-pdf-loaded';
    const finish = (pdf, error) => {
      clearTimeout(timer); window.removeEventListener(event, ready); script.remove();
      if (error) reject(new Error('PDF reader unavailable.')); else resolve(pdf);
    };
    const ready = e => finish(e.detail.pdf, e.detail.error);
    const timer = setTimeout(() => finish(null, true), 45000);
    window.addEventListener(event, ready, { once: true });
    script.onerror = () => finish(null, true);
    script.textContent = 'import(' + JSON.stringify(CDN + 'pdf.mjs') + ').then(pdf => window.dispatchEvent(new CustomEvent(' + JSON.stringify(event) + ', {detail:{pdf}})), () => window.dispatchEvent(new CustomEvent(' + JSON.stringify(event) + ', {detail:{error:true}})));';
    document.head.append(script);
  }).catch(error => { pdfLoader = null; throw error; });
  return pdfLoader;
}
async function pdfText(file) {
  const pdf = await loadPDF(); pdf.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.mjs';
  const task = pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  task.onPassword = () => { task.destroy(); };
  try {
    const doc = await task.promise; let text = '';
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n), content = await page.getTextContent();
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        text += item.str + (item.hasEOL ? '\n' : ' ');
        if (text.length > LIMIT) return text.slice(0, LIMIT + 1);
      }
      text += '\n\n'; page.cleanup();
    }
    return text.trim();
  } finally { await task.destroy(); }
}
async function plainText(file) {
  const reader = file.stream().getReader(), decoder = new TextDecoder(); let text = '';
  try {
    while (text.length <= LIMIT) {
      const { value, done } = await reader.read();
      if (done) { text += decoder.decode(); break; }
      text += decoder.decode(value, { stream: true });
      if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw new Error('Binary contents.');
    }
  } finally { await reader.cancel().catch(() => {}); }
  return text.slice(0, LIMIT + 1);
}
export async function readAttachment(file) {
  const pdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  const docx = /\.docx$/i.test(file.name);
  const plain = /^(text\/|application\/(json|javascript|xml|x-sh|x-yaml))/.test(file.type) || /\.(txt|md|markdown|csv|tsv|json|jsonl|js|mjs|cjs|jsx|ts|tsx|py|html?|css|xml|ya?ml|srt|vtt|log|ini|sql|sh|toml|svg|conf|cfg|rst|r|rb|php|java|c|h|cpp|hpp|go|rs)$/i.test(file.name);
  if (!pdf && !docx && !plain) return { note: 'File contents are unavailable.' };
  try {
    const raw = pdf ? await pdfText(file) : docx ? await docxText(file) : await plainText(file);
    if (!raw.trim()) return { note: "Text couldn't be extracted" + (pdf ? ' (scanned PDFs need OCR).' : '.') };
    const truncated = raw.length > LIMIT;
    return { text: raw.slice(0, LIMIT), ...(truncated ? { note: '[truncated]' } : {}) };
  } catch { return { note: "Text couldn't be extracted" + (docx ? ' (unsupported or invalid DOCX).' : '.') }; }
}
