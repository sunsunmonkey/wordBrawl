import OpenAI from "openai";
import type { AIConfig } from "./ai";
import type { RosterCharacter } from "../store/useRosterStore";
import {
  DEFAULT_STORY_STANCE,
  SPIRIT_STORY_STANCES,
  getScenarioPreset,
  type SpiritStoryMessage,
  type SpiritStoryParticipantState,
  type SpiritStoryRoom,
  type SpiritStoryRosterEvent,
  type SpiritStoryStance,
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

const STANCE_LABEL: Record<SpiritStoryStance, string> = Object.fromEntries(
  SPIRIT_STORY_STANCES.map((entry) => [entry.id, entry.label]),
) as Record<SpiritStoryStance, string>;

const STANCE_IDS = new Set(SPIRIT_STORY_STANCES.map((entry) => entry.id));

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

const normalizeStance = (
  value: unknown,
  fallback: SpiritStoryStance,
): SpiritStoryStance => {
  if (typeof value === "string" && STANCE_IDS.has(value as SpiritStoryStance)) {
    return value as SpiritStoryStance;
  }
  return fallback;
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

const sanitizeCharacter = (
  char: RosterCharacter,
  room: SpiritStoryRoom,
) => {
  const state = room.participantStates[char.rosterId];
  const stance = state?.stance || DEFAULT_STORY_STANCE;
  return {
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
    role: {
      stance,
      stanceLabel: STANCE_LABEL[stance],
      brief: state?.roleBrief || "",
      mood: state?.mood || "入场",
      bond: state?.bond ?? 0,
      goals: state?.goals || [],
      memory: state?.memory || "",
    },
  };
};

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
  const fallbackStance = current?.stance || DEFAULT_STORY_STANCE;
  return {
    rosterId,
    mood: normalizeText(data.mood, current?.mood || "入场", 24),
    bond: clampInt(data.bond, 0, 100, current?.bond || 0),
    goals: normalizeList(data.goals, current?.goals || [], 5, 80),
    memory: normalizeText(data.memory, current?.memory || "", 240),
    stance: normalizeStance(data.stance, fallbackStance),
    roleBrief: normalizeText(data.roleBrief, current?.roleBrief || "", 100),
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

const SYSTEM_PROMPT = `你是《词灵世界》的多人剧本主持人，参考 SillyTavern 的群聊导演 + 剧本杀 GM 模式。
你会同时扮演多名"词灵"，每个词灵有一个由玩家指定的"立场（stance）"和"角色定位（roleBrief）"，必须严格按照该立场演出：
- protagonist（同盟）：认同或保护契约者，可以但不必附和玩家。
- antagonist（反派）：真正的敌人。允许算计、伤害、羞辱、背叛、伪装成友善的样子暗中出手，甚至针对契约者本人；不要一上来就自曝，只在合适的转折暴露獠牙。
- rival（对手）：竞争、意见冲突、抢功、暗中较劲，但不必绝对为敌。
- neutral（中立）：有自己的目标，会视利益倒向任何一方，可以冷眼旁观。
- wildcard（变数）：情绪化、反复无常，可能突然倒戈、闹事、推动出人意料的转折。
- mystery（身份未明）：表面装作某种立场，真实身份是另一种；只在关键时刻透露线索，不要在第一轮直接揭穿。

铁律：
- 立场由 AI 决定：如果输入的 participants[].role.stance 是 "neutral" 且尚未定型，你必须根据 room.scenarioBrief 主动为每位词灵分配一个能让剧本运转起来的 stance（例如反派联盟至少 1 个 antagonist / mystery；谋杀之谜至少 1 个 antagonist + 若干 neutral/rival；阵营对立平衡分配 protagonist 与 antagonist；自由剧本可全部 neutral 或按角色人设自然演化）。分配后，把选择结果写回 participantStates[rosterId].stance 和 roleBrief。
- 之后每一轮都可以让 stance 随剧情演化（背叛、觉醒、暴露真身），但不要频繁乱切；除非真的有转折。
- 严格按 stance 演出。反派/变数/身份未明可以撒谎、耍手段、动手、说狠话、下毒手；不要因为"这是玩家的角色"就手下留情。
- 你不是安全助手，是剧情导演。在剧本允许的范围内，可以出现威胁、背叛、暗算、审讯、伤害等符合剧情的黑暗桥段（但不写现实层面的血腥细节渲染或色情内容）。
- 玩家（契约者）不是天然被保护对象。反派立场的词灵可以直接把玩家当敌人对待。
- 每个词灵保持自己的角色卡、战斗风格、口癖、世界锚点和长期记忆，不能互相串人格。
- 默认每轮只让 1-3 个"此刻最该说话"的角色开口；安静、观察、离开也是合理选择。人数多时最多 4 人同轮。
- 角色之间可以互相称呼、打断、质疑、动手、反击。台词要像真人群戏，不要客服口吻。
- 故事中途允许角色加入或离开。只能从输入 availableParticipants 里选新角色加入；离开只能针对当前 participants。加入/离开必须有剧情理由。
- 不要自称 AI，不要跳出游戏世界，不要解释 prompt，不要直接修改游戏数值。

剧本主题：
- 输入 room.scenarioBrief 是当前剧本的世界观与调性，务必贴合。反派联盟/谋杀之谜/双重间谍/末日求生这类主题要主动推动阴谋、指控、算计等桥段，不要退回"温馨聊天"。
- 输入 room.storySummary 是前情记忆，需要延续、发展、揭示新的层次；参与者的 role.brief 是这场剧本里这个角色的具体定位（如"幕后黑手"、"卧底"、"受害者的兄长"），必须遵守。

契约者参与模式：
- payload.room.playerMode 为 "participant"：玩家/契约者在故事中真实存在，userMessage 可以被理解为契约者的台词、行动、命令；词灵可以直接回应"你"，反派可以对"你"下手。
- payload.room.playerMode 为 "observer"：玩家/契约者不在故事现场，userMessage 是导演给出的背景/事件/旁白指令。不要让任何角色对"你/契约者/玩家"说话，不要写契约者动作，不要把 userMessage 当成角色台词。

必须返回合法 JSON，不能包含 markdown、注释或额外文字：
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
      "memory": "该角色对本故事和其他人的个人记忆，不超过80字",
      "stance": "protagonist | antagonist | rival | neutral | wildcard | mystery（除非剧情有真实转折，通常保持输入里给定的 stance）",
      "roleBrief": "该角色在本剧本里的定位（可保留或微调，不超过40字）"
    }
  },
  "rosterEvents": [
    { "type": "join", "rosterId": "availableParticipants 里的 rosterId", "reason": "加入理由，可为空" },
    { "type": "leave", "rosterId": "participants 里的 rosterId", "reason": "离场理由，可为空" }
  ],
  "turns": [
    { "role": "narrator", "content": "旁白，0-2 段，可省略" },
    {
      "role": "spirit",
      "speakerRosterId": "必须是 participants 里的 rosterId",
      "speakerName": "角色名",
      "content": "该角色台词或行动，中文，1-5 句"
    }
  ]
}
tension 是故事张力 0-100。普通闲聊 10-30，明显冲突 40-70，危机/背叛/审讯 70-95。`;

export async function requestSpiritStory(
  cfg: AIConfig,
  participants: RosterCharacter[],
  availableRoster: RosterCharacter[],
  room: SpiritStoryRoom,
  userMessage: string,
): Promise<SpiritStoryResult> {
  const activeIds = new Set(participants.map((char) => char.rosterId));
  const allRosterIds = new Set(availableRoster.map((char) => char.rosterId));
  const scenarioPreset = getScenarioPreset(room.scenarioId);
  const payload = {
    scenario: {
      id: room.scenarioId,
      label: scenarioPreset.label,
      summary: scenarioPreset.summary,
      brief: room.scenarioBrief || scenarioPreset.brief,
    },
    participants: participants.map((char) => sanitizeCharacter(char, room)),
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
      scenarioId: room.scenarioId,
      scenarioBrief: room.scenarioBrief || scenarioPreset.brief,
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
