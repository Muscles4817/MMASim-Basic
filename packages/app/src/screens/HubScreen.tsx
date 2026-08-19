import { useMemo, useState } from 'react';
import {
  currentHeat,
  describeAdviceRecord,
  describeFairness,
  daysSinceLastBout,
  describeFreshness,
  freshnessOf,
  describeReleaseRisk,
  describeRust,
  rustFor,
  rustLabel,
  describeHeat,
  describeStable,
  describeTrigger,
  releaseRisk,
  renegotiationTriggers,
  type RepaperOffer,
  displayName,
  fighterAge,
  getDivision,
  overallRating,
  recordString,
  type Fighter,
  type MatchupAppraisal,
  type Gym,
  type Rivalry,
  type CardPosition,
  TRAUMA_CONCERN,
  TRAUMA_MEDICAL,
  WEAR_CONCERN,
} from '@mmasim/engine';
import { readMileage } from '../ui/mileage';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Flag } from '../ui';
import {
  Alert,
  Fact,
  FighterRead,
  ICON,
  Icon,
  KeyStat,
  OverallRating,
  StreakBadge,
} from '../ui/signals';
import { bookFight, clearBooking, getBooking, getOffers } from '../game/career';
import { getLadderStatus, type LadderStatus } from '../game/progression';
import { playerCardPosition } from '../game/night';
import { getRivalry, previousMeetings } from '../game/rivalries';
import { advanceWorld, readNews } from '../game/world';
import { NewsFeed } from '../ui/NewsFeed';
import { PROMOTION_TIER_LABELS } from '../game/labels';
import { campCostFor, currentPurse, solvencyOf } from '../game/money';
import {
  acceptRepaperOffer,
  adviceOn,
  boutMerit,
  canSignWith,
  contractStanding,
  repaperOnTheTable,
  requestRelease,
} from '../game/contracts';
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
  const [releaseWord, setReleaseWord] = useState<string | undefined>();
  const [confirmingRepaper, setConfirmingRepaper] = useState(false);
  const [signedRepaper, setSignedRepaper] = useState<RepaperOffer | undefined>();
  const [pendingOffer, setPendingOffer] = useState<MatchupAppraisal | undefined>();
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
  const mileage = readMileage(fighter, world.day);
  // Purses scale with the promotion's prestige, so a fighter with no contract is quoted
  // against a nominal regional shop rather than crashing or quoting a global figure.
  // Read against an eight-week camp at the room they are actually in, which is the decision
  // the bank is really about.
  const gym = fighter.gymId ? (db.gyms.findById(fighter.gymId) as Gym | undefined) : undefined;
  const bankState = solvencyOf(fighter, campCostFor(gym, 8));
  const standing = contractStanding(db, fighter);
  const triggers =
    standing.agreement && standing.promotion
      ? renegotiationTriggers(standing.agreement, fighter, standing.promotion, {
          isChampion: ladder?.isChampion,
        })
      : [];
  const repaper = repaperOnTheTable(db, fighter);
  const jobRisk =
    standing.promotion && !standing.freeAgent ? releaseRisk(fighter, standing.promotion) : 0;
  // How long since they last competed, which is now a real cost rather than a stored zero.
  const daysSince = daysSinceLastBout(fighter.record, world.day);
  const rust = rustFor(daysSince ?? 0);
  const freshness = freshnessOf(fighter);
  const opponent = booking
    ? (db.fighters.findById(booking.opponentId) as Fighter | undefined)
    : undefined;

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
    // Waiting has to move the *world*, not just the calendar. Skipping eight weeks with a
    // frozen roster was how a stuck division stayed stuck forever.
    const to = world.day + weeks * 7;
    advanceWorld(db, world.day, to, fighter.id);
    updateWorld({ day: to });
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
              {division.name} · {fighterAge(fighter, world.day)} years old ·{' '}
              <Flag nationality={fighter.nationality} />
            </p>
          </div>
        </div>

        {/* One primary number. The record is what a career is; everything else is context. */}
        <div style={{ marginTop: 'var(--space-4)' }}>
          <KeyStat
            value={recordString(fighter.summary)}
            label="Professional record"
            tone={
              fighter.summary.streak > 0 ? 'good' : fighter.summary.streak < 0 ? 'bad' : 'neutral'
            }
            detail={<StreakBadge streak={fighter.summary.streak} />}
          />
        </div>

        {/* What actually decides their fights, before any of the fifteen bars. */}
        <div style={{ marginTop: 'var(--space-4)' }}>
          <FighterRead attributes={fighter.attributes} />
        </div>

        <div style={{ marginTop: 'var(--space-3)' }}>
          <Fact
            label="Overall"
            value={<OverallRating rating={overallRating(fighter.attributes)} />}
          />
          <Fact
            label="Star power"
            value={Math.round(fighter.starPower)}
            icon="star"
            emphasis="tertiary"
            hint="What the market pays to watch you. Independent of how good you are."
          />
          <Fact
            label="Bank"
            value={`£${Math.round(fighter.bank * 10) / 10}k`}
            emphasis={bankState === 'comfortable' ? 'tertiary' : 'secondary'}
            hint="Camps are paid before the fight, win or lose. This is what decides which room you can afford next."
          />
          <Fact
            label="Confidence"
            value={Math.round(fighter.condition.confidence)}
            emphasis="tertiary"
            tone={
              fighter.condition.confidence >= 65
                ? 'good'
                : fighter.condition.confidence <= 35
                  ? 'bad'
                  : undefined
            }
          />
        </div>

        <div className="row" style={{ marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
          <Button size="sm" onClick={() => navigate({ name: 'fighter', id: fighter.id as string })}>
            Full profile
          </Button>
          {ladder?.isChampion && (
            <Chip tone="accent" title="Reigning divisional champion">
              <Icon name="champion" /> Champion
            </Chip>
          )}
        </div>

        {/*
          What the career has cost so far.

          Freshness, wear and trauma were between them either invisible or conditional: trauma
          appeared only past 45, wear appeared nowhere on this screen at all, and freshness did not
          exist. Hiding a number until it is bad means the player learns about it too late to act
          on it, which is the opposite of what a resource is for — so these are always on, and read
          in plain language rather than as a bare figure out of a hundred.
        */}
        <div className="row" style={{ marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
          <Fact
            label="Freshness"
            value={`${describeFreshness(freshness)} · ${Math.round(freshness)}`}
            emphasis={freshness < 45 ? 'primary' : 'tertiary'}
            tone={
              freshness >= 65
                ? 'good'
                : freshness < 25
                  ? 'bad'
                  : freshness < 45
                    ? 'warn'
                    : undefined
            }
            hint="How recovered you are. Camps and hard fights spend it; time gives it back, and more slowly the more miles you have on you."
          />
          {/*
          Decline runs on this, not on the birthday — docs/27 §12. Beside the damage rather than
          beside the age, because it is a fact about the body rather than about the calendar.
        */}
          <Fact
            label="Body age"
            value={mileage.body}
            emphasis={mileage.heavy ? 'primary' : 'tertiary'}
            tone={mileage.heavy ? 'bad' : mileage.notable ? 'warn' : undefined}
            hint={mileage.because}
          />

          <Fact
            label="Body wear"
            value={`${Math.round(fighter.condition.bodyWear)} / 100`}
            emphasis="tertiary"
            tone={
              fighter.condition.bodyWear >= 55
                ? 'bad'
                : fighter.condition.bodyWear >= WEAR_CONCERN
                  ? 'warn'
                  : undefined
            }
            hint="Joints and soft tissue. Raises camp injury risk and slows how fast you come back."
          />
          <Fact
            label="Head trauma"
            value={`${Math.round(fighter.condition.headTrauma)} / 100`}
            emphasis="tertiary"
            tone={
              fighter.condition.headTrauma >= TRAUMA_MEDICAL
                ? 'bad'
                : fighter.condition.headTrauma >= TRAUMA_CONCERN
                  ? 'warn'
                  : undefined
            }
            hint="Only ever goes up. Permanently lowers what your chin can absorb, and eventually ends careers."
          />
          <Fact
            label="Last fought"
            value={
              daysSince === undefined
                ? 'Never'
                : daysSince < 31
                  ? `${daysSince}d ago`
                  : `${Math.round(daysSince / 30)}mo ago`
            }
            emphasis="tertiary"
            tone={rust > 0.35 ? 'warn' : undefined}
            hint="Time out of the cage costs sharpness, not strength — you see it later, you do not hit softer."
          />
        </div>

        {freshness < 30 && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Alert tone={freshness < 15 ? 'danger' : 'warn'} title="You are running on empty">
              Nothing about your ability has changed. You have simply not recovered from what you
              have already done, and it takes longer to come back the older and more worn you get.
            </Alert>
          </div>
        )}

        {/* Damage is a decision input, not a stat. It gets an alert, not a chip. */}
        {fighter.condition.headTrauma >= TRAUMA_CONCERN && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Alert
              tone={fighter.condition.headTrauma >= TRAUMA_MEDICAL ? 'danger' : 'warn'}
              title={
                fighter.condition.headTrauma >= TRAUMA_MEDICAL
                  ? 'Your chin is going'
                  : 'Damage is accumulating'
              }
            >
              Head trauma {Math.round(fighter.condition.headTrauma)} of 100. It only ever goes up,
              and it permanently lowers what your chin can absorb.
            </Alert>
          </div>
        )}
      </Card>

      {ladder && (
        <LadderCard
          ladder={ladder}
          fighterId={fighter.id as string}
          divisionName={getDivision(fighter.divisionId).name}
          lock={
            // Interest arrives whatever your contract says — seeing what you are worth is most
            // of the drama of being stuck on a bad deal. Acting on it is what the deal governs.
            ladder.offers.length > 0 && ladder.offers[0]
              ? (() => {
                  const eligibility = canSignWith(db, fighter, ladder.offers[0]!.promotion);
                  return eligibility.allowed
                    ? undefined
                    : { reason: eligibility.reason, releasable: eligibility.releasable };
                })()
              : undefined
          }
          onGoToOffers={() => navigate({ name: 'offers' })}
          onAskRelease={() => {
            const outcome = requestRelease(db, fighter);
            setReleaseWord(outcome.reason);
            commit();
          }}
        />
      )}
      {releaseWord && (
        <Alert tone="info" title="You asked for your release">
          {releaseWord}
        </Alert>
      )}

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
          <p
            className="muted prose"
            style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}
          >
            Camps are where a career is actually made. Every week you train is a week older, and
            every area has a ceiling you cannot train past.
          </p>
          <Button variant="primary" block onClick={() => navigate({ name: 'training' })}>
            Go to training
          </Button>
        </Card>
      )}

      {booking && opponent ? (
        <Card
          title={booking.bout.isTitleFight ? 'Next fight — for the title' : 'Next fight'}
          raised
        >
          <p
            style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-1)' }}
          >
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
                Everyone available in {division.name} has been fought recently. Sit out a few weeks
                and the picture will change.
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
                  history={previousMeetings(fighter, offer.opponent.id)}
                  rivalry={getRivalry(db, fighter.id, offer.opponent.id, world.day)}
                  day={world.day}
                  /*
                    Quoted at the slot this fight would actually be booked into, from the same
                    function `bookFight` uses. It was quoting the default rung, so a main event
                    was advertised at a main-card purse and then paid 2.5x it — and the number
                    on this screen is the one a player weighs the fight against.
                  */
                  position={playerCardPosition(fighter, offer.opponent, false)}
                  purse={currentPurse(
                    db,
                    fighter,
                    playerCardPosition(fighter, offer.opponent, false),
                  )}
                  advice={adviceOn(db, fighter, offer.opponent.id as string, {
                    merit: boutMerit(offer),
                    purse:
                      currentPurse(db, fighter, playerCardPosition(fighter, offer.opponent, false))
                        ?.total ?? 0,
                  })}
                  managerName={standing.manager?.name}
                />
              ))}
            </div>
          )}
        </Card>
      )}

      {/*
        Where you stand contractually.

        Deliberately on the home screen rather than behind a Contracts tab: a contract counter
        that says "fight 3 of 4" is the cheapest source of anticipation in the whole design,
        because it makes free agency *approach* rather than arrive. The fairness ratio is
        computed and never shown — a ratio needs a paragraph and a sentence does not.
      */}
      <Card title="Your situation">
        {standing.freeAgent || !standing.agreement ? (
          <>
            {/*
              Being unsigned used to read as neutral — "nobody owes you a fight and you owe
              nobody one" is very nearly a boast. It is the most dangerous state in a career and
              the screen has to say so, because the cost of it is invisible until the day you
              cannot get booked.
            */}
            <Alert tone="warn" title="You are a free agent">
              Nobody is obliged to offer you anything. Every week without a booking is a week your
              name gets smaller and your timing gets worse, and nothing here is going to happen
              until you sign something.
            </Alert>
            <Button
              variant="primary"
              onClick={() => navigate({ name: 'offers' })}
              style={{ marginTop: 'var(--space-3)' }}
            >
              See what is on the table
            </Button>
          </>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <p style={{ fontWeight: 700 }}>{standing.status?.summary}</p>
            <p className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
              {standing.promotion?.name} · £{standing.agreement.showPurse}k to show, £
              {standing.agreement.winBonus}k to win
              {standing.agreement.championshipExtension === 'standard' &&
                ' · you cannot leave while you hold the belt'}
            </p>
            <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
              {describeFairness(standing.fairness ?? 1)}
            </p>
            {/*
              What the layoff has cost. `Condition.ringRust` was in the model from the start and
              was never written or read by anything, so sitting out was free — which is exactly
              why the pressure the contract layer is built on never arrived.
            */}
            {rust > 0 && (
              <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
                <Chip tone={rust > 0.5 ? 'warning' : 'neutral'}>{rustLabel(rust)}</Chip>{' '}
                {describeRust(rust)}
              </p>
            )}
            {triggers.length > 0 && (
              <Alert tone="info" title="You have grounds to reopen this">
                {describeTrigger(triggers[0]!)}
              </Alert>
            )}

            {/*
              The ratchet.

              Doc 16 specifies the re-paper in full and nothing implemented it, which left
              the contract layer with exactly one shape of decision: sign, then endure until
              it expires. This is the offer that makes captivity something you agreed to
              repeatedly — more money today for more captivity tomorrow, put in front of you
              at the precise moment you feel invincible.

              Both halves are stated plainly, including the ones that cost you, because the
              whole point is that it is a real decision and a fighter who says yes should
              know exactly what they said yes to.
            */}
            {repaper && !signedRepaper && (
              <Alert tone="good" title="They want to tear this up">
                <span
                  className="prose"
                  style={{ display: 'block', marginBottom: 'var(--space-2)' }}
                >
                  {repaper.reason}
                </span>
                <span
                  className="prose"
                  style={{ display: 'block', marginBottom: 'var(--space-2)' }}
                >
                  <strong>
                    £{repaper.terms.showPurse}k to show, £{repaper.terms.winBonus}k to win
                  </strong>{' '}
                  — up from £{repaper.current.showPurse}k and £{repaper.current.winBonus}k, a{' '}
                  {Math.round(repaper.uplift * 100)}% rise starting with your next fight.
                </span>
                <span
                  className="prose"
                  style={{ display: 'block', marginBottom: 'var(--space-3)' }}
                >
                  In exchange the deal restarts at{' '}
                  <strong>{repaper.terms.fightsOwed} fights</strong> owed, where you currently owe{' '}
                  {repaper.current.fightsRemaining}
                  {repaper.terms.championshipExtension !== 'none' &&
                    ', and the championship extension is reattached'}
                  . Saying no costs you nothing today, but the offer may not come back at this
                  price.
                </span>
                {/*
                  Two steps, and a confirmation that stays.
                  
                  This restarts the deal at N fights owed and can reattach the championship
                  extension — the most binding thing a fighter can do — and it was one tap on
                  a default button. Accepting a fight two-steps; committing a camp two-steps;
                  resetting the save two-steps. This outranks all three.
                  
                  It also confirmed nothing: `standing` recomputes, the alert vanishes, and
                  the player is left with no evidence anything happened. The receipt below is
                  in a live region and persists until the next fight.
                */}
                {confirmingRepaper ? (
                  <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <Button
                      onClick={() => {
                        acceptRepaperOffer(db, fighter, repaper);
                        setSignedRepaper(repaper);
                        setConfirmingRepaper(false);
                        commit();
                      }}
                    >
                      Yes — sign it
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmingRepaper(false)}>
                      Not yet
                    </Button>
                  </div>
                ) : (
                  <Button variant="secondary" onClick={() => setConfirmingRepaper(true)}>
                    Sign it
                  </Button>
                )}
              </Alert>
            )}

            {/*
              The receipt.

              Its own region rather than a branch inside the alert, because the alert is gone
              by then: `standing` recomputes on commit and the offer stops existing, which is
              exactly why signing used to leave the player with no evidence anything happened.
            */}
            {signedRepaper && (
              <Alert tone="good" title="Signed">
                <span className="prose" style={{ display: 'block' }}>
                  You now owe {signedRepaper.terms.fightsOwed} fights at £
                  {signedRepaper.terms.showPurse}k to show and £{signedRepaper.terms.winBonus}k to
                  win.
                </span>
              </Alert>
            )}

            {/*
              Whether the job is safe.

              `describeReleaseRisk` was written and rendered nowhere, so the player could be
              two losses from being cut with no way of knowing — while the world around them
              now actually does the cutting. This is the one piece of contract information a
              fighter genuinely has: everybody in a gym knows when somebody is fighting for
              their job.

              Silent at zero rather than reassuring, because a permanent "your place is not in
              question" badge trains the player to stop reading the block.
            */}
            {jobRisk > 0 && (
              <Alert
                tone={jobRisk >= 0.45 ? 'danger' : 'warn'}
                title={jobRisk >= 0.45 ? 'You are fighting for your job' : 'Your place is slipping'}
              >
                {describeReleaseRisk(jobRisk)}
              </Alert>
            )}
            {standing.agreement.tolledDays > 0 && (
              <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
                The clock has been stopped for {standing.agreement.tolledDays} days you were not
                available. Time out does not run a deal down.
              </p>
            )}
          </div>
        )}

        {/* One number, and it is also the relationship. */}
        <p className="prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
          {standing.manager ? (
            <>
              <strong>{standing.manager.name}</strong> manages you, on{' '}
              {Math.round(standing.manager.purseRate * 100)}% of the purse.{' '}
              {describeAdviceRecord(standing.manager)} {describeStable(standing.manager)}
            </>
          ) : (
            <>
              You have no manager. You keep every penny and you are negotiating against people who
              do this for a living.
            </>
          )}
        </p>
      </Card>

      {/*
        The world, reported.

        Everything below this point is what makes the hub a home rather than a booking form:
        a player should be able to sit here, see what the sport did while they were in camp,
        and reach everything else in one tap.
      */}
      <Card title="The sport" flush={false}>
        <NewsFeed
          items={news}
          limit={8}
          onFighterClick={(id) => navigate({ name: 'fighter', id })}
          emptyMessage="Nothing yet. Train or fight, and the divisions will get on with themselves while you do."
        />
      </Card>

      <Card title="Everywhere else">
        <div className="hub-nav">
          <HubLink
            icon="🥊"
            label="Training"
            hint="Camps, gyms, weight class"
            onClick={() => navigate({ name: 'training' })}
          />
          <HubLink
            icon="📝"
            label="Contract"
            hint="Offers, and who negotiates"
            onClick={() => navigate({ name: 'offers' })}
          />
          <HubLink
            icon="📊"
            label="Rankings"
            hint="Who is above you"
            onClick={() => navigate({ name: 'rankings' })}
          />
          <HubLink
            icon="👤"
            label="Your profile"
            hint="Ratings, record, medical"
            onClick={() => navigate({ name: 'fighter', id: fighter.id as string })}
          />
          <HubLink
            icon="📋"
            label="Roster"
            hint="Everybody in the sport"
            onClick={() => navigate({ name: 'roster' })}
          />
          <HubLink
            icon="✏️"
            label="Editor"
            hint="Change anything"
            onClick={() => navigate({ name: 'editor' })}
          />
          <HubLink
            icon="⚙️"
            label="Settings"
            hint="Theme, save, reset"
            onClick={() => navigate({ name: 'settings' })}
          />
        </div>
      </Card>
    </div>
  );
}

