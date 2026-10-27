import { useState } from 'react';
import { Button } from './index';

/**
 * Deleting a save: two steps, and the confirm names the save rather than asking "are you sure".
 *
 * This is the only action in the app that destroys a career outright, and the registry row is a
 * summary — once the namespace is swept there is nothing to recover it from. Shared because the
 * menu is not the only place a save can be deleted from: one that will not open offers it too,
 * and the same action has to cost the same two taps wherever it is.
 */
export function DeleteSave({
  name,
  onDelete,
  label = 'Delete',
}: {
  name: string;
  onDelete(): void;
  /** The first button's text, for a screen where "Delete" alone would not say what goes. */
  label?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <span className="row" style={{ gap: 'var(--space-2)' }}>
      <Button size="sm" variant="danger" autoFocus onClick={onDelete}>
        Delete {name}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </span>
  ) : (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => setConfirming(true)}
      aria-label={label === 'Delete' ? `Delete ${name}` : undefined}
    >
      {label}
    </Button>
  );
}
