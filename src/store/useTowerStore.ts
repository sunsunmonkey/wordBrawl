import { create } from 'zustand';
import type { Skill } from './useGameStore';
import type { BattleSummary } from '../utils/towerAnalysis';
import type { ActiveEvolutionStage, FormHistoryEntry, TowerRunRecord } from './useRosterStore';

/** AI 生成的形态进化结果（写入 formHistory 之前的中间态） */
export interface PendingEvolution {
  stage: ActiveEvolutionStage;
  imagePrompt: string;
  imageUrl?: string;
  lore?: string;
  newUltimate?: Skill;
}

interface TowerStore {
  /** 正在挑战的层 */
  currentLayer: number;
  /** 上一场战斗的本地聚合摘要 */
  lastSummary: BattleSummary | null;
  /** 上一场战斗对应的 roster id */
  lastRosterId: string | null;
  /** 上一场战斗结果 */
  lastResult: 'win' | 'loss' | null;
  /** 待发奖：刚结束的战斗记录 */
  pendingRun: TowerRunRecord | null;
  /** 待解锁的技能候选（升到 5/12/22 时） */
  pendingSkillChoices: Skill[] | null;
  /** 待应用的进化（每 5 级一次） */
  pendingEvolution: PendingEvolution | null;
  /** 待写入的形态历史（应用进化后会同步写入 roster） */
  pendingFormHistory: FormHistoryEntry | null;

  setCurrentLayer: (layer: number) => void;
  setLastSummary: (summary: BattleSummary | null) => void;
  setLastRosterId: (id: string | null) => void;
  setLastResult: (result: 'win' | 'loss' | null) => void;
  setPendingRun: (run: TowerRunRecord | null) => void;
  setPendingSkillChoices: (skills: Skill[] | null) => void;
  setPendingEvolution: (evo: PendingEvolution | null) => void;
  setPendingFormHistory: (entry: FormHistoryEntry | null) => void;
  resetPending: () => void;
}

export const useTowerStore = create<TowerStore>((set) => ({
  currentLayer: 1,
  lastSummary: null,
  lastRosterId: null,
  lastResult: null,
  pendingRun: null,
  pendingSkillChoices: null,
  pendingEvolution: null,
  pendingFormHistory: null,

  setCurrentLayer: (layer) => set({ currentLayer: layer }),
  setLastSummary: (summary) => set({ lastSummary: summary }),
  setLastRosterId: (id) => set({ lastRosterId: id }),
  setLastResult: (result) => set({ lastResult: result }),
  setPendingRun: (run) => set({ pendingRun: run }),
  setPendingSkillChoices: (skills) => set({ pendingSkillChoices: skills }),
  setPendingEvolution: (evo) => set({ pendingEvolution: evo }),
  setPendingFormHistory: (entry) => set({ pendingFormHistory: entry }),
  resetPending: () =>
    set({
      pendingRun: null,
      pendingSkillChoices: null,
      pendingEvolution: null,
      pendingFormHistory: null,
    }),
}));
