import { useMemo, useState } from 'react';
import {
  ATTRIBUTE_META,
  DANGEROUS_SEVERITY,
  appraiseDivisionMove,
  getDivision,
  overallRating,
  viableDivisions,
  TRAINING_FOCUSES,
  TRAINING_META,
  activeInjuries,
  campImpairment,
  fighterAge,
  forecastTraining,
  attributeRoom,
  restAdvice,
  DEFAULT_INTENSITY,
  INTENSITY_META,
  STANDARD_LOAD_PER_DAY,
  TRAINING_INTENSITIES,
  describeFreshness,
  freshnessOf,
  recoveryRate,
  weeksUntilFit,
  type TrainingIntensity,
  type AttributeKey,
  type Coach,
  type DivisionId,
  type Gym,
  type TrainingFocus,
  walkingWeightOf,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { CampReport } from './CampReport';
import { Button, Card, Chip, Empty, Segmented } from '../ui';
import { money, spendLine } from '../ui/format';
import {
  changeDivision,
  divisionField,
  joinGym,
  runLayoff,
  runTraining,
  type TrainingOutcome,
} from '../game/progression';
import { Alert, FighterRead, KeyStat } from '../ui/signals';
import { getBooking } from '../game/career';
import { formatGameDay } from '../shell/Shell';
import { campCostFor, solvencyOf } from '../game/money';
import { InjuryRisk, InjuryStatus, RestCard } from './Recovery';

const WEEK_OPTIONS = [
  // The labels name what each length is *for*, because the arithmetic has a genuine sweet
  // spot at eight weeks and nothing on the screen said so. See `CAMP_RAMP_WEEKS`: a camp has
  // a fixed cost at the front and diminishing returns at the back, so per-week value rises,
  // peaks at eight and falls. Four weeks sharpens; it does not develop.
  //
  // Two weeks was added underneath them, and it is not a fourth camp length — it is the
  // smallest amount of time the screen is willing to consume. The shortest block used to be
  // four weeks, so *every* control that moved the clock moved it by a month or more, which is
  // what made freshness look like a number the game was inventing between presses rather than
  // one it was keeping. It also does real work now that camp injury risk is proportional to
  // block length rather than floored at half a camp.
  { value: '2', label: '2 weeks', hint: 'Tick over' },
  { value: '4', label: '4 weeks', hint: 'Sharpen up' },
  { value: '8', label: '8 weeks', hint: 'Full camp' },
  { value: '12', label: '12 weeks', hint: 'Long build' },
] as const;

/**
 * How hard, which is a different question from how long.
 *
 * The hints name what each one is *for* rather than describing the multipliers, because the
 * decision is situational: light is what a 38-year-old runs to hold his level and get his legs
 * back, overreach is what a 24-year-old with room runs when he can afford to be flat afterwards.
 */
const INTENSITY_OPTIONS = TRAINING_INTENSITIES.map((key) => ({
  value: key,
  label: INTENSITY_META[key].label,
  hint:
    key === 'light'
      ? 'Recover while you work'
      : key === 'standard'
        ? 'A normal camp'
        : key === 'hard'
          ? 'Build, and feel it'
          : 'Everything, now',
}));

/**
 * Training between fights.
 *
 * The screen where a career is actually made. Two constraints are surfaced honestly rather
 * than hidden: focusing on two things is worse for both than focusing on one, and an area
 * already at its ceiling will not move however long you drill it.
 */
export function TrainingScreen() {
  const { db, world, playerFighter, commit } = useGame();
  const { navigate } = useRouter();
  const [focuses, setFocuses] = useState<TrainingFocus[]>(['boxing']);
  const [weeks, setWeeks] = useState<'2' | '4' | '8' | '12'>('8');
  const [intensity, setIntensity] = useState<TrainingIntensity>(DEFAULT_INTENSITY);
  const [outcome, setOutcome] = useState<TrainingOutcome | undefined>();

  if (!playerFighter) {
    return (
      <Empty title="No career in progress">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Start a career
        </Button>
      </Empty>
    );
  }

  const fighter = playerFighter;
  const gym = fighter.gymId ? (db.gyms.findById(fighter.gymId) as Gym | undefined) : undefined;
  const coach = fighter.headCoachId
    ? (db.coaches.findById(fighter.headCoachId) as Coach | undefined)
    : undefined;

  /*
    The nearest gym that actually has a head coach, so the no-coach warning can name a
    destination instead of gesturing at a list. Sorted by the reputation it asks for rather than
    by quality: what the player needs to know is which door opens first, and the cheapest room
    is not the one with the lowest bar.
  */
  const nearestCoachedGym = useMemo(() => {
    const options = (db.gyms.findAll() as Gym[])
      .filter((g) => g.headCoachId && g.id !== fighter.gymId)
      .map((g) => {
        const required = Math.max(0, g.prestige - 35);
        return { gym: g, required, shortBy: Math.max(0, required - fighter.reputation) };
      })
      .sort((a, b) => a.shortBy - b.shortBy || a.required - b.required);
    return options[0];
  }, [db, fighter.gymId, fighter.reputation]);

  const carrying = activeInjuries(fighter.injuries ?? [], world.day);
  const impairment = campImpairment(fighter.injuries ?? [], world.day);
  const fitInWeeks = weeksUntilFit(fighter.injuries ?? [], world.day);

  // A booked fight is the single most important thing about this screen and it was not
  // mentioned anywhere: training twelve weeks with a fight booked in eight walked the world
  // clock straight past fight night.
  const booking = getBooking(fighter.id as string);
  const weeksToFight = booking
    ? Math.max(0, Math.ceil((booking.bout.day - world.day) / 7))
    : undefined;
  const overrunsFight = weeksToFight !== undefined && Number(weeks) > weeksToFight;

  const cost = campCostFor(gym, Number(weeks));

  /*
   * What this block will leave them at, shown before they commit.
   *
   * Choosing an intensity without knowing what it costs you is choosing blind, which is the whole
   * reason doc 25 § 3.8 puts freshness on the hub in the first place.
   */
  const blockDays = Number(weeks) * 7;
  const netFreshness =
    recoveryRate(fighter, fighterAge(fighter, world.day)) * blockDays -
    blockDays * STANDARD_LOAD_PER_DAY * INTENSITY_META[intensity].load;
  const freshnessAfter = Math.max(0, Math.min(100, freshnessOf(fighter) + netFreshness));
  const funding = solvencyOf(fighter, cost);
  const canPay = fighter.bank >= cost;

  // What this camp is likely to be worth, from the same arithmetic the camp itself runs.
  const forecast = useMemo(
    () =>
      forecastTraining({
        fighter,
        focuses,
        weeks: Number(weeks),
        intensity,
        gym,
        coach,
        day: world.day,
      }),
    [fighter, focuses, weeks, intensity, gym, coach, world.day],
  );

  /*
    A finished camp takes the whole screen.
   
    The report used to be a card appended below the training form, so reading it meant scrolling
    past the controls that produced it while a division picker and a gym list stayed on screen
    competing for attention. Pressing one button consumes months of a career, and the result of
    that was a footnote under the form.
   
    Handing the screen over rather than routing to one keeps the outcome in component state,
    which matters: a route would need the outcome stashed somewhere global and would put a camp
    report in the back-button history, where re-entering it would show a stale one.
  */
  if (outcome) {
    return (
      <CampReport
        outcome={outcome}
        day={world.day}
        onDone={() => {
          setOutcome(undefined);
          navigate({ name: 'hub' });
        }}
        onAgain={() => setOutcome(undefined)}
      />
    );
  }

  const toggleFocus = (focus: TrainingFocus) => {
    setOutcome(undefined);
    setFocuses((current) => {
      if (current.includes(focus)) {
        return current.length === 1 ? current : current.filter((f) => f !== focus);
      }
      // Two at most: a third would just make all three useless. Refused rather than silently
      // dropping the oldest — swapping one out with no explanation makes the cap look like a
      // bug. The chip below says why, mirroring how the camp screen handles the same limit.
      return current.length >= 2 ? current : [...current, focus];
    });
  };

  const train = () => {
    setOutcome(runTraining(db, fighter, focuses, Number(weeks), intensity));
    commit();
  };

  const rest = () => {
    setOutcome(runLayoff(db, fighter, Number(weeks)));
    commit();
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {/*
        Who you are, before what to do about it.

        This card used to be three bare numbers — Age, Gym quality, and a figure labelled
        only "Coach" — on a screen that never once showed the player their own ratings. You
        were choosing what to train without being shown what you had, which meant leaving
        for the profile screen and coming back holding it in your head. FighterRead already
        existed and was used on the *opponent* in fight camp; it belongs here first.
      */}
      <Card raised>
        <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <span>
            <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, display: 'block' }}>
              Age {fighterAge(fighter, world.day)}
            </span>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              {formatGameDay(world.day)}
            </span>
          </span>
          <span
            className="row"
            style={{ gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}
          >
            {weeksToFight !== undefined && (
              <Chip tone={weeksToFight <= 4 ? 'warning' : 'info'}>
                Fight in {weeksToFight === 0 ? 'days' : `${weeksToFight}w`}
              </Chip>
            )}
            {/* The bank, which decides what kind of camp you can run, which decides what
                kind of fighter you become. */}
            {/*
              The state in words, not only in the tone.
              
              It was `£12.4k` with the difference between comfortable, tight and broke carried
              purely by colour — and a `title` that explained what a bank is rather than what
              state you were in, which on touch showed nothing at all. The camp screen's own
              quality chip does this correctly with a word.
            */}
            <Chip
              tone={
                funding === 'comfortable' ? 'neutral' : funding === 'tight' ? 'warning' : 'negative'
              }
            >
              {money(fighter.bank)} ·{' '}
              {funding === 'comfortable' ? 'comfortable' : funding === 'tight' ? 'tight' : 'broke'}
            </Chip>
          </span>
        </div>

        <div style={{ marginTop: 'var(--space-3)' }}>
          <FighterRead attributes={fighter.attributes} />
        </div>

        <p
          className="muted prose"
          style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}
          data-testid="coach-status"
        >
          {coach ? (
            <>
              <strong>
                {coach.firstName} {coach.lastName}
              </strong>{' '}
              at {gym?.name}. Specialises in {coach.specialisms.join(', ')} — camps outside that get
              markedly less out of you.
            </>
          ) : (
            /*
              A dead end until now, and one every single player hit.
             
              You do not hire a coach — you join a gym and its head coach becomes yours. That is
              nowhere stated and is not guessable from a screen that only says training is
              ineffective without one. Worse, the starting gym is chosen as the *lowest quality*
              one, which is The Basement, which is one of the two gyms in the seed with no head
              coach at all. So every new fighter in every era begins with this warning showing and
              no route out of it visible.
             
              Starting unattached is the right design — a coach is something to earn, and The
              Basement is a good first room. It just has to read as a starting condition with a
              path rather than as a missing button, so this names the path and the specific gym
              at the end of it.
            */
            <>
              You have no head coach, and training alone costs most of your progress. You do not
              hire one directly &mdash;{' '}
              <strong>a gym&rsquo;s head coach becomes yours when you join</strong>.{' '}
              {nearestCoachedGym ? (
                <>
                  The nearest room with one is <strong>{nearestCoachedGym.gym.name}</strong>
                  {nearestCoachedGym.shortBy > 0 ? (
                    <>
                      , which needs reputation {nearestCoachedGym.required} &mdash; you are on{' '}
                      {playerFighter.reputation}. Win and get noticed, then join it below.
                    </>
                  ) : (
                    <>, and you can join it below right now.</>
                  )}
                </>
              ) : (
                <>Join one from the list below.</>
              )}
            </>
          )}
        </p>
      </Card>

      {/*
        The guard that was missing entirely. runTraining advances the world clock by the full
        block, so a twelve-week camp with a fight booked in eight walked straight past fight
        night — verified, and silent.
      */}
      {overrunsFight && (
        <Alert tone="danger" title="That is longer than you have">
          You fight in {weeksToFight} week{weeksToFight === 1 ? '' : 's'}. A {weeks}-week block
          would run past fight night. Shorten the camp, or go to fight week and prepare for the
          opponent you already have.
        </Alert>
      )}

      {/*
        One injury panel, shared with the hub.

        This screen and the hub were saying different things about the same knee — this one knew
        what it cost the camp and the hub did not mention it at all. `InjuryStatus` is the version
        that also names which attributes are suppressed, and the camp cost is stated underneath it
        because that part genuinely is specific to being on the training screen.
      */}
      {carrying.length > 0 && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <InjuryStatus fighter={fighter} day={world.day} />
          <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
            Training through it costs you roughly {Math.round((1 - impairment) * 100)}% of the camp,
            and about {fitInWeeks} week{fitInWeeks === 1 ? '' : 's'} of patience would cost you none
            of it.
          </p>
        </div>
      )}

      {/*
        Rest, beside the thing it trades against.

        This lived on the career hub, permanently, as one of the eighteen regions that made the
        dashboard unreadable. It belongs here: training and resting are the same decision taken
        from opposite ends — do I spend condition or restore it — and a player weighing an
        eight-week camp against being flat should be able to see both answers at once. The hub
        now diagnoses ("Flat — 34") and sends them here to act.
      */}
      <RestCard fighter={fighter} fightDay={booking?.bout.day} />

      <Card title="What to work on">
        <p
          className="muted prose"
          style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}
        >
          Pick one focus, or two at a reduced rate. Areas already at your ceiling will not move —
          the bar on the right is how much room you have left.
        </p>

        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {TRAINING_FOCUSES.map((key) => {
            const meta = TRAINING_META[key];
            const selected = focuses.includes(key);
            const atFocusLimit = focuses.length >= 2;
            const keys = Object.keys(meta.attributes) as AttributeKey[];
            /*
             * The room the *model* sees, not a ceiling invented for the screen.
             *
             * This called `headroom` — the physical wall — on skill attributes too, so the advice
             * the player was ranking camps by disagreed with the arithmetic that would run. The
             * AI's own planner has always used the split version; the player got the other one.
             */
            const room = keys.reduce((a, k) => a + attributeRoom(fighter, k), 0) / keys.length;
            const inSpecialism = coach?.specialisms.includes(meta.specialism) ?? false;

            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleFocus(key)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: 'var(--space-3)',
                  minHeight: 'var(--tap-target)',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                }}
              >
                <span
                  className="row"
                  style={{ justifyContent: 'space-between', gap: 'var(--space-2)' }}
                >
                  <span style={{ fontWeight: 700 }}>{meta.label}</span>
                  <span className="row" style={{ gap: 'var(--space-1)' }}>
                    {inSpecialism && <Chip tone="positive">Coach&rsquo;s specialism</Chip>}
                    <Chip tone={room > 0.35 ? 'info' : room > 0.12 ? 'warning' : 'neutral'}>
                      {room > 0.35 ? 'Lots of room' : room > 0.12 ? 'Some room' : 'Near ceiling'}
                    </Chip>
                  </span>
                </span>
                <span
                  className="muted"
                  style={{ display: 'block', fontSize: 'var(--text-sm)', marginTop: 2 }}
                >
                  {meta.blurb}
                </span>
                <span
                  className="faint"
                  style={{ display: 'block', fontSize: 'var(--text-xs)', marginTop: 2 }}
                >
                  Builds {keys.map((k) => ATTRIBUTE_META[k].label).join(', ')}
                </span>
                {/*
                  Why the tap did nothing, on the thing that was tapped. The cap used to
                  silently swap out whichever focus had been chosen first, which reads as a
                  bug rather than a limit. Mirrors the camp screen's handling of its own cap.
                */}
                {atFocusLimit && !selected && (
                  <span style={{ display: 'block', marginTop: 'var(--space-2)' }}>
                    <Chip tone="warning">⚠ Two at most — drop one first</Chip>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <h3 className="section-title">How long</h3>
          <Segmented
            label="Training block length"
            value={weeks}
            onChange={(v) => {
              setWeeks(v);
              setOutcome(undefined);
            }}
            options={WEEK_OPTIONS}
          />
          <p
            className="faint prose"
            style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}
          >
            A camp costs its first fortnight getting back to where you left off, so eight weeks is
            the most you will ever get per week spent. Twelve gives more in total and less per week
            — and every week training is a week older. You return on{' '}
            <strong>{formatGameDay(world.day + Number(weeks) * 7)}</strong>.
          </p>
        </div>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <h3 className="section-title">How hard</h3>
          <Segmented
            label="Training intensity"
            value={intensity}
            onChange={(v) => {
              setIntensity(v);
              setOutcome(undefined);
            }}
            options={INTENSITY_OPTIONS}
          />
          <p
            className="faint prose"
            style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}
            data-testid="intensity-effect"
          >
            {INTENSITY_META[intensity].blurb} Length builds craft; intensity builds the body — so a
            long light block is the best technical camp there is, and a short hard one is the
            cheapest way to move a physical.{' '}
            {netFreshness >= 0
              ? `You will finish this block fresher than you started, at about ${Math.round(freshnessAfter)} of 100.`
              : `You will finish at about ${Math.round(freshnessAfter)} of 100 — ${describeFreshness(freshnessAfter).toLowerCase()}.`}
          </p>

          {/*
            The other price of the camp, and the one that was never quoted.

            Money is stated to the penny here and injury risk — which can cost four months — was
            not stated at all, so the player's only evidence about it was the injuries themselves.
            That is the difference between a system and weather.
          */}
          <div
            style={{
              marginTop: 'var(--space-3)',
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--border)',
            }}
          >
            <InjuryRisk
              fighter={fighter}
              day={world.day}
              weeks={Number(weeks)}
              intensity={intensity}
              intensityLabel="Training intensity"
            />
          </div>

          <p className="prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
            {weeks} weeks at {gym?.name ?? 'no gym'} costs <strong>{money(cost)}</strong>.{' '}
            {canPay
              ? spendLine({ cost, balance: fighter.bank })
              : `${spendLine({ cost, balance: fighter.bank })} You can run it anyway — nothing stops you — but you will start taking fights you would otherwise refuse.`}
          </p>
        </div>

        {/*
          The forecast.

          The duration choice was previously blind: three buttons and a sentence claiming
          diminishing returns that the engine did not actually implement. It does now, and
          this shows it — computed from the same arithmetic the camp runs, so it cannot
          promise something the simulation will not honour. A range rather than a number,
          because a camp is not a purchase.

          The shape is no longer "shorter is more efficient". A camp costs a fortnight at the
          front getting back to where you left off, so value per week rises to a peak at eight
          weeks and falls after it. That also closed a real exploit: splitting a long camp
          into short ones used to be worth 32% more for the same total weeks.
        */}
        <div
          style={{
            marginTop: 'var(--space-4)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {forecast.atCeiling ? (
            <Alert tone="warn" title="Nothing left to gain here">
              Every attribute this focus trains is already at your ceiling. The weeks will pass and
              nothing will move — pick something else, or accept that this part of your game is
              finished.
            </Alert>
          ) : (
            <>
              <KeyStat
                value={`+${forecast.totalExpected.toFixed(1)}`}
                label="Expected from this camp"
                tone={
                  forecast.totalExpected >= 2.5
                    ? 'good'
                    : forecast.totalExpected >= 1
                      ? 'neutral'
                      : 'bad'
                }
                detail={
                  forecast.totalExpected < 1
                    ? 'Barely worth the weeks. A better room, a better coach, or more headroom would all help.'
                    : 'Rating points across everything this focus builds. Camps are meant to be small and to compound.'
                }
              />
              <ul style={{ marginTop: 'var(--space-3)' }}>
                {(Object.entries(forecast.expected) as [AttributeKey, number][])
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, value]) => (
                    <li
                      key={key}
                      className="row"
                      style={{ justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}
                    >
                      <span>{ATTRIBUTE_META[key].label}</span>
                      <span className="numeric muted">
                        +{(forecast.low[key] ?? 0).toFixed(1)} to +
                        {(forecast.high[key] ?? 0).toFixed(1)}
                        <span className="visually-hidden">, expected {value.toFixed(1)}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      </Card>

      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={() => !overrunsFight && train()}
            aria-disabled={overrunsFight}
          >
            Train for {weeks} weeks
          </Button>
          {/*
            Rest needs the same guard. `runLayoff` advances the clock exactly as `runTraining`
            does, so this button walked straight past a booked fight — the very bug the alert
            below says was fixed. It was fixed for one of the two buttons.
          */}
          <Button onClick={() => !overrunsFight && rest()} aria-disabled={overrunsFight}>
            Rest for {weeks} weeks
          </Button>
          <Button variant="ghost" onClick={() => navigate({ name: 'hub' })}>
            Back to career
          </Button>
        </div>

        {overrunsFight && (
          <p className="prose" style={{ fontSize: 'var(--text-sm)', color: 'var(--negative)' }}>
            Neither block will run: you fight in {weeksToFight} week
            {weeksToFight === 1 ? '' : 's'}. Shorten it above.
          </p>
        )}

        {/*
          Rest was labelled "Rest instead" and explained nowhere, which made it the most
          misread control in the game: it looks like recovery and it is *also* skill decay,
          so a healthy fighter who presses it simply gets worse. Which situation the player
          is in is the entire content of this line.
        */}
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
          {restAdvice(fighter.injuries ?? [], world.day)}
        </p>
      </div>

      <DivisionPicker />

      <GymPicker
        currentGymId={fighter.gymId}
        onJoin={(g) => {
          joinGym(db, fighter, g);
          commit();
        }}
      />
    </div>
  );
}

/**
 * Changing gyms.
 *
 * Gated on reputation: the best rooms in the sport do not take unknowns, which is what makes
 * outgrowing your starting gym a milestone rather than a menu option.
 */
function GymPicker({ currentGymId, onJoin }: { currentGymId?: string; onJoin(gym: Gym): void }) {
  const { db, playerFighter } = useGame();
  if (!playerFighter) return null;

  const gyms = (db.gyms.findAll() as Gym[]).slice().sort((a, b) => b.quality - a.quality);

  return (
    <Card title="Gyms">
      <p
        className="muted prose"
        style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}
      >
        A better room means better coaching and better sparring. The best of them will not take you
        until you have done something.
      </p>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        {gyms.map((gym) => {
          const isCurrent = gym.id === currentGymId;
          // The bar is reputation-based, so this is a ladder you climb rather than a list.
          const required = Math.max(0, gym.prestige - 35);
          const hasReputation = playerFighter.reputation >= required;
          // The second gate. Reputation alone made the best rooms a one-way ratchet: once
          // you were in, you were in forever regardless of what happened next. Money means a
          // fighter who loses twice trains somewhere worse next camp — a death spiral you
          // can see coming three months out, which is far better than one that arrives.
          const eightWeeks = campCostFor(gym, 8);
          const canAfford = playerFighter.bank >= eightWeeks;
          // Typed as the real thing rather than `{ lastName }`: a gym's head coach is the only
          // way a fighter gets one, so the row has to be able to say who they are and what they
          // are good at.
          const coach = gym.headCoachId
            ? (db.coaches.findById(gym.headCoachId) as Coach | undefined)
            : undefined;

          return (
            <div
              key={gym.id}
              className="row"
              style={{
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius)',
                border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                background: isCurrent ? 'var(--accent-soft)' : 'var(--surface)',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, display: 'block' }}>{gym.name}</span>
                <span className="muted" style={{ fontSize: 'var(--text-sm)', display: 'block' }}>
                  {gym.city} · quality {gym.quality} · {money(eightWeeks)} for eight weeks
                </span>
                {/*
                  The head coach, named and on its own line, because joining a gym is the only
                  way to get one and the row used to mention them as a bare surname in a list of
                  metadata — if it mentioned them at all. Two of the seven gyms have none, and a
                  player choosing between them has no way to know which.
                */}
                <span className="list__secondary" style={{ display: 'block', marginTop: 2 }}>
                  {coach ? (
                    <>
                      Head coach:{' '}
                      <strong>
                        {coach.firstName} {coach.lastName}
                      </strong>{' '}
                      — {coach.specialisms.join(', ')}
                    </>
                  ) : (
                    <em>No head coach. Your camps here would be self-directed.</em>
                  )}
                </span>
              </span>
              {isCurrent ? (
                <Chip tone="accent">Your gym</Chip>
              ) : !hasReputation ? (
                <Chip tone="warning">Needs reputation {required}</Chip>
              ) : (
                <span className="row" style={{ gap: 'var(--space-2)' }}>
                  {!canAfford && (
                    <Chip
                      tone="warning"
                      title="You can still join. You just cannot pay for a camp there yet."
                    >
                      Beyond your means
                    </Chip>
                  )}
                  <Button size="sm" onClick={() => onJoin(gym)}>
                    Join
                  </Button>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Changing weight class.
 *
 * The one screen in the game where the "ratings are absolute" decision becomes visible to
 * the player: nothing about the fighter changes, and everything about the field does. So the
 * appraisal leads with the field gap rather than with the cut, because the cut is the part a
 * player will guess correctly and the field is the part they will not.
 */
function DivisionPicker() {
  const { db, world, playerFighter, commit } = useGame();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DivisionId | undefined>();

  if (!playerFighter) return null;
  const fighter = playerFighter;
  const options = viableDivisions(fighter).filter((d) => d.id !== fighter.divisionId);

  return (
    <Card title="Weight class">
      <p
        className="muted prose"
        style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}
      >
        You currently fight at {getDivision(fighter.divisionId).name}, walking around at{' '}
        {walkingWeightOf(fighter)}lb. Your ratings do not change when you move — the people across
        from you do.
      </p>

      {!open ? (
        <Button onClick={() => setOpen(true)} disabled={options.length === 0}>
          {options.length === 0 ? 'No other division you could make' : 'Consider a move'}
        </Button>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {options.map((division) => {
            const appraisal = appraiseDivisionMove(
              fighter,
              division.id,
              divisionField(db, division.id, fighter.id as string),
              overallRating(fighter.attributes),
            );
            const selected = pending === division.id;

            return (
              <div
                key={division.id}
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                }}
              >
                <button
                  type="button"
                  aria-expanded={selected}
                  onClick={() => setPending(selected ? undefined : division.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left' }}
                >
                  <span
                    className="row"
                    style={{ justifyContent: 'space-between', gap: 'var(--space-2)' }}
                  >
                    <span style={{ fontWeight: 700 }}>
                      {division.name}{' '}
                      <span className="faint" style={{ fontWeight: 400 }}>
                        {division.limitLbs}lb
                      </span>
                    </span>
                    <span className="row" style={{ gap: 'var(--space-1)' }}>
                      <Chip tone={appraisal.direction === 'up' ? 'info' : 'neutral'}>
                        {appraisal.direction === 'up' ? '↑ Up' : '↓ Down'}
                        {appraisal.steps > 1 ? ` ×${appraisal.steps}` : ''}
                      </Chip>
                      <Chip
                        tone={
                          appraisal.fieldGap > 4
                            ? 'positive'
                            : appraisal.fieldGap < -4
                              ? 'negative'
                              : 'neutral'
                        }
                        title="How you compare to the fighters already in that division"
                      >
                        {appraisal.fieldGap > 0 ? '+' : ''}
                        {appraisal.fieldGap} vs field
                      </Chip>
                      {appraisal.severity >= DANGEROUS_SEVERITY && (
                        <Chip tone="warning" title="A cut this size is genuinely risky">
                          ⚠ Hard cut
                        </Chip>
                      )}
                    </span>
                  </span>
                </button>

                {selected && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    {appraisal.notes.map((note) => (
                      <p key={note} className="prose" style={{ fontSize: 'var(--text-sm)' }}>
                        {note}
                      </p>
                    ))}
                    <div className="row" style={{ flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                      <Button
                        variant="primary"
                        onClick={() => {
                          changeDivision(db, fighter, division.id);
                          commit();
                          setPending(undefined);
                          setOpen(false);
                        }}
                      >
                        Move to {division.shortName}
                      </Button>
                      <Button variant="ghost" onClick={() => setPending(undefined)}>
                        Not this one
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Stay where I am
          </Button>
        </div>
      )}
      <p
        className="faint prose"
        style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}
      >
        {formatGameDay(world.day)}. Your body takes months to catch up with the move — you gain or
        lose real weight over several camps, and that is a trade rather than an upgrade.
      </p>
    </Card>
  );
}
