import { describe, expect, it } from 'vitest';
import { CATALOGS, catalogAao, catalogKeywords, keywordIdFromCode } from './catalogs';
import { CAPABILITIES } from './vehicleTypes';

describe('Stichwortkataloge', () => {
  for (const cat of CATALOGS) {
    it(`${cat.id}: eindeutige Codes und IDs, bekannte Fähigkeiten`, () => {
      const codes = cat.keywords.map((k) => k.code);
      expect(new Set(codes).size).toBe(codes.length);
      const ids = catalogKeywords(cat).map((k) => k.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const k of cat.keywords) for (const [c, n] of k.needs) {
        expect(CAPABILITIES[c], `${k.code}: ${c}`).toBeDefined();
        expect(n).toBeGreaterThan(0);
      }
      expect(catalogAao(cat)).toHaveLength(cat.keywords.length);
    });
    it(`${cat.id}: Meldebilder schlagen existierende Stichwörter vor`, () => {
      const codes = new Set(cat.keywords.map((k) => k.code));
      for (const m of cat.meldebilder) if (m.keywordCode) expect(codes.has(m.keywordCode), `${m.label} -> ${m.keywordCode}`).toBe(true);
      const ids = cat.meldebilder.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }
  it('SH-Katalog umfasst die Struktur des Vorbilds', () => {
    const sh = CATALOGS.find((c) => c.id === 'sh')!;
    const codes = new Set(sh.keywords.map((k) => k.code));
    for (const c of ['NOTF 01', 'NOTF 11 COVID', 'NOTF BAB R2', 'KBF STANDARD', 'FEU K BMA P', 'FEU 00 Y', 'FEU 2 XR3', 'FEU 7 Übung', 'FEU G SCHIFF W', 'TH K TV 01', 'TH PDRZS W', 'TH G BAHN XY', 'POL AMOK R4', 'W ÄBD', 'THW ORTUNG', 'DF SanWa', 'I SCHLÜSSEL'])
      expect(codes.has(c), c).toBe(true);
    expect(sh.keywords.length).toBeGreaterThan(350);
    expect(sh.meldebilder.length).toBeGreaterThan(200);
    expect(keywordIdFromCode('FEU 7 Übung')).toBe('kw_feu_7_uebung');
  });
});
