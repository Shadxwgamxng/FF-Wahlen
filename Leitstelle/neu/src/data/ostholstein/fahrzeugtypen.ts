import type { OrgKind, VehicleType } from '../../model/types';
import { DEFAULT_VEHICLE_TYPES } from '../vehicleTypes';

/**
 * Fahrzeugtypen der Beispielleitstelle Ostholstein.
 * Jede Typbezeichnung aus den Fahrzeuglisten wird auf einen Typ abgebildet. Wo die Standardtypen die
 * Bezeichnung nicht treffen, gibt es zusätzliche Typen mit der echten Bezeichnung als Kürzel (code).
 * Die Fähigkeiten entscheiden, welche Bedarfe der AAO ein Fahrzeug abdeckt.
 */

const t = (id: string, code: string, name: string, orgKind: OrgKind, capabilities: string[], seats: number, speedKmh = 55, more: Partial<VehicleType> = {}): VehicleType => ({
  id,
  code,
  name,
  orgKind,
  capabilities,
  seats,
  speedKmh,
  ...more,
});
const fw = (id: string, code: string, name: string, caps: string[], seats: number, speed = 55) => t(id, code, name, 'feuerwehr', caps, seats, speed);
const LOESCH = ['loeschen', 'th'];
const TANK = ['loeschen', 'wasser_gross'];

