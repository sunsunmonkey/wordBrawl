import React from 'react';
import { useGameStore } from './store/useGameStore';
import { WelcomeScreen } from './components/WelcomeScreen';
import { CharacterCreateScreen } from './components/CharacterCreateScreen';
import { BattleScreen } from './components/BattleScreen';
import { GameOverScreen } from './components/GameOverScreen';
import { RosterScreen } from './components/RosterScreen';

function App() {
  const { phase } = useGameStore();

  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#C5C6C7] font-mono">
      {phase === 'WELCOME' && <WelcomeScreen />}
      {(phase === 'PLAYER1_CREATE' || phase === 'PLAYER2_CREATE') && <CharacterCreateScreen />}
      {phase === 'BATTLE_ARENA' && <BattleScreen />}
      {phase === 'GAME_OVER' && <GameOverScreen />}
      {phase === 'ROSTER_VIEW' && <RosterScreen />}
    </div>
  );
}

export default App;
