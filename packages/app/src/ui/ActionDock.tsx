import type { ReactNode } from 'react';
import './ActionDock.css';

/**
 * The one decision a screen is asking for, within reach of the thumb.
 *
 * Every mode's home screen has a single dominant action — the career hub computes it from the
 * situation model, the promotion dashboard from the attention list — and on a phone the worst
 * place for it is wherever the content happens to put it. This docks it above the tab bar, in
 * the bottom third of the screen the thumb reaches without a grip change, and says in a word why
 * it is the one on offer.
 *
 * On a wide screen the decision is already on screen beside everything else, so the dock settles
 * into the flow at the foot of the page rather than floating a strip of chrome over a page that
 * does not need it.
 *
 * One per screen. A second dock is a second primary action, which is the failure the dashboards
 * were rebuilt to remove.
 *
 * Its look is the mode's: `.action-dock` reads the voice tokens and the slab, so the poster gets a
 * printed red bar and the studio a gold plate without this component knowing either exists.
 */
export function ActionDock({
  why,
  children,
  testId,
}: {
  /** A short name for the reason this action leads: "Injury", "Title shot". Not a sentence. */
  why?: ReactNode;
  /** The action itself — normally one primary `Button`. */
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="action-dock" data-testid={testId}>
      <div className="action-dock__inner">
        {why !== undefined && <span className="action-dock__why">{why}</span>}
        {children}
      </div>
    </div>
  );
}
