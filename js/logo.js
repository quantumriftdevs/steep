const motion = matchMedia('(prefers-reduced-motion: reduce)');
const composer = document.querySelector('#prompt');
let relax;
function moveEyes(x, y) {
  if (motion.matches) return;
  document.querySelectorAll('.empty-mark .bot-pupil').forEach(pupil => {
    pupil.style.transform = `translate(${x}px, ${y}px)`;
  });
}
function lookAt(x, y) {
  const mark = document.querySelector('.empty-mark svg');
  if (!mark) return;
  const box = mark.getBoundingClientRect();
  const dx = x - (box.left + box.width / 2);
  const dy = y - (box.top + box.height / 2);
  const length = Math.hypot(dx, dy) || 1;
  moveEyes(2 * dx / length, 2 * dy / length);
}
function lookAtTyping() {
  const length = composer.value.length || 1;
  const position = composer.selectionStart / length;
  moveEyes((position - .5) * 3, 2);
}
document.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse' && document.activeElement !== composer) lookAt(event.clientX, event.clientY);
});
document.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch') return;
  lookAt(event.clientX, event.clientY);
  clearTimeout(relax);
  relax = setTimeout(() => {
    if (document.activeElement === composer) lookAtTyping();
    else moveEyes(0, 0);
  }, 1000);
});
composer.addEventListener('focus', lookAtTyping);
composer.addEventListener('input', lookAtTyping);
composer.addEventListener('keyup', lookAtTyping);
composer.addEventListener('blur', () => moveEyes(0, 0));
motion.addEventListener('change', () => {
  if (motion.matches) document.querySelectorAll('.bot-pupil').forEach(pupil => pupil.style.transform = '');
});
