import { useMemo, useState } from 'react';
import {
  displayName,
  fighterAge,
  getDivision,
  overallRating,
  recordString,
  type Fighter,
  type MatchupAppraisal,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, ListItem, Stat } from '../ui';
import { bookFight, getBooking, getOffers } from '../game/career';
import { formatGameDay } from '../shell/Shell';

/**
 * Career hub: who you are, what is next, and the one decision you can make right now.
 *
 * Deliberately single-purpose. The most common failure in a management game's home screen
 * is showing eight things of equal weight; here the primary action is always the largest
 * element on the screen and there is never more than one of it.
 */
export function HubScreen() {
  const { db, world, playerFighter, commit } = useGame();
  const { navigate } = useRouter();
  const [booking, setBooking] = useState(() => getBooking());

  const offers = useMemo(
    () => (playerFighter && !booking ? getOffers(db, playerFighter) : []),
    [db, playerFighter, booking, world.day],
  );

  if (!playerFighter) {
    return (
      <Empty title="No career in progress">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Pick a fighter
        </Button>
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
          {fighter.summary.streak >= 3 && <Chip tone="positive">{fighter.summary.streak}-fight win streak</Chip>}
          {fighter.summary.streak <= -2 && (
            <Chip tone="negative">{Math.abs(fighter.summary.streak)}-fight skid</Chip>
          )}
        </div>
      </Card>

      {booking && opponent ? (
        <Card title="Next fight" raised>
          <p style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
            vs {displayName(opponent)}
          </p>
          <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
            {formatGameDay(booking.bout.day)} · {booking.bout.rounds} rounds ·{' '}
            {recordString(opponent.summary)}
          </p>
          <Button variant="primary" block onClick={() => navigate({ name: 'camp' })}>
            Go to camp
          </Button>
        </Card>
      ) : (
        <Card title="Choose your next fight" flush>
          {offers.length === 0 ? (
            <Empty title="No available opponents">
              Everyone in the division has been fought recently.
            </Empty>
          ) : (
            <div className="list">
              {offers.map((offer) => (
                <OfferRow key={offer.opponent.id} offer={offer} onAccept={() => accept(offer)} />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function OfferRow({ offer, onAccept }: { offer: MatchupAppraisal; onAccept: () => void }) {
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
    <ListItem
      onClick={onAccept}
      primary={displayName(opponent)}
      secondary={
        <>
          {recordString(opponent.summary)} · ★ {Math.round(opponent.starPower)} ·{' '}
          {winChance >= 0.6 ? 'You are favoured' : winChance <= 0.4 ? 'You are the underdog' : 'A coin flip'}
        </>
      }
      trailing={<Chip tone={difficulty.tone}>{difficulty.label}</Chip>}
    />
  );
}
