import React from 'react';
import { motion } from 'framer-motion';
import { Swords, Castle, UsersRound, ArrowLeft } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { useRosterStore } from '../store/useRosterStore';
import { ParticleField } from './ParticleField';

export const ModeSelectScreen: React.FC = () => {
  const { setPhase, setBattleMode, resetGame } = useGameStore();
  const rosterCount = useRosterStore((s) => s.roster.length);

  const startPvP = () => {
    resetGame();
    setBattleMode('pvp');
    setPhase('PLAYER1_CREATE');
  };

  const startTower = () => {
    setBattleMode('pve_tower');
    setPhase('TOWER_HUB');
  };

  const goRoster = () => {
    setPhase('ROSTER_VIEW');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden grid-bg">
      <ParticleField count={32} />
      <button
        type="button"
        onClick={() => setPhase('WELCOME')}
        className="absolute top-6 left-6 flex items-center gap-2 text-xs text-[#8a8d91] hover:text-[#66FCF1] transition-colors"
      >
        <ArrowLeft size={14} /> 返回
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-3xl w-full"
      >
        <div className="text-center mb-12">
          <h1
            className="text-5xl md:text-6xl font-black tracking-wider font-display"
            style={{ color: '#66FCF1', textShadow: '0 0 18px #66FCF1' }}
          >
            选择战场
          </h1>
          <p className="text-xs mt-3 tracking-[0.4em] text-[#8a8d91]">SELECT YOUR BATTLEFIELD</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          <ModeCard
            onClick={startPvP}
            icon={<Swords size={36} />}
            title="PVP 对战"
            subtitle="言语成器，一击定胜负"
            accent="#66FCF1"
            description="描述两位角色，让 AI 即兴对战，纸面强势不等于必胜。"
          />
          <ModeCard
            onClick={startTower}
            icon={<Castle size={36} />}
            title="九层塔 PVE"
            subtitle="带麾下角色挑战 Boss"
            accent="#FFD700"
            description="9 层 Boss 攻略路线，每场战后 AI 复盘，升级解锁技能 / 进化形态。"
            highlight
          />
          <ModeCard
            onClick={goRoster}
            icon={<UsersRound size={36} />}
            title="我的麾下"
            subtitle={`已收纳 ${rosterCount} 名角色`}
            accent="#FF003C"
            description="查看角色档案、成长曲线、形态时间轴。"
          />
        </div>
      </motion.div>

      <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-[#8a8d91]/50 tracking-widest">
        ▼ CHOOSE WISELY ▼ BATTLE AWAITS ▼
      </div>
    </div>
  );
};

interface ModeCardProps {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  accent: string;
  highlight?: boolean;
}

const ModeCard: React.FC<ModeCardProps> = ({ onClick, icon, title, subtitle, description, accent, highlight }) => {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="relative flex flex-col items-start gap-3 p-6 bg-[#1F2833]/70 border-2 rounded-lg text-left transition-all"
      style={{
        borderColor: highlight ? accent : `${accent}55`,
        boxShadow: highlight
          ? `0 0 30px ${accent}40, inset 0 0 20px ${accent}20`
          : `0 0 14px ${accent}20`,
      }}
    >
      <div className="absolute top-4 right-4 text-[10px] tracking-widest" style={{ color: accent }}>
        ENTER ▸
      </div>
      <div style={{ color: accent }}>{icon}</div>
      <div>
        <div className="text-2xl font-black tracking-wider font-display" style={{ color: accent }}>
          {title}
        </div>
        <div className="text-xs text-[#C5C6C7] mt-1">{subtitle}</div>
      </div>
      <p className="text-[11px] text-[#8a8d91] leading-relaxed">{description}</p>
    </motion.button>
  );
};
