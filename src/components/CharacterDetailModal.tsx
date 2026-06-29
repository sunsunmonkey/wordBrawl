import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Zap, Shield, Gauge, Trash2, Sparkles, Flame, Swords, MessageCircle, BookOpen, Brain, type LucideIcon } from 'lucide-react';
import type { Skill, SpiritProfile } from '../store/useGameStore';
import { ULTIMATE_TYPES } from '../data/ultimateTypes';
import type { EvolutionStage, FormHistoryEntry, TowerRunRecord } from '../store/useRosterStore';
import { evolutionLabel, evolutionStars, getNextEvolutionProgress, levelAscensionLabel, xpProgress } from '../utils/towerProgress';

export interface DisplayCharacter {
  name: string;
  imageUrl?: string;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  skills: Skill[];
  sourceDescription?: string;
  spiritProfile?: SpiritProfile;
  recruitedAt?: number;
  rosterId?: string;
  level?: number;
  xp?: number;
  evolutionStage?: EvolutionStage;
  formHistory?: FormHistoryEntry[];
  tower?: { highestCleared: number; highestEndlessLayer?: number; nextLayer: number; runs: TowerRunRecord[] };
}

const skillTypeMeta: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  attack: { label: '攻击', color: '#FF6B6B', icon: Swords },
  heal: { label: '治疗', color: '#66FCF1', icon: Heart },
  buff: { label: '增益', color: '#FFD700', icon: Sparkles },
  debuff: { label: '减益', color: '#FF003C', icon: Flame },
  ultimate: { label: '大招', color: '#FFD700', icon: Flame },
};

const formatRecruitedAt = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const StatRow: React.FC<{ icon: React.ReactNode; label: string; value: number | string; color: string }> = ({
  icon,
  label,
  value,
  color,
}) => (
  <div className="flex items-center justify-between bg-[#0B0C10]/60 px-3 py-2 rounded border border-[#45A29E]/20">
    <div className="flex items-center gap-2 text-xs text-[#8a8d91]">
      <span style={{ color }}>{icon}</span>
      {label}
    </div>
    <div className="text-sm font-bold font-display" style={{ color }}>{value}</div>
  </div>
);

interface CharacterDetailModalProps {
  character: DisplayCharacter;
  onClose: () => void;
  onRemove?: () => void;
  onChat?: () => void;
  themeColor?: string;
}

