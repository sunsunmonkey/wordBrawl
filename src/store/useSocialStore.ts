import { create } from "zustand";
import {
  generateMessageId,
  generateRoomCode,
  MAX_BATTLE_CARRIED_SPIRITS,
  MAX_CARRIED_SPIRITS,
  type ChallengeInvite,
  type SocialBattleReport,
  type SocialBattleState,
  type SocialChatMessage,
  type SocialPlayer,
  type SocialRoom,
  type SocialRoomMode,
  type SerializedSpirit,
} from "./socialTypes";
import {
  MAX_ROOM_MESSAGES,
  PLAYER_OFFLINE_TIMEOUT_MS,
  ROOM_EMPTY_TTL_MS,
  socialTransport,
} from "../utils/socialTransport";
import { usePlayerStore } from "./usePlayerStore";

interface SocialStore {
  /** 当前所在房间 */
  currentRoom: SocialRoom | null;
  /** 当前正在进行的对战（用于 SocialBattleScreen 渲染） */
  activeBattle: SocialBattleState | null;
  /** 是否正在连接房间 */
  isConnecting: boolean;
  /** 错误信息 */
  error: string;

  /** 创建房间 */
  createRoom: (
    spirits: SerializedSpirit[],
    mode?: SocialRoomMode,
  ) => SocialRoom;
  /** 加入房间 */
  joinRoom: (roomCode: string, spirits: SerializedSpirit[]) => boolean;
  /** 离开当前房间 */
  leaveRoom: () => void;
  /** 设置错误 */
  setError: (error: string) => void;

  /** 切换当前出战词灵（在 carriedSpirits 中选一个） */
  setBattleSpirit: (rosterId: string) => void;
  /** 更新自己携带的词灵列表（房间内调整） */
  updateMyCarriedSpirits: (spirits: SerializedSpirit[]) => void;

  /** 发送玩家消息 */
  sendPlayerMessage: (content: string, mentions?: string[]) => void;
  /** 以词灵身份发送消息（LLM 回复后调用） */
  sendSpiritMessage: (
    spirit: SerializedSpirit,
    hostPlayer: SocialPlayer,
    content: string,
  ) => void;
  /** 发送系统消息 */
  sendSystemMessage: (content: string) => void;
  /** 发送战报消息 */
  sendBattleReport: (report: SocialBattleReport) => void;

  /** 发起约战 */
  createChallenge: (toPlayer: SocialPlayer) => void;
  /** 接受/拒绝约战 */
  resolveChallenge: (
    challengeId: string,
    status: "accepted" | "declined",
  ) => void;

  /** 更新对战状态（host 推送给 guest） */
  updateBattleState: (battle: SocialBattleState) => void;
  /** 客机发送对战操作 */
  sendBattleAction: (skillName: string) => void;
  /** 结束对战 */
  finishBattle: (battle: SocialBattleState) => void;
  /** 设置当前对战（进入战斗界面时） */
  setActiveBattle: (battle: SocialBattleState | null) => void;

  /** 内部：根据事件更新房间 */
  applyTransportEvent: (
    event: import("./socialTypes").SocialTransportEvent,
  ) => void;
  /** 内部：从 localStorage 加载房间 */
  hydrateRoom: (roomCode: string) => void;
}

const SYSTEM_COLOR = "#8a8d91";

/** 根据房间模式返回携带词灵上限 */
const carryLimit = (mode: SocialRoomMode): number =>
  mode === "battle" ? MAX_BATTLE_CARRIED_SPIRITS : MAX_CARRIED_SPIRITS;

/** 按房间模式截断携带词灵列表 */
const clampCarried = (
  spirits: SerializedSpirit[],
  mode: SocialRoomMode,
): SerializedSpirit[] => spirits.slice(0, carryLimit(mode));

const buildSystemMessage = (content: string): SocialChatMessage => ({
  id: generateMessageId(),
  type: "system",
  senderId: "system",
  senderName: "系统",
  senderColor: SYSTEM_COLOR,
  content,
  timestamp: Date.now(),
});

const pruneMessages = (messages: SocialChatMessage[]): SocialChatMessage[] =>
  messages.slice(-MAX_ROOM_MESSAGES);

