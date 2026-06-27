/**
 * 下载所有预设角色的进化阶段头像到 public/presets/evolutions/
 *
 * 文件命名：preset_evolution_${name}_stage${1..3}.jpg
 * 运行时由 src/utils/evolutionPrefetch.ts 中的 resolveEvolutionAvatar
 *   通过 getPresetEvolutionLocalPath() 优先 probe 命中，绕过 Pollinations。
 *
 * 注意：本脚本与运行时的 seedSalt（rosterId:stage）不会一致，
 *   因此 URL/seed 与运行时缓存 key 不必匹配——只要文件存在并被 probe 命中即可。
 *
 * Prompt 拼接复刻 src/utils/towerProgress.ts:buildLocalEvolution + src/utils/ai.ts:generateEvolutionImage：
 *   1. basePrompt = char.imagePrompt
 *   2. imagePrompt = [basePrompt, "${name} ${suffix} evolution form",
 *                     "upgraded armor, radiant aura, stronger silhouette, cyberpunk anime portrait"]
 *                    .join(", ").slice(0, 240)
 *   3. cleaned = imagePrompt.replace(/\s+/g, " ").slice(0, 160)
 *   4. enriched = `${cleaned}, evolved game character portrait, same character upgraded form, centered upper body, clear silhouette, radiant aura, cyberpunk fantasy anime key art, no text, no UI, no screenshot`
 *
 * 用法：node scripts/download-preset-evolutions.mjs
 */
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const OUT_DIR = path.join(PUBLIC_DIR, "presets", "evolutions");

const WIDTH = 384;
const HEIGHT = 384;
const MODEL = "sana";
const REQUEST_INTERVAL_MS = 16_000;
const RATE_LIMIT_INTERVAL_MS = 45_000;
const MAX_ATTEMPTS = 3;
const MIN_IMAGE_BYTES = 1024;
const REQUEST_TIMEOUT_MS = 120_000;

// 与 src/data/presetCharacters.ts 中 imagePrompt 保持同步
const presetDefs = [
  {
    name: "唐三",
    imagePrompt:
      "Tang San from Soul Land, young warrior with blue silver grass aura, sea god trident, elegant white and blue robes, glowing cyan eyes, anime style",
  },
  {
    name: "超梦",
    imagePrompt:
      "Mewtwo, psychic Pokemon, purple and white feline humanoid, glowing purple eyes, telekinetic aura, futuristic lab background, anime style",
  },
  {
    name: "孙悟空",
    imagePrompt:
      "Sun Wukong the Monkey King, golden fur, fiery eyes, holding Ruyi Jingu Bang staff, red and gold armor, clouds under feet, anime style",
  },
  {
    name: "奥特曼",
    imagePrompt:
      "Ultraman, silver and red armored giant hero, glowing color timer, heroic pose, cosmic background, anime style",
  },
  {
    name: "卡卡西",
    imagePrompt:
      "Kakashi Hatake, silver spiky hair, mask covering lower face, sharingan eye glowing red, lightning chakra around hand, blue flak jacket, anime style",
  },
];

// 与 src/utils/towerProgress.ts 中 EVOLUTION_SUFFIX 保持一致
const EVOLUTION_SUFFIX = {
  1: "觉醒",
  2: "淬炼",
  3: "升华",
};

/** 复刻 buildLocalEvolution 的 imagePrompt 拼接 */
const buildEvolutionImagePrompt = (name, basePrompt, stage) => {
  const suffix = EVOLUTION_SUFFIX[stage];
  return [
    basePrompt,
    `${name} ${suffix} evolution form`,
    "upgraded armor, radiant aura, stronger silhouette, cyberpunk anime portrait",
  ]
    .join(", ")
    .slice(0, 240);
};

/** 复刻 generateEvolutionImage 的 enrich 逻辑 */
const enrichEvolutionPrompt = (imagePrompt) => {
  const cleaned = imagePrompt.replace(/\s+/g, " ").slice(0, 160);
  return `${cleaned}, evolved game character portrait, same character upgraded form, centered upper body, clear silhouette, radiant aura, cyberpunk fantasy anime key art, no text, no UI, no screenshot`;
};

/** 复刻 ai.ts hashSeed (FNV-1a 32-bit, mod 1e6) */
const hashSeed = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 1_000_000;
};

