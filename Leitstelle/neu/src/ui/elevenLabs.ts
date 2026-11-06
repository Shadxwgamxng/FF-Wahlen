import type { SpeechChannel } from '../voice/speech';
import type { Emotion, VoicePersona } from '../voice/style';
import { hashSeed } from '../voice/details/types';
import { getPrefs, setPrefs } from './prefs';

/**
 * Optional: Stimmen von ElevenLabs (kostenpflichtiger Dienst, mit eigenem Schlüssel; das kostenlose
 * Konto reicht für etwa 1–2 Stunden Spiel im Monat). Ist kein Schlüssel eingetragen, das Guthaben
 * aufgebraucht oder keine Verbindung da, sprechen die Piper-Stimmen. Erzeugte Sätze werden im Browser
 * gespeichert und nicht noch einmal bezahlt.
 *
 * Der Schlüssel bleibt in diesem Browser; gesendet wird nur der zu sprechende Text an ElevenLabs.
 */

const API = 'https://api.elevenlabs.io/v1';

/** Modelle: ausdrucksstark in Echtzeit (mit Regieanweisungen wie [panicked]) oder schnell zum halben Preis */
export const EL_MODELS: [string, string][] = [
  ['eleven_v4_turbo', 'Eleven v4 Turbo – sehr ausdrucksstark (Panik, Weinen …)'],
  ['eleven_flash_v2_5', 'Flash v2.5 – halber Preis, etwas weniger Gefühl'],
];

export interface ElVoice {
  id: string;
  name: string;
  female: boolean;
}

// ------------------------------------------------------------ Stimmenliste und Guthaben

let voices: Promise<ElVoice[]> | null = null;
let voicesKey = '';

/** Stimmen des Kontos (fertige Stimmen und eigene), nach Geschlecht für die Besetzung */
export function elVoices(): Promise<ElVoice[]> {
  const key = getPrefs().elevenKey;
  if (!key) return Promise.resolve([]);
  if (voices && voicesKey === key) return voices;
  voicesKey = key;
  voices = fetch(`${API}/voices`, { headers: { 'xi-api-key': key } })
    .then((r) => (r.ok ? r.json() : { voices: [] }))
    .then((d: { voices?: { voice_id: string; name: string; labels?: Record<string, string> }[] }) =>
      (d.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, female: (v.labels?.gender ?? '').toLowerCase().startsWith('f') })),
    )
    .catch(() => []);
  return voices;
}

export interface Quota {
  used: number;
  limit: number;
  /** Zeitpunkt der nächsten Gutschrift (ms) */
  resetAt: number | null;
  tier: string;
}

let quota: Quota | null = null;
const quotaListeners = new Set<(q: Quota | null) => void>();
export const onQuota = (l: (q: Quota | null) => void) => {
  quotaListeners.add(l);
  return () => quotaListeners.delete(l);
};
const setQuota = (q: Quota | null) => {
  quota = q;
  quotaListeners.forEach((l) => l(q));
};
export const currentQuota = () => quota;

/** Guthaben beim Dienst abfragen */
export async function refreshQuota(): Promise<Quota | null> {
  const key = getPrefs().elevenKey;
  if (!key) {
    setQuota(null);
    return null;
  }
  try {
    const r = await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': key } });
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as { character_count: number; character_limit: number; next_character_count_reset_unix?: number; tier?: string };
    const q = { used: d.character_count, limit: d.character_limit, resetAt: d.next_character_count_reset_unix ? d.next_character_count_reset_unix * 1000 : null, tier: d.tier ?? '' };
    setQuota(q);
    return q;
  } catch {
    setQuota(null);
    return null;
  }
}

/** Verbindung prüfen (für die Einstellungen) */
export async function testElevenLabs(): Promise<string> {
  if (!getPrefs().elevenKey) return 'Kein Schlüssel eingetragen.';
  voices = null;
  const q = await refreshQuota();
  if (!q) return 'Fehler: Schlüssel ungültig oder ElevenLabs nicht erreichbar.';
  const vs = await elVoices();
  return `OK – ${vs.length} Stimmen, Guthaben ${Math.max(0, q.limit - q.used).toLocaleString('de-DE')} von ${q.limit.toLocaleString('de-DE')} Zeichen`;
}

// ------------------------------------------------------------ Besetzung, Gefühl, Text

