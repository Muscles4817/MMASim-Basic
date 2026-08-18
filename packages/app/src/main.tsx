import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './shell/ErrorBoundary';
import { requestPersistentStorage } from './shell/persistentStorage';
import { SaveGate } from './state/SaveGate';
import { RouterProvider } from './state/router';
import { ThemeProvider } from './state/theme';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

// Before the first render, so the request is in flight while the world is being built. It
// changes nothing about this session and everything about whether the save is still there in
// three weeks — see shell/persistentStorage.
requestPersistentStorage();

createRoot(container).render(
  <StrictMode>
    {/* Outermost: the world is loaded during GameProvider’s first render, so the boundary
        has to sit above it to catch a corrupt or too-new save. */}
    <ErrorBoundary>
      <ThemeProvider>
        {/*
          The gate, not the provider, is what mounts here now: the main menu runs outside the
          game entirely — no world, no player, no shell — and only once a save is chosen does a
          GameProvider exist to render into.
        */}
        <SaveGate>
          <RouterProvider>
            <App />
          </RouterProvider>
        </SaveGate>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
