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
  type SpiritStoryStance,
} from "../store/useSpiritStoryStore";
import {
  extractPartialArrayObjects,
  extractPartialStringField,
  isJsonArrayFieldComplete,
} from "./jsonStream";
import { getSafeAiField } from "./aiResponse";

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

const normalizeSuggestedPrompts = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) =>
          String(item || "")
            .trim()
            .slice(0, 72),
        )
        .filter(Boolean),
    ),
  ].slice(0, 3);
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

const sanitizeCharacter = (char: RosterCharacter, room: SpiritStoryRoom) => {
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
    const content = getSafeAiField(
      String(data.content || ""),
      "content",
      "",
      1000,
    );
    if (!content || turns.length >= 8) return;
    if (role === "narrator") {
      turns.push({ role: "narrator", content });
      return;
    }
    if (role !== "spirit") return;
    const speakerRosterId = String(data.speakerRosterId || "").trim();
    if (!participantIds.has(speakerRosterId)) return;
    turns.push({
      role: "spirit",
      content,
      speakerRosterId,
      speakerName: data.speakerName
        ? String(data.speakerName).slice(0, 32)
        : undefined,
    });
  });
  return turns;
};

const normalizeResult = (
  value: unknown,
  room: SpiritStoryRoom,
): SpiritStoryResult => {
  const data = asRecord(value);
  const participantIds = new Set(room.participantRosterIds);
  const rawStates = asRecord(data.participantStates);
  const participantStates = Object.fromEntries(
    room.participantRosterIds.map((rosterId) => [
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
- 出场名单由玩家控制。只能让当前 participants 发言或行动，不得让其他角色加入，也不得让当前角色退出。
- 不要自称 AI，不要跳出游戏世界，不要解释 prompt，不要直接修改游戏数值。

剧本主题：
- 输入 room.scenarioBrief 是当前剧本的世界观与调性，务必贴合。反派联盟/谋杀之谜/双重间谍/末日求生这类主题要主动推动阴谋、指控、算计等桥段，不要退回"温馨聊天"。
- 输入 room.storySummary 是前情记忆，需要延续、发展、揭示新的层次；参与者的 role.brief 是这场剧本里这个角色的具体定位（如"幕后黑手"、"卧底"、"受害者的兄长"），必须遵守。

契约者参与模式：
- payload.room.playerMode 为 "participant"：玩家/契约者在故事中真实存在，userMessage 可以被理解为契约者的台词、行动、命令；词灵可以直接回应"你"，反派可以对"你"下手。
- payload.room.playerMode 为 "observer"：玩家/契约者不在故事现场，userMessage 是导演给出的背景/事件/旁白指令。不要让任何角色对"你/契约者/玩家"说话，不要写契约者动作，不要把 userMessage 当成角色台词。

必须返回合法 JSON，不能包含 markdown、注释或额外文字：
{
  "turns": [
    { "role": "narrator", "content": "旁白，0-2 段，可省略" },
    {
      "role": "spirit",
      "speakerRosterId": "必须是 participants 里的 rosterId",
      "speakerName": "角色名",
      "content": "该角色台词或行动，中文，1-5 句"
    }
  ],
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
  }
}
tension 是故事张力 0-100。普通闲聊 10-30，明显冲突 40-70，危机/背叛/审讯 70-95。`;

const SUGGESTION_SYSTEM_PROMPT = `根据多人故事的剧本、当前人物和最新剧情，生成 3 条玩家可直接发送的下一步推进指令。
- 每条是 12-36 字的中文场景指令，具体、有画面感，能自然承接最新剧情。
- 三条分别提供不同推进方向，例如追查线索、放大人物冲突、触发意外、给角色留出选择。
- 必须遵守当前剧本调性与参与者名单；不要让名单外角色加入或离场。
- 不要写角色台词，不要写“继续故事”“接下来发生什么”等空泛指令，不能重复玩家上一条输入。

只返回合法 JSON，不要 markdown、注释或额外文字：
{
  "suggestedPrompts": ["玩家可直接发送的剧情推进指令"]
}`;

const NOVEL_SYSTEM_PROMPT = `你是《词灵世界》的小说编辑。请把输入中的多人故事记录编排成一篇可直接阅读的中文小说正文。

编排要求：
- payload.chapter.number 是当前章序号；只编排 payload.storyMessages 中的新增剧情，payload.chapter.previousEnding 仅用于衔接语气，不得复述进本章。
- 严格保留事件顺序、角色关系、已揭示事实、行动结果和未解伏笔，不擅自续写后续剧情，不补造结局。
- 把 narrator 内容自然融入叙事，把 spirit 台词改成带动作、神态和场景衔接的小说对话。
- observer 模式下，player 的背景指令只转化为故事中实际发生的环境或事件，不出现“玩家、指令、输入”等界面概念。
- participant 模式下，player 代表“契约者”，将其台词和行动自然写进正文。
- 保持每名词灵原有的人格、口吻与立场，不把不同角色的行为混在一起。
- 删除重复寒暄、操作提示和回合制痕迹；允许调整段落与句序以提升节奏，但不能改变原意。
- 使用第三人称有限视角，语言有画面感但克制，避免堆砌辞藻。
- 使用中文引号和自然段。只输出小说正文，不要标题、章节号、Markdown、JSON、创作说明或总结。`;

export interface SpiritStoryStreamHandlers {
  onTurnsChunk?: (turns: SpiritStoryTurn[]) => void;
  onTurnsComplete?: (turns: SpiritStoryTurn[]) => void;
}

export interface SpiritStoryNovelStreamHandlers {
  onContentChunk?: (content: string) => void;
}

const extractPartialTurns = (
  raw: string,
  participantIds: Set<string>,
): SpiritStoryTurn[] => {
  return extractPartialArrayObjects(raw, "turns", (objContent) => {
    const role = extractPartialStringField(`{${objContent}}`, "role");
    const content = getSafeAiField(`{${objContent}}`, "content", "", 1000);
    if (!role && !content) return null;
    const typedRole = role === "spirit" ? "spirit" : "narrator";
    if (typedRole !== "spirit") {
      return { role: "narrator", content: content || "" };
    }
    const speakerRosterId = extractPartialStringField(
      `{${objContent}}`,
      "speakerRosterId",
    ).trim();
    const speakerName = extractPartialStringField(
      `{${objContent}}`,
      "speakerName",
    );
    if (!participantIds.has(speakerRosterId)) return null;
    return {
      role: "spirit",
      content: content || "",
      speakerRosterId,
      ...(speakerName ? { speakerName: speakerName.slice(0, 32) } : {}),
    };
  });
};

const fallbackStoryResult = (
  raw: string,
  room: SpiritStoryRoom,
): SpiritStoryResult => {
  const turns = extractPartialTurns(
    raw,
    new Set(room.participantRosterIds),
  ).filter((turn) => Boolean(turn.content));
  return normalizeResult(
    turns.length > 0
      ? { turns }
      : {
          turns: [
            {
              role: "narrator",
              content: getSafeAiField(
                raw,
                "content",
                "故事的词意暂时紊乱，片刻后再继续推进吧。",
                1000,
              ),
            },
          ],
        },
    room,
  );
};

export async function requestSpiritStory(
  cfg: AIConfig,
  participants: RosterCharacter[],
  room: SpiritStoryRoom,
  userMessage: string,
  handlers?: SpiritStoryStreamHandlers,
): Promise<SpiritStoryResult> {
  const scenarioPreset = getScenarioPreset(room.scenarioId);
  const payload = {
    scenario: {
      id: room.scenarioId,
      label: scenarioPreset.label,
      summary: scenarioPreset.summary,
      brief: room.scenarioBrief || scenarioPreset.brief,
    },
    participants: participants.map((char) => sanitizeCharacter(char, room)),
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
    return requestSpiritStoryFreeTrial(payload, room, userMessage, handlers);
  }

  if (!cfg.apiKey) throw new Error("请先填写 API Key");
  if (!cfg.baseUrl) throw new Error("请先填写 Base URL");
  if (!cfg.model) throw new Error("请先填写 Model");

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    dangerouslyAllowBrowser: true,
  });

  const stream = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.92,
    stream: true,
  });

  let rawContent = "";
  let lastEmittedKey = "";
  let turnsCompleted = false;
  const onTurnsChunk = handlers?.onTurnsChunk;
  const onTurnsComplete = handlers?.onTurnsComplete;
  const participantIds = new Set(room.participantRosterIds);

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;
    rawContent += delta;
    if (!onTurnsChunk && !onTurnsComplete) continue;

    const partialTurns = extractPartialTurns(rawContent, participantIds);
    const key = JSON.stringify(partialTurns);
    if (onTurnsChunk && key !== lastEmittedKey) {
      lastEmittedKey = key;
      onTurnsChunk(partialTurns);
    }
    if (
      !turnsCompleted &&
      partialTurns.some((turn) => turn.content) &&
      isJsonArrayFieldComplete(rawContent, "turns")
    ) {
      turnsCompleted = true;
      onTurnsComplete?.(partialTurns);
    }
  }

  const content = rawContent;
  if (!content) throw new Error("故事没有继续，请稍后再试。");
  try {
    return normalizeResult(parseJsonLoose(content), room);
  } catch {
    return fallbackStoryResult(content, room);
  }
}

export async function requestSpiritStorySuggestions(
  cfg: AIConfig,
  participants: RosterCharacter[],
  room: SpiritStoryRoom,
): Promise<string[]> {
  const scenarioPreset = getScenarioPreset(room.scenarioId);
  const payload = {
    requestType: "suggestions",
    scenario: {
      id: room.scenarioId,
      label: scenarioPreset.label,
      summary: scenarioPreset.summary,
      brief: room.scenarioBrief || scenarioPreset.brief,
    },
    participants: participants.map((char) => sanitizeCharacter(char, room)),
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
  };

  if ((cfg.apiMode || "custom") === "free") {
    const response = await fetch("/api/spirit-story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = asRecord(await response.json().catch(() => ({})));
    if (!response.ok) {
      throw new Error(String(data.error || "故事建议暂时不可用"));
    }
    return normalizeSuggestedPrompts(data.suggestedPrompts);
  }

  if (!cfg.apiKey || !cfg.baseUrl || !cfg.model) {
    throw new Error("请先填写 AI 配置");
  }

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    dangerouslyAllowBrowser: true,
  });
  const response = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: "system", content: SUGGESTION_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.76,
  });
  const content = response.choices[0]?.message?.content;
  if (!content) return [];
  try {
    return normalizeSuggestedPrompts(
      asRecord(parseJsonLoose(content)).suggestedPrompts,
    );
  } catch {
    return [];
  }
}

export async function requestSpiritStoryNovel(
  cfg: AIConfig,
  participants: RosterCharacter[],
  room: SpiritStoryRoom,
  sourceMessages: SpiritStoryMessage[],
  chapterNumber: number,
  previousChapterEnding: string,
  handlers?: SpiritStoryNovelStreamHandlers,
): Promise<string> {
  const scenarioPreset = getScenarioPreset(room.scenarioId);
  const payload = {
    requestType: "novel",
    scenario: {
      id: room.scenarioId,
      label: scenarioPreset.label,
      summary: scenarioPreset.summary,
      brief: room.scenarioBrief || scenarioPreset.brief,
    },
    participants: participants.map((char) => sanitizeCharacter(char, room)),
    room: {
      title: room.title,
      playerMode: room.playerMode,
      storySummary: room.storySummary,
      scenarioId: room.scenarioId,
      scenarioBrief: room.scenarioBrief || scenarioPreset.brief,
      participantStates: room.participantStates,
    },
    chapter: {
      number: chapterNumber,
      previousEnding: previousChapterEnding.slice(-1200),
    },
    storyMessages: sourceMessages.map((message) => ({
      role: message.role,
      speakerRosterId: message.speakerRosterId,
      speakerName: message.speakerName,
      content: message.content,
    })),
  };

  if ((cfg.apiMode || "custom") === "free") {
    return requestSpiritStoryNovelFreeTrial(payload, handlers);
  }

  if (!cfg.apiKey) throw new Error("请先填写 API Key");
  if (!cfg.baseUrl) throw new Error("请先填写 Base URL");
  if (!cfg.model) throw new Error("请先填写 Model");

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    dangerouslyAllowBrowser: true,
  });
  const stream = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: "system", content: NOVEL_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.72,
    stream: true,
  });

  let content = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;
    content += delta;
    handlers?.onContentChunk?.(content);
  }

  const normalized = content.trim();
  if (!normalized) throw new Error("小说编排没有返回正文，请稍后再试。");
  return normalized;
}

async function requestSpiritStoryNovelFreeTrial(
  payload: Record<string, unknown>,
  handlers?: SpiritStoryNovelStreamHandlers,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/spirit-story", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("小说编排接口暂时不可用，请稍后再试。");
  }

  if (!response.ok) {
    const data = asRecord(await response.json().catch(() => ({})));
    throw new Error(String(data.error || "小说编排暂时不可用"));
  }

  if (
    response.body &&
    (response.headers.get("content-type") || "").includes(
      "application/x-ndjson",
    )
  ) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let finalError = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;
        let event: Record<string, unknown>;
        try {
          event = asRecord(JSON.parse(line));
        } catch {
          continue;
        }
        if (event.type === "novel_chunk") {
          content += String(event.delta || "");
          handlers?.onContentChunk?.(content);
        } else if (event.type === "error") {
          finalError = String(event.error || "小说编排失败");
        }
      }
    }

    if (finalError) throw new Error(finalError);
    const normalized = content.trim();
    if (!normalized) throw new Error("小说编排没有返回正文，请稍后再试。");
    return normalized;
  }

  const data = asRecord(await response.json().catch(() => ({})));
  const content = String(data.novelContent || "").trim();
  if (!content) throw new Error("小说编排没有返回正文，请稍后再试。");
  handlers?.onContentChunk?.(content);
  return content;
}

async function requestSpiritStoryFreeTrial(
  payload: Record<string, unknown>,
  room: SpiritStoryRoom,
  userMessage: string,
  handlers?: SpiritStoryStreamHandlers,
): Promise<SpiritStoryResult> {
  let response: Response;
  try {
    response = await fetch("/api/spirit-story", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("多人故事免费接口暂时不可用，请稍后再试。");
  }

  if (
    response.ok &&
    response.body &&
    (response.headers.get("content-type") || "").includes(
      "application/x-ndjson",
    )
  ) {
    return consumeSpiritStoryStream(response, room, handlers);
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
    );
  }
  return normalizeResult(data.result, room);
}

async function consumeSpiritStoryStream(
  response: Response,
  room: SpiritStoryRoom,
  handlers?: SpiritStoryStreamHandlers,
): Promise<SpiritStoryResult> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastEmittedKey = "";
  let finalResult: SpiritStoryResult | null = null;
  let finalError: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      let event: {
        type?: string;
        turns?: SpiritStoryTurn[];
        result?: unknown;
        error?: string;
      };
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (
        event.type === "chunk" &&
        Array.isArray(event.turns) &&
        handlers?.onTurnsChunk
      ) {
        const key = JSON.stringify(event.turns);
        if (key !== lastEmittedKey) {
          lastEmittedKey = key;
          handlers.onTurnsChunk(event.turns);
        }
      } else if (event.type === "turns_done" && Array.isArray(event.turns)) {
        handlers?.onTurnsComplete?.(event.turns);
      } else if (event.type === "done" && event.result) {
        finalResult = normalizeResult(event.result, room);
      } else if (event.type === "error") {
        finalError = String(event.error || "多人故事流式响应失败");
      }
    }
  }

  if (finalResult) return finalResult;
  if (finalError) throw new Error(finalError);
  return normalizeResult({ turns: [] }, room);
}
