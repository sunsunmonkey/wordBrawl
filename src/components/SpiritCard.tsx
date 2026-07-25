import React from "react";
import { motion } from "framer-motion";
import {
  Star,
  Heart,
  Zap,
  Shield,
  Gauge,
  Lock,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  RARITY_CONFIGS,
  type Rarity,
  calculatePowerScore,
} from "../store/useGameStore";
import type { RosterCharacter } from "../store/useRosterStore";
import { RECRUIT_STAGE_COUNT } from "../store/useRosterStore";
import { LOADING_STEPS } from "./loadingSteps";
import { CharacterAvatar } from "./CharacterAvatar";

export type SpiritCardSize = "sm" | "md" | "lg";

const SIZE_CONFIG: Record<
  SpiritCardSize,
  {
    width: string;
    aspect: string;
    padding: string;
    rarityBadge: string;
    starSize: number;
    lvBadge: string;
    name: string;
    subline: string;
    statSize: number;
    statText: string;
    powerText: string;
    cornerSize: number;
  }
> = {
  sm: {
    width: "w-full",
    aspect: "aspect-[3/4]",
    padding: "p-1.5",
    rarityBadge: "text-[8px] px-1 py-[1px]",
    starSize: 6,
    lvBadge: "text-[8px] px-1 py-[1px]",
    name: "text-[10px]",
    subline: "text-[8px]",
    statSize: 8,
    statText: "text-[8px]",
    powerText: "text-[7px]",
    cornerSize: 10,
  },
  md: {
    width: "w-full",
    aspect: "aspect-[3/4]",
    padding: "p-2",
    rarityBadge: "text-[9px] px-1.5 py-[2px]",
    starSize: 8,
    lvBadge: "text-[9px] px-1.5 py-[1px]",
    name: "text-[12px]",
    subline: "text-[9px]",
    statSize: 9,
    statText: "text-[9px]",
    powerText: "text-[8px]",
    cornerSize: 12,
  },
  lg: {
    width: "w-full",
    aspect: "aspect-[3/4]",
    padding: "p-2.5",
    rarityBadge: "text-[10px] px-2 py-[3px]",
    starSize: 10,
    lvBadge: "text-[10px] px-2 py-[2px]",
    name: "text-[13px]",
    subline: "text-[10px]",
    statSize: 10,
    statText: "text-[10px]",
    powerText: "text-[9px]",
    cornerSize: 14,
  },
};

const RARITY_TIER: Record<Rarity, number> = {
  N: 0,
  R: 1,
  SR: 2,
  SSR: 3,
  UR: 4,
};

/** 拐角描边装饰，参考设计图四角刻痕 */
const CornerCut: React.FC<{
  color: string;
  size: number;
  position: "tl" | "tr" | "bl" | "br";
}> = ({ color, size, position }) => {
  const map = {
    tl: { top: 4, left: 4, borders: "border-t border-l" },
    tr: { top: 4, right: 4, borders: "border-t border-r" },
    bl: { bottom: 4, left: 4, borders: "border-b border-l" },
    br: { bottom: 4, right: 4, borders: "border-b border-r" },
  } as const;
  const p = map[position];
  return (
    <span
      aria-hidden
      className={`absolute pointer-events-none ${p.borders}`}
      style={{
        width: size,
        height: size,
        top: "top" in p ? p.top : undefined,
        left: "left" in p ? p.left : undefined,
        right: "right" in p ? p.right : undefined,
        bottom: "bottom" in p ? p.bottom : undefined,
        borderColor: color,
        filter: `drop-shadow(0 0 3px ${color}66)`,
      }}
    />
  );
};

