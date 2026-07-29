import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UsersRound, Sword } from "lucide-react";
import { useGameStore } from "../store/useGameStore";
import {
  isRosterCharacterEvolutionLocked,
  isRosterCharacterRecruitLocked,
  isRosterCharacterUnavailable,
  resetCharacterRuntimeState,
  useRosterStore,
} from "../store/useRosterStore";
import { CharacterDetailModal } from "./CharacterDetailModal";
import { ParticleField } from "./ParticleField";
import { evolutionStars, levelAscensionLabel } from "../utils/towerProgress";
import { BackButton } from "./BackButton";
import { useSpiritChatStore } from "../store/useSpiritChatStore";
import { SpiritCard, type SpiritCardBadge } from "./SpiritCard";
import { runBackgroundRecruit } from "../utils/recruitPipeline";
import type { AIConfig } from "../utils/ai";
import { useSpiritStoryStore } from "../store/useSpiritStoryStore";

export const RosterScreen: React.FC = () => {
  const setPhase = useGameStore((s) => s.setPhase);
  const setPlayer1 = useGameStore((s) => s.setPlayer1);
  const setBattleMode = useGameStore((s) => s.setBattleMode);
  const apiKey = useGameStore((s) => s.apiKey);
  const baseUrl = useGameStore((s) => s.baseUrl);
  const model = useGameStore((s) => s.model);
  const apiMode = useGameStore((s) => s.apiMode);
  const { roster, removeCharacter, retryPendingRecruit } = useRosterStore();
  const setOpenSpiritRosterId = useSpiritChatStore((s) => s.setOpenRosterId);
  const createStoryRoom = useSpiritStoryStore((s) => s.createRoom);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const themeColor = "#66FCF1";
  const themeRgb = "102, 252, 241";

  const selected = selectedId
    ? roster.find((r) => r.rosterId === selectedId)
    : null;
  const displayRoster = useMemo(
    () =>
      [...roster].sort((a, b) => {
        const aIsGenerating = a.recruitLock?.status === "generating";
        const bIsGenerating = b.recruitLock?.status === "generating";
        return Number(bIsGenerating) - Number(aIsGenerating);
      }),
    [roster],
  );

  const handleRemoveCharacter = (rosterId: string, name: string) => {
    if (!window.confirm(`确定要将 ${name} 移出麾下吗？`)) return;
    removeCharacter(rosterId);
    if (selectedId === rosterId) {
      setSelectedId(null);
    }
  };

  const handleRetryRecruit = (rosterId: string) => {
    const revived = retryPendingRecruit(rosterId);
    if (!revived) return;
    const cfg: AIConfig = { apiKey, baseUrl, model, apiMode };
    const description =
      revived.recruitLock?.description || revived.sourceDescription || "";
    if (!description) return;
    runBackgroundRecruit(rosterId, description, cfg);
  };

  const handleStartBattle = () => {
    if (!selected || isRosterCharacterUnavailable(selected)) return;
    setBattleMode("pvp");
    setPlayer1(resetCharacterRuntimeState(selected));
    useGameStore.setState({
      player2: null,
      battleLogs: [],
      currentTurn: 0,
      winner: null,
    });
    setSelectedId(null);
    setPhase("PLAYER2_CREATE");
  };

  const handleStartStory = () => {
    if (!selected || isRosterCharacterUnavailable(selected)) return;
    const participants = [
      selected.rosterId,
      ...roster
        .filter(
          (char) =>
            char.rosterId !== selected.rosterId &&
            !isRosterCharacterUnavailable(char),
        )
        .map((char) => char.rosterId),
    ].slice(0, 3);
    if (participants.length < 2) return;
    createStoryRoom({
      participantRosterIds: participants,
      scenarioId: "free",
      title: `${selected.name} · 群像共叙`,
    });
    setSelectedId(null);
    setPhase("SPIRIT_STORY");
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#05060a] text-white">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute -top-40 -left-40 h-[55vw] w-[55vw] rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(102,252,241,0.25) 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute -bottom-40 -right-40 h-[55vw] w-[55vw] rounded-full opacity-25"
          style={{
            background:
              "radial-gradient(circle, rgba(183,139,255,0.17) 0%, transparent 55%)",
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

      <ParticleField count={25} colors={[themeColor, "#FFD700"]} />

      <motion.div
        animate={{ x: [0, 60, 0], y: [0, -30, 0] }}
        transition={{ duration: 14, repeat: Infinity }}
        className="pointer-events-none absolute left-[18%] top-[28%] z-0 h-72 w-72 rounded-full blur-[140px] opacity-20"
        style={{ backgroundColor: themeColor }}
      />

      {/* 顶部 HUD */}
      <div className="relative z-20 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-3">
          <div aria-hidden className="h-11 w-11 shrink-0" />
          <div className="ml-2 hidden items-center gap-3 font-mono text-[10px] tracking-[0.4em] text-white/40 md:flex">
            <div
              className="h-[1px] w-6"
              style={{ backgroundColor: themeColor }}
            />
            <span>WORD-SPIRIT / ROSTER</span>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] text-white/40">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#66FCF1] animate-pulse" />
          ROSTER ARCHIVE
        </div>
      </div>
      <BackButton
        onClick={() => setPhase("MODE_SELECT")}
        color={themeColor}
        className="fixed left-6 top-5 z-30"
      />

      <main className="relative z-10 mx-auto w-full max-w-[1400px] px-6 pb-16 pt-8 md:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div
                  className="h-[1px] w-10"
                  style={{ backgroundColor: themeColor }}
                />
                <span
                  className="font-mono text-[10px] tracking-[0.5em]"
                  style={{ color: `${themeColor}cc` }}
                >
                  ARCHIVE · 02
                </span>
              </div>
              <div className="flex items-center gap-3">
                <UsersRound size={24} style={{ color: themeColor }} />
                <h1
                  className="font-display text-[clamp(2.2rem,5vw,4rem)] font-black leading-[0.9] tracking-tight"
                  style={{
                    color: themeColor,
                    letterSpacing: "-0.03em",
                    textShadow: `0 0 30px rgba(${themeRgb}, 0.34)`,
                  }}
                >
                  我的词灵
                </h1>
              </div>
              <p className="mt-2 font-mono text-[10px] font-bold tracking-[0.34em] text-white/25">
                LOCAL ROSTER · SELECT A SPIRIT TO INSPECT
              </p>
            </div>
            <div className="text-right font-mono text-[10px] tracking-widest text-white/30">
              <div>REGISTERED {String(roster.length).padStart(2, "0")}</div>
              <div className="mt-1" style={{ color: `${themeColor}b3` }}>
                ARCHIVE · ONLINE
              </div>
            </div>
          </header>

          <section
            className="overflow-hidden border bg-[#0b1019]/75 backdrop-blur-sm"
            style={{
              borderColor: `rgba(${themeRgb}, 0.28)`,
              boxShadow: `inset 0 1px 0 rgba(${themeRgb}, 0.08), 0 20px 60px rgba(0,0,0,0.2)`,
            }}
          >
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 md:px-5">
              <span
                className="h-1 w-1 shrink-0"
                style={{ backgroundColor: themeColor }}
              />
              <span
                className="font-mono text-[9px] tracking-[0.38em]"
                style={{ color: `${themeColor}bb` }}
              >
                SPIRIT INDEX
              </span>
              <span className="ml-auto font-mono text-[9px] tracking-widest text-white/30">
                {roster.length} UNITS
              </span>
            </div>
            {roster.length === 0 ? (
              <div
                className="m-4 flex h-64 flex-col items-center justify-center gap-2 border border-dashed text-sm text-[#8a8d91] md:m-5"
                style={{ borderColor: `rgba(${themeRgb}, 0.25)` }}
              >
                <Sword size={28} className="opacity-40" />
                暂无角色 · 完成对战后可在结算页选择收入
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:p-5 lg:grid-cols-5 xl:grid-cols-6">
                {displayRoster.map((char) => {
                  const evolutionLocked =
                    isRosterCharacterEvolutionLocked(char);
                  const recruitLocked = isRosterCharacterRecruitLocked(char);
                  const badges: SpiritCardBadge[] = [];
                  badges.push({
                    label: `Lv.${char.level}`,
                    title: `等级 ${char.level} · ${levelAscensionLabel(char.level)}`,
                  });
                  if (char.evolutionStage > 0) {
                    badges.push({
                      label: "★".repeat(evolutionStars(char.evolutionStage)),
                      color: "#FFD700",
                      title: `进化 ${evolutionStars(char.evolutionStage)} 星`,
                    });
                  }
                  const isFailed =
                    recruitLocked && char.recruitLock?.status === "failed";
                  const isGenerating = recruitLocked && !isFailed;
                  const clickable =
                    !isGenerating && !isFailed && !evolutionLocked;
                  return (
                    <SpiritCard
                      key={char.rosterId}
                      character={char}
                      size="md"
                      topRightBadges={badges}
                      onClick={
                        clickable
                          ? () => setSelectedId(char.rosterId)
                          : undefined
                      }
                      onKeyDown={(event) => {
                        if (!clickable) return;
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setSelectedId(char.rosterId);
                      }}
                      onRetryRecruit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRetryRecruit(char.rosterId);
                      }}
                      onDropRecruit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveCharacter(char.rosterId, char.name);
                      }}
                      onDelete={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveCharacter(char.rosterId, char.name);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </motion.div>
      </main>

      <AnimatePresence>
        {selected && (
          <CharacterDetailModal
            key={selected.rosterId}
            character={selected}
            onClose={() => setSelectedId(null)}
            onChat={() => {
              setOpenSpiritRosterId(selected.rosterId);
              setSelectedId(null);
              setPhase("SPIRIT_CHAT");
            }}
            onBattle={handleStartBattle}
            onStory={handleStartStory}
            storyDisabled={
              roster.filter((char) => !isRosterCharacterUnavailable(char))
                .length < 2
            }
            onRemove={() => {
              handleRemoveCharacter(selected.rosterId, selected.name);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
