import { create } from "zustand";
import {
  generateMessageId,
  generateRoomCode,
  MAX_CARRIED_SPIRITS,
  type ChallengeInvite,
  type SocialBattleReport,
  type SocialBattleState,
  type SocialChatMessage,
  type SocialPlayer,
  type SocialRoom,
  type SerializedSpirit,
} from "./socialTypes";
import {
  MAX_ROOM_MESSAGES,
  PLAYER_OFFLINE_TIMEOUT_MS,
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
  createRoom: (spirits: SerializedSpirit[]) => SocialRoom;
  /** 加入房间（异步：从后端拉取房间状态） */
  joinRoom: (roomCode: string, spirits: SerializedSpirit[]) => Promise<boolean>;
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
  sendBattleReport: (report: SocialBattleReport, battleId: string) => void;

  /** 发起约战 */
  createChallenge: (toPlayer: SocialPlayer) => Promise<void>;
  /** 接受/拒绝约战 */
  resolveChallenge: (
    challengeId: string,
    status: "accepted" | "declined",
  ) => Promise<void>;

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
  /** 内部：从后端加载房间（异步） */
  hydrateRoom: (roomCode: string) => Promise<void>;
}

const SYSTEM_COLOR = "#8a8d91";

/** 截断携带词灵列表到上限（房主与加入者统一为 MAX_CARRIED_SPIRITS） */
const clampCarried = (spirits: SerializedSpirit[]): SerializedSpirit[] =>
  spirits.slice(0, MAX_CARRIED_SPIRITS);

