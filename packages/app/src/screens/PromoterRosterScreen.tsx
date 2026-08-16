/**
 * The roster, from the promotion's chair.
 *
 * Doc 13 gave promoter mode a Roster screen *and* a Contracts screen, and the UX review was
 * right that they are the same screen: contract state is a property of a fighter, not a second
 * population, and listing the same people twice with different columns is the definition of
 * inventing UI.
 *
 * So this is one list sorted by **who needs a decision** — anybody about to walk, anybody
 * sitting idle long enough to void their deal, anybody aggrieved — with everything else below
 * it. A roster screen that opens on an alphabetical list of two hundred names is a database
 * browser; one that opens on the six people with a problem is a job.
 */

import { useMemo, useState } from 'react';
import {
  displayName,
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

/** What is wrong with this fighter's situation, if anything. Drives the whole sort. */
interface Attention {
  fighter: Fighter;
  /** Higher sorts first. */
  urgency: number;
  label?: string;
  tone?: 'warn' | 'danger' | 'info';
}

export function PromoterRosterScreen() {
  const { db, world, commit } = useGame();
  const { navigate } = useRouter();
  const [confirmingCut, setConfirmingCut] = useState<string | undefined>();

  const promotion = world.playerPromotionId
    ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
    : undefined;

  const roster = useMemo<Attention[]>(() => {
    if (!promotion) return [];
    const all = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === promotion.id && f.retiredDay === undefined,
    );

    return all
      .map<Attention>((fighter) => {
        const agreement = fighter.agreementId
          ? (db.agreements.findById(fighter.agreementId as string) as
              | PromotionalAgreement
              | undefined)
          : undefined;

        const lastFight = fighter.record[fighter.record.length - 1]?.day ?? 0;
        const idleDays = fighter.record.length === 0 ? Infinity : world.day - lastFight;
        const boutsThisYear = fighter.record.filter((r) => world.day - r.day < 365).length;

        /*
         * The activity guarantee, which is now enforced rather than decorative. A fighter you
         * owe three bouts a year and have given none can void the deal and walk — and finding
         * that out from the news feed rather than from this screen is the failure this list
         * exists to prevent.
         */
        if (agreement && idleDays > 300 && boutsThisYear < agreement.activityGuarantee) {
          return {
            fighter,
            urgency: 100,
            tone: 'danger',
            label: `Owed ${agreement.activityGuarantee} bouts a year, given ${boutsThisYear}. Can walk.`,
          };
        }

        if (agreement && agreement.fightsRemaining <= 1) {
          return {
            fighter,
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
            urgency: 60,
            tone: 'warn',
            label: 'Unhappy with the deal, and it is making them hard to book.',
          };
        }

        if (idleDays > 200) {
          return {
            fighter,
            urgency: 40,
            tone: 'info',
            label: 'Has not been on a card in a while.',
          };
        }

        return { fighter, urgency: 0 };
      })
      .sort((a, b) => b.urgency - a.urgency || b.fighter.starPower - a.fighter.starPower);
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

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <div className="facts">
          <Fact
            label="Under contract"
            value={roster.length}
            hint={`Costing £${costs.rosterUpkeep}k a fortnight to keep on the books, fighting or not.`}
          />
          <Fact
            label="Need a decision"
            value={needing.length}
            tone={needing.length > 0 ? 'warn' : undefined}
            hint="Expiring, idle long enough to walk, or unhappy enough to be hard to book."
          />
        </div>
      </Card>

      {needing.length === 0 && (
        <Alert tone="good" title="Nothing on fire">
          Everybody is under contract, busy enough, and reasonably content. Enjoy it.
        </Alert>
      )}

      <Card flush title={needing.length > 0 ? 'These need something' : 'Your roster'}>
        <div className="list">
          {(needing.length > 0 ? needing : roster.slice(0, 20)).map(({ fighter, label, tone }) => (
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
                    {recordString(fighter.summary)} · {fighter.divisionId}
                  </span>
                  {label && (
                    <span style={{ display: 'block', marginTop: 'var(--space-1)' }}>
                      <Chip tone={tone === 'danger' ? 'negative' : tone === 'warn' ? 'warning' : 'info'}>
                        {label}
                      </Chip>
                    </span>
                  )}
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
                  Push, test or protect. `narrativeControl` is a promotion-wide constant and doc
                  13 calls building stars the mode's most interesting long game — but a constant
                  cannot say that a promotion is pushing one fighter and protecting another at
                  the same time, which is what actually happens.
                */}
                <Segmented
                  label={`How to handle ${fighter.lastName}`}
                  value={fighter.handling ?? 'none'}
                  onChange={(v) => setHandling(fighter, v === 'none' ? undefined : (v as FighterHandling))}
                  options={[
                    { value: 'none', label: 'Neutral' },
                    { value: 'push', label: 'Push', hint: 'Winnable fights that look good' },
                    { value: 'test', label: 'Test', hint: 'Find out early' },
                    { value: 'protect', label: 'Protect', hint: 'Keep them away from trouble' },
                  ]}
                />

                {/*
                  Two steps, and the confirm says what it actually costs. Cutting is cheap and
                  permanent, and doc 13's own note is that the fighter you cut sometimes becomes
                  a champion somewhere else — which the news feed will tell you about.
                */}
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

      {needing.length > 0 && (
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
          {roster.length - needing.length} others are fine for now.
        </p>
      )}
    </div>
  );
}
