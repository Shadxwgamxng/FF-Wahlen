import type { LatLng, NeighborCenter, ServiceWindow } from '../../model/types';

/**
 * Externe Rettungsmittel für die Beispielleitstelle Ostholstein: nur Wachen unmittelbar an der
 * Kreisgrenze (Hansestadt Lübeck, Kreis Plön) und die Rettungshubschrauber in Reichweite.
 * Quellen: bos-fahrzeuge.info, Feuerwehr Lübeck, Rettungsdienst Kreis Plön; Positionen aus OpenStreetMap.
 * Anforderung über die Nachbarleitstelle – daher mit Verzug.
 */

export interface ExternalStation {
  id: string;
  name: string;
  address: string;
  position: LatLng;
  neighborId: string;
  /** Verzug der Anforderung über die Nachbarleitstelle (s) */
  delay: number;
  vehicles: { callsign: string; typeId: string; windows?: ServiceWindow[] }[];
}

export const NEIGHBORS: NeighborCenter[] = [
  { id: 'nb_luebeck', name: 'Leitstelle Lübeck', position: [53.8824, 10.6589], note: 'Rettungsdienst der Hansestadt Lübeck (Wachen an der Grenze zu Bad Schwartau, Stockelsdorf und Ratekau).' },
  { id: 'nb_ploen', name: 'Leitstelle Mitte (Kreis Plön)', position: [54.1634, 10.4298], note: 'Rettungsdienst Kreis Plön (Wachen an der Grenze zu Malente, Bosau und Schönwalde).' },
  { id: 'nb_luft', name: 'Luftrettung', position: [54.03495, 10.56238], note: 'Rettungshubschrauber Christoph 12 (Siblin) und weitere RTH in Reichweite.' },
];

export const EXTERNAL_STATIONS: ExternalStation[] = [
  {
    id: 'st_hl_furw1',
    name: 'BF Lübeck FuRW 1 (St. Lorenz Nord)',
    address: 'Bornhövedstraße 10, 23554 Lübeck',
    position: [53.88243, 10.65886],
    neighborId: 'nb_luebeck',
    delay: 120,
    vehicles: [
      { callsign: 'Florian Lübeck 10/83-01', typeId: 'rtw' },
      { callsign: 'Florian Lübeck 10/83-02', typeId: 'rtw' },
      { callsign: 'Florian Lübeck 10/83-03', typeId: 'rtw' },
      { callsign: 'Florian Lübeck 10/82-01', typeId: 'nef' },
    ],
  },
  {
    id: 'st_hl_furw3',
    name: 'BF Lübeck FuRW 3 (Kücknitz)',
    address: 'Travemünder Landstraße 276, 23569 Lübeck',
    position: [53.93393, 10.83965],
    neighborId: 'nb_luebeck',
    delay: 120,
    vehicles: [
      { callsign: 'Florian Lübeck 30/83-01', typeId: 'rtw' },
      { callsign: 'Florian Lübeck 30/83-02', typeId: 'rtw' },
      { callsign: 'Florian Lübeck 30/83-03', typeId: 'rtw' },
    ],
  },
  {
    id: 'st_pl_luetjenburg',
    name: 'RW Lütjenburg (Kreis Plön)',
    address: 'Panker Straße 6a, 24321 Lütjenburg',
    position: [54.2952, 10.58764],
    neighborId: 'nb_ploen',
    delay: 120,
    vehicles: [
      { callsign: 'Rettung Plön 40/83-01', typeId: 'rtw' },
      { callsign: 'Rettung Plön 40/83-02', typeId: 'rtw' },
    ],
  },
  {
    id: 'st_pl_seekrug',
    name: 'RW-Stützpunkt Seekrug (Kreis Plön)',
    address: 'Seekrug, 24321 Giekau',
    position: [54.29295, 10.51457],
    neighborId: 'nb_ploen',
    delay: 120,
    vehicles: [{ callsign: 'Rettung Plön 38/83-01', typeId: 'rtw' }],
  },
  {
    id: 'st_pl_ploen',
    name: 'JUH RW Plön (Kreis Plön)',
    address: 'Am alten Güterbahnhof 4, 24306 Plön',
    position: [54.16337, 10.42982],
    neighborId: 'nb_ploen',
    delay: 120,
    vehicles: [
      { callsign: 'Akkon Plön 80/83-01', typeId: 'rtw' },
      { callsign: 'Akkon Plön 80/83-02', typeId: 'rtw' },
      { callsign: 'Akkon Plön 80/85-01', typeId: 'ktw' },
    ],
  },
  {
    id: 'st_rth_rendsburg',
    name: 'Luftrettungsstation Rendsburg (Christoph 42)',
    address: 'Schön Klinik Rendsburg, Lilienstraße 20–28, 24768 Rendsburg',
    position: [54.21681, 9.59973],
    neighborId: 'nb_luft',
    delay: 120,
    // 24 Stunden mit Nachtflug (nachts für ganz Schleswig-Holstein)
    vehicles: [{ callsign: 'Christoph 42', typeId: 'rth' }],
  },
  {
    id: 'st_rth_hansa',
    name: 'Luftrettungsstation Hamburg (Christoph Hansa)',
    address: 'BG Klinikum Hamburg, Bergedorfer Straße 10, 21033 Hamburg',
    position: [53.50816, 10.17351],
    neighborId: 'nb_luft',
    delay: 120,
    // nur Tag: 8 Uhr bis Sonnenuntergang, spätestens 21 Uhr
    vehicles: [{ callsign: 'Christoph Hansa', typeId: 'rth', windows: [{ fromHour: 8, toHour: 21, weekdays: [] }] }],
  },
  {
    id: 'st_rth_rostock',
    name: 'Luftrettungszentrum Rostock (Christoph 92)',
    address: 'Klinikum Südstadt Rostock, Südring 81, 18059 Rostock',
    position: [54.07044, 12.10933],
    neighborId: 'nb_luft',
    delay: 180,
    // Intensivtransporthubschrauber der Johanniter Luftrettung, 24 Stunden mit Nachtflug
    vehicles: [{ callsign: 'Christoph 92', typeId: 'oh_ith' }],
  },
];
