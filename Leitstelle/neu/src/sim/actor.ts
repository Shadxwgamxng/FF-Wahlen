/**
 * Wer führt den gerade laufenden Befehl aus? (Mehrspieler)
 * Das Hauptgerät (Gastgeber) setzt den Spieler vor jedem Befehl; die Simulation selbst (Takt) hat keinen.
 */
export interface Actor {
  id: string;
  name: string;
  /** Gastgeber (rechnet die Simulation, steuert Zeit und Bearbeitung) */
  host: boolean;
}

let current: Actor | null = null;

export function withActor<T>(a: Actor | null, fn: () => T): T {
  const prev = current;
  current = a;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

export const getActor = () => current;
