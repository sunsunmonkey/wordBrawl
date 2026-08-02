import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  getSafeAiField,
  isAiProtocolFragment,
  sanitizeAiDialogueText,
} from "../utils/aiResponse";

export type SpiritStoryRole = "player" | "narrator" | "spirit";
export type SpiritStoryPlayerMode = "participant" | "observer";
export type SpiritStoryStance =
  | "protagonist"
  | "antagonist"
  | "rival"
  | "neutral"
  | "wildcard"
  | "mystery";

export interface SpiritStoryStanceMeta {
  id: SpiritStoryStance;
  label: string;
  color: string;
  short: string;
  hint: string;
}

export const SPIRIT_STORY_STANCES: SpiritStoryStanceMeta[] = [
  {
    id: "protagonist",
    label: "同盟",
    color: "#66FCF1",
    short: "站在契约者一边",
    hint: "认同或保护契约者，愿意携手推进目标。",
  },
  {
    id: "antagonist",
    label: "反派",
    color: "#FF003C",
    short: "对立 / 威胁",
    hint: "有敌意，可能算计、伤害甚至背叛契约者或他人。",
  },
  {
    id: "rival",
    label: "对手",
    color: "#FFD700",
    short: "竞争但未必为敌",
    hint: "有竞争、意见冲突或利益分歧，未必是绝对敌人。",
  },
  {
    id: "neutral",
    label: "中立",
    color: "#C5C6C7",
    short: "有自己的立场",
    hint: "有自己的目标，不轻易站队，会视情况倒向任何一方。",
  },
  {
    id: "wildcard",
    label: "变数",
    color: "#B14BFF",
    short: "行为难以预测",
    hint: "反复无常，可能突然倒戈、闹事或推动意料之外的转折。",
  },
  {
    id: "mystery",
    label: "身份未明",
    color: "#4ECDC4",
    short: "藏着真实身份",
    hint: "表面伪装成某种立场，真身/真实动机需要在故事中揭穿。",
  },
];

export const DEFAULT_STORY_STANCE: SpiritStoryStance = "neutral";

export interface SpiritStoryScenarioPreset {
  id: string;
  label: string;
  summary: string;
  brief: string;
  suggestedTension: number;
  quickScenes: string[];
}

