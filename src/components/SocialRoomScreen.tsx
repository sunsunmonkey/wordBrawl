import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  DoorOpen,
  Loader2,
  LogOut,
  Send,
  Shield,
  Sparkles,
  Swords,
  Users,
  X,
} from "lucide-react";
import { useGameStore } from "../store/useGameStore";
import { useSocialStore } from "../store/useSocialStore";
import { usePlayerStore } from "../store/usePlayerStore";
import { stopHeartbeat } from "../store/useSocialStore";
import type {
  SerializedSpirit,
  SocialChatMessage,
  SocialPlayer,
} from "../store/socialTypes";
import { BackButton } from "./BackButton";
import { CharacterAvatar } from "./CharacterAvatar";
import { requestGroupSpiritChat } from "../utils/groupSpiritChat";

const MAX_INPUT = 200;
const SPIRIT_REPLY_COOLDOWN_MS = 30_000; // 同一词灵两次回复间隔

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const stripAtPrefix = (text: string): string =>
  text.replace(/^@\S+\s*/, "").trim();

export const SocialRoomScreen: React.FC = () => {
  const setPhase = useGameStore((s) => s.setPhase);
  const { apiKey, baseUrl, model, apiMode } = useGameStore();
  const { playerId } = usePlayerStore();
  const {
    currentRoom,
    leaveRoom,
    sendPlayerMessage,
    sendSpiritMessage,
    createChallenge,
    resolveChallenge,
    setBattleSpirit,
    setError,
  } = useSocialStore();

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setErrorLocal] = useState("");
  const [copied, setCopied] = useState(false);
  const [pendingSpiritReplies, setPendingSpiritReplies] = useState<
    Record<string, string>
  >({});
  const [streamingSpiritId, setStreamingSpiritId] = useState<string | null>(
    null,
  );
  const lastSpiritReplyAtRef = useRef<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // 同步错误
  const showError = (msg: string) => {
    setErrorLocal(msg);
    setError("");
  };

  // 自动滚动到底
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [currentRoom?.messages.length, pendingSpiritReplies, streamingSpiritId]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 80;
  };

  // 监听对战开始 → 切换到对战界面
  useEffect(() => {
    if (!currentRoom?.activeBattle) return;
    const battle = currentRoom.activeBattle;
    if (
      battle.phase === "preparing" &&
      (battle.hostPlayerId === playerId || battle.guestPlayerId === playerId)
    ) {
      setPhase("SOCIAL_BATTLE");
    }
  }, [currentRoom?.activeBattle, playerId, setPhase]);

  // 卸载时停止心跳
  useEffect(() => {
    return () => {
      // 仅在真正离开房间时停止心跳；进入对战界面不停止
    };
  }, []);

  const handleLeave = () => {
    stopHeartbeat();
    leaveRoom();
    setPhase("MODE_SELECT");
  };

  const handleCopyRoom = async () => {
    if (!currentRoom) return;
    const link = `${window.location.origin}${window.location.pathname}#room=${currentRoom.roomCode}`;
    try {
      await navigator.clipboard.writeText(`${currentRoom.roomCode} · ${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showError("复制失败，请手动复制房间码");
    }
  };

  // 房间内可被 @ 的词灵列表（汇总所有玩家携带的词灵，自己的排后面）
  const mentionableSpirits = useMemo<SerializedSpirit[]>(() => {
    if (!currentRoom) return [];
    const others: SerializedSpirit[] = [];
    const mine: SerializedSpirit[] = [];
    currentRoom.players.forEach((p) => {
      const target = p.playerId === playerId ? mine : others;
      p.carriedSpirits?.forEach((s) => {
        if (!target.find((x) => x.rosterId === s.rosterId)) {
          target.push(s);
        }
      });
      // 兼容旧数据：若 carriedSpirits 缺失但 activeSpirit 存在
      if (!p.carriedSpirits && p.activeSpirit) {
        target.push(p.activeSpirit);
      }
    });
    return [...others, ...mine];
  }, [currentRoom, playerId]);

  const mySpirit = useMemo<SerializedSpirit | null>(() => {
    if (!currentRoom) return null;
    const me = currentRoom.players.find((p) => p.playerId === playerId);
    return me?.activeSpirit ?? me?.carriedSpirits?.[0] ?? null;
  }, [currentRoom, playerId]);

  const isBattleRoom = currentRoom?.mode === "battle";

  // 1v1 对战房间：双方都在且有出战词灵时，房主自动发起约战并接受
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (!isBattleRoom || !currentRoom) return;
    if (autoStartRef.current) return;
    if (currentRoom.activeBattle || currentRoom.pendingChallenge) return;
    if (currentRoom.players.length < 2) return;
    const host = currentRoom.players[0];
    const guest = currentRoom.players[1];
    if (!host?.activeSpirit || !guest?.activeSpirit) return;
    if (playerId !== host.playerId) return; // 仅房主发起
    autoStartRef.current = true;
    createChallenge(guest);
    // 房主作为发起方，约战邀请的 toPlayerId 是 guest，需要 guest 接受
    // 这里房主无法替 guest 接受，所以等待 guest 端自动接受
  }, [isBattleRoom, currentRoom, playerId, createChallenge]);

  // 1v1 对战房间：guest 自动接受约战
  const pendingChallengeForBattle = currentRoom?.pendingChallenge ?? null;
  useEffect(() => {
    if (!isBattleRoom) return;
    const pending = pendingChallengeForBattle;
    if (!pending || pending.status !== "pending") return;
    if (pending.toPlayerId !== playerId) return;
    // guest 端立即接受
    const t = setTimeout(() => {
      resolveChallenge(pending.id, "accepted");
    }, 600);
    return () => clearTimeout(t);
  }, [isBattleRoom, pendingChallengeForBattle, playerId, resolveChallenge]);

  if (!currentRoom) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-white/60 mb-4">房间已关闭</div>
          <button
            type="button"
            onClick={() => setPhase("SOCIAL_LOBBY")}
            className="px-4 py-2 text-sm border border-[#A78BFA] text-[#A78BFA] hover:bg-[#A78BFA] hover:text-[#0B0C10] transition-all"
          >
            返回社交大厅
          </button>
        </div>
      </div>
    );
  }

  const isCustomReady = apiMode === "custom" && apiKey && baseUrl && model;
  const isFreeMode = apiMode === "free";
  const isAiReady = isFreeMode || isCustomReady;

  /** 处理发消息：解析 @词灵，发送玩家消息，必要时触发词灵回复 */
  const sendMessage = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || isSending) return;
    if (!currentRoom) return;

    setInput("");
    setErrorLocal("");

    // 解析 @ 提及：匹配 "@名字" 直到空格
    const mentionRegex = /@([^\s@]+)/g;
    const mentionedNames: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(text)) !== null) {
      mentionedNames.push(match[1]);
    }

    const mentionedSpirits = mentionedNames
      .map((name) => mentionableSpirits.find((s) => s.name === name))
      .filter((s): s is SerializedSpirit => Boolean(s));

    const mentionedPlayerIds = mentionedNames
      .map(
        (name) =>
          currentRoom.players.find((p) => p.nickname === name)?.playerId,
      )
      .filter((id): id is string => Boolean(id));

    // 发送玩家消息
    sendPlayerMessage(text, [
      ...mentionedSpirits.map((s) => s.rosterId),
      ...mentionedPlayerIds,
    ]);

    if (mentionedSpirits.length === 0) return;
    if (!isAiReady) {
      showError("词灵回复需要先在首页选择免费体验或填写 custom API");
      return;
    }

    // 触发词灵回复（仅第一个被 @ 的词灵回复，避免刷屏）
    const targetSpirit = mentionedSpirits[0];
    const now = Date.now();
    const lastReplyAt =
      lastSpiritReplyAtRef.current[targetSpirit.rosterId] ?? 0;
    if (now - lastReplyAt < SPIRIT_REPLY_COOLDOWN_MS) {
      // 冷却中，发系统提示
      useSocialStore
        .getState()
        .sendSystemMessage(
          `${targetSpirit.name} 刚刚说过话了，稍等 ${Math.ceil(
            (SPIRIT_REPLY_COOLDOWN_MS - (now - lastReplyAt)) / 1000,
          )} 秒再 @ 它吧。`,
        );
      return;
    }
    lastSpiritReplyAtRef.current[targetSpirit.rosterId] = now;

    setIsSending(true);
    setStreamingSpiritId(targetSpirit.rosterId);
    setPendingSpiritReplies((prev) => ({
      ...prev,
      [targetSpirit.rosterId]: "",
    }));

    const hostPlayer =
      currentRoom.players.find(
        (p) => p.activeSpirit?.rosterId === targetSpirit.rosterId,
      ) ?? currentRoom.players[0];

    const triggerText = stripAtPrefix(text);
    const cfg = { apiKey, baseUrl, model, apiMode };

    try {
      const finalReply = await requestGroupSpiritChat(
        cfg,
        targetSpirit,
        triggerText,
        {
          roomCode: currentRoom.roomCode,
          playerCount: currentRoom.players.length,
          spiritsInRoom: mentionableSpirits.map((s) => s.name),
          recentMessages: currentRoom.messages,
        },
        {
          onReplyChunk: (partial) => {
            setPendingSpiritReplies((prev) => ({
              ...prev,
              [targetSpirit.rosterId]: partial,
            }));
          },
        },
      );
      // 以词灵身份发送正式消息
      sendSpiritMessage(targetSpirit, hostPlayer, finalReply);
      setPendingSpiritReplies((prev) => {
        const next = { ...prev };
        delete next[targetSpirit.rosterId];
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "词灵暂时没有回应。";
      showError(msg);
    } finally {
      setIsSending(false);
      setStreamingSpiritId(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleQuickMention = (spirit: SerializedSpirit) => {
    setInput((prev) => {
      const prefix = prev && !prev.endsWith(" ") ? `${prev} ` : prev;
      return `${prefix}@${spirit.name} `;
    });
    inputRef.current?.focus();
  };

  const pending = currentRoom.pendingChallenge;
  const isPendingForMe =
    pending && pending.toPlayerId === playerId && pending.status === "pending";
  const isPendingFromMe =
    pending &&
    pending.fromPlayerId === playerId &&
    pending.status === "pending";

  return (
    <div className="h-screen grid-bg relative overflow-hidden flex flex-col">
      {/* 顶部条 */}
      <header className="relative z-20 shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-[#A78BFA]/20 bg-[#0B0C10]/80 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <BackButton onClick={handleLeave} color="#A78BFA" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-base md:text-lg font-black tracking-wider ${
                  isBattleRoom ? "text-[#FF003C]" : "text-[#A78BFA]"
                }`}
                style={{
                  textShadow: isBattleRoom
                    ? "0 0 12px rgba(255,0,60,0.55)"
                    : "0 0 12px rgba(167,139,250,0.55)",
                }}
              >
                {isBattleRoom ? "对战房 " : "房间 "}
                {currentRoom.roomCode}
              </span>
              {isBattleRoom && (
                <span className="text-[9px] font-mono tracking-widest text-[#FF003C]/80 border border-[#FF003C]/40 px-1.5 py-0.5 rounded">
                  1v1 BATTLE
                </span>
              )}
              <button
                type="button"
                onClick={handleCopyRoom}
                className="flex items-center gap-1.5 rounded border border-[#A78BFA]/40 px-2 py-1 text-[10px] font-mono tracking-widest text-[#A78BFA] hover:bg-[#A78BFA]/15 transition-all"
                title="复制房间码与链接"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? "已复制" : "复制邀请"}
              </button>
            </div>
            <div className="text-[10px] font-mono tracking-widest text-white/40 mt-0.5">
              {currentRoom.players.length} 位契约者 ·{" "}
              {mentionableSpirits.length} 位词灵
              {isBattleRoom && currentRoom.players.length < 2 && (
                <span className="text-[#FFD700]"> · 等待对手加入...</span>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLeave}
          className="flex items-center gap-1.5 rounded border border-[#FF6B9D]/40 px-3 py-1.5 text-[10px] font-mono tracking-widest text-[#FF6B9D] hover:bg-[#FF6B9D]/15 transition-all"
        >
          <LogOut size={12} />
          离开
        </button>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-0">
        {/* 左侧：玩家列表 */}
        <aside className="hidden lg:flex flex-col border-r border-[#A78BFA]/15 bg-[#0B0C10]/60 backdrop-blur-sm overflow-hidden">
          <div className="shrink-0 px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <Users size={14} className="text-[#A78BFA]" />
            <span className="text-[10px] font-mono tracking-[0.3em] text-white/60">
              PLAYERS
            </span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-2">
            {currentRoom.players.map((p) => (
              <PlayerCard
                key={p.playerId}
                player={p}
                isMe={p.playerId === playerId}
                canChallenge={
                  !isBattleRoom &&
                  Boolean(mySpirit) &&
                  Boolean(p.activeSpirit) &&
                  p.playerId !== playerId &&
                  !pending
                }
                onChallenge={() => createChallenge(p)}
                onSetBattleSpirit={
                  p.playerId === playerId ? setBattleSpirit : undefined
                }
              />
            ))}
          </div>
          <div className="shrink-0 px-4 py-3 border-t border-white/5 text-[10px] text-white/30 leading-relaxed">
            <div className="flex items-center gap-1.5">
              <Sparkles size={11} className="text-[#FFD700]" />
              <span>
                {isBattleRoom
                  ? "对战房 · 对手加入即自动开战"
                  : "带词灵才能约战 · 点自己的词灵切换出战"}
              </span>
            </div>
          </div>
        </aside>

        {/* 右侧：聊天区 */}
        <main className="flex flex-col min-h-0 relative">
          {/* 消息列表 */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 py-4 space-y-3"
          >
            {currentRoom.messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                isMe={msg.senderId === playerId}
              />
            ))}
            {/* 流式词灵回复气泡 / 正在输入占位 */}
            {streamingSpiritId &&
              (() => {
                const spirit = mentionableSpirits.find(
                  (s) => s.rosterId === streamingSpiritId,
                );
                if (!spirit) return null;
                const partial = pendingSpiritReplies[streamingSpiritId];
                if (!partial) {
                  return <SpiritTypingBubble spirit={spirit} />;
                }
                return (
                  <StreamingSpiritBubble spirit={spirit} content={partial} />
                );
              })()}
            {currentRoom.messages.length === 0 && !streamingSpiritId && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Sparkles size={36} className="text-[#A78BFA]/40 mb-3" />
                <div className="text-sm text-white/50">群里还没有人说话</div>
                <div className="text-xs text-white/30 mt-1">
                  打个招呼，或者 @ 你的词灵试试
                </div>
              </div>
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="shrink-0 mx-4 mb-2 rounded border border-[#FF6B9D]/45 bg-[#FF6B9D]/10 px-3 py-2 text-[11px] text-[#FF6B9D]">
              {error}
            </div>
          )}

          {/* 快捷 @ 词灵 */}
          {mentionableSpirits.length > 0 && (
            <div className="shrink-0 flex items-center gap-2 px-4 md:px-6 py-2 border-t border-white/5 overflow-x-auto scrollbar-hide">
              <span className="shrink-0 text-[9px] font-mono tracking-[0.28em] text-white/30">
                @ 词灵 ▸
              </span>
              {mentionableSpirits.map((s) => (
                <button
                  key={s.rosterId}
                  type="button"
                  onClick={() => handleQuickMention(s)}
                  disabled={isSending}
                  className="shrink-0 flex items-center gap-1.5 rounded-full border border-[#FFD700]/40 bg-[#FFD700]/10 px-2.5 py-1 text-[10px] font-mono text-[#FFD700] hover:bg-[#FFD700]/20 transition-all disabled:opacity-40"
                >
                  {s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt=""
                      className="h-4 w-4 rounded-full object-cover"
                    />
                  ) : (
                    <span className="h-4 w-4 rounded-full bg-[#FFD700]/30 flex items-center justify-center text-[8px] font-black">
                      {s.name.slice(0, 1)}
                    </span>
                  )}
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {/* 输入框 */}
          <form
            onSubmit={handleSubmit}
            className="shrink-0 flex items-center gap-2 px-4 md:px-6 py-3 border-t border-[#A78BFA]/15 bg-[#0B0C10]/80 backdrop-blur-md"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              maxLength={MAX_INPUT}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`在房间 ${currentRoom.roomCode} 发言... (@词灵 触发回复, Enter 发送)`}
              disabled={isSending}
              className="flex-1 bg-black/50 border border-[#A78BFA]/35 focus:border-[#A78BFA] outline-none px-4 py-2.5 text-sm text-white placeholder:text-white/30 transition-colors disabled:opacity-60"
            />
            <span className="hidden sm:block text-[10px] font-mono text-white/30 tabular-nums">
              {input.length}/{MAX_INPUT}
            </span>
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="flex items-center justify-center h-10 w-10 rounded border-2 border-[#A78BFA] text-[#A78BFA] transition-all hover:bg-[#A78BFA] hover:text-[#0B0C10] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#A78BFA]"
            >
              {isSending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </form>
        </main>
      </div>

      {/* 约战邀请弹层 */}
      <AnimatePresence>
        {isPendingForMe && pending && (
          <ChallengeModal
            pending={pending}
            onAccept={() => resolveChallenge(pending.id, "accepted")}
            onDecline={() => resolveChallenge(pending.id, "declined")}
          />
        )}
      </AnimatePresence>

      {/* 自己发起的约战等待中提示 */}
      <AnimatePresence>
        {isPendingFromMe && pending && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-[#FFD700]/50 bg-[#0B0C10]/95 px-5 py-2.5 text-xs text-[#FFD700] backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          >
            <Loader2 size={13} className="animate-spin" />
            <span className="tracking-wider">
              等待 {pending.toPlayerName} 接受约战...
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const PlayerCard: React.FC<{
  player: SocialPlayer;
  isMe: boolean;
  canChallenge: boolean;
  onChallenge: () => void;
  onSetBattleSpirit?: (rosterId: string) => void;
}> = ({ player, isMe, canChallenge, onChallenge, onSetBattleSpirit }) => {
  const carried = player.carriedSpirits?.length
    ? player.carriedSpirits
    : player.activeSpirit
      ? [player.activeSpirit]
      : [];
  const active = player.activeSpirit ?? carried[0] ?? null;
  return (
    <motion.div
      layout
      className={`relative rounded-lg border p-2.5 transition-all ${
        isMe
          ? "border-[#66FCF1]/50 bg-[#66FCF1]/8"
          : "border-white/10 bg-black/30"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="relative h-9 w-9 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-black"
          style={{
            borderColor: player.avatarColor,
            color: player.avatarColor,
            background: `${player.avatarColor}15`,
            boxShadow: player.isOnline
              ? `0 0 10px ${player.avatarColor}55`
              : "none",
          }}
        >
          {player.nickname.slice(0, 1).toUpperCase()}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0B0C10] ${
              player.isOnline ? "bg-[#7FFF9F]" : "bg-white/30"
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white truncate">
              {player.nickname}
            </span>
            {isMe && (
              <span className="text-[8px] font-mono text-[#66FCF1]/80 border border-[#66FCF1]/30 px-1 rounded">
                YOU
              </span>
            )}
          </div>
          <div className="text-[10px] text-white/40 truncate mt-0.5">
            {active
              ? `出战 · ${active.name}${carried.length > 1 ? ` (+${carried.length - 1})` : ""}`
              : "未携带词灵"}
          </div>
        </div>
      </div>

      {/* 词灵列表：自己可切换出战，他人仅展示 */}
      {carried.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {carried.map((s) => {
            const isActive = active?.rosterId === s.rosterId;
            const clickable = isMe && onSetBattleSpirit && !isActive;
            return (
              <button
                key={s.rosterId}
                type="button"
                disabled={!clickable}
                onClick={() => onSetBattleSpirit?.(s.rosterId)}
                title={clickable ? `切换 ${s.name} 出战` : s.name}
                className={`relative flex items-center gap-1.5 rounded border px-1.5 py-1 transition-all ${
                  isActive
                    ? "border-[#FFD700]/70 bg-[#FFD700]/12"
                    : "border-white/10 bg-black/40"
                } ${
                  clickable
                    ? "hover:border-[#FFD700]/50 cursor-pointer"
                    : "cursor-default"
                }`}
              >
                <div className="h-6 w-6 shrink-0 overflow-hidden rounded">
                  <CharacterAvatar
                    imageUrl={s.imageUrl}
                    name={s.name}
                    themeColor={isActive ? "#FFD700" : player.avatarColor}
                    className="h-full w-full"
                    iconSize={11}
                  />
                </div>
                <span
                  className={`text-[10px] truncate max-w-[70px] ${
                    isActive ? "text-[#FFD700] font-bold" : "text-white/70"
                  }`}
                >
                  {s.name}
                </span>
                {isActive && (
                  <span className="text-[7px] font-mono tracking-widest text-[#FFD700]/80">
                    战
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {canChallenge && (
        <button
          type="button"
          onClick={onChallenge}
          className="mt-2 w-full flex items-center justify-center gap-1.5 rounded border border-[#FF003C]/50 py-1.5 text-[10px] font-black tracking-widest text-[#FF003C] hover:bg-[#FF003C] hover:text-white transition-all"
        >
          <Swords size={11} />
          约战
        </button>
      )}
    </motion.div>
  );
};

const ChatMessageBubble: React.FC<{
  message: SocialChatMessage;
  isMe: boolean;
}> = ({ message, isMe }) => {
  // 系统消息：居中灰条
  if (message.type === "system") {
    return (
      <div className="flex justify-center">
        <div className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] text-white/50 tracking-wide">
          {message.content}
        </div>
      </div>
    );
  }
  // 战报消息：金色卡片
  if (message.type === "battle_report") {
    return (
      <div className="flex justify-center">
        <div className="rounded-lg border border-[#FFD700]/45 bg-[#FFD700]/10 px-4 py-2 text-xs text-[#FFD700] tracking-wide flex items-center gap-2">
          <Shield size={12} />
          {message.content}
        </div>
      </div>
    );
  }

  const isSpirit = message.type === "spirit";
  // 词灵消息靠左，玩家消息：自己靠右、他人靠左
  const alignRight = !isSpirit && isMe;
  const accentColor = message.senderColor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2.5 ${alignRight ? "justify-end" : "justify-start"}`}
    >
      {!alignRight && (
        <div
          className="h-8 w-8 shrink-0 overflow-hidden rounded border bg-[#0B0C10]"
          style={{ borderColor: `${accentColor}66` }}
        >
          {isSpirit && message.senderAvatar ? (
            <img
              src={message.senderAvatar}
              alt={message.senderName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="h-full w-full flex items-center justify-center text-xs font-black"
              style={{ color: accentColor }}
            >
              {message.senderName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      )}
      <div className={`max-w-[75%] ${alignRight ? "text-right" : "text-left"}`}>
        <div className="flex items-center gap-1.5 mb-1">
          {isSpirit && (
            <span className="text-[8px] font-mono tracking-widest text-[#FFD700]/70 border border-[#FFD700]/30 px-1 rounded">
              SPIRIT
            </span>
          )}
          <span
            className="text-[10px] font-bold tracking-wide"
            style={{ color: accentColor }}
          >
            {alignRight ? "你" : message.senderName}
          </span>
          <span className="text-[9px] text-white/30">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <div
          className="rounded-lg border px-3 py-2 text-sm leading-relaxed backdrop-blur-sm"
          style={{
            borderColor: alignRight
              ? "rgba(167,139,250,0.45)"
              : `${accentColor}66`,
            background: alignRight
              ? "rgba(167,139,250,0.12)"
              : isSpirit
                ? "rgba(11,12,16,0.6)"
                : "rgba(11,12,16,0.5)",
            color: "#E5E7EB",
          }}
        >
          {renderContentWithMentions(message.content, message.mentions)}
        </div>
      </div>
    </motion.div>
  );
};

/** 把 @名字 高亮显示 */
const renderContentWithMentions = (
  content: string,
  mentions?: string[],
): React.ReactNode => {
  if (!mentions || mentions.length === 0) return content;
  const parts: React.ReactNode[] = [];
  const regex = /@([^\s@]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={`m-${key++}`}
        className="text-[#FFD700] font-bold"
        style={{ textShadow: "0 0 8px rgba(255,215,0,0.4)" }}
      >
        @{match[1]}
      </span>,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  return parts;
};

const SpiritTypingBubble: React.FC<{
  spirit: SerializedSpirit;
}> = ({ spirit }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex gap-2.5 justify-start"
  >
    <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-[#FFD700]/50 bg-[#0B0C10]">
      {spirit.imageUrl ? (
        <img
          src={spirit.imageUrl}
          alt={spirit.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-xs font-black text-[#FFD700]">
          {spirit.name.slice(0, 1)}
        </div>
      )}
    </div>
    <div className="max-w-[75%]">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[8px] font-mono tracking-widest text-[#FFD700]/70 border border-[#FFD700]/30 px-1 rounded">
          SPIRIT
        </span>
        <span className="text-[10px] font-bold text-[#FFD700]">
          {spirit.name}
        </span>
      </div>
      <div className="rounded-lg border border-[#FFD700]/50 bg-[#0B0C10]/70 px-3 py-2 text-sm leading-relaxed text-[#E5E7EB]">
        <span className="inline-flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#FFD700] animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#FFD700]/70 animate-bounce"
            style={{ animationDelay: "120ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#FFD700]/45 animate-bounce"
            style={{ animationDelay: "240ms" }}
          />
        </span>
      </div>
    </div>
  </motion.div>
);

const StreamingSpiritBubble: React.FC<{
  spirit: SerializedSpirit;
  content: string;
}> = ({ spirit, content }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex gap-2.5 justify-start"
  >
    <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-[#FFD700]/50 bg-[#0B0C10]">
      {spirit.imageUrl ? (
        <img
          src={spirit.imageUrl}
          alt={spirit.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-xs font-black text-[#FFD700]">
          {spirit.name.slice(0, 1)}
        </div>
      )}
    </div>
    <div className="max-w-[75%]">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[8px] font-mono tracking-widest text-[#FFD700]/70 border border-[#FFD700]/30 px-1 rounded">
          SPIRIT
        </span>
        <span className="text-[10px] font-bold text-[#FFD700]">
          {spirit.name}
        </span>
        <Loader2 size={9} className="animate-spin text-[#FFD700]/60" />
      </div>
      <div className="rounded-lg border border-[#FFD700]/50 bg-[#0B0C10]/70 px-3 py-2 text-sm leading-relaxed text-[#E5E7EB]">
        {content}
        <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-[#FFD700]" />
      </div>
    </div>
  </motion.div>
);

const ChallengeModal: React.FC<{
  pending: NonNullable<
    ReturnType<typeof useSocialStore.getState>["currentRoom"]
  >["pendingChallenge"];
  onAccept: () => void;
  onDecline: () => void;
}> = ({ pending, onAccept, onDecline }) => {
  if (!pending) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        className="relative w-full max-w-md rounded-2xl border-2 border-[#FF003C]/60 bg-[#0B0C10] p-6 shadow-[0_0_40px_rgba(255,0,60,0.25)]"
      >
        <div className="flex items-center justify-center mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#FF003C] bg-[#FF003C]/15">
            <Swords size={26} className="text-[#FF003C]" />
          </div>
        </div>
        <div className="text-center mb-2">
          <div className="text-[10px] font-mono tracking-[0.4em] text-[#FF003C]/80">
            CHALLENGE
          </div>
          <div className="text-xl font-black text-white mt-1">
            {pending.fromPlayerName}
          </div>
          <div className="text-xs text-white/50 mt-1">向你发起约战</div>
        </div>
        <div className="my-5 flex items-center justify-center gap-3 text-sm">
          <div className="text-center">
            <div className="text-[10px] text-white/40 mb-1">挑战者</div>
            <div className="font-bold text-[#FF003C]">
              {pending.fromSpiritName}
            </div>
          </div>
          <Swords size={20} className="text-white/30" />
          <div className="text-center">
            <div className="text-[10px] text-white/40 mb-1">应战者</div>
            <div className="font-bold text-[#66FCF1]">
              {pending.toSpiritName}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-white/15 py-2.5 text-xs font-bold tracking-widest text-white/60 hover:bg-white/5 transition-all"
          >
            <X size={14} />
            拒绝
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border-2 border-[#FF003C] bg-[#FF003C] py-2.5 text-xs font-black tracking-widest text-white hover:brightness-110 transition-all"
          >
            <Check size={14} />
            应战
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// 保留 DoorOpen 引用避免 tree-shake 警告
void DoorOpen;
