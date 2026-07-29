import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Heart,
  Trash2,
  Sparkles,
  Flame,
  Swords,
  MessageCircle,
  BookOpen,
  Brain,
  type LucideIcon,
} from "lucide-react";
import {
  RARITY_CONFIGS,
  type Rarity,
  type Skill,
  type SpiritProfile,
} from "../store/useGameStore";
import { ULTIMATE_TYPES } from "../data/ultimateTypes";
import type {
  EvolutionStage,
  FormHistoryEntry,
  TowerRunRecord,
} from "../store/useRosterStore";
import {
  evolutionLabel,
  evolutionStars,
  getNextEvolutionProgress,
  levelAscensionLabel,
  xpProgress,
} from "../utils/towerProgress";
import { HeroCard } from "./HeroCard";

export interface DisplayCharacter {
  name: string;
  hp: number;
  imageUrl?: string;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  skills: Skill[];
  sourceDescription?: string;
  spiritProfile?: SpiritProfile;
  rarity?: Rarity;
  recruitedAt?: number;
  rosterId?: string;
  level?: number;
  xp?: number;
  evolutionStage?: EvolutionStage;
  formHistory?: FormHistoryEntry[];
  tower?: {
    highestCleared: number;
    highestEndlessLayer?: number;
    nextLayer: number;
    runs: TowerRunRecord[];
  };
}

const skillTypeMeta: Record<
  string,
  { label: string; color: string; icon: LucideIcon }
> = {
  attack: { label: "攻击", color: "#FF6B6B", icon: Swords },
  heal: { label: "治疗", color: "#66FCF1", icon: Heart },
  buff: { label: "增益", color: "#FFD700", icon: Sparkles },
  debuff: { label: "减益", color: "#FF003C", icon: Flame },
  ultimate: { label: "大招", color: "#FFD700", icon: Flame },
};

const formatRecruitedAt = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface CharacterDetailModalProps {
  character: DisplayCharacter;
  onClose: () => void;
  onRemove?: () => void;
  onChat?: () => void;
  onBattle?: () => void;
  onStory?: () => void;
  storyDisabled?: boolean;
  themeColor?: string;
}

