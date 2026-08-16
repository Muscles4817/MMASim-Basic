import { useMemo, useState } from 'react';
import {
  DIVISIONS,
  displayName,
  divisionsFor,
  getDivision,
  overallRating,
  recordString,
  type Fighter,
  type Sex,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Card, Empty, ListItem, Segmented, bandColour } from '../ui';
import { StreakBadge } from '../ui/signals';

/**
 * Roster browser.
 *
 * Division-first, because that is how the sport is organised and how a player thinks about
 * matchmaking. The sex filter comes before the division picker rather than mixing all
 * twelve divisions into one long list — twelve options is past the point where a dropdown
 * on a phone stops being usable.
 */
export function RosterScreen() {
  const { db } = useGame();
  const { navigate } = useRouter();
  const [sex, setSex] = useState<Sex>('male');
  const [divisionId, setDivisionId] = useState<string>(DIVISIONS[3]!.id as string);
  const [search, setSearch] = useState('');

  const divisions = useMemo(() => divisionsFor(sex), [sex]);

  const fighters = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = db.fighters.findAll() as Fighter[];
    return all
      .filter((f) => {
        if (term) {
          return `${f.firstName} ${f.lastName} ${f.nickname ?? ''}`.toLowerCase().includes(term);
        }
        return f.divisionId === divisionId;
      })
      .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes));
  }, [db, divisionId, search]);

  const onSexChange = (next: Sex) => {
    setSex(next);
    // Keep the division picker valid — leaving it pointing at a men's division while the
    // filter says women's is the kind of small incoherence that erodes trust in a UI.
    const first = divisionsFor(next)[0];
    if (first) setDivisionId(first.id as string);
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card>
        <div className="stack">
          <label>
            <span className="visually-hidden">Search all fighters by name</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all divisions…"
              className="field"
            />
          </label>

          {!search && (
            <>
              <Segmented
                label="Filter by sex"
                value={sex}
                onChange={onSexChange}
                options={[
                  { value: 'male', label: "Men's" },
                  { value: 'female', label: "Women's" },
                ]}
              />
              <label>
                <span className="visually-hidden">Choose a division</span>
                <select
                  value={divisionId}
                  onChange={(e) => setDivisionId(e.target.value)}
                  className="field"
                >
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id as string}>
                      {d.name} ({d.limitLbs} lb)
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      </Card>

      <Card
        flush
        title={
          search
            ? `${fighters.length} result${fighters.length === 1 ? '' : 's'}`
            : getDivision(divisionId as never).name
        }
      >
        {fighters.length === 0 ? (
          <Empty title="Nobody here">
            {search ? 'No fighter matches that name.' : 'This division has no seeded fighters.'}
          </Empty>
        ) : (
          <div className="list">
            {fighters.map((f, index) => (
              <ListItem
                key={f.id}
                onClick={() => navigate({ name: 'fighter', id: f.id as string })}
                leading={
                  <span
                    className="numeric faint"
                    style={{ width: '1.75rem', textAlign: 'right', fontSize: 'var(--text-sm)' }}
                  >
                    {index + 1}
                  </span>
                }
                primary={displayName(f)}
                secondary={
                  <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span>
                      {recordString(f.summary)} · {f.nationality}
                      {search && ` · ${getDivision(f.divisionId).shortName}`}
                    </span>
                    {Math.abs(f.summary.streak) >= 2 && <StreakBadge streak={f.summary.streak} />}
                  </span>
                }
                trailing={
                  // Band-coloured, so a division reads as a shape: where the elite sit and
                  // where the filler starts, without comparing fifteen numbers.
                  <span
                    className="numeric"
                    style={{
                      fontWeight: 800,
                      fontSize: 'var(--text-lg)',
                      color: bandColour(Math.round(overallRating(f.attributes))),
                      minWidth: '2.25rem',
                      textAlign: 'right',
                    }}
                    title="Overall rating"
                  >
                    <span className="visually-hidden">Overall rating </span>
                    {Math.round(overallRating(f.attributes))}
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
