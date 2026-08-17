/**
 * The calendar, and the clock.
 *
 * The game had a clock and no way to see it: `world.day` advanced inside whichever screen
 * happened to advance it, and in promoter mode nothing advanced it at all. This is the one
 * screen that owns time — you can look at what is coming, and you can move.
 *
 * It serves every mode from one implementation because `ownership` is a field on the entry
 * rather than a property of the screen. A promoter sees their cards, a fighter sees their fights
 * and camps, and the filter that widens it to the whole sport is the same control in both.
 */

import { useMemo, useState } from 'react';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Segmented } from '../ui';
import { Alert } from '../ui/signals';
import { formatGameDay } from '../shell/Shell';
import { buildCalendar, defaultFilter, nextStop, type CalendarEntry } from '../game/calendar';
import { ADVANCE_STEPS, advanceTo, type AdvanceResult } from '../game/clock';

/** How far ahead the diary looks. A season, which is long enough to plan and short enough to read. */
const HORIZON_DAYS = 120;

export function CalendarScreen() {
  const { db, world, commit } = useGame();
  const { navigate } = useRouter();

  const [filter, setFilter] = useState<'yours' | 'all'>(() => defaultFilter(world));
  const [lastAdvance, setLastAdvance] = useState<AdvanceResult | undefined>();

  const entries = useMemo(
    () => buildCalendar(db, { from: world.day, to: world.day + HORIZON_DAYS }),
    [db, world.day],
  );

  const shown = filter === 'yours' ? entries.filter((e) => e.ownership === 'yours') : entries;
  const upNext = useMemo(() => nextStop(db, world.day), [db, world.day]);

  const advance = (days: number) => {
    const result = advanceTo(db, world.day + days);
    setLastAdvance(result);
    commit();
  };

  const advanceToNext = () => {
    if (upNext === undefined) return;
    const result = advanceTo(db, upNext);
    setLastAdvance(result);
    commit();
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <p className="section-title">Today</p>
        {/* `data-testid` because the shell also prints a date, and "the clock" is a specific
            thing a test needs to be able to point at. */}
        <p
          data-testid="clock"
          style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, margin: 0 }}
        >
          {formatGameDay(world.day)}
        </p>

        {/*
          "To the next thing" first, because it is what a player wants nine times in ten and it
          is the only option that cannot overshoot something they cared about. The fixed spans
          are there for when the diary is empty and you simply want the world to move.
        */}
        <div className="stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          <Button
            variant="primary"
            block
            onClick={advanceToNext}
            aria-disabled={upNext === undefined}
          >
            {upNext === undefined
              ? 'Nothing in the diary'
              : `Go to ${describeNext(entries, upNext)} — ${formatGameDay(upNext)}`}
          </Button>

          <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {ADVANCE_STEPS.map((step) => (
              <Button key={step.id} size="sm" variant="secondary" onClick={() => advance(step.days)}>
                {step.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/*
        What happened while time passed. An advance that stops early has to say so loudly, or
        the player believes a month went by when a fortnight did.
      */}
      {lastAdvance?.interrupted && (
        <Alert tone="warn" title="Something needs you">
          <span className="prose" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
            Time stopped on {formatGameDay(lastAdvance.day)}.{' '}
            {lastAdvance.waiting.length === 1
              ? lastAdvance.waiting[0]!.title
              : `${lastAdvance.waiting.length} things are waiting on a decision.`}
          </span>
          <Button variant="primary" onClick={() => navigate({ name: 'inbox' })}>
            Open the inbox
          </Button>
        </Alert>
      )}

      {lastAdvance && !lastAdvance.interrupted && lastAdvance.fights > 0 && (
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
          {lastAdvance.fights} fights happened across the sport while you waited.
        </p>
      )}

      <Segmented
        label="Whose diary"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'yours', label: 'Yours', hint: 'What you have to turn up to' },
          { value: 'all', label: 'The sport', hint: 'Everything scheduled anywhere' },
        ]}
      />

      {shown.length === 0 ? (
        <Empty title="Nothing scheduled">
          {filter === 'yours'
            ? 'Your diary is clear. Book something, or let time run and see what comes up.'
            : 'Nothing is on the books anywhere in the next few months.'}
        </Empty>
      ) : (
        <Card flush title={`Next ${HORIZON_DAYS} days`}>
          <div className="list">
            {shown.map((entry, i) => (
              <button
                key={`${entry.day}-${entry.kind}-${i}`}
                type="button"
                className="list__item"
                onClick={() => entry.link && navigate({ name: entry.link.route } as never)}
              >
                {/*
                  The date leads, because this is a calendar. Every other screen in the game
                  leads with a name.
                */}
                <span className="cal__when">
                  <span className="cal__date">{formatGameDay(entry.day)}</span>
                  <span className="cal__away">{describeGap(entry.day - world.day)}</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="list__primary" style={{ display: 'block' }}>
                    {entry.title}
                  </span>
                  {entry.detail && (
                    <span className="list__secondary" style={{ display: 'block' }}>
                      {entry.detail}
                    </span>
                  )}
                </span>
                <Chip tone={toneFor(entry)}>{labelFor(entry)}</Chip>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/** What the "go to next" button is actually going to. */
function describeNext(entries: readonly CalendarEntry[], day: number): string {
  const entry = entries.find((e) => e.day === day && e.ownership === 'yours');
  return entry ? entry.title.toLowerCase() : 'the next thing';
}

/** How far away, in the words a person uses. Never "in 37 days". */
function describeGap(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `${days} days`;
  if (days < 14) return 'next week';
  if (days < 31) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

const labelFor = (entry: CalendarEntry): string =>
  entry.kind === 'card'
    ? 'Card'
    : entry.kind === 'fight'
      ? 'Fight'
      : entry.kind === 'camp'
        ? 'Camp'
        : entry.kind === 'contract'
          ? 'Contract'
          : entry.kind === 'medical'
            ? 'Medical'
            : 'Roster';

const toneFor = (entry: CalendarEntry): 'accent' | 'info' | 'warning' | 'neutral' =>
  entry.ownership === 'world'
    ? 'neutral'
    : entry.kind === 'fight' || entry.kind === 'card'
      ? 'accent'
      : entry.kind === 'contract'
        ? 'warning'
        : 'info';
