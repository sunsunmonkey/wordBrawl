import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  useGameStore,
  CharacterData,
  BattleEvent,
  Skill,
} from "../store/useGameStore";
import { BattleEngine, ULTIMATE_THRESHOLD } from "../utils/battleEngine";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Shield, Activity, Swords, Flame, Bot } from "lucide-react";
import { ParticleField } from "./ParticleField";
import { getUltimateTypeById } from "../data/ultimateTypes";
import { summarizeBattle } from "../utils/towerAnalysis";
import { useTowerStore } from "../store/useTowerStore";
import { useRosterStore } from "../store/useRosterStore";
import {
  cleanupEvolutionPrefetchCache,
  clearEvolutionPrefetchForRoster,
  startEvolutionPrefetch,
} from "../utils/evolutionPrefetch";
import { buildLocalEvolution } from "../utils/towerProgress";
import { BackButton } from "./BackButton";

interface PopupDamage {
  id: string;
  side: "left" | "right";
  value: number;
  isCrit: boolean;
  isHeal?: boolean;
}

interface UltimateOverlay {
  attackerName: string;
  skillName: string;
  skillImageUrl?: string;
  description: string;
  side: "left" | "right";
  ultimateType?: string;
  /** 是否为预警阶段（释放前提示） */
  warning?: boolean;
  /** 是否为蓄力过渡阶段 */
  charging?: boolean;
}

const isUltimateSkill = (skill: Skill): boolean =>
  skill.type === "ultimate" || !!skill.isUltimate;

