/**
 * Health and the calendar, on the screen a player actually looks at.
 *
 * Both halves of this were previously reachable only from the training screen: a carried injury
 * was announced in an alert three taps down, and the only control in the game that returned
 * freshness was a button underneath a camp form, labelled as a training option and sharing its
 * length picker. So the two facts that decide when a fighter should take a fight — am I hurt, and
 * am I recovered — lived behind the screen you go to when you have already decided to train.
 *
 * They belong on the hub, and they belong together, because the answer to one is usually the
 * other.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  INJURY_META,
  INTENSITY_META,
  activeInjuries,
  campRiskBreakdown,
  describeFreshness,
  describeInjury,
  freshnessOf,
  riskBand,
  weeksUntilFit,
  ATTRIBUTE_META,
  type AttributeKey,
  type Fighter,
  type TrainingIntensity,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip } from '../ui';
import { Alert } from '../ui/signals';
import { REST_STEPS } from '../game/clock';
import { daysUntilFit, restDays, type RestOutcome } from '../game/progression';
import { formatGameDay } from '../shell/Shell';

/**
 * What you are carrying, said on the front page.
 *
 * Renders nothing when the fighter is fit — a permanent "you are healthy" panel is a panel the
 * player learns to stop reading, which is exactly the state you need them reading it in.
 */
export function InjuryStatus({
  fighter,
  day,
  onRest,
}: {
  fighter: Fighter;
  day: number;
  onRest?(): void;
}) {
  const carrying = activeInjuries(fighter.injuries ?? [], day);
  if (carrying.length === 0) return null;

  const weeks = weeksUntilFit(carrying, day);
  const worst = carrying.reduce((a, b) => (a.severity >= b.severity ? a : b));

  /*
   * What it is actually doing to you, named attribute by attribute.
   *
   * `injuredAttributes` applies these silently at fight time and tells nobody, which is the right
   * design for what an *opponent* knows and the wrong one for what a fighter knows about their own
   * body. You are aware your hand is broken.
   */
  const suppressed = new Map<AttributeKey, number>();
  for (const injury of carrying) {
    for (const [key, fraction] of Object.entries(INJURY_META[injury.type].suppresses) as [
      AttributeKey,
      number,
    ][]) {
      const cost = fraction * injury.severity;
      suppressed.set(key, Math.max(suppressed.get(key) ?? 0, cost));
    }
  }

  const worstFirst = [...suppressed.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, cost]) => cost >= 0.03)
    .slice(0, 4);

  return (
    <Alert
      tone={worst.severity > 0.55 ? 'danger' : 'warn'}
      title={
        carrying.length === 1
          ? `You are hurt — ${weeks} week${weeks === 1 ? '' : 's'} until you are fit`
          : `You are carrying ${carrying.length} injuries — ${weeks} week${weeks === 1 ? '' : 's'} until you are fit`
      }
    >
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        {carrying.map((injury) => (
          <p key={injury.id} className="prose" style={{ fontSize: 'var(--text-sm)' }}>
            {describeInjury(injury, day)}
          </p>
        ))}

        {worstFirst.length > 0 && (
          <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
            <strong>Fighting like this costs you</strong>{' '}
            {worstFirst
              .map(
                ([key, cost]) =>
                  `${ATTRIBUTE_META[key].label.toLowerCase()} (−${Math.round(cost * 100)}%)`,
              )
              .join(', ')}
            . Nobody outside your camp knows, and your opponent will not be told.
          </p>
        )}

        {onRest && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button size="sm" variant="primary" onClick={onRest}>
              Rest until fit
            </Button>
          </div>
        )}
      </div>
    </Alert>
  );
}

/** How many frames the tick is allowed, and how long each one lasts. */
const MAX_FRAMES = 20;
const FRAME_MS = 45;

/**
 * Sitting out, one day at a time.
 *
 * The complaint this answers is precise: freshness "jumps massively every time", because every
 * control that moved the clock consumed four weeks or more in a single press. A number that only
 * ever appears at its start and its end reads as invented, and a resource the player does not
 * believe in is one they will not plan around.
 *
 * So the block is walked rather than jumped. The values are not an animation of the result — they
 * are the model, taken from the same per-day recovery rate `applyAgeing` charges once over the
 * span (see `PlayerElapsed.recoveryPerDay`), which is what makes the walk and the jump agree.
 */
