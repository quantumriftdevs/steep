(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const buttons = [...document.querySelectorAll('.hero-actions > a')];
  if (motion.matches || buttons.length !== 2 || !Element.prototype.animate) return;

  const agent = document.createElement('div');
  agent.className = 'intro-agent';
  agent.setAttribute('aria-hidden', 'true');
  agent.innerHTML = '<svg width="18" height="22" viewBox="0 0 18 22"><path fill="#f33d32" stroke="#101010" d="M1 1v16l4-4 3.5 7 3-1.5-3.5-7H15z"/></svg><span>agent-01</span>';
  document.body.append(agent);
  const animations = [];
  let stopped = false;
  buttons.forEach(button => { button.style.visibility = 'hidden'; });

  function finish() {
    if (stopped) return;
    stopped = true;
    animations.forEach(animation => animation.cancel());
    buttons.forEach(button => button.style.removeProperty('visibility'));
    agent.remove();
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

  async function run() {
    try {
      for (const [index, button] of buttons.entries()) {
        if (stopped) return;
        const box = button.getBoundingClientRect();
        const distance = innerWidth - box.left + 25;
        button.style.visibility = 'visible';
        const timing = { duration: 850, easing: 'cubic-bezier(.2,.75,.25,1)' };
        const carried = button.animate([
          { transform: `translateX(${distance}px)` },
          { transform: 'translateX(0)' }
        ], timing);
        const pointer = agent.animate([
          { transform: `translate(${box.left + distance}px,${box.top - 14}px)` },
          { transform: `translate(${box.left}px,${box.top - 14}px)` }
        ], { ...timing, fill: 'forwards' });
        animations.push(carried, pointer);
        await Promise.all([carried.finished, pointer.finished]);
        if (index === 0) {
          const reset = agent.animate([
            { transform: `translate(${box.left}px,${box.top - 14}px)` },
            { transform: `translate(${innerWidth + 25}px,${box.top - 14}px)` }
          ], { duration: 200, fill: 'forwards' });
          animations.push(reset);
          await reset.finished;
        }
      }
      const last = buttons[1].getBoundingClientRect();
      const exit = agent.animate([
        { transform: `translate(${last.left}px,${last.top - 14}px)` },
        { transform: `translate(${innerWidth + 25}px,${last.top - 60}px)` }
      ], { duration: 250, fill: 'forwards' });
      animations.push(exit);
      await exit.finished;
      finish();
    } catch (_) { finish(); }
  }
  run();
})();
