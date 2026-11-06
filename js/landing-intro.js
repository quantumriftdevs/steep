(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const buttons = [...document.querySelectorAll('.hero-actions > a')];
  if (motion.matches || !buttons.length || !Element.prototype.animate) return;

  const animations = [];
  const agents = [];
  let stopped = false;
  function finish() {
    if (stopped) return;
    stopped = true;
    animations.forEach(animation => animation.cancel());
    buttons.forEach(button => button.style.removeProperty('visibility'));
    agents.forEach(agent => agent.remove());
    window.removeEventListener('pointerdown', finish);
    window.removeEventListener('keydown', finish);
    window.removeEventListener('scroll', finish);
    window.removeEventListener('resize', finish);
    motion.removeEventListener?.('change', onMotion);
  }
  function onMotion(event) { if (event.matches) finish(); }
  window.addEventListener('pointerdown', finish, { once: true });
  window.addEventListener('keydown', finish, { once: true });
  window.addEventListener('scroll', finish, { once: true, passive: true });
  window.addEventListener('resize', finish, { once: true });
  motion.addEventListener?.('change', onMotion);

  async function carry(button, index) {
    const agent = document.createElement('div');
    agent.className = `intro-agent agent-${index % 4 + 1}`;
    agent.setAttribute('aria-hidden', 'true');
    agent.innerHTML = `<svg width="18" height="22" viewBox="0 0 18 22"><path fill="currentColor" stroke="#101010" d="M1 1v16l4-4 3.5 7 3-1.5-3.5-7H15z"/></svg><span>agent ${index + 1}</span>`;
    agents.push(agent);
    document.body.append(agent);
    const box = button.getBoundingClientRect();
    const offset = index % 2 === 0 ? -box.right - 30 : innerWidth - box.left + 30;
    const x = box.left;
    const y = box.top - 14;
    const timing = { duration: 1450, delay: index * 160, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' };
    const carried = button.animate([
      { transform: `translateX(${offset}px)` },
      { transform: 'translateX(0)' }
    ], timing);
    const pointer = agent.animate([
      { transform: `translate(${x + offset}px,${y}px)` },
      { transform: `translate(${x}px,${y}px)` }
    ], timing);
    animations.push(carried, pointer);
    await Promise.all([carried.finished, pointer.finished]);
    if (stopped) return;
    const exit = agent.animate([
      { transform: `translate(${x}px,${y}px)`, opacity: 1 },
      { transform: `translate(${x + (index % 2 ? 90 : -90)}px,${y - 70}px)`, opacity: 0 }
    ], { duration: 450, easing: 'ease-in', fill: 'forwards' });
    animations.push(exit);
    await exit.finished;
  }
  Promise.all(buttons.map(carry)).then(finish).catch(finish);
})();
