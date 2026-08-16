import {
  displayName,
  gameDayToIso,
  getDivision,
  isDecisionMethod,
  isKoMethod,
  type FightRecordEntry,
  type Fighter,
  type FinishMethod,
  type RecordSummary,
} from '@mmasim/engine';
import { Chip, Empty } from './index';
import './FightRecord.css';

/**
 * A fighter's results.
 *
 * Reads the way a record is actually read in the sport: newest first, outcome first, and the
 * method stated plainly. The outcome is carried by a letter, a colour *and* the method text,
 * so it survives colour-blindness, a greyscale screen and a screen reader alike.
 */

const METHOD_LABEL: Readonly<Record<FinishMethod, string>> = {
  ko: 'KO',
  tko: 'TKO',
  submission: 'Submission',
  decisionUnanimous: 'Decision (unanimous)',
  decisionSplit: 'Decision (split)',
  decisionMajority: 'Decision (majority)',
  draw: 'Draw',
  noContest: 'No contest',
  dq: 'Disqualification',
  retirement: 'Retirement',
  doctorStoppage: 'Doctor stoppage',
};

/** Short, scannable method tag for the right-hand column. */
function methodTag(method: FinishMethod): { label: string; tone: 'negative' | 'warning' | 'info' } {
  if (isKoMethod(method)) return { label: method === 'ko' ? 'KO' : 'TKO', tone: 'negative' };
  if (method === 'submission') return { label: 'SUB', tone: 'warning' };
  if (isDecisionMethod(method)) return { label: 'DEC', tone: 'info' };
  return { label: '—', tone: 'info' };
}

function formatTime(entry: FightRecordEntry): string {
  const mm = Math.floor(entry.timeSeconds / 60);
  const ss = String(Math.round(entry.timeSeconds % 60)).padStart(2, '0');
  return `R${entry.round} ${mm}:${ss}`;
}

export function RecordSummaryBar({ summary }: { summary: RecordSummary }) {
  const finishes = summary.koWins + summary.submissionWins;
  const total = summary.wins + summary.losses + summary.draws;
  const finishRate = summary.wins > 0 ? Math.round((finishes / summary.wins) * 100) : 0;

  return (
    <div className="record-summary">
      <div className="record-summary__line">
        <span className="record-summary__figure record-summary__figure--win">
          {summary.wins}
          <span className="record-summary__label">W</span>
        </span>
        <span className="record-summary__figure record-summary__figure--loss">
          {summary.losses}
          <span className="record-summary__label">L</span>
        </span>
        <span className="record-summary__figure record-summary__figure--draw">
          {summary.draws}
          <span className="record-summary__label">D</span>
        </span>
        {summary.noContests > 0 && (
          <span className="record-summary__figure">
            {summary.noContests}
            <span className="record-summary__label">NC</span>
          </span>
        )}
      </div>

      {/* Proportional bar. The win/loss split is the single most-scanned fact about a
          fighter, so it gets a shape as well as a number. */}
      {total > 0 && (
        <div
          className="record-summary__bar"
          role="img"
          aria-label={`${summary.wins} wins, ${summary.losses} losses, ${summary.draws} draws`}
        >
          <span
            className="record-summary__bar-win"
            style={{ width: `${(summary.wins / total) * 100}%` }}
          />
          <span
            className="record-summary__bar-loss"
            style={{ width: `${(summary.losses / total) * 100}%` }}
          />
          <span
            className="record-summary__bar-draw"
            style={{ width: `${(summary.draws / total) * 100}%` }}
          />
        </div>
      )}

      <div className="row" style={{ flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
        {summary.koWins > 0 && (
          <Chip tone="negative" title="Wins by knockout or TKO">
            {summary.koWins} by KO
          </Chip>
        )}
        {summary.submissionWins > 0 && (
          <Chip tone="warning" title="Wins by submission">
            {summary.submissionWins} by submission
          </Chip>
        )}
        {summary.decisionWins > 0 && (
          <Chip tone="info" title="Wins on the judges' scorecards">
            {summary.decisionWins} by decision
          </Chip>
        )}
        {summary.wins > 0 && (
          <Chip title="Share of wins that ended inside the distance">{finishRate}% finish rate</Chip>
        )}
        {summary.koLosses > 0 && (
          <Chip tone="negative" title="Times this fighter has been knocked out">
            KO&rsquo;d {summary.koLosses}×
          </Chip>
        )}
      </div>
    </div>
  );
}

export function FightRecordList({
  fighter,
  opponents,
  onOpponentClick,
  priorBouts,
}: {
  fighter: Fighter;
  /** Opponent lookup, so the list can name them. */
  opponents: Map<string, Fighter>;
  onOpponentClick?(id: string): void;
  /** Bouts fought before the simulation started, which have no per-fight detail. */
  priorBouts?: number;
}) {
  // Newest first: the last three fights are what anyone actually wants to know.
  const entries = [...fighter.record].reverse();

  if (entries.length === 0) {
    return (
      <Empty title="No fights in this run yet">
        {priorBouts && priorBouts > 0
          ? `${priorBouts} professional bouts before this save began, with no round-by-round detail recorded.`
          : 'Their first fight has not happened yet.'}
      </Empty>
    );
  }

  return (
    <>
      <ol className="record-list">
        {entries.map((entry) => {
          const opponent = opponents.get(entry.opponentId as string);
          const tag = methodTag(entry.method);
          const outcome =
            entry.outcome === 'win'
              ? { letter: 'W', label: 'Win', className: 'win' }
              : entry.outcome === 'loss'
                ? { letter: 'L', label: 'Loss', className: 'loss' }
                : entry.outcome === 'draw'
                  ? { letter: 'D', label: 'Draw', className: 'draw' }
                  : { letter: 'NC', label: 'No contest', className: 'nc' };

          return (
            <li key={entry.boutId} className={`record-row record-row--${outcome.className}`}>
              {/* Letter, colour and the word: three channels for the same fact. */}
              <span className={`record-row__outcome record-row__outcome--${outcome.className}`}>
                <span aria-hidden="true">{outcome.letter}</span>
                <span className="visually-hidden">{outcome.label}</span>
              </span>

              <span className="record-row__body">
                <span className="record-row__opponent">
                  {entry.wasTitleFight && (
                    <span title="Championship bout" aria-label="Championship bout">
                      🏆{' '}
                    </span>
                  )}
                  {opponent && onOpponentClick ? (
                    <button
                      type="button"
                      className="record-row__link"
                      onClick={() => onOpponentClick(entry.opponentId as string)}
                    >
                      {displayName(opponent)}
                    </button>
                  ) : (
                    (opponent ? displayName(opponent) : 'Unknown opponent')
                  )}
                </span>
                <span className="record-row__meta">
                  {METHOD_LABEL[entry.method]} · {formatTime(entry)} ·{' '}
                  {gameDayToIso(entry.day).slice(0, 7)} ·{' '}
                  {getDivision(entry.divisionId).shortName}
                  {entry.shortNotice && ' · short notice'}
                </span>
              </span>

              <Chip tone={tag.tone} title={METHOD_LABEL[entry.method]}>
                {tag.label}
              </Chip>
            </li>
          );
        })}
      </ol>

      {priorBouts !== undefined && priorBouts > 0 && (
        <p className="faint record-list__prior">
          Plus {priorBouts} professional bouts before this save began, with no round-by-round
          detail recorded.
        </p>
      )}
    </>
  );
}
