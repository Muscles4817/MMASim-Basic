import { useMemo, useState } from 'react';
import {
  displayName,
  divisionsFor,
  overallRating,
  recordString,
  type Fighter,
  type Sex,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Card, Chip, Empty, ListItem, Segmented } from '../ui';

/**
 * Divisional rankings.
 *
 * Ranked on results and reputation rather than on attributes: rankings are what the sport
 * *believes*, and the gap between belief and ability is one of the more interesting things
 * a player can exploit. A fighter can be underrated here and it should stay that way until
 * they beat someone.
 */
function rankingScore(f: Fighter): number {
  const streakBonus = Math.max(0, f.summary.streak) * 4;
  const skidPenalty = Math.min(0, f.summary.streak) * 6;
  return f.reputation * 1.6 + streakBonus + skidPenalty + f.starPower * 0.25;
}

export function RankingsScreen() {
  const { db } = useGame();
  const { navigate } = useRouter();
  const [sex, setSex] = useState<Sex>('male');
  const divisions = useMemo(() => divisionsFor(sex), [sex]);
  const [divisionId, setDivisionId] = useState<string>(divisions[3]?.id as string);
  const all = db.fighters.findAll() as Fighter[];

  const onSexChange = (next: Sex) => {
    setSex(next);
    const first = divisionsFor(next)[0];
    if (first) setDivisionId(first.id as string);
  };

  // One division at a time. Eight divisions of ten rows is sixty rows with no jump
  // navigation, which the roster screen already correctly refuses to do.
  const shown = divisions.filter((d) => (d.id as string) === divisionId);

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
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
          className="field"
          value={divisionId}
          onChange={(e) => setDivisionId(e.target.value)}
        >
          {divisions.map((d) => (
            <option key={d.id} value={d.id as string}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      {shown.map((division) => {
        const ranked = all
          .filter((f) => f.divisionId === division.id)
          .sort((a, b) => rankingScore(b) - rankingScore(a))
          .slice(0, 10);

        return (
          <Card key={division.id} flush title={`${division.name} · ${division.limitLbs} lb`}>
            {ranked.length === 0 ? (
              <Empty title="No ranked fighters" />
            ) : (
              <div className="list">
                {ranked.map((f, i) => (
                  <ListItem
                    key={f.id}
                    onClick={() => navigate({ name: 'fighter', id: f.id as string })}
                    leading={
                      <span
                        className="numeric"
                        style={{
                          width: '1.75rem',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: i === 0 ? 'var(--accent)' : 'var(--text-faint)',
                        }}
                      >
                        {i === 0 ? 'C' : i}
                        <span className="visually-hidden">
                          {i === 0 ? 'Champion' : ` Ranked number ${i}`}
                        </span>
                      </span>
                    }
                    primary={displayName(f)}
                    secondary={
                      <>
                        {recordString(f.summary)}
                        {f.summary.streak >= 2 && ` · ${f.summary.streak}W streak`}
                        {f.summary.streak <= -2 && ` · ${Math.abs(f.summary.streak)}L skid`}
                      </>
                    }
                    trailing={<Chip tone="info">{Math.round(overallRating(f.attributes))}</Chip>}
                  />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
