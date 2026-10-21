import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { PopoutApp } from './ui/PopoutApp';
import { TabletApp } from './ui/TabletApp';
import './ui/styles.css';
import { store } from './store/gameStore';
import { applyStyle } from './ui/prefs';

applyStyle();

// Für Konsolen-Diagnose und End-to-End-Tests
(window as unknown as { leitwarte: typeof store }).leitwarte = store;

// ?fenster=karte|fahrzeuge|einsaetze|funk → Zweitfenster (z. B. für einen weiteren Bildschirm), ?fenster=tablet → Tablet im LAN
const params = new URLSearchParams(location.search);
const popout = params.get('fenster');
// ?spieler=1 (…/mitspielen): Mitspieler mit voller Oberfläche, die Simulation läuft beim Gastgeber
const player = params.has('spieler');
if (player) store.isPlayerClient = true;
if (popout || player) store.startSyncRemote();
else store.startSyncMain();

createRoot(document.getElementById('root')!).render(<StrictMode>{popout === 'tablet' ? <TabletApp /> : popout ? <PopoutApp kind={popout} /> : <App />}</StrictMode>);
