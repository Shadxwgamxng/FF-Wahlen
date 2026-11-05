import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMessages, keepsFacts, llmAnswer, type LlmContext } from './llm';

const ctx: LlmContext = {
  opening: 'Bei uns brennt es in der Küche!',
  relation: 'Bewohner/-in',
  facts: { what: 'Küchenbrand', injured: 0 },
  address: 'Strandallee 14, 23683 Scharbeutz',
  history: [],
  said: 'Wo genau ist der Notfallort?',
  draft: 'Strandallee 14 in Scharbeutz.',
  emotion: 2,
  personality: 'aufgeregt',
};

describe('lokale KI (Ollama) für Anruferantworten', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Vorlage, Fakten und Gefühlslage stehen im Auftrag', () => {
    const m = buildMessages(ctx);
    expect(m[0].content).toContain('in Panik');
    expect(m[0].content).toContain('Strandallee 14');
    expect(m.at(-1)!.content).toContain('VORLAGE: Strandallee 14 in Scharbeutz.');
  });

  it('Zahlen und Straßen der Vorlage müssen erhalten bleiben', () => {
    expect(keepsFacts('Strandallee 14 in Scharbeutz.', 'Wir sind in der Strandallee 14, in Scharbeutz, bitte schnell!')).toBe(true);
    expect(keepsFacts('Strandallee 14 in Scharbeutz.', 'Wir sind in der Strandallee 41!')).toBe(false);
    expect(keepsFacts('Zwei Mieter haben Kopfschmerzen.', 'Zwei Leute aus dem Erdgeschoss haben Kopfweh.')).toBe(true);
  });

  it('nimmt die freie Antwort nur, wenn sie passt – sonst gilt die Vorlage', async () => {
    const reply = (content: string) => vi.fn(async () => ({ ok: true, json: async () => ({ message: { content } }) }));
    vi.stubGlobal('fetch', reply('„Strandallee 14, in Scharbeutz – bitte beeilen Sie sich!“'));
    expect(await llmAnswer({ url: 'http://localhost:11434', model: 'qwen2.5:7b' }, ctx)).toBe('Strandallee 14, in Scharbeutz – bitte beeilen Sie sich!');
    vi.stubGlobal('fetch', reply('Ich wohne in der Hauptstraße 3.'));
    expect(await llmAnswer({ url: 'http://localhost:11434', model: 'qwen2.5:7b' }, ctx)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('nicht erreichbar'); }));
    expect(await llmAnswer({ url: 'http://localhost:11434', model: 'qwen2.5:7b' }, ctx)).toBeNull();
  });
});
