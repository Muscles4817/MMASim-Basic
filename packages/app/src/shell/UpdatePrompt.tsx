import { useEffect, useState } from 'react';
import { applyUpdate, registerServiceWorker } from './registerServiceWorker';
import './UpdatePrompt.css';

/**
 * "There is a new version" — offered, never forced.
 *
 * The service worker deliberately does not activate itself, because reloading a player
 * mid-fight to install an update is a worse bug than being one version behind. So the
 * decision surfaces here, as a dismissible bar the player can ignore for as long as they
 * like. It reappears on the next load if they do.
 *
 * Renders nothing at all in the common case, which is why it is safe to mount unconditionally.
 */
export function UpdatePrompt() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    registerServiceWorker(() => setReady(true));
  }, []);

  if (!ready || dismissed) return null;

  return (
    <div className="update-prompt" role="status">
      <span className="update-prompt__text">
        <span aria-hidden="true">&#8635;</span> A new version is ready.
      </span>
      <span className="row" style={{ gap: 'var(--space-2)' }}>
        <button type="button" className="update-prompt__action" onClick={applyUpdate}>
          Reload
        </button>
        <button
          type="button"
          className="update-prompt__dismiss"
          onClick={() => setDismissed(true)}
        >
          Later
        </button>
      </span>
    </div>
  );
}
