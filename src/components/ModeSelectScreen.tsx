import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Castle,
  UsersRound,
  Sparkles,
  Plus,
  RotateCcw,
  FlaskConical,
  Lock,
  MessageCircle,
  Clapperboard,
  ChevronRight,
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
  useRosterStore,
  type ActiveEvolutionStage,
  type FormHistoryEntry,
  type RosterCharacter,
} from "../store/useRosterStore";
import { useTowerStore } from "../store/useTowerStore";
import { useSpiritChatStore } from "../store/useSpiritChatStore";
import {
  buildLocalEvolution,
  evolutionLabel,
  getNextEvolutionProgress,
  levelAscensionLabel,
  xpProgress,
} from "../utils/towerProgress";
import { BackButton } from "./BackButton";
import { generateEvolutionImage, type AIConfig } from "../utils/ai";
import { cacheImageUrlAsDataUrl } from "../utils/localImage";
import { getScaledTowerBoss } from "../data/towerBosses";
import type { BattleSummary } from "../utils/towerAnalysis";
import { runBackgroundRecruit } from "../utils/recruitPipeline";
import { SpiritCard } from "./SpiritCard";
import { HeroCard } from "./HeroCard";

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
      "被樱花树祝福的美丽动人少女剑客，容貌精致、气质优雅灵动，招式如落英，血战时全场会开出粉色花海，越美丽的招越致命。",
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

