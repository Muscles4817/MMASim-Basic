/**
 * The console vocabulary.
 *
 * Presentational only, like the rest of `ui/` — no database, no game logic. What lives here is
 * the vocabulary a management screen repeats: a two-column console, an attention row, a card in
 * the pipeline, a slot on a card, a candidate for a slot, a line in a ledger, an ability band.
 *
 * They exist as components rather than as markup copied into four screens because every one of
 * them carries a rule that is easy to lose on the fifth copy — an attention row must always say
 * *why* it is there, a candidate must always carry its rationale, an ability must never render a
 * number.
 *
 * This was `promoter.tsx` and the name had become a lie: `Console`, `Ledger`, `Tabs`,
 * `AttentionRow` and `AbilityBand` are not promoter concepts, and doc 32 § 6 needs all of them in
 * fighter mode. Nothing in here knows which mode it is rendering for, which is the point — mode
 * arrives as a prop at the route boundary, never as a branch inside a shared component.
 */

import type { ReactNode } from 'react';
import { ratingBand, type Rating } from '@mmasim/engine';
import { bandColour } from './index';
import { Icon, type IconName } from './signals';
import './console.css';

// --- Layout ------------------------------------------------------------------------------------

/**
 * Two columns on a desktop, one on a phone.
 *
 * `main` is the work; `side` is the standing context that makes the work decidable. The side
 * column comes second in the DOM deliberately — the grid places it, so the visual order and the
 * reading order never diverge.
 */
export function Console({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="console">
      <div className="console__main">{main}</div>
      <div className="console__side">{side}</div>
    </div>
  );
}

// --- Sub-navigation -----------------------------------------------------------------------------

export interface SubNavItem {
  label: string;
  href: string;
  current?: boolean;
  onClick?(): void;
}

/**
 * The places a promoter needs that the five tabs cannot hold.
 *
 * Real links so middle-click and the links rotor work, same as the shell's nav. A scroller
 * rather than a wrap, because these are peers and a second row reads as a hierarchy that is not
 * there.
 */
