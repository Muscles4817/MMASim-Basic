import { useState } from 'react';
import { displayName, type Fighter } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { useTheme } from '../state/theme';
import { Button, Card, Chip, Segmented } from '../ui';
import { formatGameDay } from '../shell/Shell';

export function SettingsScreen() {
  const { choice, resolved, setChoice } = useTheme();
  const { db, world, playerFighter, restart } = useGame();
  const { navigate } = useRouter();
  const [confirmingRestart, setConfirmingRestart] = useState(false);

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card title="Appearance">
        <Segmented
          label="Theme"
          value={choice}
          onChange={setChoice}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <p className="faint" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
          {choice === 'system'
            ? `Following your device, currently ${resolved}. It will change with your device.`
            : `Locked to ${choice}.`}
        </p>
      </Card>

      <Card title="Career">
        {playerFighter ? (
          <>
            <p style={{ fontWeight: 600 }}>{displayName(playerFighter as Fighter)}</p>
            <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>
              {formatGameDay(world.day)}
            </p>
            <Button onClick={() => navigate({ name: 'start' })}>Play as someone else</Button>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>
              No career in progress.
            </p>
            <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
              Start a career
            </Button>
          </>
        )}
      </Card>

      <Card title="Save">
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
          <Chip tone="info">{db.fighters.count()} fighters</Chip>
          <Chip tone="info">{db.promotions.count()} promotions</Chip>
          <Chip tone="info">{db.gyms.count()} gyms</Chip>
          <Chip>Seed: {world.seed}</Chip>
        </div>
        <p className="faint" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
          Saved to this browser. The same seed and day always reproduce the same world.
        </p>

        {confirmingRestart ? (
          <div className="stack">
            <p style={{ fontWeight: 600, color: 'var(--negative)' }}>
              This deletes your career and every edit you have made. It cannot be undone.
            </p>
            <div className="row">
              <Button
                variant="danger"
                onClick={() => {
                  restart();
                  setConfirmingRestart(false);
                  navigate({ name: 'start' });
                }}
              >
                Yes, delete everything
              </Button>
              <Button onClick={() => setConfirmingRestart(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          // Two-step rather than a native confirm(): a modal dialog on mobile is easy to
          // dismiss accidentally, and this is the one irreversible action in the app.
          <Button variant="secondary" onClick={() => setConfirmingRestart(true)}>
            Reset to the 2020 seed
          </Button>
        )}
      </Card>

      <Card title="About">
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          Ratings are absolute, not weight-class relative: Power 78 is the same force at
          flyweight and at heavyweight. Every rating in the seed roster is a critical
          judgement, and each fighter carries a note explaining the ones you would argue with.
        </p>
      </Card>
    </div>
  );
}
