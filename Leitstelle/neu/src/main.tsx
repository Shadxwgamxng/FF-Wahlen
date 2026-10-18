import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { PopoutApp } from './ui/PopoutApp';
import './ui/styles.css';
import { store } from './store/gameStore';

// Für Konsolen-Diagnose und End-to-End-Tests
(window as unknown as { leitwarte: typeof store }).leitwarte = store;

// ?fenster=karte|fahrzeuge|einsaetze|funk → Zweitfenster (z. B. für einen weiteren Bildschirm)
const popout = new URLSearchParams(location.search).get('fenster');
if (popout) store.startSyncRemote();
else store.startSyncMain();

createRoot(document.getElementById('root')!).render(<StrictMode>{popout ? <PopoutApp kind={popout} /> : <App />}</StrictMode>);
