import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Copy,
  FileText,
  Loader2,
  MessageSquareText,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Swords,
  UserRound,
  Eye,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import { BackButton } from "./BackButton";
import { ParticleField } from "./ParticleField";
import { CharacterAvatar } from "./CharacterAvatar";
import { useGameStore } from "../store/useGameStore";
import {
  isRosterCharacterRecruitLocked,
  isRosterCharacterUnavailable,
  useRosterStore,
  RECRUIT_STAGE_COUNT,
  type RosterCharacter,
} from "../store/useRosterStore";
import {
  DEFAULT_STORY_SCENARIO_ID,
  SPIRIT_STORY_SCENARIOS,
  getScenarioPreset,
  useSpiritStoryStore,
  type SpiritStoryMessage,
  type SpiritStoryRoom,
  type SpiritStoryStreamingState,
} from "../store/useSpiritStoryStore";
import {
  requestSpiritStory,
  requestSpiritStoryNovel,
  requestSpiritStorySuggestions,
  type SpiritStoryTurn,
} from "../utils/spiritStory";
import { evolutionLabel, levelAscensionLabel } from "../utils/towerProgress";
import { LOADING_STEPS } from "./loadingSteps";

const MAX_STORY_PARTICIPANTS = 6;
const COLLAPSED_ROSTER_COUNT = 8;
const SUGGESTION_IDLE_DELAY_MS = 1800;
const DEFAULT_CHAPTER_MESSAGE_COUNT = 16;

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

const getPendingNovelMessages = (
  room: SpiritStoryRoom,
): SpiritStoryMessage[] => {
  const lastChapter = room.novelChapters.at(-1);
  if (!lastChapter) return room.messages;
  const lastMessageIndex = room.messages.findIndex(
    (message) => message.id === lastChapter.sourceLastMessageId,
  );
  if (lastMessageIndex >= 0) {
    return room.messages.slice(lastMessageIndex + 1);
  }
  return room.messages.filter(
    (message) => message.createdAt > lastChapter.sourceThroughCreatedAt,
  );
};

const getInitialStoryPrompts = (quickScenes: string[]): string[] => {
  const candidates = [
    ...quickScenes,
    "让一处不起眼的细节突然变得可疑。",
    "让两名词灵因为立场不同产生第一次分歧。",
    "场景里出现新的线索，看看谁会先察觉。",
    "让最沉默的那位词灵先做出意外反应。",
    "让局势稍微缓和，给角色一次试探彼此的机会。",
    "有人说了一句意味不明的话，其他人各自解读。",
  ];
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[randomIndex]] = [
      candidates[randomIndex],
      candidates[index],
    ];
  }
  return [...new Set(candidates)].slice(0, 3);
};