export const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  character,
  onClose,
  onRemove,
  onChat,
  themeColor = '#66FCF1',
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const hasGrowth = typeof character.level === 'number';
  const [activeTab, setActiveTab] = useState<'profile' | 'growth'>('profile');
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
  const towerRuns: TowerRunRecord[] = (character.tower?.runs ?? []).slice().reverse().slice(0, 5);
  const formHistory: FormHistoryEntry[] = character.formHistory ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#0B0C10]/90 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 10, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#1F2833]/95 border-2 rounded-xl p-6 corner-frame"
        style={{ borderColor: themeColor, boxShadow: `0 0 40px ${themeColor}55` }}
      >
        <div className="flex items-start gap-5 mb-6">
          <div
            className="w-32 h-32 md:w-40 md:h-40 rounded-lg overflow-hidden border-2 flex-shrink-0 bg-[#0B0C10]"
            style={{ borderColor: themeColor, boxShadow: `0 0 20px ${themeColor}66` }}
          >
            {character.imageUrl && !imgFailed ? (
              <img
                src={character.imageUrl}
                alt={character.name}
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl font-black font-display" style={{ color: themeColor }}>
                {character.name?.[0] || '?'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-3xl font-black font-display tracking-wider mb-1" style={{ color: themeColor, textShadow: `0 0 12px ${themeColor}` }}>
              {character.name}
            </h2>
            {character.recruitedAt && (
              <div className="text-[10px] text-[#8a8d91] tracking-widest mb-3">
                收入时间 · {formatRecruitedAt(character.recruitedAt)}
              </div>
            )}
            {character.sourceDescription && (
              <div className="text-xs text-[#C5C6C7] bg-[#0B0C10]/70 border border-[#45A29E]/30 rounded p-2 leading-relaxed">
                <span style={{ color: themeColor }}>▸</span> {character.sourceDescription}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8a8d91] hover:text-[#66FCF1] text-xl px-2"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {hasGrowth && (
          <div className="flex gap-2 mb-4 border-b" style={{ borderColor: `${themeColor}33` }}>
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className="px-3 py-2 text-[11px] tracking-widest font-display transition-all"
              style={{
                color: activeTab === 'profile' ? themeColor : '#8a8d91',
                borderBottom: activeTab === 'profile' ? `2px solid ${themeColor}` : '2px solid transparent',
              }}
            >
              ▸ 角色档案
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('growth')}
              className="px-3 py-2 text-[11px] tracking-widest font-display transition-all"
              style={{
                color: activeTab === 'growth' ? themeColor : '#8a8d91',
                borderBottom: activeTab === 'growth' ? `2px solid ${themeColor}` : '2px solid transparent',
              }}
            >
              ▸ 成长档案
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {(!hasGrowth || activeTab === 'profile') && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
                <StatRow icon={<Heart size={14} />} label="生命" value={character.maxHp} color="#FF6B9D" />
                <StatRow icon={<Zap size={14} />} label="攻击" value={character.attack} color="#FFD700" />
                <StatRow icon={<Shield size={14} />} label="防御" value={character.defense} color="#66FCF1" />
                <StatRow icon={<Gauge size={14} />} label="速度" value={character.speed} color="#7FFF9F" />
              </div>

              {spirit && (
                <div className="mb-6 rounded border bg-[#0B0C10]/60 p-4" style={{ borderColor: `${themeColor}44` }}>
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider" style={{ color: themeColor }}>
                    <Brain size={14} />
                    ▸ 词灵档案 · SPIRIT CARD
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded border border-[#45A29E]/20 bg-[#1F2833]/45 p-3">
                      <div className="text-[10px] tracking-widest text-[#8a8d91]">原型</div>
                      <div className="mt-1 text-sm font-bold text-[#C5C6C7]">{spirit.archetype}</div>
                      <div className="mt-2 text-[11px] leading-relaxed text-[#C5C6C7]">
                        {spirit.temperament}
                      </div>
                    </div>
                    <div className="rounded border border-[#45A29E]/20 bg-[#1F2833]/45 p-3">
                      <div className="flex items-center gap-1 text-[10px] tracking-widest text-[#8a8d91]">
                        <MessageCircle size={11} />
                        语气
                      </div>
                      <div className="mt-1 text-[11px] leading-relaxed text-[#C5C6C7]">
                        {spirit.speechStyle}
                      </div>
                      {spirit.battleCry && (
                        <div className="mt-2 text-xs font-bold" style={{ color: themeColor }}>
                          “{spirit.battleCry}”
                        </div>
                      )}
                    </div>
                  </div>
                  {catchphrases.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {catchphrases.map((line, idx) => (
                        <span
                          key={idx}
                          className="rounded border px-2 py-1 text-[10px] leading-none text-[#C5C6C7]"
                          style={{ borderColor: `${themeColor}55`, background: `${themeColor}11` }}
                        >
                          “{line}”
                        </span>
                      ))}
                    </div>
                  )}
                  {(worldAnchors.length > 0 || memorySeeds.length > 0) && (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {worldAnchors.length > 0 && (
                        <div>
                          <div className="mb-1 flex items-center gap-1 text-[10px] tracking-widest text-[#8a8d91]">
                            <BookOpen size={11} />
                            世界锚点
                          </div>
                          <div className="space-y-1">
                            {worldAnchors.map((anchor, idx) => (
                              <div key={idx} className="text-[11px] leading-relaxed text-[#C5C6C7]">
                                <span style={{ color: themeColor }}>▸</span> {anchor}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {memorySeeds.length > 0 && (
                        <div>
                          <div className="mb-1 flex items-center gap-1 text-[10px] tracking-widest text-[#8a8d91]">
                            <Sparkles size={11} />
                            记忆种子
                          </div>
                          <div className="space-y-1">
                            {memorySeeds.map((seed, idx) => (
                              <div key={idx} className="text-[11px] leading-relaxed text-[#C5C6C7]">
                                <span style={{ color: themeColor }}>▸</span> {seed}
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
                <div className="text-xs font-bold tracking-wider mb-2" style={{ color: themeColor }}>
                  ▸ 技能档案 · SKILLS
                </div>
                <div className="space-y-2">
                  {character.skills.map((skill, idx) => {
                    const meta = skillTypeMeta[skill.type] || skillTypeMeta.attack;
                    const Icon = meta.icon;
                    const isUlt = skill.isUltimate || skill.type === 'ultimate';
                    const ultMeta = isUlt && skill.ultimateType
                      ? ULTIMATE_TYPES.find((t) => t.id === skill.ultimateType)
                      : undefined;
                    const ultImage = skill.imageUrl || ultMeta?.imageUrl;
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded border bg-[#0B0C10]/60"
                        style={{ borderColor: `${meta.color}66` }}
                      >
                        {isUlt && ultImage ? (
                          <img
                            src={ultImage}
                            alt={skill.name}
                            className="w-14 h-14 rounded object-cover flex-shrink-0 border"
                            style={{ borderColor: `${meta.color}88` }}
                          />
                        ) : (
                          <div
                            className="w-14 h-14 rounded flex items-center justify-center flex-shrink-0 border"
                            style={{ borderColor: `${meta.color}66`, color: meta.color, background: `${meta.color}11` }}
                          >
                            <Icon size={22} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold font-display tracking-wider" style={{ color: meta.color }}>
                              {skill.name}
                            </span>
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded tracking-widest"
                              style={{ background: `${meta.color}22`, color: meta.color }}
                            >
                              {isUlt ? '大招' : meta.label}
                            </span>
                            {skill.damageMultiplier > 0 && (
                              <span className="text-[10px] text-[#8a8d91]">x{skill.damageMultiplier}</span>
                            )}
                            {skill.healPercent && (
                              <span className="text-[10px] text-[#66FCF1]">回复 {skill.healPercent}%</span>
                            )}
                            {skill.buffPercent && (
                              <span className="text-[10px] text-[#FFD700]">{skill.buffPercent}% / {skill.buffTurns ?? 0}回合</span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#C5C6C7] leading-relaxed">{skill.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {hasGrowth && activeTab === 'growth' && (
            <motion.div
              key="growth"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              <div className="bg-[#0B0C10]/60 border rounded p-4" style={{ borderColor: `${themeColor}44` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-black font-display" style={{ color: themeColor }}>
                      Lv.{level}
                    </span>
                    <span className="text-[11px] tracking-widest px-2 py-0.5 rounded border" style={{ borderColor: '#66FCF188', color: '#66FCF1' }}>
                      {levelAscensionLabel(level)}
                    </span>
                    <span className="text-[11px] tracking-widest px-2 py-0.5 rounded border" style={{ borderColor: `${themeColor}88`, color: themeColor }}>
                      {evolutionLabel(stage)}
                    </span>
                    <span className="text-sm" style={{ color: '#FFD700' }}>
                      {'★'.repeat(stars)}{'☆'.repeat(Math.max(0, 6 - stars))}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#8a8d91] tracking-widest">
                    塔最高 · L{character.tower?.highestEndlessLayer ?? character.tower?.highestCleared ?? 0}
                  </div>
                </div>
                <div className="h-2 bg-[#0B0C10] border border-[#45A29E]/30 rounded overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${xpInfo.ratio * 100}%`, background: themeColor, boxShadow: `0 0 8px ${themeColor}` }}
                  />
                </div>
                <div className="text-[10px] text-[#8a8d91] mt-1 text-right">
                  {xpInfo.current} / {xpInfo.need} XP
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-[#8a8d91]">
                  <span>下次进化</span>
                  <span className="font-bold" style={{ color: themeColor }}>
                    {nextEvolution.nextStage
                      ? nextEvolution.ready
                        ? `${evolutionLabel(nextEvolution.nextStage)}待触发`
                        : `Lv.${nextEvolution.targetLevel} ${evolutionLabel(nextEvolution.nextStage)} · 还差 ${nextEvolution.xpRemaining} XP`
                      : '最终形态'}
                  </span>
                </div>
              </div>

              {formHistory.length > 0 && (
                <div className="bg-[#0B0C10]/60 border rounded p-4" style={{ borderColor: `${themeColor}33` }}>
                  <div className="text-xs font-bold tracking-wider mb-3" style={{ color: themeColor }}>
                    ▸ 形态时间轴
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {formHistory.map((form, i) => (
                      <div key={i} className="flex-shrink-0 w-32 bg-[#0B0C10]/60 border rounded p-2" style={{ borderColor: `${themeColor}33` }}>
                        <div className="w-full aspect-square rounded overflow-hidden border mb-2 bg-[#0B0C10]" style={{ borderColor: `${themeColor}55` }}>
                          {form.imageUrl ? (
                            <img src={form.imageUrl} alt={`stage-${form.stage}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-[#8a8d91]">生成中…</div>
                          )}
                        </div>
                        <div className="text-[10px] tracking-widest font-display" style={{ color: themeColor }}>
                          {evolutionLabel(form.stage)}
                        </div>
                        {form.lore && (
                          <div className="text-[10px] text-[#C5C6C7] leading-snug line-clamp-3 mt-1">{form.lore}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-[#0B0C10]/60 border rounded p-4" style={{ borderColor: `${themeColor}33` }}>
                <div className="text-xs font-bold tracking-wider mb-3" style={{ color: themeColor }}>
                  ▸ 最近塔战记录
                </div>
                {towerRuns.length === 0 ? (
                  <div className="text-[11px] text-[#8a8d91]">尚无塔战记录。</div>
                ) : (
                  <div className="space-y-2">
                    {towerRuns.map((run, i) => (
                      <div
                        key={i}
                        className="bg-[#0B0C10]/70 border rounded p-2"
                        style={{ borderColor: run.result === 'win' ? '#7FFF9F44' : '#FF6B9D44' }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold font-display" style={{ color: themeColor }}>
                              L{run.layer}
                            </span>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded tracking-widest"
                              style={{
                                background: run.result === 'win' ? '#7FFF9F22' : '#FF6B9D22',
                                color: run.result === 'win' ? '#7FFF9F' : '#FF6B9D',
                              }}
                            >
                              {run.result === 'win' ? '胜' : '败'}
                            </span>
                            <span className="text-[10px] text-[#8a8d91]">{run.turns} 回合</span>
                          </div>
                          {run.mostUsedSkill && (
                            <span className="text-[10px] text-[#8a8d91]">惯用 · {run.mostUsedSkill}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#C5C6C7] flex gap-3">
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
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6 pt-4 border-t flex gap-3" style={{ borderColor: `${themeColor}33` }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border-2 rounded text-xs font-display tracking-widest hover:bg-[#66FCF1]/10 transition-all"
            style={{ borderColor: themeColor, color: themeColor }}
          >
            返回
          </button>
          {onChat && (
            <button
              type="button"
              onClick={onChat}
              className="flex items-center gap-1.5 px-4 py-2.5 border-2 rounded text-xs font-display tracking-widest text-[#FFD700] border-[#FFD700]/70 hover:bg-[#FFD700]/10 transition-all"
            >
              <MessageCircle size={12} /> 交谈
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`确定要将 ${character.name} 移出麾下吗？`)) {
                  onRemove();
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 border-2 rounded text-xs font-display tracking-widest text-[#FF003C] border-[#FF003C]/60 hover:bg-[#FF003C]/10 transition-all"
            >
              <Trash2 size={12} /> 移出麾下
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