const DetailHeroCard: React.FC<{ character: DisplayCharacter }> = ({
  character,
}) => {
  const [flipped, setFlipped] = useState(false);
  const rarityConfig = RARITY_CONFIGS[character.rarity ?? "R"];
  const signatureSkill =
    character.skills.find(
      (skill) => skill.isUltimate || skill.type === "ultimate",
    )?.name ??
    character.skills[0]?.name ??
    character.name;
  const slogan =
    character.spiritProfile?.slogan?.trim() ||
    character.spiritProfile?.battleCry?.trim() ||
    character.spiritProfile?.catchphrases?.[0]?.trim() ||
    `${character.name}，以${signatureSkill}为誓。`;

  return (
    <div
      className="relative w-full select-none"
      style={{ perspective: 1600 }}
      onMouseEnter={() => setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
      onFocus={() => setFlipped(true)}
      onBlur={() => setFlipped(false)}
      onClick={() => setFlipped((current) => !current)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setFlipped((current) => !current);
      }}
      tabIndex={0}
      role="button"
      aria-pressed={flipped}
      aria-label={`${character.name} 英雄卡，悬停翻面，点击切换正反面`}
    >
      <motion.div
        className="relative w-full"
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
      >
        <div style={{ backfaceVisibility: "hidden" }}>
          <HeroCard
            character={character}
            size="lg"
            showStats
            showQuote={false}
            className="!w-full"
          />
        </div>
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl border"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "linear-gradient(145deg, #151725 0%, #0a0b12 100%)",
            borderColor: `${rarityConfig.primaryColor}88`,
            boxShadow: `0 0 28px ${rarityConfig.glowColor}, inset 0 0 28px rgba(${rarityConfig.rgb}, 0.14)`,
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background: `radial-gradient(circle at 18% 18%, rgba(${rarityConfig.rgb}, 0.2), transparent 32%), linear-gradient(135deg, transparent 49.8%, rgba(${rarityConfig.rgb}, 0.12) 50%, transparent 50.2%)`,
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-3 rounded-xl border border-dashed"
            style={{ borderColor: `rgba(${rarityConfig.rgb}, 0.25)` }}
          />
          <div className="relative flex h-full flex-col justify-between p-6">
            <div>
              <p
                className="font-mono text-[9px] tracking-[0.3em]"
                style={{ color: rarityConfig.primaryColor }}
              >
                SPIRIT SIGNATURE
              </p>
              <div
                className="mt-3 h-[1px] w-12"
                style={{ backgroundColor: rarityConfig.primaryColor }}
              />
            </div>
            <p
              className="text-center font-display text-[18px] font-semibold leading-[1.8] text-white"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 5,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textShadow: `0 0 18px rgba(${rarityConfig.rgb}, 0.4)`,
              }}
            >
              <span style={{ color: rarityConfig.primaryColor }}>“</span>
              {slogan}
              <span style={{ color: rarityConfig.primaryColor }}>”</span>
            </p>
            <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
              <div>
                <p className="font-mono text-[8px] tracking-[0.2em] text-white/35">
                  ARCHETYPE
                </p>
                <p className="mt-1 truncate text-[11px] text-white/75">
                  {character.spiritProfile?.archetype || "未定义原型"}
                </p>
              </div>
              <div>
                <p className="font-mono text-[8px] tracking-[0.2em] text-white/35">
                  SIGNATURE
                </p>
                <p
                  className="mt-1 truncate text-[11px]"
                  style={{ color: rarityConfig.secondaryColor }}
                >
                  {signatureSkill}
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  character,
  onClose,
  onRemove,
  onChat,
  onBattle,
  onStory,
  storyDisabled = false,
  themeColor = "#66FCF1",
}) => {
  const hasGrowth = typeof character.level === "number";
  const [activeTab, setActiveTab] = useState<"profile" | "growth">("profile");
  const spirit = character.spiritProfile;
  const catchphrases = spirit?.catchphrases ?? [];
  const worldAnchors = spirit?.worldAnchors ?? [];
  const memorySeeds = spirit?.memorySeeds ?? [];

  const level = character.level ?? 1;
  const xp = character.xp ?? 0;
  const stage: EvolutionStage = character.evolutionStage ?? 0;
  const xpInfo = xpProgress(level, xp);
  const nextEvolution = getNextEvolutionProgress(level, xp, stage);
  const stars = evolutionStars(stage);
  const towerRuns: TowerRunRecord[] = (character.tower?.runs ?? [])
    .slice()
    .reverse()
    .slice(0, 5);
  const formHistory: FormHistoryEntry[] = character.formHistory ?? [];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#05060a]/85 p-3 backdrop-blur-md md:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 10, opacity: 0 }}
        transition={{ type: "spring", bounce: 0.25, duration: 0.45 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${character.name} 词灵档案`}
        className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto overflow-x-hidden border bg-[#0b1019]/95 p-4 md:p-5 lg:flex lg:h-[min(760px,calc(100vh-48px))] lg:max-h-[calc(100vh-48px)] lg:flex-col lg:overflow-hidden"
        style={{
          borderColor: `${themeColor}66`,
          boxShadow: `0 24px 80px rgba(0,0,0,0.62), inset 0 1px 0 ${themeColor}22`,
          color: themeColor,
        }}
      >
        <div className="mb-4 flex items-center gap-3 border-b border-white/[0.06] pb-3 lg:shrink-0">
          <span className="h-1 w-1" style={{ backgroundColor: themeColor }} />
          <span
            className="font-mono text-[9px] tracking-[0.4em]"
            style={{ color: `${themeColor}cc` }}
          >
            SPIRIT DOSSIER · LOCAL ARCHIVE
          </span>
          {character.recruitedAt && (
            <span className="ml-auto hidden font-mono text-[9px] tracking-widest text-white/30 sm:block">
              REGISTERED · {formatRecruitedAt(character.recruitedAt)}
            </span>
          )}
        </div>

        <div className="grid items-start gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[272px_minmax(0,1fr)] lg:items-stretch">
          <aside className="mx-auto w-full max-w-[272px] lg:self-start">
            <DetailHeroCard character={character} />
            <p className="mt-3 text-center font-mono text-[9px] tracking-[0.22em] text-white/30">
              HOVER TO FLIP · CLICK TO RETURN
            </p>
          </aside>

          <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
            <header className="mb-5 lg:shrink-0">
              <h2
                className="font-display text-[clamp(2rem,4vw,3.35rem)] font-black leading-[0.9] tracking-tight"
                style={{
                  color: themeColor,
                  letterSpacing: "-0.03em",
                  textShadow: `0 0 24px ${themeColor}66`,
                }}
              >
                {character.name}
              </h2>
              <p className="mt-2 font-mono text-[10px] font-bold tracking-[0.34em] text-white/25">
                {character.recruitedAt
                  ? `REGISTERED · ${formatRecruitedAt(character.recruitedAt)}`
                  : "UNREGISTERED SPIRIT"}
              </p>
              {character.sourceDescription && (
                <p
                  className="mt-4 border-l pl-3 text-[12px] leading-relaxed text-[#C5C6C7]"
                  style={{
                    borderColor: `${themeColor}88`,
                    background: `linear-gradient(90deg, ${themeColor}0d, transparent)`,
                  }}
                >
                  {character.sourceDescription}
                </p>
              )}
            </header>

            {/* Tabs */}
            {hasGrowth && (
              <div
                className="mb-4 flex border-b lg:shrink-0"
                style={{ borderColor: `${themeColor}25` }}
              >
                {(["profile", "growth"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className="px-4 py-2 text-[11px] tracking-widest font-display transition-all"
                    style={{
                      color: activeTab === tab ? themeColor : "#8a8d91",
                      borderBottom:
                        activeTab === tab
                          ? `1px solid ${themeColor}`
                          : "1px solid transparent",
                      textShadow:
                        activeTab === tab ? `0 0 8px ${themeColor}` : "none",
                    }}
                  >
                    {tab === "profile" ? "角色档案" : "成长档案"}
                  </button>
                ))}
              </div>
            )}

            <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="space-y-4"
              >
                {(!hasGrowth || activeTab === "profile") && (
                  <div className="space-y-4">
                    {spirit && (
                      <div
                        className="border p-3.5"
                        style={{
                          borderColor: `${themeColor}30`,
                          background: `${themeColor}05`,
                        }}
                      >
                        <div
                          className="flex items-center gap-2 text-xs font-bold tracking-wider mb-3"
                          style={{ color: themeColor }}
                        >
                          <Brain size={13} />
                          <span>词灵档案 · SPIRIT CARD</span>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 mb-3">
                          <div
                            className="border-l-2 pl-3"
                            style={{ borderColor: `${themeColor}50` }}
                          >
                            <div className="text-[10px] tracking-widest text-[#8a8d91] mb-1">
                              原型
                            </div>
                            <div className="text-sm font-bold text-[#C5C6C7]">
                              {spirit.archetype}
                            </div>
                            <div className="mt-1.5 text-[11px] leading-relaxed text-[#C5C6C7]">
                              {spirit.temperament}
                            </div>
                          </div>
                          <div
                            className="border-l-2 pl-3"
                            style={{ borderColor: `${themeColor}50` }}
                          >
                            <div className="flex items-center gap-1 text-[10px] tracking-widest text-[#8a8d91] mb-1">
                              <MessageCircle size={10} />
                              语气
                            </div>
                            <div className="text-[11px] leading-relaxed text-[#C5C6C7]">
                              {spirit.speechStyle}
                            </div>
                            {spirit.battleCry && (
                              <div
                                className="mt-1.5 text-xs font-bold"
                                style={{ color: themeColor }}
                              >
                                “{spirit.battleCry}”
                              </div>
                            )}
                          </div>
                        </div>

                        {catchphrases.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {catchphrases.map((line, idx) => (
                              <span
                                key={idx}
                                className="border px-1.5 py-0.5 text-[10px] text-[#C5C6C7]"
                                style={{
                                  borderColor: `${themeColor}40`,
                                  background: `${themeColor}0D`,
                                }}
                              >
                                {line}
                              </span>
                            ))}
                          </div>
                        )}

                        {(worldAnchors.length > 0 ||
                          memorySeeds.length > 0) && (
                          <div
                            className="grid gap-3 md:grid-cols-2 pt-3 border-t"
                            style={{ borderColor: `${themeColor}20` }}
                          >
                            {worldAnchors.length > 0 && (
                              <div>
                                <div className="flex items-center gap-1 text-[10px] tracking-widest text-[#8a8d91] mb-1.5">
                                  <BookOpen size={10} />
                                  世界锚点
                                </div>
                                <div className="space-y-1">
                                  {worldAnchors.map((anchor, idx) => (
                                    <div
                                      key={idx}
                                      className="text-[11px] leading-relaxed text-[#C5C6C7]"
                                    >
                                      <span style={{ color: themeColor }}>
                                        ▸
                                      </span>{" "}
                                      {anchor}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {memorySeeds.length > 0 && (
                              <div>
                                <div className="flex items-center gap-1 text-[10px] tracking-widest text-[#8a8d91] mb-1.5">
                                  <Sparkles size={10} />
                                  记忆种子
                                </div>
                                <div className="space-y-1">
                                  {memorySeeds.map((seed, idx) => (
                                    <div
                                      key={idx}
                                      className="text-[11px] leading-relaxed text-[#C5C6C7]"
                                    >
                                      <span style={{ color: themeColor }}>
                                        ▸
                                      </span>{" "}
                                      {seed}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <div
                        className="flex items-center gap-2 text-xs font-bold tracking-wider mb-2.5"
                        style={{ color: themeColor }}
                      >
                        <Swords size={13} />
                        <span>技能档案 · SKILLS</span>
                      </div>
                      <div className="space-y-2">
                        {character.skills.map((skill, idx) => {
                          const meta =
                            skillTypeMeta[skill.type] || skillTypeMeta.attack;
                          const Icon = meta.icon;
                          const isUlt =
                            skill.isUltimate || skill.type === "ultimate";
                          const ultMeta =
                            isUlt && skill.ultimateType
                              ? ULTIMATE_TYPES.find(
                                  (t) => t.id === skill.ultimateType,
                                )
                              : undefined;
                          const ultImage = skill.imageUrl || ultMeta?.imageUrl;
                          return (
                            <div
                              key={idx}
                              className="flex items-start gap-3 p-2.5 border bg-[#0B0C10]"
                              style={{ borderColor: `${meta.color}55` }}
                            >
                              {isUlt && ultImage ? (
                                <img
                                  src={ultImage}
                                  alt={skill.name}
                                  className="w-11 h-11 object-cover flex-shrink-0 border"
                                  style={{ borderColor: `${meta.color}88` }}
                                />
                              ) : (
                                <div
                                  className="w-11 h-11 flex items-center justify-center flex-shrink-0 border"
                                  style={{
                                    borderColor: `${meta.color}66`,
                                    color: meta.color,
                                    background: `${meta.color}11`,
                                  }}
                                >
                                  <Icon size={18} />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span
                                    className="text-sm font-bold font-display tracking-wider"
                                    style={{ color: meta.color }}
                                  >
                                    {skill.name}
                                  </span>
                                  <span
                                    className="text-[9px] px-1 py-0.5 tracking-widest border"
                                    style={{
                                      background: `${meta.color}15`,
                                      color: meta.color,
                                      borderColor: `${meta.color}40`,
                                    }}
                                  >
                                    {isUlt ? "大招" : meta.label}
                                  </span>
                                  {skill.damageMultiplier > 0 && (
                                    <span className="text-[10px] text-[#8a8d91]">
                                      x{skill.damageMultiplier.toFixed(1)}
                                    </span>
                                  )}
                                  {skill.healPercent && (
                                    <span className="text-[10px] text-[#66FCF1]">
                                      回复 {skill.healPercent}%
                                    </span>
                                  )}
                                  {skill.buffPercent && (
                                    <span className="text-[10px] text-[#FFD700]">
                                      {skill.buffPercent}% /{" "}
                                      {skill.buffTurns ?? 0}
                                      回合
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[#C5C6C7] leading-relaxed">
                                  {skill.description}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {hasGrowth && activeTab === "growth" && (
                  <div className="space-y-4">
                    <div
                      className="border p-3.5"
                      style={{
                        borderColor: `${themeColor}30`,
                        background: `${themeColor}05`,
                      }}
                    >
                      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-2xl font-black font-display"
                            style={{ color: themeColor }}
                          >
                            Lv.{level}
                          </span>
                          <span
                            className="text-[10px] tracking-widest px-1.5 py-0.5 border"
                            style={{
                              borderColor: "#66FCF188",
                              color: "#66FCF1",
                            }}
                          >
                            {levelAscensionLabel(level)}
                          </span>
                          <span
                            className="text-[10px] tracking-widest px-1.5 py-0.5 border"
                            style={{
                              borderColor: `${themeColor}88`,
                              color: themeColor,
                            }}
                          >
                            {evolutionLabel(stage)}
                          </span>
                          <span
                            className="text-sm"
                            style={{ color: "#FFD700" }}
                          >
                            {"★".repeat(stars)}
                            {"☆".repeat(Math.max(0, 6 - stars))}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#8a8d91] tracking-widest">
                          塔最高 · L
                          {character.tower?.highestEndlessLayer ??
                            character.tower?.highestCleared ??
                            0}
                        </div>
                      </div>
                      <div className="h-2 bg-[#0B0C10] border border-[#45A29E]/30 overflow-hidden">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${xpInfo.ratio * 100}%`,
                            background: themeColor,
                            boxShadow: `0 0 8px ${themeColor}`,
                          }}
                        />
                      </div>
                      <div className="text-[10px] text-[#8a8d91] mt-1 text-right">
                        {xpInfo.current} / {xpInfo.need} XP
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-[#8a8d91]">
                        <span>下次进化</span>
                        <span
                          className="font-bold"
                          style={{ color: themeColor }}
                        >
                          {nextEvolution.nextStage
                            ? nextEvolution.ready
                              ? `${evolutionLabel(nextEvolution.nextStage)}待触发`
                              : `Lv.${nextEvolution.targetLevel} ${evolutionLabel(nextEvolution.nextStage)} · 还差 ${nextEvolution.xpRemaining} XP`
                            : "最终形态"}
                        </span>
                      </div>
                    </div>

                    {formHistory.length > 0 && (
                      <div
                        className="border p-3"
                        style={{
                          borderColor: `${themeColor}25`,
                          background: `${themeColor}05`,
                        }}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span
                            className="h-1 w-1"
                            style={{ backgroundColor: themeColor }}
                          />
                          <span
                            className="text-xs font-bold tracking-wider"
                            style={{ color: themeColor }}
                          >
                            形态时间轴
                          </span>
                          <span className="font-mono text-[9px] tracking-widest text-white/30">
                            {formHistory.length} FORMS
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {formHistory.map((form, i) => (
                            <div
                              key={i}
                              className="grid w-full max-w-[280px] grid-cols-[60px_minmax(0,1fr)] gap-2 border bg-[#0B0C10] p-2"
                              style={{ borderColor: `${themeColor}33` }}
                            >
                              <div
                                className="h-[60px] overflow-hidden border bg-[#1F2833]"
                                style={{ borderColor: `${themeColor}55` }}
                              >
                                {form.imageUrl ? (
                                  <img
                                    src={form.imageUrl}
                                    alt={`stage-${form.stage}`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] text-[#8a8d91]">
                                    生成中…
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div
                                  className="text-[10px] tracking-widest font-display"
                                  style={{ color: themeColor }}
                                >
                                  {evolutionLabel(form.stage)}
                                </div>
                                <div className="mt-1 text-[10px] leading-snug text-[#C5C6C7] line-clamp-3">
                                  {form.lore || "形态记录已归档。"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div
                      className="border p-3.5"
                      style={{
                        borderColor: `${themeColor}25`,
                        background: `${themeColor}05`,
                      }}
                    >
                      <div
                        className="text-xs font-bold tracking-wider mb-2.5"
                        style={{ color: themeColor }}
                      >
                        最近塔战记录
                      </div>
                      {towerRuns.length === 0 ? (
                        <div className="text-[11px] text-[#8a8d91]">
                          尚无塔战记录。
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {towerRuns.map((run, i) => (
                            <div
                              key={i}
                              className="bg-[#0B0C10] border p-2"
                              style={{
                                borderColor:
                                  run.result === "win"
                                    ? "#7FFF9F44"
                                    : "#FF6B9D44",
                              }}
                            >
                              <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-[11px] font-bold font-display"
                                    style={{ color: themeColor }}
                                  >
                                    L{run.layer}
                                  </span>
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 tracking-widest"
                                    style={{
                                      background:
                                        run.result === "win"
                                          ? "#7FFF9F22"
                                          : "#FF6B9D22",
                                      color:
                                        run.result === "win"
                                          ? "#7FFF9F"
                                          : "#FF6B9D",
                                    }}
                                  >
                                    {run.result === "win" ? "胜" : "败"}
                                  </span>
                                  <span className="text-[10px] text-[#8a8d91]">
                                    {run.turns} 回合
                                  </span>
                                </div>
                                {run.mostUsedSkill && (
                                  <span className="text-[10px] text-[#8a8d91]">
                                    惯用 · {run.mostUsedSkill}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-[#C5C6C7] flex gap-3 flex-wrap">
                                <span>造成 {run.damageDealt}</span>
                                <span>承伤 {run.damageTaken}</span>
                                <span>暴击 {run.criticalCount}</span>
                                <span>大招 {run.ultimateCount}</span>
                              </div>
                              {run.summary && (
                                <div className="text-[11px] text-[#C5C6C7] leading-relaxed mt-1 italic">
                                  “{run.summary}”
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </div>

            {/* Footer */}
            <div
              className="mt-5 flex flex-wrap gap-2 border-t pt-4 lg:shrink-0"
              style={{ borderColor: `${themeColor}25` }}
            >
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border py-2 text-xs font-display tracking-widest transition-all hover:bg-[#66FCF1]/10"
                style={{ borderColor: themeColor, color: themeColor }}
              >
                返回
              </button>
              {onBattle && (
                <button
                  type="button"
                  onClick={onBattle}
                  className="flex items-center gap-1.5 border border-[#FF6B6B]/70 px-4 py-2 text-xs font-display tracking-widest text-[#FF6B6B] transition-all hover:bg-[#FF6B6B]/10"
                >
                  <Swords size={12} /> 战斗
                </button>
              )}
              {onStory && (
                <button
                  type="button"
                  onClick={onStory}
                  disabled={storyDisabled}
                  className="flex items-center gap-1.5 border border-[#B78BFF]/70 px-4 py-2 text-xs font-display tracking-widest text-[#B78BFF] transition-all hover:bg-[#B78BFF]/10 disabled:cursor-not-allowed disabled:opacity-35"
                  title={
                    storyDisabled
                      ? "至少需要两名可用词灵"
                      : "以该词灵为核心开启多人叙事"
                  }
                >
                  <BookOpen size={12} /> 多人叙事
                </button>
              )}
              {onChat && (
                <button
                  type="button"
                  onClick={onChat}
                  className="flex items-center gap-1.5 border border-[#FFD700]/70 px-4 py-2 text-xs font-display tracking-widest text-[#FFD700] transition-all hover:bg-[#FFD700]/10"
                >
                  <MessageCircle size={12} /> 交谈
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(`确定要将 ${character.name} 移出麾下吗？`)
                    ) {
                      onRemove();
                    }
                  }}
                  className="flex items-center gap-1.5 border border-[#FF003C]/60 px-4 py-2 text-xs font-display tracking-widest text-[#FF003C] transition-all hover:bg-[#FF003C]/10"
                >
                  <Trash2 size={12} /> 移出麾下
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
