/**
 * The promoter's command centre.
 *
 * What this screen used to be: the promotion's name, one budget figure, a roster count, a card
 * that said "Nothing booked", and the first six names on the roster sorted by star power. Every
 * one of those is a fact about the promotion and none of them is a decision. A player could open
 * it, read it in four seconds, and still not know that their lightweight champion had not
 * fought in eleven months, that three deals ran out next month, or that the March card had
 * nobody topping it.
 *
 * What it is now: **what is happening, what needs you, what is coming, and what it costs.** The
 * simulation already knew all of it; nothing was asking. `game/attention.ts` does the asking and
 * this screen does the ranking and the layout.
 *
 * The desktop layout is the other half of the change. A promoter's decisions are comparative —
 * *can I afford this card, is this fighter worth what the next one costs* — and a single 56rem
 * column forces those comparisons to happen across a scroll. So the work goes on the left and
 * the standing context sits beside it: the pipeline against the money, the attention feed
 * against the champions. Mobile keeps one column, in the same order.
 */

import { useMemo } from 'react';
import {
  careerArc,
  describeHealth,
  displayName,
  getDivision,
  isActive,
  planHealth,
  planProgress,
  rankDivision,
  recordString,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, ListItem } from '../ui';
import { Fact, KeyStat } from '../ui/signals';
import { AttentionRow, Console, Ledger, LedgerRow, LedgerRule, PipelineCard } from '../ui/promoter';
import { NewsFeed } from '../ui/NewsFeed';
import { formatGameDay } from '../shell/Shell';
import { money } from '../ui/format';
import { attentionFor } from '../game/attention';
import { describeRunway, financialSnapshot } from '../game/finances';
import { forecastPlan, plansFor, promoterContext } from '../game/plans';
import { PromoterSubNav } from './promoterNav';

/** How many rows the dashboard shows before it stops being a dashboard. */
const ATTENTION_SHOWN = 6;
const PIPELINE_SHOWN = 4;

