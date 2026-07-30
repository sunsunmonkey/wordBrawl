import { del, list } from "@vercel/blob";
import {
  getHeader,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from "./_shared.js";

const GENERATED_PREFIX = "generated-images/";
const RETENTION_DAYS = 30;
const MAX_PAGES_PER_RUN = 10;

const getCutoffDate = (): string => {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  return cutoff.toISOString().slice(0, 10);
};

const getPathDate = (pathname: string): string | null => {
  const match = pathname.match(/^generated-images\/(\d{4}-\d{2}-\d{2})\//);
  return match ? match[1] : null;
};

const isAuthorized = (req: ApiRequest): boolean => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return getHeader(req.headers, "authorization") === `Bearer ${secret}`;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    sendJson(res, 503, { error: "图片存储尚未配置" });
    return;
  }

  const cutoff = getCutoffDate();
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;
  let hasMore = false;

  try {
    for (let page = 0; page < MAX_PAGES_PER_RUN; page += 1) {
      const result = await list({
        prefix: GENERATED_PREFIX,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      });
      scanned += result.blobs.length;

      const expired = result.blobs
        .filter((blob) => {
          const createdOn = getPathDate(blob.pathname);
          return createdOn !== null && createdOn < cutoff;
        })
        .map((blob) => blob.url);
      if (expired.length > 0) {
        await del(expired);
        deleted += expired.length;
      }

      hasMore = result.hasMore;
      cursor = result.cursor;
      if (!hasMore || !cursor) break;
    }

    sendJson(res, 200, {
      ok: true,
      cutoff,
      scanned,
      deleted,
      hasMore,
    });
  } catch (error) {
    console.error("cleanup-generated-images failed", error);
    sendJson(res, 500, { error: "图片清理失败" });
  }
}
