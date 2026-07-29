import React, { useEffect, useState, useCallback } from "react";
import { useGameStore } from "./store/useGameStore";
import {
  useRosterStore,
  type PendingRevealEntry,
} from "./store/useRosterStore";
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
import { runBackgroundRecruit } from "./utils/recruitPipeline";
import type { AIConfig } from "./utils/ai";
import { SocialLobbyScreen } from "./components/SocialLobbyScreen";
import { SocialRoomScreen } from "./components/SocialRoomScreen";
import { SocialBattleScreen } from "./components/SocialBattleScreen";

/**
 * 全局抽卡动画管理器
 * 监听 pendingRevealQueue，依次播放每个新角色的揭示动画。
 * 仅在「词灵枢庭」(MODE_SELECT) 展示：若生成完成时用户在其他界面，
 * 揭示会留在队列中，待用户切回枢庭时再逐个播放。
 */
function RevealOverlay() {
  const phase = useGameStore((s) => s.phase);
  const apiKey = useGameStore((s) => s.apiKey);
  const baseUrl = useGameStore((s) => s.baseUrl);
  const model = useGameStore((s) => s.model);
  const apiMode = useGameStore((s) => s.apiMode);

  const pendingRevealQueue = useRosterStore((s) => s.pendingRevealQueue);
  const consumeNextReveal = useRosterStore((s) => s.consumeNextReveal);
  const removeCharacter = useRosterStore((s) => s.removeCharacter);
  const createPendingRecruit = useRosterStore((s) => s.createPendingRecruit);
  const [currentReveal, setCurrentReveal] = useState<PendingRevealEntry | null>(
    null,
  );

  const isHub = phase === "MODE_SELECT";

  // 仅在词灵枢庭时，从队列取出下一个播放
  useEffect(() => {
    if (!isHub || currentReveal) return;
    const next = consumeNextReveal();
    if (next) setCurrentReveal(next);
  }, [isHub, pendingRevealQueue, currentReveal, consumeNextReveal]);

  // 收入麾下：角色已在麾下，直接关闭播放下一张
  const handleKeep = useCallback(() => {
    setCurrentReveal(null);
  }, []);

  // 放弃：从麾下移除该词灵
  const handleDiscard = useCallback(() => {
    if (currentReveal) removeCharacter(currentReveal.rosterId);
    setCurrentReveal(null);
  }, [currentReveal, removeCharacter]);

  // 重新生成：放弃当前，用相同描述重新召唤（完成后重新入队）
  const handleRegenerate = useCallback(() => {
    if (!currentReveal) return;
    const description = currentReveal.character.sourceDescription || "";
    removeCharacter(currentReveal.rosterId);
    setCurrentReveal(null);
    if (!description) return;
    const cfg: AIConfig = { apiKey, baseUrl, model, apiMode };
    const pending = createPendingRecruit(description);
    runBackgroundRecruit(pending.rosterId, description, cfg);
  }, [
    currentReveal,
    removeCharacter,
    createPendingRecruit,
    apiKey,
    baseUrl,
    model,
    apiMode,
  ]);

  if (!isHub || !currentReveal) return null;

  return (
    <CardRevealAnimation
      character={currentReveal.character}
      onKeep={handleKeep}
      onDiscard={handleDiscard}
      onRegenerate={handleRegenerate}
    />
  );
}

function App() {
  const { phase } = useGameStore();
  const setPhase = useGameStore((s) => s.setPhase);

  // 深链：打开 #room=CODE 时自动进入社交大厅（房间码在大厅回填并可一键加入）
  useEffect(() => {
    const match = window.location.hash.match(/room=([A-Za-z0-9]{6})/);
    if (match) {
      setPhase("SOCIAL_LOBBY");
    }
  }, [setPhase]);

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
      {phase === "SOCIAL_LOBBY" && <SocialLobbyScreen />}
      {phase === "SOCIAL_ROOM" && <SocialRoomScreen />}
      {phase === "SOCIAL_BATTLE" && <SocialBattleScreen />}
      {/* 全局抽卡动画覆盖层 */}
      <RevealOverlay />
    </div>
  );
}

export default App;
