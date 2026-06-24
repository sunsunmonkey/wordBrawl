import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { motion } from 'framer-motion';
import { Trophy, RotateCcw, Skull, Crown } from 'lucide-react';
import { ParticleField } from './ParticleField';

export const GameOverScreen: React.FC = () => {
  const { winner, player1, player2, resetGame } = useGameStore();
  const [winnerImgFailed, setWinnerImgFailed] = useState(false);
  const [loserImgFailed, setLoserImgFailed] = useState(false);

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
            initial={{ opacity: 0, scale: 0.6, x: -30 }}
            animate={{ opacity: 0.55, scale: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col items-center"
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
          <div className="text-2xl font-black font-display text-[#8a8d91]">VS</div>

          {/* Winner (large, glow) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6, x: 30 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ delay: 0.6, type: 'spring' }}
            className="flex flex-col items-center"
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
        <div className="text-xs text-[#8a8d91] mb-8 tracking-widest">
          残余生命 {winnerData.hp} / {winnerData.maxHp}
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
