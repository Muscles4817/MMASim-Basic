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
import { Card, Empty, ListItem, Segmented } from '../ui';
import { OverallRating, StreakBadge } from '../ui/signals';

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

  /*
   * Capped, because a search matches across the whole roster rather than one division.
   *
   * Every keystroke filtered ~800 fighters and rendered every match, which is visible jank on
   * a phone. Rankings already caps at 15 for the same reason. The cap only ever applies to a
   * search — browsing a division is bounded by the division — and the count below says when
   * it bit, so a truncated list never quietly reads as "that is everyone".
   */
  const SEARCH_LIMIT = 40;

  const { fighters, truncated } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = db.fighters.findAll() as Fighter[];
    const matched = all
      .filter((f) => {
        if (term) {
          return `${f.firstName} ${f.lastName} ${f.nickname ?? ''}`.toLowerCase().includes(term);
        }
        return f.divisionId === divisionId;
      })
      .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes));

    return term && matched.length > SEARCH_LIMIT
      ? { fighters: matched.slice(0, SEARCH_LIMIT), truncated: matched.length }
      : { fighters: matched, truncated: 0 };
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
            ? truncated
              ? // Never silently truncate: a capped list that reads as a complete one is a
                // worse failure than a slow one.
                `${fighters.length} of ${truncated} results`
              : `${fighters.length} result${fighters.length === 1 ? '' : 's'}`
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
                  // The band *word* beside the number, not just the colour: a division has to read
                  // as a shape in greyscale too, and hue alone was the whole signal here.
                  <OverallRating rating={overallRating(f.attributes)} />
                }
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
