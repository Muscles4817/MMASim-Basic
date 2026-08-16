import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence.
 *
 * The world is loaded synchronously during the first render, so a corrupt save, a schema
 * refusal or a storage failure throws *during render* — React unmounts the whole tree and
 * the player gets a blank page. Because the bad data is persisted, reloading reproduces it
 * forever, and Settings (with its reset button) is inside the tree that just died.
 *
 * The recovery UI therefore uses inline styles and talks to `localStorage` directly: it must
 * not depend on the design system, the router, or anything else that could be implicated in
 * the failure it is recovering from.
 */
interface State {
  error?: Error;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[mmasim] Unrecoverable error', error, info.componentStack);
  }

  private clearSaveAndReload = (): void => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('mmasim:')) localStorage.removeItem(key);
      }
      sessionStorage.clear();
    } catch {
      // If storage itself is unavailable there is nothing to clear, and reloading is still
      // the right move.
    }
    window.location.hash = '';
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          /*
            Hard-coded rather than tokenised, deliberately: this screen may be recovering
            from the very thing that failed to load the stylesheet, so it must depend on
            nothing. But it still has to respect the OS scheme — a dark-mode player was
            getting a full-screen white flash at the single worst possible moment. The
            colours are inlined in both directions rather than imported.
          */
          background: 'Canvas',
          color: 'CanvasText',
          colorScheme: 'light dark',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ marginBottom: 12, lineHeight: 1.5 }}>
            The game could not start. This usually means the saved data is from an
            incompatible version, or was damaged.
          </p>
          <p
            style={{
              marginBottom: 20,
              padding: 12,
              borderRadius: 8,
              background: '#eeeef1',
              fontSize: 13,
              fontFamily: 'ui-monospace, monospace',
              wordBreak: 'break-word',
            }}
          >
            {error.message}
          </p>
          <button
            type="button"
            onClick={this.clearSaveAndReload}
            style={{
              minHeight: 44,
              padding: '0 20px',
              borderRadius: 10,
              border: 'none',
              background: '#b8342b',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Clear saved data and start again
          </button>
          <p style={{ marginTop: 12, fontSize: 13, color: '#5c5f68' }}>
            This deletes your career. There is no way to recover it.
          </p>
        </div>
      </div>
    );
  }
}
