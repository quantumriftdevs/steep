import { previewOriginal } from './attach-view.js';
const types = {pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',md:'text/markdown',txt:'text/plain',html:'text/html',csv:'text/csv'};
export function validDocument(d) {
  if(!d || d.generated!==true || !types[d.format] || typeof d.original!=='string' || d.original.length>1000000) return false;
  const comma=d.original.indexOf(',');
  return comma>0 && d.original.slice(0,comma).toLowerCase().startsWith('data:'+types[d.format]) && /^data:[^,]*;base64,[a-z0-9+/]*={0,2}$/i.test(d.original);
}
export function documentCard(d) {
  const root=document.createDocumentFragment(); if(!validDocument(d)) return root;
  if(!document.querySelector('link[data-steep-documents]')) { const css=document.createElement('link'); css.rel='stylesheet'; css.href='/css/documents.css'; css.dataset.steepDocuments='true'; document.head.append(css); }
  const card=document.createElement('div');card.className='document-card';
  const badge=document.createElement('span');badge.className='document-format';badge.textContent=d.format.toUpperCase();badge.setAttribute('aria-hidden','true');
  const info=document.createElement('div'), name=document.createElement('strong'), size=document.createElement('span');
  name.textContent=String(d.name||'Steep document').slice(0,100); size.textContent=Math.max(1,Math.round((Number(d.size)||d.original.length*.75)/1024))+' KB';info.append(name,size);
  const preview=document.createElement('button');preview.type='button';preview.textContent='Preview';preview.onclick=()=>previewOriginal(d);
  const download=document.createElement('a');download.textContent='Download';download.download=name.textContent;download.href=d.original;
  // Native anchor activation is intentional, including iOS; never re-fetch a provider.
  card.append(badge,info,preview,download);root.append(card);return root;
}
