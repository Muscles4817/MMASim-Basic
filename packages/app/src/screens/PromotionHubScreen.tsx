/**
 * The promoter's home.
 *
 * Deliberately the same shape as the fighter's hub: who you are, what is next, and the one
 * decision you can make right now. A promotion has more state than a fighter and the temptation
 * is a dashboard of gauges — buzz, prestige, budget, roster health — but a gauge is a number
 * with no verb attached, and the rule from the UX review is that a promoter number is only
 * worth showing once it has changed or once it is about to decide something.
 *
 * So `budget` is not a bank balance in a header, it is *what it can still buy*. `buzz` is not a
 * dial, it is the crowd the next card would draw. Those are the same numbers made actionable.
 */

import { useMemo } from 'react';
import {
  displayName,
  expectedDemand,
  recordString,
  type Fighter,
  type FightNight,
  type Promotion,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Empty, ListItem } from '../ui';
import { Alert, Fact, KeyStat } from '../ui/signals';
import { NewsFeed } from '../ui/NewsFeed';
import { formatGameDay } from '../shell/Shell';

export function PromotionHubScreen() {
  const { db, world } = useGame();
  const { navigate } = useRouter();

  const promotion = world.playerPromotionId
    ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
    : undefined;

  const scheduled = useMemo(() => {
    if (!promotion) return undefined;
    return (db.events.findAll() as FightNight[])
      .filter((e) => e.promotionId === promotion.id && e.status === 'scheduled')
      .sort((a, b) => a.day - b.day)[0];
  }, [db, promotion, world.day]);

  const roster = useMemo(
    () =>
      promotion
        ? (db.fighters.findAll() as Fighter[]).filter(
            (f) => f.promotionId === promotion.id && f.retiredDay === undefined,
          )
        : [],
    [db, promotion, world.day],
  );

  if (!promotion) {
    return (
      <Empty title="No promotion">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Choose one
        </Button>
      </Empty>
    );
  }

  const inactive = roster.filter(
    (f) => f.record.length === 0 || world.day - (f.record[f.record.length - 1]?.day ?? 0) > 365,
  );

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <p className="section-title">{promotion.name}</p>

        {/*
          The one number that matters most, expressed as the thing it decides.
          Buzz is not a dial the player can act on; the crowd it produces is.
        */}
        <KeyStat
          value={expectedDemand(promotion, 120, 9).toLocaleString()}
          label="Who would come to your next card"
          detail={`On a typical main event. ${promotion.baseCountry} · ${describeTier(promotion)}`}
        />

        <div className="facts" style={{ marginTop: 'var(--space-3)' }}>
          <Fact
            label="To spend"
            value={`£${Math.round(promotion.budget).toLocaleString()}k`}
            hint={describeBudget(promotion)}
            emphasis="secondary"
          />
          <Fact
            label="Under contract"
            value={roster.length}
            hint={`Across ${new Set(roster.map((f) => f.divisionId)).size} divisions.`}
            emphasis="secondary"
          />
        </div>
      </Card>

      {/*
        The one decision, in the fighter hub's own idiom: either there is a card to build or
        there is a card to run, and never both at once.
      */}
      <Card title={scheduled ? 'Your next card' : 'Nothing booked'}>
        {scheduled ? (
          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            <div>
              <p style={{ fontWeight: 700, margin: 0 }}>{scheduled.name}</p>
              <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                {formatGameDay(scheduled.day)} · {scheduled.venue.name},{' '}
                {scheduled.venue.city} · {scheduled.bouts.length} fights
              </p>
            </div>
            <Button variant="primary" block onClick={() => navigate({ name: 'card' })}>
              Go to fight night
            </Button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
              A date with nothing on it is the only thing a promoter cannot afford. Build the
              card.
            </p>
            <Button variant="primary" block onClick={() => navigate({ name: 'card' })}>
              Build a card
            </Button>
          </div>
        )}
      </Card>

      {/*
        Roster health as a list of people who need something, not a gauge. A count with a
        consequence is actionable; a percentage is not.
      */}
      {inactive.length > 0 && (
        <Alert tone={inactive.length > roster.length / 3 ? 'warn' : 'info'} title="Sitting idle">
          {inactive.length} of your {roster.length} fighters have not been on a card in the last
          year. Your deal says you owe each of them {promotion.activityGuarantee} a year.
        </Alert>
      )}

      <Card flush title="Your roster">
        <div className="list">
          {roster
            .slice()
            .sort((a, b) => b.starPower - a.starPower)
            .slice(0, 6)
            .map((f) => (
              <ListItem
                key={f.id}
                onClick={() => navigate({ name: 'fighter', id: f.id as string })}
                primary={displayName(f)}
                secondary={`${recordString(f.summary)} · ${f.divisionId}`}
              />
            ))}
        </div>
      </Card>

      <Card title="The sport">
        <NewsFeed
          items={db.news.findAll() as never}
          limit={8}
          onFighterClick={(id) => navigate({ name: 'fighter', id })}
          emptyMessage="Nothing yet. Run a card, and the sport will get on with itself while you do."
        />
      </Card>
    </div>
  );
}

const describeTier = (promotion: Promotion): string =>
  promotion.tier === 'global'
    ? 'The biggest promotion in the sport'
    : promotion.tier === 'major'
      ? 'A major, and a genuine alternative to the leader'
      : 'A regional promotion — this is where careers start';

/**
 * The budget as what it can buy, not as a balance.
 *
 * `HubScreen` reads a fighter's bank against the camp they are about to run rather than as a
 * number, for the same reason: a figure with nothing to compare it to teaches the player
 * nothing about whether it is a lot.
 */
function describeBudget(promotion: Promotion): string {
  const cards = Math.floor(promotion.budget / Math.max(1, promotion.minimumPurse * 18 * 3));
  if (cards <= 0) return 'Not enough to put on another card at your own minimum. This is trouble.';
  if (cards < 4) return `Roughly ${cards} more card${cards === 1 ? '' : 's'} at what you pay now.`;
  return `Comfortable — around ${cards} cards at what you pay now.`;
}