export const OSTHOLSTEIN_TYPES: VehicleType[] = [
  // ---------------------------------------------------------------- Feuerwehr
  fw('oh_tsf', 'TSF', 'Tragkraftspritzenfahrzeug', ['loeschen'], 6),
  fw('oh_tsfw', 'TSF-W', 'Tragkraftspritzenfahrzeug mit Wassertank', ['loeschen'], 6),
  fw('oh_mlf', 'MLF', 'Mittleres Löschfahrzeug', LOESCH, 6),
  fw('oh_lf', 'LF', 'Löschgruppenfahrzeug', LOESCH, 9),
  fw('oh_lf8ts', 'LF 8-TS', 'Löschgruppenfahrzeug 8 mit Tragkraftspritze', LOESCH, 9),
  fw('oh_lf86', 'LF 8/6', 'Löschgruppenfahrzeug 8/6', LOESCH, 9),
  fw('oh_lf106', 'LF 10/6', 'Löschgruppenfahrzeug 10/6', LOESCH, 9),
  fw('oh_lf10th', 'LF 10-TH', 'Löschgruppenfahrzeug 10 mit TH-Beladung', LOESCH, 9),
  fw('oh_lf1612', 'LF 16/12', 'Löschgruppenfahrzeug 16/12', LOESCH, 9),
  fw('oh_lf2016', 'LF 20/16', 'Löschgruppenfahrzeug 20/16', [...LOESCH, 'wasser_gross'], 9),
  fw('oh_lf20kats', 'LF 20 KatS', 'Löschgruppenfahrzeug 20 Katastrophenschutz', [...LOESCH, 'wasser_gross'], 9),
  fw('oh_hlf2016', 'HLF 20/16', 'Hilfeleistungslöschgruppenfahrzeug 20/16', [...LOESCH, 'th_schwer'], 9),
  fw('oh_stlf', 'StLF', 'Staffellöschfahrzeug', TANK, 6),
  fw('oh_tlf', 'TLF', 'Tanklöschfahrzeug', TANK, 3, 50),
  fw('oh_tlf818', 'TLF 8/18', 'Tanklöschfahrzeug 8/18', TANK, 3, 50),
  fw('oh_tlf1624', 'TLF 16/24', 'Tanklöschfahrzeug 16/24', TANK, 3, 50),
  fw('oh_tlf1625', 'TLF 16/25', 'Tanklöschfahrzeug 16/25', TANK, 3, 50),
  fw('oh_tlf2000', 'TLF 2000', 'Tanklöschfahrzeug 2000', TANK, 3, 55),
  fw('oh_tlf3000', 'TLF 3000', 'Tanklöschfahrzeug 3000', TANK, 3, 55),
  fw('oh_dla', 'DLA', 'Drehleiter mit Automatik', ['hoehenrettung'], 3),
  fw('oh_dlak', 'DLAK 23/12', 'Drehleiter mit Automatik und Korb', ['hoehenrettung'], 3),
  fw('oh_tmb', 'TMB', 'Teleskopmastbühne', ['hoehenrettung'], 3),
  fw('oh_rw1', 'RW 1', 'Rüstwagen 1', ['th', 'th_schwer', 'oel'], 3),
  fw('oh_mzf', 'MZF', 'Mehrzweckfahrzeug', ['mannschaft'], 8, 65),
  fw('oh_mtw', 'MTW', 'Mannschaftstransportwagen', ['mannschaft'], 9, 65),
  fw('oh_pkw', 'PKW', 'Personenkraftwagen', [], 5, 70),
  fw('oh_gwas', 'GW A/S', 'Gerätewagen Atemschutz/Strahlenschutz', ['atemschutz'], 3),
  fw('oh_gwn', 'GW-N', 'Gerätewagen Nachschub', ['logistik'], 3),
  fw('oh_gwl', 'GW-L', 'Gerätewagen Logistik', ['logistik', 'oel'], 3),
  fw('oh_gwl1', 'GW-L1', 'Gerätewagen Logistik 1', ['logistik', 'oel'], 3),
  fw('oh_gwlg', 'GW-LG', 'Gerätewagen Logistik Gefahrgut', ['logistik', 'gefahrgut'], 3),
  fw('oh_wlf', 'WLF', 'Wechselladerfahrzeug', ['logistik', 'oel'], 3),
  fw('oh_sw2000', 'SW 2000', 'Schlauchwagen 2000', ['logistik'], 3),
  fw('oh_abcerkw', 'ABC-ErkKW', 'ABC-Erkundungskraftwagen', ['gefahrgut'], 4),
  fw('oh_dekonp', 'GW-Dekon P', 'Gerätewagen Dekontamination Personal', ['gefahrgut'], 6, 50),
  fw('oh_fmf', 'Fernmeldefahrzeug', 'Fernmeldefahrzeug (Kreis)', ['fuehrung_2'], 4),
  fw('oh_tel', 'TEL', 'Technische Einsatzleitung (Kreis)', ['fuehrung_2', 'fuehrung_1'], 6),
  fw('oh_utv', 'UTV', 'Geländefahrzeug (Utility Task Vehicle)', ['logistik'], 2, 40),
  fw('oh_lf8', 'LF 8', 'Löschgruppenfahrzeug 8', LOESCH, 9),
  fw('oh_mzb', 'MZB', 'Mehrzweckboot', ['wasserrettung'], 4, 40),
  fw('oh_tsfs', 'TSF-Sonder', 'Tragkraftspritzenfahrzeug (Sonderbauform)', ['loeschen'], 6),
  fw('oh_stlf106', 'StLF 10/6', 'Staffellöschfahrzeug 10/6', TANK, 6),
  fw('oh_lfkats', 'LF KatS', 'Löschgruppenfahrzeug Katastrophenschutz (Bund)', [...LOESCH, 'wasser_gross'], 9),
  fw('oh_tlf2450', 'TLF 24/50', 'Tanklöschfahrzeug 24/50', TANK, 3, 50),
  fw('oh_swkats', 'SW KatS', 'Schlauchwagen Katastrophenschutz', ['logistik'], 3),
  fw('oh_cbrn', 'CBRN ErkW', 'CBRN-Erkundungswagen', ['gefahrgut'], 4),
  fw('oh_gwbahn', 'GW-Bahnrettung', 'Gerätewagen Bahnrettung', ['th', 'th_schwer'], 3),
  fw('oh_mzf_drohne', 'MZF Drohne', 'Mehrzweckfahrzeug mit Drohne', ['mannschaft'], 6, 65),
  t('oh_info', 'Info-/Werbefahrzeug', 'Info-/Präventions-/Werbefahrzeug (nicht alarmierbar)', 'sonstige', [], 4, 60),

  // ---------------------------------------------------------------- Rettungsdienst und Hilfsorganisationen
  t('oh_mzrtw', 'Mehrzweck-RTW', 'KTW / Mehrzweck-Rettungswagen', 'krankentransport', ['ktw', 'rtw'], 2, 62, { canTransport: true }),
  t('oh_rtw_hiorg', 'RTW', 'Rettungswagen (Hilfsorganisation, Transportkomponente 1)', 'rettungsdienst', ['t1'], 2, 65, { canTransport: true }),
  t('oh_ktw_hiorg', 'KTW', 'Krankentransportwagen (Hilfsorganisation, Transportkomponente 2)', 'katastrophenschutz', ['ktw', 't2'], 2, 60, { canTransport: true }),
  t('oh_ktwb', 'KTW-B', 'Krankentransportwagen Typ B', 'katastrophenschutz', ['ktw', 't2'], 2, 60, { canTransport: true }),
  t('oh_rtwt1', 'RTW T1', 'Rettungswagen (Hilfsorganisation, Transportkomponente 1)', 'rettungsdienst', ['t1'], 2, 65, { canTransport: true }),
  t('oh_elwrd', 'ELW RD', 'Einsatzleitwagen Rettungsdienst (Hilfsorganisation)', 'katastrophenschutz', [], 4, 60),
  t('oh_pkwfue', 'PKW Führung', 'Führungsfahrzeug (Hilfsorganisation)', 'katastrophenschutz', [], 4, 70),
  t('oh_mzfdrohne_san', 'MZF Drohne', 'Mehrzweckfahrzeug mit Drohne (Hilfsorganisation)', 'katastrophenschutz', ['mannschaft'], 6, 60),
  t('oh_quad', 'Quad', 'Quad (Strand-/Geländesanität)', 'katastrophenschutz', ['first_responder'], 2, 40),
  t('oh_atv_wr', 'ATV', 'Geländefahrzeug Wasserrettung (DLRG)', 'katastrophenschutz', ['wasserrettung'], 2, 40),
  t('oh_mtwk_wr', 'MTW klein', 'Kleiner Mannschaftstransportwagen Wasserrettung (DLRG)', 'katastrophenschutz', ['wasserrettung', 'mannschaft'], 5, 65),
  t('oh_log_wr', 'Logistikwagen', 'Logistikwagen Wasserrettung (DLRG)', 'katastrophenschutz', ['logistik'], 3, 55),
  t('oh_ktw4', 'KTW Typ 4', 'Krankentransportwagen Typ 4 (4 Tragen)', 'katastrophenschutz', ['ktw', 't2'], 3, 55, { canTransport: true }),
  t('oh_nktw', 'NKTW', 'Notfallkrankentransportwagen', 'katastrophenschutz', ['ktw', 't2'], 2, 60, { canTransport: true }),
  t('oh_gnktw', 'G-NKTW', 'Notfallkrankentransportwagen (Gefahrenabwehr)', 'katastrophenschutz', ['ktw', 't2'], 2, 60, { canTransport: true }),
  // RTW der Ortsvereine (T1) nur bei Großeinsatz Rettungsdienst: Fähigkeit t1, nicht rtw (kein Alltagsvorschlag)
  // Führungsfahrzeuge der Hilfsorganisationen: keine Rettungsdienst-Führung (ELRD/OrgL kommt vom Rettungsdienst),
  // daher ohne AAO-Fähigkeit – nur gezielt alarmierbar
  t('oh_kdow_san', 'KdoW', 'Kommandowagen (Sanitätsdienst)', 'katastrophenschutz', [], 4, 70),
  t('oh_elw_san', 'ELW', 'Einsatzleitwagen (Sanitätsdienst)', 'katastrophenschutz', [], 4, 60),
  t('oh_mtw_san', 'MTW', 'Mannschaftstransportwagen (Sanitätsdienst)', 'katastrophenschutz', ['mannschaft'], 9, 65),
  t('oh_mzf_san', 'MZF', 'Mehrzweckfahrzeug (Sanitätsdienst)', 'katastrophenschutz', ['mannschaft'], 6, 60),
  t('oh_gwl_san', 'GW-L', 'Gerätewagen Logistik (Hilfsorganisation)', 'katastrophenschutz', ['logistik'], 3, 55),
  t('oh_gwbt', 'GW-Betreuung', 'Gerätewagen Betreuung', 'katastrophenschutz', ['betreuung'], 3, 55),
  t('oh_blkw', 'BLKW', 'Betreuungslastkraftwagen', 'katastrophenschutz', ['betreuung'], 3, 50),
  t('oh_krad', 'Krad', 'Kraftrad (Motorrad-Sanitäter)', 'katastrophenschutz', ['first_responder'], 1, 75),
  t('oh_mtw_wr', 'MTW', 'Mannschaftstransportwagen Wasserrettung (DLRG)', 'katastrophenschutz', ['wasserrettung', 'mannschaft'], 9, 65),
  t('oh_ith', 'ITH', 'Intensivtransporthubschrauber', 'rettungsdienst', ['intensiv', 'notarzt', 'rth'], 3, 230, { airborne: true }),
  t('oh_rboot_wr', 'Rettungsboot', 'Rettungsboot Wasserrettung (DLRG)', 'katastrophenschutz', ['wasserrettung'], 4, 40),
  t('oh_utv_wr', 'UTV', 'Strandfahrzeug Wasserrettung (DLRG)', 'katastrophenschutz', ['wasserrettung'], 2, 40),

  // ---------------------------------------------------------------- THW
  t('oh_gkw1', 'GKW 1', 'Gerätekraftwagen 1 THW', 'thw', ['thw_bergung', 'th_schwer'], 9, 50),
  t('oh_mzgw', 'MzGW', 'Mehrzweckgerätewagen THW', 'thw', ['thw_notstrom', 'logistik'], 6, 50),
  t('oh_mtw_thw', 'MTW', 'Mannschaftstransportwagen THW', 'thw', ['thw_fuehrung'], 9, 60),
  t('oh_mtwfgr', 'MTW FGr', 'Mannschaftstransportwagen Fachgruppe THW', 'thw', ['thw_pumpen'], 9, 60),
  t('oh_mtwov', 'MTW-OV', 'Mannschaftstransportwagen Ortsverband THW', 'thw', ['thw_fuehrung'], 9, 60),
  t('oh_pkwov', 'PKW-OV', 'Personenkraftwagen Ortsverband THW', 'thw', ['thw_fuehrung'], 4, 70),
  t('oh_mlw', 'MLW', 'Mannschaftslastwagen THW', 'thw', ['thw_pumpen', 'logistik'], 9, 50),
  t('oh_wlf_thw', 'WLF', 'Wechselladerfahrzeug THW', 'thw', ['logistik'], 3, 50),
  t('oh_kipper', 'Kipper', 'Kipper THW', 'thw', ['logistik'], 3, 50),
  t('oh_brmg', 'BRmG', 'Bergeräumgerät / Baumaschine THW', 'thw', ['thw_bergung'], 1, 25),
  t('oh_haegglunds', 'Hägglunds', 'Kettenfahrzeug Hägglunds THW', 'thw', ['logistik'], 6, 35),
  t('oh_sam', 'Arbeitsmaschine', 'Selbstfahrende Arbeitsmaschine THW', 'thw', ['logistik'], 1, 20),
];