export const SpiritStoryScreen: React.FC = () => {
  const { apiKey, baseUrl, model, apiMode, setPhase } = useGameStore();
  const roster = useRosterStore((s) => s.roster);
  const rooms = useSpiritStoryStore((s) => s.rooms);
  const activeRoomId = useSpiritStoryStore((s) => s.activeRoomId);
  const runtimeByRoomId = useSpiritStoryStore((s) => s.runtimeByRoomId);
  const setActiveRoomId = useSpiritStoryStore((s) => s.setActiveRoomId);
  const updateRoomRuntime = useSpiritStoryStore((s) => s.updateRoomRuntime);
  const clearRoomRuntime = useSpiritStoryStore((s) => s.clearRoomRuntime);
  const createRoom = useSpiritStoryStore((s) => s.createRoom);
  const updateRoomScenario = useSpiritStoryStore((s) => s.updateRoomScenario);
  const setRoomParticipants = useSpiritStoryStore((s) => s.setRoomParticipants);
  const setPlayerMode = useSpiritStoryStore((s) => s.setPlayerMode);
  const appendMessage = useSpiritStoryStore((s) => s.appendMessage);
  const applyStoryTurn = useSpiritStoryStore((s) => s.applyStoryTurn);
  const appendNovelChapter = useSpiritStoryStore((s) => s.appendNovelChapter);
  const clearRoom = useSpiritStoryStore((s) => s.clearRoom);
  const deleteRoom = useSpiritStoryStore((s) => s.deleteRoom);

  const availableRoster = roster.filter(
    (char) => !isRosterCharacterUnavailable(char),
  );
  const recruitingRoster = roster.filter((char) =>
    isRosterCharacterRecruitLocked(char),
  );
  const displayRoster = [...recruitingRoster, ...availableRoster];

  const [draftInput, setDraftInput] = useState("");
  const [draftError, setDraftError] = useState("");
  const [inputByRoomId, setInputByRoomId] = useState<Record<string, string>>(
    {},
  );
  const [isRosterExpanded, setIsRosterExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestStoryRequestIdByRoomIdRef = useRef<Record<string, string>>({});
  const latestNovelRequestIdByRoomIdRef = useRef<Record<string, string>>({});
  const activeForegroundRequestIdByRoomIdRef = useRef<Record<string, string>>(
    {},
  );
  const latestMetadataRequestIdByRoomIdRef = useRef<Record<string, string>>({});
  const pendingStreamingTurnsByRoomIdRef = useRef<
    Record<string, SpiritStoryStreamingState | undefined>
  >({});
  const streamingFrameByRoomIdRef = useRef<Record<string, number | undefined>>(
    {},
  );
  const initialPromptsByKeyRef = useRef<Record<string, string[]>>({});
  const suggestionRequestRoomIdsRef = useRef(new Set<string>());
  const suggestedForMessageIdByRoomIdRef = useRef<Record<string, string>>({});
  const inputByRoomIdRef = useRef<Record<string, string>>({});
  const [suggestedPromptsByRoomId, setSuggestedPromptsByRoomId] = useState<
    Record<string, string[]>
  >({});
  const [isNovelOpen, setIsNovelOpen] = useState(false);

  // Draft state (新建故事时使用)
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [draftScenarioId, setDraftScenarioId] = useState<string>(
    DEFAULT_STORY_SCENARIO_ID,
  );

  const activeRoom = activeRoomId ? rooms[activeRoomId] : null;
  const activeRuntime = activeRoom ? runtimeByRoomId[activeRoom.id] : undefined;
  const input = activeRoom ? (inputByRoomId[activeRoom.id] ?? "") : draftInput;
  const error = activeRoom ? (activeRuntime?.error ?? "") : draftError;
  const isSending = activeRuntime?.isSending ?? false;
  const streamingStory = activeRuntime?.streamingStory ?? null;
  const isNovelGenerating = activeRuntime?.isNovelGenerating ?? false;
  const novelStreamingContent = activeRuntime?.novelStreamingContent ?? "";
  const novelError = activeRuntime?.novelError ?? "";
  const pendingNovelMessages = activeRoom
    ? getPendingNovelMessages(activeRoom)
    : [];
  const isComposing = !activeRoom;
  const activeStreamingStory =
    streamingStory?.roomId === activeRoom?.id ? streamingStory : null;
  const activeStreamingContentLength =
    activeStreamingStory?.turns.reduce(
      (total, turn) => total + turn.content.length,
      0,
    ) ?? 0;
  const activeStreamingTurnIndex =
    activeStreamingStory?.turns.reduce(
      (lastIndex, turn, index) => (turn.content ? index : lastIndex),
      -1,
    ) ?? -1;

  const activeIds = activeRoom ? activeRoom.participantRosterIds : draftIds;
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

  const scenarioId = activeRoom ? activeRoom.scenarioId : draftScenarioId;
  const scenarioPreset = getScenarioPreset(scenarioId);
  const themeColor = storyColor(
    activeRoom?.tension ?? scenarioPreset.suggestedTension,
  );
  const playerMode = activeRoom?.playerMode ?? "observer";
  const isCustomReady =
    apiMode === "custom" && !!apiKey && !!baseUrl && !!model;
  const isReady = apiMode === "free" || isCustomReady;

  const cfg = useMemo(
    () => ({ apiKey, baseUrl, model, apiMode }),
    [apiKey, baseUrl, model, apiMode],
  );
  const latestStoryMessageId = activeRoom?.messages.at(-1)?.id;
  const canGenerateSuggestions =
    apiMode === "free" || Boolean(apiKey && baseUrl && model);
  const initialPromptKey = activeRoom
    ? `room:${activeRoom.id}:${activeRoom.scenarioId}`
    : `draft:${draftScenarioId}:${draftIds.join(",")}`;
  const initialPrompts =
    initialPromptsByKeyRef.current[initialPromptKey] ??
    (initialPromptsByKeyRef.current[initialPromptKey] = getInitialStoryPrompts(
      scenarioPreset.quickScenes,
    ));
  const suggestedPrompts = activeRoom
    ? (suggestedPromptsByRoomId[activeRoom.id] ?? initialPrompts)
    : initialPrompts;
  const setScopeError = (message: string) => {
    if (activeRoom) {
      updateRoomRuntime(activeRoom.id, { error: message });
    } else {
      setDraftError(message);
    }
  };
  const setCurrentInput = (value: string) => {
    if (activeRoom) {
      inputByRoomIdRef.current[activeRoom.id] = value;
      setInputByRoomId((current) => ({ ...current, [activeRoom.id]: value }));
    } else {
      setDraftInput(value);
    }
  };

  useEffect(() => {
    if (
      !activeRoom ||
      !latestStoryMessageId ||
      isSending ||
      input.trim() ||
      !canGenerateSuggestions
    ) {
      return;
    }

    const roomId = activeRoom.id;
    if (
      suggestionRequestRoomIdsRef.current.has(roomId) ||
      suggestedForMessageIdByRoomIdRef.current[roomId] === latestStoryMessageId
    ) {
      return;
    }

    const sourceMessageId = latestStoryMessageId;
    const timeoutId = window.setTimeout(() => {
      if (inputByRoomIdRef.current[roomId]?.trim() || isSending) return;

      const currentRoom = useSpiritStoryStore.getState().rooms[roomId];
      if (currentRoom?.messages.at(-1)?.id !== sourceMessageId) return;

      suggestionRequestRoomIdsRef.current.add(roomId);
      suggestedForMessageIdByRoomIdRef.current[roomId] = sourceMessageId;
      void requestSpiritStorySuggestions(cfg, participants, currentRoom)
        .then((nextPrompts) => {
          const latestRoom = useSpiritStoryStore.getState().rooms[roomId];
          if (
            nextPrompts.length === 0 ||
            latestRoom?.messages.at(-1)?.id !== sourceMessageId ||
            inputByRoomIdRef.current[roomId]?.trim()
          ) {
            return;
          }
          setSuggestedPromptsByRoomId((current) => ({
            ...current,
            [roomId]: nextPrompts,
          }));
        })
        .catch(() => {
          // 推进建议仅是辅助，不影响当前故事。
        })
        .finally(() => {
          suggestionRequestRoomIdsRef.current.delete(roomId);
        });
    }, SUGGESTION_IDLE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeRoom,
    canGenerateSuggestions,
    cfg,
    input,
    isSending,
    latestStoryMessageId,
    participants,
  ]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [activeRoom?.messages.length, isSending]);

  useEffect(() => {
    if (!activeStreamingContentLength) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeStreamingContentLength]);

  const clearPendingStreamingTurns = (roomId: string) => {
    const frame = streamingFrameByRoomIdRef.current[roomId];
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      delete streamingFrameByRoomIdRef.current[roomId];
    }
    delete pendingStreamingTurnsByRoomIdRef.current[roomId];
  };

  const isCurrentStoryRequest = (roomId: string, requestId: string) =>
    useSpiritStoryStore.getState().runtimeByRoomId[roomId]?.storyRequestId ===
    requestId;

  const isCurrentNovelRequest = (roomId: string, requestId: string) =>
    useSpiritStoryStore.getState().runtimeByRoomId[roomId]?.novelRequestId ===
    requestId;

  const scheduleStreamingTurns = (next: {
    roomId: string;
    requestId: string;
    startedAt: number;
    turns: SpiritStoryTurn[];
  }) => {
    if (
      latestStoryRequestIdByRoomIdRef.current[next.roomId] !== next.requestId ||
      !isCurrentStoryRequest(next.roomId, next.requestId)
    ) {
      return;
    }
    pendingStreamingTurnsByRoomIdRef.current[next.roomId] = next;
    if (streamingFrameByRoomIdRef.current[next.roomId] !== undefined) return;
    streamingFrameByRoomIdRef.current[next.roomId] = requestAnimationFrame(
      () => {
        delete streamingFrameByRoomIdRef.current[next.roomId];
        const pending = pendingStreamingTurnsByRoomIdRef.current[next.roomId];
        delete pendingStreamingTurnsByRoomIdRef.current[next.roomId];
        if (
          pending &&
          latestStoryRequestIdByRoomIdRef.current[pending.roomId] ===
            pending.requestId &&
          isCurrentStoryRequest(pending.roomId, pending.requestId)
        ) {
          updateRoomRuntime(pending.roomId, { streamingStory: pending });
        }
      },
    );
  };

  const invalidatePendingMetadata = (roomId: string) => {
    latestMetadataRequestIdByRoomIdRef.current[roomId] = "";
  };

  const invalidateRoomRequests = (roomId: string) => {
    clearPendingStreamingTurns(roomId);
    delete latestStoryRequestIdByRoomIdRef.current[roomId];
    delete latestNovelRequestIdByRoomIdRef.current[roomId];
    delete activeForegroundRequestIdByRoomIdRef.current[roomId];
    invalidatePendingMetadata(roomId);
    clearRoomRuntime(roomId);
  };

  const startNewComposing = () => {
    setActiveRoomId(null);
    setDraftError("");
    setDraftInput("");
    setDraftIds([]);
    setDraftScenarioId(DEFAULT_STORY_SCENARIO_ID);
  };

  const toggleParticipant = (rosterId: string) => {
    setScopeError("");
    if (isComposing) {
      setDraftIds((current) => {
        if (current.includes(rosterId)) {
          if (current.length <= 1) return current;
          return current.filter((id) => id !== rosterId);
        }
        if (current.length >= MAX_STORY_PARTICIPANTS) {
          setScopeError(`最多同时出场 ${MAX_STORY_PARTICIPANTS} 名词灵。`);
          return current;
        }
        return [...current, rosterId];
      });
      return;
    }
    if (!activeRoom) return;
    const current = activeRoom.participantRosterIds;
    if (current.includes(rosterId)) {
      if (current.length <= 2) return;
      invalidatePendingMetadata(activeRoom.id);
      setRoomParticipants(
        activeRoom.id,
        current.filter((id) => id !== rosterId),
      );
      return;
    }
    if (current.length >= MAX_STORY_PARTICIPANTS) {
      setScopeError(`最多同时出场 ${MAX_STORY_PARTICIPANTS} 名词灵。`);
      return;
    }
    invalidatePendingMetadata(activeRoom.id);
    setRoomParticipants(activeRoom.id, [...current, rosterId]);
  };

  const updateScenarioId = (id: string) => {
    if (activeRoom) {
      if (id === activeRoom.scenarioId) return;
      invalidatePendingMetadata(activeRoom.id);
      updateRoomScenario(activeRoom.id, { scenarioId: id });
      return;
    }
    setDraftScenarioId(id);
  };

  const ensureRoom = () => {
    if (activeRoom) return activeRoom;
    if (draftIds.length < 2) return null;
    const created = createRoom({
      participantRosterIds: draftIds,
      scenarioId: draftScenarioId,
    });
    return created;
  };

  const sendMessage = async (content: string) => {
    const text = content.trim();
    if (!text || isSending) return;
    if (participants.length < 2) {
      setScopeError("至少选择 2 名词灵才能开始。");
      return;
    }
    if (!isReady) {
      setScopeError("多人故事需要先在首页选择免费体验或填写 custom API。");
      return;
    }

    const currentRoom = ensureRoom();
    if (!currentRoom) return;

    updateRoomRuntime(currentRoom.id, { error: "" });
    inputByRoomIdRef.current[currentRoom.id] = "";
    setInputByRoomId((current) => ({ ...current, [currentRoom.id]: "" }));
    setDraftInput("");
    const playerMessage = appendMessage(currentRoom.id, {
      role: "player",
      content: text,
      speakerName: currentRoom.playerMode === "observer" ? "背景" : "YOU",
    });
    const latestRoom =
      useSpiritStoryStore.getState().rooms[currentRoom.id] ?? currentRoom;
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const startedAt = Date.now();
    latestStoryRequestIdByRoomIdRef.current[currentRoom.id] = requestId;
    activeForegroundRequestIdByRoomIdRef.current[currentRoom.id] = requestId;
    latestMetadataRequestIdByRoomIdRef.current[currentRoom.id] = requestId;
    clearPendingStreamingTurns(currentRoom.id);
    updateRoomRuntime(currentRoom.id, {
      isSending: true,
      storyRequestId: requestId,
      streamingStory: {
        roomId: currentRoom.id,
        requestId,
        startedAt,
        turns: [],
      },
    });
    let turnsCommitted = false;
    const commitTurns = (turns: SpiritStoryTurn[]) => {
      if (turnsCommitted || !turns.some((turn) => turn.content)) return;
      if (
        latestStoryRequestIdByRoomIdRef.current[currentRoom.id] !== requestId ||
        !isCurrentStoryRequest(currentRoom.id, requestId)
      ) {
        return;
      }
      turnsCommitted = true;
      clearPendingStreamingTurns(currentRoom.id);
      applyStoryTurn(
        currentRoom.id,
        turns.map((turn, index) => ({
          id: `story-stream-${requestId}-${index}`,
          createdAt: startedAt + index,
          role: turn.role,
          content: turn.content,
          speakerRosterId: turn.speakerRosterId,
          speakerName: turn.speakerName,
        })),
        {},
      );
      if (
        latestStoryRequestIdByRoomIdRef.current[currentRoom.id] === requestId &&
        isCurrentStoryRequest(currentRoom.id, requestId)
      ) {
        updateRoomRuntime(currentRoom.id, { streamingStory: null });
      }
      if (
        activeForegroundRequestIdByRoomIdRef.current[currentRoom.id] ===
          requestId &&
        isCurrentStoryRequest(currentRoom.id, requestId)
      ) {
        delete activeForegroundRequestIdByRoomIdRef.current[currentRoom.id];
        updateRoomRuntime(currentRoom.id, { isSending: false });
      }
    };

    try {
      const result = await requestSpiritStory(
        cfg,
        participants,
        latestRoom,
        playerMessage.content,
        {
          onTurnsChunk: (turns) => {
            if (!turns.some((turn) => turn.content)) return;
            scheduleStreamingTurns({
              roomId: currentRoom.id,
              requestId,
              startedAt,
              turns,
            });
          },
          onTurnsComplete: commitTurns,
        },
      );
      clearPendingStreamingTurns(currentRoom.id);
      if (!turnsCommitted) {
        commitTurns(result.turns);
      }
      if (
        latestMetadataRequestIdByRoomIdRef.current[currentRoom.id] ===
          requestId &&
        isCurrentStoryRequest(currentRoom.id, requestId)
      ) {
        applyStoryTurn(currentRoom.id, [], {
          title: result.title,
          scene: result.scene,
          tension: result.tension,
          storySummary: result.storySummary,
          participantStates: result.participantStates,
        });
      }
      if (
        latestStoryRequestIdByRoomIdRef.current[currentRoom.id] === requestId &&
        isCurrentStoryRequest(currentRoom.id, requestId)
      ) {
        updateRoomRuntime(currentRoom.id, { streamingStory: null });
      }
    } catch (err) {
      clearPendingStreamingTurns(currentRoom.id);
      if (
        latestStoryRequestIdByRoomIdRef.current[currentRoom.id] === requestId &&
        isCurrentStoryRequest(currentRoom.id, requestId)
      ) {
        updateRoomRuntime(currentRoom.id, { streamingStory: null });
      }
      if (
        !turnsCommitted &&
        latestStoryRequestIdByRoomIdRef.current[currentRoom.id] === requestId &&
        isCurrentStoryRequest(currentRoom.id, requestId)
      ) {
        updateRoomRuntime(currentRoom.id, {
          error: err instanceof Error ? err.message : "多人故事暂时没有回应。",
        });
      }
    } finally {
      if (
        activeForegroundRequestIdByRoomIdRef.current[currentRoom.id] ===
          requestId &&
        isCurrentStoryRequest(currentRoom.id, requestId)
      ) {
        delete activeForegroundRequestIdByRoomIdRef.current[currentRoom.id];
        updateRoomRuntime(currentRoom.id, { isSending: false });
      }
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

  const generateNovel = async (room: SpiritStoryRoom) => {
    const sourceMessages = getPendingNovelMessages(room).slice(
      0,
      DEFAULT_CHAPTER_MESSAGE_COUNT,
    );
    const roomRuntime = runtimeByRoomId[room.id];
    if (roomRuntime?.isNovelGenerating || sourceMessages.length === 0) return;
    if (!isReady) {
      updateRoomRuntime(room.id, {
        novelError: "请先在首页选择免费体验或填写 custom API。",
      });
      return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    latestNovelRequestIdByRoomIdRef.current[room.id] = requestId;
    updateRoomRuntime(room.id, {
      novelError: "",
      novelStreamingContent: "",
      isNovelGenerating: true,
      novelRequestId: requestId,
    });

    try {
      const previousChapter = room.novelChapters.at(-1);
      const content = await requestSpiritStoryNovel(
        cfg,
        participants,
        room,
        sourceMessages,
        room.novelChapters.length + 1,
        previousChapter?.content || "",
        {
          onContentChunk: (nextContent) => {
            if (
              latestNovelRequestIdByRoomIdRef.current[room.id] === requestId &&
              isCurrentNovelRequest(room.id, requestId)
            ) {
              updateRoomRuntime(room.id, {
                novelStreamingContent: nextContent,
              });
            }
          },
        },
      );
      if (
        latestNovelRequestIdByRoomIdRef.current[room.id] !== requestId ||
        !isCurrentNovelRequest(room.id, requestId)
      )
        return;
      const lastSourceMessage = sourceMessages.at(-1);
      appendNovelChapter(room.id, {
        id: `chapter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        content,
        sourceMessageCount: sourceMessages.length,
        sourceLastMessageId: lastSourceMessage?.id || "",
        sourceThroughCreatedAt: lastSourceMessage?.createdAt || Date.now(),
        generatedAt: Date.now(),
      });
      updateRoomRuntime(room.id, { novelStreamingContent: "" });
    } catch (err) {
      if (
        latestNovelRequestIdByRoomIdRef.current[room.id] === requestId &&
        isCurrentNovelRequest(room.id, requestId)
      ) {
        updateRoomRuntime(room.id, {
          novelError:
            err instanceof Error ? err.message : "小说编排暂时没有回应。",
        });
      }
    } finally {
      if (
        latestNovelRequestIdByRoomIdRef.current[room.id] === requestId &&
        isCurrentNovelRequest(room.id, requestId)
      ) {
        updateRoomRuntime(room.id, { isNovelGenerating: false });
      }
    }
  };

  const openNovelDraft = () => {
    if (!activeRoom || activeRoom.messages.length === 0) return;
    updateRoomRuntime(activeRoom.id, {
      novelError: "",
      novelStreamingContent: "",
    });
    setIsNovelOpen(true);
  };

  const roomList = Object.values(rooms).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startNewComposing}
              className="flex items-center gap-1.5 rounded-full border border-[#66FCF1]/60 bg-[#66FCF1]/10 px-3 py-1.5 text-[10px] font-black tracking-[0.24em] text-[#66FCF1] transition-all hover:bg-[#66FCF1] hover:text-[#0B0C10]"
            >
              <Plus size={12} />
              新建故事
            </button>
            <div className="flex max-w-[52vw] gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {roomList.map((entry) => {
                const isActive = entry.id === activeRoom?.id;
                const preset = getScenarioPreset(entry.scenarioId);
                return (
                  <div key={entry.id} className="group relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveRoomId(entry.id)}
                      className="flex items-center gap-1.5 rounded border py-1.5 pl-3 pr-8 text-[10px] font-bold tracking-widest transition-all"
                      style={{
                        borderColor: isActive
                          ? themeColor
                          : "rgba(102,252,241,0.25)",
                        color: isActive ? themeColor : "#8a8d91",
                        background: isActive
                          ? `${themeColor}18`
                          : "rgba(11,12,16,0.55)",
                      }}
                    >
                      <span
                        className="rounded px-1 py-[1px] text-[8px]"
                        style={{
                          background: isActive
                            ? `${themeColor}30`
                            : "rgba(255,255,255,0.05)",
                          color: isActive ? themeColor : "#8a8d91",
                        }}
                      >
                        {preset.label}
                      </span>
                      <span className="max-w-[9rem] truncate">
                        {entry.title}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (window.confirm(`删除故事《${entry.title}》？`)) {
                          invalidateRoomRequests(entry.id);
                          delete inputByRoomIdRef.current[entry.id];
                          setInputByRoomId((current) => {
                            const next = { ...current };
                            delete next[entry.id];
                            return next;
                          });
                          deleteRoom(entry.id);
                        }
                      }}
                      aria-label="删除故事"
                      title="删除故事"
                      className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-[#8a8d91]/40 opacity-0 transition-all hover:bg-[#FF003C]/15 hover:text-[#FF3B6E] group-hover:opacity-100 focus:opacity-100"
                    >
                      <X size={10} strokeWidth={2.5} />
                    </button>
                  </div>
                );
              })}
            </div>
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
                {displayRoster
                  .slice(
                    0,
                    isRosterExpanded ? undefined : COLLAPSED_ROSTER_COUNT,
                  )
                  .map((char) => {
                    const active = activeIds.includes(char.rosterId);
                    const isRecruiting = isRosterCharacterRecruitLocked(char);
                    const isFailed =
                      isRecruiting && char.recruitLock?.status === "failed";
                    const stage = char.recruitLock?.stage ?? 0;
                    const safeStage = Math.min(
                      RECRUIT_STAGE_COUNT - 1,
                      Math.max(0, stage),
                    );
                    const step = LOADING_STEPS[safeStage] ?? LOADING_STEPS[0];
                    const StepIcon = step.icon;
                    const progressPct = Math.round(
                      ((safeStage + 1) / RECRUIT_STAGE_COUNT) * 100,
                    );
                    const accent = isFailed ? "#FF6B9D" : themeColor;
                    return (
                      <button
                        key={char.rosterId}
                        type="button"
                        onClick={() =>
                          !isRecruiting && toggleParticipant(char.rosterId)
                        }
                        disabled={isRecruiting}
                        className="group overflow-hidden rounded-lg border bg-[#0B0C10]/80 text-left transition-all disabled:cursor-not-allowed"
                        style={{
                          borderColor: isRecruiting
                            ? `${accent}55`
                            : active
                              ? themeColor
                              : "rgba(102,252,241,0.22)",
                          boxShadow: active
                            ? `0 0 14px ${themeColor}33`
                            : "none",
                        }}
                      >
                        <div className="relative aspect-[4/3] overflow-hidden bg-[#111827]">
                          {isRecruiting ? (
                            <div
                              className="relative h-full w-full"
                              style={{
                                background: `radial-gradient(ellipse at 50% 45%, ${accent}22 0%, rgba(11,12,16,0.95) 60%, #05070A 100%)`,
                              }}
                            >
                              {!isFailed && (
                                <motion.div
                                  aria-hidden
                                  className="absolute inset-0 flex items-center justify-center"
                                  animate={{ rotate: 360 }}
                                  transition={{
                                    duration: 18,
                                    repeat: Infinity,
                                    ease: "linear",
                                  }}
                                >
                                  <div
                                    className="h-[70%] w-[70%] rounded-full border border-dashed"
                                    style={{ borderColor: `${accent}55` }}
                                  />
                                </motion.div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center">
                                {isFailed ? (
                                  <div
                                    className="flex h-10 w-10 items-center justify-center rounded-full border-2"
                                    style={{
                                      borderColor: accent,
                                      background: `${accent}22`,
                                      boxShadow: `0 0 12px ${accent}77`,
                                    }}
                                  >
                                    <RotateCcw
                                      size={16}
                                      style={{ color: accent }}
                                    />
                                  </div>
                                ) : (
                                  <motion.div
                                    animate={{ scale: [1, 1.08, 1] }}
                                    transition={{
                                      duration: 1.6,
                                      repeat: Infinity,
                                      ease: "easeInOut",
                                    }}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border-2"
                                    style={{
                                      borderColor: accent,
                                      background: `radial-gradient(circle at 30% 30%, ${accent}44, rgba(0,0,0,0.4) 70%)`,
                                      boxShadow: `0 0 14px ${accent}77, inset 0 0 8px ${accent}55`,
                                    }}
                                  >
                                    <StepIcon
                                      size={16}
                                      style={{ color: accent }}
                                    />
                                  </motion.div>
                                )}
                              </div>
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-2">
                                <div
                                  className="truncate text-[10px] font-black tracking-[0.2em]"
                                  style={{ color: accent }}
                                >
                                  {isFailed ? "创造失败" : "创造中"}
                                </div>
                                <div className="mt-1 flex items-center gap-1">
                                  <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-black/70">
                                    <motion.div
                                      className="h-full rounded-full"
                                      style={{
                                        background: `linear-gradient(90deg, ${accent}, #FFD700)`,
                                        boxShadow: `0 0 6px ${accent}88`,
                                      }}
                                      initial={false}
                                      animate={{
                                        width: isFailed
                                          ? "100%"
                                          : `${progressPct}%`,
                                      }}
                                      transition={{
                                        duration: 0.5,
                                        ease: "easeOut",
                                      }}
                                    />
                                  </div>
                                  <span
                                    className="text-[8px] font-black tabular-nums"
                                    style={{ color: accent }}
                                  >
                                    {isFailed ? "ERR" : `${progressPct}%`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <CharacterAvatar
                                imageUrl={char.imageUrl}
                                name={char.name}
                                themeColor={themeColor}
                                className="h-full w-full transition-transform group-hover:scale-105"
                                iconSize={36}
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-2">
                                <div className="truncate text-xs font-black font-display text-[#C5C6C7]">
                                  {char.name}
                                </div>
                                <div className="truncate text-[9px] text-[#8a8d91]">
                                  Lv.{char.level} ·{" "}
                                  {evolutionLabel(char.evolutionStage)}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
              {displayRoster.length > COLLAPSED_ROSTER_COUNT && (
                <button
                  type="button"
                  onClick={() => setIsRosterExpanded((v) => !v)}
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-[#45A29E]/25 bg-[#0B0C10]/50 py-1.5 text-[10px] tracking-wider text-[#8a8d91] transition-colors hover:bg-[#45A29E]/10 hover:text-[#66FCF1]"
                >
                  {isRosterExpanded ? (
                    <>
                      <ChevronUp size={12} /> 收起
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} /> 展开全部 ({displayRoster.length}
                      )
                    </>
                  )}
                </button>
              )}
              <div className="mt-3 text-[10px] leading-relaxed text-[#8a8d91]/70">
                每位词灵在剧本里的真实身份由 AI
                悄悄安排，你需要在剧情中自己判断谁是敌友。
              </div>
            </section>

            <ScenarioSection
              scenarioId={scenarioId}
              onChange={updateScenarioId}
              themeColor={themeColor}
              isComposing={isComposing}
            />

            {activeRoom && (
              <section className="rounded-2xl border border-[#45A29E]/35 bg-[#1F2833]/72 p-4 shadow-lg backdrop-blur-sm">
                <div className="mb-4 flex items-center justify-between text-[10px] tracking-[0.24em] text-[#8a8d91]">
                  <div className="flex items-center gap-1.5">
                    <Zap size={12} style={{ color: themeColor }} />
                    故事张力
                  </div>
                  <span style={{ color: themeColor }}>
                    {activeRoom.tension}/100
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#0B0C10] border border-white/5">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: themeColor,
                      boxShadow: `0 0 12px ${themeColor}`,
                    }}
                    animate={{ width: `${activeRoom.tension}%` }}
                  />
                </div>
                <InfoBlock
                  icon={<Clapperboard size={14} />}
                  title="当前场景"
                  color={themeColor}
                  empty="故事尚未开场。"
                  items={activeRoom.scene ? [activeRoom.scene] : []}
                />
                <InfoBlock
                  icon={<BookOpen size={14} />}
                  title="世界记忆"
                  color="#66FCF1"
                  empty="还没有沉淀故事记忆。"
                  items={
                    activeRoom.storySummary ? [activeRoom.storySummary] : []
                  }
                />
                <div className="mt-4 space-y-2">
                  {participants.map((char) => {
                    const state = activeRoom.participantStates[char.rosterId];
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
            )}
          </aside>

          <main
            className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border shadow-[0_8px_32px_rgba(0,0,0,0.5)] xl:col-span-8 2xl:col-span-9"
            style={{ borderColor: `${themeColor}38` }}
          >
            <StoryAmbientBackdrop
              participants={participants}
              themeColor={themeColor}
            />

            <div className="relative z-10 flex shrink-0 flex-col gap-3 border-b border-[#45A29E]/25 bg-[#0B0C10]/55 px-4 py-3 backdrop-blur-md lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black tracking-widest"
                    style={{
                      background: `${themeColor}22`,
                      color: themeColor,
                      border: `1px solid ${themeColor}55`,
                    }}
                  >
                    {scenarioPreset.label}
                  </span>
                  <div
                    className="truncate text-[12px] font-black tracking-[0.28em]"
                    style={{
                      color: themeColor,
                      textShadow: `0 0 8px ${themeColor}66`,
                    }}
                  >
                    {activeRoom?.title || "尚未开场"}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] tracking-widest text-[#8a8d91]">
                  {participants.map((char) => (
                    <span
                      key={char.rosterId}
                      className="flex items-center gap-1"
                    >
                      {char.name} · {levelAscensionLabel(char.level)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openNovelDraft}
                  disabled={!activeRoom || activeRoom.messages.length === 0}
                  className="group flex items-center gap-1.5 rounded-lg border border-[#FFD700]/50 bg-[#FFD700]/10 px-3 py-1.5 text-[10px] font-black tracking-widest text-[#FFD700] transition-all hover:border-[#FFD700] hover:bg-[#FFD700] hover:text-[#0B0C10] disabled:opacity-35 disabled:hover:bg-[#FFD700]/10 disabled:hover:text-[#FFD700]"
                >
                  {isNovelGenerating ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <FileText
                      size={12}
                      className="transition-transform group-hover:-translate-y-0.5"
                    />
                  )}
                  小说章节
                  {Boolean(activeRoom?.novelChapters.length) && (
                    <span className="text-[8px]">
                      {activeRoom?.novelChapters.length} 章
                    </span>
                  )}
                  {pendingNovelMessages.length >=
                    DEFAULT_CHAPTER_MESSAGE_COUNT && (
                    <span className="rounded border border-[#FFD700]/50 bg-black/20 px-1 py-0.5 text-[8px]">
                      可成章
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      activeRoom &&
                      window.confirm(
                        `清空《${activeRoom.title}》的故事记忆吗？`,
                      )
                    ) {
                      invalidateRoomRequests(activeRoom.id);
                      clearRoom(activeRoom.id);
                      delete initialPromptsByKeyRef.current[
                        `room:${activeRoom.id}:${activeRoom.scenarioId}`
                      ];
                      setSuggestedPromptsByRoomId((current) => {
                        const next = { ...current };
                        delete next[activeRoom.id];
                        return next;
                      });
                    }
                  }}
                  disabled={!activeRoom}
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
              className="relative z-10 flex-1 overflow-y-auto p-4 md:p-5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#45A29E]/30"
            >
              {!activeRoom || activeRoom.messages.length === 0 ? (
                <ComposingHint
                  scenarioLabel={scenarioPreset.label}
                  scenarioBrief={
                    activeRoom?.scenarioBrief || scenarioPreset.brief
                  }
                  themeColor={themeColor}
                  ready={participants.length >= 2 && isReady}
                />
              ) : (
                <div className="space-y-5">
                  <AnimatePresence initial={false}>
                    {activeRoom.messages.map((message) => (
                      <StoryBubble
                        key={message.id}
                        message={message}
                        allRoster={roster}
                        activeRosterIds={activeRosterIdSet}
                        themeColor={themeColor}
                      />
                    ))}
                    {activeStreamingStory?.turns.map((turn, index) =>
                      turn.content ? (
                        <StoryBubble
                          key={`story-stream-${activeStreamingStory.requestId}-${index}`}
                          message={{
                            id: `story-stream-${activeStreamingStory.requestId}-${index}`,
                            role: turn.role,
                            content: turn.content,
                            createdAt: activeStreamingStory.startedAt + index,
                            speakerRosterId: turn.speakerRosterId,
                            speakerName: turn.speakerName,
                          }}
                          allRoster={roster}
                          activeRosterIds={activeRosterIdSet}
                          themeColor={themeColor}
                          streaming={index === activeStreamingTurnIndex}
                        />
                      ) : null,
                    )}
                    {isSending &&
                      activeStreamingStory &&
                      !activeStreamingStory.turns.some(
                        (turn) => turn.content,
                      ) && (
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

            <div className="relative z-10 shrink-0 border-t border-[#45A29E]/25 bg-[#05070A]/85 p-3 backdrop-blur-xl">
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
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="flex shrink-0 items-center gap-1 text-[9px] font-black tracking-[0.16em] text-[#45A29E]">
                    <Sparkles size={11} />
                    {activeRoom?.messages.length ? "猜你想推进" : "从这里开始"}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {suggestedPrompts.map((prompt) => (
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
                </div>

                <div className="relative flex items-center gap-3">
                  <textarea
                    value={input}
                    onChange={(event) => {
                      const nextInput = event.target.value;
                      setCurrentInput(nextInput);
                    }}
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
                      onClick={() =>
                        activeRoom && setPlayerMode(activeRoom.id, "observer")
                      }
                      disabled={!activeRoom}
                    />
                    <ModeToggleButton
                      active={playerMode === "participant"}
                      icon={<UserRound size={12} />}
                      label="契约者参与"
                      color={themeColor}
                      onClick={() =>
                        activeRoom &&
                        setPlayerMode(activeRoom.id, "participant")
                      }
                      disabled={!activeRoom}
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
      <AnimatePresence>
        {isNovelOpen && activeRoom && (
          <NovelDraftModal
            key={activeRoom.id}
            room={activeRoom}
            streamingContent={novelStreamingContent}
            pendingMessageCount={pendingNovelMessages.length}
            isGenerating={isNovelGenerating}
            error={novelError}
            themeColor={themeColor}
            onClose={() => setIsNovelOpen(false)}
            onGenerateNext={() => void generateNovel(activeRoom)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const formatChapterNumber = (value: number): string => {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value <= 10) return value === 10 ? "十" : digits[value];
  if (value < 20) return `十${digits[value % 10]}`;
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${digits[tens]}十${ones ? digits[ones] : ""}`;
};

const NovelDraftModal: React.FC<{
  room: SpiritStoryRoom;
  streamingContent: string;
  pendingMessageCount: number;
  isGenerating: boolean;
  error: string;
  themeColor: string;
  onClose: () => void;
  onGenerateNext: () => void;
}> = ({
  room,
  streamingContent,
  pendingMessageCount,
  isGenerating,
  error,
  themeColor,
  onClose,
  onGenerateNext,
}) => {
  const chapters = room.novelChapters;
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(
    Math.max(0, chapters.length - 1),
  );
  const [copied, setCopied] = useState(false);
  const isStreamingChapter =
    isGenerating && selectedChapterIndex === chapters.length;
  const selectedChapter = chapters[selectedChapterIndex];
  const content = isStreamingChapter
    ? streamingContent
    : selectedChapter?.content || "";
  const currentChapterNumber = selectedChapterIndex + 1;
  const nextChapterNumber = chapters.length + 1;
  const wordCount = content.replace(/\s/g, "").length;
  const recommendedReady = pendingMessageCount >= DEFAULT_CHAPTER_MESSAGE_COUNT;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (isGenerating) {
      setSelectedChapterIndex(chapters.length);
    } else if (chapters.length > 0) {
      setSelectedChapterIndex(chapters.length - 1);
    }
  }, [chapters.length, isGenerating]);

  const copyContent = async () => {
    const completedBook = chapters
      .map(
        (chapter, index) =>
          `第${formatChapterNumber(index + 1)}章\n\n${chapter.content}`,
      )
      .join("\n\n");
    const copyText =
      isGenerating && streamingContent
        ? `${completedBook}${completedBook ? "\n\n" : ""}第${formatChapterNumber(nextChapterNumber)}章\n\n${streamingContent}`
        : completedBook;
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(`《${room.title}》\n\n${copyText}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // 浏览器拒绝剪贴板权限时保留正文，用户仍可手动选取。
    }
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${room.title}小说成稿`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#030508]/90 p-3 backdrop-blur-md md:p-6"
    >
      <motion.section
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.99 }}
        transition={{ duration: 0.2 }}
        className="relative flex h-[min(88vh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#FFD700]/30 bg-[#0B0C10] shadow-[0_24px_90px_rgba(0,0,0,0.72)]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${themeColor}, #FFD700, transparent)`,
          }}
        />

        <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#11151c]/92 px-4 py-3 md:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#FFD700]">
              <FileText size={13} />
              NOVEL COMPOSER
            </div>
            <h2 className="mt-1 truncate text-lg font-black tracking-wider text-[#E7E8EA] md:text-xl">
              《{room.title}》
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={copyContent}
              disabled={chapters.length === 0 && !streamingContent}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-[#66FCF1]/35 bg-[#66FCF1]/5 px-3 text-[10px] font-black tracking-wider text-[#66FCF1] transition-colors hover:bg-[#66FCF1]/15 disabled:opacity-35"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "已复制" : "复制全文"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭小说成稿"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[#8a8d91] transition-colors hover:border-white/25 hover:bg-white/5 hover:text-white"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_top,rgba(255,215,0,0.045),transparent_42%)] md:flex-row">
          <aside className="flex shrink-0 gap-2 overflow-x-auto border-b border-white/10 bg-[#080A0E]/75 p-3 scrollbar-hide md:w-52 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
            {chapters.map((chapter, index) => {
              const active =
                !isStreamingChapter && selectedChapterIndex === index;
              return (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => setSelectedChapterIndex(index)}
                  className="min-w-32 rounded-lg border px-3 py-2.5 text-left transition-colors md:min-w-0"
                  style={{
                    borderColor: active
                      ? "#FFD70088"
                      : "rgba(255,255,255,0.09)",
                    background: active
                      ? "rgba(255,215,0,0.09)"
                      : "rgba(255,255,255,0.02)",
                  }}
                >
                  <div
                    className="text-[10px] font-black tracking-[0.16em]"
                    style={{ color: active ? "#FFD700" : "#C5C6C7" }}
                  >
                    第{formatChapterNumber(index + 1)}章
                  </div>
                  <div className="mt-1 text-[8px] tracking-wider text-[#8a8d91]">
                    {chapter.sourceMessageCount} 段 ·{" "}
                    {chapter.content.replace(/\s/g, "").length} 字
                  </div>
                </button>
              );
            })}
            {isGenerating && (
              <button
                type="button"
                onClick={() => setSelectedChapterIndex(chapters.length)}
                className="min-w-32 rounded-lg border border-[#FFD700]/45 bg-[#FFD700]/10 px-3 py-2.5 text-left md:min-w-0"
              >
                <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-[#FFD700]">
                  <Loader2 size={11} className="animate-spin" />第
                  {formatChapterNumber(nextChapterNumber)}章
                </div>
                <div className="mt-1 text-[8px] tracking-wider text-[#FFD700]/65">
                  正在编排
                </div>
              </button>
            )}
          </aside>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-7 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#FFD700]/25 md:px-12 md:py-10">
            {content ? (
              <article className="mx-auto max-w-3xl">
                <div className="mb-8 text-center">
                  <div className="text-[10px] font-black tracking-[0.34em] text-[#FFD700]">
                    CHAPTER {currentChapterNumber.toString().padStart(2, "0")}
                  </div>
                  <h3 className="mt-2 text-xl font-black tracking-[0.2em] text-[#E7E8EA]">
                    第{formatChapterNumber(currentChapterNumber)}章
                  </h3>
                </div>
                <div className="whitespace-pre-wrap font-serif text-[15px] leading-[2.05] tracking-[0.035em] text-[#D6D3CC] md:text-[16px]">
                  {content}
                  {isStreamingChapter && (
                    <span className="ml-1 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-[#FFD700]" />
                  )}
                </div>
              </article>
            ) : isGenerating ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <div className="absolute inset-0 animate-ping rounded-full border border-[#FFD700]/25" />
                  <FileText size={26} className="text-[#FFD700]" />
                </div>
                <div className="mt-5 text-xs font-black tracking-[0.24em] text-[#FFD700]">
                  正在编排第{formatChapterNumber(nextChapterNumber)}章
                </div>
                <div className="mt-2 text-[11px] text-[#8a8d91]">
                  整理场景、对白与人物视角...
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <BookOpen size={38} className="text-[#FFD700]/70" />
                <div className="mt-4 text-sm font-black tracking-wider text-[#D6D3CC]">
                  故事尚未成章
                </div>
                <div className="mt-2 max-w-sm text-[11px] leading-relaxed text-[#8a8d91]">
                  当前有 {pendingMessageCount} 段剧情待整理。建议累积{" "}
                  {DEFAULT_CHAPTER_MESSAGE_COUNT} 段后生成，章节节奏会更完整。
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="relative z-10 flex shrink-0 flex-col gap-3 border-t border-white/10 bg-[#080A0E]/95 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] tracking-[0.16em] text-[#8a8d91]">
            {content && <span>本章 {wordCount.toLocaleString()} 字</span>}
            <span className={recommendedReady ? "text-[#FFD700]" : ""}>
              待编排 {pendingMessageCount}/{DEFAULT_CHAPTER_MESSAGE_COUNT} 段
            </span>
            {!recommendedReady && pendingMessageCount > 0 && !isGenerating && (
              <span>可提前成章，满 16 段节奏更完整</span>
            )}
            {recommendedReady && !isGenerating && (
              <span className="text-[#FFD700]">已达到建议篇幅</span>
            )}
            {isGenerating && (
              <span className="flex items-center gap-1.5 text-[#FFD700]">
                <Loader2 size={10} className="animate-spin" />
                生成中
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <span className="max-w-xs truncate text-[10px] text-[#FF6B9D]">
                {error}
              </span>
            )}
            <button
              type="button"
              onClick={onGenerateNext}
              disabled={isGenerating || pendingMessageCount === 0}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#FFD700]/45 bg-[#FFD700]/10 px-4 text-[10px] font-black tracking-wider text-[#FFD700] transition-all hover:bg-[#FFD700] hover:text-[#0B0C10] disabled:opacity-40 disabled:hover:bg-[#FFD700]/10 disabled:hover:text-[#FFD700]"
            >
              {isGenerating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {isGenerating
                ? `正在编排第${formatChapterNumber(nextChapterNumber)}章`
                : `生成第${formatChapterNumber(nextChapterNumber)}章`}
            </button>
          </div>
        </footer>
      </motion.section>
    </motion.div>
  );
};

const ScenarioSection: React.FC<{
  scenarioId: string;
  onChange: (id: string) => void;
  themeColor: string;
  isComposing: boolean;
}> = ({ scenarioId, onChange, themeColor, isComposing }) => {
  const preset = getScenarioPreset(scenarioId);
  return (
    <section className="rounded-2xl border border-[#45A29E]/35 bg-[#1F2833]/72 p-4 shadow-lg backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.28em] text-[#66FCF1]">
          <BookOpen size={14} />
          剧本主题
        </div>
        <div className="text-[10px] text-[#8a8d91]">
          {isComposing ? "开场配置" : "可临时切换"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {SPIRIT_STORY_SCENARIOS.map((entry) => {
          const active = entry.id === scenarioId;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onChange(entry.id)}
              className="rounded-lg border px-2.5 py-2 text-left transition-all"
              style={{
                borderColor: active ? themeColor : "rgba(102,252,241,0.22)",
                background: active ? `${themeColor}18` : "rgba(11,12,16,0.55)",
                color: active ? themeColor : "#C5C6C7",
                boxShadow: active ? `0 0 12px ${themeColor}33` : "none",
              }}
            >
              <div className="text-[11px] font-black tracking-wider">
                {entry.label}
              </div>
              <div className="mt-0.5 truncate text-[9px] text-[#8a8d91]">
                {entry.summary}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 rounded-lg border border-[#45A29E]/25 bg-[#0B0C10]/55 p-2.5 text-[11px] leading-relaxed text-[#C5C6C7]">
        <span style={{ color: themeColor }}>▸</span> {preset.brief}
      </div>
    </section>
  );
};

const ComposingHint: React.FC<{
  scenarioLabel: string;
  scenarioBrief: string;
  themeColor: string;
  ready: boolean;
}> = ({ scenarioLabel, scenarioBrief, themeColor, ready }) => (
  <div className="flex h-full flex-col items-center justify-center text-center opacity-90">
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
      {scenarioLabel} · 开场
    </div>
    <div className="mt-3 max-w-md text-xs leading-relaxed text-[#8a8d91]">
      {scenarioBrief}
    </div>
    <div className="mt-4 max-w-md text-[10px] leading-relaxed text-[#8a8d91]/80">
      在左侧选择 2-{MAX_STORY_PARTICIPANTS} 名词灵，再输入一句开场事件；AI
      会依据剧本自动为每位词灵分配立场，并让剧情自然演化。
      {!ready && (
        <span className="mt-2 block text-[#FFD700]">
          （还需要至少 2 名词灵才能开始）
        </span>
      )}
    </div>
  </div>
);

const StoryBubble: React.FC<{
  message: SpiritStoryMessage;
  allRoster: RosterCharacter[];
  activeRosterIds: Set<string>;
  themeColor: string;
  streaming?: boolean;
}> = ({ message, allRoster, activeRosterIds, themeColor, streaming }) => {
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

  const StreamingCursor = streaming ? (
    <span
      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse"
      style={{ backgroundColor: themeColor }}
    />
  ) : null;

  if (isNarrator || isBackground) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="mx-auto max-w-3xl rounded-lg border border-[#45A29E]/25 bg-[#0B0C10]/55 px-4 py-3 text-center text-sm italic leading-relaxed text-[#C5C6C7] backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
      >
        {isBackground ? (
          <Eye size={13} className="mr-2 inline text-[#FFD700]" />
        ) : (
          <Sparkles size={13} className="mr-2 inline text-[#66FCF1]" />
        )}
        {message.content}
        {StreamingCursor}
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
          className="rounded-lg border px-3 py-2 text-sm leading-relaxed backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
          style={{
            borderColor: isPlayer ? "rgba(255,215,0,0.45)" : `${color}88`,
            background: isPlayer
              ? "rgba(255,215,0,0.14)"
              : "rgba(11,12,16,0.55)",
            color: "#C5C6C7",
          }}
        >
          {message.content}
          {StreamingCursor}
        </div>
        <div
          className={`mt-1 flex items-center gap-2 text-[9px] tracking-widest text-[#8a8d91] ${isPlayer ? "justify-end" : "justify-start"}`}
        >
          {isPlayer ? "YOU" : speakerName}
          {!streaming && <> · {formatTime(message.createdAt)}</>}
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
  disabled?: boolean;
}> = ({ active, icon, label, color, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[10px] font-black tracking-widest transition-all disabled:opacity-40"
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

const StoryAmbientBackdrop: React.FC<{
  participants: RosterCharacter[];
  themeColor: string;
}> = ({ participants, themeColor }) => {
  const withImages = participants.filter((char) => Boolean(char.imageUrl));
  const slots = withImages.length > 0 ? withImages.slice(0, 5) : [];

  return (
    <>
      {slots.length > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 flex"
        >
          {slots.map((char) => (
            <div
              key={char.rosterId}
              className="flex-1"
              style={{
                backgroundImage: `url(${char.imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(60px) saturate(1.35)",
                transform: "scale(1.2)",
                opacity: 0.38,
              }}
            />
          ))}
        </div>
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${themeColor}30, transparent 60%)`,
          }}
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `linear-gradient(135deg, rgba(11,12,16,0.9) 0%, rgba(11,12,16,0.7) 45%, ${themeColor}22 100%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(255,255,255,0.05), transparent 65%)",
        }}
      />
    </>
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
