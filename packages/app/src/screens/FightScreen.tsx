import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  callFight,
  createRng,
  describeCommentator,
  displayName,
  isDecisionMethod,
  isKoMethod,
  type Commentator,
  type FightEvent,
  type FightResult,
  type Fighter,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Segmented } from '../ui';
import { getLastBroadcast } from '../game/career';
import { nightFor, positionLabel } from '../game/night';
import './FightScreen.css';

const SPEEDS = [
  { value: 'instant', label: 'Skip', ms: 0 },
  { value: 'fast', label: 'Fast', ms: 260 },
  { value: 'live', label: 'Live', ms: 900 },
] as const;

type Speed = (typeof SPEEDS)[number]['value'];

/**
 * Fight replay.
 *
 * The whole result is computed before this screen renders — the playback is presentation,
 * not simulation. That means "Skip" is instant and honest rather than fast-forwarding a
 * running process, and re-watching costs nothing.
 */
export function FightScreen({ boutId }: { boutId?: string }) {
  const { db } = useGame();
  const { navigate } = useRouter();
  // Only shows the stored result if it is the bout that was asked for. Navigating back to an
  // older #/fight/<id> should not silently render a different fight’s scorecards.
  const broadcast = useMemo(() => getLastBroadcast(), []);
  const stored = broadcast?.result;
  const result = boutId === undefined || stored?.boutId === boutId ? stored : undefined;

  const commentator = broadcast?.commentatorId
    ? (db.commentators.findById(broadcast.commentatorId) as Commentator | undefined)
    : undefined;
  const prefersReducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  );
  // A timed drip-feed with auto-scrolling is precisely what reduced-motion is for, so the
  // default has to respect it rather than only softening the CSS transitions.
  const [speed, setSpeed] = useState<Speed>(prefersReducedMotion ? 'instant' : 'fast');
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
  }, [shown, total, delay, result, feed]);

  // Only auto-scroll while the reader is actually at the bottom. Yanking them back every
  // 900ms because they scrolled up to re-read the knockdown is a genuine scroll trap.
  const onFeedScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  useEffect(() => {
    if (delay === 0 || !following.current) return;
    feedRef.current?.scrollTo({
      top: feedRef.current.scrollHeight,
      // An explicit 'smooth' argument is NOT overridden by scroll-behavior in CSS, so the
      // preference has to be honoured here in JS.
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [shown, delay, prefersReducedMotion]);

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
  const visible = feed.slice(0, shown);
  // Only round transitions and decisive moments reach the live region, so the narration
  // stays followable instead of queueing a hundred announcements behind the visuals.
  const lastMajorEvent = [...visible]
    .reverse()
    .find((e) => e.emphasis === 'critical' || e.emphasis === 'major' || e.kind === 'roundStart');

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <div className="fight-corners">
          <CornerName fighter={red} corner="red" isWinner={result.winnerId === result.redId} revealed={finished} />
          <span className="fight-vs">vs</span>
          <CornerName fighter={blue} corner="blue" isWinner={result.winnerId === result.blueId} revealed={finished} />
        </div>
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

      {finished && <FightSummary result={result} red={red} blue={blue} db={db} />}

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
    <div className={`fight-corner fight-corner--${corner}`}>
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
}: {
  result: FightResult;
  red?: Fighter;
  blue?: Fighter;
  db: ReturnType<typeof useGame>['db'];
}) {
  const night = nightFor(db, result.boutId);
  // The undercard results are not stored per bout, so the card shows who was on it and the
  // player's own result; a full replay of somebody else's fight is doc 12's "expandable on
  // request", which is not built.
  const undercard: { bout: { boutId: string }; result: FightResult }[] = [];
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

  return (
    <>
      <Card title="Result">
        <p style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{methodLabel}</p>
        <p className="muted">
          Round {result.round}, {mm}:{ss}
        </p>
      </Card>

      {/*
        The night, and where on it the player was.
        Card position is the second axis of a career beside the record — being 12-0 and still
        opening the prelims is a real and frustrating situation, and it has to be visible for
        getting off them to feel like the milestone it is.
      */}
      {night && (
        <Card title={night.name} flush>
          <p className="muted" style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
            {night.venue.name}, {night.venue.city} · {night.broadcast === 'ppv' ? 'Pay-per-view' : night.broadcast === 'televised' ? 'Televised' : 'Streamed'}
          </p>
          <div className="list">
            {night.bouts.map((bout) => {
              const isPlayer = bout.boutId === result.boutId;
              const under = undercard.find((u) => u.bout.boutId === bout.boutId);
              const red = db.fighters.findById(bout.redId as string) as Fighter | undefined;
              const blue = db.fighters.findById(bout.blueId as string) as Fighter | undefined;

              return (
                <div key={bout.boutId} className={`card-row${isPlayer ? ' card-row--you' : ''}`}>
                  <span className="card-row__position">{positionLabel(bout.position)}</span>
                  <span className="card-row__names">
                    {red?.lastName ?? '—'} vs {blue?.lastName ?? '—'}
                    {bout.isTitleFight && <span aria-hidden="true"> 🏆</span>}
                    {isPlayer && <Chip tone="accent">You</Chip>}
                  </span>
                  <span className="card-row__result">
                    {isPlayer
                      ? 'See above'
                      : under
                        ? under.result.winnerId
                          ? `${(db.fighters.findById(under.result.winnerId as string) as Fighter | undefined)?.lastName ?? 'Winner'}, R${under.result.round}`
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
          <span className="fight-stats__key-name fight-stats__key-name--red">
            {red?.lastName ?? 'Red corner'}
          </span>
          <span className="fight-stats__key-name fight-stats__key-name--blue">
            {blue?.lastName ?? 'Blue corner'}
          </span>
        </div>
        <div className="fight-stats">
          <StatComparison
            redName={red?.lastName ?? 'Red corner'}
            blueName={blue?.lastName ?? 'Blue corner'}
            label="Significant strikes"
            red={result.stats.red.significantStrikesLanded}
            blue={result.stats.blue.significantStrikesLanded}
            redSub={`of ${result.stats.red.significantStrikesAttempted}`}
            blueSub={`of ${result.stats.blue.significantStrikesAttempted}`}
          />
          <StatComparison
            redName={red?.lastName ?? 'Red corner'}
            blueName={blue?.lastName ?? 'Blue corner'}
            label="Takedowns"
            red={result.stats.red.takedownsLanded}
            blue={result.stats.blue.takedownsLanded}
            redSub={`of ${result.stats.red.takedownsAttempted}`}
            blueSub={`of ${result.stats.blue.takedownsAttempted}`}
          />
          <StatComparison
            redName={red?.lastName ?? 'Red corner'}
            blueName={blue?.lastName ?? 'Blue corner'}
            label="Control time"
            red={result.stats.red.controlSeconds}
            blue={result.stats.blue.controlSeconds}
            format={(v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`}
          />
          <StatComparison
            redName={red?.lastName ?? 'Red corner'}
            blueName={blue?.lastName ?? 'Blue corner'}
            label="Knockdowns"
            red={result.stats.red.knockdowns}
            blue={result.stats.blue.knockdowns}
          />
          <StatComparison
            redName={red?.lastName ?? 'Red corner'}
            blueName={blue?.lastName ?? 'Blue corner'}
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
                {result.scorecards.map((card) => (
                  <tr key={card.judgeName}>
                    <th scope="row">{card.judgeName}</th>
                    {card.rounds.map((r) => (
                      <td key={r.round} className="numeric">
                        {r.red}–{r.blue}
                      </td>
                    ))}
                    <td className="numeric" style={{ fontWeight: 700 }}>
                      {card.redTotal}–{card.blueTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(result.deductions.red > 0 || result.deductions.blue > 0) && (
            <p className="scorecards__deduction">
              <span aria-hidden="true">&#8854;</span>{' '}
              {result.deductions.red > 0 && (
                <>
                  <strong>{red?.lastName ?? 'Red'}</strong> lost{' '}
                  {result.deductions.red === 1 ? 'a point' : `${result.deductions.red} points`}
                  {result.deductions.blue > 0 && '; '}
                </>
              )}
              {result.deductions.blue > 0 && (
                <>
                  <strong>{blue?.lastName ?? 'Blue'}</strong> lost{' '}
                  {result.deductions.blue === 1 ? 'a point' : `${result.deductions.blue} points`}
                </>
              )}
              . Already applied to the totals above &mdash; which is why they may not add up.
            </p>
          )}
          <p className="faint" style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)' }}>
            Scores read {red?.lastName ?? 'red'}&ndash;{blue?.lastName ?? 'blue'}. Judges weigh damage,
            control and volume differently, which is why they disagree.
          </p>
        </Card>
      )}
    </>
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
      <div className="fight-stat__bar" role="presentation">
        <div className="fight-stat__bar-red" style={{ width: `${redShare}%` }} />
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
