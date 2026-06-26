import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
} from 'lucide-react';
import { useGameStore, type Skill } from '../store/useGameStore';
import { useRosterStore, type RosterCharacter, type TowerRunRecord } from '../store/useRosterStore';
import { useTowerStore } from '../store/useTowerStore';
import { ParticleField } from './ParticleField';
import { getTowerBossMeta } from '../data/towerBosses';
import {
  applyXp,
  evolutionLabel,
  isSkillUnlockLevel,
  remainingSkillSlots,
  xpForLayer,
  xpProgress,
} from '../utils/towerProgress';
import {
  type AnalysisResult,
  type BattleSummary,
  type SkillCandidate,
  type SkillResult,
  type EvolveResult,
  requestAnalysis,
  requestSkillCandidates,
  requestEvolve,
} from '../utils/towerAnalysis';
import { generateCharacterImage, generateEvolutionImage } from '../utils/ai';
import { cacheImageUrlAsDataUrl } from '../utils/localImage';
import { EvolutionAnimation } from './EvolutionAnimation';

type Stage = 'idle' | 'analyzing' | 'analysis_done' | 'choose_skill' | 'evolving' | 'evolution_done' | 'finished';

const skillIcon = (type: string) => {
  switch (type) {
    case 'heal':
      return <HeartPulse size={14} className="text-pink-400" />;
    case 'buff':
      return <ShieldPlus size={14} className="text-emerald-400" />;
    case 'debuff':
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
  const updateAnalysis = useRosterStore((s) => s.updateAnalysis);
  const appendFormHistory = useRosterStore((s) => s.appendFormHistory);
  const appendSkill = useRosterStore((s) => s.appendSkill);

  const rosterChar = useMemo(
    () => roster.find((c) => c.rosterId === towerRosterId) || null,
    [roster, towerRosterId],
  );

  const result: 'win' | 'loss' = winner === 'player1' ? 'win' : 'loss';
  const meta = getTowerBossMeta(towerLayer);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [skillCandidates, setSkillCandidates] = useState<SkillCandidate[] | null>(null);
  const [pickedSkill, setPickedSkill] = useState<Skill | null>(null);
  const [evolveData, setEvolveData] = useState<EvolveResult | null>(null);
  const [evolvedImageUrl, setEvolvedImageUrl] = useState<string | null>(null);
  const [evolvingFromImage, setEvolvingFromImage] = useState<string | undefined>(undefined);
  const [showEvoAnim, setShowEvoAnim] = useState(false);

  // 角色升级/进化事件（每次本地计算）
  const [xpAwarded, setXpAwarded] = useState(0);
  const [previousLevel, setPreviousLevel] = useState(0);
  const [previousXp, setPreviousXp] = useState(0);
  const [newLevel, setNewLevel] = useState(0);
  const [unlockEvent, setUnlockEvent] = useState(false);
  const [evolveEvent, setEvolveEvent] = useState<1 | 2 | 3 | null>(null);

  /**
   * Pipeline：写入 XP -> 写入 run -> 跑 analysis -> 弹技能/进化 -> 完成
   */
  useEffect(() => {
    if (!rosterChar || !player1 || !player2 || !lastSummary || stage !== 'idle') return;
    void runGrowthPipeline(rosterChar, lastSummary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterChar, lastSummary]);

  const runGrowthPipeline = async (char: RosterCharacter, summary: BattleSummary) => {
    setStage('analyzing');
    setError(null);

    const hpRatio = char.maxHp > 0 ? Math.max(0, summary.damageTaken < char.maxHp ? 1 - summary.damageTaken / char.maxHp : 0) : 0;
    const xpDelta = xpForLayer(towerLayer, result, hpRatio);
    setXpAwarded(xpDelta);
    setPreviousLevel(char.level);
    setPreviousXp(char.xp);

    // 1) 本地：应用 XP / 多级升级 / 进化标记
    const xpResult = applyXp(char, xpDelta);
    setNewLevel(xpResult.character.level);
    setUnlockEvent(xpResult.triggeredSkillUnlock);
    setEvolveEvent(xpResult.triggeredEvolution);

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

    // 4) AI 战斗复盘
    try {
      const analysisRes = await requestAnalysis(
        { apiKey, baseUrl, model, apiMode },
        xpResult.character,
        summary,
        { layer: towerLayer, result, bossName: player2?.name },
      );
      setAnalysis(analysisRes);
      updateAnalysis(char.rosterId, {
        strengths: analysisRes.strengths,
        weaknesses: analysisRes.weaknesses,
        suggestedTrait: analysisRes.suggestedTrait,
      });
    } catch (err) {
      console.warn('analysis failed', err);
      setError((err as Error).message);
    }

    setStage('analysis_done');

    // 5) 技能解锁三选一
    if (xpResult.triggeredSkillUnlock && remainingSkillSlots(xpResult.character) > 0) {
      try {
        const skillRes: SkillResult = await requestSkillCandidates(
          { apiKey, baseUrl, model, apiMode },
          xpResult.character,
          summary,
          { layer: towerLayer, level: xpResult.character.level },
        );
        if (skillRes.candidates.length > 0) {
          setSkillCandidates(skillRes.candidates);
          setStage('choose_skill');
          return;
        }
      } catch (err) {
        console.warn('skill request failed', err);
      }
    }

    // 6) 进化
    if (xpResult.triggeredEvolution) {
      await runEvolution(xpResult.character, summary, xpResult.triggeredEvolution);
      return;
    }

    setStage('finished');
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

    // 进化 stage 兜底（同一场战斗可能升到 10 同时解锁技能）
    if (evolveEvent) {
      const refreshed = useRosterStore.getState().roster.find((c) => c.rosterId === rosterChar.rosterId);
      if (refreshed && lastSummary) {
        await runEvolution(refreshed, lastSummary, evolveEvent);
        return;
      }
    }
    setStage('finished');
  };

  const runEvolution = async (char: RosterCharacter, summary: BattleSummary, stageNum: 1 | 2 | 3) => {
    setStage('evolving');
    setEvolvingFromImage(char.imageUrl);
    setEvolvedImageUrl(null);
    setShowEvoAnim(true);
    try {
      const evo = await requestEvolve(
        { apiKey, baseUrl, model, apiMode },
        char,
        summary,
        { layer: towerLayer, level: char.level, evolutionStage: stageNum },
      );
      setEvolveData(evo);

      let newImage = char.imageUrl;
      try {
        if (evo.imagePrompt) {
          const remote = await generateEvolutionImage(evo.imagePrompt, {
            seedSalt: `${char.rosterId}:${stageNum}`,
          });
          if (remote) {
            // 把成功 probe 过的远程图缓存为 dataURL，避免后续 <img> 再去请求 pollinations 失败
            const cached = await cacheImageUrlAsDataUrl(remote);
            newImage = cached || remote;
          } else {
            // 远程多次失败：旧 generator 兜底再试一次，最差保留旧头像
            const fallback = await generateCharacterImage(
              { apiKey, baseUrl, model, apiMode },
              evo.imagePrompt,
              1,
            );
            if (fallback) {
              const cached = await cacheImageUrlAsDataUrl(fallback);
              newImage = cached || fallback || char.imageUrl;
            }
          }
        }
      } catch (err) {
        console.warn('evolve image failed', err);
      }
      setEvolvedImageUrl(newImage || null);

      const entry = {
        stage: stageNum,
        imagePrompt: evo.imagePrompt,
        imageUrl: newImage,
        lore: evo.lore,
        createdAt: Date.now(),
      } as const;
      appendFormHistory(char.rosterId, entry);

      updateCharacter(char.rosterId, (current) => ({
        ...current,
        imageUrl: newImage,
        imagePrompt: evo.imagePrompt || current.imagePrompt,
        skills: evo.newUltimate
          ? current.skills.map((s) =>
              s.isUltimate || s.type === 'ultimate'
                ? { ...s, ...evo.newUltimate, ultimateType: evo.newUltimate?.ultimateType ?? s.ultimateType }
                : s,
            )
          : current.skills,
      }));

      setStage('evolution_done');
    } catch (err) {
      console.warn('evolve request failed', err);
      setError((err as Error).message);
      setStage('finished');
    }
  };

  const handleContinue = () => {
    resetPending();
    setPhase('TOWER_HUB');
  };

  if (!rosterChar || !player1 || !player2 || !meta) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#FFD700] font-display tracking-widest">
        CALCULATING RESULT...
      </div>
    );
  }

  const themeColor = result === 'win' ? '#FFD700' : '#FF003C';
  const themeRgb = result === 'win' ? '255, 215, 0' : '255, 0, 60';
  const Icon = result === 'win' ? Trophy : Skull;

  const progress = xpProgress(newLevel || rosterChar.level, rosterChar.xp);

  return (
    <div className="min-h-screen flex flex-col items-center p-6 relative overflow-hidden grid-bg">
      <ParticleField count={36} colors={[themeColor, '#66FCF1']} />

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
          <h1 className="text-3xl font-black font-display tracking-widest" style={{ color: themeColor }}>
            {result === 'win' ? '挑战成功' : '挑战失败'}
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
              {previousLevel} → <span className="text-[#FFD700] font-bold">{newLevel || rosterChar.level}</span>
              <span className="ml-2">+{xpAwarded} XP</span>
            </div>
          </div>
          <div className="h-2 rounded bg-[#1F2833] overflow-hidden mb-1">
            <motion.div
              key={`${previousXp}-${rosterChar.xp}`}
              className="h-full"
              style={{ background: themeColor }}
              initial={{ width: `${Math.round(xpProgress(previousLevel, previousXp).ratio * 100)}%` }}
              animate={{ width: `${Math.round(progress.ratio * 100)}%` }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#8a8d91]">
            <span>{evolutionLabel(rosterChar.evolutionStage)}</span>
            <span>
              {progress.need ? `${progress.current}/${progress.need} XP` : 'MAX LEVEL'}
            </span>
          </div>

          {unlockEvent && (
            <div className="mt-2 text-[11px] text-[#FFD700] flex items-center gap-1">
              <Sparkles size={12} /> Lv.{newLevel} 解锁新技能槽
            </div>
          )}
          {evolveEvent && (
            <div className="mt-1 text-[11px] text-[#FFD700] flex items-center gap-1">
              <Sparkles size={12} /> 进化触发：{evolutionLabel(evolveEvent as 1 | 2 | 3)}
            </div>
          )}
        </div>

        <AnimatePresence>
          {analysis && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 p-4 rounded-lg bg-[#0B0C10]/70 border border-[#66FCF1]/30"
            >
              <div className="text-xs text-[#66FCF1] tracking-widest mb-2">AI 战后复盘</div>
              {analysis.oneLine && (
                <div className="text-sm text-[#C5C6C7] italic mb-3">“{analysis.oneLine}”</div>
              )}
              <div className="grid md:grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="text-emerald-400 mb-1">优势</div>
                  <ul className="list-disc list-inside text-[#C5C6C7] space-y-1">
                    {analysis.strengths.map((s, i) => (
                      <li key={`s-${i}`}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-pink-400 mb-1">短板</div>
                  <ul className="list-disc list-inside text-[#C5C6C7] space-y-1">
                    {analysis.weaknesses.map((s, i) => (
                      <li key={`w-${i}`}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {analysis.suggestedTrait && (
                <div className="mt-3 text-[11px] text-[#FFD700]">
                  ▸ 建议方向：{analysis.suggestedTrait}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {stage === 'analyzing' && (
          <div className="flex items-center justify-center gap-2 text-[#66FCF1] text-sm py-4">
            <Loader2 size={16} className="animate-spin" /> AI 正在复盘战斗...
          </div>
        )}

        <AnimatePresence>
          {stage === 'choose_skill' && skillCandidates && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5"
            >
              <div className="text-xs text-[#FFD700] tracking-widest mb-2">三选一 · 解锁新技能</div>
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
                    <p className="text-[11px] text-[#C5C6C7] mt-1 leading-relaxed">{c.description}</p>
                    <div className="text-[10px] text-[#8a8d91] mt-2 flex gap-2 flex-wrap">
                      <span>类型 {c.type}</span>
                      {c.damageMultiplier ? <span>x{c.damageMultiplier.toFixed(1)}</span> : null}
                      {c.healPercent ? <span>回血 {c.healPercent}%</span> : null}
                      {c.buffPercent ? <span>buff {c.buffPercent}%</span> : null}
                      {c.buffTurns ? <span>{c.buffTurns} 回合</span> : null}
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {pickedSkill && (
          <div className="mb-5 text-[11px] text-[#66FCF1]">已学会：{pickedSkill.name}</div>
        )}

        {stage === 'evolving' && (
          <div className="flex items-center justify-center gap-2 text-[#FFD700] text-sm py-4">
            <Loader2 size={16} className="animate-spin" /> 进化中，AI 正在重塑形态...
          </div>
        )}

        <AnimatePresence>
          {stage === 'evolution_done' && evolveData && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-5 p-4 rounded-lg border-2 border-[#FFD700]/60 bg-gradient-to-br from-[#FFD700]/10 to-transparent"
            >
              <div className="text-xs text-[#FFD700] tracking-widest mb-2 flex items-center gap-1">
                <Sparkles size={12} /> 进化完成
              </div>
              <div className="flex flex-col md:flex-row gap-4 items-center">
                {evolvedImageUrl ? (
                  <img
                    src={evolvedImageUrl}
                    alt="evolved"
                    className="w-32 h-32 rounded-lg object-cover border border-[#FFD700]/50"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-lg flex items-center justify-center border border-[#FFD700]/30 text-[#FFD700]">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                )}
                <div className="flex-1 text-sm text-[#C5C6C7]">
                  <p className="leading-relaxed italic">“{evolveData.lore}”</p>
                  {evolveData.newUltimate && (
                    <div className="mt-3 text-[11px] text-[#FFD700]">
                      ★ 新大招：{evolveData.newUltimate.name}（×{evolveData.newUltimate.damageMultiplier.toFixed(1)}）
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="mb-4 text-xs text-red-400">{error}</div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleContinue}
            disabled={stage === 'analyzing' || stage === 'evolving' || stage === 'choose_skill'}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded font-display tracking-[0.3em] font-black border-2 border-[#66FCF1] text-[#66FCF1] hover:bg-[#66FCF1] hover:text-[#0B0C10] disabled:opacity-50 transition-all"
          >
            <ArrowRight size={16} />
            返回塔层选择
          </button>
          <button
            type="button"
            onClick={() => {
              resetPending();
              setPhase('MODE_SELECT');
            }}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded font-display tracking-[0.3em] text-[#8a8d91] hover:text-[#FF003C] border border-[#45A29E]/40 hover:border-[#FF003C]/60 transition-all"
          >
            <RotateCcw size={14} /> 返回主菜单
          </button>
        </div>

        <div className="mt-4 text-[10px] text-[#8a8d91]">
          状态：{stage}
          {isSkillUnlockLevel(newLevel || rosterChar.level) && unlockEvent && skillCandidates ? ' · 等待选择技能' : ''}
        </div>
      </motion.div>

      <AnimatePresence>
        {showEvoAnim && evolveEvent && (
          <EvolutionAnimation
            key={`evo-${evolveEvent}`}
            oldImageUrl={evolvingFromImage}
            newImageUrl={evolvedImageUrl}
            stage={evolveEvent}
            characterName={rosterChar.name}
            onFinish={() => setShowEvoAnim(false)}
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

const SummaryTile: React.FC<SummaryTileProps> = ({ label, value }) => (
  <div className="p-3 rounded-lg bg-[#0B0C10]/70 border border-[#45A29E]/30">
    <div className="text-[10px] text-[#8a8d91] tracking-widest">{label}</div>
    <div className="text-lg font-black text-[#C5C6C7]">{value}</div>
  </div>
);
