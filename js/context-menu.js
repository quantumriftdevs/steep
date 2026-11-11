// Only explicitly bound recent-chat/project rows get a menu.
const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/context-menu.css'; document.head.append(css);
let menu, owner, cancelHold;
export function closeMenu() { cancelHold?.(); menu?.remove(); menu = owner = null; }
async function openMenu(row, items, x, y) {
  closeMenu(); owner = row;
  const entries = await items(); if (owner !== row || !row.isConnected) return;
  menu = document.createElement('div'); menu.className = 'context-menu'; menu.setAttribute('role', 'menu');
  const paths = { pin: 'm9 3 6 0-1 6 4 4H6l4-4-1-6ZM12 13v8', share: 'M12 15V3M8 7l4-4 4 4M5 13v7h14v-7', rename: 'm14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z', delete: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15', stop: 'M6 6h12v12H6Z' };
  entries.forEach(item => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
    if (item.danger) b.className = 'context-danger';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (paths[item.icon] || paths.pin) + '"/></svg>';
    const label = document.createElement('span'); label.textContent = item.label; b.append(label);
    b.onclick = e => { e.stopPropagation(); closeMenu(); item.run(); }; menu.append(b);
  });
  document.body.append(menu);
  const v = window.visualViewport, left = v?.offsetLeft || 0, top = v?.offsetTop || 0;
  menu.style.left = Math.max(left + 8, Math.min(x, left + (v?.width || innerWidth) - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(top + 8, Math.min(y, top + (v?.height || innerHeight) - menu.offsetHeight - 8)) + 'px';
  menu.querySelector('button')?.focus();
}
export function bindMenu(row, items) {
  let timer, start, held = false;
  const cancel = () => { clearTimeout(timer); timer = null; if (cancelHold === cancel) cancelHold = null; };
  row.addEventListener('pointerdown', e => {
    if (e.button !== 0 || row.disabled) return;
    cancelHold?.(); cancelHold = cancel; held = false; start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { held = true; openMenu(row, items, start.x, start.y); }, 500);
  });
  row.addEventListener('pointermove', e => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  ['pointerup','pointercancel','lostpointercapture'].forEach(name => row.addEventListener(name, cancel));
  row.addEventListener('click', e => { if (held) { e.preventDefault(); e.stopImmediatePropagation(); held = false; } }, true);
  row.addEventListener('contextmenu', e => { e.preventDefault(); cancel(); held = true; if (!row.disabled) openMenu(row, items, e.clientX, e.clientY); });
  row.addEventListener('keydown', e => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = row.getBoundingClientRect(); openMenu(row, items, r.left, r.bottom); } });
}
document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
document.addEventListener('scroll', closeMenu, true); window.addEventListener('resize', closeMenu);
document.addEventListener('keydown', e => {
  if (!menu) return;
  if (e.key === 'Escape') { const row = owner; closeMenu(); row?.focus(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const b = [...menu.querySelectorAll('button')], i = b.indexOf(document.activeElement); b[(i + (e.key === 'ArrowDown' ? 1 : b.length - 1)) % b.length]?.focus(); }
});
