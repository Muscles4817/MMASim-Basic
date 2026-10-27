/**
 * A tip: one sentence about how a screen works, shown until the player says they have it.
 *
 * Dismissed per save (`WorldMeta.dismissed`), so it does not come back on the next visit and
 * does not follow the player into a career where they might want it again.
 */

import type { ReactNode } from 'react';
import { useGame } from '../state/GameProvider';
import { dismiss, isDismissed } from '../game/onboarding';
import { Button } from './index';
import { Alert } from './signals';

export function Tip({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { db, commit } = useGame();
  if (isDismissed(db, `tip:${id}`)) return null;
  return (
    <Alert tone="info" title={title}>
      <span className="prose" style={{ display: 'block' }}>
        {children}
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          dismiss(db, `tip:${id}`);
          commit();
        }}
      >
        Got it
      </Button>
    </Alert>
  );
}
