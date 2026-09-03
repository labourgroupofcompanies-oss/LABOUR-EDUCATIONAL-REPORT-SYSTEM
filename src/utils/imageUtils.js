/**
 * processPassportPhoto
 *
 * Automatically crops and formats any phone camera or uploaded photo into a
 * high-clarity 3:4 aspect ratio Passport Photo format (e.g. 450x600 px).
 * Center-crops the subject's face/head to eliminate wide backgrounds.
 *
 * @param {File|Blob} file
 * @param {number} targetWidth  (default 450)
 * @param {number} targetHeight (default 600)
 * @param {number} quality      (default 0.90)
 * @returns {Promise<Blob>}
 */
export const processPassportPhoto = async (file, targetWidth = 450, targetHeight = 600, quality = 0.9) => {
  const bitmap = await createImageBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  // Target aspect ratio = 3 / 4 (0.75)
  const targetRatio = targetWidth / targetHeight;
  const srcRatio = srcW / srcH;

  let cropW, cropH, cropX, cropY;

  if (srcRatio > targetRatio) {
    // Source is wider than 3:4 → crop width centered
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
    cropX = Math.round((srcW - cropW) / 2);
    cropY = 0;
  } else {
    // Source is taller than 3:4 → crop height (slight upper offset for face focus)
    cropW = srcW;
    cropH = Math.round(srcW / targetRatio);
    cropX = 0;
    // Offset slightly higher (top 20%) to keep head/face in focus for passport style
    cropY = Math.max(0, Math.round((srcH - cropH) * 0.20));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Passport photo cropping failed.'));
      },
      'image/jpeg',
      quality
    );
  });
};

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

/**
 * processSchoolLogo
 *
 * Universal, fail-safe image processor for school logos. Accepts ANY image format
 * (PNG, JPG, WEBP, SVG, HEIC, GIF, BMP, TIFF, AVIF, DataURIs) from any device.
 * Automatically resizes large camera photos to a crisp, high-resolution logo Blob (max 600x600 px)
 * with transparent PNG or WebP output, retaining crisp vector/raster quality.
 *
 * @param {File|Blob|string} input
 * @param {number} maxDimension (default 600)
 * @returns {Promise<Blob>}
 */
export const processSchoolLogo = async (input, maxDimension = 600) => {
  if (!input) throw new Error('No image provided.');

  // SVG direct passthrough
  if (input instanceof File && (input.type === 'image/svg+xml' || input.name?.toLowerCase().endsWith('.svg'))) {
    return input;
  }

  try {
    let blobInput = input;
    if (typeof input === 'string') {
      const res = await fetch(input);
      blobInput = await res.blob();
    }

    const bitmap = await createImageBitmap(blobInput);
    let { width, height } = bitmap;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob || (blobInput instanceof Blob ? blobInput : new Blob([blobInput]))),
        'image/png',
        0.95
      );
    });

  } catch (err) {
    console.warn('[imageUtils] processSchoolLogo primary decode failed, executing HTMLImageElement fallback:', err);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      let objectUrl = null;
      if (input instanceof Blob || input instanceof File) {
        objectUrl = URL.createObjectURL(input);
        img.src = objectUrl;
      } else {
        img.src = String(input);
      }

      img.onload = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        let w = img.width || maxDimension;
        let h = img.height || maxDimension;

        if (w > maxDimension || h > maxDimension) {
          if (w > h) { h = Math.round((h * maxDimension) / w); w = maxDimension; }
          else { w = Math.round((w * maxDimension) / h); h = maxDimension; }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => resolve(blob || (input instanceof Blob ? input : new Blob([input]))),
          'image/png',
          0.95
        );
      };

      img.onerror = (imgErr) => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        console.warn('[imageUtils] HTMLImageElement fallback failed, returning original file/blob:', imgErr);
        if (input instanceof Blob || input instanceof File) {
          resolve(input);
        } else {
          reject(new Error('Invalid image file format.'));
        }
      };
    });
  }
};

// ─── DUAL-TIER IMAGE PIPELINE ────────────────────────────────────────────────

/**
 * canvasToBlobSafe
 *
 * Converts a canvas to a Blob with automatic fallback from WebP to JPEG
 * for legacy iOS Safari versions that don't support WebP encoding.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} preferredType  (default 'image/webp')
 * @param {number} quality        (default 0.85)
 * @returns {Promise<Blob>}
 */
const canvasToBlobSafe = (canvas, preferredType = 'image/webp', quality = 0.85) => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) return resolve(blob);
        // Fallback: WebP not supported → try JPEG
        canvas.toBlob(
          (jpegBlob) => {
            if (jpegBlob) resolve(jpegBlob);
            else reject(new Error('Canvas toBlob failed for both WebP and JPEG.'));
          },
          'image/jpeg',
          quality
        );
      },
      preferredType,
      quality
    );
  });
};

/**
 * processDualPassportPhoto
 *
 * Takes a raw camera snapshot or uploaded image file and produces TWO binary
 * WebP blobs in a single pass — no base64 at any stage:
 *   - full:  450 × 600 px at quality 0.88  (~30–40 KB) for profiles & report cards
 *   - thumb:  90 × 120 px at quality 0.75  (~2–5 KB) for grids, tables & rosters
 *
 * @param {File|Blob} file
 * @param {Object} opts
 * @returns {Promise<{ full: Blob, thumb: Blob }>}
 */
