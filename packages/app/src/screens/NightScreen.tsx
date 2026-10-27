/**
 * The promoter's own fight night: the show, and the morning after.
 *
 * "Run the card" used to end on a profit figure above a list of pairings — no winner, no method,
 * no belt changing hands, and no row that could be opened. The single most important thing a
 * promoter does produced the least to look at in the mode.
 *
 * Two parts, built from the save rather than from the click that ran the night, so they read the
 * same straight after the run and a month later:
 *
 *  - **The show** (`NightShow`) reveals the card the way a night is watched: prelims first, the
 *    main event last, one result at a time, with what the night made and did to the buzz once the
 *    main event is in. It can be stepped, revealed in one go, or skipped, and it does not
 *    auto-play for anybody who has asked for reduced motion.
 *  - **The recap** (`NightRecap`) is what the night did: where the money came from, every result
 *    (each one opens the fight itself), and the bonuses the promoter hands out. The post-fight
 *    callouts follow once the voice module they are written in (C3) has landed.
 */

import { useEffect, useMemo, useState } from 'react';
import { displayName, type EventPlan, type FightNight } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip } from '../ui';
import { KeyStat } from '../ui/signals';
import { Ledger, LedgerRow, LedgerRule } from '../ui/console';
import { useToast } from '../ui/toast';
import { formatGameDay } from '../shell/Shell';
import { money } from '../ui/format';
import { positionLabel } from '../game/night';
import { hasTape } from '../game/broadcasts';
import {
  confirmAwards,
  nightResults,
  planName,
  weighInLines,
  type BoutResult,
} from '../game/plans';

/** How long each result holds before the next, when the show plays itself. */
const BEAT_MS = 1400;

const prefersReducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// --- The show ----------------------------------------------------------------------------------

export function NightShow({ plan, onDone }: { plan: EventPlan; onDone(): void }) {
  const { db } = useGame();
  const { navigate } = useRouter();
  // Running order: the prelims open the night and the main event closes it.
  const order = useMemo(() => [...nightResults(db, plan)].reverse(), [db, plan]);
  const night = nightOf(db, plan);
  const outcome = plan.outcome;
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const done = revealed >= order.length;

  useEffect(() => {
    if (!playing || done) return;
    const timer = setTimeout(() => setRevealed((n) => n + 1), BEAT_MS);
    return () => clearTimeout(timer);
  }, [playing, done, revealed]);

  const latest = revealed > 0 ? order[revealed - 1] : undefined;

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <p className="section-title">{planName(db, plan)}</p>
        <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
          {formatGameDay(plan.day)} · {night?.venue.name ?? plan.city}, {plan.city}
          {night?.attendance !== undefined && ` · ${night.attendance.toLocaleString()} in`}
        </p>
        {/*
          The money is a fact about the whole night, settled once at the end, so it is shown once
          the card has finished rather than ticked up bout by bout: an even share per fight would
          read like data, and the night was never settled that way.
        */}
        {outcome && done && (
          <div className="facts" style={{ marginTop: 'var(--space-3)' }}>
            <KeyStat
              value={money(outcome.profit)}
              label="The night"
              tone={outcome.profit >= 0 ? 'good' : 'bad'}
            />
            <KeyStat
              value={`${outcome.buzzDelta >= 0 ? '+' : ''}${outcome.buzzDelta.toFixed(1)}`}
              label="Buzz"
              tone={outcome.buzzDelta >= 0 ? 'good' : 'bad'}
            />
          </div>
        )}
        <div
          className="row"
          style={{ gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}
        >
          {!done && (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  setPlaying(false);
                  setRevealed((n) => n + 1);
                }}
              >
                {revealed === 0 ? 'First bout' : 'Next bout'}
              </Button>
              <Button onClick={() => setRevealed(order.length)}>Reveal all</Button>
            </>
          )}
          <Button variant={done ? 'primary' : 'ghost'} onClick={onDone}>
            {done ? 'The morning after' : 'Skip to the recap'}
          </Button>
        </div>
      </Card>

      {/* Each result is announced once, as it lands. */}
      <p className="visually-hidden" aria-live="polite">
        {latest ? resultSentence(latest) : ''}
      </p>

      <Card flush title="The card">
        <div className="list">
          {order.map((row, i) =>
            i < revealed ? (
              <ResultRow
                key={row.bout.boutId}
                row={row}
                onWatch={() => navigate({ name: 'fight', boutId: row.bout.boutId })}
              />
            ) : (
              <div key={row.bout.boutId} className="list__item" style={{ cursor: 'default' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="list__primary" style={{ display: 'block' }}>
                    {row.red ? displayName(row.red) : '?'} vs{' '}
                    {row.blue ? displayName(row.blue) : '?'}
                  </span>
                  <span className="list__secondary" style={{ display: 'block' }}>
                    {positionLabel(row.bout.position)} · still to come
                  </span>
                </span>
              </div>
            ),
          )}
        </div>
      </Card>
    </div>
  );
}

