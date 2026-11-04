import type { GameState, StatusMeaning } from '../model/types';
import { statusDef } from '../sim/engine';
import { getPrefs } from './prefs';

/**
 * Statusfarben im Stil „Klassisch“ wie auf dem Wachentableau klassischer Einsatzleitsysteme:
 * 1 grün, 2 weiß, 3 gelb, 4 lachsrot, 6 schwarz mit gelber Schrift, 7 grau, 8 hellblau.
 */
const CLASSIC: Record<StatusMeaning, { bg: string; fg: string }> = {
  frei_funk: { bg: '#97ff9b', fg: '#000000' },
  frei_wache: { bg: '#ffffff', fg: '#000000' },
  alarmiert: { bg: '#ffb3e6', fg: '#000000' },
  anfahrt: { bg: '#ffff00', fg: '#000000' },
  einsatzort: { bg: '#ff6665', fg: '#ffffff' },
  sprechwunsch: { bg: '#ffa53b', fg: '#000000' },
  ausser_dienst: { bg: '#000000', fg: '#e8e84a' },
  transport: { bg: '#989898', fg: '#ffffff' },
  am_ziel: { bg: '#9cc8ff', fg: '#000000' },
};

/** Hintergrund- und Schriftfarbe eines Status im aktuellen Stil */
export function statusColors(game: GameState, meaning: StatusMeaning): { bg: string; fg: string } {
  if (getPrefs().uiStyle === 'klassisch') return CLASSIC[meaning];
  return { bg: statusDef(game, meaning).color, fg: '#0b0f14' };
}
