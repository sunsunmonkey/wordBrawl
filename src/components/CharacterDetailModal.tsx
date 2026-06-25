import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Zap, Shield, Gauge, Trash2, Sparkles, Flame, Swords, type LucideIcon } from 'lucide-react';
import type { Skill } from '../store/useGameStore';
import { ULTIMATE_TYPES } from '../data/ultimateTypes';

export interface DisplayCharacter {
  name: string;
  imageUrl?: string;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  skills: Skill[];
  sourceDescription?: string;
  recruitedAt?: number;
  rosterId?: string;
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
  themeColor?: string;
}

export const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  character,
  onClose,
  onRemove,
  themeColor = '#66FCF1',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          <StatRow icon={<Heart size={14} />} label="生命" value={character.maxHp} color="#FF6B9D" />
          <StatRow icon={<Zap size={14} />} label="攻击" value={character.attack} color="#FFD700" />
          <StatRow icon={<Shield size={14} />} label="防御" value={character.defense} color="#66FCF1" />
          <StatRow icon={<Gauge size={14} />} label="速度" value={character.speed} color="#7FFF9F" />
        </div>

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

        <div className="mt-6 pt-4 border-t flex gap-3" style={{ borderColor: `${themeColor}33` }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border-2 rounded text-xs font-display tracking-widest hover:bg-[#66FCF1]/10 transition-all"
            style={{ borderColor: themeColor, color: themeColor }}
          >
            返回
          </button>
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
