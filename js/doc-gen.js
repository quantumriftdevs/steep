import { renderMarkdown } from './markdown.js';
const loads = new Map(), CAP = 1000000;
function library(path, global) {
  if (window[global]) return Promise.resolve(window[global]);
  if (!loads.has(global)) loads.set(global, new Promise((resolve,reject) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/' + path;
    const timer = setTimeout(() => { s.remove(); loads.delete(global); reject(Error('Document library timed out.')); }, 20000);
    s.onload = () => { clearTimeout(timer); if (window[global]) resolve(window[global]); else { loads.delete(global); reject(Error('Document library unavailable.')); } };
    s.onerror = () => { clearTimeout(timer); loads.delete(global); s.remove(); reject(Error('Document library unavailable.')); }; document.head.append(s);
  }));
  return loads.get(global);
}
function documentNode(source) {
  const node = document.createElement('article');
  node.style.cssText = 'box-sizing:border-box;width:700px;padding:32px;background:#fffaf0;color:#29251f;font:16px/1.6 Georgia,serif;overflow-wrap:anywhere';
  node.append(renderMarkdown(source));
  for (const p of node.querySelectorAll('p')) { const m = p.textContent.match(/^(#{1,6})\s+([^\n]+)$/); if(m) { const h=document.createElement('h'+m[1].length); h.textContent=m[2]; p.replaceWith(h); } }
  for(const pre of node.querySelectorAll('pre')) pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
  return node;
}
function check(signal) { if (signal?.aborted) throw new DOMException('Stopped','AbortError'); }
export async function documentReply(data, chat, signal, notice = () => {}) {
  const result = { content: data.reply, ...(data.research ? { research: data.research } : {}) };
  const d = data.document;
  const failed = () => notice("Steep couldn't format that reply as a document - try asking again");
  if (!d || !['pdf','docx','md','txt','html','csv'].includes(d.format) || !/^STEEP_DOCUMENT_[a-f0-9]{32}$/.test(d.marker)) {
    if (data.documentIntent || d) failed();
    return result;
  }
  const begin = '<<<'+d.marker+':BEGIN>>>', end = '<<<'+d.marker+':END>>>';
  const a = data.reply.indexOf(begin), b = data.reply.indexOf(end, a + begin.length);
  if(a<0 || b<0) { failed(); return result; }
    const source = data.reply.slice(a+begin.length,b).trim().replace(/^filename:[^\n]*(?:\n|$)/i,'').trim();
  if (!source) { failed(); return result; }
  const lead = (data.reply.slice(0,a)+data.reply.slice(b+end.length)).trim() || 'Here is your document.';
  result.content = lead+'\n\n'+source;
  const name = String(d.filename || 'steep-document').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]/gi,'-').slice(0,80) || 'steep-document';
  try {
    check(signal); let blob; const node = documentNode(source);
    if(d.format==='pdf') {
      const pdf = await library('html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js','html2pdf'); check(signal);
      blob = await pdf().set({ margin:12, filename:name+'.pdf', image:{type:'jpeg',quality:0.92}, html2canvas:{scale:1.4}, jsPDF:{unit:'mm',format:'letter',orientation:'portrait'}, pagebreak:{mode:['css','legacy']} }).from(node).outputPdf('blob');
    } else if(d.format==='docx') {
      const docx = await library('docx@8.5.0/build/index.umd.js','docx'); await library('file-saver@2.0.5/dist/FileSaver.min.js','saveAs'); check(signal);
      const children = [...node.children].map(p => new docx.Paragraph({ text:p.textContent, ...( /^H[1-6]$/.test(p.tagName) ? {heading:docx.HeadingLevel['HEADING_'+p.tagName[1]]} : {}), spacing:{after:180} }));
      blob = await docx.Packer.toBlob(new docx.Document({sections:[{children}]}));
    } else {
      const types = {md:'text/markdown',txt:'text/plain',html:'text/html',csv:'text/csv'};
      blob = new Blob([d.format==='html' ? '<!doctype html><html><head><meta charset="utf-8"><title>Steep document</title></head><body>'+node.outerHTML+'</body></html>' : source],{type:types[d.format]+';charset=utf-8'});
    }
    check(signal);
    if(Math.ceil(blob.size/3)*4+200 > CAP) throw Error('This document is too large to save (1 MB encoded limit).');
    const original = await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);}); check(signal);
    const file = {generated:true,kind:'file',format:d.format,name:name+'.'+d.format,size:blob.size,original};
    if(new TextEncoder().encode(JSON.stringify([...chat.messages,{...result,content:lead,document:file}])).length>1350000) throw Error('This chat has reached its document storage budget.');
    result.content=lead; result.document=file;
  } catch(e) { check(signal); notice((e.message || 'Could not create the file.')+' The document text is kept below.'); }
  return result;
}
