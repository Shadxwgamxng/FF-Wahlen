import type { VehicleType, Organization, StatusDef } from '../model/types';

/**
 * Standard-Fähigkeiten (Capabilities). Einsatzbedarfe (AAO, Szenarien) werden über diese
 * Fähigkeiten beschrieben – nicht über konkrete Fahrzeugtypen. Dadurch kann eine Leitstelle
 * eigene Typen definieren, die die Bedarfe trotzdem erfüllen.
 */
export const CAPABILITIES: Record<string, string> = {
  fuehrung_1: 'Führung (Einheit/Zug, ELW 1)',
  fuehrung_2: 'Führung (Verband, ELW 2)',
  fuehrung_kdo: 'Kommandowagen / Einsatzleitung',
  loeschen: 'Löschfahrzeug (Gruppe)',
  wasser_gross: 'Großer Löschwassertank',
  hoehenrettung: 'Hubrettungsfahrzeug (DLK/TMF)',
  th: 'Technische Hilfe (Grundausstattung)',
  th_schwer: 'Schwere technische Hilfe (RW)',
  atemschutz: 'Atemschutz-Sonderausrüstung',
  gefahrgut: 'Gefahrgut / ABC',
  logistik: 'Logistik / Material',
  mannschaft: 'Mannschaftstransport',
  wasserrettung: 'Wasserrettung',
  oel: 'Ölschadenbekämpfung',
  rtw: 'Rettungswagen (Notfalltransport)',
  ktw: 'Krankentransport',
  notarzt: 'Notarzt',
  intensiv: 'Intensivtransport',
  san_gross: 'Sanitätsdienst / MANV-Material',
  rd_fuehrung: 'Führung Rettungsdienst (ELRD/OrgL)',
  rth: 'Luftrettung',
  polizei: 'Polizeistreife',
  polizei_fuehrung: 'Polizeiliche Führung',
  polizei_gruppe: 'Polizeiliche Einsatzgruppe',
  thw_bergung: 'THW-Bergung',
  thw_pumpen: 'THW-Pumpen / Wasserschaden',
  tier: 'Tierrettung',
  first_responder: 'First Responder / Helfer vor Ort',
  rtw_schwerlast: 'Schwerlast-RTW (über 180 kg)',
  ktw_schwerlast: 'Schwerlast-KTW (über 180 kg)',
  ktw_infekt: 'Infektions-KTW',
  hoehenretter: 'Höhenrettungsgruppe (SRHT)',
  thw_notstrom: 'THW-Notstrom / Beleuchtung',
  thw_fuehrung: 'THW-Führung / Fachberatung',
  inkubator: 'Inkubator-Transport',
  psnv: 'Psychosoziale Notfallversorgung',
  t1: 'Transportkomponente 1 (RTW der Hilfsorganisationen)',
  t2: 'Transportkomponente 2 (KTW der Hilfsorganisationen)',
  betreuung: 'Betreuungsgruppe (GW-Betreuung)',
  pat_ablage: 'Patientenablage (GW-San)',
};

const ff = (
  id: string,
  code: string,
  name: string,
  capabilities: string[],
  seats: number,
  speedKmh = 55,
  orgKind: VehicleType['orgKind'] = 'feuerwehr',
): VehicleType => ({
  id,
  code,
  name,
  orgKind,
  capabilities,
  seats,
  speedKmh,
});

