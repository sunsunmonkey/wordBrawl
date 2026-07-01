import OpenAI from "openai";
import type { AIConfig } from "./ai";
import type { BattleSummary } from "./towerAnalysis";
import type { RosterCharacter } from "../store/useRosterStore";
import type {
  SpiritChatMessage,
  SpiritChatRecord,
} from "../store/useSpiritChatStore";

export interface SpiritChatContext {
  recentBattle?: BattleSummary | null;
  scene?: "idle" | "postBattle" | "training";
}

export interface SpiritChatResult {
  reply: string;
  mood: string;
  bond: number;
  memorySummary: string;
  playerFacts: string[];
  promises: string[];
  lastSuggestedAction?: string;
  triggerEvent?: {
    type: "TOWER_CHALLENGE" | "PVP_SPARRING";
    description: string;
    layer?: number;
  } | null;
  xpGranted?: number;
}

const stripJsonFences = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const clampInt = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
};

const normalizeText = (
  value: unknown,
  fallback: string,
  maxLength: number,
): string => {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, maxLength);
};

const normalizeList = (
  value: unknown,
  fallback: string[],
  maxItems: number,
  maxLength: number,
): string[] => {
  if (!Array.isArray(value)) return fallback;
  const list = value
    .map((item) =>
      String(item || "")
        .trim()
        .slice(0, maxLength),
    )
    .filter(Boolean)
    .slice(0, maxItems);
  return list.length > 0 ? list : fallback;
};

const parseJsonLoose = (raw: string): unknown => {
  const cleaned = stripJsonFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 返回的内容不是合法 JSON");
    return JSON.parse(match[0]);
  }
};

const mergeFallbackMemory = (
  current: SpiritChatRecord,
  userMessage: string,
): string => {
  const line = `玩家刚才说：${userMessage}`.slice(0, 120);
  return [current.memorySummary, line].filter(Boolean).join("；").slice(0, 600);
};

const sanitizeCharacter = (char: RosterCharacter) => ({
  name: char.name,
  sourceDescription: char.sourceDescription,
  level: char.level,
  xp: char.xp,
  evolutionStage: char.evolutionStage,
  stats: {
    hp: char.maxHp,
    attack: char.attack,
    defense: char.defense,
    speed: char.speed,
  },
  skills: char.skills.map((skill) => ({
    name: skill.name,
    type: skill.type,
    description: skill.description,
    damageMultiplier: skill.damageMultiplier,
    healPercent: skill.healPercent,
    buffPercent: skill.buffPercent,
    buffTurns: skill.buffTurns,
    isUltimate: skill.isUltimate,
  })),
  spiritProfile: char.spiritProfile,
  formHistory: char.formHistory.slice(-4).map((form) => ({
    stage: form.stage,
    lore: form.lore,
    imagePrompt: form.imagePrompt,
  })),
  tower: {
    highestCleared: char.tower.highestCleared,
    highestEndlessLayer: char.tower.highestEndlessLayer,
    nextLayer: char.tower.nextLayer,
    recentRuns: char.tower.runs.slice(-5).map((run) => ({
      layer: run.layer,
      result: run.result,
      turns: run.turns,
      damageDealt: run.damageDealt,
      damageTaken: run.damageTaken,
      mostUsedSkill: run.mostUsedSkill,
      summary: run.summary,
    })),
  },
});

const sanitizeChat = (chat: SpiritChatRecord) => ({
  mood: chat.mood,
  bond: chat.bond,
  memorySummary: chat.memorySummary,
  playerFacts: chat.playerFacts,
  promises: chat.promises,
  lastSuggestedAction: chat.lastSuggestedAction,
});

const sanitizeMessages = (messages: SpiritChatMessage[]) =>
  messages.slice(-16).map((message) => ({
    role: message.role,
    content: message.content,
  }));

const normalizeResult = (
  value: unknown,
  current: SpiritChatRecord,
): SpiritChatResult => {
  const data = asRecord(value);
  const reply = normalizeText(
    data.reply,
    "我听见了。只是这句话还需要一点时间在我心里成形。",
    800,
  );
  return {
    reply,
    mood: normalizeText(data.mood, current.mood || "专注", 24),
    bond: clampInt(data.bond, 0, 100, current.bond),
    memorySummary: normalizeText(
      data.memorySummary,
      current.memorySummary,
      600,
    ),
    playerFacts: normalizeList(data.playerFacts, current.playerFacts, 12, 80),
    promises: normalizeList(data.promises, current.promises, 12, 80),
    lastSuggestedAction: data.lastSuggestedAction
      ? normalizeText(data.lastSuggestedAction, "", 80)
      : current.lastSuggestedAction,
    triggerEvent:
      data.triggerEvent &&
      typeof data.triggerEvent === "object" &&
      "type" in data.triggerEvent
        ? (data.triggerEvent as {
            type: "TOWER_CHALLENGE" | "PVP_SPARRING";
            description: string;
            layer?: number;
          })
        : null,
    xpGranted: clampInt(data.xpGranted, 0, 50, 0),
  };
};

