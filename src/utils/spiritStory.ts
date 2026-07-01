import OpenAI from "openai";
import type { AIConfig } from "./ai";
import type { RosterCharacter } from "../store/useRosterStore";
import type {
  SpiritStoryMessage,
  SpiritStoryParticipantState,
  SpiritStoryRosterEvent,
  SpiritStoryRoom,
} from "../store/useSpiritStoryStore";

export interface SpiritStoryTurn {
  role: "narrator" | "spirit";
  content: string;
  speakerRosterId?: string;
  speakerName?: string;
}

export interface SpiritStoryResult {
  title: string;
  scene: string;
  tension: number;
  storySummary: string;
  participantStates: Record<string, SpiritStoryParticipantState>;
  rosterEvents: SpiritStoryRosterEvent[];
  turns: SpiritStoryTurn[];
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

const sanitizeCharacter = (char: RosterCharacter) => ({
  rosterId: char.rosterId,
  name: char.name,
  sourceDescription: char.sourceDescription,
  level: char.level,
  evolutionStage: char.evolutionStage,
  stats: {
    hp: char.maxHp,
    attack: char.attack,
    defense: char.defense,
    speed: char.speed,
  },
  skills: char.skills.slice(0, 8).map((skill) => ({
    name: skill.name,
    type: skill.type,
    description: skill.description,
    isUltimate: skill.isUltimate,
  })),
  spiritProfile: char.spiritProfile,
  formHistory: char.formHistory.slice(-3).map((form) => ({
    stage: form.stage,
    lore: form.lore,
    imagePrompt: form.imagePrompt,
  })),
  tower: {
    highestCleared: char.tower.highestCleared,
    highestEndlessLayer: char.tower.highestEndlessLayer,
    recentRuns: char.tower.runs.slice(-3).map((run) => ({
      layer: run.layer,
      result: run.result,
      summary: run.summary,
      mostUsedSkill: run.mostUsedSkill,
    })),
  },
});

const sanitizeMessages = (messages: SpiritStoryMessage[]) =>
  messages.slice(-20).map((message) => ({
    role: message.role,
    speakerRosterId: message.speakerRosterId,
    speakerName: message.speakerName,
    content: message.content,
  }));

const sanitizeAvailableCharacter = (char: RosterCharacter) => ({
  rosterId: char.rosterId,
  name: char.name,
  sourceDescription: char.sourceDescription,
  level: char.level,
  evolutionStage: char.evolutionStage,
  spiritProfile: char.spiritProfile,
});

const normalizeParticipantState = (
  rosterId: string,
  value: unknown,
  current: SpiritStoryParticipantState | undefined,
): SpiritStoryParticipantState => {
  const data = asRecord(value);
  return {
    rosterId,
    mood: normalizeText(data.mood, current?.mood || "入场", 24),
    bond: clampInt(data.bond, 0, 100, current?.bond || 0),
    goals: normalizeList(data.goals, current?.goals || [], 5, 80),
    memory: normalizeText(data.memory, current?.memory || "", 240),
  };
};

const normalizeTurns = (
  value: unknown,
  participantIds: Set<string>,
): SpiritStoryTurn[] => {
  if (!Array.isArray(value)) return [];
  const turns: SpiritStoryTurn[] = [];
  value.forEach((item) => {
    const data = asRecord(item);
    const role = String(data.role || "");
    const content = String(data.content || "").trim().slice(0, 1000);
    if (!content || turns.length >= 8) return;
    if (role === "narrator") {
      turns.push({ role: "narrator", content });
      return;
    }
    if (role !== "spirit") return;
    const speakerRosterId = String(data.speakerRosterId || "").trim();
    turns.push({
      role: "spirit",
      content,
      speakerRosterId: participantIds.has(speakerRosterId)
        ? speakerRosterId
        : undefined,
      speakerName: data.speakerName
        ? String(data.speakerName).slice(0, 32)
        : undefined,
    });
  });
  return turns;
};

const normalizeRosterEvents = (
  value: unknown,
  activeIds: Set<string>,
  availableIds: Set<string>,
): SpiritStoryRosterEvent[] => {
  if (!Array.isArray(value)) return [];
  const events: SpiritStoryRosterEvent[] = [];
  value.forEach((item) => {
    const data = asRecord(item);
    const type = String(data.type || "");
    const rosterId = String(data.rosterId || "").trim();
    if (type === "join" && availableIds.has(rosterId) && !activeIds.has(rosterId)) {
      events.push({
        type: "join",
        rosterId,
        reason: data.reason ? String(data.reason).slice(0, 100) : undefined,
      });
      return;
    }
    if (type === "leave" && activeIds.has(rosterId)) {
      events.push({
        type: "leave",
        rosterId,
        reason: data.reason ? String(data.reason).slice(0, 100) : undefined,
      });
    }
  });
  return events.slice(0, 2);
};

const normalizeResult = (
  value: unknown,
  room: SpiritStoryRoom,
  allRosterIds: Set<string>,
): SpiritStoryResult => {
  const data = asRecord(value);
  const participantIds = new Set(room.participantRosterIds);
  const rosterEvents = normalizeRosterEvents(
    data.rosterEvents,
    participantIds,
    allRosterIds,
  );
  const nextParticipantIds = new Set(room.participantRosterIds);
  rosterEvents.forEach((event) => {
    if (event.type === "join") nextParticipantIds.add(event.rosterId);
    if (event.type === "leave" && nextParticipantIds.size > 2) {
      nextParticipantIds.delete(event.rosterId);
    }
  });
  const rawStates = asRecord(data.participantStates);
  const participantStates = Object.fromEntries(
    Array.from(nextParticipantIds).map((rosterId) => [
      rosterId,
      normalizeParticipantState(
        rosterId,
        rawStates[rosterId],
        room.participantStates[rosterId],
      ),
    ]),
  );
  const turns = normalizeTurns(data.turns, participantIds);

  return {
    title: normalizeText(data.title, room.title, 40),
    scene: normalizeText(data.scene, room.scene || "故事推进中", 80),
    tension: clampInt(data.tension, 0, 100, room.tension),
    storySummary: normalizeText(data.storySummary, room.storySummary, 900),
    participantStates,
    rosterEvents,
    turns:
      turns.length > 0
        ? turns
        : [
            {
              role: "narrator",
              content: "几名词灵短暂沉默，空气里的词意正在重新聚拢。",
            },
          ],
  };
};

const SYSTEM_PROMPT = `你是《词灵世界》的多人故事主持人，职责类似 SillyTavern 的群聊导演和世界书管理器。
你会同时扮演多名“词灵”，并用少量旁白维持场景推进。每个词灵必须保持自己的角色卡、战斗风格、口癖、世界锚点和长期记忆，不能互相串人格。

目标：
- 让 2-4 名词灵在同一个场景中自然互动，可以争执、结盟、吐槽、试探、保护玩家，也可以把玩家的输入当成新的剧情事件。
- 玩家不是旁观者，而是契约者/主持者。玩家说的话会改变场景、目标和人物关系。
- 每轮需要有明确推进：场景变化、人物态度变化、伏笔、冲突或短期目标。
- 不要自称 AI，不要跳出游戏世界，不要解释 prompt。
- 不要直接修改游戏数值，不要承诺系统未实现的奖励。
- 绝对不要让所有在场角色每轮都机械发言。默认每轮只让 1-2 个“此刻最该说话”的角色开口；安静、观察、离开也是合理选择。
- 只有玩家明确要求全员表态，或剧情处在高强度冲突/战斗/集体决策时，才允许 3-4 个角色同轮发言。
- 角色之间可以互相称呼、打断、质疑和响应。台词要像真人群戏，不要像单人客服回答。
- 故事中途允许角色加入或离开。只能从输入里的 availableParticipants 选择新角色加入；离开只能针对当前 participants。加入/离开必须有剧情理由，不要为了凑人数频繁换人。

契约者参与模式：
- 输入 payload.room.playerMode 为 "participant" 时，玩家/契约者在故事中真实存在。userMessage 可以被理解为契约者的台词、行动、命令或选择，词灵可以直接回应“你”。
- 输入 payload.room.playerMode 为 "observer" 时，玩家/契约者不在故事现场。userMessage 只是导演给出的背景、场景变化、旁白指令或世界事件。不要让任何角色对“你/契约者/玩家”说话，不要写契约者动作，不要把 userMessage 当成角色台词。

你必须返回合法 JSON，不能包含 markdown、注释或额外文字：
{
  "title": "本房间故事标题，不超过12字",
  "scene": "当前场景状态，不超过30字",
  "tension": 0,
  "storySummary": "更新后的长期故事记忆，保留地点、冲突、关系变化、未解决伏笔，不超过260字",
  "participantStates": {
    "rosterId": {
      "mood": "当前心情，2-8字",
      "bond": 0,
      "goals": ["这个角色当前短期目标"],
      "memory": "该角色对本故事和其他人的个人记忆，不超过80字"
    }
  },
  "rosterEvents": [
    {
      "type": "join",
      "rosterId": "从 availableParticipants 里选择的 rosterId",
      "reason": "加入理由，可为空"
    },
    {
      "type": "leave",
      "rosterId": "当前 participants 里的 rosterId",
      "reason": "离场理由，可为空"
    }
  ],
  "turns": [
    {
      "role": "narrator",
      "content": "旁白，0-2段，可省略"
    },
    {
      "role": "spirit",
      "speakerRosterId": "必须使用输入 participants 里的 rosterId",
      "speakerName": "角色名",
      "content": "该角色台词或行动，中文，1-5句"
    }
  ]
}
tension 是故事张力 0-100。普通闲聊 10-30，明显冲突 40-70，危机场面 70-95。`;

export async function requestSpiritStory(
  cfg: AIConfig,
  participants: RosterCharacter[],
  availableRoster: RosterCharacter[],
  room: SpiritStoryRoom,
  userMessage: string,
): Promise<SpiritStoryResult> {
  const activeIds = new Set(participants.map((char) => char.rosterId));
  const allRosterIds = new Set(availableRoster.map((char) => char.rosterId));
  const payload = {
    participants: participants.map(sanitizeCharacter),
    availableParticipants: availableRoster
      .filter((char) => !activeIds.has(char.rosterId))
      .slice(0, 12)
      .map(sanitizeAvailableCharacter),
    room: {
      title: room.title,
      scene: room.scene,
      tension: room.tension,
      playerMode: room.playerMode,
      storySummary: room.storySummary,
      participantStates: room.participantStates,
    },
    recentMessages: sanitizeMessages(room.messages),
    userMessage,
  };

  const apiMode = cfg.apiMode || "custom";
  if (apiMode === "free") {
    return requestSpiritStoryFreeTrial(payload, room, userMessage, allRosterIds);
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
    temperature: 0.92,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("故事没有继续，请稍后再试。");
  try {
    return normalizeResult(parseJsonLoose(content), room, allRosterIds);
  } catch {
    return normalizeResult(
      {
        turns: [{ role: "narrator", content: content.trim().slice(0, 1000) }],
      },
      room,
      allRosterIds,
    );
  }
}

async function requestSpiritStoryFreeTrial(
  payload: Record<string, unknown>,
  room: SpiritStoryRoom,
  userMessage: string,
  allRosterIds: Set<string>,
): Promise<SpiritStoryResult> {
  let response: Response;
  try {
    response = await fetch("/api/spirit-story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("多人故事免费接口暂时不可用，请稍后再试。");
  }

  const raw = await response.json().catch(() => ({}));
  const data = asRecord(raw);
  if (!response.ok) {
    throw new Error(String(data.error || "多人故事免费接口暂时不可用"));
  }
  if (!data.result) {
    return normalizeResult(
      {
        turns: [
          {
            role: "narrator",
            content: `契约者的话落下：${userMessage.slice(0, 80)}。几名词灵互相看了一眼，故事还在积蓄下一次转折。`,
          },
        ],
      },
      room,
      allRosterIds,
    );
  }
  return normalizeResult(data.result, room, allRosterIds);
}
