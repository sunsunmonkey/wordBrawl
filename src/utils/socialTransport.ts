import type { SocialRoom, SocialTransportEvent } from "../store/socialTypes";

/**
 * 社交房间传输层
 *
 * 演示场景：同浏览器多 tab 互通（用 BroadcastChannel + localStorage 兜底）。
 *  - BroadcastChannel：实时事件广播
 *  - localStorage：房间状态持久化，新 tab 加入时可读取最新状态
 *
 * 设计为单例：每个 tab 一个 SocialTransport 实例，订阅各自关心的 roomCode。
 */

const ROOM_STORAGE_PREFIX = "word-brawl-social-room:";
const ROOM_INDEX_KEY = "word-brawl-social-room-index";
const CHANNEL_NAME = "word-brawl-social";

type EventHandler = (event: SocialTransportEvent) => void;

class SocialTransport {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<EventHandler>();
  private storageListeners = new Set<() => void>();
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (e: MessageEvent<SocialTransportEvent>) => {
        this.dispatch(e.data);
      };
    }
    // localStorage 兜底：监听其他 tab 对房间状态的写入
    if (typeof window !== "undefined") {
      window.addEventListener("storage", this.handleStorageEvent);
    }
  }

  private handleStorageEvent = (e: StorageEvent) => {
    if (!e.key || !e.key.startsWith(ROOM_STORAGE_PREFIX)) return;
    if (!e.newValue) return;
    try {
      const room = JSON.parse(e.newValue) as SocialRoom;
      this.dispatch({ kind: "room-state", room });
    } catch {
      // 忽略无效 JSON
    }
  };

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

  /** 广播事件到其他 tab */
  broadcast(event: SocialTransportEvent): void {
    this.init();
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (err) {
        console.error("[socialTransport] broadcast failed", err);
      }
    }
    // 涉及房间状态变更的事件，同步写入 localStorage 触发兜底
    if (event.kind === "room-state") {
      this.persistRoom(event.room);
    }
  }

  /** 持久化房间到 localStorage */
  persistRoom(room: SocialRoom): void {
    if (typeof window === "undefined") return;
    try {
      const key = ROOM_STORAGE_PREFIX + room.roomCode;
      window.localStorage.setItem(key, JSON.stringify(room));
      // 维护房间索引
      const indexRaw = window.localStorage.getItem(ROOM_INDEX_KEY);
      const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
      if (!index.includes(room.roomCode)) {
        index.push(room.roomCode);
        window.localStorage.setItem(ROOM_INDEX_KEY, JSON.stringify(index));
      }
    } catch (err) {
      console.error("[socialTransport] persistRoom failed", err);
    }
  }

  /** 读取 localStorage 中的房间状态 */
  loadRoom(roomCode: string): SocialRoom | null {
    if (typeof window === "undefined") return null;
    try {
      const key = ROOM_STORAGE_PREFIX + roomCode.toUpperCase();
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const room = JSON.parse(raw) as SocialRoom;
      return migrateRoom(room);
    } catch {
      return null;
    }
  }

  /** 删除房间（所有人离开时清理） */
  deleteRoom(roomCode: string): void {
    if (typeof window === "undefined") return;
    try {
      const key = ROOM_STORAGE_PREFIX + roomCode.toUpperCase();
      window.localStorage.removeItem(key);
      const indexRaw = window.localStorage.getItem(ROOM_INDEX_KEY);
      const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
      const next = index.filter((c) => c !== roomCode.toUpperCase());
      window.localStorage.setItem(ROOM_INDEX_KEY, JSON.stringify(next));
    } catch {
      // 忽略
    }
  }

  /** 销毁传输层（页面卸载时调用） */
  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", this.handleStorageEvent);
    }
    this.storageListeners.clear();
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
 *  - 补 mode 字段（默认 chat）
 *  - 补 carriedSpirits 字段（从 activeSpirit 推导）
 */
const migrateRoom = (room: SocialRoom): SocialRoom => {
  if (!room.mode) {
    room.mode = "chat";
  }
  room.players = room.players.map((p) => {
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
