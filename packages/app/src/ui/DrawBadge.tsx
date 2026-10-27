/**
 * How much a fighter sells, in one chip. Doc 34 C2.
 *
 * Built to sit on a matchmaking picker row as well as the fighter page — so it takes a precomputed
 * `DrawRead` or computes one, says the class and the trend in words for a screen reader and in a
 * glyph for the eye, and never shows the `starPower` number (see `business/starPower.ts`).
 *
 * `detail` adds the persona and the home-market note, for the places with room for them.
 */

import { drawRead, type DrawRead, type Fighter } from '@mmasim/engine';
import { Chip, type ChipTone } from './index';

const TONE: Readonly<Record<DrawRead['klass'], ChipTone>> = {
  headliner: 'accent',
  mainCard: 'positive',
  knownName: 'info',
  following: 'neutral',
  unknown: 'neutral',
};

export function DrawBadge({
  fighter,
  day,
  market,
  read,
  detail = false,
}: {
  fighter: Fighter;
  day: number;
  /** The country of the card being built, so a home fighter can say so. */
  market?: string;
  /** Pass one in when the caller already computed it, e.g. for a whole picker list. */
  read?: DrawRead;
  detail?: boolean;
}) {
  const r = read ?? drawRead(fighter, day, market);
  const name = `Draw: ${r.label}, ${r.trend.label.toLowerCase()}`;

  return (
    <span
      className="draw-badge"
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}
      title={`${r.blurb} ${r.trend.detail}`}
    >
      <Chip tone={TONE[r.klass]}>
        <span aria-hidden="true">★</span>
        <span className="visually-hidden">{name}</span>
        <span aria-hidden="true">
          {r.label} {r.trend.arrow}
        </span>
      </Chip>
      {detail && <Chip>{r.persona.label}</Chip>}
      {detail && r.atHome && <Chip tone="positive">Home fighter</Chip>}
    </span>
  );
}
