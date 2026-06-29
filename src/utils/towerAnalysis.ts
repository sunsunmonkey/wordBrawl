import OpenAI from 'openai';
import type { BattleEvent, CharacterData, Skill } from '../store/useGameStore';
import type { AIConfig } from './ai';
import { ULTIMATE_TYPE_IDS, getUltimateTypeById } from '../data/ultimateTypes';

export interface BattleSummary {
  turns: number;
  damageDealt: number;
  damageTaken: number;
  criticalCount: number;
  ultimateCount: number;
  mostUsedSkill?: string;
  lowestHpPercent: number;
  longestStreak: number;
  rawHighlights: string[];
}

const stripJsonFences = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
};

/**
 * 把战斗 log 聚合成 BattleSummary。
 * 注意：log.attacker = 'player1' 表示麾下角色出招，player2 表示 Boss。
 */
export const summarizeBattle = (
  logs: BattleEvent[],
  player: CharacterData,
  boss: CharacterData,
  result: 'win' | 'loss',
): BattleSummary => {
  let damageDealt = 0;
  let damageTaken = 0;
  let criticalCount = 0;
  let ultimateCount = 0;
  let turns = 0;
  let lowestHpPercent = 1;
  let longestStreak = 0;
  let currentStreak = 0;
  const skillCount: Record<string, number> = {};

  let playerHp = player.maxHp;
  const highlights: string[] = [];

  for (const log of logs) {
    if (typeof log.turn === 'number' && log.turn > turns) turns = log.turn;
    if (log.attacker === 'player1') {
      damageDealt += log.damage || 0;
      if (log.isCrit) {
        criticalCount += 1;
        currentStreak += 1;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
      if (log.isUltimate) ultimateCount += 1;
      if (log.skillName) {
        skillCount[log.skillName] = (skillCount[log.skillName] || 0) + 1;
      }
    } else if (log.attacker === 'player2') {
      const dmg = log.damage || 0;
      damageTaken += dmg;
      playerHp = Math.max(0, playerHp - dmg);
      const ratio = playerHp / player.maxHp;
      if (ratio < lowestHpPercent) lowestHpPercent = ratio;
      currentStreak = 0;
    }
    if (log.heal && log.attacker === 'player1') {
      playerHp = Math.min(player.maxHp, playerHp + log.heal);
    }
  }

  let mostUsedSkill: string | undefined;
  let maxCount = 0;
  for (const [name, count] of Object.entries(skillCount)) {
    if (count > maxCount) {
      maxCount = count;
      mostUsedSkill = name;
    }
  }

  // 取最关键的 6 条 highlight：暴击/大招/低血回复
  const ranked = [...logs]
    .filter((l) => l.message)
    .sort((a, b) => {
      const score = (l: BattleEvent) =>
        (l.isUltimate ? 3 : 0) + (l.isCrit ? 2 : 0) + ((l.damage || 0) > 100 ? 1 : 0);
      return score(b) - score(a);
    });
  for (const l of ranked.slice(0, 6)) {
    highlights.push(l.message);
  }

  // 兜底：使用 boss 名字让 prompt 上下文更可读
  if (highlights.length === 0 && logs.length > 0) {
    highlights.push(`${player.name} 与 ${boss.name} 的战斗历时 ${turns} 回合，结果：${result === 'win' ? '胜利' : '失败'}。`);
  }

  return {
    turns,
    damageDealt: Math.round(damageDealt),
    damageTaken: Math.round(damageTaken),
    criticalCount,
    ultimateCount,
    mostUsedSkill,
    lowestHpPercent: Math.round(lowestHpPercent * 100) / 100,
    longestStreak,
    rawHighlights: highlights,
  };
};

export type Intent = 'skill' | 'evolve';

export interface SkillCandidate {
  name: string;
  description: string;
  type: 'attack' | 'heal' | 'buff' | 'debuff';
  damageMultiplier?: number;
  healPercent?: number;
  buffPercent?: number;
  buffTurns?: number;
}

export interface SkillResult {
  candidates: SkillCandidate[];
}

export interface EvolveResult {
  imagePrompt: string;
  lore: string;
  newUltimate?: Skill;
}

const SYSTEM_PROMPT_BASE = `你是一个游戏角色养成顾问。
玩家在 PVE 九层塔中带着自己的角色挑战 Boss，请基于角色当前数值与一场战斗的聚合摘要，输出严格的 JSON 结果。
你的返回必须是合法的、可被 JSON.parse 解析的纯 JSON 对象，绝对不要包含 markdown 代码块、注释或额外文字说明。
如果角色资料包含 spiritProfile，请让技能命名、进化 lore 和大招描述延续它的原型、语气、世界锚点和记忆种子。`;

const INTENT_PROMPTS: Record<Intent, string> = {
  skill: `请为这个角色生成 3 个互补且差异化的【非大招】技能候选，必须用于弥补当前短板（如缺治疗/缺控制/缺爆发）。
所有 candidate 的 type 必须从 ["attack","heal","buff","debuff"] 中选择，禁止给出 ultimate / isUltimate。
返回 JSON：{
  "candidates": [
    { "name": "技能名（中文，4-8字）", "description": "1-2 句中文描述", "type": "attack|heal|buff|debuff", "damageMultiplier": 1.6, "healPercent": 30, "buffPercent": 45, "buffTurns": 3 }
  ]
}
数值约束：attack 倍率 1.4-2.6；heal 的 healPercent 20-55；buff/debuff 的 buffPercent 25-90，buffTurns 2-4。`,
  evolve: `这个角色刚刚达到了进化阶段。请生成进化结果，返回 JSON：{
  "imagePrompt": "用于头像生成的英文 prompt，要体现角色进化后的形态升级（如装备/能量/披风/光环），200 字以内",
  "lore": "一段不超过 60 字的中文进化叙事",
  "newUltimate": { "name": "新大招名（可选）", "description": "若给出大招须含华丽中文描述", "damageMultiplier": 6.5, "type": "ultimate", "isUltimate": true, "ultimateType": "fire" }
}
ultimateType 必须为以下之一：${ULTIMATE_TYPE_IDS.join(', ')}。如果觉得不需要替换大招，可以省略 newUltimate 字段。`,
};

const normalizeSkillResult = (value: unknown): SkillResult => {
  const data = asRecord(value);
  const list = Array.isArray(data.candidates) ? data.candidates : [];
  return {
    candidates: list.slice(0, 3).map((entry): SkillCandidate => {
      const skill = asRecord(entry);
      const rawType = String(skill.type || 'attack');
      const allowed = ['attack', 'heal', 'buff', 'debuff'];
      const type = (allowed.includes(rawType) ? rawType : 'attack') as SkillCandidate['type'];
      return {
        name: String(skill.name || '新技能').slice(0, 24),
        description: String(skill.description || '').slice(0, 200),
        type,
        damageMultiplier: type === 'attack' ? clampNumber(skill.damageMultiplier, 1, 2.8, 1.8) : undefined,
        healPercent: type === 'heal' ? clampInt(skill.healPercent, 12, 60, 30) : undefined,
        buffPercent: type === 'buff' || type === 'debuff' ? clampInt(skill.buffPercent, 15, 95, 45) : undefined,
        buffTurns: type === 'buff' || type === 'debuff' ? clampInt(skill.buffTurns, 1, 4, 3) : undefined,
      };
    }),
  };
};

const normalizeEvolveResult = (value: unknown): EvolveResult => {
  const data = asRecord(value);
  const newUltimate = asRecord(data.newUltimate);
  let normalizedUltimate: Skill | undefined;
  if (Object.keys(newUltimate).length > 0) {
    const requestedType = String(newUltimate.ultimateType || '');
    const ultimateType: string = (ULTIMATE_TYPE_IDS as readonly string[]).includes(requestedType)
      ? requestedType
      : ULTIMATE_TYPE_IDS[0];
    normalizedUltimate = {
      name: String(newUltimate.name || '终极一击').slice(0, 24),
      description: String(newUltimate.description || '').slice(0, 240),
      damageMultiplier: clampNumber(newUltimate.damageMultiplier, 4, 8, 6.5),
      type: 'ultimate',
      isUltimate: true,
      ultimateType,
      imageUrl: getUltimateTypeById(ultimateType)?.imageUrl,
    };
  }
  return {
    imagePrompt: String(data.imagePrompt || '').slice(0, 240),
    lore: String(data.lore || '').slice(0, 200),
    newUltimate: normalizedUltimate,
  };
};

const parseJsonLoose = (raw: string): unknown => {
  const cleaned = stripJsonFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI 返回的内容不是合法 JSON');
    return JSON.parse(match[0]);
  }
};

