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
  write: (chunk: string | Buffer) => boolean;
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

const extractJsonObject = (raw: string): string | null => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return raw.slice(start, end + 1);
};

const normalizeJsonLikeText = (raw: string): string =>
  raw
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/，(?=\s*[\]}])/g, ",")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();

export const parseJsonLoose = (raw: string): unknown => {
  const cleaned = stripJsonFences(raw);
  const candidates = [
    cleaned,
    extractJsonObject(cleaned),
    normalizeJsonLikeText(cleaned),
    extractJsonObject(normalizeJsonLikeText(cleaned)),
  ].filter((candidate): candidate is string => Boolean(candidate));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? `：${lastError.message}` : "";
  throw new Error(`AI 返回的内容不是合法 JSON${detail}`);
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

/**
 * 初始化 NDJSON 流式响应。后续可通过 sendNdjsonLine 持续写入事件。
 * 调用方需要在写完所有事件后调用 res.end()。
 */
export const beginNdjsonStream = (
  res: ApiResponse,
  status = 200,
): ApiResponse => {
  res.status(status);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  return res;
};

/**
 * 向 NDJSON 流中写入一行 JSON 事件。自动追加换行符。
 */
export const sendNdjsonLine = (res: ApiResponse, payload: unknown): void => {
  res.write(`${JSON.stringify(payload)}\n`);
};

const unescapeJsonString = (raw: string): string => {
  let result = "";
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      switch (next) {
        case '"':
          result += '"';
          i += 2;
          break;
        case "\\":
          result += "\\";
          i += 2;
          break;
        case "/":
          result += "/";
          i += 2;
          break;
        case "b":
          result += "\b";
          i += 2;
          break;
        case "f":
          result += "\f";
          i += 2;
          break;
        case "n":
          result += "\n";
          i += 2;
          break;
        case "r":
          result += "\r";
          i += 2;
          break;
        case "t":
          result += "\t";
          i += 2;
          break;
        case "u": {
          const hex = raw.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            result += String.fromCharCode(parseInt(hex, 16));
            i += 6;
          } else {
            result += next;
            i += 2;
          }
          break;
        }
        default:
          result += next;
          i += 2;
      }
    } else {
      result += ch;
      i++;
    }
  }
  return result;
};

const escapeFieldName = (name: string): string =>
  name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 从尚未结束的 JSON 文本中尽力抽取某个字符串字段当前的值。
 */
export const extractPartialStringField = (
  raw: string,
  fieldName: string,
): string => {
  const re = new RegExp(
    `"${escapeFieldName(fieldName)}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`,
  );
  const match = raw.match(re);
  if (!match) return "";
  return unescapeJsonString(match[1]);
};

export const extractPartialStringFieldWithStatus = (
  raw: string,
  fieldName: string,
): { value: string; isComplete: boolean } => {
  const re = new RegExp(`"${escapeFieldName(fieldName)}"\\s*:\\s*"`);
  const match = raw.match(re);
  if (!match || match.index === undefined) {
    return { value: "", isComplete: false };
  }

  const start = match.index + match[0].length;
  let index = start;
  while (index < raw.length) {
    if (raw[index] === "\\") {
      index += 2;
      continue;
    }
    if (raw[index] === '"') {
      return {
        value: unescapeJsonString(raw.slice(start, index)),
        isComplete: true,
      };
    }
    index++;
  }

  return {
    value: unescapeJsonString(raw.slice(start)),
    isComplete: false,
  };
};

/**
 * 从尚未结束的 JSON 文本中尽力抽取某个数组字段里已经写出的对象。
 */
