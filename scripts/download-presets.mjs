/**
 * 下载所有预设图片到 public/presets/
 * - 头像：public/presets/avatars/
 * - 兜底头像：public/presets/fallback-avatars/
 * - 大招类型图：public/presets/ultimates/types/
 *
 * 用法：node scripts/download-presets.mjs
 */
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const OUT_DIR = path.join(PUBLIC_DIR, 'presets');

// 与 src/data/presetCharacters.ts 中定义保持同步
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

const presetDefs = [
  {
    name: '唐三',
    avatarSeed: 707,
    imagePrompt: 'Tang San from Soul Land, young warrior with blue silver grass aura, sea god trident, elegant white and blue robes, glowing cyan eyes, anime style',
    ultimateImagePrompt: 'Tang San as Sea God wielding golden trident, golden blue wave rings, divine ocean energy explosion, anime key visual',
  },
  {
    name: '超梦',
    avatarSeed: 1414,
    imagePrompt: 'Mewtwo, psychic Pokemon, purple and white feline humanoid, glowing purple eyes, telekinetic aura, futuristic lab background, anime style',
    ultimateImagePrompt: 'Mewtwo unleashing psychic storm, purple telekinetic energy wave, reality distortion, futuristic lab destruction, anime key visual',
  },
  {
    name: '孙悟空',
    avatarSeed: 808,
    imagePrompt: 'Sun Wukong the Monkey King, golden fur, fiery eyes, holding Ruyi Jingu Bang staff, red and gold armor, clouds under feet, anime style',
    ultimateImagePrompt: 'Sun Wukong giant form holding massive Ruyi Jingu Bang, golden fire aura, clouds breaking apart, mountain shattering, anime key visual',
  },
  {
    name: '奥特曼',
    avatarSeed: 909,
    imagePrompt: 'Ultraman, silver and red armored giant hero, glowing color timer, heroic pose, cosmic background, anime style',
    ultimateImagePrompt: 'Ultraman firing brilliant silver blue spacium beam, glowing heroic pose, cosmic light explosion, anime key visual',
  },
  {
    name: '卡卡西',
    avatarSeed: 1313,
    imagePrompt: 'Kakashi Hatake, silver spiky hair, mask covering lower face, sharingan eye glowing red, lightning chakra around hand, blue flak jacket, anime style',
    ultimateImagePrompt: 'Kakashi using Kamui and Chidori, red sharingan spiral, lightning tearing through distorted space, anime key visual',
  },
];

const ultimateTypes = [
  {
    id: 'fire',
    imagePrompt:
      'inferno hellfire ultimate skill, massive fire tornado, burning apocalyptic sky, explosive flames, anime key visual',
  },
  {
    id: 'ice',
    imagePrompt:
      'absolute zero ice blast ultimate skill, massive crystal ice shards explosion, frozen blue wasteland, anime key visual',
  },
  {
    id: 'shadow',
    imagePrompt:
      'shadow void ultimate skill, thousand dark blades slashing, crimson slash marks, dark energy explosion, anime key visual',
  },
  {
    id: 'lightning',
    imagePrompt:
      'lightning storm ultimate skill, massive thunderbolt striking, electric energy explosion, stormy sky, anime key visual',
  },
  {
    id: 'cosmic',
    imagePrompt:
      'cosmic ultimate skill, big bang explosion, galaxies and stars swirling, purple blue cosmic energy, anime key visual',
  },
  {
    id: 'nature',
    imagePrompt:
      'nature ultimate skill, giant ancient tree awakening, poisonous vines explosion, green life energy surge, anime key visual',
  },
  {
    id: 'mecha',
    imagePrompt:
      'mecha ultimate skill, giant robot firing all weapons, massive explosion destruction, fire smoke plasma, warzone, anime key visual',
  },
  {
    id: 'holy',
    imagePrompt:
      'holy light ultimate skill, angelic judgment beam, golden sacred sword falling from sky, radiant explosion, anime key visual',
  },
];

