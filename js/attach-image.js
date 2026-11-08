export function isImage(file) {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name);
}
export function imageAttachment(file) {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file), img = new Image();
    const done = () => { clearTimeout(timer); URL.revokeObjectURL(src); };
    const timer = setTimeout(() => { done(); img.src = ''; reject(new Error('Photo decoding timed out.')); }, 30000);
    img.onload = () => {
      try {
        if (!img.naturalWidth || !img.naturalHeight) throw new Error('Empty photo.');
        const encode = (edge, quality, background) => {
          const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL('image/jpeg', quality);
          if (!data.startsWith('data:image/jpeg;base64,')) throw new Error('JPEG encoding unavailable.');
          canvas.width = canvas.height = 1; return data;
        };
        resolve({ thumb: encode(256, .78, '#fffefa'), data: encode(1568, .80, '#ffffff') });
      } catch { reject(new Error('Could not prepare this photo. Try a JPEG or PNG.')); }
      finally { done(); }
    };
    img.onerror = () => { done(); reject(new Error('Could not open this photo. Try a JPEG or PNG.')); };
    img.src = src;
  });
}