export function SubNav({ items, label }: { items: readonly SubNavItem[]; label: string }) {
  return (
    <nav className="subnav" aria-label={label}>
      {items.map((item) => (
        <a
          key={item.label}
          className="subnav__item"
          href={item.href}
          aria-current={item.current ? 'page' : undefined}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            if (!item.onClick) return;
            e.preventDefault();
            item.onClick();
          }}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

// --- Attention ------------------------------------------------------------------------------------

/**
 * One thing that needs the promoter.
 *
 * The rule the component enforces: a row without a `detail` is a notification, and a
 * notification is what the old dashboard was made of. Every row says what is true, what it
 * costs, and what to do about it.
 */
export function AttentionRow({
  tone,
  title,
  detail,
  cue,
  onClick,
  kind,
}: {
  tone: 'danger' | 'warn' | 'info' | 'good';
  title: string;
  detail: string;
  cue?: string;
  onClick?(): void;
  /**
   * What sort of situation this row is, as a stable handle.
   *
   * Every title in this component is a sentence written to be reworded, so a test that asks "is
   * the dashboard advertising offers" cannot ask by matching prose — it will pass vacuously the
   * first time somebody improves the copy, which is precisely what happened to the invariant
   * that the hub must never advertise interest the contract screen lacks.
   */
  kind?: string;
}) {
  const icon: IconName =
    tone === 'danger' || tone === 'warn' ? 'warning' : tone === 'good' ? 'success' : 'info';

  const body = (
    <>
      <span className="attention__icon">
        <Icon name={icon} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="attention__title">{title}</span>
        <span className="attention__detail">{detail}</span>
        {cue && <span className="attention__cue">{cue} →</span>}
      </span>
    </>
  );

  if (!onClick) {
    return (
      <div className="attention__item" data-tone={tone} data-kind={kind}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="attention__item"
      data-tone={tone}
      data-kind={kind}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

// --- Pipeline --------------------------------------------------------------------------------------

export function PipelineCard({
  name,
  when,
  meta,
  filled,
  slots,
  state,
  onClick,
}: {
  name: string;
  when: string;
  meta: string;
  filled: number;
  slots: number;
  state: 'ready' | 'thin' | 'atRisk' | 'empty';
  onClick(): void;
}) {
  return (
    <button type="button" className="pipeline__item" onClick={onClick}>
      <span className="pipeline__head">
        <span className="pipeline__name">{name}</span>
        <span className="pipeline__when">{when}</span>
      </span>
      <span className="pipeline__meta">{meta}</span>
      <span className="pipeline__bar">
        <span
          className="pipeline__fill"
          data-state={state}
          style={{ width: `${slots === 0 ? 0 : Math.round((filled / slots) * 100)}%` }}
        />
      </span>
      {/* The bar is decorative; the fraction is the information, and it has to reach a
          screen reader without being a second visible copy of the same thing. */}
      <span className="visually-hidden">
        {filled} of {slots} fights booked
      </span>
    </button>
  );
}

// --- Ledger ------------------------------------------------------------------------------------------

export function Ledger({ children }: { children: ReactNode }) {
  return <div className="ledger">{children}</div>;
}

export function LedgerRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="ledger__row">
      <span className="ledger__label">{label}</span>
      <span className="ledger__value" data-tone={tone}>
        {value}
      </span>
    </div>
  );
}

export const LedgerRule = () => <div className="ledger__rule" />;

// --- Ability -------------------------------------------------------------------------------------------

/**
 * How good somebody is, without saying how good somebody is.
 *
 * Six segments and a word. There is no number here on purpose: an exact overall collapses
 * scouting and matchmaking judgement into an integer comparison, and a promoter who can read
 * "34 versus 47" off two screens is not scouting anybody. The individual ratings are all still
 * on the page for a player who wants to form their own view — that is the version where two
 * players can disagree about the same fighter.
 */
export function AbilityBand({
  label,
  fill,
  note,
}: {
  label: string;
  /** 0–1, quantised to the six classes by the caller. */
  fill: number;
  note?: string;
}) {
  const segments = 6;
  const lit = Math.round(fill * segments);

  return (
    <div className="ability">
      <span className="ability__label">{label}</span>
      <span className="ability__segments" aria-hidden="true">
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className="ability__segment" data-on={i < lit ? 'true' : 'false'} />
        ))}
      </span>
      {note && <span className="ability__note">{note}</span>}
    </div>
  );
}

// --- Compact ratings ---------------------------------------------------------------------------------------

/**
 * One attribute, at a quarter of the height of `RatingRow`.
 *
 * The full row prints its definition underneath every single stat, which is right the first
 * time a player meets it and is several screens of repeated prose by the fifth fighter they
 * look at. The definition moves to the label's tooltip and to the group's own help toggle;
 * always-visible prose is reserved for analysis of *this* fighter.
 */
export function MiniRating({
  label,
  value,
  hint,
}: {
  label: string;
  value: Rating;
  hint?: string;
}) {
  const band = ratingBand(value);
  const colour = bandColour(value);

  /*
   * The silhouette, kept from `RatingRow`.
   *
   * A column of identically-weighted bars makes the player read fifteen numbers to find the two
   * that matter; a taller bar for an elite rating and a thinner one for a hole can be read at a
   * glance, and it survives greyscale. Compressing the row must not throw that away.
   */
  const weight = value >= 82 ? ' mini-rating--elite' : value < 50 ? ' mini-rating--weak' : '';

  return (
    <div className={`mini-rating${weight}`}>
      <span className="mini-rating__label" title={hint}>
        {label}
      </span>
      <span className="mini-rating__value" style={{ color: colour }} aria-hidden="true">
        {value}
      </span>
      <span
        className="mini-rating__track"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={1}
        aria-valuemax={100}
        aria-label={`${label}: ${value} out of 100, ${band.label}`}
      >
        <span className="mini-rating__fill" style={{ width: `${value}%`, background: colour }} />
      </span>
      <span className="mini-rating__band" style={{ color: colour }} aria-hidden="true">
        {band.short}
      </span>
    </div>
  );
}

// --- Tabs ------------------------------------------------------------------------------------------------

/**
 * Progressive disclosure, on every width.
 *
 * The fighter page carries identity, career, contract, condition, scouting, history, traits and
 * forty ratings. One continuous scroll is unusable on a phone and merely bad on a desktop, and
 * the grouping is conceptual rather than a mobile concession — so the same control serves both.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { id: NoInfer<T>; label: string }[];
  value: T;
  onChange(id: NoInfer<T>): void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={tab.id === value}
          aria-controls={`panel-${tab.id}`}
          className="tabs__tab"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      className="stack"
      style={{ gap: 'var(--space-4)' }}
    >
      {children}
    </div>
  );
}
