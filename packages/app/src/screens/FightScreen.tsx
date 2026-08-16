import { useEffect, useMemo, useRef, useState } from 'react';
import {
  displayName,
  isDecisionMethod,
  isKoMethod,
  type FightEvent,
  type FightResult,
  type Fighter,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Segmented } from '../ui';
import { getLastResult } from '../game/career';
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
export function FightScreen() {
  const { db } = useGame();
  const { navigate } = useRouter();
  const result = useMemo(() => getLastResult(), []);
  const [speed, setSpeed] = useState<Speed>('fast');
  const [shown, setShown] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);

  const total = result?.events.length ?? 0;
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
    const event = result.events[shown];
    const weight = event?.emphasis === 'critical' ? 2.2 : event?.emphasis === 'major' ? 1.5 : 1;
    const timer = setTimeout(() => setShown((n) => n + 1), delay * weight);
    return () => clearTimeout(timer);
  }, [shown, total, delay, result]);

  useEffect(() => {
    if (delay === 0) return;
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [shown, delay]);

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
  const visible = result.events.slice(0, shown);

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
        <div className="fight-feed" ref={feedRef} aria-live="polite" aria-atomic="false">
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

      {finished && <FightSummary result={result} red={red} blue={blue} />}

      {finished && (
        <Button variant="primary" block onClick={() => navigate({ name: 'hub' })}>
          Back to career
        </Button>
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
  const classes = [
    'fight-line',
    event.emphasis && `fight-line--${event.emphasis}`,
    event.corner && `fight-line--${event.corner}`,
    (event.kind === 'roundStart' || event.kind === 'roundEnd') && 'fight-line--round',
  ]
    .filter(Boolean)
    .join(' ');

  if (event.kind === 'roundStart' || event.kind === 'roundEnd') {
    return <p className={classes}>{event.text}</p>;
  }

  return (
    <p className={classes}>
      <span className="fight-line__time numeric">
        R{event.round} {mm}:{ss}
      </span>
      <span>{event.text}</span>
    </p>
  );
}

function FightSummary({
  result,
  red,
  blue,
}: {
  result: FightResult;
  red?: Fighter;
  blue?: Fighter;
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

      <Card title="Fight statistics">
        <div className="fight-stats">
          <StatComparison
            label="Significant strikes"
            red={result.stats.red.significantStrikesLanded}
            blue={result.stats.blue.significantStrikesLanded}
            redSub={`of ${result.stats.red.significantStrikesAttempted}`}
            blueSub={`of ${result.stats.blue.significantStrikesAttempted}`}
          />
          <StatComparison
            label="Takedowns"
            red={result.stats.red.takedownsLanded}
            blue={result.stats.blue.takedownsLanded}
            redSub={`of ${result.stats.red.takedownsAttempted}`}
            blueSub={`of ${result.stats.blue.takedownsAttempted}`}
          />
          <StatComparison
            label="Control time"
            red={result.stats.red.controlSeconds}
            blue={result.stats.blue.controlSeconds}
            format={(v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`}
          />
          <StatComparison
            label="Knockdowns"
            red={result.stats.red.knockdowns}
            blue={result.stats.blue.knockdowns}
          />
          <StatComparison
            label="Submission attempts"
            red={result.stats.red.submissionAttempts}
            blue={result.stats.blue.submissionAttempts}
          />
        </div>
      </Card>

      {isDecisionMethod(result.method) && (
        <Card title="Scorecards" flush>
          <div className="scroll-x">
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
          <p className="faint" style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)' }}>
            Scores read {red?.lastName ?? 'red'}–{blue?.lastName ?? 'blue'}. Judges weigh damage,
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
  redSub,
  blueSub,
  format = (v: number) => String(Math.round(v)),
}: {
  label: string;
  red: number;
  blue: number;
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
          {format(red)}
          {redSub && <span className="faint"> {redSub}</span>}
        </span>
        <span className="fight-stat__label">{label}</span>
        <span className="fight-stat__value numeric" style={{ textAlign: 'right' }}>
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
