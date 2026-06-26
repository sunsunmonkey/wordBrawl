import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { evolutionLabel } from '../utils/towerProgress';
import type { EvolutionStage } from '../store/useRosterStore';

type AnimPhase = 'charge' | 'break' | 'flash' | 'reveal' | 'settle';

interface Props {
  oldImageUrl?: string;
  newImageUrl: string | null;
  stage: 1 | 2 | 3;
  characterName: string;
  onFinish: () => void;
}

const STAGE_THEME: Record<1 | 2 | 3, { primary: string; secondary: string; rgb: string }> = {
  1: { primary: '#FFD700', secondary: '#FF9F0A', rgb: '255, 215, 0' },
  2: { primary: '#66FCF1', secondary: '#45A29E', rgb: '102, 252, 241' },
  3: { primary: '#C77DFF', secondary: '#FF6BFF', rgb: '199, 125, 255' },
};

/**
 * 进化炫酷动画：旧形态 -> 能量汇聚 -> 闪光爆裂 -> 新形态揭示。
 * 新图片未加载完前，会循环 charge 状态保持张力。
 */
export const EvolutionAnimation: React.FC<Props> = ({
  oldImageUrl,
  newImageUrl,
  stage,
  characterName,
  onFinish,
}) => {
  const [phase, setPhase] = useState<AnimPhase>('charge');
  const theme = STAGE_THEME[stage];

  // 在新图未就绪前持续 charge；图就绪后立刻往后推进
  useEffect(() => {
    if (phase !== 'charge') return;
    if (!newImageUrl) return; // 等图
    // 至少让 charge 跑满 1.6 秒，避免新图秒到时观感太突兀
    const t = setTimeout(() => setPhase('break'), 1600);
    return () => clearTimeout(t);
  }, [newImageUrl, phase]);

  useEffect(() => {
    if (phase === 'break') {
      const t = setTimeout(() => setPhase('flash'), 600);
      return () => clearTimeout(t);
    }
    if (phase === 'flash') {
      const t = setTimeout(() => setPhase('reveal'), 420);
      return () => clearTimeout(t);
    }
    if (phase === 'reveal') {
      const t = setTimeout(() => setPhase('settle'), 1800);
      return () => clearTimeout(t);
    }
    if (phase === 'settle') {
      const t = setTimeout(() => onFinish(), 1100);
      return () => clearTimeout(t);
    }
  }, [phase, onFinish]);

  const showNew = phase === 'reveal' || phase === 'settle';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md"
      style={{
        background: `radial-gradient(circle at center, rgba(${theme.rgb},0.18) 0%, rgba(11,12,16,0.92) 60%, #0B0C10 100%)`,
      }}
    >
      {/* 背景旋转光环 */}
      <motion.div
        className="absolute w-[640px] h-[640px] rounded-full pointer-events-none"
        style={{
          background: `conic-gradient(from 0deg, transparent, ${theme.primary}88, transparent, ${theme.secondary}88, transparent)`,
          filter: 'blur(36px)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
      />

      {/* 二级反向光环 */}
      <motion.div
        className="absolute w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{
          border: `2px solid ${theme.primary}66`,
          boxShadow: `0 0 60px ${theme.primary}aa, inset 0 0 60px ${theme.primary}55`,
        }}
        animate={{
          scale: phase === 'charge' ? [0.85, 1.05, 0.85] : phase === 'break' ? [1, 1.4] : 1,
          opacity: phase === 'flash' ? 0 : 1,
        }}
        transition={{
          duration: phase === 'charge' ? 1.4 : 0.45,
          repeat: phase === 'charge' ? Infinity : 0,
          ease: 'easeInOut',
        }}
      />

      {/* 汇聚的粒子（charge 阶段） */}
      {phase === 'charge' &&
        Array.from({ length: 16 }).map((_, i) => {
          const angle = (i / 16) * Math.PI * 2;
          const radius = 260;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          return (
            <motion.div
              key={`p-${i}`}
              className="absolute w-2 h-2 rounded-full pointer-events-none"
              style={{
                background: theme.primary,
                boxShadow: `0 0 18px ${theme.primary}`,
              }}
              initial={{ x, y, opacity: 0 }}
              animate={{ x: 0, y: 0, opacity: [0, 1, 0] }}
              transition={{
                duration: 1.1,
                delay: (i % 8) * 0.08,
                repeat: Infinity,
                ease: 'easeIn',
              }}
            />
          );
        })}

      {/* 中心头像区 */}
      <div className="relative w-64 h-64 flex items-center justify-center">
        <AnimatePresence>
          {!showNew && oldImageUrl && phase !== 'flash' && (
            <motion.div
              key="old-avatar"
              className="absolute inset-0 rounded-full overflow-hidden"
              style={{
                boxShadow: `0 0 60px ${theme.primary}cc, inset 0 0 40px ${theme.primary}88`,
                border: `3px solid ${theme.primary}`,
              }}
              initial={{ scale: 1, opacity: 1, filter: 'brightness(1)' }}
              animate={
                phase === 'charge'
                  ? {
                      scale: [1, 1.04, 0.98, 1],
                      filter: [
                        'brightness(1) saturate(1)',
                        `brightness(1.4) saturate(1.5) drop-shadow(0 0 24px ${theme.primary})`,
                        'brightness(1.1) saturate(1.2)',
                      ],
                      x: [0, -2, 3, -3, 2, 0],
                      y: [0, 2, -1, 2, -2, 0],
                    }
                  : phase === 'break'
                    ? { scale: [1, 1.5], opacity: [1, 0], filter: 'brightness(2.5)' }
                    : { scale: 1, opacity: 1 }
              }
              transition={
                phase === 'charge'
                  ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.55, ease: 'easeOut' }
              }
              exit={{ opacity: 0 }}
            >
              <img src={oldImageUrl} alt="old-form" className="w-full h-full object-cover" />
              {/* 能量遮罩 */}
              <motion.div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(circle at center, transparent 30%, ${theme.primary}44 70%, ${theme.primary}aa 100%)`,
                  mixBlendMode: 'screen',
                }}
                animate={{ opacity: phase === 'charge' ? [0.4, 0.9, 0.4] : 1 }}
                transition={{ duration: 0.9, repeat: Infinity }}
              />
            </motion.div>
          )}

          {phase === 'flash' && (
            <motion.div
              key="flash-burst"
              className="absolute -inset-40 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, #ffffff 0%, ${theme.primary} 25%, transparent 70%)`,
              }}
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: 2.5, opacity: [0, 1, 0] }}
              transition={{ duration: 0.42, ease: 'easeOut' }}
            />
          )}

          {showNew && newImageUrl && (
            <motion.div
              key="new-avatar"
              className="absolute inset-0 rounded-full overflow-hidden"
              style={{
                boxShadow: `0 0 80px ${theme.primary}, inset 0 0 50px ${theme.primary}aa`,
                border: `4px solid ${theme.primary}`,
              }}
              initial={{ scale: 0.2, opacity: 0, rotate: -90, filter: 'brightness(3)' }}
              animate={{ scale: 1, opacity: 1, rotate: 0, filter: 'brightness(1)' }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <img src={newImageUrl} alt="new-form" className="w-full h-full object-cover" />
              {/* 持续金光晕 */}
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at center, transparent 55%, ${theme.primary}33 100%)`,
                }}
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 爆裂粒子（reveal 阶段） */}
      {showNew &&
        Array.from({ length: 24 }).map((_, i) => {
          const angle = (i / 24) * Math.PI * 2;
          const radius = 320;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          return (
            <motion.div
              key={`burst-${i}`}
              className="absolute w-1.5 h-1.5 rounded-full pointer-events-none"
              style={{
                background: i % 2 === 0 ? theme.primary : '#ffffff',
                boxShadow: `0 0 14px ${theme.primary}`,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x, y, opacity: 0, scale: 0.2 }}
              transition={{ duration: 1.2, delay: i * 0.015, ease: 'easeOut' }}
            />
          );
        })}

      {/* 标题（reveal 之后） */}
      <AnimatePresence>
        {showNew && (
          <motion.div
            key="title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="absolute bottom-[18%] flex flex-col items-center pointer-events-none"
          >
            <div className="flex items-center gap-2 text-[10px] tracking-[0.5em]" style={{ color: theme.primary }}>
              <Sparkles size={12} /> EVOLUTION COMPLETE <Sparkles size={12} />
            </div>
            <div
              className="mt-3 text-5xl md:text-6xl font-black font-display tracking-[0.2em]"
              style={{
                color: theme.primary,
                textShadow: `0 0 32px ${theme.primary}, 0 0 64px ${theme.primary}88`,
              }}
            >
              {evolutionLabel(stage as EvolutionStage)}
            </div>
            <div className="mt-2 text-sm tracking-widest text-[#C5C6C7]">
              {characterName}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* charge 阶段提示文 */}
      <AnimatePresence>
        {phase === 'charge' && (
          <motion.div
            key="charging-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-[20%] text-center pointer-events-none"
          >
            <div
              className="text-[10px] tracking-[0.5em] mb-2"
              style={{ color: theme.primary }}
            >
              ENERGY OVERFLOW
            </div>
            <div className="text-xs text-[#C5C6C7] tracking-widest">
              {newImageUrl ? '形态正在重塑...' : 'AI 正在重塑形态...'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