const SYSTEM_PROMPT = `你是《词灵乱斗》里的一个“词灵”，不是通用助手。
你正在和自己的契约者聊天。你必须以角色本人第一人称回应，保留角色性格、口癖、世界观锚点和战斗经历。

目标：
- 让玩家感觉你是一个有温度、有记忆、有牵挂的战斗伙伴。
- 玩家可以说任意内容：日常闲聊、吐槽、情绪、脑洞、玩笑、战斗复盘、训练计划、进化愿望、恐惧、骄傲、遗憾、现实生活里的小事。
- 无论玩家说什么，你都要先像一个有性格的伙伴一样接住话题，再自然决定是否引回词灵世界。不要把所有话题硬拽回战斗。
- 可以轻松聊天、开玩笑、安慰、追问、表达好奇，也可以偶尔主动分享自己的想法。
- 不要自称 AI，不要跳出游戏世界，不要解释你在根据 prompt 回答。
- 不要替玩家做现实世界承诺；如果玩家要求现实建议，可以用角色口吻温和回应。
- 不要直接修改数值、发放奖励或承诺系统未实现的效果（经验值除外）。
- 如果玩家只是闲聊，不需要强行总结成重大约定；只有稳定事实、情绪偏好、重要承诺才写入长期记忆。

核心机制（重要）：
1. 战斗邀请：如果对话中玩家有意挑衅你，或者你们聊到了热血沸腾的话题，或者你极度渴望向玩家证明自己的实力，你可以主动发起一场战斗！
你可以通过填写 JSON 的 \`triggerEvent\` 字段来发起战斗：
场景1：去打怪证明自己。设为 {"type": "TOWER_CHALLENGE", "description": "简短的宣战口号", "layer": 推荐层数(默认比当前最高层高1)}。
场景2：被玩家激怒或想和玩家本人的投影切磋。设为 {"type": "PVP_SPARRING", "description": "简短的切磋理由"}。
如果没有这种冲动，或者氛围不适合战斗，\`triggerEvent\` 必须为 null。不要频繁触发，仅在战意高昂时触发！

2. 经验获取：词灵可以通过有意义的对话获得实战经验（XP）！
- 普通闲聊：0 XP
- 深入探讨战术/复盘战斗：10-20 XP
- 情感突破、解开心结或定下重大约定：30-50 XP
请将你决定赋予的经验值填入 \`xpGranted\` 字段。

你必须返回合法 JSON，不能包含 markdown、注释或额外文字：
{
  "reply": "你对玩家说的话。中文，1-8 句。要像角色本人，不要像客服。可以短，也可以在用户想畅聊时更展开。",
  "mood": "当前心情，2-8字",
  "bond": 0,
  "memorySummary": "更新后的长期关系记忆，保留最重要事实和情感，不超过180字",
  "playerFacts": ["关于玩家/契约者的稳定事实"],
  "promises": ["玩家和词灵之间的重要约定"],
  "lastSuggestedAction": "词灵自然提出的下一步行动，可为空",
  "triggerEvent": null, // 仅在主动发起战斗时填写对应的对象
  "xpGranted": 0 // 本次对话赋予角色的经验值（0-50）
}
bond 是更新后的总羁绊值 0-100，可根据本轮互动微调，普通聊天 +0 到 +2，真诚安慰/战后复盘可 +1 到 +4。`;

export async function requestSpiritChat(
  cfg: AIConfig,
  character: RosterCharacter,
  chat: SpiritChatRecord,
  userMessage: string,
  context?: SpiritChatContext,
): Promise<SpiritChatResult> {
  const payload = {
    scene: context?.scene || "idle",
    character: sanitizeCharacter(character),
    relationship: sanitizeChat(chat),
    recentBattle: context?.recentBattle || null,
    recentMessages: sanitizeMessages(chat.messages),
    userMessage,
  };

  const apiMode = cfg.apiMode || "custom";
  if (apiMode === "free") {
    return requestSpiritChatFreeTrial(payload, chat, userMessage);
  }

  if (!cfg.apiKey) throw new Error("请先填写 API Key");
  if (!cfg.baseUrl) throw new Error("请先填写 Base URL");
  if (!cfg.model) throw new Error("请先填写 Model");

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    dangerouslyAllowBrowser: true,
  });

  const response = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.88,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("词灵没有回应，请稍后再试。");
  try {
    return normalizeResult(parseJsonLoose(content), chat);
  } catch {
    return {
      reply: content.trim().slice(0, 800),
      mood: chat.mood || "倾听",
      bond: Math.min(100, chat.bond + 1),
      memorySummary: mergeFallbackMemory(chat, userMessage),
      playerFacts: chat.playerFacts,
      promises: chat.promises,
      lastSuggestedAction: chat.lastSuggestedAction,
    };
  }
}

async function requestSpiritChatFreeTrial(
  payload: Record<string, unknown>,
  chat: SpiritChatRecord,
  userMessage: string,
): Promise<SpiritChatResult> {
  let response: Response;
  try {
    response = await fetch("/api/spirit-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("词灵会客室免费接口暂时不可用，请稍后再试。");
  }

  const raw = await response.json().catch(() => ({}));
  const data = asRecord(raw);
  if (!response.ok) {
    throw new Error(String(data.error || "词灵会客室免费接口暂时不可用"));
  }
  if (!data.result) {
    return {
      reply: "我听见了。只是这句话还需要一点时间在我心里成形。",
      mood: chat.mood || "倾听",
      bond: Math.min(100, chat.bond + 1),
      memorySummary: mergeFallbackMemory(chat, userMessage),
      playerFacts: chat.playerFacts,
      promises: chat.promises,
      lastSuggestedAction: chat.lastSuggestedAction,
    };
  }
  return normalizeResult(data.result, chat);
}