const CharacterCard: React.FC<{
  char: CharacterData;
  isLeft: boolean;
  beingHit: boolean;
  isAttacking: boolean;
  isActiveTurn?: boolean;
  popups: PopupDamage[];
  canUseSkills?: boolean;
  onSkillSelect?: (skill: Skill) => void;
}> = ({
  char,
  isLeft,
  beingHit,
  isAttacking,
  isActiveTurn = false,
  popups,
  canUseSkills = false,
  onSkillSelect,
}) => {
  const hpPercent = Math.max(0, (char.hp / char.maxHp) * 100);
  const themeColor = isLeft ? "#66FCF1" : "#FF003C";
  const shadowColor = isLeft
    ? "rgba(102, 252, 241, 0.6)"
    : "rgba(255, 0, 60, 0.6)";
  const themeRgb = isLeft ? "102, 252, 241" : "255, 0, 60";
  const [imgFailed, setImgFailed] = useState(false);

  const hpColor =
    hpPercent > 60 ? "#22ff88" : hpPercent > 30 ? "#FFD700" : "#FF003C";
  const chargePercent = Math.min(
    100,
    (char.ultimateCharge / ULTIMATE_THRESHOLD) * 100,
  );
  const ultReady = char.ultimateCharge >= ULTIMATE_THRESHOLD;
  const ultimateSkill = char.skills.find(
    (s) => s.isUltimate || s.type === "ultimate",
  );
  const nonUltimateSkills = char.skills.filter((s) => !isUltimateSkill(s));
  const [skillPage, setSkillPage] = useState(0);
  const skillPageSize = 4;
  const skillPageCount = Math.max(
    1,
    Math.ceil(nonUltimateSkills.length / skillPageSize),
  );
  const safeSkillPage = Math.min(skillPage, skillPageCount - 1);
  const visibleSkills = nonUltimateSkills.slice(
    safeSkillPage * skillPageSize,
    safeSkillPage * skillPageSize + skillPageSize,
  );

  return (
    <motion.div
      animate={
        isAttacking ? { x: isLeft ? 30 : -30, scale: 1.05 } : { x: 0, scale: 1 }
      }
      transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
      className={`flex min-h-0 max-h-full flex-col ${isLeft ? "items-start" : "items-end"} w-full md:w-[31%] relative rounded-xl border-2 bg-[#0B0C10]/68 p-3 overflow-hidden ${isActiveTurn ? "drop-shadow-[0_0_18px_rgba(255,215,0,0.55)]" : ""}`}
      style={{
        borderColor: isActiveTurn ? "#FFD700" : `rgba(${themeRgb},0.48)`,
        boxShadow: isActiveTurn
          ? "0 0 22px rgba(255,215,0,0.32), inset 0 0 24px rgba(255,215,0,0.06)"
          : `0 0 18px rgba(${themeRgb},0.16), inset 0 0 18px rgba(${themeRgb},0.04)`,
      }}
    >
      <div
        className={`relative w-40 h-40 xl:w-48 xl:h-48 mb-2 mx-auto ${beingHit ? "shake" : ""}`}
      >
        {/* Glow ring */}
        <motion.div
          className="absolute inset-0 rounded-lg pulse-glow"
          style={{
            color: themeColor,
            boxShadow: `0 0 14px ${shadowColor}`,
          }}
        />

        {/* Avatar */}
        <div
          className="absolute inset-0 border-2 rounded-lg overflow-hidden bg-[#1F2833] relative scanlines"
          style={{
            borderColor: themeColor,
            boxShadow: `0 0 25px ${shadowColor}`,
          }}
        >
          {char.imageUrl && !imgFailed ? (
            <img
              src={char.imageUrl}
              alt={char.name}
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-7xl font-black italic font-display"
              style={{
                color: themeColor,
                background: `linear-gradient(135deg, rgba(${themeRgb},0.25) 0%, transparent 100%)`,
              }}
            >
              {char.name?.[0] || "?"}
            </div>
          )}
          {/* Hit flash overlay */}
          <AnimatePresence>
            {beingHit && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-white"
              />
            )}
          </AnimatePresence>
          {/* Slash effect */}
          <AnimatePresence>
            {beingHit && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div
                  className="text-7xl slash-effect"
                  style={{
                    color: themeColor,
                    textShadow: `0 0 20px ${themeColor}`,
                  }}
                >
                  ⚔
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Damage popups */}
        <div className="absolute top-1/2 left-1/2 z-30 pointer-events-none">
          <AnimatePresence>
            {popups.map((p) => (
              <div
                key={p.id}
                className="absolute damage-float font-display font-black"
                style={{
                  fontSize: p.isCrit ? "3rem" : "2rem",
                  color: p.isHeal
                    ? "#22ff88"
                    : p.isCrit
                      ? "#FFD700"
                      : themeColor,
                  textShadow: `0 0 12px ${p.isHeal ? "#22ff88" : p.isCrit ? "#FFD700" : themeColor}, 0 2px 4px rgba(0,0,0,0.8)`,
                  WebkitTextStroke: "1px black",
                }}
              >
                {p.isHeal ? "+" : "-"}
                {p.value}
                {p.isCrit && (
                  <span className="text-xs ml-1 text-red-500">CRIT!</span>
                )}
              </div>
            ))}
          </AnimatePresence>
        </div>

        {/* Corner pulse markers */}
        <div
          className="absolute -top-1 -left-1 w-3 h-3 border-l-2 border-t-2 animate-pulse"
          style={{ borderColor: themeColor }}
        />
        <div
          className="absolute -top-1 -right-1 w-3 h-3 border-r-2 border-t-2 animate-pulse"
          style={{ borderColor: themeColor }}
        />
        <div
          className="absolute -bottom-1 -left-1 w-3 h-3 border-l-2 border-b-2 animate-pulse"
          style={{ borderColor: themeColor }}
        />
        <div
          className="absolute -bottom-1 -right-1 w-3 h-3 border-r-2 border-b-2 animate-pulse"
          style={{ borderColor: themeColor }}
        />
      </div>

      <h3
        data-text={char.name}
        className="text-xl xl:text-2xl font-black italic mb-2 font-display tracking-wider"
        style={{ color: themeColor, textShadow: `0 0 12px ${themeColor}` }}
      >
        {char.name}
      </h3>

      {/* HP Bar */}
      <div className="w-full mb-2">
        <div className="flex justify-between text-xs mb-1 font-bold">
          <span className="text-[#8a8d91]">HP</span>
          <span style={{ color: hpColor }}>
            {char.hp} / {char.maxHp}
          </span>
        </div>
        <div
          className="w-full h-4 bg-[#0B0C10] border-2 rounded-sm overflow-hidden relative"
          style={{
            borderColor: themeColor,
            boxShadow: `0 0 8px ${shadowColor} inset`,
          }}
        >
          <motion.div
            className="h-full relative"
            style={{
              backgroundColor: hpColor,
              boxShadow: `0 0 12px ${hpColor}`,
            }}
            initial={{ width: "100%" }}
            animate={{ width: `${hpPercent}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {/* Shimmer */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                animation: "scanline-move 2s linear infinite",
                backgroundSize: "50% 100%",
              }}
            />
          </motion.div>
        </div>
      </div>

      {/* Ultimate Charge Bar */}
      {ultimateSkill && (
        <div className="w-full mb-2">
          <div className="flex justify-between text-[10px] mb-1 font-bold tracking-wider">
            <span
              className="flex items-center gap-1"
              style={{ color: ultReady ? "#FFD700" : "#8a8d91" }}
            >
              <Flame size={10} className={ultReady ? "animate-pulse" : ""} />
              {ultReady ? "ULT READY!" : "ULT CHARGE"}
            </span>
            <span style={{ color: ultReady ? "#FFD700" : "#8a8d91" }}>
              {Math.floor(chargePercent)}%
            </span>
          </div>
          <div
            className="w-full h-2.5 bg-[#0B0C10] border rounded-sm overflow-hidden relative"
            style={{
              borderColor: ultReady ? "#FFD700" : `rgba(${themeRgb}, 0.4)`,
              boxShadow: ultReady ? "0 0 12px rgba(255, 215, 0, 0.8)" : "none",
            }}
          >
            <motion.div
              className="h-full relative"
              style={{
                background: ultReady
                  ? "linear-gradient(90deg, #FFD700, #FF6B00, #FFD700)"
                  : "linear-gradient(90deg, rgba(255,215,0,0.4), rgba(255,107,0,0.6))",
                boxShadow: ultReady ? "0 0 10px #FFD700" : "none",
              }}
              initial={{ width: "0%" }}
              animate={{ width: `${chargePercent}%` }}
              transition={{ duration: 0.5 }}
            >
              {ultReady && (
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
                    animation: "scanline-move 1s linear infinite",
                    backgroundSize: "50% 100%",
                  }}
                />
              )}
            </motion.div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div
        className="grid grid-cols-3 gap-2 w-full text-xs font-bold bg-[#1F2833]/60 p-2 rounded border"
        style={{ borderColor: `rgba(${themeRgb}, 0.3)` }}
      >
        <div className="flex flex-col items-center gap-1">
          <Zap size={14} className="text-yellow-400" />
          <span className="text-yellow-400">
            {char.attack}
            {char.attackBuff !== 0 ? (
              <span
                className="text-[9px] ml-0.5"
                style={{ color: char.attackBuff > 0 ? "#22ff88" : "#FF003C" }}
              >
                {char.attackBuff > 0 ? "↑" : "↓"}
                {Math.abs(char.attackBuff)}%
              </span>
            ) : null}
          </span>
          <span className="text-[10px] text-[#8a8d91]">ATK</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Shield size={14} className="text-blue-400" />
          <span className="text-blue-400">
            {char.defense}
            {char.defenseBuff !== 0 ? (
              <span
                className="text-[9px] ml-0.5"
                style={{ color: char.defenseBuff > 0 ? "#22ff88" : "#FF003C" }}
              >
                {char.defenseBuff > 0 ? "↑" : "↓"}
                {Math.abs(char.defenseBuff)}%
              </span>
            ) : null}
          </span>
          <span className="text-[10px] text-[#8a8d91]">DEF</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Activity size={14} className="text-green-400" />
          <span className="text-green-400">{char.speed}</span>
          <span className="text-[10px] text-[#8a8d91]">SPD</span>
        </div>
      </div>

      {/* Skills preview - 块状卡片 */}
      <div className="mt-2 flex w-full items-center justify-between text-[10px] tracking-widest">
        <span className="text-[#8a8d91]">SKILLS</span>
        {skillPageCount > 1 && (
          <div className="flex items-center gap-1">
            {Array.from({ length: skillPageCount }).map((_, page) => (
              <button
                key={page}
                type="button"
                onClick={() => setSkillPage(page)}
                className="h-5 min-w-5 rounded border px-1 font-black"
                style={{
                  borderColor:
                    page === safeSkillPage
                      ? themeColor
                      : "rgba(138,141,145,0.35)",
                  color: page === safeSkillPage ? themeColor : "#8a8d91",
                  background:
                    page === safeSkillPage
                      ? `rgba(${themeRgb},0.14)`
                      : "transparent",
                }}
              >
                {page + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-full mt-1 grid grid-cols-2 gap-2">
        {visibleSkills.map((s, i) => {
          const isUlt = isUltimateSkill(s);
          const typeColor = isUlt
            ? "#FFD700"
            : s.type === "heal"
              ? "#22ff88"
              : s.type === "buff"
                ? "#FFD700"
                : s.type === "debuff"
                  ? "#FF6B00"
                  : themeColor;
          const typeLabel = isUlt
            ? "ULT"
            : s.type === "heal"
              ? "治疗"
              : s.type === "buff"
                ? "增益"
                : s.type === "debuff"
                  ? "减益"
                  : "攻击";
          const valueText =
            s.type === "attack" || s.type === "ultimate"
              ? `×${s.damageMultiplier.toFixed(1)}`
              : s.type === "heal"
                ? `+${s.healPercent}%`
                : `${s.buffPercent}%`;
          const isSkillAction = !!onSkillSelect;
          const disabled =
            !canUseSkills ||
            (isUlt && char.ultimateCharge < ULTIMATE_THRESHOLD);
          const content = (
            <>
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[9px] font-black px-1.5 py-0.5 rounded tracking-wider flex items-center gap-1"
                  style={{ backgroundColor: typeColor, color: "#0B0C10" }}
                >
                  <Flame size={9} />
                  {typeLabel}
                </span>
                <span
                  className="text-[10px] font-black"
                  style={{ color: typeColor }}
                >
                  {isUlt &&
                  isSkillAction &&
                  char.ultimateCharge < ULTIMATE_THRESHOLD
                    ? `${Math.floor(char.ultimateCharge)}%`
                    : valueText}
                </span>
              </div>
              <div
                className="text-xs font-black truncate font-display tracking-wide"
                style={{
                  color: isUlt ? "#FFD700" : "#C5C6C7",
                  textShadow: isUlt ? `0 0 6px ${typeColor}` : "none",
                }}
              >
                {s.name}
              </div>
              {isSkillAction && s.description && (
                <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-[#8a8d91]">
                  {s.description}
                </div>
              )}
              {isUlt && (
                <div className="absolute top-1 right-1 text-[8px] text-[#FFD700] font-bold tracking-widest opacity-80">
                  ★
                </div>
              )}
            </>
          );

          if (isSkillAction) {
            return (
              <motion.button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => onSkillSelect?.(s)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={!disabled ? { y: -2, scale: 1.02 } : undefined}
                whileTap={!disabled ? { scale: 0.98 } : undefined}
                transition={{ delay: i * 0.05 }}
                className="relative min-h-[58px] text-left rounded-md p-2 border transition-all disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  borderColor: disabled
                    ? "rgba(138,141,145,0.25)"
                    : `${typeColor}aa`,
                  background: disabled
                    ? "rgba(31,40,51,0.45)"
                    : `linear-gradient(135deg, ${typeColor}26 0%, rgba(11,12,16,0.72) 100%)`,
                  boxShadow:
                    !disabled && isUlt
                      ? `0 0 12px ${typeColor}77`
                      : !disabled
                        ? `0 0 5px ${typeColor}44`
                        : "none",
                }}
              >
                {content}
              </motion.button>
            );
          }

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="relative min-h-[58px] rounded-md p-2 border"
              style={{
                borderColor: `${typeColor}88`,
                background: `linear-gradient(135deg, ${typeColor}1f 0%, rgba(11,12,16,0.6) 100%)`,
                boxShadow: isUlt
                  ? `0 0 10px ${typeColor}66`
                  : `0 0 4px ${typeColor}33`,
              }}
            >
              {content}
            </motion.div>
          );
        })}
      </div>

      {ultimateSkill && (
        <div className="w-full mt-2">
          {(() => {
            const typeColor = "#FFD700";
            const disabled =
              !canUseSkills || char.ultimateCharge < ULTIMATE_THRESHOLD;
            const content = (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded tracking-wider flex items-center gap-1"
                    style={{ backgroundColor: typeColor, color: "#0B0C10" }}
                  >
                    <Flame size={9} />
                    ULT
                  </span>
                  <span
                    className="text-[10px] font-black"
                    style={{ color: typeColor }}
                  >
                    {canUseSkills && char.ultimateCharge < ULTIMATE_THRESHOLD
                      ? `${Math.floor(char.ultimateCharge)}%`
                      : `×${ultimateSkill.damageMultiplier.toFixed(1)}`}
                  </span>
                </div>
                <div
                  className="text-xs font-black truncate font-display tracking-wide"
                  style={{
                    color: "#FFD700",
                    textShadow: `0 0 6px ${typeColor}`,
                  }}
                >
                  {ultimateSkill.name}
                </div>
                {onSkillSelect && ultimateSkill.description && (
                  <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-[#8a8d91]">
                    {ultimateSkill.description}
                  </div>
                )}
                <div className="absolute top-1 right-1 text-[8px] text-[#FFD700] font-bold tracking-widest opacity-80">
                  ★
                </div>
              </>
            );

            if (onSkillSelect) {
              return (
                <motion.button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSkillSelect(ultimateSkill)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={!disabled ? { y: -2, scale: 1.01 } : undefined}
                  whileTap={!disabled ? { scale: 0.98 } : undefined}
                  className="relative min-h-[58px] w-full text-left rounded-md p-2 border transition-all disabled:cursor-not-allowed disabled:opacity-45"
                  style={{
                    borderColor: disabled
                      ? "rgba(138,141,145,0.25)"
                      : `${typeColor}aa`,
                    background: disabled
                      ? "rgba(31,40,51,0.45)"
                      : `linear-gradient(135deg, ${typeColor}2b 0%, rgba(11,12,16,0.72) 100%)`,
                    boxShadow: !disabled ? `0 0 12px ${typeColor}77` : "none",
                  }}
                >
                  {content}
                </motion.button>
              );
            }

            return (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative min-h-[58px] w-full rounded-md p-2 border"
                style={{
                  borderColor: `${typeColor}88`,
                  background: `linear-gradient(135deg, ${typeColor}1f 0%, rgba(11,12,16,0.6) 100%)`,
                  boxShadow: `0 0 10px ${typeColor}66`,
                }}
              >
                {content}
              </motion.div>
            );
          })()}
        </div>
      )}
    </motion.div>
  );
};

/** 大招视觉风格配置：颜色 + 动画参数 + 类型专属装饰 */
interface UltimateStyle {
  theme: string;
  secondary: string;
  sideLeft: string;
  sideRight: string;
  chargeLabel: string;
  /** 背景放射光旋转方向与速度 */
  spin: { clockwise: boolean; duration: number };
  /** 中心图片容器的呼吸/抖动动画 */
  imageAnimation: {
    animate: {
      scale?: number[];
      opacity?: number[];
      x?: number[];
      y?: number[];
      rotate?: number[];
    };
    transition: {
      duration: number;
      repeat: number | typeof Infinity;
      ease?: "linear" | "easeInOut" | "easeOut";
    };
  };
  /** 蓄力阶段中心能量球动画 */
  chargeOrbAnimation: {
    animate: {
      scale?: number[];
      opacity?: number[];
      x?: number[];
      y?: number[];
      rotate?: number[];
    };
    transition: {
      duration: number;
      repeat: number | typeof Infinity;
      ease?: "linear" | "easeInOut" | "easeOut";
    };
  };
  /** 类型 ID，用于渲染专属装饰层 */
  typeId: string;
}

const getUltimateStyle = (ultimateType?: string): UltimateStyle => {
  const type = getUltimateTypeById(ultimateType || "");
  const base = {
    theme: type?.themeColor ?? "#FFD700",
    secondary: type?.secondaryColor ?? "#FF6B00",
    sideLeft: "#66FCF1",
    sideRight: "#FF003C",
  };
  const id = type?.id ?? "default";

  const styles: Record<string, Partial<UltimateStyle>> = {
    fire: {
      chargeLabel: "▼ IGNITE ▼",
      spin: { clockwise: true, duration: 2 },
      imageAnimation: {
        animate: { scale: [1, 1.06, 0.98, 1.04, 1] },
        transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" },
      },
      chargeOrbAnimation: {
        animate: { scale: [0.9, 1.3, 0.9], opacity: [0.7, 1, 0.7] },
        transition: { duration: 0.35, repeat: Infinity, ease: "easeInOut" },
      },
    },
    ice: {
      chargeLabel: "▼ FREEZE ▼",
      spin: { clockwise: false, duration: 3.5 },
      imageAnimation: {
        animate: { scale: [1, 1.02, 1], opacity: [1, 0.85, 1] },
        transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
      },
      chargeOrbAnimation: {
        animate: { scale: [1, 1.15, 1], rotate: [0, 90, 0] },
        transition: { duration: 0.8, repeat: Infinity, ease: "linear" },
      },
    },
    shadow: {
      chargeLabel: "▼ VANISH ▼",
      spin: { clockwise: true, duration: 1.2 },
      imageAnimation: {
        animate: { x: [-2, 2, -2, 0], opacity: [1, 0.85, 1, 1] },
        transition: { duration: 0.2, repeat: Infinity, ease: "linear" },
      },
      chargeOrbAnimation: {
        animate: { scale: [1, 0.85, 1.1, 1], opacity: [0.6, 1, 0.6, 0.9] },
        transition: { duration: 0.25, repeat: Infinity, ease: "easeInOut" },
      },
    },
    lightning: {
      chargeLabel: "▼ CHARGE ▼",
      spin: { clockwise: false, duration: 0.8 },
      imageAnimation: {
        animate: { x: [-3, 3, -2, 2, 0], scale: [1, 1.03, 1] },
        transition: { duration: 0.15, repeat: Infinity, ease: "linear" },
      },
      chargeOrbAnimation: {
        animate: { scale: [1, 1.4, 1], opacity: [1, 0.4, 1] },
        transition: { duration: 0.12, repeat: Infinity, ease: "linear" },
      },
    },
    cosmic: {
      chargeLabel: "▼ COLLAPSE ▼",
      spin: { clockwise: true, duration: 6 },
      imageAnimation: {
        animate: { scale: [1, 1.03, 1], rotate: [0, 2, -2, 0] },
        transition: { duration: 4, repeat: Infinity, ease: "easeInOut" },
      },
      chargeOrbAnimation: {
        animate: { scale: [0.95, 1.25, 0.95], rotate: [0, 180, 360] },
        transition: { duration: 1.5, repeat: Infinity, ease: "linear" },
      },
    },
    nature: {
      chargeLabel: "▼ AWAKEN ▼",
      spin: { clockwise: true, duration: 4 },
      imageAnimation: {
        animate: { scale: [1, 1.04, 1] },
        transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
      },
      chargeOrbAnimation: {
        animate: { scale: [0.8, 1.2, 0.8], y: [10, -10, 10] },
        transition: { duration: 1, repeat: Infinity, ease: "easeInOut" },
      },
    },
    mecha: {
      chargeLabel: "▼ LOCK ON ▼",
      spin: { clockwise: false, duration: 2.5 },
      imageAnimation: {
        animate: { scale: [1, 1.01, 1] },
        transition: { duration: 0.1, repeat: Infinity, ease: "linear" },
      },
      chargeOrbAnimation: {
        animate: { scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] },
        transition: { duration: 0.3, repeat: Infinity, ease: "linear" },
      },
    },
    holy: {
      chargeLabel: "▼ JUDGMENT ▼",
      spin: { clockwise: true, duration: 5 },
      imageAnimation: {
        animate: { scale: [1, 1.05, 1], opacity: [1, 0.9, 1] },
        transition: { duration: 1, repeat: Infinity, ease: "easeInOut" },
      },
      chargeOrbAnimation: {
        animate: { scale: [0.9, 1.3, 0.9], opacity: [0.7, 1, 0.7] },
        transition: { duration: 0.6, repeat: Infinity, ease: "easeInOut" },
      },
    },
  };

  const specific = styles[id] ??
    styles.default ?? {
      chargeLabel: "▼ CHARGING ▼",
      spin: { clockwise: true, duration: 2.1 },
      imageAnimation: {
        animate: { scale: [1, 1.05, 1] },
        transition: { duration: 0.6, repeat: Infinity },
      },
      chargeOrbAnimation: {
        animate: { scale: [0.8, 1.2, 0.8] },
        transition: { duration: 0.4, repeat: Infinity },
      },
    };

  return {
    ...base,
    ...specific,
    typeId: id,
  } as UltimateStyle;
};

/** 类型专属背景装饰层 */
const TypeDecoration: React.FC<{
  typeId: string;
  theme: string;
  secondary: string;
  sideColor: string;
  charging: boolean;
}> = ({ typeId, theme, secondary, sideColor, charging }) => {
  const common = "absolute inset-0 pointer-events-none";

  switch (typeId) {
    case "fire":
      return (
        <>
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: charging ? [0, 1.2, 1.5] : [0, 2, 2.5],
              opacity: charging ? [0, 0.8, 0] : [0, 0.5, 0],
            }}
            transition={{
              duration: charging ? 0.4 : 1.5,
              repeat: charging ? Infinity : 0,
            }}
            className={common}
            style={{
              background: `radial-gradient(circle at center, ${theme}44 0%, transparent 60%)`,
            }}
          />
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 0.2, repeat: Infinity }}
            className={common}
            style={{
              background: `repeating-radial-gradient(circle at center, ${theme}22 0, ${theme}22 20px, transparent 20px, transparent 40px)`,
            }}
          />
        </>
      );
    case "ice":
      return (
        <>
          <motion.div
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{
              scale: charging ? [1.5, 0.8, 1.2] : [1.2, 1, 1.1],
              opacity: [0.4, 0.7, 0.4],
            }}
            transition={{ duration: charging ? 0.6 : 2, repeat: Infinity }}
            className={common}
            style={{
              background: `conic-gradient(from 0deg, transparent, ${theme}33, transparent, ${secondary}33, transparent)`,
            }}
          />
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, rotate: i * 60 }}
              animate={{ opacity: [0, 0.6, 0], rotate: i * 60 + 180 }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
              className="absolute top-1/2 left-1/2 w-[600px] h-1 -translate-x-1/2 -translate-y-1/2"
              style={{
                background: `linear-gradient(90deg, transparent, ${theme}, transparent)`,
              }}
            />
          ))}
        </>
      );
    case "shadow":
      return (
        <>
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ x: charging ? "-100%" : "-120%", opacity: 0 }}
              animate={{ x: charging ? "120%" : "120%", opacity: [0, 0.7, 0] }}
              transition={{
                duration: charging ? 0.3 : 0.6,
                repeat: Infinity,
                delay: i * 0.12,
                ease: "linear",
              }}
              className="absolute top-0 bottom-0 w-32"
              style={{
                left: `${i * 25}%`,
                background: `linear-gradient(90deg, transparent, ${theme}66, transparent)`,
                transform: `rotate(${15 + i * 10}deg)`,
              }}
            />
          ))}
          <motion.div
            animate={{ opacity: [0, 0.8, 0] }}
            transition={{ duration: 0.15, repeat: Infinity }}
            className={common}
            style={{ background: `${sideColor}22` }}
          />
        </>
      );
    case "lightning":
      return (
        <>
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: `${(i - 2) * 30}%`, y: "-100%" }}
              animate={{ opacity: [0, 1, 0], y: "100%" }}
              transition={{
                duration: 0.2,
                repeat: Infinity,
                delay: i * 0.08,
                ease: "linear",
              }}
              className="absolute top-0 w-1 h-full"
              style={{
                left: `${20 + i * 15}%`,
                background: `linear-gradient(180deg, transparent, ${theme}, ${secondary}, transparent)`,
                boxShadow: `0 0 10px ${theme}`,
              }}
            />
          ))}
        </>
      );
    case "cosmic":
      return (
        <>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className={common}
            style={{
              background: `repeating-conic-gradient(from 0deg, transparent 0deg, ${theme}11 10deg, transparent 20deg, ${secondary}11 30deg, transparent 40deg)`,
            }}
          />
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              animate={{
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
                x: [0, Math.cos((i * 30 * Math.PI) / 180) * 300],
                y: [0, Math.sin((i * 30 * Math.PI) / 180) * 300],
              }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }}
              className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
              style={{ background: theme, boxShadow: `0 0 10px ${theme}` }}
            />
          ))}
        </>
      );
    case "nature":
      return (
        <>
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ y: "100%", opacity: 0, scale: 0 }}
              animate={{
                y: "-20%",
                opacity: [0, 0.8, 0],
                scale: [0.5, 1.2, 0.8],
              }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
              className="absolute bottom-0 w-2 h-32 rounded-full"
              style={{
                left: `${10 + i * 12}%`,
                background: `linear-gradient(180deg, transparent, ${theme})`,
                boxShadow: `0 0 15px ${theme}`,
              }}
            />
          ))}
          <motion.div
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 2, repeat: Infinity }}
            className={common}
            style={{
              background: `radial-gradient(circle at center, ${theme}33, transparent 70%)`,
            }}
          />
        </>
      );
    case "mecha":
      return (
        <>
          <motion.div
            animate={{ backgroundPosition: ["0% 0%", "100% 100%"] }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className={common}
            style={{
              backgroundImage: `linear-gradient(0deg, transparent 24%, ${theme}22 25%, ${theme}22 26%, transparent 27%, transparent 74%, ${theme}22 75%, ${theme}22 76%, transparent 77%, transparent),
                                linear-gradient(90deg, transparent 24%, ${theme}22 25%, ${theme}22 26%, transparent 27%, transparent 74%, ${theme}22 75%, ${theme}22 76%, transparent 77%, transparent)`,
              backgroundSize: "50px 50px",
            }}
          />
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{
              scale: charging ? [0.5, 1.2, 1] : [1, 1.1, 1],
              opacity: charging ? [0, 1, 0.8] : [0.6, 0.9, 0.6],
            }}
            transition={{ duration: 0.4, repeat: Infinity }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] border-2"
            style={{ borderColor: theme, boxShadow: `0 0 20px ${theme} inset` }}
          >
            <div
              className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2"
              style={{ borderColor: secondary }}
            />
            <div
              className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2"
              style={{ borderColor: secondary }}
            />
            <div
              className="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2"
              style={{ borderColor: secondary }}
            />
            <div
              className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2"
              style={{ borderColor: secondary }}
            />
          </motion.div>
        </>
      );
    case "holy":
      return (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className={common}
            style={{
              background: `linear-gradient(180deg, ${theme}66 0%, transparent 50%, transparent 100%)`,
            }}
          />
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0, rotate: i * 30 }}
              animate={{
                opacity: [0, 0.8, 0],
                scale: [0, 1.5, 2],
                rotate: i * 30 + 90,
              }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
              className="absolute top-1/2 left-1/2 w-[600px] h-4 -translate-x-1/2 -translate-y-1/2"
              style={{
                background: `linear-gradient(90deg, transparent, ${theme}, transparent)`,
              }}
            />
          ))}
        </>
      );
    default:
      return null;
  }
};

/** 大招全屏特效组件 */
const UltimateOverlayView: React.FC<{ overlay: UltimateOverlay }> = ({
  overlay,
}) => {
  const style = getUltimateStyle(overlay.ultimateType);
  const sideColor = overlay.side === "left" ? style.sideLeft : style.sideRight;
  const isCharging = overlay.charging;
  const isWarning = overlay.warning;
  const isRelease = !isWarning && !isCharging;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none ultimate-overlay"
    >
      {/* 基础背景闪光 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{
          opacity: isCharging
            ? [0, 0.8, 0.4]
            : isWarning
              ? [0, 0.5, 0.3]
              : [0, 0.9, 0.6, 0.9, 0.4],
        }}
        transition={{ duration: isCharging ? 0.4 : isWarning ? 0.5 : 2.1 }}
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at center, ${sideColor}66, ${style.theme}66, #000)`,
        }}
      />

      {/* 放射状光线 */}
      <motion.div
        initial={{ scale: isCharging ? 0.8 : 0, rotate: 0 }}
        animate={{
          scale: isCharging ? 1.5 : isWarning ? 1.2 : 3,
          rotate: style.spin.clockwise
            ? isCharging
              ? 180
              : isWarning
                ? 90
                : 360
            : isCharging
              ? -180
              : isWarning
                ? -90
                : -360,
        }}
        transition={{
          duration: isCharging ? 0.4 : isWarning ? 0.5 : style.spin.duration,
          ease: "easeOut",
        }}
        className="absolute w-[800px] h-[800px]"
        style={{
          background: `conic-gradient(from 0deg, transparent, ${sideColor}, transparent, ${style.theme}, transparent)`,
          opacity: isCharging ? 0.6 : isWarning ? 0.3 : 0.4,
          borderRadius: "50%",
        }}
      />

      {/* 类型专属装饰层 */}
      <TypeDecoration
        typeId={style.typeId}
        theme={style.theme}
        secondary={style.secondary}
        sideColor={sideColor}
        charging={isCharging}
      />

      {/* 预警阶段：侧边警示横幅 */}
      <AnimatePresence>
        {isWarning && (
          <motion.div
            initial={{ opacity: 0, x: overlay.side === "left" ? -80 : 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: overlay.side === "left" ? -40 : 40 }}
            transition={{ type: "spring", bounce: 0.5, duration: 0.5 }}
            className="relative z-20 flex flex-col items-center"
          >
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{
                duration: 0.3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="px-6 py-3 rounded-lg border-2 backdrop-blur-sm"
              style={{
                borderColor: sideColor,
                background: `${sideColor}22`,
                boxShadow: `0 0 30px ${sideColor}, inset 0 0 20px ${sideColor}44`,
              }}
            >
              <div
                className="text-xs font-black tracking-[0.4em] mb-1"
                style={{
                  color: sideColor,
                  textShadow: `0 0 10px ${sideColor}`,
                }}
              >
                {overlay.side === "left"
                  ? "◀ ULTIMATE INCOMING"
                  : "ULTIMATE INCOMING ▶"}
              </div>
              <div className="text-lg font-black font-display tracking-wider text-white">
                {overlay.attackerName}
              </div>
              <div
                className="text-[10px] tracking-widest mt-1"
                style={{ color: sideColor }}
              >
                PREPARING ULT...
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 蓄力阶段：中心能量球 + 角色名 */}
      <AnimatePresence>
        {isCharging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: [0.8, 1.2, 1] }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.4 }}
            className="absolute z-20 flex flex-col items-center"
          >
            <motion.div
              {...style.chargeOrbAnimation}
              className="w-32 h-32 rounded-full blur-xl"
              style={{
                background: `radial-gradient(circle, ${style.theme}, ${sideColor})`,
                boxShadow: `0 0 80px ${style.theme}, 0 0 160px ${sideColor}`,
              }}
            />
            <div
              className="mt-6 text-sm font-black tracking-[0.4em]"
              style={{
                color: style.theme,
                textShadow: `0 0 12px ${style.theme}`,
              }}
            >
              {style.chargeLabel}
            </div>
            <div className="text-xl text-white/90 mt-1 tracking-wider">
              — {overlay.attackerName} —
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 释放阶段：大招图片铺满全屏 + 技能名叠加 */}
      <AnimatePresence>
        {isRelease && (
          <>
            {/* 全屏大招图片背景 */}
            {overlay.skillImageUrl ? (
              <motion.div
                initial={{ opacity: 0, scale: 1.15 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="absolute inset-0 z-0 overflow-hidden"
              >
                <motion.img
                  {...style.imageAnimation}
                  src={overlay.skillImageUrl}
                  alt={overlay.skillName}
                  className="w-full h-full object-cover ultimate-image-shake"
                />
                {/* 底部渐变遮罩，保证文字可读 */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(180deg, ${style.theme}22 0%, transparent 30%, transparent 50%, rgba(0,0,0,0.85) 100%)`,
                  }}
                />
                {/* 侧边色调染色（标识攻击方） */}
                <div
                  className="absolute inset-0 mix-blend-overlay"
                  style={{
                    background: `linear-gradient(90deg, ${sideColor}55 0%, transparent 50%, ${sideColor}55 100%)`,
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
                className="absolute z-0 text-9xl font-black font-display"
                style={{
                  color: style.theme,
                  textShadow: `0 0 40px ${style.theme}, 0 0 80px ${style.secondary}`,
                }}
              >
                ☄
              </motion.div>
            )}

            {/* 叠加文字信息（顶部技能名 + 底部署名） */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="absolute top-10 left-0 right-0 text-center px-4 z-20"
            >
              <div
                className="text-xs tracking-[0.5em] mb-2"
                style={{
                  color: style.theme,
                  textShadow: `0 0 10px ${style.theme}`,
                }}
              >
                ▼ ULTIMATE SKILL ▼
              </div>
              <h2
                data-text={overlay.skillName}
                className="glitch-text text-4xl md:text-6xl font-black font-display tracking-wider"
                style={{
                  color: style.theme,
                  textShadow: `0 0 20px ${style.theme}, 0 0 40px ${style.secondary}`,
                }}
              >
                {overlay.skillName}
              </h2>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="absolute bottom-10 left-0 right-0 text-center z-20"
            >
              <div className="text-sm text-white/90 tracking-wider">
                — {overlay.attackerName} —
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

type ManualTurnState = "waiting" | "player" | "resolving" | "finished";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const describeBossIntent = (skill: Skill): string => {
  if (isUltimateSkill(skill)) return "准备释放大招";
  if (skill.type === "heal") return "准备恢复生命";
  if (skill.type === "buff") return "准备强化自身";
  if (skill.type === "debuff") return "准备削弱你";
  if (skill.damageMultiplier >= 2.2) return "准备打出高伤害";
  return "准备普通攻击";
};

export const BattleScreen: React.FC = () => {
  const {
    player1,
    player2,
    setPlayer1,
    setPlayer2,
    updatePlayer1Hp,
    updatePlayer2Hp,
    updatePlayer1UltimateCharge,
    updatePlayer2UltimateCharge,
    addBattleLog,
    battleLogs,
    setWinner,
    battleMode,
    towerLayer,
    towerRosterId,
    towerAutoMode,
    setPhase,
    apiKey,
    baseUrl,
    model,
    apiMode,
  } = useGameStore();
  const cfg = {
    apiKey,
    baseUrl,
    model,
    apiMode,
  };
  const [isBattling, setIsBattling] = useState(false);
  const [hitSide, setHitSide] = useState<"left" | "right" | null>(null);
  const [attackerSide, setAttackerSide] = useState<"left" | "right" | null>(
    null,
  );
  const [popups, setPopups] = useState<{
    left: PopupDamage[];
    right: PopupDamage[];
  }>({ left: [], right: [] });
  const [shakeScreen, setShakeScreen] = useState(false);
  const [ultimateOverlay, setUltimateOverlay] =
    useState<UltimateOverlay | null>(null);
  const [manualTurn, setManualTurn] = useState<ManualTurnState>("waiting");
  const [bossIntent, setBossIntent] = useState<Skill | null>(null);
  const manualEngineRef = useRef<BattleEngine | null>(null);
  const manualStartedRef = useRef(false);
  const manualLogsRef = useRef<BattleEvent[]>([]);
  const prefetchTurnRef = useRef(0);

  // 自动模式：防止 StrictMode 双重调用导致 simulateBattle 重复执行
  const autoBattleStartedRef = useRef(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logsContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [battleLogs]);

  useEffect(() => {
    cleanupEvolutionPrefetchCache();
  }, []);

  useEffect(() => {
    if (!towerRosterId) return;
    return () => {
      if (useGameStore.getState().phase === "TOWER_RESULT") return;
      clearEvolutionPrefetchForRoster(towerRosterId);
    };
  }, [towerRosterId]);

  /** 预加载大招图片，避免首次显示时卡顿。返回 Promise，可用于等待就绪 */
  const preloadUltimateImage = useCallback((url?: string): Promise<void> => {
    if (!url) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      const done = () => resolve();
      img.onload = done;
      img.onerror = done;
      img.src = url;
      // 兜底：最多等 1.2s，避免图片卡住阻塞流程
      setTimeout(done, 1200);
    });
  }, []);

  // 组件挂载后预加载所有大招类型图，减少战斗中的加载等待
  useEffect(() => {
    const urls = new Set<string>();
    [player1, player2].forEach((p) => {
      p?.skills.forEach((s) => {
        if (s.imageUrl) urls.add(s.imageUrl);
      });
    });
    urls.forEach((url) => preloadUltimateImage(url));
  }, [player1, player2, preloadUltimateImage]);

  /** 播放一个战斗事件的动画效果（伤害弹窗、受击、大招等） */
  const playLogEffects = useCallback(
    async (log: BattleEvent) => {
      if (log.isUltimate) {
        const side: "left" | "right" =
          log.attacker === "player1" ? "left" : "right";

        // 阶段 0：预警提示（500ms）—— 提前告知哪边要放大招，同时并行预加载图片
        setUltimateOverlay({
          attackerName: log.attackerName || "",
          skillName: log.skillName || "",
          skillImageUrl: undefined,
          description: log.message,
          side,
          ultimateType: log.ultimateType,
          warning: true,
        });
        // 预警期间并行预加载图片，确保释放阶段不卡顿
        await Promise.race([
          preloadUltimateImage(log.skillImageUrl),
          new Promise((r) => setTimeout(r, 500)),
        ]);

        // 阶段 1：蓄力/爆气过渡（400ms）
        setUltimateOverlay({
          attackerName: log.attackerName || "",
          skillName: log.skillName || "",
          skillImageUrl: undefined,
          description: log.message,
          side,
          ultimateType: log.ultimateType,
          charging: true,
        });
        setShakeScreen(true);
        await new Promise((r) => setTimeout(r, 400));

        // 阶段 2：正式大招展示
        setUltimateOverlay({
          attackerName: log.attackerName || "",
          skillName: log.skillName || "",
          skillImageUrl: log.skillImageUrl,
          description: log.message,
          side,
          ultimateType: log.ultimateType,
          charging: false,
        });
        await new Promise((r) => setTimeout(r, 2100));
        setUltimateOverlay(null);
        setShakeScreen(false);
      }

      if (log.damage && log.attacker !== "system") {
        const targetSide: "left" | "right" =
          log.attacker === "player1" ? "right" : "left";
        const attackerSideValue: "left" | "right" =
          log.attacker === "player1" ? "left" : "right";

        setAttackerSide(attackerSideValue);
        setHitSide(targetSide);
        if (log.isCrit || log.isUltimate) setShakeScreen(true);

        const popupId = `${log.id}-popup`;
        setPopups((prev) => ({
          ...prev,
          [targetSide]: [
            ...prev[targetSide],
            {
              id: popupId,
              side: targetSide,
              value: log.damage!,
              isCrit: log.isCrit ?? false,
            },
          ],
        }));

        setTimeout(() => {
          setHitSide(null);
          setAttackerSide(null);
          if (!log.isUltimate) setShakeScreen(false);
        }, 500);
        setTimeout(() => {
          setPopups((prev) => ({
            ...prev,
            [targetSide]: prev[targetSide].filter((p) => p.id !== popupId),
          }));
        }, 1300);
      }

      if (log.heal && log.attacker !== "system") {
        const healerSide: "left" | "right" =
          log.attacker === "player1" ? "left" : "right";
        const popupId = `${log.id}-heal`;
        setPopups((prev) => ({
          ...prev,
          [healerSide]: [
            ...prev[healerSide],
            {
              id: popupId,
              side: healerSide,
              value: log.heal!,
              isCrit: false,
              isHeal: true,
            },
          ],
        }));
        setTimeout(() => {
          setPopups((prev) => ({
            ...prev,
            [healerSide]: prev[healerSide].filter((p) => p.id !== popupId),
          }));
        }, 1300);
      }
    },
    [preloadUltimateImage],
  );

  const appendManualLog = useCallback(
    (log: BattleEvent) => {
      manualLogsRef.current = [...manualLogsRef.current, log];
      addBattleLog(log);
    },
    [addBattleLog],
  );

  const syncManualCharacters = useCallback(
    (engine: BattleEngine) => {
      const next = engine.getState();
      setPlayer1(next.p1);
      setPlayer2(next.p2);
    },
    [setPlayer1, setPlayer2],
  );

  const appendDefeatLog = useCallback(
    (defenderName: string) => {
      const turn =
        manualEngineRef.current?.getState().currentTurn ??
        manualLogsRef.current.length;
      appendManualLog({
        id: `manual-${Date.now()}-${defenderName}-down`,
        turn,
        attacker: "system",
        message: `【${defenderName}】倒下了！`,
      });
    },
    [appendManualLog],
  );

  const finishManualBattle = useCallback(
    async (engine: BattleEngine, winner: "player1" | "player2") => {
      setManualTurn("finished");
      setBossIntent(null);

      const state = engine.getState();
      const result = winner === "player1" ? "win" : "loss";
      const summary = summarizeBattle(
        manualLogsRef.current,
        state.p1,
        state.p2,
        result,
      );
      useTowerStore.setState({
        lastSummary: summary,
        lastResult: result,
      });

      await wait(900);
      setWinner(winner);
    },
    [setWinner],
  );

  const prefetchEvolutionAssets = useCallback(
    (summary: ReturnType<typeof summarizeBattle>, result: "win" | "loss") => {
      if (battleMode !== "pve_tower" || !towerRosterId) return;
      const rosterChar = useRosterStore
        .getState()
        .roster.find((char) => char.rosterId === towerRosterId);
      if (!rosterChar) return;

      void startEvolutionPrefetch(
        {
          rosterId: towerRosterId,
          layer: towerLayer,
          result,
          character: rosterChar,
          summary,
        },
        async (character, _summary, stage) =>
          buildLocalEvolution(character, stage),
        cfg,
      );
    },
    [battleMode, towerLayer, towerRosterId],
  );

  // ============ 九层塔半手动模式 ============
  useEffect(() => {
    if (battleMode !== "pve_tower") return;
    if (!player1 || !player2) return;
    if (manualStartedRef.current) return;

    manualStartedRef.current = true;
    const engine = new BattleEngine(player1, player2);
    manualEngineRef.current = engine;
    manualLogsRef.current = [];
    setIsBattling(true);

    const openingLogs = engine.createOpeningLogs();
    openingLogs.forEach((log) => appendManualLog(log));
    syncManualCharacters(engine);
    setBossIntent(engine.chooseSkill(engine.p2, engine.p1));
    setManualTurn("player");
    prefetchEvolutionAssets(
      summarizeBattle([], engine.p1, engine.p2, "win"),
      "win",
    );
  }, [
    appendManualLog,
    battleMode,
    player1,
    player2,
    prefetchEvolutionAssets,
    syncManualCharacters,
  ]);

  const handlePlayerSkill = useCallback(
    async (skill: Skill) => {
      const engine = manualEngineRef.current;
      if (!engine || manualTurn !== "player") return;
      if (isUltimateSkill(skill) && !engine.canUseUltimate(engine.p1)) return;

      setManualTurn("resolving");
      const playerResult = engine.executeSkill("player1", skill);
      appendManualLog(playerResult.log);
      await playLogEffects(playerResult.log);
      syncManualCharacters(engine);
      prefetchTurnRef.current += 1;

      if (engine.isBattleOver()) {
        appendDefeatLog(engine.p2.name);
        const finalResult = engine.getWinner() === "player1" ? "win" : "loss";
        const finalState = engine.getState();
        const finalSummary = summarizeBattle(
          manualLogsRef.current,
          finalState.p1,
          finalState.p2,
          finalResult,
        );
        prefetchEvolutionAssets(finalSummary, finalResult);
        await finishManualBattle(engine, engine.getWinner());
        return;
      }

      await wait(450);
      const bossSkill = bossIntent ?? engine.chooseSkill(engine.p2, engine.p1);
      const bossResult = engine.executeSkill("player2", bossSkill);
      appendManualLog(bossResult.log);
      await playLogEffects(bossResult.log);
      syncManualCharacters(engine);
      prefetchTurnRef.current += 1;

      if (prefetchTurnRef.current % 2 === 0) {
        const liveState = engine.getState();
        const liveSummary = summarizeBattle(
          manualLogsRef.current,
          liveState.p1,
          liveState.p2,
          "win",
        );
        prefetchEvolutionAssets(liveSummary, "win");
      }

      if (engine.isBattleOver()) {
        appendDefeatLog(engine.p1.name);
        const finalResult = engine.getWinner() === "player1" ? "win" : "loss";
        const finalState = engine.getState();
        const finalSummary = summarizeBattle(
          manualLogsRef.current,
          finalState.p1,
          finalState.p2,
          finalResult,
        );
        prefetchEvolutionAssets(finalSummary, finalResult);
        await finishManualBattle(engine, engine.getWinner());
        return;
      }

      setBossIntent(engine.chooseSkill(engine.p2, engine.p1));
      setManualTurn("player");
    },
    [
      appendDefeatLog,
      appendManualLog,
      bossIntent,
      finishManualBattle,
      manualTurn,
      playLogEffects,
      prefetchEvolutionAssets,
      syncManualCharacters,
    ],
  );

  // ============ 九层塔自动选技能 ============
  const chooseAutoSkill = useCallback((player: CharacterData): Skill | null => {
    const ultimate = player.skills.find(
      (s) => s.isUltimate || s.type === "ultimate",
    );
    if (ultimate && player.ultimateCharge >= ULTIMATE_THRESHOLD) {
      return ultimate;
    }
    const hpRatio = player.hp / player.maxHp;
    if (hpRatio < 0.5) {
      const heal = player.skills.find((s) => s.type === "heal");
      if (heal) return heal;
    }
    const attackSkills = player.skills
      .filter(
        (s) =>
          !s.isUltimate &&
          s.type !== "ultimate" &&
          s.type !== "heal" &&
          (s.type === "attack" || s.damageMultiplier > 0),
      )
      .sort((a, b) => (b.damageMultiplier || 0) - (a.damageMultiplier || 0));
    return attackSkills[0] || player.skills[0] || null;
  }, []);

  useEffect(() => {
    if (battleMode !== "pve_tower" || !towerAutoMode) return;
    if (manualTurn !== "player") return;
    const engine = manualEngineRef.current;
    if (!engine) return;
    const skill = chooseAutoSkill(engine.p1);
    if (!skill) return;
    const timer = setTimeout(() => {
      handlePlayerSkill(skill);
    }, 500);
    return () => clearTimeout(timer);
  }, [
    manualTurn,
    towerAutoMode,
    battleMode,
    chooseAutoSkill,
    handlePlayerSkill,
  ]);

  // ============ 自动模式 ============
  useEffect(() => {
    if (battleMode === "pve_tower") return;
    if (!player1 || !player2 || isBattling) return;
    // StrictMode 下 effect 会双重调用，使用 ref 阻止第二次启动
    if (autoBattleStartedRef.current) return;
    autoBattleStartedRef.current = true;

    const startBattle = async () => {
      setIsBattling(true);
      const engine = new BattleEngine(player1, player2);
      const result = engine.simulateBattle();

      let currentP1Hp = player1.maxHp;
      let currentP2Hp = player2.maxHp;

      for (let i = 0; i < result.logs.length; i++) {
        const log = result.logs[i];
        const delay = log.isUltimate ? 2200 : 1300;
        await new Promise((resolve) => setTimeout(resolve, delay));
        addBattleLog(log);

        await playLogEffects(log);

        // 同步 HP
        if (log.damage) {
          if (log.attacker === "player1") {
            currentP2Hp = Math.max(0, currentP2Hp - log.damage);
            updatePlayer2Hp(currentP2Hp);
          } else if (log.attacker === "player2") {
            currentP1Hp = Math.max(0, currentP1Hp - log.damage);
            updatePlayer1Hp(currentP1Hp);
          }
        }
        if (log.heal) {
          if (log.attacker === "player1") {
            currentP1Hp = Math.min(player1.maxHp, currentP1Hp + log.heal);
            updatePlayer1Hp(currentP1Hp);
          } else if (log.attacker === "player2") {
            currentP2Hp = Math.min(player2.maxHp, currentP2Hp + log.heal);
            updatePlayer2Hp(currentP2Hp);
          }
        }

        // 同步大招充能
        if (log.attackerCharge !== undefined) {
          if (log.attacker === "player1") {
            updatePlayer1UltimateCharge(log.attackerCharge);
          } else if (log.attacker === "player2") {
            updatePlayer2UltimateCharge(log.attackerCharge);
          }
        }
        if (log.defenderCharge !== undefined) {
          if (log.attacker === "player1") {
            updatePlayer2UltimateCharge(log.defenderCharge);
          } else if (log.attacker === "player2") {
            updatePlayer1UltimateCharge(log.defenderCharge);
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      setWinner(result.winner);
    };

    startBattle();
  }, [
    player1,
    player2,
    isBattling,
    addBattleLog,
    updatePlayer1Hp,
    updatePlayer2Hp,
    updatePlayer1UltimateCharge,
    updatePlayer2UltimateCharge,
    setWinner,
    playLogEffects,
    battleMode,
  ]);

  if (!player1 || !player2) return null;

  const leftChar = player1;
  const rightChar = player2;
  const isTowerManual = battleMode === "pve_tower";
  const canPickSkill = isTowerManual && manualTurn === "player";
  const handleBack = () => {
    const ok = window.confirm("确定要离开当前战斗吗？战斗进度将丢失。");
    if (!ok) return;
    setPhase(battleMode === "pve_tower" ? "TOWER_HUB" : "MODE_SELECT");
  };

  return (
    <div
      className={`h-dvh max-h-dvh flex flex-col overflow-hidden p-3 md:p-4 relative grid-bg ${shakeScreen ? "shake" : ""}`}
    >
      <ParticleField count={35} colors={["#66FCF1", "#FF003C", "#FFD700"]} />
      <BackButton
        onClick={handleBack}
        color="#66FCF1"
        className="absolute left-4 top-4 z-30"
      />

      {/* VS center spotlight */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-yellow-500/30 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Ultimate Full-Screen Overlay */}
      <AnimatePresence>
        {ultimateOverlay && <UltimateOverlayView overlay={ultimateOverlay} />}
      </AnimatePresence>

      {/* Header */}
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center mb-3 z-10 flex-shrink-0"
      >
        <h2 className="text-2xl md:text-3xl font-black tracking-[0.3em] text-[#C5C6C7] flex items-center justify-center gap-4 font-display">
          <Swords
            className="text-red-500"
            size={28}
            style={{ filter: "drop-shadow(0 0 6px red)" }}
          />
          <span data-text="BATTLE ARENA" className="glitch-text">
            BATTLE ARENA
          </span>
          <Swords
            className="text-red-500"
            size={28}
            style={{ filter: "drop-shadow(0 0 6px red)" }}
          />
        </h2>
        <div className="text-xs text-[#8a8d91] mt-1 tracking-widest flex items-center justify-center gap-2">
          <Bot size={12} />{" "}
          {isTowerManual
            ? towerAutoMode
              ? "▼ TOWER AUTO MODE ▼"
              : "▼ TOWER COMMAND MODE ▼"
            : "▼ AUTO COMBAT IN PROGRESS ▼"}
        </div>
      </motion.div>

      <div className="min-h-0 flex-1 flex flex-col md:flex-row gap-4 items-stretch max-w-7xl w-full mx-auto z-10 overflow-hidden">
        <CharacterCard
          char={leftChar}
          isLeft={true}
          beingHit={hitSide === "left"}
          isAttacking={attackerSide === "left"}
          isActiveTurn={canPickSkill}
          canUseSkills={canPickSkill}
          onSkillSelect={isTowerManual ? handlePlayerSkill : undefined}
          popups={popups.left}
        />

        <div className="min-h-0 flex-1 flex flex-col bg-[#0B0C10]/90 border-2 border-[#45A29E]/40 rounded-xl overflow-hidden shadow-2xl relative backdrop-blur-md">
          {/* Header bar */}
          <div className="bg-gradient-to-r from-[#1F2833] via-[#0B0C10] to-[#1F2833] p-3 text-center text-xs font-black tracking-[0.3em] border-b border-[#45A29E]/30 flex justify-between items-center">
            <span className="text-[#66FCF1] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              REC
            </span>
            <span className="text-[#C5C6C7]">▶ COMBAT LOG ◀</span>
            <span className="text-[#FF003C]">TURN {battleLogs.length}</span>
          </div>

          {isTowerManual && (
            <div className="border-b border-[#45A29E]/30 bg-[#1F2833]/55 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[10px] tracking-[0.3em] text-[#66FCF1] font-black">
                    {towerAutoMode
                      ? "AUTO PLAYING"
                      : manualTurn === "player"
                        ? "YOUR MOVE"
                        : manualTurn === "resolving"
                          ? "RESOLVING"
                          : "TOWER BATTLE"}
                  </div>
                  <div className="text-xs text-[#8a8d91] mt-1">
                    {towerAutoMode
                      ? "自动模式中，系统会按最优策略释放技能。"
                      : "选择技能后，Boss 会按右侧意图行动。"}
                  </div>
                </div>
                {bossIntent && (
                  <div className="min-w-0 rounded border border-[#FF003C]/45 bg-[#0B0C10]/70 px-3 py-2">
                    <div className="text-[10px] text-[#FF003C] tracking-widest font-black">
                      BOSS INTENT
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <span className="text-[#C5C6C7]">
                        {describeBossIntent(bossIntent)}
                      </span>
                      <span className="text-[#FF003C] font-black truncate">
                        · {bossIntent.name}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div
            ref={logsContainerRef}
            className="min-h-0 flex-1 p-4 overflow-y-auto overscroll-contain flex flex-col gap-2 text-sm relative"
          >
            <AnimatePresence initial={false}>
              {battleLogs.map((log) => {
                let colorClass = "text-[#C5C6C7]";
                let borderClass = "border-[#45A29E]";
                if (log.attacker === "player1") {
                  colorClass = "text-[#66FCF1]";
                  borderClass = "border-[#66FCF1]";
                }
                if (log.attacker === "player2") {
                  colorClass = "text-[#FF003C]";
                  borderClass = "border-[#FF003C]";
                }
                if (log.attacker === "system") {
                  colorClass = "text-yellow-400 font-bold";
                  borderClass = "border-yellow-400";
                }
                if (log.isUltimate) {
                  colorClass = "text-[#FFD700] font-bold";
                  borderClass = "border-[#FFD700]";
                }

                return (
                  <motion.div
                    key={log.id}
                    initial={{
                      opacity: 0,
                      x:
                        log.attacker === "player1"
                          ? -40
                          : log.attacker === "player2"
                            ? 40
                            : 0,
                      scale: 0.95,
                    }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 18 }}
                    className={`py-2 px-3 pr-16 rounded bg-[#1F2833]/60 border-l-4 ${borderClass} relative leading-relaxed ${log.isUltimate ? "shadow-[0_0_15px_rgba(255,215,0,0.5)]" : ""}`}
                  >
                    {log.isUltimate && (
                      <span className="absolute top-1/2 -translate-y-1/2 right-2 text-[10px] px-1.5 py-0.5 font-bold rounded tracking-wider bg-[#FFD700] text-[#0B0C10] animate-pulse">
                        ★ ULT
                      </span>
                    )}
                    {!log.isUltimate && (log.isSkill || log.heal) && (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 right-2 text-[10px] px-1.5 py-0.5 font-bold rounded tracking-wider"
                        style={{
                          backgroundColor:
                            log.attacker === "player1" ? "#66FCF1" : "#FF003C",
                          color: "#0B0C10",
                        }}
                      >
                        {log.heal ? "HEAL" : "SKILL"}
                      </span>
                    )}
                    <span className={colorClass}>{log.message}</span>
                    {log.isCrit && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="ml-2 text-yellow-400 font-black animate-pulse text-[11px] tracking-wider"
                      >
                        ★ CRIT!
                      </motion.span>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        <CharacterCard
          char={rightChar}
          isLeft={false}
          beingHit={hitSide === "right"}
          isAttacking={attackerSide === "right"}
          isActiveTurn={isTowerManual && manualTurn === "resolving"}
          popups={popups.right}
        />
      </div>
    </div>
  );
};
