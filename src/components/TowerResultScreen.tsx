import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Skull,
  Sparkles,
  ArrowRight,
  Loader2,
  RotateCcw,
  Castle,
  Zap as ZapIcon,
  ShieldPlus,
  HeartPulse,
  Wand2,
  Heart,
  Shield,
  Gauge,
  Flame,
} from "lucide-react";
import { useGameStore, type Skill } from "../store/useGameStore";
import {
  useRosterStore,
  type ActiveEvolutionStage,
  type RosterCharacter,
  type TowerRunRecord,
} from "../store/useRosterStore";
import { useTowerStore } from "../store/useTowerStore";
import { ParticleField } from "./ParticleField";
import { getTowerBossMeta } from "../data/towerBosses";
import {
  applyXp,
  buildLocalEvolution,
  EVOLUTION_STAT_BONUS,
  evolutionLabel,
  getNextEvolutionProgress,
  isSkillUnlockLevel,
  remainingSkillSlots,
  xpForLayer,
  xpProgress,
} from "../utils/towerProgress";
import {
  type BattleSummary,
  type SkillCandidate,
  type SkillResult,
  type EvolveResult,
  requestSkillCandidates,
} from "../utils/towerAnalysis";
import { EvolutionAnimation } from "./EvolutionAnimation";
import { BackButton } from "./BackButton";
import {
  clearEvolutionPrefetchForRoster,
  consumeEvolutionPrefetchRecord,
  startEvolutionAssetPrefetch,
  waitEvolutionPrefetch,
} from "../utils/evolutionPrefetch";
import { EVOLUTION_VISUAL_THEME } from "../utils/evolutionVisuals";
import { getFallbackAvatarUrl } from "../data/presetCharacters";

type Stage =
  | "idle"
  | "choose_skill"
  | "evolving"
  | "evolution_done"
  | "finished";
type EvolutionImageStatus =
  | "idle"
  | "loading"
  | "ready"
  | "failed"
  | "fallback";

interface StatSnapshot {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
}

const getStatSnapshot = (
  char: Pick<RosterCharacter, "maxHp" | "attack" | "defense" | "speed">,
): StatSnapshot => ({
  maxHp: char.maxHp,
  attack: char.attack,
  defense: char.defense,
  speed: char.speed,
});

const getBeforeEvolutionSnapshot = (
  char: Pick<RosterCharacter, "maxHp" | "attack" | "defense" | "speed">,
): StatSnapshot => ({
  maxHp: Math.max(1, char.maxHp - EVOLUTION_STAT_BONUS.maxHp),
  attack: Math.max(1, char.attack - EVOLUTION_STAT_BONUS.attack),
  defense: Math.max(0, char.defense - EVOLUTION_STAT_BONUS.defense),
  speed: Math.max(1, char.speed - EVOLUTION_STAT_BONUS.speed),
});

const skillIcon = (type: string) => {
  switch (type) {
    case "heal":
      return <HeartPulse size={14} className="text-pink-400" />;
    case "buff":
      return <ShieldPlus size={14} className="text-emerald-400" />;
    case "debuff":
      return <Wand2 size={14} className="text-purple-400" />;
    default:
      return <ZapIcon size={14} className="text-yellow-400" />;
  }
};

