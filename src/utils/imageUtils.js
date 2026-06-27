/**
 * compressImageToBlob
 *
 * Accepts ANY browser-decodable image file and returns a compressed WebP Blob.
 * Zero base64 pipeline stays in binary (File -> ImageBitmap -> Canvas -> Blob).
 *
 * @param {File|Blob} file
 * @param {number} maxWidth  (default 500)
 * @param {number} maxHeight (default 500)
 * @param {number} quality   (default 0.85)
 * @returns {Promise<Blob>}
 */
export const compressImageToBlob = async (file, maxWidth = 500, maxHeight = 500, quality = 0.85) => {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > height) {
    if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
  } else {
    if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob); else reject(new Error('Canvas toBlob failed.')); },
      'image/webp', quality
    );
  });
};

/**
 * Legacy base64 wrapper — kept for backward compatibility.
 * New code should use compressImageToBlob() instead.
 */
export const compressImage = (base64Str, maxWidth = 400, maxHeight = 400, quality = 0.8) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width, height = img.height;
      if (width > height) {
        if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
      } else {
        if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/webp', quality));
    };
    img.onerror = () => resolve(base64Str);
  });
};

/**
 * downloadImageAsBlob
 *
 * Fetches a remote image URL and returns a compressed WebP Blob for
 * offline caching in IndexedDB.
 *
 * @param {string} url     - Public HTTPS URL
 * @param {number} maxSize - Max width/height (default 500)
 * @returns {Promise<Blob|null>}
 */
export const downloadImageAsBlob = async (url, maxSize = 500) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const rawBlob = await res.blob();
    return await compressImageToBlob(rawBlob, maxSize, maxSize, 0.85);
  } catch (err) {
    console.warn('[imageUtils] downloadImageAsBlob failed:', err);
    return null;
  }
};
