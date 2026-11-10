// One deadline-based waiting indicator for model and image limits.
const css = document.createElement('link');
css.rel = 'stylesheet'; css.href = '/css/cooldown.css'; document.head.append(css);
export function cooldown(node, label, deadline, active = () => true) {
  return new Promise(resolve => {
    let timer;
    node.classList.add('error--warning'); node.hidden = false;
    node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'off');
    function finish(ok) {
      clearTimeout(timer); node.textContent = ''; node.hidden = true;
      node.classList.remove('error--warning'); node.removeAttribute('aria-live'); resolve(ok);
    }
    function tick() {
      if (!active()) return finish(false);
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (!seconds) return finish(true);
      node.textContent = label + ' ' + seconds + 's';
      timer = setTimeout(tick, Math.min(1000, Math.max(1, deadline - Date.now())));
    }
    tick();
  });
}
