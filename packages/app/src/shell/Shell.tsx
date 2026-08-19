import { useEffect, useRef, type ReactNode } from 'react';
import { gameDayToIso, toCalendar, type Fighter, type Promotion } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { toHash, useRouter, type Route } from '../state/router';
import { inboxCount } from '../game/inbox';
import { isOverdrawn, money } from '../ui/format';
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

/*
 * Five tabs, and the clock and the inbox now take two of them.
 *
 * Rankings and Editor moved out. Rankings was already on the hub's own "everywhere else" grid,
 * so the tab was a second door to the same room; the editor is a power tool that nobody reaches
 * for mid-career. Time and the things waiting on you are what a player needs from anywhere,
 * which is what a tab bar is for.
 */
const FIGHTER_NAV: readonly NavItem[] = [
  // `start` belongs to Career: picking a fighter is the first step of the career flow, and
  // without it the very first screen a new player sees has no tab marked current.
  {
    route: { name: 'hub' },
    label: 'Career',
    icon: '🥊',
    matches: ['hub', 'camp', 'fight', 'start', 'create', 'training'],
  },
  { route: { name: 'calendar' }, label: 'Calendar', icon: '📅' },
  { route: { name: 'inbox' }, label: 'Inbox', icon: '📥' },
  {
    route: { name: 'roster' },
    label: 'Roster',
    icon: '👥',
    matches: ['roster', 'fighter', 'rankings', 'editor', 'editorFighter'],
  },
  { route: { name: 'settings' }, label: 'Settings', icon: '⚙️' },
];

/**
 * The same five tabs, pointed at the promoter's places.
 *
 * The shell is shared rather than forked, and the tab array is the only thing that changes.
 * Forking would mean reimplementing the rail/tab-bar breakpoint, the safe-area insets, the
 * skip link, focus-on-navigate and the live route announcement — and then fixing every future
 * accessibility bug in two places. Roster, Rankings, Editor and Settings are genuinely the same
 * screens in both modes; only the first tab differs.
 */
const PROMOTER_NAV: readonly NavItem[] = [
  {
    route: { name: 'promotion' },
    label: 'Promotion',
    icon: '🎪',
    matches: ['promotion', 'card', 'hub', 'start', 'champions'],
  },
  // Cards live under the calendar, because a card *is* a date with fights on it and the whole
  // point of the rework is that a promoter plans months ahead rather than generating one now.
  { route: { name: 'calendar' }, label: 'Calendar', icon: '📅', matches: ['calendar', 'plan'] },
  { route: { name: 'inbox' }, label: 'Inbox', icon: '📥' },
  // A promoter's "roster" is their own stable with contracts attached, not the world's fighter
  // list — which is reachable through it.
  {
    route: { name: 'promoterRoster' },
    label: 'Roster',
    icon: '👥',
    matches: ['promoterRoster', 'fighter', 'roster', 'rankings', 'editor', 'editorFighter'],
  },
  { route: { name: 'settings' }, label: 'Settings', icon: '⚙️' },
];

export function Shell({
  title,
  subtitle,
  actions,
  showBack,
  wide,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  showBack?: boolean;
  /**
   * Let the content use the full desktop width.
   *
   * Off by default, and that default is the right one: a column of prose stretched to 1600px is
   * harder to read, not easier. It is on for the screens that genuinely have parallel context to
   * show side by side — the dashboard, the card builder, a fighter's console — and nowhere else.
   */
  wide?: boolean;
  children: ReactNode;
}) {
  const { route, navigate, back } = useRouter();
  const { db, world } = useGame();
  const NAV_ITEMS = world.playerRole === 'promoter' ? PROMOTER_NAV : FIGHTER_NAV;
  // Unread rather than blocking: a player should see that something arrived, not only that
  // something is stopping them.
  const waiting = inboxCount(db).unread;
  const mainRef = useRef<HTMLElement>(null);

  // Move focus to the content region on every navigation. Without this a screen-reader
  // user's virtual cursor stays on the control they activated while the entire page swaps
  // underneath them, and they are given no indication anything happened.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);

  /*
    Money, permanently on screen.
   
    It used to appear in exactly three places — the hub's stat card, a chip at the top of the
    training screen, and inside the confirmation sentence of a spend that was already affordable.
    Every one of those is somewhere other than where the player is deciding. Looking at a gym
    that costs £40k for eight weeks, or a camp option priced against a balance two screens away,
    the player was being asked to do arithmetic against a number they could not see.
   
    Putting it in the sticky header fixes the whole class of problem rather than each instance:
    there is no point of spending anywhere in the game that is not now within a glance of the
    balance it spends from.
  */
  const funds = ((): { label: string; value: string; overdrawn: boolean } | undefined => {
    if (world.playerRole === 'promoter') {
      const promotion = world.playerPromotionId
        ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
        : undefined;
      return promotion
        ? {
            label: 'Budget',
            value: money(promotion.budget),
            overdrawn: isOverdrawn(promotion.budget),
          }
        : undefined;
    }
    const fighter = world.playerFighterId
      ? (db.fighters.findById(world.playerFighterId) as Fighter | undefined)
      : undefined;
    return fighter
      ? { label: 'Bank', value: money(fighter.bank), overdrawn: isOverdrawn(fighter.bank) }
      : undefined;
  })();

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
            {/*
              The count, on the icon.

              A tab that never says anything is a tab nobody opens, and the whole point of the
              inbox is that it holds things time will stop for. The number is also in the
              accessible name below rather than only here, because a coloured dot is not
              information.
            */}
            {item.route.name === 'inbox' && waiting > 0 && (
              <span className="shell__badge">{waiting > 9 ? '9+' : waiting}</span>
            )}
          </span>
          {item.label}
          {item.route.name === 'inbox' && waiting > 0 && (
            <span className="visually-hidden">, {waiting} waiting</span>
          )}
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
          {funds && (
            <div className="shell__funds" title={undefined}>
              <span className="shell__funds-label">{funds.label}</span>
              <span
                className="shell__funds-value"
                data-testid="shell-funds"
                data-negative={funds.overdrawn ? 'true' : undefined}
              >
                {funds.value}
              </span>
            </div>
          )}
          {actions}
        </header>

        {/* tabIndex -1 makes this focusable programmatically without adding a tab stop. */}
        <main
          className={`shell__main${wide ? ' shell__main--wide' : ''}`}
          id="main"
          ref={mainRef}
          tabIndex={-1}
        >
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
