/**
 * 武器库：每把武器都有固定的 seed 和 prompt，
 * 图片预下载到 public/presets/weapons/，运行时直接读本地路径。
 *
 * 武器类型：
 * - sword 剑 / blade 刀 / spear 枪 / bow 弓 / hammer 锤
 * - staff 法杖 / dagger 匕首 / gun 枪械 / special 特殊
 *
 * 稀有度：common 普通 / rare 稀有 / epic 史诗 / legendary 传说 / mythic 神话
 */

export type WeaponType =
  | 'sword'
  | 'blade'
  | 'spear'
  | 'bow'
  | 'hammer'
  | 'staff'
  | 'dagger'
  | 'gun'
  | 'special';

export type WeaponRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface Weapon {
  id: string;
  name: string;
  type: WeaponType;
  rarity: WeaponRarity;
  /** 攻击力加成 */
  attackBonus: number;
  /** 暴击率加成（百分比） */
  critBonus?: number;
  /** 速度加成 */
  speedBonus?: number;
  /** 中文描述 */
  description: string;
  /** pollinations 英文 prompt */
  imagePrompt: string;
  /** 固定 seed，保证图片稳定 */
  seed: number;
  /** 运行时本地图片路径 */
  imageUrl: string;
}

type WeaponDef = Omit<Weapon, 'imageUrl'>;

