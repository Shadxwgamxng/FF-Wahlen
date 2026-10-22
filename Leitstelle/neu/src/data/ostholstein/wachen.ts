import type { LatLng } from '../../model/types';

/**
 * Wachen der Beispielleitstelle Ostholstein (eine Station je Wache aus den Fahrzeuglisten).
 *
 * Die Zuordnung zu OpenStreetMap ist hier ausdrücklich festgelegt, weil der automatische Abgleich
 * über Namen unsicher ist (Teilstrings wie "Burg" in "Oldenburg", "Parin"/"Klein Parin",
 * "Neudorf"/"Eutin-Neudorf" doppelt, unbenannte Feuerwehrhäuser, Tippfehler in OSM).
 *
 *  - osm:     exakte OSM-Namen der Wache (amenity=fire_station bzw. emergency=ambulance_station)
 *  - osmNear: unbenannter OSM-Standort (Feuerwehrhaus ohne Namen) an dieser Stelle
 *  - pos:     Rückfallposition, wenn die geladenen OSM-Daten die Wache nicht enthalten
 *             (z. B. Ausschnitt in den Tests). Quelle: OpenStreetMap/Nominatim, Stand Oktober 2026.
 *             posKind: 'osm' = Position des OSM-Objekts, 'adr' = Adresse aus den Listen,
 *             'ort' = nur Ortsmitte (genaue Lage der Wache unbekannt)
 *  - address: Adresse, falls die Listen keine nennen (sonst gilt wachen-adressen.csv bzw. der Hinweis)
 *  - adr:     Name der Wache in wachen-adressen.csv, falls abweichend
 */

export type WacheKind = 'ff' | 'rw' | 'thw' | 'kats' | 'luft';

export interface WacheDef {
  name: string;
  kind: WacheKind;
  osm?: string[];
  osmNear?: LatLng;
  pos: LatLng;
  posKind: 'osm' | 'adr' | 'ort';
  address?: string;
  adr?: string;
}

const ff = (name: string, osm: string | LatLng | null, pos: LatLng, address?: string, posKind: WacheDef['posKind'] = 'osm'): WacheDef => ({
  name,
  kind: 'ff',
  ...(typeof osm === 'string' ? { osm: [osm] } : osm ? { osmNear: osm } : {}),
  pos,
  posKind,
  address,
});

const rw = (name: string, osm: string[] | null, pos: LatLng, posKind: WacheDef['posKind'], adr?: string, address?: string): WacheDef => ({
  name,
  kind: 'rw',
  ...(osm ? { osm } : {}),
  pos,
  posKind,
  adr,
  address,
});

const org = (name: string, kind: 'thw' | 'kats', pos: LatLng, posKind: WacheDef['posKind'], address: string): WacheDef => ({ name, kind, pos, posKind, address });

