const key = 'steep-theme-v1', choices = ['light', 'dark', 'system'];
function read() { try { const v = localStorage.getItem(key); return choices.includes(v) ? v : 'system'; } catch { return 'system'; } }
function apply(value) { document.documentElement.dataset.theme = choices.includes(value) ? value : 'system'; }
apply(read());
const page = document.querySelector('.settings-page');
if (page) {
  const section = document.createElement('section'); section.className = 'settings-group'; section.setAttribute('aria-label', 'Appearance');
  const label = document.createElement('label'); label.className = 'settings-row'; label.htmlFor = 'theme-choice'; label.textContent = 'Appearance';
  const select = document.createElement('select'); select.id = 'theme-choice'; select.setAttribute('aria-label', 'Color theme');
  choices.forEach(value => { const o = document.createElement('option'); o.value = value; o.textContent = value[0].toUpperCase() + value.slice(1); select.append(o); });
  select.value = read(); label.append(select); section.append(label); page.querySelector('#settings-feedback').before(section);
  select.addEventListener('change', () => {
    const feedback = document.getElementById('settings-feedback');
    try { localStorage.setItem(key, select.value); apply(select.value); feedback.textContent = 'Appearance saved.'; }
    catch { select.value = read(); feedback.textContent = 'This browser could not save the appearance. Please try again.'; }
    feedback.hidden = false;
  });
}
window.addEventListener('storage', e => { if (e.key === key) { apply(read()); const select = document.getElementById('theme-choice'); if (select) select.value = read(); } });