const fallbackAvatarDefs = [
  {
    id: 'holy_guardian',
    seed: 2201,
    imagePrompt:
      'original celestial gate guardian, sacred armor, glowing golden visor, giant light shield, cyber fantasy anime character portrait',
  },
  {
    id: 'shadow_blade',
    seed: 2202,
    imagePrompt:
      'original shadow blade duelist, black cloak, crimson glowing eyes, twin daggers, dark neon alley, anime character portrait',
  },
  {
    id: 'fire_champion',
    seed: 2203,
    imagePrompt:
      'original fire champion warrior, ember crown, molten armor, phoenix flame aura, intense anime character portrait',
  },
  {
    id: 'ice_titan',
    seed: 2204,
    imagePrompt:
      'original frost titan defender, crystal ice armor, massive frozen pauldrons, blue aura, anime character portrait',
  },
  {
    id: 'mecha_sentinel',
    seed: 2205,
    imagePrompt:
      'original mecha sentinel pilot, red sensor eyes, heavy futuristic helmet, plasma core, cyberpunk anime character portrait',
  },
  {
    id: 'cosmic_oracle',
    seed: 2206,
    imagePrompt:
      'original cosmic oracle mage, star cloak, galaxy halo, glowing runes, purple nebula background, anime character portrait',
  },
  {
    id: 'nature_ranger',
    seed: 2207,
    imagePrompt:
      'original nature ranger guardian, emerald hood, living vine armor, glowing forest spirit energy, anime character portrait',
  },
  {
    id: 'lightning_knight',
    seed: 2208,
    imagePrompt:
      'original lightning knight striker, electric blue armor, thunder spear, storm aura, dynamic anime character portrait',
  },
  {
    id: 'immortal_superhero',
    seed: 2209,
    imagePrompt:
      'original immortal superhero sage, celestial white and gold battle robes, long flowing hair, glowing third eye, divine aura, xianxia anime character portrait',
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

const buildFallbackAvatarUrl = (prompt, seed) => {
  const enriched = `${prompt}, centered bust, sharp face detail, dark clean background, game avatar, no text`;
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

const buildTypeUrl = (prompt) => {
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

const avatarFilename = (name) => `preset_avatar_${name}.jpg`;
const fallbackAvatarFilename = (id) => `fallback_avatar_${id}.jpg`;
const ultimateFilename = (name) => `preset_ultimate_${name}.jpg`;

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
  const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
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
          'User-Agent': 'word-brawl-preset-downloader/1.0',
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
          reject(new DownloadError(`HTTP ${res.statusCode}${body ? `: ${body}` : ''}`, {
            statusCode: res.statusCode,
            retryAfterMs,
            rateLimited,
          }));
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
  await fs.mkdir(path.join(OUT_DIR, 'fallback-avatars'), { recursive: true });
  await fs.mkdir(path.join(OUT_DIR, 'ultimates', 'types'), { recursive: true });
  await fs.mkdir(path.join(OUT_DIR, 'ultimates', 'characters'), { recursive: true });

  const tasks = [];
  for (const def of presetDefs) {
    tasks.push({
      name: `${def.name} 头像`,
      url: buildAvatarUrl(def.imagePrompt, def.avatarSeed),
      dest: path.join(OUT_DIR, 'avatars', avatarFilename(def.name)),
      priority: 20,
    });
    tasks.push({
      name: `${def.name} 大招`,
      url: buildTypeUrl(def.ultimateImagePrompt),
      dest: path.join(OUT_DIR, 'ultimates', 'characters', ultimateFilename(def.name)),
      priority: 30,
    });
  }
  for (const type of ultimateTypes) {
    tasks.push({
      name: `大招类型 ${type.id}`,
      url: buildTypeUrl(type.imagePrompt),
      dest: path.join(OUT_DIR, 'ultimates', 'types', `${type.id}.jpg`),
      priority: 40,
    });
  }
  for (const def of fallbackAvatarDefs) {
    tasks.push({
      name: `兜底头像 ${def.id}`,
      url: buildFallbackAvatarUrl(def.imagePrompt, def.seed),
      dest: path.join(OUT_DIR, 'fallback-avatars', fallbackAvatarFilename(def.id)),
      priority: 10,
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

  console.log(`预设图片扫描完成：总计 ${tasks.length} 张，已存在 ${skipCount} 张，待下载 ${pendingTasks.length} 张。\n`);

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