export const SPIRIT_STORY_SCENARIOS: SpiritStoryScenarioPreset[] = [
  {
    id: "free",
    label: "自由剧本",
    summary: "无固定主题，让词灵自由互动",
    brief: "没有固定主线，词灵们按自身性格自然相处、试探、聊天。",
    suggestedTension: 20,
    quickScenes: [
      "夜里训练场突然停电，只有词灵身上的光还亮着。",
      "让气氛轻松一点，大家围坐下来聊一次真心话。",
      "有人说这里的规则可以被一句话改写，看看他们怎么反应。",
    ],
  },
  {
    id: "villain_alliance",
    label: "反派联盟",
    summary: "词灵之一是幕后黑手，其他人被卷入阴谋",
    brief:
      "这是一场以反派视角为主导的剧本。至少一名词灵是幕后黑手，会伪装、算计、离间队伍。契约者未必是主角，甚至可能是被针对的目标。",
    suggestedTension: 60,
    quickScenes: [
      "反派词灵在暗处布下第一步棋，让某位队友先陷入怀疑。",
      "有人在背后悄悄递出一封写着契约者名字的名单。",
      "让反派主动挑衅其中一名同盟，逼他表态。",
    ],
  },
  {
    id: "faction_war",
    label: "阵营对立",
    summary: "词灵被分为敌对阵营，为立场发生冲突",
    brief:
      "词灵们被划入不同阵营，因立场、信念、势力发生对立，会互相试探、结盟、背刺。契约者需要处理阵营间张力。",
    suggestedTension: 55,
    quickScenes: [
      "两大阵营的词灵在同一间会议室里被迫谈判。",
      "让阵营领袖率先发出最后通牒。",
      "有人从桌下踢了另一阵营一脚，看谁先动手。",
    ],
  },
  {
    id: "mystery",
    label: "谋杀之谜",
    summary: "凶手就在这几人之中，需要推理和试探",
    brief:
      "一起事件（谋杀、失窃、背叛）刚刚发生。凶手/嫌疑人就在出场词灵之中，其余人各有动机与嫌疑。契约者是主持推理的调查者。",
    suggestedTension: 65,
    quickScenes: [
      "现场发现一枚只属于其中一人的信物。",
      "让其中一位词灵率先站出来指控另一个人。",
      "契约者宣布：三分钟内，凶手必须自曝身份，否则所有人都会被牵连。",
    ],
  },
  {
    id: "jianghu",
    label: "江湖恩怨",
    summary: "旧怨、门派、师承与恩仇",
    brief:
      "江湖场景，有师承、旧怨、恩仇。词灵可能有前世／门派仇恨，也可能是隐藏的正邪双身。允许出现刀光、酒肆、江湖规矩。",
    suggestedTension: 45,
    quickScenes: [
      "酒馆里，一名词灵认出了当年灭他门派的仇人。",
      "让江湖前辈提出一场比武立誓。",
      "有人拍下一封血书压在桌上。",
    ],
  },
  {
    id: "apocalypse",
    label: "末日求生",
    summary: "资源紧缺的极端环境，人性会摇摆",
    brief:
      "末日或灾难场景，资源和信任都稀缺。角色可能背叛、抛弃队友，也可能反常地暴露善意。允许出现极端选择。",
    suggestedTension: 70,
    quickScenes: [
      "补给只够两个人，让他们决定谁被留下。",
      "有人在夜里悄悄多拿了一份口粮。",
      "远处的警报响了，让最擅长逃跑的词灵先说话。",
    ],
  },
  {
    id: "spy",
    label: "双重间谍",
    summary: "至少一人有隐藏身份，正邪难辨",
    brief:
      "谍战场景。至少一名词灵是卧底或双面间谍。允许伪装、暗号、诱导、假消息。契约者可能是被利用的一方，也可能是知情者。",
    suggestedTension: 60,
    quickScenes: [
      "有人递给契约者一份加密纸条，只让其中一人看。",
      "让卧底词灵找机会单独接近目标。",
      "警笛在外面响起，谁最先想跑？",
    ],
  },
  {
    id: "trial",
    label: "词灵审判",
    summary: "一场审判，被审者可能有罪或蒙冤",
    brief:
      "一场庭审场景。其中一名词灵是被告，其他人是证人／检方／辩方／法官。真相未定，判决方向由剧情推动。契约者可担任任意角色。",
    suggestedTension: 55,
    quickScenes: [
      "让被告词灵先做开庭陈述。",
      "检方词灵抛出一份意料之外的物证。",
      "契约者敲下法槌，让所有人闭嘴听判决。",
    ],
  },
];

export const DEFAULT_STORY_SCENARIO_ID = "free";

export const getScenarioPreset = (
  id: string | undefined,
): SpiritStoryScenarioPreset =>
  SPIRIT_STORY_SCENARIOS.find((entry) => entry.id === id) ||
  SPIRIT_STORY_SCENARIOS[0];

export interface SpiritStoryMessage {
  id: string;
  role: SpiritStoryRole;
  content: string;
  createdAt: number;
  speakerRosterId?: string;
  speakerName?: string;
}

export interface SpiritStoryParticipantState {
  rosterId: string;
  mood: string;
  bond: number;
  goals: string[];
  memory: string;
  stance: SpiritStoryStance;
  roleBrief: string;
}

export interface SpiritStoryRosterEvent {
  type: "join" | "leave";
  rosterId: string;
  reason?: string;
}

