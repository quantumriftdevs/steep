// Terminal notices expire independently; queue deadlines belong to cooldown.js.
const states = new WeakMap();
function unfade(node) { if (node.classList.contains('notice-fade')) node.classList.remove('notice-fade'); }
function watch(node) {
  let state = states.get(node);
  if (!state) { state = {}; states.set(node, state); }
  const text = node.textContent.trim();
  const queued = node.classList.contains('error--warning') || text.startsWith('Added to queue');
  if (node.hidden || !text || queued) {
    clearTimeout(state.fade); clearTimeout(state.hide); state.text = ''; unfade(node); return;
  }
  if (state.text === text) return;
  clearTimeout(state.fade); clearTimeout(state.hide); state.text = text; unfade(node);
  state.fade = setTimeout(() => node.classList.add('notice-fade'), 4750);
  state.hide = setTimeout(() => { node.hidden = true; node.textContent = ''; state.text = ''; unfade(node); }, 5000);
}
const scan = () => document.querySelectorAll('.error,[role="alert"],#settings-feedback').forEach(watch);
new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden','class'] });
scan();
