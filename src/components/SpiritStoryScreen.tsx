import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Clapperboard,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  Sparkles,
  Swords,
  UserRound,
  Eye,
  UsersRound,
  Zap,
} from "lucide-react";
import { BackButton } from "./BackButton";
import { ParticleField } from "./ParticleField";
import { useGameStore } from "../store/useGameStore";
import {
  isRosterCharacterUnavailable,
  useRosterStore,
  type RosterCharacter,
} from "../store/useRosterStore";
import {
  makeNewSpiritStoryRoomId,
  useSpiritStoryStore,
  type SpiritStoryMessage,
} from "../store/useSpiritStoryStore";
import { requestSpiritStory } from "../utils/spiritStory";
import { evolutionLabel, levelAscensionLabel } from "../utils/towerProgress";

const QUICK_SCENES = [
  "夜里训练场突然停电，只有词灵身上的光还亮着。",
  "一封没有署名的挑战书落到桌上，目标写着你们所有人的名字。",
  "让他们讨论一下谁最适合担任这次行动的队长。",
  "我带你们去一个完全陌生的城市，先自由行动。",
  "有人说这里的规则可以被一句话改写，看看他们怎么反应。",
  "让气氛轻松一点，大家围坐下来聊一次真心话。",
];

const MAX_STORY_PARTICIPANTS = 10;

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const storyColor = (tension: number) => {
  if (tension >= 70) return "#FF003C";
  if (tension >= 40) return "#FFD700";
  return "#66FCF1";
};

const roomTitleFor = (participants: RosterCharacter[]) => {
  if (participants.length === 0) return "词灵群像";
  return participants
    .slice(0, 3)
    .map((char) => char.name)
    .join(" / ")
    .slice(0, 40);
};

