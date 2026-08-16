import { useEffect, useRef, type ReactNode } from 'react';
import { gameDayToIso, toCalendar } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { toHash, useRouter, type Route } from '../state/router';
import './Shell.css';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Human-readable game date. Formatting lives in the UI; the engine only knows day indices. */
export function formatGameDay(day: number): string {
  const c = toCalendar(day);
  return `${c.day} ${MONTHS[c.month - 1]} ${c.year}`;
}

export { gameDayToIso };

interface NavItem {
  route: Route;
  label: string;
  icon: string;
  /** Route names that should also light this tab up. */
  matches?: readonly Route['name'][];
}

const NAV_ITEMS: readonly NavItem[] = [
  { route: { name: 'hub' }, label: 'Career', icon: '🥊', matches: ['hub', 'camp', 'fight'] },
  { route: { name: 'roster' }, label: 'Roster', icon: '👥', matches: ['roster', 'fighter'] },
  { route: { name: 'rankings' }, label: 'Rankings', icon: '🏆' },
  { route: { name: 'editor' }, label: 'Editor', icon: '✏️', matches: ['editor', 'editorFighter'] },
  { route: { name: 'settings' }, label: 'Settings', icon: '⚙️' },
];

export function Shell({
  title,
  subtitle,
  actions,
  showBack,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  showBack?: boolean;
  children: ReactNode;
}) {
  const { route, navigate, back } = useRouter();
  const { world } = useGame();
  const mainRef = useRef<HTMLElement>(null);

  // Move focus to the content region on every navigation. Without this a screen-reader
  // user's virtual cursor stays on the control they activated while the entire page swaps
  // underneath them, and they are given no indication anything happened.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);

  const isCurrent = (item: NavItem) =>
    item.matches ? item.matches.includes(route.name) : route.name === item.route.name;

  const nav = (
    <nav className="shell__nav" aria-label="Main">
      <div className="shell__brand">
        MMA<span>SIM</span>
      </div>
      {NAV_ITEMS.map((item) => (
        // Real links, not buttons: the router is hash-based and already has a URL for each
        // of these, so rendering buttons would throw away middle-click, open-in-new-tab and
        // the screen-reader links rotor for nothing.
        <a
          key={item.label}
          className="shell__nav-item"
          href={toHash(item.route)}
          aria-current={isCurrent(item) ? 'page' : undefined}
          onClick={(e) => {
            // Let the browser handle modified clicks so "open in new tab" still works.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            navigate(item.route);
          }}
        >
          <span className="shell__nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          {item.label}
        </a>
      ))}
    </nav>
  );

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {/*
        Content comes first in the DOM. On phones the nav is visually pinned to the bottom,
        so putting it first in source would force keyboard and screen-reader users through
        five tab stops before reaching anything, on every screen — and would contradict the
        visual reading order. CSS `order` puts it back on the left for the desktop rail.
      */}
      <div className="shell__body">
        <header className="shell__header">
          {showBack && (
            <button type="button" className="shell__back" onClick={back} aria-label="Go back">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                <path
                  d="M15 5l-7 7 7 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 className="shell__title">{title}</h1>
            {subtitle !== undefined ? (
              <div className="shell__subtitle">{subtitle}</div>
            ) : (
              <div className="shell__subtitle">{formatGameDay(world.day)}</div>
            )}
          </div>
          <div className="spacer" />
          {actions}
        </header>

        {/* tabIndex -1 makes this focusable programmatically without adding a tab stop. */}
        <main className="shell__main" id="main" ref={mainRef} tabIndex={-1}>
          {children}
        </main>
      </div>

      {nav}

      {/* Announces the screen change to assistive tech, which focus alone does not do. */}
      <p className="visually-hidden" aria-live="polite">
        {title}
      </p>
    </div>
  );
}
