/**
 * The card builder.
 *
 * Doc 13's one hard warning about this screen is that it must not be a spreadsheet, and the
 * shape that avoids it is sections: a main event, a co-main, three main-card bouts and four
 * prelims, each with a different job. Nine individually-chosen fights would be eighteen
 * dropdowns; four sections with different stakes is four kinds of decision.
 *
 * Two rules make it work on a phone:
 *
 * **The card is never blank.** Every slot fills itself from the matchmaker, so the screen opens
 * with a complete card and the player's job is to disagree with the parts they care about
 * rather than to assemble nine fights from nothing.
 *
 * **The prelims are collapsed.** Four of the nine bouts are the least consequential and the
 * most numerous, and they are exactly where "nine fights" becomes a wall of rows at 360px.
 */

import { useMemo, useState } from 'react';
import {
  displayName,
  recordString,
  type CardPosition,
  type Fighter,
  type FightNight,
  type Promotion,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty } from '../ui';
import { Alert, KeyStat } from '../ui/signals';
import { formatGameDay } from '../shell/Shell';
import { currentPurse } from '../game/money';
import {
  CARD_SECTIONS,
  autoFill,
  draftBouts,
  emptyDraft,
  forecastCard,
  proposalsFor,
  runScheduledCard,
  scheduleCard,
  type CardDraft,
  type ProposedBout,
} from '../game/promoting';

/** Two weeks out, which is enough notice to be plausible and short enough to stay a game. */
const LEAD_TIME_DAYS = 21;

