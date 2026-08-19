/**
 * Belts, contenders and the queue behind them.
 *
 * The sporting spine of a promotion, and until now it existed only as a `champions` map nobody
 * could look at: a player wanting to know who held the welterweight belt, how long they had held
 * it, or who was next in line had to open the rankings for one division at a time and reason
 * about it themselves. A promoter thinks about all of them at once — that is what booking a year
 * is — so they belong on one screen.
 *
 * Every row answers the three questions that decide a card: who holds it, when they last
 * defended it, and who has earned the shot. A division whose champion has not fought in a year
 * and whose #1 contender is on a five-fight run is a card that writes itself, and it should be
 * visible in one glance rather than reconstructed.
 */

import { useMemo } from 'react';
import {
  championshipId,
  describeReign,
  displayName,
  getDivision,
  rankDivision,
  recordString,
  titleShotEligibility,
  type Championship,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, ListItem } from '../ui';
import { Alert } from '../ui/signals';
import { bookedOnPlans } from '../game/finances';
import { PromoterSubNav } from './promoterNav';

export function ChampionsScreen() {
  const { db, world } = useGame();
  const { navigate } = useRouter();

  const promotion = world.playerPromotionId
    ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
    : undefined;

  const booked = useMemo(
    () => bookedOnPlans(db, world.playerPromotionId, world.day),
    [db, world.playerPromotionId, world.day],
  );

  const divisions = useMemo(() => {
    if (!promotion) return [];
    const fighters = db.fighters.findAll() as Fighter[];
    const promotions = db.promotions.findAll() as unknown as Promotion[];

    return promotion.divisions.map((divisionId) => {
      const championId = promotion.champions[divisionId];
      const champion = championId
        ? (db.fighters.findById(championId as string) as Fighter | undefined)
        : undefined;

      const ranked = rankDivision(
        fighters,
        divisionId,
        promotion.id,
        world.day,
        championId,
        promotions,
      );

      const title = db.championships.findById(championshipId(promotion.id, divisionId)) as
        Championship | undefined;

      const contenders = ranked.filter((r) => r.position > 0).slice(0, 5);

      return {
        divisionId,
        champion,
        title,
        contenders,
        // Only the top few are worth an eligibility verdict; nobody at #11 is being considered.
        verdicts: contenders.slice(0, 3).map((c) => ({
          fighter: c.fighter,
          position: c.position,
          verdict: titleShotEligibility(c.fighter, ranked, promotion),
        })),
      };
    });
  }, [db, promotion, world.day]);

  if (!promotion) {
    return (
      <Empty title="No promotion">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Choose one
        </Button>
      </Empty>
    );
  }

  const vacant = divisions.filter((d) => !d.champion).length;

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <PromoterSubNav current="champions" />

      {vacant > 0 && (
        <Alert tone="warn" title={`${vacant} ${vacant === 1 ? 'belt is' : 'belts are'} vacant`}>
          A division without a champion has nothing to climb toward, and the contenders in it stop
          having a reason to take hard fights.
        </Alert>
      )}

      {/*
        Two divisions across on a desktop.
        
        Eight divisions of champion-plus-queue is a six-thousand-pixel column at 1440px, which is
        the "stretched a phone screen wider" failure this rework exists to fix. The grid does not
        change what a division card says; it changes how many of them a promoter can compare
        without scrolling.
      */}
      <div className="division-grid">
        {divisions.map(({ divisionId, champion, title, contenders, verdicts }) => {
          const idle = champion
            ? world.day - (champion.record[champion.record.length - 1]?.day ?? world.day)
            : 0;

          return (
            <Card key={divisionId} title={getDivision(divisionId).name}>
              <div className="stack" style={{ gap: 'var(--space-3)' }}>
                {champion ? (
                  <div>
                    <button
                      type="button"
                      className="record-row__link"
                      style={{ fontSize: 'var(--text-lg)', fontWeight: 800, textAlign: 'left' }}
                      onClick={() => navigate({ name: 'fighter', id: champion.id as string })}
                    >
                      {displayName(champion)}
                    </button>
                    <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                      {recordString(champion.summary)}
                      {title ? ` · ${describeReign(title, world.day)}` : ''}
                    </p>
                    <span
                      className="row"
                      style={{
                        gap: 'var(--space-1)',
                        marginTop: 'var(--space-2)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <Chip tone="accent">Champion</Chip>
                      {booked.has(champion.id as string) ? (
                        <Chip tone="positive">Defence booked</Chip>
                      ) : (
                        <Chip tone={idle > 300 ? 'negative' : idle > 180 ? 'warning' : 'neutral'}>
                          {idle > 180
                            ? `${Math.round(idle / 30)} months idle, nothing booked`
                            : 'No defence booked'}
                        </Chip>
                      )}
                    </span>
                  </div>
                ) : (
                  <p className="prose" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                    <strong>Vacant.</strong> The winner of the right fight between two ranked
                    contenders takes it.
                  </p>
                )}

                {/*
                The queue. Naming the top three and saying whether each has actually earned the
                call is the difference between a ranking table and a matchmaking decision.
              */}
                {verdicts.length > 0 && (
                  <div className="stack" style={{ gap: 'var(--space-1)' }}>
                    <p className="section-title" style={{ margin: 0 }}>
                      Next in line
                    </p>
                    {verdicts.map(({ fighter, position, verdict }) => (
                      <button
                        key={fighter.id}
                        type="button"
                        className="candidate"
                        onClick={() => navigate({ name: 'fighter', id: fighter.id as string })}
                      >
                        <span className="candidate__head">
                          <span className="candidate__name">{displayName(fighter)}</span>
                          <span className="candidate__rank">#{position}</span>
                        </span>
                        <span className="candidate__line">
                          {recordString(fighter.summary)}
                          {fighter.summary.streak > 0
                            ? ` · ${fighter.summary.streak} straight ${
                                fighter.summary.streak === 1 ? 'win' : 'wins'
                              }`
                            : ''}
                        </span>
                        <span className="candidate__chips">
                          <Chip tone={verdict.eligible ? 'positive' : 'neutral'}>
                            {verdict.eligible ? 'Eligible for the shot' : 'Not yet'}
                          </Chip>
                          {booked.has(fighter.id as string) && <Chip tone="info">Booked</Chip>}
                        </span>
                        <span className="candidate__why">{verdict.reason}</span>
                      </button>
                    ))}
                  </div>
                )}

                {contenders.length > 3 && (
                  <div className="list">
                    {contenders.slice(3).map((c) => (
                      <ListItem
                        key={c.fighter.id}
                        onClick={() => navigate({ name: 'fighter', id: c.fighter.id as string })}
                        primary={`#${c.position} ${displayName(c.fighter)}`}
                        secondary={recordString(c.fighter.summary)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
