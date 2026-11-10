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
export function imageCard(prompt) { let seed = imageSeed(prompt); const card = document.createElement('div'); card.className = 'sg-card'; const dots = document.createElement('div'); dots.className = 'sg-dots'; dots.setAttribute('aria-hidden', 'true'); const status = document.createElement('span'); status.className = 'sg-status'; status.setAttribute('role', 'status'); const img = document.createElement('img'); img.alt = prompt; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; card.append(dots, status, img); const active = () => card.isConnected; function display(src) { return new Promise((resolve, reject) => { img.onload = () => { if (active()) { card.className = 'sg-card sg-ready'; status.remove(); } resolve(); }; img.onerror = reject; img.src = src; }); } function load() { card.className = 'sg-card'; card.removeAttribute('role'); card.removeAttribute('tabindex'); card.removeAttribute('aria-label'); status.hidden = false; status.textContent = 'Drawing...'; if (!status.isConnected) card.append(status); card.dataset.seed = seed; card.dataset.url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=1024&height=1024&nologo=true&seed=' + seed; const url = card.dataset.url; imageQueue = imageQueue.catch(() => {}).then(async () => { if (!active()) return; if (imageCache.has(url)) { await display(imageCache.get(url)); return; } for (let retry = 0; retry <= 2 && active(); retry++) { if (lastImage + 45000 > Date.now() && !await cooldown(status, 'Image generation cooldown', lastImage + 45000, active)) return; status.hidden = false; status.textContent = 'Drawing...'; let object; try { const response = await fetch(url, { referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(45000) }); if (!response.ok) throw Error('Image unavailable'); const blob = await response.blob(); if (!blob.type.startsWith('image/')) throw Error('Image unavailable'); if (!active()) return; object = URL.createObjectURL(blob); await display(object); if (!active()) { URL.revokeObjectURL(object); return; } lastImage = Date.now(); imageCache.set(url, object); if (imageCache.size > 12) { const key = imageCache.keys().next().value; URL.revokeObjectURL(imageCache.get(key)); imageCache.delete(key); } return; } catch { if (object) URL.revokeObjectURL(object); if (!active()) return; if (retry < 2) { const deadline = Math.max(lastImage + 45000, Date.now() + (retry ? 45000 : 0)); if (!await cooldown(status, 'Image generation cooldown', deadline > Date.now() ? deadline : Date.now() + 45000, active)) return; } } } if (active()) { card.className = 'sg-card sg-error'; status.hidden = false; status.textContent = "Couldn't generate that - tap to retry"; card.setAttribute('role', 'button'); card.tabIndex = 0; card.setAttribute('aria-label', 'Retry image generation'); } }); } function retry() { if (card.classList.contains('sg-error')) { seed = (seed + 1) % 2147483647; load(); } } card.onclick = retry; card.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && card.classList.contains('sg-error')) { e.preventDefault(); retry(); } }; if (getSession()) load(); else { status.textContent = 'Generate image'; card.setAttribute('role', 'button'); card.tabIndex = 0; card.onclick = () => { if (requireAuth(() => { window.dispatchEvent(new CustomEvent('steep:guest-image', { detail: prompt })); })) load(); }; card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } }; } return card; } export function renderImageReply(text) {
  const root = document.createDocumentFragment();
  for (const part of imageParts(text)) root.append(part.prompt ? imageCard(part.prompt) : renderMarkdown(part.text));
  return root;
}
export async function downloadImage(card, tell) {
  const url = card?.dataset.url, seed = card?.dataset.seed; if (!url) return;
  try {
    const response = await fetch(url, { referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Image unavailable');
    const blob = await response.blob(); if (!blob.type.startsWith('image/')) throw new Error('Not an image');
    const object = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = object; a.download = 'steep-image-' + seed + '.jpg'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(object), 60000); tell('Download started');
  } catch {
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove(); tell('Save the opened image (long-press on iPhone).');
  }
}
