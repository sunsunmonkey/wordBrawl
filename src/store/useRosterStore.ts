import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CharacterData, Skill } from './useGameStore';
import { presetCharacters } from '../data/presetCharacters';

/** 进化阶段：0 初始 / 1-6 为每 5 级一次的形态状态 */
export type EvolutionStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type ActiveEvolutionStage = Exclude<EvolutionStage, 0>;

export interface FormHistoryEntry {
  stage: EvolutionStage;
  imageUrl?: string;
  imagePrompt: string;
  lore?: string;
  createdAt: number;
}

export type TowerRunResult = 'win' | 'loss';

export interface TowerRunRecord {
  layer: number;
  result: TowerRunResult;
  turns: number;
  damageDealt: number;
  damageTaken: number;
  criticalCount: number;
  ultimateCount: number;
  mostUsedSkill?: string;
  summary?: string;
  analyzedAt: number;
}

export interface RosterCharacter extends CharacterData {
  rosterId: string;
  recruitedAt: number;
  level: number;
  xp: number;
  evolutionStage: EvolutionStage;
  formHistory: FormHistoryEntry[];
  tower: {
    highestCleared: number;
    /** 无尽塔累计通关层数；1-9 为一番，10-18 为二番。 */
    highestEndlessLayer: number;
    nextLayer: number;
    runs: TowerRunRecord[];
  };
}

const MAX_ROSTER_SIZE = 24;
const MAX_TOWER_RUNS = 10;
const DEFAULT_ROSTER_NAMES = ['唐三', '超梦', '孙悟空', '奥特曼', '卡卡西'];

const cloneCharacter = (char: CharacterData): CharacterData => JSON.parse(JSON.stringify(char));

export const resetCharacterRuntimeState = (char: CharacterData): CharacterData => {
  const copy = cloneCharacter(char);
  const partial = copy as CharacterData & Partial<RosterCharacter>;
  delete partial.rosterId;
  delete partial.recruitedAt;
  return {
    ...partial,
    hp: partial.maxHp,
    ultimateCharge: 0,
    attackBuff: 0,
    defenseBuff: 0,
    buffTurnsLeft: 0,
    critBonus: undefined,
  };
};

const makeRosterId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createStarterRosterCharacter = (name: string, index: number): RosterCharacter | null => {
  const preset = presetCharacters.find((char) => char.name === name);
  if (!preset) return null;
  return ensureGrowthFields({
    ...resetCharacterRuntimeState(preset),
    isPreset: false,
    sourceDescription: `${preset.name} · 初始麾下`,
    rosterId: `starter-${index + 1}-${preset.name}`,
    recruitedAt: Date.now() - (DEFAULT_ROSTER_NAMES.length - index) * 1000,
  });
};

const createDefaultRoster = (): RosterCharacter[] =>
  DEFAULT_ROSTER_NAMES
    .map(createStarterRosterCharacter)
    .filter((char): char is RosterCharacter => Boolean(char));

const defaultGrowthFields = (): Pick<RosterCharacter, 'level' | 'xp' | 'evolutionStage' | 'formHistory' | 'tower'> => ({
  level: 1,
  xp: 0,
  evolutionStage: 0,
  formHistory: [],
  tower: { highestCleared: 0, highestEndlessLayer: 0, nextLayer: 1, runs: [] },
});

/** 把任意可能缺字段的 RosterCharacter 兜底成完整结构 */
const ensureGrowthFields = (char: Partial<RosterCharacter> & CharacterData & { rosterId?: string }): RosterCharacter => {
  const defaults = defaultGrowthFields();
  const tower = char.tower
    ? {
        highestCleared: typeof char.tower.highestCleared === 'number' ? char.tower.highestCleared : 0,
        highestEndlessLayer:
          typeof char.tower.highestEndlessLayer === 'number'
            ? char.tower.highestEndlessLayer
            : typeof char.tower.highestCleared === 'number'
              ? char.tower.highestCleared
              : 0,
        nextLayer: typeof char.tower.nextLayer === 'number' ? char.tower.nextLayer : 1,
        runs: Array.isArray(char.tower.runs) ? char.tower.runs.slice(-MAX_TOWER_RUNS) : [],
      }
    : defaults.tower;

  const recruitedAt = char.recruitedAt ?? Date.now();
  let formHistory = Array.isArray(char.formHistory) ? char.formHistory : defaults.formHistory;
  // 自动补一条初始形态（stage 0）：仅当 formHistory 里还没有 stage 0 时
  const hasInitial = formHistory.some((f) => f.stage === 0);
  if (!hasInitial) {
    const initialEntry: FormHistoryEntry = {
      stage: 0,
      imageUrl: char.imageUrl,
      imagePrompt: char.imagePrompt ?? '',
      lore: char.sourceDescription,
      createdAt: recruitedAt,
    };
    formHistory = [initialEntry, ...formHistory];
  }

  return {
    ...(char as CharacterData),
    rosterId: char.rosterId ?? makeRosterId(),
    recruitedAt,
    level: typeof char.level === 'number' && char.level > 0 ? char.level : defaults.level,
    xp: typeof char.xp === 'number' && char.xp >= 0 ? char.xp : defaults.xp,
    evolutionStage:
      typeof char.evolutionStage === 'number' && char.evolutionStage >= 0 && char.evolutionStage <= 6
        ? (char.evolutionStage as EvolutionStage)
        : defaults.evolutionStage,
    formHistory,
    tower,
  };
};

