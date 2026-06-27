import React, { useState } from "react";
import { useGameStore, type CharacterData } from "../store/useGameStore";
import {
  resetCharacterRuntimeState,
  useRosterStore,
} from "../store/useRosterStore";
import {
  generateCharacter,
  generateCharacterImage,
  preloadImage,
  AIConfig,
} from "../utils/ai";
import { cacheImageUrlAsDataUrl } from "../utils/localImage";
import { presetCharacters } from "../data/presetCharacters";
import { startEvolutionAssetPrefetch } from "../utils/evolutionPrefetch";
import { buildLocalEvolution } from "../utils/towerProgress";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Heart,
  Brain,
  Sparkles,
  ImageIcon,
  Flame,
  Shield,
  Gauge,
  ChevronDown,
  UsersRound,
  Trash2,
  Info,
  ArrowRight,
  X,
  UserPlus,
  CheckCircle2,
} from "lucide-react";
import { ParticleField } from "./ParticleField";
import { CharacterDetailModal } from "./CharacterDetailModal";
import { BackButton } from "./BackButton";

const LOADING_STEPS = [
  { icon: Brain, text: "正在解析灵魂数据..." },
  { icon: Zap, text: "注入战斗参数..." },
  { icon: Sparkles, text: "生成专属技能体系..." },
  { icon: Flame, text: "凝聚大招能量..." },
  { icon: ImageIcon, text: "召唤实体形象..." },
];

const RECRUIT_COOLDOWN_MS = 60_000;
const RECRUIT_COOLDOWN_KEY = "word-brawl-recruit-last-generated-at";

const loadGeneratedAvatar = async (
  generator: () => Promise<string>,
): Promise<{ url: string; ready: boolean }> => {
  // generator（generateCharacterImage）已在串行队列内完成下载校验：
  // 非空 URL 即为已验证可用；空串表示生成失败或被限流（已在队列内退避重试过）。
  const url = await generator();
  if (!url) {
    throw new Error("头像生成正在排队或被限流，请稍后重试。");
  }
  return { url, ready: true };
};

