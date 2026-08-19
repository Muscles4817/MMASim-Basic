/**
 * The roster, from the promotion's chair.
 *
 * Doc 13 gave promoter mode a Roster screen *and* a Contracts screen, and the UX review was
 * right that they are the same screen: contract state is a property of a fighter, not a second
 * population. So this is one list sorted by **who needs a decision** — anybody about to walk,
 * anybody idle long enough to void their deal, anybody aggrieved — with everything else behind a
 * filter.
 *
 * What is new here is the third population, which was genuinely missing rather than merely
 * duplicated: **free agents**. A promotion's roster is not a fixed set, and until now the only
 * way anybody joined one was the world's own signing pass. A promoter who has just lost a
 * lightweight and can see two unsigned lightweights should be able to do something about it from
 * the screen where they noticed.
 *
 * Every row also now says whether the person is *booked*, which is the question the whole screen
 * was implicitly about: "needs a decision" means nothing if you cannot tell that you already made
 * it last week.
 */

import { useMemo, useState } from 'react';
import {
  askingPrice,
  careerArc,
  defaultTerms,
  displayName,
  getDivision,
  isActive,
  periodCosts,
  recordString,
  type Fighter,
  type FighterHandling,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Segmented } from '../ui';
import { Alert, Fact } from '../ui/signals';
import { money } from '../ui/format';
import { bookedOnPlans } from '../game/finances';
import { daysUnbookedBy } from '../game/plans';
import { sign } from '../game/contracts';
import { PromoterSubNav } from './promoterNav';

/** What is wrong with this fighter's situation, if anything. Drives the whole sort. */
interface Attention {
  fighter: Fighter;
  /** Higher sorts first. */
  urgency: number;
  label?: string;
  tone?: 'warn' | 'danger' | 'info';
  booked: boolean;
}

type View = 'needing' | 'all' | 'free';

