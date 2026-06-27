import React from 'react';
import { useGameStore } from './store/useGameStore';
import { WelcomeScreen } from './components/WelcomeScreen';
import { ModeSelectScreen } from './components/ModeSelectScreen';
import { CharacterCreateScreen } from './components/CharacterCreateScreen';
import { BattleScreen } from './components/BattleScreen';
import { GameOverScreen } from './components/GameOverScreen';
import { RosterScreen } from './components/RosterScreen';
import { TowerScreen } from './components/TowerScreen';
import { TowerResultScreen } from './components/TowerResultScreen';
import { TrainingGroundScreen } from './components/TrainingGroundScreen';

function App() {
  const { phase } = useGameStore();

  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#C5C6C7] font-mono">
      {phase === 'WELCOME' && <WelcomeScreen />}
      {phase === 'MODE_SELECT' && <ModeSelectScreen />}
      {(phase === 'RECRUIT_CREATE' || phase === 'PLAYER1_CREATE' || phase === 'PLAYER2_CREATE') && <CharacterCreateScreen />}
      {phase === 'BATTLE_ARENA' && <BattleScreen />}
      {phase === 'GAME_OVER' && <GameOverScreen />}
      {phase === 'ROSTER_VIEW' && <RosterScreen />}
      {phase === 'TRAINING_GROUND' && <TrainingGroundScreen />}
      {phase === 'TOWER_HUB' && <TowerScreen />}
      {phase === 'TOWER_RESULT' && <TowerResultScreen />}
    </div>
  );
}

export default App;
