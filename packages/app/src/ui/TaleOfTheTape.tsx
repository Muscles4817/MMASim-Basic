/**
 * The tale of the tape, shared by the fight screen and the matchmaking builder.
 */

import type { CSSProperties } from 'react';
import {
  careerSummary,
  careerSummaryBefore,
  displayName,
  fighterAge,
  getDivision,
  recordString,
  type Corner,
  type Fighter,
  type RecordSummary,
} from '@mmasim/engine';
import { Flag } from './index';
import './tape.css';

/**
 * The tale of the tape.
 *
 * Every number here was already on the fighter and none of it was ever put in front of the
 * player at the moment it means something — you decided how to fight this man on the camp
 * screen without being told he is four inches taller with five inches of reach on you.
 *
 * The advantage on each row is marked rather than left to be worked out. That is the whole
 * job of this table: a reach column both fighters can read as a number is a table; a reach
 * column that says *who is longer* is information.
 */
export function TaleOfTheTape({
  red,
  blue,
  day,
  boutId,
}: {
  red?: Fighter;
  blue?: Fighter;
  day: number;
  /*
    Which bout this is, so the records can be read as they stood before it.

    The night is settled before this screen mounts — see the module docstring, and it is the
    right design — but that means both fighters walk out to the cage carrying tonight's result
    already on their record. The tape said 12-3 for a fight nobody had watched, marked the edge
    on a streak that included it, and a knockout showed up in the finish column before the
    walkouts. It is the one screen in the game where "what the database knows" and "what has
    happened" are different things, and it has to say the second.

    Left out where there is no bout yet — the matchmaking builder comparing a pair it has not
    booked — and the records are read as they stand.
  */
  boutId?: string;
}) {
  if (!red || !blue) return null;

  const before = (f: Fighter) => (boutId ? careerSummaryBefore(f, boutId) : careerSummary(f));
  const redSummary = before(red);
  const blueSummary = before(blue);
  const finishes = (s: RecordSummary) => s.koWins + s.submissionWins;

  const rows: readonly {
    label: string;
    red: string;
    blue: string;
    /** Which corner the row favours, when a row can favour one. */
    edge?: Corner;
  }[] = [
    { label: 'Record', red: recordString(redSummary), blue: recordString(blueSummary) },
    /*
     * Age carries no edge marker on purpose. Height and reach are advantages in a way a
     * number of years is not — a 24-year-old is not ahead of a 30-year-old in their prime,
     * and marking one would be the screen asserting something the game does not believe.
     */
    { label: 'Age', red: `${fighterAge(red, day)}`, blue: `${fighterAge(blue, day)}` },
    {
      label: 'Height',
      red: inches(red.heightInches),
      blue: inches(blue.heightInches),
      edge: edgeOf(red.heightInches, blue.heightInches),
    },
    {
      // Plain inches, as every tale of the tape in the sport gives it. In feet and inches a
      // 70" reach renders 5′10″ — identical to the height directly above it, which reads as a
      // repeated row rather than as a second measurement.
      label: 'Reach',
      red: `${Math.round(red.reachInches)}″`,
      blue: `${Math.round(blue.reachInches)}″`,
      edge: edgeOf(red.reachInches, blue.reachInches),
    },
    { label: 'Stance', red: titleCase(red.stance), blue: titleCase(blue.stance) },
    /*
     * Only once somebody has one.
     *
     * Seeded fighters carry their career as a `priorRecord` of the form "15-1-0" — there is no
     * method breakdown behind it, so every fighter in the world reads 0 KO · 0 sub until they
     * finish somebody inside the simulation. A row of zeroes on both sides is not a fact about
     * these two fighters, it is a fact about the seed format, and putting it on the tale of the
     * tape would be stating it as the former.
     */
    ...(finishes(redSummary) + finishes(blueSummary) > 0
      ? [
          {
            label: 'Finishes',
            red: `${redSummary.koWins} KO · ${redSummary.submissionWins} sub`,
            blue: `${blueSummary.koWins} KO · ${blueSummary.submissionWins} sub`,
          },
        ]
      : []),
    {
      label: 'Form',
      red: streakWord(redSummary.streak),
      blue: streakWord(blueSummary.streak),
      edge: edgeOf(redSummary.streak, blueSummary.streak),
    },
  ];

  return (
    <div className="tape">
      <div className="tape__heads">
        <div className="tape__head tape__head--red">
          <span className="tape__corner">Red corner</span>
          <span className="tape__name">{displayName(red)}</span>
          <Flag nationality={red.nationality} />
        </div>
        <div className="tape__division">{getDivision(red.divisionId).shortName}</div>
        <div className="tape__head tape__head--blue">
          <span className="tape__corner">Blue corner</span>
          <span className="tape__name">{displayName(blue)}</span>
          <Flag nationality={blue.nationality} />
        </div>
      </div>

      <dl className="tape__rows">
        {rows.map((row, i) => (
          <div className="tape__row" key={row.label} style={{ '--i': i } as CSSProperties}>
            <dd className={`tape__value${row.edge === 'red' ? ' tape__value--edge' : ''}`}>
              <span className="visually-hidden">{`${displayName(red)}, ${row.label}: `}</span>
              {row.red}
            </dd>
            <dt className="tape__label">{row.label}</dt>
            <dd
              className={`tape__value tape__value--right${row.edge === 'blue' ? ' tape__value--edge' : ''}`}
            >
              <span className="visually-hidden">{`${displayName(blue)}, ${row.label}: `}</span>
              {row.blue}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const edgeOf = (redValue: number, blueValue: number): Corner | undefined =>
  redValue === blueValue ? undefined : redValue > blueValue ? 'red' : 'blue';

const inches = (n: number): string => `${Math.floor(n / 12)}′${Math.round(n % 12)}″`;

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function streakWord(streak: number): string {
  if (streak === 0) return 'Even';
  return streak > 0 ? `W${streak}` : `L${Math.abs(streak)}`;
}
