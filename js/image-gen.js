import { renderMarkdown } from './markdown.js'; import { cooldown } from './cooldown.js'; import { getSession } from './auth.js'; import { requireAuth } from './guest.js'; let lastImage = 0, imageQueue = Promise.resolve(); const imageCache = new Map();

export function imageParts(text) {
  const parts = []; let lines = [], fenced = false;
  function flush() { if (lines.length) { parts.push({ text: lines.join('\n') }); lines = []; } }
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const match = !fenced && line.match(/^\s*\[img:\s*(.+?)\]\s*$/);
    if (match && match[1].trim()) { flush(); parts.push({ prompt: match[1].trim() }); }
    else lines.push(line);
  }
  flush(); return parts;
}
export function imageSeed(prompt) {
  let hash = 5381;
  for (let i = 0; i < prompt.length; i++) hash = ((hash * 33) ^ prompt.charCodeAt(i)) >>> 0;
  return hash % 2147483647;
}
const freshImages = new WeakSet(); export function markFreshImages(message) { freshImages.add(message); } const safeImage = src => typeof src === 'string' && /^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/]+=*$/i.test(src) && src.length <= 1000000; export function imageCard(prompt, options = {}) {   let seed = imageSeed(prompt), running = false;   const owner = getSession()?.user?.id;   const card = document.createElement('div'); card.className = 'sg-card';   const status = document.createElement('span'); status.className = 'sg-status';   const img = document.createElement('img'); img.alt = prompt; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; card.append(status,img);   const active = () => card.isConnected && getSession()?.user?.id === owner;   function display(src) { img.src = src; card.className = 'sg-card sg-ready'; status.hidden = true; card.removeAttribute('role'); card.removeAttribute('tabindex'); card.dataset.seed = seed; }   function idle(text = 'Image interrupted - tap to retry') { running = false; card.className = 'sg-card sg-error'; status.hidden = false; status.textContent = text; status.setAttribute('role','status'); card.setAttribute('role','button'); card.tabIndex = 0; card.setAttribute('aria-label','Retry image generation'); }   async function load() {     if(running) return; running = true; card.className = 'sg-card'; card.removeAttribute('role'); card.removeAttribute('tabindex'); status.hidden = false; status.textContent = 'Drawing...';     const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=1024&height=1024&nologo=true&seed=' + seed;     imageQueue = imageQueue.catch(()=>{}).then(async () => {       if(!active()) return;       try {       for (let retry = 0; ; retry++) {         if(lastImage+45000>Date.now() && !await cooldown(status,'Image generation cooldown',lastImage+45000,active)) return;         if(!active()) return; status.textContent='Drawing...';         const response = await fetch(url,{headers:{Accept:'image/*'},referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(45000)});         const limited = response.status === 429 || response.status === 402 && response.headers.has('Retry-After');         if(!response.ok && !limited) throw Error('Image unavailable');         const blob = limited ? null : await response.blob(); if(blob && !/^image\/(jpeg|png|webp|gif)$/.test(blob.type)) throw Error('Image unavailable');         if(!active()) return;         if(limited || await isLimitCard(blob)) {           const seconds = Number(response.headers.get('Retry-After'));           lastImage = Math.max(lastImage, Date.now() + (Number.isFinite(seconds) && seconds > 45 ? seconds * 1000 - 45000 : 0));           if(retry >= 2) throw Error('Image queued');           continue;         }         if(Math.ceil(blob.size/3)*4+100>1000000) throw Error('Image exceeds the saved-image limit. Tap to retry.');         const src = await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});         if(!active()) return;         if(options.onImage && options.onImage(src) === false) throw Error('Chat storage is full. Image not saved; tap to retry.');         display(src); lastImage=Date.now(); running=false;         imageCache.set(url,src); if(imageCache.size>12) imageCache.delete(imageCache.keys().next().value);         break;       }       } catch(error) { if(active()) idle(error.message==='Image queued' ? 'Image queued upstream - tap to retry' : error.message+' - tap to retry'); }     });   }   function retry() { if(!card.classList.contains('sg-error') || running) return;     if(!requireAuth(()=>window.dispatchEvent(new CustomEvent('steep:guest-image',{detail:prompt})))) return;     seed=(seed+1)%2147483647; load();   }   card.onclick=retry; card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();retry();}};   /* History is passive; only a new response gets one fresh token. */   if(safeImage(options.src)) display(options.src);   else { idle(); if(options.generate && owner) load(); }   return card; } export function renderImageReply(text, options = {}) {
  const root = document.createDocumentFragment();
  const generate = options.message && freshImages.has(options.message); if(options.message) freshImages.delete(options.message); let index=0; for (const part of imageParts(text)) { if(part.prompt) { const i=index++; root.append(imageCard(part.prompt,{src:options.message?.images?.[i],generate,onImage:src=>options.onImage?.(i,src)})); } else root.append(renderMarkdown(part.text)); }
  return root;
}
export async function downloadImage(card, tell) { const src=card?.querySelector('img')?.getAttribute('src'); if(!safeImage(src)) { tell('No completed image to download yet.'); return; } const a=document.createElement('a'); a.href=src; a.download='steep-image-'+(card.dataset.seed||'saved')+'.'+(src.startsWith('data:image/png')?'png':src.startsWith('data:image/webp')?'webp':src.startsWith('data:image/gif')?'gif':'jpg'); document.body.append(a); a.click(); a.remove(); tell('Download started'); }
// Sharing reads only already-generated local blobs; never generates another image.
export async function cachedImageSnapshots(text) {
  const images = [];
  for (const part of imageParts(String(text || ''))) {
    if (!part.prompt) continue;
    const prefix = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(part.prompt) + '?';
    const entries = [...imageCache].filter(([url]) => url.startsWith(prefix));
    const object = entries.at(-1)?.[1];
    if (!object) continue;
    try {
      const blob = await (await fetch(object)).blob();
      if (blob.size > 1100000) throw Error('This chat is too large to share');
      images.push(await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Error('Could not prepare this image for sharing.'));
        reader.readAsDataURL(blob);
      }));
    } catch (error) { throw Error(error.message || 'Could not prepare this image for sharing.'); }
  }
  return images;
}
// Notice cards are resized JPEGs (including 768px): dimensions/bytes are not identity.
// Confirm against the pinned upstream artwork, not against ordinary image size.
let limitTemplate;
async function isLimitCard(blob) {
  const image = await createImageBitmap(blob);
  try {
    if (image.width !== image.height) return false;
    const sample = bitmap => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, 48, 48); return ctx.getImageData(0, 0, 48, 48).data;
    };
    if (!limitTemplate) limitTemplate = fetch('https://raw.githubusercontent.com/pollinations/pollinations/02b0575f1ae6daad402bb2782119d7752403ad01/image.pollinations.ai/cloudflare-cache/assets/cards/limit-square.png', { signal: AbortSignal.timeout(8000) })
      .then(r => { if (!r.ok) throw Error('Notice reference unavailable'); return r.blob(); })
      .then(createImageBitmap).then(bitmap => { const data = sample(bitmap); bitmap.close(); return data; })
      .catch(error => { limitTemplate = null; throw error; });
    const reference = await limitTemplate, actual = sample(image);
    let difference = 0, close = 0;
    for (let i = 0; i < actual.length; i += 4) {
      const delta = (Math.abs(actual[i] - reference[i]) + Math.abs(actual[i+1] - reference[i+1]) + Math.abs(actual[i+2] - reference[i+2])) / 3;
      difference += delta; if (delta < 18) close++;
    }
    return difference / 2304 < 12 && close / 2304 > .9;
  } finally { image.close(); }
}