export const SpiritStoryScreen: React.FC = () => {
  const { apiKey, baseUrl, model, apiMode, setPhase } = useGameStore();
  const roster = useRosterStore((s) => s.roster);
  const rooms = useSpiritStoryStore((s) => s.rooms);
  const activeRoomId = useSpiritStoryStore((s) => s.activeRoomId);
  const setActiveRoomId = useSpiritStoryStore((s) => s.setActiveRoomId);
  const getOrCreateRoom = useSpiritStoryStore((s) => s.getOrCreateRoom);
  const setRoomParticipants = useSpiritStoryStore((s) => s.setRoomParticipants);
  const setPlayerMode = useSpiritStoryStore((s) => s.setPlayerMode);
  const appendMessage = useSpiritStoryStore((s) => s.appendMessage);
  const applyStoryTurn = useSpiritStoryStore((s) => s.applyStoryTurn);
  const clearRoom = useSpiritStoryStore((s) => s.clearRoom);
  const availableRoster = roster.filter(
    (char) => !isRosterCharacterUnavailable(char),
  );
  const [draftIds, setDraftIds] = useState<string[]>(() =>
    availableRoster.slice(0, 3).map((char) => char.rosterId),
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRoom = activeRoomId ? rooms[activeRoomId] : null;
  const activeIds =
    activeRoom?.participantRosterIds?.length &&
    activeRoom.participantRosterIds.every((id) =>
      availableRoster.some((char) => char.rosterId === id),
    )
      ? activeRoom.participantRosterIds
      : draftIds;

  const participants = useMemo(
    () =>
      activeIds
        .map((id) => availableRoster.find((char) => char.rosterId === id))
        .filter((char): char is RosterCharacter => Boolean(char)),
    [activeIds, availableRoster],
  );
  const activeRosterIdSet = useMemo(
    () => new Set(participants.map((char) => char.rosterId)),
    [participants],
  );
  const room = activeRoom ?? null;
  const playerMode = room?.playerMode ?? "observer";
  const themeColor = storyColor(room?.tension ?? 24);
  const isCustomReady = apiMode === "custom" && apiKey && baseUrl && model;
  const isReady = apiMode === "free" || isCustomReady;

  const cfg = useMemo(
    () => ({ apiKey, baseUrl, model, apiMode }),
    [apiKey, baseUrl, model, apiMode],
  );

  useEffect(() => {
    if (activeRoomId || availableRoster.length < 2) return;
    const ids = draftIds.length >= 2
      ? draftIds
      : availableRoster.slice(0, 3).map((char) => char.rosterId);
    getOrCreateRoom(ids, roomTitleFor(availableRoster), makeNewSpiritStoryRoomId());
  }, [activeRoomId, availableRoster, draftIds, getOrCreateRoom]);

  useEffect(() => {
    if (!activeRoom) return;
    setDraftIds(activeRoom.participantRosterIds.slice(0, MAX_STORY_PARTICIPANTS));
  }, [activeRoom]);

  useEffect(() => {
    const validIds = new Set(availableRoster.map((char) => char.rosterId));
    const next = activeIds
      .filter((id) => validIds.has(id))
      .slice(0, MAX_STORY_PARTICIPANTS);
    if (!activeRoom && next.length !== draftIds.length) setDraftIds(next);
    if (activeRoom && next.length >= 2 && next.length !== activeIds.length) {
      setRoomParticipants(activeRoom.id, next);
    }
  }, [activeIds, activeRoom, availableRoster, draftIds.length, setRoomParticipants]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [room?.messages.length, isSending]);

  const toggleParticipant = (rosterId: string) => {
    setError("");
    const current = activeIds;
    let next = current;
    if (current.includes(rosterId)) {
      if (current.length <= 2) return;
      next = current.filter((id) => id !== rosterId);
    } else {
      if (current.length >= MAX_STORY_PARTICIPANTS) {
        setError(`最多同时出场 ${MAX_STORY_PARTICIPANTS} 名词灵。`);
        return;
      }
      next = [...current, rosterId];
    }
    if (activeRoom) {
      setRoomParticipants(activeRoom.id, next);
      return;
    }
    setDraftIds(next);
  };

  const sendMessage = async (content: string) => {
    const text = content.trim();
    if (!text || isSending || participants.length < 2) return;
    if (!isReady) {
      setError("多人故事需要先在首页选择免费体验或填写 custom API。");
      return;
    }

    const currentRoom =
      room ??
      getOrCreateRoom(
        participants.map((char) => char.rosterId),
        roomTitleFor(participants),
        makeNewSpiritStoryRoomId(),
      );

    setError("");
    setInput("");
    const playerMessage = appendMessage(currentRoom.id, {
      role: "player",
      content: text,
      speakerName:
        currentRoom.playerMode === "observer" ? "背景" : "YOU",
    });
    const latestRoom =
      useSpiritStoryStore.getState().rooms[currentRoom.id] ?? currentRoom;

    setIsSending(true);
    try {
      const result = await requestSpiritStory(
        cfg,
        participants,
        availableRoster,
        latestRoom,
        playerMessage.content,
      );
      applyStoryTurn(
        currentRoom.id,
        result.turns.map((turn) => ({
          role: turn.role,
          content: turn.content,
          speakerRosterId: turn.speakerRosterId,
          speakerName: turn.speakerName,
        })),
        {
          title: result.title,
          scene: result.scene,
          tension: result.tension,
          storySummary: result.storySummary,
          participantStates: result.participantStates,
          rosterEvents: result.rosterEvents,
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "多人故事暂时没有回应。");
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const continueStory = () => {
    if (isSending || !isReady || participants.length < 2) return;
    const prompt =
      playerMode === "observer"
        ? "请根据当前场景自然推进下一幕。优先让最该行动或说话的词灵推动剧情，不需要全员发言。"
        : "契约者暂时沉默观察。请根据当前场景自然推进下一幕，让最该行动或说话的词灵回应局势。";
    void sendMessage(prompt);
  };

  const recentRooms = Object.values(rooms)
    .filter((entry) => entry.participantRosterIds.length >= 2)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 4);

  if (availableRoster.length < 2) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center p-6">
        <ParticleField count={24} colors={["#66FCF1", "#FFD700"]} />
        <BackButton
          onClick={() => setPhase("MODE_SELECT")}
          color="#66FCF1"
          className="absolute left-6 top-6"
        />
        <div className="rounded-xl border border-[#66FCF1]/40 bg-[#1F2833]/75 p-8 text-center">
          <div className="text-xl font-black text-[#66FCF1]">
            需要至少两名可用词灵
          </div>
          <div className="mt-2 text-sm text-[#8a8d91]">
            先创造或解锁更多角色，再开启多人故事。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen grid-bg relative overflow-hidden p-3 md:p-4">
      <ParticleField count={32} colors={[themeColor, "#66FCF1", "#FFD700"]} />
      <BackButton
        onClick={() => setPhase("MODE_SELECT")}
        color={themeColor}
        className="absolute left-4 top-4 z-30"
      />

      <div className="relative z-10 mx-auto flex h-full max-w-[94rem] flex-col pt-12">
        <div className="mb-3 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-baseline gap-3">
            <h1
              className="text-2xl font-black tracking-wider font-display md:text-3xl"
              style={{
                color: themeColor,
                textShadow: `0 0 18px ${themeColor}`,
              }}
            >
              多人故事
            </h1>
            <div className="hidden items-center gap-2 text-[10px] font-black tracking-[0.34em] text-[#8a8d91] sm:flex">
              <Clapperboard size={13} style={{ color: themeColor }} />
              SPIRIT STORY
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {recentRooms.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setActiveRoomId(entry.id);
                }}
                className="shrink-0 rounded border px-3 py-1.5 text-[10px] font-bold tracking-widest transition-all"
                style={{
                  borderColor:
                    entry.id === room?.id ? themeColor : "rgba(102,252,241,0.25)",
                  color: entry.id === room?.id ? themeColor : "#8a8d91",
                  background:
                    entry.id === room?.id
                      ? `${themeColor}18`
                      : "rgba(11,12,16,0.55)",
                }}
              >
                {entry.title}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 items-stretch gap-4 xl:grid-cols-12">
          <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#45A29E]/30 xl:col-span-4 xl:flex 2xl:col-span-3">
            <section className="rounded-2xl border border-[#45A29E]/35 bg-[#1F2833]/72 p-4 shadow-lg backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.28em] text-[#66FCF1]">
                  <UsersRound size={14} />
                  出场词灵
                </div>
                <div className="text-[10px] text-[#8a8d91]">
                  {participants.length}/{MAX_STORY_PARTICIPANTS}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {availableRoster.slice(0, 24).map((char) => {
                  const active = activeIds.includes(char.rosterId);
                  return (
                    <button
                      key={char.rosterId}
                      type="button"
                      onClick={() => toggleParticipant(char.rosterId)}
                      className="group overflow-hidden rounded-lg border bg-[#0B0C10]/80 text-left transition-all"
                      style={{
                        borderColor: active
                          ? themeColor
                          : "rgba(102,252,241,0.22)",
                        boxShadow: active ? `0 0 14px ${themeColor}33` : "none",
                      }}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-[#111827]">
                        {char.imageUrl ? (
                          <img
                            src={char.imageUrl}
                            alt={char.name}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                        ) : (
                          <div
                            className="flex h-full w-full items-center justify-center text-3xl font-black"
                            style={{ color: themeColor }}
                          >
                            {char.name[0]}
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-2">
                          <div className="truncate text-xs font-black font-display text-[#C5C6C7]">
                            {char.name}
                          </div>
                          <div className="truncate text-[9px] text-[#8a8d91]">
                            Lv.{char.level} · {evolutionLabel(char.evolutionStage)}
                          </div>
                        </div>
                        {active && (
                          <div
                            className="absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-black text-[#0B0C10]"
                            style={{ backgroundColor: themeColor }}
                          >
                            IN
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-[#45A29E]/35 bg-[#1F2833]/72 p-4 shadow-lg backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between text-[10px] tracking-[0.24em] text-[#8a8d91]">
                <div className="flex items-center gap-1.5">
                  <Zap size={12} style={{ color: themeColor }} />
                  故事张力
                </div>
                <span style={{ color: themeColor }}>{room?.tension ?? 20}/100</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#0B0C10] border border-white/5">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: themeColor,
                    boxShadow: `0 0 12px ${themeColor}`,
                  }}
                  animate={{ width: `${room?.tension ?? 20}%` }}
                />
              </div>
              <InfoBlock
                icon={<Clapperboard size={14} />}
                title="当前场景"
                color={themeColor}
                empty="故事尚未开场。"
                items={room?.scene ? [room.scene] : []}
              />
              <InfoBlock
                icon={<BookOpen size={14} />}
                title="世界记忆"
                color="#66FCF1"
                empty="还没有沉淀故事记忆。"
                items={room?.storySummary ? [room.storySummary] : []}
              />
              <div className="mt-4 space-y-2">
                {participants.map((char) => {
                  const state = room?.participantStates[char.rosterId];
                  return (
                    <div
                      key={char.rosterId}
                      className="rounded border border-[#45A29E]/25 bg-[#0B0C10]/55 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-xs font-black text-[#C5C6C7]">
                          {char.name}
                        </div>
                        <div className="shrink-0 text-[10px] text-[#FFD700]">
                          {state?.mood || "入场"}
                        </div>
                      </div>
                      {state?.memory && (
                        <div className="mt-1 text-[10px] leading-relaxed text-[#8a8d91]">
                          {state.memory}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </aside>

          <main className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#45A29E]/35 bg-[#0B0C10]/80 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md xl:col-span-8 2xl:col-span-9">
            <div className="flex shrink-0 flex-col gap-3 border-b border-[#45A29E]/25 bg-[#1F2833]/80 px-4 py-3 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div
                  className="truncate text-[12px] font-black tracking-[0.28em]"
                  style={{
                    color: themeColor,
                    textShadow: `0 0 8px ${themeColor}66`,
                  }}
                >
                  {room?.title || roomTitleFor(participants)}
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] tracking-widest text-[#8a8d91]">
                  {participants.map((char) => (
                    <span key={char.rosterId}>
                      {char.name} · {levelAscensionLabel(char.level)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (room && window.confirm(`清空《${room.title}》的故事记忆吗？`)) {
                      clearRoom(room.id);
                    }
                  }}
                  disabled={!room}
                  className="group flex items-center gap-1.5 rounded-lg border border-[#8a8d91]/30 bg-black/20 px-3 py-1.5 text-[10px] tracking-widest text-[#8a8d91] transition-all hover:border-[#FF003C]/60 hover:bg-[#FF003C]/10 hover:text-[#FF003C] disabled:opacity-40"
                >
                  <RotateCcw
                    size={12}
                    className="transition-transform group-hover:-rotate-180"
                  />
                  重置故事
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 md:p-5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#45A29E]/30"
            >
              {!room || room.messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center opacity-85">
                  <div className="relative mb-6">
                    <div
                      className="absolute inset-0 animate-ping rounded-full opacity-20 blur-xl"
                      style={{ backgroundColor: themeColor }}
                    />
                    <MessageSquareText size={52} style={{ color: themeColor }} />
                  </div>
                  <div
                    className="text-xl font-black tracking-wider"
                    style={{ color: themeColor }}
                  >
                    群像故事开场
                  </div>
                  <div className="mt-3 max-w-md text-xs leading-relaxed text-[#8a8d91]">
                    选择 2-{MAX_STORY_PARTICIPANTS} 名词灵，直接给出场景、事件或一句话命令。它们会在同一个世界里互相回应，而不是分别和你单聊。
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <AnimatePresence initial={false}>
                    {room.messages.map((message) => (
                      <StoryBubble
                        key={message.id}
                        message={message}
                        allRoster={roster}
                        activeRosterIds={activeRosterIdSet}
                        themeColor={themeColor}
                      />
                    ))}
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
                          多名词灵正在把故事接下去...
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-[#45A29E]/25 bg-[#05070A]/95 p-3 backdrop-blur-xl">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-2 flex items-center gap-2 rounded-lg border border-[#FF003C]/45 bg-[#FF003C]/10 px-4 py-2 text-[11px] tracking-wide text-[#FF6B9D]"
                >
                  <Zap size={14} className="shrink-0" />
                  {error}
                </motion.div>
              )}
              <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {QUICK_SCENES.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      disabled={isSending}
                      className="shrink-0 rounded-full border border-[#45A29E]/40 bg-[#1F2833]/60 px-4 py-1.5 text-[10px] tracking-wider text-[#8a8d91] transition-all hover:border-[#66FCF1] hover:bg-[#66FCF1]/10 hover:text-[#66FCF1] disabled:opacity-40"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <div className="relative flex items-center gap-3">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    disabled={isSending || participants.length < 2}
                    rows={2}
                    placeholder={
                      isReady
                        ? playerMode === "observer"
                          ? "输入背景、场景变化或世界事件... (Enter 发送, Shift+Enter 换行)"
                          : "输入契约者行动、台词或命令... (Enter 发送, Shift+Enter 换行)"
                        : "请先在首页选择免费体验或填写 custom API"
                    }
                    className="w-full resize-none rounded-xl border border-[#45A29E]/40 bg-black/60 px-4 py-2.5 text-sm leading-relaxed text-[#C5C6C7] outline-none transition-all placeholder:text-[#8a8d91]/50 focus:border-[#66FCF1] focus:bg-black/80 focus:shadow-[0_0_20px_rgba(102,252,241,0.15)] disabled:opacity-50"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleSubmit(event);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={
                      !input.trim() ||
                      isSending ||
                      !isReady ||
                      participants.length < 2
                    }
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex w-full rounded-lg border border-[#45A29E]/35 bg-black/25 p-1 sm:w-auto">
                    <ModeToggleButton
                      active={playerMode === "observer"}
                      icon={<Eye size={12} />}
                      label="旁观背景"
                      color={themeColor}
                      onClick={() => room && setPlayerMode(room.id, "observer")}
                    />
                    <ModeToggleButton
                      active={playerMode === "participant"}
                      icon={<UserRound size={12} />}
                      label="契约者参与"
                      color={themeColor}
                      onClick={() => room && setPlayerMode(room.id, "participant")}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={continueStory}
                    disabled={isSending || !isReady || participants.length < 2}
                    className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#FFD700]/55 bg-[#FFD700]/10 px-4 text-[10px] font-black tracking-wider text-[#FFD700] transition-all hover:bg-[#FFD700] hover:text-[#0B0C10] disabled:opacity-40 disabled:hover:bg-[#FFD700]/10 disabled:hover:text-[#FFD700]"
                  >
                    <Sparkles size={12} />
                    继续故事
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

const StoryBubble: React.FC<{
  message: SpiritStoryMessage;
  allRoster: RosterCharacter[];
  activeRosterIds: Set<string>;
  themeColor: string;
}> = ({ message, allRoster, activeRosterIds, themeColor }) => {
  const isPlayer = message.role === "player";
  const isNarrator = message.role === "narrator";
  const isBackground = isPlayer && message.speakerName === "背景";
  const speaker = message.speakerRosterId
    ? allRoster.find((char) => char.rosterId === message.speakerRosterId)
    : null;
  const isActiveSpeaker = message.speakerRosterId
    ? activeRosterIds.has(message.speakerRosterId)
    : false;
  const speakerName = speaker?.name || message.speakerName || "词灵";
  const color = isNarrator ? "#8a8d91" : isPlayer ? "#FFD700" : themeColor;

  if (isNarrator || isBackground) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="mx-auto max-w-3xl rounded-lg border border-[#45A29E]/25 bg-[#1F2833]/40 px-4 py-3 text-center text-sm italic leading-relaxed text-[#C5C6C7]"
      >
        {isBackground ? (
          <Eye size={13} className="mr-2 inline text-[#FFD700]" />
        ) : (
          <Sparkles size={13} className="mr-2 inline text-[#66FCF1]" />
        )}
        {message.content}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`flex gap-3 ${isPlayer ? "justify-end" : "justify-start"}`}
    >
      {!isPlayer && (
        <div
          className={`h-10 w-10 shrink-0 overflow-hidden rounded border bg-[#0B0C10] ${
            isActiveSpeaker ? "" : "opacity-70 grayscale"
          }`}
          style={{ borderColor: color }}
        >
          {speaker?.imageUrl ? (
            <img
              src={speaker.imageUrl}
              alt={speaker.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-xs font-black"
              style={{ color }}
            >
              {speakerName[0]}
            </div>
          )}
        </div>
      )}
      <div className={`max-w-[78%] ${isPlayer ? "text-right" : "text-left"}`}>
        <div
          className="rounded-lg border px-3 py-2 text-sm leading-relaxed"
          style={{
            borderColor: isPlayer ? "rgba(255,215,0,0.45)" : `${color}88`,
            background: isPlayer ? "rgba(255,215,0,0.1)" : `${color}14`,
            color: "#C5C6C7",
          }}
        >
          {message.content}
        </div>
        <div
          className={`mt-1 flex items-center gap-2 text-[9px] tracking-widest text-[#8a8d91] ${isPlayer ? "justify-end" : "justify-start"}`}
        >
          {isPlayer ? "YOU" : speakerName} · {formatTime(message.createdAt)}
          {!isPlayer && (
            <span
              className={`flex items-center gap-1 rounded px-1 py-0.5 border ${
                isActiveSpeaker
                  ? "bg-[#66FCF1]/10 text-[#66FCF1] border-[#66FCF1]/30"
                  : "bg-[#8a8d91]/10 text-[#8a8d91] border-[#8a8d91]/30"
              }`}
            >
              <Swords size={8} /> {isActiveSpeaker ? "群像" : "已离场"}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const ModeToggleButton: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
}> = ({ active, icon, label, color, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[10px] font-black tracking-widest transition-all"
    style={{
      color: active ? "#0B0C10" : "#8a8d91",
      background: active ? color : "transparent",
      boxShadow: active ? `0 0 12px ${color}44` : "none",
    }}
  >
    {icon}
    {label}
  </button>
);

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
