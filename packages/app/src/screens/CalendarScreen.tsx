/**
 * The calendar, the clock, and — for a promoter — the planning board.
 *
 * It used to be a read-only diary: here is what exists, press a button to move time. That is
 * enough for a fighter, whose year is decided for them, and it is nowhere near enough for a
 * promoter, whose entire job is deciding what the next six months contain. A promotion is
 * planned forward — *I want the lightweight title defended in April, I want that prospect on the
 * June Osaka card* — long before anybody knows who is fighting whom.
 *
 * So the promoter's calendar can create a card on any future date and leave it almost empty for
 * months. Each planned card carries its own state on the row — how full, whether it has a main
 * event, whether anybody clashes — so the six-month view answers "what does my year look like"
 * without opening anything, and opening one drops straight into matchmaking.
 *
 * The fighter's calendar is untouched. `ownership` on the entry is still what makes one screen
 * serve every mode, and the planning controls simply do not render when the player has no
 * promotion.
 */

import { useMemo, useState } from 'react';
import { toCalendar } from '@mmasim/engine';
import type { EventScale, Promotion } from '@mmasim/engine';
import { EVENT_SCALES, describeHealth } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Segmented } from '../ui';
import { Alert } from '../ui/signals';
import { formatGameDay } from '../shell/Shell';
import { buildCalendar, defaultFilter, nextStop, type CalendarEntry } from '../game/calendar';
import { ADVANCE_STEPS, advanceTo, type AdvanceResult } from '../game/clock';
import { DEFAULT_LEAD_DAYS, MARKETS, MINIMUM_LEAD_DAYS, createPlan } from '../game/plans';
import { PromoterSubNav } from './promoterNav';

/**
 * How far ahead the board looks.
 *
 * A season was right for a diary and is far too short for a planning tool: the whole argument
 * for planning is that a promoter thinks in half-years, and a horizon that cannot show a card
 * six months out cannot show them the thing they are planning.
 */
