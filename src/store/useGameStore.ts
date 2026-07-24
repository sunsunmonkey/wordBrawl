import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SkillType = "attack" | "heal" | "buff" | "debuff" | "ultimate";

export type Rarity = "N" | "R" | "SR" | "SSR" | "UR";

export interface RarityConfig {
  id: Rarity;
  label: string;
  labelEn: string;
  primaryColor: string;
  secondaryColor: string;
  rgb: string;
  glowColor: string;
  borderGradient: string;
  starCount: number;
  powerMultiplier: number;
  dropRate: number;
}

export const RARITY_CONFIGS: Record<Rarity, RarityConfig> = {
  N: {
    id: "N",
    label: "普通",
    labelEn: "NORMAL",
    primaryColor: "#9CA3AF",
    secondaryColor: "#6B7280",
    rgb: "156, 163, 175",
    glowColor: "rgba(156, 163, 175, 0.5)",
    borderGradient: "linear-gradient(135deg, #9CA3AF, #6B7280)",
    starCount: 1,
    powerMultiplier: 0.85,
    dropRate: 0.40,
  },
  R: {
    id: "R",
    label: "稀有",
    labelEn: "RARE",
    primaryColor: "#60A5FA",
    secondaryColor: "#3B82F6",
    rgb: "96, 165, 250",
    glowColor: "rgba(96, 165, 250, 0.7)",
    borderGradient: "linear-gradient(135deg, #60A5FA, #3B82F6, #2563EB)",
    starCount: 2,
    powerMultiplier: 1.0,
    dropRate: 0.35,
  },
  SR: {
    id: "SR",
    label: "超稀有",
    labelEn: "SUPER RARE",
    primaryColor: "#C084FC",
    secondaryColor: "#A855F7",
    rgb: "192, 132, 252",
    glowColor: "rgba(192, 132, 252, 0.8)",
    borderGradient: "linear-gradient(135deg, #E879F9, #C084FC, #A855F7, #9333EA)",
    starCount: 3,
    powerMultiplier: 1.15,
    dropRate: 0.17,
  },
  SSR: {
    id: "SSR",
    label: "史诗",
    labelEn: "SUPER SUPER RARE",
    primaryColor: "#FBBF24",
    secondaryColor: "#F59E0B",
    rgb: "251, 191, 36",
    glowColor: "rgba(251, 191, 36, 0.9)",
    borderGradient: "linear-gradient(135deg, #FDE047, #FBBF24, #F59E0B, #D97706)",
    starCount: 4,
    powerMultiplier: 1.35,
    dropRate: 0.065,
  },
  UR: {
    id: "UR",
    label: "传说",
    labelEn: "ULTRA RARE",
    primaryColor: "#FF6B9D",
    secondaryColor: "#FF003C",
    rgb: "255, 107, 157",
    glowColor: "rgba(255, 107, 157, 1)",
    borderGradient: "linear-gradient(135deg, #66FCF1, #C084FC, #FFD700, #FF6B9D, #FF003C)",
    starCount: 5,
    powerMultiplier: 1.6,
    dropRate: 0.015,
  },
};

export const calculatePowerScore = (char: {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  skills?: { damageMultiplier: number; isUltimate?: boolean }[];
}): number => {
  const hp = char.maxHp || char.hp;
  const atk = char.attack;
  const def = char.defense;
  const spd = char.speed;
  const baseScore = hp * 0.4 + atk * 2.5 + def * 1.8 + spd * 1.5;
  const ultimateMult = char.skills?.find((s) => s.isUltimate)?.damageMultiplier || 5;
  const skillBonus = ultimateMult * 15;
  return Math.round(baseScore + skillBonus);
};

export const determineRarityByPower = (powerScore: number): Rarity => {
  if (powerScore >= 850) return "UR";
  if (powerScore >= 680) return "SSR";
  if (powerScore >= 500) return "SR";
  if (powerScore >= 350) return "R";
  return "N";
};

export const rollRarity = (): Rarity => {
  const rand = Math.random();
  let cumulative = 0;
  const rarities: Rarity[] = ["UR", "SSR", "SR", "R", "N"];
  for (const r of rarities) {
    cumulative += RARITY_CONFIGS[r].dropRate;
    if (rand <= cumulative) return r;
  }
  return "N";
};

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

export interface SpiritProfile {
  /** 词灵原型：类似角色卡里的身份定位 */
  archetype: string;
  /** 性格底色：影响战斗叙事语气 */
  temperament: string;
  /** 说话方式：短句、古风、机械播报、嘲讽等 */
  speechStyle: string;
  /** 战斗中可穿插的短台词 */
  catchphrases: string[];
  /** 释放大招或关键行动时的宣言 */
  battleCry: string;
  /** 胜利时的收束台词 */
  victoryLine: string;
  /** 落败时的收束台词 */
  defeatLine: string;
  /** 世界观锚点：角色来自哪里、信奉什么、背负什么规则 */
  worldAnchors: string[];
  /** 记忆种子：后续成长和塔战叙事可复用的长期动机 */
  memorySeeds: string[];
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
  /** custom API 生成的词灵人格卡，不参与数值计算，只驱动叙事表现 */
  spiritProfile?: SpiritProfile;
  /** 来自预设角色，不参与赛后收入麾下 */
  isPreset?: boolean;
  /** 稀有度：N/R/SR/SSR/UR */
  rarity?: Rarity;
}

