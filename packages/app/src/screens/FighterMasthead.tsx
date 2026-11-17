/**
 * A fighter, as a masthead.
 *
 * The career hub and the fighter page both lead with the same object — a name across the slab,
 * the record in the accent, where they stand — and wrote it twice, slightly differently, which is
 * how the hub and the profile came to disagree about whether a fighter has an overall rating. One
 * composition of `ui/Masthead`, used by both.
 *
 * It renders in whatever voice the current mode speaks: the same fighter is a poster in their own
 * career and a broadcast plate on a promoter's roster, and this file does not know which.
 */

import { fighterAge, recordString, type Fighter } from '@mmasim/engine';
import { Flag } from '../ui';
import { Icon } from '../ui/icons';
import { Masthead, type MastheadFigure } from '../ui/Masthead';
import type { LadderStatus } from '../game/progression';

export function FighterMasthead({
  fighter,
  divisionName,
  day,
  ladder,
  label,
  extra,
  testId,
}: {
  fighter: Fighter;
  divisionName: string;
  day: number;
  ladder: LadderStatus | undefined;
  /** Names the region for assistive tech: "Who you are" on your own hub. */
  label: string;
  /** One more fact for the context line, e.g. stance on the profile. */
  extra?: string;
  testId?: string;
}) {
  const streak = fighter.summary.streak;

  const figures: MastheadFigure[] = [
    // The record is what a career *is*, and the one number here that earns the accent.
    { value: recordString(fighter.summary), label: 'Professional record', emphasis: true },
  ];
  if (streak !== 0) {
    figures.push({ value: streak > 0 ? `W${streak}` : `L${-streak}`, label: 'Streak' });
  }
  // A champion's standing is the stamp, not a figure — "C / Champion" beside a "Champion" stamp
  // said the one thing twice.
  if (!ladder?.isChampion && ladder?.position !== undefined) {
    figures.push({ value: `#${ladder.position}`, label: `Of ${ladder.ranked.length}` });
  }

  /*
   * The stamp: what a fight poster would print across the corner. Only the two states worth
   * stamping — a belt, and being next in line — so it means something when it appears.
   */
  const stamp = ladder?.isChampion ? (
    <>
      <Icon name="champion" /> Champion
    </>
  ) : ladder?.position === 1 ? (
    '#1 contender'
  ) : undefined;

  return (
    <Masthead
      label={label}
      testId={testId}
      eyebrow={fighter.nickname ? `${fighter.firstName} “${fighter.nickname}”` : fighter.firstName}
      title={fighter.lastName}
      meta={
        <>
          {divisionName} · {fighterAge(fighter, day)} · <Flag nationality={fighter.nationality} />
          {extra && <> · {extra}</>}
        </>
      }
      figures={figures}
      stamp={stamp}
    />
  );
}
