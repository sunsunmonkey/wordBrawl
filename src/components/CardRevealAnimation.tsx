import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Sparkles, RefreshCw, Trash2 } from "lucide-react";
import { CharacterData, RARITY_CONFIGS, Rarity } from "../store/useGameStore";
import { HeroCard } from "./HeroCard";

interface CardRevealAnimationProps {
  character: CharacterData;
  /** 收入麾下：保留该词灵 */
  onKeep: () => void;
  /** 放弃：从麾下移除该词灵 */
  onDiscard: () => void;
  /** 重新生成：放弃当前并用相同描述重新召唤 */
  onRegenerate: () => void;
}

export const CardRevealAnimation: React.FC<CardRevealAnimationProps> = ({
  character,
  onKeep,
  onDiscard,
  onRegenerate,
}) => {
  const [flipped, setFlipped] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [showSlogan, setShowSlogan] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);

  const rarity: Rarity = character.rarity || "R";
  const config = RARITY_CONFIGS[rarity];
  const isHighRarity = rarity === "SSR" || rarity === "UR";
  const signatureSkill =
    character.skills.find(
      (skill) => skill.isUltimate || skill.type === "ultimate",
    )?.name ??
    character.skills[0]?.name ??
    character.name;
  const battleCry =
    character.spiritProfile?.battleCry?.trim() === "此刻，词意成真。"
      ? ""
      : character.spiritProfile?.battleCry?.trim();
  const slogan =
    character.spiritProfile?.slogan?.trim() ||
    battleCry ||
    character.spiritProfile?.catchphrases?.[0]?.trim() ||
    `${character.name}，以${signatureSkill}为誓。`;

  // 先让专属 Slogan 在卡背停留片刻，再自动翻到角色正面。
  useEffect(() => {
    setFlipped(false);
    setRevealed(false);
    setShowSlogan(false);
    setIsCardHovered(false);
    const t = setTimeout(() => setFlipped(true), 800);
    return () => clearTimeout(t);
  }, [character.name]);

  const handleBackdropClick = useCallback(() => {
    if (revealed) onKeep();
  }, [revealed, onKeep]);

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={handleBackdropClick}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/90" />

      {/* 稀有度辉光（静态，仅缩放淡入，交给 GPU） */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 520,
          height: 520,
          background: `radial-gradient(circle, ${config.glowColor} 0%, transparent 70%)`,
          filter: "blur(60px)",
          willChange: "transform, opacity",
          transform: "translateZ(0)",
        }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: isHighRarity ? 0.55 : 0.35 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />

      {/* 内容区域：常规视口居中，矮视口可完整滚动。 */}
      <div className="relative z-10 h-full overflow-y-auto px-4 py-6">
        <div className="flex min-h-full w-full flex-col items-center justify-center">
          {/* 稀有度标签必须与卡片位于同一布局流，避免和居中的卡片重叠。 */}
          <motion.div
            className="mb-3 text-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: revealed ? 1 : 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <div
              className="max-w-[calc(100vw-2rem)] text-3xl font-black leading-none tracking-[0.16em] sm:text-4xl sm:tracking-widest"
              style={{
                color: config.primaryColor,
                textShadow: `0 0 20px ${config.glowColor}, 0 0 40px ${config.glowColor}`,
              }}
            >
              {config.labelEn}
            </div>
            <div
              className="mt-1 text-sm leading-none tracking-[0.5em]"
              style={{ color: config.secondaryColor }}
            >
              {config.label}
            </div>
          </motion.div>

          {/* 翻牌区 */}
          <div
            className="flex flex-col items-center"
            style={{ perspective: 1400 }}
          >
            <motion.div
              className={`relative shrink-0 ${revealed ? "cursor-pointer" : ""}`}
              style={{
                transformStyle: "preserve-3d",
                willChange: "transform",
              }}
              initial={{ rotateY: 180 }}
              animate={{ rotateY: flipped && !showSlogan ? 0 : 180 }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => {
                if (!revealed && flipped && !showSlogan) {
                  setRevealed(true);
                  if (isCardHovered) setShowSlogan(true);
                }
              }}
              onHoverStart={() => {
                setIsCardHovered(true);
                if (revealed) setShowSlogan(true);
              }}
              onHoverEnd={() => {
                setIsCardHovered(false);
                if (revealed) setShowSlogan(false);
              }}
              onClick={(event) => {
                if (!revealed) return;
                event.stopPropagation();
                setShowSlogan((visible) => !visible);
              }}
            >
              {/* 正面：角色卡（决定容器尺寸） */}
              <div style={{ backfaceVisibility: "hidden" }}>
                <HeroCard
                  character={character}
                  size="lg"
                  showStats={true}
                  showQuote={false}
                />
              </div>

              {/* 卡背：初始展示 Slogan，揭示后悬停翻面，点击可再次切换。 */}
              <div
                className="absolute inset-0 overflow-hidden rounded-2xl"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                  background:
                    "linear-gradient(145deg, #151725 0%, #0a0b12 100%)",
                  border: `1px solid ${config.primaryColor}99`,
                  boxShadow: `0 0 40px ${config.glowColor}, inset 0 0 32px rgba(${config.rgb}, 0.16)`,
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-60"
                  style={{
                    background: `
                  radial-gradient(circle at 18% 18%, rgba(${config.rgb}, 0.2), transparent 30%),
                  linear-gradient(135deg, transparent 49.8%, rgba(${config.rgb}, 0.12) 50%, transparent 50.2%)
                `,
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-3 rounded-xl border border-dashed"
                  style={{ borderColor: `rgba(${config.rgb}, 0.28)` }}
                />
                <div className="relative flex h-full items-center px-7 py-8">
                  <p
                    className="w-full text-center font-display text-[22px] font-semibold leading-[1.75] text-white"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 5,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textShadow: `0 0 20px rgba(${config.rgb}, 0.35)`,
                    }}
                  >
                    <span style={{ color: config.primaryColor }}>“</span>
                    {slogan}
                    <span style={{ color: config.primaryColor }}>”</span>
                  </p>
                </div>
              </div>
            </motion.div>

            {/* 词灵原型 */}
            {character.spiritProfile?.archetype && (
              <motion.div
                className="mt-4 max-w-xs text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: revealed ? 1 : 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <div
                  className="text-xs italic"
                  style={{ color: config.secondaryColor }}
                >
                  「{character.spiritProfile.archetype}」
                </div>
              </motion.div>
            )}

            {/* 三个选择：放弃 / 重新生成 / 收入麾下 */}
            <motion.div
              className="mt-7 flex flex-wrap items-center justify-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: revealed ? 1 : 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              style={{ pointerEvents: revealed ? "auto" : "none" }}
            >
              {/* 放弃 */}
              <motion.button
                className="px-5 py-3 rounded-lg font-bold tracking-widest text-xs flex items-center gap-2"
                style={{
                  background: "rgba(138,141,145,0.1)",
                  border: "1px solid rgba(197,198,199,0.3)",
                  color: "#8a8d91",
                }}
                whileHover={{
                  scale: 1.05,
                  color: "#FF6B6B",
                  borderColor: "#FF6B6B",
                }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDiscard();
                }}
              >
                <Trash2 size={14} />
                放弃
              </motion.button>

              {/* 重新生成 */}
              <motion.button
                className="px-5 py-3 rounded-lg font-bold tracking-widest text-xs flex items-center gap-2"
                style={{
                  background: "rgba(102,252,241,0.1)",
                  border: "1px solid rgba(102,252,241,0.4)",
                  color: "#66FCF1",
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onRegenerate();
                }}
              >
                <RefreshCw size={14} />
                重新生成
              </motion.button>

              {/* 收入麾下 */}
              <motion.button
                className="px-6 py-3 rounded-lg font-black tracking-widest text-sm flex items-center gap-2"
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
                  onKeep();
                }}
              >
                <Sparkles size={16} />
                收入麾下
              </motion.button>
            </motion.div>
          </div>

          {/* 点击任意处继续提示 */}
          <motion.div
            className="mt-6 text-center text-[10px] tracking-wider text-[#8a8d91] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: revealed ? 1 : 0 }}
            transition={{ duration: 0.35, delay: revealed ? 0.5 : 0 }}
          >
            悬停卡片查看 Slogan · 悬停时点击切换正背面 · 点击外侧收入麾下
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};
