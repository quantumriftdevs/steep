const key = 'steep-name';

function savedName() {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function greeting(name) {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return `Good ${time}${name ? ', ' + name : '.'}`;
}
export function setupGreeting(empty) {
  const heading = empty.querySelector('h1');
  const form = empty.querySelector('.name-form');
  const input = form.querySelector('input');
  const name = savedName();
  heading.textContent = greeting(name);
  form.hidden = Boolean(name);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = input.value.trim().slice(0, 60);
    if (!value) return;
    try { localStorage.setItem(key, value); } catch {}
    heading.textContent = greeting(value);
    form.hidden = true;
  });
  form.querySelector('.name-skip').addEventListener('click', () => { form.hidden = true; });
}