/** One tile on the hub's navigation grid. */
function HubLink({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: string;
  label: string;
  hint: string;
  onClick(): void;
}) {
  return (
    <button type="button" className="hub-nav__item" onClick={onClick}>
      <span className="hub-nav__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="hub-nav__label">{label}</span>
      <span className="hub-nav__hint">{hint}</span>
    </button>
  );
}

function OfferRow({
  offer,
  expanded,
  onSelect,
  onAccept,
  history,
  rivalry,
  day,
  purse,
  advice,
  managerName,
  position,
}: {
  offer: MatchupAppraisal;
  expanded: boolean;
  onSelect: () => void;
  onAccept: () => void;
  history: { wins: number; losses: number; total: number };
  rivalry: Rivalry;
  day: number;
  purse?: { show: number; win: number; total: number };
  advice: { recommended: boolean; line: string };
  managerName?: string;
  /** Where this bout would land on the card, which decides rounds, camp length and purse. */
  position: CardPosition;
}) {
  const { opponent, step, winChance } = offer;
  const heat = currentHeat(rivalry, day);
  // Headlining is the second axis of a career beside the record, and it was never mentioned
  // until after the fight. It is also the single biggest thing separating one offer from
  // another here: five rounds instead of three, and ten weeks of camp instead of eight.
  const headlining = position === 'mainEvent';
  const campWeeks = headlining ? 10 : 8;

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
          {/* On the page, not in a title attribute — a tooltip shows nothing on a phone,
              and this is the game's own teaching material. */}
          {(history.total > 0 || heat >= 40) && (
            <span className="list__secondary" style={{ display: 'block' }}>
              {history.total > 0 &&
                `You have met ${history.total === 1 ? 'once' : `${history.total} times`} — ${history.wins}–${history.losses}. `}
              {rivalry.isRivalry
                ? 'There is real bad blood here, and it pays.'
                : heat >= 40 && 'The audience wants this one.'}
            </span>
          )}
        </span>
        <span
          className="row"
          style={{ gap: 'var(--space-1)', flexWrap: 'wrap', justifyContent: 'flex-end' }}
        >
          {/*
            A grudge is the single most important thing about an offer, so it gets a glyph
            and outranks the difficulty chip rather than sitting beside it at equal weight.
            "Rematch" moved down to the secondary line below — four equal pills made the
            important one invisible, which is the whole failure this vocabulary exists to
            prevent.
          */}
          {rivalry.isRivalry ? (
            <Chip tone="negative">{ICON.streak} Grudge</Chip>
          ) : (
            heat >= 40 && <Chip tone="warning">{ICON.streak} Heat</Chip>
          )}
          {headlining && <Chip tone="accent">Main event</Chip>}
          <Chip tone={difficulty.tone}>{difficulty.label}</Chip>
        </span>
      </button>

      {expanded && (
        <div
          style={{
            padding: 'var(--space-4)',
            background: 'var(--surface-sunken)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {/* What this opponent will actually do to you, before any numbers. */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <FighterRead attributes={opponent.attributes} />
          </div>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <Fact label="Record" value={recordString(opponent.summary)} emphasis="primary" />
            <Fact
              label="Overall"
              value={<OverallRating rating={overallRating(opponent.attributes)} />}
            />
            <Fact
              label="Star power"
              value={Math.round(opponent.starPower)}
              icon="star"
              emphasis="tertiary"
            />
            {/* Money, plainly. A heated fight pays more, which is what makes building a
                rivalry worth doing rather than just something that happens to you. An
                unsigned fighter has no contract to quote, so nothing is shown. */}
            {purse && (
              <Fact
                label="Purse"
                value={`£${purse.show}k + £${purse.win}k`}
                emphasis="secondary"
                hint="Show money is paid win or lose. The win bonus is not, and the manager, the corner and the taxman all come out of both."
              />
            )}
          </div>

          {(heat >= 20 || history.total > 0) && (
            <p
              className="prose"
              style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}
            >
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
              style={{ marginBottom: 'var(--space-3)' }}
            >
              <span aria-hidden="true">{advice.recommended ? '👍' : '✋'}</span>{' '}
              <strong>{managerName}:</strong> &ldquo;{advice.line}&rdquo;
            </p>
          )}

          {/*
            The length of the camp, from the slot rather than from a constant in the copy. It
            said "eight weeks time" unconditionally, which was already wrong for a title fight
            and became wrong for every main event the moment those went to five rounds and a
            ten-week camp. This is the sentence a player reads before committing two months.
          */}
          <p
            className="muted prose"
            style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}
          >
            {headlining && <strong>You would headline. Five rounds, and a ten-week camp. </strong>}
            Accepting books the fight for {campWeeks === 10 ? 'ten' : 'eight'} weeks time. You can
            withdraw before fight night, but you will lose the camp.
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
  fighterId,
  divisionName,
  lock,
  onGoToOffers,
  onAskRelease,
}: {
  ladder: LadderStatus;
  /** So the player's own row can be marked in the table rather than only counted. */
  fighterId: string;
  divisionName: string;
  /*
    Why the player cannot act on the interest below, if they cannot.
   
    This card used to carry its own "Sign with X" button wired to a three-line `signWith` that set
    `promotionId` and nothing else — no agreement, no bonus paid, no old deal closed — so a player
    who used it ended up at their new promotion still on the old one's contract. Signing now lives
    in exactly one place, the offers screen, and this card's job is to say who is interested and
    what is standing in the way.
  */
  lock?: { reason: string; releasable: boolean };
  onGoToOffers(): void;
  onAskRelease(): void;
}) {
  const { promotion, position, isChampion, titleShot, offers, progress, ranked, champion } = ladder;

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
          <Chip tone={promotion.tier === 'global' ? 'accent' : 'info'}>
            {PROMOTION_TIER_LABELS[promotion.tier]}
          </Chip>
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

      {/*
        The division, which the game has always computed and never shown.
       
        `getLadderStatus` has returned the full ranked list since the ladder shipped and the hub
        used only your own position out of it — so the screen could say "Ranked #4" without ever
        saying who the three people above you were. A ranking you cannot see the rest of is a
        number, not a standing: the whole reason to care about being fourth is knowing who is
        first and who is directly in front of you.
      */}
      {ranked.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <h3 className="section-title">
            {promotion ? `${promotion.shortName} ${divisionName}` : divisionName}
          </h3>
          <ol className="rankings">
            {ranked.slice(0, 10).map((entry, index) => {
              const isChamp = champion?.id === entry.fighter.id;
              const isYou = entry.fighter.id === fighterId;
              return (
                <li
                  key={entry.fighter.id as string}
                  className="rankings__row"
                  data-you={isYou ? 'true' : undefined}
                  aria-current={isYou ? 'true' : undefined}
                >
                  <span className="rankings__place">{isChamp ? 'C' : index + 1}</span>
                  <span className="rankings__name">
                    {displayName(entry.fighter)}
                    {isYou && <span className="rankings__badge">You</span>}
                  </span>
                  <span className="rankings__record">
                    {entry.fighter.summary.wins}-{entry.fighter.summary.losses}
                    {entry.fighter.summary.draws > 0 && `-${entry.fighter.summary.draws}`}
                  </span>
                </li>
              );
            })}
          </ol>
          {position !== undefined && position > 10 && (
            <p
              className="muted"
              style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}
            >
              You are #{position} of {ranked.length}. The top ten is what the promotion talks about.
            </p>
          )}
        </div>
      )}

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
                  {/*
                    Described as a likely bonus rather than promised as a figure. The old label
                    said "Signing bonus £Xk" next to a button that never paid it, and the real
                    number is negotiated on the offers screen.
                  */}
                  <Chip tone="positive">Around £{offer.bonus}k to sign</Chip>
                </div>
              </div>
            ))}
          </div>

          {lock ? (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Alert tone="warn" title="You are under contract">
                {lock.reason}
                {lock.releasable && (
                  <div className="row" style={{ marginTop: 'var(--space-2)' }}>
                    <Button size="sm" onClick={onAskRelease}>
                      Ask to be released
                    </Button>
                  </div>
                )}
              </Alert>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <Button size="sm" variant="primary" onClick={onGoToOffers}>
                See the terms
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
