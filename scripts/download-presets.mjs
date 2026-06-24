/**
 * 下载所有预设图片到 public/presets/
 * - 头像：public/presets/avatars/
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
const MODEL = 'flux';

const presetDefs = [
  {
    name: '赛博武士',
    avatarSeed: 101,
    imagePrompt: 'cyberpunk samurai with neon cyan katana, glowing oni mask, futuristic armor',
    ultimateImagePrompt: 'cyberpunk samurai unleashing amaterasu cyan flame katana slash, thousand blade reflections, dark void, anime key visual',
  },
  {
    name: '星辰法师',
    avatarSeed: 202,
    imagePrompt: 'cosmic mage with starry purple cloak, glowing galaxy energy in hands, arcane symbols',
    ultimateImagePrompt: 'cosmic mage creating big bang explosion, galaxies and stars swirling, purple blue stellar energy, anime key visual',
  },
  {
    name: '机械暴君',
    avatarSeed: 303,
    imagePrompt: 'giant mecha robot with heavy dark armor, red glowing eyes, industrial cyberpunk design',
    ultimateImagePrompt: 'giant mecha robot firing all weapons, missile swarm, plasma cannons, city destruction, warzone, anime key visual',
  },
  {
    name: '暗影刺客',
    avatarSeed: 404,
    imagePrompt: 'dark ninja assassin with glowing red eyes, black shadow cloak, dual glowing daggers',
    ultimateImagePrompt: 'dark ninja assassin creating thousand shadow blade slashes, crimson slash marks, black mist explosion, anime key visual',
  },
  {
    name: '烈焰女王',
    avatarSeed: 505,
    imagePrompt: 'fire queen with crown of flames, flowing red and orange hair, blazing dress, golden eyes',
    ultimateImagePrompt: 'fire queen summoning inferno apocalypse, phoenix wings spread, lava erupting, burning sky, anime key visual',
  },
  {
    name: '冰霜巨人',
    avatarSeed: 606,
    imagePrompt: 'ice giant warrior with crystal blue armor, frozen massive hammer, glowing frost aura',
    ultimateImagePrompt: 'ice giant warrior unleashing absolute zero blast, massive crystal ice shards explosion, frozen blue wasteland, anime key visual',
  },
  {
    name: '唐三',
    avatarSeed: 707,
    imagePrompt: 'Tang San from Soul Land, young warrior with blue silver grass aura, sea god trident, elegant white and blue robes, glowing cyan eyes, anime style',
    ultimateImagePrompt: 'Tang San as Sea God wielding golden trident, golden blue wave rings, divine ocean energy explosion, anime key visual',
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
    name: '钢铁侠',
    avatarSeed: 1010,
    imagePrompt: 'Iron Man in advanced red and gold nanotech armor, arc reactor glowing, repulsor hands, flying pose, dark tech background, anime style',
    ultimateImagePrompt: 'Iron Man Hulkbuster armor unleashing all weapons, red gold missiles and repulsors, massive explosion, warzone, anime key visual',
  },
  {
    name: '梅西',
    avatarSeed: 1111,
    imagePrompt: 'Lionel Messi as an anime champion, wearing Argentina blue and white striped jersey, golden football aura, dribbling pose, stadium lights, anime style',
    ultimateImagePrompt: 'Lionel Messi scoring legendary goal on green football field, golden ball trail, stadium lights explosion, anime key visual',
  },
  {
    name: 'C罗',
    avatarSeed: 1212,
    imagePrompt: 'Cristiano Ronaldo as an anime ace, Portugal red and green jersey, muscular physique, mid-air bicycle kick pose, golden energy, stadium background, anime style',
    ultimateImagePrompt: 'Cristiano Ronaldo bicycle kick mid air, golden lightning trail, roaring stadium crowd, anime key visual',
  },
  {
    name: '卡卡西',
    avatarSeed: 1313,
    imagePrompt: 'Kakashi Hatake, silver spiky hair, mask covering lower face, sharingan eye glowing red, lightning chakra around hand, blue flak jacket, anime style',
    ultimateImagePrompt: 'Kakashi using Kamui and Chidori, red sharingan spiral, lightning tearing through distorted space, anime key visual',
  },
  {
    name: '超梦',
    avatarSeed: 1414,
    imagePrompt: 'Mewtwo, psychic Pokemon, purple and white feline humanoid, glowing purple eyes, telekinetic aura, futuristic lab background, anime style',
    ultimateImagePrompt: 'Mewtwo unleashing psychic storm, purple telekinetic energy wave, reality distortion, futuristic lab destruction, anime key visual',
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
const ultimateFilename = (name) => `preset_ultimate_${name}.jpg`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const download = (url, destPath) =>
  new Promise((resolve, reject) => {
    const stream = fsSync.createWriteStream(destPath);
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'word-brawl-preset-downloader/1.0',
          },
          timeout: 120000,
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            stream.close();
            return download(res.headers.location, destPath).then(resolve, reject);
          }
          if (res.statusCode !== 200) {
            stream.close();
            return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
          res.pipe(stream);
          stream.on('finish', () => {
            stream.close();
            resolve();
          });
          stream.on('error', reject);
        },
      )
      .on('error', reject)
      .on('timeout', () => reject(new Error(`Timeout downloading ${url}`)));
  });

const main = async () => {
  await fs.mkdir(path.join(OUT_DIR, 'avatars'), { recursive: true });
  await fs.mkdir(path.join(OUT_DIR, 'ultimates', 'types'), { recursive: true });
  await fs.mkdir(path.join(OUT_DIR, 'ultimates', 'characters'), { recursive: true });

  const tasks = [];
  for (const def of presetDefs) {
    tasks.push({
      name: `${def.name} 头像`,
      url: buildAvatarUrl(def.imagePrompt, def.avatarSeed),
      dest: path.join(OUT_DIR, 'avatars', avatarFilename(def.name)),
    });
    tasks.push({
      name: `${def.name} 大招`,
      url: buildTypeUrl(def.ultimateImagePrompt),
      dest: path.join(OUT_DIR, 'ultimates', 'characters', ultimateFilename(def.name)),
    });
  }
  for (const type of ultimateTypes) {
    tasks.push({
      name: `大招类型 ${type.id}`,
      url: buildTypeUrl(type.imagePrompt),
      dest: path.join(OUT_DIR, 'ultimates', 'types', `${type.id}.jpg`),
    });
  }

  console.log(`准备下载 ${tasks.length} 张预设图片到 public/presets/ ...\n`);

  let successCount = 0;
  let failCount = 0;
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const shortName = path.relative(PUBLIC_DIR, task.dest);
    process.stdout.write(`[${i + 1}/${tasks.length}] ${shortName} ... `);
    try {
      const exists = await fs.access(task.dest).then(() => true).catch(() => false);
      if (exists) {
        const stat = await fs.stat(task.dest);
        if (stat.size > 1024) {
          console.log('已存在，跳过');
          successCount++;
          continue;
        }
      }
      await download(task.url, task.dest);
      console.log('完成');
      successCount++;
    } catch (err) {
      console.log(`失败: ${err.message}`);
      failCount++;
    }
    // pollinations 限流，请求间隔 1.5 秒
    if (i < tasks.length - 1) await sleep(1500);
  }

  console.log(`\n下载完成：成功 ${successCount} 张，失败 ${failCount} 张`);
  if (failCount > 0) process.exit(1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
