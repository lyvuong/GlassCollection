/** Resize + compress a camera image to a small JPEG base64 string (no data: prefix). */
export async function compressImage(
  file: Blob,
  maxDim = 1280,
  quality = 0.6,
  maxBytes = 250_000,
): Promise<{ base64: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  let w = Math.round(bitmap.width * scale);
  let h = Math.round(bitmap.height * scale);
  let q = quality;
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', q);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (base64.length * 0.75 <= maxBytes || attempt === 5) {
      bitmap.close?.();
      return { base64, width: w, height: h };
    }
    q = Math.max(0.35, q - 0.1);
    w = Math.round(w * 0.85);
    h = Math.round(h * 0.85);
  }
  throw new Error('unreachable');
}

export interface GpsStamp {
  lat?: number;
  lng?: number;
  accuracy?: number;
}

/** One-shot GPS fix; resolves with empty stamp if denied/unavailable (never blocks the check-off). */
export function getGpsStamp(timeoutMs = 8000): Promise<GpsStamp> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 },
    );
  });
}

export function dataUrl(base64: string): string {
  return `data:image/jpeg;base64,${base64}`;
}
