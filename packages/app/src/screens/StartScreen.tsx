/**
 * Starting a career: who are you going to be.
 *
 * The old version of this screen was three `Card`s stacked in one column — create a fighter, or
 * run one of these promotions, or take over one of these fighters — and the mode was decided by
 * which list you happened to touch. `playerRole` was set as a side effect of a row click.
 *
 * Two things were wrong with that and doc 32 § 11 names both.
 *
 * **Browsing was committing.** `takeOver` called `updateWorld` and navigated, with no
 * confirmation at all. The fighter path had one, but only when `playerFighterId` was already set
 * — which on a fresh save it never is, so on the flow the screen exists for, one tap on any of
 * hundreds of rows started the save.
 *
 * **There was nowhere for Coach to go.** A third mode would have meant a fourth `Or…` card in the
 * stack, and the selection experience for a gym is not the selection experience for a fighter.
 *
 * So mode is a step. This screen is that step and nothing else; `startFighter.tsx` and
 * `startPromoter.tsx` are the selection experiences behind it, and they are separate files
 * precisely because they should not converge.
 */

import { useMemo } from 'react';
import { type Promotion } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter, type PlayableMode } from '../state/router';
import { Button, Card } from '../ui';
import { Help } from '../ui/signals';
import './MenuScreen.css';

interface ModeSpec {
  id: PlayableMode;
  label: string;
  /** The fantasy, in one line. */
  pitch: string;
  /** What the loop actually is. */
  loop: string;
  /** What choosing this mode asks you to decide next. */
  next: string;
  available: boolean;
}

const MODES: readonly ModeSpec[] = [
  {
    id: 'fighter',
    label: 'Fighter',
    pitch: 'One body, fifteen years, and every choice costs something.',
    loop: 'Train, take fights, climb, and decide when the money is worth the damage.',
    next: 'Build a fighter, or take over somebody who already exists.',
    available: true,
  },
  {
    id: 'coach',
    label: 'Coach',
    pitch: "You run a gym. Your reputation is built out of other people's careers.",
    loop: 'Recruit on potential you cannot see, develop it, and watch somebody else fight.',
    next: 'Start in a garage, inherit a gym, or take over a super-gym.',
    available: false,
  },
  {
    id: 'promoter',
    label: 'Promoter',
    pitch: 'You run a promotion. Make money or make the sport — you will not do both.',
    loop: 'Plan cards months out, decide who fights whom, and pay for it.',
    next: 'Take control of a regional promotion.',
    available: true,
  },
];

export function StartScreen() {
  const { db, world } = useGame();
  const { navigate } = useRouter();

  const regionals = useMemo(
    () =>
      (db.promotions.findAll() as unknown as Promotion[]).filter((p) => p.tier === 'regional')
        .length,
    [db],
  );

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }} data-testid="new-career">
      {/*
        Which world you are in, said out loud.

        The player chose it on the menu, waited up to half a minute for it to be built, and then
        arrived here with no confirmation that the thing they chose is the thing they got. Doc 32
        § 11.1: at every point the player should know which world they selected and which mode
        they are starting.
      */}
      <Card>
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          {/* `generatedSize` is present only on a generated world, which is how the two are
              told apart — a seeded save records its era and nothing else. */}
          {world.generatedSize !== undefined
            ? 'A generated world — a sport nobody has played before.'
            : `The ${world.era ?? '2020'} world.`}{' '}
          {regionals} regional promotion{regionals === 1 ? '' : 's'}, and the whole sport above
          them.
        </p>
      </Card>

      <h2 style={{ fontSize: 'var(--text-2xl)' }}>Who are you going to be?</h2>

      <div className="modes">
        {MODES.map((mode) => (
          <ModeCard
            key={mode.id}
            mode={mode}
            onChoose={() => navigate({ name: 'start', mode: mode.id })}
          />
        ))}
      </div>

      <Help label="Can I change my mind later?">
        Yes — every mode is reachable from Settings, and picking a different one leaves the
        fighter or the promotion you were running in the world, carrying on without you. Nothing
        here is decided until you take control of somebody on the next screen.
      </Help>
    </div>
  );
}

function ModeCard({ mode, onChoose }: { mode: ModeSpec; onChoose(): void }) {
  return (
    <Card className="mode" testId={`mode-${mode.id}`}>
      <h3 className="mode__label">{mode.label}</h3>
      <p className="mode__pitch">{mode.pitch}</p>
      <p className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
        {mode.loop}
      </p>
      <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
        {mode.next}
      </p>

      <div className="mode__action">
        {mode.available ? (
          <Button variant="primary" block onClick={onChoose}>
            Play as a {mode.label.toLowerCase()}
          </Button>
        ) : (
          /*
            Shown and marked unavailable, never hidden and never `disabled`.

            Doc 10: a real `disabled` attribute removes the control from the tab order, so a
            keyboard user discovers the option has silently vanished. `aria-disabled` plus a
            handler that explains itself is the house rule — and showing the mode at all is what
            makes the flow survive Coach landing, because the slot is already here.
          */
          <Button
            block
            aria-disabled="true"
            onClick={(e) => e.preventDefault()}
            title="Coach mode is designed but not built yet"
          >
            Not built yet
          </Button>
        )}
      </div>
    </Card>
  );
}
