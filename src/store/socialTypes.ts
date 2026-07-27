import type { RosterCharacter } from "../store/useRosterStore";
import type { BattleEvent } from "../store/useGameStore";

/** 房间内每位玩家最多携带的词灵数量（房主与加入者一致） */
export const MAX_CARRIED_SPIRITS = 5;

/** 社交房间内玩家身份（临时态，localStorage 持久化） */
export interface SocialPlayer {
  /** 临时 UUID，存 localStorage */
  playerId: string;
  /** 玩家昵称 */
  nickname: string;
  /** 头像主题色 */
  avatarColor: string;
  /** 当前携带的词灵列表（最多 MAX_CARRIED_SPIRITS 个） */
  carriedSpirits: SerializedSpirit[];
  /** 出战词灵（约战时使用，从 carriedSpirits 中选一个；兼容旧字段） */
  activeSpirit: SerializedSpirit | null;
  /** 是否在线（房间内） */
  isOnline: boolean;
  /** 最后心跳时间戳，用于离线检测 */
  lastSeenAt: number;
}

/** 词灵序列化结构：只保留群聊/对战需要的字段，避免循环引用 */
export interface SerializedSpirit {
  rosterId: string;
  name: string;
  imageUrl?: string;
  imagePrompt: string;
  sourceDescription?: string;
  /** 角色完整战斗数据（对战时需要） */
  combatSnapshot: RosterCharacter;
  /** persona 摘要：用于群聊 prompt */
  persona: {
    archetype: string;
    temperament: string;
    speechStyle: string;
    slogan?: string;
    catchphrases: string[];
    battleCry: string;
    victoryLine: string;
    defeatLine: string;
    worldAnchors: string[];
  };
}

/** 群聊消息类型 */
export type SocialChatMessageType =
  | "player"
  | "spirit"
  | "system"
  | "battle_report";

export interface SocialChatMessage {
  id: string;
  type: SocialChatMessageType;
  /** 发送者 ID：玩家 playerId 或词灵 rosterId 或 "system" */
  senderId: string;
  senderName: string;
  /** 发送者主题色（玩家头像色 / 词灵宿主色 / 系统灰） */
  senderColor: string;
  /** 词灵头像 url（仅词灵消息） */
  senderAvatar?: string;
  content: string;
  timestamp: number;
  /** 仅用于界面展示，不注入词灵群聊上下文（如战报、约战状态） */
  excludeFromAiContext?: boolean;
  /** 词灵消息附带的 rosterId */
  spiritRosterId?: string;
  /** @ 的目标 ID 列表（玩家 ID 或词灵 rosterId） */
  mentions?: string[];
}

/** 约战邀请状态 */
export interface ChallengeInvite {
  id: string;
  fromPlayerId: string;
  fromPlayerName: string;
  fromSpiritName: string;
  /** 发起约战时锁定的词灵快照，避免等待期间切换出战导致预览与实战不一致 */
  fromSpirit?: SerializedSpirit;
  toPlayerId: string;
  toPlayerName: string;
  toSpiritName: string;
  /** 发起约战时锁定的词灵快照，避免等待期间切换出战导致预览与实战不一致 */
  toSpirit?: SerializedSpirit;
  createdAt: number;
  status: "pending" | "accepted" | "declined" | "expired";
}

/** 社交对战中的角色阵营 */
export type SocialBattleSide = "host" | "guest";

