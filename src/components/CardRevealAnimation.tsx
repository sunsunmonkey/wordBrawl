import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { CharacterData, RARITY_CONFIGS, Rarity } from "../store/useGameStore";
import { HeroCard } from "./HeroCard";
import { ParticleField } from "./ParticleField";

type RevealPhase = "intro" | "pack" | "burst" | "reveal" | "done";

interface CardRevealAnimationProps {
  character: CharacterData;
  onClose: () => void;
}

export const CardRevealAnimation: React.FC<CardRevealAnimationProps> = ({
  character,
  onClose,
}) => {
  const [phase, setPhase] = useState<RevealPhase>("intro");
  const [canSkip, setCanSkip] = useState(false);

  const rarity: Rarity = character.rarity || "R";
  const config = RARITY_CONFIGS[rarity];
  const isHighRarity = rarity === "SSR" || rarity === "UR";
  const isUr = rarity === "UR";

  useEffect(() => {
    setCanSkip(false);
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setPhase("pack"), 400));
    timers.push(setTimeout(() => setCanSkip(true), 800));

    if (isUr) {
      timers.push(setTimeout(() => setPhase("burst"), 2200));
      timers.push(setTimeout(() => setPhase("reveal"), 3000));
      timers.push(setTimeout(() => setPhase("done"), 3800));
    } else if (isHighRarity) {
      timers.push(setTimeout(() => setPhase("burst"), 1800));
      timers.push(setTimeout(() => setPhase("reveal"), 2500));
      timers.push(setTimeout(() => setPhase("done"), 3200));
    } else {
      timers.push(setTimeout(() => setPhase("burst"), 1400));
      timers.push(setTimeout(() => setPhase("reveal"), 2000));
      timers.push(setTimeout(() => setPhase("done"), 2600));
    }

    return () => timers.forEach(clearTimeout);
  }, [character.name, isHighRarity, isUr]);

  const handleSkip = useCallback(() => {
    if (!canSkip) return;
    setPhase("done");
  }, [canSkip]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleSkip}
    >
      {/* 背景遮罩 */}
      <motion.div
        className="absolute inset-0 bg-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "done" ? 0.85 : 0.95 }}
        transition={{ duration: 0.5 }}
      />

      {/* 背景粒子 */}
      {(phase === "pack" || phase === "burst" || phase === "reveal") && (
        <ParticleField
          count={isUr ? 80 : isHighRarity ? 50 : 25}
          colors={[config.primaryColor, config.secondaryColor, "#FFD700"]}
        />
      )}

      {/* UR/SSR 特殊：彩色极光背景 */}
      {isHighRarity && (phase === "burst" || phase === "reveal") && (
        <>
          <motion.div
            className="absolute w-[800px] h-[800px] rounded-full blur-[100px] opacity-60"
            style={{
              background: config.borderGradient,
            }}
            initial={{ scale: 0, rotate: 0 }}
            animate={{
              scale: [0, 1.5, 1],
              rotate: 360,
              opacity: [0, 0.8, 0.5],
            }}
            transition={{
              scale: { duration: isUr ? 1.5 : 1, ease: "easeOut" },
              rotate: { duration: 20, repeat: Infinity, ease: "linear" },
              opacity: { duration: 1 },
            }}
          />
          {/* UR 额外彩虹光环 */}
          {isUr && (
            <motion.div
              className="absolute w-[600px] h-[600px] rounded-full blur-[80px]"
              style={{
                background:
                  "conic-gradient(#FF003C, #FF6B9D, #FFD700, #66FCF1, #C084FC, #FF003C)",
              }}
              initial={{ scale: 0, rotate: 0, opacity: 0 }}
              animate={{
                scale: [0, 1.2, 0.9],
                rotate: -360,
                opacity: [0, 0.7, 0.5],
              }}
              transition={{
                scale: { duration: 2, ease: "easeOut" },
                rotate: { duration: 8, repeat: Infinity, ease: "linear" },
                opacity: { duration: 1.5 },
                delay: 0.3,
              }}
            />
          )}
        </>
      )}

      {/* 光柱从顶部射下 */}
      <AnimatePresence>
        {phase === "burst" && (
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-full"
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{
              scaleY: [0, 1.2, 1],
              opacity: [0, 1, isUr ? 0.9 : 0.6],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: isUr ? 0.8 : 0.5, ease: "easeOut" }}
            style={{
              background: `linear-gradient(to bottom, ${config.primaryColor}00 0%, ${config.glowColor} 30%, ${config.primaryColor} 100%)`,
              filter: `blur(${isUr ? 30 : 20}px)`,
              transformOrigin: "top center",
            }}
          />
        )}
      </AnimatePresence>

      {/* 卡包阶段 */}
      <AnimatePresence>
        {phase === "pack" && (
          <motion.div
            className="relative z-10"
            initial={{ y: -300, rotateX: -45, scale: 0.5, opacity: 0 }}
            animate={{
              y: [null, 30, -10, 0],
              rotateX: [null, 10, -5, 0],
              scale: [null, 1.1, 0.95, 1],
              opacity: 1,
            }}
            exit={{
              scale: isUr ? 3 : isHighRarity ? 2 : 1.5,
              opacity: 0,
              filter: "brightness(3)",
            }}
            transition={{
              duration: isUr ? 2 : 1.5,
              times: [0, 0.6, 0.85, 1],
              ease: "easeOut",
            }}
          >
            <div
              className="w-48 h-72 rounded-xl flex items-center justify-center relative"
              style={{
                background: `linear-gradient(145deg, #1F2833, #0B0C10)`,
                border: `3px solid`,
                borderImage: `${config.borderGradient} 1`,
                boxShadow: `0 0 40px ${config.glowColor}, 0 0 80px ${config.glowColor}60, inset 0 0 40px rgba(${config.rgb}, 0.15)`,
              }}
            >
              <div
                className="absolute inset-2 rounded-lg flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, rgba(${config.rgb}, 0.2), transparent)`,
                  border: `1px dashed rgba(${config.rgb}, 0.4)`,
                }}
              >
                <div className="text-center">
                  <Sparkles
                    size={48}
                    className="mx-auto mb-3 animate-pulse"
                    style={{ color: config.primaryColor }}
                  />
                  <div
                    className="text-lg font-black tracking-[0.3em]"
                    style={{ color: config.primaryColor }}
                  >
                    词灵
                  </div>
                  <div
                    className="text-xs tracking-widest mt-1"
                    style={{ color: config.secondaryColor }}
                  >
                    SPIRIT CARD
                  </div>
                </div>
              </div>
              {/* 扫描线 */}
              <motion.div
                className="absolute inset-x-2 h-1"
                style={{
                  background: `linear-gradient(90deg, transparent, ${config.primaryColor}, transparent)`,
                  boxShadow: `0 0 20px ${config.glowColor}`,
                }}
                animate={{ y: ["-140px", "140px"] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 爆发闪光 */}
      <AnimatePresence>
        {phase === "burst" && (
          <motion.div
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.8, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: isUr ? 1 : 0.7 }}
          >
            {/* 中心闪光 */}
            <motion.div
              className="w-32 h-32 rounded-full"
              initial={{ scale: 0 }}
              animate={{ scale: [0, isUr ? 40 : isHighRarity ? 25 : 15] }}
              transition={{ duration: isUr ? 0.8 : 0.5, ease: "easeOut" }}
              style={{
                background: `radial-gradient(circle, white 0%, ${config.primaryColor} 30%, transparent 70%)`,
                boxShadow: `0 0 100px ${config.primaryColor}, 0 0 200px ${config.glowColor}`,
              }}
            />
            {/* UR 额外多层闪光环 */}
            {isUr && (
              <>
                <motion.div
                  className="absolute w-20 h-20 rounded-full border-4"
                  style={{ borderColor: "#FFD700" }}
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: 10, opacity: 0 }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                />
                <motion.div
                  className="absolute w-20 h-20 rounded-full border-4"
                  style={{ borderColor: "#FF6B9D" }}
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: 15, opacity: 0 }}
                  transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 卡牌揭示阶段 */}
      <AnimatePresence>
        {(phase === "reveal" || phase === "done") && (
          <motion.div
            className="relative z-20 flex flex-col items-center"
            initial={{ scale: 0.3, rotateY: 180, opacity: 0 }}
            animate={{
              scale: [null, 1.1, 1],
              rotateY: [null, -10, 0],
              opacity: 1,
              y: [null, -20, 0],
            }}
            transition={{
              duration: 0.8,
              times: [0, 0.7, 1],
              ease: "easeOut",
            }}
          >
            {/* 稀有度标签爆发 */}
            <motion.div
              className="mb-6 text-center"
              initial={{ scale: 0, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5, type: "spring" }}
            >
              <div
                className="text-4xl font-black tracking-widest mb-1"
                style={{
                  color: config.primaryColor,
                  textShadow: `0 0 20px ${config.glowColor}, 0 0 40px ${config.glowColor}`,
                }}
              >
                {config.labelEn}
              </div>
              <div
                className="text-lg tracking-[0.5em]"
                style={{ color: config.secondaryColor }}
              >
                {config.label}
              </div>
            </motion.div>

            {/* 英雄卡牌 */}
            <HeroCard character={character} size="lg" showStats={true} />

            {/* 词灵原型（如果有） */}
            {character.spiritProfile?.archetype && phase === "done" && (
              <motion.div
                className="mt-4 text-center max-w-xs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <div
                  className="text-xs text-[#8a8d91] italic"
                  style={{ color: config.secondaryColor }}
                >
                  「{character.spiritProfile.archetype}」
                </div>
              </motion.div>
            )}

            {/* 确认按钮 */}
            {phase === "done" && (
              <motion.button
                className="mt-8 px-10 py-3 rounded-lg font-black tracking-widest text-sm relative overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                style={{
                  background: `rgba(${config.rgb}, 0.15)`,
                  border: `2px solid ${config.primaryColor}`,
                  color: config.primaryColor,
                  boxShadow: `0 0 20px ${config.glowColor}`,
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
              >
                <span className="relative z-10 flex items-center gap-2">
                  <Sparkles size={16} />
                  收入麾下
                </span>
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(90deg, transparent, rgba(${config.rgb}, 0.3), transparent)`,
                  }}
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 跳过提示 */}
      {canSkip && phase !== "done" && (
        <motion.button
          className="absolute bottom-8 right-8 z-30 flex items-center gap-1 px-3 py-1.5 rounded text-[10px] tracking-wider text-[#8a8d91] hover:text-[#C5C6C7] transition-colors"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={(e) => {
            e.stopPropagation();
            setPhase("done");
          }}
        >
          <X size={12} />
          跳过动画
        </motion.button>
      )}

      {/* 点击任意处关闭提示（done阶段） */}
      {phase === "done" && (
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] text-[#8a8d91] tracking-wider"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          点击任意处或按钮继续
        </motion.div>
      )}
    </motion.div>
  );
};
