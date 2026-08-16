import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GameProvider } from './state/GameProvider';
import { RouterProvider } from './state/router';
import { ThemeProvider } from './state/theme';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <GameProvider>
        <RouterProvider>
          <App />
        </RouterProvider>
      </GameProvider>
    </ThemeProvider>
  </StrictMode>,
);
