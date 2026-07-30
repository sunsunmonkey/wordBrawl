import { put } from "@vercel/blob";
import { getCache } from "@vercel/functions";
import { createHash, randomUUID } from "node:crypto";
import {
  getHeader,
  readBody,
  sendJson,
  setCorsHeaders,
  type ApiRequest,
  type ApiResponse,
} from "./_shared.js";

const ALLOWED_HOST = "image.pollinations.ai";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 45_000;
const CACHE_NAMESPACE = "word-brawl-image-usage";

type ImageUsageRecord = {
  count: number;
};

const memoryUsage = new Map<string, ImageUsageRecord>();

const allowedContentTypes = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

class ImageTooLargeError extends Error {}

const getLimit = (): number => {
  const configured = Number(process.env.IMAGE_DAILY_LIMIT ?? "20");
  if (!Number.isFinite(configured)) return 20;
  return Math.max(0, Math.floor(configured));
};

const getDayKey = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.IMAGE_USAGE_TIMEZONE || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const getClientKey = (req: ApiRequest): string => {
  const forwardedFor = String(getHeader(req.headers, "x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  const ip =
    forwardedFor ||
    getHeader(req.headers, "x-real-ip") ||
    req.socket?.remoteAddress ||
    "anonymous";
  const salt =
    process.env.IMAGE_USAGE_HASH_SALT ||
    process.env.USAGE_HASH_SALT ||
    process.env.AI_API_KEY ||
    "word-brawl";
  return createHash("sha256")
    .update(`${salt}:${ip}`)
    .digest("hex")
    .slice(0, 32);
};

const getUsageKey = (req: ApiRequest): string =>
  `image:${getDayKey()}:${getClientKey(req)}`;

const readUsage = async (key: string): Promise<ImageUsageRecord> => {
  try {
    const cached = await getCache({ namespace: CACHE_NAMESPACE }).get(key);
    if (
      cached &&
      typeof cached === "object" &&
      "count" in cached &&
      typeof cached.count === "number"
    ) {
      return { count: cached.count };
    }
  } catch {
    // Local development and degraded Cache both use the in-process fallback.
  }
  return memoryUsage.get(key) ?? { count: 0 };
};

const writeUsage = async (
  key: string,
  record: ImageUsageRecord,
): Promise<void> => {
  memoryUsage.set(key, record);
  try {
    await getCache({ namespace: CACHE_NAMESPACE }).set(key, record, {
      ttl: 60 * 60 * 36,
      tags: ["word-brawl-image-usage"],
    });
  } catch {
    // The fallback was already written above.
  }
};

const getImageSource = (value: unknown): URL | null => {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== ALLOWED_HOST) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
};

const getContentType = (response: Response): string | null => {
  const raw = response.headers.get("content-type") || "";
  const type = raw.split(";")[0].trim().toLowerCase();
  return allowedContentTypes.has(type) ? type : null;
};

const readImage = async (response: Response): Promise<Buffer> => {
  if (!response.body) throw new Error("图片源没有响应内容");

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ImageTooLargeError();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
};

const hasImageSignature = (contentType: string, image: Buffer): boolean => {
  if (contentType === "image/jpeg") {
    return (
      image.length >= 3 &&
      image[0] === 0xff &&
      image[1] === 0xd8 &&
      image[2] === 0xff
    );
  }
  if (contentType === "image/png") {
    return image
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === "image/webp") {
    return (
      image.length >= 12 &&
      image.subarray(0, 4).toString("ascii") === "RIFF" &&
      image.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if (contentType === "image/gif") {
    const header = image.subarray(0, 6).toString("ascii");
    return header === "GIF87a" || header === "GIF89a";
  }
  if (contentType === "image/avif") {
    return (
      image.length >= 12 &&
      image.subarray(4, 8).toString("ascii") === "ftyp" &&
      ["avif", "avis"].includes(image.subarray(8, 12).toString("ascii"))
    );
  }
  return false;
};

const getPathname = (extension: string): string =>
  `generated-images/${getDayKey()}/${randomUUID()}.${extension}`;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    sendJson(res, 503, { error: "图片存储尚未配置" });
    return;
  }

  const sourceUrl = getImageSource(readBody(req).sourceUrl);
  if (!sourceUrl) {
    sendJson(res, 400, { error: "只允许持久化 Pollinations 图片地址" });
    return;
  }

  const limit = getLimit();
  const usageKey = getUsageKey(req);
  const usage = await readUsage(usageKey);
  if (limit > 0 && usage.count >= limit) {
    sendJson(res, 429, {
      error: `今日图片保存次数已用完（每日 ${limit} 次）`,
      usage: { limit, used: usage.count, remaining: 0 },
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(sourceUrl, {
      headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      sendJson(res, 502, { error: "图片源暂时不可用" });
      return;
    }

    const contentType = getContentType(response);
    if (!contentType) {
      sendJson(res, 415, { error: "图片源返回了不支持的格式" });
      return;
    }

    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) {
      sendJson(res, 413, { error: "图片文件超过 8 MB 限制" });
      return;
    }

    const image = await readImage(response);
    if (image.length === 0) {
      sendJson(res, 413, { error: "图片文件为空" });
      return;
    }
    if (!hasImageSignature(contentType, image)) {
      sendJson(res, 415, { error: "图片文件格式校验失败" });
      return;
    }

    const stored = await put(
      getPathname(allowedContentTypes.get(contentType)!),
      image,
      {
        access: "public",
        contentType,
        cacheControlMaxAge: 60 * 60 * 24 * 30,
      },
    );
    const nextUsage = { count: usage.count + 1 };
    await writeUsage(usageKey, nextUsage);

    sendJson(res, 201, {
      url: stored.url,
      usage: {
        limit: limit || null,
        used: nextUsage.count,
        remaining: limit > 0 ? Math.max(0, limit - nextUsage.count) : null,
      },
    });
  } catch (error) {
    console.error("persist-image failed", error);
    sendJson(res, error instanceof ImageTooLargeError ? 413 : 502, {
      error:
        error instanceof ImageTooLargeError
          ? "图片文件超过 8 MB 限制"
          : "图片保存失败，请继续使用远程图片",
    });
  } finally {
    clearTimeout(timer);
  }
}
