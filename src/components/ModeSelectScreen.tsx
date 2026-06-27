import React, { useState } from "react";
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
} from "lucide-react";
import { useGameStore } from "../store/useGameStore";
import { useRosterStore } from "../store/useRosterStore";
import { ParticleField } from "./ParticleField";
import {
  evolutionLabel,
  getNextEvolutionProgress,
  levelAscensionLabel,
  xpProgress,
} from "../utils/towerProgress";
import { BackButton } from "./BackButton";

export const ModeSelectScreen: React.FC = () => {
  const {
    setPhase,
    setBattleMode,
    setTowerRosterId,
    setTowerLayer,
    resetGame,
  } = useGameStore();
  const roster = useRosterStore((s) => s.roster);
  const rosterCount = roster.length;
  const lead = roster[0] ?? null;
  const rosterPreview = roster.slice(0, 8);
  const hiddenRosterCount = Math.max(0, rosterCount - rosterPreview.length);
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(
    lead?.rosterId ?? null,
  );
  const selectedRoster =
    roster.find((char) => char.rosterId === selectedRosterId) ?? lead;

  const startPvP = () => {
    resetGame();
    setBattleMode("pvp");
    setPhase("PLAYER1_CREATE");
  };

  const startRecruit = () => {
    setPhase("RECRUIT_CREATE");
  };

  const startTower = () => {
    setBattleMode("pve_tower");
    setTowerRosterId(selectedRoster?.rosterId ?? null);
    setTowerLayer(selectedRoster?.tower.nextLayer ?? 1);
    setPhase("TOWER_HUB");
  };

  const goRoster = () => {
    setPhase("ROSTER_VIEW");
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

        <div className="grid gap-5 md:grid-cols-[1.45fr_0.75fr]">
          <div
            className="rounded-xl border-2 bg-[#1F2833]/75 p-5"
            style={{
              borderColor: "#FFD700",
              boxShadow: "0 0 28px rgba(255,215,0,0.22)",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs tracking-[0.35em] text-[#FFD700]">
                  ROSTER CORE
                </div>
                <div className="mt-1 text-2xl font-black font-display text-[#FFD700]">
                  {lead ? "核心队列" : "尚未招募"}
                </div>
              </div>
              <div className="text-right text-[10px] text-[#8a8d91]">
                麾下 {rosterCount}/24
              </div>
            </div>

            {lead ? (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {rosterPreview.map((char) => {
                    const isSelected =
                      char.rosterId === selectedRoster?.rosterId;
                    const progress = xpProgress(char.level, char.xp);
                    const nextEvo = getNextEvolutionProgress(
                      char.level,
                      char.xp,
                      char.evolutionStage,
                    );
                    const nextEvoText = nextEvo.nextStage
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
                          {isSelected && (
                            <div className="absolute inset-0 border-2 border-[#FFD700] shadow-[inset_0_0_18px_rgba(255,215,0,0.35)]" />
                          )}
                          <div className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-[#FFD700]">
                            Lv.{char.level}
                          </div>
                          <div className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-[#66FCF1]">
                            L{highestLayer}
                          </div>
                          {isSelected && (
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

                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <button
                    type="button"
                    onClick={startTower}
                    className="flex items-center justify-center gap-2 rounded border-2 border-[#FFD700] py-3 font-black tracking-[0.25em] text-[#FFD700] transition-all hover:bg-[#FFD700] hover:text-[#0B0C10]"
                  >
                    <Castle size={16} />
                    {selectedRoster
                      ? `${selectedRoster.name} · 进入九层塔`
                      : "进入九层塔"}
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
                className="flex h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[#FFD700]/45 bg-[#0B0C10]/55 text-[#FFD700] transition-all hover:bg-[#FFD700]/10"
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
              subtitle="非主线"
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
  subtitle: string;
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
