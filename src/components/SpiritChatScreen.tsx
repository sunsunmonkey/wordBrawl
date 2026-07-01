import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Brain,
  Heart,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  Swords,
  Zap,
} from "lucide-react";
import { BackButton } from "./BackButton";
import { ParticleField } from "./ParticleField";
import { useGameStore } from "../store/useGameStore";
import { useRosterStore } from "../store/useRosterStore";
import {
  useSpiritChatStore,
  type SpiritChatMessage,
} from "../store/useSpiritChatStore";
import { useTowerStore } from "../store/useTowerStore";
import { requestSpiritChat } from "../utils/spiritChat";
import {
  applyTrainingXp,
  evolutionLabel,
  levelAscensionLabel,
} from "../utils/towerProgress";

const QUICK_PROMPTS = [
  "我今天有点累，陪我聊会儿。",
  "随便问你一个问题：你平时会做梦吗？",
  "如果不战斗，你最想去哪里？",
  "给我讲讲你现在在想什么。",
  "刚才那场战斗，你最在意哪一刻？",
  "你希望下一次怎么变强？",
];

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const moodColor = (bond: number) => {
  if (bond >= 70) return "#FFD700";
  if (bond >= 35) return "#66FCF1";
  return "#C5C6C7";
};

export const SpiritChatScreen: React.FC = () => {
  const {
    apiKey,
    baseUrl,
    model,
    apiMode,
    setPhase,
    setBattleMode,
    setTowerRosterId,
    setTowerLayer,
  } = useGameStore();
  const roster = useRosterStore((s) => s.roster);
  const updateCharacter = useRosterStore((s) => s.updateCharacter);
  const lastSummary = useTowerStore((s) => s.lastSummary);
  const lastRosterId = useTowerStore((s) => s.lastRosterId);
  const openRosterId = useSpiritChatStore((s) => s.openRosterId);
  const setOpenRosterId = useSpiritChatStore((s) => s.setOpenRosterId);
  const chats = useSpiritChatStore((s) => s.chats);
  const getOrCreateChat = useSpiritChatStore((s) => s.getOrCreateChat);
  const appendMessage = useSpiritChatStore((s) => s.appendMessage);
  const applySpiritReply = useSpiritChatStore((s) => s.applySpiritReply);
  const clearChat = useSpiritChatStore((s) => s.clearChat);

  const selected =
    roster.find((char) => char.rosterId === openRosterId) ?? roster[0] ?? null;
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected) return;
    if (openRosterId !== selected.rosterId) {
      setOpenRosterId(selected.rosterId);
    }
    getOrCreateChat(selected.rosterId);
  }, [getOrCreateChat, openRosterId, selected, setOpenRosterId]);

  const chat = selected
    ? (chats[selected.rosterId] ?? getOrCreateChat(selected.rosterId))
    : null;

  const cfg = useMemo(
    () => ({ apiKey, baseUrl, model, apiMode }),
    [apiKey, baseUrl, model, apiMode],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat?.messages.length, isSending]);

  if (!selected || !chat) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center p-6">
        <BackButton
          onClick={() => setPhase("MODE_SELECT")}
          color="#66FCF1"
          className="absolute left-6 top-6"
        />
        <div className="rounded-xl border border-[#66FCF1]/40 bg-[#1F2833]/75 p-8 text-center">
          <div className="text-xl font-black text-[#66FCF1]">暂无词灵</div>
          <div className="mt-2 text-sm text-[#8a8d91]">
            先招募一个角色，再进入会客室。
          </div>
        </div>
      </div>
    );
  }

  const themeColor = moodColor(chat.bond);
  const isCustomReady = apiMode === "custom" && apiKey && baseUrl && model;
  const isFreeMode = apiMode === "free";
  const isReady = isFreeMode || isCustomReady;
  const isRecentBattle =
    lastRosterId === selected.rosterId && Boolean(lastSummary);
  const spirit = selected.spiritProfile;
  const bondRatio = Math.min(100, Math.max(0, chat.bond));

  const sendMessage = async (content: string) => {
    const text = content.trim();
    if (!text || isSending) return;
    if (!isReady) {
      setError(
        "词灵会客室需要先在首页选择免费体验或填写 custom API（Key / Base URL / Model）。",
      );
      return;
    }

    setError("");
    setInput("");
    const userMessage = appendMessage(selected.rosterId, {
      role: "player",
      content: text,
    });
    const currentChat = useSpiritChatStore
      .getState()
      .getOrCreateChat(selected.rosterId);

    setIsSending(true);
    try {
      const result = await requestSpiritChat(
        cfg,
        selected,
        currentChat,
        userMessage.content,
        {
          scene: isRecentBattle ? "postBattle" : "idle",
          recentBattle: isRecentBattle ? lastSummary : null,
        },
      );
      applySpiritReply(
        selected.rosterId,
        {
          role: "spirit",
          content: result.reply,
          xpGranted: result.xpGranted,
        },
        {
          mood: result.mood,
          bond: result.bond,
          memorySummary: result.memorySummary,
          playerFacts: result.playerFacts,
          promises: result.promises,
          lastSuggestedAction: result.lastSuggestedAction,
          triggerEvent: result.triggerEvent,
        },
      );

      if (result.xpGranted && result.xpGranted > 0) {
        updateCharacter(
          selected.rosterId,
          (char) => applyTrainingXp(char, result.xpGranted!).character,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "词灵暂时没有回应。");
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const introMessage =
    spirit?.battleCry || spirit?.catchphrases?.[0] || "我在这里。你说，我听。";
  const fillQuickPrompt = (prompt: string) => {
    setInput((current) =>
      current.trim() ? `${current.trim()}\n${prompt}` : prompt,
    );
  };

  return (
    <div className="min-h-screen grid-bg relative overflow-x-hidden overflow-y-auto p-4 md:p-6">
      <ParticleField count={28} colors={[themeColor, "#66FCF1", "#FFD700"]} />
      <BackButton
        onClick={() => setPhase("MODE_SELECT")}
        color={themeColor}
        className="absolute left-4 top-4 z-30"
      />

      <motion.div
        animate={{ x: [0, 40, 0], y: [0, -24, 0] }}
        transition={{ duration: 16, repeat: Infinity }}
        className="absolute right-10 top-8 h-72 w-72 rounded-full blur-[130px] opacity-30"
        style={{ backgroundColor: themeColor }}
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2rem)] max-w-[90rem] flex-col pt-16 md:min-h-[calc(100vh-3rem)]">
        <div className="mb-6 flex shrink-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.36em] text-[#8a8d91]">
              <MessageCircle size={13} style={{ color: themeColor }} />
              SPIRIT LOUNGE
            </div>
            <h1
              className="mt-2 text-3xl font-black tracking-wider font-display md:text-5xl"
              style={{
                color: themeColor,
                textShadow: `0 0 18px ${themeColor}`,
              }}
            >
              词灵会客室
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {roster.slice(0, 8).map((char) => {
              const active = char.rosterId === selected.rosterId;
              return (
                <button
                  key={char.rosterId}
                  type="button"
                  onClick={() => setOpenRosterId(char.rosterId)}
                  className="flex items-center gap-2 rounded border px-3 py-1.5 text-[11px] font-bold tracking-widest transition-all"
                  style={{
                    borderColor: active ? themeColor : "rgba(102,252,241,0.25)",
                    color: active ? themeColor : "#8a8d91",
                    background: active
                      ? `${themeColor}18`
                      : "rgba(11,12,16,0.55)",
                    boxShadow: active ? `0 0 10px ${themeColor}33` : "none",
                  }}
                >
                  {char.imageUrl ? (
                    <img
                      src={char.imageUrl}
                      alt={char.name}
                      className="h-6 w-6 rounded object-cover"
                    />
                  ) : (
                    <span>{char.name[0]}</span>
                  )}
                  {char.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid flex-1 items-stretch gap-6 lg:grid-cols-12 pb-6">
          <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:col-span-4 xl:col-span-3">
            <div
              className="group relative overflow-hidden rounded-2xl border bg-[#0B0C10] scanlines transition-all"
              style={{
                borderColor: `${themeColor}aa`,
                boxShadow: `0 0 24px ${themeColor}22`,
              }}
            >
              <div className="aspect-[4/3] w-full">
                {selected.imageUrl ? (
                  <img
                    src={selected.imageUrl}
                    alt={selected.name}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-8xl font-black font-display"
                    style={{ color: themeColor }}
                  >
                    {selected.name[0]}
                  </div>
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#05070A] via-[#05070A]/90 to-transparent p-5 pt-12">
                <div
                  className="text-2xl font-black font-display tracking-wider"
                  style={{
                    color: themeColor,
                    textShadow: `0 0 12px ${themeColor}`,
                  }}
                >
                  {selected.name}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] tracking-widest text-[#C5C6C7]">
                  <span className="rounded bg-black/50 px-1.5 py-0.5 border border-white/10">
                    Lv.{selected.level}
                  </span>
                  <span>{levelAscensionLabel(selected.level)}</span>
                  <span className="text-[#8a8d91]">·</span>
                  <span>{evolutionLabel(selected.evolutionStage)}</span>
                </div>
                <div
                  className="mt-3 border-l-2 pl-3 text-xs leading-relaxed italic text-[#8a8d91]"
                  style={{ borderColor: themeColor }}
                >
                  “{introMessage}”
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <MiniInfo
                icon={<Heart size={12} />}
                label="生命"
                value={selected.maxHp}
                color="#FF6B9D"
              />
              <MiniInfo
                icon={<Zap size={12} />}
                label="攻击"
                value={selected.attack}
                color="#FFD700"
              />
              <MiniInfo
                icon={<Swords size={12} />}
                label="塔层"
                value={
                  selected.tower.highestEndlessLayer ??
                  selected.tower.highestCleared
                }
                color="#66FCF1"
              />
              <MiniInfo
                icon={<Sparkles size={12} />}
                label="技能"
                value={selected.skills.length}
                color="#7FFF9F"
              />
            </div>

            <div className="rounded-2xl border border-[#45A29E]/35 bg-[#1F2833]/72 p-4 shadow-lg backdrop-blur-sm">
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between text-[10px] tracking-[0.24em] text-[#8a8d91]">
                  <div className="flex items-center gap-1.5">
                    <Heart size={12} style={{ color: themeColor }} />
                    灵契羁绊
                  </div>
                  <span
                    style={{
                      color: themeColor,
                      textShadow: `0 0 8px ${themeColor}`,
                    }}
                  >
                    {bondRatio}/100
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#0B0C10] border border-white/5">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: themeColor,
                      boxShadow: `0 0 12px ${themeColor}`,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${bondRatio}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <InfoBlock
                  icon={<Brain size={14} />}
                  title="长期记忆"
                  color={themeColor}
                  empty="还没有形成稳定记忆。"
                  items={chat.memorySummary ? [chat.memorySummary] : []}
                />
                <InfoBlock
                  icon={<BookOpen size={14} />}
                  title="关于你"
                  color="#66FCF1"
                  empty="词灵还不了解你。"
                  items={chat.playerFacts}
                />
                <InfoBlock
                  icon={<Sparkles size={14} />}
                  title="约定"
                  color="#FFD700"
                  empty="还没有约定。"
                  items={chat.promises}
                />

                {chat.lastSuggestedAction && (
                  <div className="rounded border border-[#FFD700]/40 bg-[#0B0C10]/60 p-3 transition-colors hover:border-[#FFD700]/60">
                    <div className="text-[10px] font-black tracking-[0.26em] text-[#FFD700] flex items-center gap-1.5">
                      <Zap size={12} />
                      它想做的事
                    </div>
                    <div className="mt-2 text-xs leading-relaxed text-[#C5C6C7]">
                      {chat.lastSuggestedAction}
                    </div>
                  </div>
                )}

                {spirit?.worldAnchors?.length ? (
                  <div className="rounded border border-[#45A29E]/30 bg-[#0B0C10]/55 p-3">
                    <div className="text-[10px] font-black tracking-[0.26em] text-[#66FCF1]">
                      世界锚点
                    </div>
                    <div className="mt-2 space-y-1">
                      {spirit.worldAnchors.map((anchor, index) => (
                        <div
                          key={index}
                          className="text-[11px] leading-relaxed text-[#C5C6C7]"
                        >
                          <span className="text-[#66FCF1]">▸</span> {anchor}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <main className="flex flex-col overflow-hidden rounded-2xl border border-[#45A29E]/35 bg-[#0B0C10]/80 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md lg:col-span-8 xl:col-span-9 h-[700px] lg:h-[800px] xl:h-[calc(100vh-6rem)] xl:min-h-[850px]">
            <div className="flex shrink-0 items-center justify-between border-b border-[#45A29E]/25 bg-[#1F2833]/80 px-5 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 border"
                  style={{ borderColor: `${themeColor}40` }}
                >
                  <MessageCircle size={16} style={{ color: themeColor }} />
                </div>
                <div>
                  <div
                    className="text-[11px] font-black tracking-[0.3em]"
                    style={{
                      color: themeColor,
                      textShadow: `0 0 8px ${themeColor}66`,
                    }}
                  >
                    {chat.mood || "待机"}
                  </div>
                  <div className="mt-0.5 text-[10px] tracking-widest text-[#8a8d91]">
                    {isRecentBattle ? "已载入最近塔战复盘" : "自由交谈"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`清空 ${selected.name} 的聊天记忆吗？`)) {
                    clearChat(selected.rosterId);
                  }
                }}
                className="group flex items-center gap-1.5 rounded-lg border border-[#8a8d91]/30 bg-black/20 px-3 py-1.5 text-[10px] tracking-widest text-[#8a8d91] transition-all hover:border-[#FF003C]/60 hover:bg-[#FF003C]/10 hover:text-[#FF003C]"
              >
                <RotateCcw
                  size={12}
                  className="transition-transform group-hover:-rotate-180"
                />
                重置记忆
              </button>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#45A29E]/30"
            >
              {chat.messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center opacity-80">
                  <div className="relative mb-6">
                    <div
                      className="absolute inset-0 animate-ping rounded-full opacity-20 blur-xl"
                      style={{ backgroundColor: themeColor }}
                    ></div>
                    <MessageCircle size={48} style={{ color: themeColor }} />
                  </div>
                  <div
                    className="text-xl font-black tracking-wider"
                    style={{ color: themeColor }}
                  >
                    第一次灵契通讯
                  </div>
                  <div className="mt-3 max-w-sm text-xs leading-relaxed text-[#8a8d91]">
                    这里会保存 {selected.name}{" "}
                    和你的独立记忆。你可以说任何话：日常、吐槽、脑洞、战斗、进化，或者只是让它陪你发会儿呆。
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <AnimatePresence initial={false}>
                    {chat.messages.map((message) => (
                      <ChatBubble
                        key={message.id}
                        message={message}
                        themeColor={themeColor}
                        avatar={selected.imageUrl}
                        name={selected.name}
                      />
                    ))}

                    {chat.triggerEvent && !isSending && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="my-4 flex flex-col items-center justify-center p-4 rounded-xl border-2 bg-[#1F2833]/60 backdrop-blur-md"
                        style={{
                          borderColor:
                            chat.triggerEvent.type === "TOWER_CHALLENGE"
                              ? "#FFD700"
                              : "#FF003C",
                          boxShadow: `0 0 24px ${chat.triggerEvent.type === "TOWER_CHALLENGE" ? "rgba(255,215,0,0.15)" : "rgba(255,0,60,0.15)"}`,
                        }}
                      >
                        <div className="mb-2 text-xs font-black tracking-widest text-[#C5C6C7]">
                          {chat.triggerEvent.type === "TOWER_CHALLENGE"
                            ? "🔥 九层塔挑战邀请"
                            : "⚔️ 切磋对战邀请"}
                        </div>
                        <div className="mb-4 text-[11px] text-[#8a8d91] italic">
                          “{chat.triggerEvent.description}”
                        </div>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                chat.triggerEvent?.type === "TOWER_CHALLENGE"
                              ) {
                                setTowerRosterId(selected.rosterId);
                                setTowerLayer(
                                  chat.triggerEvent.layer ||
                                    selected.tower.nextLayer ||
                                    1,
                                );
                                setBattleMode("pve_tower");
                                setPhase("TOWER_HUB");
                              } else {
                                setBattleMode("pvp");
                                setPhase("PLAYER1_CREATE");
                              }
                            }}
                            className="flex items-center gap-2 rounded px-6 py-2 text-xs font-black tracking-widest transition-all hover:scale-105"
                            style={{
                              backgroundColor:
                                chat.triggerEvent.type === "TOWER_CHALLENGE"
                                  ? "#FFD700"
                                  : "#FF003C",
                              color: "#0B0C10",
                            }}
                          >
                            <Swords size={14} />
                            接受挑战
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {isSending && (
                      <motion.div
                        key="typing"
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center gap-3 text-[11px] tracking-widest text-[#8a8d91]"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 border border-[#8a8d91]/20">
                          <Loader2 size={14} className="animate-spin" />
                        </div>
                        <span className="animate-pulse">
                          {selected.name} 正在组织语言...
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-[#45A29E]/25 bg-[#05070A]/95 p-4 backdrop-blur-xl">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3 flex items-center gap-2 rounded-lg border border-[#FF003C]/45 bg-[#FF003C]/10 px-4 py-2.5 text-[11px] tracking-wide text-[#FF6B9D]"
                >
                  <Zap size={14} className="shrink-0" />
                  {error}
                </motion.div>
              )}
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => fillQuickPrompt(prompt)}
                      disabled={isSending}
                      className="shrink-0 rounded-full border border-[#45A29E]/40 bg-[#1F2833]/60 px-4 py-1.5 text-[10px] tracking-wider text-[#8a8d91] transition-all hover:border-[#66FCF1] hover:bg-[#66FCF1]/10 hover:text-[#66FCF1] disabled:opacity-40 disabled:hover:border-[#45A29E]/40 disabled:hover:bg-[#1F2833]/60 disabled:hover:text-[#8a8d91]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <div className="relative flex items-end gap-3">
                  <div className="relative flex-1">
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      disabled={isSending}
                      rows={3}
                      placeholder={
                        isReady
                          ? `与 ${selected.name} 交谈... (Enter 发送, Shift+Enter 换行)`
                          : "请先在首页选择免费体验或填写 custom API"
                      }
                      className="w-full resize-none rounded-xl border border-[#45A29E]/40 bg-black/60 px-4 py-3 text-sm leading-relaxed text-[#C5C6C7] outline-none transition-all placeholder:text-[#8a8d91]/50 focus:border-[#66FCF1] focus:bg-black/80 focus:shadow-[0_0_20px_rgba(102,252,241,0.15)] disabled:opacity-50"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          handleSubmit(event);
                        }
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!input.trim() || isSending || !isReady}
                    className="group flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 transition-all disabled:opacity-40 disabled:hover:bg-transparent"
                    style={{
                      borderColor: themeColor,
                      color: themeColor,
                      backgroundColor:
                        input.trim() && !isSending && isReady
                          ? `${themeColor}15`
                          : "transparent",
                      boxShadow:
                        input.trim() && !isSending && isReady
                          ? `0 0 15px ${themeColor}33`
                          : "none",
                    }}
                  >
                    {isSending ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <Send
                        size={20}
                        className="transition-transform group-hover:scale-110 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      />
                    )}
                  </button>
                </div>
              </form>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

const MiniInfo: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}> = ({ icon, label, value, color }) => (
  <div className="rounded border border-[#45A29E]/20 bg-[#0B0C10]/55 p-2">
    <div className="flex items-center gap-1 text-[#8a8d91]">
      <span style={{ color }}>{icon}</span>
      {label}
    </div>
    <div className="mt-1 text-sm font-black" style={{ color }}>
      {value}
    </div>
  </div>
);

const ChatBubble: React.FC<{
  message: SpiritChatMessage;
  themeColor: string;
  avatar?: string;
  name: string;
}> = ({ message, themeColor, avatar, name }) => {
  const isPlayer = message.role === "player";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`flex gap-3 ${isPlayer ? "justify-end" : "justify-start"}`}
    >
      {!isPlayer && (
        <div
          className="h-9 w-9 shrink-0 overflow-hidden rounded border bg-[#0B0C10]"
          style={{ borderColor: themeColor }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-xs font-black"
              style={{ color: themeColor }}
            >
              {name[0]}
            </div>
          )}
        </div>
      )}
      <div className={`max-w-[78%] ${isPlayer ? "text-right" : "text-left"}`}>
        <div
          className="rounded-lg border px-3 py-2 text-sm leading-relaxed"
          style={{
            borderColor: isPlayer ? "rgba(255,215,0,0.45)" : `${themeColor}88`,
            background: isPlayer ? "rgba(255,215,0,0.1)" : `${themeColor}14`,
            color: "#C5C6C7",
          }}
        >
          {message.content}
        </div>
        <div
          className={`mt-1 flex items-center gap-2 text-[9px] tracking-widest text-[#8a8d91] ${isPlayer ? "justify-end" : "justify-start"}`}
        >
          {isPlayer ? "YOU" : name} · {formatTime(message.createdAt)}
          {!isPlayer && message.xpGranted && message.xpGranted > 0 && (
            <span className="flex items-center gap-1 rounded bg-[#7FFF9F]/10 px-1 py-0.5 text-[#7FFF9F] border border-[#7FFF9F]/30">
              <Zap size={8} /> +{message.xpGranted} XP
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const InfoBlock: React.FC<{
  icon: React.ReactNode;
  title: string;
  color: string;
  empty: string;
  items: string[];
}> = ({ icon, title, color, empty, items }) => (
  <div className="mt-4 rounded border border-[#45A29E]/30 bg-[#0B0C10]/55 p-3">
    <div
      className="flex items-center gap-2 text-[10px] font-black tracking-[0.26em]"
      style={{ color }}
    >
      {icon}
      {title}
    </div>
    {items.length === 0 ? (
      <div className="mt-2 text-[11px] text-[#8a8d91]">{empty}</div>
    ) : (
      <div className="mt-2 space-y-1.5">
        {items.map((item, index) => (
          <div
            key={index}
            className="text-[11px] leading-relaxed text-[#C5C6C7]"
          >
            <span style={{ color }}>▸</span> {item}
          </div>
        ))}
      </div>
    )}
  </div>
);
