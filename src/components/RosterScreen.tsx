import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UsersRound, Sword } from "lucide-react";
import { useGameStore } from "../store/useGameStore";
import {
  isRosterCharacterEvolutionLocked,
  isRosterCharacterRecruitLocked,
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

export const RosterScreen: React.FC = () => {
  const setPhase = useGameStore((s) => s.setPhase);
  const apiKey = useGameStore((s) => s.apiKey);
  const baseUrl = useGameStore((s) => s.baseUrl);
  const model = useGameStore((s) => s.model);
  const apiMode = useGameStore((s) => s.apiMode);
  const { roster, removeCharacter, retryPendingRecruit } = useRosterStore();
  const setOpenSpiritRosterId = useSpiritChatStore((s) => s.setOpenRosterId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const themeColor = "#66FCF1";
  const themeRgb = "102, 252, 241";

  const selected = selectedId
    ? roster.find((r) => r.rosterId === selectedId)
    : null;

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

  return (
    <div className="min-h-screen flex flex-col items-center p-6 relative overflow-hidden grid-bg">
      <ParticleField count={25} colors={[themeColor, "#FFD700"]} />

      <motion.div
        animate={{ x: [0, 60, 0], y: [0, -30, 0] }}
        transition={{ duration: 14, repeat: Infinity }}
        className="absolute top-10 left-10 w-72 h-72 rounded-full blur-[140px] z-0 opacity-30"
        style={{ backgroundColor: themeColor }}
      />

      <div className="z-10 w-full max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <BackButton
            onClick={() => setPhase("MODE_SELECT")}
            color={themeColor}
          />
          <div className="ml-auto flex items-center gap-2 text-[#8a8d91] text-[10px] tracking-widest">
            <span className="inline-block w-2 h-2 rounded-full bg-[#66FCF1] animate-pulse" />
            ROSTER ARCHIVE
          </div>
        </div>

        <div
          className="bg-[#1F2833]/80 backdrop-blur-md border-2 rounded-xl p-6 corner-frame crt-flicker"
          style={{
            borderColor: themeColor,
            boxShadow: `0 0 30px rgba(${themeRgb}, 0.3), inset 0 0 30px rgba(${themeRgb}, 0.05)`,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <UsersRound size={20} style={{ color: themeColor }} />
            <h1
              data-text="MY ROSTER"
              className="text-2xl md:text-3xl font-black tracking-widest font-display glitch-text"
              style={{ color: themeColor }}
            >
              我的词灵
            </h1>
            <span className="ml-auto text-xs text-[#8a8d91] tracking-widest">
              {roster.length} / 24
            </span>
          </div>
          <div className="text-[10px] text-[#8a8d91] tracking-[0.3em] mb-6">
            ▼ LOCAL ROSTER · CLICK TO INSPECT ▼
          </div>

          {roster.length === 0 ? (
            <div
              className="h-64 rounded-lg border border-dashed flex flex-col items-center justify-center gap-2 text-sm text-[#8a8d91]"
              style={{ borderColor: `rgba(${themeRgb}, 0.25)` }}
            >
              <Sword size={28} className="opacity-40" />
              暂无角色 · 完成对战后可在结算页选择收入
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {roster.map((char) => {
                const evolutionLocked = isRosterCharacterEvolutionLocked(char);
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
                      clickable ? () => setSelectedId(char.rosterId) : undefined
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
        </div>
      </div>

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
            onRemove={() => {
              handleRemoveCharacter(selected.rosterId, selected.name);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
