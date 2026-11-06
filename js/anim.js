let cancelAnimation = () => {};

export function animateWelcome(empty, composer) {
  cancelAnimation();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const heading = empty.querySelector('h1');
  const chips = [...empty.querySelectorAll('.examples button')];
  const title = heading.textContent;
  const cursor = document.createElement('span');
  cursor.className = 'agent-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  document.body.append(cursor);
  heading.textContent = '';
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
    heading.textContent = title;
    chips.forEach(chip => chip.classList.remove('anim-hidden'));
    cursor.remove();
    document.removeEventListener('pointerdown', finish);
    cancelAnimation = () => {};
  }
  cancelAnimation = finish;
  document.addEventListener('pointerdown', finish, { once: true });
  move(heading);
  [...title].forEach((_, i) => later(() => {
    heading.textContent = title.slice(0, i + 1);
  }, 200 + i * 75));
  chips.forEach((chip, i) => later(() => {
    move(chip);
    later(() => chip.classList.remove('anim-hidden'), 220);
  }, 1500 + i * 550));
  later(() => move(composer), 3300);
  later(finish, 3900);
}
