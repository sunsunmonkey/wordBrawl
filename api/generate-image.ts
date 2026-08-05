import {
  asRecord,
  consumeUsage,
  getUsageStatus,
  readBody,
  sendJson,
  setCorsHeaders,
  type ApiRequest,
  type ApiResponse,
} from "./_shared.js";

export const maxDuration = 60;

const SILICONFLOW_IMAGE_URL =
  "https://api.siliconflow.cn/v1/images/generations";
const MAX_PROMPT_LENGTH = 1_600;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const fetchWithTimeout = async (
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const getErrorMessage = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => "");
  return text.slice(0, 300) || `HTTP ${response.status}`;
};

const getImageUrl = (value: unknown): string => {
  const data = asRecord(value);
  const images = Array.isArray(data.images) ? data.images : [];
  const image = asRecord(images[0]);
  return typeof image.url === "string" ? image.url : "";
};

const detectImageContentType = (bytes: Buffer): string | null => {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes.subarray(1, 4).toString("ascii") === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
};

const downloadGeneratedImage = async (
  imageUrl: string,
): Promise<{ bytes: Buffer; contentType: string }> => {
  const response = await fetchWithTimeout(
    imageUrl,
    {
      headers: { Accept: "image/webp,image/png,image/jpeg,image/*" },
      cache: "no-store",
    },
    10_000,
  );
  if (!response.ok) {
    throw new Error(`生成图片下载失败：HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error("生成图片体积超过限制");
  }

  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(
      bytes.length === 0 ? "生成图片内容为空" : "生成图片体积超过限制",
    );
  }
  const detectedContentType = detectImageContentType(bytes);
  if (!detectedContentType) {
    throw new Error("生成结果不是有效图片");
  }
  return {
    bytes,
    contentType: contentType.startsWith("image/")
      ? contentType
      : detectedContentType,
  };
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "仅支持 POST 请求" });
  }

  const body = readBody(req);
  const prompt = String(body.prompt || "")
    .trim()
    .slice(0, MAX_PROMPT_LENGTH);
  if (!prompt) return sendJson(res, 400, { error: "缺少图片提示词" });

  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
  if (!apiKey) {
    return sendJson(res, 503, { error: "SILICONFLOW_API_KEY 未配置" });
  }

  const usage = await getUsageStatus(req);
  if (!usage.unlimited && usage.remaining === 0) {
    return sendJson(res, 429, {
      error: "今日生图试用次数已用完",
      usage,
    });
  }

  try {
    const response = await fetchWithTimeout(
      SILICONFLOW_IMAGE_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "Kwai-Kolors/Kolors",
          prompt,
          image_size: "1024x1024",
          batch_size: 1,
          num_inference_steps: 20,
          guidance_scale: 7.5,
          seed: Number.isFinite(Number(body.seed))
            ? Number(body.seed)
            : undefined,
        }),
      },
      48_000,
    );
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: `硅基流动生图失败：${await getErrorMessage(response)}`,
      });
    }

    const imageUrl = getImageUrl(await response.json());
    if (!imageUrl) {
      return sendJson(res, 502, { error: "硅基流动未返回图片地址" });
    }

    // SiliconFlow 返回的是短期签名 URL。必须在服务端立即下载图片本体，
    // 否则浏览器跨域缓存失败后会把过期 URL 写入本地存储。
    const image = await downloadGeneratedImage(imageUrl);
    const nextUsage = await consumeUsage(req);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Content-Length", String(image.bytes.length));
    res.setHeader(
      "X-Usage-Remaining",
      nextUsage.remaining === null ? "unlimited" : String(nextUsage.remaining),
    );
    res.status(200);
    res.write(image.bytes);
    return res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "硅基流动生图失败";
    return sendJson(res, 502, { error: message });
  }
}
