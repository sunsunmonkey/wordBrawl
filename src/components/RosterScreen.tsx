import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Heart, Zap, Shield, Gauge, UsersRound, Sword } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { useRosterStore } from '../store/useRosterStore';
import { CharacterDetailModal } from './CharacterDetailModal';
import { ParticleField } from './ParticleField';

export const RosterScreen: React.FC = () => {
  const setPhase = useGameStore((s) => s.setPhase);
  const { roster, removeCharacter } = useRosterStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const themeColor = '#66FCF1';
  const themeRgb = '102, 252, 241';

  const selected = selectedId ? roster.find((r) => r.rosterId === selectedId) : null;

  return (
    <div className="min-h-screen flex flex-col items-center p-6 relative overflow-hidden grid-bg">
      <ParticleField count={25} colors={[themeColor, '#FFD700']} />

      <motion.div
        animate={{ x: [0, 60, 0], y: [0, -30, 0] }}
        transition={{ duration: 14, repeat: Infinity }}
        className="absolute top-10 left-10 w-72 h-72 rounded-full blur-[140px] z-0 opacity-30"
        style={{ backgroundColor: themeColor }}
      />

      <div className="z-10 w-full max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => setPhase('WELCOME')}
            className="flex items-center gap-1 text-xs text-[#8a8d91] hover:text-[#66FCF1] transition-colors"
          >
            <ArrowLeft size={14} /> 返回
          </button>
          <div className="ml-auto flex items-center gap-2 text-[#8a8d91] text-[10px] tracking-widest">
            <span className="inline-block w-2 h-2 rounded-full bg-[#66FCF1] animate-pulse" />
            ROSTER ARCHIVE
          </div>
        </div>

        <div
          className="bg-[#1F2833]/80 backdrop-blur-md border-2 rounded-xl p-6 corner-frame crt-flicker"
          style={{
            borderColor: themeColor,
            boxShadow: `0 0 30px rgba(${themeRgb}, 0.3), inset 0 0 30px rgba(${themeRgb}, 0.05)`,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <UsersRound size={20} style={{ color: themeColor }} />
            <h1
              data-text="MY ROSTER"
              className="text-2xl md:text-3xl font-black tracking-widest font-display glitch-text"
              style={{ color: themeColor }}
            >
              我的麾下
            </h1>
            <span className="ml-auto text-xs text-[#8a8d91] tracking-widest">{roster.length} / 24</span>
          </div>
          <div className="text-[10px] text-[#8a8d91] tracking-[0.3em] mb-6">▼ LOCAL ROSTER · CLICK TO INSPECT ▼</div>

          {roster.length === 0 ? (
            <div className="h-64 rounded-lg border border-dashed flex flex-col items-center justify-center gap-2 text-sm text-[#8a8d91]"
              style={{ borderColor: `rgba(${themeRgb}, 0.25)` }}
            >
              <Sword size={28} className="opacity-40" />
              暂无角色 · 完成对战后可在结算页选择收入
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {roster.map((char) => (
                <motion.button
                  key={char.rosterId}
                  type="button"
                  onClick={() => setSelectedId(char.rosterId)}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className="relative group text-left rounded-lg overflow-hidden border-2 bg-[#0B0C10]/80 transition-all"
                  style={{ borderColor: `rgba(${themeRgb}, 0.4)` }}
                >
                  <div className="relative aspect-square overflow-hidden bg-[#1F2833]">
                    {char.imageUrl ? (
                      <img
                        src={char.imageUrl}
                        alt={char.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl font-black font-display" style={{ color: themeColor }}>
                        {char.name[0]}
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-2">
                      <div className="text-xs font-bold font-display truncate" style={{ color: themeColor }}>
                        {char.name}
                      </div>
                    </div>
                  </div>
                  <div className="p-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                    <span className="flex items-center gap-1 text-[#C5C6C7]">
                      <Heart size={9} className="text-pink-400" /> {char.maxHp}
                    </span>
                    <span className="flex items-center gap-1 text-[#C5C6C7]">
                      <Zap size={9} className="text-yellow-400" /> {char.attack}
                    </span>
                    <span className="flex items-center gap-1 text-[#C5C6C7]">
                      <Shield size={9} className="text-blue-400" /> {char.defense}
                    </span>
                    <span className="flex items-center gap-1 text-[#C5C6C7]">
                      <Gauge size={9} className="text-green-400" /> {char.speed}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <CharacterDetailModal
            key={selected.rosterId}
            character={selected}
            onClose={() => setSelectedId(null)}
            onRemove={() => {
              removeCharacter(selected.rosterId);
              setSelectedId(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
