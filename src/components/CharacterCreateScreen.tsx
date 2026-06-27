import React, { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import {
  isRosterCharacterEvolutionLocked,
  isRosterCharacterRecruitLocked,
  isRosterCharacterUnavailable,
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
  const {
    roster,
    removeCharacter,
    recruitCharacter,
    createPendingRecruit,
    completePendingRecruit,
    failPendingRecruit,
  } = useRosterStore();
  const cfg: AIConfig = {
    apiKey,
    baseUrl,
    model,
    apiMode,
  };
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

  const startBackgroundRecruit = (
    rosterId: string,
    sourceDescription: string,
  ) => {
    void (async () => {
      try {
        const charData = await generateCharacter(cfg, sourceDescription);
        const avatar = await loadGeneratedAvatar(() =>
          generateCharacterImage(
            cfg,
            charData.imagePrompt || sourceDescription,
            1,
          ),
        );

        charData.imageUrl = avatar.ready
          ? await cacheImageUrlAsDataUrl(avatar.url, { maxSize: 512 })
          : avatar.url;
        charData.sourceDescription = sourceDescription;

        const recruited = completePendingRecruit(
          rosterId,
          charData,
          sourceDescription,
        );
        if (!recruited) return;

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
            cfg,
          );
        } catch (prefetchErr) {
          console.warn("recruit stage1 prefetch failed", prefetchErr);
        }
      } catch (err: unknown) {
        failPendingRecruit(
          rosterId,
          err instanceof Error
            ? err.message
            : "生成失败，请检查 API Key 或网络连接",
        );
      }
    })();
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
    const sourceDescription = description.trim();

    if (isRecruitMode) {
      const pending = createPendingRecruit(sourceDescription);
      const generatedAt = Date.now();
      window.localStorage.setItem(RECRUIT_COOLDOWN_KEY, String(generatedAt));
      setCooldownUntil(generatedAt + RECRUIT_COOLDOWN_MS);
      setNow(generatedAt);
      setDescription("");
      startBackgroundRecruit(pending.rosterId, sourceDescription);
      setPhase("MODE_SELECT");
      return;
    }

    setIsGenerating(true);
    const interval = cycleLoadingSteps();
    const player: 1 | 2 = isPlayer1 ? 1 : 2;

    try {
      setAvatarHint("正在生成角色数值...");
      const charData = await generateCharacter(cfg, sourceDescription);

      setAvatarHint("角色档案就绪，正在生成头像...");
      const avatar = await loadGeneratedAvatar(() =>
        generateCharacterImage(
          cfg,
          charData.imagePrompt || sourceDescription,
          player,
        ),
      );

      charData.imageUrl = avatar.ready
        ? await cacheImageUrlAsDataUrl(avatar.url, { maxSize: 512 })
        : avatar.url;
      charData.sourceDescription = sourceDescription;

      if (isPlayer1) {
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

  const handleSelectRosterCharacter = async (
    saved: (typeof roster)[number],
  ) => {
    if (isRosterCharacterRecruitLocked(saved)) {
      setError(
        saved.recruitLock?.status === "failed"
          ? saved.recruitLock.error || "该角色生成失败，请移除后重新招募。"
          : "该角色正在后台生成中，完成后才能出战。",
      );
      return;
    }
    if (isRosterCharacterEvolutionLocked(saved)) {
      setError("该角色正在进化图后台更新中，完成后才能出战。");
      return;
    }
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
        const evolutionLocked = isRosterCharacterEvolutionLocked(saved);
        const recruitLocked = isRosterCharacterRecruitLocked(saved);
        const isDisabled =
          isRosterCharacterUnavailable(saved) ||
          isGenerating ||
          !!selectingPreset ||
          !!selectingRoster;
        const ultimateSkill = saved.skills.find(
          (s) => s.isUltimate || s.type === "ultimate",
        );
        const lockText = recruitLocked
          ? saved.recruitLock?.status === "failed"
            ? "生成失败"
            : "后台生成中"
          : "进化更新中";
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
                {(evolutionLocked || recruitLocked) && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <div className="rounded border border-[#FFD700]/60 bg-[#0B0C10]/85 px-2 py-1 text-[9px] font-black tracking-widest text-[#FFD700]">
                      {lockText}
                    </div>
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
                ? "提交后后台生成"
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
                <span>提交后后台生成 · 完成后自动收入麾下 · 60 秒冷却</span>
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
                    : "后台招募"}
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
