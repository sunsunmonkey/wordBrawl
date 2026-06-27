import { CharacterData, Skill } from '../store/useGameStore';
import type { RosterCharacter } from '../store/useRosterStore';
import { getTowerAscensionRank } from '../utils/towerProgress';

/**
 * 九层塔 Boss 配置：每个 Boss 的属性、技能与图片路径。
 *
 * 设计原则：
 * - AI 自动生成角色出厂硬上限 hp ≤ 900 / atk ≤ 140 / def ≤ 85 / spd ≤ 140；
 *   Boss 从 L4 开始有意突破上述上限，否则角色升满级后没怪可打。
 * - L9 数值远超 AI 顶配 + 满级 + 三阶进化，需要玩家围绕一名核心练满阵。
 */

export interface TowerBossDef {
  /** 1-9 */
  layer: number;
  name: string;
  /** 短描述，用于 UI */
  title: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  /** 部分高层 Boss 自带额外暴击率（与武器 critBonus 同义） */
  critBonus?: number;
  imagePrompt: string;
  avatarSeed: number;
  ultimateType: string;
  ultimateImagePrompt: string;
  skills: Skill[];
}

const avatarSlug = (layer: number): string => `L${layer}`;
const avatarFilename = (layer: number, name: string) => `tower_avatar_${avatarSlug(layer)}_${name}.jpg`;
const ultimateFilename = (layer: number, name: string) => `tower_ultimate_${avatarSlug(layer)}_${name}.jpg`;
const toLocalAvatarPath = (layer: number, name: string) => `/presets/tower/avatars/${avatarFilename(layer, name)}`;
const toLocalUltimatePath = (layer: number, name: string) =>
  `/presets/tower/ultimates/${ultimateFilename(layer, name)}`;

