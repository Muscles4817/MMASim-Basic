/**
 * The career dashboard.
 *
 * What this screen used to be: eighteen regions, rendered in DOM order, at roughly equal weight.
 * A fighter card carrying nine `Fact`s, a rest panel, the ladder with the whole top ten in it,
 * every interested promotion as its own card, a title-fight offer, a training door, the fight
 * offers, the entire contract layer including the re-paper and the release request, a news feed
 * and a seven-tile navigation grid. Six of those could render a `variant="primary"` button at the
 * same time, none of which knew the others existed. It took six to ten viewport heights and used
 * 896 pixels of a 1920-pixel display.
 *
 * What it is now, following doc 32 § 8: **what needs you, what you can do about it, and where you
 * stand while you decide.**
 *
 * Three specific judgements worth recording.
 *
 * **The ranking is not this screen's job.** `game/careerAttention.ts` scores every situation the
 * career is in on one comparable scale, and this file renders the top of that list. The old
 * screen could not rank anything because each region only knew about itself — which is why a torn
 * knee and a signing bonus were the same size.
 *
 * **One dominant action, computed.** `dominantSituation` picks it. Not a lint rule and not a rule
 * about screens in general — a surface with two genuinely independent decisions may have two —
 * but this screen's whole failure was that it had six, so this one has one.
 *
 * **The fight offers are a table.** Choosing an opponent is a comparison — difficulty against
 * purse against what it does to your ranking — and comparison wants columns. The old list
 * expanded rows in place, which pushed the accept button further down the page with every row
 * opened. Selecting now opens the detail below the table, in a fixed place.
 */

import { useMemo, useState } from 'react';
import {
  abilityRead,
  conditionRead,
  currentHeat,
  daysSinceLastBout,
  describeFreshness,
  describeHeat,
  describeRust,
  displayName,
  fighterAge,
  freshnessOf,
  getDivision,
  recordString,
  rustFor,
  rustLabel,
  type CardPosition,
  type Fighter,
  type MatchupAppraisal,
  type Rivalry,
  TRAUMA_CONCERN,
  TRAUMA_MEDICAL,
  WEAR_CONCERN,
} from '@mmasim/engine';
import { readMileage } from '../ui/mileage';
import { money } from '../ui/format';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import {
  Button,
  Card,
  Chip,
  Collapse,
  DataTable,
  Empty,
  Flag,
  Grid,
  GridCell,
  Panel,
  type Column,
} from '../ui';
import { Fact, FighterRead, ICON, Icon, StateRow, StreakBadge } from '../ui/signals';
import { AbilityBand, AttentionRow } from '../ui/console';
import { bookFight, clearBooking, getBooking, getOffers } from '../game/career';
import { careerAttention, dominantSituation, type CareerSituation } from '../game/careerAttention';
import { getLadderStatus } from '../game/progression';
import { playerCardPosition } from '../game/night';
import { getRivalry, previousMeetings } from '../game/rivalries';
import { readNews } from '../game/world';
import { NewsFeed } from '../ui/NewsFeed';
import { PROMOTION_TIER_LABELS } from '../game/labels';
import { currentPurse } from '../game/money';
import { adviceOn, boutMerit, contractStanding } from '../game/contracts';
import { formatGameDay } from '../shell/Shell';
import './HubScreen.css';

/** How many situations the dashboard shows before it stops being a dashboard. */
const SITUATIONS_SHOWN = 4;

/**
 * What the pinned action says it is for.
 *
 * Not the situation's own title. The first draft printed that verbatim beside the button, which
 * put the same sentence on the screen twice — once in the feed and once in the bar under it —
 * and that is the audit's own complaint about the old hub reproduced in a component built to fix
 * it. A short name for the *kind* answers "why this button" without repeating the claim.
 */
