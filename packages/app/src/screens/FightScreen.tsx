import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RANGES,
  rangeForState,
  callFight,
  createRng,
  deliveryScore,
  describeCommentator,
  describeJudge,
  displayName,
  fighterAge,
  getDivision,
  isDecisionMethod,
  isKoMethod,
  judgeLeaning,
  recordString,
  resolutionOrder,
  type Commentator,
  type Corner,
  type FightEvent,
  type FightNight,
  type FightResult,
  type Fighter,
  type Judge,
  type Referee,
  type RoundTally,
  type Range,
  type TacticalPlan,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Flag, Segmented } from '../ui';
import { getLastBroadcast } from '../game/career';
import { nightFor, positionLabel } from '../game/night';
import './FightScreen.css';

const SPEEDS = [
  { value: 'instant', label: 'Skip', ms: 0 },
  { value: 'fast', label: 'Fast', ms: 260 },
  { value: 'live', label: 'Live', ms: 900 },
] as const;

type Speed = (typeof SPEEDS)[number]['value'];

/** Where in the night we are. The fight is the middle of it, not the whole of it. */
type Stage = 'prefight' | 'fight';

/**
 * Fight night.
 *
 * The whole result is computed before this screen renders — the playback is presentation,
 * not simulation. That means "Skip" is instant and honest rather than fast-forwarding a
 * running process, and re-watching costs nothing.
 *
 * It also means the *night* can be told in the order a night happens, even though it was
 * settled in one go. That is what the pre-fight stage is: the card, the house, the officials
 * and the two fighters, and then a button that starts it. The screen used to open straight
 * onto a text feed already dripping, which is why the game had a fight and never a fight
 * night. See docs/28.
 */
export function FightScreen({ boutId }: { boutId?: string }) {
  const { db, world } = useGame();
  const { navigate } = useRouter();
  // Only shows the stored result if it is the bout that was asked for. Navigating back to an
  // older #/fight/<id> should not silently render a different fight’s scorecards.
  const broadcast = useMemo(() => getLastBroadcast(), []);
  const stored = broadcast?.result;
  const result = boutId === undefined || stored?.boutId === boutId ? stored : undefined;

  const commentator = broadcast?.commentatorId
    ? (db.commentators.findById(broadcast.commentatorId) as Commentator | undefined)
    : undefined;
  const referee = broadcast?.refereeId
    ? (db.referees.findById(broadcast.refereeId) as Referee | undefined)
    : undefined;
  const judges = useMemo(
    () =>
      (broadcast?.judgeIds ?? [])
        .map((id) => db.judges.findById(id) as Judge | undefined)
        .filter((j): j is Judge => j !== undefined),
    [broadcast, db],
  );
  const prefersReducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  );
  // A timed drip-feed with auto-scrolling is precisely what reduced-motion is for, so the
  // default has to respect it rather than only softening the CSS transitions.
  const [speed, setSpeed] = useState<Speed>(prefersReducedMotion ? 'instant' : 'fast');
  const [stage, setStage] = useState<Stage>('prefight');
  const [shown, setShown] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  /** Whether the reader is following the feed, or has scrolled up to re-read something. */
  const following = useRef(true);

  // The booth's interjections are woven in here rather than in the simulator: commentary is
  // a view of the fight and must never be able to change one. A different commentator would
  // narrate these same events differently, and that is the whole point of the module.
  const feed = useMemo(() => {
    if (!result) return [] as readonly FightEvent[];
    if (!commentator) return result.events;
    return callFight({
      commentator,
      result,
      names: {
        red: db.fighters.findById(result.redId as string)?.lastName ?? 'Red',
        blue: db.fighters.findById(result.blueId as string)?.lastName ?? 'Blue',
      },
      rng: createRng(`booth:${result.boutId}`),
    });
  }, [result, commentator, db]);

  const total = feed.length;
  const finished = shown >= total;
  const delay = SPEEDS.find((s) => s.value === speed)!.ms;

  useEffect(() => {
    if (!result) return;
    // Nothing plays until the player has walked out. Without this the feed would run down
    // behind the pre-fight card and the fight would be over before it started.
    if (stage !== 'fight') return;
    if (delay === 0) {
      setShown(total);
      return;
    }
    if (shown >= total) return;
    // Major beats hold longer — a knockdown that flashes past at the same rate as a jab
    // reads as noise rather than as the moment the fight turned.
    const event = feed[shown];
    const weight = event?.emphasis === 'critical' ? 2.2 : event?.emphasis === 'major' ? 1.5 : 1;
    const timer = setTimeout(() => setShown((n) => n + 1), delay * weight);
    return () => clearTimeout(timer);
  }, [shown, total, delay, result, feed, stage]);

  // Only auto-scroll while the reader is actually at the bottom. Yanking them back every
  // 900ms because they scrolled up to re-read the knockdown is a genuine scroll trap.
  const onFeedScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  useEffect(() => {
    if (stage !== 'fight' || delay === 0 || !following.current) return;
    feedRef.current?.scrollTo({
      top: feedRef.current.scrollHeight,
      // An explicit 'smooth' argument is NOT overridden by scroll-behavior in CSS, so the
      // preference has to be honoured here in JS.
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [shown, delay, prefersReducedMotion, stage]);

  if (!result) {
    return (
      <Empty title="No fight to show">
        <Button variant="primary" onClick={() => navigate({ name: 'hub' })}>
          Back to career
        </Button>
      </Empty>
    );
  }

  const red = db.fighters.findById(result.redId as string) as Fighter | undefined;
  const blue = db.fighters.findById(result.blueId as string) as Fighter | undefined;
  const night = nightFor(db, result.boutId);

  if (stage === 'prefight') {
    return (
      <PreFight
        db={db}
        red={red}
        blue={blue}
        boutId={result.boutId}
        night={night}
        rounds={broadcast?.rounds}
        undercard={broadcast?.undercard ?? []}
        referee={referee}
        judges={judges}
        commentator={commentator}
        day={world.day}
        onWalkOut={() => {
          following.current = true;
          setShown(0);
          setStage('fight');
        }}
      />
    );
  }

  const visible = feed.slice(0, shown);
  // Only round transitions and decisive moments reach the live region, so the narration
  // stays followable instead of queueing a hundred announcements behind the visuals.
  const lastMajorEvent = [...visible]
    .reverse()
    .find((e) => e.emphasis === 'critical' || e.emphasis === 'major' || e.kind === 'roundStart');

  return (
    <div className="stack fight-stage" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <div className="fight-corners">
          <CornerName fighter={red} corner="red" isWinner={result.winnerId === result.redId} revealed={finished} />
          <span className="fight-vs">vs</span>
          <CornerName fighter={blue} corner="blue" isWinner={result.winnerId === result.blueId} revealed={finished} />
        </div>
        {/*
          The room, while it is happening.

          Derived from the beats the reader has actually seen rather than from the finished
          result, so it rises through a flurry and settles in a lull the same way the building
          does — and so it cannot spoil a knockdown that has not been shown yet.
        */}
        <CrowdMeter level={crowdLevel(visible)} attendance={night?.attendance} />
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Segmented label="Playback speed" value={speed} onChange={setSpeed} options={SPEEDS} />
        </div>
      </Card>

      <Card title="Play-by-play" flush>
        {commentator && (
          <p className="fight-booth">
            <span aria-hidden="true">&#127908;</span>
            <span>
              Called by <strong>{commentator.name}</strong> &mdash;{' '}
              <span className="muted">{describeCommentator(commentator)}</span>
            </span>
          </p>
        )}
        {/*
          tabIndex makes the scroll container reachable by keyboard — without it a keyboard
          user physically cannot read past the first screenful. role=log rather than an
          aria-live region on the container itself: announcing every one of a hundred events
          at 260ms intervals puts assistive tech minutes behind the visuals, and Skip would
          dump the entire fight at once.
        */}
        <div
          className="fight-feed"
          ref={feedRef}
          onScroll={onFeedScroll}
          tabIndex={0}
          role="log"
          aria-label="Play-by-play commentary"
        >
          {visible.map((event, i) => (
            <FeedLine key={i} event={event} />
          ))}
          {!finished && (
            <p className="fight-feed__pending" aria-hidden="true">
              …
            </p>
          )}
        </div>
      </Card>

      {/* Only the moments that matter are announced, so the narration stays followable. */}
      <p className="visually-hidden" aria-live="polite">
        {lastMajorEvent?.text}
      </p>

      {/* The outcome is announced once, when it lands. */}
      <p className="visually-hidden" aria-live="assertive">
        {finished ? resultSentence(result, red, blue) : ''}
      </p>

      {finished && <FightSummary
          result={result}
          red={red}
          blue={blue}
          db={db}
          judges={judges}
          night={night}
          notes={broadcast?.notes ?? []}
          undercard={broadcast?.undercard ?? []}
          tactics={broadcast?.tactics}
        />}

      {finished && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate({ name: 'hub' })}>
            Back to career
          </Button>
          <Button
            onClick={() => {
              following.current = true;
              setShown(0);
            }}
          >
            Watch again
          </Button>
        </div>
      )}
    </div>
  );
}

