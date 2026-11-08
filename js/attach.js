import { attachmentView } from './attach-view.js';
import { readAttachment } from './attach-text.js';
import { isImage, imageAttachment } from './attach-image.js';
import { attachmentNote } from './attach-payload.js';
export { attachmentNote } from './attach-payload.js';
const form = document.getElementById('composer'), input = document.getElementById('prompt');
const plus = document.getElementById('attach-plus'), picker = document.getElementById('pick-file');
const chip = document.getElementById('attach-chip');
let picked = [], urls = [], locked = false, warning = '';
picker.multiple = true;
function unavailable() { return locked || form.classList.contains('voice-active'); }
plus.onclick = () => { if (unavailable()) return; picker.value = ''; picker.click(); };
picker.onchange = () => { if (picker.files.length && !unavailable()) restoreAttachment([...picker.files]); picker.value = ''; };
function update() {
  urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
  chip.replaceChildren(); chip.hidden = !picked.length && !warning; form.dataset.attachment = picked.length ? 'true' : '';
  picked.forEach((file, index) => {
    const image = isImage(file), thumb = image ? URL.createObjectURL(file) : '';
    if (thumb) urls.push(thumb);
    chip.append(attachmentView({ name: file.name, kind: image ? 'image' : 'file', thumb }, true));
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '\u00d7';
    remove.setAttribute('aria-label', 'Remove attachment' + (picked.length > 1 ? ': ' + file.name : ''));
    remove.disabled = unavailable(); remove.onclick = () => { picked.splice(index, 1); warning = ''; update(); }; chip.append(remove);
  });
  if (warning) { const note = document.createElement('span'); note.setAttribute('role', 'status'); note.textContent = warning; chip.append(note); }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
export function hasAttachment() { return picked.length > 0; }
export function clearAttachment() { picked = []; warning = ''; update(); }
export function restoreAttachment(files) {
  for (const file of Array.isArray(files) ? files : [files]) {
    if (isImage(file) && picked.filter(isImage).length >= 3) { warning = 'Only 3 images per message; extra images were not added.'; continue; }
    picked.push(file);
  }
  update();
}
export function lockAttachment(value) { locked = value; sync(); }
function sync() { plus.disabled = unavailable(); chip.querySelectorAll('button').forEach(button => { button.disabled = unavailable(); }); }
new MutationObserver(sync).observe(form, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('pagehide', clearAttachment);
export async function prepareAttachment(text) {
  const files = picked.slice(), notice = warning;
  if (!files.length) return { prompt: text };
  const attachment = [];
  for (const file of files) {
    const a = { name: file.name.slice(0, 255), kind: isImage(file) ? 'image' : 'file' };
    if (a.kind === 'image') {
      try { Object.assign(a, await imageAttachment(file)); }
      catch (error) { a.kind = 'file'; a.note = error.message || 'Photo contents unavailable.'; }
    } else Object.assign(a, file.type.startsWith('video/') ? { note: 'File contents are unavailable.' } : await readAttachment(file));
    attachment.push(a);
  }
  if (notice) attachment[0].note = [attachment[0].note, notice].filter(Boolean).join(' ');
  return { attachment, prompt: attachmentNote(attachment) + '\n\n' + (text || 'Please help with this file.'), notice };
}
