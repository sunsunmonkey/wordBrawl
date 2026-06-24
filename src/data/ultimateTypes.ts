export interface UltimateType {
  id: string;
  name: string;
  description: string;
  /** 用于 pollinations 下载的英文提示词 */
  imagePrompt: string;
  /** 运行时本地图片路径 */
  imageUrl: string;
  /** 同类型备选图路径（AI 生成角色可随机使用，增加视觉多样性） */
  alternateImageUrls?: string[];
  /** 主色调（用于边框、光晕、标题） */
  themeColor: string;
  /** 副色调（用于背景渐变、放射光） */
  secondaryColor: string;
}

/**
 * 大招视觉类型库：每种类型对应一张预下载的本地横版特效图。
 * AI 生成角色时会根据角色主题自动挑选最匹配的类型，
 * 预设角色也直接引用这里的类型，避免每次大招生成都要调用图片 API。
 */
export const ULTIMATE_TYPES: UltimateType[] = [
  {
    id: 'fire',
    name: '炼狱之火',
    description: '烈焰、爆炸、熔岩、凤凰等炽热毁灭效果',
    imagePrompt:
      'inferno hellfire ultimate skill, massive fire tornado, burning apocalyptic sky, explosive flames, anime key visual',
    imageUrl: '/presets/ultimates/types/fire.jpg',
    alternateImageUrls: [
      '/presets/ultimates/characters/preset_ultimate_烈焰女王.jpg',
      '/presets/ultimates/characters/preset_ultimate_孙悟空.jpg',
    ],
    themeColor: '#FF4500',
    secondaryColor: '#FFD700',
  },
  {
    id: 'ice',
    name: '绝对零度',
    description: '冰霜、暴风雪、冰晶、冻结等寒冷效果',
    imagePrompt:
      'absolute zero ice blast ultimate skill, massive crystal ice shards explosion, frozen blue wasteland, anime key visual',
    imageUrl: '/presets/ultimates/types/ice.jpg',
    alternateImageUrls: ['/presets/ultimates/characters/preset_ultimate_冰霜巨人.jpg'],
    themeColor: '#00E5FF',
    secondaryColor: '#A0E8FF',
  },
  {
    id: 'shadow',
    name: '暗影虚空',
    description: '黑暗、影子、刺客、诅咒等幽暗效果',
    imagePrompt:
      'shadow void ultimate skill, thousand dark blades slashing, crimson slash marks, dark energy explosion, anime key visual',
    imageUrl: '/presets/ultimates/types/shadow.jpg',
    alternateImageUrls: [
      '/presets/ultimates/characters/preset_ultimate_赛博武士.jpg',
      '/presets/ultimates/characters/preset_ultimate_暗影刺客.jpg',
    ],
    themeColor: '#BF00FF',
    secondaryColor: '#FF003C',
  },
  {
    id: 'lightning',
    name: '雷霆风暴',
    description: '雷电、风暴、电磁、疾速等暴烈效果',
    imagePrompt:
      'lightning storm ultimate skill, massive thunderbolt striking, electric energy explosion, stormy sky, anime key visual',
    imageUrl: '/presets/ultimates/types/lightning.jpg',
    alternateImageUrls: [
      '/presets/ultimates/characters/preset_ultimate_C罗.jpg',
      '/presets/ultimates/characters/preset_ultimate_卡卡西.jpg',
    ],
    themeColor: '#FFFF00',
    secondaryColor: '#9D00FF',
  },
  {
    id: 'cosmic',
    name: '宇宙星辰',
    description: '星系、黑洞、超新星、时空等浩瀚效果',
    imagePrompt:
      'cosmic ultimate skill, big bang explosion, galaxies and stars swirling, purple blue cosmic energy, anime key visual',
    imageUrl: '/presets/ultimates/types/cosmic.jpg',
    alternateImageUrls: [
      '/presets/ultimates/characters/preset_ultimate_星辰法师.jpg',
      '/presets/ultimates/characters/preset_ultimate_唐三.jpg',
      '/presets/ultimates/characters/preset_ultimate_超梦.jpg',
    ],
    themeColor: '#9D00FF',
    secondaryColor: '#00E5FF',
  },
  {
    id: 'nature',
    name: '自然狂潮',
    description: '森林、藤蔓、生命、绿茵等自然效果',
    imagePrompt:
      'nature ultimate skill, giant ancient tree awakening, poisonous vines explosion, green life energy surge, anime key visual',
    imageUrl: '/presets/ultimates/types/nature.jpg',
    alternateImageUrls: ['/presets/ultimates/characters/preset_ultimate_梅西.jpg'],
    themeColor: '#39FF14',
    secondaryColor: '#ADFF2F',
  },
  {
    id: 'mecha',
    name: '机械毁灭',
    description: '机甲、导弹、EMP、钢铁洪流等工业效果',
    imagePrompt:
      'mecha ultimate skill, giant robot firing all weapons, massive explosion destruction, fire smoke plasma, warzone, anime key visual',
    imageUrl: '/presets/ultimates/types/mecha.jpg',
    alternateImageUrls: [
      '/presets/ultimates/characters/preset_ultimate_机械暴君.jpg',
      '/presets/ultimates/characters/preset_ultimate_钢铁侠.jpg',
    ],
    themeColor: '#FF6B00',
    secondaryColor: '#C0C0C0',
  },
  {
    id: 'holy',
    name: '圣光裁决',
    description: '神圣、光剑、审判、光之巨人等光辉效果',
    imagePrompt:
      'holy light ultimate skill, angelic judgment beam, golden sacred sword falling from sky, radiant explosion, anime key visual',
    imageUrl: '/presets/ultimates/types/holy.jpg',
    alternateImageUrls: ['/presets/ultimates/characters/preset_ultimate_奥特曼.jpg'],
    themeColor: '#FFD700',
    secondaryColor: '#FFFFFF',
  },
];

export const ULTIMATE_TYPE_IDS: string[] = ULTIMATE_TYPES.map((t) => t.id);

export const getUltimateTypeById = (id: string): UltimateType | undefined =>
  ULTIMATE_TYPES.find((t) => t.id === id);

/** 供下载脚本使用：生成所有类型图的远程 URL 与本地文件名 */
export const getUltimateTypeDownloads = (): { url: string; filename: string }[] => {
  return ULTIMATE_TYPES.map((t) => ({
    url: buildTypeUrl(t.imagePrompt),
    filename: `${t.id}.jpg`,
  }));
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