/** Standardtypen plus Ostholstein-Typen (Typliste der Leitstelle) */
export function ostholsteinVehicleTypes(): VehicleType[] {
  return [...DEFAULT_VEHICLE_TYPES, ...OSTHOLSTEIN_TYPES].map((x) => ({ ...x, capabilities: [...x.capabilities] }));
}

/** Gruppe für die Typzuordnung (gleiche Bezeichnung, je nach Organisation andere Fähigkeiten) */
export type TypeGroup = 'ff' | 'rd' | 'san' | 'dlrg' | 'thw';

/** Typbezeichnung vereinheitlichen: Zählzusätze "(1)" entfernen, Bindestrich/Leerzeichen angleichen */
export const normTypeLabel = (label: string) =>
  label
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

type Rule = [RegExp, string | Partial<Record<TypeGroup, string>>];

/** Typbezeichnung → Typ-ID (erste passende Regel; je Gruppe abweichend, wenn angegeben) */
const RULES: Rule[] = [
  [/^(KdoW|KDOW|Kommandowagen)$/i, { ff: 'kdow', rd: 'elrd', san: 'oh_kdow_san', thw: 'oh_pkwov' }],
  [/^(ELW|ELW 1|Einsatzleitwagen|Einsatzleitfahrzeug)$/i, { ff: 'elw1', san: 'oh_elw_san', rd: 'oh_elw_san' }],
  [/^ELW 2$/i, 'elw2'],
  [/^TEL$/i, 'oh_tel'],
  [/^Fernmeldefahrzeug$/i, 'oh_fmf'],
  [/^MTF$/i, 'mtf'],
  [/^(MTW|Mannschaftstransportwagen)$/i, { ff: 'oh_mtw', san: 'oh_mtw_san', rd: 'oh_mtw_san', dlrg: 'oh_mtw_wr', thw: 'oh_mtw_thw' }],
  [/^MZF Drohne$/i, { ff: 'oh_mzf_drohne', san: 'oh_mzfdrohne_san', rd: 'oh_mzfdrohne_san' }],
  [/^MTW klein$/i, { dlrg: 'oh_mtwk_wr', ff: 'oh_mtw', san: 'oh_mtw_san' }],
  [/^PKW Führung$/i, 'oh_pkwfue'],
  [/^(MZF|Mehrzweckfahrzeug)$/i, { ff: 'oh_mzf', san: 'oh_mzf_san', rd: 'oh_mzf_san', dlrg: 'oh_mtw_wr' }],
  [/^MTW FGr$/i, 'oh_mtwfgr'],
  [/^MTW-OV$/i, 'oh_mtwov'],
  [/^PKW-OV$/i, 'oh_pkwov'],
  [/^(PKW|Personenkraftwagen)$/i, 'oh_pkw'],
  [/^TSF$/i, 'oh_tsf'],
  [/^TSF-W$/i, 'oh_tsfw'],
  [/^TSF-Sonder$/i, 'oh_tsfs'],
  [/^MLF$/i, 'oh_mlf'],
  [/^LF 8-TS$/i, 'oh_lf8ts'],
  [/^LF 8\/6$/i, 'oh_lf86'],
  [/^LF 8$/i, 'oh_lf8'],
  [/^MZB$/i, 'oh_mzb'],
  [/^Rettungsboot$/i, 'oh_rboot_wr'],
  [/^LF 10\/6$/i, 'oh_lf106'],
  [/^LF 10-TH$/i, 'oh_lf10th'],
  [/^LF 10$/i, 'lf10'],
  [/^LF 16\/12$/i, 'oh_lf1612'],
  [/^LF 20\/16$/i, 'oh_lf2016'],
  [/^LF 20[- ]KatS$/i, 'oh_lf20kats'],
  [/^LF[- ]KatS( Bund)?$/i, 'oh_lfkats'],
  [/^LF 20$/i, 'lf20'],
  [/^(LF|Löschgruppenfahrzeug)$/i, 'oh_lf'],
  [/^HLF 10$/i, 'hlf10'],
  [/^HLF 20\/16$/i, 'oh_hlf2016'],
  [/^HLF( 20)?$/i, 'hlf20'],
  [/^StLF$/i, 'oh_stlf'],
  [/^StLF 10\/6$/i, 'oh_stlf106'],
  [/^TLF 24\/50$/i, 'oh_tlf2450'],
  [/^TLF 4000$/i, 'tlf'],
  [/^TLF 3000$/i, 'oh_tlf3000'],
  [/^TLF 2000$/i, 'oh_tlf2000'],
  [/^TLF 16\/25$/i, 'oh_tlf1625'],
  [/^TLF 16\/24$/i, 'oh_tlf1624'],
  [/^TLF 8\/18$/i, 'oh_tlf818'],
  [/^TLF$/i, 'oh_tlf'],
  [/^DLA$/i, 'oh_dla'],
  [/^DLAK( 23[-/]12)?$/i, 'oh_dlak'],
  [/^DLK 23[-/]12$/i, 'dlk'],
  [/^(TMB|Teleskopmast)$/i, 'oh_tmb'],
  [/^(RW|Rüstwagen)$/i, 'rw'],
  [/^RW 1$/i, 'oh_rw1'],
  [/^GW A\/S$|^Gerätewagen-Atemschutz\(-Strahlenschutz\)$/i, 'oh_gwas'],
  [/^GW-A$/i, 'gwa'],
  [/^GW-G$/i, 'gwg'],
  [/^(GW-N|Gerätewagen-Logistik\/Nachschub)$/i, 'oh_gwn'],
  [/^GW-L1$/i, 'oh_gwl1'],
  [/^GW-L2$/i, 'gwl'],
  [/^GW-LG$/i, 'oh_gwlg'],
  [/^(GW-L|Gerätewagen-Logistik)$/i, { ff: 'oh_gwl', san: 'oh_gwl_san', rd: 'oh_gwl_san' }],
  [/^(WLF|Wechselladerfahrzeug)$/i, { ff: 'oh_wlf', thw: 'oh_wlf_thw' }],
  [/^SW 2000$/i, 'oh_sw2000'],
  [/^SW KatS$/i, 'oh_swkats'],
  [/^CBRN ErkW$/i, 'oh_cbrn'],
  [/^GW-Bahnrettung$/i, 'oh_gwbahn'],
  [/^ELW RD$/i, 'oh_elwrd'],
  [/^Quad$/i, 'oh_quad'],
  [/^ATV$/i, 'oh_atv_wr'],
  [/^Logistikwagen$/i, 'oh_log_wr'],
  [/^ABC\/CBRN-Erkundungskraftwagen$/i, 'oh_abcerkw'],
  [/^GW-Dekon P$/i, 'oh_dekonp'],
  [/^UTV$/i, { ff: 'oh_utv', dlrg: 'oh_utv_wr' }],
  [/^Info-\/Präventions-\/Werbe-Fahrzeug$/i, 'oh_info'],
  // Rettungsdienst
  [/^(RTW|Rettungswagen)$/i, 'rtw'],
  [/^RTW T1$/i, 'oh_rtwt1'],
  [/^NEF$/i, 'nef'],
  [/^KTW$/i, 'ktw'],
  [/^KTW \/ Mehrzweck-RTW$/i, 'oh_mzrtw'],
  [/^(KTW Typ 4|KTW-4|Krankentransportwagen 4-Tragen)$/i, 'oh_ktw4'],
  [/^KTW-B$/i, 'oh_ktwb'],
  [/^NKTW$/i, 'oh_nktw'],
  [/^G-NKTW$/i, 'oh_gnktw'],
  [/^(First-Responder\/Helfer vor Ort|First Responder)$/i, 'fr'],
  [/^GW-San$/i, 'gwsan'],
  [/^(Gerätewagen-Betreuung|GW-Betreuung)$/i, 'oh_gwbt'],
  [/^Betreuungslastkraftwagen$/i, 'oh_blkw'],
  [/^Kraftrad$/i, 'oh_krad'],
  [/^Gerätewagen-Wasserrettung\/Taucher$/i, 'gww'],
  [/^RTH( \(.*\))?$/i, 'rth'],
  // THW
  [/^GKW$/i, 'thw_gkw'],
  [/^GKW 1$/i, 'oh_gkw1'],
  [/^MzGW$/i, 'oh_mzgw'],
  [/^Mannschaftslastwagen$/i, 'oh_mlw'],
  [/^Kipper$/i, 'oh_kipper'],
  [/^Bergeräumgerät\/Baumaschine \(THW\)$/i, 'oh_brmg'],
  [/^Hägglunds( \(Kettenfahrzeug\))?$/i, 'oh_haegglunds'],
  [/^Selbstfahrende Arbeitsmaschine$/i, 'oh_sam'],
];

