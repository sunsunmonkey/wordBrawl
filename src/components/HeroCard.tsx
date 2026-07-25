import React from "react";
import { motion } from "framer-motion";
import { Star, Heart, Zap, Shield, Gauge, Flame, Sparkles } from "lucide-react";
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
  className?: string;
  selected?: boolean;
  onClick?: () => void;
}

const sizeConfig = {
  sm: {
    card: "w-32",
    frame: "p-[5px]",
    innerPad: "p-1",
    avatar: "h-[104px]",
    rarity: "text-[9px] px-1 py-0.5",
    verticalName: "hidden",
    bottomName: "block text-[10px]",
    levelBadge: "w-6 h-6 text-[8px]",
    starSize: 7,
    stats: "text-[7px] gap-1",
    skill: "hidden",
    quote: "hidden",
    power: "text-[7px]",
  },
  md: {
    card: "w-52",
    frame: "p-[6px]",
    innerPad: "p-1.5",
    avatar: "h-[168px]",
    rarity: "text-[10px] px-1.5 py-0.5",
    verticalName: "hidden",
    bottomName: "block text-[13px]",
    levelBadge: "w-8 h-8 text-[9px]",
    starSize: 9,
    stats: "text-[9px] gap-2",
    skill: "block",
    quote: "block",
    power: "text-[9px]",
  },
  lg: {
    card: "w-72",
    frame: "p-[8px]",
    innerPad: "p-2",
    avatar: "h-56",
    rarity: "text-xs px-2 py-1",
    verticalName: "hidden",
    bottomName: "block text-base",
    levelBadge: "w-11 h-11 text-[11px]",
    starSize: 12,
    stats: "text-[11px] gap-3",
    skill: "block",
    quote: "block",
    power: "text-[10px]",
  },
};

const RARITY_LEVELS: Record<Rarity, number> = {
  N: 1,
  R: 20,
  SR: 40,
  SSR: 80,
  UR: 100,
};

type CornerKey = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const CORNER_STYLES: Record<CornerKey, { pos: string; rotate: number }> = {
  "top-left": { pos: "top-1 left-1", rotate: 0 },
  "top-right": { pos: "top-1 right-1", rotate: 90 },
  "bottom-right": { pos: "bottom-1 right-1", rotate: 180 },
  "bottom-left": { pos: "bottom-1 left-1", rotate: 270 },
};

