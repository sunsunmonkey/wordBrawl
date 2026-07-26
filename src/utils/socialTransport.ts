import type { SocialRoom, SocialTransportEvent } from "../store/socialTypes";

/**
 * 社交房间传输层（跨设备真联机版）
 *
 * 后端：/api/room（Vercel serverless + getCache 共享存储）。
 *  - 房间状态：put 提交、get 轮询拉取（服务端做消息/玩家合并）
 *  - 瞬时事件（battle-action 等）：event 推送、get 时附带增量返回
 *
 * 同设备多 Tab：额外用 BroadcastChannel 即时互通，减少轮询延迟。
 * 本地兜底：网络失败时仍走 BroadcastChannel + localStorage 快照，不至于完全不可用。
 */

const ROOM_STORAGE_PREFIX = "word-brawl-social-room:";
const CHANNEL_NAME = "word-brawl-social";
const API_ENDPOINT = "/api/room";

/** 轮询间隔：房间列表刷新节奏 */
export const ROOM_POLL_INTERVAL_MS = 1200;

type EventHandler = (event: SocialTransportEvent) => void;

type RoomGetResponse = {
  exists: boolean;
  room?: SocialRoom;
  rev?: number;
  eventSeq?: number;
  events?: { seq: number; event: SocialTransportEvent }[];
};

class SocialTransport {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<EventHandler>();
  private initialized = false;

  /** 当前订阅轮询的房间码 */
  private pollingRoom: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** 已消费到的事件序号，避免重复派发瞬时事件 */
  private lastEventSeq = 0;
  /** 轮询进行中标记，避免请求叠加 */
  private polling = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (e: MessageEvent<SocialTransportEvent>) => {
        this.dispatch(e.data);
      };
    }
  }

  /** 订阅传输事件 */
  subscribe(handler: EventHandler): () => void {
    this.init();
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private dispatch(event: SocialTransportEvent): void {
    this.listeners.forEach((handler) => {
      try {
        handler(event);
      } catch (err) {
        console.error("[socialTransport] handler error", err);
      }
    });
  }

  /** 广播事件：本地 Tab 即时互通 + 需要跨设备的事件推到后端 */
  broadcast(event: SocialTransportEvent): void {
    this.init();
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (err) {
        console.error("[socialTransport] broadcast failed", err);
      }
    }
    switch (event.kind) {
      case "room-state":
        // 房间状态：提交后端 + 本地快照兜底。
        // 聊天 / 约战 / 对战状态都并入房间状态，靠轮询 get 同步，无需单独推事件。
        this.persistRoom(event.room);
        void this.putRoom(event.room);
        break;
      case "battle-action":
        // 瞬时对战操作：不落房间状态，必须走事件队列跨设备送达
        void this.postEvent(event.roomCode, event);
        break;
      default:
        break;
    }
  }

  /** 提交房间状态到后端（合并写） */
  private async putRoom(room: SocialRoom): Promise<void> {
    try {
      await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "put", roomCode: room.roomCode, room }),
      });
    } catch {
      // 网络失败：已有 localStorage 快照兜底
    }
  }

  /** 推送瞬时事件到后端队列 */
  private async postEvent(
    roomCode: string,
    event: SocialTransportEvent,
  ): Promise<void> {
    if (!roomCode) return;
    try {
      await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "event", roomCode, event }),
      });
    } catch {
      // 忽略：本地 BroadcastChannel 已即时送达同设备 Tab
    }
  }

  /** 从后端拉取房间（加入 / 刷新用），失败时回退本地快照 */
  async fetchRoom(roomCode: string): Promise<SocialRoom | null> {
    const code = roomCode.trim().toUpperCase();
    try {
      const resp = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", roomCode: code, sinceEvent: 0 }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as RoomGetResponse;
        if (data.exists && data.room) {
          const room = migrateRoom(data.room);
          this.lastEventSeq = data.eventSeq ?? 0;
          this.persistRoom(room);
          return room;
        }
        return null;
      }
    } catch {
      // 落到本地兜底
    }
    return this.loadRoom(code);
  }

  /**
   * 开始轮询某个房间：定期 get 后端最新状态与增量事件，派发给监听者。
   * 进入房间时调用，离开时 stopPolling。
   */
  startPolling(roomCode: string): void {
    this.init();
    const code = roomCode.trim().toUpperCase();
    this.pollingRoom = code;
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, ROOM_POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.pollingRoom = null;
    this.lastEventSeq = 0;
  }

  private async pollOnce(): Promise<void> {
    if (!this.pollingRoom || this.polling) return;
    this.polling = true;
    try {
      const resp = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get",
          roomCode: this.pollingRoom,
          sinceEvent: this.lastEventSeq,
        }),
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as RoomGetResponse;
      if (!data.exists || !data.room) {
        // 房间已被销毁：派发一个空状态标记，让 store 决定是否退出
        this.dispatch({ kind: "room-closed", roomCode: this.pollingRoom });
        return;
      }
      const room = migrateRoom(data.room);
      this.persistRoom(room);
      this.dispatch({ kind: "room-state", room });
      // 增量瞬时事件（battle-action 等）
      if (Array.isArray(data.events) && data.events.length) {
        for (const e of data.events) {
          if (e.seq > this.lastEventSeq) this.lastEventSeq = e.seq;
          this.dispatch(e.event);
        }
      } else if (typeof data.eventSeq === "number") {
        this.lastEventSeq = Math.max(this.lastEventSeq, data.eventSeq);
      }
    } catch {
      // 轮询失败：静默重试下一轮
    } finally {
      this.polling = false;
    }
  }

  /** 提交玩家离开到后端 */
  async leaveRoom(roomCode: string, playerId: string): Promise<void> {
    const code = roomCode.trim().toUpperCase();
    try {
      await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave", roomCode: code, playerId }),
      });
    } catch {
      // 忽略
    }
  }

  /** 本地快照：写入 localStorage（网络兜底 + 同设备读取） */
  persistRoom(room: SocialRoom): void {
    if (typeof window === "undefined") return;
    try {
      const key = ROOM_STORAGE_PREFIX + room.roomCode;
      window.localStorage.setItem(key, JSON.stringify(room));
    } catch (err) {
      console.error("[socialTransport] persistRoom failed", err);
    }
  }

  /** 读取本地快照（仅兜底用） */
  loadRoom(roomCode: string): SocialRoom | null {
    if (typeof window === "undefined") return null;
    try {
      const key = ROOM_STORAGE_PREFIX + roomCode.toUpperCase();
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return migrateRoom(JSON.parse(raw) as SocialRoom);
    } catch {
      return null;
    }
  }

  /** 删除本地快照 */
  deleteRoom(roomCode: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(
        ROOM_STORAGE_PREFIX + roomCode.toUpperCase(),
      );
    } catch {
      // 忽略
    }
  }

  /** 销毁传输层 */
  destroy(): void {
    this.stopPolling();
    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        // 忽略
      }
      this.channel = null;
    }
    this.listeners.clear();
    this.initialized = false;
  }
}

