/**
 * Einwilligung und Transkripte des Sprachtests – ausschließlich im localStorage dieses Browsers.
 * Es werden keine Audiodaten gespeichert, nur der erkannte bzw. getippte Text.
 * Widerruf der Einwilligung löscht alle gespeicherten Transkripte.
 */

export type RecognitionMode = 'geraet' | 'browserdienst' | 'text';

export interface VoiceConsent {
  version: 1;
  at: number;
  mode: RecognitionMode;
}

export interface TranscriptLine {
  who: 'disponent' | 'anrufer' | 'system';
  text: string;
  at: number;
}

export interface TranscriptSession {
  id: string;
  startedAt: number;
  endedAt: number;
  scenario: string;
  lines: TranscriptLine[];
  score?: { score: number; total: number };
}

const CONSENT_KEY = 'leitwarte.sprachtest.einwilligung';
const TRANSCRIPTS_KEY = 'leitwarte.sprachtest.transkripte';
/** Ältere Transkripte werden verworfen */
export const MAX_TRANSCRIPTS = 30;

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

let backend: KV | null = null;
/** Für Tests: anderen Speicher verwenden */
export function setVoiceStorage(kv: KV | null) {
  backend = kv;
}
function kv(): KV | null {
  if (backend) return backend;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = kv()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    kv()?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getConsent(): VoiceConsent | null {
  const c = read<VoiceConsent>(CONSENT_KEY);
  return c && c.version === 1 && ['geraet', 'browserdienst', 'text'].includes(c.mode) ? c : null;
}

export function giveConsent(mode: RecognitionMode, at = Date.now()): VoiceConsent {
  const c: VoiceConsent = { version: 1, at, mode };
  write(CONSENT_KEY, c);
  return c;
}

/** Widerruf: Einwilligung und alle Transkripte löschen */
export function withdrawConsent() {
  try {
    kv()?.removeItem(CONSENT_KEY);
    kv()?.removeItem(TRANSCRIPTS_KEY);
  } catch {
    /* Speicher nicht verfügbar – nichts zu löschen */
  }
}

export function listTranscripts(): TranscriptSession[] {
  const list = read<TranscriptSession[]>(TRANSCRIPTS_KEY);
  return Array.isArray(list) ? list : [];
}

/** Speichert ein Gespräch (nur mit Einwilligung). Liefert false, wenn nichts gespeichert wurde. */
export function saveTranscript(session: TranscriptSession): boolean {
  if (!getConsent()) return false;
  const list = [session, ...listTranscripts().filter((s) => s.id !== session.id)].slice(0, MAX_TRANSCRIPTS);
  return write(TRANSCRIPTS_KEY, list);
}

export function deleteTranscript(id: string) {
  write(
    TRANSCRIPTS_KEY,
    listTranscripts().filter((s) => s.id !== id),
  );
}

export function deleteAllTranscripts() {
  try {
    kv()?.removeItem(TRANSCRIPTS_KEY);
  } catch {
    /* ignorieren */
  }
}

export function transcriptToText(s: TranscriptSession): string {
  const who = { disponent: 'Disponent', anrufer: 'Anrufer (simuliert)', system: 'System' } as const;
  const t0 = s.startedAt;
  const head = `LEITWARTE Sprachtest – ${s.scenario}\n${new Date(s.startedAt).toLocaleString('de-DE')}\n\n`;
  return head + s.lines.map((l) => `[${String(Math.round((l.at - t0) / 1000)).padStart(3, ' ')} s] ${who[l.who]}: ${l.text}`).join('\n');
}