const CornerOrnament: React.FC<{ color: string; corner: CornerKey }> = ({
  color,
  corner,
}) => {
  const { pos, rotate } = CORNER_STYLES[corner];
  return (
    <svg
      className={`absolute w-3.5 h-3.5 ${pos} z-20 pointer-events-none`}
      style={{
        color,
        transform: `rotate(${rotate}deg)`,
        filter: `drop-shadow(0 0 3px ${color})`,
      }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M2 2 L2 10 M2 2 L10 2" strokeLinecap="round" />
      <circle cx="3.5" cy="3.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
};

export const HeroCard: React.FC<HeroCardProps> = ({
  character,
  size = "md",
  showStats = true,
  className = "",
  selected = false,
  onClick,
}) => {
  const rarity: Rarity = character.rarity || "R";
  const config = RARITY_CONFIGS[rarity];
  const sizeCfg = sizeConfig[size];
  const power = calculatePowerScore(character);
  const level =
    typeof character.level === "number" && character.level > 0
      ? character.level
      : RARITY_LEVELS[rarity];
  const ultimateSkill = character.skills.find(
    (s) => s.isUltimate || s.type === "ultimate",
  );
  const normalSkill = character.skills.find(
    (s) => !s.isUltimate && s.type !== "ultimate",
  );
  const displaySkill = ultimateSkill || normalSkill;
  const quote = character.spiritProfile?.catchphrases?.[0];

  const tier =
    rarity === "UR"
      ? 4
      : rarity === "SSR"
        ? 3
        : rarity === "SR"
          ? 2
          : rarity === "R"
            ? 1
            : 0;
  const borderAlpha = selected ? 0.95 : 0.55 + tier * 0.11;
  const glowSize = 10 + tier * 10;
  const glowIntensity = 0.2 + tier * 0.14;

  const cornerColor = config.primaryColor;

  return (
    <motion.div
      onClick={onClick}
      className={`group relative rounded-2xl ${sizeCfg.card} ${className} ${onClick ? "cursor-pointer" : ""}`}
      style={{
        background: "linear-gradient(145deg, #151725 0%, #0a0b12 100%)",
        border: `1px solid`,
        borderColor: `${config.primaryColor}${Math.round(borderAlpha * 255)
          .toString(16)
          .padStart(2, "0")}`,
        boxShadow: `
          0 0 ${glowSize}px rgba(${config.rgb}, ${glowIntensity}),
          0 0 ${glowSize * 2.5}px rgba(${config.rgb}, ${glowIntensity * 0.4}),
          inset 0 0 ${glowSize * 1.2}px rgba(${config.rgb}, ${glowIntensity * 0.12})
        `,
        contain: "layout paint style",
        willChange: "transform",
      }}
      animate={
        selected
          ? {
              y: -4,
              boxShadow: `
                0 0 ${glowSize + 10}px rgba(${config.rgb}, ${glowIntensity + 0.18}),
                0 0 ${glowSize * 3.2}px rgba(${config.rgb}, ${glowIntensity * 0.65}),
                0 8px 24px rgba(0,0,0,0.45),
                inset 0 0 ${glowSize * 2}px rgba(${config.rgb}, ${glowIntensity * 0.22})
              `,
            }
          : {}
      }
      whileHover={
        onClick
          ? {
              y: -3,
              boxShadow: `
                0 0 ${glowSize + 8}px rgba(${config.rgb}, ${glowIntensity + 0.14}),
                0 0 ${glowSize * 3}px rgba(${config.rgb}, ${glowIntensity * 0.6}),
                0 6px 20px rgba(0,0,0,0.4),
                inset 0 0 ${glowSize * 1.8}px rgba(${config.rgb}, ${glowIntensity * 0.2})
              `,
            }
          : {}
      }
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {/* 外框装饰层 */}
      <div
        className={`absolute inset-0 rounded-2xl ${sizeCfg.frame} pointer-events-none`}
        style={{
          background: `linear-gradient(135deg, ${config.primaryColor}18, transparent 40%, transparent 60%, ${config.secondaryColor}18)`,
        }}
      >
        <div
          className="w-full h-full rounded-xl border opacity-60"
          style={{
            borderColor: `${config.primaryColor}44`,
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, transparent 50%, rgba(0,0,0,0.15) 100%)",
          }}
        />
      </div>

      <CornerOrnament color={cornerColor} corner="top-left" />
      <CornerOrnament color={cornerColor} corner="top-right" />
      <CornerOrnament color={cornerColor} corner="bottom-right" />
      <CornerOrnament color={cornerColor} corner="bottom-left" />

      {/* 顶部高光 */}
      {(rarity === "UR" || rarity === "SSR") && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 w-2/3 h-[1px] z-10 opacity-70"
          style={{
            background: `linear-gradient(90deg, transparent, ${config.primaryColor}, transparent)`,
          }}
        />
      )}

      {/* 扫光（仅 hover 触发，避免抽卡时无限循环重绘） */}
      {(rarity === "UR" || rarity === "SSR") && (
        <div
          className="absolute inset-0 pointer-events-none z-30 rounded-2xl overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)`,
          }}
        />
      )}

      <div className={`relative ${sizeCfg.innerPad} h-full flex flex-col`}>
        {/* 顶部 header：稀有度 + 竖排名字 + 职业图标 */}
        <div className="flex items-start justify-between mb-1.5 px-3">
          <div className="flex flex-col items-start gap-1 z-10">
            <div
              className={`${sizeCfg.rarity} rounded font-black tracking-wider`}
              style={{
                background: `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})`,
                color: "#0a0b12",
                boxShadow: `0 2px 8px rgba(${config.rgb}, 0.4)`,
                lineHeight: 1.1,
              }}
            >
              {config.labelEn}
            </div>
            <div
              className={`${sizeCfg.verticalName} font-display font-bold tracking-widest leading-tight`}
              style={{
                color: config.primaryColor,
                textShadow: `0 0 6px ${config.glowColor}`,
                writingMode: "vertical-rl",
                textOrientation: "upright",
                letterSpacing: "0.15em",
                maxHeight: size === "lg" ? 84 : 56,
              }}
              title={character.name}
            >
              {character.name.length > 5
                ? character.name.slice(0, 5) + "…"
                : character.name}
            </div>
          </div>

          <div
            className="z-10 flex items-center justify-center rounded-full border"
            style={{
              width: size === "lg" ? 28 : size === "md" ? 22 : 18,
              height: size === "lg" ? 28 : size === "md" ? 22 : 18,
              borderColor: `${config.primaryColor}66`,
              background: `radial-gradient(circle at 30% 30%, ${config.primaryColor}33, transparent 70%)`,
              boxShadow: `0 0 8px ${config.glowColor}`,
            }}
          >
            <Sparkles
              size={size === "lg" ? 14 : size === "md" ? 11 : 9}
              style={{ color: config.primaryColor }}
            />
          </div>
        </div>

        {/* 角色立绘区 */}
        <div
          className={`relative ${sizeCfg.avatar} rounded-lg overflow-hidden flex-shrink-0`}
          style={{
            border: `1px solid ${config.primaryColor}33`,
            boxShadow: `inset 0 0 24px rgba(${config.rgb}, 0.1)`,
          }}
        >
          <CharacterAvatar
            imageUrl={character.imageUrl}
            name={character.name}
            themeColor={config.primaryColor}
            className="w-full h-full object-cover"
            iconSize={size === "lg" ? 64 : size === "md" ? 44 : 28}
          />
          {/* 暗角遮罩 */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                linear-gradient(to top, #0a0b12 0%, transparent 35%),
                linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 20%),
                radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.25) 100%)
              `,
            }}
          />
          {/* 顶部径向光 */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 50% 15%, rgba(${config.rgb}, 0.1) 0%, transparent 55%)`,
            }}
          />
        </div>

        {/* 底部信息区 */}
        <div className="relative flex-1 flex flex-col pt-2 mt-1">
          {/* 顶部分隔线 */}
          <div
            className="absolute top-0 left-1 right-1 h-[1px]"
            style={{
              background: `linear-gradient(90deg, transparent, rgba(${config.rgb}, 0.35), transparent)`,
            }}
          />

          {/* 角色名字（横排主标题） */}
          <div
            className={`${sizeCfg.bottomName} font-display font-bold text-center truncate mb-1`}
            style={{
              color: "#fff",
              textShadow: `0 0 8px ${config.glowColor}`,
            }}
            title={character.name}
          >
            {character.name}
          </div>

          {/* 等级 + 星级 + 战力 */}
          <div className="flex items-center justify-center gap-3 mb-1.5">
            <div
              className={`${sizeCfg.levelBadge} rounded-full flex flex-col items-center justify-center font-black border flex-shrink-0`}
              style={{
                borderColor: config.primaryColor,
                background: `radial-gradient(circle at 30% 30%, ${config.primaryColor}22, #0a0b12 70%)`,
                color: config.primaryColor,
                boxShadow: `0 0 10px ${config.glowColor}`,
              }}
            >
              <span className="scale-[0.75] leading-none opacity-70">Lv.</span>
              <span className="leading-none -mt-0.5">{level}</span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <div className="flex gap-0.5">
                {Array.from({ length: config.starCount }).map((_, i) => (
                  <Star
                    key={i}
                    size={sizeCfg.starSize}
                    fill={config.primaryColor}
                    color={config.primaryColor}
                    style={{
                      filter: `drop-shadow(0 0 3px ${config.glowColor})`,
                    }}
                  />
                ))}
              </div>
              <div
                className={`${sizeCfg.power} font-bold tracking-wider`}
                style={{ color: config.secondaryColor, opacity: 0.9 }}
              >
                ⚡ {power}
              </div>
            </div>
          </div>

          {/* 属性 */}
          {showStats && (
            <div
              className={`grid grid-cols-4 ${sizeCfg.stats} mb-1.5 py-1 px-1 rounded-md`}
              style={{
                background: "rgba(0,0,0,0.25)",
                border: `1px solid ${config.primaryColor}22`,
              }}
            >
              {[
                {
                  icon: Zap,
                  value: character.attack,
                  color: "#FBBF24",
                  label: "攻击",
                },
                {
                  icon: Shield,
                  value: character.defense,
                  color: "#60A5FA",
                  label: "防御",
                },
                {
                  icon: Heart,
                  value: character.maxHp,
                  color: "#F472B6",
                  label: "生命",
                },
                {
                  icon: Gauge,
                  value: character.speed,
                  color: "#4ADE80",
                  label: "速度",
                },
              ].map(({ icon: Icon, value, color, label }, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-0.5"
                  title={label}
                >
                  <Icon
                    size={size === "sm" ? 7 : size === "md" ? 9 : 11}
                    style={{ color }}
                  />
                  <span className="text-[#C5C6C7] tabular-nums font-semibold leading-none">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 技能信息 */}
          {displaySkill && sizeCfg.skill !== "hidden" && (
            <div
              className="rounded-md p-1.5 mb-1.5 flex items-start gap-1.5"
              style={{
                background: `linear-gradient(135deg, rgba(${config.rgb}, 0.12), rgba(0,0,0,0.25))`,
                border: `1px solid ${config.primaryColor}33`,
              }}
            >
              <div
                className="flex-shrink-0 rounded flex items-center justify-center"
                style={{
                  width: size === "lg" ? 28 : 22,
                  height: size === "lg" ? 28 : 22,
                  background: `radial-gradient(circle at 30% 30%, ${config.primaryColor}33, transparent 70%)`,
                  boxShadow: `0 0 8px ${config.glowColor}`,
                }}
              >
                <Flame
                  size={size === "lg" ? 15 : 12}
                  style={{ color: "#FFD700" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[9px] font-bold truncate"
                  style={{ color: "#FFD700" }}
                >
                  {displaySkill.name}
                  {displaySkill.damageMultiplier > 0 && (
                    <span className="ml-1 opacity-70">
                      Lv.
                      {Math.min(
                        10,
                        Math.max(1, Math.floor(displaySkill.damageMultiplier)),
                      )}
                    </span>
                  )}
                </div>
                <div
                  className="text-[8px] text-[#8a8d91] leading-tight"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {displaySkill.description}
                </div>
              </div>
            </div>
          )}

          {/* 角色语录 */}
          {quote && sizeCfg.quote !== "hidden" && (
            <div
              className="mt-auto text-[8px] italic text-center px-4 py-1 rounded truncate"
              style={{
                color: config.secondaryColor,
                background: "rgba(0,0,0,0.2)",
                borderTop: `1px solid ${config.primaryColor}22`,
              }}
            >
              「{quote}」
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
