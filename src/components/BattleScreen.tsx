import React, { useEffect, useRef, useState } from 'react';
import { useGameStore, CharacterData, BattleEvent } from '../store/useGameStore';
import { BattleEngine } from '../utils/battleEngine';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Shield, Activity, Swords, Flame } from 'lucide-react';
import { ParticleField } from './ParticleField';

interface PopupDamage {
  id: string;
  side: 'left' | 'right';
  value: number;
  isCrit: boolean;
}

const CharacterCard: React.FC<{ 
  char: CharacterData; 
  isLeft: boolean;
  beingHit: boolean;
  isAttacking: boolean;
  popups: PopupDamage[];
}> = ({ char, isLeft, beingHit, isAttacking, popups }) => {
  const hpPercent = Math.max(0, (char.hp / char.maxHp) * 100);
  const themeColor = isLeft ? '#66FCF1' : '#FF003C';
  const shadowColor = isLeft ? 'rgba(102, 252, 241, 0.6)' : 'rgba(255, 0, 60, 0.6)';
  const themeRgb = isLeft ? '102, 252, 241' : '255, 0, 60';
  const [imgFailed, setImgFailed] = useState(false);

  const hpColor = hpPercent > 60 ? '#22ff88' : hpPercent > 30 ? '#FFD700' : '#FF003C';

  return (
    <motion.div 
      animate={isAttacking ? { x: isLeft ? 30 : -30, scale: 1.05 } : { x: 0, scale: 1 }}
      transition={{ duration: 0.3, type: 'spring', stiffness: 300 }}
      className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'} w-full md:w-1/3`}
    >
      <div className={`relative w-44 h-44 md:w-56 md:h-56 mb-4 ${beingHit ? 'shake' : ''}`}>
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
                  color: p.isCrit ? '#FFD700' : themeColor,
                  textShadow: `0 0 12px ${p.isCrit ? '#FFD700' : themeColor}, 0 2px 4px rgba(0,0,0,0.8)`,
                  WebkitTextStroke: '1px black',
                }}
              >
                -{p.value}
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
      <div className="w-full mb-4">
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 w-full text-xs font-bold bg-[#1F2833]/60 p-3 rounded border" style={{ borderColor: `rgba(${themeRgb}, 0.3)` }}>
        <div className="flex flex-col items-center gap-1">
          <Zap size={14} className="text-yellow-400" />
          <span className="text-yellow-400">{char.attack}</span>
          <span className="text-[10px] text-[#8a8d91]">ATK</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Shield size={14} className="text-blue-400" />
          <span className="text-blue-400">{char.defense}</span>
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
        {char.skills.map((s, i) => (
          <div key={i} className="text-[10px] text-[#8a8d91] flex items-center gap-1 truncate">
            <Flame size={10} style={{ color: themeColor }} />
            <span className="truncate">{s.name}</span>
            <span className="text-[#45A29E]">×{s.damageMultiplier.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export const BattleScreen: React.FC = () => {
  const { player1, player2, updatePlayer1Hp, updatePlayer2Hp, addBattleLog, battleLogs, setWinner } = useGameStore();
  const [isBattling, setIsBattling] = useState(false);
  const [hitSide, setHitSide] = useState<'left' | 'right' | null>(null);
  const [attackerSide, setAttackerSide] = useState<'left' | 'right' | null>(null);
  const [popups, setPopups] = useState<{ left: PopupDamage[]; right: PopupDamage[] }>({ left: [], right: [] });
  const [shakeScreen, setShakeScreen] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [battleLogs]);

  useEffect(() => {
    if (!player1 || !player2 || isBattling) return;

    const startBattle = async () => {
      setIsBattling(true);
      const engine = new BattleEngine(player1, player2);
      const result = engine.simulateBattle();

      let currentP1Hp = player1.maxHp;
      let currentP2Hp = player2.maxHp;

      for (let i = 0; i < result.logs.length; i++) {
        const log = result.logs[i];
        await new Promise(resolve => setTimeout(resolve, 1300));
        addBattleLog(log);

        if (log.damage && log.attacker !== 'system') {
          const targetSide: 'left' | 'right' = log.attacker === 'player1' ? 'right' : 'left';
          const attackerSideValue: 'left' | 'right' = log.attacker === 'player1' ? 'left' : 'right';
          
          setAttackerSide(attackerSideValue);
          setHitSide(targetSide);
          if (log.isCrit) setShakeScreen(true);

          // Add popup
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

          if (log.attacker === 'player1') {
            currentP2Hp = Math.max(0, currentP2Hp - log.damage);
            updatePlayer2Hp(currentP2Hp);
          } else {
            currentP1Hp = Math.max(0, currentP1Hp - log.damage);
            updatePlayer1Hp(currentP1Hp);
          }

          // Cleanup
          setTimeout(() => {
            setHitSide(null);
            setAttackerSide(null);
            setShakeScreen(false);
          }, 500);
          setTimeout(() => {
            setPopups(prev => ({
              ...prev,
              [targetSide]: prev[targetSide].filter(p => p.id !== popupId),
            }));
          }, 1300);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      setWinner(result.winner);
    };

    startBattle();
  }, [player1, player2, isBattling, addBattleLog, updatePlayer1Hp, updatePlayer2Hp, setWinner]);

  if (!player1 || !player2) return null;

  return (
    <div className={`min-h-screen flex flex-col p-4 md:p-8 relative overflow-hidden grid-bg ${shakeScreen ? 'shake' : ''}`}>
      <ParticleField count={35} colors={['#66FCF1', '#FF003C', '#FFD700']} />

      {/* VS center spotlight */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-yellow-500/30 to-transparent rounded-full blur-3xl" />
      </div>

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
        <div className="text-xs text-[#8a8d91] mt-1 tracking-widest">▼ AUTO COMBAT IN PROGRESS ▼</div>
      </motion.div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 items-stretch max-w-7xl w-full mx-auto z-10">
        <CharacterCard 
          char={player1} 
          isLeft={true} 
          beingHit={hitSide === 'left'} 
          isAttacking={attackerSide === 'left'}
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
          <div className="flex-1 p-4 overflow-y-auto max-h-[520px] flex flex-col gap-2 text-sm relative">
            <AnimatePresence initial={false}>
              {battleLogs.map((log) => {
                let colorClass = 'text-[#C5C6C7]';
                let borderClass = 'border-[#45A29E]';
                if (log.attacker === 'player1') { colorClass = 'text-[#66FCF1]'; borderClass = 'border-[#66FCF1]'; }
                if (log.attacker === 'player2') { colorClass = 'text-[#FF003C]'; borderClass = 'border-[#FF003C]'; }
                if (log.attacker === 'system') { colorClass = 'text-yellow-400 font-bold'; borderClass = 'border-yellow-400'; }

                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: log.attacker === 'player1' ? -40 : log.attacker === 'player2' ? 40 : 0, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                    className={`py-2 px-3 pr-16 rounded bg-[#1F2833]/60 border-l-4 ${borderClass} relative leading-relaxed`}
                  >
                    {log.isSkill && (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 right-2 text-[10px] px-1.5 py-0.5 font-bold rounded tracking-wider"
                        style={{ backgroundColor: log.attacker === 'player1' ? '#66FCF1' : '#FF003C', color: '#0B0C10' }}
                      >
                        SKILL
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
        </div>

        <CharacterCard 
          char={player2} 
          isLeft={false} 
          beingHit={hitSide === 'right'}
          isAttacking={attackerSide === 'right'}
          popups={popups.right}
        />
      </div>
    </div>
  );
};
