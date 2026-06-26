import type { CharacterData, Skill } from '../store/useGameStore';
import type { EvolutionStage, RosterCharacter } from '../store/useRosterStore';

/** 升级到下一级所需经验 */
export const xpToNextLevel = (level: number): number => 100 + level * 70;

/** 单角色封顶 */
export const MAX_LEVEL = 30;

/** 技能解锁等级（解锁后弹三选一） */
export const SKILL_UNLOCK_LEVELS = [5, 12, 22] as const;

/** 进化阶段触发等级（每阶段一次性属性奖励 + AI 重画） */
export const EVOLUTION_THRESHOLDS = [10, 20, 30] as const;

/** 每级基础成长（用于 levelUp 应用） */
const PER_LEVEL_HP = 18;
const PER_LEVEL_ATK = 3;
const PER_LEVEL_DEF = 2;
const SPEED_EVERY_N_LEVELS = 3;

/** 进化一阶段额外一次性增益 */
const EVO_BONUS_HP = 80;
const EVO_BONUS_ATK = 12;
const EVO_BONUS_DEF = 8;
const EVO_BONUS_SPEED = 6;

/**
 * 根据本场战斗的层号、胜负、血量比例计算获得的 XP。
 * 胜利：60 + layer*30 + floor(80 * hpRatio)
 * 失败：12 + layer*5
 */
export const xpForLayer = (layer: number, result: 'win' | 'loss', hpRatio: number): number => {
  if (result === 'win') {
    const ratio = Math.min(1, Math.max(0, hpRatio));
    return 60 + layer * 30 + Math.floor(80 * ratio);
  }
  return 12 + layer * 5;
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
  evolutionStage?: 1 | 2 | 3;
}

export interface ApplyXpResult {
  /** 已经把成长结果应用到 character 上（含可能多级跳） */
  character: RosterCharacter;
  /** 触发的全部事件，顺序记录 */
  events: LevelUpEvent[];
  /** 是否触发了技能解锁 */
  triggeredSkillUnlock: boolean;
  /** 是否触发了进化 */
  triggeredEvolution: 1 | 2 | 3 | null;
}

/**
 * 给角色加 XP，自动处理多级跳、技能解锁标记、进化标记。
 * 注意：本函数不直接给角色加技能、不下载新形象，那些副作用交给 UI 流程处理。
 */
export const applyXp = (character: RosterCharacter, xpDelta: number): ApplyXpResult => {
  let xp = character.xp + Math.max(0, xpDelta);
  let level = character.level;
  let evolutionStage = character.evolutionStage;
  let evolveTrigger: 1 | 2 | 3 | null = null;
  let working: CharacterData = character;
  const events: LevelUpEvent[] = [];
  let unlockedSkill = false;

  while (level < MAX_LEVEL) {
    const need = xpToNextLevel(level);
    if (xp < need) break;
    xp -= need;
    level += 1;
    working = applyLevelUpStats(working, level);
    const unlockSkill = (SKILL_UNLOCK_LEVELS as readonly number[]).includes(level);
    if (unlockSkill) unlockedSkill = true;

    let evolved: 1 | 2 | 3 | undefined;
    if (level === 10 && evolutionStage < 1) {
      evolved = 1;
      evolutionStage = 1 as EvolutionStage;
      working = applyEvolutionStatBonus(working);
    } else if (level === 20 && evolutionStage < 2) {
      evolved = 2;
      evolutionStage = 2 as EvolutionStage;
      working = applyEvolutionStatBonus(working);
    } else if (level === 30 && evolutionStage < 3) {
      evolved = 3;
      evolutionStage = 3 as EvolutionStage;
      working = applyEvolutionStatBonus(working);
    }
    if (evolved && !evolveTrigger) evolveTrigger = evolved;

    events.push({ newLevel: level, unlockSkill, evolutionStage: evolved });
  }

  if (level >= MAX_LEVEL) {
    xp = 0;
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
  const newMaxHp = char.maxHp + EVO_BONUS_HP;
  return {
    ...char,
    maxHp: newMaxHp,
    hp: newMaxHp,
    attack: char.attack + EVO_BONUS_ATK,
    defense: char.defense + EVO_BONUS_DEF,
    speed: char.speed + EVO_BONUS_SPEED,
  };
};

/** UI 用：当前等级总经验进度 */
export const xpProgress = (level: number, xp: number): { current: number; need: number; ratio: number } => {
  if (level >= MAX_LEVEL) return { current: 0, need: 0, ratio: 1 };
  const need = xpToNextLevel(level);
  const ratio = need <= 0 ? 0 : Math.min(1, xp / need);
  return { current: xp, need, ratio };
};

/** 标签：进化阶段中文名 */
export const evolutionLabel = (stage: EvolutionStage): string => {
  switch (stage) {
    case 0:
      return '初始形态';
    case 1:
      return '觉醒形态';
    case 2:
      return '升华形态';
    case 3:
      return '超凡形态';
    default:
      return '初始形态';
  }
};

/** UI 用：进化星标数 */
export const evolutionStars = (stage: EvolutionStage): number => stage;

/** 是否解锁了技能槽（用于额外保护，避免重复弹出） */
export const isSkillUnlockLevel = (level: number): boolean =>
  (SKILL_UNLOCK_LEVELS as readonly number[]).includes(level);

/** 当前角色还能再加几个技能槽（最多 8 个，含大招） */
export const remainingSkillSlots = (char: { skills: Skill[] }): number => Math.max(0, 8 - char.skills.length);
