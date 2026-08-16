/** Shared UI primitives. Presentational only — no game logic lives here. */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ratingBand, type Rating, type RatingBandKey } from '@mmasim/engine';
import './ui.css';

// --- Card ---------------------------------------------------------------------------

export function Card({
  title,
  action,
  flush,
  raised,
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  flush?: boolean;
  raised?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const classes = ['card', flush && 'card--flush', raised && 'card--raised', className]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={classes}>
      {(title || action) && (
        <header className="card__header" style={flush ? { padding: 'var(--space-4)', marginBottom: 0 } : undefined}>
          {title && <h2 className="card__title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

// --- Button -------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  block,
  size,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  block?: boolean;
  size?: 'sm';
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    block && 'btn--block',
    size === 'sm' && 'btn--sm',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button type="button" className={classes} {...rest} />;
}

// --- Chip ---------------------------------------------------------------------------

export type ChipTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'accent';

export function Chip({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: ChipTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`chip${tone === 'neutral' ? '' : ` chip--${tone}`}`} title={title}>
      {children}
    </span>
  );
}

// --- Rating -------------------------------------------------------------------------

const BAND_COLOUR: Record<RatingBandKey, string> = {
  allTime: 'var(--band-atg)',
  worldBest: 'var(--band-world)',
  elite: 'var(--band-elite)',
  veryGood: 'var(--band-strong)',
  solid: 'var(--band-solid)',
  average: 'var(--band-avg)',
  belowLevel: 'var(--band-weak)',
  liability: 'var(--band-poor)',
  absent: 'var(--band-none)',
};

export function bandColour(rating: Rating): string {
  return BAND_COLOUR[ratingBand(rating).key];
}

/**
 * One attribute row: label, value, and a colour-coded bar.
 *
 * `ceiling` draws a marker for scouted potential. It is intentionally a thin tick rather
 * than a second filled bar — the current rating is what the player acts on, and a second
 * bar of similar weight makes the two easy to confuse at a glance.
 */
export function RatingRow({
  label,
  value,
  ceiling,
  hint,
}: {
  label: string;
  value: Rating;
  ceiling?: Rating;
  hint?: string;
}) {
  const band = ratingBand(value);
  const showCeiling = ceiling !== undefined && ceiling > value;
  return (
    <div className="rating" title={hint}>
      <span className="rating__label">{label}</span>
      <span className="rating__value" style={{ color: bandColour(value) }}>
        {value}
      </span>
      <div
        className={`rating__track${showCeiling ? ' rating__ceiling' : ''}`}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={1}
        aria-valuemax={100}
        aria-label={`${label}: ${value} out of 100, ${band.label}`}
        style={
          showCeiling
            ? ({ '--ceiling-pos': `${ceiling}%` } as React.CSSProperties)
            : undefined
        }
      >
        <div
          className="rating__fill"
          style={{ width: `${value}%`, background: bandColour(value) }}
        />
        {showCeiling && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `calc(${ceiling}% - 1px)`,
              top: 0,
              bottom: 0,
              width: 2,
              background: 'var(--text-faint)',
            }}
          />
        )}
      </div>
    </div>
  );
}

// --- Segmented control ----------------------------------------------------------------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  // T is inferred from `value` alone. Both other sites are NoInfer because both poison it:
  // inline option literals widen to `string`, and a `useState` setter contributes
  // `SetStateAction<T>`, which fails the `extends string` constraint and collapses T to
  // `string`. Without these, every call site needs an explicit type argument.
  options: readonly { value: NoInfer<T>; label: string; hint?: string }[];
  value: T;
  onChange(value: NoInfer<T>): void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__option"
          aria-pressed={option.value === value}
          title={option.hint}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// --- List ---------------------------------------------------------------------------

export function ListItem({
  primary,
  secondary,
  trailing,
  leading,
  onClick,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      {leading}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="list__primary" style={{ display: 'block' }}>
          {primary}
        </span>
        {secondary && (
          <span className="list__secondary" style={{ display: 'block' }}>
            {secondary}
          </span>
        )}
      </span>
      {trailing}
    </>
  );

  // A row that does something is a button; a row that does not must not look like one.
  return onClick ? (
    <button type="button" className="list__item" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="list__item">{content}</div>
  );
}

// --- Stat ---------------------------------------------------------------------------

export function Stat({
  value,
  label,
  tone,
}: {
  value: ReactNode;
  label: string;
  tone?: 'positive' | 'negative';
}) {
  const colour =
    tone === 'positive' ? 'var(--positive)' : tone === 'negative' ? 'var(--negative)' : undefined;
  return (
    <div className="stat">
      <span className="stat__value" style={{ color: colour }}>
        {value}
      </span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <p>{children}</p>}
    </div>
  );
}
