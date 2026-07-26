import { getCache } from "@vercel/functions";
import {
  asRecord,
  readBody,
  sendJson,
  setCorsHeaders,
  type ApiRequest,
  type ApiResponse,
} from "./_shared.js";

/**
 * 社交房间后端（跨设备真联机）
 *
 * 存储：复用 @vercel/functions 的 getCache（与每日额度限制同一套运行时缓存），
 *       无需额外开通 KV / 数据库；本地无缓存时降级到进程内 Map。
 *
 * 单端点 POST /api/room，通过 body.action 分派：
 *  - get   : 拉取房间当前状态（轮询用），返回 { exists, room, rev, events }
 *  - put   : 提交房间状态（服务端做消息/玩家合并，避免并发丢写），返回 { room, rev }
 *  - leave : 玩家离开（从房间移除；无人时删除房间）
 *  - event : 推送瞬时事件（如对战技能选择 battle-action），进入环形事件队列
 *
 * 合并策略（put）：
 *  - messages：按 id 去重取并集，按时间排序，仅保留最近 MAX_MESSAGES 条
 *  - players ：按 playerId 合并，同一玩家取 lastSeenAt 更新的一份；
 *              近期在线（OFFLINE_KEEP_MS 内）但本次未上报的玩家予以保留，
 *              以此化解「加入 / 心跳」并发导致的丢人问题
 *  - activeBattle / pendingChallenge：各自按独立版本取更新者，避免心跳覆盖业务状态
 */

type LoosePlayer = {
  playerId?: string;
  lastSeenAt?: number;
  [key: string]: unknown;
};

type LooseMessage = {
  id?: string;
  timestamp?: number;
  [key: string]: unknown;
};

type LooseRoom = {
  roomCode?: string;
  players?: LoosePlayer[];
  messages?: LooseMessage[];
  activeBattle?: unknown;
  battleUpdatedAt?: number;
  pendingChallenge?: unknown;
  challengeUpdatedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: unknown;
};

type StoredEvent = { seq: number; event: unknown };

type StoredRoom = {
  room: LooseRoom;
  rev: number;
  events: StoredEvent[];
  eventSeq: number;
  /** 离场墓碑：playerId -> 离场时间戳，防止其他客户端的滞后心跳把已离场玩家复活 */
  left?: Record<string, number>;
};

const MAX_MESSAGES = 50;
const MAX_EVENTS = 40;
const ROOM_TTL_SECONDS = 2 * 60 * 60; // 2 小时无写入即过期
/** 近期在线阈值：本次上报未包含、但最近仍活跃的玩家予以保留 */
const OFFLINE_KEEP_MS = 2 * 60 * 1000;

const NAMESPACE = "word-brawl-social";

/** 本地 / 缓存不可用时的进程内兜底（仅单实例有效） */
const memoryStore = new Map<string, StoredRoom>();

const roomKey = (code: string): string => `room:${code.toUpperCase()}`;

const cache = () => getCache({ namespace: NAMESPACE });

const loadStored = async (code: string): Promise<StoredRoom | null> => {
  const key = roomKey(code);
  try {
    const cached = await cache().get(key);
    if (cached && typeof cached === "object") {
      return cached as StoredRoom;
    }
    return memoryStore.get(key) ?? null;
  } catch {
    return memoryStore.get(key) ?? null;
  }
};

const saveStored = async (code: string, stored: StoredRoom): Promise<void> => {
  const key = roomKey(code);
  memoryStore.set(key, stored);
  try {
    await cache().set(key, stored, {
      ttl: ROOM_TTL_SECONDS,
      tags: ["word-brawl-social"],
    });
  } catch {
    // 缓存不可用：已写入 memoryStore 兜底
  }
};

const deleteStored = async (code: string): Promise<void> => {
  const key = roomKey(code);
  memoryStore.delete(key);
  try {
    // getCache 无 delete，用极短 TTL 让其快速过期
    await cache().set(key, null, { ttl: 1, tags: ["word-brawl-social"] });
  } catch {
    // 忽略
  }
};