export interface BattleEvent {
  id: string;
  turn: number;
  attacker: "player1" | "player2" | "system";
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
  | "WELCOME"
  | "MODE_SELECT"
  | "RECRUIT_CREATE"
  | "PLAYER1_CREATE"
  | "PLAYER2_CREATE"
  | "BATTLE_ARENA"
  | "GAME_OVER"
  | "ROSTER_VIEW"
  | "SPIRIT_CHAT"
  | "SPIRIT_STORY"
  | "TOWER_HUB"
  | "TOWER_RESULT";
export type ApiMode = "free" | "custom";
export type BattleMode = "pvp" | "pve_tower";

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
  winner: "player1" | "player2" | null;
  /** 当前战斗模式：PVP 或 九层塔 PVE */
  battleMode: BattleMode;
  /** PVE 当前挑战的塔层号 1-9 */
  towerLayer: number;
  /** PVE 出战的麾下角色 rosterId */
  towerRosterId: string | null;
  /** 九层塔是否启用自动战斗 */
  towerAutoMode: boolean;
  /** Debug：允许角色跳过等级门槛直接进化 */
  evolutionDebugMode: boolean;

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
  setWinner: (winner: "player1" | "player2") => void;
  setBattleMode: (mode: BattleMode) => void;
  setTowerLayer: (layer: number) => void;
  setTowerRosterId: (rosterId: string | null) => void;
  setTowerAutoMode: (mode: boolean) => void;
  setEvolutionDebugMode: (mode: boolean) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set) => ({
      apiKey: "",
      baseUrl: "",
      model: "",
      apiMode: "free",
      phase: "WELCOME",
      player1: null,
      player2: null,
      battleLogs: [],
      currentTurn: 0,
      winner: null,
      battleMode: "pvp",
      towerLayer: 1,
      towerRosterId: null,
      towerAutoMode: false,
      evolutionDebugMode: false,

      setApiKey: (key) => set({ apiKey: key }),
      setBaseUrl: (url) => set({ baseUrl: url }),
      setModel: (model) => set({ model }),
      setApiMode: (mode) => set({ apiMode: mode }),
      setPhase: (phase) => set({ phase }),
      setPlayer1: (char) => set({ player1: char }),
      setPlayer2: (char) => set({ player2: char }),
      updatePlayer1Hp: (hp) =>
        set((state) => ({
          player1: state.player1 ? { ...state.player1, hp } : null,
        })),
      updatePlayer2Hp: (hp) =>
        set((state) => ({
          player2: state.player2 ? { ...state.player2, hp } : null,
        })),
      updatePlayer1UltimateCharge: (charge) =>
        set((state) => ({
          player1: state.player1
            ? { ...state.player1, ultimateCharge: charge }
            : null,
        })),
      updatePlayer2UltimateCharge: (charge) =>
        set((state) => ({
          player2: state.player2
            ? { ...state.player2, ultimateCharge: charge }
            : null,
        })),
      addBattleLog: (log) =>
        set((state) => ({
          battleLogs: [...state.battleLogs, log],
          currentTurn: Math.max(state.currentTurn, log.turn),
        })),
      setWinner: (winner) =>
        set((state) => ({
          winner,
          phase:
            state.battleMode === "pve_tower" ? "TOWER_RESULT" : "GAME_OVER",
        })),
      setBattleMode: (mode) => set({ battleMode: mode }),
      setTowerLayer: (layer) => set({ towerLayer: layer }),
      setTowerRosterId: (rosterId) => set({ towerRosterId: rosterId }),
      setTowerAutoMode: (mode) => set({ towerAutoMode: mode }),
      setEvolutionDebugMode: (mode) => set({ evolutionDebugMode: mode }),
      resetGame: () =>
        set({
          phase: "PLAYER1_CREATE",
          player1: null,
          player2: null,
          battleLogs: [],
          currentTurn: 0,
          winner: null,
          battleMode: "pvp",
          towerLayer: 1,
          towerRosterId: null,
          towerAutoMode: false,
        }),
    }),
    {
      name: "word-brawl-config",
      partialize: (state) => ({
        apiKey: state.apiKey,
        baseUrl: state.baseUrl,
        model: state.model,
        apiMode: state.apiMode,
        towerAutoMode: state.towerAutoMode,
        evolutionDebugMode: state.evolutionDebugMode,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<GameStore>;
        return {
          ...current,
          apiKey: saved.apiKey ?? current.apiKey,
          baseUrl: saved.baseUrl ?? current.baseUrl,
          model: saved.model ?? current.model,
          apiMode: saved.apiMode ?? current.apiMode,
          towerAutoMode: saved.towerAutoMode ?? current.towerAutoMode,
          evolutionDebugMode:
            saved.evolutionDebugMode ?? current.evolutionDebugMode,
        };
      },
    },
  ),
);
