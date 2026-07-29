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
import { generateMessageId } from "../store/socialTypes";
import type {
  SerializedSpirit,
  SocialChatMessage,
  SocialPlayer,
} from "../store/socialTypes";
import { BackButton } from "./BackButton";
import { SpiritCard } from "./SpiritCard";
import { HeroCard } from "./HeroCard";
import { RARITY_CONFIGS } from "../store/useGameStore";
import { requestGroupSpiritChat } from "../utils/groupSpiritChat";

const MAX_INPUT = 200;
const MAX_SPIRITS_PER_MESSAGE = 5;
const SPIRIT_REPLY_COOLDOWN_MS = 5_000; // 同一词灵两次回复间隔
const MAX_MENTION_SUGGESTIONS = 8;

type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

type MentionCandidate = {
  id: string;
  kind: "player" | "spirit";
  name: string;
  label: string;
  color: string;
  imageUrl?: string;
  isOnline?: boolean;
};

type StreamingSpiritMessage = Pick<SocialChatMessage, "id" | "timestamp">;

type DisplayedChatItem = {
  key: string;
  message: SocialChatMessage;
  isMe: boolean;
  isContinuation: boolean;
  streaming: boolean;
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const stripAtPrefix = (text: string): string =>
  text.replace(/^@\S+\s*/, "").trim();

const getActiveMention = (
  value: string,
  caretIndex: number,
): ActiveMention | null => {
  const caret = Math.max(0, Math.min(caretIndex, value.length));
  const textBeforeCaret = value.slice(0, caret);
  const atIndex = textBeforeCaret.lastIndexOf("@");
  if (atIndex < 0) return null;

  const query = value.slice(atIndex + 1, caret);
  if (/\s/.test(query) || query.includes("@")) return null;

  const textAfterCaret = value.slice(caret);
  const nextWhitespace = textAfterCaret.search(/\s/);
  const end = nextWhitespace === -1 ? value.length : caret + nextWhitespace;

  return {
    start: atIndex,
    end,
    query,
  };
};

const isMessageContinuation = (
  message: SocialChatMessage,
  previous?: SocialChatMessage,
): boolean => {
  if (
    !previous ||
    message.type === "system" ||
    message.type === "battle_report"
  ) {
    return false;
  }

  const elapsed = message.timestamp - previous.timestamp;
  return (
    message.type === previous.type &&
    message.senderId === previous.senderId &&
    elapsed >= 0 &&
    elapsed < 180_000
  );
};

export const SocialRoomScreen: React.FC = () => {
  const setPhase = useGameStore((s) => s.setPhase);
  const { apiKey, baseUrl, model, apiMode } = useGameStore();
  const { playerId, nickname } = usePlayerStore();
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
  const [inputCaretIndex, setInputCaretIndex] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [error, setErrorLocal] = useState("");
  const [copied, setCopied] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [pendingSpiritReplies, setPendingSpiritReplies] = useState<
    Record<string, string>
  >({});
  const [streamingSpiritIds, setStreamingSpiritIds] = useState<string[]>([]);
  const [streamingSpiritMessages, setStreamingSpiritMessages] = useState<
    Record<string, StreamingSpiritMessage>
  >({});
  // 词灵详情查看：点击玩家列表里的词灵卡，弹出精美大卡 + persona
  const [inspectSpirit, setInspectSpirit] = useState<{
    spirit: SerializedSpirit;
    ownerName: string;
    isMine: boolean;
    isActive: boolean;
  } | null>(null);
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
  }, [currentRoom?.messages.length, pendingSpiritReplies, streamingSpiritIds]);

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
      await navigator.clipboard.writeText(link);
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

  // 我方词灵的 rosterId 集合：用于在 @词灵 快捷条里区分自己/对方
  const mySpiritIds = useMemo<Set<string>>(() => {
    if (!currentRoom) return new Set();
    const me = currentRoom.players.find((p) => p.playerId === playerId);
    const ids = new Set<string>();
    me?.carriedSpirits?.forEach((s) => ids.add(s.rosterId));
    if (me?.activeSpirit) ids.add(me.activeSpirit.rosterId);
    return ids;
  }, [currentRoom, playerId]);

  // 房间内可被 @ 的其他玩家（自己不出现在快捷条里）
  const mentionablePlayers = useMemo(() => {
    if (!currentRoom) return [];
    return currentRoom.players.filter((p) => p.playerId !== playerId);
  }, [currentRoom, playerId]);

  // 玩家昵称集合（用于聊天气泡里区分 @人 与 @词灵 的高亮颜色）
  const playerNameSet = useMemo(
    () => new Set(currentRoom?.players.map((p) => p.nickname) ?? []),
    [currentRoom],
  );

  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    const players = mentionablePlayers.map((p) => ({
      id: p.playerId,
      kind: "player" as const,
      name: p.nickname,
      label: p.isOnline ? "契约者在线" : "契约者离线",
      color: p.avatarColor,
      isOnline: p.isOnline,
    }));

    const spirits = mentionableSpirits.map((s) => {
      const isMine = mySpiritIds.has(s.rosterId);
      const color = isMine ? "#FFD700" : "#66FCF1";
      return {
        id: s.rosterId,
        kind: "spirit" as const,
        name: s.name,
        label: isMine ? "我方词灵" : "对方词灵",
        color,
        imageUrl: s.imageUrl,
      };
    });

    return [...players, ...spirits];
  }, [mentionablePlayers, mentionableSpirits, mySpiritIds]);

  const activeMention = useMemo(
    () => getActiveMention(input, inputCaretIndex),
    [input, inputCaretIndex],
  );

  const visibleMentionSuggestions = useMemo(() => {
    if (!activeMention) return [];
    const query = activeMention.query.trim().toLowerCase();
    const matches = query
      ? mentionCandidates.filter((candidate) =>
          candidate.name.toLowerCase().includes(query),
        )
      : mentionCandidates;
    return matches.slice(0, MAX_MENTION_SUGGESTIONS);
  }, [activeMention, mentionCandidates]);

  const showMentionSuggestions = Boolean(
    isInputFocused && activeMention && visibleMentionSuggestions.length > 0,
  );

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [
    activeMention?.start,
    activeMention?.query,
    visibleMentionSuggestions.length,
  ]);

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

    setErrorLocal("");

    // 解析 @ 提及：匹配 "@名字" 直到空格
    const mentionRegex = /@([^\s@]+)/g;
    const mentionedNames: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(text)) !== null) {
      mentionedNames.push(match[1]);
    }

    const mentionedSpirits = mentionedNames.reduce<SerializedSpirit[]>(
      (spirits, name) => {
        const spirit = mentionableSpirits.find((s) => s.name === name);
        if (spirit && !spirits.some((s) => s.rosterId === spirit.rosterId)) {
          spirits.push(spirit);
        }
        return spirits;
      },
      [],
    );

    const mentionedPlayerIds = mentionedNames
      .map(
        (name) =>
          currentRoom.players.find((p) => p.nickname === name)?.playerId,
      )
      .filter((id): id is string => Boolean(id));

    if (mentionedSpirits.length > MAX_SPIRITS_PER_MESSAGE) {
      showError(`一次最多 @ ${MAX_SPIRITS_PER_MESSAGE} 位词灵`);
      return;
    }

    setInput("");

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

    const now = Date.now();
    const readySpirits = mentionedSpirits.filter((spirit) => {
      const lastReplyAt = lastSpiritReplyAtRef.current[spirit.rosterId] ?? 0;
      return now - lastReplyAt >= SPIRIT_REPLY_COOLDOWN_MS;
    });
    const coolingSpirits = mentionedSpirits.filter(
      (spirit) => !readySpirits.some((s) => s.rosterId === spirit.rosterId),
    );

    if (coolingSpirits.length > 0) {
      const waitSeconds = Math.max(
        ...coolingSpirits.map((spirit) =>
          Math.ceil(
            (SPIRIT_REPLY_COOLDOWN_MS -
              (now - (lastSpiritReplyAtRef.current[spirit.rosterId] ?? now))) /
              1000,
          ),
        ),
      );
      useSocialStore
        .getState()
        .sendSystemMessage(
          `${coolingSpirits.map((spirit) => spirit.name).join("、")} 刚刚说过话了，稍等 ${waitSeconds} 秒再 @ 它吧。`,
        );
    }

    if (readySpirits.length === 0) return;

    setIsSending(true);
    const triggerText = stripAtPrefix(text);
    const cfg = { apiKey, baseUrl, model, apiMode };
    const recentMessages: SocialChatMessage[] = [
      ...currentRoom.messages,
      {
        id: "pending-player-message",
        type: "player",
        senderId: playerId,
        senderName: nickname,
        senderColor: "#FFFFFF",
        content: text,
        timestamp: now,
      },
    ];
    const failedSpirits: string[] = [];
    const streamingMessages = Object.fromEntries(
      readySpirits.map((spirit, index) => [
        spirit.rosterId,
        {
          id: generateMessageId(),
          // 保持多词灵回复的 @ 顺序，同时使流式和最终消息拥有完全一致的时间行。
          timestamp: now + index + 1,
        },
      ]),
    ) as Record<string, StreamingSpiritMessage>;

    setStreamingSpiritIds(readySpirits.map((spirit) => spirit.rosterId));
    setStreamingSpiritMessages(streamingMessages);
    setPendingSpiritReplies(
      Object.fromEntries(readySpirits.map((spirit) => [spirit.rosterId, ""])),
    );

    try {
      const replyTasks = readySpirits.map(async (targetSpirit) => {
        lastSpiritReplyAtRef.current[targetSpirit.rosterId] = Date.now();
        const hostPlayer =
          currentRoom.players.find(
            (p) =>
              p.activeSpirit?.rosterId === targetSpirit.rosterId ||
              p.carriedSpirits?.some(
                (spirit) => spirit.rosterId === targetSpirit.rosterId,
              ),
          ) ?? currentRoom.players[0];

        try {
          const finalReply = await requestGroupSpiritChat(
            cfg,
            targetSpirit,
            triggerText,
            {
              roomCode: currentRoom.roomCode,
              playerCount: currentRoom.players.length,
              spiritsInRoom: mentionableSpirits.map((s) => s.name),
              recentMessages,
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
          return { ok: true as const, targetSpirit, hostPlayer, finalReply };
        } catch {
          return { ok: false as const, targetSpirit };
        }
      });

      for (let index = 0; index < replyTasks.length; index += 1) {
        const targetSpirit = readySpirits[index];
        const result = await replyTasks[index];
        if (result.ok) {
          sendSpiritMessage(
            result.targetSpirit,
            result.hostPlayer,
            result.finalReply,
            streamingMessages[result.targetSpirit.rosterId],
          );
        } else {
          failedSpirits.push(result.targetSpirit.name);
        }

        if (targetSpirit) {
          setPendingSpiritReplies((prev) => {
            const next = { ...prev };
            delete next[targetSpirit.rosterId];
            return next;
          });
          setStreamingSpiritIds((ids) =>
            ids.filter((id) => id !== targetSpirit.rosterId),
          );
          setStreamingSpiritMessages((messages) => {
            const next = { ...messages };
            delete next[targetSpirit.rosterId];
            return next;
          });
        }
      }
      if (failedSpirits.length > 0) {
        showError(`${failedSpirits.join("、")} 暂时没有回应。`);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const syncInputCaret = () => {
    const caret = inputRef.current?.selectionStart ?? input.length;
    setInputCaretIndex(caret);
  };

  const applyMentionCandidate = (candidate: MentionCandidate) => {
    const mention = getActiveMention(
      input,
      inputRef.current?.selectionStart ?? inputCaretIndex,
    );
    if (!mention) return;

    const before = input.slice(0, mention.start);
    const after = input.slice(mention.end).replace(/^\s*/, "");
    const insertion = `@${candidate.name} `;
    const nextInput = `${before}${insertion}${after}`.slice(0, MAX_INPUT);
    const nextCaret = Math.min(
      before.length + insertion.length,
      nextInput.length,
    );

    setInput(nextInput);
    setInputCaretIndex(nextCaret);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 整块删除已插入的 @提及：光标紧跟在 "@名字 " 之后时，一次 Backspace 删掉整个提及
    if (e.key === "Backspace") {
      const el = inputRef.current;
      const selectionStart = el?.selectionStart ?? null;
      const selectionEnd = el?.selectionEnd ?? null;
      // 仅处理无选区（纯光标）的情况，避免干扰用户框选删除
      if (selectionStart !== null && selectionStart === selectionEnd) {
        const before = input.slice(0, selectionStart);
        const mentionMatch = before.match(/@[^\s@]+\s+$/);
        if (mentionMatch) {
          e.preventDefault();
          const removeStart = selectionStart - mentionMatch[0].length;
          const nextInput =
            input.slice(0, removeStart) + input.slice(selectionStart);
          setInput(nextInput);
          setInputCaretIndex(removeStart);
          requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.setSelectionRange(removeStart, removeStart);
          });
          return;
        }
      }
    }

    if (!showMentionSuggestions) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedMentionIndex(
        (index) => (index + 1) % visibleMentionSuggestions.length,
      );
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedMentionIndex(
        (index) =>
          (index - 1 + visibleMentionSuggestions.length) %
          visibleMentionSuggestions.length,
      );
      return;
    }

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const candidate =
        visibleMentionSuggestions[selectedMentionIndex] ??
        visibleMentionSuggestions[0];
      if (candidate) applyMentionCandidate(candidate);
    }
  };

  const handleQuickMention = (spirit: SerializedSpirit) => {
    setInput((prev) => {
      const prefix = prev && !prev.endsWith(" ") ? `${prev} ` : prev;
      return `${prefix}@${spirit.name} `;
    });
    inputRef.current?.focus();
  };

  const handleQuickMentionPlayer = (nickname: string) => {
    setInput((prev) => {
      const prefix = prev && !prev.endsWith(" ") ? `${prev} ` : prev;
      return `${prefix}@${nickname} `;
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
  const challengePreview = (() => {
    if (!pending) return null;
    const fromPlayer = currentRoom.players.find(
      (p) => p.playerId === pending.fromPlayerId,
    );
    const toPlayer = currentRoom.players.find(
      (p) => p.playerId === pending.toPlayerId,
    );
    const fromSpirit = pending.fromSpirit ?? fromPlayer?.activeSpirit ?? null;
    const toSpirit = pending.toSpirit ?? toPlayer?.activeSpirit ?? null;
    if (!fromSpirit || !toSpirit) return null;
    return { fromSpirit, toSpirit };
  })();
  const storedMessageIds = new Set(
    currentRoom.messages.map((message) => message.id),
  );
  const displayedChatItems: DisplayedChatItem[] = [
    ...currentRoom.messages.map((message, index) => ({
      key: message.id,
      message,
      isMe: message.senderId === playerId,
      isContinuation: isMessageContinuation(
        message,
        currentRoom.messages[index - 1],
      ),
      streaming: false,
    })),
    ...streamingSpiritIds.flatMap((streamingSpiritId) => {
      const spirit = mentionableSpirits.find(
        (candidate) => candidate.rosterId === streamingSpiritId,
      );
      const streamingMessage = streamingSpiritMessages[streamingSpiritId];
      if (
        !spirit ||
        !streamingMessage ||
        storedMessageIds.has(streamingMessage.id)
      ) {
        return [];
      }
      const hostPlayer =
        currentRoom.players.find(
          (player) =>
            player.activeSpirit?.rosterId === spirit.rosterId ||
            player.carriedSpirits?.some(
              (carried) => carried.rosterId === spirit.rosterId,
            ),
        ) ?? currentRoom.players[0];
      const accentColor = hostPlayer?.avatarColor ?? "#FFD700";
      const partial = pendingSpiritReplies[streamingSpiritId];
      return [
        {
          key: streamingMessage.id,
          message: {
            ...streamingMessage,
            type: "spirit" as const,
            senderId: spirit.rosterId,
            senderName: spirit.name,
            senderColor: accentColor,
            senderAvatar: spirit.imageUrl,
            spiritRosterId: spirit.rosterId,
            content: partial ?? "",
          },
          isMe: false,
          isContinuation: false,
          streaming: true,
        },
      ];
    }),
  ];

  return (
    <div className="h-screen grid-bg relative overflow-hidden flex flex-col">
      {/* 顶部条 */}
      <header className="relative z-20 shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-[#A78BFA]/20 bg-[#0B0C10]/80 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <BackButton onClick={handleLeave} color="#A78BFA" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-base md:text-lg font-black tracking-wider text-[#A78BFA]"
                style={{
                  textShadow: "0 0 12px rgba(167,139,250,0.55)",
                }}
              >
                房间 {currentRoom.roomCode}
              </span>
              <button
                type="button"
                onClick={handleCopyRoom}
                className="flex items-center gap-1.5 rounded-md border border-[#A78BFA]/40 px-2.5 py-1 text-xs font-mono tracking-wide text-[#A78BFA] hover:bg-[#A78BFA]/15 transition-all"
                title="复制房间码与链接"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "已复制" : "复制邀请"}
              </button>
            </div>
            <div className="text-xs font-mono tracking-wide text-white/45 mt-1">
              {currentRoom.players.length} 位契约者 ·{" "}
              {mentionableSpirits.length} 位词灵
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLeave}
          className="flex items-center gap-1.5 rounded-md border border-[#FF6B9D]/40 px-3.5 py-1.5 text-xs font-mono tracking-wide text-[#FF6B9D] hover:bg-[#FF6B9D]/15 transition-all"
        >
          <LogOut size={14} />
          离开
        </button>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-0">
        {/* 左侧：玩家列表 */}
        <aside className="hidden lg:flex flex-col border-r border-[#A78BFA]/15 bg-[#0B0C10]/60 backdrop-blur-sm overflow-hidden">
          <div className="shrink-0 px-4 py-3.5 border-b border-white/5 flex items-center gap-2">
            <Users size={15} className="text-[#A78BFA]" />
            <span className="text-xs font-mono tracking-[0.28em] text-white/65">
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
                  Boolean(mySpirit) &&
                  Boolean(p.activeSpirit) &&
                  p.playerId !== playerId &&
                  !pending &&
                  !currentRoom.activeBattle
                }
                onChallenge={() => createChallenge(p)}
                onSetBattleSpirit={
                  p.playerId === playerId ? setBattleSpirit : undefined
                }
                onInspectSpirit={(spirit) => {
                  const carried = p.carriedSpirits?.length
                    ? p.carriedSpirits
                    : p.activeSpirit
                      ? [p.activeSpirit]
                      : [];
                  const active = p.activeSpirit ?? carried[0] ?? null;
                  setInspectSpirit({
                    spirit,
                    ownerName: p.nickname,
                    isMine: p.playerId === playerId,
                    isActive: active?.rosterId === spirit.rosterId,
                  });
                }}
              />
            ))}
          </div>
          <div className="shrink-0 px-4 py-3 border-t border-white/5 text-xs text-white/40 leading-relaxed">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#FFD700]" />
              <span>带词灵才能约战 · 点自己的词灵切换出战</span>
            </div>
          </div>
        </aside>

        {/* 右侧：聊天区 */}
        <main className="flex flex-col min-h-0 relative">
          {/* 消息列表 */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 py-4"
          >
            {displayedChatItems.map((item) => (
              <ChatMessageBubble
                key={item.key}
                message={item.message}
                isMe={item.isMe}
                isContinuation={item.isContinuation}
                playerNames={playerNameSet}
                myNickname={nickname}
                streaming={item.streaming}
              />
            ))}
            {displayedChatItems.length === 0 && (
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

          {/* 快捷 @ 玩家 */}
          {mentionablePlayers.length > 0 && (
            <div className="shrink-0 flex items-center gap-2 px-4 md:px-6 py-1.5 border-t border-white/5 overflow-x-auto scrollbar-hide">
              <span className="shrink-0 text-[10px] font-mono tracking-[0.18em] text-white/40">
                @ 契约者 ▸
              </span>
              {mentionablePlayers.map((p) => (
                <button
                  key={p.playerId}
                  type="button"
                  onClick={() => handleQuickMentionPlayer(p.nickname)}
                  disabled={isSending}
                  className="shrink-0 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-mono transition-all disabled:opacity-40"
                  style={{
                    borderColor: `${p.avatarColor}66`,
                    color: p.avatarColor,
                    background: `${p.avatarColor}1a`,
                  }}
                >
                  <span
                    className="h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-black"
                    style={{
                      background: `${p.avatarColor}44`,
                      color: p.avatarColor,
                    }}
                  >
                    {p.nickname.slice(0, 1).toUpperCase()}
                  </span>
                  {p.nickname}
                  {!p.isOnline && (
                    <span className="text-[10px] text-white/40">离线</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* 快捷 @ 词灵：我方 / 对方 分两行 */}
          {mentionableSpirits.length > 0 &&
            (
              [
                { side: "mine", label: "我方词灵", accent: "#FFD700" },
                { side: "other", label: "对方词灵", accent: "#66FCF1" },
              ] as const
            ).map(({ side, label, accent }) => {
              const rowSpirits = mentionableSpirits.filter((s) =>
                side === "mine"
                  ? mySpiritIds.has(s.rosterId)
                  : !mySpiritIds.has(s.rosterId),
              );
              if (rowSpirits.length === 0) return null;
              return (
                <div
                  key={side}
                  className="shrink-0 flex items-center gap-2 px-4 md:px-6 py-1.5 border-t border-white/5 overflow-x-auto scrollbar-hide"
                >
                  <span
                    className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono tracking-[0.18em]"
                    style={{ color: `${accent}cc` }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: accent }}
                    />
                    {label} ▸
                  </span>
                  {rowSpirits.map((s) => (
                    <button
                      key={s.rosterId}
                      type="button"
                      onClick={() => handleQuickMention(s)}
                      disabled={isSending}
                      className="shrink-0 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-mono transition-all disabled:opacity-40"
                      style={{
                        borderColor: `${accent}66`,
                        color: accent,
                        background: `${accent}1a`,
                      }}
                    >
                      {s.imageUrl ? (
                        <img
                          src={s.imageUrl}
                          alt=""
                          className="h-4 w-4 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          className="h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-black"
                          style={{ background: `${accent}4d`, color: accent }}
                        >
                          {s.name.slice(0, 1)}
                        </span>
                      )}
                      {s.name}
                    </button>
                  ))}
                </div>
              );
            })}

          {/* 输入框 */}
          <form
            onSubmit={handleSubmit}
            className="relative shrink-0 flex items-center gap-3 px-4 md:px-6 py-4 border-t border-[#A78BFA]/15 bg-[#0B0C10]/80 backdrop-blur-md"
          >
            <AnimatePresence>
              {showMentionSuggestions && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                  className="absolute bottom-full left-4 right-4 md:left-6 md:right-6 z-30 mb-2 overflow-hidden rounded-2xl border border-[#A78BFA]/35 bg-[#07080D]/95 shadow-[0_16px_48px_rgba(0,0,0,0.55),0_0_24px_rgba(167,139,250,0.16)] backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
                    <span className="text-[11px] font-mono tracking-[0.2em] text-[#A78BFA]/85">
                      可 @ 对象
                    </span>
                    <span className="text-[11px] font-mono text-white/40">
                      ↑↓ 选择 · Enter/Tab 插入
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1.5">
                    {visibleMentionSuggestions.map((candidate, index) => {
                      const isSelected = index === selectedMentionIndex;
                      return (
                        <button
                          key={`${candidate.kind}-${candidate.id}`}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applyMentionCandidate(candidate);
                          }}
                          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all"
                          style={{
                            background: isSelected
                              ? `${candidate.color}1f`
                              : "transparent",
                            boxShadow: isSelected
                              ? `inset 0 0 0 1px ${candidate.color}66`
                              : "none",
                          }}
                        >
                          {candidate.imageUrl ? (
                            <img
                              src={candidate.imageUrl}
                              alt=""
                              className="h-8 w-8 rounded-full border object-cover"
                              style={{ borderColor: `${candidate.color}55` }}
                            />
                          ) : (
                            <span
                              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black"
                              style={{
                                background: `${candidate.color}26`,
                                color: candidate.color,
                              }}
                            >
                              {candidate.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span
                              className="block truncate text-sm font-bold"
                              style={{ color: candidate.color }}
                            >
                              @{candidate.name}
                            </span>
                            <span className="block truncate text-[13px] font-mono tracking-wide text-white/45">
                              {candidate.label}
                            </span>
                          </span>
                          {candidate.kind === "player" &&
                            !candidate.isOnline && (
                              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/40">
                                离线
                              </span>
                            )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <input
              ref={inputRef}
              type="text"
              value={input}
              maxLength={MAX_INPUT}
              onChange={(e) => {
                setInput(e.target.value);
                setInputCaretIndex(
                  e.target.selectionStart ?? e.target.value.length,
                );
              }}
              onKeyDown={handleInputKeyDown}
              onKeyUp={syncInputCaret}
              onClick={syncInputCaret}
              onFocus={() => {
                setIsInputFocused(true);
                syncInputCaret();
              }}
              onBlur={() => setIsInputFocused(false)}
              placeholder={`在房间 ${currentRoom.roomCode} 发言... (最多 @ 5 位词灵共同回复 · Enter 发送)`}
              disabled={isSending}
              className="flex-1 bg-black/50 border border-[#A78BFA]/35 focus:border-[#A78BFA] outline-none px-5 py-3.5 text-base text-white placeholder:text-white/30 transition-colors disabled:opacity-60"
            />
            <span className="hidden sm:block text-xs font-mono text-white/35 tabular-nums">
              {input.length}/{MAX_INPUT}
            </span>
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="flex h-12 w-12 items-center justify-center rounded border-2 border-[#A78BFA] text-[#A78BFA] transition-all hover:bg-[#A78BFA] hover:text-[#0B0C10] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#A78BFA]"
            >
              {isSending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
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
            fromSpirit={challengePreview?.fromSpirit ?? null}
            toSpirit={challengePreview?.toSpirit ?? null}
            onAccept={() => resolveChallenge(pending.id, "accepted")}
            onDecline={() => resolveChallenge(pending.id, "declined")}
          />
        )}
      </AnimatePresence>

      {/* 自己发起的约战等待中提示 */}
      <AnimatePresence>
        {isPendingFromMe && pending && (
          <WaitingChallengeModal
            pending={pending}
            fromSpirit={challengePreview?.fromSpirit ?? null}
            toSpirit={challengePreview?.toSpirit ?? null}
            onCancel={() => resolveChallenge(pending.id, "declined")}
          />
        )}
      </AnimatePresence>

      {/* 词灵详情查看弹层：双方都能看到对方词灵卡 */}
      <AnimatePresence>
        {inspectSpirit && (
          <SpiritDetailModal
            data={inspectSpirit}
            onClose={() => setInspectSpirit(null)}
            onSetBattleSpirit={
              inspectSpirit.isMine && !inspectSpirit.isActive
                ? (rosterId) => {
                    setBattleSpirit(rosterId);
                    setInspectSpirit(null);
                  }
                : undefined
            }
          />
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
  onInspectSpirit: (spirit: SerializedSpirit) => void;
}> = ({
  player,
  isMe,
  canChallenge,
  onChallenge,
  onSetBattleSpirit,
  onInspectSpirit,
}) => {
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
            <span className="text-sm font-bold text-white truncate">
              {player.nickname}
            </span>
            {isMe && (
              <span className="text-[10px] font-mono text-[#66FCF1]/90 border border-[#66FCF1]/30 px-1 rounded">
                YOU
              </span>
            )}
          </div>
          <div className="text-xs text-white/50 truncate mt-0.5">
            {active ? `出战 · ${active.name}` : "未携带词灵"}
          </div>
        </div>
      </div>

      {/* 词灵卡墙：紧凑立绘缩略，点击查看大卡；自己的非出战词灵可一键切换 */}
      {carried.length > 0 && (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {carried.map((s) => {
            const isActive = active?.rosterId === s.rosterId;
            const canSwitch = isMe && onSetBattleSpirit && !isActive;
            return (
              <div key={s.rosterId} className="relative group/card">
                <SpiritCard
                  character={s.combatSnapshot}
                  size="sm"
                  selected={isActive}
                  showStats={false}
                  onClick={() => onInspectSpirit(s)}
                  topRightBadges={[
                    {
                      label: `Lv.${s.combatSnapshot.level ?? 1}`,
                      color: "#66FCF1",
                      background: "rgba(11,12,16,0.72)",
                      title: "等级",
                    },
                    ...(isActive
                      ? [
                          {
                            label: "战",
                            color: "#0B0C10",
                            background: "#FFD700",
                            title: "当前出战",
                          },
                        ]
                      : []),
                  ]}
                />
                {/* 自己的非出战词灵：hover 显示一键出战按钮 */}
                {canSwitch && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetBattleSpirit?.(s.rosterId);
                    }}
                    title={`切换 ${s.name} 出战`}
                    className="absolute inset-x-1 bottom-1 z-20 flex items-center justify-center gap-0.5 rounded border border-[#FFD700] bg-[#FFD700]/90 py-1 text-[10px] font-black tracking-widest text-[#0B0C10] opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-[#FFD700]"
                  >
                    <Swords size={9} />
                    出战
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canChallenge && (
        <button
          type="button"
          onClick={onChallenge}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded border border-[#FF003C]/50 py-2 text-xs font-black tracking-widest text-[#FF003C] hover:bg-[#FF003C] hover:text-white transition-all"
        >
          <Swords size={13} />
          约战
        </button>
      )}
    </motion.div>
  );
};

const ChatMessageBubble: React.FC<{
  message: SocialChatMessage;
  isMe: boolean;
  isContinuation: boolean;
  playerNames?: Set<string>;
  myNickname?: string;
  streaming?: boolean;
}> = ({
  message,
  isMe,
  isContinuation,
  playerNames,
  myNickname,
  streaming = false,
}) => {
  // 系统消息：居中灰条
  if (message.type === "system") {
    return (
      <div className="my-4 flex justify-center">
        <div className="rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 text-xs text-white/55 tracking-wide">
          {message.content}
        </div>
      </div>
    );
  }
  // 战报消息：金色卡片
  if (message.type === "battle_report") {
    return (
      <div className="my-4 flex justify-center">
        <div className="rounded-lg border border-[#FFD700]/45 bg-[#FFD700]/10 px-4 py-2 text-xs text-[#FFD700] tracking-wide flex items-center gap-2">
          <Shield size={12} />
          {message.content}
        </div>
      </div>
    );
  }

  const isSpirit = message.type === "spirit";
  // 流式气泡结束时会由正式消息接替。词灵消息沿用同一外壳，避免重新挂载的入场动画造成闪屏。
  if (isSpirit) {
    const isWaitingForFirstChunk = streaming && !message.content;
    return (
      <SpiritMessageShell
        name={message.senderName}
        avatar={message.senderAvatar}
        accentColor={message.senderColor}
        timestamp={message.timestamp}
        animateOnMount={false}
        trailing={
          streaming ? (
            <Loader2
              size={9}
              className="animate-spin"
              style={{ color: `${message.senderColor}99` }}
            />
          ) : undefined
        }
      >
        <div
          className="rounded-lg border bg-[#0B0C10]/70 px-3 py-2 text-sm leading-relaxed text-[#E5E7EB] backdrop-blur-sm"
          style={{ borderColor: `${message.senderColor}66` }}
        >
          {isWaitingForFirstChunk ? (
            <span className="inline-flex items-center gap-1">
              {[0, 120, 240].map((delay) => (
                <span
                  key={delay}
                  className="h-1.5 w-1.5 rounded-full animate-bounce"
                  style={{
                    backgroundColor: message.senderColor,
                    animationDelay: `${delay}ms`,
                  }}
                />
              ))}
            </span>
          ) : (
            renderContentWithMentions(
              message.content,
              message.mentions,
              playerNames,
              myNickname,
            )
          )}
          {streaming && !isWaitingForFirstChunk && (
            <span
              className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse"
              style={{ backgroundColor: message.senderColor }}
            />
          )}
        </div>
      </SpiritMessageShell>
    );
  }

  const accentColor = isMe ? "#A78BFA" : message.senderColor;
  const showIdentity = !isContinuation;
  const identityLabel = isMe ? "YOU" : "PLAYER";
  const bubbleBackground = isMe ? "rgba(167,139,250,0.14)" : `${accentColor}12`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-2.5 ${isContinuation ? "mt-1" : "mt-4"}`}
    >
      <div className="w-8 shrink-0 pt-0.5">
        {showIdentity && (
          <div
            className="h-8 w-8 shrink-0 overflow-hidden rounded border bg-[#0B0C10]"
            style={{ borderColor: `${accentColor}66` }}
          >
            {message.senderAvatar ? (
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
      </div>
      <div className="max-w-[85%] text-left md:max-w-[78%]">
        {showIdentity && (
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="rounded border px-1.5 py-px text-[10px] font-mono tracking-widest"
              style={{
                borderColor: `${accentColor}4d`,
                background: `${accentColor}12`,
                color: accentColor,
              }}
            >
              {identityLabel}
            </span>
            <span
              className="text-xs font-bold tracking-wide"
              style={{ color: accentColor }}
            >
              {isMe ? "你" : message.senderName}
            </span>
            <span className="text-[11px] text-white/35">
              {formatTime(message.timestamp)}
            </span>
          </div>
        )}
        <div
          className="rounded-lg border px-3 py-2 text-sm leading-relaxed backdrop-blur-sm"
          style={{
            borderColor: isMe ? "rgba(167,139,250,0.45)" : `${accentColor}66`,
            background: bubbleBackground,
            color: "#E5E7EB",
          }}
        >
          {renderContentWithMentions(
            message.content,
            message.mentions,
            playerNames,
            myNickname,
          )}
        </div>
      </div>
    </motion.div>
  );
};

/** 把 @名字 高亮显示：@词灵 金色，@契约者 紫色，@我 额外加底色 */
const renderContentWithMentions = (
  content: string,
  mentions?: string[],
  playerNames?: Set<string>,
  myNickname?: string,
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
    const name = match[1];
    const isPlayer = playerNames?.has(name) ?? false;
    const isMe = Boolean(myNickname) && name === myNickname;
    const color = isPlayer ? "#A78BFA" : "#FFD700";
    parts.push(
      <span
        key={`m-${key++}`}
        className="font-bold rounded px-0.5"
        style={{
          color,
          textShadow: `0 0 8px ${isPlayer ? "rgba(167,139,250,0.4)" : "rgba(255,215,0,0.4)"}`,
          background: isMe ? "rgba(167,139,250,0.22)" : undefined,
        }}
      >
        @{name}
      </span>,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  return parts;
};

const SpiritMessageShell: React.FC<{
  name: string;
  avatar?: string;
  accentColor: string;
  timestamp?: number;
  trailing?: React.ReactNode;
  animateOnMount?: boolean;
  children: React.ReactNode;
}> = ({
  name,
  avatar,
  accentColor,
  timestamp,
  trailing,
  animateOnMount = true,
  children,
}) => (
  <motion.div
    initial={animateOnMount ? { opacity: 0, y: 6 } : false}
    animate={{ opacity: 1, y: 0 }}
    className="mt-4 flex gap-2.5 justify-start"
  >
    <div
      className="h-8 w-8 shrink-0 overflow-hidden rounded border bg-[#0B0C10]"
      style={{ borderColor: `${accentColor}66` }}
    >
      {avatar ? (
        <img src={avatar} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div
          className="h-full w-full flex items-center justify-center text-xs font-black"
          style={{ color: accentColor }}
        >
          {name.slice(0, 1)}
        </div>
      )}
    </div>
    <div className="max-w-[75%] text-left">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-mono tracking-widest text-[#FFD700]/80 border border-[#FFD700]/30 px-1.5 rounded">
          SPIRIT
        </span>
        <span
          className="text-xs font-bold tracking-wide"
          style={{ color: accentColor }}
        >
          {name}
        </span>
        {trailing}
        {timestamp !== undefined && (
          <span className="text-[11px] text-white/35">
            {formatTime(timestamp)}
          </span>
        )}
      </div>
      {children}
    </div>
  </motion.div>
);

const ChallengeModal: React.FC<{
  pending: NonNullable<
    ReturnType<typeof useSocialStore.getState>["currentRoom"]
  >["pendingChallenge"];
  fromSpirit: SerializedSpirit | null;
  toSpirit: SerializedSpirit | null;
  onAccept: () => void;
  onDecline: () => void;
}> = ({ pending, fromSpirit, toSpirit, onAccept, onDecline }) => {
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
        className="relative w-full max-w-xl rounded-2xl border-2 border-[#FF003C]/60 bg-[#0B0C10] p-5 md:p-6 shadow-[0_0_40px_rgba(255,0,60,0.25)]"
      >
        <div className="flex items-center justify-center mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#FF003C] bg-[#FF003C]/15">
            <Swords size={26} className="text-[#FF003C]" />
          </div>
        </div>
        <div className="text-center mb-2">
          <div className="text-[11px] font-mono tracking-[0.4em] text-[#FF003C]/80">
            CHALLENGE
          </div>
          <div className="text-xl font-black text-white mt-1">
            {pending.fromPlayerName}
          </div>
          <div className="text-sm text-white/55 mt-1">向你发起约战</div>
        </div>
        {fromSpirit && toSpirit ? (
          <div className="my-5">
            <ChallengeVersusPreview
              fromSpirit={fromSpirit}
              toSpirit={toSpirit}
            />
          </div>
        ) : (
          <div className="my-5 flex items-center justify-center gap-3 text-sm">
            <div className="text-center">
              <div className="text-xs text-white/45 mb-1">挑战者</div>
              <div className="font-bold text-[#FF003C]">
                {pending.fromSpiritName}
              </div>
            </div>
            <Swords size={20} className="text-white/30" />
            <div className="text-center">
              <div className="text-xs text-white/45 mb-1">应战者</div>
              <div className="font-bold text-[#66FCF1]">
                {pending.toSpiritName}
              </div>
            </div>
          </div>
        )}
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

const WaitingChallengeModal: React.FC<{
  pending: NonNullable<
    ReturnType<typeof useSocialStore.getState>["currentRoom"]
  >["pendingChallenge"];
  fromSpirit: SerializedSpirit | null;
  toSpirit: SerializedSpirit | null;
  onCancel: () => void;
}> = ({ pending, fromSpirit, toSpirit, onCancel }) => {
  if (!pending) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        className="relative w-full max-w-xl rounded-2xl border-2 border-[#FFD700]/50 bg-[#0B0C10] p-5 md:p-6 shadow-[0_0_40px_rgba(255,215,0,0.2)]"
      >
        <div className="flex items-center justify-center mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#FFD700] bg-[#FFD700]/15">
            <Loader2 size={24} className="animate-spin text-[#FFD700]" />
          </div>
        </div>
        <div className="text-center mb-2">
          <div className="text-[11px] font-mono tracking-[0.4em] text-[#FFD700]/80">
            WAITING
          </div>
          <div className="text-xl font-black text-white mt-1">
            {pending.toPlayerName}
          </div>
          <div className="text-sm text-white/55 mt-1">等待对方接受约战…</div>
        </div>
        {fromSpirit && toSpirit ? (
          <div className="my-5">
            <ChallengeVersusPreview
              fromSpirit={fromSpirit}
              toSpirit={toSpirit}
            />
          </div>
        ) : (
          <div className="my-5 flex items-center justify-center gap-3 text-sm">
            <div className="text-center">
              <div className="mb-1 text-xs text-white/45">挑战者</div>
              <div className="font-bold text-[#FF003C]">
                {pending.fromSpiritName}
              </div>
            </div>
            <Swords size={20} className="text-white/30" />
            <div className="text-center">
              <div className="mb-1 text-xs text-white/45">应战者</div>
              <div className="font-bold text-[#66FCF1]">
                {pending.toSpiritName}
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 py-2.5 text-xs font-bold tracking-widest text-white/60 transition-all hover:bg-white/5"
        >
          <X size={14} />
          取消约战
        </button>
      </motion.div>
    </motion.div>
  );
};

const ChallengeVersusPreview: React.FC<{
  fromSpirit: SerializedSpirit;
  toSpirit: SerializedSpirit;
  compact?: boolean;
}> = ({ fromSpirit, toSpirit, compact = false }) => {
  const cardSize = compact ? "sm" : "md";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:gap-3">
      <div className="flex min-w-0 flex-col items-center">
        <div className="mb-2 text-center text-[11px] font-mono tracking-[0.3em] text-[#FF003C]/85">
          挑战者
        </div>
        <ChallengeFlipCard spirit={fromSpirit} size={cardSize} />
      </div>
      <div className="flex flex-col items-center gap-1 text-white/45">
        <Swords size={compact ? 16 : 22} />
        <span className="text-[11px] font-black tracking-widest">VS</span>
      </div>
      <div className="flex min-w-0 flex-col items-center">
        <div className="mb-2 text-center text-[11px] font-mono tracking-[0.3em] text-[#66FCF1]/85">
          应战者
        </div>
        <ChallengeFlipCard spirit={toSpirit} size={cardSize} />
      </div>
    </div>
  );
};

/**
 * 约战预览用的可翻面英雄卡：正面为战斗信息，点击翻至专属 Slogan。
 * 复用词灵详情弹层的翻面逻辑，使约战预览与详情观感一致。
 */
const ChallengeFlipCard: React.FC<{
  spirit: SerializedSpirit;
  size: "sm" | "md";
}> = ({ spirit, size }) => {
  const [flipped, setFlipped] = useState(false);
  const rarity = spirit.combatSnapshot.rarity ?? "R";
  const rarityCfg = RARITY_CONFIGS[rarity];
  const persona = spirit.persona;
  const signatureSkill =
    spirit.combatSnapshot.skills.find(
      (skill) => skill.isUltimate || skill.type === "ultimate",
    )?.name ??
    spirit.combatSnapshot.skills[0]?.name ??
    spirit.name;
  const battleCry =
    persona.battleCry?.trim() === "此刻，词意成真。"
      ? ""
      : persona.battleCry?.trim();
  const slogan =
    persona.slogan?.trim() ||
    battleCry ||
    persona.catchphrases?.[0]?.trim() ||
    `${spirit.name}，以${signatureSkill}为誓。`;

  return (
    <div
      className="relative w-full cursor-pointer select-none"
      style={{ perspective: 1600 }}
      onClick={() => setFlipped((f) => !f)}
    >
      <motion.div
        className="relative w-full"
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* 正面：战斗信息 */}
        <div style={{ backfaceVisibility: "hidden" }}>
          <HeroCard
            character={spirit.combatSnapshot}
            size={size}
            showStats
            showQuote={false}
            className="!w-full"
          />
        </div>

        {/* 背面：专属 Slogan */}
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl border"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "linear-gradient(145deg, #151725 0%, #0a0b12 100%)",
            borderColor: `${rarityCfg.primaryColor}66`,
            boxShadow: `inset 0 0 24px rgba(${rarityCfg.rgb}, 0.12)`,
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-60"
            style={{
              background: `
                radial-gradient(circle at 18% 18%, rgba(${rarityCfg.rgb}, 0.2), transparent 30%),
                linear-gradient(135deg, transparent 49.8%, rgba(${rarityCfg.rgb}, 0.12) 50%, transparent 50.2%)
              `,
            }}
          />
          <div className="relative flex h-full items-center px-5 py-6">
            <p
              className={`w-full text-center font-display font-semibold leading-[1.7] text-white ${
                size === "sm" ? "text-[14px]" : "text-[17px]"
              }`}
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 5,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textShadow: `0 0 20px rgba(${rarityCfg.rgb}, 0.35)`,
              }}
            >
              <span style={{ color: rarityCfg.primaryColor }}>“</span>
              {slogan}
              <span style={{ color: rarityCfg.primaryColor }}>”</span>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// 保留 DoorOpen 引用避免 tree-shake 警告
void DoorOpen;

/**
 * 词灵详情弹层：房间内任一玩家点击词灵卡时弹出。
 * 正面展示关键战斗信息，背面展示专属 Slogan。
 */
const SpiritDetailModal: React.FC<{
  data: {
    spirit: SerializedSpirit;
    ownerName: string;
    isMine: boolean;
    isActive: boolean;
  };
  onClose: () => void;
  onSetBattleSpirit?: (rosterId: string) => void;
}> = ({ data, onClose, onSetBattleSpirit }) => {
  const { spirit, ownerName, isMine, isActive } = data;
  const rarity = spirit.combatSnapshot.rarity ?? "R";
  const rarityCfg = RARITY_CONFIGS[rarity];
  const persona = spirit.persona;
  const signatureSkill =
    spirit.combatSnapshot.skills.find(
      (skill) => skill.isUltimate || skill.type === "ultimate",
    )?.name ??
    spirit.combatSnapshot.skills[0]?.name ??
    spirit.name;
  const battleCry =
    persona.battleCry?.trim() === "此刻，词意成真。"
      ? ""
      : persona.battleCry?.trim();
  const slogan =
    persona.slogan?.trim() ||
    battleCry ||
    persona.catchphrases?.[0]?.trim() ||
    `${spirit.name}，以${signatureSkill}为誓。`;

  // 3D 翻面：点击卡片切换正反面
  const [flipped, setFlipped] = useState(false);

  // 关闭：点击遮罩 / ESC
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.92, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border bg-[#0B0C10] p-5 md:p-6 my-auto"
        style={{
          borderColor: `${rarityCfg.primaryColor}55`,
          boxShadow: `0 0 50px rgba(${rarityCfg.rgb}, 0.22), 0 12px 40px rgba(0,0,0,0.55)`,
        }}
      >
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white/70 hover:text-white hover:border-white/50 transition-all"
        >
          <X size={15} />
        </button>

        {/* 顶部：所属契约者 + 稀有度标签 */}
        <div className="mb-4 flex items-center gap-2 flex-wrap pr-10">
          <span
            className="text-[11px] font-mono tracking-[0.3em]"
            style={{ color: `${rarityCfg.primaryColor}cc` }}
          >
            SPIRIT · {rarityCfg.labelEn}
          </span>
          <span className="text-white/20">·</span>
          <span className="text-xs text-white/60">
            所属契约者：
            <span className="font-bold text-white/85">{ownerName}</span>
            {isMine && (
              <span className="ml-1.5 text-[10px] font-mono text-[#66FCF1]/90 border border-[#66FCF1]/30 px-1 rounded">
                YOU
              </span>
            )}
          </span>
        </div>

        {/* 3D 翻面卡：正面关键战斗信息 / 背面专属 Slogan */}
        <div className="mx-auto flex w-full max-w-[288px] flex-col items-center">
          <div
            className="relative w-72"
            style={{ perspective: 1600 }}
            onClick={() => setFlipped((f) => !f)}
          >
            <motion.div
              className="relative w-full cursor-pointer"
              style={{ transformStyle: "preserve-3d", willChange: "transform" }}
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* 正面：完整保留关键战斗信息，口头禅收至背面 */}
              <div style={{ backfaceVisibility: "hidden" }}>
                <HeroCard
                  character={spirit.combatSnapshot}
                  size="lg"
                  showStats
                  showQuote={false}
                  ultraHoverEffect
                />
              </div>

              {/* 背面：专属 Slogan */}
              <div
                className="absolute inset-0 rounded-2xl border overflow-hidden"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                  background:
                    "linear-gradient(145deg, #151725 0%, #0a0b12 100%)",
                  borderColor: `${rarityCfg.primaryColor}66`,
                  boxShadow: `inset 0 0 24px rgba(${rarityCfg.rgb}, 0.12)`,
                }}
              >
                <div
                  className="absolute inset-0 pointer-events-none opacity-60"
                  style={{
                    background: `
                      radial-gradient(circle at 18% 18%, rgba(${rarityCfg.rgb}, 0.2), transparent 30%),
                      linear-gradient(135deg, transparent 49.8%, rgba(${rarityCfg.rgb}, 0.12) 50%, transparent 50.2%)
                    `,
                  }}
                />
                <div className="relative flex h-full items-center px-7 py-8">
                  <p
                    className="w-full text-center font-display text-[22px] font-semibold leading-[1.75] text-white"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 5,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textShadow: `0 0 20px rgba(${rarityCfg.rgb}, 0.35)`,
                    }}
                  >
                    <span style={{ color: rarityCfg.primaryColor }}>“</span>
                    {slogan}
                    <span style={{ color: rarityCfg.primaryColor }}>”</span>
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* 翻面提示 */}
          <div className="mt-3 text-xs tracking-wider text-white/45">
            {flipped ? "点击卡片翻回正面" : "点击卡片查看详情"}
          </div>

          {/* 自己的非出战词灵：切换出战按钮 */}
          {isMine && !isActive && onSetBattleSpirit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetBattleSpirit(spirit.rosterId);
              }}
              className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg border-2 border-[#FFD700] bg-[#FFD700]/10 py-2.5 text-xs font-black tracking-widest text-[#FFD700] hover:bg-[#FFD700] hover:text-[#0B0C10] transition-all"
            >
              <Swords size={13} />
              设为出战
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
