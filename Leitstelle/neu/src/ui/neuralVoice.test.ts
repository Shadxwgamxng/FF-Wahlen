import { describe, expect, it } from 'vitest';
import { castFor, hesitate, phrases, prosody } from './neuralVoice';

describe('natürliche Stimmen', () => {
  it('jeder Anrufer behält seine Stimme, verschiedene Anrufer klingen verschieden', () => {
    expect(castFor('telefon', 'call-1')).toEqual(castFor('telefon', 'call-1'));
    const casts = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(castFor('telefon', `call-${i}`))));
    expect(casts.size).toBeGreaterThan(20);
    const female = Array.from({ length: 200 }, (_, i) => castFor('telefon', `c${i}`).female).filter(Boolean).length;
    expect(female).toBeGreaterThan(70);
    expect(female).toBeLessThan(130);
    // Funk: überwiegend Männerstimmen
    expect(Array.from({ length: 200 }, (_, i) => castFor('funk', `v${i}`).female).filter(Boolean).length).toBeLessThan(50);
  });

  it('Aufregung: schneller, unruhiger, kürzere Pausen – ältere Menschen langsamer', () => {
    const cast = castFor('telefon', 'call-3');
    const calm = prosody({ rate: 1, pitch: 1, emotion: 0, personality: 'ruhig' }, cast);
    const panic = prosody({ rate: 1, pitch: 1, emotion: 2, personality: 'ruhig' }, cast);
    const old = prosody({ rate: 1, pitch: 1, emotion: 0, personality: 'aelter' }, cast);
    expect(panic.length).toBeLessThan(calm.length);
    expect(panic.noise).toBeGreaterThan(calm.noise);
    expect(panic.pause).toBeLessThan(calm.pause);
    expect(old.length).toBeGreaterThan(calm.length);
  });

  it('Denkpausen werden zu echten Pausen, Stocken nur beim Sprechen und nie in Adressen', () => {
    expect(phrases('Hallo?! Bitte – in der Küche … oh Gott, schnell!')).toEqual(['Hallo?! Bitte', 'in der Küche', 'oh Gott, schnell!']);
    for (let i = 0; i < 50; i++) {
      const p = { rate: 1, pitch: 1, emotion: 2 as const, personality: 'aufgeregt' as const, voiceSeed: `c${i}` };
      expect(hesitate('Strandallee 14 in Scharbeutz, bitte kommen Sie schnell.', p)).toBe('Strandallee 14 in Scharbeutz, bitte kommen Sie schnell.');
      expect(hesitate('Meine Nachbarin liegt im Flur und antwortet nicht mehr.', p).replace(/[…–]|äh/g, '').replace(/\s+/g, ' ')).toMatch(/Meine Nachbarin (liegt )+im Flur|Meine Nachbarin liegt (im )+Flur|Meine Nachbarin liegt im (Flur )+und/);
    }
    const calm = { rate: 1, pitch: 1, emotion: 0 as const, personality: 'ruhig' as const, voiceSeed: 'x' };
    expect(hesitate('Meine Nachbarin liegt im Flur und antwortet nicht mehr.', calm)).toBe('Meine Nachbarin liegt im Flur und antwortet nicht mehr.');
  });
});
