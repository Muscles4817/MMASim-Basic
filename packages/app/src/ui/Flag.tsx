/**
 * A nationality, with its flag.
 *
 * Nationality was plain text on every screen that showed it, which made a roster of two hundred
 * names a wall of undifferentiated grey — the one attribute that could be recognised at a glance
 * was the one being rendered least distinctly.
 *
 * Emoji rather than an image set: nothing to ship, no request to make, and it scales with the
 * surrounding text automatically. `flagOf` returns an empty string for anything it does not
 * recognise, so an unknown country degrades to exactly what was there before rather than to a
 * broken glyph.
 *
 * The flag is `aria-hidden` and the country name is always rendered beside it. A flag emoji is
 * announced inconsistently between screen readers — some say the country, some say "flag", some
 * say nothing — and none of that is worth having when the name is right there.
 */

import { flagOf } from '@mmasim/engine';

export function Flag({
  nationality,
  showName = true,
}: {
  nationality: string;
  /** Off when the surrounding text already names the country. */
  showName?: boolean;
}) {
  const flag = flagOf(nationality);

  return (
    <span className="flag">
      {flag && (
        <span className="flag__glyph" aria-hidden="true">
          {flag}
        </span>
      )}
      {showName && <span>{nationality}</span>}
    </span>
  );
}