export const WACHEN: WacheDef[] = [
  // ---------------------------------------------------------------- Feuerwehren
  ff('FF Ahrensbök OF Ahrensbök', 'Freiwillige Feuerwehr Ahrensbök', [54.01219, 10.57035], 'Poststraße 3, 23623 Ahrensbök'),
  ff('FF Altenkrempe OF Altenkrempe', 'Freiwillige Feuerwehr Altenkrempe', [54.13921, 10.82298], 'Milchstraße 27, 23730 Altenkrempe'),
  // Feuerwache Lütjenburger Straße 100 (in OSM ohne Namen) – nicht Malkwitz
  ff('FF Bad Malente-Gremsmühlen', [54.18919, 10.5657], [54.18919, 10.5657], 'Lütjenburger Straße 100, 23714 Malente'),
  ff('FF Bad Schwartau OF Bad Schwartau-Rensefeld', 'Freiwillige Feuerwehr Bad Schwartau-Rensefeld', [53.9211, 10.69037], 'Fünfhausen 3, 23611 Bad Schwartau'),
  // "Freiwillige Feuerwehr Parin" (Groß Parin, Bad Schwartau) – nicht "Klein Parin" (Stockelsdorf)
  ff('FF Bad Schwartau OF Groß Parin', 'Freiwillige Feuerwehr Parin', [53.93837, 10.69395], 'Groß Parin 7a, 23611 Bad Schwartau'),
  ff('FF Beschendorf', 'Freiwillige Feuerwehr Beschendorf', [54.18288, 10.87701], 'Dorfstraße 10, 23738 Beschendorf'),
  ff('FF Bosau OF Hutzfeld-Brackrade', 'Freiwillige Feuerwehr Hutzfeld-Brackrade', [54.08836, 10.47988], 'Hutzfeld, 23715 Bosau'),
  ff('FF Bosau OF Thürk', 'Freiwillige Feuerwehr Thürk', [54.11042, 10.5041], 'Thürk, 23715 Bosau'),
  // Schreibweise in OSM mit Tippfehler
  ff('FF Bujendorf', 'Freiwilige Feuerwehr Bujendorf', [54.10573, 10.70297], 'Bujendorf, 23701 Süsel'),
  ff('FF Dahme', 'Freiwillige Feuerwehr Dahme', [54.22379, 11.08636], 'Am Deich 17, 23747 Dahme'),
  ff('FF Damlos', 'Freiwillige Feuerwehr Damlos', [54.24506, 10.90661], 'Sebenter Weg, 23738 Damlos'),
  ff('FF Eutin OF Eutin', 'Freiwillige Feuerwehr Eutin', [54.1284, 10.61923], 'Eutin'),
  ff('FF Eutin OF Fissau-Sibbersdorf', 'Freiwillige Feuerwehr Fissau-Sibbersdorf', [54.15482, 10.62254], 'Fissau, 23701 Eutin'),
  // In OSM doppelt ("Eutin-Neudorf" und "Neudorf", gleiche Adresse)
  ff('FF Eutin OF Neudorf', 'Freiwillige Feuerwehr Eutin-Neudorf', [54.128, 10.58405], 'Teichstraße 7, 23701 Eutin'),
  ff('FF Fehmarn OF Bannesdorf', 'Freiwillige Feuerwehr Bannesdorf', [54.46575, 11.21503], 'Bannesdorf, 23769 Fehmarn'),
  // "Freiwillige Feuerwehr Burg" auf Fehmarn (Osterstraße 52) – nicht Oldenburg
  ff('FF Fehmarn OF Burg auf Fehmarn', 'Freiwillige Feuerwehr Burg', [54.43654, 11.20018]),
  ff('FF Fehmarn OF Dänschendorf', 'Freiwillige Feuerwehr Dänschendorf', [54.49703, 11.08015]),
  ff('FF Fehmarn OF Landkirchen', 'Freiwillige Feuerwehr Landkirchen', [54.45004, 11.14665]),
  // Feuerwehrhaus Meeschendorf (in OSM ohne Namen)
  ff('FF Fehmarn OF Meeschendorf', [54.42429, 11.25122], [54.42429, 11.25122], 'Meeschendorf 29, 23769 Fehmarn'),
  ff('FF Fehmarn OF Puttgarden-Todendorf', 'Freiwillige Feuerwehr Puttgarden', [54.49195, 11.21119]),
  ff('FF Fehmarn OF Süderort', 'Freiwillige Feuerwehr Süderort', [54.41569, 11.13775], 'Am Reisediek 15, 23769 Fehmarn'),
  // Gerätehaus Petersdorf (OSM "Ortswehr Petersdorf", Betreiber FF Westfehmarn; gleiche OKZ 30 wie RW Petersdorf)
  ff('FF Fehmarn OF Westfehmarn', 'Ortswehr Petersdorf', [54.48144, 11.06678], 'Ostlandstraße 4, 23769 Fehmarn'),
  ff('FF Großenbrode', 'Freiwillige Feuerwehr Großenbrode', [54.36796, 11.08432], 'Strandstraße 1c, 23775 Großenbrode'),
  ff('FF Grube', 'Freiwillige Feuerwehr Grube', [54.22803, 11.03638], 'Hauptstraße 64, 23749 Grube'),
  ff('FF Grömitz OF Brenkenhagen', 'Feuerwehr Brenkenhagen', [54.15826, 10.9131], 'Grömitzer Straße 41, 23743 Grömitz'),
  ff('FF Grömitz OF Cismar', 'Freiwillige Feuerwehr Cismar', [54.18903, 10.98234], 'Bäderstraße 27, 23743 Grömitz'),
  ff('FF Grömitz OF Grömitz', 'Feuerwehr Grömitz', [54.1549, 10.96588], 'Am Schoor 37, 23743 Grömitz'),
  ff('FF Grömitz OF Guttau', 'Feuerwehr Guttau', [54.20248, 11.02096], 'Dorfstraße 36, 23743 Grömitz'),
  ff('FF Grömitz OF Lenste', 'Freiwillige Feuerwehr Lenste', [54.16752, 10.98096], 'Langenredder 31, 23743 Grömitz'),
  ff('FF Grömitz OF Suxdorf-Nienhagen', 'Feuerwehr Suxdorf-Nienhagen', [54.16525, 10.9263], 'Suxdorf, 23743 Grömitz'),
  ff('FF Göhl', 'Freiwillige Feuerwehr Göhl', [54.28059, 10.94751], 'Göhl, 23758 Göhl'),
  ff('FF Harmsdorf', 'Freiwillige Feuerwehr Harmsdorf', [54.24052, 10.83189], 'Harmsdorf, 23738 Harmsdorf'),
  ff('FF Heiligenhafen', 'Freiwillige Feuerwehr Stadt Heiligenhafen', [54.36783, 10.97472], 'Heiligenhafen'),
  ff('FF Kasseedorf OF Kasseedorf', 'FF Kasseedorf', [54.16478, 10.72316], 'Kasseedorf, 23717 Kasseedorf'),
  // Gerätehaus nicht in OSM: Ortsmitte Sagau
  ff('FF Kasseedorf OF Sagau', null, [54.1757, 10.67291], 'Sagau, 23717 Kasseedorf', 'ort'),
  ff('FF Kellenhusen', 'Feuerwehr Kellenhusen', [54.19488, 11.0593], 'Fasanenweg 3, 23746 Kellenhusen'),
  ff('FF Lensahn OF Lensahn', 'Freiwillige Feuerwehr Lensahn', [54.22007, 10.8776], 'Lütjenburger Straße 12, 23738 Lensahn'),
  ff('FF Lensahn OF Lensahnerhof', 'Freiwillige Feuerwehr Lensahnerhof', [54.20894, 10.85916], 'Eutiner Straße 62, 23738 Lensahn'),
  ff('FF Lensahn OF Sipsdorf', 'Freiwillige Feuerwehr Sipsdorf', [54.25337, 10.8748], 'Oldenburger Straße 19, 23738 Lensahn'),
  ff('FF Lensahn OF Wahrendorf', 'Freiwillige Feuerwehr Wahrendorf', [54.19344, 10.82318], 'Wahrendorf, 23738 Lensahn'),
  ff('FF Manhagen', 'Freiwillige Feuerwehr Manhagen', [54.19468, 10.91314], 'Manhagen, 23738 Manhagen'),
  ff('FF Neustadt in Holstein', 'Freiwillige Feuerwehr Neustadt in Holstein', [54.10767, 10.82066], 'Kirchhofsallee 2a, 23730 Neustadt in Holstein'),
  ff('FF Oldenburg in Holstein', 'Freiwillige Feuerwehr Oldenburg', [54.29501, 10.9167]),
  ff('FF Ratekau OF Luschendorf', 'Freiwillige Feuerwehr Luschendorf', [54.00293, 10.72359], 'Ostseestraße 58, 23626 Ratekau'),
  ff('FF Ratekau OF Offendorf', 'Freiwillige Feuerwehr Offendorf/Kreuzkamp', [53.94494, 10.77394], 'Seekamp 29, 23626 Ratekau'),
  ff('FF Ratekau OF Ovendorf', 'Freiwillige Feuerwehr Ovendorf', [53.94096, 10.81197], 'Dorfstraße 20a, 23626 Ratekau'),
  ff('FF Ratekau OF Ratekau', 'Freiwillige Feuerwehr Ratekau', [53.9426, 10.72658], 'Bäderstraße 46a, 23626 Ratekau'),
  ff('FF Ratekau OF Sereetz', 'Freiwillige Feuerwehr Sereetz', [53.92278, 10.73612], 'Berliner Straße 51, 23626 Ratekau'),
  ff('FF Ratekau OF Warnsdorf/Häven', 'Freiwillige Feuerwehr Warnsdorf', [53.96709, 10.82091], 'Warnsdorf, 23626 Ratekau'),
  ff('FF Scharbeutz OF Gleschendorf', 'Freiwillige Feuerwehr Gleschendorf', [54.02591, 10.66946], 'Bornberg 2, 23684 Scharbeutz'),
  ff('FF Scharbeutz OF Haffkrug', 'Freiwillige Feuerwehr Haffkrug', [54.04767, 10.74475], 'Waldweg 2a, 23683 Scharbeutz'),
  ff('FF Scharbeutz OF Pönitz', 'Feuerwehr Pönitz', [54.04456, 10.6788], 'Pönitz, 23684 Scharbeutz'),
  ff('FF Scharbeutz OF Scharbeutz', 'Freiwillige Feuerwehr Scharbeutz', [54.02058, 10.75281], 'Schulstraße 7, 23683 Scharbeutz'),
  ff('FF Schönwalde am Bungsberg OF Schönwalde am Bungsberg', 'Freiwillige Feuerwehr Schönwalde', [54.18952, 10.75506], 'Rosenstraße, 23744 Schönwalde am Bungsberg'),
  ff('FF Sierksdorf OF Sierksdorf', 'Freiwillige Feuerwehr Sierksdorf', [54.06763, 10.76973], 'Sierksdorf, 23730 Sierksdorf'),
  ff('FF Stockelsdorf OF Curau', 'Freiwillige Feuerwehr Curau', [53.95122, 10.61694], 'Dakendorfer Weg 12a, 23617 Stockelsdorf'),
  ff('FF Stockelsdorf OF Eckhorst', 'Freiwillige Feuerwehr Eckhorst', [53.89468, 10.60626], 'Altes Ende 10, 23617 Stockelsdorf'),
  ff('FF Stockelsdorf OF Mori', 'Freiwillige Feuerwehr Mori', [53.88792, 10.64019], 'Mori, 23617 Stockelsdorf'),
  ff('FF Stockelsdorf OF Stockelsdorf', 'Freiwillige Feuerwehr Stockelsdorf', [53.89893, 10.63378], 'Bohnrader Weg 4a, 23617 Stockelsdorf'),
  ff('FF Süsel OF Fassensdorf', 'Freiwillige Feuerwehr Fassensdorf', [54.09193, 10.64816], 'Fassensdorf, 23701 Süsel'),
  ff('FF Süsel OF Gothendorf', 'Freiwillige Feuerwehr Gothendorf', [54.09398, 10.61376], 'Lange Dörpstraat 2, 23701 Süsel'),
  ff('FF Süsel OF Groß Meinsdorf', 'Freiwillige Feuerwehr Groß Meinsdorf', [54.10428, 10.61166], 'Eutiner Landstraße 30, 23701 Süsel'),
  // "Freiwillige Feuerwehr Süsel" an der Bäderstraße – nicht Gothendorf
  ff('FF Süsel OF Süsel', 'Freiwillige Feuerwehr Süsel', [54.08024, 10.7031], 'An der Bäderstraße 2C, 23701 Süsel'),
  ff('FF Süsel OF Zarnekau', 'Feuerwehr Zarnekau', [54.13711, 10.69075], 'Zarnekau, 23701 Süsel'),
  ff('FF Timmendorfer Strand', 'Freiwillige Feuerwehr Timmendorfer Strand', [53.99121, 10.77998]),
  ff('FF Timmendorfer Strand OF Hemmelsdorf', 'Freiwillige Feuerwehr Hemmelsdorf', [53.97206, 10.7724], 'Seestraße 5, 23669 Timmendorfer Strand'),
  ff('FF Timmendorfer Strand OF Niendorf/Ostsee', 'Freiwillige Feuerwehr Niendorf', [53.98812, 10.83371], 'Niobeweg 2, 23669 Timmendorfer Strand'),
  ff('FTZ Kreis Ostholstein', 'Feuerwehrtechnische Zentrale des Kreises Ostholstein ( FTZ Ostholstein)', [54.21711, 10.89565], 'Bäderstraße 47, 23738 Lensahn'),
  // Feuerwehrhaus Schashagen (in OSM ohne Namen)
  ff('PF Schashagen OF Schashagen', [54.13477, 10.88114], [54.13477, 10.88114], 'Schashagen, 23730 Schashagen'),

  // ---------------------------------------------------------------- Rettungswachen
  rw('rdh. RW Ahrensbök', ['Rettungswache Ahrensbök'], [54.01229, 10.57029], 'osm', 'rdh. Lehrrettungswache Ahrensbök'),
  rw('JUH RW Bad Schwartau', ['Rettungswache Bad Schwartau'], [53.92078, 10.69021], 'osm', 'JUH Rettungswache Bad Schwartau'),
  // Wache am Klinikum (Mummendorfer Weg 12); OSM führt "Rettungswache Burg" an anderer Stelle
  rw('rdh. RW Burg auf Fehmarn', ['Rettungswache Burg'], [54.44146, 11.1758], 'adr', 'rdh. Rettungswache Burg auf Fehmarn'),
  rw('JUH RW Cismar', ['Rettungswache Cismar'], [54.18868, 10.98237], 'osm', 'JUH Rettungswache Cismar'),
  rw('rdh. RW Eutin', ['Rettungswache Eutin'], [54.13465, 10.60586], 'osm', 'rdh. Lehrrettungswache Eutin'),
  rw('rdh. RW Heiligenhafen', ['Rettungswache Heiligenhafen'], [54.3668, 11.00334], 'osm', 'rdh. Lehrrettungswache Heiligenhafen'),
  rw('rdh. RW Malente', ['Rettungswache Malente'], [54.18578, 10.56385], 'osm', 'rdh. Lehrrettungswache Malente'),
  rw('DRK RW Neustadt in Holstein', ['Rettungswache Neustadt'], [54.09181, 10.82867], 'osm', 'DRK Rettungswache Neustadt'),
  rw('DRK RW Oldenburg in Holstein', ['Rettungswache Oldenburg', 'Rettungswache Oldenburg in Holstein'], [54.29103, 10.87982], 'adr', 'DRK Rettungswache Oldenburg'),
  rw('rdh. RW Petersdorf', ['Rettungswache Petersdorf'], [54.47989, 11.06558], 'osm', 'rdh. Rettungswache Petersdorf'),
  // Lage der Wache nicht veröffentlicht: Ortsmitte Scharbeutz
  rw('rdh. RW Scharbeutz', null, [54.02663, 10.75595], 'ort', undefined, 'Scharbeutz'),
  rw('rdh. RW Schönwalde', ['Rettungswache Schönwalde am Bungsberg'], [54.18961, 10.754], 'osm', 'rdh. Lehrrettungswache Schönwalde'),
  rw('rdh. RW Timmendorfer Strand', ['Rettungswache Timmendorfer Strand'], [53.99095, 10.78067], 'osm', 'rdh. Lehrrettungswache Timmendorfer Strand'),
  // ohne Fahrzeuge in den Listen; an der L 184 bei Siblin, ohne Hausnummer
  rw('JUH RW Siblin', null, [54.0352, 10.5628], 'ort', 'JUH Rettungswache Siblin'),

  // ---------------------------------------------------------------- Luftrettung (Christoph 12, extern)
  { name: 'Luftrettungszentrum Siblin', kind: 'luft', pos: [54.03495, 10.56238], posKind: 'osm', address: 'Am Hubschrauberlandeplatz 1, 23623 Ahrensbök' },

  // ---------------------------------------------------------------- THW
  org('THW OV Eutin', 'thw', [54.12697, 10.6191], 'osm', 'Industriestraße 2, 23701 Eutin'),
  org('THW OV Neustadt in Holstein', 'thw', [54.0937, 10.79396], 'osm', 'Am Holm 74, 23730 Neustadt in Holstein'),
  org('THW OV Oldenburg in Holstein', 'thw', [54.29194, 10.9152], 'osm', 'Am Voßberg 10, 23758 Oldenburg in Holstein'),

  // ---------------------------------------------------------------- Hilfsorganisationen, DLRG, Rettungshunde
  // ASB "Sama/Kater Ostholstein 35/…": OKZ 35 = Heiligenhafen (ASB Heiligenhafen, Tollbrettkoppel 15)
  org('ASB RV Ostholstein', 'kats', [54.36684, 11.00332], 'osm', 'Tollbrettkoppel 15, 23774 Heiligenhafen'),
  org('BRH RHS Schleswig-Holstein Ost', 'kats', [53.89818, 10.64377], 'ort', 'Stockelsdorf'),
  org('DLRG Bad Schwartau', 'kats', [53.91964, 10.69787], 'ort', 'Bad Schwartau'),
  org('DLRG Haffkrug-Scharbeutz', 'kats', [54.02967, 10.74153], 'osm', 'Fuchsberg 1b, 23683 Scharbeutz'),
  org('DLRG WRS Lübecker Bucht', 'kats', [54.02739, 10.75783], 'osm', 'Wasserrettungsstation Scharbeutz (Hauptwache), 23683 Scharbeutz'),
  // aus der Ortskennziffer abgeleitet ("unbekannt" in der Liste)
  org('DLRG Eutin', 'kats', [54.13805, 10.61231], 'osm', 'Eutin'),
  org('DLRG Bosau', 'kats', [54.10214, 10.42523], 'osm', 'Bosau'),
  org('DRK KV Ostholstein-Plön', 'kats', [54.1376, 10.618], 'ort', 'Eutin'),
  org('DRK OV Bad Schwartau', 'kats', [53.92271, 10.66774], 'osm', 'Nieland 6, 23611 Bad Schwartau'),
  org('DRK OV Göhl', 'kats', [54.28612, 10.93996], 'ort', 'Göhl'),
  org('DRK OV Neustadt in Holstein', 'kats', [54.1072, 10.8139], 'ort', 'Neustadt in Holstein'),
  org('DRK OV Stockelsdorf', 'kats', [53.89473, 10.64119], 'osm', 'Parkweg 8, 23617 Stockelsdorf'),
  org('DRK OV Süsel', 'kats', [54.08112, 10.71441], 'osm', 'Neustädter Straße 12, 23701 Süsel'),
  org('DRK OV Timmendorfer Strand', 'kats', [53.99177, 10.77797], 'ort', 'Timmendorfer Strand'),
  org('JUH OV Eutin', 'kats', [54.1251, 10.63558], 'osm', 'Max-Planck-Straße 7, 23701 Eutin'),
  org('MHD Timmendorfer Strand', 'kats', [53.99819, 10.7799], 'ort', 'Timmendorfer Strand'),
];

/** Abweichende Schreibweisen der Wache in den Listen */
export const WACHE_ALIAS: Record<string, string> = {
  'FF Stadt Fehmarn OF Landkirchen': 'FF Fehmarn OF Landkirchen',
  // Jugendfeuerwehr gehört zur Wehr
  'FF Stockelsdorf Jugendfeuerwehr': 'FF Stockelsdorf OF Stockelsdorf',
};

/** Kurzname der Organisation für Wachen, die aus der Ortskennziffer abgeleitet werden */
export const ORG_SHORT: Record<string, string> = {
  Pelikan: 'DLRG',
  Rotkreuz: 'DRK OV',
  Akkon: 'JUH OV',
  Sama: 'ASB',
  Kater: 'ASB',
  Johannes: 'MHD',
};
