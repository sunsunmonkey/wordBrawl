import { isPollinationsUrl } from "./pollinationsQueue";

type PersistImageResponse = {
  url?: string;
};

/**
 * 将运行时生成的 Pollinations 图片转存到项目自己的 Blob 存储。
 * 后端不可用、达到额度或转存失败时保留原始 URL，不能阻断角色生成流程。
 */
export const persistGeneratedImage = async (
  url?: string,
): Promise<string | undefined> => {
  if (!url || url.startsWith("data:") || !isPollinationsUrl(url)) {
    return url;
  }

  try {
    const response = await fetch("/api/persist-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUrl: url }),
    });
    if (!response.ok) return url;

    const payload = (await response.json()) as PersistImageResponse;
    return typeof payload.url === "string" && payload.url ? payload.url : url;
  } catch {
    return url;
  }
};
