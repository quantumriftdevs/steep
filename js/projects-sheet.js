let currentSheet;
export function closeProjectSheet() { currentSheet?.(true); }
export function projectSheet(title, build, beforeClose = () => true) {
  if (currentSheet) return;
  const previous = document.activeElement, overlay = document.createElement('div');
  overlay.className = 'project-overlay';
  const panel = document.createElement('section'); panel.className = 'project-sheet';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title); panel.tabIndex = -1;
  const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'project-handle'; handle.setAttribute('aria-label', 'Close project sheet'); handle.innerHTML = '<span></span>';
  const header = document.createElement('header'), heading = document.createElement('h2'), done = document.createElement('button');
  heading.textContent = title; done.type = 'button'; done.textContent = 'Done'; header.append(heading, done);
  const content = document.createElement('div'); content.className = 'project-sheet-content';
  panel.append(handle, header, content); overlay.append(panel);
  const siblings = [...document.body.children].filter(el => el instanceof HTMLElement && !['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el => [el, el.inert]);
  siblings.forEach(([el]) => { el.inert = true; });
  const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; document.body.append(overlay);
  let closing = false, drag = null, moved = false;
  function finish() {
    if (!overlay.isConnected) return;
    overlay.remove(); siblings.forEach(([el, inert]) => { el.inert = inert; }); document.body.style.overflow = overflow;
    document.removeEventListener('keydown', keys); currentSheet = null;
    const target = [previous, ...document.querySelectorAll('[aria-label="Project settings"],#new-chat,#open-menu')].find(el => el?.isConnected && !el.closest('[inert],[hidden]') && el.getClientRects().length); target?.focus();
  }
  function close(force = false) {
    if (closing || (!force && beforeClose() === false)) return false;
    closing = true; drag = null; panel.style.transition = ''; panel.style.transform = ''; overlay.classList.remove('open');
    panel.addEventListener('transitionend', finish, { once: true }); setTimeout(finish, 320); return true;
  }
  function keys(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll('button,input,textarea,[tabindex="0"]')].filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
    const first = items[0] || panel, last = items.at(-1) || panel;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  currentSheet = close; document.addEventListener('keydown', keys);
  done.onclick = () => close(); overlay.onclick = e => { if (e.target === overlay) close(); };
  handle.onclick = () => { if (!moved) close(); moved = false; };
  handle.onpointerdown = e => {
    if (closing || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, y: e.clientY, t: performance.now(), distance: 0 }; moved = false;
    handle.setPointerCapture(e.pointerId); panel.style.transition = 'none';
  };
  handle.onpointermove = e => {
    if (!drag || drag.id !== e.pointerId) return;
    drag.distance = Math.max(0, e.clientY - drag.y); moved ||= drag.distance > 5;
    panel.style.transform = `translateY(${drag.distance}px)`;
  };
  function end(e) {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag; drag = null; panel.style.transition = '';
    const dismiss = e.type !== 'pointercancel' && (d.distance > Math.min(150, panel.offsetHeight * .25) || (d.distance > 45 && d.distance / Math.max(1, performance.now() - d.t) > .55));
    if (!dismiss || !close()) panel.style.transform = '';
  }
  handle.onpointerup = end; handle.onpointercancel = end;
  build(content, close);
  requestAnimationFrame(() => requestAnimationFrame(() => { if (!closing) { overlay.classList.add('open'); handle.focus(); } }));
}