const buildSystemMessage = (
  content: string,
  excludeFromAiContext = false,
): SocialChatMessage => ({
  id: generateMessageId(),
  type: "system",
  senderId: "system",
  senderName: "系统",
  senderColor: SYSTEM_COLOR,
  content,
  timestamp: Date.now(),
  excludeFromAiContext,
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

/**
 * 轮询可能在最新 put 请求完成前返回旧房间快照。
 * 同一玩家保留 lastSeenAt 更新的一份，避免本地刚选中的出战词灵短暂回滚。
 */
const mergeNewerPlayers = (
  current: SocialPlayer[],
  incoming: SocialPlayer[],
): SocialPlayer[] => {
  const currentById = new Map(
    current.map((player) => [player.playerId, player]),
  );
  return incoming.map((player) => {
    const local = currentById.get(player.playerId);
    return local && local.lastSeenAt > player.lastSeenAt ? local : player;
  });
};

const nextVersion = (current: number): number =>
  Math.max(Date.now(), current + 1);

const roomHasPlayer = (room: SocialRoom, playerId: string): boolean =>
  room.players.some((player) => player.playerId === playerId);

const hasBattleParticipants = (
  room: SocialRoom,
  battle: SocialBattleState,
): boolean =>
  roomHasPlayer(room, battle.hostPlayerId) &&
  roomHasPlayer(room, battle.guestPlayerId);

const hasChallengeParticipants = (
  room: SocialRoom,
  challenge: ChallengeInvite,
): boolean =>
  roomHasPlayer(room, challenge.fromPlayerId) &&
  roomHasPlayer(room, challenge.toPlayerId);

/** 房间成员变化后，绝不保留引用已离场玩家的约战或对战。 */
const invalidateDepartedCompetition = (room: SocialRoom): SocialRoom => {
  let next = room;
  if (room.activeBattle && !hasBattleParticipants(room, room.activeBattle)) {
    next = {
      ...next,
      activeBattle: null,
      battleUpdatedAt: nextVersion(
        Math.max(room.battleUpdatedAt ?? 0, room.activeBattle.updatedAt),
      ),
    };
  }
  if (
    room.pendingChallenge &&
    !hasChallengeParticipants(room, room.pendingChallenge)
  ) {
    next = {
      ...next,
      pendingChallenge: null,
      challengeUpdatedAt: nextVersion(
        Math.max(next.challengeUpdatedAt ?? 0, room.pendingChallenge.createdAt),
      ),
    };
  }
  return next;
};

const mergeBattleSlot = (
  current: SocialRoom,
  incoming: SocialRoom,
): Pick<SocialRoom, "activeBattle" | "battleUpdatedAt"> => {
  const currentVersion =
    current.battleUpdatedAt ?? current.activeBattle?.updatedAt ?? 0;
  const incomingVersion =
    incoming.battleUpdatedAt ?? incoming.activeBattle?.updatedAt ?? 0;
  return incomingVersion >= currentVersion
    ? {
        activeBattle: incoming.activeBattle,
        battleUpdatedAt: incomingVersion,
      }
    : {
        activeBattle: current.activeBattle,
        battleUpdatedAt: currentVersion,
      };
};

const mergeChallengeSlot = (
  current: SocialRoom,
  incoming: SocialRoom,
): Pick<SocialRoom, "pendingChallenge" | "challengeUpdatedAt"> => {
  const currentVersion =
    current.challengeUpdatedAt ?? current.pendingChallenge?.createdAt ?? 0;
  const incomingVersion =
    incoming.challengeUpdatedAt ?? incoming.pendingChallenge?.createdAt ?? 0;
  return incomingVersion >= currentVersion
    ? {
        pendingChallenge: incoming.pendingChallenge,
        challengeUpdatedAt: incomingVersion,
      }
    : {
        pendingChallenge: current.pendingChallenge,
        challengeUpdatedAt: currentVersion,
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

    createRoom: (spirits) => {
      const { playerId, nickname, avatarColor } = usePlayerStore.getState();
      const roomCode = generateRoomCode();
      const now = Date.now();
      const carried = clampCarried(spirits);
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
        players: [me],
        messages: [buildSystemMessage(`${nickname} 创建了房间 ${roomCode}`)],
        activeBattle: null,
        battleUpdatedAt: 0,
        pendingChallenge: null,
        challengeUpdatedAt: 0,
        createdAt: now,
        updatedAt: now,
      };
      socialTransport.persistRoom(room);
      socialTransport.broadcast({ kind: "room-state", room });
      set({ currentRoom: room, error: "" });
      return room;
    },

    joinRoom: async (roomCode, spirits) => {
      const code = roomCode.trim().toUpperCase();
      if (code.length !== 6) {
        set({ error: "房间码为 6 位字符" });
        return false;
      }
      set({ isConnecting: true, error: "" });
      const existing = await socialTransport.fetchRoom(code);
      if (!existing) {
        set({ error: `房间 ${code} 不存在或已被销毁`, isConnecting: false });
        return false;
      }
      const { playerId, nickname, avatarColor } = usePlayerStore.getState();
      const now = Date.now();
      const others = existing.players.filter((p) => p.playerId !== playerId);
      const carried = clampCarried(spirits);
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
          buildSystemMessage(`${nickname} 加入了房间`),
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
      set({ currentRoom: updated, error: "", isConnecting: false });
      return true;
    },

    leaveRoom: () => {
      const room = get().currentRoom;
      if (!room) return;
      const { playerId, nickname } = usePlayerStore.getState();
      const remaining = room.players.filter((p) => p.playerId !== playerId);
      const now = Date.now();
      // 通知后端离开（后端在无人时删除房间）
      void socialTransport.leaveRoom(room.roomCode, playerId);
      if (remaining.length === 0) {
        socialTransport.deleteRoom(room.roomCode);
      } else {
        const updated = invalidateDepartedCompetition({
          ...room,
          players: remaining,
          messages: pruneMessages([
            ...room.messages,
            buildSystemMessage(`${nickname} 离开了房间`),
          ]),
          updatedAt: now,
        });
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
      const now = Date.now();
      const updated: SocialRoom = {
        ...room,
        players: room.players.map((p) => {
          if (p.playerId !== playerId) return p;
          const target = p.carriedSpirits.find((s) => s.rosterId === rosterId);
          return target
            ? {
                ...p,
                activeSpirit: target,
                isOnline: true,
                // 服务端用该值判定玩家状态新旧，切换出战必须推进版本。
                lastSeenAt: now,
              }
            : p;
        }),
        updatedAt: now,
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      set({ currentRoom: updated });
    },

    updateMyCarriedSpirits: (spirits) => {
      const room = get().currentRoom;
      if (!room) return;
      const { playerId } = usePlayerStore.getState();
      const carried = clampCarried(spirits);
      const now = Date.now();
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
                isOnline: true,
                // 同样推进玩家版本，避免后端把携带列表和出战项回滚。
                lastSeenAt: now,
              }
            : p,
        ),
        updatedAt: now,
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

    sendBattleReport: (report, battleId) => {
      const room = get().currentRoom;
      if (!room) return;
      const now = Date.now();
      const message: SocialChatMessage = {
        // 双方都可提交结算；固定 ID 让服务端消息合并保持幂等。
        id: `battle-report-${battleId}`,
        type: "battle_report",
        senderId: "system",
        senderName: "战报",
        senderColor: "#FFD700",
        content: `${report.winnerNickname} 的 ${report.winnerSpiritName} 击败了 ${report.loserNickname} 的 ${report.loserSpiritName}！共 ${report.totalTurns} 回合。`,
        timestamp: now,
        excludeFromAiContext: true,
      };
      const updated: SocialRoom = {
        ...room,
        messages: pruneMessages([...room.messages, message]),
        activeBattle: null,
        battleUpdatedAt: nextVersion(room.battleUpdatedAt ?? 0),
        pendingChallenge: null,
        challengeUpdatedAt: nextVersion(room.challengeUpdatedAt ?? 0),
        updatedAt: now,
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      set({ currentRoom: updated, activeBattle: null });
    },

    createChallenge: async (toPlayer) => {
      const currentRoom = get().currentRoom;
      if (!currentRoom) return;
      const { playerId, nickname } = usePlayerStore.getState();
      const freshRoom = await socialTransport.fetchRoom(currentRoom.roomCode);
      if (!freshRoom) {
        set({ error: "房间已关闭，无法发起约战" });
        return;
      }
      const room = invalidateDepartedCompetition(freshRoom);
      const me = room.players.find((p) => p.playerId === playerId);
      const target = room.players.find(
        (player) => player.playerId === toPlayer.playerId,
      );
      if (
        room.activeBattle ||
        room.pendingChallenge ||
        !me ||
        !me.activeSpirit ||
        !target ||
        !target.activeSpirit ||
        playerId === target.playerId
      ) {
        set({ error: "对手已离开或房间存在未结束的约战" });
        return;
      }
      const challenge: ChallengeInvite = {
        id: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fromPlayerId: playerId,
        fromPlayerName: nickname,
        fromSpiritName: me.activeSpirit.name,
        toPlayerId: target.playerId,
        toPlayerName: target.nickname,
        toSpiritName: target.activeSpirit.name,
        createdAt: Date.now(),
        status: "pending",
      };
      const challengeUpdatedAt = nextVersion(room.challengeUpdatedAt ?? 0);
      const updated: SocialRoom = {
        ...room,
        pendingChallenge: challenge,
        challengeUpdatedAt,
        messages: pruneMessages([
          ...room.messages,
          buildSystemMessage(
            `${nickname} 向 ${target.nickname} 发起约战：${me.activeSpirit.name} vs ${target.activeSpirit.name}`,
            true,
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

    resolveChallenge: async (challengeId, status) => {
      const currentRoom = get().currentRoom;
      if (!currentRoom || !currentRoom.pendingChallenge) return;
      if (currentRoom.pendingChallenge.id !== challengeId) return;
      const { playerId, nickname } = usePlayerStore.getState();
      if (playerId !== currentRoom.pendingChallenge.toPlayerId) {
        set({ error: "只有被邀请的契约者可以响应约战" });
        return;
      }
      const freshRoom = await socialTransport.fetchRoom(currentRoom.roomCode);
      if (!freshRoom) {
        set({ currentRoom: null, activeBattle: null, error: "房间已关闭" });
        return;
      }
      const room = invalidateDepartedCompetition(freshRoom);
      if (
        !room.pendingChallenge ||
        room.pendingChallenge.id !== challengeId ||
        !hasChallengeParticipants(room, room.pendingChallenge)
      ) {
        set({
          currentRoom: room,
          activeBattle: room.activeBattle,
          error: "对手已离开，约战已取消",
        });
        return;
      }
      const challenge = { ...room.pendingChallenge, status };
      const challengeUpdatedAt = nextVersion(room.challengeUpdatedAt ?? 0);

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
          round: 1,
          acceptingActions: false,
          turnDeadlineAt: 0,
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
          challengeUpdatedAt,
          activeBattle: battle,
          battleUpdatedAt: battle.updatedAt,
          messages: pruneMessages([
            ...room.messages,
            buildSystemMessage(
              `${challenge.toPlayerName} 接受了约战！${challenge.fromSpiritName} vs ${challenge.toSpiritName}`,
              true,
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
          challengeUpdatedAt,
          messages: pruneMessages([
            ...room.messages,
            buildSystemMessage(`${nickname} 拒绝了约战`, true),
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
      const { playerId } = usePlayerStore.getState();
      if (
        playerId !== battle.hostPlayerId ||
        !hasBattleParticipants(room, battle)
      ) {
        return;
      }
      const battleUpdatedAt = Math.max(
        battle.updatedAt,
        nextVersion(room.battleUpdatedAt ?? 0),
      );
      const nextBattle = { ...battle, updatedAt: battleUpdatedAt };
      const updated: SocialRoom = {
        ...room,
        activeBattle: nextBattle,
        battleUpdatedAt,
        updatedAt: Date.now(),
      };
      socialTransport.persistRoom(updated);
      socialTransport.broadcast({ kind: "room-state", room: updated });
      socialTransport.broadcast({
        kind: "battle-state",
        roomCode: room.roomCode,
        battle: nextBattle,
      });
      set({ currentRoom: updated, activeBattle: nextBattle });
    },

    sendBattleAction: (skillName) => {
      const room = get().currentRoom;
      const battle = room?.activeBattle;
      if (!room || !battle) return;
      const { playerId } = usePlayerStore.getState();
      if (
        !hasBattleParticipants(room, battle) ||
        (playerId !== battle.hostPlayerId && playerId !== battle.guestPlayerId)
      ) {
        return;
      }
      socialTransport.broadcast({
        kind: "battle-action",
        roomCode: room.roomCode,
        battleId: battle.battleId,
        actionId: `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        round: battle.round,
        actorPlayerId: playerId,
        skillName,
      });
    },

    finishBattle: (battle) => {
      const room = get().currentRoom;
      if (!room) return;
      const { playerId } = usePlayerStore.getState();
      if (
        playerId !== battle.hostPlayerId ||
        !hasBattleParticipants(room, battle)
      ) {
        return;
      }
      const finished: SocialBattleState = {
        ...battle,
        phase: "finished",
        acceptingActions: false,
        turnDeadlineAt: 0,
        updatedAt: nextVersion(room.battleUpdatedAt ?? 0),
      };
      const updated: SocialRoom = {
        ...room,
        activeBattle: finished,
        battleUpdatedAt: finished.updatedAt,
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
            const incoming = pruneOfflinePlayers(event.room);
            // 合并消息：避免刚发出、后端尚未回传的本地乐观消息被轮询覆盖丢失
            const byId = new Map<string, (typeof incoming.messages)[number]>();
            for (const m of current.messages) byId.set(m.id, m);
            for (const m of incoming.messages) byId.set(m.id, m);
            const mergedMessages = pruneMessages(
              [...byId.values()].sort((a, b) => a.timestamp - b.timestamp),
            );
            const merged = invalidateDepartedCompetition({
              ...incoming,
              players: mergeNewerPlayers(current.players, incoming.players),
              messages: mergedMessages,
              ...mergeBattleSlot(current, incoming),
              ...mergeChallengeSlot(current, incoming),
            });
            const localActiveBattle = get().activeBattle;
            set({
              currentRoom: merged,
              // 已结束演出允许本地播完；其他情况下严格跟随房间槽位。
              activeBattle:
                merged.activeBattle ??
                (localActiveBattle?.phase === "finished"
                  ? localActiveBattle
                  : null),
            });
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
              hasChallengeParticipants(current, event.challenge) &&
              (!current.pendingChallenge ||
                current.pendingChallenge.id !== event.challenge.id)
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
            if (!hasBattleParticipants(current, event.battle)) {
              const updated = invalidateDepartedCompetition({
                ...current,
                activeBattle: event.battle,
              });
              set({ currentRoom: updated, activeBattle: updated.activeBattle });
              break;
            }
            const currentVersion =
              current.battleUpdatedAt ?? current.activeBattle?.updatedAt ?? 0;
            if (event.battle.updatedAt < currentVersion) break;
            set({
              currentRoom: {
                ...current,
                activeBattle: event.battle,
                battleUpdatedAt: event.battle.updatedAt,
              },
              activeBattle: event.battle,
            });
          }
          break;
        }
        case "battle-action":
        case "battle-finish":
          // battle-state 会随之推送，这里无需重复处理
          break;
        case "room-closed": {
          // 后端房间已销毁：若正身处该房间则退出
          if (current && current.roomCode === event.roomCode) {
            set({
              currentRoom: null,
              activeBattle: null,
              error: "房间已被销毁",
            });
          }
          break;
        }
      }
    },

    hydrateRoom: async (roomCode) => {
      const room = await socialTransport.fetchRoom(roomCode);
      if (room) {
        const hydrated = invalidateDepartedCompetition(
          pruneOfflinePlayers(room),
        );
        set({
          currentRoom: hydrated,
          activeBattle: hydrated.activeBattle,
        });
      }
    },
  };
});

/** 心跳定时器：定期广播自己的存在，让其他 tab 知道我还在线 */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export const startHeartbeat = (): void => {
  // 进入房间：开启后端轮询，实时拉取其他设备的状态
  const room = useSocialStore.getState().currentRoom;
  if (room) socialTransport.startPolling(room.roomCode);
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const room = useSocialStore.getState().currentRoom;
    if (!room) return;
    const { playerId } = usePlayerStore.getState();
    const now = Date.now();
    // 更新本地玩家 lastSeenAt，并把在场状态推送到后端（合并写保活）
    const updated: SocialRoom = {
      ...room,
      players: room.players.map((p) =>
        p.playerId === playerId ? { ...p, lastSeenAt: now, isOnline: true } : p,
      ),
      updatedAt: now,
    };
    useSocialStore.setState({ currentRoom: updated });
    // room-state 广播会同步本地 Tab、写本地快照并提交后端
    socialTransport.broadcast({ kind: "room-state", room: updated });
  }, 10_000);
};

export const stopHeartbeat = (): void => {
  socialTransport.stopPolling();
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
};