export interface SpiritStoryNovelChapter {
  id: string;
  content: string;
  sourceMessageCount: number;
  sourceLastMessageId: string;
  sourceThroughCreatedAt: number;
  generatedAt: number;
}

export interface SpiritStoryStreamingState {
  roomId: string;
  requestId: string;
  startedAt: number;
  turns: Array<{
    role: SpiritStoryRole;
    content: string;
    speakerRosterId?: string;
    speakerName?: string;
  }>;
}

export interface SpiritStoryRoomRuntime {
  error: string;
  isSending: boolean;
  storyRequestId?: string;
  streamingStory: SpiritStoryStreamingState | null;
  isNovelGenerating: boolean;
  novelRequestId?: string;
  novelStreamingContent: string;
  novelError: string;
}

export interface SpiritStoryRoom {
  id: string;
  title: string;
  participantRosterIds: string[];
  playerMode: SpiritStoryPlayerMode;
  scenarioId: string;
  scenarioBrief: string;
  messages: SpiritStoryMessage[];
  storySummary: string;
  scene: string;
  tension: number;
  participantStates: Record<string, SpiritStoryParticipantState>;
  novelChapters: SpiritStoryNovelChapter[];
  createdAt: number;
  updatedAt: number;
}

export interface SpiritStoryRoleAssignment {
  rosterId: string;
  stance: SpiritStoryStance;
  roleBrief?: string;
}

export interface SpiritStoryComposeInput {
  participantRosterIds: string[];
  scenarioId: string;
  scenarioBrief?: string;
  playerMode?: SpiritStoryPlayerMode;
  title?: string;
  roleAssignments?: SpiritStoryRoleAssignment[];
}

interface SpiritStoryStore {
  rooms: Record<string, SpiritStoryRoom>;
  activeRoomId: string | null;
  runtimeByRoomId: Record<string, SpiritStoryRoomRuntime>;
  setActiveRoomId: (roomId: string | null) => void;
  updateRoomRuntime: (
    roomId: string,
    updates: Partial<SpiritStoryRoomRuntime>,
  ) => void;
  clearRoomRuntime: (roomId: string) => void;
  createRoom: (input: SpiritStoryComposeInput) => SpiritStoryRoom;
  updateRoomScenario: (
    roomId: string,
    updates: { scenarioId?: string; scenarioBrief?: string; title?: string },
  ) => void;
  setRoomParticipants: (roomId: string, participantRosterIds: string[]) => void;
  setPlayerMode: (roomId: string, mode: SpiritStoryPlayerMode) => void;
  setParticipantRole: (
    roomId: string,
    rosterId: string,
    updates: { stance?: SpiritStoryStance; roleBrief?: string },
  ) => void;
  appendMessage: (
    roomId: string,
    message: Omit<SpiritStoryMessage, "id" | "createdAt"> &
      Partial<Pick<SpiritStoryMessage, "id" | "createdAt">>,
  ) => SpiritStoryMessage;
  applyStoryTurn: (
    roomId: string,
    messages: Array<
      Omit<SpiritStoryMessage, "id" | "createdAt"> &
        Partial<Pick<SpiritStoryMessage, "id" | "createdAt">>
    >,
    updates: Partial<
      Pick<
        SpiritStoryRoom,
        "title" | "storySummary" | "scene" | "tension" | "participantStates"
      >
    > & { rosterEvents?: SpiritStoryRosterEvent[] },
  ) => void;
  appendNovelChapter: (
    roomId: string,
    chapter: SpiritStoryNovelChapter,
  ) => void;
  clearRoom: (roomId: string) => void;
  deleteRoom: (roomId: string) => void;
}

const MAX_MESSAGES = 80;
const MAX_PARTICIPANTS = 10;
const MAX_GOALS = 5;
const DEFAULT_ROOM_RUNTIME: SpiritStoryRoomRuntime = {
  error: "",
  isSending: false,
  streamingStory: null,
  isNovelGenerating: false,
  novelStreamingContent: "",
  novelError: "",
};
const STANCE_IDS = new Set<SpiritStoryStance>(
  SPIRIT_STORY_STANCES.map((entry) => entry.id),
);

