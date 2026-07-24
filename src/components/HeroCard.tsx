import React from "react";
import { motion } from "framer-motion";
import { Star, Heart, Zap, Shield, Gauge, Flame } from "lucide-react";
import {
  CharacterData,
  RARITY_CONFIGS,
  Rarity,
  calculatePowerScore,
} from "../store/useGameStore";
import { CharacterAvatar } from "./CharacterAvatar";

interface HeroCardProps {
  character: CharacterData;
  size?: "sm" | "md" | "lg";
  showStats?: boolean;
  animate?: boolean;
  className?: string;
  selected?: boolean;
  onClick?: () => void;
}

const sizeConfig = {
  sm: {
    card: "w-32",
    avatar: "h-36",
    name: "text-sm",
    stats: "text-[8px]",
    badge: "text-[8px] px-1.5 py-0.5",
    starSize: 9,
  },
  md: {
    card: "w-52",
    avatar: "h-56",
    name: "text-lg",
    stats: "text-[10px]",
    badge: "text-[9px] px-2 py-0.5",
    starSize: 11,
  },
  lg: {
    card: "w-72",
    avatar: "h-80",
    name: "text-2xl",
    stats: "text-xs",
    badge: "text-[10px] px-2 py-1",
    starSize: 13,
  },
};

export const HeroCard: React.FC<HeroCardProps> = ({
  character,
  size = "md",
  showStats = true,
  animate = false,
  className = "",
  selected = false,
  onClick,
}) => {
  const rarity: Rarity = character.rarity || "R";
  const config = RARITY_CONFIGS[rarity];
  const sizeCfg = sizeConfig[size];
  const power = calculatePowerScore(character);
  const ultimateSkill = character.skills.find(
    (s) => s.isUltimate || s.type === "ultimate",
  );

  const isUR = rarity === "UR";
  const isSSR = rarity === "SSR";
  const isSR = rarity === "SR";
  const tier = isUR ? 4 : isSSR ? 3 : isSR ? 2 : rarity === "R" ? 1 : 0;

  const borderAlpha = selected ? 0.95 : 0.5 + tier * 0.12;
  const glowSize = 8 + tier * 8;
  const glowIntensity = 0.15 + tier * 0.12;

  return (
    <motion.div
      onClick={onClick}
      className={`relative rounded-xl overflow-hidden ${sizeCfg.card} ${className} ${onClick ? "cursor-pointer" : ""}`}
      style={{
        background: "#0D0E14",
        border: `${1 + tier * 0.3}px solid`,
        borderColor: `${config.primaryColor}${Math.round(borderAlpha * 255)
          .toString(16)
          .padStart(2, "0")}`,
        boxShadow: `
          0 0 ${glowSize}px rgba(${config.rgb}, ${glowIntensity}),
          0 0 ${glowSize * 2.5}px rgba(${config.rgb}, ${glowIntensity * 0.4}),
          inset 0 0 ${glowSize * 1.5}px rgba(${config.rgb}, ${glowIntensity * 0.15})
        `,
      }}
      animate={
        animate
          ? {
              boxShadow: [
                `0 0 ${glowSize}px rgba(${config.rgb}, ${glowIntensity}), 0 0 ${glowSize * 2.5}px rgba(${config.rgb}, ${glowIntensity * 0.4}), inset 0 0 ${glowSize * 1.5}px rgba(${config.rgb}, ${glowIntensity * 0.15})`,
                `0 0 ${glowSize + 6}px rgba(${config.rgb}, ${glowIntensity + 0.1}), 0 0 ${glowSize * 3}px rgba(${config.rgb}, ${glowIntensity * 0.5}), inset 0 0 ${glowSize * 1.5}px rgba(${config.rgb}, ${glowIntensity * 0.2})`,
                `0 0 ${glowSize}px rgba(${config.rgb}, ${glowIntensity}), 0 0 ${glowSize * 2.5}px rgba(${config.rgb}, ${glowIntensity * 0.4}), inset 0 0 ${glowSize * 1.5}px rgba(${config.rgb}, ${glowIntensity * 0.15})`,
              ],
            }
          : selected
            ? {
                y: -4,
                boxShadow: `
                  0 0 ${glowSize + 8}px rgba(${config.rgb}, ${glowIntensity + 0.15}),
                  0 0 ${glowSize * 3}px rgba(${config.rgb}, ${glowIntensity * 0.6}),
                  0 8px 24px rgba(0,0,0,0.4),
                  inset 0 0 ${glowSize * 2}px rgba(${config.rgb}, ${glowIntensity * 0.2})
                `,
              }
            : {}
      }
      whileHover={
        onClick
          ? {
              y: -3,
              boxShadow: `
                0 0 ${glowSize + 6}px rgba(${config.rgb}, ${glowIntensity + 0.12}),
                0 0 ${glowSize * 2.8}px rgba(${config.rgb}, ${glowIntensity * 0.55}),
                0 6px 20px rgba(0,0,0,0.35),
                inset 0 0 ${glowSize * 1.8}px rgba(${config.rgb}, ${glowIntensity * 0.2})
              `,
            }
          : {}
      }
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* UR/SSR 微妙顶部高光线 */}
      {(isUR || isSSR) && (
        <motion.div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-[1px] z-10"
          style={{
            background: `linear-gradient(90deg, transparent, ${config.primaryColor}, transparent)`,
            opacity: 0.6,
          }}
          animate={animate ? { opacity: [0.3, 0.8, 0.3] } : {}}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* 精致扫光（非常淡、非常慢） */}
      {(animate || isUR || isSSR) && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-20"
          initial={{ x: "-100%", opacity: 0 }}
          animate={{
            x: ["-100%", "200%"],
            opacity: [0, isUR ? 0.12 : 0.07, 0],
          }}
          transition={{
            duration: isUR ? 3.5 : 5,
            repeat: Infinity,
            ease: "easeInOut",
            repeatDelay: isUR ? 1 : 2.5,
          }}
          style={{
            background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)`,
          }}
        />
      )}

      {/* 稀有度标签 */}
      <div
        className={`absolute top-2 left-2 z-10 ${sizeCfg.badge} rounded font-black tracking-wider`}
        style={{
          background: `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})`,
          color: "#0D0E14",
          boxShadow: `0 2px 8px rgba(${config.rgb}, 0.35)`,
          textShadow: "none",
          lineHeight: 1.2,
        }}
      >
        {config.labelEn}
      </div>

      {/* 星星评级 - 放在标签右下方，小而精致 */}
      <div className="absolute top-[26px] left-2 z-10 flex gap-0.5">
        {Array.from({ length: config.starCount }).map((_, i) => (
          <motion.div
            key={i}
            animate={
              animate && (isUR || isSSR) ? { opacity: [0.6, 1, 0.6] } : {}
            }
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          >
            <Star
              size={sizeCfg.starSize - 2}
              fill={config.primaryColor}
              color={config.primaryColor}
              style={{
                filter: `drop-shadow(0 0 3px ${config.glowColor})`,
              }}
            />
          </motion.div>
        ))}
      </div>

      {/* 角色头像 */}
      <div className={`relative ${sizeCfg.avatar} overflow-hidden`}>
        <CharacterAvatar
          imageUrl={character.imageUrl}
          name={character.name}
          themeColor={config.primaryColor}
          className="w-full h-full object-cover"
          iconSize={size === "lg" ? 64 : size === "md" ? 48 : 32}
        />
        {/* 精致暗角 + 渐变遮罩 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              linear-gradient(to top, #0D0E14 0%, transparent 40%),
              linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 25%),
              radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.2) 100%)
            `,
          }}
        />
        {/* 稀有度色微妙径向光 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 20%, rgba(${config.rgb}, 0.08) 0%, transparent 55%)`,
          }}
        />
      </div>

      {/* 底部信息区 */}
      <div
        className="relative px-3 pt-2 pb-3"
        style={{ background: "#0D0E14" }}
      >
        {/* 顶部分隔线 */}
        <div
          className="absolute top-0 left-3 right-3 h-[1px]"
          style={{
            background: `linear-gradient(90deg, transparent, rgba(${config.rgb}, 0.3), transparent)`,
          }}
        />

        {/* 名称 */}
        <div
          className={`font-black font-display tracking-wide ${sizeCfg.name} text-center`}
          style={{
            color: "#fff",
            textShadow: `0 0 8px ${config.glowColor}, 0 0 16px rgba(${config.rgb}, 0.3)`,
            marginBottom: ultimateSkill && size !== "sm" ? "2px" : "6px",
          }}
        >
          {character.name}
        </div>

        {/* 大招名称 */}
        {ultimateSkill && size !== "sm" && (
          <div className="flex items-center justify-center gap-1 mb-2">
            <Flame size={9} style={{ color: "#FFD700", opacity: 0.9 }} />
            <span
              className="text-[9px] tracking-wide text-[#FFD700]/80 truncate max-w-[85%]"
              title={ultimateSkill.name}
            >
              {ultimateSkill.name}
            </span>
          </div>
        )}

        {/* 属性 */}
        {showStats && (
          <div className={`grid grid-cols-4 gap-1 ${sizeCfg.stats} mt-1`}>
            {[
              { icon: Heart, value: character.maxHp, color: "#F472B6" },
              { icon: Zap, value: character.attack, color: "#FBBF24" },
              { icon: Shield, value: character.defense, color: "#60A5FA" },
              { icon: Gauge, value: character.speed, color: "#4ADE80" },
            ].map(({ icon: Icon, value, color }, i) => (
              <div key={i} className="flex items-center justify-center gap-0.5">
                <Icon size={size === "sm" ? 7 : 8} style={{ color }} />
                <span className="text-[#C5C6C7] tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* 战力 */}
        {size !== "sm" && (
          <div
            className="mt-2 text-center text-[10px] font-bold tracking-widest"
            style={{ color: config.primaryColor, opacity: 0.85 }}
          >
            ⚡ {power}
          </div>
        )}
      </div>
    </motion.div>
  );
};
