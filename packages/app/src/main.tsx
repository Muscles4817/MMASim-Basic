import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './shell/ErrorBoundary';
import { GameProvider } from './state/GameProvider';
import { RouterProvider } from './state/router';
import { ThemeProvider } from './state/theme';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    {/* Outermost: the world is loaded during GameProvider’s first render, so the boundary
        has to sit above it to catch a corrupt or too-new save. */}
    <ErrorBoundary>
      <ThemeProvider>
        <GameProvider>
          <RouterProvider>
            <App />
          </RouterProvider>
        </GameProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
