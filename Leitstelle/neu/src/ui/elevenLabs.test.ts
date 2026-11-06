import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { elCast, elCost, elDelivery, elSynthesize, refreshQuota, type ElVoice } from './elevenLabs';
import { setPrefs } from './prefs';

const VOICES: ElVoice[] = [
  { id: 'f1', name: 'Anna', female: true },
  { id: 'f2', name: 'Mia', female: true },
  { id: 'm1', name: 'Jonas', female: false },
  { id: 'm2', name: 'Paul', female: false },
];

describe('ElevenLabs (optional)', () => {
  beforeEach(() => setPrefs({ elevenKey: 'test-key', elevenModel: 'eleven_v4_turbo' }));
  afterEach(() => {
    setPrefs({ elevenKey: '' });
    vi.unstubAllGlobals();
  });

  it('feste Stimme je Anrufer, Geschlecht wie bei der Piper-Besetzung', () => {
    expect(elCast(VOICES, 'telefon', 'call-1', true)).toEqual(elCast(VOICES, 'telefon', 'call-1', true));
    for (let i = 0; i < 20; i++) {
      expect(elCast(VOICES, 'telefon', `c${i}`, true)!.female).toBe(true);
      expect(elCast(VOICES, 'funk', `v${i}`, false)!.female).toBe(false);
    }
    expect(elCast([], 'telefon', 'x', true)).toBeNull();
  });

  it('Gefühl: Regieanweisungen nur bei v4/v3, Einstellungen je Aufregung', () => {
    const panic = elDelivery('Mein Mann atmet nicht mehr!', { rate: 1, pitch: 1, emotion: 2, personality: 'aufgeregt' }, 'eleven_v4_turbo');
    expect(panic.text).toBe('[panicked, crying] Mein Mann atmet nicht mehr!');
    const calm = elDelivery('Ja, guten Tag.', { rate: 1, pitch: 1, emotion: 0, personality: 'ruhig' }, 'eleven_v4_turbo');
    expect(calm.text).toBe('Ja, guten Tag.');
    expect(panic.settings.stability).toBeLessThan(calm.settings.stability);
    expect(elDelivery('Hilfe!', { rate: 1, pitch: 1, emotion: 2 }, 'eleven_flash_v2_5').text).toBe('Hilfe!');
    expect(elCost('x'.repeat(100), 'eleven_flash_v2_5')).toBe(50);
  });

  it('erzeugt den Satz – und fällt bei fehlendem Guthaben oder Fehlern auf Piper zurück (null)', async () => {
    const decoded = { duration: 1 } as AudioBuffer;
    const ctx = { decodeAudioData: vi.fn(async () => decoded) } as unknown as BaseAudioContext;
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string): Promise<unknown> => {
      calls.push(url);
      if (url.endsWith('/voices')) return { ok: true, json: async () => ({ voices: VOICES.map((v) => ({ voice_id: v.id, name: v.name, labels: { gender: v.female ? 'female' : 'male' } })) }) };
      if (url.endsWith('/user/subscription')) return { ok: true, json: async () => ({ character_count: 100, character_limit: 10000, tier: 'free' }) };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    vi.stubGlobal('fetch', fetchMock);
    await refreshQuota();
    expect(await elSynthesize(ctx, 'Hallo, bitte schnell!', { rate: 1, pitch: 1, emotion: 2, voiceSeed: 'c1' }, 'telefon', true)).toBe(decoded);
    expect(calls.some((u) => u.includes('/text-to-speech/f'))).toBe(true);
    // Guthaben fast leer: kein Aufruf, Piper übernimmt
    fetchMock.mockImplementation(async (url: string) => {
      calls.push(url);
      return url.endsWith('/user/subscription') ? { ok: true, json: async () => ({ character_count: 9990, character_limit: 10000 }) } : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    await refreshQuota();
    const before = calls.length;
    expect(await elSynthesize(ctx, 'Noch ein längerer Satz, der nicht mehr ins Guthaben passt.', { rate: 1, pitch: 1, voiceSeed: 'c1' }, 'telefon', true)).toBeNull();
    expect(calls.length).toBe(before);
    // ohne Schlüssel gar nicht
    setPrefs({ elevenKey: '' });
    expect(await elSynthesize(ctx, 'Hallo', { rate: 1, pitch: 1 }, 'telefon', true)).toBeNull();
  });
});
