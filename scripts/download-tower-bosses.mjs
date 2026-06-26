/**
 * 下载九层塔 Boss 图片到 public/presets/tower/
 * - 头像：public/presets/tower/avatars/
 * - 大招图：public/presets/tower/ultimates/
 *
 * 用法：node scripts/download-tower-bosses.mjs
 */
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const OUT_DIR = path.join(PUBLIC_DIR, 'presets', 'tower');

// 与 src/data/towerBosses.ts 中定义保持同步
const AVATAR_WIDTH = 384;
const AVATAR_HEIGHT = 384;
const TYPE_WIDTH = 640;
const TYPE_HEIGHT = 360;
const MODEL = 'sana';
const REQUEST_INTERVAL_MS = 16_000;
const RATE_LIMIT_INTERVAL_MS = 45_000;
const MAX_ATTEMPTS = 3;
const MIN_IMAGE_BYTES = 1024;
const REQUEST_TIMEOUT_MS = 120_000;

// 与 src/data/towerBosses.ts 中 towerBossDefs 同步
const towerBossDefs = [
  {
    layer: 1,
    name: '守墓石像',
    avatarSeed: 9101,
    imagePrompt:
      'ancient stone tomb guardian statue, mossy granite armor, glowing emerald runes on chest, towering silent sentinel, dark crypt background, anime style',
    ultimateImagePrompt:
      'stone guardian statue slamming earth, massive seismic shockwave, emerald moss vines erupting from cracks, dust storm, anime key visual',
  },
  {
    layer: 2,
    name: '烈风游侠',
    avatarSeed: 9202,
    imagePrompt:
      'storm wind ranger archer, billowing emerald cloak, electric arrows crackling, fast-moving silhouette, stormy plateau, anime style',
    ultimateImagePrompt:
      'wind ranger unleashing chain lightning arrow storm, sky filled with electric arrows, thunder rings, anime key visual',
  },
  {
    layer: 3,
    name: '毒沼巫女',
    avatarSeed: 9303,
    imagePrompt:
      'swamp witch priestess with violet poisonous mist, glowing purple eyes, bone serpent staff, toxic bog background, anime style',
    ultimateImagePrompt:
      'swamp witch summoning toxic shadow miasma engulfing battlefield, poison serpents wriggling, purple shadow blooms, anime key visual',
  },
  {
    layer: 4,
    name: '雷霆斗士',
    avatarSeed: 9404,
    imagePrompt:
      'thunder gladiator with golden lightning gauntlets, crackling plasma armor, electric arc trails, coliseum storm background, anime style',
    ultimateImagePrompt:
      'thunder gladiator concentrating divine thunder into a single godlike fist, plasma sphere ready to erupt, anime key visual',
  },
  {
    layer: 5,
    name: '熔岩巨像',
    avatarSeed: 9505,
    imagePrompt:
      'colossal lava golem with cracked magma armor, glowing orange core, towering volcanic giant, lava streams, anime style',
    ultimateImagePrompt:
      'lava colossus erupting volcano on battlefield, magma rain, fire tornado, scorched sky, anime key visual',
  },
  {
    layer: 6,
    name: '影刃双子',
    avatarSeed: 9606,
    imagePrompt:
      'twin shadow blade assassins back to back, crimson eyes, black mist cloaks, dual obsidian daggers, midnight rooftops, anime style',
    ultimateImagePrompt:
      'twin shadow assassins delivering thousand simultaneous crimson slash marks, black mist explosion engulfs entire frame, anime key visual',
  },
  {
    layer: 7,
    name: '星陨术士',
    avatarSeed: 9707,
    imagePrompt:
      'star fall sorcerer wielding cosmic violet meteor, swirling galaxy cape, eyes filled with constellations, deep space arena, anime style',
    ultimateImagePrompt:
      'star fall sorcerer dropping cataclysmic meteor shower from cosmos, planet cracking impact, galaxy explosion, anime key visual',
  },
  {
    layer: 8,
    name: '龙骑神官',
    avatarSeed: 9808,
    imagePrompt:
      'dragon knight pontiff in radiant golden plate, holy dragon crest, spear of solar flames, cathedral skybox, anime style',
    ultimateImagePrompt:
      'dragon knight pontiff summoning celestial dragon of light spearing through heaven, holy sunburst, anime key visual',
  },
  {
    layer: 9,
    name: '虚空之主',
    avatarSeed: 9909,
    imagePrompt:
      'void overlord, dark cosmic emperor floating in collapsed galaxy, six obsidian wings, eyes are dying stars, reality cracks behind, anime key visual',
    ultimateImagePrompt:
      'void overlord ripping spacetime apart, swallowing galaxies into black hole at his fingertip, universe collapse, anime key visual',
  },
];

