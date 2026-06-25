const MAX_AVATAR_SIZE = 256;

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> => {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
};

const loadBlobIntoImage = async (blob: Blob): Promise<HTMLImageElement> => {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const resizeImageBlob = async (blob: Blob): Promise<Blob> => {
  const img = await loadBlobIntoImage(blob);
  const scale = Math.min(1, MAX_AVATAR_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return blob;

  context.drawImage(img, 0, 0, width, height);
  const compressed = await canvasToBlob(canvas, 'image/webp', 0.82)
    || await canvasToBlob(canvas, 'image/jpeg', 0.86);

  return compressed || blob;
};

export const cacheImageUrlAsDataUrl = async (url?: string): Promise<string | undefined> => {
  if (!url || url.startsWith('data:')) return url;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'image/*,*/*;q=0.8' },
      cache: 'force-cache',
    });
    if (!response.ok) return url;

    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || blob.size === 0) return url;

    const resized = await resizeImageBlob(blob);
    const dataUrl = await blobToDataUrl(resized);
    return dataUrl || url;
  } catch {
    return url;
  }
};