// --- The recap ---------------------------------------------------------------------------------

export function NightRecap({ plan, onDone }: { plan: EventPlan; onDone(): void }) {
  const { db, commit } = useGame();
  const { navigate } = useRouter();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const night = nightOf(db, plan);
  const results = useMemo(() => nightResults(db, plan), [db, plan, version]);
  const outcome = plan.outcome;
  const weighIns = weighInLines(db, plan);

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <p className="section-title">{planName(db, plan)}</p>
        <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
          {formatGameDay(plan.day)} · {plan.city}, {plan.country}
        </p>
        {outcome && (
          <KeyStat
            value={money(outcome.profit)}
            label={outcome.profit >= 0 ? 'The night made money' : 'The night lost money'}
            tone={outcome.profit >= 0 ? 'good' : 'bad'}
            detail={`${night?.attendance !== undefined ? `${night.attendance.toLocaleString()} in the building. ` : ''}${describeBuzz(outcome.buzzDelta)}`}
          />
        )}
        {/*
          The split as the night was settled, not recomputed: the economy is being reworked, and
          a recap that re-derived its own figures would disagree with the books the day it lands.
          The settlement carries sponsorship inside its broadcast figure, so the line says so; the
          cost is what the two earned less what the night made.
        */}
        {outcome?.gate !== undefined && (
          <Ledger>
            <LedgerRow label="Gate" value={money(outcome.gate)} />
            <LedgerRow label="Broadcast & sponsors" value={money(outcome.broadcast ?? 0)} />
            <LedgerRow
              label="Purses, bonuses and production"
              value={money(outcome.profit - outcome.gate - (outcome.broadcast ?? 0))}
            />
            <LedgerRule />
            <LedgerRow
              label="Result"
              value={money(outcome.profit)}
              tone={outcome.profit >= 0 ? 'good' : 'bad'}
            />
          </Ledger>
        )}
      </Card>

      {/* Doc 34 C6: a missed weight, and what was decided — including by default. */}
      {weighIns.length > 0 && (
        <Card title="Weigh-ins">
          {weighIns.map((line) => (
            <p key={line} className="prose" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
              {line}
            </p>
          ))}
        </Card>
      )}

      <Card flush title="Results">
        <div className="list">
          {results.map((row) => (
            <ResultRow
              key={row.bout.boutId}
              row={row}
              onWatch={() => navigate({ name: 'fight', boutId: row.bout.boutId })}
            />
          ))}
        </div>
      </Card>

      {night?.awards && (
        <Awards
          night={night}
          results={results}
          onConfirm={(picks) => {
            confirmAwards(db, night.id as string, picks);
            commit();
            setVersion((v) => v + 1);
            toast('Bonuses paid.', 'good');
          }}
        />
      )}

      <Button variant="primary" block onClick={onDone}>
        Back to the promotion
      </Button>
    </div>
  );
}

// --- Pieces ------------------------------------------------------------------------------------

function ResultRow({ row, onWatch }: { row: BoutResult; onWatch(): void }) {
  const loser = row.winner && (row.winner.id === row.red?.id ? row.blue : row.red);
  const watchable = hasTape(row.bout.boutId);
  const body = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="list__primary" style={{ display: 'block' }}>
          {row.winner && loser
            ? `${displayName(row.winner)} def. ${displayName(loser)}`
            : `${row.red ? displayName(row.red) : '?'} vs ${row.blue ? displayName(row.blue) : '?'}`}
        </span>
        <span className="list__secondary" style={{ display: 'block' }}>
          {positionLabel(row.bout.position)}
          {row.how && ` · ${row.how}`}
        </span>
      </span>
      <span className="row" style={{ gap: 'var(--space-1)', flexWrap: 'wrap' }}>
        {row.title === 'won' && <Chip tone="accent">New champion</Chip>}
        {row.title === 'defended' && <Chip tone="accent">Retains the belt</Chip>}
        {row.fightOfTheNight && <Chip tone="positive">Fight of the Night</Chip>}
        {(row.performance ?? []).length > 0 && <Chip tone="positive">Performance</Chip>}
        {watchable && <Chip tone="info">Watch</Chip>}
      </span>
    </>
  );

  // Every result opens the fight, while its tape is still in this session.
  return watchable ? (
    <button type="button" className="list__item" onClick={onWatch}>
      {body}
    </button>
  ) : (
    <div className="list__item" style={{ cursor: 'default' }}>
      {body}
    </div>
  );
}

