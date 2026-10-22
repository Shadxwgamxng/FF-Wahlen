import type { Hospital, LatLng } from '../../model/types';

/**
 * Kliniken der Beispielleitstelle Ostholstein (Notfallziele), Stand Oktober 2026.
 * Quellen: Deutsches Krankenhausverzeichnis (Qualitätsberichte 2024), Websites der Kliniken,
 * TraumaNetzwerk DGU; Positionen aus OpenStreetMap. Die Häuser der früheren Sana Kliniken
 * Ostholstein betreibt seit 2022 AMEOS. Außerhalb des Kreises nur die beiden Unikliniken.
 * Kapazität = gleichzeitig aufnehmbare Notfallpatienten im Spiel (grob nach Größe des Hauses).
 */
const kh = (id: string, name: string, position: LatLng, departments: string[], capacity: number): Hospital => ({ id, name, position, departments, capacity, occupied: 0, available: true });

export function ostholsteinHospitals(): Hospital[] {
  return [
    // Schwerpunktversorgung: Herzkatheter (24 h), Pädiatrie mit Neonatologie, Geburtshilfe
    kh('kh_oh_eutin', 'AMEOS Klinikum Eutin', [54.13315, 10.60196], ['allgemein', 'innere', 'kardiologie', 'unfallchirurgie', 'intensiv', 'paediatrie', 'gynaekologie'], 10),
    // Grund- und Regelversorgung, Neurologie am Standort (AMEOS Holstein)
    kh('kh_oh_oldenburg', 'AMEOS Klinikum Oldenburg', [54.29005, 10.88], ['allgemein', 'innere', 'unfallchirurgie', 'neurologie', 'intensiv'], 8),
    // Basisversorgung (28 Betten)
    kh('kh_oh_fehmarn', 'AMEOS Klinikum Fehmarn', [54.44146, 11.17581], ['allgemein', 'innere'], 3),
    // Schwerpunktversorgung: regionales Traumazentrum, Stroke Unit, Chest Pain Unit, Cardiac Arrest Center
    kh('kh_oh_schoen', 'Schön Klinik Neustadt', [54.09033, 10.82923], ['allgemein', 'innere', 'kardiologie', 'unfallchirurgie', 'neurologie', 'intensiv'], 14),
    // Fachkliniken Psychiatrie
    kh('kh_oh_ameos_neustadt', 'AMEOS Klinikum Neustadt (Psychiatrie)', [54.10492, 10.79457], ['psychiatrie'], 5),
    kh('kh_oh_heiligenhafen', 'AMEOS Klinikum Heiligenhafen (Psychiatrie)', [54.37444, 10.95832], ['psychiatrie'], 5),
    // außerhalb des Kreises: Maximalversorgung (überregionales Traumazentrum)
    kh('kh_uksh_luebeck', 'UKSH Campus Lübeck', [53.83646, 10.70739], ['allgemein', 'innere', 'kardiologie', 'unfallchirurgie', 'neurologie', 'gynaekologie', 'intensiv', 'paediatrie', 'psychiatrie', 'verbrennung'], 25),
    kh('kh_uksh_kiel', 'UKSH Campus Kiel', [54.33049, 10.14288], ['allgemein', 'innere', 'kardiologie', 'unfallchirurgie', 'neurologie', 'gynaekologie', 'intensiv', 'paediatrie', 'psychiatrie'], 25),
  ];
}
