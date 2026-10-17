import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import { store } from './store/gameStore';

// Für Konsolen-Diagnose und End-to-End-Tests
(window as unknown as { leitwarte: typeof store }).leitwarte = store;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
