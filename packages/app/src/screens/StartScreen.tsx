import { useMemo, useState } from 'react';
import {
  displayName,
  getDivision,
  overallRating,
  recordString,
  type Fighter,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, ListItem, Segmented } from '../ui';
import { activeDivisionPeers, clearTransientCareerState } from '../game/career';

type Filter = 'contenders' | 'prospects' | 'all';

/**
 * Choose who to play as.
 *
 * The three filters are the three genuinely different games available: taking a made
 * fighter to a belt, building an unknown from nothing, or browsing. `prospects` is
 * deliberately listed second and described honestly — it is the harder, better run.
 */
export function StartScreen() {
  const { db, updateWorld } = useGame();
  const { navigate } = useRouter();
  const [filter, setFilter] = useState<Filter>('contenders');
  const [search, setSearch] = useState('');

  const fighters = useMemo(() => {
    const all = db.fighters.findAll() as Fighter[];
    const term = search.trim().toLowerCase();
    const matches = (f: Fighter) =>
      term === '' || `${f.firstName} ${f.lastName} ${f.nickname ?? ''}`.toLowerCase().includes(term);

    const filtered = all.filter((f) => {
      if (!matches(f)) return false;
      if (filter === 'contenders') return f.reputation >= 60;
      if (filter === 'prospects') return f.reputation < 60;
      return true;
    });

    return filtered.sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes));
  }, [db, filter, search]);

  const choose = (fighter: Fighter) => {
    // Bookings and the last result are keyed to the previous fighter. Left behind, the hub
    // offers to send the new fighter into the old one’s booked bout.
    clearTransientCareerState();
    updateWorld({ playerRole: 'fighter', playerFighterId: fighter.id as string });
    navigate({ name: 'hub' });
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card>
        <h2 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>
          Pick your fighter
        </h2>
        <p className="muted prose" style={{ marginBottom: 'var(--space-4)' }}>
          January 2020. Every rating here is a judgement call, and every fighter has something
          an opponent can build a game plan around — including you.
        </p>

        <div className="stack">
          <Segmented
            label="Filter fighters"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'contenders', label: 'Contenders', hint: 'Established names' },
              { value: 'prospects', label: 'Prospects', hint: 'Harder, and more room to grow' },
              { value: 'all', label: 'Everyone' },
            ]}
          />
          <label>
            <span className="visually-hidden">Search fighters by name</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="field"
            />
          </label>
        </div>

        <Button
          variant="ghost"
          block
          onClick={() => navigate({ name: 'roster' })}
          style={{ marginTop: 'var(--space-3)' }}
        >
          Just browse the roster instead
        </Button>
      </Card>

      <Card flush title={`${fighters.length} fighter${fighters.length === 1 ? '' : 's'}`}>
        {fighters.length === 0 ? (
          <Empty title="Nobody matches that">Try a different filter or clear the search.</Empty>
        ) : (
          <div className="list">
            {fighters.map((f) => (
              <ListItem
                key={f.id}
                onClick={() => choose(f)}
                primary={displayName(f)}
                secondary={
                  <>
                    {getDivision(f.divisionId).shortName} · {recordString(f.summary)} ·{' '}
                    {f.nationality}
                  </>
                }
                trailing={
                  <span className="row" style={{ gap: 'var(--space-2)' }}>
                    {activeDivisionPeers(db, f) < 3 && (
                      <Chip tone="warning">Thin division</Chip>
                    )}
                    <Chip tone={f.starPower >= 65 ? 'accent' : 'neutral'}>
                      <span className="visually-hidden">Star power </span>★ {f.starPower}
                    </Chip>
                    <Chip tone="info">
                      <span className="visually-hidden">Overall rating </span>
                      {Math.round(overallRating(f.attributes))}
                    </Chip>
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Card>

    </div>
  );
}
