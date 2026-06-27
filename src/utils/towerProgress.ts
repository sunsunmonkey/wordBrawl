import type { CharacterData, Skill } from '../store/useGameStore';
import type { ActiveEvolutionStage, EvolutionStage, RosterCharacter } from '../store/useRosterStore';

/** 每一番包含 30 个等级；31 级进入二番，61 级进入三番，以此类推。 */
export const LEVELS_PER_ASCENSION = 30;
export const TOWER_LAYERS_PER_ASCENSION = 9;

export const getAscensionRank = (level: number): number => Math.max(1, Math.floor((Math.max(1, level) - 1) / LEVELS_PER_ASCENSION) + 1);

export const getLevelInAscension = (level: number): number => ((Math.max(1, level) - 1) % LEVELS_PER_ASCENSION) + 1;

const CHINESE_NUMERALS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export const ascensionLabel = (rank: number): string => {
  const safeRank = Math.max(1, Math.floor(rank));
  if (safeRank <= 10) return `${CHINESE_NUMERALS[safeRank]}番`;
  return `${safeRank}番`;
};

export const levelAscensionLabel = (level: number): string => ascensionLabel(getAscensionRank(level));

export const getTowerAscensionRank = (layer: number): number =>
  Math.max(1, Math.floor((Math.max(1, layer) - 1) / TOWER_LAYERS_PER_ASCENSION) + 1);

export const getTowerLayerInAscension = (layer: number): number =>
  ((Math.max(1, layer) - 1) % TOWER_LAYERS_PER_ASCENSION) + 1;

export const towerAscensionLabel = (layer: number): string => ascensionLabel(getTowerAscensionRank(layer));

/** 升级到下一级所需经验。首个九层塔周期内应能接近第一次进化。 */
export const xpToNextLevel = (level: number): number => {
  const rank = getAscensionRank(level);
  const localLevel = getLevelInAscension(level);
  return 80 + localLevel * 40 + (rank - 1) * 150;
};

/** 技能解锁等级（解锁后弹三选一） */
export const SKILL_UNLOCK_LEVELS = [5, 12, 22] as const;

/** 角色进化触发等级：每 5 级一次形态状态变化。 */
export const EVOLUTION_THRESHOLDS = [5, 10, 15, 20, 25, 30] as const;

/** 每级基础成长（用于 levelUp 应用） */
const PER_LEVEL_HP = 18;
const PER_LEVEL_ATK = 3;
const PER_LEVEL_DEF = 2;
const SPEED_EVERY_N_LEVELS = 3;

/** 进化一阶段额外一次性增益 */
export const EVOLUTION_STAT_BONUS = {
  maxHp: 80,
  attack: 12,
  defense: 8,
  speed: 6,
} as const;

/**
 * 根据本场战斗的层号、胜负、血量比例计算获得的 XP。
 * 胜利：60 + layer*30 + floor(80 * hpRatio)
 * 失败：12 + layer*5
 */
export const xpForLayer = (layer: number, result: 'win' | 'loss', hpRatio: number): number => {
  const rank = getTowerAscensionRank(layer);
  const localLayer = getTowerLayerInAscension(layer);
  if (result === 'win') {
    const ratio = Math.min(1, Math.max(0, hpRatio));
    return 70 + localLayer * 34 + (rank - 1) * 120 + Math.floor(80 * ratio);
  }
  return 14 + localLayer * 6 + (rank - 1) * 24;
};

/** 应用一次升级（不改 level，由外层控制） */
const applyLevelUpStats = (char: CharacterData, newLevel: number): CharacterData => {
  const speedGain = newLevel % SPEED_EVERY_N_LEVELS === 0 ? 1 : 0;
  const newMaxHp = char.maxHp + PER_LEVEL_HP;
  return {
    ...char,
    maxHp: newMaxHp,
    hp: newMaxHp,
    attack: char.attack + PER_LEVEL_ATK,
    defense: char.defense + PER_LEVEL_DEF,
    speed: char.speed + speedGain,
  };
};

