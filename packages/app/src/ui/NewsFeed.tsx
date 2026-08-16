import { useState } from 'react';
import type { NewsItem, NewsWeight } from '@mmasim/engine';
import { formatGameDay } from '../shell/Shell';
import './NewsFeed.css';

/**
 * The feed.
 *
 * The design problem is volume: a simulated year produces around 160 items, of which three
 * matter enormously and a hundred and thirty are a preliminary decision between two people
 * the player has never heard of. Hiding the minor ones entirely would make the world feel
 * small; showing them at equal weight makes the important ones invisible.
 *
 * So the tiers are visibly different — a title change is large and marked, an ordinary
 * result is a quiet line — and the minor tier is collapsed behind a count the player can
 * open. That way the sport is demonstrably busy without the belt moving being buried.
 */

const KIND_ICON: Readonly<Record<string, string>> = {
  titleChange: '🏆',
  titleDefence: '🏆',
  upset: '⚡',
  retirement: '🎬',
  signing: '✍️',
  streak: '🔥',
  rivalry: '🔥',
  result: '·',
  injury: '🩹',
  debut: '✍️',
};

const KIND_LABEL: Readonly<Record<string, string>> = {
  titleChange: 'Title change',
  titleDefence: 'Title defence',
  upset: 'Upset',
  retirement: 'Retirement',
  signing: 'Signing',
  streak: 'Winning run',
  rivalry: 'Rivalry',
  result: 'Result',
  injury: 'Injury',
  debut: 'Debut',
};

export function NewsFeed({
  items,
  onFighterClick,
  limit = 12,
  emptyMessage = 'Nothing has happened yet. Train, fight, and the sport will get on with itself around you.',
}: {
  items: readonly NewsItem[];
  onFighterClick?(id: string): void;
  /** How many of the loud items to show before "show more". */
  limit?: number;
  emptyMessage?: string;
}) {
  const [showMinor, setShowMinor] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loud = items.filter((i) => i.weight !== 'minor');
  const quiet = items.filter((i) => i.weight === 'minor');
  const shown = expanded ? loud : loud.slice(0, limit);

  if (items.length === 0) {
    return <p className="muted prose">{emptyMessage}</p>;
  }

  return (
    <div className="news">
      {shown.length === 0 && (
        <p className="muted prose" style={{ marginBottom: 'var(--space-3)' }}>
          A quiet spell — nothing headline-worthy while you were away.
        </p>
      )}

      <ol className="news__list">
        {shown.map((item) => (
          <NewsRow key={item.id as string} item={item} onFighterClick={onFighterClick} />
        ))}
      </ol>

      <div className="row" style={{ flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
        {loud.length > limit && (
          <button type="button" className="news__more" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Show less' : `Show all ${loud.length}`}
          </button>
        )}
        {quiet.length > 0 && (
          <button type="button" className="news__more" onClick={() => setShowMinor((v) => !v)}>
            {showMinor ? 'Hide' : `${quiet.length} other result${quiet.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {showMinor && (
        <ol className="news__list news__list--quiet">
          {quiet.slice(0, 60).map((item) => (
            <NewsRow key={item.id as string} item={item} onFighterClick={onFighterClick} />
          ))}
        </ol>
      )}
    </div>
  );
}

function NewsRow({
  item,
  onFighterClick,
}: {
  item: NewsItem;
  onFighterClick?(id: string): void;
}) {
  const primary = item.fighterIds[0];
  const clickable = primary !== undefined && onFighterClick !== undefined;

  return (
    <li className={`news__item news__item--${item.weight}${item.involvesPlayer ? ' news__item--you' : ''}`}>
      {/* Icon, tier and a word: the kind is never carried by the glyph alone. */}
      <span className="news__icon" aria-hidden="true">
        {KIND_ICON[item.kind] ?? '·'}
      </span>
      <span className="news__body">
        <span className="news__meta">
          <span className="news__kind">{KIND_LABEL[item.kind] ?? item.kind}</span>
          {item.involvesPlayer && <span className="news__you">You</span>}
          <span className="news__date">{formatGameDay(item.day)}</span>
        </span>
        {clickable ? (
          <button
            type="button"
            className="news__headline news__headline--link"
            onClick={() => onFighterClick(primary as string)}
          >
            {item.headline}
          </button>
        ) : (
          <span className="news__headline">{item.headline}</span>
        )}
        {item.detail && <span className="news__detail">{item.detail}</span>}
      </span>
    </li>
  );
}

/** Weight ordering, exported so a screen can sort a mixed list the same way the feed does. */
export const NEWS_WEIGHT_ORDER: Readonly<Record<NewsWeight, number>> = {
  major: 0,
  normal: 1,
  minor: 2,
};