const sanitizeCharacterForPrompt = (
  char: CharacterData,
  includeSpirit = false,
) => ({
  name: char.name,
  hp: char.maxHp,
  attack: char.attack,
  defense: char.defense,
  speed: char.speed,
  skills: char.skills.map((s) => ({
    name: s.name,
    type: s.type,
    description: s.description,
    damageMultiplier: s.damageMultiplier,
    healPercent: s.healPercent,
    buffPercent: s.buffPercent,
    buffTurns: s.buffTurns,
    isUltimate: s.isUltimate,
  })),
  ...(includeSpirit && char.spiritProfile
    ? {
        spiritProfile: {
          archetype: char.spiritProfile.archetype,
          temperament: char.spiritProfile.temperament,
          speechStyle: char.spiritProfile.speechStyle,
          catchphrases: char.spiritProfile.catchphrases,
          battleCry: char.spiritProfile.battleCry,
          worldAnchors: char.spiritProfile.worldAnchors,
          memorySeeds: char.spiritProfile.memorySeeds,
        },
      }
    : {}),
});

export interface GrowthReportPayload<T> {
  ok: boolean;
  result: T;
}

export async function requestSkillCandidates(
  cfg: AIConfig,
  character: CharacterData,
  summary: BattleSummary,
  context?: Record<string, unknown>,
): Promise<SkillResult> {
  return requestGrowthReport<SkillResult>(cfg, 'skill', character, summary, context);
}

