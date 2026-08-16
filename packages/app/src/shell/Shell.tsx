import type { ReactNode } from 'react';
import { gameDayToIso, toCalendar } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter, type Route } from '../state/router';
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

  const isCurrent = (item: NavItem) =>
    item.matches ? item.matches.includes(route.name) : route.name === item.route.name;

  return (
    <div className="shell">
      <nav className="shell__nav" aria-label="Main">
        <div className="shell__brand">
          MMA<span>SIM</span>
        </div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.label}
            type="button"
            className="shell__nav-item"
            aria-current={isCurrent(item) ? 'page' : undefined}
            onClick={() => navigate(item.route)}
          >
            <span className="shell__nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="shell__body">
        <header className="shell__header">
          {showBack && (
            <button type="button" className="shell__back" onClick={back} aria-label="Go back">
              ‹
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

        <main className="shell__main">{children}</main>
      </div>
    </div>
  );
}
