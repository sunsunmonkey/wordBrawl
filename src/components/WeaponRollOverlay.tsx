import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sword, Sparkles, Zap, Shield, Activity } from 'lucide-react';
import type { Weapon } from '../data/weapons';
import { RARITY_COLOR, RARITY_LABEL, TYPE_LABEL } from '../data/weapons';

interface RollEntry {
  /** 玩家标识，仅用于左/右配色 */
  side: 'left' | 'right';
  /** 头部展示用的玩家名 */
  playerName: string;
  /** 抽到的武器 */
  weapon: Weapon;
}

interface WeaponRollOverlayProps {
  /** 当前要揭晓的武器抽取条目，null 表示关闭 */
  entry: RollEntry | null;
  /** 揭晓动画完整结束（按"下一步"或自动 5s）后回调 */
  onContinue: () => void;
}

/**
 * 武器随机抽取的全屏揭晓动画。
 * 展示阶段：spinning(滚动) → revealed(揭晓) → 等待用户点击继续。
 */
export const WeaponRollOverlay: React.FC<WeaponRollOverlayProps> = ({ entry, onContinue }) => {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), 1600);
    return () => clearTimeout(t);
  }, [entry]);

  if (!entry) return null;

  const { weapon, side, playerName } = entry;
  const sideColor = side === 'left' ? '#66FCF1' : '#FF003C';
  const rarityColor = RARITY_COLOR[weapon.rarity];

  return (
    <AnimatePresence>
      <motion.div
        key={`${entry.side}-${entry.weapon.id}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.9)' }}
      >
        {/* 背景放射光（揭晓后亮起） */}
        <AnimatePresence>
          {revealed && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 3, opacity: 0.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="absolute w-[800px] h-[800px] rounded-full"
              style={{
                background: `conic-gradient(from 0deg, transparent, ${rarityColor}, transparent, ${sideColor}, transparent)`,
              }}
            />
          )}
        </AnimatePresence>

        {/* 顶部标题 */}
        <div className="absolute top-12 left-0 right-0 text-center pointer-events-none">
          <div
            className="text-xs tracking-[0.5em] mb-2"
            style={{ color: sideColor, textShadow: `0 0 10px ${sideColor}` }}
          >
            ▼ WEAPON DROP ▼
          </div>
          <div className="text-2xl font-black font-display tracking-wider text-white">
            {playerName}
          </div>
        </div>

        {/* 中心武器卡片 */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
          className="relative z-10 w-[360px] md:w-[420px] rounded-xl overflow-hidden border-4"
          style={{
            borderColor: revealed ? rarityColor : '#45A29E',
            boxShadow: revealed
              ? `0 0 60px ${rarityColor}, 0 0 120px ${rarityColor}66`
              : `0 0 30px ${sideColor}66`,
            background: '#0B0C10',
          }}
        >
          {/* 武器图（滚动期间用 spin 动画，揭晓后稳定） */}
          <div className="relative w-full aspect-square overflow-hidden bg-[#1F2833]">
            {!revealed && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Sword size={120} style={{ color: sideColor, filter: `drop-shadow(0 0 16px ${sideColor})` }} />
              </motion.div>
            )}

            <AnimatePresence>
              {revealed && (
                <motion.img
                  key="weapon-img"
                  initial={{ scale: 1.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  src={weapon.imageUrl}
                  alt={weapon.name}
                  className="absolute inset-0 w-full h-full object-cover"
                  transition={{ duration: 0.5 }}
                />
              )}
            </AnimatePresence>

            {/* 闪光叠加 */}
            {revealed && (
              <motion.div
                initial={{ x: '-110%' }}
                animate={{ x: '110%' }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `linear-gradient(110deg, transparent 30%, ${rarityColor}cc 50%, transparent 70%)`,
                  mixBlendMode: 'screen',
                }}
              />
            )}

            {/* 稀有度角标 */}
            <AnimatePresence>
              {revealed && (
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="absolute top-3 left-3 px-2 py-1 rounded text-[10px] font-black tracking-widest"
                  style={{
                    background: rarityColor,
                    color: '#0B0C10',
                    boxShadow: `0 0 12px ${rarityColor}`,
                  }}
                >
                  {RARITY_LABEL[weapon.rarity].toUpperCase()}
                </motion.div>
              )}
            </AnimatePresence>

            {/* 类型角标 */}
            <AnimatePresence>
              {revealed && (
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.05 }}
                  className="absolute top-3 right-3 px-2 py-1 rounded text-[10px] font-bold tracking-widest border"
                  style={{
                    borderColor: rarityColor,
                    color: rarityColor,
                    background: 'rgba(11,12,16,0.7)',
                  }}
                >
                  {TYPE_LABEL[weapon.type]}
                </motion.div>
              )}
            </AnimatePresence>

            {/* 神话级粒子 */}
            {revealed && (weapon.rarity === 'mythic' || weapon.rarity === 'legendary') && (
              <>
                {[...Array(weapon.rarity === 'mythic' ? 14 : 8)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ x: '50%', y: '50%', opacity: 0, scale: 0 }}
                    animate={{
                      x: `${50 + Math.cos(i * 30 * Math.PI / 180) * 60}%`,
                      y: `${50 + Math.sin(i * 30 * Math.PI / 180) * 60}%`,
                      opacity: [0, 1, 0],
                      scale: [0, 1.3, 0.5],
                    }}
                    transition={{ duration: 1.6, delay: i * 0.05, repeat: Infinity, repeatDelay: 0.8 }}
                    className="absolute top-0 left-0 w-2 h-2 rounded-full pointer-events-none"
                    style={{ background: rarityColor, boxShadow: `0 0 10px ${rarityColor}` }}
                  />
                ))}
              </>
            )}
          </div>

          {/* 武器名 + 描述 + 属性 */}
          <div className="p-4 space-y-3">
            <AnimatePresence>
              {revealed ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="flex items-center justify-between">
                    <h3
                      className="text-2xl font-black font-display tracking-wider flex items-center gap-2"
                      style={{ color: rarityColor, textShadow: `0 0 12px ${rarityColor}` }}
                    >
                      <Sparkles size={20} />
                      {weapon.name}
                    </h3>
                  </div>
                  <p className="text-xs text-[#8a8d91] mt-1 leading-relaxed">{weapon.description}</p>

                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs font-bold">
                    <StatChip
                      icon={<Zap size={12} className="text-yellow-400" />}
                      label="ATK"
                      value={`+${weapon.attackBonus}`}
                      color="#FFD700"
                    />
                    <StatChip
                      icon={<Shield size={12} className="text-pink-400" />}
                      label="CRIT"
                      value={weapon.critBonus ? `+${weapon.critBonus}%` : '—'}
                      color={weapon.critBonus ? '#FF6B9D' : '#45A29E'}
                    />
                    <StatChip
                      icon={<Activity size={12} className="text-green-400" />}
                      label="SPD"
                      value={
                        weapon.speedBonus !== undefined && weapon.speedBonus !== 0
                          ? `${weapon.speedBonus > 0 ? '+' : ''}${weapon.speedBonus}`
                          : '—'
                      }
                      color={weapon.speedBonus && weapon.speedBonus < 0 ? '#FF003C' : '#22ff88'}
                    />
                  </div>
                </motion.div>
              ) : (
                <div className="text-center py-2">
                  <div className="text-sm tracking-[0.4em] font-black" style={{ color: sideColor }}>
                    ROLLING...
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* 底部继续按钮 */}
        <AnimatePresence>
          {revealed && (
            <motion.button
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.4 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onContinue}
              className="absolute bottom-12 px-8 py-3 rounded-lg border-2 font-black tracking-[0.3em] text-sm"
              style={{
                borderColor: sideColor,
                color: sideColor,
                background: `${sideColor}11`,
                boxShadow: `0 0 20px ${sideColor}66`,
              }}
            >
              ▼ 装备并继续 ▼
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

const StatChip: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({
  icon,
  label,
  value,
  color,
}) => (
  <div
    className="flex flex-col items-center gap-0.5 py-1.5 rounded border"
    style={{ borderColor: `${color}55`, background: `${color}11` }}
  >
    {icon}
    <span className="text-[9px] tracking-widest text-[#8a8d91]">{label}</span>
    <span style={{ color }}>{value}</span>
  </div>
);