const SITUATION_LABEL: Record<CareerSituation['kind'], string> = {
  injury: 'Injury',
  freshness: 'Recovery',
  rust: 'Inactivity',
  trauma: 'Damage',
  wear: 'Wear',
  unsigned: 'No contract',
  jobRisk: 'Your place',
  repaper: 'New terms offered',
  renegotiate: 'Your deal',
  offers: 'Interest',
  titleShot: 'Title shot',
  booked: 'Fight booked',
  noOpponents: 'No opponents',
  inbox: 'Waiting on you',
  money: 'Money',
};

export function HubScreen() {
  const { db, world, playerFighter, commit } = useGame();
  const { navigate } = useRouter();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [booking, setBooking] = useState(() => getBooking(playerFighter?.id as string | undefined));

  const news = useMemo(() => readNews(db), [db, world.day]);

  const offers = useMemo(
    () => (playerFighter && !booking ? getOffers(db, playerFighter) : []),
    [db, playerFighter, booking, world.day],
  );

  const ladder = useMemo(
    () => (playerFighter ? getLadderStatus(db, playerFighter) : undefined),
    [db, playerFighter, world.day],
  );

  const situations = useMemo(
    () => (playerFighter ? careerAttention(db, playerFighter) : []),
    [db, playerFighter, booking, world.day],
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
  const standing = contractStanding(db, fighter);
  const daysSince = daysSinceLastBout(fighter.record, world.day);
  const rust = rustFor(daysSince ?? 0);
  const opponent = booking
    ? (db.fighters.findById(booking.opponentId) as Fighter | undefined)
    : undefined;
  const chosen = offers.find((o) => (o.opponent.id as string) === selected);
  const lead = dominantSituation(situations);

  const accept = (offer: MatchupAppraisal) => {
    const next = bookFight(db, fighter, offer.opponent, {
      advice: adviceOn(db, fighter, offer.opponent.id as string, {
        merit: boutMerit(offer),
        purse: currentPurse(db, fighter)?.total ?? 0,
      }),
    });
    setBooking(next);
    commit();
    navigate({ name: 'camp' });
  };

  const takeTitleFight = () => {
    const challenger = ladder?.champion ?? ladder?.ranked[1]?.fighter;
    if (!challenger) return;
    setBooking(bookFight(db, fighter, challenger, { isTitleFight: true }));
    commit();
    navigate({ name: 'camp' });
  };

  /*
   * What the one primary button does.
   *
   * The model ranks; the screen decides what pressing it means. Most leads are a navigation, but
   * taking a title fight books a bout on the screen the player is already looking at — so the
   * special case lives here rather than as a fake route in the model.
   */
  const act = (situation: CareerSituation) => {
    if (situation.kind === 'titleShot') {
      takeTitleFight();
      return;
    }
    if (situation.action) navigate(situation.action.route);
  };

  const cancelBooking = () => {
    clearBooking();
    setBooking(undefined);
    setConfirmCancel(false);
  };

  return (
    <div className="career">
      {/*
        Identity, as a band rather than a card.

        Who you are, your record and where you rank are one fact about a career, not three cards
        about a fighter — and every one of them is context for the decisions below rather than a
        decision itself. The nine `Fact`s that used to live here are gone: five became the
        condition strip in the context column and the rest are on the profile, where a player goes
        to ask rather than being handed them on arrival.
      */}
      <IdentityBand
        fighter={fighter}
        ladder={ladder}
        divisionName={division.name}
        day={world.day}
      />

      <Grid>
        <GridCell span={7}>
          <NeedsYou situations={situations} onAct={act} lead={lead} />

          {booking && opponent ? (
            <NextFight
              booking={booking}
              opponent={opponent}
              confirmCancel={confirmCancel}
              onCancelRequest={() => setConfirmCancel(true)}
              onCancelKeep={() => setConfirmCancel(false)}
              onCancelConfirm={cancelBooking}
              onGoToCamp={() => navigate({ name: 'camp' })}
            />
          ) : (
            <ChooseFight
              fighter={fighter}
              offers={offers}
              chosen={chosen}
              divisionName={division.name}
              titleShot={ladder?.titleShot.eligible ? ladder : undefined}
              onSelect={(id) => setSelected(id)}
              onClear={() => setSelected(undefined)}
              onAccept={accept}
              onTakeTitle={takeTitleFight}
              db={db}
              day={world.day}
              managerName={standing.manager?.name}
            />
          )}
        </GridCell>

        <GridCell span={5} sticky>
          <ConditionPanel fighter={fighter} day={world.day} rust={rust} daysSince={daysSince} />

          <StandingPanel
            ladder={ladder}
            standing={standing}
            rust={rust}
            onOpenContract={() => navigate({ name: 'contract' })}
            onOpenRankings={() => navigate({ name: 'rankings' })}
            onOpenProfile={() => navigate({ name: 'me' })}
          />

          <Collapse
            summary={
              <span>
                The sport{' '}
                <span className="faint" style={{ fontWeight: 400 }}>
                  · {Math.min(news.length, 3)} of {news.length}
                </span>
              </span>
            }
          >
            <NewsFeed
              items={news}
              limit={3}
              onFighterClick={(id) => navigate({ name: 'fighter', id })}
              emptyMessage="Nothing yet. Train or fight, and the divisions will get on with themselves while you do."
            />
          </Collapse>
        </GridCell>
      </Grid>

      {/*
        The one primary action, pinned.

        On a phone this sits above the tab bar so the answer is reachable without scrolling to
        find it — the old screen's single worst property was that the decision was three screens
        below the state. On a desktop it settles into the flow at the bottom of the page, because
        the decision is already on screen beside everything else and a floating bar over a page
        with room to spare is noise.
      */}
      {lead && (
        <div className="career__action" data-testid="dominant-action">
          <div className="career__action-inner">
            <span className="career__action-why">{SITUATION_LABEL[lead.kind]}</span>
            <Button variant="primary" onClick={() => act(lead)}>
              {lead.action?.label}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Identity ------------------------------------------------------------------------------

function IdentityBand({
  fighter,
  ladder,
  divisionName,
  day,
}: {
  fighter: Fighter;
  ladder: ReturnType<typeof getLadderStatus> | undefined;
  divisionName: string;
  day: number;
}) {
  const ability = abilityRead(fighter.attributes);

  return (
    <section className="identity" aria-label="Who you are" data-testid="identity">
      <div className="identity__who">
        <h2 className="identity__name">{displayName(fighter)}</h2>
        <p className="muted">
          {divisionName} · {fighterAge(fighter, day)} · <Flag nationality={fighter.nationality} />
        </p>
      </div>

      <div className="identity__record">
        <span className="identity__record-value numeric">{recordString(fighter.summary)}</span>
        <span className="identity__record-label">Professional record</span>
        {fighter.summary.streak !== 0 && <StreakBadge streak={fighter.summary.streak} />}
      </div>

      <div className="identity__standing">
        {ladder?.isChampion ? (
          <Chip tone="accent" title="Reigning divisional champion">
            <Icon name="champion" /> Champion
          </Chip>
        ) : ladder?.position !== undefined ? (
          <Chip tone="info">
            #{ladder.position} of {ladder.ranked.length}
          </Chip>
        ) : (
          <Chip>Unranked</Chip>
        )}
        {/*
          A class, never a number.

          The hub used to print an exact overall for the same fighter whose profile argues at
          length that it must never do so — `FighterScreen`'s header is explicit that anybody who
          can compare 34 against 47 is not scouting, they are doing arithmetic. Two screens, one
          fighter, two incompatible positions. The profile's reasoning is the better one, and
          every underlying rating is still there for anyone who wants to form their own view.
        */}
        <AbilityBand label={ability.label} fill={ability.fill} note={ability.blurb} />
      </div>

      <div className="identity__read">
        <FighterRead attributes={fighter.attributes} />
      </div>
    </section>
  );
}

// --- What needs you --------------------------------------------------------------------------

function NeedsYou({
  situations,
  lead,
  onAct,
}: {
  situations: readonly CareerSituation[];
  lead: CareerSituation | undefined;
  onAct(situation: CareerSituation): void;
}) {
  const shown = situations.slice(0, SITUATIONS_SHOWN);

  if (shown.length === 0) {
    return (
      <Panel title="Nothing needs you" testId="needs-you">
        <p className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
          Fit, signed, and nobody waiting on an answer. Take a fight, or spend the time in the gym.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title={
        <>
          Needs you{' '}
          <span className="panel__count numeric">
            {situations.length > SITUATIONS_SHOWN
              ? `${shown.length} of ${situations.length}`
              : situations.length}
          </span>
        </>
      }
      testId="needs-you"
    >
      <div className="attention">
        {shown.map((situation) => (
          <AttentionRow
            key={situation.id}
            tone={situation.tone}
            title={situation.title}
            detail={situation.detail}
            /* The lead's cue is omitted: its button is pinned at the bottom of the page, and two
               controls for one decision is the thing this screen exists to stop doing. */
            cue={situation.action && situation.id !== lead?.id ? situation.action.label : undefined}
            onClick={situation.action ? () => onAct(situation) : undefined}
          />
        ))}
      </div>
    </Panel>
  );
}

// --- The next fight --------------------------------------------------------------------------

function NextFight({
  booking,
  opponent,
  confirmCancel,
  onCancelRequest,
  onCancelKeep,
  onCancelConfirm,
  onGoToCamp,
}: {
  booking: NonNullable<ReturnType<typeof getBooking>>;
  opponent: Fighter;
  confirmCancel: boolean;
  onCancelRequest(): void;
  onCancelKeep(): void;
  onCancelConfirm(): void;
  onGoToCamp(): void;
}) {
  return (
    <Card
      title={booking.bout.isTitleFight ? 'Next fight — for the title' : 'Next fight'}
      raised
      testId="next-fight"
    >
      <p style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
        {booking.bout.isTitleFight && <span aria-hidden="true">🏆 </span>}
        vs {displayName(opponent)}
        {booking.bout.isTitleFight && <span className="visually-hidden"> for the title</span>}
      </p>
      <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
        {formatGameDay(booking.bout.day)} · {booking.bout.rounds} rounds ·{' '}
        {recordString(opponent.summary)}
      </p>
      {/* Not `primary`: the pinned action at the foot of the page is already this, and two
          primaries for one decision is the failure the screen was rebuilt to fix. */}
      <Button onClick={onGoToCamp}>Go to camp</Button>
      {confirmCancel ? (
        <div className="stack" style={{ marginTop: 'var(--space-3)' }}>
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            Withdrawing loses the camp you have built for this fight.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button variant="danger" size="sm" onClick={onCancelConfirm}>
              Withdraw
            </Button>
            <Button size="sm" onClick={onCancelKeep}>
              Keep the fight
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancelRequest}
          style={{ marginTop: 'var(--space-2)' }}
        >
          Withdraw from this fight
        </Button>
      )}
    </Card>
  );
}

// --- Choosing a fight ------------------------------------------------------------------------

function ChooseFight({
  fighter,
  offers,
  chosen,
  divisionName,
  titleShot,
  onSelect,
  onClear,
  onAccept,
  onTakeTitle,
  db,
  day,
  managerName,
}: {
  fighter: Fighter;
  offers: readonly MatchupAppraisal[];
  chosen: MatchupAppraisal | undefined;
  divisionName: string;
  /** Present only when a title shot has actually been earned. */
  titleShot: ReturnType<typeof getLadderStatus> | undefined;
  onSelect(id: string): void;
  onClear(): void;
  onAccept(offer: MatchupAppraisal): void;
  onTakeTitle(): void;
  db: ReturnType<typeof useGame>['db'];
  day: number;
  managerName?: string;
}) {
  const positionOf = (offer: MatchupAppraisal) =>
    playerCardPosition(fighter, offer.opponent, false);

  const columns: Column<MatchupAppraisal>[] = [
    {
      id: 'opponent',
      label: 'Opponent',
      render: (o) => displayName(o.opponent),
      sort: (a, b) => displayName(a.opponent).localeCompare(displayName(b.opponent)),
      onPhone: 'primary',
    },
    {
      id: 'record',
      label: 'Record',
      render: (o) => recordString(o.opponent.summary),
      onPhone: 'secondary',
    },
    {
      id: 'difficulty',
      label: 'Difficulty',
      render: (o) => {
        const d = difficultyOf(o);
        return <Chip tone={d.tone}>{d.label}</Chip>;
      },
      sort: (a, b) => a.step - b.step,
      onPhone: 'trailing',
    },
    {
      id: 'purse',
      label: 'Purse',
      render: (o) => {
        const purse = currentPurse(db, fighter, positionOf(o));
        return purse ? `${money(purse.show)} + ${money(purse.win)}` : '—';
      },
      sort: (a, b) =>
        (currentPurse(db, fighter, positionOf(a))?.total ?? 0) -
        (currentPurse(db, fighter, positionOf(b))?.total ?? 0),
      numeric: true,
      onPhone: 'secondary',
    },
    {
      id: 'slot',
      label: 'Slot',
      /*
       * Where the bout would land on the card, which decides rounds, camp length and purse.
       *
       * Headlining is the second axis of a career beside the record and it used never to be
       * mentioned until after the fight — it is also the single biggest thing separating one
       * offer here from another: five rounds instead of three, ten weeks of camp instead of
       * eight.
       */
      render: (o) => (positionOf(o) === 'mainEvent' ? <Chip tone="accent">Main event</Chip> : '—'),
      onPhone: 'hidden',
    },
    {
      id: 'heat',
      label: 'Heat',
      title: 'Bad blood, which pays',
      render: (o) => {
        const rivalry = getRivalry(db, fighter.id, o.opponent.id, day);
        const heat = currentHeat(rivalry, day);
        return rivalry.isRivalry ? (
          <Chip tone="negative">{ICON.streak} Grudge</Chip>
        ) : heat >= 40 ? (
          <Chip tone="warning">{ICON.streak} Heat</Chip>
        ) : (
          <span className="faint">—</span>
        );
      },
      onPhone: 'trailing',
    },
  ];

  return (
    <>
      {/*
        A title shot is not one row in a table of opponents.

        It is what the climb was for, it changes the length of the camp and the number of rounds,
        and there is exactly one of them. It gets its own surface above the list.
      */}
      {titleShot && (
        <Card title="Title fight" raised testId="title-fight">
          <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>
              🏆
            </span>
            <p style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>
              {titleShot.champion
                ? `For the belt, against ${displayName(titleShot.champion)}`
                : 'For the vacant title'}
            </p>
          </div>
          <p className="muted prose" style={{ marginBottom: 'var(--space-3)' }}>
            Five rounds, a ten-week camp, and the {divisionName} title on the line. This is what
            the climb was for.
          </p>
          <Button onClick={onTakeTitle}>Take the title fight</Button>
        </Card>
      )}

      <Panel
        title="Choose your next fight"
        testId="next-fight"
        action={
          chosen && (
            <Button size="sm" variant="ghost" onClick={onClear}>
              Clear
            </Button>
          )
        }
      >
        {offers.length === 0 ? (
          <p className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
            Everyone available in {divisionName} has been fought too recently. Sitting out a few
            weeks changes the picture — the situations above say what that costs.
          </p>
        ) : (
          <>
            <Card flush>
              <DataTable
                rows={offers}
                columns={columns}
                rowKey={(o) => o.opponent.id as string}
                caption="Opponents available for your next fight"
                onRowClick={(o) => onSelect(o.opponent.id as string)}
                isCurrent={(o) => (o.opponent.id as string) === chosen?.opponent.id}
              />
            </Card>

            {chosen ? (
              <OfferDetail
                offer={chosen}
                position={positionOf(chosen)}
                purse={currentPurse(db, fighter, positionOf(chosen))}
                history={previousMeetings(fighter, chosen.opponent.id)}
                rivalry={getRivalry(db, fighter.id, chosen.opponent.id, day)}
                day={day}
                advice={adviceOn(db, fighter, chosen.opponent.id as string, {
                  merit: boutMerit(chosen),
                  purse: currentPurse(db, fighter, positionOf(chosen))?.total ?? 0,
                })}
                managerName={managerName}
                onAccept={() => onAccept(chosen)}
              />
            ) : (
              <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
                Pick one to see what it pays, what it costs and what your manager thinks.
              </p>
            )}
          </>
        )}
      </Panel>
    </>
  );
}

/**
 * Framed as difficulty rather than as a win percentage.
 *
 * A precise number would be false precision — the paper odds cannot see style, preparation or the
 * power curve, which are exactly the things that decide fights.
 */
function difficultyOf(offer: MatchupAppraisal) {
  return offer.step >= 6
    ? { label: 'Step up', tone: 'negative' as const }
    : offer.step <= -6
      ? { label: 'Favourable', tone: 'positive' as const }
      : { label: 'Even fight', tone: 'info' as const };
}

/**
 * The selected opponent, in full.
 *
 * Below the table in a fixed place rather than expanded inside the row. The old list expanded in
 * place, which pushed the accept button further down with every row somebody opened — on a phone
 * that meant the decision moved away from you as you made it.
 */
function OfferDetail({
  offer,
  position,
  purse,
  history,
  rivalry,
  day,
  advice,
  managerName,
  onAccept,
}: {
  offer: MatchupAppraisal;
  position: CardPosition;
  purse?: { show: number; win: number; total: number };
  history: { wins: number; losses: number; total: number };
  rivalry: Rivalry;
  day: number;
  advice: { recommended: boolean; line: string };
  managerName?: string;
  onAccept(): void;
}) {
  const { opponent, winChance } = offer;
  const heat = currentHeat(rivalry, day);
  const headlining = position === 'mainEvent';
  const campWeeks = headlining ? 10 : 8;

  return (
    <Card raised testId="offer-detail">
      <h3 style={{ fontSize: 'var(--text-xl)' }}>{displayName(opponent)}</h3>
      <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>
        {recordString(opponent.summary)} ·{' '}
        {winChance >= 0.6
          ? 'You are favoured'
          : winChance <= 0.4
            ? 'You are the underdog'
            : 'A coin flip'}
      </p>

      {/* What this opponent will actually do to you, before any numbers. */}
      <FighterRead attributes={opponent.attributes} />

      <div style={{ marginTop: 'var(--space-3)' }}>
        <Fact
          label="Star power"
          value={Math.round(opponent.starPower)}
          icon="star"
          emphasis="tertiary"
        />
        {/* Money, plainly. A heated fight pays more, which is what makes building a rivalry
            worth doing rather than just something that happens to you. */}
        {purse && (
          <Fact
            label="Purse"
            value={`${money(purse.show)} + ${money(purse.win)}`}
            emphasis="secondary"
            hint="Show money is paid win or lose. The win bonus is not, and the manager, the corner and the taxman all come out of both."
          />
        )}
      </div>

      {(heat >= 20 || history.total > 0) && (
        <p className="prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
          {history.total > 0 && (
            <>
              <strong>
                You have met {history.total === 1 ? 'once' : `${history.total} times`}
              </strong>
              {history.wins > history.losses
                ? ` and you won ${history.wins === 1 ? 'it' : `${history.wins} of them`}.`
                : history.losses > history.wins
                  ? ` and he has your number — ${history.losses}–${history.wins}.`
                  : ` and you are level at ${history.wins}–${history.losses}.`}{' '}
            </>
          )}
          {describeHeat(rivalry, day)}
        </p>
      )}

      {/* What he said, quoted, and logged against the result the moment you accept. */}
      {managerName && (
        <p
          className={`offer-advice ${advice.recommended ? '' : 'offer-advice--against'}`}
          style={{ marginTop: 'var(--space-3)' }}
        >
          <span aria-hidden="true">{advice.recommended ? '👍' : '✋'}</span>{' '}
          <strong>{managerName}:</strong> &ldquo;{advice.line}&rdquo;
        </p>
      )}

      <p className="muted prose" style={{ fontSize: 'var(--text-sm)', margin: 'var(--space-3) 0' }}>
        {headlining && <strong>You would headline. Five rounds, and a ten-week camp. </strong>}
        Accepting books the fight for {campWeeks === 10 ? 'ten' : 'eight'} weeks time. You can
        withdraw before fight night, but you will lose the camp.
      </p>

      {/* Two steps overall: selecting the row was the first and this is the second. Accepting
          determines the next two months of a career. */}
      <Button variant="primary" onClick={onAccept}>
        Accept fight
      </Button>
    </Card>
  );
}

// --- Condition -------------------------------------------------------------------------------

/**
 * What the career has cost, interpreted.
 *
 * The old version was five `Fact`s inside the identity card, four of them tertiary, three of them
 * rendering a bare `n / 100`. `conditionRead` and `describeFreshness` have existed the whole time
 * and were called on the *profile* — so the dashboard showed raw numbers and the detail screen
 * showed the interpretation, which is exactly backwards under "card = diagnosis, detail screen =
 * explanation".
 *
 * Folded on a phone behind its own verdict line, open on a desktop where the rail has the room.
 * That is a difference in composition rather than in type size, which is the whole responsive
 * argument in one component.
 */
function ConditionPanel({
  fighter,
  day,
  rust,
  daysSince,
}: {
  fighter: Fighter;
  day: number;
  rust: number;
  daysSince: number | undefined;
}) {
  const read = conditionRead(fighter, day);
  const freshness = freshnessOf(fighter);
  const mileage = readMileage(fighter, day);
  const { headTrauma, bodyWear, confidence } = fighter.condition;

  return (
    <Collapse
      summary={
        <span>
          Condition{' '}
          <span
            className={read.tone === 'good' ? 'positive' : read.tone === 'bad' ? 'negative' : 'muted'}
            style={{ fontWeight: 700 }}
          >
            · {read.label}
          </span>
        </span>
      }
    >
      <div className="state-strip" data-testid="condition">
        <StateRow
          label="Freshness"
          value={Math.round(freshness)}
          state={describeFreshness(freshness)}
          tone={
            freshness >= 65 ? 'good' : freshness < 25 ? 'bad' : freshness < 45 ? 'warn' : undefined
          }
          help="How recovered you are. Camps and hard fights spend it; time gives it back, and more slowly the more miles you have on you."
        />
        <StateRow
          label="Body age"
          value={mileage.body}
          state={mileage.heavy ? 'Heavy miles' : mileage.notable ? 'Some miles' : 'True to age'}
          tone={mileage.heavy ? 'bad' : mileage.notable ? 'warn' : undefined}
          help={mileage.because}
        />
        <StateRow
          label="Body wear"
          value={Math.round(bodyWear)}
          state={bodyWear >= 55 ? 'Worn' : bodyWear >= WEAR_CONCERN ? 'Wearing' : 'Sound'}
          tone={bodyWear >= 55 ? 'bad' : bodyWear >= WEAR_CONCERN ? 'warn' : undefined}
          help="Joints and soft tissue. Raises camp injury risk and slows how fast you come back."
        />
        <StateRow
          label="Head trauma"
          value={Math.round(headTrauma)}
          state={
            headTrauma >= TRAUMA_MEDICAL
              ? 'Failing'
              : headTrauma >= TRAUMA_CONCERN
                ? 'Accumulating'
                : 'Pristine'
          }
          tone={
            headTrauma >= TRAUMA_MEDICAL ? 'bad' : headTrauma >= TRAUMA_CONCERN ? 'warn' : undefined
          }
          help="Only ever goes up. Permanently lowers what your chin can absorb, and eventually ends careers."
        />
        <StateRow
          label="Confidence"
          value={Math.round(confidence)}
          state={confidence >= 65 ? 'High' : confidence <= 35 ? 'Shaken' : 'Steady'}
          tone={confidence >= 65 ? 'good' : confidence <= 35 ? 'bad' : undefined}
          help="What you believe you can do. It moves with results, and it changes what you are willing to try."
        />
        <StateRow
          label="Last fought"
          value={
            daysSince === undefined
              ? '—'
              : daysSince < 31
                ? `${daysSince}d`
                : `${Math.round(daysSince / 30)}mo`
          }
          state={daysSince === undefined ? 'Never' : rustLabel(rust)}
          tone={rust > 0.5 ? 'bad' : rust > 0 ? 'warn' : undefined}
          help={
            rust > 0
              ? describeRust(rust)
              : 'Time out of the cage costs sharpness, not strength — you see it later, you do not hit softer.'
          }
        />
      </div>
    </Collapse>
  );
}

// --- Standing --------------------------------------------------------------------------------

/**
 * Where you stand — contractually, and on the ladder.
 *
 * Both were their own full-height cards, and the ladder one carried the entire divisional top
 * ten. A rank you cannot see the rest of is a number rather than a standing, which was the right
 * argument for showing the table — but it is the *rankings screen's* argument, and reproducing
 * that screen inside the dashboard is how the dashboard got to eight viewport heights. The
 * diagnosis stays here; the table is one tap away.
 */
function StandingPanel({
  ladder,
  standing,
  rust,
  onOpenContract,
  onOpenRankings,
  onOpenProfile,
}: {
  ladder: ReturnType<typeof getLadderStatus> | undefined;
  standing: ReturnType<typeof contractStanding>;
  rust: number;
  onOpenContract(): void;
  onOpenRankings(): void;
  onOpenProfile(): void;
}) {
  return (
    <Card title="Where you stand" testId="standing">
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        {/* The deal, as a counter and a door. "Fight 3 of 4" is the cheapest source of
            anticipation in the design, because it makes free agency approach rather than
            arrive. Everything you can do about it is on the contract screen. */}
        <div>
          {standing.freeAgent || !standing.agreement ? (
            <p style={{ fontWeight: 700 }}>Free agent</p>
          ) : (
            <>
              <p style={{ fontWeight: 700 }}>{standing.status?.summary}</p>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                {standing.promotion?.name} · {money(standing.agreement.showPurse)} to show,{' '}
                {money(standing.agreement.winBonus)} to win
              </p>
            </>
          )}
          {rust > 0 && (
            <p style={{ marginTop: 'var(--space-1)' }}>
              <Chip tone={rust > 0.5 ? 'warning' : 'neutral'}>{rustLabel(rust)}</Chip>
            </p>
          )}
        </div>

        {ladder && (
          <div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700 }}>
                {ladder.isChampion
                  ? 'Champion'
                  : ladder.position !== undefined
                    ? `Ranked #${ladder.position}`
                    : 'Unranked'}
              </span>
              {ladder.promotion && (
                <Chip tone={ladder.promotion.tier === 'global' ? 'accent' : 'info'}>
                  {PROMOTION_TIER_LABELS[ladder.promotion.tier]}
                </Chip>
              )}
            </div>

            {/* One bar, from unsigned nobody to global champion. */}
            <div
              role="meter"
              aria-valuenow={Math.round(ladder.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Career progress toward a world title"
              className="climb"
            >
              <div
                className="climb__fill"
                style={{ width: `${Math.max(2, ladder.progress * 100)}%` }}
              />
            </div>

            <p className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
              {ladder.titleShot.reason}
            </p>
          </div>
        )}

        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button size="sm" onClick={onOpenContract}>
            Your deal
          </Button>
          <Button size="sm" onClick={onOpenRankings}>
            Rankings
          </Button>
          <Button size="sm" onClick={onOpenProfile}>
            My fighter
          </Button>
        </div>
      </div>
    </Card>
  );
}