export const processDualPassportPhoto = async (file, opts = {}) => {
  const {
    fullW = 450, fullH = 600, fullQuality = 0.88,
    thumbW = 90, thumbH = 120, thumbQuality = 0.75
  } = opts;

  const bitmap = await createImageBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  // 3:4 center crop with face-focus offset
  const targetRatio = fullW / fullH;
  const srcRatio = srcW / srcH;
  let cropW, cropH, cropX, cropY;

  if (srcRatio > targetRatio) {
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
    cropX = Math.round((srcW - cropW) / 2);
    cropY = 0;
  } else {
    cropW = srcW;
    cropH = Math.round(srcW / targetRatio);
    cropX = 0;
    cropY = Math.max(0, Math.round((srcH - cropH) * 0.20));
  }

  // ── Full-resolution passport ──
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = fullW;
  fullCanvas.height = fullH;
  const fullCtx = fullCanvas.getContext('2d');
  fullCtx.imageSmoothingEnabled = true;
  fullCtx.imageSmoothingQuality = 'high';
  fullCtx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, fullW, fullH);

  // ── Micro-thumbnail ──
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const thumbCtx = thumbCanvas.getContext('2d');
  thumbCtx.imageSmoothingEnabled = true;
  thumbCtx.imageSmoothingQuality = 'high';
  thumbCtx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, thumbW, thumbH);

  bitmap.close();

  const [full, thumb] = await Promise.all([
    canvasToBlobSafe(fullCanvas, 'image/webp', fullQuality),
    canvasToBlobSafe(thumbCanvas, 'image/webp', thumbQuality),
  ]);

  return { full, thumb };
};

/**
 * generateThumbnailFromBlob
 *
 * Creates a micro-thumbnail from any existing Blob (useful for
 * back-filling thumbnails for legacy learner photos).
 *
 * @param {Blob} blob       - Existing full-resolution photo Blob
 * @param {number} thumbW   (default 90)
 * @param {number} thumbH   (default 120)
 * @param {number} quality  (default 0.75)
 * @returns {Promise<Blob>}
 */
export const generateThumbnailFromBlob = async (blob, thumbW = 90, thumbH = 120, quality = 0.75) => {
  const bitmap = await createImageBitmap(blob);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  const targetRatio = thumbW / thumbH;
  const srcRatio = srcW / srcH;
  let cropW, cropH, cropX, cropY;

  if (srcRatio > targetRatio) {
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
    cropX = Math.round((srcW - cropW) / 2);
    cropY = 0;
  } else {
    cropW = srcW;
    cropH = Math.round(srcW / targetRatio);
    cropX = 0;
    cropY = Math.max(0, Math.round((srcH - cropH) * 0.20));
  }

  const canvas = document.createElement('canvas');
  canvas.width = thumbW;
  canvas.height = thumbH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, thumbW, thumbH);
  bitmap.close();

  return canvasToBlobSafe(canvas, 'image/webp', quality);
};

/**
 * processDualSchoolLogo
 *
 * Takes any uploaded school crest/logo and produces TWO binary blobs:
 *   - full:  max 600 × 600 px PNG (~25–35 KB) for report cards & certificates
 *   - thumb: max  80 ×  80 px WebP (~2–4 KB) for header, sidebar & receipts
 *
 * SVG files are passed through directly (no rasterization needed).
 *
 * @param {File|Blob|string} input
 * @param {number} fullMax   (default 600)
 * @param {number} thumbMax  (default 80)
 * @returns {Promise<{ full: Blob, thumb: Blob }>}
 */
export const processDualSchoolLogo = async (input, fullMax = 600, thumbMax = 80) => {
  if (!input) throw new Error('No image provided.');

  // SVG: pass through as-is for both tiers (vector scales perfectly)
  if (input instanceof File && (input.type === 'image/svg+xml' || input.name?.toLowerCase().endsWith('.svg'))) {
    return { full: input, thumb: input };
  }

  let blobInput = input;
  if (typeof input === 'string') {
    const res = await fetch(input);
    blobInput = await res.blob();
  }

  const bitmap = await createImageBitmap(blobInput);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  // Helper: fit within maxDim preserving aspect ratio
  const fitDimensions = (w, h, maxDim) => {
    if (w <= maxDim && h <= maxDim) return { w, h };
    if (w > h) return { w: maxDim, h: Math.round((h * maxDim) / w) };
    return { w: Math.round((w * maxDim) / h), h: maxDim };
  };

  // ── Full-resolution logo (PNG for transparency) ──
  const fullDims = fitDimensions(srcW, srcH, fullMax);
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = fullDims.w;
  fullCanvas.height = fullDims.h;
  const fullCtx = fullCanvas.getContext('2d');
  fullCtx.imageSmoothingEnabled = true;
  fullCtx.imageSmoothingQuality = 'high';
  fullCtx.drawImage(bitmap, 0, 0, fullDims.w, fullDims.h);

  // ── Micro-icon thumbnail (WebP for small file size) ──
  const thumbDims = fitDimensions(srcW, srcH, thumbMax);
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbDims.w;
  thumbCanvas.height = thumbDims.h;
  const thumbCtx = thumbCanvas.getContext('2d');
  thumbCtx.imageSmoothingEnabled = true;
  thumbCtx.imageSmoothingQuality = 'high';
  thumbCtx.drawImage(bitmap, 0, 0, thumbDims.w, thumbDims.h);

  bitmap.close();

  const [full, thumb] = await Promise.all([
    canvasToBlobSafe(fullCanvas, 'image/png', 0.95),
    canvasToBlobSafe(thumbCanvas, 'image/webp', 0.80),
  ]);

  return { full, thumb };
};

/**
 * blobToDataURL
 * Converts a Blob or File into a base64 Data URL.
 * @param {Blob|File} blob
 * @returns {Promise<string>}
 */
export const blobToDataURL = (blob) => {
  return new Promise((resolve, reject) => {
    if (!blob || !(blob instanceof Blob)) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result || '');
    reader.onerror = (err) => reject(err || new Error('Failed to convert blob to data URL'));
    reader.readAsDataURL(blob);
  });
};