/** 社交对战状态（房间内同步） */
export interface SocialBattleState {
  /** 战斗实例 ID（= ChallengeInvite.id） */
  battleId: string;
  /** 主机玩家 ID（运行 BattleEngine 的一方） */
  hostPlayerId: string;
  /** 客机玩家 ID */
  guestPlayerId: string;
  /** 双方昵称 */
  hostNickname: string;
  guestNickname: string;
  /** 双方词灵序列化快照 */
  hostSpirit: SerializedSpirit;
  guestSpirit: SerializedSpirit;
  /** 当前回合 */
  currentTurn: number;
  /** 玩家选择招式的轮次；一轮包含双方各一次行动 */
  round: number;
  /** 房主是否正在接收本轮出招 */
  acceptingActions: boolean;
  /** 本轮出招截止时间（绝对时间戳） */
  turnDeadlineAt: number;
  /** 双方 HP 实时快照 */
  hostHp: number;
  guestHp: number;
  hostMaxHp: number;
  guestMaxHp: number;
  /** 双方大招充能 */
  hostCharge: number;
  guestCharge: number;
  /** 战斗事件日志（最近 N 条） */
  logs: BattleEvent[];
  /** 战斗阶段：准备 / 进行中 / 结束 */
  phase: "preparing" | "fighting" | "finished";
  /** 胜者 ID（finished 时填） */
  winnerPlayerId?: string;
  /** 战报摘要（finished 时填） */
  report?: SocialBattleReport;
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
}

/** 对战战报 */
export interface SocialBattleReport {
  winnerPlayerId: string;
  winnerNickname: string;
  winnerSpiritName: string;
  loserPlayerId: string;
  loserNickname: string;
  loserSpiritName: string;
  totalTurns: number;
  damageDealtByWinner: number;
  damageDealtByLoser: number;
  mvpSkillName?: string;
  highlights: string[];
}

/** 社交房间（群聊 + 房内约战，不再区分房间模式） */
export interface SocialRoom {
  roomCode: string;
  players: SocialPlayer[];
  messages: SocialChatMessage[];
  /** 当前活跃对战（无则 null） */
  activeBattle: SocialBattleState | null;
  /** 对战槽位版本；心跳和聊天不得推进该版本 */
  battleUpdatedAt: number;
  /** 当前待响应的约战邀请 */
  pendingChallenge: ChallengeInvite | null;
  /** 约战槽位版本；心跳和聊天不得推进该版本 */
  challengeUpdatedAt: number;
  createdAt: number;
  updatedAt: number;
}

/** 房间传输层事件类型 */
export type SocialTransportEvent =
  | { kind: "room-state"; room: SocialRoom }
  | { kind: "player-join"; playerId: string; roomCode: string }
  | { kind: "player-leave"; playerId: string; roomCode: string }
  | { kind: "chat-message"; roomCode: string; message: SocialChatMessage }
  | { kind: "challenge-create"; roomCode: string; challenge: ChallengeInvite }
  | {
      kind: "challenge-resolve";
      roomCode: string;
      challengeId: string;
      status: "accepted" | "declined";
    }
  | { kind: "battle-state"; roomCode: string; battle: SocialBattleState }
  | {
      kind: "battle-action";
      roomCode: string;
      battleId: string;
      actionId: string;
      round: number;
      actorPlayerId: string;
      skillName: string;
    }
  | { kind: "battle-finish"; roomCode: string; battle: SocialBattleState }
  | {
      kind: "heartbeat";
      roomCode: string;
      playerId: string;
      timestamp: number;
    }
  /** 后端轮询发现房间已被销毁：通知 store 退出当前房间 */
  | { kind: "room-closed"; roomCode: string };

/** 可选的玩家头像色板 */
export const PLAYER_AVATAR_COLORS = [
  "#66FCF1",
  "#FF6B9D",
  "#FFD700",
  "#A78BFA",
  "#7FFF9F",
  "#FF8C42",
  "#60A5FA",
  "#F472B6",
];

/** 生成 6 位房间码（去除易混淆字符） */
export const generateRoomCode = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

/** 生成简单 UUID（无需 crypto 一致性） */
export const generatePlayerId = (): string => {
  const part = () => Math.random().toString(36).slice(2, 10);
  return `p-${part()}-${part()}`;
};

/** 生成消息 ID */
export const generateMessageId = (): string => {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};