export const TowerResultScreen: React.FC = () => {
  const apiKey = useGameStore((s) => s.apiKey);
  const baseUrl = useGameStore((s) => s.baseUrl);
  const model = useGameStore((s) => s.model);
  const apiMode = useGameStore((s) => s.apiMode);
  const winner = useGameStore((s) => s.winner);
  const player1 = useGameStore((s) => s.player1);
  const player2 = useGameStore((s) => s.player2);
  const towerLayer = useGameStore((s) => s.towerLayer);
  const towerRosterId = useGameStore((s) => s.towerRosterId);
  const setPhase = useGameStore((s) => s.setPhase);

  const lastSummary = useTowerStore((s) => s.lastSummary);
  const resetPending = useTowerStore((s) => s.resetPending);

  const roster = useRosterStore((s) => s.roster);
  const updateCharacter = useRosterStore((s) => s.updateCharacter);
  const appendTowerRun = useRosterStore((s) => s.appendTowerRun);
  const appendFormHistory = useRosterStore((s) => s.appendFormHistory);
  const appendSkill = useRosterStore((s) => s.appendSkill);

  const rosterChar = useMemo(
    () => roster.find((c) => c.rosterId === towerRosterId) || null,
    [roster, towerRosterId],
  );

  const result: "win" | "loss" = winner === "player1" ? "win" : "loss";
  const meta = getTowerBossMeta(towerLayer);

  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [skillCandidates, setSkillCandidates] = useState<
    SkillCandidate[] | null
  >(null);
  const [pickedSkill, setPickedSkill] = useState<Skill | null>(null);
  const [evolveData, setEvolveData] = useState<EvolveResult | null>(null);
  const [evolvedImageUrl, setEvolvedImageUrl] = useState<string | null>(null);
  const [evolvingFromImage, setEvolvingFromImage] = useState<
    string | undefined
  >(undefined);
  const [evolutionBeforeStats, setEvolutionBeforeStats] =
    useState<StatSnapshot | null>(null);
  const [evolutionAfterStats, setEvolutionAfterStats] =
    useState<StatSnapshot | null>(null);
  const [showEvoAnim, setShowEvoAnim] = useState(false);
  const [evolutionAnimKey, setEvolutionAnimKey] = useState(0);
  const [evolutionReadyToReveal, setEvolutionReadyToReveal] = useState(false);
  const [evolutionImageStatus, setEvolutionImageStatus] =
    useState<EvolutionImageStatus>("idle");
  const [skillUnlockLoading, setSkillUnlockLoading] = useState(false);
  const pipelineStartedRef = useRef(false);
  const evolutionHandledRef = useRef(false);

  // 角色升级/进化事件（每次本地计算）
  const [xpAwarded, setXpAwarded] = useState(0);
  const [previousLevel, setPreviousLevel] = useState(0);
  const [previousXp, setPreviousXp] = useState(0);
  const [newLevel, setNewLevel] = useState(0);
  const [unlockEvent, setUnlockEvent] = useState(false);
  const [evolveEvent, setEvolveEvent] = useState<ActiveEvolutionStage | null>(
    null,
  );
  const [evolveLevel, setEvolveLevel] = useState<number | null>(null);

  /**
   * Pipeline：写入 XP -> 写入 run -> 弹技能/进化 -> 完成
   */
  useEffect(() => {
    if (
      !rosterChar ||
      !player1 ||
      !player2 ||
      !lastSummary ||
      stage !== "idle" ||
      pipelineStartedRef.current
    )
      return;
    pipelineStartedRef.current = true;
    void runGrowthPipeline(rosterChar, lastSummary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterChar, lastSummary]);

  const runGrowthPipeline = async (
    char: RosterCharacter,
    summary: BattleSummary,
  ) => {
    setError(null);

    const hpRatio =
      char.maxHp > 0
        ? Math.max(
            0,
            summary.damageTaken < char.maxHp
              ? 1 - summary.damageTaken / char.maxHp
              : 0,
          )
        : 0;
    const xpDelta = xpForLayer(towerLayer, result, hpRatio);
    setXpAwarded(xpDelta);
    setPreviousLevel(char.level);
    setPreviousXp(char.xp);

    // 1) 本地：应用 XP / 多级升级 / 进化标记
    const xpResult = applyXp(char, xpDelta);
    const evolutionLevel =
      xpResult.events.find(
        (event) => event.evolutionStage === xpResult.triggeredEvolution,
      )?.newLevel ?? xpResult.character.level;
    setNewLevel(xpResult.character.level);
    setUnlockEvent(xpResult.triggeredSkillUnlock);
    setEvolveEvent(xpResult.triggeredEvolution);
    setEvolveLevel(xpResult.triggeredEvolution ? evolutionLevel : null);

    // 2) 写回 roster：先写入主角色（含等级、属性、xp）
    updateCharacter(char.rosterId, () => xpResult.character);

    // 3) 追加本场战斗记录
    const run: TowerRunRecord = {
      layer: towerLayer,
      result,
      turns: summary.turns,
      damageDealt: summary.damageDealt,
      damageTaken: summary.damageTaken,
      criticalCount: summary.criticalCount,
      ultimateCount: summary.ultimateCount,
      mostUsedSkill: summary.mostUsedSkill,
      analyzedAt: Date.now(),
    };
    appendTowerRun(char.rosterId, run);

    const shouldUnlockSkill =
      xpResult.triggeredSkillUnlock &&
      remainingSkillSlots(xpResult.character) > 0;

    // 4) 进化优先：形态变化必须自动进入头像/大招重塑演出
    if (xpResult.triggeredEvolution) {
      await runEvolution(
        xpResult.character,
        summary,
        xpResult.triggeredEvolution,
        evolutionLevel,
      );
      if (shouldUnlockSkill) {
        await requestAndShowSkillCandidates(xpResult.character, summary);
      }
      return;
    }

    // 5) 技能解锁三选一
    if (
      shouldUnlockSkill &&
      (await requestAndShowSkillCandidates(xpResult.character, summary))
    ) {
      return;
    }

    setStage("finished");
  };

  const requestAndShowSkillCandidates = async (
    char: RosterCharacter,
    summary: BattleSummary,
  ): Promise<boolean> => {
    setSkillUnlockLoading(true);
    try {
      const skillRes: SkillResult = await requestSkillCandidates(
        { apiKey, baseUrl, model, apiMode },
        char,
        summary,
        { layer: towerLayer, level: char.level },
      );
      if (skillRes.candidates.length > 0) {
        setSkillCandidates(skillRes.candidates);
        setStage("choose_skill");
        return true;
      }
    } catch (err) {
      console.warn("skill request failed", err);
    } finally {
      setSkillUnlockLoading(false);
    }
    return false;
  };

  const handlePickSkill = async (candidate: SkillCandidate) => {
    if (!rosterChar) return;
    const newSkill: Skill = {
      name: candidate.name,
      description: candidate.description,
      type: candidate.type,
      damageMultiplier: candidate.damageMultiplier ?? 0,
      healPercent: candidate.healPercent,
      buffPercent: candidate.buffPercent,
      buffTurns: candidate.buffTurns,
    };
    appendSkill(rosterChar.rosterId, newSkill);
    setPickedSkill(newSkill);
    setSkillCandidates(null);

    // 进化 stage 兜底（同一场战斗可能同时升级、解锁技能并进化）
    if (evolveEvent && !evolutionHandledRef.current) {
      const refreshed = useRosterStore
        .getState()
        .roster.find((c) => c.rosterId === rosterChar.rosterId);
      if (refreshed && lastSummary) {
        await runEvolution(
          refreshed,
          lastSummary,
          evolveEvent,
          evolveLevel ?? refreshed.level,
        );
        return;
      }
    }
    setStage("finished");
  };

  const runEvolution = async (
    char: RosterCharacter,
    summary: BattleSummary,
    stageNum: ActiveEvolutionStage,
    triggerLevel: number,
  ) => {
    setStage("evolving");
    setError(null);
    setEvolvingFromImage(char.imageUrl);
    setEvolvedImageUrl(null);
    setEvolutionBeforeStats(getBeforeEvolutionSnapshot(char));
    setEvolutionAfterStats(getStatSnapshot(char));
    setEvolutionReadyToReveal(false);
    setEvolutionImageStatus("loading");
    try {
      const localEvo = buildLocalEvolution(char, stageNum);
      setEvolveData(localEvo);
      setEvolutionAnimKey((key) => key + 1);
      setShowEvoAnim(true);
      const prefetchTask = startEvolutionAssetPrefetch(
        {
          rosterId: char.rosterId,
          characterName: char.name,
          stage: stageNum,
          level: triggerLevel,
          layer: towerLayer,
        },
        async () => localEvo,
      );
      const cached = consumeEvolutionPrefetchRecord(
        char.rosterId,
        stageNum,
        triggerLevel,
        towerLayer,
      );
      const pending = waitEvolutionPrefetch(
        char.rosterId,
        stageNum,
        triggerLevel,
        towerLayer,
      );
      const prepared =
        cached ??
        (await Promise.race([
          pending ?? prefetchTask,
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 12_000),
          ),
        ]));

      if (!prepared?.avatarUrl) {
        // 兜底：不阻塞玩家。用本地兜底图替代，数值进化照常完成；retry 按钮可稍后覆盖。
        const fallbackUrl = getFallbackAvatarUrl({
          name: char.name,
          imagePrompt: localEvo.imagePrompt,
          description: localEvo.lore,
          ultimateType: localEvo.newUltimate?.ultimateType,
          player: 1,
        });
        const ultimateImageFallback = localEvo.newUltimate?.imageUrl || null;
        const evoWithImageFallback: EvolveResult = {
          ...localEvo,
          newUltimate:
            localEvo.newUltimate && ultimateImageFallback
              ? { ...localEvo.newUltimate, imageUrl: ultimateImageFallback }
              : localEvo.newUltimate,
        };
        setEvolveData(evoWithImageFallback);
        setEvolvedImageUrl(fallbackUrl);
        setEvolutionImageStatus("fallback");

        const entry = {
          stage: stageNum,
          imagePrompt: evoWithImageFallback.imagePrompt,
          imageUrl: fallbackUrl,
          lore: evoWithImageFallback.lore,
          createdAt: Date.now(),
        } as const;
        appendFormHistory(char.rosterId, entry);

        updateCharacter(char.rosterId, (current) => ({
          ...current,
          imageUrl: fallbackUrl,
          imagePrompt: evoWithImageFallback.imagePrompt || current.imagePrompt,
          skills: evoWithImageFallback.newUltimate
            ? current.skills.map((s) =>
                s.isUltimate || s.type === "ultimate"
                  ? {
                      ...s,
                      ...evoWithImageFallback.newUltimate,
                      ultimateType:
                        evoWithImageFallback.newUltimate?.ultimateType ??
                        s.ultimateType,
                    }
                  : s,
              )
            : current.skills,
        }));
        clearEvolutionPrefetchForRoster(char.rosterId);
        const evolvedCharacterFallback = useRosterStore
          .getState()
          .roster.find((c) => c.rosterId === char.rosterId);
        if (evolvedCharacterFallback) {
          setEvolutionAfterStats(getStatSnapshot(evolvedCharacterFallback));
        }
        setStage("evolution_done");
        evolutionHandledRef.current = true;
        setEvolutionReadyToReveal(true);
        return;
      }

      const evo = prepared?.evo ?? localEvo;
      const ultimateImage =
        prepared?.ultimateImageUrl || evo.newUltimate?.imageUrl || null;
      const evoWithImage: EvolveResult = {
        ...evo,
        newUltimate:
          evo.newUltimate && ultimateImage
            ? { ...evo.newUltimate, imageUrl: ultimateImage }
            : evo.newUltimate,
      };
      setEvolveData(evoWithImage);

      const newImage = prepared.avatarUrl;
      setEvolvedImageUrl(newImage || null);
      setEvolutionImageStatus("ready");

      const entry = {
        stage: stageNum,
        imagePrompt: evoWithImage.imagePrompt,
        imageUrl: newImage,
        lore: evoWithImage.lore,
        createdAt: Date.now(),
      } as const;
      appendFormHistory(char.rosterId, entry);

      updateCharacter(char.rosterId, (current) => ({
        ...current,
        imageUrl: newImage,
        imagePrompt: evoWithImage.imagePrompt || current.imagePrompt,
        skills: evoWithImage.newUltimate
          ? current.skills.map((s) =>
              s.isUltimate || s.type === "ultimate"
                ? {
                    ...s,
                    ...evoWithImage.newUltimate,
                    ultimateType:
                      evoWithImage.newUltimate?.ultimateType ?? s.ultimateType,
                  }
                : s,
            )
          : current.skills,
      }));
      clearEvolutionPrefetchForRoster(char.rosterId);
      const evolvedCharacter = useRosterStore
        .getState()
        .roster.find((c) => c.rosterId === char.rosterId);
      if (evolvedCharacter) {
        setEvolutionAfterStats(getStatSnapshot(evolvedCharacter));
      }

      setStage("evolution_done");
      evolutionHandledRef.current = true;
      setEvolutionReadyToReveal(true);
    } catch (err) {
      console.warn("evolve request failed", err);
      // 即便构建/缓存抛错，也必须让玩家能继续——用本地兜底图替代，retry 可后续覆盖。
      const localEvoSafe = buildLocalEvolution(char, stageNum);
      const fallbackUrl = getFallbackAvatarUrl({
        name: char.name,
        imagePrompt: localEvoSafe.imagePrompt,
        description: localEvoSafe.lore,
        ultimateType: localEvoSafe.newUltimate?.ultimateType,
        player: 1,
      });
      setEvolveData(localEvoSafe);
      setEvolvedImageUrl(fallbackUrl);
      setEvolutionImageStatus("fallback");
      setError(null);

      const entry = {
        stage: stageNum,
        imagePrompt: localEvoSafe.imagePrompt,
        imageUrl: fallbackUrl,
        lore: localEvoSafe.lore,
        createdAt: Date.now(),
      } as const;
      appendFormHistory(char.rosterId, entry);

      updateCharacter(char.rosterId, (current) => ({
        ...current,
        imageUrl: fallbackUrl,
        imagePrompt: localEvoSafe.imagePrompt || current.imagePrompt,
        skills: localEvoSafe.newUltimate
          ? current.skills.map((s) =>
              s.isUltimate || s.type === "ultimate"
                ? {
                    ...s,
                    ...localEvoSafe.newUltimate,
                    ultimateType:
                      localEvoSafe.newUltimate?.ultimateType ?? s.ultimateType,
                  }
                : s,
            )
          : current.skills,
      }));
      clearEvolutionPrefetchForRoster(char.rosterId);
      const evolvedCharacterCatch = useRosterStore
        .getState()
        .roster.find((c) => c.rosterId === char.rosterId);
      if (evolvedCharacterCatch) {
        setEvolutionAfterStats(getStatSnapshot(evolvedCharacterCatch));
      }
      setStage("evolution_done");
      evolutionHandledRef.current = true;
      setEvolutionReadyToReveal(true);
    }
  };

  const handleRetryEvolutionImage = async () => {
    if (!rosterChar || !lastSummary || !evolveEvent) return;
    const refreshed =
      useRosterStore
        .getState()
        .roster.find((c) => c.rosterId === rosterChar.rosterId) ?? rosterChar;
    await runEvolution(
      refreshed,
      lastSummary,
      evolveEvent,
      evolveLevel ?? refreshed.level,
    );
  };

  const handleEvolutionAnimFinish = useCallback(() => {
    setShowEvoAnim(false);
    setEvolutionReadyToReveal(false);
  }, []);

  const handleContinue = () => {
    resetPending();
    setPhase("TOWER_HUB");
  };

  if (!rosterChar || !player1 || !player2 || !meta) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#FFD700] font-display tracking-widest">
        CALCULATING RESULT...
      </div>
    );
  }

  const themeColor = result === "win" ? "#FFD700" : "#FF003C";
  const themeRgb = result === "win" ? "255, 215, 0" : "255, 0, 60";
  const Icon = result === "win" ? Trophy : Skull;

  const progress = xpProgress(newLevel || rosterChar.level, rosterChar.xp);
  const nextEvolution = getNextEvolutionProgress(
    newLevel || rosterChar.level,
    rosterChar.xp,
    rosterChar.evolutionStage,
  );

  return (
    <div className="min-h-screen flex flex-col items-center p-6 relative overflow-hidden grid-bg">
      <ParticleField count={36} colors={[themeColor, "#66FCF1"]} />
      <BackButton
        onClick={handleContinue}
        color={themeColor}
        className="absolute left-6 top-6 z-20"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="z-10 w-full max-w-3xl bg-[#1F2833]/85 border-2 rounded-2xl p-7"
        style={{
          borderColor: themeColor,
          boxShadow: `0 0 30px rgba(${themeRgb}, 0.45)`,
        }}
      >
        <div className="flex items-center gap-3 mb-1">
          <Icon size={28} style={{ color: themeColor }} />
          <h1
            className="text-3xl font-black font-display tracking-widest"
            style={{ color: themeColor }}
          >
            {result === "win" ? "挑战成功" : "挑战失败"}
          </h1>
          <div className="ml-auto text-xs text-[#8a8d91] flex items-center gap-1">
            <Castle size={12} />第 {towerLayer} 层 · {meta.name}
          </div>
        </div>
        <div className="text-[10px] text-[#8a8d91] tracking-[0.3em] mb-5">
          ▼ TOWER LAYER {towerLayer} · {result.toUpperCase()} ▼
        </div>

        {lastSummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-[#C5C6C7] mb-5">
            <SummaryTile label="回合数" value={lastSummary.turns} />
            <SummaryTile label="造成伤害" value={lastSummary.damageDealt} />
            <SummaryTile label="承受伤害" value={lastSummary.damageTaken} />
            <SummaryTile label="暴击次数" value={lastSummary.criticalCount} />
          </div>
        )}

        <div className="mb-6 rounded-lg p-4 bg-[#0B0C10]/70 border border-[#FFD700]/30">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-bold" style={{ color: themeColor }}>
              {rosterChar.name}
            </div>
            <div className="text-[11px] text-[#8a8d91]">
              {previousLevel} →{" "}
              <span className="text-[#FFD700] font-bold">
                {newLevel || rosterChar.level}
              </span>
              <span className="ml-2">+{xpAwarded} XP</span>
            </div>
          </div>
          <div className="h-2 rounded bg-[#1F2833] overflow-hidden mb-1">
            <motion.div
              key={`${previousXp}-${rosterChar.xp}`}
              className="h-full"
              style={{ background: themeColor }}
              initial={{
                width: `${Math.round(xpProgress(previousLevel, previousXp).ratio * 100)}%`,
              }}
              animate={{ width: `${Math.round(progress.ratio * 100)}%` }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#8a8d91]">
            <span>{evolutionLabel(rosterChar.evolutionStage)}</span>
            <span>
              {progress.current}/{progress.need} XP
            </span>
          </div>
          <div className="mt-1 flex justify-between gap-3 text-[10px] text-[#8a8d91]">
            <span>下次进化</span>
            <span className="text-[#FFD700]">
              {nextEvolution.nextStage
                ? nextEvolution.ready
                  ? `${evolutionLabel(nextEvolution.nextStage)}待触发`
                  : `Lv.${nextEvolution.targetLevel} · 还差 ${nextEvolution.xpRemaining} XP`
                : "最终形态"}
            </span>
          </div>

          {unlockEvent && (
            <div className="mt-2 text-[11px] text-[#FFD700] flex items-center gap-1">
              <Sparkles size={12} /> Lv.{newLevel} 解锁新技能槽
            </div>
          )}
          {evolveEvent && (
            <div className="mt-1 text-[11px] text-[#FFD700] flex items-center gap-1">
              <Sparkles size={12} /> 进化触发：{evolutionLabel(evolveEvent)}
            </div>
          )}
        </div>

        <AnimatePresence>
          {stage === "choose_skill" && skillCandidates && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5"
            >
              <div className="text-xs text-[#FFD700] tracking-widest mb-2">
                三选一 · 解锁新技能
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                {skillCandidates.map((c, i) => (
                  <motion.button
                    key={`${c.name}-${i}`}
                    whileHover={{ y: -3 }}
                    onClick={() => handlePickSkill(c)}
                    className="text-left p-3 rounded-lg bg-[#0B0C10]/70 border border-[#FFD700]/40 hover:border-[#FFD700] transition-all"
                  >
                    <div className="flex items-center gap-1 text-xs font-bold text-[#FFD700]">
                      {skillIcon(c.type)} {c.name}
                    </div>
                    <p className="text-[11px] text-[#C5C6C7] mt-1 leading-relaxed">
                      {c.description}
                    </p>
                    <div className="text-[10px] text-[#8a8d91] mt-2 flex gap-2 flex-wrap">
                      <span>类型 {c.type}</span>
                      {c.damageMultiplier ? (
                        <span>x{c.damageMultiplier.toFixed(1)}</span>
                      ) : null}
                      {c.healPercent ? (
                        <span>回血 {c.healPercent}%</span>
                      ) : null}
                      {c.buffPercent ? (
                        <span>buff {c.buffPercent}%</span>
                      ) : null}
                      {c.buffTurns ? <span>{c.buffTurns} 回合</span> : null}
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {pickedSkill && (
          <div className="mb-5 text-[11px] text-[#66FCF1]">
            已学会：{pickedSkill.name}
          </div>
        )}

        {stage === "evolving" && (
          <div className="flex items-center justify-center gap-2 text-[#FFD700] text-sm py-4">
            <Loader2 size={16} className="animate-spin" />{" "}
            进化中，形态与大招正在重塑...
          </div>
        )}

        {skillUnlockLoading && (
          <div className="flex items-center justify-center gap-2 text-[#66FCF1] text-xs py-3">
            <Loader2 size={14} className="animate-spin" /> 正在生成新技能候选...
          </div>
        )}

        <AnimatePresence>
          {stage === "evolution_done" && evolveData && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-5 overflow-hidden rounded-xl border-2 border-[#FFD700]/70 bg-[#0B0C10]/80"
              style={{
                boxShadow:
                  "0 0 28px rgba(255,215,0,0.35), inset 0 0 24px rgba(255,215,0,0.08)",
              }}
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#FFD700]/25 bg-[#FFD700]/10 px-4 py-3">
                <div>
                  <div className="text-[10px] text-[#FFD700] tracking-[0.35em] font-black">
                    FORM EVOLUTION
                  </div>
                  <div className="mt-1 text-2xl font-black font-display tracking-wider text-[#FFD700]">
                    {evolveEvent ? evolutionLabel(evolveEvent) : "进化完成"}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[#FFD700]">
                  <Sparkles size={16} />
                  <span className="text-xs font-black tracking-widest">
                    突破
                  </span>
                </div>
              </div>

              <div className="p-4">
                <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <EvolutionPortrait
                    label="进化前"
                    imageUrl={evolvingFromImage}
                    fallback={rosterChar.name}
                    muted
                  />
                  <div className="hidden md:flex h-full items-center justify-center text-[#FFD700]">
                    <ArrowRight size={28} />
                  </div>
                  <EvolutionPortrait
                    label="进化后"
                    imageUrl={evolvedImageUrl}
                    fallback={rosterChar.name}
                    featured
                    status={evolutionImageStatus}
                    stage={evolveEvent ?? undefined}
                    onRetry={handleRetryEvolutionImage}
                  />
                </div>

                <div className="mt-4 rounded-lg border border-[#FFD700]/25 bg-[#1F2833]/50 p-4">
                  <p className="text-sm leading-relaxed text-[#C5C6C7]">
                    {evolveData.lore
                      ? `“${evolveData.lore}”`
                      : `${rosterChar.name} 的形态完成突破，战斗潜能被重新释放。`}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <EvolutionStatChip
                      icon={<Heart size={13} />}
                      label="HP"
                      before={evolutionBeforeStats?.maxHp}
                      after={evolutionAfterStats?.maxHp}
                      color="#FF6B9D"
                    />
                    <EvolutionStatChip
                      icon={<ZapIcon size={13} />}
                      label="ATK"
                      before={evolutionBeforeStats?.attack}
                      after={evolutionAfterStats?.attack}
                      color="#FFD700"
                    />
                    <EvolutionStatChip
                      icon={<Shield size={13} />}
                      label="DEF"
                      before={evolutionBeforeStats?.defense}
                      after={evolutionAfterStats?.defense}
                      color="#66FCF1"
                    />
                    <EvolutionStatChip
                      icon={<Gauge size={13} />}
                      label="SPD"
                      before={evolutionBeforeStats?.speed}
                      after={evolutionAfterStats?.speed}
                      color="#7FFF9F"
                    />
                  </div>

                  {evolveData.newUltimate && (
                    <div className="mt-4 rounded-lg border border-[#FFD700]/35 bg-[#0B0C10]/65 p-3">
                      <div className="flex items-center gap-2 text-[#FFD700]">
                        <Flame size={14} />
                        <span className="text-xs font-black tracking-widest">
                          大招蜕变
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[140px_1fr] md:items-center">
                        <div className="aspect-video overflow-hidden rounded border border-[#FFD700]/30 bg-[#1F2833]">
                          {evolveData.newUltimate.imageUrl ? (
                            <img
                              src={evolveData.newUltimate.imageUrl}
                              alt={evolveData.newUltimate.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-4xl text-[#FFD700]">
                              ☄
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                            <div className="text-sm font-black font-display tracking-wide text-[#FFD700]">
                              {evolveData.newUltimate.name}
                            </div>
                            <div className="text-[11px] text-[#8a8d91]">
                              伤害倍率 x
                              {evolveData.newUltimate.damageMultiplier.toFixed(
                                1,
                              )}
                            </div>
                          </div>
                          {evolveData.newUltimate.description && (
                            <div className="mt-2 text-[11px] leading-relaxed text-[#C5C6C7]">
                              {evolveData.newUltimate.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <div className="mb-4 text-xs text-red-400">{error}</div>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleContinue}
            disabled={stage === "evolving" || stage === "choose_skill"}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded font-display tracking-[0.3em] font-black border-2 border-[#66FCF1] text-[#66FCF1] hover:bg-[#66FCF1] hover:text-[#0B0C10] disabled:opacity-50 transition-all"
          >
            <ArrowRight size={16} />
            返回塔层选择
          </button>
          <button
            type="button"
            onClick={() => {
              resetPending();
              setPhase("MODE_SELECT");
            }}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded font-display tracking-[0.3em] text-[#8a8d91] hover:text-[#FF003C] border border-[#45A29E]/40 hover:border-[#FF003C]/60 transition-all"
          >
            <RotateCcw size={14} /> 返回主菜单
          </button>
        </div>

        {isSkillUnlockLevel(newLevel || rosterChar.level) &&
          unlockEvent &&
          skillCandidates && (
            <div className="mt-4 text-[10px] text-[#8a8d91]">等待选择技能</div>
          )}
      </motion.div>

      <AnimatePresence>
        {showEvoAnim && evolveEvent && evolveData && (
          <EvolutionAnimation
            key={`evo-${evolutionAnimKey}-${evolveEvent}`}
            oldImageUrl={evolvingFromImage}
            newImageUrl={evolvedImageUrl}
            ultimate={evolveData?.newUltimate}
            ultimateImageUrl={evolveData?.newUltimate?.imageUrl}
            stage={evolveEvent}
            characterName={rosterChar.name}
            readyToReveal={evolutionReadyToReveal}
            onFinish={handleEvolutionAnimFinish}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

interface SummaryTileProps {
  label: string;
  value: number;
}

interface EvolutionPortraitProps {
  label: string;
  imageUrl?: string | null;
  fallback: string;
  muted?: boolean;
  featured?: boolean;
  status?: EvolutionImageStatus;
  stage?: ActiveEvolutionStage;
  onRetry?: () => void;
}

const EvolutionPortrait: React.FC<EvolutionPortraitProps> = ({
  label,
  imageUrl,
  fallback,
  muted,
  featured,
  status = imageUrl ? "ready" : "idle",
  stage,
  onRetry,
}) => {
  const theme = stage
    ? EVOLUTION_VISUAL_THEME[stage]
    : EVOLUTION_VISUAL_THEME[1];
  const isLoading = featured && status === "loading";
  const isFailed = featured && status === "failed";
  const isFallback = featured && status === "fallback";

  return (
    <div
      className="relative overflow-hidden rounded-lg border bg-[#0B0C10]/70 p-3"
      style={{
        borderColor: featured ? `${theme.primary}aa` : "rgba(69,162,158,0.35)",
        boxShadow: featured ? `0 0 20px rgba(${theme.rgb},0.35)` : "none",
        opacity: muted ? 0.72 : 1,
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-black tracking-widest text-[#8a8d91]">
          {label}
        </span>
        {featured && (
          <span
            className="text-[10px] font-black tracking-widest"
            style={{ color: theme.primary }}
          >
            {status === "ready"
              ? "NEW FORM"
              : status === "fallback"
                ? "FALLBACK"
                : status === "failed"
                  ? "WAITING"
                  : "GENERATING"}
          </span>
        )}
      </div>
      <div
        className="relative aspect-square overflow-hidden rounded border bg-[#1F2833]"
        style={{
          borderColor: featured ? `${theme.primary}66` : "rgba(255,215,0,0.25)",
        }}
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={label}
              className="h-full w-full object-cover"
            />
            {isFallback && onRetry && (
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-[#0B0C10]/95 via-[#0B0C10]/70 to-transparent px-2 py-2">
                <span className="text-[9px] font-black tracking-widest text-[#FFD700]">
                  本地兜底图
                </span>
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded border px-2 py-1 text-[9px] font-black tracking-widest transition-all hover:bg-[#FFD700] hover:text-[#0B0C10]"
                  style={{ borderColor: theme.primary, color: theme.primary }}
                >
                  重新生成
                </button>
              </div>
            )}
          </>
        ) : isLoading || isFailed ? (
          <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-4 text-center">
            <div
              className="absolute inset-0 opacity-45"
              style={{
                background: `radial-gradient(circle at center, rgba(${theme.rgb},0.34), rgba(11,12,16,0.94) 62%)`,
              }}
            />
            <motion.div
              className="absolute h-36 w-36 rounded-full border-2"
              style={{
                borderColor: `${theme.primary}aa`,
                boxShadow: `0 0 28px rgba(${theme.rgb},0.55), inset 0 0 22px rgba(${theme.rgb},0.24)`,
              }}
              animate={
                isLoading
                  ? { rotate: 360, scale: [0.92, 1.04, 0.92] }
                  : { scale: 1 }
              }
              transition={
                isLoading
                  ? {
                      rotate: { duration: 4, repeat: Infinity, ease: "linear" },
                      scale: { duration: 1.6, repeat: Infinity },
                    }
                  : undefined
              }
            />
            <div
              className="relative z-10 text-[10px] font-black tracking-[0.35em]"
              style={{ color: theme.primary }}
            >
              {theme.label}
            </div>
            <div className="relative z-10 mt-3 text-lg font-black font-display text-[#C5C6C7]">
              {isLoading ? "形态生成中" : "生成未完成"}
            </div>
            <div className="relative z-10 mt-2 max-w-[180px] text-[10px] leading-relaxed text-[#8a8d91]">
              {isLoading
                ? "正在等待真实进化图返回"
                : "不会使用占位图替代真实形态"}
            </div>
            {isFailed && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="relative z-10 mt-4 rounded border px-3 py-1.5 text-[10px] font-black tracking-widest transition-all hover:bg-[#FFD700] hover:text-[#0B0C10]"
                style={{ borderColor: theme.primary, color: theme.primary }}
              >
                重新生成
              </button>
            )}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl font-black font-display text-[#FFD700]">
            {fallback[0] || "?"}
          </div>
        )}
      </div>
    </div>
  );
};

interface EvolutionStatChipProps {
  icon: React.ReactNode;
  label: string;
  before?: number;
  after?: number;
  color: string;
}

const EvolutionStatChip: React.FC<EvolutionStatChipProps> = ({
  icon,
  label,
  before,
  after,
  color,
}) => {
  const hasValues = typeof before === "number" && typeof after === "number";
  const delta = hasValues ? after - before : 0;

  return (
    <div className="rounded border border-[#45A29E]/25 bg-[#0B0C10]/65 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] tracking-widest text-[#8a8d91]">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-sm font-black font-display" style={{ color }}>
          {hasValues ? after : "--"}
        </span>
        {hasValues && delta > 0 && (
          <span className="text-[10px] font-black text-[#7FFF9F]">
            +{delta}
          </span>
        )}
      </div>
      {hasValues && (
        <div className="mt-1 text-[10px] text-[#8a8d91]">
          {before} → {after}
        </div>
      )}
    </div>
  );
};

const SummaryTile: React.FC<SummaryTileProps> = ({ label, value }) => (
  <div className="p-3 rounded-lg bg-[#0B0C10]/70 border border-[#45A29E]/30">
    <div className="text-[10px] text-[#8a8d91] tracking-widest">{label}</div>
    <div className="text-lg font-black text-[#C5C6C7]">{value}</div>
  </div>
);
