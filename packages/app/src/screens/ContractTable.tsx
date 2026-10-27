/**
 * Sitting down with a fighter's people. Doc 34 C4.
 *
 * "Offer a deal" used to sign a free agent the moment it was pressed, on terms the code chose — four
 * fights, the belt clause, no matching rights — and an underpaid #1 contender on a nine-fight run
 * whose contract tab called the deal an insult had no button at all. This is the table: a terms
 * sheet with every term the agreement model already prices, a meter that says how close it is
 * (never a percentage), and a fighter who answers — yes, a counter or two shaped by who they are
 * and what they remember about you, or a walk.
 *
 * The talking is stored on the fighter (`recordTalks`) as it moves, and the table opens on whatever
 * is standing (`talksWith`): talks that lived only in component state could be walked out of and
 * started fresh until the answer was yes. A walk-out or a last word holds for
 * `TALKS_COOLDOWN_DAYS`. What the talking produces — a signed agreement — goes through `sign`, the
 * only door into a contract.
 */

import { useMemo, useState } from 'react';
import {
  MAX_FIGHTS_OWED,
  isFinalCounter,
  makeOffer,
  openingTerms,
  readTerms,
  takeCounter,
  talksReopenDay,
  TALKS_COOLDOWN_DAYS,
  type Fighter,
  type Negotiation,
  type OfferTerms,
  type Promotion,
} from '@mmasim/engine';
import type { GameDb } from '@mmasim/data';
import { Button, Card, Segmented } from '../ui';
import { Alert } from '../ui/signals';
import { Ledger, LedgerRow } from '../ui/console';
import { fromNow, money } from '../ui/format';
import { matchBid, recordTalks, rivalBidsFor, sign, tableFor, talksWith } from '../game/contracts';

/** "in 3 days", "in a week or two", "in 2 months". */
const reopensIn = (days: number): string =>
  days < 7
    ? `in ${days} day${days === 1 ? '' : 's'}`
    : days < 14
      ? 'in a week or two'
      : `in ${fromNow(days)}`;

const FIGHTS = Array.from({ length: MAX_FIGHTS_OWED }, (_, i) => String(i + 1));

