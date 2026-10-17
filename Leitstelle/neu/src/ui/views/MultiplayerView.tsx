/**
 * Mehrspieler ist in Version 1 bewusst NICHT implementiert. Diese Seite beschreibt ehrlich den
 * Stand und die geplante Architektur (siehe docs/MULTIPLAYER.md) – sie täuscht keine Funktion vor.
 */
export function MultiplayerView() {
  return (
    <div className="page page-narrow col" style={{ gap: 14 }}>
      <div className="warnbox">
        <b>Mehrspieler ist noch nicht verfügbar.</b> Diese Version ist eine reine Einzelspieler-Browseranwendung. Es gibt keine Benutzerkonten, keinen Server und keine
        Datenübertragung – alle Daten bleiben in diesem Browser.
      </div>
      <div className="card col">
        <h3>Geplante Architektur (Phase 5)</h3>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li><b>Server-autoritative Simulation:</b> Die vorhandene Engine (<span className="mono">src/sim</span>) ist UI-unabhängig und deterministisch und läuft künftig unverändert in Node.js auf dem Server.</li>
          <li><b>Befehle statt Zustandsabgleich:</b> Clients senden dieselben Engine-Befehle (Notruf annehmen, alarmieren, entlassen …) per WebSocket; der Server prüft Berechtigung und Versionsnummer und verteilt Zustandsänderungen.</li>
          <li><b>Konkurrierende Änderungen:</b> Optimistische Sperre je Notruf/Einsatz (wer einen Notruf annimmt, „besitzt“ ihn); Konflikte liefern verständliche Fehlermeldungen, wie sie die Engine heute schon erzeugt (z. B. „Fahrzeug bereits gebunden“).</li>
          <li><b>Rollen:</b> Notrufannahme, Disponent/-in, Einsatzleitung, Administrator/-in – Berechtigungen je Befehl.</li>
          <li><b>Persistenz:</b> PostgreSQL für Konten, Leitstellen, Spielstände und Archiv; Format = das bereits versionierte JSON-Exportformat.</li>
          <li><b>Wiederverbindung:</b> Client erhält beim Verbinden einen Snapshot + fortlaufende Ereignisnummer und holt verpasste Ereignisse nach.</li>
        </ul>
      </div>
      <div className="card col">
        <h3>Was heute schon vorbereitet ist</h3>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Alle Spielaktionen laufen über zentrale, serialisierbare Engine-Befehle mit Ergebnisrückgabe.</li>
          <li>Stabile IDs, versioniertes Datenformat, Validierung beim Import.</li>
          <li>Freigabefelder (privat/geteilt/öffentlich, Autor, Tags) für eine spätere Community-Bibliothek.</li>
        </ul>
      </div>
    </div>
  );
}
