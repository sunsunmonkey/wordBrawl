import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Heart,
  Zap as ZapIcon,
  Shield,
  Gauge,
  Lock,
  Sparkles,
  Sword,
  Bot,
} from "lucide-react";
import { CharacterAvatar } from "./CharacterAvatar";
import { useGameStore } from "../store/useGameStore";
import {
  isRosterCharacterEvolutionLocked,
  isRosterCharacterRecruitLocked,
  isRosterCharacterUnavailable,
  useRosterStore,
  type EvolutionReplay,
  type RosterCharacter,
} from "../store/useRosterStore";
import { useTowerStore } from "../store/useTowerStore";
import { ParticleField } from "./ParticleField";
import {
  TOWER_TOTAL_LAYERS,
  getScaledTowerBoss,
  getTowerBossMeta,
  towerBossDefs,
} from "../data/towerBosses";
import {
  EVOLUTION_STAT_BONUS,
  evolutionLabel,
  evolutionStars,
  getNextEvolutionProgress,
  getTowerLayerInAscension,
  towerAscensionLabel,
  xpProgress,
} from "../utils/towerProgress";
import { resetCharacterRuntimeState } from "../store/useRosterStore";
import { BackButton } from "./BackButton";
import { EvolutionAnimation } from "./EvolutionAnimation";

interface ReplayBattle {
  character: RosterCharacter;
  layer: number;
  replay: EvolutionReplay;
}