const HeroCardPreviewModal: React.FC<{
  character: RosterCharacter;
  onClose: () => void;
}> = ({ character, onClose }) => {
  const [flipped, setFlipped] = useState(false);
  const rarityConfig = RARITY_CONFIGS[character.rarity ?? "R"];
  const signatureSkill =
    character.skills.find(
      (skill) => skill.isUltimate || skill.type === "ultimate",
    )?.name ??
    character.skills[0]?.name ??
    character.name;
  const battleCry =
    character.spiritProfile?.battleCry?.trim() === "此刻，词意成真。"
      ? ""
      : character.spiritProfile?.battleCry?.trim();
  const slogan =
    character.spiritProfile?.slogan?.trim() ||
    battleCry ||
    character.spiritProfile?.catchphrases?.[0]?.trim() ||
    `${character.name}，以${signatureSkill}为誓。`;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${character.name} 英雄卡`}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="my-auto flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.92, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="relative w-72 cursor-pointer select-none"
          style={{ perspective: 1600 }}
          onMouseEnter={() => setFlipped(true)}
          onMouseLeave={() => setFlipped(false)}
          onClick={() => setFlipped((current) => !current)}
        >
          <motion.div
            className="relative w-full"
            style={{ transformStyle: "preserve-3d", willChange: "transform" }}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div style={{ backfaceVisibility: "hidden" }}>
              <HeroCard
                character={character}
                size="lg"
                showStats
                showQuote={false}
                ultraHoverEffect
              />
            </div>
            <div
              className="absolute inset-0 overflow-hidden rounded-2xl border"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                background: "linear-gradient(145deg, #151725 0%, #0a0b12 100%)",
                borderColor: `${rarityConfig.primaryColor}88`,
                boxShadow: `0 0 36px ${rarityConfig.glowColor}, inset 0 0 28px rgba(${rarityConfig.rgb}, 0.16)`,
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                  background: `radial-gradient(circle at 18% 18%, rgba(${rarityConfig.rgb}, 0.2), transparent 30%), linear-gradient(135deg, transparent 49.8%, rgba(${rarityConfig.rgb}, 0.12) 50%, transparent 50.2%)`,
                }}
              />
              <div
                className="pointer-events-none absolute inset-3 rounded-xl border border-dashed"
                style={{
                  borderColor: `rgba(${rarityConfig.rgb}, 0.28)`,
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
                    textShadow: `0 0 20px rgba(${rarityConfig.rgb}, 0.35)`,
                  }}
                >
                  <span style={{ color: rarityConfig.primaryColor }}>“</span>
                  {slogan}
                  <span style={{ color: rarityConfig.primaryColor }}>”</span>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
        <div className="mt-4 text-[10px] font-mono tracking-[0.24em] text-white/40">
          悬停翻面 · 点击空白关闭
        </div>
      </motion.div>
    </motion.div>
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
  const retryPendingRecruit = useRosterStore((s) => s.retryPendingRecruit);
  const removeCharacter = useRosterStore((s) => s.removeCharacter);
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
  const rosterPreview = roster.slice(0, 24);
  const hiddenRosterCount = Math.max(0, rosterCount - rosterPreview.length);
  const [previewRosterId, setPreviewRosterId] = useState<string | null>(null);
  const [regeneratingRosterId, setRegeneratingRosterId] = useState<
    string | null
  >(null);
  const [regenerateError, setRegenerateError] = useState("");
  const previewRoster = previewRosterId
    ? (roster.find((char) => char.rosterId === previewRosterId) ?? null)
    : null;
  const selectedRoster = firstNonGeneratingRoster;
  const selectedFallbackForm = getLatestFallbackEvolutionForm(selectedRoster);
  const debugNextStage = getNextDebugEvolutionStage(selectedRoster);
  const selectedEvolutionLocked =
    isRosterCharacterEvolutionLocked(selectedRoster);
  const selectedRecruitLocked = isRosterCharacterRecruitLocked(selectedRoster);
  const selectedUnavailable = isRosterCharacterUnavailable(selectedRoster);
  const selectedEvolutionStage =
    selectedFallbackForm?.stage ??
    (selectedRoster && isActiveEvolutionStage(selectedRoster.evolutionStage)
      ? selectedRoster.evolutionStage
      : null) ??
    (selectedRoster?.evolutionLock &&
    isActiveEvolutionStage(selectedRoster.evolutionLock.stage)
      ? selectedRoster.evolutionLock.stage
      : null);
  const canRegenerateEvolutionImage =
    Boolean(selectedRoster) && Boolean(selectedEvolutionStage);
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
    if (
      previewRosterId &&
      !roster.some((char) => char.rosterId === previewRosterId)
    ) {
      setPreviewRosterId(null);
    }
  }, [previewRosterId, roster]);

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

  const retryRecruit = (target: RosterCharacter) => {
    const description =
      target.recruitLock?.description || target.sourceDescription || "";
    if (!description) return;
    const revived = retryPendingRecruit(target.rosterId);
    if (!revived) return;
    runBackgroundRecruit(revived.rosterId, description, cfg);
  };

  const dropRecruit = (target: RosterCharacter) => {
    if (!window.confirm("确认放弃这次召唤？")) return;
    removeCharacter(target.rosterId);
    if (previewRosterId === target.rosterId) {
      setPreviewRosterId(null);
    }
  };

  useEffect(() => {
    if (!evolutionDebugAvailable && evolutionDebugMode) {
      setEvolutionDebugMode(false);
    }
  }, [evolutionDebugAvailable, evolutionDebugMode, setEvolutionDebugMode]);

  const startRecruit = () => {
    setPhase("RECRUIT_CREATE");
  };

  const startTower = (target: RosterCharacter | null = selectedRoster) => {
    if (!target || isRosterCharacterUnavailable(target)) return;
    setBattleMode("pve_tower");
    setTowerRosterId(target.rosterId);
    setTowerLayer(target.tower.nextLayer ?? 1);
    setPhase("TOWER_HUB");
  };

  const startSpiritChat = () => {
    if (!selectedRoster || selectedUnavailable) return;
    setOpenSpiritRosterId(selectedRoster.rosterId);
    setPhase("SPIRIT_CHAT");
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
    const stage = selectedEvolutionStage;
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
      const imageUrl = await cacheImageUrlAsDataUrl(remote, { maxSize: 384 });
      if (!imageUrl) {
        throw new Error("进化图保存失败，请稍后重试。");
      }

      updateCharacter(selectedRoster.rosterId, (current) => {
        const targetIndex = current.formHistory
          .map((form, index) => ({ form, index }))
          .reverse()
          .find(({ form }) => form.stage === stage)?.index;
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
    <div className="min-h-screen relative overflow-hidden bg-[#05060a] text-white">
      {/* 静态背景层 */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute -top-40 -left-40 w-[55vw] h-[55vw] rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(255,215,0,0.25) 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[55vw] h-[55vw] rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(102,252,241,0.22) 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(102,252,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(102,252,241,1) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          }}
        />
      </div>

      {/* 巨型水印 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden select-none"
      >
        <div
          className="font-display font-black leading-none tracking-tighter text-white/[0.02]"
          style={{ fontSize: "min(30vw, 520px)", letterSpacing: "-0.06em" }}
        >
          HUB
        </div>
      </div>

      {/* 顶部 HUD */}
      <div className="relative z-20 flex items-center justify-between px-6 md:px-10 py-5">
        <div className="flex items-center gap-3">
          <div aria-hidden className="h-11 w-11 shrink-0" />
          <div className="hidden md:flex items-center gap-3 ml-2 text-[10px] font-mono tracking-[0.4em] text-white/40">
            <div className="w-6 h-[1px] bg-[#66FCF1]" />
            <span>WORD-SPIRIT / 002</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <IconButton
            onClick={startSocial}
            icon={<MessageCircle size={16} />}
            label="社交"
            accent="#A78BFA"
          />
          <IconButton
            onClick={goRoster}
            icon={<UsersRound size={16} />}
            label={`我的词灵 · ${rosterCount}`}
            accent="#66FCF1"
          />
        </div>
      </div>
      <BackButton
        onClick={() => setPhase("WELCOME")}
        color="#66FCF1"
        className="fixed left-6 top-5 z-30"
      />

      {/* 主内容 */}
      <div className="relative z-10 min-h-screen px-6 md:px-10 lg:px-16 pt-8 pb-16 max-w-[1400px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {/* 编辑式标题 */}
          <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-[1px] bg-[#FFD700]" />
                <span className="text-[10px] tracking-[0.5em] text-[#FFD700]/90 font-mono">
                  CHAPTER · 01
                </span>
              </div>
              <h1
                className="font-display font-black leading-[0.9] tracking-tight"
                style={{
                  fontSize: "clamp(2.2rem, 5vw, 4rem)",
                  letterSpacing: "-0.03em",
                }}
              >
                <span
                  className="text-white"
                  style={{ textShadow: "0 0 30px rgba(255,215,0,0.25)" }}
                >
                  词灵
                </span>
                <span
                  className="text-[#FFD700]"
                  style={{ textShadow: "0 0 30px rgba(255,215,0,0.55)" }}
                >
                  枢庭
                </span>
              </h1>
              <div
                className="mt-1 font-mono font-bold text-white/25"
                style={{
                  fontSize: "clamp(0.6rem, 0.9vw, 0.85rem)",
                  letterSpacing: "0.4em",
                }}
              >
                S U M M O N · C H A T · S T O R Y · A S C E N D
              </div>
            </div>
            <div className="text-right text-[10px] font-mono tracking-widest text-white/30">
              <div>ROSTER {String(rosterCount).padStart(2, "0")}</div>
              <div className="text-[#66FCF1]/70 mt-1">CARD PREVIEW · READY</div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {/* 召唤词灵：一句话内嵌输入 */}
            <div className="relative border border-[#FFD700]/30 bg-black/30 backdrop-blur-sm px-4 py-3 md:px-5 md:py-3.5 overflow-hidden">
              <span
                aria-hidden
                className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[#FFD700]/70"
              />
              <span
                aria-hidden
                className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[#FFD700]/70"
              />
              <span
                aria-hidden
                className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-[#FFD700]/70"
              />
              <span
                aria-hidden
                className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-[#FFD700]/70"
              />
              <div className="relative flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="w-1 h-1 bg-[#FFD700]" />
                  <span className="text-[9px] font-mono tracking-[0.4em] text-[#FFD700]/75">
                    N°01 · SUMMON
                  </span>
                  <span className="hidden sm:inline text-[9px] font-mono tracking-[0.4em] text-[#FFD700]/75">
                    一句描述，生成你的词灵
                  </span>
                </div>
                {summonCooldownLeftMs > 0 ? (
                  <div className="relative flex items-center gap-3 border-b border-[#FFD700]/30 py-1">
                    <Timer
                      size={14}
                      className="shrink-0 text-[#FFD700] animate-pulse"
                    />
                    <div className="flex-1 min-w-0 flex items-baseline gap-2 text-sm font-mono text-[#FFD700]">
                      <span className="tracking-[0.15em]">冷却中</span>
                      <span className="text-[#FFD700]/60 text-[11px]">
                        {summonCooldownSec} 秒后可再次召唤
                      </span>
                    </div>
                    <div className="tabular-nums font-black text-lg text-[#FFD700] leading-none">
                      {summonCooldownSec}
                      <span className="text-[10px] tracking-widest ml-0.5">
                        s
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="relative flex items-center gap-2 border-b border-[#FFD700]/20 focus-within:border-[#FFD700]/70 transition-colors py-1">
                    <Sparkles
                      size={14}
                      className="shrink-0 text-[#FFD700]/70"
                    />
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="text"
                        value={summonInput}
                        onChange={(e) => {
                          setSummonInput(e.target.value);
                          if (summonError) setSummonError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            submitSummon();
                          }
                        }}
                        placeholder=" "
                        className="peer w-full bg-transparent border-0 outline-none text-sm text-[#F5F1DE] placeholder-transparent font-mono py-1.5"
                      />
                      {!summonInput && (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center text-sm font-mono text-white/30 truncate"
                        >
                          {placeholderText}
                          <span className="ml-0.5 inline-block w-[1px] h-4 bg-[#FFD700] animate-pulse" />
                        </div>
                      )}
                    </div>
                    <span className="hidden sm:inline text-[9px] font-mono text-white/20 tabular-nums">
                      {summonInput.length}
                    </span>
                    <button
                      type="button"
                      onClick={submitSummon}
                      disabled={summonInput.trim().length === 0}
                      className="group shrink-0 flex items-center gap-1.5 px-3 h-8 text-[10px] font-black tracking-[0.25em] text-[#FFD700] border border-[#FFD700]/60 hover:border-[#FFD700] hover:bg-[#FFD700] hover:text-[#0B0C10] transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#FFD700] disabled:cursor-not-allowed"
                    >
                      <span>召唤</span>
                      <Send
                        size={11}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </button>
                  </div>
                )}
                {summonCooldownLeftMs > 0 && (
                  <div className="h-[2px] w-full bg-[#FFD700]/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-[#FFD700]"
                      initial={false}
                      animate={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            100 -
                              (summonCooldownLeftMs / RECRUIT_COOLDOWN_MS) *
                                100,
                          ),
                        )}%`,
                      }}
                      transition={{ duration: 0.6, ease: "linear" }}
                    />
                  </div>
                )}
                {summonError && (
                  <div className="text-[10px] text-[#FF6B9D] font-mono">
                    {summonError}
                  </div>
                )}
                {!summonError && summonCooldownLeftMs <= 0 && (
                  <div className="text-[9px] font-mono tracking-[0.15em] text-white/25 flex items-center gap-3 flex-wrap">
                    <span>后台生成 · 自动收入麾下</span>
                    <span className="hidden sm:inline text-white/15">·</span>
                    <span className="hidden sm:inline">Enter 快速召唤</span>
                    <span className="hidden md:inline text-white/15">·</span>
                    <span className="hidden md:inline">召唤后 60s 冷却</span>
                  </div>
                )}
                {/* Prompt showcase chips */}
                <div
                  className="mt-1 flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1"
                  style={{ scrollbarWidth: "none" }}
                >
                  <span className="shrink-0 text-[9px] font-mono tracking-[0.28em] text-white/25">
                    灵感 ▸
                  </span>
                  {PROMPT_PRESETS.map((preset) => {
                    const disabled = summonCooldownLeftMs > 0;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setSummonInput(preset.prompt);
                          setSummonError("");
                        }}
                        title={preset.prompt}
                        className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          borderColor: `${preset.accent}55`,
                          color: `${preset.accent}dd`,
                          background: `${preset.accent}10`,
                        }}
                        onMouseEnter={(e) => {
                          if (disabled) return;
                          e.currentTarget.style.background = `${preset.accent}22`;
                          e.currentTarget.style.borderColor = preset.accent;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = `${preset.accent}10`;
                          e.currentTarget.style.borderColor = `${preset.accent}55`;
                        }}
                      >
                        <span className="text-[11px]">{preset.emoji}</span>
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ModeCard
                onClick={startSpiritChat}
                disabled={!selectedRoster || selectedUnavailable}
                icon={<MessageCircle size={22} />}
                title="词灵会客厅"
                subtitle="独立记忆 · 深度陪伴"
                accent="#66FCF1"
                description="进入会客室选择词灵一对一对话，它会记住你们之间的每一次交流。"
                highlight
              />
              <ModeCard
                onClick={startSpiritStory}
                disabled={
                  roster.filter((char) => !isRosterCharacterUnavailable(char))
                    .length < 2
                }
                icon={<Clapperboard size={22} />}
                title="群像共叙"
                subtitle="多灵同场 · 世界故事"
                accent="#B78BFF"
                description="召集多位词灵同框互动，让它们自己推进一段属于你的故事。"
                highlight
              />
              <ModeCard
                onClick={startSocial}
                icon={<Users size={22} />}
                title="社交&朋友"
                subtitle="房间群聊 · 1v1 对战"
                accent="#60A5FA"
                description="带词灵加入房间群聊，召唤它们回应，并随时向房内好友发起约战。"
                highlight
              />
              <ModeCard
                onClick={() => startTower()}
                disabled={!selectedRoster || selectedUnavailable}
                icon={<Castle size={22} />}
                title="九层塔"
                subtitle={
                  selectedRoster
                    ? selectedUnavailable
                      ? `${selectedRoster.name} · 暂不可用`
                      : `${selectedRoster.name} · 第${selectedRoster.tower.nextLayer ?? 1}层`
                    : "进入后选择词灵"
                }
                accent="#FF6B9D"
                description="登塔积累修炼 XP，突破关卡后触发进化，解锁全新形态与技能。"
                highlight
              />
            </div>

            <div className="relative flex flex-col border border-white/10 bg-black/30 backdrop-blur-sm p-6 overflow-hidden">
              <span
                aria-hidden
                className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[#FFD700]"
              />
              <span
                aria-hidden
                className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[#FFD700]"
              />
              <span
                aria-hidden
                className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[#FFD700]"
              />
              <span
                aria-hidden
                className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[#FFD700]"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -top-32 -left-32 h-64 w-64 rounded-full blur-3xl opacity-15"
                style={{ background: "#FFD700" }}
              />
              <div className="mb-5 flex shrink-0 items-center justify-between relative pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-[#FFD700]" />
                  <span className="text-[10px] font-mono tracking-[0.35em] text-white/60">
                    ROSTER · CORE
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-mono text-white/30">
                    {String(rosterCount).padStart(2, "0")}
                  </span>
                  {evolutionDebugAvailable && (
                    <button
                      type="button"
                      onClick={() => setEvolutionDebugMode(!evolutionDebugMode)}
                      className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-black tracking-widest transition-all border"
                      style={{
                        borderColor: evolutionDebugMode
                          ? "rgba(255,107,157,0.75)"
                          : "rgba(255,255,255,0.15)",
                        color: evolutionDebugMode
                          ? "#FF6B9D"
                          : "rgba(255,255,255,0.4)",
                      }}
                    >
                      <FlaskConical size={11} />
                      DEBUG {evolutionDebugMode ? "ON" : "OFF"}
                    </button>
                  )}
                </div>
              </div>

              {roster.length > 0 ? (
                <div className="flex flex-1 flex-col gap-4">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
                    {rosterPreview.map((char) => {
                      const evolutionLocked =
                        isRosterCharacterEvolutionLocked(char);
                      const recruitLocked =
                        isRosterCharacterRecruitLocked(char);
                      const progress = xpProgress(char.level, char.xp);
                      const nextEvo = getNextEvolutionProgress(
                        char.level,
                        char.xp,
                        char.evolutionStage,
                      );
                      const nextEvoText = recruitLocked
                        ? char.recruitLock?.status === "failed"
                          ? "创造失败"
                          : "后台创造中"
                        : evolutionLocked
                          ? "进化更新中"
                          : nextEvo.nextStage
                            ? nextEvo.ready
                              ? "进化待触发"
                              : `距${evolutionLabel(nextEvo.nextStage)} ${nextEvo.xpRemaining}XP`
                            : "最终形态";
                      const highestLayer =
                        char.tower.highestEndlessLayer ??
                        char.tower.highestCleared;
                      const isFailed =
                        recruitLocked && char.recruitLock?.status === "failed";
                      const isGenerating = recruitLocked && !isFailed;
                      const badges = [
                        {
                          label: `Lv.${char.level}`,
                          title: `等级 ${char.level}`,
                        },
                        {
                          label: `L${highestLayer}`,
                          color: "#66FCF1",
                          title: `无尽塔最高 L${highestLayer}`,
                        },
                      ];
                      const canOperate = !evolutionLocked && !recruitLocked;
                      const canPreview = !recruitLocked;
                      const actionSlot = canOperate ? (
                        <>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenSpiritRosterId(char.rosterId);
                              setPhase("SPIRIT_CHAT");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenSpiritRosterId(char.rosterId);
                                setPhase("SPIRIT_CHAT");
                              }
                            }}
                            className="cursor-pointer rounded px-2 py-1 text-center text-[9px] font-black text-[#0B0C10] transition-all hover:brightness-110"
                            style={{
                              background: "#66FCF1",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                            }}
                          >
                            聊天
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              startTower(char);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                startTower(char);
                              }
                            }}
                            className="cursor-pointer rounded px-2 py-1 text-center text-[9px] font-black text-[#0B0C10] transition-all hover:brightness-110"
                            style={{
                              background: "#FBBF24",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                            }}
                          >
                            出战
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm("确认删除该词灵？")) {
                                removeCharacter(char.rosterId);
                                if (previewRosterId === char.rosterId) {
                                  setPreviewRosterId(null);
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                if (window.confirm("确认删除该词灵？")) {
                                  removeCharacter(char.rosterId);
                                  if (previewRosterId === char.rosterId) {
                                    setPreviewRosterId(null);
                                  }
                                }
                              }
                            }}
                            className="cursor-pointer rounded px-2 py-1 text-center text-[9px] font-black text-white transition-all hover:brightness-110"
                            style={{
                              background: "#EF4444",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                            }}
                          >
                            删除
                          </span>
                        </>
                      ) : null;
                      const footerSlot =
                        !isGenerating && !isFailed ? (
                          <div className="flex flex-col gap-1">
                            <div className="h-[3px] overflow-hidden rounded-full bg-black/50">
                              <div
                                className="h-full rounded-full transition-[width] duration-500 ease-out"
                                style={{
                                  width: `${Math.round(progress.ratio * 100)}%`,
                                  background:
                                    "linear-gradient(90deg, #66FCF1, #FFD700)",
                                }}
                              />
                            </div>
                            <div className="text-[8px] text-center text-[#8a8d91] truncate">
                              {levelAscensionLabel(char.level)} · {nextEvoText}
                            </div>
                          </div>
                        ) : null;
                      return (
                        <SpiritCard
                          key={char.rosterId}
                          character={char}
                          size="sm"
                          topRightBadges={badges}
                          actionSlot={actionSlot}
                          footerSlot={footerSlot}
                          onClick={
                            canPreview
                              ? () => setPreviewRosterId(char.rosterId)
                              : undefined
                          }
                          onKeyDown={(e) => {
                            if (!canPreview) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setPreviewRosterId(char.rosterId);
                            }
                          }}
                          onRetryRecruit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            retryRecruit(char);
                          }}
                          onDropRecruit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dropRecruit(char);
                          }}
                        />
                      );
                    })}
                  </div>

                  {selectedRoster && canRegenerateEvolutionImage && (
                    <div className="rounded-lg border border-[#FFD700]/45 bg-[#0B0C10]/70 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-[10px] font-black tracking-[0.28em] text-[#FFD700]">
                            重绘进化形态
                          </div>
                          <div className="mt-1 text-[11px] leading-relaxed text-[#C5C6C7]">
                            {selectedFallbackForm
                              ? `${selectedRoster.name} 当前 ${evolutionLabel(selectedFallbackForm.stage)} 使用临时形态图，可在这里重新生成真实进化图。`
                              : selectedEvolutionLocked
                                ? `${selectedRoster.name} 的进化更新可能已中断，可在这里重新生成真实进化图并解锁。`
                                : `不满意当前 ${evolutionLabel(selectedEvolutionStage ?? 0)} 的视觉表现？可按新进化提示词重绘当前形态。`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={regenerateEvolutionImage}
                          disabled={
                            regeneratingRosterId === selectedRoster.rosterId
                          }
                          className="flex shrink-0 items-center justify-center gap-2 rounded border border-[#FFD700] px-3 py-2 text-[10px] font-black tracking-[0.18em] text-[#FFD700] transition-all hover:bg-[#FFD700] hover:text-[#0B0C10] disabled:opacity-60"
                        >
                          <RotateCcw
                            size={13}
                            className={
                              regeneratingRosterId === selectedRoster.rosterId
                                ? "animate-spin"
                                : ""
                            }
                          />
                          {regeneratingRosterId === selectedRoster.rosterId
                            ? "生成中"
                            : "重新生成进化图"}
                        </button>
                      </div>
                      {regenerateError && (
                        <div className="mt-2 text-[10px] text-[#FF6B9D]">
                          {regenerateError}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedRoster && selectedEvolutionLocked && (
                    <div className="rounded-lg border border-[#FFD700]/35 bg-[#0B0C10]/70 p-3 text-[11px] leading-relaxed text-[#C5C6C7]">
                      <div className="mb-1 flex items-center gap-2 text-[10px] font-black tracking-[0.26em] text-[#FFD700]">
                        <Lock size={12} />
                        角色暂不可用
                      </div>
                      {selectedRoster.name}
                      正在完成进化图更新，期间不能出战或训练。真实形态图完成后会自动恢复使用。
                    </div>
                  )}

                  {selectedRoster && selectedRecruitLocked && (
                    <div className="rounded-lg border border-[#FFD700]/35 bg-[#0B0C10]/70 p-3 text-[11px] leading-relaxed text-[#C5C6C7]">
                      <div className="mb-1 flex items-center gap-2 text-[10px] font-black tracking-[0.26em] text-[#FFD700]">
                        <Lock size={12} />
                        角色暂不可用
                      </div>
                      {selectedRoster.recruitLock?.status === "failed"
                        ? selectedRoster.recruitLock.error ||
                          "后台创造失败，请移除后重新创造。"
                        : `${selectedRoster.recruitLock?.description || "新角色"} 正在后台生成，完成后会自动解锁。`}
                    </div>
                  )}

                  {activeEvolutionDebugMode && selectedRoster && (
                    <div className="rounded-lg border border-[#FF6B9D]/50 bg-[#0B0C10]/70 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-[10px] font-black tracking-[0.28em] text-[#FF6B9D]">
                            DEBUG EVOLUTION
                          </div>
                          <div className="mt-1 text-[11px] leading-relaxed text-[#C5C6C7]">
                            {debugNextStage
                              ? `${selectedRoster.name} 可进入 ${evolutionLabel(debugNextStage)} 进化演出测试。`
                              : `${selectedRoster.name} 已是最终形态。`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={startDebugEvolutionAnimation}
                          disabled={!debugNextStage || selectedEvolutionLocked}
                          className="flex shrink-0 items-center justify-center gap-2 rounded border border-[#FF6B9D] px-3 py-2 text-[10px] font-black tracking-[0.18em] text-[#FF6B9D] transition-all hover:bg-[#FF6B9D] hover:text-[#0B0C10] disabled:opacity-50"
                        >
                          <FlaskConical size={13} />
                          测试进化演出
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-auto flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-[10px] leading-relaxed text-[#8a8d91]">
                      点击词灵查看完整英雄卡，悬停可使用快捷操作。
                    </div>
                    <button
                      type="button"
                      onClick={goRoster}
                      className="flex items-center justify-center gap-2 rounded border border-[#66FCF1]/45 px-4 py-2.5 text-xs font-bold tracking-[0.2em] text-[#66FCF1] transition-all hover:bg-[#66FCF1]/10"
                    >
                      <UsersRound size={15} />
                      查看全部
                      {hiddenRosterCount > 0 ? ` +${hiddenRosterCount}` : ""}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startRecruit}
                  className="flex w-full flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#FFD700]/45 bg-[#0B0C10]/55 py-12 text-[#FFD700] transition-all hover:bg-[#FFD700]/10"
                >
                  <Plus size={30} />
                  <span className="font-black tracking-[0.25em]">
                    创造第一个角色
                  </span>
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* 底部签名 */}
        <div className="mt-16 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] font-mono tracking-[0.35em] text-white/25">
          <div className="flex items-center gap-4">
            <span>01 · CONFIG</span>
            <span className="w-10 h-[1px] bg-white/15" />
            <span className="text-[#FFD700]">02 · HUB</span>
            <span className="w-10 h-[1px] bg-white/10" />
            <span>03 · ASCEND</span>
          </div>
          <span className="hidden md:inline">召唤 · 陪伴 · 共叙 · 进化</span>
        </div>
      </div>
      <AnimatePresence>
        {previewRoster && (
          <HeroCardPreviewModal
            key={previewRoster.rosterId}
            character={previewRoster}
            onClose={() => setPreviewRosterId(null)}
          />
        )}
      </AnimatePresence>
    </div>
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

interface ModeCardProps {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  description: string;
  accent: string;
  highlight?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

const ModeCard: React.FC<ModeCardProps> = ({
  onClick,
  icon,
  title,
  subtitle,
  description,
  accent,
  disabled,
  compact,
}) => {
  const modeIndex = React.useMemo(
    () => Math.floor(Math.random() * 90 + 10).toString(),
    [],
  );
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { y: -4 }}
      whileTap={disabled ? {} : { scale: 0.99 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={`group relative flex flex-col justify-between text-left overflow-hidden bg-black/30 backdrop-blur-sm border border-white/10 hover:border-white/30 transition-colors ${
        compact ? "p-4 min-h-[180px]" : "p-6 min-h-[220px]"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {/* 边角刻线 */}
      <span
        aria-hidden
        className="absolute top-0 left-0 w-3 h-3 border-t border-l opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ borderColor: accent }}
      />
      <span
        aria-hidden
        className="absolute top-0 right-0 w-3 h-3 border-t border-r opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ borderColor: accent }}
      />
      <span
        aria-hidden
        className="absolute bottom-0 left-0 w-3 h-3 border-b border-l opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ borderColor: accent }}
      />
      <span
        aria-hidden
        className="absolute bottom-0 right-0 w-3 h-3 border-b border-r opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ borderColor: accent }}
      />

      {/* Hover 时的柔和辉光 */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl opacity-0 group-hover:opacity-30 transition-opacity duration-500"
        style={{ background: accent }}
      />

      {/* 顶部：编号 + 图标 */}
      <div className="relative flex items-start justify-between mb-6">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-mono tracking-widest"
            style={{ color: accent, opacity: 0.75 }}
          >
            N°{modeIndex}
          </span>
          <span
            className="w-6 h-[1px] group-hover:w-10 transition-all"
            style={{ background: accent }}
          />
        </div>
        <div
          className="transition-transform group-hover:scale-110 group-hover:-rotate-6"
          style={{ color: accent }}
        >
          {icon}
        </div>
      </div>

      {/* 标题 */}
      <div className="relative">
        <div
          className={`font-display font-black leading-tight tracking-tight ${
            compact ? "text-xl" : "text-2xl md:text-3xl"
          }`}
          style={{ color: accent, letterSpacing: "-0.02em" }}
        >
          {title}
        </div>
        {subtitle && (
          <div className="text-[11px] text-white/60 mt-1.5 tracking-wide">
            {subtitle}
          </div>
        )}
      </div>

      {/* 描述 */}
      <p className="relative text-[11px] text-white/40 leading-relaxed mt-3">
        {description}
      </p>

      {/* 底部：ENTER 指示 */}
      <div
        className="relative mt-4 flex items-center justify-between text-[10px] font-mono tracking-[0.35em] pt-3 border-t border-white/10"
        style={{ color: accent }}
      >
        <span>ENTER</span>
        <ChevronRight
          size={14}
          className="transition-transform group-hover:translate-x-1"
        />
      </div>
    </motion.button>
  );
};