interface RecruitPreviewModalProps {
  character: CharacterData;
  themeColor: string;
  themeColorHex: string;
  imageFailed: boolean;
  onImageFailed: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const RecruitPreviewModal: React.FC<RecruitPreviewModalProps> = ({
  character,
  themeColor,
  themeColorHex,
  imageFailed,
  onImageFailed,
  onCancel,
  onConfirm,
}) => {
  const ultimateSkill = character.skills.find(
    (skill) => skill.isUltimate || skill.type === "ultimate",
  );
  const stats = [
    { icon: Heart, label: "生命", value: character.maxHp, color: "#FF6B9D" },
    { icon: Zap, label: "攻击", value: character.attack, color: "#FFD700" },
    { icon: Shield, label: "防御", value: character.defense, color: "#66FCF1" },
    { icon: Gauge, label: "速度", value: character.speed, color: "#7FFF9F" },
  ];
  const hasAvatarImage = Boolean(character.imageUrl && !imageFailed);
  const [imageLoaded, setImageLoaded] = useState(false);

  React.useEffect(() => {
    setImageLoaded(false);
  }, [character.imageUrl]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#0B0C10]/92 backdrop-blur-lg flex items-center justify-center p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="确认收下角色"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ type: "spring", bounce: 0.35, duration: 0.55 }}
        className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-xl border-2 bg-[#1F2833]/95 p-4 md:p-6 corner-frame"
        style={{
          borderColor: themeColor,
          boxShadow: `0 0 48px rgba(${themeColorHex}, 0.45), inset 0 0 28px rgba(${themeColorHex}, 0.08)`,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="放弃本次招募"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded border bg-[#0B0C10]/80 text-[#8a8d91] transition-all hover:text-[#FF003C]"
          style={{ borderColor: `rgba(${themeColorHex}, 0.35)` }}
        >
          <X size={18} />
        </button>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <div
            className="relative flex items-center justify-center overflow-hidden rounded-lg border bg-[#0B0C10]/80 p-3"
            style={{ borderColor: `rgba(${themeColorHex}, 0.35)` }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              className="absolute h-[72%] w-[72%] rounded-full border-2 border-dashed opacity-35"
              style={{ borderColor: themeColor }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-28"
              style={{
                background: `linear-gradient(180deg, rgba(${themeColorHex}, 0.22), transparent)`,
              }}
            />
            <motion.div
              initial={{ scale: 0.84 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.42, duration: 0.7 }}
              className="relative z-[1] w-full max-w-[440px] overflow-hidden rounded-lg border-2 bg-[#0B0C10] shadow-2xl"
              style={{
                borderColor: themeColor,
                boxShadow: `0 0 34px rgba(${themeColorHex}, 0.55)`,
              }}
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#111721]">
                <div
                  className="absolute inset-0"
                  style={{
                    background: `
                      radial-gradient(circle at 50% 34%, rgba(${themeColorHex}, 0.32), transparent 34%),
                      linear-gradient(135deg, rgba(${themeColorHex}, 0.2), rgba(11, 12, 16, 0.96) 58%, rgba(102, 252, 241, 0.1))
                    `,
                  }}
                />
                <motion.div
                  className="absolute inset-0 opacity-45"
                  animate={{ backgroundPosition: ["0 0", "0 96px"] }}
                  transition={{
                    duration: 3.2,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  style={{
                    backgroundImage: `linear-gradient(180deg, transparent 0, transparent 13px, rgba(${themeColorHex}, 0.28) 14px, transparent 16px)`,
                    backgroundSize: "100% 24px",
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-0 opacity-55"
                  style={{
                    background: `linear-gradient(90deg, transparent, rgba(${themeColorHex}, 0.12), transparent)`,
                  }}
                />

                {hasAvatarImage && (
                  <img
                    src={character.imageUrl}
                    alt={character.name}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => {
                      setImageLoaded(false);
                      onImageFailed();
                    }}
                    className={`relative z-[1] h-full w-full object-cover transition-opacity duration-500 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                  />
                )}

                <AnimatePresence initial={false}>
                  {(!hasAvatarImage || !imageLoaded) && (
                    <motion.div
                      key={
                        hasAvatarImage ? "avatar-loading" : "avatar-fallback"
                      }
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-[2] flex flex-col items-center justify-center px-6 text-center"
                    >
                      <motion.div
                        className="absolute h-[54%] w-[54%] rounded-full border border-dashed opacity-45"
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 13,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        style={{ borderColor: themeColor }}
                      />
                      <motion.div
                        className="absolute h-[34%] w-[34%] rounded-full blur-3xl"
                        animate={{
                          opacity: [0.32, 0.62, 0.32],
                          scale: [0.92, 1.08, 0.92],
                        }}
                        transition={{
                          duration: 2.6,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                        style={{
                          backgroundColor: `rgba(${themeColorHex}, 0.48)`,
                        }}
                      />
                      <div
                        className="relative flex h-28 w-28 items-center justify-center rounded-full border-2 bg-[#0B0C10]/70 font-display text-6xl font-black shadow-2xl"
                        style={{
                          borderColor: themeColor,
                          color: themeColor,
                          textShadow: `0 0 18px ${themeColor}`,
                          boxShadow: `0 0 28px rgba(${themeColorHex}, 0.42), inset 0 0 18px rgba(${themeColorHex}, 0.16)`,
                        }}
                      >
                        {hasAvatarImage ? (
                          <ImageIcon size={42} />
                        ) : (
                          character.name?.[0] || "?"
                        )}
                        {hasAvatarImage && (
                          <motion.span
                            className="absolute inset-[-7px] rounded-full border-2 border-transparent"
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1.05,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                            style={{
                              borderTopColor: themeColor,
                              borderRightColor: `rgba(${themeColorHex}, 0.35)`,
                            }}
                          />
                        )}
                      </div>
                      <div
                        className="mt-5 font-display text-[10px] font-black tracking-[0.34em]"
                        style={{ color: themeColor }}
                      >
                        {hasAvatarImage
                          ? "影像载入中"
                          : imageFailed
                            ? "影像未就绪"
                            : "生成候补影像"}
                      </div>
                      <div className="mt-3 h-1.5 w-44 overflow-hidden rounded-full bg-white/10">
                        <motion.div
                          className="h-full w-1/2 rounded-full"
                          animate={{ x: ["-110%", "230%"] }}
                          transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                          style={{
                            background: `linear-gradient(90deg, transparent, ${themeColor}, transparent)`,
                          }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black via-black/70 to-transparent p-4">
                <div className="text-[10px] font-display tracking-[0.35em] text-[#FFD700]">
                  NEW RECRUIT
                </div>
                <div
                  className="mt-1 break-words text-3xl font-black font-display"
                  style={{
                    color: themeColor,
                    textShadow: `0 0 14px ${themeColor}`,
                  }}
                >
                  {character.name}
                </div>
              </div>
            </motion.div>
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="pr-10">
              <div
                className="mb-2 flex items-center gap-2 text-[10px] font-display tracking-[0.32em]"
                style={{ color: themeColor }}
              >
                <Sparkles size={13} />
                招募完成
              </div>
              <h3
                className="break-words text-3xl font-black font-display leading-tight md:text-4xl"
                style={{ color: themeColor }}
              >
                {character.name}
              </h3>
              {character.sourceDescription && (
                <div className="mt-3 rounded border border-[#45A29E]/30 bg-[#0B0C10]/65 p-3 text-xs leading-relaxed text-[#C5C6C7]">
                  <span style={{ color: themeColor }}>▸</span>{" "}
                  {character.sourceDescription}
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="rounded border border-[#45A29E]/25 bg-[#0B0C10]/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-[10px] text-[#8a8d91]">
                      <Icon size={13} style={{ color: stat.color }} />
                      {stat.label}
                    </div>
                    <div
                      className="mt-1 text-xl font-black font-display"
                      style={{ color: stat.color }}
                    >
                      {stat.value}
                    </div>
                  </div>
                );
              })}
            </div>

            {ultimateSkill && (
              <div
                className="mt-4 rounded border bg-[#0B0C10]/65 p-3"
                style={{ borderColor: "#FFD70066" }}
              >
                <div className="mb-1 flex items-center gap-2 text-[10px] font-display tracking-[0.25em] text-[#FFD700]">
                  <Flame size={13} />
                  终极技能
                </div>
                <div className="break-words text-lg font-black font-display text-[#FFD700]">
                  {ultimateSkill.name}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-[#C5C6C7]">
                  {ultimateSkill.description}
                </div>
              </div>
            )}

            <div className="mt-4 min-h-0 flex-1 overflow-hidden">
              <div
                className="mb-2 text-[10px] font-display tracking-[0.25em]"
                style={{ color: themeColor }}
              >
                技能档案
              </div>
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {character.skills.map((skill, idx) => {
                  const isUltimate =
                    skill.isUltimate || skill.type === "ultimate";
                  return (
                    <div
                      key={`${skill.name}-${skill.type}-${idx}`}
                      className="rounded border border-[#45A29E]/20 bg-[#0B0C10]/55 p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="min-w-0 truncate text-sm font-bold font-display"
                          style={{ color: isUltimate ? "#FFD700" : themeColor }}
                        >
                          {skill.name}
                        </span>
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[9px] tracking-widest"
                          style={{
                            color: isUltimate ? "#FFD700" : themeColor,
                            background: isUltimate
                              ? "#FFD70022"
                              : `rgba(${themeColorHex}, 0.16)`,
                          }}
                        >
                          {isUltimate ? "大招" : skill.type}
                        </span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[#C5C6C7]">
                        {skill.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className="mt-5 grid grid-cols-2 gap-3 border-t pt-4"
              style={{ borderColor: `rgba(${themeColorHex}, 0.24)` }}
            >
              <motion.button
                type="button"
                onClick={onCancel}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center justify-center gap-2 rounded border-2 bg-[#0B0C10]/80 py-3 text-xs font-black font-display tracking-[0.2em] text-[#8a8d91] transition-all hover:text-[#FF003C]"
                style={{ borderColor: "#3a3d42" }}
              >
                <X size={16} />
                放弃
              </motion.button>
              <motion.button
                type="button"
                onClick={onConfirm}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center justify-center gap-2 rounded border-2 py-3 text-xs font-black font-display tracking-[0.2em] text-[#0B0C10] transition-all"
                style={{
                  borderColor: themeColor,
                  backgroundColor: themeColor,
                  boxShadow: `0 0 22px rgba(${themeColorHex}, 0.45)`,
                }}
              >
                <UserPlus size={16} />
                确认收下
                <CheckCircle2 size={16} />
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const CharacterCreateScreen: React.FC = () => {
  const {
    phase,
    apiKey,
    baseUrl,
    model,
    apiMode,
    setPlayer1,
    setPlayer2,
    setPhase,
    player1,
  } = useGameStore();
  const { roster, removeCharacter, recruitCharacter } = useRosterStore();
  const cfg: AIConfig = { apiKey, baseUrl, model, apiMode };
  const isRecruitMode = phase === "RECRUIT_CREATE";
  const isPlayer1 = phase === "PLAYER1_CREATE";
  const playerName = isRecruitMode
    ? "招募新角色"
    : isPlayer1
      ? "PLAYER 1"
      : "PLAYER 2";
  const themeColor = isRecruitMode
    ? "#FFD700"
    : isPlayer1
      ? "#66FCF1"
      : "#FF003C";
  const themeColorHex = isRecruitMode
    ? "255, 215, 0"
    : isPlayer1
      ? "102, 252, 241"
      : "255, 0, 60";
  const handleBack = () => {
    setPhase(isRecruitMode || isPlayer1 ? "MODE_SELECT" : "PLAYER1_CREATE");
  };

  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const [avatarHint, setAvatarHint] = useState<string | null>(null);
  const [selectingPreset, setSelectingPreset] = useState<string | null>(null);
  const [selectingRoster, setSelectingRoster] = useState<string | null>(null);
  const [isRosterOpen, setIsRosterOpen] = useState(true);
  const [inspectingRosterId, setInspectingRosterId] = useState<string | null>(
    null,
  );
  const [pendingRecruit, setPendingRecruit] = useState<CharacterData | null>(
    null,
  );
  const [pendingRecruitImageFailed, setPendingRecruitImageFailed] =
    useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(() => {
    if (typeof window === "undefined") return 0;
    const lastGeneratedAt = Number(
      window.localStorage.getItem(RECRUIT_COOLDOWN_KEY) || 0,
    );
    return lastGeneratedAt > 0 ? lastGeneratedAt + RECRUIT_COOLDOWN_MS : 0;
  });
  const [now, setNow] = useState(Date.now());

  React.useEffect(() => {
    if (!isRecruitMode) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRecruitMode]);

  const cooldownLeftMs = Math.max(0, cooldownUntil - now);
  const cooldownLeftSec = Math.ceil(cooldownLeftMs / 1000);

  const cycleLoadingSteps = () => {
    let step = 0;
    setLoadingStep(0);
    const interval = setInterval(() => {
      step = (step + 1) % LOADING_STEPS.length;
      setLoadingStep(step);
    }, 1100);
    return interval;
  };

  const handleGenerate = async () => {
    if (isRecruitMode && cooldownLeftMs > 0) {
      setError(`角色生成冷却中，请 ${cooldownLeftSec} 秒后再试。`);
      return;
    }
    if (!description.trim()) {
      setError("请输入角色描述！");
      return;
    }
    setError("");
    setAvatarHint(null);
    setPendingRecruit(null);
    setPendingRecruitImageFailed(false);
    setIsGenerating(true);
    const interval = cycleLoadingSteps();
    const player: 1 | 2 = isPlayer1 ? 1 : 2;
    const sourceDescription = description.trim();

    try {
      setAvatarHint("正在生成头像...");
      const avatar = await loadGeneratedAvatar(() =>
        generateCharacterImage(cfg, sourceDescription, player),
      );

      setAvatarHint("头像就绪，正在生成角色数值...");
      const charData = await generateCharacter(cfg, sourceDescription);

      charData.imageUrl = avatar.ready
        ? await cacheImageUrlAsDataUrl(avatar.url)
        : avatar.url;
      charData.sourceDescription = sourceDescription;

      if (isRecruitMode) {
        const generatedAt = Date.now();
        window.localStorage.setItem(RECRUIT_COOLDOWN_KEY, String(generatedAt));
        setCooldownUntil(generatedAt + RECRUIT_COOLDOWN_MS);
        setNow(generatedAt);
        setPendingRecruit(charData);
      } else if (isPlayer1) {
        setPlayer1(charData);
        setPhase("PLAYER2_CREATE");
        setDescription("");
      } else {
        setPlayer2(charData);
        setPhase("BATTLE_ARENA");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "生成失败，请检查 API Key 或网络连接",
      );
    } finally {
      clearInterval(interval);
      setIsGenerating(false);
      setAvatarHint(null);
    }
  };

  const handleConfirmRecruit = async () => {
    if (!pendingRecruit) return;

    const recruited = recruitCharacter(
      pendingRecruit,
      pendingRecruit.sourceDescription,
    );
    setPendingRecruit(null);
    setPendingRecruitImageFailed(false);

    // 等待首阶段进化资源就绪，再进入后续流程。
    // 预设角色已预下载本地图，会立即命中；非预设角色走串行队列，最坏情况用兜底图兜底。
    try {
      await startEvolutionAssetPrefetch(
        {
          rosterId: recruited.rosterId,
          characterName: recruited.name,
          stage: 1,
          level: 5,
          layer: 1,
        },
        async () => buildLocalEvolution(recruited, 1),
      );
    } catch (prefetchErr) {
      console.warn("recruit stage1 prefetch failed", prefetchErr);
    }

    setDescription("");
    setPhase("MODE_SELECT");
  };

  const handleCancelRecruit = () => {
    setPendingRecruit(null);
    setPendingRecruitImageFailed(false);
  };

  const handleSelectRosterCharacter = async (
    saved: (typeof roster)[number],
  ) => {
    setSelectingRoster(saved.rosterId);
    setError("");

    try {
      if (saved.imageUrl) {
        await preloadImage(saved.imageUrl, 30000);
      }

      const charData = resetCharacterRuntimeState(saved);

      if (isRecruitMode) {
        setPhase("TOWER_HUB");
      } else if (isPlayer1) {
        setPlayer1(charData);
        setPhase("PLAYER2_CREATE");
      } else {
        setPlayer2(charData);
        setPhase("BATTLE_ARENA");
      }
    } finally {
      setSelectingRoster(null);
    }
  };

  // PVP 选择预设角色：跳过 LLM 生成，仅预加载已预生成的图片
  const handleSelectPreset = async (
    preset: (typeof presetCharacters)[number],
  ) => {
    setSelectingPreset(preset.name);
    setError("");

    try {
      // 并行预加载头像和大招图片，确保进入下一阶段时图片已就绪
      const ultimateSkill = preset.skills.find(
        (s) => s.isUltimate || s.type === "ultimate",
      );
      await Promise.all([
        preset.imageUrl
          ? preloadImage(preset.imageUrl, 30000)
          : Promise.resolve(false),
        ultimateSkill?.imageUrl
          ? preloadImage(ultimateSkill.imageUrl, 30000)
          : Promise.resolve(false),
      ]);

      // 深拷贝一份，重置运行时状态，避免污染预设数据
      const charData: typeof preset = JSON.parse(JSON.stringify(preset));
      charData.hp = charData.maxHp;
      charData.ultimateCharge = 0;
      charData.attackBuff = 0;
      charData.defenseBuff = 0;
      charData.buffTurnsLeft = 0;
      charData.isPreset = true;

      if (isRecruitMode) {
        charData.isPreset = false;
        charData.sourceDescription = `${preset.name} · 修炼分身`;
        recruitCharacter(charData, charData.sourceDescription);
        setPhase("MODE_SELECT");
      } else if (isPlayer1) {
        setPlayer1(charData);
        setPhase("PLAYER2_CREATE");
      } else {
        setPlayer2(charData);
        setPhase("BATTLE_ARENA");
      }
    } catch {
      // 即使预加载失败也继续，图片会在后续阶段懒加载
      const charData: typeof preset = JSON.parse(JSON.stringify(preset));
      charData.hp = charData.maxHp;
      charData.ultimateCharge = 0;
      charData.attackBuff = 0;
      charData.defenseBuff = 0;
      charData.buffTurnsLeft = 0;
      charData.isPreset = true;

      if (isRecruitMode) {
        charData.isPreset = false;
        charData.sourceDescription = `${preset.name} · 修炼分身`;
        recruitCharacter(charData, charData.sourceDescription);
        setPhase("MODE_SELECT");
      } else if (isPlayer1) {
        setPlayer1(charData);
        setPhase("PLAYER2_CREATE");
      } else {
        setPlayer2(charData);
        setPhase("BATTLE_ARENA");
      }
    } finally {
      setSelectingPreset(null);
    }
  };

  const StepIcon = LOADING_STEPS[loadingStep].icon;

  const pvpPresetNames = new Set([
    "唐三",
    "孙悟空",
    "奥特曼",
    "钢铁侠",
    "超梦",
    "卡卡西",
  ]);
  const pvpPresets = presetCharacters.filter((p) => pvpPresetNames.has(p.name));

  const renderRosterGrid = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
      {roster.map((saved) => {
        const isSelecting = selectingRoster === saved.rosterId;
        const isDisabled =
          isGenerating || !!selectingPreset || !!selectingRoster;
        const ultimateSkill = saved.skills.find(
          (s) => s.isUltimate || s.type === "ultimate",
        );
        return (
          <motion.div
            key={saved.rosterId}
            whileHover={!isDisabled ? { scale: 1.03, y: -2 } : {}}
            className="relative group rounded-lg overflow-hidden border-2 transition-all bg-[#0B0C10]/80"
            style={{
              borderColor: `rgba(${themeColorHex}, 0.35)`,
              boxShadow: `0 0 0 0 rgba(${themeColorHex}, 0)`,
            }}
          >
            <button
              type="button"
              onClick={() => handleSelectRosterCharacter(saved)}
              disabled={isDisabled}
              className="w-full text-left disabled:opacity-50"
            >
              <div className="relative aspect-square overflow-hidden bg-[#1F2833]">
                {saved.imageUrl ? (
                  <img
                    src={saved.imageUrl}
                    alt={saved.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-3xl font-black font-display"
                    style={{ color: themeColor }}
                  >
                    {saved.name[0]}
                  </div>
                )}
                {/* 顶部选择提示条 */}
                <div
                  className="absolute top-0 left-0 right-0 h-6 flex items-center px-2 text-[9px] tracking-widest font-display opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background: `linear-gradient(to bottom, rgba(${themeColorHex}, 0.85), transparent)`,
                    color: "#0B0C10",
                  }}
                >
                  ▸ 出战
                </div>
                {isSelecting && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="w-6 h-6 border-2 border-transparent rounded-full"
                      style={{ borderTopColor: themeColor }}
                    />
                  </div>
                )}
                {/* 底部名字 + 大招标签 */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-2">
                  <div
                    className="text-xs font-bold font-display truncate"
                    style={{ color: themeColor }}
                  >
                    {saved.name}
                  </div>
                  {ultimateSkill && (
                    <div className="flex items-center gap-1 text-[9px] text-[#FFD700]/90 truncate mt-0.5">
                      <Flame size={9} />
                      <span className="truncate">{ultimateSkill.name}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                <span className="flex items-center gap-1 text-[#C5C6C7]">
                  <Heart size={9} className="text-pink-400" /> {saved.maxHp}
                </span>
                <span className="flex items-center gap-1 text-[#C5C6C7]">
                  <Zap size={9} className="text-yellow-400" /> {saved.attack}
                </span>
                <span className="flex items-center gap-1 text-[#C5C6C7]">
                  <Shield size={9} className="text-blue-400" /> {saved.defense}
                </span>
                <span className="flex items-center gap-1 text-[#C5C6C7]">
                  <Gauge size={9} className="text-green-400" /> {saved.speed}
                </span>
              </div>
            </button>
            {/* 详情按钮 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInspectingRosterId(saved.rosterId);
              }}
              disabled={isDisabled}
              aria-label={`查看 ${saved.name} 详情`}
              className="absolute top-1 left-1 w-6 h-6 rounded bg-black/65 text-[#8a8d91] flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-[#66FCF1] disabled:opacity-0"
            >
              <Info size={12} />
            </button>
            {/* 删除按钮 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`确定要将 ${saved.name} 移出麾下吗？`)) {
                  removeCharacter(saved.rosterId);
                }
              }}
              disabled={isDisabled}
              aria-label={`移除 ${saved.name}`}
              className="absolute top-1 right-1 w-6 h-6 rounded bg-black/65 text-[#8a8d91] flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-[#FF003C] disabled:opacity-0"
            >
              <Trash2 size={12} />
            </button>
          </motion.div>
        );
      })}
    </div>
  );

  const renderPresetGrid = (items: typeof presetCharacters) => (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
      {items.map((preset) => {
        const isSelecting = selectingPreset === preset.name;
        const isDisabled =
          isGenerating || !!selectingPreset || !!selectingRoster;
        const ultimateSkill = preset.skills?.find(
          (s) => s.isUltimate || s.type === "ultimate",
        );
        return (
          <motion.div
            key={preset.name}
            whileHover={!isDisabled ? { scale: 1.03, y: -2 } : {}}
            className="relative group rounded-lg overflow-hidden border-2 transition-all bg-[#0B0C10]/80"
            style={{
              borderColor: `rgba(${themeColorHex}, 0.35)`,
            }}
          >
            <button
              type="button"
              onClick={() => handleSelectPreset(preset)}
              disabled={isDisabled}
              className="w-full text-left disabled:opacity-50"
            >
              <div className="relative aspect-square overflow-hidden bg-[#1F2833]">
                {preset.imageUrl ? (
                  <img
                    src={preset.imageUrl}
                    alt={preset.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-3xl font-black font-display"
                    style={{ color: themeColor }}
                  >
                    {preset.name[0]}
                  </div>
                )}
                {/* hover 顶部提示 */}
                <div
                  className="absolute top-0 left-0 right-0 h-6 flex items-center px-2 text-[9px] tracking-widest font-display opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background: `linear-gradient(to bottom, rgba(${themeColorHex}, 0.85), transparent)`,
                    color: "#0B0C10",
                  }}
                >
                  ▸ {isRecruitMode ? "收纳" : "出战"}
                </div>
                {/* 选中加载遮罩 */}
                {isSelecting && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="w-6 h-6 border-2 border-transparent rounded-full"
                      style={{ borderTopColor: themeColor }}
                    />
                  </div>
                )}
                {/* 名称 + 大招 */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-2">
                  <div
                    className="text-xs font-bold font-display truncate"
                    style={{ color: themeColor }}
                  >
                    {preset.name}
                  </div>
                  {ultimateSkill && (
                    <div className="flex items-center gap-1 text-[9px] text-[#FFD700]/90 truncate mt-0.5">
                      <Flame size={9} />
                      <span className="truncate">{ultimateSkill.name}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* 数值 */}
              <div className="p-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px]">
                <span className="flex items-center gap-1 text-[#C5C6C7]">
                  <Heart size={8} className="text-pink-400" /> {preset.hp}
                </span>
                <span className="flex items-center gap-1 text-[#C5C6C7]">
                  <Zap size={8} className="text-yellow-400" /> {preset.attack}
                </span>
                <span className="flex items-center gap-1 text-[#C5C6C7]">
                  <Shield size={8} className="text-blue-400" /> {preset.defense}
                </span>
                <span className="flex items-center gap-1 text-[#C5C6C7]">
                  <Gauge size={8} className="text-green-400" /> {preset.speed}
                </span>
              </div>
            </button>
          </motion.div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden grid-bg">
      <ParticleField count={25} colors={[themeColor, "#FFD700"]} />
      <BackButton
        onClick={handleBack}
        color={themeColor}
        className="absolute left-6 top-6 z-20"
      />

      <motion.div
        animate={{ x: [0, 60, 0], y: [0, -20, 0] }}
        transition={{ duration: 14, repeat: Infinity }}
        className="absolute top-10 right-10 w-72 h-72 rounded-full blur-[120px] z-0 opacity-40"
        style={{ backgroundColor: themeColor }}
      />

      <div
        className="absolute inset-0 z-0 opacity-10 pointer-events-none scanlines"
        style={{
          background: `radial-gradient(circle at center, rgba(${themeColorHex}, 0.5) 0%, transparent 70%)`,
        }}
      />

      <motion.div
        key={phase}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="z-10 w-full max-w-2xl bg-[#1F2833]/80 backdrop-blur-md border-2 rounded-xl p-8 shadow-2xl relative corner-frame crt-flicker"
        style={{
          borderColor: themeColor,
          color: themeColor,
          boxShadow: `0 0 30px rgba(${themeColorHex}, 0.3), inset 0 0 30px rgba(${themeColorHex}, 0.05)`,
        }}
      >
        <div
          className="flex justify-between items-center mb-8 border-b pb-4"
          style={{ borderColor: `rgba(${themeColorHex}, 0.2)` }}
        >
          <h2
            data-text={playerName}
            className="text-3xl font-black italic tracking-widest font-display glitch-text"
            style={{ color: themeColor }}
          >
            {playerName}
          </h2>
          <div className="flex flex-col items-end">
            <div className="text-[10px] text-[#8a8d91] tracking-widest">
              {isRecruitMode ? "RECRUIT MODE" : "SPARRING PICK"}
            </div>
            <div className="text-xs flex items-center gap-2 text-[#C5C6C7] mt-1">
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: themeColor }}
              />
              {isRecruitMode
                ? "生成后确认收下"
                : isPlayer1
                  ? "选择 P1 出战角色"
                  : "P1 已就绪 · 选择 P2"}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 bg-red-900/30 border border-red-500/50 text-red-400 rounded text-sm flex items-center gap-2"
            >
              <span className="text-lg">⚠</span> {error}
            </motion.div>
          )}
        </AnimatePresence>

        {isRecruitMode ? (
          <div className="space-y-6">
            <div>
              <label
                className="block text-sm font-semibold mb-2 tracking-wider"
                style={{ color: themeColor }}
              >
                ▸ 描述要招募的核心角色
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isGenerating}
                placeholder="例如：一个穿着机甲的退休外星宇航员，手里拿着一把生锈的光剑，绝招是‘星际碰瓷’..."
                className="w-full bg-[#0B0C10]/80 border rounded p-4 text-[#C5C6C7] focus:outline-none transition-all resize-none font-mono"
                style={{ borderColor: `rgba(${themeColorHex}, 0.4)` }}
                onFocus={(e) => (e.target.style.borderColor = themeColor)}
                onBlur={(e) =>
                  (e.target.style.borderColor = `rgba(${themeColorHex}, 0.4)`)
                }
              />
              <div className="text-[10px] text-[#8a8d91] mt-1 flex justify-between">
                <span>生成后放大预览 · 确认后收入麾下 · 60 秒冷却</span>
                <span>{description.length} chars</span>
              </div>
            </div>

            <motion.button
              onClick={handleGenerate}
              disabled={isGenerating || cooldownLeftMs > 0}
              whileHover={
                !isGenerating && cooldownLeftMs <= 0 ? { scale: 1.02 } : {}
              }
              whileTap={
                !isGenerating && cooldownLeftMs <= 0 ? { scale: 0.98 } : {}
              }
              className="w-full py-4 rounded font-black tracking-[0.3em] transition-all disabled:opacity-70 flex justify-center items-center gap-3 relative overflow-hidden"
              style={{
                backgroundColor: isGenerating
                  ? `rgba(${themeColorHex}, 0.05)`
                  : `rgba(${themeColorHex}, 0.1)`,
                border: `2px solid ${themeColor}`,
                color: themeColor,
                boxShadow:
                  isGenerating || cooldownLeftMs > 0
                    ? "none"
                    : `0 0 20px rgba(${themeColorHex}, 0.4)`,
              }}
            >
              {isGenerating ? (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={avatarHint || loadingStep}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-2"
                  >
                    <StepIcon className="animate-spin" size={18} />
                    {avatarHint || LOADING_STEPS[loadingStep].text}
                  </motion.div>
                </AnimatePresence>
              ) : (
                <>
                  <Sparkles size={18} />
                  {cooldownLeftMs > 0
                    ? `冷却中 ${cooldownLeftSec}s`
                    : "招募角色"}
                  <Sparkles size={18} />
                </>
              )}
              {isGenerating && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  style={{
                    background: `linear-gradient(90deg, transparent, rgba(${themeColorHex}, 0.4), transparent)`,
                  }}
                />
              )}
            </motion.button>
          </div>
        ) : (
          <div className="rounded-lg border border-[#45A29E]/30 bg-[#0B0C10]/60 p-4 text-xs text-[#8a8d91] leading-relaxed">
            PVP 是切磋模式。要生成并培养自己的角色，请从主页进入「招募新角色」。
          </div>
        )}

        {!isRecruitMode && !isPlayer1 && player1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 pt-6 border-t border-[#45A29E]/20"
          >
            <p className="text-sm text-[#8a8d91] mb-3 tracking-wider">
              ▸ 已就绪的对手
            </p>
            <div className="flex items-center gap-5 bg-[#0B0C10]/80 p-4 rounded-lg border-2 border-[#66FCF1]/50 relative overflow-hidden">
              {player1.imageUrl ? (
                <img
                  src={player1.imageUrl}
                  alt="P1"
                  className="w-20 h-20 rounded-lg object-cover border-2 border-[#66FCF1]"
                />
              ) : (
                <div className="w-20 h-20 bg-[#1F2833] rounded-lg border-2 border-[#66FCF1] flex items-center justify-center text-2xl font-black text-[#66FCF1] font-display">
                  {player1.name?.[0] || "P"}
                </div>
              )}
              <div className="flex-1">
                <div className="text-lg font-bold text-[#66FCF1] font-display">
                  {player1.name}
                </div>
                <div className="flex gap-4 text-sm text-[#8a8d91] mt-2">
                  <span className="flex items-center gap-1">
                    <Heart size={14} className="text-pink-400" /> {player1.hp}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap size={14} className="text-yellow-400" />{" "}
                    {player1.attack}
                  </span>
                </div>
              </div>
              <div className="text-xs text-[#66FCF1] tracking-wider animate-pulse">
                READY
              </div>
            </div>
          </motion.div>
        )}

        {/* 麾下角色：本机持久化保存的已生成角色 */}
        {!isRecruitMode && (
          <div
            className="mt-8 pt-6 border-t"
            style={{ borderColor: `rgba(${themeColorHex}, 0.2)` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => setIsRosterOpen((v) => !v)}
                className="flex items-center gap-2 group flex-1 min-w-0"
                aria-expanded={isRosterOpen}
              >
                <UsersRound size={14} style={{ color: themeColor }} />
                <h3
                  className="text-xs font-bold tracking-wider"
                  style={{ color: themeColor }}
                >
                  我的麾下 · LOCAL ROSTER
                </h3>
                <span className="text-[9px] text-[#8a8d91]">
                  {roster.length}/24
                </span>
                <motion.div
                  animate={{ rotate: isRosterOpen ? 180 : 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ color: themeColor }}
                >
                  <ChevronDown size={14} />
                </motion.div>
              </button>
              {roster.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPhase("ROSTER_VIEW")}
                  className="flex items-center gap-1 text-[10px] tracking-wider px-2 py-1 rounded border transition-all hover:bg-[#66FCF1]/10"
                  style={{
                    color: themeColor,
                    borderColor: `rgba(${themeColorHex}, 0.4)`,
                  }}
                >
                  查看全部
                  <ArrowRight size={10} />
                </button>
              )}
            </div>
            {isRosterOpen && roster.length > 0 && (
              <div className="text-[10px] text-[#8a8d91] mb-2 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: themeColor }}
                  />
                  点击卡片直接出战
                </span>
                <span className="flex items-center gap-1">
                  <Info size={10} /> 查看详情
                </span>
                <span className="flex items-center gap-1">
                  <Trash2 size={10} /> 移出麾下
                </span>
              </div>
            )}
            <AnimatePresence initial={false}>
              {isRosterOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  {roster.length > 0 ? (
                    renderRosterGrid()
                  ) : (
                    <div
                      className="h-24 rounded-lg border border-dashed flex items-center justify-center text-xs text-[#8a8d91]"
                      style={{ borderColor: `rgba(${themeColorHex}, 0.25)` }}
                    >
                      暂无麾下角色 · 请先回主页招募
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {!isRecruitMode && (
          <div
            className="mt-8 pt-6 border-t"
            style={{ borderColor: `rgba(${themeColorHex}, 0.2)` }}
          >
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={14} style={{ color: themeColor }} />
              <h3
                className="text-xs font-bold tracking-wider"
                style={{ color: themeColor }}
              >
                切磋候选 · SPARRING PRESETS
              </h3>
              <span className="text-[9px] text-[#8a8d91] ml-auto">
                仅用于 PVP 选人
              </span>
            </div>
            {renderPresetGrid(pvpPresets)}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {pendingRecruit && (
          <RecruitPreviewModal
            key="pending-recruit"
            character={pendingRecruit}
            themeColor={themeColor}
            themeColorHex={themeColorHex}
            imageFailed={pendingRecruitImageFailed}
            onImageFailed={() => setPendingRecruitImageFailed(true)}
            onCancel={handleCancelRecruit}
            onConfirm={handleConfirmRecruit}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(() => {
          const inspecting = inspectingRosterId
            ? roster.find((r) => r.rosterId === inspectingRosterId)
            : null;
          if (!inspecting) return null;
          return (
            <CharacterDetailModal
              key={inspecting.rosterId}
              character={inspecting}
              themeColor={themeColor}
              onClose={() => setInspectingRosterId(null)}
              onRemove={() => {
                removeCharacter(inspecting.rosterId);
                setInspectingRosterId(null);
              }}
            />
          );
        })()}
      </AnimatePresence>
    </div>
  );
};