/* --- Before the bell -------------------------------------------------------------------- */

const BROADCAST_LABEL: Record<string, string> = {
  ppv: 'Pay-per-view',
  televised: 'Televised',
  streamed: 'Streamed',
};

/**
 * Everything a broadcast shows before the walkouts.
 *
 * All of it existed already and none of it reached a screen: the night has had a name, a
 * venue, a broadcast tier, a running order and an attendance figure since the events layer
 * shipped, and the player was shown a list of surnames after their fight was over.
 */
function PreFight({
  db,
  red,
  blue,
  boutId,
  night,
  rounds,
  undercard,
  referee,
  judges,
  commentator,
  day,
  onWalkOut,
}: {
  db: ReturnType<typeof useGame>['db'];
  red?: Fighter;
  blue?: Fighter;
  boutId: string;
  night?: FightNight;
  /** Scheduled rounds, from the booking the engine actually fought. See `StoredResult`. */
  rounds?: number;
  undercard: readonly { boutId: string; winnerName?: string; method: string; round: number }[];
  referee?: Referee;
  judges: readonly Judge[];
  commentator?: Commentator;
  day: number;
  onWalkOut(): void;
}) {
  /*
   * The night in the order it happened, not the order it was advertised in.
   *
   * `resolutionOrder` has been in the engine since the events layer shipped, is unit-tested,
   * and had no production caller — while its own docstring describes exactly this screen:
   * bouts below you have already happened and are readable on arrival, yours is next, and the
   * rest of the card is still to come. A poster reads main event first; a night does not.
   */
  const running = night ? resolutionOrder(night.bouts, boutId) : [];
  const myIndex = running.findIndex((b) => b.boutId === boutId);
  const mine = running[myIndex];

  return (
    <div className="stack prefight" style={{ gap: 'var(--space-4)' }}>
      {night && (
        <Card raised>
          <p className="prefight__eyebrow">Tonight</p>
          <h2 className="prefight__name">{night.name}</h2>
          <p className="muted">
            {night.venue.name}, {night.venue.city} · {BROADCAST_LABEL[night.broadcast] ?? night.broadcast}
          </p>
          {/*
            The house. `eventRevenue` has computed attendance on every card ever run and it
            reached the gate receipt and nothing else, so the game knew whether you were walking
            out in front of four hundred people or a full arena and had no way to say so.
          */}
          {night.attendance !== undefined && (
            <p className="prefight__house">
              <strong className="numeric">{night.attendance.toLocaleString()}</strong>
              <span className="muted"> in the building</span>
              {/*
                The capacity only when it is the interesting half. Sold out says everything a
                second number would, and "in a 18,000-seat hall" needed an article this code
                has no way to choose correctly.
              */}
              {night.attendance >= night.venue.capacity * 0.97 ? (
                <Chip tone="accent">Sold out</Chip>
              ) : (
                <span className="faint numeric">of {night.venue.capacity.toLocaleString()}</span>
              )}
            </p>
          )}
          {mine && (
            <div className="row" style={{ marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Chip tone="accent">{positionLabel(mine.position)}</Chip>
              {/*
                `rounds` from the booking rather than `mine.rounds` from the card: `buildCard`
                gives whatever tops the night five rounds and `runBookedFight` fights three
                unless it is for a title, so the card's number is not the number that happened.
              */}
              {rounds !== undefined && <Chip tone="neutral">{rounds} rounds</Chip>}
              {mine.isTitleFight && <Chip tone="accent">🏆 For the title</Chip>}
            </div>
          )}
        </Card>
      )}

      <Card title="Tale of the tape" flush>
        <TaleOfTheTape red={red} blue={blue} day={day} />
      </Card>

      {(referee || judges.length > 0 || commentator) && (
        <Card title="Officials" flush>
          <div className="list">
            {referee && (
              <Official role="Referee" name={referee.name} note={referee.reputation} />
            )}
            {/*
              Introduced *before* the fight, which is the entire point of assigning them at
              booking — `bookFight` has said so in a comment since officials shipped. Meeting
              the judges for the first time on the scorecard that just beat you is how an
              honest card comes to read as a robbery.
            */}
            {judges.map((judge) => (
              <Official key={judge.id} role="Judge" name={judge.name} note={describeJudge(judge)} />
            ))}
            {commentator && (
              <Official role="Booth" name={commentator.name} note={describeCommentator(commentator)} />
            )}
          </div>
        </Card>
      )}

      {running.length > 1 && (
        <Card title="The card" flush>
          <div className="list">
            {running.map((bout, i) => {
              const isPlayer = bout.boutId === boutId;
              const done = i < myIndex;
              const under = undercard.find((u) => u.boutId === bout.boutId);
              const boutRed = db.fighters.findById(bout.redId as string) as Fighter | undefined;
              const boutBlue = db.fighters.findById(bout.blueId as string) as Fighter | undefined;
              return (
                <div
                  key={bout.boutId}
                  className={`card-row${isPlayer ? ' card-row--you' : ''}`}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <span className="card-row__position">{positionLabel(bout.position)}</span>
                  <span className="card-row__names">
                    {boutRed?.lastName ?? '—'} vs {boutBlue?.lastName ?? '—'}
                    {bout.isTitleFight && <span aria-hidden="true"> 🏆</span>}
                    {isPlayer && <Chip tone="accent">You, next</Chip>}
                  </span>
                  <span className="card-row__result">
                    {isPlayer
                      ? '—'
                      : done
                        ? under
                          ? under.winnerName
                            ? `${under.winnerName}, R${under.round}`
                            : 'Draw'
                          : '—'
                        : 'Later tonight'}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/*
        The walkout.

        One deliberate press between knowing what you are walking into and the first bell, and
        it is most of the fight-night feeling on its own — anticipation is a pause, not an
        animation.
      */}
      {/*
        Not "Walk out": the camp screen's own commit button is "Yes — walk out", one screen
        earlier, and two different irreversible actions a tap apart should not share a name.
      */}
      <div className="walkout">
        <Button variant="primary" block onClick={onWalkOut}>
          Make the walk
        </Button>
        <p className="faint walkout__note">
          It is already decided. What happens next is the telling of it.
        </p>
      </div>
    </div>
  );
}

function Official({ role, name, note }: { role: string; name: string; note: string }) {
  return (
    <div className="official">
      <span className="official__role">{role}</span>
      <span className="official__name">{name}</span>
      <span className="official__note">{note}</span>
    </div>
  );
}

/**
 * The tale of the tape.
 *
 * Every number here was already on the fighter and none of it was ever put in front of the
 * player at the moment it means something — you decided how to fight this man on the camp
 * screen without being told he is four inches taller with five inches of reach on you.
 *
 * The advantage on each row is marked rather than left to be worked out. That is the whole
 * job of this table: a reach column both fighters can read as a number is a table; a reach
 * column that says *who is longer* is information.
 */
function TaleOfTheTape({ red, blue, day }: { red?: Fighter; blue?: Fighter; day: number }) {
  if (!red || !blue) return null;

  const finishes = (f: Fighter) => f.summary.koWins + f.summary.submissionWins;

  const rows: readonly {
    label: string;
    red: string;
    blue: string;
    /** Which corner the row favours, when a row can favour one. */
    edge?: Corner;
  }[] = [
    { label: 'Record', red: recordString(red.summary), blue: recordString(blue.summary) },
    /*
     * Age carries no edge marker on purpose. Height and reach are advantages in a way a
     * number of years is not — a 24-year-old is not ahead of a 30-year-old in their prime,
     * and marking one would be the screen asserting something the game does not believe.
     */
    { label: 'Age', red: `${fighterAge(red, day)}`, blue: `${fighterAge(blue, day)}` },
    {
      label: 'Height',
      red: inches(red.heightInches),
      blue: inches(blue.heightInches),
      edge: edgeOf(red.heightInches, blue.heightInches),
    },
    {
      // Plain inches, as every tale of the tape in the sport gives it. In feet and inches a
      // 70" reach renders 5′10″ — identical to the height directly above it, which reads as a
      // repeated row rather than as a second measurement.
      label: 'Reach',
      red: `${Math.round(red.reachInches)}″`,
      blue: `${Math.round(blue.reachInches)}″`,
      edge: edgeOf(red.reachInches, blue.reachInches),
    },
    { label: 'Stance', red: titleCase(red.stance), blue: titleCase(blue.stance) },
    /*
     * Only once somebody has one.
     *
     * Seeded fighters carry their career as a `priorRecord` of the form "15-1-0" — there is no
     * method breakdown behind it, so every fighter in the world reads 0 KO · 0 sub until they
     * finish somebody inside the simulation. A row of zeroes on both sides is not a fact about
     * these two fighters, it is a fact about the seed format, and putting it on the tale of the
     * tape would be stating it as the former.
     */
    ...(finishes(red) + finishes(blue) > 0
      ? [
          {
            label: 'Finishes',
            red: `${red.summary.koWins} KO · ${red.summary.submissionWins} sub`,
            blue: `${blue.summary.koWins} KO · ${blue.summary.submissionWins} sub`,
          },
        ]
      : []),
    {
      label: 'Form',
      red: streakWord(red.summary.streak),
      blue: streakWord(blue.summary.streak),
      edge: edgeOf(red.summary.streak, blue.summary.streak),
    },
  ];

  return (
    <div className="tape">
      <div className="tape__heads">
        <div className="tape__head tape__head--red">
          <span className="tape__corner">Red corner</span>
          <span className="tape__name">{displayName(red)}</span>
          <Flag nationality={red.nationality} />
        </div>
        <div className="tape__division">{getDivision(red.divisionId).shortName}</div>
        <div className="tape__head tape__head--blue">
          <span className="tape__corner">Blue corner</span>
          <span className="tape__name">{displayName(blue)}</span>
          <Flag nationality={blue.nationality} />
        </div>
      </div>

      <dl className="tape__rows">
        {rows.map((row, i) => (
          <div className="tape__row" key={row.label} style={{ '--i': i } as React.CSSProperties}>
            <dd className={`tape__value${row.edge === 'red' ? ' tape__value--edge' : ''}`}>
              <span className="visually-hidden">{`${displayName(red)}, ${row.label}: `}</span>
              {row.red}
            </dd>
            <dt className="tape__label">{row.label}</dt>
            <dd className={`tape__value tape__value--right${row.edge === 'blue' ? ' tape__value--edge' : ''}`}>
              <span className="visually-hidden">{`${displayName(blue)}, ${row.label}: `}</span>
              {row.blue}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const edgeOf = (redValue: number, blueValue: number): Corner | undefined =>
  redValue === blueValue ? undefined : redValue > blueValue ? 'red' : 'blue';

const inches = (n: number): string => `${Math.floor(n / 12)}′${Math.round(n % 12)}″`;

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function streakWord(streak: number): string {
  if (streak === 0) return 'Even';
  return streak > 0 ? `W${streak}` : `L${Math.abs(streak)}`;
}

/* --- The room --------------------------------------------------------------------------- */

/**
 * How loud it is right now, 0–100.
 *
 * Read off the beats the player has actually been shown rather than off the finished result,
 * for two reasons: it must not spoil a knockdown that has not arrived yet, and a crowd that
 * reacts to what it has just seen is the only kind there is. Weighted the same way
 * `roundImpression` weights a knockdown, because that is what a building reacts to.
 */
function crowdLevel(visible: readonly FightEvent[]): number {
  const recent = visible.slice(-10);
  let noise = 0;
  for (const e of recent) {
    if (e.kind === 'knockdown') noise += 34;
    else if (e.kind === 'finish') noise += 40;
    else if (e.kind === 'submissionAttempt' || e.kind === 'hurt') noise += 14;
    else if (e.emphasis === 'critical') noise += 20;
    else if (e.emphasis === 'major') noise += 8;
    else if (e.kind === 'strike' || e.kind === 'combination' || e.kind === 'kick') noise += 4;
  }
  return Math.max(0, Math.min(100, noise));
}

const crowdWord = (level: number): string =>
  level >= 75 ? 'Deafening' : level >= 50 ? 'Up on its feet' : level >= 25 ? 'Watching' : 'Restless';

function CrowdMeter({ level, attendance }: { level: number; attendance?: number }) {
  return (
    <div className="crowd">
      <span className="crowd__label">
        Crowd
        {attendance !== undefined && (
          <span className="faint numeric"> · {attendance.toLocaleString()}</span>
        )}
      </span>
      {/*
        A meter, not a progress bar: this reports a level rather than a task moving toward
        completion, and `role="meter"` is what tells assistive tech the difference.
      */}
      <span
        className="crowd__track"
        role="meter"
        aria-valuenow={Math.round(level)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Crowd noise"
        aria-valuetext={crowdWord(level)}
      >
        <span className="crowd__fill" style={{ width: `${level}%` }} data-loud={level >= 60 || undefined} />
      </span>
      <span className="crowd__word">{crowdWord(level)}</span>
    </div>
  );
}

function CornerName({
  fighter,
  corner,
  isWinner,
  revealed,
}: {
  fighter?: Fighter;
  corner: 'red' | 'blue';
  isWinner: boolean;
  revealed: boolean;
}) {
  return (
    <div className={`fight-corner fight-corner--${corner}${revealed && isWinner ? ' fight-corner--winner' : ''}`}>
      <span className="fight-corner__label">{corner === 'red' ? 'Red corner' : 'Blue corner'}</span>
      <span className="fight-corner__name">{fighter ? displayName(fighter) : 'Unknown'}</span>
      {/* The result is withheld until playback finishes; spoiling it above a live feed makes
          the feed pointless. */}
      {revealed && isWinner && <Chip tone="positive">Winner</Chip>}
    </div>
  );
}

function FeedLine({ event }: { event: FightEvent }) {
  const mm = Math.floor(event.timeSeconds / 60);
  const ss = String(event.timeSeconds % 60).padStart(2, '0');
  const isFoul = event.kind === 'foul' || event.kind === 'pointDeduction';
  const isColour = event.kind === 'colour';
  const classes = [
    'fight-line',
    isColour && 'fight-line--colour',
    event.emphasis && `fight-line--${event.emphasis}`,
    event.corner && `fight-line--${event.corner}`,
    (event.kind === 'roundStart' || event.kind === 'roundEnd') && 'fight-line--round',
    event.kind === 'knockdown' && 'fight-line--knockdown',
    isFoul && 'fight-line--foul',
    event.kind === 'pointDeduction' && 'fight-line--deduction',
  ]
    .filter(Boolean)
    .join(' ');

  if (event.kind === 'roundStart' || event.kind === 'roundEnd') {
    return <p className={classes}>{event.text}</p>;
  }

  if (isColour) {
    // No timestamp: this is somebody talking over the fight, not a thing that happened in
    // it, and giving it a clock reading would imply it was an event on the record.
    //
    // The italic and the muted colour were the only two channels, and a screen reader has
    // neither — so a biased commentator's opinion was indistinguishable from an official
    // event in the live region. The glyph and the hidden prefix fix that, the same way the
    // foul lines above do.
    return (
      <p className={classes}>
        <span className="fight-line__time fight-line__mic" aria-hidden="true">
          &#127908;
        </span>
        <span>
          <span className="visually-hidden">Commentary: </span>
          {event.text}
        </span>
      </p>
    );
  }

  return (
    <p className={classes}>
      <span className="fight-line__time numeric">
        R{event.round} {mm}:{ss}
      </span>
      {isFoul && (
        // A symbol *and* a colour *and* a label: the stoppage is the one thing in the feed
        // a reader must not skim past, and colour alone would fail anyone who cannot see it.
        <span className="fight-line__flag" aria-hidden="true">
          {event.kind === 'pointDeduction' ? '⊖' : '⚠'}
        </span>
      )}
      <span>
        {isFoul && (
          <span className="visually-hidden">
            {event.kind === 'pointDeduction' ? 'Point deduction: ' : 'Foul: '}
          </span>
        )}
        {event.text}
      </span>
    </p>
  );
}

function FightSummary({
  result,
  red,
  blue,
  db,
  judges,
  night,
  notes,
  undercard,
  tactics,
}: {
  result: FightResult;
  red?: Fighter;
  blue?: Fighter;
  db: ReturnType<typeof useGame>['db'];
  judges: readonly Judge[];
  night?: FightNight;
  notes: readonly string[];
  undercard: readonly { boutId: string; winnerName?: string; method: string; round: number }[];
  tactics?: TacticalPlan;
}) {
  const methodLabel = isKoMethod(result.method)
    ? result.method === 'ko'
      ? 'Knockout'
      : result.method === 'doctorStoppage'
        ? 'Doctor stoppage'
        : 'TKO'
    : result.method === 'submission'
      ? `Submission (${result.submissionName})`
      : isDecisionMethod(result.method)
        ? result.method === 'decisionUnanimous'
          ? 'Unanimous decision'
          : result.method === 'decisionSplit'
            ? 'Split decision'
            : 'Majority decision'
        : // Fouls can end a night without a winner, and falling through to "Draw" here
          // would quietly misreport the single most contentious result in the sport.
          result.method === 'dq'
          ? 'Disqualification'
          : result.method === 'noContest'
            ? 'No contest'
            : 'Draw';

  const mm = Math.floor(result.timeSeconds / 60);
  const ss = String(result.timeSeconds % 60).padStart(2, '0');
  const redName = red?.lastName ?? 'Red corner';
  const blueName = blue?.lastName ?? 'Blue corner';

  return (
    <>
      <Card title="Result">
        <p className="fight-result__method">{methodLabel}</p>
        <p className="muted">
          Round {result.round}, {mm}:{ss}
        </p>
      </Card>

      {/*
        How the building took it.

        `deliveryScore` has scored every fight ever run — it is the number a promotion's buzz
        moves on — and it has never once been shown to the person who was in the cage.
      */}
      <Card title="The crowd">
        <p className="crowd__verdict">{crowdVerdict(result)}</p>
        {night?.attendance !== undefined && (
          <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
            {night.attendance.toLocaleString()} at {night.venue.name}.
          </p>
        )}
      </Card>

      {/*
        What the night actually did to you.

        All of this was computed and thrown away: title changes, bonus awards, the weight-miss
        forfeit, what the purse cleared once the camp and the taxman were paid, new injuries,
        a grudge being born. A player could win a belt and Fight of the Night and the app
        would say nothing at all. It is the single highest-value thing on this screen.
      */}
      {notes.length > 0 && (
        <Card title="Afterwards">
          <ul className="aftermath">
            {notes.map((note, i) => (
              // Index, not the text: `runBookedFight` legitimately produces the same sentence
              // twice — two rounds that went the same way read the same way — and a duplicate
              // React key drops the second one on the floor without saying so.
              <li key={i}>{note}</li>
            ))}
          </ul>
        </Card>
      )}

      {/*
        The night, and where on it the player was.
        Card position is the second axis of a career beside the record — being 12-0 and still
        opening the prelims is a real and frustrating situation, and it has to be visible for
        getting off them to feel like the milestone it is.
      */}
      {night && (
        <Card title={night.name} flush>
          <p className="muted" style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
            {night.venue.name}, {night.venue.city} · {BROADCAST_LABEL[night.broadcast] ?? night.broadcast}
          </p>
          <div className="list">
            {night.bouts.map((bout) => {
              const isPlayer = bout.boutId === result.boutId;
              const under = undercard.find((u) => u.boutId === bout.boutId);
              const boutRed = db.fighters.findById(bout.redId as string) as Fighter | undefined;
              const boutBlue = db.fighters.findById(bout.blueId as string) as Fighter | undefined;

              return (
                <div key={bout.boutId} className={`card-row${isPlayer ? ' card-row--you' : ''}`}>
                  <span className="card-row__position">{positionLabel(bout.position)}</span>
                  <span className="card-row__names">
                    {boutRed?.lastName ?? '—'} vs {boutBlue?.lastName ?? '—'}
                    {bout.isTitleFight && <span aria-hidden="true"> 🏆</span>}
                    {isPlayer && <Chip tone="accent">You</Chip>}
                  </span>
                  <span className="card-row__result">
                    {isPlayer
                      ? 'See above'
                      : under
                        ? under.winnerName
                          ? `${under.winnerName}, R${under.round}`
                          : 'Draw'
                        : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Fight statistics">
        {/*
          Naming both corners, because the numbers were attributed only by position and by
          the red/blue bar — and --corner-red and --corner-blue have a computed contrast of
          1.00:1, i.e. they are the same colour in greyscale and for a deuteranope. A screen
          reader got no attribution at all.
        */}
        <div className="fight-stats__key">
          <span className="fight-stats__key-name fight-stats__key-name--red">{redName}</span>
          <span className="fight-stats__key-name fight-stats__key-name--blue">{blueName}</span>
        </div>
        <div className="fight-stats">
          <StatComparison
            redName={redName}
            blueName={blueName}
            label="Significant strikes"
            red={result.stats.red.significantStrikesLanded}
            blue={result.stats.blue.significantStrikesLanded}
            redSub={`of ${result.stats.red.significantStrikesAttempted}`}
            blueSub={`of ${result.stats.blue.significantStrikesAttempted}`}
          />
          {/*
            Damage, which was the one statistic the panel did not show — and it carries the
            heaviest weight on every judge archetype in the game. A player looking at a card
            that went against their strike count was being asked to reconcile a verdict with
            the evidence for it withheld.
          */}
          <StatComparison
            redName={redName}
            blueName={blueName}
            label="Damage"
            red={result.stats.red.damageDealt}
            blue={result.stats.blue.damageDealt}
          />
          <StatComparison
            redName={redName}
            blueName={blueName}
            label="Takedowns"
            red={result.stats.red.takedownsLanded}
            blue={result.stats.blue.takedownsLanded}
            redSub={`of ${result.stats.red.takedownsAttempted}`}
            blueSub={`of ${result.stats.blue.takedownsAttempted}`}
          />
          <StatComparison
            redName={redName}
            blueName={blueName}
            label="Control time"
            red={result.stats.red.controlSeconds}
            blue={result.stats.blue.controlSeconds}
            format={clock}
          />
          <StatComparison
            redName={redName}
            blueName={blueName}
            label="Knockdowns"
            red={result.stats.red.knockdowns}
            blue={result.stats.blue.knockdowns}
          />
          {/*
            Where the fight actually happened, against where it was meant to.

            The one output that says whether a game plan happened. A player whose fighter was
            told to stay outside and lost can read "Control time" and "Significant strikes" all
            day without learning the thing that decided it — that he spent two thirds of the fight
            in the pocket because he could not keep anybody off him. Range is contested every
            exchange and the play-by-play narrates each change, but nobody diagnoses a plan by
            scrolling three hundred events.

            Shown as the player's own breakdown rather than a red-vs-blue comparison because both
            corners are in the same place at the same time: the split is a property of the fight,
            not of a fighter.
          */}
          <TacticalInspector result={result} tactics={tactics} />
          <StatComparison
            redName={redName}
            blueName={blueName}
            label="Submission attempts"
            red={result.stats.red.submissionAttempts}
            blue={result.stats.blue.submissionAttempts}
          />
        </div>
      </Card>

      {isDecisionMethod(result.method) && (
        <Card title="Scorecards" flush>
          {/*
            tabIndex for the same reason the play-by-play feed has it: the table is ~430px
            wide inside a 264px viewport at 320px, and without this a keyboard-only user
            physically cannot scroll across to the Total column.
          */}
          <div className="scroll-x" tabIndex={0} role="region" aria-label="Judges' scorecards">
            <table className="scorecards">
              <thead>
                <tr>
                  <th scope="col">Judge</th>
                  {result.scorecards[0]?.rounds.map((r) => (
                    <th key={r.round} scope="col">
                      R{r.round}
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {result.scorecards.map((card, i) => {
                  // The judge behind the name, so the card can say what they were looking for.
                  const judge = judges.find((j) => j.name === card.judgeName);
                  return (
                    <tr key={card.judgeName} style={{ '--i': i } as React.CSSProperties}>
                      <th scope="row">
                        {card.judgeName}
                        {judge && <span className="scorecards__leaning">{judgeLeaning(judge)}</span>}
                      </th>
                      {card.rounds.map((r) => (
                        <td key={r.round} className="numeric">
                          {r.red}–{r.blue}
                        </td>
                      ))}
                      <td className="numeric" style={{ fontWeight: 700 }}>
                        {card.redTotal}–{card.blueTotal}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(result.deductions.red > 0 || result.deductions.blue > 0) && (
            <p className="scorecards__deduction">
              <span aria-hidden="true">&#8854;</span>{' '}
              {result.deductions.red > 0 && (
                <>
                  <strong>{redName}</strong> lost{' '}
                  {result.deductions.red === 1 ? 'a point' : `${result.deductions.red} points`}
                  {result.deductions.blue > 0 && '; '}
                </>
              )}
              {result.deductions.blue > 0 && (
                <>
                  <strong>{blueName}</strong> lost{' '}
                  {result.deductions.blue === 1 ? 'a point' : `${result.deductions.blue} points`}
                </>
              )}
              . Already applied to the totals above &mdash; which is why they may not add up.
            </p>
          )}
          {/*
            This used to read "judges weigh damage, control and volume differently, which is
            why they disagree" — printed underneath three identical scorecards. Saying what
            actually happened costs the same number of words and is true.
          */}
          <p className="scorecards__note faint">
            Scores read {redName}&ndash;{blueName}. {describeCards(result, redName, blueName)}
          </p>
        </Card>
      )}

      {/*
        Round by round.

        The panel above totals the whole fight; the judges scored it in three or five separate
        pieces. Showing only the aggregate beside only the card is what makes an honest
        decision look like a robbery: a fighter who banked eighty strikes in the last round and
        lost the first two is ahead on the totals and behind on every card, and until now there
        was no way to see it.
      */}
      {result.roundStats && result.roundStats.length > 0 && (
        <Card title="Round by round" flush>
          <div className="rounds">
            {result.roundStats.map((tally, i) => (
              <RoundBreakdown
                key={i}
                round={i + 1}
                tally={tally}
                result={result}
                redName={redName}
                blueName={blueName}
              />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

/** One round, as the judges saw it and as the statistics record it. */
function RoundBreakdown({
  round,
  tally,
  result,
  redName,
  blueName,
}: {
  round: number;
  tally: Record<Corner, RoundTally>;
  result: FightResult;
  redName: string;
  blueName: string;
}) {
  // How the three of them actually split on this one round, which the totals row cannot say.
  let toRed = 0;
  let toBlue = 0;
  for (const card of result.scorecards) {
    const score = card.rounds.find((r) => r.round === round);
    if (!score) continue;
    if (score.red > score.blue) toRed += 1;
    else if (score.blue > score.red) toBlue += 1;
  }
  const scored = toRed + toBlue;
  const verdict =
    scored === 0
      ? 'Not scored — the fight ended here'
      : toRed === toBlue
        ? 'Even on the cards'
        : `${toRed > toBlue ? redName : blueName}, ${Math.max(toRed, toBlue)}–${Math.min(toRed, toBlue)} on the cards`;

  const winner: Corner | undefined = toRed === toBlue ? undefined : toRed > toBlue ? 'red' : 'blue';
  const because = winner ? separatedBy(tally[winner], tally[winner === 'red' ? 'blue' : 'red']) : undefined;

  return (
    <details className="round" open>
      <summary className="round__summary">
        <span className="round__number">Round {round}</span>
        <span className="round__verdict">{verdict}</span>
      </summary>
      {because && <p className="round__because">{because}</p>}
      <div className="fight-stats round__stats">
        <StatComparison
          redName={redName}
          blueName={blueName}
          label="Significant strikes"
          red={tally.red.significantStrikes}
          blue={tally.blue.significantStrikes}
        />
        <StatComparison
          redName={redName}
          blueName={blueName}
          label="Damage"
          red={tally.red.damageDealt}
          blue={tally.blue.damageDealt}
        />
        <StatComparison
          redName={redName}
          blueName={blueName}
          label="Control"
          red={tally.red.controlSeconds}
          blue={tally.blue.controlSeconds}
          format={clock}
        />
        <StatComparison
          redName={redName}
          blueName={blueName}
          label="Takedowns"
          red={tally.red.takedowns}
          blue={tally.blue.takedowns}
        />
      </div>
    </details>
  );
}

/**
 * What actually separated them in a round.
 *
 * Share-of-total on each criterion, exactly as `roundMargin` reads it, so the sentence agrees
 * with the arithmetic that produced the card rather than being a second opinion about it. The
 * point is not to argue the round was scored correctly; it is to say which pile of evidence
 * the judges were looking at.
 */
function separatedBy(won: RoundTally, lost: RoundTally): string | undefined {
  const share = (a: number, b: number) => (a + b <= 0 ? 0 : (a - b) / (a + b));
  const claims: readonly [number, string][] = [
    [share(won.damageDealt + won.knockdowns * 18, lost.damageDealt + lost.knockdowns * 18), 'did the heavier damage'],
    [share(won.significantStrikes, lost.significantStrikes), 'landed more'],
    [share(won.controlSeconds, lost.controlSeconds), 'held control'],
    [
      share(
        won.takedowns * 2 + won.submissionAttempts * 1.5,
        lost.takedowns * 2 + lost.submissionAttempts * 1.5,
      ),
      'won the grappling',
    ],
    [share(won.strikesAttempted, lost.strikesAttempted), 'came forward'],
  ];
  const [best] = [...claims].sort((a, b) => b[0] - a[0]);
  // Below this the round genuinely was close on everything, and naming a criterion would be
  // inventing a reason the judges did not have.
  if (!best || best[0] < 0.15) return 'Nothing much separated them.';
  return `Won it on the evidence that they ${best[1]}.`;
}

/** What the three of them actually did, rather than a general remark about judging. */
function describeCards(result: FightResult, redName: string, blueName: string): string {
  const cards = result.scorecards;
  if (cards.length === 0) return '';

  // Rounds where they did not all see the same winner. This is the interesting sentence and
  // the old copy asserted it unconditionally, including when it was false.
  const split = (cards[0]?.rounds ?? [])
    .map((r) => r.round)
    .filter((round) => {
      const winners = new Set(
        cards.map((c) => {
          const s = c.rounds.find((r) => r.round === round);
          if (!s) return 'none';
          return s.red > s.blue ? 'red' : s.blue > s.red ? 'blue' : 'even';
        }),
      );
      return winners.size > 1;
    });

  const shape =
    result.method === 'decisionSplit'
      ? 'A split decision'
      : result.method === 'decisionMajority'
        ? 'A majority decision'
        : result.method === 'draw'
          ? 'A draw'
          : 'Unanimous';

  if (split.length === 0) {
    return `${shape} — and all three saw every round the same way.`;
  }
  const list =
    split.length === 1
      ? `round ${split[0]}`
      : `rounds ${split.slice(0, -1).join(', ')} and ${split[split.length - 1]}`;
  return `${shape}. They split on ${list} — judges weigh damage, control and volume differently, and ${redName} and ${blueName} gave them different things to weigh.`;
}

/**
 * A one-line verdict from the seats.
 *
 * `deliveryScore` is the game's own model of whether an audience got a night out — it is what a
 * promotion's buzz moves on, it has scored every fight ever simulated, and it has never been
 * shown to the person who was in there. A close decision the crowd loved and a wide one they
 * hated are the same three letters on a record and very different nights.
 *
 * The one thing the score cannot tell apart on its own is a *mauling* from a *bore*. Both come
 * out low, because `deliveryScore` squares how contested a fight was and a one-way fight is not
 * contested — but a crowd that has just watched somebody get taken apart with knockdowns and
 * submission attempts in it is not booing, and telling the player they were is worse than
 * saying nothing. So the wording asks that question separately, from statistics this screen is
 * already showing.
 */
function crowdVerdict(result: FightResult): string {
  const score = deliveryScore(result);
  const finished = !result.method.startsWith('decision');

  const red = result.stats.red;
  const blue = result.stats.blue;
  const strikes = red.significantStrikesLanded + blue.significantStrikesLanded;
  const oneSided =
    Math.abs(red.significantStrikesLanded - blue.significantStrikesLanded) / Math.max(1, strikes);
  const jeopardy =
    red.knockdowns + blue.knockdowns + red.submissionAttempts + blue.submissionAttempts;

  if (score >= 95) {
    return finished
      ? 'The place came apart. That is the one they will still be arguing about on the way home.'
      : 'Not one quiet round in it — they were on their feet for the last of it.';
  }
  if (score >= 70) {
    return finished
      ? 'A proper roar for the finish. They got what they paid for.'
      : 'Close enough that the building argued about it, which is its own kind of good night.';
  }
  if (score >= 45) {
    return 'Warm enough at the end. Nobody left early and nobody will remember it in a month.';
  }
  if (oneSided >= 0.5 && jeopardy >= 3) {
    return 'One-way traffic, and they knew it. Respect rather than noise — that was somebody being taken apart.';
  }
  return finished
    ? 'Polite applause, and half of them were already looking at the next one.'
    : 'You could hear the boos before the cards were read. That was a hard watch from the seats.';
}

const clock = (v: number): string =>
  `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;

/**
 * The standing time, split by how far apart they were.
 *
 * `distanceSeconds` answers a judge's question — was this fight standing — and this answers the
 * player's: *did the plan happen*. Rendered as one bar rather than two because the two fighters
 * are necessarily at the same range as each other.
 */
const RANGE_LABEL: Readonly<Record<Range, string>> = {
  outside: 'Kicking range',
  boxing: 'Boxing range',
  pocket: 'The pocket',
};

/**
 * Where the fight happened, and whether that is where it was supposed to happen.
 *
 * Two questions, and the second is the one that turns a statistic into a diagnosis. "Distance
 * 61%" tells a player nothing: sixty-one per cent of the fight standing *where*, doing what, and
 * was that the plan? A fighter told to stay outside who spent 18% of his standing time there did
 * not have a plan that failed to matter — he had a plan the other man beat him to, every
 * exchange, all night, and those are completely different nights.
 *
 * So the panel says three things in order:
 *
 *  1. **The whole fight, in one bar.** All five states, not the standing three — a clinch plan
 *     and a pocket plan are neighbours on the same line and reading them off two separate widgets
 *     hides that.
 *  2. **Asked for against got.** The desired range comes from `rangeForState`, the engine's own
 *     mapping, so the screen cannot report an instruction the simulator did not run.
 *  3. **Attempts against arrivals.** The part `rangeSeconds` alone cannot show: a fighter who
 *     tried eleven times and got there twice was fighting hard for a range he could not hold, and
 *     one who tried twice was not really trying. Same time on the clock, different fighter, and
 *     different thing to fix before the next one.
 */
function TacticalInspector({
  result,
  tactics,
}: {
  result: FightResult;
  tactics?: TacticalPlan;
}) {
  const mine = result.stats.red;
  const theirs = result.stats.blue;

  // Clinch and ground are two-sided — one man's control is the other's time underneath — so the
  // whole-fight bar has to add both corners or a fight spent on the bottom reads as no ground at
  // all.
  const clinchSeconds = mine.clinchControlSeconds + theirs.clinchControlSeconds;
  const groundSeconds =
    mine.controlSeconds - mine.clinchControlSeconds + (theirs.controlSeconds - theirs.clinchControlSeconds);
  const standing = RANGES.map((r) => mine.rangeSeconds[r]);
  const total = standing.reduce((a, b) => a + b, 0) + clinchSeconds + groundSeconds;
  if (total <= 0) return null;

  const rows: { key: string; label: string; seconds: number }[] = [
    ...RANGES.map((r) => ({ key: r, label: RANGE_LABEL[r], seconds: mine.rangeSeconds[r] })),
    { key: 'clinch', label: 'Clinch', seconds: clinchSeconds },
    { key: 'ground', label: 'Ground', seconds: groundSeconds },
  ];

  const wanted = tactics ? rangeForState(tactics.preferredState) : undefined;
  const standingTotal = standing.reduce((a, b) => a + b, 0);
  const gotShare =
    wanted && standingTotal > 0 ? mine.rangeSeconds[wanted] / standingTotal : undefined;

  const attempted = mine.rangeChangesAttempted;
  const landed = mine.rangeChangesLanded;

  return (
    <div className="fight-stats__row">
      <span className="fight-stats__label">Where the fight happened</span>
      <div className="stack" style={{ gap: 'var(--space-1)', width: '100%' }}>
        {rows.map((row) => (
          <span key={row.key} className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              {row.label}
            </span>
            <span className="numeric">
              {clock(row.seconds)}{' '}
              <span className="muted">({Math.round((row.seconds / total) * 100)}%)</span>
            </span>
          </span>
        ))}

        {wanted !== undefined && gotShare !== undefined && (
          <span
            className="row"
            style={{ justifyContent: 'space-between', marginTop: 'var(--space-1)' }}
          >
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              You asked for {RANGE_LABEL[wanted].toLowerCase()}
            </span>
            <span className="numeric">
              {Math.round(gotShare * 100)}%{' '}
              <span className="muted">of the standing time</span>
            </span>
          </span>
        )}

        {attempted > 0 && (
          <span className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              Range changes won
            </span>
            <span className="numeric">
              {landed} <span className="muted">of {attempted}</span>
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function StatComparison({
  label,
  red,
  blue,
  redName,
  blueName,
  redSub,
  blueSub,
  format = (v: number) => String(Math.round(v)),
}: {
  label: string;
  red: number;
  blue: number;
  redName: string;
  blueName: string;
  redSub?: string;
  blueSub?: string;
  format?: (v: number) => string;
}) {
  const total = red + blue;
  const redShare = total === 0 ? 50 : (red / total) * 100;
  return (
    <div className="fight-stat">
      <div className="fight-stat__row">
        <span className="fight-stat__value numeric">
          {/* Attribution for anyone who cannot see which side of the row this is on. */}
          <span className="visually-hidden">{`${redName}, ${label}: `}</span>
          {format(red)}
          {redSub && <span className="faint"> {redSub}</span>}
        </span>
        <span className="fight-stat__label" aria-hidden="true">
          {label}
        </span>
        <span className="fight-stat__value numeric" style={{ textAlign: 'right' }}>
          <span className="visually-hidden">{`${blueName}, ${label}: `}</span>
          {blueSub && <span className="faint">{blueSub} </span>}
          {format(blue)}
        </span>
      </div>
      {/*
        The bar grows from even to its real split on mount rather than appearing at its answer,
        which is the difference between a chart and a reveal. `--share` carries the target so
        the keyframe can start from 50% for both corners.
      */}
      <div className="fight-stat__bar" role="presentation">
        <div
          className="fight-stat__bar-red"
          style={{ width: `${redShare}%`, '--share': `${redShare}%` } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

/** One-line spoken summary of the outcome, for the assertive live region. */
function resultSentence(result: FightResult, red?: Fighter, blue?: Fighter): string {
  const winner =
    result.winnerId === result.redId ? red : result.winnerId === result.blueId ? blue : undefined;
  if (!winner) return 'The fight is a draw.';
  return `${displayName(winner)} wins in round ${result.round}.`;
}