const WEAPON_DEFS: WeaponDef[] = [
  // ===== 剑 sword =====
  {
    id: 'cyan_flame_blade',
    name: '苍焰刃',
    type: 'sword',
    rarity: 'epic',
    attackBonus: 28,
    critBonus: 8,
    description: '由青色冥火铸造的长剑，挥舞时拖出幽冥火尾',
    imagePrompt:
      'epic glowing cyan flame longsword, blue ethereal fire wrapping the blade, ornate silver hilt, dark void background, fantasy weapon concept art, anime key visual',
    seed: 10001,
  },
  {
    id: 'dragon_scale_greatsword',
    name: '龙鳞巨剑',
    type: 'sword',
    rarity: 'legendary',
    attackBonus: 45,
    speedBonus: -10,
    description: '镶满龙鳞的巨剑，传说一击碎山',
    imagePrompt:
      'legendary massive greatsword covered in red dragon scales, glowing red runes on blade, fierce dragon head pommel, lava background, fantasy weapon art, anime key visual',
    seed: 10002,
  },
  {
    id: 'tempest_sword',
    name: '狂风之剑',
    type: 'sword',
    rarity: 'rare',
    attackBonus: 18,
    speedBonus: 8,
    description: '剑身轻盈，挥舞间带起狂风',
    imagePrompt:
      'elegant wind elemental longsword, swirling green wind currents around the blade, white feather decorations on hilt, sky background, fantasy weapon art, anime key visual',
    seed: 10003,
  },
  {
    id: 'genesis_holy_sword',
    name: '创世神剑',
    type: 'sword',
    rarity: 'mythic',
    attackBonus: 60,
    critBonus: 15,
    description: '传说中开天辟地的神兵，剑芒可裂虚空',
    imagePrompt:
      'mythic divine holy greatsword, radiant golden light beams, angelic wings on hilt, glowing celestial runes, heaven sky background, ultimate fantasy weapon, anime key visual',
    seed: 10004,
  },

  // ===== 刀 blade =====
  {
    id: 'samurai_soul_katana',
    name: '武士魂刀',
    type: 'blade',
    rarity: 'epic',
    attackBonus: 26,
    critBonus: 12,
    description: '武士传承的魂刀，刀锋锐利无匹',
    imagePrompt:
      'sharp samurai katana with red lacquered scabbard, glowing crimson edge, sakura petals floating, traditional japanese aesthetic, dark moonlit background, fantasy weapon art, anime key visual',
    seed: 10005,
  },
  {
    id: 'moonlight_blade',
    name: '月华刀',
    type: 'blade',
    rarity: 'rare',
    attackBonus: 17,
    critBonus: 6,
    description: '映照月光的弯刀，刀光如水',
    imagePrompt:
      'curved scimitar blade reflecting moonlight, silver white glow, crescent moon engraving, midnight blue background, fantasy weapon art, anime key visual',
    seed: 10006,
  },

  // ===== 枪 spear =====
  {
    id: 'frost_spear',
    name: '寒冰长枪',
    type: 'spear',
    rarity: 'rare',
    attackBonus: 19,
    speedBonus: 4,
    description: '枪尖凝结永不融化的寒冰',
    imagePrompt:
      'long spear with crystal ice tip, frosty mist trailing the shaft, blue glowing runes, frozen wasteland background, fantasy weapon art, anime key visual',
    seed: 10007,
  },
  {
    id: 'holy_lance',
    name: '圣光长枪',
    type: 'spear',
    rarity: 'legendary',
    attackBonus: 38,
    description: '神圣骑士的圣枪，可净化邪祟',
    imagePrompt:
      'legendary holy lance with golden cross guard, radiant white light, angelic feathers attached, cathedral light rays background, fantasy weapon art, anime key visual',
    seed: 10008,
  },
  {
    id: 'divine_trident',
    name: '神威三叉戟',
    type: 'spear',
    rarity: 'mythic',
    attackBonus: 55,
    critBonus: 10,
    description: '海神之武器，掌控潮汐与雷霆',
    imagePrompt:
      'mythic golden trident wielded by sea god, glowing blue ocean waves swirling, lightning sparks, deep sea background, ultimate fantasy weapon, anime key visual',
    seed: 10009,
  },

  // ===== 弓 bow =====
  {
    id: 'phoenix_bow',
    name: '凤凰之弓',
    type: 'bow',
    rarity: 'legendary',
    attackBonus: 36,
    critBonus: 18,
    description: '凤凰羽毛编织的神弓，箭出必焚天',
    imagePrompt:
      'legendary phoenix bow made of red and gold flame feathers, glowing fire arrow nocked, burning sky background, fantasy weapon art, anime key visual',
    seed: 10010,
  },
  {
    id: 'thousand_crossbow',
    name: '千机弩',
    type: 'bow',
    rarity: 'epic',
    attackBonus: 24,
    speedBonus: 12,
    description: '机关精巧的连发弩，箭如骤雨',
    imagePrompt:
      'epic intricate mechanical repeating crossbow, brass gears and copper pipes, blue glowing energy core, steampunk style, dark workshop background, fantasy weapon art, anime key visual',
    seed: 10011,
  },

  // ===== 锤 hammer =====
  {
    id: 'thunder_war_hammer',
    name: '雷霆战锤',
    type: 'hammer',
    rarity: 'legendary',
    attackBonus: 42,
    speedBonus: -8,
    description: '蕴含雷神之力的战锤，落下即风暴',
    imagePrompt:
      'legendary warhammer crackling with golden lightning, runic engravings on the head, storm clouds and thunderbolts background, norse mythology style, fantasy weapon art, anime key visual',
    seed: 10012,
  },
  {
    id: 'earthshaker_hammer',
    name: '大地之锤',
    type: 'hammer',
    rarity: 'epic',
    attackBonus: 32,
    speedBonus: -6,
    description: '锤击大地可引发地震',
    imagePrompt:
      'epic massive stone hammer with earthen runes, cracked rock and dust particles around, brown leather wrapped grip, mountain background, fantasy weapon art, anime key visual',
    seed: 10013,
  },

  // ===== 法杖 staff =====
  {
    id: 'stellar_staff',
    name: '星辰法杖',
    type: 'staff',
    rarity: 'epic',
    attackBonus: 30,
    description: '杖顶镶嵌一颗微缩星辰',
    imagePrompt:
      'epic mage staff topped with a glowing miniature galaxy orb, purple cosmic energy swirling, silver runes on the shaft, starry space background, fantasy weapon art, anime key visual',
    seed: 10014,
  },
  {
    id: 'eternal_night_staff',
    name: '永夜法杖',
    type: 'staff',
    rarity: 'legendary',
    attackBonus: 40,
    critBonus: 5,
    description: '黑曜石法杖，操纵永夜与暗影',
    imagePrompt:
      'legendary obsidian black mage staff with crescent moon and dark crystal, swirling purple shadow magic, gothic style, dark forest moonlit background, fantasy weapon art, anime key visual',
    seed: 10015,
  },

  // ===== 匕首 dagger =====
  {
    id: 'shadow_twin_daggers',
    name: '暗影双刃',
    type: 'dagger',
    rarity: 'epic',
    attackBonus: 22,
    critBonus: 20,
    speedBonus: 10,
    description: '刺客最爱的双匕，融于黑暗',
    imagePrompt:
      'epic pair of curved assassin daggers, black blades with purple shadow mist trailing, ornate silver guards, dark stealth atmosphere, fantasy weapon art, anime key visual',
    seed: 10016,
  },
  {
    id: 'moonlight_dagger',
    name: '月光匕首',
    type: 'dagger',
    rarity: 'rare',
    attackBonus: 14,
    critBonus: 12,
    speedBonus: 6,
    description: '在月光下闪烁银辉的短刃',
    imagePrompt:
      'sleek silver dagger with moonlight glow, crescent moon engraving on blade, pale blue light, midnight background, fantasy weapon art, anime key visual',
    seed: 10017,
  },

  // ===== 枪械 gun =====
  {
    id: 'plasma_rifle',
    name: '等离子步枪',
    type: 'gun',
    rarity: 'epic',
    attackBonus: 30,
    critBonus: 8,
    description: '高能等离子能量步枪',
    imagePrompt:
      'epic futuristic plasma rifle with cyan glowing energy core, sleek black metal frame, neon blue lights, sci-fi cyberpunk style, dark tech background, weapon concept art',
    seed: 10018,
  },
  {
    id: 'doom_revolver',
    name: '终结左轮',
    type: 'gun',
    rarity: 'rare',
    attackBonus: 20,
    critBonus: 15,
    description: '老派但致命的重型左轮枪',
    imagePrompt:
      'heavy old western revolver with skull engraving, golden bullets, weathered metal, smoke trailing, dramatic dark background, weapon concept art',
    seed: 10019,
  },
  {
    id: 'quantum_cannon',
    name: '量子粒子炮',
    type: 'gun',
    rarity: 'mythic',
    attackBonus: 58,
    critBonus: 12,
    speedBonus: -8,
    description: '能撕裂时空的反物质重型武器',
    imagePrompt:
      'mythic massive quantum particle cannon, swirling antimatter energy core, holographic targeting projections, futuristic sci-fi laboratory background, ultimate weapon concept art',
    seed: 10020,
  },

  // ===== 特殊 special =====
  {
    id: 'blood_moon_scythe',
    name: '血月镰刀',
    type: 'special',
    rarity: 'mythic',
    attackBonus: 50,
    critBonus: 25,
    description: '死神镰刀，收割灵魂的血月化身',
    imagePrompt:
      'mythic grim reaper scythe with crimson curved blade, dark purple shadow flame, blood moon background, gothic horror style, ultimate fantasy weapon art, anime key visual',
    seed: 10021,
  },
  {
    id: 'wind_chakram',
    name: '疾风轮',
    type: 'special',
    rarity: 'rare',
    attackBonus: 16,
    speedBonus: 14,
    description: '可投掷可挥舞的双刃飞轮',
    imagePrompt:
      'circular spinning chakram blade with green wind streams, sharp edges, leather hand grip in center, sky background, fantasy weapon art, anime key visual',
    seed: 10022,
  },
  {
    id: 'rusty_iron_sword',
    name: '生锈铁剑',
    type: 'sword',
    rarity: 'common',
    attackBonus: 8,
    description: '随处可见的入门武器',
    imagePrompt:
      'simple rusty iron sword, worn leather grip, common adventurer weapon, plain stone background, fantasy weapon art',
    seed: 10023,
  },
  {
    id: 'wooden_bow',
    name: '木制猎弓',
    type: 'bow',
    rarity: 'common',
    attackBonus: 7,
    speedBonus: 4,
    description: '猎人常用的简易弓',
    imagePrompt:
      'simple wooden hunter bow with linen string, plain arrow nocked, forest background, common weapon, fantasy weapon art',
    seed: 10024,
  },
];

const weaponFilename = (id: string) => `weapon_${id}.jpg`;
const toLocalWeaponPath = (id: string) => `/presets/weapons/${weaponFilename(id)}`;

/** 武器库：运行时直接使用 /presets/weapons/ 下的本地图片 */
export const WEAPONS: Weapon[] = WEAPON_DEFS.map((def) => ({
  ...def,
  imageUrl: toLocalWeaponPath(def.id),
}));

export const RARITY_LABEL: Record<WeaponRarity, string> = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
  mythic: '神话',
};

export const RARITY_COLOR: Record<WeaponRarity, string> = {
  common: '#9CA3AF',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F59E0B',
  mythic: '#EF4444',
};

export const TYPE_LABEL: Record<WeaponType, string> = {
  sword: '剑',
  blade: '刀',
  spear: '枪',
  bow: '弓',
  hammer: '锤',
  staff: '法杖',
  dagger: '匕首',
  gun: '枪械',
  special: '特殊',
};

/** 供下载脚本使用：列出所有武器 + 远程图片元数据 */
export const getWeaponDownloadList = () =>
  WEAPON_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    prompt: def.imagePrompt,
    seed: def.seed,
    filename: weaponFilename(def.id),
  }));
