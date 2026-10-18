import { describe, expect, it } from 'vitest';
import { SH_KEYWORD_SEEDS } from '../data/sh/keywords';
import { mapDiasKeyword } from './keywordMap';
import { parseDiasExport, parseResult, primaryKeyword, sanitizeHtml } from './model';

/** Kleiner, selbst geschriebener Abfragebaum im Format des DIAS-Mitschnitts (keine Originaltexte) */
const FIXTURE = {
  metadata: { source: 'test', capturedAt: '2026-01-01T00:00:00Z', scope: 'adults-only' },
  nodes: [
    { id: 'q00001', question: 'Worum geht es?', questionHtml: 'Worum <b>geht</b> es?<script>x</script>', options: [{ answerId: 'a1', code: '0', label: 'Medizin' }, { answerId: 'a2', code: '5', label: 'Feuer' }], inputs: [], dialogText: null },
    { id: 'q00002', question: 'Atmet die Person?', questionHtml: null, options: [{ answerId: 'b1', code: '0', label: 'Ja' }, { answerId: 'b2', code: '1', label: 'Nein' }], inputs: [], dialogText: null },
    {
      id: 'q00003',
      question: 'Abfrageergebnis übergeben',
      options: [],
      inputs: [],
      kind: 'result',
      dialogText:
        'Notrufabfrageergebnis\nmedizinischer Notruf,\nPerson atmet nicht,\nMedizinischer Notfall\nAbfrageergebnis : 4711\nAtemstillstand Erw.\n \nRegionales Alarmstichwort / AAO\nNOTF 11 REA NAIK\nInfo intern\nSuche\n«\n(aa) *Hinweis eins\n»\nInfo extern\n«\n(xa) *Hinweis extern\n»\nZurück zur Abfrage\nÜbergabe an Einsatzleitsystem',
    },
    { id: 'q00004', question: 'Freitext Eingabe', options: [], inputs: [{ tag: 'TEXTAREA' }], kind: 'skipped-free-text', dialogText: 'Freitext Eingabe' },
    {
      id: 'q00005',
      question: 'Abfrageergebnis übergeben',
      options: [],
      inputs: [],
      kind: 'result',
      dialogText:
        'Notrufabfrageergebnis\nBrandschutz,\nMedizinischer Notfall\nAbfrageergebnis : 1\nVerbrennung Erw.\n \nRegionales Alarmstichwort / AAO\nBrandschutz / Technische Hilfeleistung\nAbfrageergebnis : 2\nZimmerbrand\n \nRegionales Alarmstichwort / AAO\nFEU Y\nInfo intern\nZurück zur Abfrage',
    },
  ],
  edges: [
    { from: 'q00001', answerId: 'a1', code: '0', label: 'Medizin', to: 'q00002' },
    { from: 'q00001', answerId: 'a2', code: '5', label: 'Feuer', to: 'q00005' },
    { from: 'q00002', answerId: 'b1', code: '0', label: 'Ja', to: 'q00004' },
    { from: 'q00002', answerId: 'b2', code: '1', label: 'Nein', to: 'q00003' },
  ],
};

describe('DIAS-Import', () => {
  const tree = parseDiasExport(FIXTURE, 123);

  it('baut den Abfragebaum mit Folgefragen auf', () => {
    expect(tree.root).toBe('q00001');
    expect(tree.nodes.q00001.options.map((o) => o.to)).toEqual(['q00002', 'q00005']);
    expect(tree.nodes.q00002.kind).toBe('frage');
    expect(tree.nodes.q00004.kind).toBe('freitext');
    expect(tree.stats).toEqual({ nodes: 5, results: 2, incomplete: 1 });
  });

  it('liest Ergebnis, Meldebild, Stichwort und Infotexte', () => {
    const r = tree.nodes.q00003.result!;
    expect(r.summary).toEqual(['medizinischer Notruf', 'Person atmet nicht']);
    expect(r.sections).toEqual([{ fach: 'Medizinischer Notfall', code: '4711', meldebild: 'Atemstillstand Erw.', stichwort: 'NOTF 11 REA NAIK' }]);
    expect(r.infoIntern).toEqual(['(aa) *Hinweis eins']);
    expect(r.infoExtern).toEqual(['(xa) *Hinweis extern']);
  });

  it('erkennt Abschnitte ohne regionales Stichwort', () => {
    const r = tree.nodes.q00005.result!;
    expect(r.sections.map((s) => s.stichwort)).toEqual([null, 'FEU Y']);
    expect(primaryKeyword(r)).toBe('FEU Y');
    expect(parseResult('keine Ergebnisseite')).toBeNull();
  });

  it('lässt nur einfache Hervorhebungen im HTML zu', () => {
    expect(tree.nodes.q00001.html).toBe('Worum <b>geht</b> es?&lt;script&gt;x&lt;/script&gt;');
    expect(sanitizeHtml('<img src=x onerror=alert(1)><i>a</i>')).toBe('&lt;img src=x onerror=alert(1)&gt;<i>a</i>');
  });

  it('lehnt fremde Dateien ab', () => {
    expect(() => parseDiasExport({ foo: 1 })).toThrow(/Keine DIAS-Abfragedatei/);
    expect(() => parseDiasExport({ nodes: [], edges: [] })).toThrow(/keine Abfrageschritte/);
  });
});

describe('Zuordnung DIAS-Stichwort → Katalog Schleswig-Holstein', () => {
  const cat = SH_KEYWORD_SEEDS.map((k) => k.code);
  const cases: [string, string | null][] = [
    ['NOTF 11', 'NOTF 11'],
    ['NOTF 11 FIRST NAIK', 'NOTF 11 First'],
    ['NOTF 11 NAIKStat', 'NOTF 11'],
    ['NOTF 11 BAB', 'NOTF BAB 11'],
    ['NOTF R10', 'NOTF R1'],
    ['FEU', 'FEU 00'],
    ['FEU Y', 'FEU 00 Y'],
    ['FEU G Y', 'FEU G 00 Y'],
    ['FEU K', 'FEU K 00'],
    ['FEU R5', 'FEU 00 R0'],
    ['TH Y', 'TH 00 Y'],
    ['TH K Y', 'TH K 00'],
    ['TH G FLUG2 R5', 'TH G 00 R0'],
    ['TH BAHN R20', 'TH BAHN R2'],
    ['TH WASSER Y', 'TH WASSER Y'],
    ['THHÖHE', 'TH SRHT'],
    ['THPDRZS', 'TH PDRZS'],
    ['THTV', 'TH K TV'],
    ['W POL', 'W POLIZEI'],
    ['WL KVSH', 'W ÄBD'],
    ['M PSNV-E', 'SOKO PSNV-E'],
    ['WNG', null],
    ['Beratung - Kein Feuerwehreinsatz', null],
  ];
  for (const [dias, code] of cases)
    it(`${dias} → ${code ?? 'keins'}`, () => {
      const m = mapDiasKeyword(dias, cat);
      expect(m.code).toBe(code);
      if (!code) expect(m.note).toBeTruthy();
    });
});
