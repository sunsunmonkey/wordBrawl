import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Castle,
  Heart,
  Zap as ZapIcon,
  Shield,
  Gauge,
  Lock,
  Sparkles,
  Sword,
  Bot,
  Trash2,
} from "lucide-react";
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
  const removeCharacter = useRosterStore((s) => s.removeCharacter);
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

  const handleRemoveCharacter = (char: RosterCharacter) => {
    if (!window.confirm(`确定要将 ${char.name} 移出麾下吗？`)) return;
    const remaining = roster.filter(
      (entry) => entry.rosterId !== char.rosterId,
    );
    removeCharacter(char.rosterId);
    if (selectedRosterId === char.rosterId) {
      const next = remaining[0] ?? null;
      setSelectedRosterId(next?.rosterId ?? null);
      setSelectedLayer(next?.tower.nextLayer ?? 1);
    }
    if (pendingReplayBattle?.character.rosterId === char.rosterId) {
      setPendingReplayBattle(null);
    }
    if (replayResultBattle?.character.rosterId === char.rosterId) {
      setReplayResultBattle(null);
    }
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
    <div className="min-h-screen flex flex-col items-center p-6 relative overflow-hidden grid-bg">
      <ParticleField count={28} colors={["#FFD700", "#66FCF1"]} />

      <div className="z-10 w-full max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <BackButton onClick={() => setPhase("MODE_SELECT")} color="#FFD700" />
          <div className="ml-auto flex items-center gap-2 text-[#8a8d91] text-[10px] tracking-widest">
            <span className="inline-block w-2 h-2 rounded-full bg-[#FFD700] animate-pulse" />
            TOWER · ENDLESS ASCENSION
          </div>
        </div>

        <div
          className="bg-[#1F2833]/80 backdrop-blur-md border-2 rounded-xl p-6 corner-frame"
          style={{
            borderColor: "#FFD700",
            boxShadow:
              "0 0 30px rgba(255,215,0,0.18), inset 0 0 30px rgba(255,215,0,0.05)",
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <Castle size={22} style={{ color: "#FFD700" }} />
              <h1
                className="text-2xl md:text-3xl font-black tracking-widest font-display"
                style={{ color: "#FFD700" }}
              >
                九层塔
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setTowerAutoMode(!towerAutoMode)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-[10px] font-black tracking-widest transition-all"
              style={{
                borderColor: towerAutoMode
                  ? "rgba(102,252,241,0.6)"
                  : "rgba(255,215,0,0.35)",
                color: towerAutoMode ? "#66FCF1" : "#8a8d91",
                background: towerAutoMode
                  ? "rgba(102,252,241,0.12)"
                  : "rgba(11,12,16,0.6)",
              }}
            >
              <Bot size={12} />
              {towerAutoMode ? "自动模式 ON" : "自动模式 OFF"}
            </button>
          </div>
          <div className="text-[10px] text-[#8a8d91] tracking-[0.3em] mb-6">
            ▼ 选择麾下角色 · 九层一番 · 无限修炼 ▼
          </div>

          {roster.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#FFD700]/30 p-8 text-center text-sm text-[#8a8d91]">
              <Sword size={28} className="mx-auto opacity-40 mb-2" />
              当前没有麾下角色。请先回到修炼主页，使用「招募新角色」收入麾下。
            </div>
          ) : (
            <>
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs text-[#8a8d91] tracking-widest">
                    出战角色
                  </div>
                  <div className="text-[10px] text-[#8a8d91] tracking-widest">
                    {roster.length} / 24
                  </div>
                </div>
                <div className="max-h-[420px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
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
                          ? "招募失败"
                          : "后台招募中"
                        : char.pendingEvolutionReplay
                          ? "进化演出待回放"
                          : evolutionLocked
                            ? "进化更新中"
                            : nextEvo.nextStage
                              ? nextEvo.ready
                                ? "进化待触发"
                                : `距${evolutionLabel(nextEvo.nextStage)} ${nextEvo.xpRemaining}XP`
                              : "最终形态";
                      return (
                        <motion.div
                          key={char.rosterId}
                          onClick={() => {
                            setSelectedRosterId(char.rosterId);
                            setSelectedLayer(char.tower.nextLayer || 1);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") {
                              return;
                            }
                            event.preventDefault();
                            setSelectedRosterId(char.rosterId);
                            setSelectedLayer(char.tower.nextLayer || 1);
                          }}
                          role="button"
                          tabIndex={0}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.97 }}
                          className="group relative cursor-pointer text-left rounded-lg overflow-hidden border bg-[#0B0C10]/80"
                          style={{
                            borderColor: isActive
                              ? "#FFD700"
                              : "rgba(255,215,0,0.25)",
                            boxShadow: isActive
                              ? "0 0 14px rgba(255,215,0,0.4)"
                              : "none",
                          }}
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveCharacter(char);
                            }}
                            aria-label={`移除 ${char.name}`}
                            className="absolute left-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded bg-black/70 text-[#8a8d91] opacity-0 transition-opacity hover:text-[#FF003C] focus:opacity-100 group-hover:opacity-100"
                          >
                            <Trash2 size={12} />
                          </button>
                          <div className="relative aspect-[4/3]">
                            {char.imageUrl ? (
                              <img
                                src={char.imageUrl}
                                alt={char.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-2xl font-black text-[#FFD700]">
                                {char.name[0]}
                              </div>
                            )}
                            <div className="absolute top-1 right-1 bg-black/70 text-[9px] font-bold px-1.5 py-0.5 rounded">
                              Lv.{char.level}
                            </div>
                            {char.evolutionStage > 0 && (
                              <div className="absolute top-1 left-1 bg-black/70 text-[9px] font-bold px-1.5 py-0.5 rounded text-[#FFD700]">
                                {"★".repeat(
                                  evolutionStars(char.evolutionStage),
                                )}
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
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-2">
                              <div className="text-xs font-bold truncate text-[#FFD700]">
                                {char.name}
                              </div>
                              <div className="text-[9px] text-[#8a8d91]">
                                通关{" "}
                                {char.tower.highestEndlessLayer ??
                                  char.tower.highestCleared}{" "}
                                层
                              </div>
                            </div>
                          </div>
                          <div className="px-2 py-1.5">
                            <div className="h-1 rounded bg-[#1F2833] overflow-hidden">
                              <div
                                className="h-full bg-[#FFD700]"
                                style={{
                                  width: `${Math.round(progress.ratio * 100)}%`,
                                }}
                              />
                            </div>
                            <div className="mt-1 text-[9px] text-[#8a8d91] flex justify-between gap-2">
                              <span>{evolutionLabel(char.evolutionStage)}</span>
                              <span>
                                {progress.need
                                  ? `${progress.current}/${progress.need}`
                                  : "MAX"}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-[9px] text-[#FFD700]/85">
                              {nextEvoText}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-[#8a8d91] mb-2 tracking-widest">
                  挑战层 · {towerAscensionLabel(selectedLayer)}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-9 gap-2 mb-4">
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
                    return (
                      <button
                        key={layer}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => setSelectedLayer(layer)}
                        className="aspect-square rounded-lg flex flex-col items-center justify-center border-2 transition-all text-[#FFD700]"
                        style={{
                          borderColor: active
                            ? "#FFD700"
                            : cleared
                              ? "rgba(102,252,241,0.6)"
                              : unlocked
                                ? "rgba(255,215,0,0.4)"
                                : "rgba(255,255,255,0.1)",
                          background: cleared
                            ? "rgba(102,252,241,0.08)"
                            : active
                              ? "rgba(255,215,0,0.12)"
                              : "rgba(11,12,16,0.6)",
                          opacity: unlocked ? 1 : 0.4,
                          cursor: unlocked ? "pointer" : "not-allowed",
                        }}
                      >
                        <div className="text-xl font-black font-display">
                          {localLayer}
                        </div>
                        <div className="text-[9px] text-[#8a8d91]">
                          L{layer}
                        </div>
                        {!unlocked && <Lock size={12} className="opacity-70" />}
                        {cleared && (
                          <Sparkles size={12} className="text-[#66FCF1]" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {(() => {
                  const meta = getTowerBossMeta(selectedLayer);
                  const boss = selectedChar
                    ? getScaledTowerBoss(selectedLayer, selectedChar)
                    : getScaledTowerBoss(selectedLayer);
                  if (!meta || !boss) return null;
                  return (
                    <div className="grid md:grid-cols-2 gap-4 mb-4 p-4 rounded-lg bg-[#0B0C10]/60 border border-[#FFD700]/30">
                      <div>
                        <div className="text-xs text-[#8a8d91]">
                          {towerAscensionLabel(selectedLayer)} · 第{" "}
                          {getTowerLayerInAscension(selectedLayer)} 层 ·{" "}
                          {meta.title}
                        </div>
                        <div className="text-xl font-black tracking-wider font-display text-[#FFD700]">
                          {meta.name}
                        </div>
                        <p className="text-[11px] text-[#C5C6C7] mt-2 leading-relaxed">
                          {boss.skills.find((s) => s.isUltimate)?.description}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-[#C5C6C7]">
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
                          icon={<Shield size={12} className="text-blue-400" />}
                          label="DEF"
                          value={boss.defense}
                        />
                        <Stat
                          icon={<Gauge size={12} className="text-green-400" />}
                          label="SPD"
                          value={boss.speed}
                        />
                        {meta.critBonus && (
                          <div className="col-span-2 text-[#FFD700] text-[11px]">
                            ⚡ 暴击加成 +{meta.critBonus}%
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <button
                  type="button"
                  disabled={!selectedChar || selectedLocked}
                  onClick={startChallenge}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded font-display tracking-[0.3em] font-black border-2 border-[#FFD700] text-[#FFD700] hover:bg-[#FFD700] hover:text-[#0B0C10] transition-all disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[#FFD700]"
                  style={{ boxShadow: "0 0 14px rgba(255,215,0,0.4)" }}
                >
                  {selectedLocked ? <Lock size={16} /> : <Sword size={16} />}
                  {selectedLocked
                    ? "角色暂不可用 · 稍后再试"
                    : `挑战 L${selectedLayer} · ${towerAscensionLabel(selectedLayer)}`}
                </button>
              </div>
            </>
          )}
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
