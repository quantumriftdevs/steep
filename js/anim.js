let cancelAnimation = () => {};

export function animateWelcome(empty, composer) {
  cancelAnimation();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const heading = empty.querySelector('h1');
  const chips = [...empty.querySelectorAll('.examples button')];
  const title = heading.textContent; const form = empty.querySelector('.name-form'); const label = form.hidden ? null : form.querySelector('label'); const question = label ? label.textContent : '';
  const cursor = document.createElement('span');
  cursor.className = 'agent-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  document.body.append(cursor);
  heading.textContent = ''; if (label) label.textContent = '';
  chips.forEach(chip => chip.classList.add('anim-hidden'));
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  function move(target) {
    if (!target.isConnected) return;
    const box = target.getBoundingClientRect();
    cursor.style.left = `${box.left + 8}px`;
    cursor.style.top = `${box.top + box.height / 2}px`;
  }
  function finish() {
    timers.forEach(clearTimeout);
    heading.textContent = title; if (label) label.textContent = question;
    chips.forEach(chip => chip.classList.remove('anim-hidden'));
    cursor.remove();
    document.removeEventListener('pointerdown', finish); document.removeEventListener('keydown', finish);
    cancelAnimation = () => {};
  }
  cancelAnimation = finish;
  document.addEventListener('pointerdown', finish, { once: true }); document.addEventListener('keydown', finish, { once: true });
  move(heading);
  [...title].forEach((_, i) => later(() => {
    heading.textContent = title.slice(0, i + 1);
  }, 200 + i * (850 / title.length))); if (label) { later(() => move(label), 1100); [...question].forEach((_, i) => later(() => { label.textContent = question.slice(0, i + 1); }, 1150 + i * (650 / question.length))); }
  chips.forEach((chip, i) => later(() => {
    move(chip);
    later(() => chip.classList.remove('anim-hidden'), 220);
  }, 2050 + i * 400));
  later(() => move(composer), 3300);
  later(finish, 3900);
}