const HORIZON_DAYS = 400;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function CalendarScreen() {
  const { db, world, commit } = useGame();
  const { navigate } = useRouter();

  const isPromoter = world.playerRole === 'promoter' && world.playerPromotionId !== undefined;
  const promotion = world.playerPromotionId
    ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
    : undefined;

  const [filter, setFilter] = useState<'yours' | 'all'>(() => defaultFilter(world));
  const [lastAdvance, setLastAdvance] = useState<AdvanceResult | undefined>();
  const [planning, setPlanning] = useState(false);

  const entries = useMemo(
    () => buildCalendar(db, { from: world.day, to: world.day + HORIZON_DAYS }),
    [db, world.day],
  );

  const shown = filter === 'yours' ? entries.filter((e) => e.ownership === 'yours') : entries;
  const upNext = useMemo(() => nextStop(db, world.day), [db, world.day]);

  const advance = (days: number) => {
    setLastAdvance(advanceTo(db, world.day + days));
    commit();
  };

  const advanceToNext = () => {
    if (upNext === undefined) return;
    setLastAdvance(advanceTo(db, upNext));
    commit();
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {isPromoter && <PromoterSubNav current="calendar" />}

      <Card raised>
        <p className="section-title">Today</p>
        {/* `data-testid` because the shell also prints a date, and "the clock" is a specific
            thing a test needs to be able to point at. */}
        <p data-testid="clock" style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, margin: 0 }}>
          {formatGameDay(world.day)}
        </p>

        <div className="stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          <Button
            variant="primary"
            block
            onClick={advanceToNext}
            aria-disabled={upNext === undefined}
          >
            {upNext === undefined
              ? 'Nothing in the diary'
              : `Go to ${describeNext(entries, upNext)} — ${formatGameDay(upNext)}`}
          </Button>

          <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {ADVANCE_STEPS.map((step) => (
              <Button
                key={step.id}
                size="sm"
                variant="secondary"
                onClick={() => advance(step.days)}
              >
                {step.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {lastAdvance?.interrupted && (
        <Alert tone="warn" title="Something needs you">
          <span className="prose" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
            Time stopped on {formatGameDay(lastAdvance.day)}.{' '}
            {lastAdvance.waiting.length === 1
              ? lastAdvance.waiting[0]!.title
              : `${lastAdvance.waiting.length} things are waiting on a decision.`}
          </span>
          <Button variant="primary" onClick={() => navigate({ name: 'inbox' })}>
            Open the inbox
          </Button>
        </Alert>
      )}

      {lastAdvance && !lastAdvance.interrupted && lastAdvance.fights > 0 && (
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
          {lastAdvance.fights} fights happened across the sport while you waited.
        </p>
      )}

      {/*
        The planning half. A promoter putting a date in the diary months ahead is the mode's
        foundational act, and nothing in the game could express it — a card came into existence
        already full and was run in the same sitting.
      */}
      {isPromoter && promotion && (
        <Card
          title="Plan a card"
          action={
            <Button size="sm" onClick={() => setPlanning((open) => !open)}>
              {planning ? 'Close' : 'New card'}
            </Button>
          }
        >
          {planning ? (
            <PlanACard
              promotion={promotion}
              today={world.day}
              onCreate={(input) => {
                const plan = createPlan({ db, promotion, ...input });
                commit();
                setPlanning(false);
                navigate({ name: 'plan', id: plan.id });
              }}
            />
          ) : (
            <p className="prose faint" style={{ fontSize: 'var(--text-sm)' }}>
              Pick a date, a market and a size. The card can stay half empty for months — that is
              what planning is. You fill it as the fights become makeable.
            </p>
          )}
        </Card>
      )}

      <Segmented
        label="Whose diary"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'yours', label: 'Yours', hint: 'What you have to turn up to' },
          { value: 'all', label: 'The sport', hint: 'Everything scheduled anywhere' },
        ]}
      />

      {shown.length === 0 ? (
        <Empty title="Nothing scheduled">
          {filter === 'yours'
            ? isPromoter
              ? 'Your diary is clear. Put a card in it — the date comes first, the fights come later.'
              : 'Your diary is clear. Book something, or let time run and see what comes up.'
            : 'Nothing is on the books anywhere in the next few months.'}
        </Empty>
      ) : (
        <Card flush title="The next thirteen months">
          <div className="list">
            {shown.map((entry, i) => (
              <button
                key={`${entry.day}-${entry.kind}-${i}`}
                type="button"
                className="list__item"
                onClick={() =>
                  entry.link &&
                  navigate(
                    entry.link.id
                      ? ({ name: entry.link.route, id: entry.link.id } as never)
                      : ({ name: entry.link.route } as never),
                  )
                }
              >
                {/* The date leads, because this is a calendar. Every other screen leads with a
                    name. */}
                <span className="cal__when">
                  <span className="cal__date">{formatGameDay(entry.day)}</span>
                  <span className="cal__away">{describeGap(entry.day - world.day)}</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="list__primary" style={{ display: 'block' }}>
                    {entry.title}
                  </span>
                  {entry.detail && (
                    <span className="list__secondary" style={{ display: 'block' }}>
                      {entry.detail}
                    </span>
                  )}
                </span>
                <Chip tone={toneFor(entry)}>{labelFor(entry)}</Chip>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Choosing a date, a market and a size.
 *
 * The date picker is a month strip and a day grid rather than a native date input, for two
 * reasons: a game day is not a wall-clock date and converting between them at the control is a
 * bug waiting to happen, and a promoter chooses *a Saturday in April*, not the 18th. The grid
 * shows the month so the choice is spatial, which is how anybody plans a year.
 */
function PlanACard({
  promotion,
  today,
  onCreate,
}: {
  promotion: Promotion;
  today: number;
  onCreate(input: {
    day: number;
    city: string;
    country: string;
    scale: EventScale;
    name: string;
  }): void;
}) {
  const earliest = today + MINIMUM_LEAD_DAYS;
  const [day, setDay] = useState(today + DEFAULT_LEAD_DAYS);
  const [market, setMarket] = useState(
    () => MARKETS.find((m) => m.country === promotion.baseCountry) ?? MARKETS[0]!,
  );
  const [scale, setScale] = useState<EventScale>('standard');
  const [name, setName] = useState('');

  // Nine months of choices. Beyond that is not planning, it is fiction — the roster in a year
  // is not the roster you would be booking.
  const months = useMemo(() => {
    const out: { label: string; firstDay: number }[] = [];
    let cursor = earliest;
    for (let i = 0; i < 9; i++) {
      const c = toCalendar(cursor);
      out.push({ label: `${MONTH_NAMES[c.month - 1]!.slice(0, 3)} ${c.year}`, firstDay: cursor });
      // Walk to the first day of the next month rather than adding 30, so the strip does not
      // drift out of step with the calendar over nine hops.
      let next = cursor;
      const startMonth = c.month;
      while (toCalendar(next).month === startMonth) next += 1;
      cursor = next;
    }
    return out;
  }, [earliest]);

  const selected = toCalendar(day);
  const monthStart = day - (selected.day - 1);
  const daysInMonth = (() => {
    let n = 1;
    while (toCalendar(monthStart + n).month === selected.month) n += 1;
    return n;
  })();

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <div>
        <p className="section-title">Month</p>
        <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {months.map((month) => (
            <Button
              key={month.label}
              size="sm"
              variant={
                toCalendar(month.firstDay).month === selected.month &&
                toCalendar(month.firstDay).year === selected.year
                  ? 'primary'
                  : 'secondary'
              }
              onClick={() => setDay(Math.max(earliest, month.firstDay))}
            >
              {month.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="section-title">
          Date — {formatGameDay(day)}
          {day < earliest && ' (too soon)'}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 'var(--space-1)',
          }}
        >
          {Array.from({ length: daysInMonth }, (_, i) => {
            const candidate = monthStart + i;
            const c = toCalendar(candidate);
            const disabled = candidate < earliest;
            // Saturdays marked, because that is when cards run and a promoter's eye goes
            // straight to them.
            const isSaturday = c.weekday === 6;
            return (
              <button
                key={candidate}
                type="button"
                aria-disabled={disabled}
                aria-pressed={candidate === day}
                onClick={() => !disabled && setDay(candidate)}
                style={{
                  minHeight: '2.25rem',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${candidate === day ? 'var(--accent)' : 'var(--border)'}`,
                  background:
                    candidate === day
                      ? 'var(--accent-soft)'
                      : isSaturday
                        ? 'var(--surface-sunken)'
                        : 'var(--surface)',
                  color: disabled ? 'var(--text-faint)' : 'var(--text)',
                  fontWeight: candidate === day ? 800 : isSaturday ? 700 : 500,
                  fontSize: 'var(--text-sm)',
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                {c.day}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="section-title">Market</p>
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {MARKETS.map((option) => (
            <button
              key={option.city}
              type="button"
              className="bout"
              style={
                option.city === market.city
                  ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                  : undefined
              }
              onClick={() => setMarket(option)}
            >
              <span className="bout__names">
                {option.city}, {option.country}
              </span>
              <span className="list__secondary" style={{ display: 'block' }}>
                {option.note}
              </span>
            </button>
          ))}
        </div>
      </div>

      <Segmented
        label="How big a night"
        value={scale}
        onChange={setScale}
        options={EVENT_SCALES.map((s) => ({ value: s.id, label: s.label, hint: s.blurb }))}
      />

      <label className="stack" style={{ gap: 'var(--space-1)' }}>
        <span className="section-title" style={{ margin: 0 }}>
          Name (optional)
        </span>
        <input
          type="text"
          value={name}
          placeholder={`${promotion.shortName} …`}
          onChange={(e) => setName(e.target.value)}
          style={{
            minHeight: 'var(--tap-target)',
            padding: '0 var(--space-3)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        />
      </label>

      <Button
        variant="primary"
        block
        aria-disabled={day < earliest}
        onClick={() =>
          day >= earliest &&
          onCreate({ day, city: market.city, country: market.country, scale, name })
        }
      >
        Put it in the diary
      </Button>
      <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
        Nothing is committed by this. The card exists, the date is yours, and every slot on it is
        empty until you offer somebody a fight.
      </p>
    </div>
  );
}

/**
 * What the "go to next" button is actually going to.
 *
 * A card's title is a proper name — `RIZIN 1`, not `rizin 1` — so it goes in as written. Only the
 * sentence-shaped titles ("Your contract expires") get lowercased to sit inside the button's own
 * sentence.
 */
function describeNext(entries: readonly CalendarEntry[], day: number): string {
  const entry = entries.find((e) => e.day === day && e.ownership === 'yours');
  if (!entry) return 'the next thing';
  return entry.kind === 'plan' || entry.kind === 'card' ? entry.title : entry.title.toLowerCase();
}

/** How far away, in the words a person uses. Never "in 37 days". */
function describeGap(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `${days} days`;
  if (days < 14) return 'next week';
  if (days < 31) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

/**
 * The chip on a calendar row.
 *
 * A planned card says *how complete it is* rather than that it is a card, which is the single
 * most useful thing the six-month view can carry: scanning down a season and seeing "Needs a
 * main event" against April is the whole reason the screen exists.
 */
const labelFor = (entry: CalendarEntry): string => {
  if (entry.kind === 'plan') return entry.health ? describeHealth(entry.health) : 'Planned';
  return entry.kind === 'card'
    ? 'Card'
    : entry.kind === 'fight'
      ? 'Fight'
      : entry.kind === 'camp'
        ? 'Camp'
        : entry.kind === 'contract'
          ? 'Contract'
          : entry.kind === 'medical'
            ? 'Medical'
            : 'Roster';
};

const toneFor = (entry: CalendarEntry): 'accent' | 'info' | 'warning' | 'neutral' | 'positive' => {
  if (entry.kind === 'plan') {
    return entry.health === 'ready'
      ? 'positive'
      : entry.health === 'atRisk' || entry.health === 'empty'
        ? 'warning'
        : 'accent';
  }
  return entry.ownership === 'world'
    ? 'neutral'
    : entry.kind === 'fight' || entry.kind === 'card'
      ? 'accent'
      : entry.kind === 'contract'
        ? 'warning'
        : 'info';
};
