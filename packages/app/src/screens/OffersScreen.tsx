import { useMemo, useState } from 'react';
import { type Offer } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty } from '../ui';
import { Alert } from '../ui/signals';
import {
  contractStanding,
  hire,
  managersWillingToRepresent,
  offersOnTheTable,
  sign,
} from '../game/contracts';

/**
 * Free agency.
 *
 * The design rule this screen exists to honour: **an offer is a future, not a number.** So
 * every offer leads with three specific lines drawn from real world state — what it pays,
 * where you would rank and how old the champion is, and what the level would actually be
 * like — rather than with a purse the player is invited to compare.
 *
 * The other rule is that this is *escaping*, not being courted. MMA free agency is a near
 * monopsony: expect two or three callers, stratified so hard that the top offer dwarfs the
 * bottom. What makes the scene a decision rather than an arithmetic problem is the
 * unmatchable terms — the things your current promotion structurally cannot replicate.
 */
export function OffersScreen() {
  const { db, playerFighter, commit } = useGame();
  const { navigate } = useRouter();
  const [pending, setPending] = useState<string | undefined>();
  const [confirmingManager, setConfirmingManager] = useState<string | undefined>();

  const offers = useMemo(
    () => (playerFighter ? offersOnTheTable(db, playerFighter) : []),
    [db, playerFighter],
  );
  const managers = useMemo(
    () => (playerFighter ? managersWillingToRepresent(db, playerFighter) : []),
    [db, playerFighter],
  );

  if (!playerFighter) {
    return (
      <Empty title="No career in progress">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Start a career
        </Button>
      </Empty>
    );
  }

  const standing = contractStanding(db, playerFighter);

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {!standing.freeAgent && standing.agreement && (
        <Alert tone="warn" title="You are under contract">
          {standing.status?.summary} You can look, and until the deal is up you cannot sign
          anything.
        </Alert>
      )}

      {/* The manager comes first, because who negotiates decides what you are offered. */}
      <Card title="Who negotiates for you">
        {standing.manager ? (
          <p className="prose">
            <strong>{standing.manager.name}</strong> — {standing.manager.blurb}
          </p>
        ) : (
          <>
            <p className="muted prose" style={{ marginBottom: 'var(--space-3)' }}>
              You have nobody. You will only hear from promotions that already know your name,
              and you will negotiate against people who do this professionally. Some fighters
              genuinely prefer it — you keep every penny.
            </p>
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              {managers.length === 0 ? (
                <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
                  Nobody will take you on yet. A better gym vouching for you does more than a
                  better record — managers bet on potential, and they hear about it from
                  coaches.
                </p>
              ) : (
                managers.map((manager) => (
                  <div
                    key={manager.id as string}
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                      <strong>{manager.name}</strong>
                      <Chip tone="neutral">{Math.round(manager.purseRate * 100)}% of purse</Chip>
                    </div>
                    <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginTop: 2 }}>
                      {manager.blurb}
                    </p>
                    {/*
                      Hiring takes a permanent cut of every purse from here on. One tap on a
                      list of six was the least reversible thing on the screen and the least
                      guarded.
                    */}
                    {confirmingManager === (manager.id as string) ? (
                      <div
                        className="row"
                        style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}
                      >
                        <Button
                          size="sm"
                          onClick={() => {
                            hire(db, playerFighter, manager);
                            setConfirmingManager(undefined);
                            commit();
                          }}
                        >
                          Yes — {Math.round(manager.purseRate * 100)}% of every purse
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmingManager(undefined)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => setConfirmingManager(manager.id as string)}
                        style={{ marginTop: 'var(--space-2)' }}
                      >
                        Sign with {manager.name.split(' ')[1] ?? manager.name}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </Card>

      <Card title={offers.length === 0 ? 'Nobody is calling' : `${offers.length} on the table`}>
        {offers.length === 0 ? (
          <p className="muted prose">
            Nothing right now. This sport has one buyer that matters and a handful who cannot
            compete with it — free agency is usually about getting out, not being fought over.
            Win, or find somebody who can get a matchmaker on the phone.
          </p>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            {offers.map((offer) => (
              <OfferCard
                key={offer.promotion.id as string}
                offer={offer}
                expanded={pending === (offer.promotion.id as string)}
                canSign={standing.freeAgent}
                onToggle={() =>
                  setPending((current) =>
                    current === (offer.promotion.id as string)
                      ? undefined
                      : (offer.promotion.id as string),
                  )
                }
                onAccept={() => {
                  sign(db, playerFighter, offer.promotion, offer.terms);
                  commit();
                  navigate({ name: 'hub' });
                }}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function OfferCard({
  offer,
  expanded,
  canSign,
  onToggle,
  onAccept,
}: {
  offer: Offer;
  expanded: boolean;
  canSign: boolean;
  onToggle(): void;
  onAccept(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const motive =
    offer.motive === 'reach'
      ? { label: 'A leap', tone: 'accent' as const }
      : offer.motive === 'ascend'
        ? { label: 'Step up', tone: 'info' as const }
        : offer.motive === 'lateral'
          ? { label: 'Sideways', tone: 'neutral' as const }
          : { label: 'Step down', tone: 'warning' as const };

  return (
    <div
      style={{
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius)',
        border: `1px solid ${expanded ? 'var(--accent)' : 'var(--border)'}`,
        background: expanded ? 'var(--accent-soft)' : 'var(--surface)',
      }}
    >
      <button type="button" aria-expanded={expanded} onClick={onToggle} style={{ display: 'block', width: '100%', textAlign: 'left' }}>
        <span className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <strong>{offer.promotion.name}</strong>
          <span className="row" style={{ gap: 'var(--space-1)' }}>
            {offer.unmatchable.length > 0 && (
              <Chip tone="positive" title="Your current promotion cannot replicate this">
                Unmatchable
              </Chip>
            )}
            <Chip tone={motive.tone}>{motive.label}</Chip>
          </span>
        </span>

        {/* The three named futures. Money, route, level — never a bare purse to compare. */}
        <span className="stack" style={{ gap: 2, marginTop: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-sm)' }}>💷 {offer.money}</span>
          <span style={{ fontSize: 'var(--text-sm)' }}>🪜 {offer.route}</span>
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            ⚖️ {offer.level}
          </span>
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <ul style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
            <li>
              {offer.terms.fightsOwed} fights owed
              {offer.terms.exclusive ? ', exclusive' : ', non-exclusive'}
              {offer.terms.outsideBouts > 0 &&
                ` — ${offer.terms.outsideBouts} bouts elsewhere a year`}
            </li>
            {offer.terms.revenuePoints > 0 && (
              <li>
                <strong>{offer.terms.revenuePoints} points</strong> on the event revenue. Almost
                nobody gets these
              </li>
            )}
            {offer.terms.championshipExtension === 'standard' && (
              <li>
                <strong>You cannot leave while you hold the belt.</strong> It lets go two fights
                or a year after you lose it
              </li>
            )}
            {offer.terms.matchingRights && (
              <li>They may match a rival offer — and you are paid for granting that</li>
            )}
          </ul>

          {offer.unmatchable.length > 0 && (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <Alert tone="good" title="They cannot match this">
                {offer.unmatchable.join(' ')}
              </Alert>
            </div>
          )}

          {/*
            Two steps. Signing commits a multi-fight exclusive deal and then navigates away,
            which is both the most consequential decision on this screen and the hardest to
            notice you have made. The row already expands to reveal this button, so the first
            step is deliberate; this makes the second one deliberate too.
          */}
          {canSign ? (
            confirming ? (
              <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <Button variant="primary" onClick={onAccept}>
                  Yes — sign with {offer.promotion.shortName}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Not yet
                </Button>
              </div>
            ) : (
              <Button variant="primary" onClick={() => setConfirming(true)}>
                Sign with {offer.promotion.shortName}
              </Button>
            )
          ) : (
            <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
              You are under contract. This is what would be waiting if you were not.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
