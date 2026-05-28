/**
 * compressImageToBlob
 *
 * Accepts ANY browser-decodable image file (JPEG, PNG, GIF, WebP, AVIF,
 * BMP, SVG, HEIC on Safari, etc.) and returns a compressed WebP Blob.
 *
 * Zero base64 — the entire pipeline stays in binary (File → ImageBitmap →
 * Canvas → Blob), so there is no memory explosion for large images and no
 * risk of accidentally persisting a giant base64 string to a database.
 *
 * @param {File|Blob} file       - The raw image file from an <input type="file">
 * @param {number}    maxWidth   - Max output width in pixels  (default 500)
 * @param {number}    maxHeight  - Max output height in pixels (default 500)
 * @param {number}    quality    - WebP quality 0–1            (default 0.85)
 * @returns {Promise<Blob>}      - Compressed WebP Blob
 */
export const compressImageToBlob = async (file, maxWidth = 500, maxHeight = 500, quality = 0.85) => {
  // createImageBitmap decodes any supported image format natively in the browser
  // without needing a FileReader or base64 conversion.
  const bitmap = await createImageBitmap(file);

  let { width, height } = bitmap;

  // Scale down proportionally if the image exceeds the max dimensions
  if (width > height) {
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
  } else {
    if (height > maxHeight) {
      width = Math.round((width * maxHeight) / height);
      height = maxHeight;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close(); // Free GPU memory immediately

  // canvas.toBlob is async and returns a binary Blob (not base64)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed — browser may not support WebP output.'));
      },
      'image/webp',
      quality
    );
  });
};

/**
 * Legacy base64 wrapper — kept for backward compatibility with any other
 * part of the app that still calls compressImage(base64Str, ...).
 * New code should use compressImageToBlob() instead.
 */
export const compressImage = (base64Str, maxWidth = 400, maxHeight = 400, quality = 0.8) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/webp', quality));
    };
    img.onerror = () => resolve(base64Str);
  });
};

