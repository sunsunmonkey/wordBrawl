import { isPollinationsUrl, runPollinationsTask } from "./pollinationsQueue";

const DEFAULT_MAX_IMAGE_SIZE = 256;

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> => {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
};

const loadBlobIntoImage = async (blob: Blob): Promise<HTMLImageElement> => {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = objectUrl;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const resizeImageBlob = async (blob: Blob, maxSize: number): Promise<Blob> => {
  const img = await loadBlobIntoImage(blob);
  const safeMaxSize = Math.max(96, maxSize);
  const scale = Math.min(
    1,
    safeMaxSize / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return blob;

  context.drawImage(img, 0, 0, width, height);
  const compressed =
    (await canvasToBlob(canvas, "image/webp", 0.82)) ||
    (await canvasToBlob(canvas, "image/jpeg", 0.86));

  return compressed || blob;
};

export const cacheImageUrlAsDataUrl = async (
  url?: string,
  options?: { maxSize?: number },
): Promise<string | undefined> => {
  if (!url || url.startsWith("data:")) return url;

  // Pollinations 远程图需走全局串行队列，避免与其他生成请求并发触发 max=1 限流。
  const fetchBlob = async (): Promise<string | undefined> => {
    const response = await fetch(url, {
      headers: { Accept: "image/*,*/*;q=0.8" },
      cache: "force-cache",
    });
    if (!response.ok) return url;

    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size === 0) return url;

    const resized = await resizeImageBlob(
      blob,
      options?.maxSize ?? DEFAULT_MAX_IMAGE_SIZE,
    );
    const dataUrl = await blobToDataUrl(resized);
    return dataUrl || url;
  };

  try {
    return isPollinationsUrl(url)
      ? await runPollinationsTask(fetchBlob)
      : await fetchBlob();
  } catch {
    return url;
  }
};