const mergeMessages = (
  existing: LooseMessage[],
  incoming: LooseMessage[],
): LooseMessage[] => {
  const byId = new Map<string, LooseMessage>();
  for (const m of existing) {
    if (m && typeof m.id === "string") byId.set(m.id, m);
  }
  for (const m of incoming) {
    if (m && typeof m.id === "string") byId.set(m.id, m);
  }
  return [...byId.values()]
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .slice(-MAX_MESSAGES);
};

const mergePlayers = (
  existing: LoosePlayer[],
  incoming: LoosePlayer[],
  tombstones: Record<string, number> = {},
): LoosePlayer[] => {
  const now = Date.now();
  const byId = new Map<string, LoosePlayer>();
  // 先纳入近期仍在线的既有玩家（保住并发场景下未被本次上报覆盖的人）
  for (const p of existing) {
    if (!p || typeof p.playerId !== "string") continue;
    if (now - (p.lastSeenAt ?? 0) < OFFLINE_KEEP_MS) byId.set(p.playerId, p);
  }
  // 合并本次上报：同一玩家取 lastSeenAt 更新的一份
  for (const p of incoming) {
    if (!p || typeof p.playerId !== "string") continue;
    const prev = byId.get(p.playerId);
    if (!prev || (p.lastSeenAt ?? 0) >= (prev.lastSeenAt ?? 0)) {
      byId.set(p.playerId, p);
    }
  }
  // 剔除已离场玩家：滞后心跳可能仍带着他们，但墓碑时间之后不得复活
  for (const [pid, leftAt] of Object.entries(tombstones)) {
    const p = byId.get(pid);
    if (p && (p.lastSeenAt ?? 0) <= leftAt) byId.delete(pid);
  }
  return [...byId.values()];
};

