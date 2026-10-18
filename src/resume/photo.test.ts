import { describe, expect, it, vi } from 'vitest';
import { PHOTO_MAX_BYTES } from './documents';
import { encodePhoto, fitPhoto } from './photo';

const jpeg = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
describe('photo optimization policy', () => {
  it('fits both orientations proportionally and never upscales', () => {
    expect(fitPhoto(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitPhoto(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitPhoto(200, 300)).toEqual({ width: 200, height: 300 });
    expect(() => fitPhoto(0, 100)).toThrow('dimensions');
    expect(() => fitPhoto(Infinity, 100)).toThrow('dimensions');
  });
  it('accepts the highest-quality result at the exact decimal 2 MB limit', async () => {
    const encode = vi.fn(async () => jpeg(PHOTO_MAX_BYTES));
    const result = await encodePhoto(4000, 3000, encode);
    expect(result.size).toBe(2_000_000);
    expect(encode).toHaveBeenCalledExactlyOnceWith(1600, 1200, 0.9);
  });
  it('tries lower quality then fewer pixels instead of extreme JPEG degradation', async () => {
    const encode = vi.fn(async (width: number) => jpeg(width >= 1600 ? PHOTO_MAX_BYTES + 1 : 100));
    const result = await encodePhoto(4000, 3000, encode);
    expect(encode.mock.calls).toEqual([[1600, 1200, 0.9], [1600, 1200, 0.8], [1600, 1200, 0.7], [1280, 960, 0.9]]);
    expect(result.size).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
  });
  it('fails explicitly on unavailable JPEG encoding or empty output', async () => {
    await expect(encodePhoto(100, 100, async () => new Blob(['png'], { type: 'image/png' }))).rejects.toThrow('JPEG');
    await expect(encodePhoto(100, 100, async () => jpeg(0))).rejects.toThrow('JPEG');
  });
  it('stops after bounded attempts when the limit cannot be met', async () => {
    const oversized = jpeg(PHOTO_MAX_BYTES + 1);
    const encode = vi.fn(async () => oversized);
    await expect(encodePhoto(4000, 3000, encode)).rejects.toThrow('within 2 MB');
    expect(encode).toHaveBeenCalledTimes(24);
  });
});