export function CardBuilderScreen() {
  const { db, world, commit } = useGame();
  const { navigate } = useRouter();

  const promotion = world.playerPromotionId
    ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
    : undefined;

  const day = world.day + LEAD_TIME_DAYS;

  // Opens complete rather than blank. The player disagrees with parts of a card; they do not
  // assemble one from nothing.
  const [draft, setDraft] = useState<CardDraft>(() =>
    promotion ? autoFill({ db, promotion, draft: emptyDraft(), day }) : emptyDraft(),
  );
  const [swapping, setSwapping] = useState<{ position: CardPosition; slot: number } | undefined>();
  const [openSections, setOpenSections] = useState<Set<CardPosition>>(
    // Prelims closed: four of nine bouts, the least consequential, and the single biggest win
    // for a 360px screen.
    () => new Set<CardPosition>(['mainEvent', 'coMain', 'mainCard']),
  );
  const [ran, setRan] = useState<{ night: FightNight; profit: number; buzz: number } | undefined>();

  const forecast = useMemo(
    () =>
      promotion
        ? forecastCard({
            db,
            promotion,
            draft,
            purseOf: (id, position) => {
              const fighter = db.fighters.findById(id) as Fighter | undefined;
              if (!fighter) return 0;
              const purse = currentPurse(db, fighter, position);
              return purse ? purse.show + purse.win * 0.5 : 0;
            },
          })
        : undefined,
    [db, promotion, draft],
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

  const name = (id: string) => {
    const fighter = db.fighters.findById(id) as Fighter | undefined;
    return fighter ? displayName(fighter) : 'Unknown';
  };

  /*
   * Both records under the names.
   *
   * A promoter choosing between two pairings needs the thing every matchmaker looks at first,
   * and "Silva vs Wright" alone is two names with no information in them. The chips say what
   * the fight is worth and whether it is competitive; this says who they are.
   */
  const records = (bout: ProposedBout) => {
    const red = db.fighters.findById(bout.redId) as Fighter | undefined;
    const blue = db.fighters.findById(bout.blueId) as Fighter | undefined;
    if (!red || !blue) return '';
    return `${recordString(red.summary)} vs ${recordString(blue.summary)}`;
  };

  const place = (position: CardPosition, slot: number, bout: ProposedBout | undefined) => {
    setDraft((current) => {
      const slots = [...current[position]];
      slots[slot] = bout;
      return { ...current, [position]: slots };
    });
    setSwapping(undefined);
  };

  const announce = () => {
    const night = scheduleCard({ db, promotion, draft, day, broadcast: broadcastFor(promotion) });
    const outcome = runScheduledCard({ db, night, purses: forecast?.purses ?? 0 });
    if (outcome) {
      setRan({
        night: outcome.night,
        profit: outcome.settlement.revenue.profit,
        buzz: outcome.settlement.buzzDelta,
      });
    }
    commit();
  };

  if (ran) return <TheMorningAfter ran={ran} db={db} onDone={() => navigate({ name: 'promotion' })} />;

  const booked = draftBouts(draft).length;

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <KeyStat
          value={forecast ? forecast.expectedAttendance.toLocaleString() : '—'}
          label="Expected attendance"
          detail={`${formatGameDay(day)} · ${booked} of ${CARD_SECTIONS.reduce((a, s) => a + s.slots, 0)} slots filled`}
          tone={forecast && forecast.expectedAttendance < 2000 ? 'bad' : undefined}
        />
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
          The main event sells the night. The rest of the card stops it being a discount — a
          thin card is worth less than a full one, but the ninth fight matters far less than
          the fifth.
        </p>
      </Card>

      {CARD_SECTIONS.map((section) => {
        const open = openSections.has(section.position);
        const filled = draft[section.position].filter(Boolean).length;

        return (
          <Card key={section.position} title={section.label}>
            <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 0 }}>
              {section.purpose}
            </p>

            {/*
              Collapsed sections show a summary rather than vanishing, so the player always
              knows the prelims exist and how many are booked.
            */}
            {!open ? (
              <Button
                variant="secondary"
                block
                onClick={() =>
                  setOpenSections((s) => new Set([...s, section.position]))
                }
              >
                {filled} of {section.slots} booked — open
              </Button>
            ) : (
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {draft[section.position].map((bout, slot) => {
                  const isSwapping =
                    swapping?.position === section.position && swapping.slot === slot;

                  if (isSwapping) {
                    const options = proposalsFor({
                      db,
                      promotion,
                      position: section.position,
                      // Exclude the slot being replaced, so its own fighters are offerable.
                      draft: { ...draft, [section.position]: withoutSlot(draft, section.position, slot) },
                      day,
                      limit: 6,
                    });
                    return (
                      <div key={slot} className="stack" style={{ gap: 'var(--space-2)' }}>
                        {options.length === 0 ? (
                          <Alert tone="warn" title="Nobody available">
                            Everyone who could take this fight is either booked on this card,
                            suspended, or has fought too recently.
                          </Alert>
                        ) : (
                          options.map((option) => (
                            <button
                              key={`${option.redId}|${option.blueId}`}
                              type="button"
                              className="bout bout--option"
                              onClick={() => place(section.position, slot, option)}
                            >
                              <span className="bout__names">
                                {name(option.redId)} vs {name(option.blueId)}
                              </span>
                              <span className="list__secondary" style={{ display: 'block' }}>
                                {records(option)}
                              </span>
                              <span className="bout__chips">
                                <Chip tone={option.draw > 140 ? 'accent' : 'neutral'}>
                                  {describeDraw(option.draw)}
                                </Chip>
                                <Chip tone="info">{describeOdds(option.redOdds)}</Chip>
                                {option.isTitleFight && <Chip tone="positive">Title</Chip>}
                              </span>
                            </button>
                          ))
                        )}
                        <Button variant="ghost" onClick={() => setSwapping(undefined)}>
                          Keep what I had
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={slot}
                      type="button"
                      className="bout"
                      onClick={() => setSwapping({ position: section.position, slot })}
                    >
                      {bout ? (
                        <>
                          <span className="bout__names">
                            {name(bout.redId)} vs {name(bout.blueId)}
                          </span>
                          <span className="list__secondary" style={{ display: 'block' }}>
                            {records(bout)}
                          </span>
                          <span className="bout__chips">
                            <Chip tone={bout.draw > 140 ? 'accent' : 'neutral'}>
                              {describeDraw(bout.draw)}
                            </Chip>
                            <Chip tone="info">{describeOdds(bout.redOdds)}</Chip>
                            {bout.isTitleFight && <Chip tone="positive">Title</Chip>}
                          </span>
                        </>
                      ) : (
                        <span className="bout__names muted">Empty — tap to book</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}

      <Card title="Ready?">
        <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: 'var(--space-1)' }}>
          <li className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Fights</span>
            <strong>{booked}</strong>
          </li>
          <li className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Purses committed</span>
            <strong>£{forecast?.purses.toLocaleString()}k</strong>
          </li>
          <li className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Bonus pool</span>
            <strong>£{forecast?.bonusPool.toLocaleString()}k</strong>
          </li>
        </ul>

        {booked === 0 ? (
          <Alert tone="warn" title="Nothing booked">
            There is no card here yet. Tap a slot above.
          </Alert>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            {booked < CARD_SECTIONS.reduce((a, s) => a + s.slots, 0) && (
              <Alert tone="info" title="A short card is allowed">
                You can run {booked} fights. It costs less, and a thin card is worth less at the
                gate — nobody refuses to come because there are eight instead of nine.
              </Alert>
            )}
            <Button variant="primary" block onClick={announce}>
              Announce and run the card
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/** The settlement, as a post-mortem of one night rather than a ledger. */
function TheMorningAfter({
  ran,
  db,
  onDone,
}: {
  ran: { night: FightNight; profit: number; buzz: number };
  db: ReturnType<typeof useGame>['db'];
  onDone(): void;
}) {
  const name = (id: string) => {
    const fighter = db.fighters.findById(id) as Fighter | undefined;
    return fighter ? displayName(fighter) : 'Unknown';
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <p className="section-title">{ran.night.name}</p>
        <KeyStat
          value={`${ran.profit >= 0 ? '+' : '−'}£${Math.abs(ran.profit).toLocaleString()}k`}
          label={ran.profit >= 0 ? 'The night made money' : 'The night lost money'}
          tone={ran.profit >= 0 ? 'good' : 'bad'}
          detail={describeBuzz(ran.buzz)}
        />
      </Card>

      <Card flush title="What happened">
        <div className="list">
          {ran.night.bouts.map((bout) => (
            <div key={bout.boutId} className="list__item" style={{ cursor: 'default' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="list__primary" style={{ display: 'block' }}>
                  {name(bout.redId as string)} vs {name(bout.blueId as string)}
                </span>
                <span className="list__secondary" style={{ display: 'block' }}>
                  {bout.position === 'mainEvent'
                    ? 'Main event'
                    : bout.position === 'coMain'
                      ? 'Co-main'
                      : bout.position === 'mainCard'
                        ? 'Main card'
                        : 'Prelim'}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Button variant="primary" block onClick={onDone}>
        Back to the promotion
      </Button>
    </div>
  );
}

/** Every slot except one, so a bout being replaced does not block its own replacements. */
function withoutSlot(draft: CardDraft, position: CardPosition, slot: number) {
  const slots = [...draft[position]];
  slots[slot] = undefined;
  return slots;
}

/*
 * Draw and odds as words, never as the raw number.
 *
 * A draw weight of 147 means nothing to anybody. What a promoter needs is whether this fight
 * sells the building, and whether it is a fight.
 */
const describeDraw = (draw: number): string =>
  draw > 180 ? 'Sells it' : draw > 140 ? 'Big draw' : draw > 90 ? 'Modest' : 'Small';

const describeOdds = (redOdds: number): string => {
  const gap = Math.abs(redOdds - 0.5);
  return gap < 0.08 ? 'Coin flip' : gap < 0.2 ? 'Competitive' : gap < 0.32 ? 'One-sided' : 'A gimme';
};

const describeBuzz = (delta: number): string =>
  delta > 0.5
    ? 'People are talking about it. Attention up on the night.'
    : delta < -0.5
      ? 'It did not land. Attention down on the night.'
      : 'About what people expected of you.';

/** Broadcast model follows the promotion's platform, which is not yet a player decision. */
const broadcastFor = (promotion: Promotion): FightNight['broadcast'] =>
  promotion.tier === 'global' ? 'ppv' : promotion.tier === 'major' ? 'televised' : 'streamed';