/** Stimme für einen Sprecher – gleicher Seed, gleiche Stimme (Funk überwiegend Männer) */
export function elCast(list: ElVoice[], channel: SpeechChannel, seed: string, female: boolean): ElVoice | null {
  if (!list.length) return null;
  const pool = list.filter((v) => v.female === female);
  const from = pool.length ? pool : list;
  const h = hashSeed(`${seed}|elevenlabs|${channel}`) >>> 0;
  return from[h % from.length];
}

/** Regieanweisungen (nur v4/v3) und Stimmeinstellungen je Gefühlslage */
export function elDelivery(text: string, persona: VoicePersona, model: string) {
  const e: Emotion = persona.emotion ?? 0;
  const p = persona.personality;
  const tags = model.startsWith('eleven_v4') || model.startsWith('eleven_v3');
  let tag = '';
  if (tags) {
    if (e === 2) tag = /\b(atmet nicht|bewusstlos|eingeklemmt|blutet|tot)\b/i.test(text) ? '[panicked, crying]' : '[panicked]';
    else if (e === 1) tag = p === 'knapp' ? '[impatient]' : '[nervous]';
    else if (p === 'aelter') tag = '[slowly]';
  }
  return {
    text: tag ? `${tag} ${text}` : text,
    settings: {
      stability: [0.55, 0.38, 0.22][e],
      similarity_boost: 0.75,
      style: [0.1, 0.35, 0.6][e],
      speed: Math.min(1.2, Math.max(0.8, (p === 'aelter' ? 0.9 : 1) + e * 0.06)),
    },
  };
}

/** Kosten in Guthaben: Flash halber Preis */
export const elCost = (text: string, model: string) => Math.ceil(text.length * (model.includes('flash') ? 0.5 : 1));

// ------------------------------------------------------------ Zwischenspeicher (IndexedDB)

const DB = 'leitwarte-elevenlabs';
function db(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('audio');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
  });
}
async function cacheGet(key: string): Promise<ArrayBuffer | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    const q = d.transaction('audio').objectStore('audio').get(key);
    q.onsuccess = () => resolve((q.result as ArrayBuffer) ?? null);
    q.onerror = () => resolve(null);
  });
}
async function cachePut(key: string, data: ArrayBuffer) {
  const d = await db();
  if (!d) return;
  d.transaction('audio', 'readwrite').objectStore('audio').put(data, key);
}

// ------------------------------------------------------------ Erzeugen

/**
 * Satz bei ElevenLabs erzeugen (oder aus dem Zwischenspeicher). null = nicht möglich → Piper spricht.
 */
export async function elSynthesize(c: BaseAudioContext, text: string, persona: VoicePersona, channel: SpeechChannel, female: boolean): Promise<AudioBuffer | null> {
  const p = getPrefs();
  if (!p.elevenKey || !text.trim()) return null;
  const voice = elCast(await elVoices(), channel, persona.voiceSeed ?? channel, female);
  if (!voice) return null;
  const d = elDelivery(text, persona, p.elevenModel);
  const key = `${p.elevenModel}|${voice.id}|${JSON.stringify(d.settings)}|${d.text}`;
  let data = await cacheGet(key);
  if (!data) {
    // Guthaben reicht nicht (mit Reserve): lieber Piper als ein abgebrochener Satz
    if (quota && quota.limit - quota.used < elCost(d.text, p.elevenModel) + 50) return null;
    try {
      const r = await fetch(`${API}/text-to-speech/${voice.id}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': p.elevenKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: d.text, model_id: p.elevenModel, language_code: 'de', voice_settings: d.settings }),
      });
      if (!r.ok) {
        // 401: Schlüssel falsch, 402/429: Guthaben/Limit – bis zur nächsten Prüfung Piper verwenden
        if (r.status === 401 || r.status === 402 || r.status === 429) setQuota(quota ? { ...quota, used: quota.limit } : { used: 1, limit: 0, resetAt: null, tier: '' });
        return null;
      }
      data = await r.arrayBuffer();
      void cachePut(key, data.slice(0));
      if (quota) setQuota({ ...quota, used: quota.used + elCost(d.text, p.elevenModel) });
    } catch {
      return null;
    }
  }
  try {
    return await c.decodeAudioData(data.slice(0));
  } catch {
    return null;
  }
}

/** Schlüssel entfernen (Einstellungen) */
export function forgetElevenLabs() {
  setPrefs({ elevenKey: '' });
  voices = null;
  setQuota(null);
}