export async function requestEvolve(
  cfg: AIConfig,
  character: CharacterData,
  summary: BattleSummary,
  context?: Record<string, unknown>,
): Promise<EvolveResult> {
  return requestGrowthReport<EvolveResult>(cfg, 'evolve', character, summary, context);
}

export async function requestGrowthReport<T>(
  cfg: AIConfig,
  intent: Intent,
  character: CharacterData,
  summary: BattleSummary,
  context?: Record<string, unknown>,
): Promise<T> {
  const apiMode = cfg.apiMode || 'custom';
  if (apiMode === 'free') {
    return requestFreeTrial<T>(intent, character, summary, context);
  }
  return requestCustomOpenAI<T>(cfg, intent, character, summary, context);
}

async function requestFreeTrial<T>(
  intent: Intent,
  character: CharacterData,
  summary: BattleSummary,
  context?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch('/api/tower-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent,
      character: sanitizeCharacterForPrompt(character),
      summary,
      context,
    }),
  });

  const payload = asRecord(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new Error(String(payload.error || '塔战分析接口暂时不可用'));
  }
  if (!payload.result) {
    throw new Error('塔战分析接口返回内容异常');
  }
  return payload.result as T;
}

async function requestCustomOpenAI<T>(
  cfg: AIConfig,
  intent: Intent,
  character: CharacterData,
  summary: BattleSummary,
  context?: Record<string, unknown>,
): Promise<T> {
  if (!cfg.apiKey) throw new Error('请先填写 API Key');
  if (!cfg.baseUrl) throw new Error('请先填写 Base URL');
  if (!cfg.model) throw new Error('请先填写 Model');

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    dangerouslyAllowBrowser: true,
  });

  const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${INTENT_PROMPTS[intent]}`;
  const userPrompt = [
    `意图：${intent}`,
    `角色：${JSON.stringify(sanitizeCharacterForPrompt(character, true))}`,
    `战斗摘要：${JSON.stringify(summary)}`,
    context ? `补充：${JSON.stringify(context)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.85,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('AI 返回内容为空');
  const parsed = parseJsonLoose(content);

  if (intent === 'skill') return normalizeSkillResult(parsed) as T;
  return normalizeEvolveResult(parsed) as T;
}