export function ContractTable({
  db,
  fighter,
  promotion,
  mode,
  onSigned,
}: {
  db: GameDb;
  fighter: Fighter;
  promotion: Promotion;
  /** A new signing, or keeping somebody already here. */
  mode: 'sign' | 'resign';
  /** Called after a deal is signed, so the caller can commit and re-render. */
  onSigned(): void;
}) {
  const table = tableFor(db, fighter, promotion);
  const [terms, setTerms] = useState<OfferTerms>(() => openingTerms(fighter, promotion));
  const [talks, setStoredTalks] = useState<Negotiation | undefined>(() =>
    talksWith(db, fighter, promotion),
  );
  /** Every move is written down as it happens, so leaving the table does not reset it. */
  const setTalks = (next: Negotiation) => {
    setStoredTalks(next);
    recordTalks(db, fighter, next);
  };
  const [result, setResult] = useState<string | undefined>();
  const read = readTerms(table, terms);
  const bids = useMemo(
    () => (mode === 'resign' ? rivalBidsFor(db, fighter, promotion) : []),
    [db, fighter, promotion, mode],
  );

  const set = <K extends keyof OfferTerms>(key: K, value: OfferTerms[K]) =>
    setTerms((t) => ({ ...t, [key]: value }));

  const close = (agreed: OfferTerms) => {
    const signed = sign(db, fighter, promotion, agreed);
    setResult(signed.ok ? 'Signed.' : signed.reason);
    if (signed.ok) onSigned();
  };

  const offer = () => {
    const next = makeOffer(table, talks, terms);
    setTalks(next);
    if (next.state === 'agreed' && next.agreed) close(next.agreed);
  };

  const walked = talks?.state === 'walked';
  const lastWord = talks !== undefined && isFinalCounter(talks, fighter);
  const reopens = talks ? reopensIn(talksReopenDay(talks) - table.day) : '';
  const who = table.manager ? `${table.manager.name}, for ${fighter.lastName}` : fighter.lastName;

  return (
    <Card title={mode === 'resign' ? 'Re-sign' : 'Offer a deal'}>
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
          {table.manager
            ? `Across the table: ${table.manager.name}. Every term goes through them.`
            : `${fighter.lastName} represents themselves.`}
        </p>

        <div className="contract-sheet">
          <label>
            Show purse (k)
            <input
              type="number"
              min={0}
              step={0.5}
              value={terms.showPurse}
              onChange={(e) => set('showPurse', Number(e.target.value))}
            />
          </label>
          <label>
            Win bonus (k)
            <input
              type="number"
              min={0}
              step={0.5}
              value={terms.winBonus}
              onChange={(e) => set('winBonus', Number(e.target.value))}
            />
          </label>
          <label>
            Signing bonus (k)
            <input
              type="number"
              min={0}
              step={0.5}
              value={terms.signingBonus}
              onChange={(e) => set('signingBonus', Number(e.target.value))}
            />
          </label>
          {promotion.revenueShareCapable && (
            <label>
              PPV points
              <input
                type="number"
                min={0}
                max={3}
                step={1}
                value={terms.revenuePoints}
                onChange={(e) => set('revenuePoints', Number(e.target.value))}
              />
            </label>
          )}
        </div>

        <Segmented
          label="Fights"
          value={String(terms.fightsOwed)}
          options={FIGHTS.map((n) => ({ value: n, label: n }))}
          onChange={(v) => set('fightsOwed', Number(v))}
        />
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <label className="contract-toggle">
            <input
              type="checkbox"
              checked={terms.championshipExtension === 'standard'}
              onChange={(e) => set('championshipExtension', e.target.checked ? 'standard' : 'none')}
            />
            Champion’s clause
          </label>
          <label className="contract-toggle">
            <input
              type="checkbox"
              checked={terms.matchingRights}
              onChange={(e) => set('matchingRights', e.target.checked)}
            />
            Matching rights
          </label>
        </div>

        {/* The meter. A sentence and a bar, never the number underneath. */}
        <div>
          <div
            className="contract-meter"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(read.chance * 100)}
            aria-label={`How close: ${read.label}`}
          >
            <span style={{ width: `${Math.max(4, read.chance * 100)}%` }} />
          </div>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sm)' }}>
            <strong>{read.label}</strong>
            {read.concern ? ` — ${read.concern}` : ''}
          </p>
        </div>

        {talks?.quote && (
          <blockquote className="prose voice-quote" style={{ margin: 0 }}>
            {talks.quote}
          </blockquote>
        )}

        {talks?.state === 'countered' && talks.ask && (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <p className="prose" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
              {who} came back with{lastWord ? ' their last word' : ''}:
            </p>
            <Ledger>
              <LedgerRow
                label="Show / win"
                value={`${money(talks.ask.showPurse)} / ${money(talks.ask.winBonus)}`}
              />
              <LedgerRow label="Fights" value={talks.ask.fightsOwed} />
              {talks.ask.signingBonus > 0 && (
                <LedgerRow label="Signing bonus" value={money(talks.ask.signingBonus)} />
              )}
              {talks.ask.revenuePoints > 0 && (
                <LedgerRow label="PPV points" value={talks.ask.revenuePoints} />
              )}
              <LedgerRow
                label="Champion’s clause"
                value={talks.ask.championshipExtension === 'standard' ? 'Yes' : 'No'}
              />
            </Ledger>
            <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                onClick={() => {
                  const taken = takeCounter(talks);
                  setTalks(taken);
                  if (taken.agreed) close(taken.agreed);
                }}
              >
                Accept their terms
              </Button>
              <Button variant="ghost" onClick={() => setTerms(talks.ask!)}>
                Start from their terms
              </Button>
            </div>
          </div>
        )}

        {walked ? (
          <Alert tone="warn" title="They have walked away">
            Not at this table. They will talk again {reopens} — or let somebody else have them.
          </Alert>
        ) : (
          talks?.state !== 'agreed' && (
            <>
              {lastWord && (
                <p className="faint prose" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                  That is their last word. Offer anything they will not take and they walk — and
                  will not sit down again for {fromNow(TALKS_COOLDOWN_DAYS)}.
                </p>
              )}
              <Button variant="primary" onClick={offer}>
                {talks?.state === 'countered' ? 'Make a revised offer' : 'Make the offer'}
              </Button>
            </>
          )
        )}

        {result && (
          <p role="status" className="prose" style={{ margin: 0 }}>
            {result}
          </p>
        )}

        {/* Rival bids, in the last months of the deal. The hook B4's rival promotions bid through. */}
        {bids.length > 0 && (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <strong>Other promotions are bidding</strong>
            {bids.map((bid) => (
              <div
                key={bid.promotion.id as string}
                className="row"
                style={{ justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}
              >
                <span style={{ fontSize: 'var(--text-sm)' }}>
                  {bid.promotion.shortName}: {money(bid.terms.showPurse)} /{' '}
                  {money(bid.terms.winBonus)} for {bid.terms.fightsOwed} fights
                </span>
                <Button
                  size="sm"
                  disabled={!bid.matchable}
                  onClick={() => {
                    const r = matchBid(db, fighter, promotion, bid);
                    setResult(r.ok ? `Matched ${bid.promotion.shortName}.` : r.reason);
                    if (r.ok) onSigned();
                  }}
                >
                  {bid.matchable ? 'Match it' : 'Cannot match'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
