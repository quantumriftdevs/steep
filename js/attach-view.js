export const icons = {
  files: '<path d="m9 17 8-8a3 3 0 0 0-4-4L5 13a5 5 0 0 0 7 7l8-8M8 15l7-7"/>'
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
