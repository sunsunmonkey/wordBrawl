import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  Zap,
  Shield,
  Gauge,
  UsersRound,
  Sword,
  Trash2,
  Star,
  Sparkles,
} from "lucide-react";
import {
  useGameStore,
  RARITY_CONFIGS,
  calculatePowerScore,
  type Rarity,
} from "../store/useGameStore";
import {
  isRosterCharacterEvolutionLocked,
  isRosterCharacterRecruitLocked,
  useRosterStore,
} from "../store/useRosterStore";
import { CharacterAvatar } from "./CharacterAvatar";
import { CharacterDetailModal } from "./CharacterDetailModal";
import { ParticleField } from "./ParticleField";
import { evolutionStars, levelAscensionLabel } from "../utils/towerProgress";
import { BackButton } from "./BackButton";
import { useSpiritChatStore } from "../store/useSpiritChatStore";

export const RosterScreen: React.FC = () => {
  const setPhase = useGameStore((s) => s.setPhase);
  const { roster, removeCharacter } = useRosterStore();
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
                const charRarity: Rarity = char.rarity || "R";
                const rarityConfig = RARITY_CONFIGS[charRarity];
                const cardColor = rarityConfig.primaryColor;
                const cardRgb = rarityConfig.rgb;
                const rarityTierMap: Record<Rarity, number> = {
                  N: 0,
                  R: 1,
                  SR: 2,
                  SSR: 3,
                  UR: 4,
                };
                const rarityTier = rarityTierMap[charRarity];
                const borderWidth = 1 + 0.25 * rarityTier;
                const isUR = charRarity === "UR";
                const isSSR = charRarity === "SSR";
                const isHighRarity = isUR || isSSR;
                const cardPower = calculatePowerScore(char);
                const borderAlpha = 0.3 + rarityTier * 0.1;
                const shadowAlpha = 0.04 + rarityTier * 0.03;
                return (
                  <motion.div
                    key={char.rosterId}
                    onClick={() => setSelectedId(char.rosterId)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelectedId(char.rosterId);
                    }}
                    role="button"
                    tabIndex={0}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    className="group cursor-pointer relative rounded-lg text-left overflow-hidden"
                    style={{
                      background: "#0D0E14",
                      border: `${borderWidth}px solid rgba(${cardRgb}, ${borderAlpha})`,
                      boxShadow: `0 2px 8px rgba(0,0,0,0.5), 0 0 ${12 + rarityTier * 4}px rgba(${cardRgb}, ${shadowAlpha})`,
                    }}
                  >
                    {isHighRarity && (
                      <motion.div
                        className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-lg"
                        initial={false}
                      >
                        <motion.div
                          className="absolute top-0 h-full w-1/3"
                          style={{
                            background: `linear-gradient(90deg, transparent 0%, rgba(${cardRgb}, ${isUR ? 0.09 : 0.06}) 50%, transparent 100%)`,
                          }}
                          animate={{ x: ["-50%", "350%"] }}
                          transition={{
                            duration: isUR ? 5.5 : 6.5,
                            repeat: Infinity,
                            ease: "easeInOut",
                            repeatDelay: 1,
                          }}
                        />
                      </motion.div>
                    )}
                    <div className="relative z-10">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRemoveCharacter(char.rosterId, char.name);
                        }}
                        aria-label={`移除 ${char.name}`}
                        className="absolute right-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded bg-black/60 text-[#8a8d91] opacity-0 transition-all hover:text-red-500 hover:bg-black/80 focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 size={11} />
                      </button>
                      <div
                        className="relative aspect-square overflow-hidden"
                        style={{
                          background: `radial-gradient(ellipse at 50% 30%, rgba(${cardRgb}, 0.08) 0%, #0D0E14 70%)`,
                        }}
                      >
                        <CharacterAvatar
                          imageUrl={char.imageUrl}
                          name={char.name}
                          themeColor={cardColor}
                          className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                          iconSize={36}
                        />
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background: `linear-gradient(to top, #0D0E14 0%, #0D0E14e0 40%, transparent 65%),
                                        linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 25%),
                                        radial-gradient(ellipse at 50% 40%, transparent 40%, rgba(${cardRgb}, 0.05) 100%)`,
                          }}
                        />
                        <div
                          className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[8px] font-black tracking-wider"
                          style={{
                            background: `linear-gradient(135deg, ${cardColor} 0%, ${rarityConfig.secondaryColor} 100%)`,
                            color: "#0B0C10",
                            boxShadow: `0 1px 4px rgba(0,0,0,0.4), 0 0 6px rgba(${cardRgb}, 0.3)`,
                          }}
                        >
                          {charRarity}
                        </div>
                        <div className="absolute left-1.5 top-[26px] flex gap-px">
                          {Array.from({ length: rarityConfig.starCount }).map(
                            (_, i) => (
                              <Star
                                key={i}
                                size={6}
                                fill={cardColor}
                                color={cardColor}
                                style={{
                                  filter: `drop-shadow(0 0 2px rgba(${cardRgb}, 0.6))`,
                                }}
                              />
                            ),
                          )}
                        </div>
                        <div
                          className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-bold"
                          style={{ color: cardColor }}
                        >
                          Lv.{char.level}
                        </div>
                        <div className="absolute right-1.5 top-[26px] rounded bg-black/60 px-1.5 py-0.5 text-[7px] font-bold text-[#66FCF1]">
                          {levelAscensionLabel(char.level)}
                        </div>
                        {char.evolutionStage > 0 && (
                          <div className="absolute right-1.5 top-[44px] rounded bg-black/60 px-1.5 py-0.5 text-[7px] font-bold text-[#FFD700]">
                            {"★".repeat(evolutionStars(char.evolutionStage))}
                          </div>
                        )}
                        <div
                          className="absolute right-1.5 bottom-1.5 rounded px-1.5 py-0.5 text-[7px] font-black"
                          style={{
                            background: `rgba(${cardRgb}, 0.25)`,
                            color: "#0B0C10",
                          }}
                        >
                          ⚡{cardPower}
                        </div>
                        {(evolutionLocked || recruitLocked) && (
                          <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: "rgba(13,14,20,0.9)" }}>
                            <div
                              className="rounded border px-2 py-1 text-[9px] font-black tracking-widest"
                              style={{
                                borderColor: cardColor,
                                color: cardColor,
                              }}
                            >
                              {recruitLocked
                                ? char.recruitLock?.status === "failed"
                                  ? "创造失败"
                                  : "后台创造中"
                                : "进化更新中"}
                            </div>
                          </div>
                        )}
                        <div
                          className="absolute inset-x-0 bottom-0 p-1.5"
                          style={{
                            background:
                              "linear-gradient(to top, #0D0E14 0%, #0D0E14e0 50%, transparent 100%)",
                          }}
                        >
                          <div
                            className="truncate text-[11px] font-black font-display leading-tight"
                            style={{
                              color: "#fff",
                              textShadow: `0 0 6px rgba(${cardRgb}, 0.7), 0 0 14px rgba(${cardRgb}, 0.3)`,
                            }}
                          >
                            {char.name}
                          </div>
                        </div>
                      </div>
                      <div className="p-1.5" style={{ background: "#0D0E14" }}>
                        <div
                          className="h-px mb-1.5"
                          style={{
                            background: `linear-gradient(to right, transparent, rgba(${cardRgb}, 0.2), transparent)`,
                          }}
                        />
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                          <span className="flex items-center gap-1">
                            <Heart
                              size={9}
                              style={{
                                color: "#F472B6",
                                filter:
                                  "drop-shadow(0 0 2px rgba(244,114,182,0.5))",
                              }}
                            />
                            <span className="text-[#C5C6C7]">{char.maxHp}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap
                              size={9}
                              style={{
                                color: "#FACC15",
                                filter:
                                  "drop-shadow(0 0 2px rgba(250,204,21,0.5))",
                              }}
                            />
                            <span className="text-[#C5C6C7]">
                              {char.attack}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Shield
                              size={9}
                              style={{
                                color: "#60A5FA",
                                filter:
                                  "drop-shadow(0 0 2px rgba(96,165,250,0.5))",
                              }}
                            />
                            <span className="text-[#C5C6C7]">
                              {char.defense}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Gauge
                              size={9}
                              style={{
                                color: "#4ADE80",
                                filter:
                                  "drop-shadow(0 0 2px rgba(74,222,128,0.5))",
                              }}
                            />
                            <span className="text-[#C5C6C7]">{char.speed}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
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
