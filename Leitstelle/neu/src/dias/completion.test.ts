import { describe, expect, it } from 'vitest';
import { SH_KEYWORD_SEEDS } from '../data/sh/keywords';
import { parseDiasExport } from './model';
import { deriveResult, domainOf, followUpsFor, gapAt, nextFollowUp, pickKeyword, type Step } from './completion';

/** Selbst geschriebener Mini-Abfragebaum (keine Originaltexte) */
const tree = parseDiasExport({
  nodes: [
    { id: 'q00001', question: 'Grund?', options: [{ answerId: 'm', code: '0', label: 'Med. Notruf' }, { answerId: 'b', code: '5', label: 'Brandschutz / techn. Notruf' }, { answerId: 'k', code: '1', label: 'Krankentransport / Intensiv-Verlegung' }] },
    { id: 'q00002', question: 'Spricht die Person?', options: [{ answerId: 's1', code: '0', label: 'Ja' }, { answerId: 's2', code: '1', label: 'Nein' }] },
    { id: 'q00003', question: 'Freitext Eingabe', options: [], kind: 'skipped-free-text', dialogText: 'Freitext Eingabe' },
    { id: 'q00004', question: 'Warum benötigen Sie die Feuerwehr?', options: [{ answerId: 'f1', code: '0', label: 'Feuer / Rauchentwicklung' }, { answerId: 'f2', code: '7', label: 'Technische Hilfeleistung' }] },
    { id: 'q00005', question: 'Was brennt?', options: [{ answerId: 'w1', code: '6', label: 'Privates Gebäude' }, { answerId: 'w2', code: '7', label: 'Kleinobjekt' }] },
    { id: 'q00006', question: 'Wie alt?', options: [], kind: 'skipped-age-dialog', dialogText: 'Eingabe Patientenalter' },
    { id: 'q00007', question: 'Welcher Transport?', options: [{ answerId: 't1', code: '0', label: 'Standard' }] },
  ],
  edges: [
    { from: 'q00001', answerId: 'm', code: '0', label: 'Med. Notruf', to: 'q00002' },
    { from: 'q00001', answerId: 'b', code: '5', label: 'Brandschutz / techn. Notruf', to: 'q00004' },
    { from: 'q00001', answerId: 'k', code: '1', label: 'Krankentransport / Intensiv-Verlegung', to: 'q00007' },
    { from: 'q00002', answerId: 's1', code: '0', label: 'Ja', to: 'q00003' },
    { from: 'q00002', answerId: 's2', code: '1', label: 'Nein', to: 'q00006' },
    { from: 'q00004', answerId: 'f1', code: '0', label: 'Feuer / Rauchentwicklung', to: 'q00005' },
    // q00005 hat keine aufgezeichneten Folgeseiten, q00004/f2 und q00007/t1 ebenfalls nicht
  ],
});
const codes = SH_KEYWORD_SEEDS.map((k) => k.code);
const s = (nodeId: string, option: number): Step => ({ nodeId, option });

describe('LEITWARTE-Ergänzung der Notrufabfrage', () => {
  it('erkennt Lücken: übersprungene Eingabe und Antwort ohne Folgeseite', () => {
    expect(gapAt(tree, [s('q00001', 0)])).toBeNull();
    expect(gapAt(tree, [s('q00001', 0), s('q00002', 0)])?.kind).toBe('freitext');
    expect(gapAt(tree, [s('q00001', 0), s('q00002', 1)])?.kind).toBe('alter');
    expect(gapAt(tree, [s('q00001', 1), s('q00004', 1)])?.kind).toBe('fehlt');
  });

  it('bestimmt die Fachrichtung aus den Antworten (nicht aus "Feuerwehr" in der Frage)', () => {
    expect(domainOf(tree, [s('q00001', 0), s('q00002', 0)])).toBe('medizin');
    expect(domainOf(tree, [s('q00001', 1), s('q00004', 0), s('q00005', 0)])).toBe('brand');
    expect(domainOf(tree, [s('q00001', 1), s('q00004', 1)])).toBe('th');
    expect(domainOf(tree, [s('q00001', 2), s('q00007', 0)])).toBe('ktp');
  });

  it('fragt nicht erneut, was der Weg schon beantwortet hat', () => {
    const ids = followUpsFor(tree, [s('q00001', 0), s('q00002', 0)]).map((q) => q.id);
    expect(ids).not.toContain('bewusst'); // "Spricht die Person?" schon gefragt
    expect(ids).toContain('atmung');
    expect(nextFollowUp(tree, [s('q00001', 0), s('q00002', 0)], { answers: { atmung: 'normal', personen: '1' } })).toBeNull();
  });

  it('leitet ein Stichwort aus dem Katalog ab', () => {
    const med = [s('q00001', 0), s('q00002', 1)];
    expect(pickKeyword(deriveResult(tree, med, { answers: { atmung: 'nein', personen: '1' } }).candidates, codes)).toBe('NOTF 11');
    expect(pickKeyword(deriveResult(tree, med, { answers: { atmung: 'normal', bewusst: 'ja', personen: '1' } }).candidates, codes)).toBe('NOTF 01');
    expect(pickKeyword(deriveResult(tree, med, { answers: { personen: '7-10' } }).candidates, codes)).toBe('NOTF R1');
    const fire = [s('q00001', 1), s('q00004', 0), s('q00005', 0)];
    expect(pickKeyword(deriveResult(tree, fire, { answers: { groesse: 'mittel', gefahr: 'ja' } }).candidates, codes)).toBe('FEU 00 Y');
    expect(pickKeyword(deriveResult(tree, fire, { answers: { groesse: 'gross', gefahr: 'nein', gefahrstoff: 'ja' } }).candidates, codes)).toBe('FEU G 00 X');
    expect(pickKeyword(deriveResult(tree, [s('q00001', 1), s('q00004', 0), s('q00005', 1)], { answers: { gefahr: 'nein' } }).candidates, codes)).toBe('FEU K 00');
    const ktp = [s('q00001', 2), s('q00007', 0)];
    expect(pickKeyword(deriveResult(tree, ktp, { answers: { ktp_art: 'sitzend', infekt: 'nein' } }).candidates, codes)).toBe('KBF STANDARD');
    expect(pickKeyword(deriveResult(tree, ktp, { answers: { ktp_art: 'liegend', infekt: 'ja' } }).candidates, codes)).toBe('KBF INF');
  });

  it('baut Meldebild und Infotext aus Weg, Eingabe und Antworten', () => {
    const r = deriveResult(tree, [s('q00001', 0), s('q00002', 0)], { input: 'Sturz auf der Treppe', answers: { atmung: 'erschwert' } });
    expect(r.info).toContain('Med. Notruf');
    expect(r.info).toContain('Angabe: Sturz auf der Treppe');
    expect(r.meldebild).toContain('Atmung erschwert');
  });
});
