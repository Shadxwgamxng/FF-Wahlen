import type { ShTruth } from '../scenarios';

/**
 * Lösung der allgemeinen Szenarien im Katalog Schleswig-Holstein:
 * Szenario-ID → richtiges Einsatzstichwort (SH-Code) und passendes Meldebild (Bezeichnung aus SH_MELDEBILDER).
 * Varianten: Index der Variante im Szenario → abweichende Lösung.
 */
export const SH_SCENARIO_MAP: Record<string, ShTruth & { variants?: Record<number, ShTruth> }> = {
  // ------------------------------------------------------------------ BRAND
  brand_muell: { keyword: 'FEU K 00', meldebild: 'Brand Abfallbehälter / Container' },
  brand_pkw: { keyword: 'FEU 00', meldebild: 'Brand PKW' },
  brand_container: { keyword: 'FEU K 00', meldebild: 'Brand Abfallbehälter / Container' },
  brand_kueche: {
    keyword: 'FEU 00',
    meldebild: 'Zimmer- / Küchenbrand',
    variants: { 0: { keyword: 'FEU 00 Y', meldebild: 'Wohnungsbrand, Personen vermisst' } },
  },
  brand_keller: {
    keyword: 'FEU 00',
    meldebild: 'Kellerbrand',
    variants: { 0: { keyword: 'FEU 00 Y', meldebild: 'Kellerbrand, Treppenhaus verraucht' } },
  },
  brand_dachstuhl: { keyword: 'FEU 2', meldebild: 'Dachstuhlbrand' },
  brand_efh: {
    keyword: 'FEU 00',
    meldebild: 'Brand Einfamilienhaus',
    variants: { 0: { keyword: 'FEU 00 Y', meldebild: 'Wohnungsbrand, Personen vermisst' } },
  },
  brand_scheune: { keyword: 'FEU 2', meldebild: 'Brand landwirtschaftliches Gebäude / Scheune' },
  brand_gewerbe: { keyword: 'FEU 3', meldebild: 'Brand Gewerbe- / Lagerhalle' },
  brand_bma: {
    keyword: 'FEU BMA',
    meldebild: 'Brandmeldeanlage ausgelöst',
    variants: { 1: { keyword: 'FEU G BMA', meldebild: 'Brandmeldeanlage ausgelöst' } },
  },
  brand_wald: { keyword: 'FEU WALD', meldebild: 'Flächen- / Waldbrand' },
  brand_kamin: { keyword: 'FEU K 00', meldebild: 'Kaminbrand' },
  brand_rm: { keyword: 'FEU K BMA P', meldebild: 'Heimrauchmelder piept' },
  brand_unklar: { keyword: 'TH K ERK', meldebild: 'Unklare Rauchentwicklung' },
  brand_lkw: { keyword: 'FEU 2', meldebild: 'Brand LKW / Bus' },
  brand_elektro: { keyword: 'FEU 00', meldebild: 'Kellerbrand' },
  brand_balkon: { keyword: 'FEU 00' },

  // ------------------------------------------------------------------ TECHNISCHE HILFE
  th_baum: {
    keyword: 'TH K 00',
    meldebild: 'Baum / Ast auf Fahrbahn',
    variants: { 0: { keyword: 'TH 00 Y', meldebild: 'Verkehrsunfall, Person eingeklemmt' } },
  },
  th_oel: { keyword: 'TH K AUST', meldebild: 'Ölspur / auslaufende Betriebsstoffe' },
  th_tuer: { keyword: 'TH K TV 01', meldebild: 'Türöffnung, Person hilflos' },
  th_wasserschaden: { keyword: 'TH K 00', meldebild: 'Wasserschaden / Keller unter Wasser' },
  th_aufzug: { keyword: 'TH K 00', meldebild: 'Person im Aufzug' },
  th_gas: { keyword: 'TH GAS', meldebild: 'Gasgeruch' },
  th_sturmdach: { keyword: 'TH K 00', meldebild: 'Sturmschaden' },
  th_baum_haus: { keyword: 'TH 00', meldebild: 'Sturmschaden' },
  th_keller: { keyword: 'TH K 00', meldebild: 'Wasserschaden / Keller unter Wasser' },
  th_absturz: { keyword: 'TH SRHT', meldebild: 'Person in Höhe / Tiefe' },
  th_trage: { keyword: 'KBF STANDARD LF', meldebild: 'Tragehilfe für Rettungsdienst' },
  th_maschine: { keyword: 'TH 00 Y', meldebild: 'Person eingeklemmt (Maschine, Baustelle)' },
  th_hochwasser: { keyword: 'TH G 00', meldebild: 'Überflutung / Hochwasser' },
  th_strom: { keyword: 'TH K 00', meldebild: 'Stromleitung herabgefallen' },

  // ------------------------------------------------------------------ VERKEHRSUNFALL
  vu_pkw: {
    keyword: 'NOTF 01',
    meldebild: 'Verkehrsunfall, PKW',
    variants: { 0: { keyword: 'TH 00 Y', meldebild: 'Verkehrsunfall, Person eingeklemmt' } },
  },
  vu_eingeklemmt: { keyword: 'TH 00 Y', meldebild: 'Verkehrsunfall, Person eingeklemmt' },
  vu_motorrad: { keyword: 'NOTF 11', meldebild: 'Verkehrsunfall, Motorrad' },
  vu_lkw: { keyword: 'TH 00 Y', meldebild: 'Verkehrsunfall, Person eingeklemmt' },
  vu_bus: { keyword: 'TH 00 R10', meldebild: 'Verkehrsunfall, viele Verletzte' },
  vu_rad: { keyword: 'NOTF 01', meldebild: 'Verkehrsunfall, Fahrrad' },
  vu_baum: {
    keyword: 'TH 00 Y',
    meldebild: 'Verkehrsunfall, Person eingeklemmt',
    variants: { 0: { keyword: 'NOTF 01', meldebild: 'Verkehrsunfall, PKW' } },
  },

  // ------------------------------------------------------------------ RETTUNGSDIENST
  rd_brust: {
    keyword: 'NOTF 11',
    meldebild: 'Akutes Koronarsyndrom',
    variants: { 0: { keyword: 'NOTF 01', meldebild: 'Schmerzzustand' } },
  },
  rd_atemnot: { keyword: 'NOTF 11', meldebild: 'Atemnot, akut' },
  rd_sturz: {
    keyword: 'NOTF 01',
    meldebild: 'Sturz aus Höhe < 3 Meter',
    variants: { 0: { keyword: 'NOTF 11', meldebild: 'Schädel-Hirn-Trauma' } },
  },
  rd_rea: { keyword: 'NOTF 11 COVID', meldebild: 'Reanimation' },
  rd_schlaganfall: { keyword: 'NOTF 11', meldebild: 'Apoplex / TIA / PRIND' },
  rd_bewusstlos: {
    keyword: 'NOTF 11',
    meldebild: 'Unklare Bewusstlosigkeit',
    variants: { 0: { keyword: 'NOTF 11 COVID', meldebild: 'Reanimation' } },
  },
  rd_krampf: { keyword: 'NOTF 11', meldebild: 'Krampfanfall' },
  rd_geburt: { keyword: 'NOTF 11', meldebild: 'Geburt, einsetzend' },
  rd_allergie: { keyword: 'NOTF 11', meldebild: 'Allergische Reaktion, Insektengifte' },
  rd_diabetes: { keyword: 'NOTF 01', meldebild: 'Hypoglykämie' },
  rd_intox: {
    keyword: 'NOTF 01',
    meldebild: 'Intoxikation, allgemein',
    variants: { 0: { keyword: 'NOTF 11', meldebild: 'Intoxikation, Medikamente' } },
  },
  rd_schnitt: { keyword: 'NOTF 01', meldebild: 'Schnittverletzung' },
  rd_psych: { keyword: 'NOTF 01', meldebild: 'Psychischer Ausnahmezustand' },
  rd_kind: { keyword: 'NOTF 11', meldebild: 'Pädiatrischer Notfall, allgemein' },
  rd_manv: { keyword: 'NOTF R10' },
  rd_hitze: { keyword: 'NOTF 01', meldebild: 'Thermische Notfälle, allgemein' },

  // ------------------------------------------------------------------ KRANKENTRANSPORT
  ktp_entlassung: { keyword: 'KBF STANDARD', meldebild: 'Krankenbeförderung' },
  ktp_inf: { keyword: 'KBF INF', meldebild: 'Infektionstransport' },
  ktp_itw: { keyword: 'NOTF VERL ITW', meldebild: 'Notfallverlegung ITW – dringend' },

  // ------------------------------------------------------------------ ABC
  abc_lkw: { keyword: 'TH 00 X', meldebild: 'Gefahrstoffaustritt' },
  abc_chemie: { keyword: 'TH G 00 XY', meldebild: 'Gefahrstoffaustritt mit Verletzten' },
  abc_co: { keyword: 'TH K ERK XY', meldebild: 'CO-Einsatz, bis 83 ppm' },

  // ------------------------------------------------------------------ WASSER
  w_person: { keyword: 'TH WASSER Y', meldebild: 'Person im Wasser' },
  w_eis: { keyword: 'TH WASSER Y', meldebild: 'Person im Eis eingebrochen' },

  // ------------------------------------------------------------------ TIER
  tier_katze: { keyword: 'TH K 00', meldebild: 'Tier in Notlage' },
  tier_pferd: { keyword: 'TH 00', meldebild: 'Großtier in Notlage' },
  tier_wild: { keyword: 'TH K 00', meldebild: 'Tier in Notlage' },

  // ------------------------------------------------------------------ POLIZEI
  pol_schlaegerei: { keyword: 'NOTF 02', meldebild: 'Schlägerei mit Verletzten' },
  pol_verkehr: { keyword: 'W POLIZEI', meldebild: 'Anliegen für die Polizei' },
  pol_sui: { keyword: 'TH PDRZS', meldebild: 'Person droht zu springen' },

  // ------------------------------------------------------------------ SONSTIGES
  son_explosion: { keyword: 'FEU 2 Y', meldebild: 'Explosion' },
  son_helfer: { keyword: 'NOTF 01', meldebild: 'Hilflose Person' },
  son_fehlanruf: { keyword: '-', meldebild: 'Fehlanruf / kein Notfall' },
};
