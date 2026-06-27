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
    name: "赛博武士",
    hp: 420,
    attack: 78,
    defense: 36,
    speed: 105,
    imagePrompt:
      "cyberpunk samurai with neon cyan katana, glowing oni mask, futuristic armor",
    avatarSeed: 101,
    ultimateType: "shadow",
    ultimateImagePrompt:
      "cyberpunk samurai unleashing amaterasu cyan flame katana slash, thousand blade reflections, dark void, anime key visual",
    skills: [
      {
        name: "拔刀斩",
        description: "快速拔刀的一击，刀光如电",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "居合·烈",
        description: "居合术的极致，一瞬间的拔刀重斩",
        damageMultiplier: 2.2,
        type: "attack",
      },
      {
        name: "武士道精神",
        description: "凝聚战意，提升攻击力",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 65,
        buffTurns: 3,
      },
      {
        name: "残影步",
        description: "留下残影迷惑对手，降低其攻击",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 55,
        buffTurns: 2,
      },
      {
        name: "天照·一闪",
        description: "刀刃划破虚空，释放天照之炎的一闪，整个战场被青色刀光吞没",
        damageMultiplier: 5.6,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
  {
    name: "星辰法师",
    hp: 260,
    attack: 120,
    defense: 10,
    speed: 76,
    imagePrompt:
      "cosmic mage with starry purple cloak, glowing galaxy energy in hands, arcane symbols",
    avatarSeed: 202,
    ultimateType: "cosmic",
    ultimateImagePrompt:
      "cosmic mage creating big bang explosion, galaxies and stars swirling, purple blue stellar energy, anime key visual",
    skills: [
      {
        name: "星辰术",
        description: "凝聚星光化为法弹",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "超新星",
        description: "引爆恒星碎屑",
        damageMultiplier: 2.7,
        type: "attack",
      },
      {
        name: "时空回溯",
        description: "扭曲时间恢复生命",
        damageMultiplier: 0,
        type: "heal",
        healPercent: 38,
      },
      {
        name: "黑洞引力",
        description: "召唤微型黑洞削弱对手",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 65,
        buffTurns: 3,
      },
      {
        name: "宇宙大爆炸",
        description:
          "释放创世级别的能量，星辰陨落，星系崩塌，整个宇宙在指尖重启",
        damageMultiplier: 7.3,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
  {
    name: "机械暴君",
    hp: 820,
    attack: 54,
    defense: 80,
    speed: 24,
    imagePrompt:
      "giant mecha robot with heavy dark armor, red glowing eyes, industrial cyberpunk design",
    avatarSeed: 303,
    ultimateType: "mecha",
    ultimateImagePrompt:
      "giant mecha robot firing all weapons, missile swarm, plasma cannons, city destruction, warzone, anime key visual",
    skills: [
      {
        name: "液压重拳",
        description: "机械臂重击",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "等离子炮",
        description: "发射等离子能量束",
        damageMultiplier: 2.0,
        type: "attack",
      },
      {
        name: "纳米修复",
        description: "纳米机器人修复装甲",
        damageMultiplier: 0,
        type: "heal",
        healPercent: 28,
      },
      {
        name: "EMP脉冲",
        description: "释放电磁脉冲瘫痪对手",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 65,
        buffTurns: 2,
      },
      {
        name: "终极毁灭程序",
        description: "启动毁灭协议，全身武器系统全开，将一切化为废铁",
        damageMultiplier: 5.5,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
  {
    name: "暗影刺客",
    hp: 200,
    attack: 124,
    defense: 10,
    speed: 140,
    imagePrompt:
      "dark ninja assassin with glowing red eyes, black shadow cloak, dual glowing daggers",
    avatarSeed: 404,
    ultimateType: "shadow",
    ultimateImagePrompt:
      "dark ninja assassin creating thousand shadow blade slashes, crimson slash marks, black mist explosion, anime key visual",
    skills: [
      {
        name: "暗影刃",
        description: "淬毒匕首突刺",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "致命背刺",
        description: "绕后背刺要害",
        damageMultiplier: 2.9,
        type: "attack",
      },
      {
        name: "隐身术",
        description: "融入暗影提升攻击",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 90,
        buffTurns: 2,
      },
      {
        name: "毒雾",
        description: "释放毒雾削弱对手",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 50,
        buffTurns: 3,
      },
      {
        name: "千刃杀",
        description:
          "化作千万道残影，从四面八方同时发出致命一击，血色刀光交织成网",
        damageMultiplier: 6.6,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
  {
    name: "烈焰女王",
    hp: 330,
    attack: 104,
    defense: 22,
    speed: 84,
    imagePrompt:
      "fire queen with crown of flames, flowing red and orange hair, blazing dress, golden eyes",
    avatarSeed: 505,
    ultimateType: "fire",
    ultimateImagePrompt:
      "fire queen summoning inferno apocalypse, phoenix wings spread, lava erupting, burning sky, anime key visual",
    skills: [
      {
        name: "火球术",
        description: "抛射烈焰球",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "烈焰风暴",
        description: "召唤火焰旋风",
        damageMultiplier: 2.5,
        type: "attack",
      },
      {
        name: "凤凰之翼",
        description: "凤凰之力加持",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 75,
        buffTurns: 3,
      },
      {
        name: "灼烧大地",
        description: "点燃脚下大地",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 60,
        buffTurns: 2,
      },
      {
        name: "炼狱焚天",
        description: "召唤九幽之火，天空被烈焰撕裂，大地化为熔岩炼狱",
        damageMultiplier: 6.5,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
  {
    name: "冰霜巨人",
    hp: 800,
    attack: 68,
    defense: 78,
    speed: 18,
    imagePrompt:
      "ice giant warrior with crystal blue armor, frozen massive hammer, glowing frost aura",
    avatarSeed: 606,
    ultimateType: "ice",
    ultimateImagePrompt:
      "ice giant warrior unleashing absolute zero blast, massive crystal ice shards explosion, frozen blue wasteland, anime key visual",
    skills: [
      {
        name: "冰锤击",
        description: "冰晶巨锤砸下",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "寒冰裂破",
        description: "冰刺从地底迸发",
        damageMultiplier: 2.2,
        type: "attack",
      },
      {
        name: "冰甲护体",
        description: "凝结冰甲提升防御",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 80,
        buffTurns: 3,
      },
      {
        name: "冰冻领域",
        description: "降低温度冻结对手",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 62,
        buffTurns: 2,
      },
      {
        name: "绝对零度",
        description:
          "释放绝对零度之力，万物冻结，时间仿佛停止，冰晶在虚空中绽放",
        damageMultiplier: 5.7,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
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
    name: "钢铁侠",
    hp: 540,
    attack: 90,
    defense: 58,
    speed: 88,
    imagePrompt:
      "Iron Man in advanced red and gold nanotech armor, arc reactor glowing, repulsor hands, flying pose, dark tech background, anime style",
    avatarSeed: 1010,
    ultimateType: "mecha",
    ultimateImagePrompt:
      "Iron Man Hulkbuster armor unleashing all weapons, red gold missiles and repulsors, massive explosion, warzone, anime key visual",
    skills: [
      {
        name: "掌心炮",
        description: "掌心的电弧脉冲炮齐射",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "集束炸弹",
        description: "发射微型导弹火力覆盖",
        damageMultiplier: 2.4,
        type: "attack",
      },
      {
        name: "能量护盾",
        description: "展开纳米能量场防御",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 70,
        buffTurns: 3,
      },
      {
        name: "电磁干扰",
        description: "释放 EMP 扰乱对手系统",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 60,
        buffTurns: 2,
      },
      {
        name: "反浩克装甲·最终协议",
        description: "调用重型装甲，全身武器库全开，以钢铁洪流终结战斗",
        damageMultiplier: 6.1,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
  {
    name: "梅西",
    hp: 280,
    attack: 72,
    defense: 16,
    speed: 138,
    imagePrompt:
      "Lionel Messi as an anime champion, wearing Argentina blue and white striped jersey, golden football aura, dribbling pose, stadium lights, anime style",
    avatarSeed: 1111,
    ultimateType: "nature",
    ultimateImagePrompt:
      "Lionel Messi scoring legendary goal on green football field, golden ball trail, stadium lights explosion, anime key visual",
    skills: [
      {
        name: "盘带突破",
        description: "低重心连续变向晃过对手",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "弧线任意球",
        description: "划出完美弧线直挂死角",
        damageMultiplier: 2.6,
        type: "attack",
      },
      {
        name: "上帝视野",
        description: "洞察全场，传球与进攻如有神助",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 75,
        buffTurns: 3,
      },
      {
        name: "贴身盯防",
        description: "压迫式防守让对手难以施展",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 45,
        buffTurns: 3,
      },
      {
        name: "世纪进球·上帝之手",
        description: "在绿茵场上演神迹连过五人，以一记不可思议的射门刻入传奇",
        damageMultiplier: 5.6,
        type: "ultimate",
        isUltimate: true,
      },
    ],
  },
  {
    name: "C罗",
    hp: 340,
    attack: 88,
    defense: 22,
    speed: 124,
    imagePrompt:
      "Cristiano Ronaldo as an anime ace, Portugal red and green jersey, muscular physique, mid-air bicycle kick pose, golden energy, stadium background, anime style",
    avatarSeed: 1212,
    ultimateType: "lightning",
    ultimateImagePrompt:
      "Cristiano Ronaldo bicycle kick mid air, golden lightning trail, roaring stadium crowd, anime key visual",
    skills: [
      {
        name: "电梯球",
        description: "飘忽不定的电梯任意球",
        damageMultiplier: 1.0,
        type: "attack",
      },
      {
        name: "暴力头球",
        description: "弹跳惊人，头球轰门",
        damageMultiplier: 2.7,
        type: "attack",
      },
      {
        name: "钢铁意志",
        description: "永不言弃的斗志激发潜能",
        damageMultiplier: 0,
        type: "buff",
        buffPercent: 80,
        buffTurns: 2,
      },
      {
        name: "踩单车迷惑",
        description: "花式动作晃晕对手防线",
        damageMultiplier: 0,
        type: "debuff",
        buffPercent: 48,
        buffTurns: 2,
      },
      {
        name: "SIUUU·惊天倒钩",
        description: "腾空而起完成逆天倒钩，金色闪电划破球场，全场为之沸腾",
        damageMultiplier: 5.9,
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
