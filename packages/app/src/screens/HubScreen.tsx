import { useMemo, useState } from 'react';
import {
  displayName,
  fighterAge,
  getDivision,
  overallRating,
  recordString,
  type Fighter,
  type MatchupAppraisal,
  type Promotion,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Stat } from '../ui';
import { bookFight, clearBooking, getBooking, getOffers } from '../game/career';
import { getLadderStatus, signWith, type LadderStatus } from '../game/progression';
import { formatGameDay } from '../shell/Shell';

/**
 * Career hub: who you are, what is next, and the one decision you can make right now.
 *
 * Deliberately single-purpose. The most common failure in a management game's home screen
 * is showing eight things of equal weight; here the primary action is always the largest
 * element on the screen and there is never more than one of it.
 */
export function HubScreen() {
  const { db, world, playerFighter, commit, updateWorld } = useGame();
  const { navigate } = useRouter();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pendingOffer, setPendingOffer] = useState<MatchupAppraisal | undefined>();
  const [booking, setBooking] = useState(() => getBooking(playerFighter?.id as string | undefined));

  const offers = useMemo(
    () => (playerFighter && !booking ? getOffers(db, playerFighter) : []),
    [db, playerFighter, booking, world.day],
  );

  const ladder = useMemo(
    () => (playerFighter ? getLadderStatus(db, playerFighter) : undefined),
    [db, playerFighter, world.day],
  );

  if (!playerFighter) {
    return (
      <Empty title="No career in progress">
        <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate({ name: 'create' })}>
            Create a fighter
          </Button>
          <Button onClick={() => navigate({ name: 'start' })}>Play as someone existing</Button>
        </div>
      </Empty>
    );
  }

  const fighter = playerFighter;
  const division = getDivision(fighter.divisionId);
  const opponent = booking
    ? (db.fighters.findById(booking.opponentId) as Fighter | undefined)
    : undefined;

  const accept = (offer: MatchupAppraisal) => {
    const next = bookFight(db, fighter, offer.opponent);
    setBooking(next);
    commit();
    navigate({ name: 'camp' });
  };

  const cancelBooking = () => {
    clearBooking();
    setBooking(undefined);
    setConfirmCancel(false);
  };

  /**
   * Sit out and let the calendar move.
   *
   * Fighting was originally the only thing that advanced time, which meant a fighter in a
   * thin division with nobody left to face had a permanently locked career — the rematch
   * cooldown could never expire.
   */
  const waitWeeks = (weeks: number) => {
    updateWorld({ day: world.day + weeks * 7 });
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 'var(--text-2xl)', lineHeight: 1.15 }}>
              {displayName(fighter)}
            </h2>
            <p className="muted">
              {division.name} · {fighterAge(fighter, world.day)} years old · {fighter.nationality}
            </p>
          </div>
        </div>

        <div className="stat-grid" style={{ marginTop: 'var(--space-4)' }}>
          <Stat value={recordString(fighter.summary)} label="Record" />
          <Stat
            value={Math.round(overallRating(fighter.attributes))}
            label="Overall"
          />
          <Stat value={`★ ${Math.round(fighter.starPower)}`} label="Star power" />
          <Stat
            value={Math.round(fighter.condition.confidence)}
            label="Confidence"
            tone={
              fighter.condition.confidence >= 65
                ? 'positive'
                : fighter.condition.confidence <= 35
                  ? 'negative'
                  : undefined
            }
          />
        </div>

        <div className="row" style={{ marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
          <Button size="sm" onClick={() => navigate({ name: 'fighter', id: fighter.id as string })}>
            Full profile
          </Button>
          {fighter.condition.headTrauma > 45 && (
            <Chip tone="warning" title="Accumulated career head trauma">
              Taking damage
            </Chip>
          )}
          {ladder?.isChampion && (
            <Chip tone="accent" title="Reigning divisional champion">
              🏆 Champion
            </Chip>
          )}
          {fighter.summary.streak >= 3 && <Chip tone="positive">{fighter.summary.streak}-fight win streak</Chip>}
          {fighter.summary.streak <= -2 && (
            <Chip tone="negative">{Math.abs(fighter.summary.streak)}-fight skid</Chip>
          )}
        </div>
      </Card>

      {ladder && <LadderCard ladder={ladder} onSign={(p) => { signWith(db, fighter, p); commit(); }} />}

      {!booking && ladder?.titleShot.eligible && (ladder.champion || ladder.position === 1) && (
        <Card title="Title fight" raised>
          <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>
              🏆
            </span>
            <p style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>
              {ladder.champion
                ? `For the belt, against ${displayName(ladder.champion)}`
                : 'For the vacant title'}
            </p>
          </div>
          <p className="muted prose" style={{ marginBottom: 'var(--space-3)' }}>
            Five rounds, a ten-week camp, and the {getDivision(fighter.divisionId).name} title on
            the line. This is what the climb was for.
          </p>
          <Button
            variant="primary"
            block
            onClick={() => {
              const opponent = ladder.champion ?? ladder.ranked[1]?.fighter;
              if (!opponent) return;
              setBooking(bookFight(db, fighter, opponent, { isTitleFight: true }));
              commit();
              navigate({ name: 'camp' });
            }}
          >
            Take the title fight
          </Button>
        </Card>
      )}

      {!booking && (
        <Card title="Between fights">
          <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
            Camps are where a career is actually made. Every week you train is a week older,
            and every area has a ceiling you cannot train past.
          </p>
          <Button variant="primary" block onClick={() => navigate({ name: 'training' })}>
            Go to training
          </Button>
        </Card>
      )}

      {booking && opponent ? (
        <Card title={booking.bout.isTitleFight ? 'Next fight — for the title' : 'Next fight'} raised>
          <p style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
            {booking.bout.isTitleFight && <span aria-hidden="true">🏆 </span>}
            vs {displayName(opponent)}
            {booking.bout.isTitleFight && <span className="visually-hidden"> for the title</span>}
          </p>
          <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
            {formatGameDay(booking.bout.day)} · {booking.bout.rounds} rounds ·{' '}
            {recordString(opponent.summary)}
          </p>
          <Button variant="primary" block onClick={() => navigate({ name: 'camp' })}>
            Go to camp
          </Button>
          {confirmCancel ? (
            <div className="stack" style={{ marginTop: 'var(--space-3)' }}>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                Withdrawing loses the camp you have built for this fight.
              </p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <Button variant="danger" size="sm" onClick={cancelBooking}>
                  Withdraw
                </Button>
                <Button size="sm" onClick={() => setConfirmCancel(false)}>
                  Keep the fight
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              block
              onClick={() => setConfirmCancel(true)}
              style={{ marginTop: 'var(--space-2)' }}
            >
              Withdraw from this fight
            </Button>
          )}
        </Card>
      ) : (
        <Card title="Choose your next fight" flush>
          {offers.length === 0 ? (
            <div className="empty">
              <p className="empty__title">No opponents available right now</p>
              <p style={{ marginBottom: 'var(--space-4)' }}>
                Everyone available in {division.name} has been fought recently. Sit out a few
                weeks and the picture will change.
              </p>
              <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button variant="primary" size="sm" onClick={() => waitWeeks(8)}>
                  Wait 8 weeks
                </Button>
                <Button size="sm" onClick={() => waitWeeks(26)}>
                  Wait 6 months
                </Button>
              </div>
            </div>
          ) : (
            <div className="list">
              {offers.map((offer) => (
                <OfferRow
                  key={offer.opponent.id}
                  offer={offer}
                  expanded={pendingOffer?.opponent.id === offer.opponent.id}
                  onSelect={() =>
                    setPendingOffer((current) =>
                      current?.opponent.id === offer.opponent.id ? undefined : offer,
                    )
                  }
                  onAccept={() => accept(offer)}
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function OfferRow({
  offer,
  expanded,
  onSelect,
  onAccept,
}: {
  offer: MatchupAppraisal;
  expanded: boolean;
  onSelect: () => void;
  onAccept: () => void;
}) {
  const { opponent, step, winChance } = offer;

  // Framed as difficulty rather than as a win percentage. A precise number would be false
  // precision — the paper odds cannot see style, preparation or the power curve, which are
  // exactly the things that decide fights.
  const difficulty =
    step >= 6
      ? { label: 'Step up', tone: 'negative' as const }
      : step <= -6
        ? { label: 'Favourable', tone: 'positive' as const }
        : { label: 'Even fight', tone: 'info' as const };

  return (
    <div>
      {/*
        Two steps, not one. Accepting determines the next two months of a career, and a
        full-width row that books on a single tap makes a mis-tap permanent. Settings already
        two-steps its destructive action; this is the more consequential one.
      */}
      <button type="button" className="list__item" aria-expanded={expanded} onClick={onSelect}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="list__primary" style={{ display: 'block' }}>
            {displayName(opponent)}
          </span>
          <span className="list__secondary" style={{ display: 'block' }}>
            {recordString(opponent.summary)} · star power {Math.round(opponent.starPower)} ·{' '}
            {winChance >= 0.6
              ? 'You are favoured'
              : winChance <= 0.4
                ? 'You are the underdog'
                : 'A coin flip'}
          </span>
        </span>
        <Chip tone={difficulty.tone}>{difficulty.label}</Chip>
      </button>

      {expanded && (
        <div
          style={{
            padding: 'var(--space-4)',
            background: 'var(--surface-sunken)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div className="stat-grid" style={{ marginBottom: 'var(--space-3)' }}>
            <Stat value={recordString(opponent.summary)} label="Record" />
            <Stat value={Math.round(overallRating(opponent.attributes))} label="Overall" />
            <Stat value={Math.round(opponent.starPower)} label="Star power" />
            <Stat value={getDivision(opponent.divisionId).shortName} label="Division" />
          </div>
          <p
            className="muted prose"
            style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}
          >
            Accepting books the fight for eight weeks time. You can withdraw before fight
            night, but you will lose the camp.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={onAccept}>
              Accept fight
            </Button>
            <Button onClick={onSelect}>Not this one</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Where you are on the climb.
 *
 * Deliberately the most prominent thing after the fighter card. A career mode without a
 * visible ladder is just a sequence of fights — the player needs to see the rung they are
 * on, the next one up, and exactly what it will take to reach it.
 */
function LadderCard({
  ladder,
  onSign,
}: {
  ladder: LadderStatus;
  onSign(promotion: Promotion): void;
}) {
  const { promotion, position, isChampion, titleShot, offers, progress } = ladder;

  const standing = isChampion
    ? 'Champion'
    : position === undefined
      ? 'Unranked'
      : `Ranked #${position}`;

  return (
    <Card title="The climb">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span>
          <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, display: 'block' }}>
            {standing}
          </span>
          <span className="muted">{promotion ? promotion.name : 'No promotion'}</span>
        </span>
        {promotion && (
          <Chip tone={promotion.tier === 'global' ? 'accent' : 'info'}>{promotion.tier}</Chip>
        )}
      </div>

      {/* One bar, from unsigned nobody to global champion. */}
      <div
        role="meter"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Career progress toward a world title"
        style={{
          height: 8,
          borderRadius: 'var(--radius-full)',
          background: 'var(--surface-sunken)',
          overflow: 'hidden',
          margin: 'var(--space-3) 0 var(--space-2)',
        }}
      >
        <div
          style={{
            width: `${Math.max(2, progress * 100)}%`,
            height: '100%',
            background: 'var(--accent)',
            transition: 'width var(--transition)',
          }}
        />
      </div>

      <p className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
        {titleShot.reason}
      </p>

      {offers.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <h3 className="section-title">Offers</h3>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {offers.map((offer) => (
              <div
                key={offer.promotion.id}
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--accent)',
                  background: 'var(--accent-soft)',
                }}
              >
                <p style={{ fontWeight: 700 }}>{offer.promotion.name}</p>
                <p className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
                  {offer.pitch}
                </p>
                <div className="row" style={{ marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Chip tone="positive">Signing bonus ${offer.bonus}k</Chip>
                  <Button size="sm" variant="primary" onClick={() => onSign(offer.promotion)}>
                    Sign with {offer.promotion.shortName}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
