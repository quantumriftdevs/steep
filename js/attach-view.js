export const icons = { files: '<path d="m9 17 8-8a3 3 0 0 0-4-4L5 13a5 5 0 0 0 7 7l8-8M8 15l7-7"/>' };
export const svg = path => '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
// Originals are view-only. Model serializers explicitly select text/JPEG fields.
const temporary = new Map();
export async function keepOriginal(file, remaining = 192 * 1024) {
  const id = crypto.randomUUID();
  if (temporary.size >= 12) temporary.delete(temporary.keys().next().value);
  temporary.set(id, file);
  const meta = { originalKey: id };
  if (file.size <= 96 * 1024 && Math.ceil(file.size / 3) * 4 + 200 <= remaining) {
    try { meta.original = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
    catch { meta.originalNote = 'Original could not be saved. Open or download it before leaving this page.'; }
  } else meta.originalNote = 'Original is above the preview storage limit. Open or download it now; it will not sync or survive a reload.';
  return meta;
}
function originalBlob(a) {
  const file = a.file || temporary.get(a.originalKey); if (file) return file;
  if (typeof a.original !== 'string' || !/^data:[^,]*;base64,/.test(a.original) || a.original.length > 132000) return null;
  try { const comma = a.original.indexOf(','), raw = atob(a.original.slice(comma+1)); return new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))], { type: a.original.slice(5,comma).replace(/;base64$/,'') }); } catch { return null; }
}
function sheet(title) {
  const d = document.createElement('dialog'); d.className = 'original-view'; d.setAttribute('aria-label', title);
  const close = document.createElement('button'); close.type = 'button'; close.className = 'original-close'; close.textContent = 'Close'; close.onclick = () => d.close();
  d.append(close); d.onclose = () => d.remove(); document.body.append(d); d.showModal(); return d;
}
export function showImage(src, name = 'Image') {
  if (!/^(?:blob:|data:image\/(?:jpeg|png|webp|gif|avif|heic);base64,|https?:\/\/)/i.test(src || '')) return;
  const d = sheet(name); d.classList.add('original-image'); const stage = document.createElement('div'); stage.className = 'original-stage';
  const image = document.createElement('img'); image.src = src; image.alt = name; image.draggable = false; stage.append(image); d.append(stage);
  let scale=1,x=0,y=0,previous; const points=new Map();
  const draw=()=>{image.style.transform=`translate(${x}px,${y}px) scale(${scale})`;};
  const geometry=()=>{const p=[...points.values()];return {x:p.reduce((s,v)=>s+v.x,0)/p.length,y:p.reduce((s,v)=>s+v.y,0)/p.length,d:p.length>1?Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y):0};};
  stage.onpointerdown=e=>{points.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture(e.pointerId);previous=geometry();};
  stage.onpointermove=e=>{if(!points.has(e.pointerId))return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=geometry();if(previous.d&&g.d)scale=Math.max(1,Math.min(6,scale*g.d/previous.d));if(scale>1){x+=g.x-previous.x;y+=g.y-previous.y;}else{x=y=0;}previous=g;draw();};
  const release=e=>{points.delete(e.pointerId);previous=points.size?geometry():null;};stage.onpointerup=stage.onpointercancel=release;
  stage.ondblclick=()=>{scale=scale>1?1:2;x=y=0;draw();};
  stage.onwheel=e=>{e.preventDefault();scale=Math.max(1,Math.min(6,scale*Math.exp(-e.deltaY/400)));if(scale===1)x=y=0;draw();};
}
export function previewOriginal(a) {
  const blob = originalBlob(a), name = a.name || 'Original file';
  if (a.kind === 'image' && (blob || a.thumb)) {
    const url=blob?URL.createObjectURL(blob):a.thumb;showImage(url,name);
    const d=document.querySelector('dialog.original-view:last-of-type'); if(blob&&d)d.addEventListener('close',()=>setTimeout(()=>URL.revokeObjectURL(url),300000),{once:true});return;
  }
  const d=sheet(name), p=document.createElement('p');p.textContent=blob ? (/\.docx$/i.test(name) ? 'Download the original DOCX and open it in Word or another document viewer. This is the original file, not extracted text.' : 'Open or download the original file.') : 'The original was not retained in this chat. Please attach the source file again to preview it.';d.append(p);
  if(!blob)return;
  const pdf=/\.pdf$/i.test(name)||blob.type==='application/pdf';
  const url=URL.createObjectURL(pdf?new Blob([blob],{type:'application/pdf'}):blob);
  const download=document.createElement('a');download.href=url;download.download=name;download.textContent='Download original';d.append(download);
  if(pdf){const open=document.createElement('a');open.href=url;open.target='_blank';open.rel='noopener';open.textContent='Open original PDF';d.append(open);window.open(url,'_blank','noopener');}
  d.addEventListener('close',()=>setTimeout(()=>URL.revokeObjectURL(url),300000),{once:true});
}
export function attachmentView(a, preview = false) {
  const fragment = document.createDocumentFragment();
  if (Array.isArray(a)) { for (const item of a) if (item) fragment.append(attachmentView(item, preview)); return fragment; }
  if (!a) return fragment;
  let target;
  if (a.kind === 'image' && /^(data:image\/(?:jpeg|png|webp|gif|avif);base64,|blob:)/.test(a.thumb || '')) {
    target=document.createElement('img');target.src=a.thumb;target.alt=a.name;if(!preview)target.className='attach-preview';
  } else { target=document.createElement('span');target.className='attach-file';target.innerHTML=svg(icons.files);target.append(document.createTextNode(a.name)); }
  target.tabIndex=0;target.setAttribute('role','button');target.setAttribute('aria-label','Preview original '+a.name);target.onclick=()=>previewOriginal(a);target.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();previewOriginal(a);}};fragment.append(target);
  for (const text of [a.note,a.requestNote,a.originalNote]) if(text){const note=document.createElement('span');note.textContent=' '+text+' ';fragment.append(note);}
  return fragment;
}
// Received/generated images use their displayed source; never regenerate to preview.
document.addEventListener('click',e=>{const img=e.target.closest?.('.sg-card img,#shared-messages img');if(img)showImage(img.currentSrc||img.src,img.alt||'Image');});