export const towerBossDefs: TowerBossDef[] = [
  {
    layer: 1,
    name: '守墓石像',
    title: '钝肉入门',
    hp: 720,
    attack: 95,
    defense: 55,
    speed: 35,
    avatarSeed: 9101,
    ultimateType: 'nature',
    imagePrompt:
      'ancient stone tomb guardian statue, mossy granite armor, glowing emerald runes on chest, towering silent sentinel, dark crypt background, anime style',
    ultimateImagePrompt:
      'stone guardian statue slamming earth, massive seismic shockwave, emerald moss vines erupting from cracks, dust storm, anime key visual',
    skills: [
      { name: '石锤重击', description: '挥下沉重石锤', damageMultiplier: 1.0, type: 'attack' },
      { name: '苔藓震荡', description: '震碎大地，迸出苔藓藤蔓', damageMultiplier: 1.9, type: 'attack' },
      {
        name: '守墓誓言',
        description: '凝聚守墓意志，防御暂时硬化',
        damageMultiplier: 0,
        type: 'buff',
        buffPercent: 50,
        buffTurns: 2,
      },
      {
        name: '远古封禁',
        description: '低语远古封印，削弱对手攻击',
        damageMultiplier: 0,
        type: 'debuff',
        buffPercent: 45,
        buffTurns: 2,
      },
      {
        name: '巨石坟葬',
        description: '召唤墓地巨石压顶，地表下沉',
        damageMultiplier: 5.5,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    layer: 2,
    name: '烈风游侠',
    title: '均衡神射',
    hp: 820,
    attack: 118,
    defense: 50,
    speed: 118,
    avatarSeed: 9202,
    ultimateType: 'lightning',
    imagePrompt:
      'storm wind ranger archer, billowing emerald cloak, electric arrows crackling, fast-moving silhouette, stormy plateau, anime style',
    ultimateImagePrompt:
      'wind ranger unleashing chain lightning arrow storm, sky filled with electric arrows, thunder rings, anime key visual',
    skills: [
      { name: '疾风箭', description: '迅捷射出一支疾风箭', damageMultiplier: 1.0, type: 'attack' },
      { name: '雷霆穿心', description: '雷光附着箭尖，直贯要害', damageMultiplier: 2.1, type: 'attack' },
      {
        name: '风之精准',
        description: '调息凝神，下一击攻击大幅提升',
        damageMultiplier: 0,
        type: 'buff',
        buffPercent: 60,
        buffTurns: 2,
      },
      {
        name: '迷雾游走',
        description: '化身风影迷惑对手，敌方速度短暂降低',
        damageMultiplier: 0,
        type: 'debuff',
        buffPercent: 50,
        buffTurns: 2,
      },
      {
        name: '万箭穿空·雷祭',
        description: '万箭齐发，每一支都引下天雷',
        damageMultiplier: 5.8,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    layer: 3,
    name: '毒沼巫女',
    title: 'debuff 消耗',
    hp: 880,
    attack: 132,
    defense: 48,
    speed: 102,
    avatarSeed: 9303,
    ultimateType: 'shadow',
    imagePrompt:
      'swamp witch priestess with violet poisonous mist, glowing purple eyes, bone serpent staff, toxic bog background, anime style',
    ultimateImagePrompt:
      'swamp witch summoning toxic shadow miasma engulfing battlefield, poison serpents wriggling, purple shadow blooms, anime key visual',
    skills: [
      { name: '腐蚀触手', description: '腐沼触手束缚对手', damageMultiplier: 1.0, type: 'attack' },
      { name: '剧毒爆破', description: '引爆体内毒囊', damageMultiplier: 2.3, type: 'attack' },
      {
        name: '巫蛊诅咒',
        description: '低吟诅咒削弱对手攻击',
        damageMultiplier: 0,
        type: 'debuff',
        buffPercent: 60,
        buffTurns: 3,
      },
      {
        name: '腐败回吸',
        description: '从毒沼吸取生机自疗',
        damageMultiplier: 0,
        type: 'heal',
        healPercent: 32,
      },
      {
        name: '万蛊归吞',
        description: '召唤千万毒蛇与亡魂吞噬战场',
        damageMultiplier: 6.0,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    layer: 4,
    name: '雷霆斗士',
    title: '高速暴击',
    hp: 980,
    attack: 155,
    defense: 70,
    speed: 138,
    avatarSeed: 9404,
    ultimateType: 'lightning',
    imagePrompt:
      'thunder gladiator with golden lightning gauntlets, crackling plasma armor, electric arc trails, coliseum storm background, anime style',
    ultimateImagePrompt:
      'thunder gladiator concentrating divine thunder into a single godlike fist, plasma sphere ready to erupt, anime key visual',
    skills: [
      { name: '雷霆直拳', description: '电光附拳一击穿透', damageMultiplier: 1.0, type: 'attack' },
      { name: '闪电连击', description: '快速三连闪电拳', damageMultiplier: 2.4, type: 'attack' },
      {
        name: '极速凝电',
        description: '电荷激增，攻击力暴涨',
        damageMultiplier: 0,
        type: 'buff',
        buffPercent: 75,
        buffTurns: 3,
      },
      {
        name: '电磁震慑',
        description: '电磁干扰使对方混乱',
        damageMultiplier: 0,
        type: 'debuff',
        buffPercent: 55,
        buffTurns: 2,
      },
      {
        name: '雷神最终一击',
        description: '凝聚所有电荷的雷神之拳',
        damageMultiplier: 6.2,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    layer: 5,
    name: '熔岩巨像',
    title: '重装坦克',
    hp: 1380,
    attack: 140,
    defense: 125,
    speed: 38,
    avatarSeed: 9505,
    ultimateType: 'fire',
    imagePrompt:
      'colossal lava golem with cracked magma armor, glowing orange core, towering volcanic giant, lava streams, anime style',
    ultimateImagePrompt:
      'lava colossus erupting volcano on battlefield, magma rain, fire tornado, scorched sky, anime key visual',
    skills: [
      { name: '熔岩拳', description: '炽热熔岩拳砸下', damageMultiplier: 1.0, type: 'attack' },
      { name: '岩浆裂地', description: '震开熔岩裂缝喷涌而出', damageMultiplier: 2.0, type: 'attack' },
      {
        name: '岩壁加固',
        description: '硬化外壳大幅提升防御',
        damageMultiplier: 0,
        type: 'buff',
        buffPercent: 70,
        buffTurns: 3,
      },
      {
        name: '熔岩自愈',
        description: '从核心吸取热能修复装甲',
        damageMultiplier: 0,
        type: 'heal',
        healPercent: 35,
      },
      {
        name: '末日喷发',
        description: '体内火山倾泻而出，焚尽战场',
        damageMultiplier: 6.0,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    layer: 6,
    name: '影刃双子',
    title: '极速刺客',
    hp: 1080,
    attack: 185,
    defense: 60,
    speed: 170,
    avatarSeed: 9606,
    ultimateType: 'shadow',
    imagePrompt:
      'twin shadow blade assassins back to back, crimson eyes, black mist cloaks, dual obsidian daggers, midnight rooftops, anime style',
    ultimateImagePrompt:
      'twin shadow assassins delivering thousand simultaneous crimson slash marks, black mist explosion engulfs entire frame, anime key visual',
    skills: [
      { name: '双影连斩', description: '左右双影同时出刀', damageMultiplier: 1.0, type: 'attack' },
      { name: '黑雾割喉', description: '隐入黑雾突袭要害', damageMultiplier: 2.7, type: 'attack' },
      {
        name: '影分身',
        description: '化分身扰乱视线，自身速度暴涨',
        damageMultiplier: 0,
        type: 'buff',
        buffPercent: 80,
        buffTurns: 2,
      },
      {
        name: '夺魄诀',
        description: '影刃透体而过，敌方防御暴跌',
        damageMultiplier: 0,
        type: 'debuff',
        buffPercent: 70,
        buffTurns: 2,
      },
      {
        name: '万影千斩',
        description: '双子在一瞬间斩出千刀',
        damageMultiplier: 6.8,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    layer: 7,
    name: '星陨术士',
    title: '玻璃大炮',
    hp: 980,
    attack: 215,
    defense: 55,
    speed: 150,
    critBonus: 18,
    avatarSeed: 9707,
    ultimateType: 'cosmic',
    imagePrompt:
      'star fall sorcerer wielding cosmic violet meteor, swirling galaxy cape, eyes filled with constellations, deep space arena, anime style',
    ultimateImagePrompt:
      'star fall sorcerer dropping cataclysmic meteor shower from cosmos, planet cracking impact, galaxy explosion, anime key visual',
    skills: [
      { name: '陨石碎击', description: '指尖唤来微型陨石', damageMultiplier: 1.0, type: 'attack' },
      { name: '虚空射线', description: '虚空中射出暗紫射线', damageMultiplier: 2.8, type: 'attack' },
      {
        name: '星辰共鸣',
        description: '调动星力，攻击力暴增',
        damageMultiplier: 0,
        type: 'buff',
        buffPercent: 90,
        buffTurns: 2,
      },
      {
        name: '坠星诅咒',
        description: '让陨石锁定敌方，使其防御坍缩',
        damageMultiplier: 0,
        type: 'debuff',
        buffPercent: 65,
        buffTurns: 2,
      },
      {
        name: '万星齐坠',
        description: '召唤天穹所有星辰齐落',
        damageMultiplier: 7.4,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    layer: 8,
    name: '龙骑神官',
    title: '全能战神',
    hp: 1560,
    attack: 205,
    defense: 140,
    speed: 145,
    critBonus: 12,
    avatarSeed: 9808,
    ultimateType: 'holy',
    imagePrompt:
      'dragon knight pontiff in radiant golden plate, holy dragon crest, spear of solar flames, cathedral skybox, anime style',
    ultimateImagePrompt:
      'dragon knight pontiff summoning celestial dragon of light spearing through heaven, holy sunburst, anime key visual',
    skills: [
      { name: '圣龙突刺', description: '圣光附枪一刺', damageMultiplier: 1.0, type: 'attack' },
      { name: '神威烙印', description: '神圣烙印贯穿敌阵', damageMultiplier: 2.6, type: 'attack' },
      {
        name: '圣龙圣盾',
        description: '展开圣盾，攻防双幅提升',
        damageMultiplier: 0,
        type: 'buff',
        buffPercent: 75,
        buffTurns: 3,
      },
      {
        name: '神谕治愈',
        description: '吟诵神谕大幅治愈自身',
        damageMultiplier: 0,
        type: 'heal',
        healPercent: 40,
      },
      {
        name: '神龙临世',
        description: '召唤神龙降临，圣光焚尽一切',
        damageMultiplier: 7.2,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    layer: 9,
    name: '虚空之主',
    title: '终极 BOSS',
    hp: 2100,
    attack: 260,
    defense: 170,
    speed: 190,
    critBonus: 25,
    avatarSeed: 9909,
    ultimateType: 'cosmic',
    imagePrompt:
      'void overlord, dark cosmic emperor floating in collapsed galaxy, six obsidian wings, eyes are dying stars, reality cracks behind, anime key visual',
    ultimateImagePrompt:
      'void overlord ripping spacetime apart, swallowing galaxies into black hole at his fingertip, universe collapse, anime key visual',
    skills: [
      { name: '虚空断罪', description: '虚空之指一抹划过', damageMultiplier: 1.0, type: 'attack' },
      { name: '坍缩烙刑', description: '凝缩黑洞砸落', damageMultiplier: 3.0, type: 'attack' },
      {
        name: '宇宙覆灭',
        description: '吞噬星辰之力，全属性暴涨',
        damageMultiplier: 0,
        type: 'buff',
        buffPercent: 95,
        buffTurns: 3,
      },
      {
        name: '熵增诅咒',
        description: '让对手陷入熵增，攻防双衰',
        damageMultiplier: 0,
        type: 'debuff',
        buffPercent: 80,
        buffTurns: 3,
      },
      {
        name: '终焉·虚空奇点',
        description: '在战场中心拉开奇点，宇宙在一瞬归零',
        damageMultiplier: 8.2,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
];

/** 把 TowerBossDef 转成战斗可用的 CharacterData。 */
const buildBoss = (def: TowerBossDef): CharacterData => {
  const skills: Skill[] = def.skills.map((s) => {
    if (s.isUltimate || s.type === 'ultimate') {
      return {
        ...s,
        ultimateType: def.ultimateType,
        imageUrl: toLocalUltimatePath(def.layer, def.name),
      };
    }
    return { ...s };
  });

  return {
    name: def.name,
    hp: def.hp,
    maxHp: def.hp,
    attack: def.attack,
    defense: def.defense,
    speed: def.speed,
    skills,
    imagePrompt: def.imagePrompt,
    imageUrl: toLocalAvatarPath(def.layer, def.name),
    ultimateCharge: 0,
    attackBuff: 0,
    defenseBuff: 0,
    buffTurnsLeft: 0,
    critBonus: def.critBonus,
    isPreset: true,
  };
};

/** 全部 9 层 Boss（运行时直接使用本地图片）。索引 0 = L1。 */
export const towerBosses: CharacterData[] = towerBossDefs.map(buildBoss);

const cloneCharacter = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const estimateRosterPower = (char: RosterCharacter): number => (
  char.maxHp * 0.12 +
  char.attack * 3.1 +
  char.defense * 2.3 +
  char.speed * 1.35 +
  char.level * 8
);

const scaleBoss = (boss: CharacterData, endlessLayer: number, challenger?: RosterCharacter): CharacterData => {
  const localLayer = ((Math.max(1, endlessLayer) - 1) % TOWER_TOTAL_LAYERS) + 1;
  const rank = getTowerAscensionRank(Math.max(1, endlessLayer));
  const roundMultiplier = 1 + (rank - 1) * 0.38;
  const layerMultiplier = 1 + (localLayer - 1) * 0.018;
  const challengerPower = challenger ? estimateRosterPower(challenger) : 0;
  const adaptiveMultiplier = challengerPower > 0
    ? Math.min(1.85 + (rank - 1) * 0.18, Math.max(1, challengerPower / 620))
    : 1;
  const multiplier = Math.max(roundMultiplier, adaptiveMultiplier) * layerMultiplier;
  const scaled = cloneCharacter(boss);
  scaled.name = rank > 1 ? `${boss.name} · ${rank}番` : boss.name;
  scaled.maxHp = Math.round(boss.maxHp * multiplier);
  scaled.hp = scaled.maxHp;
  scaled.attack = Math.round(boss.attack * Math.sqrt(multiplier) * (1 + (rank - 1) * 0.08));
  scaled.defense = Math.round(boss.defense * Math.sqrt(multiplier) * (1 + (rank - 1) * 0.06));
  scaled.speed = Math.round(boss.speed * (1 + (rank - 1) * 0.045));
  scaled.critBonus = Math.round((boss.critBonus || 0) + Math.max(0, rank - 1) * 3);
  return scaled;
};

/** 根据层号取 Boss（支持无尽累计层数；1-9 循环，番数提升强度） */
export const getTowerBoss = (layer: number): CharacterData | null => {
  if (layer < 1) return null;
  const index = (layer - 1) % towerBosses.length;
  return cloneCharacter(towerBosses[index]);
};

export const getScaledTowerBoss = (layer: number, challenger?: RosterCharacter): CharacterData | null => {
  const boss = getTowerBoss(layer);
  if (!boss) return null;
  return scaleBoss(boss, layer, challenger);
};

/** 取 Boss 标题/定位等元信息（UI 展示用） */
export const getTowerBossMeta = (layer: number): TowerBossDef | null => {
  if (layer < 1) return null;
  return towerBossDefs[(layer - 1) % towerBossDefs.length];
};

/** 总层数 */
export const TOWER_TOTAL_LAYERS = towerBossDefs.length;

const buildAvatarUrl = (prompt: string, seed: number): string => {
  const enriched = `${prompt}, neon cyberpunk character portrait, glowing rim light, dark background, anime style`;
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(enriched)}`;
  const params = new URLSearchParams({
    width: '384',
    height: '384',
    seed: String(seed),
    nologo: 'true',
    model: 'sana',
  });
  return `${base}?${params.toString()}`;
};

const hashStringToSeed = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % 1_000_000;
};

const buildUltimateUrl = (prompt: string): string => {
  const seed = hashStringToSeed(prompt);
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
  const params = new URLSearchParams({
    width: '640',
    height: '360',
    seed: String(seed),
    nologo: 'true',
    model: 'sana',
  });
  return `${base}?${params.toString()}`;
};

/** 供下载脚本使用：生成所有需要下载的远程 URL 与本地相对路径映射 */
export const getTowerBossImageDownloads = (): { url: string; filename: string; subdir: string }[] => {
  const downloads: { url: string; filename: string; subdir: string }[] = [];
  towerBossDefs.forEach((def) => {
    downloads.push({
      url: buildAvatarUrl(def.imagePrompt, def.avatarSeed),
      filename: avatarFilename(def.layer, def.name),
      subdir: 'tower/avatars',
    });
    downloads.push({
      url: buildUltimateUrl(def.ultimateImagePrompt),
      filename: ultimateFilename(def.layer, def.name),
      subdir: 'tower/ultimates',
    });
  });
  return downloads;
};
