/**
 * The signal vocabulary.
 *
 * The problem this solves: a screen where every number is the same size, the same weight and
 * the same colour makes the player do the sorting. They should not have to. Nothing on a
 * screen is neutral — it is either the thing to act on, the context for that thing, or
 * detail — and the design has to say which.
 *
 * Three rules, applied everywhere:
 *
 *  1. **Three tiers, visibly different.** Primary information is large, coloured and
 *     iconed. Secondary is plain. Tertiary is muted and small. If everything is emphasised,
 *     nothing is.
 *
 *  2. **Never colour alone.** Every colour-coded signal also carries a glyph and a word.
 *     Roughly one man in twelve cannot separate the reds from the greens, and a greyscale
 *     screen or a screen reader has no colour at all.
 *
 *  3. **Say what it means, not what it is.** "Ranked #2" beats "Rank: 2". "Wins with power"
 *     beats "Power: 88". The number stays available for the player who wants it.
 */

import type { ReactNode } from 'react';
import {
  ATTRIBUTE_META,
  ratingBand,
  toRating,
  type AttributeKey,
  type Attributes,
  type FinishMethod,
  type Rating,
} from '@mmasim/engine';
import { isDecisionMethod, isKoMethod } from '@mmasim/engine';
import { bandColour } from './index';
import './signals.css';

// --- Icons -------------------------------------------------------------------------------
//
// A small, fixed vocabulary. Emoji rather than an icon font because they need no asset
// pipeline, render everywhere, and scale with the text — and because every one of them is
// always paired with a word, so their exact rendering never carries meaning on its own.

export const ICON = {
  champion: '🏆',
  titleFight: '🏆',
  knockout: '💥',
  submission: '🔒',
  decision: '📋',
  draw: '🤝',
  streak: '🔥',
  skid: '🧊',
  injury: '🩹',
  trauma: '🧠',
  rising: '▲',
  falling: '▼',
  level: '■',
  star: '★',
  camp: '🥊',
  training: '📈',
  warning: '⚠️',
  /** Confirmation and information. A green ▲ meant nothing for either. */
  success: '✓',
  info: 'ℹ️',
  locked: '🔒',
  time: '⏱',
} as const;

export type IconName = keyof typeof ICON;

/** An icon that is always decorative — the adjacent text carries the meaning. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      {ICON[name]}
    </span>
  );
}

// --- Emphasis tiers ------------------------------------------------------------------------

export type Emphasis = 'primary' | 'secondary' | 'tertiary';

/**
 * The one thing on a screen the player should read first.
 *
 * There should be at most one per card, and often none. A `KeyStat` next to another
 * `KeyStat` of equal weight is the failure this component exists to prevent, so the tone is
 * required rather than optional — you have to decide what it means.
 */
export function KeyStat({
  value,
  label,
  detail,
  icon,
  tone = 'neutral',
}: {
  value: ReactNode;
  label: string;
  detail?: ReactNode;
  icon?: IconName;
  tone?: 'neutral' | 'good' | 'bad' | 'accent';
}) {
  return (
    <div className={`keystat keystat--${tone}`}>
      <span className="keystat__value">
        {icon && <Icon name={icon} className="keystat__icon" />}
        {value}
      </span>
      <span className="keystat__label">{label}</span>
      {detail && <span className="keystat__detail">{detail}</span>}
    </div>
  );
}

/**
 * A labelled fact with an explicit tier.
 *
 * The alternative — a wall of `<Stat>`s — makes the player scan fifteen equally-loud numbers
 * to find the two that matter.
 */
export function Fact({
  label,
  value,
  emphasis = 'secondary',
  tone,
  icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  emphasis?: Emphasis;
  tone?: 'good' | 'bad' | 'warn';
  icon?: IconName;
  hint?: string;
}) {
  return (
    /*
     * The hint is on the page, not in a `title`.
     *
     * It used to be `title={hint}` plus a visually-hidden copy, which reaches a pointer and a
     * screen reader and never a phone — and this is the game's own teaching material. It
     * silently blanked the explanations behind Star power, Bank, Reputation and Purse, which
     * are exactly the numbers a new player has no way to interpret. `RatingRow` already
     * renders its hint visibly; this is the same fix.
     */
    <div className={`fact fact--${emphasis}${tone ? ` fact--${tone}` : ''}`}>
      <span className="fact__label">
        {icon && <Icon name={icon} />} {label}
      </span>
      <span className="fact__value">{value}</span>
      {hint && <span className="fact__hint">{hint}</span>}
    </div>
  );
}

// --- Outcome and trend ----------------------------------------------------------------------

/** How a fight ended, as a glyph, a colour and a word. */
export function MethodBadge({ method, compact }: { method: FinishMethod; compact?: boolean }) {
  const spec = isKoMethod(method)
    ? { icon: 'knockout' as const, label: method === 'ko' ? 'Knockout' : 'TKO', tone: 'ko' }
    : method === 'submission'
      ? { icon: 'submission' as const, label: 'Submission', tone: 'sub' }
      : isDecisionMethod(method)
        ? { icon: 'decision' as const, label: 'Decision', tone: 'dec' }
        : { icon: 'draw' as const, label: 'Draw', tone: 'draw' };

  return (
    <span className={`method method--${spec.tone}`}>
      <Icon name={spec.icon} />
      <span className={compact ? 'visually-hidden' : undefined}>{spec.label}</span>
    </span>
  );
}

/** A run of results, as direction plus magnitude. */
export function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null;
  const winning = streak > 0;
  return (
    <span className={`streak streak--${winning ? 'win' : 'loss'}`}>
      <Icon name={winning ? 'streak' : 'skid'} />
      {Math.abs(streak)} {winning ? 'straight wins' : 'straight losses'}
    </span>
  );
}

