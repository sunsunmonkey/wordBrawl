import { CharacterData, Skill } from '../store/useGameStore';
import { ULTIMATE_TYPES, getUltimateTypeById } from './ultimateTypes';

/**
 * 构造 pollinations 头像 URL（与 ai.ts 中逻辑保持一致，但使用固定 seed 保证预设角色头像稳定）
 * 仅用于 scripts/download-presets.js 拉取图片；运行时直接使用 /presets/ 下本地图片。
 */
export const buildAvatarUrl = (prompt: string, seed: number, model = 'flux'): string => {
  const enriched = `${prompt}, neon cyberpunk character portrait, glowing rim light, dark background, anime style`;
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(enriched)}`;
  const params = new URLSearchParams({
    width: '384',
    height: '384',
    seed: String(seed),
    nologo: 'true',
    model,
  });
  return `${base}?${params.toString()}`;
};

interface PresetCharacterDef {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  imagePrompt: string;
  avatarSeed: number;
  /** 大招视觉类型 ID */
  ultimateType: string;
  skills: Skill[];
}

const presetDefs: PresetCharacterDef[] = [
  {
    name: '赛博武士',
    hp: 280,
    attack: 30,
    defense: 18,
    speed: 65,
    imagePrompt: 'cyberpunk samurai with neon cyan katana, glowing oni mask, futuristic armor',
    avatarSeed: 101,
    ultimateType: 'shadow',
    skills: [
      { name: '拔刀斩', description: '快速拔刀的一击，刀光如电', damageMultiplier: 1.0, type: 'attack' },
      { name: '居合·烈', description: '居合术的极致，一瞬间的拔刀重斩', damageMultiplier: 1.6, type: 'attack' },
      { name: '武士道精神', description: '凝聚战意，提升攻击力', damageMultiplier: 0, type: 'buff', buffPercent: 35, buffTurns: 3 },
      { name: '残影步', description: '留下残影迷惑对手，降低其攻击', damageMultiplier: 0, type: 'debuff', buffPercent: 30, buffTurns: 2 },
      {
        name: '天照·一闪',
        description: '刀刃划破虚空，释放天照之炎的一闪，整个战场被青色刀光吞没',
        damageMultiplier: 3.2,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    name: '星辰法师',
    hp: 180,
    attack: 42,
    defense: 8,
    speed: 55,
    imagePrompt: 'cosmic mage with starry purple cloak, glowing galaxy energy in hands, arcane symbols',
    avatarSeed: 202,
    ultimateType: 'cosmic',
    skills: [
      { name: '星辰术', description: '凝聚星光化为法弹', damageMultiplier: 1.0, type: 'attack' },
      { name: '超新星', description: '引爆恒星碎屑', damageMultiplier: 1.7, type: 'attack' },
      { name: '时空回溯', description: '扭曲时间恢复生命', damageMultiplier: 0, type: 'heal', healPercent: 28 },
      { name: '黑洞引力', description: '召唤微型黑洞削弱对手', damageMultiplier: 0, type: 'debuff', buffPercent: 35, buffTurns: 3 },
      {
        name: '宇宙大爆炸',
        description: '释放创世级别的能量，星辰陨落，星系崩塌，整个宇宙在指尖重启',
        damageMultiplier: 3.8,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    name: '机械暴君',
    hp: 450,
    attack: 22,
    defense: 28,
    speed: 25,
    imagePrompt: 'giant mecha robot with heavy dark armor, red glowing eyes, industrial cyberpunk design',
    avatarSeed: 303,
    ultimateType: 'mecha',
    skills: [
      { name: '液压重拳', description: '机械臂重击', damageMultiplier: 1.0, type: 'attack' },
      { name: '等离子炮', description: '发射等离子能量束', damageMultiplier: 1.5, type: 'attack' },
      { name: '纳米修复', description: '纳米机器人修复装甲', damageMultiplier: 0, type: 'heal', healPercent: 32 },
      { name: 'EMP脉冲', description: '释放电磁脉冲瘫痪对手', damageMultiplier: 0, type: 'debuff', buffPercent: 40, buffTurns: 2 },
      {
        name: '终极毁灭程序',
        description: '启动毁灭协议，全身武器系统全开，将一切化为废铁',
        damageMultiplier: 2.8,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    name: '暗影刺客',
    hp: 160,
    attack: 38,
    defense: 10,
    speed: 90,
    imagePrompt: 'dark ninja assassin with glowing red eyes, black shadow cloak, dual glowing daggers',
    avatarSeed: 404,
    ultimateType: 'shadow',
    skills: [
      { name: '暗影刃', description: '淬毒匕首突刺', damageMultiplier: 1.0, type: 'attack' },
      { name: '致命背刺', description: '绕后背刺要害', damageMultiplier: 1.8, type: 'attack' },
      { name: '隐身术', description: '融入暗影提升攻击', damageMultiplier: 0, type: 'buff', buffPercent: 45, buffTurns: 2 },
      { name: '毒雾', description: '释放毒雾削弱对手', damageMultiplier: 0, type: 'debuff', buffPercent: 25, buffTurns: 3 },
      {
        name: '千刃杀',
        description: '化作千万道残影，从四面八方同时发出致命一击，血色刀光交织成网',
        damageMultiplier: 3.5,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    name: '烈焰女王',
    hp: 220,
    attack: 36,
    defense: 14,
    speed: 60,
    imagePrompt: 'fire queen with crown of flames, flowing red and orange hair, blazing dress, golden eyes',
    avatarSeed: 505,
    ultimateType: 'fire',
    skills: [
      { name: '火球术', description: '抛射烈焰球', damageMultiplier: 1.0, type: 'attack' },
      { name: '烈焰风暴', description: '召唤火焰旋风', damageMultiplier: 1.6, type: 'attack' },
      { name: '凤凰之翼', description: '凤凰之力加持', damageMultiplier: 0, type: 'buff', buffPercent: 38, buffTurns: 3 },
      { name: '灼烧大地', description: '点燃脚下大地', damageMultiplier: 0, type: 'debuff', buffPercent: 28, buffTurns: 2 },
      {
        name: '炼狱焚天',
        description: '召唤九幽之火，天空被烈焰撕裂，大地化为熔岩炼狱',
        damageMultiplier: 3.4,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
  {
    name: '冰霜巨人',
    hp: 400,
    attack: 25,
    defense: 25,
    speed: 30,
    imagePrompt: 'ice giant warrior with crystal blue armor, frozen massive hammer, glowing frost aura',
    avatarSeed: 606,
    ultimateType: 'ice',
    skills: [
      { name: '冰锤击', description: '冰晶巨锤砸下', damageMultiplier: 1.0, type: 'attack' },
      { name: '寒冰裂破', description: '冰刺从地底迸发', damageMultiplier: 1.5, type: 'attack' },
      { name: '冰甲护体', description: '凝结冰甲提升防御', damageMultiplier: 0, type: 'buff', buffPercent: 42, buffTurns: 3 },
      { name: '冰冻领域', description: '降低温度冻结对手', damageMultiplier: 0, type: 'debuff', buffPercent: 32, buffTurns: 2 },
      {
        name: '绝对零度',
        description: '释放绝对零度之力，万物冻结，时间仿佛停止，冰晶在虚空中绽放',
        damageMultiplier: 3.0,
        type: 'ultimate',
        isUltimate: true,
      },
    ],
  },
];

const avatarFilename = (name: string) => `preset_avatar_${name}.jpg`;

const toLocalAvatarPath = (name: string) => `/presets/avatars/${avatarFilename(name)}`;

/** 将预设定义转换为可用的 CharacterData（运行时直接使用 /presets/ 下本地图片） */
const buildCharacter = (def: PresetCharacterDef): CharacterData => {
  const typeInfo = getUltimateTypeById(def.ultimateType);
  const skills: Skill[] = def.skills.map((s) => {
    if (s.isUltimate || s.type === 'ultimate') {
      return {
        ...s,
        ultimateType: def.ultimateType,
        imageUrl: typeInfo?.imageUrl,
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
    imageUrl: toLocalAvatarPath(def.name),
    ultimateCharge: 0,
    attackBuff: 0,
    defenseBuff: 0,
    buffTurnsLeft: 0,
  };
};

/** 供下载脚本使用：生成所有需要下载的远程 URL 与本地相对路径映射 */
export const getPresetImageDownloads = (): { url: string; filename: string; subdir: string }[] => {
  const downloads: { url: string; filename: string; subdir: string }[] = [];

  presetDefs.forEach((def) => {
    downloads.push({
      url: buildAvatarUrl(def.imagePrompt, def.avatarSeed),
      filename: avatarFilename(def.name),
      subdir: 'avatars',
    });
  });

  ULTIMATE_TYPES.forEach((type) => {
    downloads.push({
      url: buildTypeUrl(type.imagePrompt),
      filename: `${type.id}.jpg`,
      subdir: 'ultimates/types',
    });
  });

  return downloads;
};

/** 构造 pollinations 类型图 URL（640x360，固定 seed 保证稳定） */
function buildTypeUrl(prompt: string): string {
  const seed = hashStringToSeed(prompt);
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
  const params = new URLSearchParams({
    width: '640',
    height: '360',
    seed: String(seed),
    nologo: 'true',
    model: 'flux',
  });
  return `${base}?${params.toString()}`;
}

/** 把字符串稳定映射为 0-999999 的 seed */
function hashStringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % 1_000_000;
}

/** 预设角色市场：图片已预下载到 public/presets/，选择后可直接使用，无需调用 LLM */
export const presetCharacters: CharacterData[] = presetDefs.map(buildCharacter);
