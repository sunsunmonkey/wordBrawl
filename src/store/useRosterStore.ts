import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CharacterData } from './useGameStore';

export interface RosterCharacter extends CharacterData {
  rosterId: string;
  recruitedAt: number;
}

const MAX_ROSTER_SIZE = 24;

const cloneCharacter = (char: CharacterData): CharacterData => JSON.parse(JSON.stringify(char));

export const resetCharacterRuntimeState = (char: CharacterData): CharacterData => {
  const copy = cloneCharacter(char);
  const { rosterId: _rosterId, recruitedAt: _recruitedAt, ...character } = copy as CharacterData & Partial<RosterCharacter>;
  return {
    ...character,
    hp: character.maxHp,
    ultimateCharge: 0,
    attackBuff: 0,
    defenseBuff: 0,
    buffTurnsLeft: 0,
    weapon: undefined,
    critBonus: undefined,
    baseStats: undefined,
  };
};

const makeRosterId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

interface RosterStore {
  roster: RosterCharacter[];
  recruitCharacter: (char: CharacterData, sourceDescription?: string) => void;
  removeCharacter: (rosterId: string) => void;
}

export const useRosterStore = create<RosterStore>()(
  persist(
    (set) => ({
      roster: [],
      recruitCharacter: (char, sourceDescription) => set((state) => {
        const recruited: RosterCharacter = {
          ...resetCharacterRuntimeState(char),
          sourceDescription: sourceDescription ?? char.sourceDescription,
          rosterId: makeRosterId(),
          recruitedAt: Date.now(),
        };

        return {
          roster: [recruited, ...state.roster].slice(0, MAX_ROSTER_SIZE),
        };
      }),
      removeCharacter: (rosterId) => set((state) => ({
        roster: state.roster.filter((char) => char.rosterId !== rosterId),
      })),
    }),
    {
      name: 'word-brawl-roster',
      version: 1,
    },
  ),
);
