import type { ReactNode } from 'react';
import './Masthead.css';

/**
 * Characters past which a title is set a size down. A surname fills a phone at full size; a
 * promotion's name ("Gulf Coast Combat League") at that size runs to four lines.
 */
const LONG_TITLE = 12;

export interface MastheadFigure {
  value: ReactNode;
  label: string;
  /** The figure the masthead is about — the record on a fighter, cash on a promotion. One. */
  emphasis?: boolean;
}

/**
 * The slab a home screen leads with: who this is, in the mode's loudest voice.
 *
 * Every mode has one: the fight poster's black band with a name across it, the broadcast's
 * lower-third plate. They are the same object — an eyebrow, a name, a line of context, a few big
 * figures and an optional stamp — drawn on the `--ink` slab, so this component is written once and
 * the mode stylesheet decides whether it is printed at an angle or slid in from the side.
 *
 * The name is one heading. `eyebrow` and `title` are its two visual halves — first name and
 * nickname small, surname huge — but a screen reader hears the whole name once, in order.
 *
 * Nothing in a masthead is interactive. It is the state, not a control, and keeping it inert is
 * what lets a mode clip and rotate it without clipping a focus ring.
 */
export function Masthead({
  eyebrow,
  title,
  meta,
  figures = [],
  stamp,
  label,
  testId,
}: {
  /** The small line above the name: a first name and nickname, a tier. Part of the heading. */
  eyebrow?: ReactNode;
  /** The name, set huge. Keep it short; the display faces are built for one or two words. */
  title: ReactNode;
  /** A line of context under the name: division, age, nationality. */
  meta?: ReactNode;
  figures?: readonly MastheadFigure[];
  /** A short status, stamped on: "#1 contender", "Champion". */
  stamp?: ReactNode;
  /** Names the region for assistive tech, e.g. "Who you are". */
  label: string;
  testId?: string;
}) {
  return (
    <section className="masthead" aria-label={label} data-testid={testId}>
      <h2 className="masthead__name">
        {eyebrow !== undefined && (
          <>
            <span className="masthead__eyebrow">{eyebrow}</span>{' '}
          </>
        )}
        <span
          className="masthead__title"
          data-long={typeof title === 'string' && title.length > LONG_TITLE ? 'true' : undefined}
        >
          {title}
        </span>
      </h2>
      {meta !== undefined && <p className="masthead__meta">{meta}</p>}
      {figures.length > 0 && (
        <dl className="masthead__figures">
          {figures.map((figure) => (
            <div
              key={figure.label}
              className="masthead__figure"
              data-emphasis={figure.emphasis ? 'true' : undefined}
            >
              {/* Term before description, as a <dl> requires; the CSS puts the number on top. */}
              <dt className="masthead__figure-label">{figure.label}</dt>
              <dd className="masthead__figure-value numeric">{figure.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {stamp !== undefined && <p className="masthead__stamp">{stamp}</p>}
    </section>
  );
}
