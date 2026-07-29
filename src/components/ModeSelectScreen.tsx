import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Castle,
  UsersRound,
  Sparkles,
  Plus,
  FlaskConical,
  MessageCircle,
  Clapperboard,
  Send,
  Timer,
  Users,
} from "lucide-react";
import { RARITY_CONFIGS, useGameStore } from "../store/useGameStore";
import {
  isRosterCharacterEvolutionLocked,
  isRosterCharacterRecruitLocked,
  isRosterCharacterUnavailable,
  resetCharacterRuntimeState,
  RECRUIT_STAGE_COUNT,
  useRosterStore,
  type ActiveEvolutionStage,
  type FormHistoryEntry,
  type RosterCharacter,
} from "../store/useRosterStore";
import { useTowerStore } from "../store/useTowerStore";
import { useSpiritChatStore } from "../store/useSpiritChatStore";
import { buildLocalEvolution } from "../utils/towerProgress";
import { BackButton } from "./BackButton";
import { generateEvolutionImage, type AIConfig } from "../utils/ai";
import { cacheImageUrlAsDataUrl } from "../utils/localImage";
import { getScaledTowerBoss } from "../data/towerBosses";
import type { BattleSummary } from "../utils/towerAnalysis";
import { runBackgroundRecruit } from "../utils/recruitPipeline";
import { CharacterAvatar } from "./CharacterAvatar";
import { LOADING_STEPS } from "./loadingSteps";
import { HoverFlipHeroCard } from "./HeroCard";

const RECRUIT_COOLDOWN_MS = 60_000;
const RECRUIT_COOLDOWN_KEY = "word-brawl-recruit-last-generated-at";

const TYPEWRITER_HINTS = [
  "一位穿着机甲、绝招是「星际碰瓷」的退休宇航员…",
  "手持青铜书页的雨夜少年，会把回忆折成利刃…",
  "会讲冷笑话的机械修女，最擅长用祈祷点燃敌人…",
  "在数据海里沉睡的深蓝鲸鱼，一睁眼就能格式化对手…",
  "背着旧唱片机的赛博诗人，音波即是刀锋…",
];

interface PromptPreset {
  label: string;
  emoji: string;
  accent: string;
  prompt: string;
}

const PROMPT_PRESETS: PromptPreset[] = [
  {
    label: "赛博宇航员",
    emoji: "🚀",
    accent: "#66FCF1",
    prompt:
      "一位穿着旧机甲的退休外星宇航员，手里拿着一把生锈的光剑，绝招是「星际碰瓷」，看起来无害但一击致命。",
  },
  {
    label: "青铜书页少年",
    emoji: "📖",
    accent: "#B78BFF",
    prompt:
      "手持青铜书页的雨夜少年，性格沉静，会把过往回忆折成利刃，招式清冷，落幕时会念一句诗。",
  },
  {
    label: "机械修女",
    emoji: "⛪",
    accent: "#FFD700",
    prompt:
      "一位会讲冷笑话的机械修女，身披白袍与齿轮圣像，最擅长用祈祷点燃敌人，语气优雅带着杀意。",
  },
  {
    label: "数据鲸鱼",
    emoji: "🐋",
    accent: "#66FCF1",
    prompt:
      "在数据海里沉睡的深蓝色鲸鱼灵，鳞片流淌着字符流，一睁眼就能格式化对手的思维，招式庞大缓慢却无法闪避。",
  },
  {
    label: "赛博诗人",
    emoji: "🎧",
    accent: "#B78BFF",
    prompt:
      "背着旧唱片机的赛博朋克诗人，戴耳机、穿霓虹雨衣，音波即是刀锋，喜欢边吟诗边释放毁灭旋律。",
  },
  {
    label: "折纸忍者",
    emoji: "🎴",
    accent: "#FF6B9D",
    prompt:
      "身形轻盈的少女折纸忍者，能把纸鹤召成千军万马，绝招是让整片战场化作一张随她意志翻折的白纸。",
  },
  {
    label: "锈蚀骑士",
    emoji: "⚔️",
    accent: "#FFD700",
    prompt:
      "一位从沉船里爬出来的锈蚀骑士，铠甲布满藤壶，沉默寡言，长枪一挥能扯出海水与铁腥味，越战越强。",
  },
  {
    label: "花神少女",
    emoji: "🌸",
    accent: "#FF6B9D",
    prompt:
      "被樱花树祝福的少女剑客，招式如落英，血战时全场会开出粉色花海，越美丽的招越致命。",
  },
];

const isActiveEvolutionStage = (stage: number): stage is ActiveEvolutionStage =>
  stage >= 1 && stage <= 6;

const getLatestFallbackEvolutionForm = (
  char?: RosterCharacter | null,
): (FormHistoryEntry & { stage: ActiveEvolutionStage }) | null => {
  if (!char || !isActiveEvolutionStage(char.evolutionStage)) return null;
  for (let i = char.formHistory.length - 1; i >= 0; i--) {
    const form = char.formHistory[i];
    if (form.stage === char.evolutionStage) {
      return form.imageStatus === "fallback" &&
        isActiveEvolutionStage(form.stage)
        ? (form as FormHistoryEntry & { stage: ActiveEvolutionStage })
        : null;
    }
  }
  return null;
};

const getNextDebugEvolutionStage = (
  char?: RosterCharacter | null,
): ActiveEvolutionStage | null => {
  if (!char || char.evolutionStage >= 6) return null;
  return (char.evolutionStage + 1) as ActiveEvolutionStage;
};

const DEBUG_ACCESS_KEY = "debug";