/** 生成过程叠加层：进度条 + 当前阶段 icon/文本 */
const GeneratingOverlay: React.FC<{
  stage: number;
  themeColor: string;
  size: SpiritCardSize;
}> = ({ stage, themeColor, size }) => {
  const totalStages = RECRUIT_STAGE_COUNT;
  const clamped = Math.max(0, Math.min(totalStages - 1, stage));
  const CurrentIcon = LOADING_STEPS[clamped]?.icon;
  const stepText = LOADING_STEPS[clamped]?.text ?? "生成中";
  const percent = Math.round(((clamped + 1) / totalStages) * 100);
  const compact = size === "sm";

  return (
    <div className="absolute inset-0 z-30 flex flex-col overflow-hidden">
      {/* 深色玻璃背景 */}
      <div className="absolute inset-0 bg-[#0B0C10]/88 backdrop-blur-[3px]" />

      {/* 顶部扫描线 */}
      <motion.div
        className="absolute left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent, ${themeColor}, transparent)`,
          boxShadow: `0 0 8px ${themeColor}`,
        }}
        animate={{ top: ["0%", "100%", "0%"] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 顶部锁定徽标 */}
      <div className="relative z-10 flex items-center justify-center pt-2">
        <div
          className="flex items-center gap-1 rounded border bg-black/60 px-1.5 py-[2px] font-black tracking-[0.28em]"
          style={{
            color: themeColor,
            borderColor: `${themeColor}88`,
            fontSize: compact ? 8 : 9,
          }}
        >
          <Lock size={compact ? 8 : 9} />
          创造中
        </div>
      </div>

      {/* 中央：脉冲魔法阵 + 阶段图标 */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="relative w-[60%] max-w-[110px] aspect-square">
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-dashed"
            style={{ borderColor: `${themeColor}55` }}
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-2 rounded-full border"
            style={{ borderColor: `${themeColor}44` }}
            animate={{ rotate: -360 }}
            transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <div
              className="rounded-full blur-xl"
              style={{
                width: "60%",
                height: "60%",
                backgroundColor: themeColor,
                opacity: 0.35,
              }}
            />
          </motion.div>
          <div className="absolute inset-0 flex items-center justify-center">
            {CurrentIcon ? (
              <CurrentIcon
                size={compact ? 22 : 28}
                style={{
                  color: themeColor,
                  filter: `drop-shadow(0 0 8px ${themeColor})`,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* 底部：阶段文本 + 进度条 + 百分比 */}
      <div className="relative z-10 px-2 pb-2 pt-1 flex flex-col gap-1">
        <div
          className="text-center font-bold tracking-[0.2em] truncate"
          style={{
            color: themeColor,
            fontSize: compact ? 8 : 9,
            textShadow: `0 0 4px ${themeColor}88`,
          }}
        >
          {stepText}
        </div>
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: `${themeColor}22` }}
        >
          <motion.div
            className="h-full"
            style={{
              background: `linear-gradient(90deg, ${themeColor}88, ${themeColor})`,
              boxShadow: `0 0 8px ${themeColor}`,
            }}
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <div
          className="flex items-center justify-between font-mono tracking-wider"
          style={{ color: `${themeColor}bb`, fontSize: compact ? 7 : 8 }}
        >
          <span>
            {clamped + 1}/{totalStages}
          </span>
          <span>{percent}%</span>
        </div>
      </div>
    </div>
  );
};

/** 失败态叠加层：错误信息 + 重试/放弃按钮 */
const FailedOverlay: React.FC<{
  message?: string;
  onRetry?: (e: React.MouseEvent) => void;
  onDrop?: (e: React.MouseEvent) => void;
  size: SpiritCardSize;
}> = ({ message, onRetry, onDrop, size }) => {
  const accent = "#FF6B9D";
  const compact = size === "sm";
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden bg-[#0B0C10]/88 backdrop-blur-[3px] gap-2 px-2">
      <div
        className="flex items-center gap-1 rounded border bg-black/60 px-1.5 py-[2px] font-black tracking-[0.28em]"
        style={{
          color: accent,
          borderColor: `${accent}88`,
          fontSize: compact ? 8 : 9,
        }}
      >
        <Lock size={compact ? 8 : 9} />
        创造失败
      </div>
      {message && (
        <div
          className="text-center leading-tight line-clamp-3 max-w-full"
          style={{
            color: `${accent}cc`,
            fontSize: compact ? 8 : 9,
          }}
        >
          {message}
        </div>
      )}
      {(onRetry || onDrop) && (
        <div className="flex items-center gap-1.5">
          {onRetry && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onRetry}
              className="flex items-center gap-1 rounded border px-1.5 py-[3px] font-black tracking-widest transition-all"
              style={{
                color: "#FFD700",
                borderColor: "#FFD700",
                fontSize: compact ? 8 : 9,
                background: "rgba(11,12,16,0.95)",
              }}
            >
              <RotateCcw size={compact ? 8 : 10} />
              重试
            </button>
          )}
          {onDrop && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDrop}
              className="flex items-center gap-1 rounded border px-1.5 py-[3px] font-black tracking-widest transition-all"
              style={{
                color: accent,
                borderColor: `${accent}88`,
                fontSize: compact ? 8 : 9,
                background: "rgba(11,12,16,0.95)",
              }}
            >
              <Trash2 size={compact ? 8 : 10} />
              放弃
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/** 进化中叠加层：简单文字标识，避免和 recruit 混淆 */
const EvolutionLockOverlay: React.FC<{ size: SpiritCardSize }> = ({ size }) => {
  const accent = "#FFD700";
  const compact = size === "sm";
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-[#0B0C10]/82 backdrop-blur-[3px]">
      <motion.div
        className="flex items-center gap-1.5 rounded border bg-black/70 px-2 py-1 font-black tracking-[0.3em]"
        style={{
          color: accent,
          borderColor: `${accent}88`,
          fontSize: compact ? 8 : 10,
        }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <Lock size={compact ? 8 : 10} />
        进化更新中
      </motion.div>
    </div>
  );
};

export interface SpiritCardBadge {
  label: string;
  color?: string;
  background?: string;
  title?: string;
}

export interface SpiritCardProps {
  character: RosterCharacter;
  size?: SpiritCardSize;
  selected?: boolean;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
  /** 展示右上角/中部的自定义徽标（层数、进化星等） */
  topRightBadges?: SpiritCardBadge[];
  /** 卡片上方独立操作区（例如聊天/出战/删除组） */
  actionSlot?: React.ReactNode;
  /** 底部信息区扩展（进度条 / xp 提示等） */
  footerSlot?: React.ReactNode;
  /** 生成失败时的按钮 */
  onRetryRecruit?: (e: React.MouseEvent) => void;
  onDropRecruit?: (e: React.MouseEvent) => void;
  /** Hover 时右上角显示的删除按钮（仅 ready 态生效） */
  onDelete?: (e: React.MouseEvent) => void;
  /** 展示等级、稀有度字、名字 —— 生成中时全部隐藏；ready 时显示 */
  showStats?: boolean;
  /** 底部叠加"出战/收纳"提示（hover 显示） */
  hoverHint?: string;
}

export const SpiritCard: React.FC<SpiritCardProps> = ({
  character,
  size = "md",
  selected = false,
  onClick,
  onKeyDown,
  className = "",
  topRightBadges,
  actionSlot,
  footerSlot,
  onRetryRecruit,
  onDropRecruit,
  onDelete,
  showStats = true,
  hoverHint,
}) => {
  const cfg = SIZE_CONFIG[size];
  const recruitLock = character.recruitLock;
  const isGenerating = recruitLock?.status === "generating";
  const isFailed = recruitLock?.status === "failed";
  const isEvolutionLocked = Boolean(character.evolutionLock) && !recruitLock;

  // 稀有度延迟揭示：生成中 / 失败 一律不使用真实稀有度，用中性色调
  const revealedRarity: Rarity | null =
    isGenerating || isFailed ? null : (character.rarity ?? "R");
  const rarityConfig = revealedRarity ? RARITY_CONFIGS[revealedRarity] : null;

  const neutralPrimary = "#4B5563";
  const neutralRgb = "75, 85, 99";
  const primaryColor = rarityConfig?.primaryColor ?? neutralPrimary;
  const rgb = rarityConfig?.rgb ?? neutralRgb;
  const tier = revealedRarity ? RARITY_TIER[revealedRarity] : 0;

  const borderWidth = 1; // 统一为 1px，避免亚像素模糊，与其他 UI 元素对齐
  const borderAlpha = selected ? 0.9 : 0.42 + tier * 0.11;
  const shadowAlpha = 0.05 + tier * 0.05;
  const isUR = revealedRarity === "UR";
  const isSSR = revealedRarity === "SSR";
  const isSR = revealedRarity === "SR";
  const showSheen = isUR || isSSR;
  const showHolographic = isUR || isSSR;
  const failedRgb = "255, 107, 157";
  const displayRgb = isFailed ? failedRgb : rgb;
  const displayBorderColor = isFailed
    ? `rgba(${failedRgb}, 0.75)`
    : `rgba(${rgb}, ${borderAlpha})`;

  const power = revealedRarity ? calculatePowerScore(character) : 0;
  const displayName =
    isGenerating || isFailed
      ? isGenerating
        ? "创造中"
        : "创造失败"
      : character.name;

  return (
    <motion.div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      whileHover={onClick && !isGenerating && !isFailed ? { y: -3 } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      animate={{ y: selected ? -4 : 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={`group relative rounded-lg overflow-hidden text-left ${cfg.width} ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
      style={{
        background:
          "linear-gradient(155deg, #151726 0%, #0B0C10 45%, #0A0B10 100%)",
        border: `${borderWidth}px solid ${displayBorderColor}`,
        boxShadow: selected
          ? `0 0 0 1px rgba(${displayRgb}, 0.4), 0 6px 18px rgba(${displayRgb}, 0.28), 0 0 24px rgba(${displayRgb}, 0.18)`
          : `0 2px 8px rgba(0,0,0,0.55), 0 0 ${8 + tier * 4}px rgba(${displayRgb}, ${shadowAlpha})`,
        contain: "layout paint style",
        willChange: "transform",
      }}
      aria-pressed={onClick ? selected : undefined}
    >
      {/* 四角刻痕 */}
      <CornerCut color={primaryColor} size={cfg.cornerSize} position="tl" />
      <CornerCut color={primaryColor} size={cfg.cornerSize} position="tr" />
      <CornerCut color={primaryColor} size={cfg.cornerSize} position="bl" />
      <CornerCut color={primaryColor} size={cfg.cornerSize} position="br" />

      {/* 高稀有度扫光：hover 时才动，其它时间静止 —— 减少滚动重绘 */}
      {showSheen && (
        <div
          aria-hidden
          className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <motion.div
            className="absolute top-0 h-full w-1/3"
            style={{
              background: `linear-gradient(90deg, transparent 0%, rgba(${rgb}, ${
                isUR ? 0.14 : 0.08
              }) 50%, transparent 100%)`,
              willChange: "transform",
            }}
            animate={{ x: ["-60%", "360%"] }}
            transition={{
              duration: isUR ? 4.5 : 5.5,
              repeat: Infinity,
              ease: "easeInOut",
              repeatDelay: 1,
            }}
          />
        </div>
      )}

      {/* 全息 SSR/UR：静态多层斜向彩色叠加，无 mix-blend、无旋转 */}
      {showHolographic && (
        <div
          aria-hidden
          className="absolute inset-0 z-0 pointer-events-none rounded-lg"
          style={{
            background: isUR
              ? "linear-gradient(135deg, rgba(255,215,0,0.10) 0%, rgba(255,107,157,0.06) 40%, rgba(102,252,241,0.08) 100%)"
              : "linear-gradient(135deg, rgba(183,139,255,0.08) 0%, rgba(255,215,0,0.05) 100%)",
            opacity: 0.85,
          }}
        />
      )}

      {/* SR 边缘微光（静态 inset shadow，避免 repaint） */}
      {isSR && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none rounded-lg z-0"
          style={{
            boxShadow: `inset 0 0 12px rgba(${rgb}, 0.18)`,
          }}
        />
      )}

      {/* 立绘 */}
      <div
        className={`relative overflow-hidden ${cfg.aspect}`}
        style={{
          background: `radial-gradient(ellipse at 50% 25%, rgba(${rgb}, 0.09) 0%, #0D0E14 70%)`,
        }}
      >
        <CharacterAvatar
          imageUrl={isGenerating || isFailed ? undefined : character.imageUrl}
          name={character.name}
          themeColor={primaryColor}
          className="h-full w-full transition-transform duration-500 group-hover:scale-[1.04]"
          iconSize={size === "sm" ? 28 : size === "md" ? 40 : 52}
        />
        {/* 顶部径向光 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 15%, rgba(${rgb}, 0.14) 0%, transparent 60%)`,
          }}
        />
        {/* 底部渐隐 */}
        <div
          className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, #0B0C10 0%, rgba(11,12,16,0.9) 30%, transparent 100%)",
          }}
        />

        {/* Ready 态：左上角稀有度徽标 + 星级 */}
        {revealedRarity && rarityConfig && (
          <>
            <div
              className={`absolute left-1.5 top-1.5 rounded font-black tracking-wider ${cfg.rarityBadge}`}
              style={{
                background: rarityConfig.borderGradient,
                color: "#0B0C10",
                boxShadow: `0 1px 6px rgba(0,0,0,0.4), 0 0 10px rgba(${rgb}, 0.5)`,
                lineHeight: 1.1,
              }}
              title={rarityConfig.label}
            >
              {revealedRarity}
            </div>
            <div
              className="absolute left-1.5 flex gap-px"
              style={{
                top: size === "sm" ? 20 : size === "md" ? 24 : 30,
              }}
            >
              {Array.from({ length: rarityConfig.starCount }).map((_, i) => (
                <Star
                  key={i}
                  size={cfg.starSize}
                  fill={primaryColor}
                  color={primaryColor}
                  style={{
                    filter: `drop-shadow(0 0 3px rgba(${rgb}, 0.7))`,
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* 右上角自定义徽标（Lv、层数、进化星） */}
        {revealedRarity && (topRightBadges?.length ?? 0) > 0 && (
          <div
            className={`absolute right-1.5 top-1.5 z-10 flex flex-col items-end gap-1 transition-opacity ${
              onDelete ? "group-hover:opacity-0" : ""
            }`}
          >
            {topRightBadges!.map((b, i) => (
              <div
                key={i}
                title={b.title}
                className={`rounded px-1.5 py-[2px] font-black tracking-wider ${cfg.subline}`}
                style={{
                  background: b.background ?? "rgba(0,0,0,0.6)",
                  color: b.color ?? primaryColor,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  lineHeight: 1.1,
                }}
              >
                {b.label}
              </div>
            ))}
          </div>
        )}

        {/* 底部叠加：名字与战力 */}
        {!isGenerating && !isFailed && (
          <div className="absolute inset-x-0 bottom-0 pl-2 pr-1.5 pb-1.5 pt-6 flex items-end justify-between gap-1.5 pointer-events-none">
            <div
              className={`truncate font-black font-display leading-tight ${cfg.name}`}
              style={{
                color: "#fff",
                textShadow: `0 0 6px rgba(${rgb}, 0.7), 0 0 14px rgba(${rgb}, 0.3)`,
              }}
              title={character.name}
            >
              {displayName}
            </div>

            {/* 战力 */}
            {revealedRarity && showStats && (
              <div
                className={`pointer-events-auto flex-shrink-0 rounded px-1.5 py-[2px] font-black flex items-center gap-0.5 ${cfg.powerText}`}
                style={{
                  background: `rgba(${rgb}, 0.85)`,
                  color: "#0B0C10",
                  boxShadow: `0 1px 4px rgba(0,0,0,0.4)`,
                }}
                title="战力"
              >
                <Zap size={size === "sm" ? 8 : 9} />
                {power}
              </div>
            )}
          </div>
        )}

        {/* Hover 时的顶部提示 */}
        {hoverHint && !isGenerating && !isFailed && (
          <div
            className={`absolute top-0 left-0 right-0 flex items-center justify-center pt-1 pb-1 font-black tracking-[0.35em] opacity-0 group-hover:opacity-100 transition-opacity ${cfg.subline}`}
            style={{
              background: `linear-gradient(to bottom, rgba(${rgb}, 0.9), transparent)`,
              color: "#0B0C10",
            }}
          >
            ▸ {hoverHint}
          </div>
        )}

        {/* Hover 时的删除按钮（仅 ready 态） */}
        {onDelete && !isGenerating && !isFailed && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(e);
            }}
            className="absolute top-1.5 right-1.5 z-30 flex h-6 w-6 items-center justify-center rounded-full border opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background: "rgba(11,12,16,0.85)",
              borderColor: "rgba(255,107,157,0.75)",
              color: "#FF6B9D",
              boxShadow: "0 0 8px rgba(255,107,157,0.45)",
              backdropFilter: "blur(2px)",
            }}
            aria-label="删除词灵"
            title="删除词灵"
          >
            <Trash2 size={size === "sm" ? 10 : 12} />
          </button>
        )}

        {/* 卡片右侧操作插槽（如聊天/出战/删除按钮组） */}
        {actionSlot && !isGenerating && !isFailed && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1">
            {actionSlot}
          </div>
        )}

        {/* 状态叠加层：生成中 / 失败 / 进化中 */}
        {isGenerating && (
          <GeneratingOverlay
            stage={recruitLock?.stage ?? 0}
            themeColor="#FFD700"
            size={size}
          />
        )}
        {isFailed && (
          <FailedOverlay
            message={recruitLock?.error}
            onRetry={onRetryRecruit}
            onDrop={onDropRecruit}
            size={size}
          />
        )}
        {isEvolutionLocked && <EvolutionLockOverlay size={size} />}
      </div>

      {/* 底部信息区：属性 + 自定义 footer */}
      {showStats && (
        <div className={`relative ${cfg.padding}`}>
          {/* 分隔线 */}
          <div
            className="absolute top-0 left-1 right-1 h-[1px]"
            style={{
              background: `linear-gradient(90deg, transparent, rgba(${rgb}, 0.4), transparent)`,
            }}
          />

          {revealedRarity ? (
            <div className={`grid grid-cols-4 gap-1 ${cfg.statText}`}>
              <StatCell
                icon={
                  <Zap
                    size={cfg.statSize}
                    style={{
                      color: "#FBBF24",
                      filter: "drop-shadow(0 0 2px rgba(251,191,36,0.6))",
                    }}
                  />
                }
                value={character.attack}
                label="攻击"
                color="#FBBF24"
                max={200}
              />
              <StatCell
                icon={
                  <Shield
                    size={cfg.statSize}
                    style={{
                      color: "#60A5FA",
                      filter: "drop-shadow(0 0 2px rgba(96,165,250,0.6))",
                    }}
                  />
                }
                value={character.defense}
                label="防御"
                color="#60A5FA"
                max={200}
              />
              <StatCell
                icon={
                  <Heart
                    size={cfg.statSize}
                    style={{
                      color: "#F472B6",
                      filter: "drop-shadow(0 0 2px rgba(244,114,182,0.6))",
                    }}
                  />
                }
                value={character.maxHp}
                label="生命"
                color="#F472B6"
                max={2000}
              />
              <StatCell
                icon={
                  <Gauge
                    size={cfg.statSize}
                    style={{
                      color: "#4ADE80",
                      filter: "drop-shadow(0 0 2px rgba(74,222,128,0.6))",
                    }}
                  />
                }
                value={character.speed}
                label="速度"
                color="#4ADE80"
                max={120}
              />
            </div>
          ) : (
            // 生成中 / 失败：属性用占位骨架
            <div className={`grid grid-cols-4 gap-1 ${cfg.statText}`}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-0.5 opacity-40"
                >
                  <div
                    className="rounded-sm"
                    style={{
                      width: cfg.statSize + 2,
                      height: cfg.statSize + 2,
                      background: `${primaryColor}44`,
                    }}
                  />
                  <div
                    className="rounded-sm"
                    style={{
                      width: "60%",
                      height: 6,
                      background: `${primaryColor}33`,
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {footerSlot && <div className="mt-1.5">{footerSlot}</div>}
        </div>
      )}
    </motion.div>
  );
};

const StatCell: React.FC<{
  icon: React.ReactNode;
  value: number;
  label: string;
  color: string;
  max?: number;
}> = ({ icon, value, label, color, max = 200 }) => {
  const ratio = Math.max(0.04, Math.min(1, value / max));
  return (
    <div
      className="flex flex-col items-center gap-0.5 min-w-0"
      title={`${label} ${value}`}
    >
      <div className="flex items-center gap-0.5 min-w-0">
        {icon}
        <span
          className="text-[#C5C6C7] tabular-nums font-semibold leading-none"
          style={{ fontSize: "inherit" }}
        >
          {value}
        </span>
      </div>
      <div
        className="h-[2px] w-full rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${ratio * 100}%`,
            background: color,
            boxShadow: `0 0 4px ${color}88`,
          }}
        />
      </div>
    </div>
  );
};
