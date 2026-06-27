import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SkillType = 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate';

export interface Skill {
  name: string;
  description: string;
  damageMultiplier: number;
  type: SkillType;
  /** 大招专属：是否为终极技能 */
  isUltimate?: boolean;
  /** 大招专属：图片提示词（如使用动态生成） */
  imagePrompt?: string;
  /** 大招专属：图片地址 */
  imageUrl?: string;
  /** 大招专属：视觉类型 ID，对应 data/ultimateTypes.ts 中的预设类型图 */
  ultimateType?: string;
  /** 治疗量（type=heal 时生效，按 maxHp 百分比） */
  healPercent?: number;
  /** buff/debuff 强度（按百分比） */
  buffPercent?: number;
  /** buff/debuff 持续回合数 */
  buffTurns?: number;
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
  /** 大招充能进度 (0-100) */
  ultimateCharge: number;
  /** 临时 buff 状态 */
  attackBuff: number;
  defenseBuff: number;
  /** buff 剩余回合 */
  buffTurnsLeft: number;
  /** 额外暴击率加成（百分比，Boss 或特殊状态可使用） */
  critBonus?: number;
  /** 生成时的原始描述文本，便于赛后收入麾下时回写 */
  sourceDescription?: string;
  /** 来自预设角色，不参与赛后收入麾下 */
  isPreset?: boolean;
}

export interface BattleEvent {
  id: string;
  turn: number;
  attacker: 'player1' | 'player2' | 'system';
  message: string;
  damage?: number;
  heal?: number;
  isCrit?: boolean;
  isSkill?: boolean;
  isUltimate?: boolean;
  skillName?: string;
  skillImageUrl?: string;
  /** 大招视觉类型 ID */
  ultimateType?: string;
  attackerName?: string;
  /** 攻击者此回合后的充能值 */
  attackerCharge?: number;
  /** 受击者此回合后的充能值 */
  defenderCharge?: number;
}

export type GamePhase =
  | 'WELCOME'
  | 'MODE_SELECT'
  | 'RECRUIT_CREATE'
  | 'PLAYER1_CREATE'
  | 'PLAYER2_CREATE'
  | 'BATTLE_ARENA'
  | 'GAME_OVER'
  | 'ROSTER_VIEW'
  | 'TOWER_HUB'
  | 'TOWER_RESULT';
export type ApiMode = 'free' | 'custom';
export type BattleMode = 'pvp' | 'pve_tower';

interface GameStore {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiMode: ApiMode;
  phase: GamePhase;
  player1: CharacterData | null;
  player2: CharacterData | null;
  battleLogs: BattleEvent[];
  currentTurn: number;
  winner: 'player1' | 'player2' | null;
  /** 当前战斗模式：PVP 或 九层塔 PVE */
  battleMode: BattleMode;
  /** PVE 当前挑战的塔层号 1-9 */
  towerLayer: number;
  /** PVE 出战的麾下角色 rosterId */
  towerRosterId: string | null;

  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setModel: (model: string) => void;
  setApiMode: (mode: ApiMode) => void;
  setPhase: (phase: GamePhase) => void;
  setPlayer1: (char: CharacterData) => void;
  setPlayer2: (char: CharacterData) => void;
  updatePlayer1Hp: (hp: number) => void;
  updatePlayer2Hp: (hp: number) => void;
  updatePlayer1UltimateCharge: (charge: number) => void;
  updatePlayer2UltimateCharge: (charge: number) => void;
  addBattleLog: (log: BattleEvent) => void;
  setWinner: (winner: 'player1' | 'player2') => void;
  setBattleMode: (mode: BattleMode) => void;
  setTowerLayer: (layer: number) => void;
  setTowerRosterId: (rosterId: string | null) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set) => ({
      apiKey: '',
      baseUrl: '',
      model: '',
      apiMode: 'free',
      phase: 'WELCOME',
      player1: null,
      player2: null,
      battleLogs: [],
      currentTurn: 0,
      winner: null,
      battleMode: 'pvp',
      towerLayer: 1,
      towerRosterId: null,

      setApiKey: (key) => set({ apiKey: key }),
      setBaseUrl: (url) => set({ baseUrl: url }),
      setModel: (model) => set({ model }),
      setApiMode: (mode) => set({ apiMode: mode }),
      setPhase: (phase) => set({ phase }),
      setPlayer1: (char) => set({ player1: char }),
      setPlayer2: (char) => set({ player2: char }),
      updatePlayer1Hp: (hp) => set((state) => ({ player1: state.player1 ? { ...state.player1, hp } : null })),
      updatePlayer2Hp: (hp) => set((state) => ({ player2: state.player2 ? { ...state.player2, hp } : null })),
      updatePlayer1UltimateCharge: (charge) => set((state) => ({ player1: state.player1 ? { ...state.player1, ultimateCharge: charge } : null })),
      updatePlayer2UltimateCharge: (charge) => set((state) => ({ player2: state.player2 ? { ...state.player2, ultimateCharge: charge } : null })),
      addBattleLog: (log) => set((state) => ({
        battleLogs: [...state.battleLogs, log],
        currentTurn: Math.max(state.currentTurn, log.turn),
      })),
      setWinner: (winner) => set((state) => ({
        winner,
        phase: state.battleMode === 'pve_tower' ? 'TOWER_RESULT' : 'GAME_OVER',
      })),
      setBattleMode: (mode) => set({ battleMode: mode }),
      setTowerLayer: (layer) => set({ towerLayer: layer }),
      setTowerRosterId: (rosterId) => set({ towerRosterId: rosterId }),
      resetGame: () => set({
        phase: 'PLAYER1_CREATE',
        player1: null,
        player2: null,
        battleLogs: [],
        currentTurn: 0,
        winner: null,
        battleMode: 'pvp',
        towerLayer: 1,
        towerRosterId: null,
      }),
    }),
    {
      name: 'word-brawl-config',
      partialize: (state) => ({
        apiKey: state.apiKey,
        baseUrl: state.baseUrl,
        model: state.model,
        apiMode: state.apiMode,
      }),
    },
  ),
);
