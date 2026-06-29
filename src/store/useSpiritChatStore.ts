import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SpiritChatRole = "player" | "spirit";

export interface SpiritChatMessage {
  id: string;
  role: SpiritChatRole;
  content: string;
  createdAt: number;
  xpGranted?: number;
}

export interface SpiritChatTriggerEvent {
  type: "TOWER_CHALLENGE" | "PVP_SPARRING";
  description: string;
  layer?: number;
}

export interface SpiritChatRecord {
  rosterId: string;
  messages: SpiritChatMessage[];
  memorySummary: string;
  mood: string;
  bond: number;
  playerFacts: string[];
  promises: string[];
  lastSuggestedAction?: string;
  triggerEvent?: SpiritChatTriggerEvent | null;
  updatedAt: number;
}

interface SpiritChatStore {
  chats: Record<string, SpiritChatRecord>;
  openRosterId: string | null;
  setOpenRosterId: (rosterId: string | null) => void;
  getOrCreateChat: (rosterId: string) => SpiritChatRecord;
  appendMessage: (
    rosterId: string,
    message: Omit<SpiritChatMessage, "id" | "createdAt"> &
      Partial<Pick<SpiritChatMessage, "id" | "createdAt">>,
  ) => SpiritChatMessage;
  applySpiritReply: (
    rosterId: string,
    message: Omit<SpiritChatMessage, "id" | "createdAt"> &
      Partial<Pick<SpiritChatMessage, "id" | "createdAt">>,
    updates: Partial<
      Pick<
        SpiritChatRecord,
        | "memorySummary"
        | "mood"
        | "bond"
        | "playerFacts"
        | "promises"
        | "lastSuggestedAction"
        | "triggerEvent"
      >
    >,
  ) => void;
  clearChat: (rosterId: string) => void;
}

const MAX_MESSAGES = 40;
const MAX_FACTS = 12;
const MAX_PROMISES = 12;

const makeMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createDefaultChat = (rosterId: string): SpiritChatRecord => ({
  rosterId,
  messages: [],
  memorySummary: "",
  mood: "初识",
  bond: 0,
  playerFacts: [],
  promises: [],
  updatedAt: Date.now(),
});

const normalizeStringList = (value: unknown, max: number): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, max);
};

const normalizeRecord = (
  rosterId: string,
  value: Partial<SpiritChatRecord> | undefined,
): SpiritChatRecord => {
  if (!value) return createDefaultChat(rosterId);
  return {
    rosterId,
    messages: Array.isArray(value.messages)
      ? value.messages
          .filter((message) => message?.role && message?.content)
          .slice(-MAX_MESSAGES)
      : [],
    memorySummary: String(value.memorySummary || "").slice(0, 600),
    mood: String(value.mood || "初识").slice(0, 24),
    bond:
      typeof value.bond === "number"
        ? Math.min(100, Math.max(0, Math.round(value.bond)))
        : 0,
    playerFacts: normalizeStringList(value.playerFacts, MAX_FACTS),
    promises: normalizeStringList(value.promises, MAX_PROMISES),
    lastSuggestedAction: value.lastSuggestedAction
      ? String(value.lastSuggestedAction).slice(0, 80)
      : undefined,
    triggerEvent: value.triggerEvent || null,
    updatedAt:
      typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
  };
};

const toMessage = (
  message: Omit<SpiritChatMessage, "id" | "createdAt"> &
    Partial<Pick<SpiritChatMessage, "id" | "createdAt">>,
): SpiritChatMessage => ({
  id: message.id ?? makeMessageId(),
  role: message.role,
  content: message.content.trim(),
  createdAt: message.createdAt ?? Date.now(),
  xpGranted: message.xpGranted,
});

export const useSpiritChatStore = create<SpiritChatStore>()(
  persist(
    (set, get) => ({
      chats: {},
      openRosterId: null,
      setOpenRosterId: (rosterId) => set({ openRosterId: rosterId }),
      getOrCreateChat: (rosterId) => {
        const existing = get().chats[rosterId];
        if (existing) return normalizeRecord(rosterId, existing);
        const created = createDefaultChat(rosterId);
        set((state) => ({
          chats: { ...state.chats, [rosterId]: created },
        }));
        return created;
      },
      appendMessage: (rosterId, rawMessage) => {
        const message = toMessage(rawMessage);
        set((state) => {
          const current = normalizeRecord(rosterId, state.chats[rosterId]);
          return {
            chats: {
              ...state.chats,
              [rosterId]: {
                ...current,
                messages: [...current.messages, message].slice(-MAX_MESSAGES),
                updatedAt: Date.now(),
              },
            },
          };
        });
        return message;
      },
      applySpiritReply: (rosterId, rawMessage, updates) => {
        const message = toMessage(rawMessage);
        set((state) => {
          const current = normalizeRecord(rosterId, state.chats[rosterId]);
          return {
            chats: {
              ...state.chats,
              [rosterId]: {
                ...current,
                messages: [...current.messages, message].slice(-MAX_MESSAGES),
                memorySummary:
                  updates.memorySummary !== undefined
                    ? String(updates.memorySummary).slice(0, 600)
                    : current.memorySummary,
                mood:
                  updates.mood !== undefined
                    ? String(updates.mood).slice(0, 24)
                    : current.mood,
                bond:
                  updates.bond !== undefined
                    ? Math.min(100, Math.max(0, Math.round(updates.bond)))
                    : current.bond,
                playerFacts:
                  updates.playerFacts !== undefined
                    ? normalizeStringList(updates.playerFacts, MAX_FACTS)
                    : current.playerFacts,
                promises:
                  updates.promises !== undefined
                    ? normalizeStringList(updates.promises, MAX_PROMISES)
                    : current.promises,
                lastSuggestedAction:
                  updates.lastSuggestedAction !== undefined
                    ? updates.lastSuggestedAction
                      ? String(updates.lastSuggestedAction).slice(0, 80)
                      : undefined
                    : current.lastSuggestedAction,
                triggerEvent:
                  updates.triggerEvent !== undefined
                    ? updates.triggerEvent
                    : current.triggerEvent,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },
      clearChat: (rosterId) =>
        set((state) => ({
          chats: { ...state.chats, [rosterId]: createDefaultChat(rosterId) },
        })),
    }),
    {
      name: "word-brawl-spirit-chat",
      version: 1,
      migrate: (persistedState: unknown) => {
        if (!persistedState || typeof persistedState !== "object") {
          return { chats: {}, openRosterId: null };
        }
        const state = persistedState as {
          chats?: Record<string, Partial<SpiritChatRecord>>;
          openRosterId?: string | null;
        };
        const chats: Record<string, SpiritChatRecord> = {};
        Object.entries(state.chats || {}).forEach(([rosterId, record]) => {
          chats[rosterId] = normalizeRecord(rosterId, record);
        });
        return {
          chats,
          openRosterId: state.openRosterId ?? null,
        };
      },
    },
  ),
);
