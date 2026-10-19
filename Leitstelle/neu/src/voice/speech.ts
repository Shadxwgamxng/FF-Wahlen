import type { VoicePersona } from './caller';

/**
 * Anbindung an die im Browser eingebaute Web-Speech-API – kostenlos, ohne eigenen Server.
 *
 * Datenschutz-Hinweis (wird auch im Einwilligungsdialog angezeigt):
 *  - Sprachausgabe (speechSynthesis) läuft je nach Stimme lokal oder über den Browserhersteller
 *    (in Chrome sind Stimmen mit "Google" im Namen Online-Stimmen; gesendet wird dann der Antworttext
 *    des simulierten Anrufers, nicht deine Stimme).
 *  - Spracherkennung (SpeechRecognition) läuft in Chrome/Edge standardmäßig über den Spracherkennungsdienst
 *    des Herstellers. Neuere Chrome-Versionen können Deutsch auf dem Gerät erkennen (processLocally);
 *    das wird hier erkannt und bevorzugt. LEITWARTE selbst sendet keine Daten.
 *  - Firefox und Safari bieten teils keine Spracherkennung: dann bleibt die Texteingabe.
 */

export type OnDeviceStatus = 'verfuegbar' | 'herunterladbar' | 'wird-geladen' | 'nicht-verfuegbar' | 'unbekannt' | 'ungeprueft';

export interface SpeechSupport {
  recognition: boolean;
  synthesis: boolean;
  onDevice: OnDeviceStatus;
}

