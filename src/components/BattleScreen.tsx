import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore, CharacterData, Skill, BattleEvent } from '../store/useGameStore';
import { BattleEngine, ULTIMATE_THRESHOLD } from '../utils/battleEngine';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Shield, Activity, Swords, Flame, Hand, Bot } from 'lucide-react';
import { ParticleField } from './ParticleField';
import { getUltimateTypeById } from '../data/ultimateTypes';

interface PopupDamage {
  id: string;
  side: 'left' | 'right';
  value: number;
  isCrit: boolean;
  isHeal?: boolean;
}

interface UltimateOverlay {
  attackerName: string;
  skillName: string;
  skillImageUrl?: string;
  description: string;
  side: 'left' | 'right';
  ultimateType?: string;
  /** 是否为预警阶段（释放前提示） */
  warning?: boolean;
  /** 是否为蓄力过渡阶段 */
  charging?: boolean;
}

const CharacterCard: React.FC<{ 
  char: CharacterData; 
  isLeft: boolean;
  beingHit: boolean;
  isAttacking: boolean;
  isActiveTurn?: boolean;
  popups: PopupDamage[];
}> = ({ char, isLeft, beingHit, isAttacking, isActiveTurn, popups }) => {
  const hpPercent = Math.max(0, (char.hp / char.maxHp) * 100);
  const themeColor = isLeft ? '#66FCF1' : '#FF003C';
  const shadowColor = isLeft ? 'rgba(102, 252, 241, 0.6)' : 'rgba(255, 0, 60, 0.6)';
  const themeRgb = isLeft ? '102, 252, 241' : '255, 0, 60';
  const [imgFailed, setImgFailed] = useState(false);

  const hpColor = hpPercent > 60 ? '#22ff88' : hpPercent > 30 ? '#FFD700' : '#FF003C';
  const chargePercent = Math.min(100, (char.ultimateCharge / ULTIMATE_THRESHOLD) * 100);
  const ultReady = char.ultimateCharge >= ULTIMATE_THRESHOLD;
  const ultimateSkill = char.skills.find((s) => s.isUltimate || s.type === 'ultimate');

  return (
    <motion.div 
      animate={isAttacking ? { x: isLeft ? 30 : -30, scale: 1.05 } : { x: 0, scale: 1 }}
      transition={{ duration: 0.3, type: 'spring', stiffness: 300 }}
      className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'} w-full md:w-1/3 relative`}
    >
      {/* 手动模式当前回合指示器 */}
      {isActiveTurn && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-8 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-[#FFD700] text-[#0B0C10] text-[10px] font-black tracking-widest whitespace-nowrap"
          style={{ boxShadow: '0 0 12px #FFD700' }}
        >
          ▼ YOUR TURN ▼
        </motion.div>
      )}

      <div className={`relative w-44 h-44 md:w-56 md:h-56 mb-4 ${beingHit ? 'shake' : ''} ${isActiveTurn ? 'active-turn-glow' : ''}`}>
        {/* Glow ring */}
        <motion.div
          className="absolute inset-0 rounded-lg pulse-glow"
          style={{ 
            color: themeColor,
            boxShadow: `0 0 20px ${shadowColor}`,
          }}
        />

        {/* Avatar */}
        <div 
          className="absolute inset-0 border-2 rounded-lg overflow-hidden bg-[#1F2833] relative scanlines"
          style={{ borderColor: themeColor, boxShadow: `0 0 25px ${shadowColor}` }}
        >
          {char.imageUrl && !imgFailed ? (
            <img
              src={char.imageUrl}
              alt={char.name}
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div 
              className="w-full h-full flex items-center justify-center text-7xl font-black italic font-display"
              style={{ 
                color: themeColor,
                background: `linear-gradient(135deg, rgba(${themeRgb},0.25) 0%, transparent 100%)`,
              }}
            >
              {char.name?.[0] || '?'}
            </div>
          )}
          {/* Hit flash overlay */}
          <AnimatePresence>
            {beingHit && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-white"
              />
            )}
          </AnimatePresence>
          {/* Slash effect */}
          <AnimatePresence>
            {beingHit && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div className="text-7xl slash-effect" style={{ color: themeColor, textShadow: `0 0 20px ${themeColor}` }}>
                  ⚔
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Damage popups */}
        <div className="absolute top-1/2 left-1/2 z-30 pointer-events-none">
          <AnimatePresence>
            {popups.map((p) => (
              <div
                key={p.id}
                className="absolute damage-float font-display font-black"
                style={{
                  fontSize: p.isCrit ? '3rem' : '2rem',
                  color: p.isHeal ? '#22ff88' : p.isCrit ? '#FFD700' : themeColor,
                  textShadow: `0 0 12px ${p.isHeal ? '#22ff88' : p.isCrit ? '#FFD700' : themeColor}, 0 2px 4px rgba(0,0,0,0.8)`,
                  WebkitTextStroke: '1px black',
                }}
              >
                {p.isHeal ? '+' : '-'}{p.value}
                {p.isCrit && <span className="text-xs ml-1 text-red-500">CRIT!</span>}
              </div>
            ))}
          </AnimatePresence>
        </div>

        {/* Corner pulse markers */}
        <div className="absolute -top-1 -left-1 w-3 h-3 border-l-2 border-t-2 animate-pulse" style={{ borderColor: themeColor }} />
        <div className="absolute -top-1 -right-1 w-3 h-3 border-r-2 border-t-2 animate-pulse" style={{ borderColor: themeColor }} />
        <div className="absolute -bottom-1 -left-1 w-3 h-3 border-l-2 border-b-2 animate-pulse" style={{ borderColor: themeColor }} />
        <div className="absolute -bottom-1 -right-1 w-3 h-3 border-r-2 border-b-2 animate-pulse" style={{ borderColor: themeColor }} />
      </div>

      <h3 
        data-text={char.name}
        className="text-2xl font-black italic mb-3 font-display tracking-wider" 
        style={{ color: themeColor, textShadow: `0 0 12px ${themeColor}` }}
      >
        {char.name}
      </h3>

      {/* HP Bar */}
      <div className="w-full mb-2">
        <div className="flex justify-between text-xs mb-1 font-bold">
          <span className="text-[#8a8d91]">HP</span>
          <span style={{ color: hpColor }}>{char.hp} / {char.maxHp}</span>
        </div>
        <div className="w-full h-5 bg-[#0B0C10] border-2 rounded-sm overflow-hidden relative" style={{ borderColor: themeColor, boxShadow: `0 0 8px ${shadowColor} inset` }}>
          <motion.div 
            className="h-full relative"
            style={{ 
              backgroundColor: hpColor,
              boxShadow: `0 0 12px ${hpColor}`,
            }}
            initial={{ width: '100%' }}
            animate={{ width: `${hpPercent}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {/* Shimmer */}
            <div 
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                animation: 'scanline-move 2s linear infinite',
                backgroundSize: '50% 100%',
              }}
            />
          </motion.div>
        </div>
      </div>

      {/* Ultimate Charge Bar */}
      {ultimateSkill && (
        <div className="w-full mb-4">
          <div className="flex justify-between text-[10px] mb-1 font-bold tracking-wider">
            <span className="flex items-center gap-1" style={{ color: ultReady ? '#FFD700' : '#8a8d91' }}>
              <Flame size={10} className={ultReady ? 'animate-pulse' : ''} />
              {ultReady ? 'ULT READY!' : 'ULT CHARGE'}
            </span>
            <span style={{ color: ultReady ? '#FFD700' : '#8a8d91' }}>{Math.floor(chargePercent)}%</span>
          </div>
          <div className="w-full h-2.5 bg-[#0B0C10] border rounded-sm overflow-hidden relative" 
            style={{ 
              borderColor: ultReady ? '#FFD700' : `rgba(${themeRgb}, 0.4)`,
              boxShadow: ultReady ? '0 0 12px rgba(255, 215, 0, 0.8)' : 'none',
            }}>
            <motion.div 
              className="h-full relative"
              style={{ 
                background: ultReady 
                  ? 'linear-gradient(90deg, #FFD700, #FF6B00, #FFD700)' 
                  : 'linear-gradient(90deg, rgba(255,215,0,0.4), rgba(255,107,0,0.6))',
                boxShadow: ultReady ? '0 0 10px #FFD700' : 'none',
              }}
              initial={{ width: '0%' }}
              animate={{ width: `${chargePercent}%` }}
              transition={{ duration: 0.5 }}
            >
              {ultReady && (
                <div className="absolute inset-0" style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
                  animation: 'scanline-move 1s linear infinite',
                  backgroundSize: '50% 100%',
                }} />
              )}
            </motion.div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 w-full text-xs font-bold bg-[#1F2833]/60 p-3 rounded border" style={{ borderColor: `rgba(${themeRgb}, 0.3)` }}>
        <div className="flex flex-col items-center gap-1">
          <Zap size={14} className="text-yellow-400" />
          <span className="text-yellow-400">{char.attack}{char.attackBuff !== 0 ? <span className="text-[9px] ml-0.5" style={{color: char.attackBuff > 0 ? '#22ff88' : '#FF003C'}}>{char.attackBuff > 0 ? '↑' : '↓'}{Math.abs(char.attackBuff)}%</span> : null}</span>
          <span className="text-[10px] text-[#8a8d91]">ATK</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Shield size={14} className="text-blue-400" />
          <span className="text-blue-400">{char.defense}{char.defenseBuff !== 0 ? <span className="text-[9px] ml-0.5" style={{color: char.defenseBuff > 0 ? '#22ff88' : '#FF003C'}}>{char.defenseBuff > 0 ? '↑' : '↓'}{Math.abs(char.defenseBuff)}%</span> : null}</span>
          <span className="text-[10px] text-[#8a8d91]">DEF</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Activity size={14} className="text-green-400" />
          <span className="text-green-400">{char.speed}</span>
          <span className="text-[10px] text-[#8a8d91]">SPD</span>
        </div>
      </div>

      {/* Skills preview */}
      <div className="w-full mt-3 space-y-1">
        {char.skills.map((s, i) => {
          const isUlt = s.isUltimate || s.type === 'ultimate';
          const typeColor = isUlt ? '#FFD700' : s.type === 'heal' ? '#22ff88' : s.type === 'buff' ? '#FFD700' : s.type === 'debuff' ? '#FF6B00' : themeColor;
          return (
            <div key={i} className="text-[10px] flex items-center gap-1 truncate" style={{ color: isUlt ? '#FFD700' : '#8a8d91' }}>
              <Flame size={10} style={{ color: typeColor }} />
              <span className="truncate" style={{ color: isUlt ? '#FFD700' : undefined }}>{s.name}</span>
              {isUlt && <span className="text-[9px] text-[#FFD700] font-bold">★ULT</span>}
              {s.type === 'heal' && <span className="text-[#22ff88]">+{s.healPercent}%</span>}
              {(s.type === 'buff' || s.type === 'debuff') && <span className="text-[#FFD700]">{s.buffPercent}%</span>}
              {s.type === 'attack' && <span className="text-[#45A29E]">×{s.damageMultiplier.toFixed(1)}</span>}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

/** 技能按钮组件（手动模式用） */
const SkillButton: React.FC<{
  skill: Skill;
  index: number;
  disabled: boolean;
  isUltReady: boolean;
  themeColor: string;
  onClick: () => void;
}> = ({ skill, index, disabled, isUltReady, themeColor, onClick }) => {
  const isUlt = skill.isUltimate || skill.type === 'ultimate';
  const isUltLocked = isUlt && !isUltReady;
  
  const typeColor = isUlt ? '#FFD700' : skill.type === 'heal' ? '#22ff88' : skill.type === 'buff' ? '#FFD700' : skill.type === 'debuff' ? '#FF6B00' : themeColor;
  const typeLabel = {
    attack: '攻击',
    heal: '治疗',
    buff: '增益',
    debuff: '减益',
    ultimate: '大招',
  }[skill.type];

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={!disabled && !isUltLocked ? { scale: 1.02, y: -2 } : {}}
      whileTap={!disabled && !isUltLocked ? { scale: 0.98 } : {}}
      onClick={onClick}
      disabled={disabled || isUltLocked}
      className={`relative w-full text-left p-3 rounded-lg border-2 transition-all overflow-hidden ${
        disabled || isUltLocked
          ? 'opacity-40 cursor-not-allowed border-[#45A29E]/20 bg-[#0B0C10]/50'
          : 'cursor-pointer bg-[#1F2833]/80 hover:bg-[#1F2833]'
      }`}
      style={{
        borderColor: isUltLocked ? 'rgba(255,215,0,0.2)' : typeColor,
        boxShadow: !disabled && !isUltLocked && isUlt ? `0 0 12px rgba(255,215,0,0.4)` : 'none',
      }}
    >
      {/* 类型标签 */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-black px-1.5 py-0.5 rounded tracking-wider"
            style={{ backgroundColor: typeColor, color: '#0B0C10' }}
          >
            {typeLabel}
          </span>
          {isUlt && (
            <span className="text-[9px] font-bold text-[#FFD700] tracking-wider flex items-center gap-0.5">
              <Flame size={10} /> ULT
            </span>
          )}
        </div>
        <span className="text-[10px] font-bold" style={{ color: typeColor }}>
          {skill.type === 'attack' || skill.type === 'ultimate'
            ? `×${skill.damageMultiplier.toFixed(1)}`
            : skill.type === 'heal'
            ? `+${skill.healPercent}%`
            : `${skill.buffPercent}%`}
        </span>
      </div>
      
      {/* 技能名 */}
      <div className="text-sm font-black mb-0.5 truncate" style={{ color: isUlt ? '#FFD700' : themeColor }}>
        {skill.name}
      </div>
      
      {/* 技能描述 */}
      <div className="text-[10px] text-[#8a8d91] line-clamp-2 leading-relaxed">
        {skill.description}
      </div>

      {/* 大招锁定遮罩 */}
      {isUltLocked && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <div className="text-[10px] text-[#FFD700]/70 font-bold tracking-wider flex items-center gap-1">
            <Flame size={12} /> 充能中
          </div>
        </div>
      )}
    </motion.button>
  );
};

/** 大招视觉风格配置：颜色 + 动画参数 + 类型专属装饰 */
interface UltimateStyle {
  theme: string;
  secondary: string;
  sideLeft: string;
  sideRight: string;
  chargeLabel: string;
  /** 背景放射光旋转方向与速度 */
  spin: { clockwise: boolean; duration: number };
  /** 中心图片容器的呼吸/抖动动画 */
  imageAnimation: {
    animate: { scale?: number[]; opacity?: number[]; x?: number[]; y?: number[]; rotate?: number[] };
    transition: { duration: number; repeat: number | typeof Infinity; ease?: 'linear' | 'easeInOut' | 'easeOut' };
  };
  /** 蓄力阶段中心能量球动画 */
  chargeOrbAnimation: {
    animate: { scale?: number[]; opacity?: number[]; x?: number[]; y?: number[]; rotate?: number[] };
    transition: { duration: number; repeat: number | typeof Infinity; ease?: 'linear' | 'easeInOut' | 'easeOut' };
  };
  /** 类型 ID，用于渲染专属装饰层 */
  typeId: string;
}

const getUltimateStyle = (ultimateType?: string): UltimateStyle => {
  const type = getUltimateTypeById(ultimateType || '');
  const base = {
    theme: type?.themeColor ?? '#FFD700',
    secondary: type?.secondaryColor ?? '#FF6B00',
    sideLeft: '#66FCF1',
    sideRight: '#FF003C',
  };
  const id = type?.id ?? 'default';

  const styles: Record<string, Partial<UltimateStyle>> = {
    fire: {
      chargeLabel: '▼ IGNITE ▼',
      spin: { clockwise: true, duration: 2 },
      imageAnimation: {
        animate: { scale: [1, 1.06, 0.98, 1.04, 1] },
        transition: { duration: 0.5, repeat: Infinity, ease: 'easeInOut' },
      },
      chargeOrbAnimation: {
        animate: { scale: [0.9, 1.3, 0.9], opacity: [0.7, 1, 0.7] },
        transition: { duration: 0.35, repeat: Infinity, ease: 'easeInOut' },
      },
    },
    ice: {
      chargeLabel: '▼ FREEZE ▼',
      spin: { clockwise: false, duration: 3.5 },
      imageAnimation: {
        animate: { scale: [1, 1.02, 1], opacity: [1, 0.85, 1] },
        transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
      },
      chargeOrbAnimation: {
        animate: { scale: [1, 1.15, 1], rotate: [0, 90, 0] },
        transition: { duration: 0.8, repeat: Infinity, ease: 'linear' },
      },
    },
    shadow: {
      chargeLabel: '▼ VANISH ▼',
      spin: { clockwise: true, duration: 1.2 },
      imageAnimation: {
        animate: { x: [-2, 2, -2, 0], opacity: [1, 0.85, 1, 1] },
        transition: { duration: 0.2, repeat: Infinity, ease: 'linear' },
      },
      chargeOrbAnimation: {
        animate: { scale: [1, 0.85, 1.1, 1], opacity: [0.6, 1, 0.6, 0.9] },
        transition: { duration: 0.25, repeat: Infinity, ease: 'easeInOut' },
      },
    },
    lightning: {
      chargeLabel: '▼ CHARGE ▼',
      spin: { clockwise: false, duration: 0.8 },
      imageAnimation: {
        animate: { x: [-3, 3, -2, 2, 0], scale: [1, 1.03, 1] },
        transition: { duration: 0.15, repeat: Infinity, ease: 'linear' },
      },
      chargeOrbAnimation: {
        animate: { scale: [1, 1.4, 1], opacity: [1, 0.4, 1] },
        transition: { duration: 0.12, repeat: Infinity, ease: 'linear' },
      },
    },
    cosmic: {
      chargeLabel: '▼ COLLAPSE ▼',
      spin: { clockwise: true, duration: 6 },
      imageAnimation: {
        animate: { scale: [1, 1.03, 1], rotate: [0, 2, -2, 0] },
        transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
      },
      chargeOrbAnimation: {
        animate: { scale: [0.95, 1.25, 0.95], rotate: [0, 180, 360] },
        transition: { duration: 1.5, repeat: Infinity, ease: 'linear' },
      },
    },
    nature: {
      chargeLabel: '▼ AWAKEN ▼',
      spin: { clockwise: true, duration: 4 },
      imageAnimation: {
        animate: { scale: [1, 1.04, 1] },
        transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
      },
      chargeOrbAnimation: {
        animate: { scale: [0.8, 1.2, 0.8], y: [10, -10, 10] },
        transition: { duration: 1, repeat: Infinity, ease: 'easeInOut' },
      },
    },
    mecha: {
      chargeLabel: '▼ LOCK ON ▼',
      spin: { clockwise: false, duration: 2.5 },
      imageAnimation: {
        animate: { scale: [1, 1.01, 1] },
        transition: { duration: 0.1, repeat: Infinity, ease: 'linear' },
      },
      chargeOrbAnimation: {
        animate: { scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] },
        transition: { duration: 0.3, repeat: Infinity, ease: 'linear' },
      },
    },
    holy: {
      chargeLabel: '▼ JUDGMENT ▼',
      spin: { clockwise: true, duration: 5 },
      imageAnimation: {
        animate: { scale: [1, 1.05, 1], opacity: [1, 0.9, 1] },
        transition: { duration: 1, repeat: Infinity, ease: 'easeInOut' },
      },
      chargeOrbAnimation: {
        animate: { scale: [0.9, 1.3, 0.9], opacity: [0.7, 1, 0.7] },
        transition: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' },
      },
    },
  };

  const specific = styles[id] ?? styles.default ?? {
    chargeLabel: '▼ CHARGING ▼',
    spin: { clockwise: true, duration: 2.1 },
    imageAnimation: {
      animate: { scale: [1, 1.05, 1] },
      transition: { duration: 0.6, repeat: Infinity },
    },
    chargeOrbAnimation: {
      animate: { scale: [0.8, 1.2, 0.8] },
      transition: { duration: 0.4, repeat: Infinity },
    },
  };

  return {
    ...base,
    ...specific,
    typeId: id,
  } as UltimateStyle;
};

/** 类型专属背景装饰层 */
const TypeDecoration: React.FC<{ typeId: string; theme: string; secondary: string; sideColor: string; charging: boolean }> = ({
  typeId,
  theme,
  secondary,
  sideColor,
  charging,
}) => {
  const common = 'absolute inset-0 pointer-events-none';

  switch (typeId) {
    case 'fire':
      return (
        <>
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: charging ? [0, 1.2, 1.5] : [0, 2, 2.5], opacity: charging ? [0, 0.8, 0] : [0, 0.5, 0] }}
            transition={{ duration: charging ? 0.4 : 1.5, repeat: charging ? Infinity : 0 }}
            className={common}
            style={{
              background: `radial-gradient(circle at center, ${theme}44 0%, transparent 60%)`,
            }}
          />
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 0.2, repeat: Infinity }}
            className={common}
            style={{
              background: `repeating-radial-gradient(circle at center, ${theme}22 0, ${theme}22 20px, transparent 20px, transparent 40px)`,
            }}
          />
        </>
      );
    case 'ice':
      return (
        <>
          <motion.div
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: charging ? [1.5, 0.8, 1.2] : [1.2, 1, 1.1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: charging ? 0.6 : 2, repeat: Infinity }}
            className={common}
            style={{
              background: `conic-gradient(from 0deg, transparent, ${theme}33, transparent, ${secondary}33, transparent)`,
            }}
          />
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, rotate: i * 60 }}
              animate={{ opacity: [0, 0.6, 0], rotate: i * 60 + 180 }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
              className="absolute top-1/2 left-1/2 w-[600px] h-1 -translate-x-1/2 -translate-y-1/2"
              style={{ background: `linear-gradient(90deg, transparent, ${theme}, transparent)` }}
            />
          ))}
        </>
      );
    case 'shadow':
      return (
        <>
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ x: charging ? '-100%' : '-120%', opacity: 0 }}
              animate={{ x: charging ? '120%' : '120%', opacity: [0, 0.7, 0] }}
              transition={{ duration: charging ? 0.3 : 0.6, repeat: Infinity, delay: i * 0.12, ease: 'linear' }}
              className="absolute top-0 bottom-0 w-32"
              style={{
                left: `${i * 25}%`,
                background: `linear-gradient(90deg, transparent, ${theme}66, transparent)`,
                transform: `rotate(${15 + i * 10}deg)`,
              }}
            />
          ))}
          <motion.div
            animate={{ opacity: [0, 0.8, 0] }}
            transition={{ duration: 0.15, repeat: Infinity }}
            className={common}
            style={{ background: `${sideColor}22` }}
          />
        </>
      );
    case 'lightning':
      return (
        <>
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: `${(i - 2) * 30}%`, y: '-100%' }}
              animate={{ opacity: [0, 1, 0], y: '100%' }}
              transition={{ duration: 0.2, repeat: Infinity, delay: i * 0.08, ease: 'linear' }}
              className="absolute top-0 w-1 h-full"
              style={{
                left: `${20 + i * 15}%`,
                background: `linear-gradient(180deg, transparent, ${theme}, ${secondary}, transparent)`,
                boxShadow: `0 0 10px ${theme}`,
              }}
            />
          ))}
        </>
      );
    case 'cosmic':
      return (
        <>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className={common}
            style={{
              background: `repeating-conic-gradient(from 0deg, transparent 0deg, ${theme}11 10deg, transparent 20deg, ${secondary}11 30deg, transparent 40deg)`,
            }}
          />
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              animate={{
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
                x: [0, Math.cos(i * 30 * Math.PI / 180) * 300],
                y: [0, Math.sin(i * 30 * Math.PI / 180) * 300],
              }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }}
              className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
              style={{ background: theme, boxShadow: `0 0 10px ${theme}` }}
            />
          ))}
        </>
      );
    case 'nature':
      return (
        <>
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ y: '100%', opacity: 0, scale: 0 }}
              animate={{ y: '-20%', opacity: [0, 0.8, 0], scale: [0.5, 1.2, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
              className="absolute bottom-0 w-2 h-32 rounded-full"
              style={{
                left: `${10 + i * 12}%`,
                background: `linear-gradient(180deg, transparent, ${theme})`,
                boxShadow: `0 0 15px ${theme}`,
              }}
            />
          ))}
          <motion.div
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 2, repeat: Infinity }}
            className={common}
            style={{ background: `radial-gradient(circle at center, ${theme}33, transparent 70%)` }}
          />
        </>
      );
    case 'mecha':
      return (
        <>
          <motion.div
            animate={{ backgroundPosition: ['0% 0%', '100% 100%'] }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className={common}
            style={{
              backgroundImage: `linear-gradient(0deg, transparent 24%, ${theme}22 25%, ${theme}22 26%, transparent 27%, transparent 74%, ${theme}22 75%, ${theme}22 76%, transparent 77%, transparent),
                                linear-gradient(90deg, transparent 24%, ${theme}22 25%, ${theme}22 26%, transparent 27%, transparent 74%, ${theme}22 75%, ${theme}22 76%, transparent 77%, transparent)`,
              backgroundSize: '50px 50px',
            }}
          />
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: charging ? [0.5, 1.2, 1] : [1, 1.1, 1], opacity: charging ? [0, 1, 0.8] : [0.6, 0.9, 0.6] }}
            transition={{ duration: 0.4, repeat: Infinity }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] border-2"
            style={{ borderColor: theme, boxShadow: `0 0 20px ${theme} inset` }}
          >
            <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2" style={{ borderColor: secondary }} />
            <div className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2" style={{ borderColor: secondary }} />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2" style={{ borderColor: secondary }} />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2" style={{ borderColor: secondary }} />
          </motion.div>
        </>
      );
    case 'holy':
      return (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className={common}
            style={{
              background: `linear-gradient(180deg, ${theme}66 0%, transparent 50%, transparent 100%)`,
            }}
          />
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0, rotate: i * 30 }}
              animate={{ opacity: [0, 0.8, 0], scale: [0, 1.5, 2], rotate: i * 30 + 90 }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
              className="absolute top-1/2 left-1/2 w-[600px] h-4 -translate-x-1/2 -translate-y-1/2"
              style={{ background: `linear-gradient(90deg, transparent, ${theme}, transparent)` }}
            />
          ))}
        </>
      );
    default:
      return null;
  }
};

/** 大招全屏特效组件 */
const UltimateOverlayView: React.FC<{ overlay: UltimateOverlay }> = ({ overlay }) => {
  const style = getUltimateStyle(overlay.ultimateType);
  const sideColor = overlay.side === 'left' ? style.sideLeft : style.sideRight;
  const isCharging = overlay.charging;
  const isWarning = overlay.warning;
  const isRelease = !isWarning && !isCharging;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none ultimate-overlay"
    >
      {/* 基础背景闪光 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{
          opacity: isCharging ? [0, 0.8, 0.4] : isWarning ? [0, 0.5, 0.3] : [0, 0.9, 0.6, 0.9, 0.4],
        }}
        transition={{ duration: isCharging ? 0.4 : isWarning ? 0.5 : 2.1 }}
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at center, ${sideColor}66, ${style.theme}66, #000)`,
        }}
      />

      {/* 放射状光线 */}
      <motion.div
        initial={{ scale: isCharging ? 0.8 : 0, rotate: 0 }}
        animate={{
          scale: isCharging ? 1.5 : isWarning ? 1.2 : 3,
          rotate: style.spin.clockwise ? (isCharging ? 180 : isWarning ? 90 : 360) : (isCharging ? -180 : isWarning ? -90 : -360),
        }}
        transition={{ duration: isCharging ? 0.4 : isWarning ? 0.5 : style.spin.duration, ease: 'easeOut' }}
        className="absolute w-[800px] h-[800px]"
        style={{
          background: `conic-gradient(from 0deg, transparent, ${sideColor}, transparent, ${style.theme}, transparent)`,
          opacity: isCharging ? 0.6 : isWarning ? 0.3 : 0.4,
          borderRadius: '50%',
        }}
      />

      {/* 类型专属装饰层 */}
      <TypeDecoration
        typeId={style.typeId}
        theme={style.theme}
        secondary={style.secondary}
        sideColor={sideColor}
        charging={isCharging}
      />

      {/* 预警阶段：侧边警示横幅 */}
      <AnimatePresence>
        {isWarning && (
          <motion.div
            initial={{ opacity: 0, x: overlay.side === 'left' ? -80 : 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: overlay.side === 'left' ? -40 : 40 }}
            transition={{ type: 'spring', bounce: 0.5, duration: 0.5 }}
            className="relative z-20 flex flex-col items-center"
          >
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 0.3, repeat: Infinity, ease: 'easeInOut' }}
              className="px-6 py-3 rounded-lg border-2 backdrop-blur-sm"
              style={{
                borderColor: sideColor,
                background: `${sideColor}22`,
                boxShadow: `0 0 30px ${sideColor}, inset 0 0 20px ${sideColor}44`,
              }}
            >
              <div
                className="text-xs font-black tracking-[0.4em] mb-1"
                style={{ color: sideColor, textShadow: `0 0 10px ${sideColor}` }}
              >
                {overlay.side === 'left' ? '◀ ULTIMATE INCOMING' : 'ULTIMATE INCOMING ▶'}
              </div>
              <div className="text-lg font-black font-display tracking-wider text-white">
                {overlay.attackerName}
              </div>
              <div className="text-[10px] tracking-widest mt-1" style={{ color: sideColor }}>
                PREPARING ULT...
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 蓄力阶段：中心能量球 + 角色名 */}
      <AnimatePresence>
        {isCharging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: [0.8, 1.2, 1] }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.4 }}
            className="absolute z-20 flex flex-col items-center"
          >
            <motion.div
              {...style.chargeOrbAnimation}
              className="w-32 h-32 rounded-full blur-xl"
              style={{
                background: `radial-gradient(circle, ${style.theme}, ${sideColor})`,
                boxShadow: `0 0 80px ${style.theme}, 0 0 160px ${sideColor}`,
              }}
            />
            <div
              className="mt-6 text-sm font-black tracking-[0.4em]"
              style={{ color: style.theme, textShadow: `0 0 12px ${style.theme}` }}
            >
              {style.chargeLabel}
            </div>
            <div className="text-xl text-white/90 mt-1 tracking-wider">— {overlay.attackerName} —</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 释放阶段：大招图片铺满全屏 + 技能名叠加 */}
      <AnimatePresence>
        {isRelease && (
          <>
            {/* 全屏大招图片背景 */}
            {overlay.skillImageUrl ? (
              <motion.div
                initial={{ opacity: 0, scale: 1.15 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="absolute inset-0 z-0 overflow-hidden"
              >
                <motion.img
                  {...style.imageAnimation}
                  src={overlay.skillImageUrl}
                  alt={overlay.skillName}
                  className="w-full h-full object-cover ultimate-image-shake"
                />
                {/* 底部渐变遮罩，保证文字可读 */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(180deg, ${style.theme}22 0%, transparent 30%, transparent 50%, rgba(0,0,0,0.85) 100%)`,
                  }}
                />
                {/* 侧边色调染色（标识攻击方） */}
                <div
                  className="absolute inset-0 mix-blend-overlay"
                  style={{
                    background: `linear-gradient(90deg, ${sideColor}55 0%, transparent 50%, ${sideColor}55 100%)`,
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
                className="absolute z-0 text-9xl font-black font-display"
                style={{
                  color: style.theme,
                  textShadow: `0 0 40px ${style.theme}, 0 0 80px ${style.secondary}`,
                }}
              >
                ☄
              </motion.div>
            )}

            {/* 叠加文字信息（顶部技能名 + 底部署名） */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="absolute top-10 left-0 right-0 text-center px-4 z-20"
            >
              <div
                className="text-xs tracking-[0.5em] mb-2"
                style={{ color: style.theme, textShadow: `0 0 10px ${style.theme}` }}
              >
                ▼ ULTIMATE SKILL ▼
              </div>
              <h2
                data-text={overlay.skillName}
                className="glitch-text text-4xl md:text-6xl font-black font-display tracking-wider"
                style={{ color: style.theme, textShadow: `0 0 20px ${style.theme}, 0 0 40px ${style.secondary}` }}
              >
                {overlay.skillName}
              </h2>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="absolute bottom-10 left-0 right-0 text-center z-20"
            >
              <div className="text-sm text-white/90 tracking-wider">— {overlay.attackerName} —</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const BattleScreen: React.FC = () => {
  const { player1, player2, battleMode, updatePlayer1Hp, updatePlayer2Hp, updatePlayer1UltimateCharge, updatePlayer2UltimateCharge, addBattleLog, battleLogs, setWinner } = useGameStore();
  const [isBattling, setIsBattling] = useState(false);
  const [hitSide, setHitSide] = useState<'left' | 'right' | null>(null);
  const [attackerSide, setAttackerSide] = useState<'left' | 'right' | null>(null);
  const [popups, setPopups] = useState<{ left: PopupDamage[]; right: PopupDamage[] }>({ left: [], right: [] });
  const [shakeScreen, setShakeScreen] = useState(false);
  const [ultimateOverlay, setUltimateOverlay] = useState<UltimateOverlay | null>(null);
  
  // 手动模式状态
  const engineRef = useRef<BattleEngine | null>(null);
  // 自动模式：防止 StrictMode 双重调用导致 simulateBattle 重复执行
  const autoBattleStartedRef = useRef(false);
  const [manualTurn, setManualTurn] = useState<'player1' | 'player2' | null>(null);
  const [p1Display, setP1Display] = useState<CharacterData | null>(null);
  const [p2Display, setP2Display] = useState<CharacterData | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [battleLogs]);

  /** 预加载大招图片，避免首次显示时卡顿。返回 Promise，可用于等待就绪 */
  const preloadUltimateImage = useCallback((url?: string): Promise<void> => {
    if (!url) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      const done = () => resolve();
      img.onload = done;
      img.onerror = done;
      img.src = url;
      // 兜底：最多等 1.2s，避免图片卡住阻塞流程
      setTimeout(done, 1200);
    });
  }, []);

  // 组件挂载后预加载所有大招类型图，减少战斗中的加载等待
  useEffect(() => {
    const urls = new Set<string>();
    [player1, player2].forEach((p) => {
      p?.skills.forEach((s) => {
        if (s.imageUrl) urls.add(s.imageUrl);
      });
    });
    urls.forEach((url) => preloadUltimateImage(url));
  }, [player1, player2, preloadUltimateImage]);

  /** 播放一个战斗事件的动画效果（伤害弹窗、受击、大招等） */
  const playLogEffects = useCallback(async (log: BattleEvent) => {
    if (log.isUltimate) {
      const side: 'left' | 'right' = log.attacker === 'player1' ? 'left' : 'right';

      // 阶段 0：预警提示（500ms）—— 提前告知哪边要放大招，同时并行预加载图片
      setUltimateOverlay({
        attackerName: log.attackerName || '',
        skillName: log.skillName || '',
        skillImageUrl: undefined,
        description: log.message,
        side,
        ultimateType: log.ultimateType,
        warning: true,
      });
      // 预警期间并行预加载图片，确保释放阶段不卡顿
      await Promise.race([
        preloadUltimateImage(log.skillImageUrl),
        new Promise(r => setTimeout(r, 500)),
      ]);

      // 阶段 1：蓄力/爆气过渡（400ms）
      setUltimateOverlay({
        attackerName: log.attackerName || '',
        skillName: log.skillName || '',
        skillImageUrl: undefined,
        description: log.message,
        side,
        ultimateType: log.ultimateType,
        charging: true,
      });
      setShakeScreen(true);
      await new Promise(r => setTimeout(r, 400));

      // 阶段 2：正式大招展示
      setUltimateOverlay({
        attackerName: log.attackerName || '',
        skillName: log.skillName || '',
        skillImageUrl: log.skillImageUrl,
        description: log.message,
        side,
        ultimateType: log.ultimateType,
        charging: false,
      });
      await new Promise(r => setTimeout(r, 2100));
      setUltimateOverlay(null);
      setShakeScreen(false);
    }

    if (log.damage && log.attacker !== 'system') {
      const targetSide: 'left' | 'right' = log.attacker === 'player1' ? 'right' : 'left';
      const attackerSideValue: 'left' | 'right' = log.attacker === 'player1' ? 'left' : 'right';
      
      setAttackerSide(attackerSideValue);
      setHitSide(targetSide);
      if (log.isCrit || log.isUltimate) setShakeScreen(true);

      const popupId = `${log.id}-popup`;
      setPopups(prev => ({
        ...prev,
        [targetSide]: [...prev[targetSide], {
          id: popupId,
          side: targetSide,
          value: log.damage!,
          isCrit: log.isCrit ?? false,
        }],
      }));

      setTimeout(() => {
        setHitSide(null);
        setAttackerSide(null);
        if (!log.isUltimate) setShakeScreen(false);
      }, 500);
      setTimeout(() => {
        setPopups(prev => ({
          ...prev,
          [targetSide]: prev[targetSide].filter(p => p.id !== popupId),
        }));
      }, 1300);
    }

    if (log.heal && log.attacker !== 'system') {
      const healerSide: 'left' | 'right' = log.attacker === 'player1' ? 'left' : 'right';
      const popupId = `${log.id}-heal`;
      setPopups(prev => ({
        ...prev,
        [healerSide]: [...prev[healerSide], {
          id: popupId,
          side: healerSide,
          value: log.heal!,
          isCrit: false,
          isHeal: true,
        }],
      }));
      setTimeout(() => {
        setPopups(prev => ({
          ...prev,
          [healerSide]: prev[healerSide].filter(p => p.id !== popupId),
        }));
      }, 1300);
    }
  }, [preloadUltimateImage]);

  // ============ 自动模式 ============
  useEffect(() => {
    if (battleMode !== 'auto' || !player1 || !player2 || isBattling) return;
    // StrictMode 下 effect 会双重调用，使用 ref 阻止第二次启动
    if (autoBattleStartedRef.current) return;
    autoBattleStartedRef.current = true;

    const startBattle = async () => {
      setIsBattling(true);
      const engine = new BattleEngine(player1, player2);
      const result = engine.simulateBattle();

      let currentP1Hp = player1.maxHp;
      let currentP2Hp = player2.maxHp;

      for (let i = 0; i < result.logs.length; i++) {
        const log = result.logs[i];
        const delay = log.isUltimate ? 2200 : 1300;
        await new Promise(resolve => setTimeout(resolve, delay));
        addBattleLog(log);

        await playLogEffects(log);

        // 同步 HP
        if (log.damage) {
          if (log.attacker === 'player1') {
            currentP2Hp = Math.max(0, currentP2Hp - log.damage);
            updatePlayer2Hp(currentP2Hp);
          } else if (log.attacker === 'player2') {
            currentP1Hp = Math.max(0, currentP1Hp - log.damage);
            updatePlayer1Hp(currentP1Hp);
          }
        }
        if (log.heal) {
          if (log.attacker === 'player1') {
            currentP1Hp = Math.min(player1.maxHp, currentP1Hp + log.heal);
            updatePlayer1Hp(currentP1Hp);
          } else if (log.attacker === 'player2') {
            currentP2Hp = Math.min(player2.maxHp, currentP2Hp + log.heal);
            updatePlayer2Hp(currentP2Hp);
          }
        }

        // 同步大招充能
        if (log.attackerCharge !== undefined) {
          if (log.attacker === 'player1') {
            updatePlayer1UltimateCharge(log.attackerCharge);
          } else if (log.attacker === 'player2') {
            updatePlayer2UltimateCharge(log.attackerCharge);
          }
        }
        if (log.defenderCharge !== undefined) {
          if (log.attacker === 'player1') {
            updatePlayer2UltimateCharge(log.defenderCharge);
          } else if (log.attacker === 'player2') {
            updatePlayer1UltimateCharge(log.defenderCharge);
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      setWinner(result.winner);
    };

    startBattle();
  }, [player1, player2, battleMode, isBattling, addBattleLog, updatePlayer1Hp, updatePlayer2Hp, updatePlayer1UltimateCharge, updatePlayer2UltimateCharge, setWinner, playLogEffects]);

  // ============ 手动模式初始化 ============
  useEffect(() => {
    if (battleMode !== 'manual' || !player1 || !player2 || engineRef.current) return;
    
    const engine = new BattleEngine(player1, player2);
    engineRef.current = engine;
    
    const state = engine.getState();
    setP1Display(state.p1);
    setP2Display(state.p2);
    setManualTurn('player1'); // P1 先手
    
    addBattleLog({
      id: `turn-0-start`,
      turn: 0,
      attacker: 'system',
      message: `战斗开始！【${player1.name}】 VS 【${player2.name}】 — 手动模式，P1 先手`
    });
  }, [player1, player2, battleMode, addBattleLog]);

  /** 手动模式：选择并释放技能 */
  const handleManualSkill = useCallback(async (skill: Skill) => {
    if (!engineRef.current || !manualTurn || isExecuting || !p1Display || !p2Display) return;
    
    setIsExecuting(true);
    const engine = engineRef.current;
    const attackerId = manualTurn;
    
    const result = engine.executeSkill(attackerId, skill);
    
    // 更新显示状态
    const state = engine.getState();
    setP1Display(state.p1);
    setP2Display(state.p2);
    
    // 同步 HP 到 store（用于 GameOver 判断）
    updatePlayer1Hp(state.p1.hp);
    updatePlayer2Hp(state.p2.hp);
    
    // 添加日志
    addBattleLog(result.log);
    
    // 播放动画效果
    await playLogEffects(result.log);
    
    // 等待动画完成
    await new Promise(r => setTimeout(r, result.isUltimate ? 800 : 600));
    
    // 检查战斗是否结束
    if (engine.isBattleOver()) {
      const winner = engine.getWinner();
      addBattleLog({
        id: `turn-end-${Date.now()}`,
        turn: state.currentTurn,
        attacker: 'system',
        message: `【${winner === 'player1' ? state.p1.name : state.p2.name}】获得了胜利！`
      });
      await new Promise(r => setTimeout(r, 1500));
      setWinner(winner);
      setIsExecuting(false);
      return;
    }
    
    // 切换到下一个玩家
    setManualTurn(attackerId === 'player1' ? 'player2' : 'player1');
    setIsExecuting(false);
  }, [manualTurn, isExecuting, p1Display, p2Display, addBattleLog, updatePlayer1Hp, updatePlayer2Hp, setWinner, playLogEffects]);

  if (!player1 || !player2) return null;

  // 手动模式使用 engine 状态，自动模式使用 store 状态
  const leftChar = battleMode === 'manual' ? (p1Display || player1) : player1;
  const rightChar = battleMode === 'manual' ? (p2Display || player2) : player2;

  return (
    <div className={`min-h-screen flex flex-col p-4 md:p-8 relative overflow-hidden grid-bg ${shakeScreen ? 'shake' : ''}`}>
      <ParticleField count={35} colors={['#66FCF1', '#FF003C', '#FFD700']} />

      {/* VS center spotlight */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-yellow-500/30 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Ultimate Full-Screen Overlay */}
      <AnimatePresence>
        {ultimateOverlay && (
          <UltimateOverlayView overlay={ultimateOverlay} />
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center mb-8 z-10"
      >
        <h2 className="text-3xl md:text-4xl font-black tracking-[0.3em] text-[#C5C6C7] flex items-center justify-center gap-4 font-display">
          <Swords className="text-red-500" size={28} style={{ filter: 'drop-shadow(0 0 6px red)' }} />
          <span data-text="BATTLE ARENA" className="glitch-text">BATTLE ARENA</span>
          <Swords className="text-red-500" size={28} style={{ filter: 'drop-shadow(0 0 6px red)' }} />
        </h2>
        <div className="text-xs text-[#8a8d91] mt-1 tracking-widest flex items-center justify-center gap-2">
          {battleMode === 'auto' ? (
            <><Bot size={12} /> ▼ AUTO COMBAT IN PROGRESS ▼</>
          ) : (
            <><Hand size={12} /> ▼ MANUAL MODE — {manualTurn === 'player1' ? 'PLAYER 1' : 'PLAYER 2'} TURN ▼</>
          )}
        </div>
      </motion.div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 items-stretch max-w-7xl w-full mx-auto z-10">
        <CharacterCard 
          char={leftChar} 
          isLeft={true} 
          beingHit={hitSide === 'left'} 
          isAttacking={attackerSide === 'left'}
          isActiveTurn={battleMode === 'manual' && manualTurn === 'player1' && !isExecuting}
          popups={popups.left}
        />

        <div className="flex-1 flex flex-col bg-[#0B0C10]/90 border-2 border-[#45A29E]/40 rounded-xl overflow-hidden shadow-2xl relative backdrop-blur-md min-h-[400px]">
          {/* Header bar */}
          <div className="bg-gradient-to-r from-[#1F2833] via-[#0B0C10] to-[#1F2833] p-3 text-center text-xs font-black tracking-[0.3em] border-b border-[#45A29E]/30 flex justify-between items-center">
            <span className="text-[#66FCF1] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              REC
            </span>
            <span className="text-[#C5C6C7]">▶ COMBAT LOG ◀</span>
            <span className="text-[#FF003C]">TURN {battleLogs.length}</span>
          </div>
          <div className="h-[520px] p-4 overflow-y-auto flex flex-col gap-2 text-sm relative">
            <AnimatePresence initial={false}>
              {battleLogs.map((log) => {
                let colorClass = 'text-[#C5C6C7]';
                let borderClass = 'border-[#45A29E]';
                if (log.attacker === 'player1') { colorClass = 'text-[#66FCF1]'; borderClass = 'border-[#66FCF1]'; }
                if (log.attacker === 'player2') { colorClass = 'text-[#FF003C]'; borderClass = 'border-[#FF003C]'; }
                if (log.attacker === 'system') { colorClass = 'text-yellow-400 font-bold'; borderClass = 'border-yellow-400'; }
                if (log.isUltimate) { colorClass = 'text-[#FFD700] font-bold'; borderClass = 'border-[#FFD700]'; }

                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: log.attacker === 'player1' ? -40 : log.attacker === 'player2' ? 40 : 0, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                    className={`py-2 px-3 pr-16 rounded bg-[#1F2833]/60 border-l-4 ${borderClass} relative leading-relaxed ${log.isUltimate ? 'shadow-[0_0_15px_rgba(255,215,0,0.5)]' : ''}`}
                  >
                    {log.isUltimate && (
                      <span className="absolute top-1/2 -translate-y-1/2 right-2 text-[10px] px-1.5 py-0.5 font-bold rounded tracking-wider bg-[#FFD700] text-[#0B0C10] animate-pulse">
                        ★ ULT
                      </span>
                    )}
                    {!log.isUltimate && (log.isSkill || log.heal) && (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 right-2 text-[10px] px-1.5 py-0.5 font-bold rounded tracking-wider"
                        style={{ backgroundColor: log.attacker === 'player1' ? '#66FCF1' : '#FF003C', color: '#0B0C10' }}
                      >
                        {log.heal ? 'HEAL' : 'SKILL'}
                      </span>
                    )}
                    <span className={colorClass}>{log.message}</span>
                    {log.isCrit && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="ml-2 text-yellow-400 font-black animate-pulse text-[11px] tracking-wider"
                      >
                        ★ CRIT!
                      </motion.span>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={logsEndRef} />
          </div>

          {/* 手动模式：技能选择面板 */}
          {battleMode === 'manual' && manualTurn && (
            <div className="border-t-2 border-[#45A29E]/40 p-4 bg-[#0B0C10]/95">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-black tracking-wider flex items-center gap-2" 
                  style={{ color: manualTurn === 'player1' ? '#66FCF1' : '#FF003C' }}>
                  {manualTurn === 'player1' ? <><Zap size={14} /> PLAYER 1 选择技能</> : <><Zap size={14} /> PLAYER 2 选择技能</>}
                </div>
                <div className="text-[10px] text-[#8a8d91] tracking-wider">
                  {isExecuting ? '执行中...' : '点击技能释放'}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(manualTurn === 'player1' ? leftChar : rightChar).skills.map((skill, i) => {
                  const currentChar = manualTurn === 'player1' ? leftChar : rightChar;
                  const isUltReady = currentChar.ultimateCharge >= ULTIMATE_THRESHOLD;
                  const themeColor = manualTurn === 'player1' ? '#66FCF1' : '#FF003C';
                  return (
                    <SkillButton
                      key={i}
                      skill={skill}
                      index={i}
                      disabled={isExecuting}
                      isUltReady={isUltReady}
                      themeColor={themeColor}
                      onClick={() => handleManualSkill(skill)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <CharacterCard 
          char={rightChar} 
          isLeft={false} 
          beingHit={hitSide === 'right'}
          isAttacking={attackerSide === 'right'}
          isActiveTurn={battleMode === 'manual' && manualTurn === 'player2' && !isExecuting}
          popups={popups.right}
        />
      </div>
    </div>
  );
};
