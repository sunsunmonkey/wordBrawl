import { CharacterData, Skill } from "../store/useGameStore";
import { ULTIMATE_TYPES } from "./ultimateTypes";

/**
 * 构造 Pollinations 头像 URL。
 * 仅用于下载预设图片；运行时直接使用 /presets/ 下本地图片。
 */
export const buildAvatarUrl = (
  prompt: string,
  seed: number,
  model = "sana",
): string => {
  const enriched = `${prompt}, neon cyberpunk character portrait, glowing rim light, dark background, anime style`;
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(enriched)}`;
  const params = new URLSearchParams({
    width: "384",
    height: "384",
    seed: String(seed),
    nologo: "true",
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
  /** 专属大招图英文提示词 */
  ultimateImagePrompt: string;
  skills: Skill[];
}

// 数值分层：每个角色只允许 1-2 个主强项，必须保留明显短板。
// 普攻固定 1.0；强技约 2.0-2.9；大招约 5.6-7.3，只有玻璃炮拿最高倍率。
const presetDefs: PresetCharacterDef[] = [
  {
    name: "唐三",
    hp: 500,
    attack: 88,
    defense: 46,
    speed: 78,
    imagePrompt:
      "Tang San from Soul Land, young warrior with blue silver grass aura, sea god trident, elegant white and blue robes, glowing cyan eyes, anime style",
    avatarSeed: 707,
    ultimateType: "cosmic",
    ultimateImagePrompt:
      "Tang San as Sea God wielding golden trident, golden blue wave rings, divine ocean energy explosion, anime key visual",
    skills: [
      {
        name: "蓝银缠绕",
        description: "蓝银皇藤蔓破土而出，束缚对手",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "昊天锤",
        description: "召唤昊天锤重击，力破千军",
        damageMultiplier: 2.4,
        type: "attack",
      },
      {
        name: "玄天功",
        description: "运转玄天功，战意暴涨",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 70,
        buffTurns: 3,
      },
      {
        name: "紫极魔瞳",
        description: "紫极魔瞳洞悉破绽，削弱对手防御",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 58,
        buffTurns: 2,
      },
      {
        name: "海神·无定风波",
        description: "海神三叉戟划出金色光环，天地失色，万物在神威中归于寂静",
        damageMultiplier: 6.0,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
  {
    name: "超梦",
    hp: 260,
    attack: 128,
    defense: 14,
    speed: 106,
    imagePrompt:
      "Mewtwo, psychic Pokemon, purple and white feline humanoid, glowing purple eyes, telekinetic aura, futuristic lab background, anime style",
    avatarSeed: 1414,
    ultimateType: "cosmic",
    ultimateImagePrompt:
      "Mewtwo unleashing psychic storm, purple telekinetic energy wave, reality distortion, futuristic lab destruction, anime key visual",
    skills: [
      {
        name: "精神冲击",
        description: "以强大念力冲击对手精神",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "暗影球",
        description: "投掷浓缩暗影能量球",
        damageMultiplier: 2.8,
        type: "attack",
      },
      {
        name: "自我再生",
        description: "以超能力修复自身伤势",
        damageMultiplier: 0,
        type: "heal",
        healPercent: 45,
      },
      {
        name: "冥想",
        description: "集中精神，攻击力大幅提升",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 90,
        buffTurns: 3,
      },
      {
        name: "精神破坏·无限精神力",
        description: "释放全部念力扭曲现实，精神风暴席卷战场，万物在紫光中崩解",
        damageMultiplier: 7.0,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
  {
    name: "孙悟空",
    hp: 520,
    attack: 100,
    defense: 40,
    speed: 112,
    imagePrompt:
      "Sun Wukong the Monkey King, golden fur, fiery eyes, holding Ruyi Jingu Bang staff, red and gold armor, clouds under feet, anime style",
    avatarSeed: 808,
    ultimateType: "fire",
    ultimateImagePrompt:
      "Sun Wukong giant form holding massive Ruyi Jingu Bang, golden fire aura, clouds breaking apart, mountain shattering, anime key visual",
    skills: [
      {
        name: "金箍棒",
        description: "如意金箍棒伸缩自如，横扫千军",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "七十二变",
        description: "化身万千，虚实难辨的连击",
        damageMultiplier: 2.4,
        type: "attack",
      },
      {
        name: "火眼金睛",
        description: "识破虚妄，攻击力大幅提升",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 80,
        buffTurns: 2,
      },
      {
        name: "筋斗云",
        description: "腾云驾雾，让对手难以命中",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 55,
        buffTurns: 2,
      },
      {
        name: "法天象地",
        description: "身躯暴涨万丈，金箍棒化作擎天巨柱，一棒碎裂山河",
        damageMultiplier: 6.5,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
  {
    name: "奥特曼",
    hp: 650,
    attack: 78,
    defense: 64,
    speed: 70,
    imagePrompt:
      "Ultraman, silver and red armored giant hero, glowing color timer, heroic pose, cosmic background, anime style",
    avatarSeed: 909,
    ultimateType: "holy",
    ultimateImagePrompt:
      "Ultraman firing brilliant silver blue spacium beam, glowing heroic pose, cosmic light explosion, anime key visual",
    skills: [
      {
        name: "斯派修姆光线",
        description: "双臂交叉释放经典光束",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "奥特飞踢",
        description: "从高空俯冲的爆裂飞踢",
        damageMultiplier: 2.3,
        type: "attack",
      },
      {
        name: "光之护盾",
        description: "展开光墙提升防御",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 75,
        buffTurns: 2,
      },
      {
        name: "奥特念力",
        description: "以念力压制对手，削弱其攻击",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 52,
        buffTurns: 2,
      },
      {
        name: "闪耀·斯派修姆光线",
        description:
          "全身光芒汇聚于双臂，释放出净化一切的终极光束，黑暗无所遁形",
        damageMultiplier: 5.8,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
  {
    name: "卡卡西",
    hp: 300,
    attack: 104,
    defense: 18,
    speed: 132,
    imagePrompt:
      "Kakashi Hatake, silver spiky hair, mask covering lower face, sharingan eye glowing red, lightning chakra around hand, blue flak jacket, anime style",
    avatarSeed: 1313,
    ultimateType: "lightning",
    ultimateImagePrompt:
      "Kakashi using Kamui and Chidori, red sharingan spiral, lightning tearing through distorted space, anime key visual",
    skills: [
      {
        name: "手里剑",
        description: "高速投掷的苦无与手里剑",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "雷切",
        description: "凝聚雷电于掌心突刺",
        damageMultiplier: 2.6,
        type: "attack",
      },
      {
        name: "写轮眼复制",
        description: "看穿并复制对手动作，提升攻击",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 75,
        buffTurns: 3,
      },
      {
        name: "土遁·土流壁",
        description: "筑起土墙提升防御",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 65,
        buffTurns: 2,
      },
      {
        name: "神威·雷切双雷震",
        description: "左眼神威扭曲空间，右手雷切贯穿敌阵，雷光撕裂现实",
        damageMultiplier: 6.2,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
];

const avatarFilename = (name: string) => `preset_avatar_${name}.jpg`;
const ultimateFilename = (name: string) => `preset_ultimate_${name}.jpg`;
const evolutionFilename = (name: string, stage: number) =>
  `preset_evolution_${name}_stage${stage}.jpg`;

const toLocalAvatarPath = (name: string) =>
  `/presets/avatars/${avatarFilename(name)}`;
const toLocalUltimatePath = (name: string) =>
  `/presets/ultimates/characters/${ultimateFilename(name)}`;
const toLocalEvolutionPath = (name: string, stage: number) =>
  `/presets/evolutions/${evolutionFilename(name, stage)}`;

/** 将预设定义转换为可用的 CharacterData（运行时直接使用 /presets/ 下本地图片） */
const buildCharacter = (def: PresetCharacterDef): CharacterData => {
  const skills: Skill[] = def.skills.map((s) => {
    if (s.isUltimate || s.type === "ultimate") {
      return {
        ...s,
        ultimateType: def.ultimateType,
        imageUrl: toLocalUltimatePath(def.name),
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
export const getPresetImageDownloads = (): {
  url: string;
  filename: string;
  subdir: string;
}[] => {
  const downloads: { url: string; filename: string; subdir: string }[] = [];

  presetDefs.forEach((def) => {
    downloads.push({
      url: buildAvatarUrl(def.imagePrompt, def.avatarSeed),
      filename: avatarFilename(def.name),
      subdir: "avatars",
    });
    downloads.push({
      url: buildTypeUrl(def.ultimateImagePrompt),
      filename: ultimateFilename(def.name),
      subdir: "ultimates/characters",
    });
  });

  ULTIMATE_TYPES.forEach((type) => {
    downloads.push({
      url: buildTypeUrl(type.imagePrompt),
      filename: `${type.id}.jpg`,
      subdir: "ultimates/types",
    });
  });

  return downloads;
};

/** 构造 pollinations 类型图 URL（640x360，固定 seed 保证稳定） */
function buildTypeUrl(prompt: string): string {
  const seed = hashStringToSeed(prompt);
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
  const params = new URLSearchParams({
    width: "640",
    height: "360",
    seed: String(seed),
    nologo: "true",
    model: "sana",
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

/** 预设角色：图片已预下载到 public/presets/，选择后可直接使用，无需调用 LLM */
export const presetCharacters: CharacterData[] = presetDefs.map(buildCharacter);

const presetNameSet = new Set(presetDefs.map((d) => d.name));

/** 判断给定名字是否为预设角色（用于决定是否使用本地预下载进化图） */
export const isPresetCharacterName = (name: string): boolean =>
  presetNameSet.has(name);

/**
 * 预设角色进化阶段 (1-6) 的本地图片路径。
 * 文件由 scripts/download-preset-evolutions.mjs 下载到 public/presets/evolutions/。
 * 运行时调用方可以先 probeImage 这条路径，命中则直接使用，绕过 Pollinations。
 */
export const getPresetEvolutionLocalPath = (
  characterName: string,
  stage: number,
): string | null => {
  if (!presetNameSet.has(characterName)) return null;
  if (stage < 1 || stage > 6) return null;
  return toLocalEvolutionPath(characterName, stage);
};

const fallbackAvatarDefs = [
  {
    id: "holy_guardian",
    types: ["holy"],
    keywords: [
      "holy",
      "light",
      "guardian",
      "hero",
      "angel",
      "gate",
      "sacred",
      "神圣",
      "光",
      "英雄",
      "守护",
      "守门",
      "守卫",
      "天阙",
    ],
  },
  {
    id: "shadow_blade",
    types: ["shadow"],
    keywords: [
      "shadow",
      "dark",
      "ninja",
      "assassin",
      "dagger",
      "blade",
      "暗影",
      "刺客",
      "忍者",
      "黑暗",
      "匕首",
      "刀",
    ],
  },
  {
    id: "fire_champion",
    types: ["fire"],
    keywords: [
      "fire",
      "flame",
      "inferno",
      "phoenix",
      "burn",
      "lava",
      "火",
      "烈焰",
      "炎",
      "凤凰",
      "熔岩",
    ],
  },
  {
    id: "ice_titan",
    types: ["ice"],
    keywords: [
      "ice",
      "frost",
      "snow",
      "crystal",
      "giant",
      "冰",
      "霜",
      "雪",
      "寒",
      "巨人",
      "水晶",
    ],
  },
  {
    id: "mecha_sentinel",
    types: ["mecha"],
    keywords: [
      "mecha",
      "robot",
      "cyber",
      "machine",
      "armor",
      "cannon",
      "机甲",
      "机械",
      "机器人",
      "装甲",
      "炮",
      "哨兵",
    ],
  },
  {
    id: "cosmic_oracle",
    types: ["cosmic"],
    keywords: [
      "cosmic",
      "star",
      "galaxy",
      "mage",
      "wizard",
      "magic",
      "arcane",
      "星",
      "宇宙",
      "银河",
      "法师",
      "魔法",
    ],
  },
  {
    id: "nature_ranger",
    types: ["nature"],
    keywords: [
      "nature",
      "forest",
      "wood",
      "vine",
      "poison",
      "ranger",
      "自然",
      "森林",
      "藤蔓",
      "毒",
      "弓",
      "游侠",
    ],
  },
  {
    id: "lightning_knight",
    types: ["lightning"],
    keywords: [
      "lightning",
      "thunder",
      "electric",
      "storm",
      "knight",
      "雷",
      "闪电",
      "电",
      "风暴",
      "骑士",
    ],
  },
  {
    id: "immortal_superhero",
    types: ["holy", "cosmic"],
    keywords: [
      "superhero",
      "immortal",
      "sage",
      "celestial",
      "divine",
      "xianxia",
      "超人",
      "仙人",
      "神仙",
      "修仙",
      "天人",
      "仙侠",
      "飞升",
      "法相",
    ],
  },
];

const fallbackSeed = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

export const getFallbackAvatarUrl = (input: {
  name?: string;
  imagePrompt?: string;
  description?: string;
  ultimateType?: string;
  player?: 1 | 2;
}): string => {
  const text =
    `${input.name || ""} ${input.imagePrompt || ""} ${input.description || ""}`.toLowerCase();
  const seed = fallbackSeed(
    `${input.player || 1}:${text}:${input.ultimateType || ""}`,
  );

  let bestId = fallbackAvatarDefs[seed % fallbackAvatarDefs.length].id;
  let bestScore = -1;

  fallbackAvatarDefs.forEach((def, index) => {
    let score = 0;

    if (input.ultimateType && def.types.includes(input.ultimateType))
      score += 80;

    def.keywords.forEach((keyword) => {
      if (text.includes(keyword.toLowerCase())) score += 14;
    });

    score += ((seed + index * 17) % 7) / 10;

    if (score > bestScore) {
      bestScore = score;
      bestId = def.id;
    }
  });

  return `/presets/fallback-avatars/fallback_avatar_${bestId}.jpg`;
};
