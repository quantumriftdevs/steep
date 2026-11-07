export const icons = {
  photos: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
  files: '<path d="m9 17 8-8a3 3 0 0 0-4-4L5 13a5 5 0 0 0 7 7l8-8M8 15l7-7"/>',
  camera: '<path d="M8 6 9.5 3h5L16 6h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="4"/>'
};
export const svg = path => '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
export function attachmentView(a, preview = false) {
  if (a.kind === 'image' && /^(data:image\/jpeg;base64,|blob:)/.test(a.thumb || '')) {
    const img = document.createElement('img'); img.src = a.thumb; img.alt = a.name;
    if (!preview) img.className = 'attach-preview';
    return img;
  }
  const label = document.createElement('span'); label.className = 'attach-file';
  label.innerHTML = svg(icons.files); label.append(document.createTextNode(a.name)); return label;
}