const buildEvolutionUrl = (name, basePrompt, stage) => {
  const imagePrompt = buildEvolutionImagePrompt(name, basePrompt, stage);
  const enriched = enrichEvolutionPrompt(imagePrompt);
  // 与运行时 seedSalt(rosterId:stage) 无关，使用 name:stage:s1 让脚本可重复
  const seed = hashSeed(`${name}:${stage}:s1`);
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(enriched)}`;
  const params = new URLSearchParams({
    width: String(WIDTH),
    height: String(HEIGHT),
    seed: String(seed),
    nologo: "true",
    model: MODEL,
  });
  return `${base}?${params.toString()}`;
};

const evolutionFilename = (name, stage) =>
  `preset_evolution_${name}_stage${stage}.jpg`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class DownloadError extends Error {
  constructor(message, { statusCode, retryAfterMs, rateLimited = false } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.retryAfterMs = retryAfterMs;
    this.rateLimited = rateLimited;
  }
}

const parseRetryAfterMs = (value) => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
};

const collectBodySnippet = (res) =>
  new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    res.on("data", (chunk) => {
      if (size < 1200) {
        chunks.push(chunk);
        size += chunk.length;
      }
    });
    res.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf8").slice(0, 300)),
    );
    res.on("error", () => resolve(""));
  });

const isImageBuffer = (buffer) => {
  if (buffer.length < 12) return false;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp =
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return isJpeg || isPng || isWebp;
};

const isValidImageFile = async (filePath) => {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size <= MIN_IMAGE_BYTES) return false;
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(12);
      await handle.read(buffer, 0, buffer.length, 0);
      return isImageBuffer(buffer);
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
};

const downloadToTemp = (url, tempPath, redirectCount = 0) =>
  new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new DownloadError(`Too many redirects for ${url}`));
      return;
    }

    const request = https.get(
      url,
      {
        headers: {
          Accept: "image/*,*/*;q=0.8",
          "User-Agent": "word-brawl-preset-evolutions-downloader/1.0",
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      async (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          try {
            const result = await downloadToTemp(
              nextUrl,
              tempPath,
              redirectCount + 1,
            );
            resolve(result);
          } catch (err) {
            reject(err);
          }
          return;
        }

        if (res.statusCode !== 200) {
          const body = await collectBodySnippet(res);
          const retryAfterMs = parseRetryAfterMs(res.headers["retry-after"]);
          const rateLimited =
            res.statusCode === 429 ||
            /queue full|too many requests|rate/i.test(body);
          reject(
            new DownloadError(
              `HTTP ${res.statusCode}${body ? `: ${body}` : ""}`,
              {
                statusCode: res.statusCode,
                retryAfterMs,
                rateLimited,
              },
            ),
          );
          return;
        }

        const contentType = String(res.headers["content-type"] || "");
        if (!contentType.startsWith("image/")) {
          const body = await collectBodySnippet(res);
          reject(
            new DownloadError(
              `Unexpected content-type ${contentType || "<empty>"}${body ? `: ${body}` : ""}`,
              {
                statusCode: res.statusCode,
                rateLimited: /queue full|too many requests|rate/i.test(body),
              },
            ),
          );
          return;
        }

        const stream = fsSync.createWriteStream(tempPath);
        res.pipe(stream);
        stream.on("finish", () => {
          stream.close(resolve);
        });
        stream.on("error", reject);
      },
    );

    request.on("timeout", () =>
      request.destroy(new DownloadError(`Timeout downloading ${url}`)),
    );
    request.on("error", reject);
  });

const download = async (url, destPath) => {
  const tempPath = `${destPath}.part-${process.pid}`;
  await fs.rm(tempPath, { force: true }).catch(() => undefined);
  try {
    await downloadToTemp(url, tempPath);
    if (!(await isValidImageFile(tempPath))) {
      throw new DownloadError("Downloaded file is not a valid image");
    }
    await fs.rename(tempPath, destPath);
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  }
};

const main = async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const tasks = [];
  for (const def of presetDefs) {
    for (let stage = 1; stage <= 3; stage++) {
      tasks.push({
        name: `${def.name} stage${stage}（${EVOLUTION_SUFFIX[stage]}）`,
        url: buildEvolutionUrl(def.name, def.imagePrompt, stage),
        dest: path.join(OUT_DIR, evolutionFilename(def.name, stage)),
        priority: stage, // 低阶段优先下载，确保 stage1 最先就绪
      });
    }
  }

  const pendingTasks = [];
  let skipCount = 0;
  for (const task of tasks) {
    if (await isValidImageFile(task.dest)) {
      skipCount++;
    } else {
      pendingTasks.push(task);
    }
  }

  pendingTasks.sort(
    (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
  );

  console.log(
    `预设进化图扫描完成：总计 ${tasks.length} 张，已存在 ${skipCount} 张，待下载 ${pendingTasks.length} 张。\n`,
  );

  let downloadCount = 0;
  let failCount = 0;
  const failedTasks = [];
  for (let i = 0; i < pendingTasks.length; i++) {
    const task = pendingTasks[i];
    const shortName = path.relative(PUBLIC_DIR, task.dest);

    let succeeded = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      process.stdout.write(
        `[${i + 1}/${pendingTasks.length}] ${shortName} 尝试 ${attempt}/${MAX_ATTEMPTS} ... `,
      );
      try {
        await download(task.url, task.dest);
        console.log("完成");
        downloadCount++;
        succeeded = true;
        if (i < pendingTasks.length - 1) await sleep(REQUEST_INTERVAL_MS);
        break;
      } catch (err) {
        const isLastAttempt = attempt === MAX_ATTEMPTS;
        console.log(`失败: ${err.message}`);
        if (isLastAttempt) break;

        const cooldownMs = err.rateLimited
          ? Math.max(err.retryAfterMs || 0, RATE_LIMIT_INTERVAL_MS)
          : REQUEST_INTERVAL_MS * attempt;
        console.log(`  等待 ${Math.round(cooldownMs / 1000)} 秒后重试...`);
        await sleep(cooldownMs);
      }
    }

    if (!succeeded) {
      failCount++;
      failedTasks.push(shortName);
    }
  }

  console.log(
    `\n下载完成：跳过 ${skipCount} 张，新下载 ${downloadCount} 张，失败 ${failCount} 张`,
  );
  if (failedTasks.length > 0) {
    console.log("失败列表（再次运行本脚本会自动重试这些条目）：");
    for (const item of failedTasks) console.log(`  - ${item}`);
    process.exit(1);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