export const TowerScreen: React.FC = () => {
  const setPhase = useGameStore((s) => s.setPhase);
  const setPlayer1 = useGameStore((s) => s.setPlayer1);
  const setPlayer2 = useGameStore((s) => s.setPlayer2);
  const setBattleMode = useGameStore((s) => s.setBattleMode);
  const setTowerLayer = useGameStore((s) => s.setTowerLayer);
  const setTowerRosterId = useGameStore((s) => s.setTowerRosterId);
  const towerAutoMode = useGameStore((s) => s.towerAutoMode);
  const setTowerAutoMode = useGameStore((s) => s.setTowerAutoMode);
  const initialTowerRosterId = useGameStore((s) => s.towerRosterId);
  const initialTowerLayer = useGameStore((s) => s.towerLayer);
  const setLastSummary = useTowerStore((s) => s.setLastSummary);
  const setLastRosterId = useTowerStore((s) => s.setLastRosterId);
  const setLastResult = useTowerStore((s) => s.setLastResult);
  const resetPending = useTowerStore((s) => s.resetPending);

  const roster = useRosterStore((s) => s.roster);
  const updateCharacter = useRosterStore((s) => s.updateCharacter);
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(
    () => {
      const stored =
        initialTowerRosterId &&
        roster.some((char) => char.rosterId === initialTowerRosterId)
          ? initialTowerRosterId
          : null;
      return stored ?? roster[0]?.rosterId ?? null;
    },
  );
  const selectedChar = useMemo(
    () => roster.find((c) => c.rosterId === selectedRosterId) || null,
    [roster, selectedRosterId],
  );
  const selectedLocked = isRosterCharacterUnavailable(selectedChar);

  const [selectedLayer, setSelectedLayer] = useState<number>(() => {
    const initialChar =
      (initialTowerRosterId &&
        roster.find((char) => char.rosterId === initialTowerRosterId)) ||
      roster[0] ||
      null;
    return initialChar?.tower.nextLayer ?? initialTowerLayer ?? 1;
  });
  const [pendingReplayBattle, setPendingReplayBattle] =
    useState<ReplayBattle | null>(null);
  const [replayResultBattle, setReplayResultBattle] =
    useState<ReplayBattle | null>(null);

  const beginChallenge = (char: RosterCharacter, layer: number) => {
    const boss = getScaledTowerBoss(layer, char);
    if (!boss) return;

    const player = resetCharacterRuntimeState(char);
    setBattleMode("pve_tower");
    setTowerLayer(layer);
    setTowerRosterId(char.rosterId);
    setPlayer1(player);
    setPlayer2(resetCharacterRuntimeState(boss));
    setLastSummary(null);
    setLastRosterId(char.rosterId);
    setLastResult(null);
    resetPending();
    useGameStore.setState({ battleLogs: [], currentTurn: 0, winner: null });
    setPhase("BATTLE_ARENA");
  };

  const startChallenge = () => {
    if (!selectedChar || selectedLocked) return;
    if (selectedChar.pendingEvolutionReplay) {
      setPendingReplayBattle({
        character: selectedChar,
        layer: selectedLayer,
        replay: selectedChar.pendingEvolutionReplay,
      });
      return;
    }
    beginChallenge(selectedChar, selectedLayer);
  };

  const finishReplayAnimation = () => {
    const pending = pendingReplayBattle;
    if (!pending) return;
    setPendingReplayBattle(null);
    setReplayResultBattle(pending);
  };

  const continueAfterReplayResult = () => {
    const result = replayResultBattle;
    if (!result) return;
    updateCharacter(result.character.rosterId, (current) => ({
      ...current,
      pendingEvolutionReplay: undefined,
    }));
    const fresh =
      useRosterStore
        .getState()
        .roster.find((char) => char.rosterId === result.character.rosterId) ??
      result.character;
    setReplayResultBattle(null);
    beginChallenge(
      { ...fresh, pendingEvolutionReplay: undefined },
      result.layer,
    );
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#05060a] text-white">
      {/* 背景层 */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute -top-40 -left-40 w-[55vw] h-[55vw] rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(255,215,0,0.28) 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[55vw] h-[55vw] rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(255,107,157,0.22) 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,215,0,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,0.7) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          }}
        />
      </div>

      <ParticleField count={20} colors={["#FFD700", "#66FCF1"]} />

      {/* 巨型水印 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden select-none"
      >
        <div
          className="font-display font-black leading-none tracking-tighter text-white/[0.02]"
          style={{ fontSize: "min(30vw, 520px)", letterSpacing: "-0.06em" }}
        >
          TOWER
        </div>
      </div>

      {/* 顶部 HUD */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 md:px-10 py-5">
        <div className="flex items-center gap-3">
          <BackButton onClick={() => setPhase("MODE_SELECT")} color="#FFD700" />
          <div className="hidden md:flex items-center gap-3 ml-2 text-[10px] font-mono tracking-[0.4em] text-white/40">
            <div className="w-6 h-[1px] bg-[#FFD700]" />
            <span>WORD-SPIRIT / TOWER</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono tracking-[0.35em] text-[#FFD700]/70">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FFD700] animate-pulse" />
            ENDLESS ASCENSION
          </div>
          <button
            type="button"
            onClick={() => setTowerAutoMode(!towerAutoMode)}
            className="flex items-center gap-1.5 px-3 py-2 border text-[10px] font-mono font-black tracking-[0.28em] transition-all"
            style={{
              borderColor: towerAutoMode
                ? "rgba(102,252,241,0.7)"
                : "rgba(255,255,255,0.15)",
              color: towerAutoMode ? "#66FCF1" : "rgba(255,255,255,0.5)",
              background: towerAutoMode
                ? "rgba(102,252,241,0.08)"
                : "rgba(0,0,0,0.3)",
            }}
          >
            <Bot size={12} />
            AUTO {towerAutoMode ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* 主内容 */}
      <div className="relative z-10 min-h-screen px-6 md:px-10 lg:px-16 pt-20 pb-16 max-w-[1400px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {/* 编辑式标题 */}
          <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-[1px] bg-[#FFD700]" />
                <span className="text-[10px] tracking-[0.5em] text-[#FFD700]/90 font-mono">
                  CHAPTER · 03
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
                  九层
                </span>
                <span
                  className="text-[#FFD700]"
                  style={{ textShadow: "0 0 30px rgba(255,215,0,0.55)" }}
                >
                  塔
                </span>
              </h1>
              <div
                className="mt-1 font-mono font-bold text-white/25"
                style={{
                  fontSize: "clamp(0.6rem, 0.9vw, 0.85rem)",
                  letterSpacing: "0.4em",
                }}
              >
                A S C E N D · F O R G E · E V O L V E
              </div>
            </div>
            <div className="text-right text-[10px] font-mono tracking-widest text-white/30">
              <div>ROSTER {String(roster.length).padStart(2, "0")} / 24</div>
              <div className="text-[#FFD700]/70 mt-1">
                {selectedChar
                  ? `SELECTED · ${selectedChar.name}`
                  : "NO SELECTION"}
              </div>
            </div>
          </div>

          {roster.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#FFD700]/30 p-12 text-center text-sm text-[#8a8d91]">
              <Sword size={32} className="mx-auto opacity-40 mb-3" />
              当前没有麣下角色。请先回主页召唤一位词灵。
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
              {/* 左栏：出战角色 + 层选择 */}
              <div className="flex flex-col gap-5 min-w-0">
                {/* 出战角色 */}
                <div className="relative border border-[#FFD700]/30 bg-black/30 backdrop-blur-sm p-4 md:p-5 overflow-hidden">
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
                  <div className="mb-3 flex items-center gap-3 pb-2 border-b border-white/5">
                    <span className="w-1 h-1 bg-[#FFD700]" />
                    <span className="text-[9px] font-mono tracking-[0.4em] text-[#FFD700]/75">
                      N°01 · CHOOSE ROSTER
                    </span>
                    <span className="ml-auto text-[9px] font-mono tracking-widest text-white/30">
                      {roster.length} / 24
                    </span>
                  </div>
                  <div className="max-h-[440px] overflow-y-auto pr-1">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                      {roster.map((char) => {
                        const isActive = char.rosterId === selectedRosterId;
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
                          : char.pendingEvolutionReplay
                            ? "进化演出待回放"
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
                            onClick={() => {
                              setSelectedRosterId(char.rosterId);
                              setSelectedLayer(char.tower.nextLayer || 1);
                            }}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.97 }}
                            className="group relative text-left rounded-lg overflow-hidden border bg-[#0B0C10]/80"
                            style={{
                              borderColor: isActive
                                ? "#FFD700"
                                : "rgba(255,215,0,0.22)",
                              boxShadow: isActive
                                ? "0 0 18px rgba(255,215,0,0.45)"
                                : "none",
                            }}
                          >
                            <div className="relative aspect-[4/3]">
                              <CharacterAvatar
                                imageUrl={char.imageUrl}
                                name={char.name}
                                themeColor="#FFD700"
                                className="w-full h-full transition-transform group-hover:scale-105"
                                iconSize={32}
                              />
                              {isActive && (
                                <div className="absolute inset-0 border-2 border-[#FFD700] shadow-[inset_0_0_18px_rgba(255,215,0,0.35)]" />
                              )}
                              <div className="absolute top-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-[#FFD700]">
                                Lv.{char.level}
                              </div>
                              {char.evolutionStage > 0 && (
                                <div className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-[#FFD700]">
                                  {"★".repeat(
                                    evolutionStars(char.evolutionStage),
                                  )}
                                </div>
                              )}
                              <div className="absolute right-1.5 bottom-9 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-[#66FCF1]">
                                L{highestLayer}
                              </div>
                              {(evolutionLocked || recruitLocked) && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/68">
                                  <div className="rounded border border-[#FFD700]/60 bg-[#0B0C10]/85 px-2 py-1 text-[9px] font-black tracking-widest text-[#FFD700]">
                                    <Lock size={10} className="mr-1 inline" />
                                    {recruitLocked
                                      ? char.recruitLock?.status === "failed"
                                        ? "创造失败"
                                        : "创造中"
                                      : "进化更新中"}
                                  </div>
                                </div>
                              )}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-2">
                                <div className="truncate text-xs font-black font-display text-[#FFD700]">
                                  {char.name}
                                </div>
                                <div className="truncate text-[9px] text-[#C5C6C7]">
                                  {evolutionLabel(char.evolutionStage)}
                                </div>
                              </div>
                            </div>
                            <div className="p-2">
                              <div className="h-1 rounded bg-[#1F2833] overflow-hidden">
                                <div
                                  className="h-full bg-[#FFD700]"
                                  style={{
                                    width: `${Math.round(progress.ratio * 100)}%`,
                                  }}
                                />
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[9px] text-[#8a8d91] gap-2">
                                <span className="truncate">{nextEvoText}</span>
                                <span className="tabular-nums shrink-0 text-[#FFD700]/80">
                                  {progress.need
                                    ? `${progress.current}/${progress.need}`
                                    : "MAX"}
                                </span>
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 层选择 */}
                <div className="relative border border-[#FFD700]/30 bg-black/30 backdrop-blur-sm p-4 md:p-5 overflow-hidden">
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
                  <div className="mb-3 flex items-center gap-3 pb-2 border-b border-white/5">
                    <span className="w-1 h-1 bg-[#FFD700]" />
                    <span className="text-[9px] font-mono tracking-[0.4em] text-[#FFD700]/75">
                      N°02 · SELECT LAYER
                    </span>
                    <span className="ml-auto text-[9px] font-mono tracking-widest text-white/30">
                      {towerAscensionLabel(selectedLayer)}
                    </span>
                  </div>
                  <div className="grid grid-cols-9 gap-2">
                    {towerBossDefs.map((def, index) => {
                      const localLayer = index + 1;
                      const baseLayer = selectedChar?.tower.nextLayer ?? 1;
                      const currentRankStart =
                        Math.floor(
                          (Math.max(1, baseLayer) - 1) / TOWER_TOTAL_LAYERS,
                        ) *
                          TOWER_TOTAL_LAYERS +
                        1;
                      const layer = currentRankStart + index;
                      const highestEndless =
                        selectedChar?.tower.highestEndlessLayer ??
                        selectedChar?.tower.highestCleared ??
                        0;
                      const unlocked = selectedChar
                        ? layer <= highestEndless + 1
                        : localLayer === 1;
                      const cleared = selectedChar
                        ? layer <= highestEndless
                        : false;
                      const active = layer === selectedLayer;
                      void def;
                      return (
                        <button
                          key={layer}
                          type="button"
                          disabled={!unlocked}
                          onClick={() => setSelectedLayer(layer)}
                          className="relative aspect-square flex flex-col items-center justify-center border transition-all"
                          style={{
                            borderColor: active
                              ? "#FFD700"
                              : cleared
                                ? "rgba(102,252,241,0.55)"
                                : unlocked
                                  ? "rgba(255,215,0,0.35)"
                                  : "rgba(255,255,255,0.08)",
                            background: active
                              ? "rgba(255,215,0,0.14)"
                              : cleared
                                ? "rgba(102,252,241,0.06)"
                                : "rgba(11,12,16,0.55)",
                            boxShadow: active
                              ? "0 0 12px rgba(255,215,0,0.45)"
                              : "none",
                            opacity: unlocked ? 1 : 0.35,
                            cursor: unlocked ? "pointer" : "not-allowed",
                            color: active
                              ? "#FFD700"
                              : cleared
                                ? "#66FCF1"
                                : unlocked
                                  ? "#FFD700"
                                  : "#8a8d91",
                          }}
                        >
                          <div className="text-lg font-black font-display leading-none">
                            {localLayer}
                          </div>
                          <div className="text-[8px] font-mono tracking-widest opacity-70">
                            L{layer}
                          </div>
                          {!unlocked && (
                            <Lock
                              size={9}
                              className="absolute right-1 bottom-1 opacity-70"
                            />
                          )}
                          {cleared && !active && (
                            <Sparkles
                              size={9}
                              className="absolute right-1 bottom-1 text-[#66FCF1]"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 右栏：Boss 信息 + 挑战按钮 */}
              <div className="flex flex-col gap-4 min-w-0">
                {(() => {
                  const meta = getTowerBossMeta(selectedLayer);
                  const boss = selectedChar
                    ? getScaledTowerBoss(selectedLayer, selectedChar)
                    : getScaledTowerBoss(selectedLayer);
                  if (!meta || !boss) return null;
                  return (
                    <div className="relative border border-[#FFD700]/45 bg-black/45 backdrop-blur-sm p-5 overflow-hidden">
                      <span
                        aria-hidden
                        className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[#FFD700]"
                      />
                      <span
                        aria-hidden
                        className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[#FFD700]"
                      />
                      <span
                        aria-hidden
                        className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-[#FFD700]"
                      />
                      <span
                        aria-hidden
                        className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-[#FFD700]"
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full blur-3xl opacity-20"
                        style={{ background: "#FFD700" }}
                      />
                      <div className="relative">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
                          <span className="w-1 h-1 bg-[#FFD700]" />
                          <span className="text-[9px] font-mono tracking-[0.4em] text-[#FFD700]/75">
                            N°03 · BOSS INTEL
                          </span>
                          <span className="ml-auto text-[9px] font-mono tracking-widest text-white/30">
                            L{selectedLayer}
                          </span>
                        </div>
                        <div className="text-[10px] tracking-[0.28em] text-[#8a8d91] uppercase">
                          {towerAscensionLabel(selectedLayer)} · 第{" "}
                          {getTowerLayerInAscension(selectedLayer)} 层 ·{" "}
                          {meta.title}
                        </div>
                        <div className="mt-1 text-2xl font-black tracking-wider font-display text-[#FFD700]">
                          {meta.name}
                        </div>
                        <p className="mt-2 text-[11px] text-[#C5C6C7] leading-relaxed">
                          {boss.skills.find((s) => s.isUltimate)?.description}
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#C5C6C7]">
                          <Stat
                            icon={<Heart size={12} className="text-pink-400" />}
                            label="HP"
                            value={boss.maxHp}
                          />
                          <Stat
                            icon={
                              <ZapIcon size={12} className="text-yellow-400" />
                            }
                            label="ATK"
                            value={boss.attack}
                          />
                          <Stat
                            icon={
                              <Shield size={12} className="text-blue-400" />
                            }
                            label="DEF"
                            value={boss.defense}
                          />
                          <Stat
                            icon={
                              <Gauge size={12} className="text-green-400" />
                            }
                            label="SPD"
                            value={boss.speed}
                          />
                          {meta.critBonus && (
                            <div className="col-span-2 rounded border border-[#FFD700]/35 bg-[#FFD700]/10 px-2 py-1 text-[10px] font-black tracking-widest text-[#FFD700]">
                              ⚡ 暴击加成 +{meta.critBonus}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 选中角色摘要 */}
                {selectedChar && (
                  <div className="relative border border-[#66FCF1]/25 bg-black/30 backdrop-blur-sm p-4 flex items-center gap-3">
                    <div className="relative w-14 h-14 rounded overflow-hidden border border-[#66FCF1]/40 bg-[#1F2833] shrink-0">
                      <CharacterAvatar
                        imageUrl={selectedChar.imageUrl}
                        name={selectedChar.name}
                        themeColor="#66FCF1"
                        className="w-full h-full"
                        iconSize={22}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-mono tracking-[0.35em] text-[#66FCF1]/70">
                        SELECTED
                      </div>
                      <div className="text-sm font-black text-[#66FCF1] truncate font-display">
                        {selectedChar.name}
                      </div>
                      <div className="text-[10px] text-[#8a8d91] mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>Lv.{selectedChar.level}</span>
                        <span>
                          {evolutionLabel(selectedChar.evolutionStage)}
                        </span>
                        <span>
                          通关{" "}
                          {selectedChar.tower.highestEndlessLayer ??
                            selectedChar.tower.highestCleared}{" "}
                          层
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!selectedChar || selectedLocked}
                  onClick={startChallenge}
                  className="relative w-full flex items-center justify-center gap-3 py-4 font-display tracking-[0.3em] font-black text-sm border-2 border-[#FFD700] text-[#FFD700] hover:bg-[#FFD700] hover:text-[#0B0C10] transition-all disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[#FFD700] disabled:cursor-not-allowed overflow-hidden group"
                  style={{
                    boxShadow:
                      !selectedChar || selectedLocked
                        ? "none"
                        : "0 0 22px rgba(255,215,0,0.45)",
                  }}
                >
                  {selectedLocked ? <Lock size={16} /> : <Sword size={16} />}
                  <span>
                    {selectedLocked ? "角色暂不可用" : `挑战 L${selectedLayer}`}
                  </span>
                  {!selectedLocked && selectedChar && (
                    <ArrowRight
                      size={16}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* 底部签名 */}
        <div className="mt-16 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] font-mono tracking-[0.35em] text-white/25">
          <div className="flex items-center gap-4">
            <span>02 · HUB</span>
            <span className="w-10 h-[1px] bg-white/15" />
            <span className="text-[#FFD700]">03 · ASCEND</span>
          </div>
          <span className="hidden md:inline">登塔 · 修炼 · 进化</span>
        </div>
      </div>
      <AnimatePresence>
        {pendingReplayBattle && (
          <EvolutionAnimation
            key={`tower-replay-${pendingReplayBattle.character.rosterId}-${pendingReplayBattle.replay.stage}`}
            oldImageUrl={pendingReplayBattle.replay.oldImageUrl}
            newImageUrl={pendingReplayBattle.replay.newImageUrl}
            ultimate={pendingReplayBattle.replay.newUltimate}
            ultimateImageUrl={pendingReplayBattle.replay.newUltimate?.imageUrl}
            stage={pendingReplayBattle.replay.stage}
            characterName={pendingReplayBattle.character.name}
            readyToReveal
            onFinish={finishReplayAnimation}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {replayResultBattle && (
          <EvolutionReplayResultPanel
            battle={replayResultBattle}
            onContinue={continueAfterReplayResult}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

interface EvolutionReplayResultPanelProps {
  battle: ReplayBattle;
  onContinue: () => void;
}

const beforeEvolutionStats = (character: RosterCharacter) => ({
  maxHp: Math.max(1, character.maxHp - EVOLUTION_STAT_BONUS.maxHp),
  attack: Math.max(1, character.attack - EVOLUTION_STAT_BONUS.attack),
  defense: Math.max(0, character.defense - EVOLUTION_STAT_BONUS.defense),
  speed: Math.max(1, character.speed - EVOLUTION_STAT_BONUS.speed),
});

const EvolutionReplayResultPanel: React.FC<EvolutionReplayResultPanelProps> = ({
  battle,
  onContinue,
}) => {
  const { character, replay } = battle;
  const before = beforeEvolutionStats(character);
  const statRows = [
    {
      icon: <Heart size={13} />,
      label: "HP",
      before: before.maxHp,
      after: character.maxHp,
      color: "#FF6B9D",
    },
    {
      icon: <ZapIcon size={13} />,
      label: "ATK",
      before: before.attack,
      after: character.attack,
      color: "#FFD700",
    },
    {
      icon: <Shield size={13} />,
      label: "DEF",
      before: before.defense,
      after: character.defense,
      color: "#66FCF1",
    },
    {
      icon: <Gauge size={13} />,
      label: "SPD",
      before: before.speed,
      after: character.speed,
      color: "#7FFF9F",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[#0B0C10]/92 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="w-full max-w-4xl overflow-hidden rounded-xl border-2 border-[#FFD700]/70 bg-[#0B0C10]/95"
        style={{
          boxShadow:
            "0 0 34px rgba(255,215,0,0.36), inset 0 0 24px rgba(255,215,0,0.08)",
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#FFD700]/25 bg-[#FFD700]/10 px-4 py-3">
          <div>
            <div className="text-[10px] font-black tracking-[0.35em] text-[#FFD700]">
              FORM EVOLUTION
            </div>
            <div className="mt-1 text-2xl font-black tracking-wider text-[#FFD700] font-display">
              {evolutionLabel(replay.stage)}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-black tracking-widest text-[#FFD700]">
            <Sparkles size={16} />
            突破完成
          </div>
        </div>

        <div className="p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <EvolutionReplayPortrait
              label="进化前"
              imageUrl={replay.oldImageUrl}
              fallback={character.name}
              muted
            />
            <div className="hidden justify-center text-[#FFD700] md:flex">
              <ArrowRight size={28} />
            </div>
            <EvolutionReplayPortrait
              label="进化后"
              imageUrl={replay.newImageUrl}
              fallback={character.name}
              featured
            />
          </div>

          <div className="mt-4 rounded-lg border border-[#FFD700]/25 bg-[#1F2833]/50 p-4">
            <p className="text-sm leading-relaxed text-[#C5C6C7]">
              {replay.lore
                ? `“${replay.lore}”`
                : `${character.name} 的形态完成突破，战斗潜能被重新释放。`}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              {statRows.map((stat) => (
                <EvolutionStatChip key={stat.label} {...stat} />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded border-2 border-[#FFD700] py-3 font-black tracking-[0.28em] text-[#FFD700] transition-all hover:bg-[#FFD700] hover:text-[#0B0C10] font-display"
          >
            <Sword size={16} />
            继续挑战
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const EvolutionReplayPortrait: React.FC<{
  label: string;
  imageUrl?: string | null;
  fallback: string;
  muted?: boolean;
  featured?: boolean;
}> = ({ label, imageUrl, fallback, muted, featured }) => (
  <div
    className="relative overflow-hidden rounded-lg border bg-[#0B0C10]/70 p-3"
    style={{
      borderColor: featured ? "rgba(255,215,0,0.75)" : "rgba(69,162,158,0.35)",
      boxShadow: featured ? "0 0 20px rgba(255,215,0,0.32)" : "none",
      opacity: muted ? 0.72 : 1,
    }}
  >
    <div className="mb-2 flex items-center justify-between">
      <span className="text-[10px] font-black tracking-widest text-[#8a8d91]">
        {label}
      </span>
      {featured && (
        <span className="text-[10px] font-black tracking-widest text-[#FFD700]">
          NEW FORM
        </span>
      )}
    </div>
    <div className="relative aspect-square overflow-hidden rounded border border-[#FFD700]/25 bg-[#1F2833]">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={label}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-5xl font-black text-[#FFD700] font-display">
          {fallback[0] || "?"}
        </div>
      )}
    </div>
  </div>
);

const EvolutionStatChip: React.FC<{
  icon: React.ReactNode;
  label: string;
  before: number;
  after: number;
  color: string;
}> = ({ icon, label, before, after, color }) => {
  const delta = after - before;
  return (
    <div className="rounded border border-[#45A29E]/25 bg-[#0B0C10]/65 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] tracking-widest text-[#8a8d91]">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-sm font-black font-display" style={{ color }}>
          {after}
        </span>
        {delta > 0 && (
          <span className="text-[10px] font-black text-[#7FFF9F]">
            +{delta}
          </span>
        )}
      </div>
      <div className="mt-1 text-[10px] text-[#8a8d91]">
        {before} → {after}
      </div>
    </div>
  );
};

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: number;
}

const Stat: React.FC<StatProps> = ({ icon, label, value }) => {
  return (
    <div className="flex items-center justify-between bg-[#0B0C10]/50 px-2 py-1 rounded">
      <span className="flex items-center gap-1 text-[#8a8d91]">
        {icon}
        {label}
      </span>
      <span className="font-bold">{value}</span>
    </div>
  );
};
