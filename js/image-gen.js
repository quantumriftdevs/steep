import { renderMarkdown } from './markdown.js';

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
export function imageCard(prompt) {
  let seed = imageSeed(prompt);
  const card = document.createElement('div'); card.className = 'sg-card';
  const dots = document.createElement('div'); dots.className = 'sg-dots'; dots.setAttribute('aria-hidden', 'true');
  const status = document.createElement('span'); status.className = 'sg-status'; status.setAttribute('role', 'status');
  const img = document.createElement('img'); img.alt = prompt; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  card.append(dots, status, img);
  function load() {
    card.className = 'sg-card'; card.removeAttribute('role'); card.removeAttribute('tabindex'); card.removeAttribute('aria-label');
    status.textContent = 'Drawing...'; if (!status.isConnected) card.append(status);
    card.dataset.seed = seed;
    card.dataset.url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=1024&height=1024&nologo=true&seed=' + seed;
    img.src = card.dataset.url;
  }
  img.onload = () => { card.className = 'sg-card sg-ready'; status.remove(); };
  img.onerror = () => {
    card.className = 'sg-card sg-error'; status.textContent = "Couldn't generate that - tap to retry";
    card.setAttribute('role', 'button'); card.tabIndex = 0; card.setAttribute('aria-label', 'Retry image generation');
  };
  function retry() { if (card.classList.contains('sg-error')) { seed = (seed + 1) % 2147483647; load(); } }
  card.onclick = retry;
  card.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && card.classList.contains('sg-error')) { e.preventDefault(); retry(); } };
  load(); return card;
}
export function renderImageReply(text) {
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