export function RestCard({
  fighter,
  /** Fight night, when there is one. Rest may not run past it. */
  fightDay,
}: {
  fighter: Fighter;
  fightDay?: number;
}) {
  const { db, world, commit } = useGame();
  const { navigate } = useRouter();
  const [outcome, setOutcome] = useState<RestOutcome | undefined>();
  const [cursor, setCursor] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const freshness = freshnessOf(fighter);
  const toFit = daysUntilFit(fighter, world.day);
  const daysToFight = fightDay === undefined ? undefined : Math.max(0, fightDay - world.day);

  /*
   * The tick.
   *
   * Frame-capped rather than day-capped: eight weeks off should not take four seconds to watch,
   * and three days off should not be over before the eye lands on it. The last frame is always
   * the last day, so the readout can never settle on a value the fighter did not end on.
   */
  const frames = useMemo(() => {
    if (!outcome || outcome.timeline.length === 0) return [];
    const timeline = outcome.timeline;
    const stride = Math.max(1, Math.ceil(timeline.length / MAX_FRAMES));
    const picked = timeline.filter((_, i) => i % stride === 0);
    if (picked[picked.length - 1] !== timeline[timeline.length - 1]) {
      picked.push(timeline[timeline.length - 1]!);
    }
    return picked;
  }, [outcome]);

  useEffect(() => {
    if (frames.length === 0) return;
    setCursor(0);
    timer.current = setInterval(() => {
      setCursor((c) => {
        if (c >= frames.length - 1) {
          clearInterval(timer.current);
          return c;
        }
        return c + 1;
      });
    }, FRAME_MS);
    return () => clearInterval(timer.current);
  }, [frames]);

  const rest = (days: number) => {
    if (days <= 0) return;
    setOutcome(restDays(db, fighter, days));
    commit();
  };

  const showing = frames[Math.min(cursor, Math.max(0, frames.length - 1))];
  const running = frames.length > 0 && cursor < frames.length - 1;
  const shownFreshness = showing?.freshness ?? freshness;
  const shownDay = showing?.day ?? world.day;

  return (
    <Card title="Rest and recovery">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>
          <span
            data-testid="rest-day"
            style={{ fontSize: 'var(--text-xl)', fontWeight: 800, display: 'block' }}
          >
            {formatGameDay(shownDay)}
          </span>
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            {running ? 'Days are passing…' : 'Today'}
          </span>
        </span>
        <span style={{ textAlign: 'right' }}>
          <span
            className="numeric"
            data-testid="rest-freshness"
            style={{ fontSize: 'var(--text-xl)', fontWeight: 800, display: 'block' }}
          >
            {Math.round(shownFreshness)}
          </span>
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            {describeFreshness(shownFreshness)}
          </span>
        </span>
      </div>

      {/*
        The bar is the point of the whole card. Freshness used to exist only as two numbers, one
        before a four-week press and one after it, and a player has no way to tell a system that
        accrues from one that is being decided for them each time they look.
      */}
      <div
        className="freshness-track"
        role="img"
        aria-label={`Freshness ${Math.round(shownFreshness)} of 100`}
      >
        <div className="freshness-track__fill" style={{ width: `${shownFreshness}%` }} />
      </div>

      <p
        className="muted prose"
        style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}
      >
        Time off gives freshness back, heals what you are carrying, and lets sharpness bleed away
        if you take too much of it. A fresh body is also a harder one to injure — how recovered you
        are is the biggest thing you can still change about your next camp.
      </p>

      <div
        className="row"
        style={{ flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}
      >
        {REST_STEPS.map((step) => {
          // Rest may not walk past a booked fight. The training screen learned this the hard
          // way — see its `overrunsFight` guard, which was added for exactly one of its two
          // buttons and then needed adding for the other.
          const overruns = daysToFight !== undefined && step.days > daysToFight;
          return (
            <Button
              key={step.id}
              size="sm"
              variant="secondary"
              aria-disabled={overruns || running}
              onClick={() => !overruns && !running && rest(step.days)}
            >
              {step.label}
            </Button>
          );
        })}
        {toFit > 0 && (
          <Button
            size="sm"
            variant="primary"
            aria-disabled={
              running || (daysToFight !== undefined && toFit > daysToFight)
            }
            onClick={() => !running && rest(toFit)}
          >
            Until fit ({Math.ceil(toFit / 7)}w)
          </Button>
        )}
      </div>

      {daysToFight !== undefined && (
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
          You fight in {daysToFight} day{daysToFight === 1 ? '' : 's'}. Nothing here will run past
          fight night.
        </p>
      )}

      {outcome && (
        <div
          className="stack"
          style={{
            gap: 'var(--space-2)',
            marginTop: 'var(--space-3)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--border)',
          }}
          data-testid="rest-summary"
        >
          <p style={{ fontWeight: 700 }}>
            {outcome.days} day{outcome.days === 1 ? '' : 's'} off · freshness{' '}
            {Math.round(outcome.freshnessBefore)} → {Math.round(outcome.freshnessAfter)}
          </p>
          {outcome.notes.map((note) => (
            <p key={note} className="prose" style={{ fontSize: 'var(--text-sm)' }}>
              {note}
            </p>
          ))}
          {outcome.weeksToFit > 0 && (
            <Chip tone="warning">
              Still {outcome.weeksToFit} week{outcome.weeksToFit === 1 ? '' : 's'} from fit
            </Chip>
          )}
          {outcome.interrupted && (
            <Alert tone="warn" title="Something needs you">
              <span className="prose" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                Time stopped on {formatGameDay(outcome.to)}.{' '}
                {outcome.waiting.length === 1
                  ? outcome.waiting[0]!.title
                  : `${outcome.waiting.length} things are waiting on a decision.`}
              </span>
              <Button size="sm" variant="primary" onClick={() => navigate({ name: 'inbox' })}>
                Open the inbox
              </Button>
            </Alert>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * What this block is likely to cost you, before you commit to it.
 *
 * The complaint this answers is "I get a lot of injuries and it is not clear how, if at all, I am
 * meant to avoid them" — and it was a fair reading of the game rather than of the model. The
 * hazard has always been a product of six terms, three of which the player decides, and **not one
 * of them was ever shown**: the roll happened inside the camp, the result arrived as a sentence in
 * the report, and nothing anywhere connected the two. A risk you cannot see is indistinguishable
 * from a random punishment.
 *
 * So the number is stated, the terms are taken apart, and the movable ones are named separately
 * from the ones that are simply facts about the fighter. Being 37 is worth knowing and is not
 * advice; being flat is both.
 */
export function InjuryRisk({
  fighter,
  day,
  weeks,
  intensity,
  intensityLabel = 'Camp intensity',
}: {
  fighter: Fighter;
  day: number;
  weeks: number;
  intensity: TrainingIntensity;
  intensityLabel?: string;
}) {
  const risk = campRiskBreakdown(
    fighter,
    weeks,
    day,
    INTENSITY_META[intensity].injury,
    intensityLabel,
  );
  const band = riskBand(risk.chance);
  const tone = band === 'low' ? 'positive' : band === 'fair' ? 'neutral' : band === 'high' ? 'warning' : 'negative';

  // Worth naming, not worth listing: four terms is a table and a table is not read. The ones
  // that survive are the ones actually moving the number.
  const notable = risk.drivers.filter((d) => d.factor >= 1.15 || d.factor <= 0.85).slice(0, 3);

  return (
    <div data-testid="injury-risk">
      <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <span style={{ fontWeight: 700 }}>Injury risk over this block</span>
        <Chip tone={tone}>
          {(risk.chance * 100).toFixed(0)}% · {band}
        </Chip>
      </div>

      {notable.length > 0 && (
        <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
          {notable
            .map(
              (d) =>
                `${d.label} ${d.factor > 1 ? 'raises' : 'lowers'} it (×${d.factor.toFixed(2)})`,
            )
            .join(', ')}
          .
        </p>
      )}

      <p className="prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
        {risk.advice}
      </p>
    </div>
  );
}