/** Movement, for anything that can go up or down between visits. */
export function Trend({ delta, unit = '' }: { delta: number; unit?: string }) {
  const direction = delta > 0.05 ? 'rising' : delta < -0.05 ? 'falling' : 'level';
  const word = direction === 'rising' ? 'up' : direction === 'falling' ? 'down' : 'unchanged';
  return (
    <span className={`trend trend--${direction}`}>
      <Icon name={direction} />
      <span className="visually-hidden">{word} </span>
      {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${unit}`}
    </span>
  );
}

// --- Reading a fighter at a glance ----------------------------------------------------------

export interface AttributeCall {
  key: AttributeKey;
  value: Rating;
}

/**
 * The two or three things that actually decide a fighter's fights.
 *
 * Fifteen bars of equal weight tell a player nothing they can act on. What they need to know
 * is "elite wrestling, no chin" — so the profile leads with that and keeps the full block
 * below for anyone who wants it.
 */
export function readFighter(attributes: Attributes, count = 3): {
  strengths: AttributeCall[];
  weaknesses: AttributeCall[];
} {
  const all = (Object.keys(attributes) as AttributeKey[]).map((key) => ({
    key,
    value: attributes[key],
  }));
  const sorted = [...all].sort((a, b) => b.value - a.value);
  return {
    strengths: sorted.slice(0, count),
    // Only genuinely poor attributes count as weaknesses — a lowest-of-fifteen at 72 is not
    // a hole, and calling it one would teach the player to distrust the label.
    weaknesses: sorted
      .slice(-count)
      .reverse()
      .filter((a) => a.value < 62),
  };
}

/** One attribute, named and colour-coded by band. */
export function AttributeBadge({
  call,
  kind,
}: {
  call: AttributeCall;
  kind: 'strength' | 'weakness';
}) {
  const band = ratingBand(call.value);
  const meta = ATTRIBUTE_META[call.key];
  return (
    <span
      className={`attr-badge attr-badge--${kind}`}
      style={{ '--band': bandColour(call.value) } as React.CSSProperties}
      title={`${meta.label} ${call.value} — ${band.label}. ${meta.blurb}`}
    >
      <span className="attr-badge__name">{meta.label}</span>
      <span className="attr-badge__value">{call.value}</span>
      <span className="visually-hidden">, {band.label}</span>
    </span>
  );
}

/** Strengths and weaknesses as a single scannable line. */
export function FighterRead({ attributes }: { attributes: Attributes }) {
  const { strengths, weaknesses } = readFighter(attributes);
  return (
    <div className="fighter-read">
      <div className="fighter-read__group">
        <span className="fighter-read__caption">Wins with</span>
        <span className="fighter-read__badges">
          {strengths.map((call) => (
            <AttributeBadge key={call.key} call={call} kind="strength" />
          ))}
        </span>
      </div>
      {weaknesses.length > 0 && (
        <div className="fighter-read__group">
          <span className="fighter-read__caption">Vulnerable to</span>
          <span className="fighter-read__badges">
            {weaknesses.map((call) => (
              <AttributeBadge key={call.key} call={call} kind="weakness" />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

// --- Alerts ----------------------------------------------------------------------------------

/**
 * Something the player needs to know before they act.
 *
 * Deliberately louder than a chip and quieter than a modal. Used for the things that change
 * a decision: accumulated damage before booking a fight, a compromised camp, a save that did
 * not persist.
 */
export function Alert({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'danger' | 'good';
  title: string;
  children?: ReactNode;
}) {
  const icon: IconName =
    tone === 'danger' || tone === 'warn' ? 'warning' : tone === 'good' ? 'success' : 'info';

  // `alert` interrupts, which is right for a failure and wrong for everything else — but
  // `warn` and `good` were previously given no role at all, so a compromised camp, a carried
  // injury and every editor warning were silent to assistive tech.
  const role = tone === 'danger' ? 'alert' : 'status';

  return (
    <div className={`alert alert--${tone}`} role={role}>
      <span className="alert__icon">
        <Icon name={icon} />
      </span>
      {/*
        `div`, not `span`. Callers legitimately pass paragraphs, lists and buttons into an
        alert, and a `<p>` inside a `<span>` is invalid nesting the browser silently repairs
        by closing the span early — which moves the content out of the styled body and, in the
        worst case, out of the element carrying the role. It rendered acceptably by luck, and
        it was a trap for the next caller.
      */}
      <div>
        <strong className="alert__title">{title}</strong>
        {children && <div className="alert__body">{children}</div>}
      </div>
    </div>
  );
}

/**
 * A fighter's overall rating, with the band word beside it.
 *
 * The number was previously band-*coloured* and nothing else, on both the roster and the
 * rankings — so "elite versus average", the single most scanned fact on those screens, was
 * carried purely by hue. `RatingRow` had always done this correctly; these two had quietly
 * dropped the half that makes it work.
 *
 * Three channels: the number, the band word, and the colour. Any two can fail.
 */
export function OverallRating({ rating }: { rating: number }) {
  const value = Math.round(rating);
  const band = ratingBand(toRating(value));

  return (
    <span className="overall" title={`Overall rating — ${band.label}`}>
      <span className="visually-hidden">{`Overall rating ${value}, ${band.label}`}</span>
      <span className="overall__value numeric" aria-hidden="true" style={{ color: bandColour(value) }}>
        {value}
      </span>
      <span className="overall__band" aria-hidden="true">
        {band.short}
      </span>
    </span>
  );
}
