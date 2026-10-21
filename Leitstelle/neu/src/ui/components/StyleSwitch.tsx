import { setPrefs, usePrefs } from '../prefs';

/** Auswahl des Oberflächenstils */
export function StyleSwitch() {
  const p = usePrefs();
  return (
    <div className="row" role="group" aria-label="Oberflächenstil" data-testid="style-switch">
      <span className="small muted">Stil:</span>
      <button className={`btn small ${p.uiStyle === 'behoerde' ? 'active' : ''}`} onClick={() => setPrefs({ uiStyle: 'behoerde' })}>
        Behörde
      </button>
      <button className={`btn small ${p.uiStyle === 'modern' ? 'active' : ''}`} onClick={() => setPrefs({ uiStyle: 'modern' })}>
        Modern
      </button>
    </div>
  );
}
