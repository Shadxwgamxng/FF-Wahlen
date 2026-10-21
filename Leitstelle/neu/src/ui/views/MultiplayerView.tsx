/** Mehrspieler: Kurzübersicht der Zugänge (Einrichtung siehe docs/MEHRSPIELER.md) */
export function MultiplayerView() {
  return (
    <div className="page page-narrow col" style={{ gap: 14 }}>
      <div className="card col">
        <h3>Mehrspieler</h3>
        <table className="grid small">
          <tbody>
            <tr><td>Gastgeber</td><td className="mono">npm run lan</td></tr>
            <tr><td>Mitspieler</td><td className="mono">http://&lt;IP Gastgeber&gt;:8080/mitspielen</td></tr>
            <tr><td>Tablet</td><td className="mono">http://&lt;IP Gastgeber&gt;:8080/tablet</td></tr>
            <tr><td>Max. Spieler</td><td>4</td></tr>
            <tr><td>Doku</td><td className="mono">docs/MEHRSPIELER.md</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
