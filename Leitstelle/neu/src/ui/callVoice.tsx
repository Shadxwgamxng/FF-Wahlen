import { useEffect, useSyncExternalStore } from 'react';
import type { Call } from '../model/types';
import { CallerSim, personaFor, type VoiceCall } from '../voice/caller';
import { hashSeed } from '../voice/details/types';
import { createRecognizer, germanVoices, speakAs, stopSpeaking, type Recognizer } from '../voice/speech';
import { getConsent } from '../voice/transcripts';
import { store } from '../store/gameStore';

/**
 * Freisprechen bei echten Notrufen im Spiel: Sobald ein Notruf angenommen ist, ist am Leitstand-PC das
 * Mikrofon offen. Gesagtes wird erkannt, der simulierte Anrufer (voice/caller.ts) antwortet per
 * Sprachausgabe. Halbduplex: Während der Anrufer spricht oder die Funk-Sendetaste gedrückt ist, hört
 * die Erkennung nicht zu (kein Echo, nur eine Erkennung gleichzeitig).
 * Jeder Wortwechsel landet als Befehl voiceTurn im Gesprächsverlauf der Einsatzmaske.
 */

export interface CallVoiceStatus {
  callId: string | null;
  state: 'aus' | 'hoert' | 'spricht' | 'pause' | 'stumm' | 'fehler' | 'aufgelegt';
  interim: string;
  error: string;
  muted: boolean;
}

let status: CallVoiceStatus = { callId: null, state: 'aus', interim: '', error: '', muted: false };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<CallVoiceStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export function useCallVoiceStatus(): CallVoiceStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

/** Mikrofon für den laufenden Notruf stumm schalten bzw. wieder öffnen */
export function setCallVoiceMuted(muted: boolean) {
  setStatus({ muted });
  window.dispatchEvent(new Event('leitwarte-freisprechen'));
}

/** Notruf aus dem Spiel als Gesprächspartner für den simulierten Anrufer */
export function voiceCallOf(c: Call): VoiceCall {
  return {
    scenarioId: c.scenarioId,
    scenarioName: '',
    variantIdx: c.variantIdx,
    category: c.category,
    opening: c.opening,
    caller: { ...c.caller },
    facts: { ...c.facts },
    location: {
      position: c.location.position,
      address: c.location.address,
      areaId: c.location.areaId,
      detail: c.location.detail,
      street: c.location.street ?? '',
      houseNumber: c.location.houseNumber ?? '',
      postcode: c.location.postcode ?? '',
      city: c.location.city ?? '',
    },
  };
}

/** Der Notruf, mit dem gerade gesprochen wird: zuletzt angenommener in Abfrage */
const activeCall = (): Call | null => {
  const calls = store.state?.runtime.calls.filter((c) => c.state === 'in_abfrage') ?? [];
  return calls.sort((a, b) => (b.acceptedAt ?? 0) - (a.acceptedAt ?? 0))[0] ?? null;
};

interface Session {
  callId: string;
  sim: CallerSim;
  rec: Recognizer | null;
  /** Anrufer spricht gerade */
  speaking: boolean;
  /** Antwort wird erzeugt/gesprochen */
  busy: boolean;
  /** Fehler der Erkennung in Folge */
  errors: number;
  voice?: string;
}

/** Läuft nur im Hauptfenster (Leitstand-PC) */
export function CallVoiceController() {
  useEffect(() => {
    let session: Session | null = null;
    let restart: ReturnType<typeof setTimeout> | null = null;

    const funkBusy = () => store.funkStatus.sending;

    const listen = () => {
      if (restart) clearTimeout(restart);
      restart = null;
      const s = session;
      if (!s || s.rec || s.speaking || s.busy || s.sim.ended) return;
      if (status.muted) return setStatus({ state: 'stumm', interim: '' });
      if (funkBusy()) return setStatus({ state: 'pause', interim: '' });
      const consent = getConsent();
      if (!consent || consent.mode === 'text') return setStatus({ state: 'fehler', error: 'Mikrofon noch nicht freigegeben – bitte unten freigeben. Bis dahin per Klick abfragen.' });
      const r = createRecognizer({
        onDeviceOnly: consent.mode === 'geraet',
        onInterim: (t) => setStatus({ interim: t }),
        onFinal: (t) => void handle(s, t),
        onError: (code, message) => {
          if (code === 'no-speech' || code === 'aborted') return;
          s.errors++;
          setStatus({ state: 'fehler', error: message });
        },
        onEnd: () => {
          if (s.rec === r) s.rec = null;
          // nach Fehlern nicht in schneller Folge neu starten
          if (session === s && !s.busy && s.errors < 3) restart = setTimeout(listen, s.errors ? 1500 : 150);
        },
      });
      if (!r) return setStatus({ state: 'fehler', error: 'Dieser Browser kann keine Sprache erkennen (Chrome oder Edge verwenden). Bitte per Klick abfragen.' });
      s.rec = r;
      try {
        r.start();
        setStatus({ state: 'hoert', error: '', interim: '' });
      } catch {
        s.rec = null;
        restart = setTimeout(listen, 1000);
      }
    };

    const handle = async (s: Session, text: string) => {
      if (session !== s || !text.trim()) return;
      s.busy = true;
      s.errors = 0;
      const turn = s.sim.respond(text);
      // neu festgelegte Detailangaben des Anrufers (x_…) im Spielstand merken
      const game = store.state?.runtime.calls.find((c) => c.id === s.callId);
      const patch: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(s.sim.call.facts)) if (k.startsWith('x_') && game && game.facts[k] === undefined) patch[k] = v;
      store.cmdQuiet('voiceTurn', s.callId, text, turn.text || '…', turn.questions, patch);
      if (turn.text) {
        s.speaking = true;
        setStatus({ state: 'spricht', interim: '' });
        await speakAs(turn.text, personaFor(turn.emotion, s.sim.personality), s.voice);
        s.speaking = false;
      }
      s.busy = false;
      if (session !== s) return;
      if (turn.ended) setStatus({ state: 'aufgelegt', interim: '' });
      else listen();
    };

    const end = () => {
      if (!session) return;
      session.rec?.abort();
      if (session.speaking) stopSpeaking();
      session = null;
      if (restart) clearTimeout(restart);
      setStatus({ callId: null, state: 'aus', interim: '', error: '', muted: false });
    };

    const sync = () => {
      const c = activeCall();
      if (session && session.callId !== c?.id) end();
      if (c && !session) {
        const vs = germanVoices();
        session = { callId: c.id, sim: new CallerSim(voiceCallOf(c)), rec: null, speaking: false, busy: false, errors: 0, voice: vs.length ? vs[hashSeed(c.id) % vs.length].voiceURI : undefined };
        setStatus({ callId: c.id, state: 'hoert', interim: '', error: '', muted: false });
        listen();
        return;
      }
      if (!session) return;
      // Funk-Sendetaste: Erkennung freigeben, danach weiter zuhören
      if (funkBusy() && session.rec) {
        session.rec.abort();
        session.rec = null;
        setStatus({ state: 'pause' });
      } else if (!funkBusy() && !session.rec && !session.busy && (status.state === 'pause' || status.state === 'stumm')) listen();
    };

    const retry = () => {
      if (session) {
        session.errors = 0;
        if (status.muted) session.rec?.abort();
        listen();
      }
    };
    const unsub = store.subscribe(sync);
    window.addEventListener('leitwarte-freisprechen', retry);
    sync();
    return () => {
      unsub();
      window.removeEventListener('leitwarte-freisprechen', retry);
      end();
    };
  }, []);
  return null;
}
