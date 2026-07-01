import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SpiritStoryRole = "player" | "narrator" | "spirit";
export type SpiritStoryPlayerMode = "participant" | "observer";

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
}

export interface SpiritStoryRosterEvent {
  type: "join" | "leave";
  rosterId: string;
  reason?: string;
}

export interface SpiritStoryRoom {
  id: string;
  title: string;
  participantRosterIds: string[];
  playerMode: SpiritStoryPlayerMode;
  messages: SpiritStoryMessage[];
  storySummary: string;
  scene: string;
  tension: number;
  participantStates: Record<string, SpiritStoryParticipantState>;
  createdAt: number;
  updatedAt: number;
}

interface SpiritStoryStore {
  rooms: Record<string, SpiritStoryRoom>;
  activeRoomId: string | null;
  setActiveRoomId: (roomId: string | null) => void;
  getOrCreateRoom: (
    participantRosterIds: string[],
    title?: string,
    roomId?: string | null,
  ) => SpiritStoryRoom;
  setRoomParticipants: (roomId: string, participantRosterIds: string[]) => void;
  setPlayerMode: (roomId: string, mode: SpiritStoryPlayerMode) => void;
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
  clearRoom: (roomId: string) => void;
}

const MAX_MESSAGES = 80;
const MAX_PARTICIPANTS = 10;
const MAX_GOALS = 5;

export const makeNewSpiritStoryRoomId = () =>
  `story:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const makeMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const normalizeParticipantIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .sort(),
    ),
  ).slice(0, MAX_PARTICIPANTS);
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
): SpiritStoryParticipantState => ({
  rosterId,
  mood: "入场",
  bond: 0,
  goals: [],
  memory: "",
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
  };
};

const createDefaultRoom = (
  participantRosterIds: string[],
  title?: string,
  roomId?: string | null,
): SpiritStoryRoom => {
  const ids = normalizeParticipantIds(participantRosterIds);
  const now = Date.now();
  return {
    id: roomId || makeNewSpiritStoryRoomId(),
    title: String(title || "未命名故事").slice(0, 40),
    participantRosterIds: ids,
    playerMode: "observer",
    messages: [],
    storySummary: "",
    scene: "初次集结",
    tension: 20,
    participantStates: Object.fromEntries(
      ids.map((rosterId) => [rosterId, createParticipantState(rosterId)]),
    ),
    createdAt: now,
    updatedAt: now,
  };
};

const normalizeMessage = (
  message: Partial<SpiritStoryMessage>,
): SpiritStoryMessage | null => {
  const role = message.role;
  const content = String(message.content || "").trim();
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
  if (!value) return createDefaultRoom([]);
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

  return {
    id: roomId,
    title: String(value.title || "未命名故事").slice(0, 40),
    participantRosterIds,
    playerMode:
      value.playerMode === "observer" || value.playerMode === "participant"
        ? value.playerMode
        : "observer",
    messages: Array.isArray(value.messages)
      ? value.messages
          .map((message) => normalizeMessage(message))
          .filter((message): message is SpiritStoryMessage => Boolean(message))
          .slice(-MAX_MESSAGES)
      : [],
    storySummary: String(value.storySummary || "").slice(0, 900),
    scene: String(value.scene || "初次集结").slice(0, 80),
    tension: clampInt(value.tension, 0, 100, 20),
    participantStates,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
  };
};

const normalizeParticipantMap = (
  participantRosterIds: string[],
  current: Record<string, SpiritStoryParticipantState>,
  updates?: Record<string, SpiritStoryParticipantState>,
) =>
  Object.fromEntries(
    participantRosterIds.map((rosterId) => [
      rosterId,
      normalizeParticipantState(
        rosterId,
        updates?.[rosterId] ?? current[rosterId],
      ),
    ]),
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
    (set, get) => ({
      rooms: {},
      activeRoomId: null,
      setActiveRoomId: (roomId) => set({ activeRoomId: roomId }),
      getOrCreateRoom: (participantRosterIds, title, preferredRoomId) => {
        const roomId = preferredRoomId || get().activeRoomId || makeNewSpiritStoryRoomId();
        const existing = get().rooms[roomId];
        if (existing) return normalizeRoom(roomId, existing);
        const created = createDefaultRoom(participantRosterIds, title, roomId);
        set((state) => ({
          activeRoomId: created.id,
          rooms: { ...state.rooms, [created.id]: created },
        }));
        return created;
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
      clearRoom: (roomId) =>
        set((state) => {
          const current = normalizeRoom(roomId, state.rooms[roomId]);
          return {
            rooms: {
              ...state.rooms,
              [roomId]: createDefaultRoom(
                current.participantRosterIds,
                current.title,
                current.id,
              ),
            },
          };
        }),
    }),
    {
      name: "word-brawl-spirit-story",
      version: 1,
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
