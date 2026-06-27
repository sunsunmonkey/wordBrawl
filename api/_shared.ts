import { getCache } from "@vercel/functions";
import { createHash } from "node:crypto";

export type UsageRecord = {
  count: number;
  date: string;
};

export type HeaderValue = string | string[] | undefined;

export type ApiRequest = {
  method?: string;
  headers?: Record<string, HeaderValue>;
  body?: unknown;
  socket?: {
    remoteAddress?: string;
  };
};

export type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
};

const memoryUsage = new Map<string, UsageRecord>();

export const asRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
};

export const stripJsonFences = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
};

export const clamp = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
};

export const clampNumber = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

export const getHeader = (
  headers: Record<string, HeaderValue> | undefined,
  name: string,
): string | undefined => {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
};

const getLimit = (): number => {
  const raw =
    process.env.FREE_DAILY_LIMIT ?? process.env.DAILY_FREE_LIMIT ?? "20";
  const limit = Number(raw);
  if (!Number.isFinite(limit)) return 20;
  return Math.max(0, Math.floor(limit));
};

const getDayKey = (): string => {
  const timezone = process.env.FREE_USAGE_TIMEZONE || "Asia/Shanghai";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

const getClientKey = (req: ApiRequest): string => {
  const forwardedFor = String(getHeader(req.headers, "x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  const raw =
    forwardedFor ||
    getHeader(req.headers, "x-real-ip") ||
    req.socket?.remoteAddress ||
    "anonymous";
  const salt =
    process.env.USAGE_HASH_SALT ||
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "word-brawl";
  return createHash("sha256")
    .update(`${salt}:${raw}`)
    .digest("hex")
    .slice(0, 32);
};

const getUsageKey = (req: ApiRequest): string =>
  `usage:${getDayKey()}:${getClientKey(req)}`;

const readUsage = async (key: string): Promise<UsageRecord> => {
  const fallback = { count: 0, date: getDayKey() };
  try {
    const cached = await getCache({ namespace: "word-brawl" }).get(key);
    if (
      cached &&
      typeof cached === "object" &&
      "count" in cached &&
      "date" in cached &&
      typeof cached.count === "number" &&
      typeof cached.date === "string"
    ) {
      const record = cached as UsageRecord;
      return { count: record.count, date: record.date };
    }
    return fallback;
  } catch {
    return memoryUsage.get(key) || fallback;
  }
};

const writeUsage = async (key: string, record: UsageRecord): Promise<void> => {
  try {
    await getCache({ namespace: "word-brawl" }).set(key, record, {
      ttl: 60 * 60 * 36,
      tags: ["word-brawl-usage"],
    });
    return;
  } catch {
    memoryUsage.set(key, record);
  }
};

export const getUsageStatus = async (req: ApiRequest) => {
  const limit = getLimit();
  if (limit === 0) {
    return { limit, used: 0, remaining: null, unlimited: true };
  }

  const usage = await readUsage(getUsageKey(req));
  return {
    limit,
    used: usage.count,
    remaining: Math.max(0, limit - usage.count),
    unlimited: false,
  };
};

export const consumeUsage = async (req: ApiRequest) => {
  const limit = getLimit();
  if (limit === 0) {
    return { limit, used: 0, remaining: null, unlimited: true };
  }

  const key = getUsageKey(req);
  const usage = await readUsage(key);
  const next = { count: usage.count + 1, date: getDayKey() };
  await writeUsage(key, next);

  return {
    limit,
    used: next.count,
    remaining: Math.max(0, limit - next.count),
    unlimited: false,
  };
};

export const readBody = (req: ApiRequest): Record<string, unknown> => {
  if (typeof req.body === "string") {
    try {
      return asRecord(JSON.parse(req.body));
    } catch {
      return {};
    }
  }
  return asRecord(req.body);
};

export const setCorsHeaders = (req: ApiRequest, res: ApiResponse) => {
  const origin = getHeader(req.headers, "origin");
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if (allowedOrigin && origin === allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  } else if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === getHeader(req.headers, "host")) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
    } catch {
      // Ignore invalid Origin headers.
    }
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

export const sendJson = (res: ApiResponse, status: number, body: unknown) => {
  res.status(status).json(body);
};

export const getAiCredentials = () => {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (
    process.env.AI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const model =
    process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  return { apiKey, baseUrl, model };
};
