import React, { useMemo, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useRosterStore } from '../store/useRosterStore';
import { motion } from 'framer-motion';
import { Trophy, RotateCcw, Skull, Crown, UserPlus, Check, Sparkles, Zap, Heart } from 'lucide-react';
import { ParticleField } from './ParticleField';
import { BackButton } from './BackButton';

export const GameOverScreen: React.FC = () => {
  const { winner, player1, player2, resetGame, setPhase } = useGameStore();
  const { roster, recruitCharacter } = useRosterStore();
  const [winnerImgFailed, setWinnerImgFailed] = useState(false);
  const [loserImgFailed, setLoserImgFailed] = useState(false);
  const [recruitedKeys, setRecruitedKeys] = useState<Set<'p1' | 'p2'>>(new Set());

  const isAlreadyInRoster = useMemo(() => {
    return (name: string | undefined) => {
      if (!name) return false;
      return roster.some((r) => r.name === name);
    };
  }, [roster]);

  if (!winner || !player1 || !player2) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#66FCF1] font-display tracking-widest">
        CALCULATING RESULT...
      </div>
    );
  }

  const winnerData = winner === 'player1' ? player1 : player2;
  const loserData = winner === 'player1' ? player2 : player1;
  const themeColor = winner === 'player1' ? '#66FCF1' : '#FF003C';
  const themeRgb = winner === 'player1' ? '102, 252, 241' : '255, 0, 60';
  const loserColor = winner === 'player1' ? '#FF003C' : '#66FCF1';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden grid-bg">
      <ParticleField count={50} colors={[themeColor, '#FFD700', '#FFFFFF']} />
      <BackButton onClick={() => setPhase('MODE_SELECT')} color={themeColor} className="absolute left-6 top-6 z-20" />

      <motion.div
        animate={{ x: [0, 60, 0], y: [0, -30, 0] }}
        transition={{ duration: 12, repeat: Infinity }}
        className="absolute top-1/4 left-1/3 w-[400px] h-[400px] rounded-full blur-[150px] z-0 opacity-40"
        style={{ backgroundColor: themeColor }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0.45, duration: 0.8 }}
        className="z-10 flex flex-col items-center max-w-2xl w-full bg-[#1F2833]/80 backdrop-blur-xl border-2 rounded-2xl p-8 shadow-2xl relative corner-frame crt-flicker"
        style={{
          borderColor: themeColor,
          color: themeColor,
          boxShadow: `0 0 50px rgba(${themeRgb}, 0.5), inset 0 0 30px rgba(${themeRgb}, 0.05)`,
        }}
      >
        <motion.div
          animate={{ y: [0, -10, 0], rotate: [0, 4, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="mb-2"
        >
          <Crown size={56} style={{ color: '#FFD700', filter: 'drop-shadow(0 0 14px #FFD700)' }} />
        </motion.div>

        <h1
          data-text="VICTORY"
          className="glitch-text text-5xl md:text-6xl font-black tracking-[0.3em] mb-2 font-display"
          style={{ color: '#FFD700', textShadow: '0 0 14px rgba(255, 215, 0, 0.7)' }}
        >
          VICTORY
        </h1>
        <div className="text-xs text-[#8a8d91] tracking-[0.4em] mb-8">▼ LAST STANDING ▼</div>

        <div className="flex items-center justify-center gap-6 mb-8 w-full">
          {/* Loser (small, dim) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6, x: winner === 'player1' ? 30 : -30 }}
            animate={{ opacity: 0.55, scale: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col items-center"
            style={{ order: winner === 'player1' ? 2 : 0 }}
          >
            <div
              className="w-20 h-20 md:w-24 md:h-24 rounded-lg overflow-hidden border-2 grayscale"
              style={{ borderColor: loserColor, boxShadow: `0 0 12px rgba(${winner === 'player1' ? '255, 0, 60' : '102, 252, 241'}, 0.3)` }}
            >
              {loserData.imageUrl && !loserImgFailed ? (
                <img
                  src={loserData.imageUrl}
                  alt={loserData.name}
                  onError={() => setLoserImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-black italic font-display bg-[#0B0C10]" style={{ color: loserColor }}>
                  {loserData.name?.[0] || '?'}
                </div>
              )}
            </div>
            <Skull size={14} className="mt-2 text-[#8a8d91]" />
            <div className="text-[10px] text-[#8a8d91] mt-1 max-w-[100px] truncate text-center">{loserData.name}</div>
          </motion.div>

          {/* VS */}
          <div className="text-2xl font-black font-display text-[#8a8d91]" style={{ order: 1 }}>VS</div>

          {/* Winner (large, glow) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6, x: winner === 'player1' ? -30 : 30 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ delay: 0.6, type: 'spring' }}
            className="flex flex-col items-center"
            style={{ order: winner === 'player1' ? 0 : 2 }}
          >
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                className="absolute -inset-3 rounded-2xl border-2 border-dashed pointer-events-none"
                style={{ borderColor: themeColor, opacity: 0.4 }}
              />
              <div
                className="w-40 h-40 md:w-48 md:h-48 rounded-lg overflow-hidden border-4 pulse-glow relative"
                style={{
                  borderColor: themeColor,
                  color: themeColor,
                  boxShadow: `0 0 30px rgba(${themeRgb}, 0.8)`,
                }}
              >
                {winnerData.imageUrl && !winnerImgFailed ? (
                  <img
                    src={winnerData.imageUrl}
                    alt={winnerData.name}
                    onError={() => setWinnerImgFailed(true)}
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
                    {winnerData.name?.[0] || '?'}
                  </div>
                )}
              </div>
              <Trophy
                size={28}
                className="absolute -top-3 -right-3"
                style={{ color: '#FFD700', filter: 'drop-shadow(0 0 8px #FFD700)' }}
              />
            </div>
          </motion.div>
        </div>

        <h2
          className="text-3xl md:text-4xl font-black italic mb-2 text-center font-display tracking-wider"
          style={{ color: themeColor, textShadow: `0 0 12px ${themeColor}` }}
        >
          {winnerData.name}
        </h2>
        <div className="text-xs text-[#8a8d91] mb-6 tracking-widest">
          残余生命 {winnerData.hp} / {winnerData.maxHp}
        </div>

        {/* 收入麾下 · 左 P1(蓝) / 右 P2(红) */}
        <div className="w-full mb-6">
          <div className="flex items-center justify-center gap-2 text-[10px] text-[#8a8d91] tracking-[0.3em] mb-3">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#45A29E]/60 to-transparent" />
            <Sparkles size={10} className="text-[#FFD700]" />
            <span>RECRUIT · 收入麾下</span>
            <Sparkles size={10} className="text-[#FFD700]" />
            <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[#45A29E]/60 to-transparent" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([
              { key: 'p1' as const, data: player1, color: '#66FCF1', rgb: '102, 252, 241', label: 'PLAYER 1' },
              { key: 'p2' as const, data: player2, color: '#FF003C', rgb: '255, 0, 60', label: 'PLAYER 2' },
            ]).map(({ key, data, color, rgb, label }, idx) => {
              const isRecruited = recruitedKeys.has(key);
              const alreadyOwned = isAlreadyInRoster(data.name);
              const isPreset = !!data.isPreset;
              const disabled = isRecruited || alreadyOwned || isPreset;
              return (
                <motion.button
                  key={key}
                  type="button"
                  initial={{ opacity: 0, y: 24, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.9 + idx * 0.12, type: 'spring', bounce: 0.4 }}
                  whileHover={disabled ? {} : { y: -3, scale: 1.02 }}
                  whileTap={disabled ? {} : { scale: 0.97 }}
                  onClick={() => {
                    if (disabled) return;
                    recruitCharacter(data, data.sourceDescription);
                    setRecruitedKeys((prev) => new Set(prev).add(key));
                  }}
                  disabled={disabled}
                  className="group relative flex flex-col overflow-hidden rounded-lg border-2 bg-[#0B0C10]/85 backdrop-blur-sm transition-all disabled:cursor-default"
                  style={{
                    borderColor: disabled ? `${color}55` : color,
                    boxShadow: disabled ? 'none' : `0 0 18px rgba(${rgb}, 0.45), inset 0 0 18px rgba(${rgb}, 0.08)`,
                  }}
                >
                  {/* 扫描线条流光（hover 时显示） */}
                  {!disabled && (
                    <motion.div
                      className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                      animate={{ x: ['-120%', '120%'] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                      style={{
                        background: `linear-gradient(90deg, transparent, rgba(${rgb}, 0.35), transparent)`,
                      }}
                    />
                  )}

                  {/* 顶部条：玩家标签 */}
                  <div
                    className="relative flex items-center justify-between px-2.5 py-1 text-[9px] font-display tracking-[0.3em]"
                    style={{
                      background: `linear-gradient(90deg, rgba(${rgb}, 0.25), transparent)`,
                      color,
                    }}
                  >
                    <span>{label}</span>
                    <span className="opacity-70">{key === 'p1' ? '◤ BLUE' : 'RED ◥'}</span>
                  </div>

                  {/* 主体：头像 + 名字 + 状态 */}
                  <div className="flex items-center gap-3 p-3 relative">
                    <div className="relative flex-shrink-0">
                      <motion.div
                        animate={disabled ? {} : { rotate: 360 }}
                        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                        className="absolute -inset-1 rounded-md border border-dashed pointer-events-none"
                        style={{ borderColor: `${color}66` }}
                      />
                      <div
                        className="w-14 h-14 rounded-md overflow-hidden border-2 bg-[#1F2833]"
                        style={{
                          borderColor: color,
                          boxShadow: `0 0 12px rgba(${rgb}, 0.5)`,
                          filter: disabled ? 'grayscale(0.4)' : 'none',
                        }}
                      >
                        {data.imageUrl ? (
                          <img src={data.imageUrl} alt={data.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl font-black font-display" style={{ color }}>
                            {data.name?.[0] || '?'}
                          </div>
                        )}
                      </div>
                      {/* 角标：胜者 trophy / 败者 skull */}
                      {key === (winner === 'player1' ? 'p1' : 'p2') ? (
                        <Trophy
                          size={14}
                          className="absolute -top-1 -right-1"
                          style={{ color: '#FFD700', filter: 'drop-shadow(0 0 6px #FFD700)' }}
                        />
                      ) : (
                        <Skull size={12} className="absolute -top-1 -right-1 text-[#8a8d91]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div
                        className="text-sm font-bold font-display truncate"
                        style={{ color, textShadow: disabled ? 'none' : `0 0 6px ${color}` }}
                      >
                        {data.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] text-[#8a8d91] mt-0.5">
                        <Heart size={9} className="text-pink-400" /> {data.maxHp}
                        <Zap size={9} className="text-yellow-400 ml-1" /> {data.attack}
                      </div>
                      <div
                        className="mt-1 inline-flex items-center gap-1 text-[9px] font-display tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          background: disabled ? '#0B0C10' : `rgba(${rgb}, 0.18)`,
                          color: disabled ? '#8a8d91' : color,
                          border: `1px solid ${disabled ? '#3a3d42' : color}`,
                        }}
                      >
                        {disabled ? <Check size={10} /> : <UserPlus size={10} />}
                        {isPreset ? '预设角色' : alreadyOwned ? '已在麾下' : isRecruited ? '已收入' : '收入麾下'}
                      </div>
                    </div>
                  </div>

                  {/* 收入成功的发光闪光 */}
                  {isRecruited && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.8, 0] }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: `radial-gradient(circle at center, rgba(${rgb}, 0.6) 0%, transparent 70%)`,
                      }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
          <div className="text-[9px] text-[#8a8d91] mt-2 text-center tracking-wider">
            收入后可在主菜单 · 我的麾下中查看详情
          </div>
        </div>

        <button
          onClick={resetGame}
          className="w-full group relative flex items-center justify-center gap-2 bg-[#0B0C10] border-2 text-white font-bold py-4 px-6 rounded font-display tracking-[0.3em] overflow-hidden transition-all hover:text-[#0B0C10]"
          style={{ borderColor: themeColor, boxShadow: `0 0 18px rgba(${themeRgb}, 0.4)` }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = themeColor; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0B0C10'; }}
        >
          <RotateCcw size={20} className="group-hover:-rotate-180 transition-transform duration-500" />
          PLAY AGAIN
        </button>
      </motion.div>
    </div>
  );
};