/** Standard-Fahrzeugtypen. Die Leitstelle kann sie im Editor ändern oder ergänzen. */
export const DEFAULT_VEHICLE_TYPES: VehicleType[] = [
  // Feuerwehr
  ff('kdow', 'KdoW', 'Kommandowagen', ['fuehrung_kdo'], 4, 70),
  ff('elw1', 'ELW 1', 'Einsatzleitwagen 1', ['fuehrung_1'], 4, 65),
  ff('elw2', 'ELW 2', 'Einsatzleitwagen 2', ['fuehrung_2', 'fuehrung_1'], 6, 55),
  ff('mtf', 'MTF', 'Mannschaftstransportfahrzeug', ['mannschaft'], 9, 65),
  ff('lf10', 'LF 10', 'Löschgruppenfahrzeug 10', ['loeschen', 'th'], 9, 55),
  ff('lf20', 'LF 20', 'Löschgruppenfahrzeug 20', ['loeschen', 'th', 'wasser_gross'], 9, 55),
  ff('hlf10', 'HLF 10', 'Hilfeleistungslöschgruppenfahrzeug 10', ['loeschen', 'th'], 9, 55),
  ff('hlf20', 'HLF 20', 'Hilfeleistungslöschgruppenfahrzeug 20', ['loeschen', 'th', 'th_schwer'], 9, 55),
  ff('tlf', 'TLF 4000', 'Tanklöschfahrzeug', ['loeschen', 'wasser_gross'], 3, 50),
  ff('dlk', 'DLK 23/12', 'Drehleiter mit Korb', ['hoehenrettung'], 3, 55),
  ff('rw', 'RW', 'Rüstwagen', ['th', 'th_schwer', 'oel'], 3, 55),
  ff('gwg', 'GW-G', 'Gerätewagen Gefahrgut', ['gefahrgut'], 6, 50),
  ff('gwa', 'GW-A', 'Gerätewagen Atemschutz', ['atemschutz'], 3, 55),
  ff('gwl', 'GW-L2', 'Gerätewagen Logistik', ['logistik', 'oel'], 3, 55),
  ff('gww', 'GW-Wasserrettung', 'Gerätewagen Wasserrettung', ['wasserrettung'], 6, 55),
  ff('gwh', 'GW-Höhenrettung', 'Gerätewagen Höhenrettung', ['hoehenretter'], 6, 60),
  ff('gwt', 'GW-Tier', 'Gerätewagen Tierrettung', ['tier'], 3, 55),
  // Rettungsdienst
  {
    ...ff('rtw', 'RTW', 'Rettungswagen', ['rtw'], 2, 65, 'rettungsdienst'),
    canTransport: true,
  },
  {
    ...ff('ktw', 'KTW', 'Krankentransportwagen', ['ktw'], 2, 60, 'krankentransport'),
    canTransport: true,
  },
  ff('nef', 'NEF', 'Notarzteinsatzfahrzeug', ['notarzt'], 2, 75, 'notarzt'),
  {
    ...ff('naw', 'NAW', 'Notarztwagen', ['rtw', 'notarzt'], 3, 65, 'notarzt'),
    canTransport: true,
  },
  {
    ...ff('itw', 'ITW', 'Intensivtransportwagen', ['intensiv', 'rtw', 'inkubator'], 3, 60, 'rettungsdienst'),
    canTransport: true,
  },
  {
    ...ff('iktw', 'I-KTW', 'Infektions-Krankentransportwagen', ['ktw', 'ktw_infekt'], 2, 60, 'krankentransport'),
    canTransport: true,
  },
  {
    ...ff('srtw', 'S-RTW', 'Schwerlast-Rettungswagen', ['rtw', 'rtw_schwerlast'], 2, 55, 'rettungsdienst'),
    canTransport: true,
  },
  {
    ...ff('sktw', 'S-KTW', 'Schwerlast-Krankentransportwagen', ['ktw', 'ktw_schwerlast'], 2, 55, 'krankentransport'),
    canTransport: true,
  },
  ff('fr', 'FR', 'First Responder (Helfer vor Ort)', ['first_responder'], 2, 65, 'sonstige'),
  ff('psnv', 'KIT', 'Fahrzeug Krisenintervention / PSNV', ['psnv'], 4, 60, 'sonstige'),
  ff('gwsan', 'GW-San', 'Gerätewagen Sanität', ['san_gross', 'pat_ablage'], 4, 55, 'katastrophenschutz'),
  ff('elrd', 'ELRD', 'Einsatzleiter Rettungsdienst', ['rd_fuehrung'], 2, 75, 'rettungsdienst'),
  ff('orgl', 'OrgL RD', 'Organisatorischer Leiter Rettungsdienst', ['rd_fuehrung'], 2, 70, 'rettungsdienst'),
  {
    ...ff('rth', 'RTH', 'Rettungshubschrauber', ['notarzt', 'rth'], 3, 220, 'rettungsdienst'),
    airborne: true,
  },
  // Polizei
  ff('fustw', 'FuStW', 'Funkstreifenwagen', ['polizei'], 2, 75, 'polizei'),
  ff('pol_fueh', 'FüKw', 'Führungskraftwagen Polizei', ['polizei_fuehrung', 'polizei'], 4, 70, 'polizei'),
  ff('pol_grukw', 'GruKw', 'Gruppenkraftwagen Polizei', ['polizei_gruppe', 'polizei'], 9, 65, 'polizei'),
  ff('pol_tech', 'TechKw', 'Technischer Einsatzkraftwagen Polizei', ['polizei'], 3, 60, 'polizei'),
  // THW
  ff('thw_gkw', 'GKW', 'Gerätekraftwagen THW', ['thw_bergung', 'th_schwer'], 9, 50, 'thw'),
  ff('thw_mzkw', 'MzKW', 'Mehrzweckkraftwagen THW', ['thw_pumpen', 'logistik'], 6, 50, 'thw'),
  ff('thw_ntw', 'MLW N', 'Mannschaftslastwagen Notversorgung THW', ['thw_notstrom'], 6, 50, 'thw'),
  ff('thw_mtw', 'MTW TZ', 'Mannschaftstransportwagen Technischer Zug THW', ['thw_fuehrung'], 4, 60, 'thw'),
];