export function PromoterRosterScreen() {
  const { db, world, commit } = useGame();
  const { navigate } = useRouter();
  const [confirmingCut, setConfirmingCut] = useState<string | undefined>();
  const [view, setView] = useState<View>('needing');
  const [signed, setSigned] = useState<string | undefined>();

  const promotion = world.playerPromotionId
    ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
    : undefined;

  const booked = useMemo(
    () => bookedOnPlans(db, world.playerPromotionId, world.day),
    [db, world.playerPromotionId, world.day, signed],
  );

  const roster = useMemo<Attention[]>(() => {
    if (!promotion) return [];
    const all = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === promotion.id && f.retiredDay === undefined,
    );

    return all
      .map<Attention>((fighter) => {
        const agreement = fighter.agreementId
          ? (db.agreements.findById(fighter.agreementId as string) as
              PromotionalAgreement | undefined)
          : undefined;

        const isBooked = booked.has(fighter.id as string);
        /*
         * Measured from the start of the save for anybody who has not fought since it began.
         *
         * A seeded fighter's real career lives in `priorRecord`, which carries no dates, so
         * treating an empty record as an infinite layoff flags the entire roster on day one —
         * seventy-two rows all saying the same thing, which is the opposite of a list sorted by
         * who needs a decision.
         */
        const idleDays = daysUnbookedBy(fighter, world.day, world.startedDay ?? world.day);
        const boutsThisYear = fighter.record.filter((r) => world.day - r.day < 365).length;

        /*
         * The activity guarantee, which is enforced rather than decorative. Somebody already on
         * a card is *not* in breach, however long they have been idle — booking them is the
         * remedy, and a list that keeps shouting after the player has acted teaches them to stop
         * reading it.
         */
        if (
          agreement &&
          !isBooked &&
          idleDays > 300 &&
          boutsThisYear < agreement.activityGuarantee
        ) {
          return {
            fighter,
            booked: isBooked,
            urgency: 100,
            tone: 'danger',
            label: `Owed ${agreement.activityGuarantee} bouts a year, given ${boutsThisYear}. Can walk.`,
          };
        }

        if (agreement && agreement.fightsRemaining <= 1) {
          return {
            fighter,
            booked: isBooked,
            urgency: 80,
            tone: 'warn',
            label:
              agreement.fightsRemaining === 0
                ? 'Obligations met — free to talk to anybody.'
                : 'One fight left on the deal.',
          };
        }

        if (fighter.resentment > 60) {
          return {
            fighter,
            booked: isBooked,
            urgency: 60,
            tone: 'warn',
            label: 'Unhappy with the deal, and it is making them hard to book.',
          };
        }

        if (idleDays > 200 && !isBooked) {
          return {
            fighter,
            booked: isBooked,
            urgency: 40,
            tone: 'info',
            label: 'Has not been on a card in a while.',
          };
        }

        return { fighter, booked: isBooked, urgency: 0 };
      })
      .sort((a, b) => b.urgency - a.urgency || b.fighter.starPower - a.fighter.starPower);
  }, [db, promotion, world.day, booked]);

  /*
   * The unsigned pool, filtered to the divisions this promotion actually runs. A free agent at a
   * weight you do not promote is not an opportunity, and listing them would bury the ones that
   * are.
   */
  const freeAgents = useMemo(() => {
    if (!promotion) return [];
    return (db.fighters.findAll() as Fighter[])
      .filter(
        (f) =>
          f.promotionId === undefined &&
          isActive(f, world.day) &&
          promotion.divisions.includes(f.divisionId),
      )
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 25);
  }, [db, promotion, world.day, signed]);

  if (!promotion) {
    return (
      <Empty title="No promotion">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Choose one
        </Button>
      </Empty>
    );
  }

  const needing = roster.filter((r) => r.urgency > 0);
  const costs = periodCosts({ promotion, rosterSize: roster.length });

  const setHandling = (fighter: Fighter, handling: FighterHandling | undefined) => {
    db.fighters.upsert({ ...fighter, handling } as Fighter & { id: string });
    commit();
  };

  const cut = (fighter: Fighter) => {
    if (fighter.agreementId) {
      const agreement = db.agreements.findById(fighter.agreementId as string);
      if (agreement) db.agreements.upsert({ ...agreement, status: 'terminated' } as never);
    }
    db.fighters.upsert({
      ...fighter,
      promotionId: undefined,
      agreementId: undefined,
      handling: undefined,
    } as Fighter & { id: string });
    setConfirmingCut(undefined);
    commit();
  };

  /**
   * Sign a free agent at the going rate.
   *
   * Deliberately not a negotiation screen. The price is what they are worth plus whatever their
   * `purseDemand` adds, and the decision being made is *whether this person is worth a roster
   * spot at that price* — not whether the player can haggle two thousand off it. Haggling
   * belongs where it changes something, which is the bout offer.
   */
  const signFreeAgent = (fighter: Fighter) => {
    const terms = defaultTerms(fighter, promotion);
    const ask = askingPrice(fighter, promotion);
    const result = sign(db, fighter, promotion, {
      showPurse: terms.showPurse,
      winBonus: terms.winBonus,
      signingBonus: Math.round(ask * 0.25 * 10) / 10,
      revenuePoints: 0,
      fightsOwed: 4,
      championshipExtension: 'standard',
      matchingRights: false,
      exclusive: true,
      outsideBouts: 0,
    });
    if (result.ok) {
      setSigned(fighter.id as string);
      commit();
    }
  };

  /*
   * The full roster is capped.
   *
   * Seventy-two rows, each carrying a four-option handling control and a release button, is
   * nine thousand pixels of page — and the useful ordering is already "who needs a decision",
   * which the other view is. This is the browse view, not the work view.
   */
  const ROSTER_SHOWN = 30;
  const shown = view === 'needing' ? needing : view === 'all' ? roster.slice(0, ROSTER_SHOWN) : [];

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <PromoterSubNav current="roster" />

      <Card raised>
        <div className="facts">
          <Fact
            label="Under contract"
            value={roster.length}
            hint={`Costing ${money(costs.rosterUpkeep)} a fortnight to keep on the books, fighting or not.`}
          />
          <Fact
            label="Need a decision"
            value={needing.length}
            tone={needing.length > 0 ? 'warn' : undefined}
            hint="Expiring, idle long enough to walk, or unhappy enough to be hard to book."
          />
          <Fact
            label="Booked"
            value={roster.filter((r) => r.booked).length}
            emphasis="tertiary"
            hint="Already on a card you are planning."
          />
        </div>
      </Card>

      <Segmented
        label="Which population"
        value={view}
        onChange={setView}
        options={[
          { value: 'needing', label: 'Need something', hint: `${needing.length} people` },
          { value: 'all', label: 'Everybody', hint: `${roster.length} under contract` },
          { value: 'free', label: 'Free agents', hint: `${freeAgents.length} available` },
        ]}
      />

      {view === 'needing' && needing.length === 0 && (
        <Alert tone="good" title="Nothing on fire">
          Everybody is under contract, busy enough, and reasonably content. Enjoy it.
        </Alert>
      )}

      {view === 'free' ? (
        <Card flush title="Free agents in your divisions">
          <div className="list">
            {freeAgents.length === 0 && (
              <p
                className="faint prose"
                style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)' }}
              >
                Nobody unsigned at the weights you run.
              </p>
            )}
            {freeAgents.map((fighter) => {
              const arc = careerArc({ fighter, day: world.day });
              const ask = askingPrice(fighter, promotion);
              return (
                <div key={fighter.id} className="stack" style={{ gap: 0 }}>
                  <button
                    type="button"
                    className="list__item"
                    onClick={() => navigate({ name: 'fighter', id: fighter.id as string })}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="list__primary" style={{ display: 'block' }}>
                        {displayName(fighter)}
                      </span>
                      <span className="list__secondary" style={{ display: 'block' }}>
                        {recordString(fighter.summary)} · {getDivision(fighter.divisionId).name} ·
                        around {money(ask)} a fight
                      </span>
                      <span style={{ display: 'block', marginTop: 'var(--space-1)' }}>
                        <Chip tone={arc.tone === 'good' ? 'positive' : 'info'}>{arc.label}</Chip>
                      </span>
                    </span>
                  </button>
                  <div
                    className="row"
                    style={{ gap: 'var(--space-2)', padding: '0 var(--space-3) var(--space-3)' }}
                  >
                    {signed === (fighter.id as string) ? (
                      <Chip tone="positive">Signed</Chip>
                    ) : (
                      <Button size="sm" onClick={() => signFreeAgent(fighter)}>
                        Offer a deal
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card flush title={view === 'needing' ? 'These need something' : 'Your roster'}>
          <div className="list">
            {shown.map(({ fighter, label, tone, booked: isBooked }) => (
              <div key={fighter.id} className="stack" style={{ gap: 0 }}>
                <button
                  type="button"
                  className="list__item"
                  onClick={() => navigate({ name: 'fighter', id: fighter.id as string })}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="list__primary" style={{ display: 'block' }}>
                      {displayName(fighter)}
                    </span>
                    <span className="list__secondary" style={{ display: 'block' }}>
                      {recordString(fighter.summary)} · {getDivision(fighter.divisionId).name}
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        gap: 'var(--space-1)',
                        marginTop: 'var(--space-1)',
                        flexWrap: 'wrap',
                      }}
                    >
                      {label && (
                        <Chip
                          tone={
                            tone === 'danger' ? 'negative' : tone === 'warn' ? 'warning' : 'info'
                          }
                        >
                          {label}
                        </Chip>
                      )}
                      {isBooked && <Chip tone="positive">Booked</Chip>}
                    </span>
                  </span>
                </button>

                <div
                  className="row"
                  style={{
                    gap: 'var(--space-2)',
                    padding: '0 var(--space-3) var(--space-3)',
                    flexWrap: 'wrap',
                  }}
                >
                  {/*
                    Push, test or protect. `narrativeControl` is a promotion-wide constant, and a
                    constant cannot say that a promotion is pushing one fighter and protecting
                    another at the same time — which is what actually happens.
                  */}
                  <Segmented
                    label={`How to handle ${fighter.lastName}`}
                    value={fighter.handling ?? 'none'}
                    onChange={(v) =>
                      setHandling(fighter, v === 'none' ? undefined : (v as FighterHandling))
                    }
                    options={[
                      { value: 'none', label: 'Neutral' },
                      { value: 'push', label: 'Push', hint: 'Winnable fights that look good' },
                      { value: 'test', label: 'Test', hint: 'Find out early' },
                      { value: 'protect', label: 'Protect', hint: 'Keep them away from trouble' },
                    ]}
                  />

                  {confirmingCut === (fighter.id as string) ? (
                    <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <Button size="sm" variant="danger" autoFocus onClick={() => cut(fighter)}>
                        Yes — release {fighter.lastName}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmingCut(undefined)}>
                        Keep them
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmingCut(fighter.id as string)}
                    >
                      Release
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {view === 'needing' && needing.length > 0 && (
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
          {roster.length - needing.length} others are fine for now.
        </p>
      )}

      {view === 'all' && roster.length > ROSTER_SHOWN && (
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
          Showing {ROSTER_SHOWN} of {roster.length}, most in need of a decision first. The rest are
          reachable from the rankings and from the card you are building.
        </p>
      )}
    </div>
  );
}