const isEvolutionDebugAvailable = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    window.location.hostname === "localhost" &&
    params.get(DEBUG_ACCESS_KEY) === "true"
  );
};

export const ModeSelectScreen: React.FC = () => {
  const {
    apiKey,
    baseUrl,
    model,
    apiMode,
    evolutionDebugMode,
    setEvolutionDebugMode,
    setPhase,
    setBattleMode,
    setTowerRosterId,
    setTowerLayer,
    setPlayer1,
    setPlayer2,
    setWinner,
  } = useGameStore();
  const roster = useRosterStore((s) => s.roster);
  const updateCharacter = useRosterStore((s) => s.updateCharacter);
  const createPendingRecruit = useRosterStore((s) => s.createPendingRecruit);
  const setCurrentLayer = useTowerStore((s) => s.setCurrentLayer);
  const setLastSummary = useTowerStore((s) => s.setLastSummary);
  const setLastRosterId = useTowerStore((s) => s.setLastRosterId);
  const setLastResult = useTowerStore((s) => s.setLastResult);
  const setDebugForcedEvolutionStage = useTowerStore(
    (s) => s.setDebugForcedEvolutionStage,
  );
  const setOpenSpiritRosterId = useSpiritChatStore((s) => s.setOpenRosterId);
  const resetTowerPending = useTowerStore((s) => s.resetPending);
  const rosterCount = roster.length;
  const firstNonGeneratingRoster =
    roster.find((char) => char.recruitLock?.status !== "generating") ?? null;
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(
    firstNonGeneratingRoster?.rosterId ?? null,
  );
  const [regeneratingRosterId, setRegeneratingRosterId] = useState<
    string | null
  >(null);
  const [regenerateError, setRegenerateError] = useState("");
  const [previewRosterId, setPreviewRosterId] = useState<string | null>(null);
  const selectedRoster =
    roster.find((char) => char.rosterId === selectedRosterId) ??
    firstNonGeneratingRoster;
  const previewRoster =
    roster.find((char) => char.rosterId === previewRosterId) ?? null;
  const selectedFallbackForm = getLatestFallbackEvolutionForm(selectedRoster);
  const debugNextStage = getNextDebugEvolutionStage(selectedRoster);
  const selectedEvolutionLocked =
    isRosterCharacterEvolutionLocked(selectedRoster);
  const selectedRecruitLocked = isRosterCharacterRecruitLocked(selectedRoster);
  const selectedUnavailable = isRosterCharacterUnavailable(selectedRoster);
  const canRegenerateEvolutionImage =
    Boolean(selectedRoster) &&
    Boolean(selectedFallbackForm || selectedRoster?.evolutionLock);
  const evolutionDebugAvailable = isEvolutionDebugAvailable();
  const activeEvolutionDebugMode =
    evolutionDebugAvailable && evolutionDebugMode;
  const cfg: AIConfig = {
    apiKey,
    baseUrl,
    model,
    apiMode,
  };

  useEffect(() => {
    const selected = roster.find((char) => char.rosterId === selectedRosterId);
    if (!selected || selected.recruitLock?.status === "generating") {
      setSelectedRosterId(firstNonGeneratingRoster?.rosterId ?? null);
    }
  }, [firstNonGeneratingRoster, roster, selectedRosterId]);

  // 召唤词灵：内嵌输入框
  const [summonInput, setSummonInput] = useState("");
  const [summonError, setSummonError] = useState("");
  const [summonCooldownUntil, setSummonCooldownUntil] = useState(() => {
    if (typeof window === "undefined") return 0;
    const lastGeneratedAt = Number(
      window.localStorage.getItem(RECRUIT_COOLDOWN_KEY) || 0,
    );
    return lastGeneratedAt > 0 ? lastGeneratedAt + RECRUIT_COOLDOWN_MS : 0;
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const summonCooldownLeftMs = Math.max(0, summonCooldownUntil - nowMs);
  const summonCooldownSec = Math.ceil(summonCooldownLeftMs / 1000);

  // 打字机 placeholder
  const [placeholderText, setPlaceholderText] = useState("");
  const placeholderRef = useRef({ hint: 0, char: 0, deleting: false });
  useEffect(() => {
    let raf = 0;
    let timer = 0;
    const tick = () => {
      const state = placeholderRef.current;
      const target = TYPEWRITER_HINTS[state.hint];
      if (!state.deleting) {
        state.char = Math.min(state.char + 1, target.length);
        setPlaceholderText(target.slice(0, state.char));
        if (state.char >= target.length) {
          timer = window.setTimeout(() => {
            state.deleting = true;
            raf = window.requestAnimationFrame(tick);
          }, 1400);
          return;
        }
      } else {
        state.char = Math.max(state.char - 1, 0);
        setPlaceholderText(target.slice(0, state.char));
        if (state.char <= 0) {
          state.deleting = false;
          state.hint = (state.hint + 1) % TYPEWRITER_HINTS.length;
        }
      }
      timer = window.setTimeout(
        () => {
          raf = window.requestAnimationFrame(tick);
        },
        state.deleting ? 32 : 68,
      );
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  const submitSummon = () => {
    const trimmed = summonInput.trim();
    if (summonCooldownLeftMs > 0) {
      setSummonError(`召唤冷却中，请 ${summonCooldownSec} 秒后再试。`);
      return;
    }
    if (!trimmed) {
      setSummonError("先给它一句描述再召唤吧。");
      return;
    }
    setSummonError("");
    const pending = createPendingRecruit(trimmed);
    const generatedAt = Date.now();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RECRUIT_COOLDOWN_KEY, String(generatedAt));
    }
    setSummonCooldownUntil(generatedAt + RECRUIT_COOLDOWN_MS);
    setNowMs(generatedAt);
    setSummonInput("");
    runBackgroundRecruit(pending.rosterId, trimmed, cfg);
  };

  useEffect(() => {
    if (!evolutionDebugAvailable && evolutionDebugMode) {
      setEvolutionDebugMode(false);
    }
  }, [evolutionDebugAvailable, evolutionDebugMode, setEvolutionDebugMode]);

  const startRecruit = () => {
    setPhase("RECRUIT_CREATE");
  };

  const startTowerForRoster = (target: RosterCharacter) => {
    if (isRosterCharacterUnavailable(target)) return;
    setSelectedRosterId(target.rosterId);
    setBattleMode("pve_tower");
    setTowerRosterId(target.rosterId);
    setTowerLayer(target.tower.nextLayer ?? 1);
    setPhase("TOWER_HUB");
  };

  const startTower = () => {
    if (!selectedRoster) return;
    startTowerForRoster(selectedRoster);
  };

  const startSpiritChatForRoster = (target: RosterCharacter) => {
    if (isRosterCharacterUnavailable(target)) return;
    setSelectedRosterId(target.rosterId);
    setOpenSpiritRosterId(target.rosterId);
    setPhase("SPIRIT_CHAT");
  };

  const startSpiritChat = () => {
    if (!selectedRoster) return;
    startSpiritChatForRoster(selectedRoster);
  };

  const startSpiritStory = () => {
    if (
      roster.filter((char) => !isRosterCharacterUnavailable(char)).length < 2
    ) {
      return;
    }
    setPhase("SPIRIT_STORY");
  };

  const startSocial = () => {
    setPhase("SOCIAL_LOBBY");
  };

  const goRoster = () => {
    setPhase("ROSTER_VIEW");
  };

  const regenerateEvolutionImage = async () => {
    if (!selectedRoster) return;
    const lockedStage = selectedRoster.evolutionLock?.stage;
    const stage =
      selectedFallbackForm?.stage ??
      (lockedStage && isActiveEvolutionStage(lockedStage) ? lockedStage : null);
    if (!stage) return;
    setRegenerateError("");
    setRegeneratingRosterId(selectedRoster.rosterId);
    const localEvo = buildLocalEvolution(selectedRoster, stage);
    const prompt =
      selectedFallbackForm?.imagePrompt ||
      localEvo.imagePrompt ||
      selectedRoster.imagePrompt;

    try {
      const remote = await generateEvolutionImage(prompt, {
        seedSalt: `${selectedRoster.rosterId}:${stage}:manual:${Date.now()}`,
        cfg,
      });
      if (!remote) throw new Error("进化图生成失败，请稍后重试。");
      const imageUrl =
        (await cacheImageUrlAsDataUrl(remote, { maxSize: 384 })) || remote;

      updateCharacter(selectedRoster.rosterId, (current) => {
        const targetIndex = current.formHistory
          .map((form, index) => ({ form, index }))
          .reverse()
          .find(
            ({ form }) =>
              form.stage === stage && form.imageStatus === "fallback",
          )?.index;
        const formHistory =
          typeof targetIndex === "number"
            ? current.formHistory.map((form, index) =>
                index === targetIndex
                  ? {
                      ...form,
                      imageUrl,
                      imagePrompt: prompt,
                      imageStatus: "ready" as const,
                      createdAt: Date.now(),
                    }
                  : form,
              )
            : [
                ...current.formHistory,
                {
                  stage,
                  imageUrl,
                  imagePrompt: prompt,
                  lore: localEvo.lore,
                  imageStatus: "ready" as const,
                  createdAt: Date.now(),
                },
              ];
        return {
          ...current,
          imageUrl,
          imagePrompt: prompt || current.imagePrompt,
          evolutionLock: undefined,
          pendingEvolutionReplay: {
            stage,
            oldImageUrl: current.imageUrl,
            newImageUrl: imageUrl,
            imagePrompt: prompt,
            lore: localEvo.lore,
            newUltimate: localEvo.newUltimate,
            createdAt: Date.now(),
          },
          formHistory,
        };
      });
    } catch (err) {
      setRegenerateError(
        err instanceof Error ? err.message : "进化图生成失败，请稍后重试。",
      );
    } finally {
      setRegeneratingRosterId(null);
    }
  };

  const startDebugEvolutionAnimation = () => {
    if (
      !activeEvolutionDebugMode ||
      !selectedRoster ||
      !debugNextStage ||
      selectedEvolutionLocked
    ) {
      return;
    }
    setRegenerateError("");
    const layer = Math.max(1, selectedRoster.tower.nextLayer || 1);
    const boss = getScaledTowerBoss(layer, selectedRoster);
    if (!boss) {
      setRegenerateError("无法创建测试 Boss，请先换一个角色或层数。");
      return;
    }
    const summary: BattleSummary = {
      turns: 3,
      damageDealt: Math.max(120, selectedRoster.attack * 8),
      damageTaken: Math.max(1, Math.floor(selectedRoster.maxHp * 0.12)),
      criticalCount: 1,
      ultimateCount: 1,
      mostUsedSkill: selectedRoster.skills[0]?.name,
      lowestHpPercent: 0.72,
      longestStreak: 1,
      rawHighlights: [
        `${selectedRoster.name} 在 Debug 测试中完成压制，触发进化演出。`,
      ],
    };

    resetTowerPending();
    setBattleMode("pve_tower");
    setTowerRosterId(selectedRoster.rosterId);
    setTowerLayer(layer);
    setCurrentLayer(layer);
    setPlayer1(resetCharacterRuntimeState(selectedRoster));
    setPlayer2(resetCharacterRuntimeState(boss));
    setLastSummary(summary);
    setLastRosterId(selectedRoster.rosterId);
    setLastResult("win");
    setDebugForcedEvolutionStage(debugNextStage);
    useGameStore.setState({
      battleLogs: [
        {
          id: `debug-evolution-${Date.now()}`,
          turn: 3,
          attacker: "system",
          message: `${selectedRoster.name} Debug 进化演出测试`,
        },
      ],
      currentTurn: 3,
    });
    setWinner("player1");
  };

  return (
    <CommandDeckLayout
      roster={roster}
      rosterCount={rosterCount}
      selectedRoster={selectedRoster}
      selectedUnavailable={selectedUnavailable}
      selectedEvolutionLocked={selectedEvolutionLocked}
      selectedRecruitLocked={selectedRecruitLocked}
      canRegenerateEvolutionImage={canRegenerateEvolutionImage}
      regeneratingRosterId={regeneratingRosterId}
      regenerateError={regenerateError}
      evolutionDebugAvailable={evolutionDebugAvailable}
      evolutionDebugMode={evolutionDebugMode}
      activeEvolutionDebugMode={activeEvolutionDebugMode}
      debugNextStage={debugNextStage}
      summonInput={summonInput}
      summonError={summonError}
      summonCooldownLeftMs={summonCooldownLeftMs}
      summonCooldownSec={summonCooldownSec}
      placeholderText={placeholderText}
      onBack={() => setPhase("WELCOME")}
      onSelectRoster={setSelectedRosterId}
      previewRoster={previewRoster}
      onPreviewRoster={setPreviewRosterId}
      onClosePreview={() => setPreviewRosterId(null)}
      onStartRecruit={startRecruit}
      onStartSocial={startSocial}
      onGoRoster={goRoster}
      onStartSpiritChat={startSpiritChat}
      onStartSpiritStory={startSpiritStory}
      onStartTower={startTower}
      onStartSpiritChatForRoster={startSpiritChatForRoster}
      onStartTowerForRoster={startTowerForRoster}
      onRegenerateEvolutionImage={regenerateEvolutionImage}
      onSetEvolutionDebugMode={setEvolutionDebugMode}
      onStartDebugEvolutionAnimation={startDebugEvolutionAnimation}
      onSummonInputChange={(value) => {
        setSummonInput(value);
        if (summonError) setSummonError("");
      }}
      onSubmitSummon={submitSummon}
    />
  );
};

const IconButton: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent: string;
}> = ({ onClick, icon, label, accent }) => (
  <motion.button
    type="button"
    onClick={onClick}
    whileHover={{ y: -1 }}
    whileTap={{ scale: 0.97 }}
    aria-label={label}
    title={label}
    className="group flex items-center gap-2 border border-white/10 hover:border-current bg-black/30 backdrop-blur-sm px-3 py-2 text-[10px] font-mono font-bold tracking-[0.3em] transition-all"
    style={{ color: accent }}
  >
    <span
      className="w-1 h-1 rounded-full"
      style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
    />
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </motion.button>
);

interface CommandDeckLayoutProps {
  roster: RosterCharacter[];
  rosterCount: number;
  selectedRoster: RosterCharacter | null;
  selectedUnavailable: boolean;
  selectedEvolutionLocked: boolean;
  selectedRecruitLocked: boolean;
  canRegenerateEvolutionImage: boolean;
  regeneratingRosterId: string | null;
  regenerateError: string;
  evolutionDebugAvailable: boolean;
  evolutionDebugMode: boolean;
  activeEvolutionDebugMode: boolean;
  debugNextStage: ActiveEvolutionStage | null;
  summonInput: string;
  summonError: string;
  summonCooldownLeftMs: number;
  summonCooldownSec: number;
  placeholderText: string;
  onBack: () => void;
  onSelectRoster: (rosterId: string | null) => void;
  previewRoster: RosterCharacter | null;
  onPreviewRoster: (rosterId: string | null) => void;
  onClosePreview: () => void;
  onStartRecruit: () => void;
  onStartSocial: () => void;
  onGoRoster: () => void;
  onStartSpiritChat: () => void;
  onStartSpiritStory: () => void;
  onStartTower: () => void;
  onStartSpiritChatForRoster: (target: RosterCharacter) => void;
  onStartTowerForRoster: (target: RosterCharacter) => void;
  onRegenerateEvolutionImage: () => void;
  onSetEvolutionDebugMode: (enabled: boolean) => void;
  onStartDebugEvolutionAnimation: () => void;
  onSummonInputChange: (value: string) => void;
  onSubmitSummon: () => void;
}

const CommandDeckLayout: React.FC<CommandDeckLayoutProps> = ({
  roster,
  rosterCount,
  selectedRoster,
  selectedUnavailable,
  evolutionDebugAvailable,
  evolutionDebugMode,
  summonInput,
  summonError,
  summonCooldownLeftMs,
  summonCooldownSec,
  placeholderText,
  onBack,
  onSelectRoster,
  previewRoster,
  onPreviewRoster,
  onClosePreview,
  onStartRecruit,
  onStartSocial,
  onGoRoster,
  onStartSpiritChat,
  onStartSpiritStory,
  onStartTower,
  onStartSpiritChatForRoster,
  onStartTowerForRoster,
  onSetEvolutionDebugMode,
  onSummonInputChange,
  onSubmitSummon,
}) => {
  const selectedRarity = selectedRoster?.rarity ?? "SSR";
  const selectedRarityConfig = RARITY_CONFIGS[selectedRarity];
  const summonTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSummonMultiline, setIsSummonMultiline] = useState(false);
  const availableRosterCount = roster.filter(
    (char) => !isRosterCharacterUnavailable(char),
  ).length;
  const selectedTowerLayer = selectedRoster?.tower.nextLayer ?? 1;

  useEffect(() => {
    const textarea = summonTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const contentHeight = textarea.scrollHeight;
    const multiline = contentHeight > 40;
    if (multiline !== isSummonMultiline) {
      setIsSummonMultiline(multiline);
    }
    textarea.style.height = `${multiline ? 52 : 40}px`;
  }, [isSummonMultiline, summonInput]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06080d] text-[#e8edf1]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(rgba(117,255,245,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(117,255,245,.035) 1px, transparent 1px), radial-gradient(circle at 72% 12%, rgba(183,154,255,.12), transparent 24%), radial-gradient(circle at 12% 96%, rgba(255,216,77,.08), transparent 30%)",
          backgroundSize: "64px 64px, 64px 64px, auto, auto",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[24%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{ background: selectedRarityConfig.primaryColor }}
      />

      <BackButton
        onClick={onBack}
        label="返回欢迎页"
        color="#75fff5"
        className="fixed left-6 top-5 z-30"
      />
      <div className="fixed left-[5.5rem] top-8 z-20 hidden items-center gap-3 font-mono text-[10px] tracking-[0.4em] text-white/40 md:flex">
        <div className="h-[1px] w-6 bg-[#75fff5]" />
        <span>WORD-SPIRIT / 002</span>
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-[1540px] flex-col px-5 py-5 sm:px-8 lg:px-10 xl:px-6">
        <header className="flex h-14 items-center justify-between">
          <div />
          <IconButton
            onClick={onGoRoster}
            icon={<UsersRound size={14} />}
            label={`我的词灵 · ${rosterCount}`}
            accent="#75fff5"
          />
        </header>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
          className="mt-6"
        >
          <div className="pt-1">
            <div className="font-mono text-[10px] tracking-[0.22em] text-[#ffd84d]">
              ━━ CHAPTER · 01
            </div>
            <h1
              className="mt-1 font-display text-[clamp(2.85rem,4.6vw,4.35rem)] font-black leading-[0.88] tracking-[-0.075em]"
              style={{ textShadow: "0 0 28px rgba(255,216,77,.22)" }}
            >
              词灵<span className="text-[#ffd84d]">枢庭</span>
            </h1>
            <div className="mt-2 font-mono text-[9px] font-bold tracking-[0.28em] text-white/30 sm:tracking-[0.44em]">
              SUMMON · CHAT · STORY · ASCEND
            </div>
          </div>
        </motion.section>

        <section className="mt-7 grid gap-6 xl:h-[580px] xl:grid-cols-[280px_minmax(0,1fr)_380px]">
          <aside className="order-2 flex max-h-[440px] min-h-[340px] flex-col border border-[#75fff5]/25 bg-[#0c1018]/80 p-5 shadow-[inset_0_1px_rgba(255,255,255,.025),0_20px_80px_rgba(0,0,0,.18)] backdrop-blur-sm xl:order-1 xl:h-full xl:min-h-0 xl:max-h-none">
            <DeckHeading
              title="ROSTER · LIVE"
              meta={`${String(rosterCount).padStart(2, "0")} 位`}
              accent="#75fff5"
            />
            {roster.length > 0 ? (
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:rgba(117,255,245,.45)_transparent] [scrollbar-width:thin]">
                {roster.map((char) => {
                  const rarity = RARITY_CONFIGS[char.rarity ?? "N"];
                  const rarityTier =
                    rarity.id === "UR"
                      ? 4
                      : rarity.id === "SSR"
                        ? 3
                        : rarity.id === "SR"
                          ? 2
                          : rarity.id === "R"
                            ? 1
                            : 0;
                  const raritySurface =
                    rarityTier >= 3
                      ? `linear-gradient(90deg, rgba(${rarity.rgb}, .07), transparent 48%)`
                      : rarityTier === 2
                        ? `linear-gradient(90deg, rgba(${rarity.rgb}, .05), transparent 45%)`
                        : rarityTier === 1
                          ? `linear-gradient(90deg, rgba(${rarity.rgb}, .035), transparent 40%)`
                          : "transparent";
                  const active = char.rosterId === selectedRoster?.rosterId;
                  const unavailable = isRosterCharacterUnavailable(char);
                  const status =
                    char.recruitLock?.status === "failed"
                      ? "创造失败"
                      : char.recruitLock
                        ? "创造中"
                        : char.evolutionLock
                          ? "进化中"
                          : active
                            ? "已选中"
                            : `Lv. ${char.level}`;
                  const isGenerating =
                    char.recruitLock?.status === "generating";
                  const recruitStage = Math.min(
                    RECRUIT_STAGE_COUNT - 1,
                    Math.max(0, char.recruitLock?.stage ?? 0),
                  );
                  const recruitPercent =
                    recruitStage === RECRUIT_STAGE_COUNT - 1
                      ? 92
                      : Math.round(
                          12 +
                            ((recruitStage + 1) / (RECRUIT_STAGE_COUNT - 1)) *
                              64,
                        );
                  const recruitStep =
                    LOADING_STEPS[recruitStage]?.text ?? "解析灵魂语料";
                  const RecruitStageIcon =
                    LOADING_STEPS[recruitStage]?.icon ?? Sparkles;
                  return (
                    <div
                      key={char.rosterId}
                      className="group/roster relative border-b border-l border-white/[.075] transition-colors hover:bg-white/[.025]"
                      style={{
                        borderLeftColor: `${rarity.primaryColor}${active ? "ee" : "88"}`,
                        borderLeftWidth: 1,
                        boxShadow: active
                          ? `inset 5px 0 14px ${rarity.primaryColor}14`
                          : rarityTier >= 3
                            ? `inset 4px 0 10px ${rarity.primaryColor}0d`
                            : rarityTier === 2
                              ? `inset 3px 0 8px ${rarity.primaryColor}09`
                              : rarityTier === 1
                                ? `inset 2px 0 6px ${rarity.primaryColor}08`
                                : "none",
                        background: raritySurface,
                      }}
                    >
                      <div className="flex w-full items-center gap-3 px-1 py-3">
                        <button
                          type="button"
                          disabled={Boolean(char.recruitLock)}
                          onClick={() => onPreviewRoster(char.rosterId)}
                          className="h-11 w-11 shrink-0 overflow-hidden rounded-full border transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                          style={{
                            borderColor: isGenerating
                              ? "#ffd84dcc"
                              : `${rarity.primaryColor}${active ? "ee" : "99"}`,
                            borderWidth: isGenerating
                              ? 2
                              : rarityTier >= 3
                                ? 2
                                : 1,
                            boxShadow: isGenerating
                              ? "0 0 16px rgba(255,216,77,.42), inset 0 0 12px rgba(255,216,77,.12)"
                              : active
                                ? `0 0 12px ${rarity.primaryColor}77`
                                : `0 0 6px ${rarity.primaryColor}33`,
                          }}
                          aria-label={`预览 ${char.name} 的英雄卡`}
                          title="预览英雄卡"
                        >
                          {isGenerating ? (
                            <span className="flex h-full w-full items-center justify-center bg-[#14130d]">
                              <RecruitStageIcon
                                size={20}
                                className="animate-pulse text-[#ffd84d]"
                                strokeWidth={1.7}
                              />
                            </span>
                          ) : (
                            <CharacterAvatar
                              imageUrl={char.imageUrl}
                              name={char.name}
                              themeColor={rarity.primaryColor}
                              iconSize={18}
                              className="h-full w-full"
                            />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectRoster(char.rosterId)}
                          className="min-w-0 flex-1 text-left"
                          style={{
                            color: active
                              ? rarity.primaryColor
                              : "rgba(232,237,241,.92)",
                          }}
                        >
                          <span className="block truncate text-[15px] font-bold leading-tight">
                            {char.name}
                          </span>
                          {isGenerating ? (
                            <span className="mt-1.5 block">
                              <span className="mb-1 flex items-center justify-between font-mono text-[9px] tracking-[0.05em] text-[#ffd84d]">
                                <span className="truncate">{recruitStep}</span>
                                <span>{recruitPercent}%</span>
                              </span>
                              <span className="block h-1 overflow-hidden rounded-full bg-[#ffd84d]/15">
                                <span
                                  className="block h-full rounded-full bg-gradient-to-r from-[#ffd84d]/50 to-[#ffd84d] shadow-[0_0_8px_#ffd84d]"
                                  style={{ width: `${recruitPercent}%` }}
                                />
                              </span>
                            </span>
                          ) : (
                            <span className="mt-1 block truncate font-mono text-[10px] tracking-[0.08em] text-white/40">
                              {unavailable ? (
                                status
                              ) : (
                                <>
                                  <span
                                    className="mr-1 inline-flex min-w-5 items-center justify-center border px-1 py-px text-[8px] font-bold leading-none"
                                    style={{
                                      borderColor: `${rarity.primaryColor}aa`,
                                      borderWidth: 1,
                                      color:
                                        rarityTier >= 3
                                          ? "#0a0b12"
                                          : rarity.primaryColor,
                                      background:
                                        rarityTier >= 3
                                          ? rarity.borderGradient
                                          : `rgba(${rarity.rgb}, .10)`,
                                      boxShadow:
                                        rarityTier >= 2
                                          ? `0 0 4px rgba(${rarity.rgb}, .25)`
                                          : "none",
                                    }}
                                  >
                                    {rarity.id}
                                  </span>
                                  {status}
                                </>
                              )}
                            </span>
                          )}
                        </button>
                        <div className="flex h-11 w-[50px] shrink-0 flex-col border-l border-white/[.08]">
                          <RosterQuickAction
                            label="聊天"
                            icon={<MessageCircle size={10} />}
                            accent="#75fff5"
                            disabled={unavailable}
                            onClick={() => onStartSpiritChatForRoster(char)}
                          />
                          <RosterQuickAction
                            label="对战"
                            icon={<Castle size={10} />}
                            accent="#ffd84d"
                            disabled={unavailable}
                            onClick={() => onStartTowerForRoster(char)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <button
                type="button"
                onClick={onStartRecruit}
                className="mt-4 flex min-h-40 w-full flex-col items-center justify-center gap-2 border border-dashed border-[#75fff5]/35 text-[#75fff5] transition-colors hover:bg-[#75fff5]/10"
              >
                <Plus size={22} />
                <span className="font-mono text-[10px] tracking-[0.16em]">
                  创造第一位词灵
                </span>
              </button>
            )}
            {evolutionDebugAvailable && (
              <button
                type="button"
                onClick={() => onSetEvolutionDebugMode(!evolutionDebugMode)}
                className="mt-2 flex w-full items-center justify-between border border-white/10 px-2 py-1.5 font-mono text-[9px] tracking-[0.12em] transition-colors"
                style={{
                  color: evolutionDebugMode
                    ? "#ff719e"
                    : "rgba(255,255,255,.38)",
                  borderColor: evolutionDebugMode
                    ? "rgba(255,113,158,.55)"
                    : "rgba(255,255,255,.1)",
                }}
              >
                <span className="flex items-center gap-1.5">
                  <FlaskConical size={11} />
                  DEBUG
                </span>
                <span>{evolutionDebugMode ? "ON" : "OFF"}</span>
              </button>
            )}
          </aside>

          <section className="order-1 relative min-h-[500px] overflow-hidden border border-[#75fff5]/25 bg-[#0c1018]/80 p-6 shadow-[inset_0_1px_rgba(255,255,255,.025),0_20px_80px_rgba(0,0,0,.18)] backdrop-blur-sm sm:p-7 xl:order-2 xl:h-full xl:min-h-0">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-28 opacity-70"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,216,77,.13), transparent 42%)",
              }}
            />
            <div className="relative flex h-full flex-col">
              <div className="font-mono text-[11px] font-bold tracking-[0.22em] text-[#ffd84d]">
                N°01 · SUMMON / PRIMARY ACTION
              </div>
              <h2 className="mt-6 max-w-2xl font-display text-[2.15rem] font-black leading-tight tracking-[-0.05em] sm:text-[2.65rem]">
                用一句话，为这个世界唤来新的灵魂。
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/45">
                描述外形、性格、能力或一个荒诞念头。它会成为可对话、可共叙、可进化的独立词灵。
              </p>

              {summonCooldownLeftMs > 0 ? (
                <div className="mt-8 flex items-center gap-3 border border-[#ffd84d]/35 bg-black/30 px-4 py-4">
                  <Timer
                    size={15}
                    className="shrink-0 animate-pulse text-[#ffd84d]"
                  />
                  <span className="flex-1 font-mono text-xs tracking-[0.12em] text-[#ffd84d]">
                    召唤冷却中
                  </span>
                  <span className="font-mono text-lg font-black text-[#ffd84d]">
                    {summonCooldownSec}
                    <small className="ml-0.5 text-[9px] tracking-widest">
                      s
                    </small>
                  </span>
                </div>
              ) : (
                <label className="mt-8 flex items-center gap-3 border border-[#ffd84d]/45 bg-black/35 px-4 py-2.5 transition-colors focus-within:border-[#ffd84d]">
                  <Sparkles size={18} className="shrink-0 text-[#ffd84d]" />
                  <div className="relative min-w-0 flex-1">
                    <textarea
                      ref={summonTextareaRef}
                      rows={1}
                      value={summonInput}
                      onChange={(event) =>
                        onSummonInputChange(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          onSubmitSummon();
                        }
                      }}
                      placeholder=" "
                      className={`peer block w-full resize-none overflow-y-auto bg-transparent font-mono text-[13px] text-[#ecf0d9] outline-none placeholder:text-transparent [scrollbar-width:none] ${
                        isSummonMultiline ? "py-1 leading-5" : "py-0 leading-10"
                      }`}
                    />
                    {!summonInput && (
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pr-2 font-mono text-[13px] leading-5 text-[#7a7152]">
                        {placeholderText}
                        <span className="ml-1 h-4 w-px animate-pulse bg-[#ffd84d]" />
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onSubmitSummon}
                    disabled={!summonInput.trim()}
                    className="group flex h-10 shrink-0 items-center gap-1.5 border border-[#ffd84d] bg-[#ffd84d] px-4 font-mono text-[11px] font-black tracking-[0.16em] text-[#17140b] transition-colors hover:bg-[#fff0a4] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    召唤
                    <Send
                      size={11}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </button>
                </label>
              )}

              {summonError && (
                <div className="mt-2 font-mono text-[10px] text-[#ff719e]">
                  {summonError}
                </div>
              )}
              <div className="mt-3 flex h-9 items-center gap-2 overflow-x-auto [scrollbar-width:none]">
                <span className="shrink-0 font-mono text-[10px] tracking-[0.18em] text-white/30">
                  灵感 ▸
                </span>
                {PROMPT_PRESETS.slice(0, 5).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={summonCooldownLeftMs > 0}
                    onClick={() => onSummonInputChange(preset.prompt)}
                    title={preset.prompt}
                    className="h-7 shrink-0 border px-2.5 font-mono text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      borderColor: `${preset.accent}55`,
                      color: `${preset.accent}dd`,
                      background: `${preset.accent}0e`,
                    }}
                  >
                    {preset.emoji} {preset.label}
                  </button>
                ))}
              </div>

              <div className="mt-5">
                <div className="flex items-center gap-2">
                  <span className="h-px w-8 bg-white/[.14]" />
                  <span className="font-mono text-[9px] tracking-[0.22em] text-white/30">
                    SECONDARY ROUTES
                  </span>
                  <span className="h-px flex-1 bg-white/[.08]" />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <DeckRouteButton
                    onClick={onStartSpiritChat}
                    disabled={!selectedRoster || selectedUnavailable}
                    icon={<MessageCircle size={22} />}
                    title="灵契会客室"
                    detail="和已选词灵一对一对话"
                    accent="#75fff5"
                  />
                  <DeckRouteButton
                    onClick={onStartSpiritStory}
                    disabled={availableRosterCount < 2}
                    icon={<Clapperboard size={22} />}
                    title="群像共叙"
                    detail="召集多人，让故事生长"
                    accent="#b79aff"
                  />
                  <DeckRouteButton
                    onClick={onStartTower}
                    disabled={!selectedRoster || selectedUnavailable}
                    icon={<Castle size={22} />}
                    title="九层塔"
                    detail={
                      selectedRoster
                        ? `${selectedRoster.name} · 第${selectedTowerLayer}层`
                        : "选择一位词灵出战"
                    }
                    accent="#ff719e"
                  />
                  <DeckRouteButton
                    onClick={onStartSocial}
                    disabled={false}
                    icon={<Users size={22} />}
                    title="社交与朋友"
                    detail="进入房间群聊，或向朋友发起约战"
                    accent="#b79aff"
                  />
                </div>
              </div>
            </div>
          </section>

          <aside className="order-3 relative flex min-h-[460px] items-center justify-center border border-[#75fff5]/25 bg-[#0c1018]/80 p-5 shadow-[inset_0_1px_rgba(255,255,255,.025),0_20px_80px_rgba(0,0,0,.18)] backdrop-blur-sm xl:h-full xl:min-h-0">
            <span className="absolute -top-px left-4 -translate-y-1/2 bg-[#0c1018] px-2 font-mono text-[10px] font-bold tracking-[0.2em] text-[#75fff5]">
              COMMAND DECK
            </span>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-10 top-0 h-24 opacity-70"
              style={{
                background:
                  "radial-gradient(ellipse at top, rgba(117,255,245,.11), transparent 68%)",
              }}
            />
            {selectedRoster ? (
              <HoverFlipHeroCard
                character={selectedRoster}
                size="xl"
                showStats
                showQuote={false}
                showSkill={false}
                selected
                backLabel="COURTYARD GUIDE"
                className="relative !w-full max-w-[320px]"
              />
            ) : (
              <button
                type="button"
                onClick={onStartRecruit}
                className="relative flex aspect-[3/4] w-full max-w-[276px] flex-col items-center justify-center gap-3 rounded-2xl border bg-[#0c1018]/80 font-mono text-[10px] tracking-[0.16em] transition-colors hover:bg-[#75fff5]/10"
                style={{
                  borderColor: `${selectedRarityConfig.primaryColor}66`,
                  color: selectedRarityConfig.primaryColor,
                }}
              >
                <Sparkles size={28} />
                召唤第一位词灵
              </button>
            )}
          </aside>
        </section>

        <footer className="mt-auto flex items-center justify-between border-t border-white/[.06] py-5 font-mono text-[9px] tracking-[0.16em] text-white/25">
          <span>
            01 · CONFIG <span className="mx-2 text-[#ffd84d]">02 · HUB</span> 03
            · ASCEND
          </span>
          <span className="hidden sm:inline">召唤 · 陪伴 · 共叙 · 进化</span>
        </footer>
      </main>
      <AnimatePresence>
        {previewRoster && (
          <HeroCardPreviewModal
            character={previewRoster}
            onClose={onClosePreview}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const HeroCardPreviewModal: React.FC<{
  character: RosterCharacter;
  onClose: () => void;
}> = ({ character, onClose }) => {
  const rarity = RARITY_CONFIGS[character.rarity ?? "R"];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative flex max-h-full flex-col items-center"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="mb-3 font-mono text-[10px] font-bold tracking-[0.22em]"
          style={{ color: rarity.primaryColor }}
        >
          SPIRIT CARD · {rarity.labelEn}
        </div>
        <HoverFlipHeroCard
          character={character}
          size="lg"
          showStats
          showQuote={false}
          backLabel="SPIRIT ARCHIVE"
        />
        <div className="mt-3 font-mono text-[9px] tracking-[0.16em] text-white/35">
          点击空白处关闭预览
        </div>
      </motion.div>
    </motion.div>
  );
};

const DeckHeading: React.FC<{
  title: string;
  meta: string;
  accent: string;
}> = ({ title, meta, accent }) => (
  <div className="flex items-center justify-between border-b border-white/[.07] pb-3 font-mono text-[11px] font-bold tracking-[0.16em]">
    <span style={{ color: accent }}>{title}</span>
    <span className="text-[10px] text-white/35">{meta}</span>
  </div>
);

const RosterQuickAction: React.FC<{
  label: string;
  icon: React.ReactNode;
  accent: string;
  disabled?: boolean;
  onClick: () => void;
}> = ({ label, icon, accent, disabled = false, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="flex min-h-0 w-full flex-1 items-center justify-center gap-1 border-b border-white/[.06] px-1 font-mono text-[8px] font-bold tracking-[0.06em] transition-colors last:border-b-0 hover:bg-white/[.04] disabled:cursor-not-allowed disabled:opacity-35"
    style={{
      color: accent,
    }}
  >
    {icon}
    {label}
  </button>
);

const DeckRouteButton: React.FC<{
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  accent: string;
}> = ({ onClick, disabled, icon, title, detail, accent }) => (
  <motion.button
    type="button"
    onClick={onClick}
    disabled={disabled}
    whileHover={disabled ? {} : { y: -2 }}
    whileTap={disabled ? {} : { scale: 0.99 }}
    className="group relative min-h-[128px] overflow-hidden border border-white/10 bg-black/25 p-4 text-left transition-colors hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-35"
  >
    <span
      aria-hidden
      className="absolute inset-y-0 left-0 w-px opacity-60"
      style={{ background: accent }}
    />
    <span className="flex items-center justify-between">
      <span
        className="font-mono text-[10px] tracking-[0.14em]"
        style={{ color: accent }}
      >
        ACTION
      </span>
      <span style={{ color: accent }}>{icon}</span>
    </span>
    <span className="mt-3 block text-base font-bold" style={{ color: accent }}>
      {title}
    </span>
    <span className="mt-1 block text-[10px] leading-4 text-white/40">
      {detail}
    </span>
  </motion.button>
);