/** Typ-ID zu einer Typbezeichnung aus den Listen; null = unbekannt */
export function resolveType(label: string, group: TypeGroup): string | null {
  const l = normTypeLabel(label);
  for (const [re, target] of RULES) {
    if (!re.test(l)) continue;
    if (typeof target === 'string') return target;
    return target[group] ?? target.ff ?? Object.values(target)[0] ?? null;
  }
  return null;
}

/**
 * Fahrzeugkenner (zweiter Teil des Funkrufnamens "OKZ/Kenner-NN") für erzeugte Rufnamen, wenn die
 * echten Daten für den Typ keinen Kenner liefern.
 */
export const KENNER: Record<string, string> = {
  kdow: '10',
  elw1: '11',
  elw2: '12',
  oh_tel: '12',
  oh_mzf: '14',
  oh_mtw: '18',
  mtf: '18',
  oh_pkw: '17',
  oh_info: '17',
  tlf: '25',
  oh_tlf: '20',
  dlk: '30',
  oh_dla: '32',
  oh_dlak: '32',
  oh_tmb: '36',
  oh_tsf: '40',
  oh_tsfw: '41',
  oh_mlf: '41',
  lf10: '47',
  lf20: '47',
  oh_lf20kats: '47',
  hlf10: '48',
  hlf20: '48',
  rw: '51',
  oh_rw1: '50',
  gwa: '56',
  oh_gwas: '57',
  gwg: '58',
  oh_gwl: '67',
  oh_gwl1: '67',
  gwl: '68',
  oh_tlf2450: '24',
  oh_cbrn: '71',
  oh_lf8: '42',
  oh_mzb: '78',
  oh_rboot_wr: '78',
  oh_gwbahn: '52',
  oh_sw2000: '66',
  oh_wlf: '64',
  fr: '89',
  elrd: '10',
  nef: '82',
  rtw: '83',
  oh_rtw_hiorg: '83',
  oh_ktw_hiorg: '85',
  ktw: '85',
  // THW (Einheit/Fahrzeug nach Ortskennziffer, nur für Fahrzeuge ohne veröffentlichten Rufnamen)
  thw_gkw: '52',
  oh_gkw1: '52',
  oh_kipper: '62',
  oh_haegglunds: '79',
  oh_sam: '71',
};