export interface LevelUpEvent {
  newLevel: number;
  unlockSkill?: boolean;
  evolutionStage?: ActiveEvolutionStage;
  ascensionRank?: number;
}

export interface ApplyXpResult {
  /** 已经把成长结果应用到 character 上（含可能多级跳） */
  character: RosterCharacter;
  /** 触发的全部事件，顺序记录 */
  events: LevelUpEvent[];
  /** 是否触发了技能解锁 */
  triggeredSkillUnlock: boolean;
  /** 是否触发了进化 */
  triggeredEvolution: ActiveEvolutionStage | null;
}

export interface NextEvolutionProgress {
  nextStage: ActiveEvolutionStage | null;
  targetLevel: number | null;
  xpRemaining: number;
  levelsRemaining: number;
  ready: boolean;
}

export const getEvolutionStageForLevel = (level: number): EvolutionStage => {
  const safeLevel = Math.max(1, Math.floor(level));
  for (let index = EVOLUTION_THRESHOLDS.length - 1; index >= 0; index -= 1) {
    if (safeLevel >= EVOLUTION_THRESHOLDS[index]) {
      return (index + 1) as EvolutionStage;
    }
  }
  return 0;
};

const getNextMissingEvolutionStage = (currentStage: EvolutionStage, level: number): ActiveEvolutionStage | null => {
  const expectedStage = getEvolutionStageForLevel(level);
  if (currentStage >= EVOLUTION_THRESHOLDS.length || expectedStage <= currentStage) return null;
  return (currentStage + 1) as ActiveEvolutionStage;
};

const xpUntilLevel = (level: number, xp: number, targetLevel: number): number => {
  const safeLevel = Math.max(1, Math.floor(level));
  const safeXp = Math.max(0, Math.floor(xp));
  if (targetLevel <= safeLevel) return 0;

  let remaining = Math.max(0, xpToNextLevel(safeLevel) - safeXp);
  for (let currentLevel = safeLevel + 1; currentLevel < targetLevel; currentLevel += 1) {
    remaining += xpToNextLevel(currentLevel);
  }
  return remaining;
};

/** UI 用：距离下一次进化还差多少 XP。ready=true 表示旧存档已越过阈值，下一场结算会补触发。 */
export const getNextEvolutionProgress = (
  level: number,
  xp: number,
  stage: EvolutionStage,
): NextEvolutionProgress => {
  const safeLevel = Math.max(1, Math.floor(level));
  const safeStage = Math.min(EVOLUTION_THRESHOLDS.length, Math.max(0, Math.floor(stage))) as EvolutionStage;
  const readyStage = getNextMissingEvolutionStage(safeStage, safeLevel);
  if (readyStage) {
    return {
      nextStage: readyStage,
      targetLevel: EVOLUTION_THRESHOLDS[readyStage - 1],
      xpRemaining: 0,
      levelsRemaining: 0,
      ready: true,
    };
  }

  if (safeStage >= EVOLUTION_THRESHOLDS.length) {
    return {
      nextStage: null,
      targetLevel: null,
      xpRemaining: 0,
      levelsRemaining: 0,
      ready: false,
    };
  }

  const nextStage = (safeStage + 1) as ActiveEvolutionStage;
  const targetLevel = EVOLUTION_THRESHOLDS[nextStage - 1];
  return {
    nextStage,
    targetLevel,
    xpRemaining: xpUntilLevel(safeLevel, xp, targetLevel),
    levelsRemaining: Math.max(0, targetLevel - safeLevel),
    ready: false,
  };
};

/**
 * 给角色加 XP，自动处理多级跳、技能解锁标记、进化标记。
 * 注意：本函数不直接给角色加技能、不下载新形象，那些副作用交给 UI 流程处理。
 */