const buildAvatarUrl = (prompt, seed) => {
  const enriched = `${prompt}, neon cyberpunk character portrait, glowing rim light, dark background, anime style`;
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(enriched)}`;
  const params = new URLSearchParams({
    width: String(AVATAR_WIDTH),
    height: String(AVATAR_HEIGHT),
    seed: String(seed),
    nologo: 'true',
    model: MODEL,
  });
  return `${base}?${params.toString()}`;
};

const buildUltimateUrl = (prompt) => {
  const seed = hashStringToSeed(prompt);
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
  const params = new URLSearchParams({
    width: String(TYPE_WIDTH),
    height: String(TYPE_HEIGHT),
    seed: String(seed),
    nologo: 'true',
    model: MODEL,
  });
  return `${base}?${params.toString()}`;
};

function hashStringToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % 1_000_000;
}

const avatarFilename = (layer, name) => `tower_avatar_L${layer}_${name}.jpg`;
const ultimateFilename = (layer, name) => `tower_ultimate_L${layer}_${name}.jpg`;

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
    res.on('data', (chunk) => {
      if (size < 1200) {
        chunks.push(chunk);
        size += chunk.length;
      }
    });
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8').slice(0, 300)));
    res.on('error', () => resolve(''));
  });

const isImageBuffer = (buffer) => {
  if (buffer.length < 12) return false;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return isJpeg || isPng || isWebp;
};

const isValidImageFile = async (filePath) => {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size <= MIN_IMAGE_BYTES) return false;
    const handle = await fs.open(filePath, 'r');
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
          Accept: 'image/*,*/*;q=0.8',
          'User-Agent': 'word-brawl-tower-downloader/1.0',
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      async (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          try {
            const result = await downloadToTemp(nextUrl, tempPath, redirectCount + 1);
            resolve(result);
          } catch (err) {
            reject(err);
          }
          return;
        }

        if (res.statusCode !== 200) {
          const body = await collectBodySnippet(res);
          const retryAfterMs = parseRetryAfterMs(res.headers['retry-after']);
          const rateLimited = res.statusCode === 429 || /queue full|too many requests|rate/i.test(body);
          reject(
            new DownloadError(`HTTP ${res.statusCode}${body ? `: ${body}` : ''}`, {
              statusCode: res.statusCode,
              retryAfterMs,
              rateLimited,
            }),
          );
          return;
        }

        const stream = fsSync.createWriteStream(tempPath);
        res.pipe(stream);
        stream.on('finish', () => {
          stream.close(resolve);
        });
        stream.on('error', reject);
      },
    );

    request.on('timeout', () => request.destroy(new DownloadError(`Timeout downloading ${url}`)));
    request.on('error', reject);
  });

const download = async (url, destPath) => {
  const tempPath = `${destPath}.part-${process.pid}`;
  await fs.rm(tempPath, { force: true }).catch(() => undefined);
  try {
    await downloadToTemp(url, tempPath);
    if (!(await isValidImageFile(tempPath))) {
      throw new DownloadError('Downloaded file is not a valid image');
    }
    await fs.rename(tempPath, destPath);
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  }
};

const main = async () => {
  await fs.mkdir(path.join(OUT_DIR, 'avatars'), { recursive: true });
  await fs.mkdir(path.join(OUT_DIR, 'ultimates'), { recursive: true });

  const tasks = [];
  for (const def of towerBossDefs) {
    tasks.push({
      name: `L${def.layer} ${def.name} 头像`,
      url: buildAvatarUrl(def.imagePrompt, def.avatarSeed),
      dest: path.join(OUT_DIR, 'avatars', avatarFilename(def.layer, def.name)),
      priority: def.layer,
    });
    tasks.push({
      name: `L${def.layer} ${def.name} 大招`,
      url: buildUltimateUrl(def.ultimateImagePrompt),
      dest: path.join(OUT_DIR, 'ultimates', ultimateFilename(def.layer, def.name)),
      priority: def.layer + 100,
    });
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

  pendingTasks.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  console.log(
    `九层塔图片扫描完成：总计 ${tasks.length} 张，已存在 ${skipCount} 张，待下载 ${pendingTasks.length} 张。\n`,
  );

  let downloadCount = 0;
  let failCount = 0;
  for (let i = 0; i < pendingTasks.length; i++) {
    const task = pendingTasks[i];
    const shortName = path.relative(PUBLIC_DIR, task.dest);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      process.stdout.write(`[${i + 1}/${pendingTasks.length}] ${shortName} 尝试 ${attempt}/${MAX_ATTEMPTS} ... `);
      try {
        await download(task.url, task.dest);
        console.log('完成');
        downloadCount++;
        if (i < pendingTasks.length - 1) await sleep(REQUEST_INTERVAL_MS);
        break;
      } catch (err) {
        const isLastAttempt = attempt === MAX_ATTEMPTS;
        console.log(`失败: ${err.message}`);
        if (isLastAttempt) {
          failCount++;
          break;
        }

        const cooldownMs = err.rateLimited
          ? Math.max(err.retryAfterMs || 0, RATE_LIMIT_INTERVAL_MS)
          : REQUEST_INTERVAL_MS * attempt;
        console.log(`  等待 ${Math.round(cooldownMs / 1000)} 秒后重试...`);
        await sleep(cooldownMs);
      }
    }
  }

  console.log(`\n下载完成：跳过 ${skipCount} 张，新下载 ${downloadCount} 张，失败 ${failCount} 张`);
  if (failCount > 0) process.exit(1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
