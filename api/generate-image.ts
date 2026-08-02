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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "仅支持 POST 请求" });
  }

  const body = readBody(req);
  const prompt = String(body.prompt || "").trim().slice(0, MAX_PROMPT_LENGTH);
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
      55_000,
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

    const nextUsage = await consumeUsage(req);
    res.setHeader("Cache-Control", "no-store");
    return sendJson(res, 200, { imageUrl, usage: nextUsage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "硅基流动生图失败";
    return sendJson(res, 502, { error: message });
  }
}