export const makeNewSpiritStoryRoomId = () =>
  `story:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const makeMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const normalizeStance = (
  value: unknown,
  fallback: SpiritStoryStance = DEFAULT_STORY_STANCE,
): SpiritStoryStance => {
  if (typeof value === "string" && STANCE_IDS.has(value as SpiritStoryStance)) {
    return value as SpiritStoryStance;
  }
  return fallback;
};

const normalizeScenarioId = (value: unknown): string => {
  const raw = String(value || "").trim();
  return SPIRIT_STORY_SCENARIOS.some((entry) => entry.id === raw)
    ? raw
    : DEFAULT_STORY_SCENARIO_ID;
};

const normalizeParticipantIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  value.forEach((item) => {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    list.push(id);
  });
  return list.slice(0, MAX_PARTICIPANTS);
};

const normalizeStringList = (value: unknown, max: number): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, max);
};

const clampInt = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
};

const createParticipantState = (
  rosterId: string,
  init?: Partial<SpiritStoryParticipantState>,
): SpiritStoryParticipantState => ({
  rosterId,
  mood: init?.mood?.slice(0, 24) || "入场",
  bond: clampInt(init?.bond, 0, 100, 0),
  goals: normalizeStringList(init?.goals, MAX_GOALS).map((g) => g.slice(0, 80)),
  memory: (init?.memory || "").slice(0, 240),
  stance: normalizeStance(init?.stance),
  roleBrief: (init?.roleBrief || "").slice(0, 100),
});

const normalizeParticipantState = (
  rosterId: string,
  value: Partial<SpiritStoryParticipantState> | undefined,
): SpiritStoryParticipantState => {
  if (!value) return createParticipantState(rosterId);
  return {
    rosterId,
    mood: String(value.mood || "入场").slice(0, 24),
    bond: clampInt(value.bond, 0, 100, 0),
    goals: normalizeStringList(value.goals, MAX_GOALS).map((goal) =>
      goal.slice(0, 80),
    ),
    memory: String(value.memory || "").slice(0, 240),
    stance: normalizeStance(value.stance),
    roleBrief: String(value.roleBrief || "").slice(0, 100),
  };
};

const buildDefaultTitle = (scenarioId: string): string => {
  const preset = getScenarioPreset(scenarioId);
  return preset.id === "free" ? "自由剧本" : preset.label;
};

const createDefaultRoom = (
  input: SpiritStoryComposeInput,
  roomId?: string | null,
): SpiritStoryRoom => {
  const ids = normalizeParticipantIds(input.participantRosterIds);
  const scenarioId = normalizeScenarioId(input.scenarioId);
  const preset = getScenarioPreset(scenarioId);
  const now = Date.now();
  const roleMap = new Map<string, SpiritStoryRoleAssignment>();
  (input.roleAssignments || []).forEach((entry) => {
    if (!entry?.rosterId) return;
    roleMap.set(entry.rosterId, entry);
  });

  return {
    id: roomId || makeNewSpiritStoryRoomId(),
    title: String(input.title || buildDefaultTitle(scenarioId)).slice(0, 40),
    participantRosterIds: ids,
    playerMode:
      input.playerMode === "participant" || input.playerMode === "observer"
        ? input.playerMode
        : "observer",
    scenarioId,
    scenarioBrief: String(input.scenarioBrief || preset.brief).slice(0, 300),
    messages: [],
    storySummary: "",
    scene: preset.id === "free" ? "初次集结" : `${preset.label}·开场`,
    tension: preset.suggestedTension,
    participantStates: Object.fromEntries(
      ids.map((rosterId) => {
        const override = roleMap.get(rosterId);
        return [
          rosterId,
          createParticipantState(rosterId, {
            stance: override?.stance,
            roleBrief: override?.roleBrief,
          }),
        ];
      }),
    ),
    novelChapters: [],
    createdAt: now,
    updatedAt: now,
  };
};

const normalizeMessage = (
  message: Partial<SpiritStoryMessage>,
): SpiritStoryMessage | null => {
  const role = message.role;
  const rawContent = String(message.content || "").trim();
  if (role !== "player" && isAiProtocolFragment(rawContent)) {
    return null;
  }
  const content =
    role === "player"
      ? rawContent
      : sanitizeAiDialogueText(
          getSafeAiField(
            rawContent,
            "content",
            "故事的词意暂时紊乱，片刻后再继续推进吧。",
            1200,
          ),
        );
  if (
    (role !== "player" && role !== "narrator" && role !== "spirit") ||
    !content
  ) {
    return null;
  }
  return {
    id: String(message.id || makeMessageId()),
    role,
    content: content.slice(0, 1200),
    createdAt:
      typeof message.createdAt === "number" ? message.createdAt : Date.now(),
    speakerRosterId: message.speakerRosterId
      ? String(message.speakerRosterId)
      : undefined,
    speakerName: message.speakerName
      ? String(message.speakerName).slice(0, 32)
      : undefined,
  };
};

const normalizeRoom = (
  roomId: string,
  value: Partial<SpiritStoryRoom> | undefined,
): SpiritStoryRoom => {
  if (!value)
    return createDefaultRoom(
      { participantRosterIds: [], scenarioId: DEFAULT_STORY_SCENARIO_ID },
      roomId,
    );
  const participantRosterIds = normalizeParticipantIds(
    value.participantRosterIds,
  );
  const participantStates: Record<string, SpiritStoryParticipantState> = {};
  participantRosterIds.forEach((rosterId) => {
    participantStates[rosterId] = normalizeParticipantState(
      rosterId,
      value.participantStates?.[rosterId],
    );
  });
  const scenarioId = normalizeScenarioId(value.scenarioId);
  const preset = getScenarioPreset(scenarioId);
  const messages = Array.isArray(value.messages)
    ? value.messages
        .map((message) => normalizeMessage(message))
        .filter((message): message is SpiritStoryMessage => Boolean(message))
        .slice(-MAX_MESSAGES)
    : [];
  const legacyNovelDraft = (
    value as Partial<SpiritStoryRoom> & {
      novelDraft?: {
        content?: unknown;
        sourceMessageCount?: unknown;
        generatedAt?: unknown;
      };
    }
  ).novelDraft;
  const normalizedChapters = Array.isArray(value.novelChapters)
    ? value.novelChapters
        .map((chapter, index): SpiritStoryNovelChapter | null => {
          const content = String(chapter?.content || "").trim();
          if (!content) return null;
          const fallbackMessage = messages.at(
            Math.min(
              messages.length,
              clampInt(
                chapter.sourceMessageCount,
                0,
                MAX_MESSAGES,
                messages.length,
              ),
            ) - 1,
          );
          return {
            id: String(chapter.id || `chapter-${index + 1}-${Date.now()}`),
            content: content.slice(0, 60000),
            sourceMessageCount: clampInt(
              chapter.sourceMessageCount,
              0,
              MAX_MESSAGES,
              0,
            ),
            sourceLastMessageId: String(
              chapter.sourceLastMessageId || fallbackMessage?.id || "",
            ),
            sourceThroughCreatedAt:
              typeof chapter.sourceThroughCreatedAt === "number"
                ? chapter.sourceThroughCreatedAt
                : fallbackMessage?.createdAt || 0,
            generatedAt:
              typeof chapter.generatedAt === "number"
                ? chapter.generatedAt
                : Date.now(),
          };
        })
        .filter((chapter): chapter is SpiritStoryNovelChapter =>
          Boolean(chapter),
        )
        .slice(-40)
    : [];
  if (
    normalizedChapters.length === 0 &&
    legacyNovelDraft &&
    typeof legacyNovelDraft.content === "string" &&
    legacyNovelDraft.content.trim()
  ) {
    const sourceMessageCount = clampInt(
      legacyNovelDraft.sourceMessageCount,
      0,
      MAX_MESSAGES,
      messages.length,
    );
    const lastSourceMessage = messages.at(sourceMessageCount - 1);
    normalizedChapters.push({
      id: `chapter-1-${Date.now()}`,
      content: legacyNovelDraft.content.trim().slice(0, 60000),
      sourceMessageCount,
      sourceLastMessageId: lastSourceMessage?.id || "",
      sourceThroughCreatedAt: lastSourceMessage?.createdAt || 0,
      generatedAt:
        typeof legacyNovelDraft.generatedAt === "number"
          ? legacyNovelDraft.generatedAt
          : Date.now(),
    });
  }

  return {
    id: roomId,
    title: String(value.title || buildDefaultTitle(scenarioId)).slice(0, 40),
    participantRosterIds,
    playerMode:
      value.playerMode === "observer" || value.playerMode === "participant"
        ? value.playerMode
        : "observer",
    scenarioId,
    scenarioBrief: String(value.scenarioBrief || preset.brief).slice(0, 300),
    messages,
    storySummary: String(value.storySummary || "").slice(0, 900),
    scene: String(value.scene || preset.label).slice(0, 80),
    tension: clampInt(value.tension, 0, 100, preset.suggestedTension),
    participantStates,
    novelChapters: normalizedChapters,
    createdAt:
      typeof value.createdAt === "number" ? value.createdAt : Date.now(),
    updatedAt:
      typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
  };
};

const normalizeParticipantMap = (
  participantRosterIds: string[],
  current: Record<string, SpiritStoryParticipantState>,
  updates?: Record<string, SpiritStoryParticipantState>,
) =>
  Object.fromEntries(
    participantRosterIds.map((rosterId) => {
      const currentState = current[rosterId];
      const incoming = updates?.[rosterId];
      const merged: Partial<SpiritStoryParticipantState> = {
        ...(currentState || {}),
        ...(incoming || {}),
        stance: normalizeStance(
          incoming?.stance ?? currentState?.stance,
          currentState?.stance || DEFAULT_STORY_STANCE,
        ),
        roleBrief:
          incoming?.roleBrief !== undefined
            ? incoming.roleBrief
            : currentState?.roleBrief || "",
      };
      return [rosterId, normalizeParticipantState(rosterId, merged)];
    }),
  );

const toMessage = (
  message: Omit<SpiritStoryMessage, "id" | "createdAt"> &
    Partial<Pick<SpiritStoryMessage, "id" | "createdAt">>,
): SpiritStoryMessage => {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return {
      id: makeMessageId(),
      role: "narrator",
      content: "",
      createdAt: Date.now(),
    };
  }
  return normalized;
};

export const useSpiritStoryStore = create<SpiritStoryStore>()(
  persist(
    (set) => ({
      rooms: {},
      activeRoomId: null,
      runtimeByRoomId: {},
      setActiveRoomId: (roomId) => set({ activeRoomId: roomId }),
      updateRoomRuntime: (roomId, updates) =>
        set((state) => ({
          runtimeByRoomId: {
            ...state.runtimeByRoomId,
            [roomId]: {
              ...DEFAULT_ROOM_RUNTIME,
              ...state.runtimeByRoomId[roomId],
              ...updates,
            },
          },
        })),
      clearRoomRuntime: (roomId) =>
        set((state) => {
          if (!state.runtimeByRoomId[roomId]) return state;
          const runtimeByRoomId = { ...state.runtimeByRoomId };
          delete runtimeByRoomId[roomId];
          return { runtimeByRoomId };
        }),
      createRoom: (input) => {
        const created = createDefaultRoom(input, makeNewSpiritStoryRoomId());
        set((state) => ({
          activeRoomId: created.id,
          rooms: { ...state.rooms, [created.id]: created },
        }));
        return created;
      },
      updateRoomScenario: (roomId, updates) => {
        set((state) => {
          const current = normalizeRoom(roomId, state.rooms[roomId]);
          const scenarioId =
            updates.scenarioId !== undefined
              ? normalizeScenarioId(updates.scenarioId)
              : current.scenarioId;
          const preset = getScenarioPreset(scenarioId);
          return {
            rooms: {
              ...state.rooms,
              [roomId]: {
                ...current,
                scenarioId,
                scenarioBrief:
                  updates.scenarioBrief !== undefined
                    ? String(updates.scenarioBrief).slice(0, 300)
                    : scenarioId !== current.scenarioId
                      ? preset.brief
                      : current.scenarioBrief,
                title:
                  updates.title !== undefined
                    ? String(updates.title).slice(0, 40)
                    : scenarioId !== current.scenarioId
                      ? buildDefaultTitle(scenarioId)
                      : current.title,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },
      setRoomParticipants: (roomId, participantRosterIds) => {
        set((state) => {
          const current = normalizeRoom(roomId, state.rooms[roomId]);
          const ids = normalizeParticipantIds(participantRosterIds);
          if (ids.length < 2) return state;
          return {
            rooms: {
              ...state.rooms,
              [roomId]: {
                ...current,
                participantRosterIds: ids,
                participantStates: normalizeParticipantMap(
                  ids,
                  current.participantStates,
                ),
                updatedAt: Date.now(),
              },
            },
          };
        });
      },
      setPlayerMode: (roomId, mode) => {
        set((state) => {
          const current = normalizeRoom(roomId, state.rooms[roomId]);
          return {
            rooms: {
              ...state.rooms,
              [roomId]: {
                ...current,
                playerMode: mode,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },
      setParticipantRole: (roomId, rosterId, updates) => {
        set((state) => {
          const current = normalizeRoom(roomId, state.rooms[roomId]);
          const existing =
            current.participantStates[rosterId] ||
            createParticipantState(rosterId);
          const nextState = normalizeParticipantState(rosterId, {
            ...existing,
            stance:
              updates.stance !== undefined ? updates.stance : existing.stance,
            roleBrief:
              updates.roleBrief !== undefined
                ? updates.roleBrief
                : existing.roleBrief,
          });
          return {
            rooms: {
              ...state.rooms,
              [roomId]: {
                ...current,
                participantStates: {
                  ...current.participantStates,
                  [rosterId]: nextState,
                },
                updatedAt: Date.now(),
              },
            },
          };
        });
      },
      appendMessage: (roomId, rawMessage) => {
        const message = toMessage(rawMessage);
        set((state) => {
          const current = normalizeRoom(roomId, state.rooms[roomId]);
          return {
            rooms: {
              ...state.rooms,
              [roomId]: {
                ...current,
                messages: [...current.messages, message].slice(-MAX_MESSAGES),
                updatedAt: Date.now(),
              },
            },
          };
        });
        return message;
      },
      applyStoryTurn: (roomId, rawMessages, updates) => {
        const messages = rawMessages.map(toMessage).filter((message) => {
          return Boolean(message.content.trim());
        });
        set((state) => {
          const current = normalizeRoom(roomId, state.rooms[roomId]);
          const nextParticipantIds = normalizeParticipantIds([
            ...current.participantRosterIds.filter(
              (rosterId) =>
                !updates.rosterEvents?.some(
                  (event) =>
                    event.type === "leave" && event.rosterId === rosterId,
                ),
            ),
            ...(updates.rosterEvents || [])
              .filter((event) => event.type === "join")
              .map((event) => event.rosterId),
          ]);
          return {
            rooms: {
              ...state.rooms,
              [roomId]: {
                ...current,
                participantRosterIds:
                  nextParticipantIds.length >= 2
                    ? nextParticipantIds
                    : current.participantRosterIds,
                messages: [...current.messages, ...messages].slice(
                  -MAX_MESSAGES,
                ),
                title:
                  updates.title !== undefined
                    ? String(updates.title || current.title).slice(0, 40)
                    : current.title,
                storySummary:
                  updates.storySummary !== undefined
                    ? String(updates.storySummary).slice(0, 900)
                    : current.storySummary,
                scene:
                  updates.scene !== undefined
                    ? String(updates.scene || current.scene).slice(0, 80)
                    : current.scene,
                tension:
                  updates.tension !== undefined
                    ? clampInt(updates.tension, 0, 100, current.tension)
                    : current.tension,
                participantStates:
                  updates.participantStates !== undefined
                    ? normalizeParticipantMap(
                        nextParticipantIds.length >= 2
                          ? nextParticipantIds
                          : current.participantRosterIds,
                        current.participantStates,
                        updates.participantStates,
                      )
                    : current.participantStates,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },
      appendNovelChapter: (roomId, chapter) =>
        set((state) => {
          const current = normalizeRoom(roomId, state.rooms[roomId]);
          const content = chapter.content.trim();
          if (!content) return state;
          return {
            rooms: {
              ...state.rooms,
              [roomId]: {
                ...current,
                novelChapters: [
                  ...current.novelChapters,
                  {
                    ...chapter,
                    content: content.slice(0, 60000),
                    sourceMessageCount: clampInt(
                      chapter.sourceMessageCount,
                      1,
                      MAX_MESSAGES,
                      current.messages.length,
                    ),
                  },
                ].slice(-40),
                updatedAt: Date.now(),
              },
            },
          };
        }),
      clearRoom: (roomId) =>
        set((state) => {
          const current = normalizeRoom(roomId, state.rooms[roomId]);
          const reset = createDefaultRoom(
            {
              participantRosterIds: current.participantRosterIds,
              scenarioId: current.scenarioId,
              scenarioBrief: current.scenarioBrief,
              playerMode: current.playerMode,
              title: current.title,
              roleAssignments: current.participantRosterIds.map((rosterId) => ({
                rosterId,
                stance:
                  current.participantStates[rosterId]?.stance ||
                  DEFAULT_STORY_STANCE,
                roleBrief: current.participantStates[rosterId]?.roleBrief,
              })),
            },
            current.id,
          );
          return {
            rooms: { ...state.rooms, [current.id]: reset },
          };
        }),
      deleteRoom: (roomId) =>
        set((state) => {
          if (!state.rooms[roomId]) return state;
          const nextRooms = { ...state.rooms };
          const runtimeByRoomId = { ...state.runtimeByRoomId };
          delete nextRooms[roomId];
          delete runtimeByRoomId[roomId];
          return {
            rooms: nextRooms,
            runtimeByRoomId,
            activeRoomId:
              state.activeRoomId === roomId ? null : state.activeRoomId,
          };
        }),
    }),
    {
      name: "word-brawl-spirit-story",
      version: 6,
      partialize: (state) => ({
        rooms: state.rooms,
        activeRoomId: state.activeRoomId,
      }),
      migrate: (persistedState: unknown) => {
        if (!persistedState || typeof persistedState !== "object") {
          return { rooms: {}, activeRoomId: null };
        }
        const state = persistedState as {
          rooms?: Record<string, Partial<SpiritStoryRoom>>;
          activeRoomId?: string | null;
        };
        const rooms: Record<string, SpiritStoryRoom> = {};
        Object.entries(state.rooms || {}).forEach(([roomId, room]) => {
          rooms[roomId] = normalizeRoom(roomId, room);
        });
        return {
          rooms,
          activeRoomId: state.activeRoomId ?? null,
        };
      },
    },
  ),
);
