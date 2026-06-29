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
  MessageCircle,
  RotateCcw,
  Castle,
  Zap as ZapIcon,
  ShieldPlus,
  HeartPulse,
  Wand2,
} from "lucide-react";
import { useGameStore, type Skill } from "../store/useGameStore";
import {
  useRosterStore,
  resetCharacterRuntimeState,
  type ActiveEvolutionStage,
  type RosterCharacter,
  type TowerRunRecord,
} from "../store/useRosterStore";
import { useTowerStore } from "../store/useTowerStore";
import { useSpiritChatStore } from "../store/useSpiritChatStore";
import { ParticleField } from "./ParticleField";
import { getScaledTowerBoss, getTowerBossMeta } from "../data/towerBosses";
import {
  applyEvolutionStatBonus,
  applyXp,
  buildLocalEvolution,
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
import { BackButton } from "./BackButton";
import {
  clearEvolutionPrefetchForRoster,
  startEvolutionAssetPrefetch,
} from "../utils/evolutionPrefetch";

type Stage = "idle" | "choose_skill" | "finished";

const mergeEvolvedUltimate = (skill: Skill, evolved?: Skill): Skill => ({
  ...skill,
  ...(evolved ?? {}),
  type: "ultimate",
  isUltimate: true,
  ultimateType: skill.ultimateType,
  imageUrl: skill.imageUrl,
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
  const towerAutoMode = useGameStore((s) => s.towerAutoMode);
  const setPhase = useGameStore((s) => s.setPhase);
  const setBattleMode = useGameStore((s) => s.setBattleMode);
  const setTowerLayer = useGameStore((s) => s.setTowerLayer);
  const setPlayer1 = useGameStore((s) => s.setPlayer1);
  const setPlayer2 = useGameStore((s) => s.setPlayer2);
  const setTowerRosterId = useGameStore((s) => s.setTowerRosterId);
  const cfg = {
    apiKey,
    baseUrl,
    model,
    apiMode,
  };

  const lastSummary = useTowerStore((s) => s.lastSummary);
  const debugForcedEvolutionStage = useTowerStore(
    (s) => s.debugForcedEvolutionStage,
  );
  const setLastSummary = useTowerStore((s) => s.setLastSummary);
  const setLastRosterId = useTowerStore((s) => s.setLastRosterId);
  const setLastResult = useTowerStore((s) => s.setLastResult);
  const setDebugForcedEvolutionStage = useTowerStore(
    (s) => s.setDebugForcedEvolutionStage,
  );
  const resetPending = useTowerStore((s) => s.resetPending);

  const roster = useRosterStore((s) => s.roster);
  const updateCharacter = useRosterStore((s) => s.updateCharacter);
  const appendTowerRun = useRosterStore((s) => s.appendTowerRun);
  const appendSkill = useRosterStore((s) => s.appendSkill);
  const setOpenSpiritRosterId = useSpiritChatStore((s) => s.setOpenRosterId);
  const spiritChats = useSpiritChatStore((s) => s.chats);

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
    if (debugForcedEvolutionStage) {
      const evolvedStats = applyEvolutionStatBonus(char);
      const evolvedCharacter: RosterCharacter = {
        ...char,
        ...evolvedStats,
        evolutionStage: debugForcedEvolutionStage,
      };
      setXpAwarded(0);
      setNewLevel(char.level);
      setUnlockEvent(false);
      setEvolveEvent(debugForcedEvolutionStage);
      setEvolveLevel(char.level);
      updateCharacter(char.rosterId, () => evolvedCharacter);
      await runEvolution(
        evolvedCharacter,
        summary,
        debugForcedEvolutionStage,
        char.level,
      );
      setDebugForcedEvolutionStage(null);
      return;
    }

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
        {
          layer: towerLayer,
          level: char.level,
          relationship: spiritChats[char.rosterId]
            ? {
                mood: spiritChats[char.rosterId].mood,
                bond: spiritChats[char.rosterId].bond,
                memorySummary: spiritChats[char.rosterId].memorySummary,
                playerFacts: spiritChats[char.rosterId].playerFacts,
                promises: spiritChats[char.rosterId].promises,
                lastSuggestedAction:
                  spiritChats[char.rosterId].lastSuggestedAction,
              }
            : undefined,
        },
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

  const handlePickSkill = useCallback(
    async (candidate: SkillCandidate) => {
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
    },
    [rosterChar, evolveEvent, evolveLevel, lastSummary, appendSkill],
  );

  const runEvolution = async (
    char: RosterCharacter,
    summary: BattleSummary,
    stageNum: ActiveEvolutionStage,
    triggerLevel: number,
  ) => {
    void summary;
    setError(null);
    const localEvo = buildLocalEvolution(char, stageNum);
    setEvolveData(localEvo);
    evolutionHandledRef.current = true;
    updateCharacter(char.rosterId, (current) => ({
      ...current,
      evolutionLock: { stage: stageNum, startedAt: Date.now() },
    }));

    const prefetchTask = startEvolutionAssetPrefetch(
      {
        rosterId: char.rosterId,
        characterName: char.name,
        stage: stageNum,
        level: triggerLevel,
        layer: towerLayer,
      },
      async () => localEvo,
      cfg,
    );

    void prefetchTask
      .then((prepared) => {
        if (!prepared?.avatarUrl) return;
        const evo = prepared.evo ?? localEvo;
        const ultimateImage =
          prepared.ultimateImageUrl || evo.newUltimate?.imageUrl || null;
        const evoWithImage: EvolveResult = {
          ...evo,
          newUltimate:
            evo.newUltimate && ultimateImage
              ? { ...evo.newUltimate, imageUrl: ultimateImage }
              : evo.newUltimate,
        };
        setEvolveData(evoWithImage);

        const newImage = prepared.avatarUrl;
        const entry = {
          stage: stageNum,
          imagePrompt: evoWithImage.imagePrompt,
          imageUrl: newImage,
          lore: evoWithImage.lore,
          createdAt: Date.now(),
          imageStatus: "ready",
        } as const;

        updateCharacter(char.rosterId, (current) => ({
          ...current,
          imageUrl: newImage,
          imagePrompt: evoWithImage.imagePrompt || current.imagePrompt,
          evolutionLock: undefined,
          pendingEvolutionReplay: {
            stage: stageNum,
            oldImageUrl: char.imageUrl,
            newImageUrl: newImage,
            imagePrompt: evoWithImage.imagePrompt,
            lore: evoWithImage.lore,
            newUltimate: evoWithImage.newUltimate,
            createdAt: Date.now(),
          },
          formHistory: [...current.formHistory, entry],
          skills: evoWithImage.newUltimate
            ? current.skills.map((s) =>
                s.isUltimate || s.type === "ultimate"
                  ? mergeEvolvedUltimate(s, evoWithImage.newUltimate)
                  : s,
              )
            : current.skills,
        }));
        clearEvolutionPrefetchForRoster(char.rosterId);
      })
      .catch((err) => {
        console.warn("background evolution failed", err);
      });

    setStage("finished");
  };

  const handleContinue = () => {
    resetPending();
    setPhase("TOWER_HUB");
  };

  const handleAutoNext = useCallback(() => {
    if (!rosterChar) {
      resetPending();
      setPhase("TOWER_HUB");
      return;
    }
    const latestRosterChar =
      useRosterStore
        .getState()
        .roster.find((char) => char.rosterId === rosterChar.rosterId) ??
      rosterChar;
    if (
      latestRosterChar.evolutionLock ||
      latestRosterChar.pendingEvolutionReplay
    ) {
      resetPending();
      setPhase("TOWER_HUB");
      return;
    }
    const nextLayer = towerLayer + 1;
    const boss = getScaledTowerBoss(nextLayer, latestRosterChar);
    if (!boss) {
      resetPending();
      setPhase("TOWER_HUB");
      return;
    }
    setBattleMode("pve_tower");
    setTowerLayer(nextLayer);
    setTowerRosterId(latestRosterChar.rosterId);
    setPlayer1(resetCharacterRuntimeState(latestRosterChar));
    setPlayer2(resetCharacterRuntimeState(boss));
    setLastSummary(null);
    setLastRosterId(latestRosterChar.rosterId);
    setLastResult(null);
    resetPending();
    useGameStore.setState({ battleLogs: [], currentTurn: 0, winner: null });
    setPhase("BATTLE_ARENA");
  }, [
    rosterChar,
    towerLayer,
    setBattleMode,
    setTowerLayer,
    setTowerRosterId,
    setPlayer1,
    setPlayer2,
    setLastSummary,
    setLastRosterId,
    setLastResult,
    resetPending,
    setPhase,
  ]);

  // 自动模式：自动选择技能
  useEffect(() => {
    if (!towerAutoMode || stage !== "choose_skill" || !skillCandidates?.length)
      return;
    const timer = setTimeout(() => {
      handlePickSkill(skillCandidates[0]);
    }, 800);
    return () => clearTimeout(timer);
  }, [stage, towerAutoMode, skillCandidates, handlePickSkill]);

  // 自动模式：结算后自动继续
  useEffect(() => {
    if (!towerAutoMode || stage !== "finished") return;
    const timer = setTimeout(() => {
      if (result === "win") {
        handleAutoNext();
      } else {
        resetPending();
        setPhase("TOWER_HUB");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [stage, towerAutoMode, result, handleAutoNext, resetPending, setPhase]);

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

        {skillUnlockLoading && (
          <div className="flex items-center justify-center gap-2 text-[#66FCF1] text-xs py-3">
            <Loader2 size={14} className="animate-spin" /> 正在生成新技能候选...
          </div>
        )}

        {evolveEvent && evolveData && (
          <div className="mb-5 rounded-lg border border-[#FFD700]/35 bg-[#0B0C10]/70 p-3 text-[11px] leading-relaxed text-[#C5C6C7]">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-black tracking-[0.26em] text-[#FFD700]">
              <Sparkles size={12} />
              进化后台任务
            </div>
            {rosterChar.name} 已触发{evolutionLabel(evolveEvent)}
            ，形态图正在后台生成。资源就绪后角色会自动解锁，并在下一次出战前补播进化动画。
          </div>
        )}

        {error && <div className="mb-4 text-xs text-red-400">{error}</div>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleContinue}
            disabled={stage === "choose_skill"}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded font-display tracking-[0.3em] font-black border-2 border-[#66FCF1] text-[#66FCF1] hover:bg-[#66FCF1] hover:text-[#0B0C10] disabled:opacity-50 transition-all"
          >
            <ArrowRight size={16} />
            返回塔层选择
          </button>
          <button
            type="button"
            onClick={() => {
              setOpenSpiritRosterId(rosterChar.rosterId);
              setPhase("SPIRIT_CHAT");
            }}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded font-display tracking-[0.24em] text-[#FFD700] hover:text-[#0B0C10] border-2 border-[#FFD700] hover:bg-[#FFD700] transition-all"
          >
            <MessageCircle size={14} /> 聊聊这一战
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
    </div>
  );
};

interface SummaryTileProps {
  label: string;
  value: number;
}

const SummaryTile: React.FC<SummaryTileProps> = ({ label, value }) => (
  <div className="p-3 rounded-lg bg-[#0B0C10]/70 border border-[#45A29E]/30">
    <div className="text-[10px] text-[#8a8d91] tracking-widest">{label}</div>
    <div className="text-lg font-black text-[#C5C6C7]">{value}</div>
  </div>
);
