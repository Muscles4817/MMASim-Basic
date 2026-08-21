/**
 * Responsive layout primitives.
 *
 * The audit's finding these answer (doc 32 § 1.6): every desktop breakpoint in the app lived in
 * one file, `console.css`, written for one mode. Everything else was a 56rem column with a rail
 * beside it, so a 1920px display showed 896px of content and 800px of nothing while the page ran
 * to eight viewport heights.
 *
 * The rule these encode is doc 32 § 7's: **a phone is not a narrower desktop.** Every primitive
 * here is additive at a breakpoint — the mobile rendering is the source order, and the wide
 * rendering places things rather than reordering them. Nothing below needs a media query to
 * *undo* a rule set above it, which is what keeps the reading order and the visual order
 * identical at every width.
 *
 * `Console` — the two-column work/context split — already existed and stays where it is, in
 * `console.tsx`, with the rest of the vocabulary it was written alongside.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import './layout.css';

// --- Grid ---------------------------------------------------------------------------------------

/**
 * A twelve-column grid, above 62rem only.
 *
 * Below that it is a single column and the `span` props do nothing, which is deliberate: a
 * six-column region on a phone is a three-word line. Twelve because it divides by 2, 3 and 4,
 * which covers every split the game actually wants.
 */
export function Grid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid ${className}`.trim()}>{children}</div>;
}

/**
 * One region of a `Grid`.
 *
 * `span` is the desktop width in columns. `sticky` pins the region while its siblings scroll —
 * for standing context that you would otherwise have to scroll back up for.
 */
export function GridCell({
  span,
  sticky,
  children,
  className = '',
}: {
  span: number;
  sticky?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid__cell${sticky ? ' grid__cell--sticky' : ''} ${className}`.trim()}
      style={{ '--span': span } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

// --- Panel --------------------------------------------------------------------------------------

/**
 * A region inside a console column.
 *
 * The middle container the app did not have. `Card` draws a border and a background and says
 * "this is a discrete thing"; bare markup says "this is not a container at all". Between them
 * sits the common case — a titled region inside a column that is already a container — and
 * every screen was reaching for `Card` and getting fourteen borders deep.
 *
 * A rule and a title, no box.
 */
export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  /** A link or small button belonging to this region, right-aligned against the title. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      {(title || action) && (
        <header className="panel__header">
          {title && <h2 className="panel__title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

// --- Strip --------------------------------------------------------------------------------------

/**
 * A horizontally-scrolling row of compact items.
 *
 * For a set that is genuinely a set — recent results, the next few dates — where wrapping to
 * three rows reads as a hierarchy that is not there. Scrolls inside itself, so the page never
 * scrolls sideways.
 */
export function Strip({
  children,
  label,
  className = '',
}: {
  children: ReactNode;
  /** Named because it is a scroll region, which is a landmark a keyboard user lands in. */
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`strip scroll-x ${className}`.trim()}
      role="group"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

// --- Master / detail ----------------------------------------------------------------------------

/**
 * A list beside what the selected row is about.
 *
 * The one desktop layout that genuinely beats a phone, and the composition doc 32 § 7 asks for
 * by name: on a wide screen the candidate list stays visible while the preview swaps, so
 * comparing two fighters is a glance rather than two navigations.
 *
 * On a phone the two are separate views and selection pushes: `list → detail → back`. That is
 * not a stacked desktop — it is a different composition of the same two regions, which is the
 * whole point of the primitive existing rather than each screen writing its own media query.
 *
 * The caller owns selection state. This component owns *which region is showing*, because that
 * is a layout question, and it derives it from whether anything is selected — so a phone user
 * pressing back and a desktop user clicking another row run the same code path.
 */
export function MasterDetail({
  list,
  detail,
  /** Whether a row is currently selected. Drives which region a phone shows. */
  selected,
  /** Back out of the detail view. Rendered only on the phone composition. */
  onClear,
  listLabel,
  detailLabel,
  /** Shown in the detail region on a wide screen when nothing is selected. */
  placeholder,
}: {
  list: ReactNode;
  detail: ReactNode;
  selected: boolean;
  onClear(): void;
  listLabel: string;
  detailLabel: string;
  placeholder?: ReactNode;
}) {
  const detailRef = useRef<HTMLDivElement>(null);

  /*
   * Focus follows selection, on the phone composition only.
   *
   * Selecting a row replaces the whole viewport with the detail region. Without moving focus, a
   * screen-reader user's cursor stays on a row that is no longer rendered and they are told
   * nothing happened — the same failure the shell fixes on navigation, reproduced inside a
   * screen because this selection is state rather than a route.
   *
   * Guarded on `selected` so the wide composition, where the list never goes away, does not
   * steal focus from the row the user just clicked.
   */
  useEffect(() => {
    if (!selected) return;
    if (window.matchMedia?.('(min-width: 62rem)').matches) return;
    detailRef.current?.focus({ preventScroll: true });
  }, [selected]);

  return (
    <div className="masterdetail" data-selected={selected ? 'true' : undefined}>
      <div className="masterdetail__list" aria-label={listLabel} role="group">
        {list}
      </div>

      <div
        className="masterdetail__detail"
        ref={detailRef}
        tabIndex={-1}
        aria-label={detailLabel}
        role="group"
      >
        {/* Only ever visible in the phone composition — see layout.css. The wide one keeps the
            list on screen, so a control to go back to it would point at itself. */}
        {selected && (
          <button type="button" className="masterdetail__back" onClick={onClear}>
            <span aria-hidden="true">‹</span> {listLabel}
          </button>
        )}
        {selected ? detail : placeholder}
      </div>
    </div>
  );
}

// --- Collapse -----------------------------------------------------------------------------------

/**
 * A region that is folded on a phone and open on a desktop.
 *
 * The single most useful responsive behaviour the app was missing. A condition strip is five
 * rows the desktop rail has room for permanently and a phone should show as one verdict line
 * until asked — and that is a difference in *composition*, not a difference in font size.
 *
 * `<details>` with the open state driven by a width query, so the browser owns the toggle, the
 * keyboard behaviour, the announcement and find-in-page. `wideOpen` is set once on mount rather
 * than tracked live: a viewport crossing 62rem mid-session is a rotation or a window drag, and
 * yanking a section shut underneath somebody is worse than leaving it as they found it.
 */
export function Collapse({
  summary,
  children,
  className = '',
}: {
  /** The one-line verdict, shown whether the region is open or closed. */
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const wideOpen = useRef<boolean>(
    typeof window !== 'undefined' && (window.matchMedia?.('(min-width: 62rem)').matches ?? false),
  );

  return (
    <details className={`collapse ${className}`.trim()} open={wideOpen.current}>
      <summary className="collapse__summary">{summary}</summary>
      <div className="collapse__body">{children}</div>
    </details>
  );
}
