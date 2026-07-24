import React, { useEffect, useState, useCallback } from "react";
import { useGameStore, type Rarity } from "./store/useGameStore";
import { useRosterStore, type PendingRevealEntry } from "./store/useRosterStore";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ModeSelectScreen } from "./components/ModeSelectScreen";
import { CharacterCreateScreen } from "./components/CharacterCreateScreen";
import { BattleScreen } from "./components/BattleScreen";
import { GameOverScreen } from "./components/GameOverScreen";
import { RosterScreen } from "./components/RosterScreen";
import { TowerScreen } from "./components/TowerScreen";
import { TowerResultScreen } from "./components/TowerResultScreen";
import { SpiritChatScreen } from "./components/SpiritChatScreen";
import { SpiritStoryScreen } from "./components/SpiritStoryScreen";
import { CardRevealAnimation } from "./components/CardRevealAnimation";
import { HeroCard } from "./components/HeroCard";

/**
 * 全局抽卡动画管理器
 * 监听 pendingRevealQueue，依次播放每个新角色的揭示动画
 */
function RevealOverlay() {
  const pendingRevealQueue = useRosterStore((s) => s.pendingRevealQueue);
  const consumeNextReveal = useRosterStore((s) => s.consumeNextReveal);
  const [currentReveal, setCurrentReveal] = useState<PendingRevealEntry | null>(null);

  // 自动从队列取出下一个播放
  useEffect(() => {
    if (currentReveal) return;
    const next = consumeNextReveal();
    if (next) setCurrentReveal(next);
  }, [pendingRevealQueue, currentReveal, consumeNextReveal]);

  const handleClose = useCallback(() => {
    setCurrentReveal(null);
  }, []);

  if (!currentReveal) return null;

  return (
    <CardRevealAnimation
      character={currentReveal.character}
      onClose={handleClose}
    />
  );
}

function App() {
  const { phase } = useGameStore();

  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#C5C6C7] font-mono">
      {phase === "WELCOME" && <WelcomeScreen />}
      {phase === "MODE_SELECT" && <ModeSelectScreen />}
      {(phase === "RECRUIT_CREATE" ||
        phase === "PLAYER1_CREATE" ||
        phase === "PLAYER2_CREATE") && <CharacterCreateScreen />}
      {phase === "BATTLE_ARENA" && <BattleScreen />}
      {phase === "GAME_OVER" && <GameOverScreen />}
      {phase === "ROSTER_VIEW" && <RosterScreen />}
      {phase === "SPIRIT_CHAT" && <SpiritChatScreen />}
      {phase === "SPIRIT_STORY" && <SpiritStoryScreen />}
      {phase === "TOWER_HUB" && <TowerScreen />}
      {phase === "TOWER_RESULT" && <TowerResultScreen />}
      {/* 全局抽卡动画覆盖层 */}
      <RevealOverlay />
    </div>
  );
}

export default App;
