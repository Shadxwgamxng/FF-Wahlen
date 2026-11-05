import type { Emotion, Personality } from './style';
import { PERSONALITY_LABEL } from './style';

/**
 * Optional: Eine lokale KI (Ollama, kostenlos auf dem eigenen PC) formuliert die Antworten des Anrufers
 * frei – passend zu dem, was der Disponent gesagt hat, zur Gefühlslage und zur Persönlichkeit.
 * Was der Anrufer weiß, legt weiterhin die Simulation fest: Die KI bekommt die Antwort der Simulation
 * als Vorlage und darf nichts hinzuerfinden. Passt ihre Antwort nicht (Zahlen oder Straße fehlen,
 * zu lang, keine Antwort in der Zeit), gilt die Antwort der Simulation.
 */

export interface LlmConfig {
  url: string;
  model: string;
}

export interface LlmContext {
  opening: string;
  relation: string;
  facts: Record<string, unknown>;
  address: string;
  history: { said: string; answer: string }[];
  said: string;
  draft: string;
  emotion: Emotion;
  personality: Personality;
}

const MOOD = ['ruhig und gefasst', 'aufgeregt', 'in Panik'];

export function buildMessages(ctx: LlmContext) {
  const facts = Object.entries(ctx.facts)
    .filter(([k, v]) => v !== undefined && v !== null && v !== '' && !k.startsWith('_'))
    .map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');
  const system = [
    'Du spielst einen Menschen, der gerade den Notruf 112 gewählt hat (Feuerwehr und Rettungsdienst).',
    `Du bist ${ctx.relation}. Gefühlslage: ${MOOD[ctx.emotion]}. Persönlichkeit: ${PERSONALITY_LABEL[ctx.personality]}.`,
    'Antworte nur mit dem, was du am Telefon sagst: gesprochenes Deutsch, kurz (höchstens zwei Sätze), ohne Regieanweisungen, ohne Anführungszeichen.',
    'Die VORLAGE enthält genau die Information, die du jetzt gibst. Formuliere sie natürlich, reagiere dabei auf das, was der Disponent gesagt hat.',
    'Erfinde nichts: keine anderen Adressen, Zahlen, Namen oder Verletzungen als in Vorlage und Fakten. Zahlen und Straßennamen aus der Vorlage übernimmst du unverändert.',
    `Was du weißt (Fakten):\n${facts || '- (keine weiteren)'}\nEinsatzort: ${ctx.address}\nDein erster Satz war: „${ctx.opening}“`,
  ].join('\n');
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [{ role: 'system', content: system }];
  for (const h of ctx.history.slice(-6)) {
    messages.push({ role: 'user', content: h.said });
    messages.push({ role: 'assistant', content: h.answer });
  }
  messages.push({ role: 'user', content: `${ctx.said}\n\nVORLAGE: ${ctx.draft}` });
  return messages;
}

/** Zahlen und großgeschriebene Wörter der Vorlage (Straßen, Orte) müssen in der freien Antwort vorkommen */
export function keepsFacts(draft: string, answer: string): boolean {
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const a = norm(answer);
  const numbers = draft.match(/\d+[a-z]?/gi) ?? [];
  if (numbers.some((n) => !a.includes(n.toLowerCase()))) return false;
  // Straßennamen (…straße, …weg, …allee usw.) unverändert
  const streets = draft.match(/[A-ZÄÖÜ][\wäöüß-]*(?:straße|strasse|weg|allee|platz|ring|chaussee|damm|gasse|ufer|kamp|redder)\b/g) ?? [];
  return streets.every((s) => a.includes(norm(s)));
}

/** Freie Antwort der lokalen KI – oder null (dann gilt die Vorlage) */
export async function llmAnswer(cfg: LlmConfig, ctx: LlmContext, timeoutMs = 9000): Promise<string | null> {
  if (!ctx.draft.trim()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${cfg.url.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, messages: buildMessages(ctx), stream: false, options: { temperature: 0.7, num_predict: 120 } }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { message?: { content?: string } };
    const text = (data.message?.content ?? '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/^["„“]+|["“”]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text.length > Math.max(260, ctx.draft.length * 3) || !keepsFacts(ctx.draft, text)) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Verbindung prüfen: Ollama erreichbar und Modell vorhanden? */
export async function testLlm(cfg: LlmConfig): Promise<string> {
  try {
    const r = await fetch(`${cfg.url.replace(/\/$/, '')}/api/tags`);
    if (!r.ok) return `Fehler: Antwort ${r.status}`;
    const data = (await r.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    if (!names.some((n) => n === cfg.model || n.startsWith(`${cfg.model}:`) || cfg.model.startsWith(n))) return `Ollama läuft, aber Modell „${cfg.model}“ fehlt (ollama pull ${cfg.model}). Vorhanden: ${names.join(', ') || 'keins'}`;
    return `OK – Ollama läuft, Modell „${cfg.model}“ vorhanden`;
  } catch {
    return 'Ollama nicht erreichbar (läuft es? Bei Zugriff aus dem LAN: OLLAMA_ORIGINS setzen)';
  }
}
