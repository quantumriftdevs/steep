(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try {
    if (sessionStorage.getItem('steep-landing-seen')) return;
    sessionStorage.setItem('steep-landing-seen', '1');
  } catch { return; }
  const heading = document.querySelector('.hero h1');
  const phone = document.querySelector('.hero .phone');
  const buttons = [...document.querySelectorAll('.hero-actions a')];
  const bubbles = [...document.querySelectorAll('.hero .bubble')];
  if (!heading || !phone || !buttons.length) return;
  const original = heading.innerHTML;
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const words = [];
  nodes.forEach(node => {
    const fragment = document.createDocumentFragment();
    node.data.split(/(\s+)/).forEach(part => {
      if (!part) return;
      if (/^\s+$/.test(part)) fragment.append(document.createTextNode(part));
      else {
        const word = document.createElement('span');
        word.className = 'landing-word';
        word.textContent = part;
        words.push(word);
        fragment.append(word);
      }
    });
    node.replaceWith(fragment);
  });
  const cursor = document.createElement('span');
  cursor.className = 'landing-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  document.body.append(cursor);
  document.body.classList.add('landing-build');
  const timers = [];
  const later = (fn, delay) => timers.push(setTimeout(fn, delay));
  function move(element) {
    const box = element.getBoundingClientRect();
    cursor.style.left = `${box.right + 3}px`;
    cursor.style.top = `${box.top + box.height / 2 - 12}px`;
  }
  function finish() {
    timers.forEach(clearTimeout);
    document.removeEventListener('pointerdown', finish);
    heading.innerHTML = original;
    [...buttons, phone, ...bubbles].forEach(el => el.classList.remove('is-visible'));
    document.body.classList.remove('landing-build');
    cursor.remove();
  }
  document.addEventListener('pointerdown', finish, {once: true});
  move(words[0] || heading);
  words.forEach((word, i) => later(() => {
    word.classList.add('is-visible');
    move(word);
  }, 150 + i * (1300 / Math.max(words.length - 1, 1))));
  buttons.forEach((button, i) => later(() => {
    button.classList.add('is-visible');
    move(button);
  }, 1600 + i * 200));
  later(() => { phone.classList.add('is-visible'); move(phone); }, 2050);
  bubbles.forEach((bubble, i) => later(() => {
    bubble.classList.add('is-visible');
    move(bubble);
  }, 2350 + i * 220));
  later(() => { cursor.style.opacity = '0'; }, 3350);
  later(finish, 3650);
})();
