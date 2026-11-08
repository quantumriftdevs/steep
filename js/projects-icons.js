const paths = {
  chat: 'M20 11a8 8 0 0 1-8 8H5l2-3a8 8 0 1 1 13-5Z',
  folder: 'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 1h18',
  plus: 'M12 5v14M5 12h14', more: 'M5 12h.01M12 12h.01M19 12h.01',
  remove: 'm6 6 12 12M18 6 6 18'
};
export function projectIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true'); svg.classList.add('project-icon');
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name] || paths.folder); svg.append(path); return svg;
}
export function projectRow(label, icon, action) {
  const button = document.createElement('button'); button.type = 'button';
  const text = document.createElement('span'); text.textContent = label;
  button.append(projectIcon(icon), text); button.onclick = action; return button;
}