/** 单例 */
export const socialTransport = new SocialTransport();

/** 房间存储上限：最近 N 条消息 */
export const MAX_ROOM_MESSAGES = 50;

/** 玩家离线判定阈值：超过该时长未心跳则视为离线 */
export const PLAYER_OFFLINE_TIMEOUT_MS = 30_000;

/** 房间空置清理阈值：所有玩家离线超过该时长后删除房间 */
export const ROOM_EMPTY_TTL_MS = 5 * 60 * 1000;

/**
 * 旧版房间数据迁移：
 *  - 移除已废弃的 mode 字段（房间不再区分聊天/对战）
 *  - 补 quickBattle 字段（旧房间默认 false）
 *  - 补 carriedSpirits 字段（从 activeSpirit 推导）
 */
const migrateRoom = (room: SocialRoom): SocialRoom => {
  // 兼容旧数据：旧版带有 mode 字段，现已废弃，剔除后避免后续误用
  if ("mode" in room) {
    delete (room as SocialRoom & { mode?: unknown }).mode;
  }
  if (typeof room.quickBattle !== "boolean") {
    room.quickBattle = false;
  }
  room.players = (room.players ?? []).map((p) => {
    if (!Array.isArray(p.carriedSpirits)) {
      return {
        ...p,
        carriedSpirits: p.activeSpirit ? [p.activeSpirit] : [],
      };
    }
    return p;
  });
  return room;
};