/**
 * Fight and Performance of the Night, the promoter's call.
 *
 * Opens on the matchmaker's suggestion so a player who agrees confirms in one tap; anything left
 * unconfirmed stands as suggested once the clock moves.
 */
function Awards({
  night,
  results,
  onConfirm,
}: {
  night: FightNight;
  results: readonly BoutResult[];
  onConfirm(picks: { fightOfTheNight?: string; performanceOfTheNight: string[] }): void;
}) {
  const awards = night.awards!;
  const [fight, setFight] = useState<string | undefined>(awards.fightOfTheNight);
  const [performers, setPerformers] = useState<string[]>([
    ...(awards.performanceOfTheNight as readonly string[]),
  ]);

  if (!awards.pending) {
    const fotn = results.find((r) => r.fightOfTheNight);
    const names = results.flatMap((r) =>
      [r.red, r.blue].filter((f) => f && (r.performance ?? []).includes(f.id as string)),
    );
    return (
      <Card title="Bonuses">
        <p className="prose" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
          {fotn ? `Fight of the Night: ${matchup(fotn)}. ` : ''}
          {names.length > 0
            ? `Performance of the Night: ${names.map((f) => displayName(f!)).join(' and ')}. `
            : ''}
          {money(awards.perAward)} each.
        </p>
      </Card>
    );
  }

  const winners = results.filter((r) => r.winner);
  return (
    <Card title="Hand out the bonuses">
      <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 0 }}>
        {money(awards.perAward)} to each fighter. One fight for Fight of the Night, up to two
        winners for Performance. The matchmaker&rsquo;s picks are ticked; they stand if you leave
        it.
      </p>
      <fieldset className="stack" style={{ border: 0, padding: 0, gap: 'var(--space-1)' }}>
        <legend className="section-title">Fight of the Night</legend>
        {results.map((r) => (
          <label key={r.bout.boutId} className="row" style={{ gap: 'var(--space-2)' }}>
            <input
              type="radio"
              name="fotn"
              checked={fight === r.bout.boutId}
              onChange={() => setFight(r.bout.boutId)}
            />
            <span>{matchup(r)}</span>
          </label>
        ))}
      </fieldset>
      <fieldset
        className="stack"
        style={{ border: 0, padding: 0, gap: 'var(--space-1)', marginTop: 'var(--space-3)' }}
      >
        <legend className="section-title">Performance of the Night</legend>
        {winners.map((r) => {
          const id = r.winner!.id as string;
          const checked = performers.includes(id);
          return (
            <label key={id} className="row" style={{ gap: 'var(--space-2)' }}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && performers.length >= 2}
                onChange={() =>
                  setPerformers((p) => (checked ? p.filter((x) => x !== id) : [...p, id]))
                }
              />
              <span>
                {displayName(r.winner!)} <span className="faint">· {r.how}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <Button
        variant="primary"
        block
        onClick={() => onConfirm({ fightOfTheNight: fight, performanceOfTheNight: performers })}
      >
        Pay the bonuses
      </Button>
    </Card>
  );
}

const nightOf = (db: ReturnType<typeof useGame>['db'], plan: EventPlan): FightNight | undefined =>
  plan.nightId ? (db.events.findById(plan.nightId) as FightNight | undefined) : undefined;

const matchup = (r: BoutResult): string =>
  `${r.red ? displayName(r.red) : '?'} vs ${r.blue ? displayName(r.blue) : '?'}`;

const resultSentence = (r: BoutResult): string => {
  const loser = r.winner && (r.winner.id === r.red?.id ? r.blue : r.red);
  const belt = r.title === 'won' ? ' New champion.' : r.title === 'defended' ? ' Retains.' : '';
  return r.winner && loser
    ? `${displayName(r.winner)} beats ${displayName(loser)} ${r.how}.${belt}`
    : `${matchup(r)} ends ${r.how}.`;
};

export const describeBuzz = (delta: number): string =>
  delta > 0.5
    ? 'People are talking about it.'
    : delta < -0.5
      ? 'It did not land.'
      : 'About what people expected of you.';