const pruneOfflinePlayers = (room: SocialRoom): SocialRoom => {
  const now = Date.now();
  return {
    ...room,
    players: room.players.filter(
      (p) => now - p.lastSeenAt < PLAYER_OFFLINE_TIMEOUT_MS * 4,
    ),
  };
};

export const useSocialStore = create<SocialStore>()((set, get) => {
  // 订阅传输层事件
  if (typeof window !== "undefined") {
    socialTransport.subscribe((event) => {
      get().applyTransportEvent(event);
    });
  }

  return {
    currentRoom: null,
    activeBattle: null,
    isConnecting: false,
    error: "",

    createRoom: (spirits, mode = "chat") => {
      const { playerId, nickname, avatarColor } = usePlayerStore.getState();
      const roomCode = generateRoomCode();
      const now = Date.now();
      const carried = clampCarried(spirits, mode);
      const me: SocialPlayer = {
        playerId,
        nickname,
        avatarColor,
        carriedSpirits: carried,
        activeSpirit: carried[0] ?? null,
        isOnline: true,
        lastSeenAt: now,
      };
      const room: SocialRoom = {
        roomCode,
        mode,
        players: [me],
        messages:
          mode === "battle"
            ? [
                buildSystemMessage(
                  `${nickname} 开启了 1v1 对战房间 ${roomCode}，等待对手加入`,
                ),
              ]
            : [buildSystemMessage(`${nickname} 创建了房间 ${roomCode}`)],
        activeBattle: null,
        pendingChallenge: null,
        createdAt: now,
        updatedAt: now,
      };
      socialTransport.persistRoom(room);
      socialTransport.broadcast({ kind: "room-state", room });
      set({ currentRoom: room, error: "" });
      return room;
    },

    joinRoom: (roomCode, spirits) => {
      const code = roomCode.trim().toUpperCase();
      if (code.length !== 6) {
        set({ error: "房间码为 6 位字符" });
        return false;
      }
      const existing = socialTransport.loadRoom(code);
      if (!existing) {
        set({ error: `房间 ${code} 不存在或已被销毁` });
        return false;
      }
      const { playerId, nickname, avatarColor } = usePlayerStore.getState();
      const now = Date.now();
      const others = existing.players.filter((p) => p.playerId !== playerId);
      const carried = clampCarried(spirits, existing.mode);
      const me: SocialPlayer = {
        playerId,
        nickname,
        avatarColor,
        carriedSpirits: carried,
        activeSpirit: carried[0] ?? null,
        isOnline: true,
        lastSeenAt: now,
      };
      const updated: SocialRoom = {
        ...existing,
        players: [...others, me],
        messages: pruneMessages([
          ...existing.messages,
          buildSystemMessage(
            existing.mode === "battle"
              ? `${nickname} 加入对战房间，准备开战`
              : `${nickname} 加入了房间`,
          ),
        ]),
        updatedAt: now,
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      socialTransport.broadcast({
        kind: "player-join",
        playerId,
        roomCode: code,
      });
      set({ currentRoom: updated, error: "" });
      return true;
    },

    leaveRoom: () => {
      const room = get().currentRoom;
      if (!room) return;
      const { playerId, nickname } = usePlayerStore.getState();
      const remaining = room.players.filter((p) => p.playerId !== playerId);
      const now = Date.now();
      if (remaining.length === 0) {
        socialTransport.deleteRoom(room.roomCode);
      } else {
        const updated: SocialRoom = {
          ...room,
          players: remaining,
          messages: pruneMessages([
            ...room.messages,
            buildSystemMessage(`${nickname} 离开了房间`),
          ]),
          updatedAt: now,
        };
        socialTransport.persistRoom(updated);
        socialTransport.broadcast({ kind: "room-state", room: updated });
        socialTransport.broadcast({
          kind: "player-leave",
          playerId,
          roomCode: room.roomCode,
        });
      }
      set({ currentRoom: null, activeBattle: null });
    },

    setError: (error) => set({ error }),

    setBattleSpirit: (rosterId) => {
      const room = get().currentRoom;
      if (!room) return;
      const { playerId } = usePlayerStore.getState();
      const updated: SocialRoom = {
        ...room,
        players: room.players.map((p) => {
          if (p.playerId !== playerId) return p;
          const target = p.carriedSpirits.find((s) => s.rosterId === rosterId);
          return target ? { ...p, activeSpirit: target } : p;
        }),
        updatedAt: Date.now(),
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      set({ currentRoom: updated });
    },

    updateMyCarriedSpirits: (spirits) => {
      const room = get().currentRoom;
      if (!room) return;
      const { playerId } = usePlayerStore.getState();
      const carried = clampCarried(spirits, room.mode);
      const updated: SocialRoom = {
        ...room,
        players: room.players.map((p) =>
          p.playerId === playerId
            ? {
                ...p,
                carriedSpirits: carried,
                activeSpirit:
                  carried.find(
                    (s) => s.rosterId === p.activeSpirit?.rosterId,
                  ) ??
                  carried[0] ??
                  null,
              }
            : p,
        ),
        updatedAt: Date.now(),
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      set({ currentRoom: updated });
    },

    sendPlayerMessage: (content, mentions) => {
      const room = get().currentRoom;
      if (!room) return;
      const text = content.trim();
      if (!text) return;
      const { playerId, nickname, avatarColor } = usePlayerStore.getState();
      const message: SocialChatMessage = {
        id: generateMessageId(),
        type: "player",
        senderId: playerId,
        senderName: nickname,
        senderColor: avatarColor,
        content: text,
        timestamp: Date.now(),
        mentions: mentions?.length ? mentions : undefined,
      };
      const updated: SocialRoom = {
        ...room,
        messages: pruneMessages([...room.messages, message]),
        updatedAt: Date.now(),
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      socialTransport.broadcast({
        kind: "chat-message",
        roomCode: room.roomCode,
        message,
      });
      set({ currentRoom: updated });
    },

    sendSpiritMessage: (spirit, hostPlayer, content) => {
      const room = get().currentRoom;
      if (!room) return;
      const message: SocialChatMessage = {
        id: generateMessageId(),
        type: "spirit",
        senderId: spirit.rosterId,
        senderName: spirit.name,
        senderColor: hostPlayer.avatarColor,
        senderAvatar: spirit.imageUrl,
        content,
        timestamp: Date.now(),
        spiritRosterId: spirit.rosterId,
      };
      const updated: SocialRoom = {
        ...room,
        messages: pruneMessages([...room.messages, message]),
        updatedAt: Date.now(),
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      socialTransport.broadcast({
        kind: "chat-message",
        roomCode: room.roomCode,
        message,
      });
      set({ currentRoom: updated });
    },

    sendSystemMessage: (content) => {
      const room = get().currentRoom;
      if (!room) return;
      const message = buildSystemMessage(content);
      const updated: SocialRoom = {
        ...room,
        messages: pruneMessages([...room.messages, message]),
        updatedAt: Date.now(),
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      set({ currentRoom: updated });
    },

    sendBattleReport: (report) => {
      const room = get().currentRoom;
      if (!room) return;
      const message: SocialChatMessage = {
        id: generateMessageId(),
        type: "battle_report",
        senderId: "system",
        senderName: "战报",
        senderColor: "#FFD700",
        content: `${report.winnerNickname} 的 ${report.winnerSpiritName} 击败了 ${report.loserNickname} 的 ${report.loserSpiritName}！共 ${report.totalTurns} 回合。`,
        timestamp: Date.now(),
      };
      const updated: SocialRoom = {
        ...room,
        messages: pruneMessages([...room.messages, message]),
        activeBattle: null,
        pendingChallenge: null,
        updatedAt: Date.now(),
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      set({ currentRoom: updated, activeBattle: null });
    },

    createChallenge: (toPlayer) => {
      const room = get().currentRoom;
      if (!room) return;
      const { playerId, nickname } = usePlayerStore.getState();
      const me = room.players.find((p) => p.playerId === playerId);
      if (!me || !me.activeSpirit || !toPlayer.activeSpirit) return;
      const challenge: ChallengeInvite = {
        id: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fromPlayerId: playerId,
        fromPlayerName: nickname,
        fromSpiritName: me.activeSpirit.name,
        toPlayerId: toPlayer.playerId,
        toPlayerName: toPlayer.nickname,
        toSpiritName: toPlayer.activeSpirit.name,
        createdAt: Date.now(),
        status: "pending",
      };
      const updated: SocialRoom = {
        ...room,
        pendingChallenge: challenge,
        messages: pruneMessages([
          ...room.messages,
          buildSystemMessage(
            `${nickname} 向 ${toPlayer.nickname} 发起约战：${me.activeSpirit.name} vs ${toPlayer.activeSpirit.name}`,
          ),
        ]),
        updatedAt: Date.now(),
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      socialTransport.broadcast({
        kind: "challenge-create",
        roomCode: room.roomCode,
        challenge,
      });
      set({ currentRoom: updated });
    },

    resolveChallenge: (challengeId, status) => {
      const room = get().currentRoom;
      if (!room || !room.pendingChallenge) return;
      if (room.pendingChallenge.id !== challengeId) return;
      const challenge = { ...room.pendingChallenge, status };
      const { nickname } = usePlayerStore.getState();

      if (status === "accepted") {
        // 创建对战状态
        const host = room.players.find(
          (p) => p.playerId === challenge.fromPlayerId,
        );
        const guest = room.players.find(
          (p) => p.playerId === challenge.toPlayerId,
        );
        if (!host || !guest || !host.activeSpirit || !guest.activeSpirit) {
          set({ error: "对战双方信息缺失" });
          return;
        }
        const battle: SocialBattleState = {
          battleId: challenge.id,
          hostPlayerId: host.playerId,
          guestPlayerId: guest.playerId,
          hostNickname: host.nickname,
          guestNickname: guest.nickname,
          hostSpirit: host.activeSpirit,
          guestSpirit: guest.activeSpirit,
          currentTurn: 1,
          hostHp: host.activeSpirit.combatSnapshot.maxHp,
          guestHp: guest.activeSpirit.combatSnapshot.maxHp,
          hostMaxHp: host.activeSpirit.combatSnapshot.maxHp,
          guestMaxHp: guest.activeSpirit.combatSnapshot.maxHp,
          hostCharge: 0,
          guestCharge: 0,
          logs: [],
          phase: "preparing",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const updated: SocialRoom = {
          ...room,
          pendingChallenge: challenge,
          activeBattle: battle,
          messages: pruneMessages([
            ...room.messages,
            buildSystemMessage(
              `${challenge.toPlayerName} 接受了约战！${challenge.fromSpiritName} vs ${challenge.toSpiritName}`,
            ),
          ]),
          updatedAt: Date.now(),
        };
        socialTransport.persistRoom(updated);
        socialTransport.broadcast({ kind: "room-state", room: updated });
        socialTransport.broadcast({
          kind: "challenge-resolve",
          roomCode: room.roomCode,
          challengeId,
          status,
        });
        socialTransport.broadcast({
          kind: "battle-state",
          roomCode: room.roomCode,
          battle,
        });
        set({ currentRoom: updated });
      } else {
        const updated: SocialRoom = {
          ...room,
          pendingChallenge: null,
          messages: pruneMessages([
            ...room.messages,
            buildSystemMessage(`${nickname} 拒绝了约战`),
          ]),
          updatedAt: Date.now(),
        };
        socialTransport.persistRoom(updated);
        socialTransport.broadcast({ kind: "room-state", room: updated });
        socialTransport.broadcast({
          kind: "challenge-resolve",
          roomCode: room.roomCode,
          challengeId,
          status,
        });
        set({ currentRoom: updated });
      }
    },

    updateBattleState: (battle) => {
      const room = get().currentRoom;
      if (!room) return;
      const updated: SocialRoom = {
        ...room,
        activeBattle: battle,
        updatedAt: Date.now(),
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      socialTransport.broadcast({
        kind: "battle-state",
        roomCode: room.roomCode,
        battle,
      });
      set({ currentRoom: updated });
    },

    sendBattleAction: (skillName) => {
      const room = get().currentRoom;
      if (!room) return;
      const { playerId } = usePlayerStore.getState();
      socialTransport.broadcast({
        kind: "battle-action",
        roomCode: room.roomCode,
        battleId: room.activeBattle?.battleId ?? "",
        actorPlayerId: playerId,
        skillName,
      });
    },

    finishBattle: (battle) => {
      const room = get().currentRoom;
      if (!room) return;
      const finished: SocialBattleState = {
        ...battle,
        phase: "finished",
        updatedAt: Date.now(),
      };
      const updated: SocialRoom = {
        ...room,
        activeBattle: finished,
        updatedAt: Date.now(),
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      socialTransport.broadcast({
        kind: "battle-finish",
        roomCode: room.roomCode,
        battle: finished,
      });
      set({ currentRoom: updated, activeBattle: finished });
    },

    setActiveBattle: (battle) => set({ activeBattle: battle }),

    applyTransportEvent: (event) => {
      const current = get().currentRoom;
      switch (event.kind) {
        case "room-state": {
          // 仅当事件来自当前所在房间时才更新
          if (current && current.roomCode === event.room.roomCode) {
            const merged = pruneOfflinePlayers(event.room);
            set({ currentRoom: merged });
            // 同步当前对战
            if (merged.activeBattle) {
              set({ activeBattle: merged.activeBattle });
            }
          }
          break;
        }
        case "chat-message": {
          if (current && current.roomCode === event.roomCode) {
            // 避免重复添加自己刚发的消息
            const exists = current.messages.some(
              (m) => m.id === event.message.id,
            );
            if (!exists) {
              const updated: SocialRoom = {
                ...current,
                messages: pruneMessages([...current.messages, event.message]),
                updatedAt: Date.now(),
              };
              set({ currentRoom: updated });
            }
          }
          break;
        }
        case "player-join":
        case "player-leave":
        case "heartbeat":
          // room-state 已覆盖，这里无需额外处理
          break;
        case "challenge-create": {
          if (current && current.roomCode === event.roomCode) {
            if (
              !current.pendingChallenge ||
              current.pendingChallenge.id !== event.challenge.id
            ) {
              set({
                currentRoom: { ...current, pendingChallenge: event.challenge },
              });
            }
          }
          break;
        }
        case "challenge-resolve": {
          if (
            current &&
            current.roomCode === event.roomCode &&
            current.pendingChallenge
          ) {
            if (event.status === "declined") {
              set({ currentRoom: { ...current, pendingChallenge: null } });
            }
          }
          break;
        }
        case "battle-state": {
          if (current && current.roomCode === event.roomCode) {
            set({
              currentRoom: { ...current, activeBattle: event.battle },
              activeBattle: event.battle,
            });
          }
          break;
        }
        case "battle-action":
        case "battle-finish":
          // battle-state 会随之推送，这里无需重复处理
          break;
      }
    },

    hydrateRoom: (roomCode) => {
      const room = socialTransport.loadRoom(roomCode);
      if (room) {
        set({ currentRoom: pruneOfflinePlayers(room) });
      }
    },
  };
});

/** 心跳定时器：定期广播自己的存在，让其他 tab 知道我还在线 */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export const startHeartbeat = (): void => {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const room = useSocialStore.getState().currentRoom;
    if (!room) return;
    const { playerId } = usePlayerStore.getState();
    const now = Date.now();
    // 更新本地玩家 lastSeenAt
    const updated: SocialRoom = {
      ...room,
      players: room.players.map((p) =>
        p.playerId === playerId ? { ...p, lastSeenAt: now, isOnline: true } : p,
      ),
      updatedAt: now,
    };
    socialTransport.persistRoom(updated);
    socialTransport.broadcast({
      kind: "heartbeat",
      roomCode: room.roomCode,
      playerId,
      timestamp: now,
    });
    // 清理空置房间
    const allOffline = updated.players.every(
      (p) => now - p.lastSeenAt > PLAYER_OFFLINE_TIMEOUT_MS,
    );
    if (allOffline && now - updated.updatedAt > ROOM_EMPTY_TTL_MS) {
      socialTransport.deleteRoom(room.roomCode);
      useSocialStore.setState({ currentRoom: null });
    }
  }, 10_000);
};

export const stopHeartbeat = (): void => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
};
