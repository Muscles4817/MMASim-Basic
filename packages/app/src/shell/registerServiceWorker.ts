/**
 * Service worker registration.
 *
 * Production only. Running a worker in development means every change is served from a
 * cache that has to be manually cleared, which costs far more than offline dev is worth.
 */

/**
 * Register, and tell the caller when a newer version is sitting ready.
 *
 * The callback is the whole reason this is not three lines inline. The worker deliberately
 * does not `skipWaiting()` — swapping the code out mid-session is how a player loses a fight
 * they were halfway through — so something has to be able to say "there is an update, take
 * it when you are ready". That decision belongs to the UI, not here.
 */
export function registerServiceWorker(onUpdateReady?: () => void): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Already waiting when we arrived — a previous session installed it and never
        // reloaded. This is the common case, and forgetting it means the update prompt
        // only ever appears for people who happen to be online at the right moment.
        if (registration.waiting) onUpdateReady?.();

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // `controller` distinguishes an update from the very first install. On a first
            // install there is nothing to update *to*, and prompting would be nonsense.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              onUpdateReady?.();
            }
          });
        });
      })
      .catch(() => {
        // A failed registration costs offline support and nothing else. The game works.
      });
  });
}

/** Take the waiting worker and reload. Called when the player accepts an update. */
export function applyUpdate(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration().then((registration) => {
    if (!registration?.waiting) {
      window.location.reload();
      return;
    }
    // Reload once the new worker takes control, rather than immediately — reloading first
    // would just re-run the old one.
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
      once: true,
    });
    registration.waiting.postMessage('skipWaiting');
  });
}