export const applyXp = (character: RosterCharacter, xpDelta: number): ApplyXpResult => {
  let xp = character.xp + Math.max(0, xpDelta);
  let level = character.level;
  let evolutionStage = character.evolutionStage;
  let evolveTrigger: ActiveEvolutionStage | null = null;
  let working: CharacterData = character;
  const events: LevelUpEvent[] = [];
  let unlockedSkill = false;
  const missedEvolution = getNextMissingEvolutionStage(evolutionStage, level);
  if (missedEvolution) {
    evolutionStage = missedEvolution;
    working = applyEvolutionStatBonus(working);
    evolveTrigger = missedEvolution;
    events.push({ newLevel: level, evolutionStage: missedEvolution, ascensionRank: getAscensionRank(level) });
  }

  while (true) {
    const need = xpToNextLevel(level);
    if (xp < need) break;
    xp -= need;
    level += 1;
    working = applyLevelUpStats(working, level);
    const localLevel = getLevelInAscension(level);
    const unlockSkill = (SKILL_UNLOCK_LEVELS as readonly number[]).includes(localLevel);
    if (unlockSkill) unlockedSkill = true;

    let evolved: ActiveEvolutionStage | undefined;
    if (!evolveTrigger) {
      const missingEvolution = getNextMissingEvolutionStage(evolutionStage, level);
      if (missingEvolution) {
        evolved = missingEvolution;
        evolutionStage = missingEvolution;
        working = applyEvolutionStatBonus(working);
      }
    }
    if (evolved) evolveTrigger = evolved;

    events.push({ newLevel: level, unlockSkill, evolutionStage: evolved, ascensionRank: getAscensionRank(level) });
  }

  const next: RosterCharacter = {
    ...character,
    ...working,
    level,
    xp,
    evolutionStage,
  };

  return {
    character: next,
    events,
    triggeredSkillUnlock: unlockedSkill,
    triggeredEvolution: evolveTrigger,
  };
};

/** 直接给角色追加进化阶段属性（不动 level/xp） */
export const applyEvolutionStatBonus = (char: CharacterData): CharacterData => {
  const newMaxHp = char.maxHp + EVOLUTION_STAT_BONUS.maxHp;
  return {
    ...char,
    maxHp: newMaxHp,
    hp: newMaxHp,
    attack: char.attack + EVOLUTION_STAT_BONUS.attack,
    defense: char.defense + EVOLUTION_STAT_BONUS.defense,
    speed: char.speed + EVOLUTION_STAT_BONUS.speed,
  };
};

/** UI 用：当前等级总经验进度 */
export const xpProgress = (level: number, xp: number): { current: number; need: number; ratio: number } => {
  const need = xpToNextLevel(level);
  const ratio = need <= 0 ? 0 : Math.min(1, xp / need);
  return { current: xp, need, ratio };
};

const EVOLUTION_LABELS: Record<EvolutionStage, string> = {
  0: '初始形态',
  1: '觉醒形态',
  2: '淬炼形态',
  3: '升华形态',
  4: '破界形态',
  5: '神临形态',
  6: '超凡形态',
};

/** 标签：进化阶段中文名 */
export const evolutionLabel = (stage: EvolutionStage): string => EVOLUTION_LABELS[stage] ?? EVOLUTION_LABELS[0];

/** UI 用：进化星标数 */
export const evolutionStars = (stage: EvolutionStage): number => stage;

/** 是否解锁了技能槽（用于额外保护，避免重复弹出） */
export const isSkillUnlockLevel = (level: number): boolean =>
  (SKILL_UNLOCK_LEVELS as readonly number[]).includes(getLevelInAscension(level));

/** 当前角色还能再加几个技能槽（最多 8 个，含大招） */
export const remainingSkillSlots = (char: { skills: Skill[] }): number => Math.max(0, 8 - char.skills.length);

const EVOLUTION_SUFFIX: Record<ActiveEvolutionStage, string> = {
  1: '觉醒',
  2: '淬炼',
  3: '升华',
  4: '破界',
  5: '神临',
  6: '超凡',
};

