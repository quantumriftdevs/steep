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
// Document-only Markdown: shared semantic blocks, no HTML interpretation or dependencies.
function inlineRuns(text, bold = false, italic = false) {
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
    .replace(/<[^>]*>/g,'').replace(/\\([\\\x60*_{}\[\]()#+.!>~-])/g,'$1');
  const runs = [], pattern = /(\x60+)([^\x60]*?)\1|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;
  const add = (value,b = bold,i = italic) => { const clean = value.replace(/[\x60*_#~|]/g,''); if(clean) runs.push({text:clean,bold:b,italic:i}); };
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    add(text.slice(last,m.index));
    if (m[2] !== undefined) add(m[2]);
    else runs.push(...inlineRuns(m[3] ?? m[4] ?? m[5] ?? m[6],bold || m[3] !== undefined || m[4] !== undefined,italic || m[5] !== undefined || m[6] !== undefined));
    last = m.index + m[0].length;
  }
  add(text.slice(last)); return runs;
}
function markdownBlocks(source) {
  const lines = source.replace(/\r\n?/g,'\n').split('\n'), blocks = [];
  const cells = line => line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());
  const separator = line => line.includes('|') && cells(line).every(s=>/^:?-{3,}:?$/.test(s));
  let fenced = false;
  for (let n=0; n<lines.length; n++) {
    const raw = lines[n], line = raw.trim();
    if (/^(?:\x60{3,}|~{3,})/.test(line)) { fenced = !fenced; continue; }
    if (!line) { blocks.push({type:'space'}); continue; }
    if (!fenced && line.includes('|') && n+1<lines.length && separator(lines[n+1])) {
      const headers = cells(line); n++;
      // Labelled rows stay readable even for narrow columns or very long cells.
      while(n+1<lines.length && lines[n+1].includes('|') && lines[n+1].trim()) {
        const row = cells(lines[++n]);
        blocks.push({type:'text',text:row.map((cell,i)=>(headers[i] || 'Column '+(i+1))+': '+cell).join(' ; ')});
      }
      continue;
    }
    if (!fenced && /^(?:-{3,}|\*{3,}|_{3,})$/.test(line.replace(/\s/g,''))) { blocks.push({type:'rule'}); continue; }
    const quote = !fenced && line.match(/^(?:>\s*)+(.+)$/);
    const content = quote ? quote[1] : line;
    const heading = !fenced && content.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    const item = !fenced && content.match(/^(?:([-*+])\s+|(\d+)[.)]\s+)(.*)$/);
    blocks.push({type:'text',text:heading ? heading[2] : item ? item[3] : content,
      level:heading ? heading[1].length : 0, quote:!!quote,
      marker:item ? (item[2] ? item[2]+'.' : '\u2022') : '', nested:!!item && /^(?: {2,}|\t)/.test(raw)});
  }
  return blocks;
}
function documentNode(source) {
  const node = document.createElement('article');
  node.style.cssText = 'box-sizing:border-box;width:700px;padding:32px;background:#fcf8f1;color:#38251d;font:16px/1.35 Georgia,serif;overflow-wrap:anywhere';
  for (const block of markdownBlocks(source)) {
    const p = document.createElement(block.type==='rule' ? 'hr' : block.level ? 'h'+Math.min(block.level,6) : block.quote ? 'blockquote' : 'p');
    if (block.type==='space') continue;
    if (block.marker) { p.style.paddingLeft = block.nested ? '10mm' : '5mm'; p.append(block.marker+' '); }
    for (const run of inlineRuns(block.text || '')) {
      let child = document.createTextNode(run.text);
      if (run.italic) { const em=document.createElement('em'); em.append(child); child=em; }
      if (run.bold) { const strong=document.createElement('strong'); strong.append(child); child=strong; }
      p.append(child);
    }
    node.append(p);
  }
  return node;
}
function check(signal) { if (signal?.aborted) throw new DOMException('Stopped','AbortError'); }
function textPdf(source, jsPDF, signal) {
  const pdf = new jsPDF({unit:'mm',format:'letter',orientation:'portrait',compress:true,putOnlyUsedFonts:true});
  const margin = 12, width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
  let y = margin;
  const paintPage = () => {
    pdf.setFillColor(252,248,241); pdf.rect(0,0,width,height,'F');
    pdf.setTextColor(56,37,29); pdf.setDrawColor(56,37,29); pdf.setLineWidth(0.2); y = margin;
  };
  const room = step => { check(signal); if(y+step>height-margin) { pdf.addPage(); paintPage(); } };
  const font = run => pdf.setFont('times',run.bold ? (run.italic ? 'bolditalic' : 'bold') : run.italic ? 'italic' : 'normal');
  paintPage();
  // Built-in Times and real text operators keep output selectable and small.
  for (const block of markdownBlocks(source)) {
    check(signal);
    if (block.type==='space') { y+=3; continue; }
    if (block.type==='rule') { room(7); y+=3; pdf.line(margin,y,width-margin,y); y+=4; continue; }
    const size = block.level ? [18,16,14][Math.min(block.level,3)-1] : 11;
    const step = size*0.352778*1.35, marker = block.marker || '';
    pdf.setFontSize(size); pdf.setFont('times','normal');
    const hanging = marker ? Math.max(5,pdf.getTextWidth(marker)+2) : 0;
    const left = margin+(block.quote ? 5 : 0)+(block.nested ? 5 : 0);
    const start = left+hanging, available = width-margin-start;
    const lines = [[]]; let used = 0;
    const next = () => { lines.push([]); used=0; };
    const append = (text,run) => {
      if (!text) return;
      const row=lines[lines.length-1], prev=row[row.length-1];
      if(prev && prev.bold===run.bold && prev.italic===run.italic) prev.text+=text;
      else row.push({...run,text});
      used+=pdf.getTextWidth(text);
    };
    for (const run of inlineRuns(block.text,!!block.level)) {
      font(run);
      for (const token of run.text.split(/(\s+)/).filter(Boolean)) {
        if (/^\s+$/.test(token)) { if(used && used+pdf.getTextWidth(' ')<=available) append(' ',run); continue; }
        if(used && used+pdf.getTextWidth(token)>available) next();
        // splitTextToSize handles long tokens; exact run metrics govern mixed-style lines.
        const pieces=pdf.splitTextToSize(token,available);
        for(let i=0;i<pieces.length;i++) { if(i) next(); append(pieces[i],run); }
      }
    }
    if(block.level && y>margin) y+=2;
    for(let i=0;i<lines.length;i++) {
      room(step); const baseline=y+size*0.352778; let x=start;
      if(marker && i===0) { pdf.setFont('times','normal'); pdf.text(marker,left+1,baseline); }
      if(block.quote) pdf.line(left-3,y,left-3,y+step);
      for(const run of lines[i]) { font(run); pdf.text(run.text,x,baseline); x+=pdf.getTextWidth(run.text); }
      y+=step;
    }
    y+=block.level ? 2 : 1;
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
      const children = [...node.children].map(p => {
        const runs = [], visit = (n,bold=false,italics=false) => {
          if(n.nodeType===3) runs.push(new docx.TextRun({text:n.textContent,bold,italics}));
          else for(const child of n.childNodes) visit(child,bold || n.nodeName==='STRONG',italics || n.nodeName==='EM');
        };
        visit(p);
        return new docx.Paragraph({children:runs, ...( /^H[1-6]$/.test(p.tagName) ? {heading:docx.HeadingLevel['HEADING_'+p.tagName[1]]} : {}), spacing:{after:180} });
      });
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
