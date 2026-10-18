import { PHOTO_MAX_BYTES, validateSource } from './documents';

export const PHOTO_MAX_EDGE = 1600;
type Encode = (width: number, height: number, quality: number) => Promise<Blob>;

export function fitPhoto(width: number, height: number, edge = PHOTO_MAX_EDGE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('The photo has invalid dimensions.');
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Bounded retries: keep reasonable JPEG quality, then reduce pixels if necessary.
export async function encodePhoto(width: number, height: number, encode: Encode): Promise<Blob> {
  let size = fitPhoto(width, height);
  for (let step = 0; step < 8; step++) {
    for (const quality of [0.9, 0.8, 0.7]) {
      const blob = await encode(size.width, size.height, quality);
      if (blob.type !== 'image/jpeg' || !blob.size) throw new Error('The browser could not create a JPEG photo.');
      if (blob.size <= PHOTO_MAX_BYTES) return blob;
    }
    size = fitPhoto(size.width, size.height, Math.max(1, Math.floor(Math.max(size.width, size.height) * 0.8)));
  }
  throw new Error('Could not fit this photo within 2 MB. Please choose a smaller image.');
}

export async function preparePhoto(file: File): Promise<Blob> {
  await validateSource(file, 'photo');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('This photo could not be decoded. Please choose another PNG or JPEG.'); }
  const canvas = document.createElement('canvas');
  try {
    return await encodePhoto(bitmap.width, bitmap.height, async (width, height, quality) => {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Photo processing is unavailable in this browser.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);
      return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('The browser could not encode this photo.'));
      }, 'image/jpeg', quality));
    });
  } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
}
