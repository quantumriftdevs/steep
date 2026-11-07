import { icons, svg, attachmentView } from './attach-view.js';
const form = document.getElementById('composer'), input = document.getElementById('prompt');
const plus = document.getElementById('attach-plus'), menu = document.getElementById('attach-menu');
const chip = document.getElementById('attach-chip');
let picked = null, url = '', locked = false;
function close(focus = false) { menu.hidden = true; plus.setAttribute('aria-expanded', 'false'); if (focus) plus.focus(); }
function unavailable() { return locked || form.classList.contains('voice-active'); }
plus.onclick = () => { if (unavailable()) return; const open = menu.hidden; menu.hidden = !open; plus.setAttribute('aria-expanded', String(open)); };
document.addEventListener('pointerdown', e => { if (!menu.contains(e.target) && !plus.contains(e.target)) close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); close(true); } });
for (const key of ['photos', 'files', 'camera']) {
  const button = menu.querySelector('[data-pick="' + key + '"]');
  button.querySelector('.attach-tile').innerHTML = svg(icons[key]);
  const picker = document.getElementById('pick-' + key);
  button.onclick = () => { if (unavailable()) return; close(); picker.value = ''; picker.click(); };
  picker.onchange = () => { if (picker.files[0] && !unavailable()) restoreAttachment(picker.files[0]); picker.value = ''; };
}
function update() {
  if (url) URL.revokeObjectURL(url); url = '';
  chip.replaceChildren(); chip.hidden = !picked; form.dataset.attachment = picked ? 'true' : '';
  if (picked) {
    const image = picked.type.startsWith('image/');
    if (image) url = URL.createObjectURL(picked);
    chip.append(attachmentView({ name: picked.name, kind: image ? 'image' : 'file', thumb: url }, true));
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove attachment');
    remove.disabled = unavailable(); remove.onclick = () => clearAttachment(); chip.append(remove);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
export function hasAttachment() { return !!picked; }
export function clearAttachment() { picked = null; close(); update(); }
export function restoreAttachment(file) { picked = file; update(); }
export function lockAttachment(value) { locked = value; sync(); }
function sync() { plus.disabled = unavailable(); const remove = chip.querySelector('button'); if (remove) remove.disabled = unavailable(); if (unavailable()) close(); }
new MutationObserver(sync).observe(form, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('pagehide', clearAttachment);
function thumbnail(file) {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file), img = new Image();
    const done = () => URL.revokeObjectURL(src);
    img.onload = () => {
      try {
        const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fffefa'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .78));
      } catch { reject(new Error('Could not prepare this photo. Try a JPEG or PNG.')); } finally { done(); }
    };
    img.onerror = () => { done(); reject(new Error('Could not open this photo. Try a JPEG or PNG.')); }; img.src = src;
  });
}
export function attachmentNote(a) { return a ? (a.kind === 'image' ? '[The user attached a photo: ' + a.name + ']' : 'File attached: ' + a.name) : ''; }
export async function prepareAttachment(text) {
  const file = picked; if (!file) return { prompt: text };
  const image = file.type.startsWith('image/'), attachment = { name: file.name.slice(0, 255), kind: image ? 'image' : 'file' };
  let note = attachmentNote(attachment);
  if (image) attachment.thumb = await thumbnail(file);
  else if (file.size < 150 * 1024 && (/^(text\/|application\/(json|javascript|xml))/.test(file.type) || /\.(txt|md|csv|json|js|mjs|ts|tsx|jsx|py|html?|css|xml|yaml|yml|log|sql|sh|toml|ini|svg)$/i.test(file.name))) note += '\n' + (await file.text()).slice(0, 24000);
  else note += '\n[File contents are unavailable to the text-only model.]';
  return { attachment, file, prompt: note + '\n\n' + (text || 'Please help with this file.') };
}
