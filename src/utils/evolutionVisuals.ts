import type { ActiveEvolutionStage } from '../store/useRosterStore';

export const EVOLUTION_VISUAL_THEME: Record<ActiveEvolutionStage, { primary: string; secondary: string; accent: string; rgb: string; label: string }> = {
  1: { primary: '#FFD700', secondary: '#FF8A00', accent: '#66FCF1', rgb: '255, 215, 0', label: 'AWAKEN' },
  2: { primary: '#66FCF1', secondary: '#1B9AAA', accent: '#FFD700', rgb: '102, 252, 241', label: 'FORGE' },
  3: { primary: '#7FFF9F', secondary: '#0E7A4F', accent: '#66FCF1', rgb: '127, 255, 159', label: 'ASCEND' },
  4: { primary: '#FF6B9D', secondary: '#B00030', accent: '#FFD700', rgb: '255, 107, 157', label: 'BREAK' },
  5: { primary: '#C77DFF', secondary: '#6D28D9', accent: '#FF6BFF', rgb: '199, 125, 255', label: 'DIVINE' },
  6: { primary: '#FFFFFF', secondary: '#FFD700', accent: '#66FCF1', rgb: '255, 255, 255', label: 'MYTHIC' },
};