export function PromotionHubScreen() {
  const { db, world, commit } = useGame();
  const { navigate } = useRouter();
  void commit;

  const promotion = world.playerPromotionId
    ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
    : undefined;

  const roster = useMemo(
    () =>
      promotion
        ? (db.fighters.findAll() as Fighter[]).filter(
            (f) => f.promotionId === promotion.id && isActive(f, world.day),
          )
        : [],
    [db, promotion, world.day],
  );

  const plans = useMemo(
    () => (promotion ? plansFor(db, promotion.id as string).filter((p) => p.day >= world.day) : []),
    [db, promotion, world.day],
  );

  const attention = useMemo(() => attentionFor(db, promotion), [db, promotion, world.day]);

  const nextForecast = useMemo(() => {
    if (!promotion || !plans[0]) return undefined;
    return forecastPlan({
      ctx: promoterContext({ db, promotion, day: world.day }),
      plan: plans[0],
    });
  }, [db, promotion, plans, world.day]);

  const finances = useMemo(
    () =>
      promotion
        ? financialSnapshot({ db, promotion, nextCardProfit: nextForecast?.projectedProfit })
        : undefined,
    [db, promotion, nextForecast, world.day],
  );

  const champions = useMemo(() => {
    if (!promotion) return [];
    const fighters = db.fighters.findAll() as Fighter[];
    return promotion.divisions
      .map((divisionId) => {
        const championId = promotion.champions[divisionId];
        const champion = championId
          ? (db.fighters.findById(championId as string) as Fighter | undefined)
          : undefined;
        const ranked = rankDivision(fighters, divisionId, promotion.id, world.day, championId);
        const contender = ranked.find((r) => r.position === 1)?.fighter;
        return { divisionId, champion, contender };
      })
      .filter((row) => row.champion !== undefined || row.contender !== undefined);
  }, [db, promotion, world.day]);

  const spotlight = useMemo(() => {
    if (!promotion) return [];
    return roster
      .map((fighter) => {
        const arc = careerArc({ fighter, day: world.day });
        return { fighter, arc };
      })
      .filter((row) => row.arc.id === 'hotProspect' || row.arc.id === 'contender')
      .sort((a, b) => b.fighter.summary.streak - a.fighter.summary.streak)
      .slice(0, 4);
  }, [promotion, roster, world.day]);

  if (!promotion) {
    return (
      <Empty title="No promotion">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Choose one
        </Button>
      </Empty>
    );
  }

  const next = plans[0];

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <PromoterSubNav current="promotion" />

      <Console
        main={
          <>
            {/*
              The event pipeline, which is the answer to "what is coming". A promoter's job is a
              sequence of dates with holes in them, and the old "Nothing booked" card could only
              ever describe the first one.
            */}
            <Card
              title={next ? 'Next event' : 'Nothing booked'}
              action={
                <Button size="sm" onClick={() => navigate({ name: 'calendar' })}>
                  Plan a card
                </Button>
              }
            >
              {next ? (
                <div className="stack" style={{ gap: 'var(--space-3)' }}>
                  <div>
                    <p style={{ fontSize: 'var(--text-xl)', fontWeight: 800, margin: 0 }}>
                      {next.name}
                    </p>
                    <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                      {formatGameDay(next.day)} · {next.city} · in {next.day - world.day} days
                    </p>
                  </div>

                  {(() => {
                    const progress = planProgress(next);
                    return (
                      <>
                        <div className="facts">
                          <Fact
                            label="Fights booked"
                            value={`${progress.agreed} / ${progress.slots}`}
                            tone={progress.agreed < progress.slots ? 'warn' : 'good'}
                            emphasis="secondary"
                          />
                          <Fact
                            label="Main event"
                            value={progress.hasMainEvent ? 'Confirmed' : 'Empty'}
                            tone={progress.hasMainEvent ? 'good' : 'bad'}
                            emphasis="secondary"
                          />
                          <Fact
                            label="Title fights"
                            value={progress.titleFights}
                            emphasis="tertiary"
                          />
                        </div>

                        {nextForecast && (
                          <div className="facts">
                            <Fact
                              label="Projected attendance"
                              value={nextForecast.expectedAttendance.toLocaleString()}
                              emphasis="secondary"
                            />
                            <Fact
                              label="Purses committed"
                              value={money(nextForecast.purses)}
                              emphasis="secondary"
                            />
                            <Fact
                              label="Projected result"
                              value={money(nextForecast.projectedProfit)}
                              tone={nextForecast.projectedProfit >= 0 ? 'good' : 'bad'}
                              emphasis="secondary"
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <Button
                    variant="primary"
                    block
                    onClick={() => navigate({ name: 'plan', id: next.id })}
                  >
                    {planProgress(next).complete ? 'Open the card' : 'Continue booking'}
                  </Button>
                </div>
              ) : (
                <div className="stack" style={{ gap: 'var(--space-3)' }}>
                  <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
                    A date with nothing on it is the only thing a promoter cannot afford. Pick a
                    date months out, put your champion on it, and fill the rest as the year
                    happens.
                  </p>
                  <Button variant="primary" block onClick={() => navigate({ name: 'calendar' })}>
                    Plan a card
                  </Button>
                </div>
              )}
            </Card>

            {plans.length > 1 && (
              <Card title="After that">
                <div className="pipeline">
                  {plans.slice(1, PIPELINE_SHOWN + 1).map((plan) => {
                    const progress = planProgress(plan);
                    const health = planHealth(plan);
                    return (
                      <PipelineCard
                        key={plan.id}
                        name={plan.name}
                        when={formatGameDay(plan.day)}
                        meta={`${plan.city} · ${describeHealth(health)}`}
                        filled={progress.filled}
                        slots={progress.slots}
                        state={health === 'run' || health === 'cancelled' ? 'thin' : health}
                        onClick={() => navigate({ name: 'plan', id: plan.id })}
                      />
                    );
                  })}
                </div>
              </Card>
            )}

            {/*
              The attention feed. The single most important thing on the screen, and the thing
              the old dashboard came closest to having — its one "Sitting idle" warning was the
              right idea, applied to one of the fifteen situations that deserve it.
            */}
            <Card
              title="Needs you"
              action={
                attention.length > ATTENTION_SHOWN ? (
                  <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                    {attention.length} open
                  </span>
                ) : undefined
              }
            >
              {attention.length === 0 ? (
                <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
                  Nothing is on fire. Every card has a main event, every belt has a defence in
                  sight, and nobody is owed a bout they have not been offered. Enjoy it.
                </p>
              ) : (
                <div className="attention">
                  {attention.slice(0, ATTENTION_SHOWN).map((item) => {
                    const action = item.action;
                    return (
                      <AttentionRow
                        key={item.id}
                        tone={item.tone}
                        title={item.title}
                        detail={item.detail}
                        cue={action?.label}
                        onClick={
                          action
                            ? () =>
                                navigate(
                                  action.id
                                    ? ({ name: action.route, id: action.id } as never)
                                    : ({ name: action.route } as never),
                                )
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              )}
            </Card>

            {/*
              Roster rows that earn their place. The old version showed the first six fighters by
              star power, which answers no question at all — every row here says why this person
              is on the dashboard today rather than yesterday.
            */}
            {spotlight.length > 0 && (
              <Card flush title="Worth your attention">
                <div className="list">
                  {spotlight.map(({ fighter, arc }) => (
                    <ListItem
                      key={fighter.id}
                      onClick={() => navigate({ name: 'fighter', id: fighter.id as string })}
                      primary={displayName(fighter)}
                      secondary={`${recordString(fighter.summary)} · ${getDivision(fighter.divisionId).name}`}
                      trailing={
                        <Chip tone={arc.tone === 'good' ? 'positive' : 'info'}>{arc.label}</Chip>
                      }
                    />
                  ))}
                </div>
              </Card>
            )}

            <Card title="The sport">
              <NewsFeed
                items={db.news.findAll() as never}
                limit={8}
                onFighterClick={(id) => navigate({ name: 'fighter', id })}
                emptyMessage="Nothing yet. Run a card, and the sport will get on with itself while you do."
              />
            </Card>
          </>
        }
        side={
          <>
            <Card raised>
              <p className="section-title">{promotion.name}</p>
              <KeyStat
                value={money(promotion.budget)}
                label="Cash on hand"
                detail={finances ? describeRunway(finances) : undefined}
                tone={promotion.budget <= 0 ? 'bad' : undefined}
              />
            </Card>

            {/*
              The money, as an operating position rather than a balance. And in one notation:
              the header, this card and every figure on the card builder all render through the
              same formatter, so £5.4m and £5,400k can never again be the same number.
            */}
            {finances && (
              <Card title="The books">
                <Ledger>
                  <LedgerRow label="Monthly burn" value={money(finances.monthlyBurn)} tone="bad" />
                  <LedgerRow label="— overheads" value={money(finances.overheads)} />
                  <LedgerRow
                    label={`— roster (${finances.rosterSize})`}
                    value={money(finances.rosterUpkeep)}
                  />
                  <LedgerRule />
                  <LedgerRow label="Committed to booked fights" value={money(finances.committed)} />
                  <LedgerRow
                    label="Guaranteed if all fought"
                    value={money(finances.guaranteedNext)}
                  />
                  {nextForecast && (
                    <>
                      <LedgerRule />
                      <LedgerRow
                        label="Next card, projected"
                        value={money(nextForecast.projectedProfit)}
                        tone={nextForecast.projectedProfit >= 0 ? 'good' : 'bad'}
                      />
                    </>
                  )}
                </Ledger>
              </Card>
            )}

            <Card flush title="Champions">
              <div className="list">
                {champions.map(({ divisionId, champion, contender }) => (
                  <ListItem
                    key={divisionId}
                    onClick={
                      champion
                        ? () => navigate({ name: 'fighter', id: champion.id as string })
                        : contender
                          ? () => navigate({ name: 'fighter', id: contender.id as string })
                          : undefined
                    }
                    primary={champion ? displayName(champion) : 'Vacant'}
                    secondary={`${getDivision(divisionId).shortName}${
                      contender ? ` · #1 ${displayName(contender)}` : ''
                    }`}
                    trailing={champion ? undefined : <Chip tone="warning">Vacant</Chip>}
                  />
                ))}
              </div>
            </Card>

            <Card title="The promotion">
              <div className="facts">
                <Fact
                  label="Under contract"
                  value={roster.length}
                  hint={`Across ${new Set(roster.map((f) => f.divisionId)).size} divisions.`}
                  emphasis="secondary"
                />
                <Fact
                  label="Standing"
                  value={describeTier(promotion)}
                  emphasis="tertiary"
                  hint={`${promotion.baseCountry}. Attention sits at ${Math.round(promotion.buzz)} out of 100.`}
                />
              </div>
            </Card>
          </>
        }
      />
    </div>
  );
}

const describeTier = (promotion: Promotion): string =>
  promotion.tier === 'global'
    ? 'The biggest in the sport'
    : promotion.tier === 'major'
      ? 'A genuine major'
      : promotion.tier === 'regional'
        ? 'Regional'
        : 'Developmental';