/* Minimale Typen – SpeechRecognition ist (noch) nicht Teil von lib.dom */
interface SRAlternative {
  transcript: string;
  confidence: number;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [i: number]: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  mode?: string;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface SRStatic {
  new (): SRInstance;
  available?: (opts: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (opts: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
  availableOnDevice?: (lang: string) => Promise<string>;
  installOnDevice?: (lang: string) => Promise<boolean>;
}

function ctor(): SRStatic | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRStatic; webkitSpeechRecognition?: SRStatic };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const STATUS: Record<string, OnDeviceStatus> = {
  available: 'verfuegbar',
  downloadable: 'herunterladbar',
  downloading: 'wird-geladen',
  unavailable: 'nicht-verfuegbar',
  'no': 'nicht-verfuegbar',
  readily: 'verfuegbar',
  'after-download': 'herunterladbar',
};

/**
 * Prüft nur, ob Erkennung und Ausgabe grundsätzlich vorhanden sind – ohne die Erkennung auf dem Gerät
 * abzufragen (siehe checkOnDevice, das bewusst nur auf Klick läuft).
 */
export function detectSupport(): SpeechSupport {
  const SR = ctor();
  const synthesis = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  const canAsk = Boolean(SR && (typeof SR.available === 'function' || typeof SR.availableOnDevice === 'function'));
  return { recognition: Boolean(SR), synthesis, onDevice: !SR ? 'nicht-verfuegbar' : canAsk ? 'ungeprueft' : 'nicht-verfuegbar' };
}

/**
 * Fragt den Browser, ob Deutsch auf dem Gerät erkannt werden kann.
 * Achtung: In manchen Chromium-Builds (z. B. ohne Sprachkomponente) hängt diese Abfrage oder bringt den
 * Tab zum Absturz. Deshalb wird sie nie automatisch, sondern nur auf ausdrücklichen Klick ausgeführt
 * und nach einigen Sekunden als "unbekannt" abgebrochen.
 */
export async function checkOnDevice(lang = 'de-DE', timeoutMs = 8000): Promise<OnDeviceStatus> {
  const SR = ctor();
  if (!SR) return 'nicht-verfuegbar';
  const ask = async (): Promise<OnDeviceStatus> => {
    if (typeof SR.available === 'function') return STATUS[await SR.available({ langs: [lang], processLocally: true })] ?? 'unbekannt';
    if (typeof SR.availableOnDevice === 'function') return STATUS[await SR.availableOnDevice(lang)] ?? 'unbekannt';
    return 'nicht-verfuegbar';
  };
  try {
    return await Promise.race([ask(), new Promise<OnDeviceStatus>((r) => setTimeout(() => r('unbekannt'), timeoutMs))]);
  } catch {
    return 'unbekannt';
  }
}

/** Lädt das Sprachpaket für die Erkennung auf dem Gerät (Chrome fragt ggf. selbst nach) */
export async function installOnDevice(lang = 'de-DE'): Promise<boolean> {
  const SR = ctor();
  try {
    if (SR?.install) return await SR.install({ langs: [lang], processLocally: true });
    if (SR?.installOnDevice) return await SR.installOnDevice(lang);
  } catch {
    /* nicht unterstützt */
  }
  return false;
}

export const RECOGNITION_ERRORS: Record<string, string> = {
  'not-allowed': 'Der Zugriff auf das Mikrofon wurde nicht erlaubt.',
  'service-not-allowed': 'Der Browser erlaubt die Spracherkennung hier nicht.',
  'audio-capture': 'Kein Mikrofon gefunden.',
  'no-speech': 'Es wurde keine Sprache erkannt.',
  network: 'Der Spracherkennungsdienst des Browsers ist nicht erreichbar.',
  'language-not-supported': 'Deutsch wird von der Spracherkennung dieses Browsers nicht unterstützt.',
  aborted: 'Die Spracherkennung wurde abgebrochen.',
};

export interface RecognizerOptions {
  lang?: string;
  /** Nur auf dem Gerät erkennen – nie an einen Dienst senden */
  onDeviceOnly: boolean;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: string, message: string) => void;
  onEnd: () => void;
  /** Weiter zuhören bis stop() (Sendetaste gedrückt halten) statt bis zur ersten Sprechpause */
  continuous?: boolean;
}

export interface Recognizer {
  start(): void;
  stop(): void;
  abort(): void;
}

/**
 * Erkennt eine Äußerung (bis zur Sprechpause). Liefert null, wenn der Browser keine Erkennung kann
 * oder "nur auf dem Gerät" gewünscht ist, der Browser das aber nicht zusichern kann.
 */
export function createRecognizer(o: RecognizerOptions): Recognizer | null {
  const SR = ctor();
  if (!SR) return null;
  const r = new SR();
  if (o.onDeviceOnly) {
    if ('processLocally' in r) r.processLocally = true;
    else if ('mode' in r) r.mode = 'ondevice-only';
    else return null;
  }
  r.lang = o.lang ?? 'de-DE';
  r.continuous = o.continuous ?? false;
  r.interimResults = true;
  r.maxAlternatives = 1;
  let final = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) final += `${res[0].transcript} `;
      else interim += res[0].transcript;
    }
    o.onInterim((final + interim).trim());
  };
  r.onerror = (e) => {
    const local = o.onDeviceOnly && (e.error === 'language-not-supported' || e.error === 'service-not-allowed');
    o.onError(
      e.error,
      local
        ? 'Die Erkennung auf dem Gerät ist für Deutsch noch nicht bereit (Sprachpaket fehlt oder wird nicht unterstützt). Es wurde nichts gesendet.'
        : (RECOGNITION_ERRORS[e.error] ?? `Fehler der Spracherkennung (${e.error}).`),
    );
  };
  // erst das Ende melden, dann den Text liefern – die Antwort darauf darf sofort wieder zuhören
  r.onend = () => {
    const text = final.trim();
    final = '';
    o.onEnd();
    if (text) o.onFinal(text);
  };
  return {
    start: () => r.start(),
    stop: () => r.stop(),
    abort: () => r.abort(),
  };
}

export function germanVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('de'));
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

/**
 * Spricht den Text des simulierten Anrufers. Das Promise endet auch dann, wenn der Browser kein
 * "end"-Ereignis liefert (z. B. ohne installierte Stimmen) – spätestens nach einer geschätzten Sprechdauer.
 */
export function speakAs(text: string, persona: VoicePersona, voiceURI?: string): Promise<void> {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = persona.rate;
    u.pitch = persona.pitch;
    const voice = germanVoices().find((v) => v.voiceURI === voiceURI);
    if (voice) u.voice = voice;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    // ca. 14 Zeichen pro Sekunde (großzügig mit 10 gerechnet) bei normaler Rate, plus Puffer
    const timer = setTimeout(finish, 2000 + (text.length / (10 * persona.rate)) * 1000);
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  });
}