const EVOLUTION_ULT_MULTIPLIER: Record<ActiveEvolutionStage, number> = {
  1: 5.0,
  2: 5.8,
  3: 6.6,
  4: 7.4,
  5: 8.2,
  6: 9.2,
};

const STAGE_LORE: Record<ActiveEvolutionStage, string[]> = {
  1: [
    '旧形态的外壳碎裂，新的战斗回路在体内点亮。',
    '一次濒界突破后，力量不再只是累积，而是开始回应意志。',
    '塔内残响灌入灵魂，沉睡的锋芒被彻底唤醒。',
  ],
  2: [
    '骨骼、护甲与招式被重新打磨，每一次出手都更利落。',
    '战斗经验沉入核心，原本粗糙的力量被压成稳定锋面。',
    '塔压像锤火一样反复落下，把他的形态锻得更紧。',
  ],
  3: [
    '第二重核心展开，速度、护甲与杀意被重新校准。',
    '曾经的招式被压缩成更纯粹的形态，气势向外燃烧。',
    '塔压没有摧毁他，反而把他的力量锻成了更高密度的刃。',
  ],
  4: [
    '旧有边界被撕开，新的能量脉络开始覆盖全身。',
    '他不再只是适应九层塔，而是开始反过来压迫塔的规则。',
    '破界的一瞬间，所有弱点都被迫暴露并重新封合。',
  ],
  5: [
    '神临光环降下，肉身、武装与大招短暂进入同一频率。',
    '每一道战痕都转化为权能，下一次出手会更接近裁决。',
    '塔内试炼承认了他的存在，力量开始拥有自己的威压。',
  ],
  6: [
    '最终枷锁断裂，超凡形态把凡战技巧推向神话边界。',
    '第三次突破后，肉身与大招同频，战场开始围绕他改写。',
    '九层塔的试炼化作冠冕，新的形态已不再畏惧极限。',
  ],
};

export interface LocalEvolutionResult {
  imagePrompt: string;
  lore: string;
  newUltimate?: Skill;
}

export const buildLocalEvolution = (char: CharacterData, stage: ActiveEvolutionStage): LocalEvolutionResult => {
  const suffix = EVOLUTION_SUFFIX[stage];
  const basePrompt = char.imagePrompt || `${char.name} cyberpunk anime warrior`;
  const lorePool = STAGE_LORE[stage];
  const lore = `${char.name}${lorePool[(char.name.length + stage) % lorePool.length]}`;
  const ultimate = char.skills.find((skill) => skill.isUltimate || skill.type === 'ultimate');
  const newUltimate = ultimate ? buildEvolvedUltimate(ultimate, stage) : undefined;

  return {
    imagePrompt: [
      basePrompt,
      `${char.name} ${suffix} evolution form`,
      'upgraded armor, radiant aura, stronger silhouette, cyberpunk anime portrait',
    ].join(', ').slice(0, 240),
    lore,
    newUltimate,
  };
};

const buildEvolvedUltimate = (ultimate: Skill, stage: ActiveEvolutionStage): Skill => {
  const suffix = EVOLUTION_SUFFIX[stage];
  const baseName = stripEvolutionSuffix(ultimate.name);
  return {
    ...ultimate,
    name: `${baseName}·${suffix}`,
    description: `${ultimate.description || baseName}。进化后能量层级提升，释放时会展开${suffix}光域并重塑战场节奏。`,
    damageMultiplier: Math.max(ultimate.damageMultiplier || 0, EVOLUTION_ULT_MULTIPLIER[stage]),
    type: 'ultimate',
    isUltimate: true,
  };
};

const stripEvolutionSuffix = (name: string): string =>
  name.replace(/·(觉醒|淬炼|升华|破界|神临|超凡)$/u, '').slice(0, 18) || '终极一击';
