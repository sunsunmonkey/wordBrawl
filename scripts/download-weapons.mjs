/**
 * 下载所有武器图片到 public/presets/weapons/
 *
 * 用法：node scripts/download-weapons.mjs
 */
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const OUT_DIR = path.join(PUBLIC_DIR, 'presets', 'weapons');

const WEAPON_WIDTH = 512;
const WEAPON_HEIGHT = 512;
const MODEL = 'flux';

// 与 src/data/weapons.ts 中定义保持同步
const weaponDefs = [
  {
    id: 'cyan_flame_blade',
    seed: 10001,
    imagePrompt:
      'epic glowing cyan flame longsword, blue ethereal fire wrapping the blade, ornate silver hilt, dark void background, fantasy weapon concept art, anime key visual',
  },
  {
    id: 'dragon_scale_greatsword',
    seed: 10002,
    imagePrompt:
      'legendary massive greatsword covered in red dragon scales, glowing red runes on blade, fierce dragon head pommel, lava background, fantasy weapon art, anime key visual',
  },
  {
    id: 'tempest_sword',
    seed: 10003,
    imagePrompt:
      'elegant wind elemental longsword, swirling green wind currents around the blade, white feather decorations on hilt, sky background, fantasy weapon art, anime key visual',
  },
  {
    id: 'genesis_holy_sword',
    seed: 10004,
    imagePrompt:
      'mythic divine holy greatsword, radiant golden light beams, angelic wings on hilt, glowing celestial runes, heaven sky background, ultimate fantasy weapon, anime key visual',
  },
  {
    id: 'samurai_soul_katana',
    seed: 10005,
    imagePrompt:
      'sharp samurai katana with red lacquered scabbard, glowing crimson edge, sakura petals floating, traditional japanese aesthetic, dark moonlit background, fantasy weapon art, anime key visual',
  },
  {
    id: 'moonlight_blade',
    seed: 10006,
    imagePrompt:
      'curved scimitar blade reflecting moonlight, silver white glow, crescent moon engraving, midnight blue background, fantasy weapon art, anime key visual',
  },
  {
    id: 'frost_spear',
    seed: 10007,
    imagePrompt:
      'long spear with crystal ice tip, frosty mist trailing the shaft, blue glowing runes, frozen wasteland background, fantasy weapon art, anime key visual',
  },
  {
    id: 'holy_lance',
    seed: 10008,
    imagePrompt:
      'legendary holy lance with golden cross guard, radiant white light, angelic feathers attached, cathedral light rays background, fantasy weapon art, anime key visual',
  },
  {
    id: 'divine_trident',
    seed: 10009,
    imagePrompt:
      'mythic golden trident wielded by sea god, glowing blue ocean waves swirling, lightning sparks, deep sea background, ultimate fantasy weapon, anime key visual',
  },
  {
    id: 'phoenix_bow',
    seed: 10010,
    imagePrompt:
      'legendary phoenix bow made of red and gold flame feathers, glowing fire arrow nocked, burning sky background, fantasy weapon art, anime key visual',
  },
  {
    id: 'thousand_crossbow',
    seed: 10011,
    imagePrompt:
      'epic intricate mechanical repeating crossbow, brass gears and copper pipes, blue glowing energy core, steampunk style, dark workshop background, fantasy weapon art, anime key visual',
  },
  {
    id: 'thunder_war_hammer',
    seed: 10012,
    imagePrompt:
      'legendary warhammer crackling with golden lightning, runic engravings on the head, storm clouds and thunderbolts background, norse mythology style, fantasy weapon art, anime key visual',
  },
  {
    id: 'earthshaker_hammer',
    seed: 10013,
    imagePrompt:
      'epic massive stone hammer with earthen runes, cracked rock and dust particles around, brown leather wrapped grip, mountain background, fantasy weapon art, anime key visual',
  },
  {
    id: 'stellar_staff',
    seed: 10014,
    imagePrompt:
      'epic mage staff topped with a glowing miniature galaxy orb, purple cosmic energy swirling, silver runes on the shaft, starry space background, fantasy weapon art, anime key visual',
  },
  {
    id: 'eternal_night_staff',
    seed: 10015,
    imagePrompt:
      'legendary obsidian black mage staff with crescent moon and dark crystal, swirling purple shadow magic, gothic style, dark forest moonlit background, fantasy weapon art, anime key visual',
  },
  {
    id: 'shadow_twin_daggers',
    seed: 10016,
    imagePrompt:
      'epic pair of curved assassin daggers, black blades with purple shadow mist trailing, ornate silver guards, dark stealth atmosphere, fantasy weapon art, anime key visual',
  },
  {
    id: 'moonlight_dagger',
    seed: 10017,
    imagePrompt:
      'sleek silver dagger with moonlight glow, crescent moon engraving on blade, pale blue light, midnight background, fantasy weapon art, anime key visual',
  },
  {
    id: 'plasma_rifle',
    seed: 10018,
    imagePrompt:
      'epic futuristic plasma rifle with cyan glowing energy core, sleek black metal frame, neon blue lights, sci-fi cyberpunk style, dark tech background, weapon concept art',
  },
  {
    id: 'doom_revolver',
    seed: 10019,
    imagePrompt:
      'heavy old western revolver with skull engraving, golden bullets, weathered metal, smoke trailing, dramatic dark background, weapon concept art',
  },
  {
    id: 'quantum_cannon',
    seed: 10020,
    imagePrompt:
      'mythic massive quantum particle cannon, swirling antimatter energy core, holographic targeting projections, futuristic sci-fi laboratory background, ultimate weapon concept art',
  },
  {
    id: 'blood_moon_scythe',
    seed: 10021,
    imagePrompt:
      'mythic grim reaper scythe with crimson curved blade, dark purple shadow flame, blood moon background, gothic horror style, ultimate fantasy weapon art, anime key visual',
  },
  {
    id: 'wind_chakram',
    seed: 10022,
    imagePrompt:
      'circular spinning chakram blade with green wind streams, sharp edges, leather hand grip in center, sky background, fantasy weapon art, anime key visual',
  },
  {
    id: 'rusty_iron_sword',
    seed: 10023,
    imagePrompt:
      'simple rusty iron sword, worn leather grip, common adventurer weapon, plain stone background, fantasy weapon art',
  },
  {
    id: 'wooden_bow',
    seed: 10024,
    imagePrompt:
      'simple wooden hunter bow with linen string, plain arrow nocked, forest background, common weapon, fantasy weapon art',
  },
];

const buildWeaponUrl = (prompt, seed) => {
  const enriched = `${prompt}, isolated weapon, centered composition, high detail, dramatic lighting`;
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(enriched)}`;
  const params = new URLSearchParams({
    width: String(WEAPON_WIDTH),
    height: String(WEAPON_HEIGHT),
    seed: String(seed),
    nologo: 'true',
    model: MODEL,
  });
  return `${base}?${params.toString()}`;
};

const weaponFilename = (id) => `weapon_${id}.jpg`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const download = (url, destPath) =>
  new Promise((resolve, reject) => {
    const stream = fsSync.createWriteStream(destPath);
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'word-brawl-weapon-downloader/1.0',
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
  await fs.mkdir(OUT_DIR, { recursive: true });

  const tasks = weaponDefs.map((def) => ({
    name: def.id,
    url: buildWeaponUrl(def.imagePrompt, def.seed),
    dest: path.join(OUT_DIR, weaponFilename(def.id)),
  }));

  console.log(`准备下载 ${tasks.length} 张武器图片到 public/presets/weapons/ ...\n`);

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