export const DEFAULT_ORGANIZATIONS: Organization[] = [
  { id: 'org_bf', name: 'Berufsfeuerwehr Bergstadt', kind: 'berufsfeuerwehr', responsibilities: 'Brandschutz, technische Hilfe, Gefahrgut im Stadtgebiet Bergstadt', color: '#e5484d', radioGroup: { name: 'Berufsfeuerwehr Bergstadt', code: 'FW_BF' } },
  { id: 'org_ff', name: 'Freiwillige Feuerwehren', kind: 'freiwillige_feuerwehr', responsibilities: 'Brandschutz und technische Hilfe in den Umlandgemeinden', color: '#f76b15', radioGroup: { name: 'Freiwillige Feuerwehren', code: 'FW_FF' } },
  { id: 'org_rd', name: 'Rettungsdienst Hessenwald gGmbH', kind: 'rettungsdienst', responsibilities: 'Notfallrettung und Krankentransport im Rettungsdienstbereich', color: '#ffffff', radioGroup: { name: 'Rettungsdienst Hessenwald gGmbH', code: 'RD' } },
  { id: 'org_ktp', name: 'Krankentransport (Hilfsorganisationen)', kind: 'krankentransport', responsibilities: 'Qualifizierter Krankentransport', color: '#a3a3a3', radioGroup: { name: 'Krankentransport (Hilfsorganisationen)', code: 'KTP' } },
  { id: 'org_na', name: 'Notarztdienst Klinikum', kind: 'notarzt', responsibilities: 'Notarztgestellung', color: '#f5d90a', radioGroup: { name: 'Notarztdienst Klinikum', code: 'NA' } },
  { id: 'org_pol', name: 'Polizei (Kooperation)', kind: 'polizei', responsibilities: 'Gefahrenabwehr, Verkehrsabsicherung – in dieser Simulation als Partnerkräfte', color: '#3e63dd', radioGroup: { name: 'Polizei (Kooperation)', code: 'POL' } },
  { id: 'org_thw', name: 'THW Ortsverband', kind: 'thw', responsibilities: 'Bergung, Pumpen, Logistik bei Großschadenslagen', color: '#0090ff', radioGroup: { name: 'THW Ortsverband', code: 'THW' } },
  { id: 'org_kats', name: 'Katastrophenschutz Landkreis', kind: 'katastrophenschutz', responsibilities: 'Sanitäts- und Betreuungsdienst bei MANV', color: '#8e4ec6', radioGroup: { name: 'Katastrophenschutz Landkreis', code: 'KATS' } },
  { id: 'org_wf', name: 'Werkfeuerwehr Chemiepark', kind: 'werkfeuerwehr', responsibilities: 'Betrieblicher Brandschutz im Chemiepark', color: '#d6409f', radioGroup: { name: 'Werkfeuerwehr Chemiepark', code: 'WF' } },
  { id: 'org_ext', name: 'Luftrettung / Nachbarbereiche', kind: 'sonstige', responsibilities: 'Externe Einsatzmittel aus Nachbarbereichen', color: '#12a594', radioGroup: { name: 'Luftrettung / Nachbarbereiche', code: 'EXT' } },
];

/** Standard-Statusdefinitionen (FMS-angelehnt). Codes, Texte und Farben sind pro Leitstelle änderbar. */
export const DEFAULT_STATUS_DEFS: StatusDef[] = [
  { meaning: 'frei_funk', code: '1', label: 'Einsatzbereit über Funk', color: '#30a46c' },
  { meaning: 'frei_wache', code: '2', label: 'Einsatzbereit auf Wache', color: '#46a758' },
  { meaning: 'alarmiert', code: 'A', label: 'Alarmiert', color: '#ffb224' },
  { meaning: 'anfahrt', code: '3', label: 'Einsatz übernommen / Anfahrt', color: '#f76b15' },
  { meaning: 'einsatzort', code: '4', label: 'Am Einsatzort', color: '#e5484d' },
  { meaning: 'sprechwunsch', code: '5', label: 'Sprechwunsch', color: '#f5d90a' },
  { meaning: 'ausser_dienst', code: '6', label: 'Nicht einsatzbereit', color: '#6f6f6f' },
  { meaning: 'transport', code: '7', label: 'Patient aufgenommen / Transport', color: '#8e4ec6' },
  { meaning: 'am_ziel', code: '8', label: 'Am Transportziel', color: '#3e63dd' },
];
