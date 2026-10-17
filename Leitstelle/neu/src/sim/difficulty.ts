import type { Difficulty } from '../model/types';

export interface DifficultyProfile {
  label: string;
  callRate: number;
  escalation: number;
  hangupSeconds: number;
  keywordHint: boolean;
  breakdown: number;
  workTime: number;
  duplicateCallChance: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyProfile> = {
  leicht: { label: 'Leicht', callRate: 0.6, escalation: 0.5, hangupSeconds: 300, keywordHint: true, breakdown: 0.5, workTime: 0.8, duplicateCallChance: 0.05 },
  normal: { label: 'Normal', callRate: 1, escalation: 1, hangupSeconds: 180, keywordHint: true, breakdown: 1, workTime: 1, duplicateCallChance: 0.12 },
  schwer: { label: 'Schwer', callRate: 1.4, escalation: 1.4, hangupSeconds: 120, keywordHint: false, breakdown: 1.5, workTime: 1.15, duplicateCallChance: 0.18 },
  experte: { label: 'Experte', callRate: 1.9, escalation: 1.8, hangupSeconds: 80, keywordHint: false, breakdown: 2, workTime: 1.3, duplicateCallChance: 0.25 },
};

/** Relatives Notrufaufkommen je Stunde (0–23), Mittelwert ≈ 1 */
export const HOURLY_PROFILE = [
  0.45, 0.4, 0.35, 0.3, 0.3, 0.4, 0.7, 1.0, 1.2, 1.3, 1.3, 1.3, 1.3, 1.25, 1.2, 1.2, 1.25, 1.3, 1.3, 1.2, 1.1, 0.95, 0.75, 0.55,
];

export const isNight = (hour: number) => hour < 7 || hour >= 19;
