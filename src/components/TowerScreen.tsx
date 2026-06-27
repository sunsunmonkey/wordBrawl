import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Castle,
  Heart,
  Zap as ZapIcon,
  Shield,
  Gauge,
  Lock,
  Sparkles,
  Sword,
  Bot,
} from "lucide-react";
import { useGameStore } from "../store/useGameStore";
import {
  isRosterCharacterEvolutionLocked,
  isRosterCharacterRecruitLocked,
  isRosterCharacterUnavailable,
  useRosterStore,
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
  evolutionLabel,
  evolutionStars,
  getNextEvolutionProgress,
  getTowerLayerInAscension,
  towerAscensionLabel,
  xpProgress,
} from "../utils/towerProgress";
import { resetCharacterRuntimeState } from "../store/useRosterStore";
import { BackButton } from "./BackButton";

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

  const startChallenge = () => {
    if (!selectedChar || selectedLocked) return;
    const boss = getScaledTowerBoss(selectedLayer, selectedChar);
    if (!boss) return;

    const player = resetCharacterRuntimeState(selectedChar);
    setBattleMode("pve_tower");
    setTowerLayer(selectedLayer);
    setTowerRosterId(selectedChar.rosterId);
    setPlayer1(player);
    setPlayer2(resetCharacterRuntimeState(boss));
    setLastSummary(null);
    setLastRosterId(selectedChar.rosterId);
    setLastResult(null);
    resetPending();
    useGameStore.setState({ battleLogs: [], currentTurn: 0, winner: null });
    setPhase("BATTLE_ARENA");
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
                        : evolutionLocked
                          ? "进化更新中"
                          : nextEvo.nextStage
                            ? nextEvo.ready
                              ? "进化待触发"
                              : `距${evolutionLabel(nextEvo.nextStage)} ${nextEvo.xpRemaining}XP`
                            : "最终形态";
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
                          className="relative text-left rounded-lg overflow-hidden border bg-[#0B0C10]/80"
                          style={{
                            borderColor: isActive
                              ? "#FFD700"
                              : "rgba(255,215,0,0.25)",
                            boxShadow: isActive
                              ? "0 0 14px rgba(255,215,0,0.4)"
                              : "none",
                          }}
                        >
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
                        </motion.button>
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