const supplementDefaultRoster = (roster: RosterCharacter[]): RosterCharacter[] => {
  const existingNames = new Set(roster.map((char) => char.name));
  const missingStarters: RosterCharacter[] = [];

  DEFAULT_ROSTER_NAMES.forEach((name, index) => {
    if (existingNames.has(name)) return;
    const starter = createStarterRosterCharacter(name, index);
    if (!starter) return;
    existingNames.add(name);
    missingStarters.push(starter);
  });

  if (missingStarters.length === 0) return roster;
  const room = Math.max(0, MAX_ROSTER_SIZE - roster.length);
  return [...roster, ...missingStarters.slice(0, room)];
};

interface RosterStore {
  roster: RosterCharacter[];
  recruitCharacter: (char: CharacterData, sourceDescription?: string) => RosterCharacter;
  removeCharacter: (rosterId: string) => void;
  /** 替换/更新整个 roster 角色记录 */
  updateCharacter: (rosterId: string, updater: (char: RosterCharacter) => RosterCharacter) => void;
  /** 给角色追加塔战记录，保留最近 10 条 */
  appendTowerRun: (rosterId: string, run: TowerRunRecord) => void;
  /** 给角色追加形态历史 */
  appendFormHistory: (rosterId: string, entry: FormHistoryEntry) => void;
  /** 追加技能（解锁三选一时使用） */
  appendSkill: (rosterId: string, skill: Skill) => void;
}

export const useRosterStore = create<RosterStore>()(
  persist(
    (set, get) => ({
      roster: createDefaultRoster(),
      recruitCharacter: (char, sourceDescription) => {
        const recruited: RosterCharacter = ensureGrowthFields({
          ...resetCharacterRuntimeState(char),
          sourceDescription: sourceDescription ?? char.sourceDescription,
          rosterId: makeRosterId(),
          recruitedAt: Date.now(),
        });

        set((state) => ({
          roster: [recruited, ...state.roster].slice(0, MAX_ROSTER_SIZE),
        }));
        return recruited;
      },
      removeCharacter: (rosterId) =>
        set((state) => ({
          roster: state.roster.filter((char) => char.rosterId !== rosterId),
        })),
      updateCharacter: (rosterId, updater) =>
        set((state) => ({
          roster: state.roster.map((char) => (char.rosterId === rosterId ? updater(char) : char)),
        })),
      appendTowerRun: (rosterId, run) => {
        const state = get();
        const target = state.roster.find((c) => c.rosterId === rosterId);
        if (!target) return;
        set({
          roster: state.roster.map((char) => {
            if (char.rosterId !== rosterId) return char;
            const runs = [...char.tower.runs, run].slice(-MAX_TOWER_RUNS);
            const highestCleared =
              run.result === 'win'
                ? Math.max(char.tower.highestCleared, ((run.layer - 1) % 9) + 1)
                : char.tower.highestCleared;
            const highestEndlessLayer =
              run.result === 'win'
                ? Math.max(char.tower.highestEndlessLayer ?? char.tower.highestCleared, run.layer)
                : char.tower.highestEndlessLayer ?? char.tower.highestCleared;
            return {
              ...char,
              tower: {
                highestCleared,
                highestEndlessLayer,
                nextLayer: Math.max(char.tower.nextLayer, highestEndlessLayer + 1),
                runs,
              },
            };
          }),
        });
      },
      appendFormHistory: (rosterId, entry) =>
        set((state) => ({
          roster: state.roster.map((char) =>
            char.rosterId === rosterId
              ? { ...char, formHistory: [...char.formHistory, entry] }
              : char,
          ),
        })),
      appendSkill: (rosterId, skill) =>
        set((state) => ({
          roster: state.roster.map((char) =>
            char.rosterId === rosterId ? { ...char, skills: [...char.skills, skill] } : char,
          ),
        })),
    }),
    {
      name: 'word-brawl-roster',
      version: 4,
      migrate: (persistedState: unknown, version: number) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return { roster: createDefaultRoster() } as { roster: RosterCharacter[] };
        }
        const state = persistedState as { roster?: unknown };
        if (!Array.isArray(state.roster)) {
          return { roster: createDefaultRoster() } as { roster: RosterCharacter[] };
        }
        if (state.roster.length === 0) {
          return { roster: createDefaultRoster() } as { roster: RosterCharacter[] };
        }
        if (version < 4) {
          const roster = state.roster.map((entry) =>
            ensureGrowthFields(entry as Partial<RosterCharacter> & CharacterData),
          );
          return {
            roster: supplementDefaultRoster(roster),
          } as { roster: RosterCharacter[] };
        }
        return {
          roster: supplementDefaultRoster(
            state.roster.map((entry) => ensureGrowthFields(entry as Partial<RosterCharacter> & CharacterData)),
          ),
        } as { roster: RosterCharacter[] };
      },
    },
  ),
);
