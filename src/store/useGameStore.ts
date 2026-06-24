import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Skill {
  name: string;
  description: string;
  damageMultiplier: number;
}

export interface CharacterData {
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  skills: Skill[];
  imagePrompt: string;
  imageUrl?: string;
}

export interface BattleEvent {
  id: string;
  turn: number;
  attacker: 'player1' | 'player2' | 'system';
  message: string;
  damage?: number;
  isCrit?: boolean;
  isSkill?: boolean;
}

export type GamePhase = 'WELCOME' | 'PLAYER1_CREATE' | 'PLAYER2_CREATE' | 'BATTLE_ARENA' | 'GAME_OVER';

interface GameStore {
  apiKey: string;
  baseUrl: string;
  model: string;
  phase: GamePhase;
  player1: CharacterData | null;
  player2: CharacterData | null;
  battleLogs: BattleEvent[];
  currentTurn: number;
  winner: 'player1' | 'player2' | null;

  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setModel: (model: string) => void;
  setPhase: (phase: GamePhase) => void;
  setPlayer1: (char: CharacterData) => void;
  setPlayer2: (char: CharacterData) => void;
  updatePlayer1Hp: (hp: number) => void;
  updatePlayer2Hp: (hp: number) => void;
  addBattleLog: (log: BattleEvent) => void;
  setWinner: (winner: 'player1' | 'player2') => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set) => ({
      apiKey: '',
      baseUrl: '',
      model: '',
      phase: 'WELCOME',
      player1: null,
      player2: null,
      battleLogs: [],
      currentTurn: 0,
      winner: null,

      setApiKey: (key) => set({ apiKey: key }),
      setBaseUrl: (url) => set({ baseUrl: url }),
      setModel: (model) => set({ model }),
      setPhase: (phase) => set({ phase }),
      setPlayer1: (char) => set({ player1: char }),
      setPlayer2: (char) => set({ player2: char }),
      updatePlayer1Hp: (hp) => set((state) => ({ player1: state.player1 ? { ...state.player1, hp } : null })),
      updatePlayer2Hp: (hp) => set((state) => ({ player2: state.player2 ? { ...state.player2, hp } : null })),
      addBattleLog: (log) => set((state) => ({
        battleLogs: [...state.battleLogs, log],
        currentTurn: Math.max(state.currentTurn, log.turn),
      })),
      setWinner: (winner) => set({ winner, phase: 'GAME_OVER' }),
      resetGame: () => set({
        phase: 'PLAYER1_CREATE',
        player1: null,
        player2: null,
        battleLogs: [],
        currentTurn: 0,
        winner: null,
      }),
    }),
    {
      name: 'word-brawl-config',
      partialize: (state) => ({
        apiKey: state.apiKey,
        baseUrl: state.baseUrl,
        model: state.model,
      }),
    },
  ),
);
