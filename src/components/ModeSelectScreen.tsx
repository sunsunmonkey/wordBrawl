import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Swords,
  Castle,
  UsersRound,
  Sparkles,
  Heart,
  Zap,
  Shield,
  Gauge,
  Plus,
  Gamepad2,
  RotateCcw,
  FlaskConical,
  Lock,
} from "lucide-react";
import { useGameStore } from "../store/useGameStore";
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
import { ParticleField } from "./ParticleField";
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
    resetGame,
  } = useGameStore();
  const roster = useRosterStore((s) => s.roster);
  const updateCharacter = useRosterStore((s) => s.updateCharacter);
  const setCurrentLayer = useTowerStore((s) => s.setCurrentLayer);
  const setLastSummary = useTowerStore((s) => s.setLastSummary);
  const setLastRosterId = useTowerStore((s) => s.setLastRosterId);
  const setLastResult = useTowerStore((s) => s.setLastResult);
  const setDebugForcedEvolutionStage = useTowerStore(
    (s) => s.setDebugForcedEvolutionStage,
  );
  const resetTowerPending = useTowerStore((s) => s.resetPending);
  const rosterCount = roster.length;
  const lead = roster[0] ?? null;
  const rosterPreview = roster.slice(0, 24);
  const hiddenRosterCount = Math.max(0, rosterCount - rosterPreview.length);
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(
    lead?.rosterId ?? null,
  );
  const [regeneratingRosterId, setRegeneratingRosterId] = useState<
    string | null
  >(null);
  const [regenerateError, setRegenerateError] = useState("");
  const selectedRoster =
    roster.find((char) => char.rosterId === selectedRosterId) ?? lead;
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
    if (!evolutionDebugAvailable && evolutionDebugMode) {
      setEvolutionDebugMode(false);
    }
  }, [evolutionDebugAvailable, evolutionDebugMode, setEvolutionDebugMode]);

  const startPvP = () => {
    resetGame();
    setBattleMode("pvp");
    setPhase("PLAYER1_CREATE");
  };

  const startRecruit = () => {
    setPhase("RECRUIT_CREATE");
  };

  const startTower = () => {
    if (!selectedRoster || selectedUnavailable) return;
    setBattleMode("pve_tower");
    setTowerRosterId(selectedRoster.rosterId);
    setTowerLayer(selectedRoster.tower.nextLayer ?? 1);
    setPhase("TOWER_HUB");
  };

  const startTraining = () => {
    setPhase("TRAINING_GROUND");
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden grid-bg">
      <ParticleField count={32} />
      <BackButton
        onClick={() => setPhase("WELCOME")}
        color="#66FCF1"
        className="absolute left-6 top-6 z-20"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-5xl"
      >
        <div className="text-center mb-8">
          <h1
            className="text-4xl md:text-5xl font-black tracking-wider font-display"
            style={{ color: "#FFD700", textShadow: "0 0 18px #FFD700" }}
          >
            修炼主页
          </h1>
          <p className="text-xs mt-3 tracking-[0.4em] text-[#8a8d91]">
            TRAIN YOUR ROSTER
          </p>
        </div>

        <div className="grid items-start gap-5 md:grid-cols-[1.45fr_0.75fr]">
          <div
            className="flex flex-col rounded-xl border-2 bg-[#1F2833]/75 p-5"
            style={{
              borderColor: "#FFD700",
              boxShadow: "0 0 28px rgba(255,215,0,0.22)",
            }}
          >
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <div>
                <div className="text-xs tracking-[0.35em] text-[#FFD700]">
                  ROSTER CORE
                </div>
                <div className="mt-1 text-2xl font-black font-display text-[#FFD700]">
                  {lead ? "核心队列" : "尚未招募"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="text-right text-[10px] text-[#8a8d91]">
                  麾下 {rosterCount}/24
                </div>
                {evolutionDebugAvailable && (
                  <button
                    type="button"
                    onClick={() => setEvolutionDebugMode(!evolutionDebugMode)}
                    className="flex items-center gap-1.5 rounded border px-2.5 py-1 text-[9px] font-black tracking-widest transition-all"
                    style={{
                      borderColor: evolutionDebugMode
                        ? "rgba(255,107,157,0.75)"
                        : "rgba(255,215,0,0.28)",
                      color: evolutionDebugMode ? "#FF6B9D" : "#8a8d91",
                      background: evolutionDebugMode
                        ? "rgba(255,107,157,0.14)"
                        : "rgba(11,12,16,0.55)",
                    }}
                  >
                    <FlaskConical size={11} />
                    DEBUG {evolutionDebugMode ? "ON" : "OFF"}
                  </button>
                )}
              </div>
            </div>

            {lead ? (
              <div className="flex flex-1 flex-col gap-4">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {rosterPreview.map((char) => {
                    const isSelected =
                      char.rosterId === selectedRoster?.rosterId;
                    const evolutionLocked =
                      isRosterCharacterEvolutionLocked(char);
                    const recruitLocked = isRosterCharacterRecruitLocked(char);
                    const progress = xpProgress(char.level, char.xp);
                    const nextEvo = getNextEvolutionProgress(
                      char.level,
                      char.xp,
                      char.evolutionStage,
                    );
                    const nextEvoText = recruitLocked
                      ? char.recruitLock?.status === "failed"
                        ? "招募失败"
                        : "后台招募中"
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
                    return (
                      <motion.button
                        key={char.rosterId}
                        type="button"
                        onClick={() => setSelectedRosterId(char.rosterId)}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        className="group overflow-hidden rounded-lg border bg-[#0B0C10]/80 text-left transition-all"
                        style={{
                          borderColor: isSelected
                            ? "#FFD700"
                            : "rgba(255, 215, 0, 0.28)",
                          boxShadow: isSelected
                            ? "0 0 18px rgba(255,215,0,0.45)"
                            : "none",
                        }}
                        aria-pressed={isSelected}
                      >
                        <div className="relative aspect-[4/3] overflow-hidden bg-[#111827]">
                          {char.imageUrl ? (
                            <img
                              src={char.imageUrl}
                              alt={char.name}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-3xl font-black text-[#FFD700]">
                              {char.name[0]}
                            </div>
                          )}
                          {(evolutionLocked || recruitLocked) && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/68">
                              <div className="rounded border border-[#FFD700]/60 bg-[#0B0C10]/85 px-2 py-1 text-[9px] font-black tracking-widest text-[#FFD700]">
                                <Lock size={10} className="mr-1 inline" />
                                {recruitLocked
                                  ? char.recruitLock?.status === "failed"
                                    ? "招募失败"
                                    : "招募中"
                                  : "进化更新中"}
                              </div>
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute inset-0 border-2 border-[#FFD700] shadow-[inset_0_0_18px_rgba(255,215,0,0.35)]" />
                          )}
                          <div className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-[#FFD700]">
                            Lv.{char.level}
                          </div>
                          <div className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-[#66FCF1]">
                            L{highestLayer}
                          </div>
                          {isSelected && !evolutionLocked && !recruitLocked && (
                            <div className="absolute right-1.5 bottom-10 rounded bg-[#FFD700] px-1.5 py-0.5 text-[9px] font-black text-[#0B0C10]">
                              出战
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-2">
                            <div className="truncate text-xs font-black font-display text-[#FFD700]">
                              {char.name}
                            </div>
                            <div className="truncate text-[9px] text-[#C5C6C7]">
                              {levelAscensionLabel(char.level)} ·{" "}
                              {evolutionLabel(char.evolutionStage)}
                            </div>
                          </div>
                        </div>

                        <div className="p-2">
                          <div className="h-1 overflow-hidden rounded bg-[#1F2833]">
                            <div
                              className="h-full bg-[#FFD700]"
                              style={{
                                width: `${Math.round(progress.ratio * 100)}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1.5 grid grid-cols-4 gap-1 text-[9px] text-[#C5C6C7]">
                            <MiniStat
                              icon={<Heart size={8} />}
                              value={char.maxHp}
                              color="#FF6B9D"
                            />
                            <MiniStat
                              icon={<Zap size={8} />}
                              value={char.attack}
                              color="#FFD700"
                            />
                            <MiniStat
                              icon={<Shield size={8} />}
                              value={char.defense}
                              color="#66FCF1"
                            />
                            <MiniStat
                              icon={<Gauge size={8} />}
                              value={char.speed}
                              color="#7FFF9F"
                            />
                          </div>
                          <div className="mt-1 truncate text-[9px] font-bold text-[#FFD700]/80">
                            {nextEvoText}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {selectedRoster && canRegenerateEvolutionImage && (
                  <div className="rounded-lg border border-[#FFD700]/45 bg-[#0B0C10]/70 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-[10px] font-black tracking-[0.28em] text-[#FFD700]">
                          进化图后台任务
                        </div>
                        <div className="mt-1 text-[11px] leading-relaxed text-[#C5C6C7]">
                          {selectedFallbackForm
                            ? `${selectedRoster.name} 当前 ${evolutionLabel(selectedFallbackForm.stage)} 使用临时形态图，可在这里重新生成真实进化图。`
                            : `${selectedRoster.name} 的进化更新可能已中断，可在这里重新生成真实进化图并解锁。`}
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
                        "后台招募失败，请移除后重新招募。"
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

                <div className="mt-auto grid shrink-0 gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <button
                    type="button"
                    onClick={startTower}
                    disabled={!selectedRoster || selectedUnavailable}
                    className="flex items-center justify-center gap-2 rounded border-2 border-[#FFD700] py-3 font-black tracking-[0.25em] text-[#FFD700] transition-all hover:bg-[#FFD700] hover:text-[#0B0C10] disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[#FFD700]"
                  >
                    <Castle size={16} />
                    {selectedRoster
                      ? selectedUnavailable
                        ? `${selectedRoster.name} · 暂不可用`
                        : `${selectedRoster.name} · 进入九层塔`
                      : "进入九层塔"}
                  </button>
                  <button
                    type="button"
                    onClick={startTraining}
                    className="flex items-center justify-center gap-2 rounded border border-[#66FCF1]/55 px-4 py-3 text-xs font-black tracking-[0.2em] text-[#66FCF1] transition-all hover:bg-[#66FCF1]/10"
                  >
                    <Gamepad2 size={15} />
                    训练场
                  </button>
                  <button
                    type="button"
                    onClick={goRoster}
                    className="flex items-center justify-center gap-2 rounded border border-[#66FCF1]/45 px-4 py-3 text-xs font-bold tracking-[0.2em] text-[#66FCF1] transition-all hover:bg-[#66FCF1]/10"
                  >
                    <UsersRound size={15} />
                    全部{hiddenRosterCount > 0 ? ` +${hiddenRosterCount}` : ""}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={startRecruit}
                className="flex w-full flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#FFD700]/45 bg-[#0B0C10]/55 text-[#FFD700] transition-all hover:bg-[#FFD700]/10"
              >
                <Plus size={30} />
                <span className="font-black tracking-[0.25em]">
                  招募第一个角色
                </span>
              </button>
            )}
          </div>

          <div className="grid gap-4">
            <ModeCard
              onClick={startRecruit}
              icon={<Sparkles size={30} />}
              title="招募新角色"
              subtitle="AI 生成 · 收入麾下"
              accent="#FFD700"
              description="描述一个想长期培养的角色，生成后进入本地麾下，1 分钟冷却。"
              highlight
            />
            <ModeCard
              onClick={startTraining}
              icon={<Gamepad2 size={30} />}
              title="娱乐训练场"
              subtitle="小游戏 · 角色升级"
              accent="#66FCF1"
              description="玩贪吃蛇和扫雷，分数结算为角色 XP。"
            />
            <ModeCard
              onClick={goRoster}
              icon={<UsersRound size={30} />}
              title="我的麾下"
              subtitle={`已收纳 ${rosterCount} 名角色`}
              accent="#66FCF1"
              description="查看档案、形态时间轴和最近塔战记录。"
            />
            <ModeCard
              onClick={startPvP}
              icon={<Swords size={30} />}
              title="切磋 PVP"
              accent="#FF003C"
              description="用已有/预设角色打一场娱乐对战，不作为养成主入口。"
            />
          </div>
        </div>
      </motion.div>

      <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-[#8a8d91]/50 tracking-widest">
        ▼ 招募 · 修炼 · 进化 ▼
      </div>
    </div>
  );
};

const MiniStat: React.FC<{
  icon: React.ReactNode;
  value: number;
  color: string;
}> = ({ icon, value, color }) => (
  <div className="flex min-w-0 items-center justify-center gap-0.5 rounded bg-[#1F2833]/70 px-1 py-0.5">
    <span className="shrink-0" style={{ color }}>
      {icon}
    </span>
    <div className="min-w-0 truncate font-bold" style={{ color }}>
      {value}
    </div>
  </div>
);

interface ModeCardProps {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  description: string;
  accent: string;
  highlight?: boolean;
}

const ModeCard: React.FC<ModeCardProps> = ({
  onClick,
  icon,
  title,
  subtitle,
  description,
  accent,
  highlight,
}) => {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="relative flex flex-col items-start gap-3 p-6 bg-[#1F2833]/70 border-2 rounded-lg text-left transition-all"
      style={{
        borderColor: highlight ? accent : `${accent}55`,
        boxShadow: highlight
          ? `0 0 30px ${accent}40, inset 0 0 20px ${accent}20`
          : `0 0 14px ${accent}20`,
      }}
    >
      <div
        className="absolute top-4 right-4 text-[10px] tracking-widest"
        style={{ color: accent }}
      >
        ENTER ▸
      </div>
      <div style={{ color: accent }}>{icon}</div>
      <div>
        <div
          className="text-2xl font-black tracking-wider font-display"
          style={{ color: accent }}
        >
          {title}
        </div>
        <div className="text-xs text-[#C5C6C7] mt-1">{subtitle}</div>
      </div>
      <p className="text-[11px] text-[#8a8d91] leading-relaxed">
        {description}
      </p>
    </motion.button>
  );
};