const getObjectTimestamp = (value: unknown): number => {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  const updatedAt = Number(record.updatedAt);
  if (Number.isFinite(updatedAt)) return updatedAt;
  const createdAt = Number(record.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
};

/** 合并 put 上来的房间到既有存储（服务端权威合并） */
const mergeRoom = (
  existing: LooseRoom,
  incoming: LooseRoom,
  tombstones: Record<string, number> = {},
): LooseRoom => {
  const existingBattleVersion =
    existing.battleUpdatedAt ?? getObjectTimestamp(existing.activeBattle);
  const incomingBattleVersion =
    incoming.battleUpdatedAt ?? getObjectTimestamp(incoming.activeBattle);
  const existingChallengeVersion =
    existing.challengeUpdatedAt ??
    getObjectTimestamp(existing.pendingChallenge);
  const incomingChallengeVersion =
    incoming.challengeUpdatedAt ??
    getObjectTimestamp(incoming.pendingChallenge);
  const incomingBattleNewer = incomingBattleVersion >= existingBattleVersion;
  const incomingChallengeNewer =
    incomingChallengeVersion >= existingChallengeVersion;
  return {
    ...existing,
    ...incoming,
    roomCode: existing.roomCode ?? incoming.roomCode,
    createdAt: existing.createdAt ?? incoming.createdAt,
    messages: mergeMessages(existing.messages ?? [], incoming.messages ?? []),
    players: mergePlayers(
      existing.players ?? [],
      incoming.players ?? [],
      tombstones,
    ),
    // 对战与约战使用独立版本。普通心跳只推进 room.updatedAt，不能回滚业务状态。
    activeBattle: incomingBattleNewer
      ? (incoming.activeBattle ?? null)
      : (existing.activeBattle ?? null),
    battleUpdatedAt: Math.max(existingBattleVersion, incomingBattleVersion),
    pendingChallenge: incomingChallengeNewer
      ? (incoming.pendingChallenge ?? null)
      : (existing.pendingChallenge ?? null),
    challengeUpdatedAt: Math.max(
      existingChallengeVersion,
      incomingChallengeVersion,
    ),
    updatedAt: Math.max(existing.updatedAt ?? 0, incoming.updatedAt ?? 0),
  };
};

const okEvents = (stored: StoredRoom, sinceEvent: number): StoredEvent[] =>
  stored.events.filter((e) => e.seq > sinceEvent);

/** 清理过期墓碑：超过 OFFLINE_KEEP_MS 的离场记录不再需要拦截 */
const pruneTombstones = (
  tombstones: Record<string, number>,
): Record<string, number> => {
  const now = Date.now();
  const next: Record<string, number> = {};
  for (const [pid, leftAt] of Object.entries(tombstones)) {
    if (now - leftAt < OFFLINE_KEEP_MS) next[pid] = leftAt;
  }
  return next;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const body = readBody(req);
  const action = String(body.action || "");
  const roomCodeRaw = String(body.roomCode || "")
    .trim()
    .toUpperCase();

  switch (action) {
    case "get": {
      if (!roomCodeRaw) {
        sendJson(res, 400, { error: "缺少 roomCode" });
        return;
      }
      const sinceEvent = Number(body.sinceEvent) || 0;
      const stored = await loadStored(roomCodeRaw);
      if (!stored || !stored.room) {
        sendJson(res, 200, { exists: false });
        return;
      }
      sendJson(res, 200, {
        exists: true,
        room: stored.room,
        rev: stored.rev,
        eventSeq: stored.eventSeq,
        events: okEvents(stored, sinceEvent),
      });
      return;
    }

    case "put": {
      const incoming = asRecord(body.room) as LooseRoom;
      const code = String(incoming.roomCode || roomCodeRaw)
        .trim()
        .toUpperCase();
      if (!code) {
        sendJson(res, 400, { error: "缺少房间数据" });
        return;
      }
      const existing = await loadStored(code);
      const tombstones = pruneTombstones(existing?.left ?? {});
      const mergedRoom = existing
        ? mergeRoom(existing.room, incoming, tombstones)
        : {
            ...incoming,
            messages: mergeMessages([], incoming.messages ?? []),
            players: mergePlayers([], incoming.players ?? [], tombstones),
          };
      const stored: StoredRoom = {
        room: mergedRoom,
        rev: (existing?.rev ?? 0) + 1,
        events: existing?.events ?? [],
        eventSeq: existing?.eventSeq ?? 0,
        left: tombstones,
      };
      await saveStored(code, stored);
      sendJson(res, 200, { room: stored.room, rev: stored.rev });
      return;
    }

    case "event": {
      if (!roomCodeRaw) {
        sendJson(res, 400, { error: "缺少 roomCode" });
        return;
      }
      const stored = await loadStored(roomCodeRaw);
      if (!stored) {
        sendJson(res, 200, { ok: false, reason: "room-not-found" });
        return;
      }
      const seq = stored.eventSeq + 1;
      stored.eventSeq = seq;
      stored.events = [...stored.events, { seq, event: body.event }].slice(
        -MAX_EVENTS,
      );
      await saveStored(roomCodeRaw, stored);
      sendJson(res, 200, { ok: true, seq });
      return;
    }

    case "leave": {
      const playerId = String(body.playerId || "");
      if (!roomCodeRaw || !playerId) {
        sendJson(res, 400, { error: "缺少 roomCode 或 playerId" });
        return;
      }
      const stored = await loadStored(roomCodeRaw);
      if (!stored) {
        sendJson(res, 200, { ok: true, deleted: true });
        return;
      }
      const remaining = (stored.room.players ?? []).filter(
        (p) => p.playerId !== playerId,
      );
      if (remaining.length === 0) {
        await deleteStored(roomCodeRaw);
        sendJson(res, 200, { ok: true, deleted: true });
        return;
      }
      // 写离场墓碑：拦截其他客户端后续滞后心跳的复活
      const tombstones = pruneTombstones(stored.left ?? {});
      tombstones[playerId] = Date.now();
      stored.left = tombstones;
      stored.room = {
        ...stored.room,
        players: remaining,
        updatedAt: Date.now(),
      };
      stored.rev += 1;
      await saveStored(roomCodeRaw, stored);
      sendJson(res, 200, { ok: true, room: stored.room, rev: stored.rev });
      return;
    }

    default:
      sendJson(res, 400, { error: `未知 action: ${action || "(空)"}` });
      return;
  }
}
