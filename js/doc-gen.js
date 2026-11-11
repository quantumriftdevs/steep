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
function textPdf(source, jsPDF, signal) {
  const pdf = new jsPDF({unit:'mm',format:'letter',orientation:'portrait',compress:true,putOnlyUsedFonts:true});
  const margin = 12, width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
  let y = margin;
  const paintPage = () => {
    pdf.setFillColor(252,248,241); pdf.rect(0,0,width,height,'F');
    pdf.setTextColor(56,37,29); y = margin;
  };
  paintPage();
  // Built-in Times keeps text selectable without embedding bulky font files.
  for (const raw of source.replace(/\r\n?/g,'\n').split('\n')) {
    check(signal);
    const line = raw.trim();
    if (!line) { y += 3; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/), bullet = line.match(/^[-*]\s+(.+)$/);
    const size = heading ? [18,16,14][heading[1].length-1] : 11;
    const indent = bullet ? 5 : 0, step = size * 0.352778 * 1.35;
    const text = heading ? heading[2] : bullet ? bullet[1] : line;
    pdf.setFont('times',heading ? 'bold' : 'normal'); pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text,width-margin*2-indent);
    if (heading && y > margin) y += 2;
    for (let i=0; i<lines.length; i++) {
      check(signal);
      if (y + step > height-margin) { pdf.addPage(); paintPage(); }
      // y is the top of a line box; put the baseline inside that box.
      if (bullet && i===0) pdf.text('\u2022',margin+1,y+size*0.352778);
      pdf.text(lines[i],margin+indent,y+size*0.352778);
      y += step;
    }
    y += heading ? 2 : 1;
  }
  return pdf.output('blob');
}
const stripFileData = text => text.replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{80,}/gi, '[file data removed]').replace(/[A-Za-z0-9+/=]{200,}/g, '[file data removed]');
function fallbackText(reply) {
  return reply.replace(/^[ \t]*<<<STEEP_DOCUMENT_[a-f0-9]{32}:(?:BEGIN|END)>>>[ \t]*$/gmi, '')
    .replace(/^[ \t]*(?:filename:[^\n]*|(?:[-*]\s+)?(?:[\x60*_]+)?(?:\[[^\]\n]*\.(?:pdf|docx|md|txt|html|csv)\]\([^\n]*\)|[^\n\[\]<>]*\.(?:pdf|docx|md|txt|html|csv))(?:[\x60*_]+)?)[ \t]*$/gmi, '')
    .replace(/\[file data removed\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
export async function documentReply(data, chat, signal, notice = () => {}) {
  const reply = stripFileData(typeof data.reply === 'string' ? data.reply : '');
  const result = { content: reply, ...(data.research ? { research: data.research } : {}) };
  if (!data.documentIntent && !data.document) return result;
  const formats = ['pdf','docx','md','txt','html','csv'];
  const format = data.document?.format || data.documentFormat || 'pdf';
  const d = { ...data.document, format };
  const failed = () => notice("Steep couldn't format that reply as a document - try asking again");
  if (!formats.includes(format)) { failed(); return result; }
  let source = '', lead = '', fallback = false;
  if (/^STEEP_DOCUMENT_[a-f0-9]{32}$/.test(d.marker)) {
    const begin = '<<<'+d.marker+':BEGIN>>>', end = '<<<'+d.marker+':END>>>';
    const a = reply.indexOf(begin), b = reply.indexOf(end, a + begin.length);
    if (a >= 0 && b >= 0) {
      source = reply.slice(a+begin.length,b).trim().replace(/^filename:[^\n]*(?:\n|$)/i,'').trim();
      lead = (reply.slice(0,a)+reply.slice(b+end.length)).trim() || 'Here is your document.';
    }
  }
  if (!source.replace(/\[file data removed\]/g, '').trim()) {
    source = fallbackText(reply); result.content = source; fallback = true;
    if (source.replace(/\s/g, '').length <= 200) { failed(); return result; }
    lead = source;
  }
  result.content = fallback ? source : lead+'\n\n'+source;
  const name = String(d.filename || 'steep-document').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]/gi,'-').slice(0,80) || 'steep-document';
  try {
    check(signal); let blob; const node = documentNode(source);
    if(d.format==='pdf') {
      const { jsPDF } = await library('jspdf@2.5.2/dist/jspdf.umd.min.js','jspdf'); check(signal);
      blob = textPdf(source,jsPDF,signal);
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