export const extractPartialArrayObjects = <T>(
  raw: string,
  fieldName: string,
  itemParser: (objContent: string, isComplete: boolean) => T | null,
): T[] => {
  const re = new RegExp(`"${escapeFieldName(fieldName)}"\\s*:\\s*\\[`);
  const startMatch = raw.match(re);
  if (!startMatch || startMatch.index === undefined) return [];

  const arrayStart = startMatch.index + startMatch[0].length;
  const items: T[] = [];
  let pos = arrayStart;

  while (pos < raw.length) {
    while (pos < raw.length && /[\s,]/.test(raw[pos])) pos++;
    if (pos >= raw.length) break;
    if (raw[pos] === "]") break;
    if (raw[pos] !== "{") break;

    let depth = 1;
    let objEnd = pos + 1;
    let isComplete = false;

    while (objEnd < raw.length) {
      const ch = raw[objEnd];
      if (ch === '"') {
        objEnd++;
        while (objEnd < raw.length) {
          if (raw[objEnd] === "\\") {
            objEnd += 2;
            continue;
          }
          if (raw[objEnd] === '"') break;
          objEnd++;
        }
        if (objEnd >= raw.length) break;
        objEnd++;
        continue;
      }
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          objEnd++;
          isComplete = true;
          break;
        }
      }
      objEnd++;
    }

    const objStr = raw.slice(pos, objEnd);
    const innerContent = objStr.replace(/^\{/, "").replace(/\}$/, "");
    const item = itemParser(innerContent, isComplete);
    if (item) items.push(item);

    pos = objEnd;
    if (!isComplete) break;
  }

  return items;
};

export const isJsonArrayFieldComplete = (
  raw: string,
  fieldName: string,
): boolean => {
  const re = new RegExp(`"${escapeFieldName(fieldName)}"\\s*:\\s*\\[`);
  const startMatch = raw.match(re);
  if (!startMatch || startMatch.index === undefined) return false;

  let depth = 1;
  let inString = false;
  let escaped = false;
  const arrayStart = startMatch.index + startMatch[0].length;

  for (let index = arrayStart; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return true;
    }
  }

  return false;
};

export const looksLikeJsonStart = (raw: string): boolean => {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "");
  return trimmed.startsWith("{");
};

export const isAiProtocolFragment = (raw: string): boolean => {
  const trimmed = raw.trim();
  return trimmed.length > 0 && /^[\s{}[\],:"'`]+$/.test(trimmed);
};

export const sanitizeAiDialogueText = (raw: string): string =>
  raw
    .trim()
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*(?:"\s*)?(?:}|[}\]][}\],\s]*})\s*,?\s*$/g, "")
    .trim();

export const looksLikeStructuredAiOutput = (raw: string): boolean => {
  const trimmed = raw.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "");
  return (
    isAiProtocolFragment(unfenced) ||
    /^```(?:json)?/i.test(trimmed) ||
    /^[{[]/.test(unfenced) ||
    /[{[]\s*(?:"|$)/.test(unfenced) ||
    /"(?:reply|turns|participantStates|storySummary|mood|bond)"\s*:/i.test(
      unfenced,
    ) ||
    /\bjson\b\s*[:：]/i.test(trimmed)
  );
};

export const getSafeAiField = (
  raw: string,
  fieldName: string,
  fallback: string,
  maxLength: number,
): string => {
  const fieldValue = sanitizeAiDialogueText(
    extractPartialStringField(raw, fieldName),
  );
  if (fieldValue && !looksLikeStructuredAiOutput(fieldValue)) {
    return fieldValue.slice(0, maxLength);
  }

  const text = sanitizeAiDialogueText(raw).slice(0, maxLength);
  return looksLikeStructuredAiOutput(text) ? fallback : text || fallback;
};

export const getSafeAiStreamField = (
  raw: string,
  fieldName: string,
  maxLength: number,
): string => {
  const fieldValue = sanitizeAiDialogueText(
    extractPartialStringField(raw, fieldName),
  );
  if (fieldValue && !looksLikeStructuredAiOutput(fieldValue)) {
    return fieldValue.slice(0, maxLength);
  }
  return looksLikeStructuredAiOutput(raw)
    ? ""
    : sanitizeAiDialogueText(raw).slice(0, maxLength);
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
