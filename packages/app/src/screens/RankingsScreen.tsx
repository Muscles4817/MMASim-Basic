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
  const all = db.fighters.findAll() as Fighter[];

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Segmented
        label="Filter by sex"
        value={sex}
        onChange={setSex}
        options={[
          { value: 'male', label: "Men's divisions" },
          { value: 'female', label: "Women's divisions" },
        ]}
      />

      {divisions.map((division) => {
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
