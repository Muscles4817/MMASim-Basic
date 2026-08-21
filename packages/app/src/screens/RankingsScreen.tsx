import { useMemo, useState } from 'react';
import {
  abilityRead,
  displayName,
  divisionsFor,
  fighterAge,
  isActive,
  overallRating,
  rankDivision,
  recordString,
  type Fighter,
  type Promotion,
  type RankedFighter,
  type Sex,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Card, Chip, DataTable, Empty, Panel, Segmented, type Column } from '../ui';
import { Help, Icon, StreakBadge } from '../ui/signals';
import { Console } from '../ui/console';

/**
 * Divisional rankings.
 *
 * Two things were wrong with this screen originally and both were structural.
 *
 * **It ranked across every promotion at once**, which is not a thing that exists. Rankings are a
 * promotion's opinion of its own roster — a fighter is number three *in the AFC*, and being
 * number three there says nothing about somebody on a rival's books. The promotion filter
 * defaults to the player's own for exactly that reason.
 *
 * **It scored fighters with its own private formula**, a near-copy of the engine's, so the screen
 * and the career could and did disagree about who the number one contender was. It calls
 * `rankDivision` — the same function the title-shot logic reads — which also brings the things
 * the copy had quietly dropped.
 *
 * All of that was right and is untouched. What doc 32 § 3.3 found was presentation: a two-line
 * list on a 56rem column, capped at fifteen, with the two filters spending a full band of
 * vertical space above it. A ranking is a **comparison**, and comparison wants columns — so the
 * rows carry age, record, streak and ability side by side, and the filters sit in the console's
 * side column where they cost nothing.
 *
 * A pound-for-pound view is kept, because "who is the best in the world regardless of who signs
 * their cheques" is a real question — it is just not the ladder that decides a player's next
 * fight, so it is not the default.
 */

/** The synthetic promotion filter for the cross-promotional view. */
const P4P = '__p4p__';

/** Deep enough to see the whole picture, short enough that nobody scrolls past the point. */
const SHOWN = 25;

export function RankingsScreen() {
  const { db, world, playerFighter } = useGame();
  const { navigate } = useRouter();

  const promotions = useMemo(
    () =>
      (db.promotions.findAll() as unknown as Promotion[])
        .slice()
        .sort((a, b) => b.prestige - a.prestige),
    [db],
  );

  const [sex, setSex] = useState<Sex>(playerFighter?.sex ?? 'male');
  const divisions = useMemo(() => divisionsFor(sex), [sex]);
  const [divisionId, setDivisionId] = useState<string>(
    (playerFighter?.divisionId as string | undefined) ?? (divisions[3]?.id as string),
  );
  // Defaults to the ladder the player is actually on.
  const [promotionId, setPromotionId] = useState<string>(
    (playerFighter?.promotionId as string | undefined) ?? (promotions[0]?.id as string) ?? P4P,
  );

  const all = db.fighters.findAll() as Fighter[];
  const division = divisions.find((d) => (d.id as string) === divisionId) ?? divisions[0];
  const promotion = promotions.find((p) => (p.id as string) === promotionId);

  const onSexChange = (next: Sex) => {
    setSex(next);
    const first = divisionsFor(next)[0];
    if (first) setDivisionId(first.id as string);
  };

  const ranked: RankedFighter[] = useMemo(() => {
    if (!division) return [];

    if (promotionId === P4P) {
      // Pound for pound: no belt, no promotion, just everyone still competing in the division
      // sorted the same way. Deliberately not a `rankDivision` call, because that function is
      // about one promotion's ladder and this question is not.
      return all
        .filter((f) => f.divisionId === division.id && isActive(f, world.day) && f.record.length > 0)
        .map((fighter) => ({ fighter, position: 0, score: overallRating(fighter.attributes) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, SHOWN)
        .map((r, i) => ({ ...r, position: i + 1 }));
    }

    if (!promotion) return [];
    return rankDivision(
      all,
      division.id,
      promotion.id,
      world.day,
      promotion.champions[division.id],
      promotions,
    ).slice(0, SHOWN);
  }, [all, division, promotion, promotions, promotionId, world.day]);

  const isP4P = promotionId === P4P;

  const columns: Column<RankedFighter>[] = [
    {
      id: 'place',
      label: '#',
      render: (r) =>
        !isP4P && r.position === 0 ? (
          <>
            <Icon name="champion" />
            <span className="visually-hidden">Champion</span>
          </>
        ) : (
          r.position
        ),
      numeric: true,
      onPhone: 'hidden',
    },
    {
      id: 'name',
      label: 'Fighter',
      render: (r) => (
        <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {/* The place, folded into the name for the phone composition — where the `#` column
              is hidden, and a rank with no number beside it is not a ranking. */}
          <span className="faint rank-inline">
            {!isP4P && r.position === 0 ? 'C' : r.position}
          </span>
          <span>{displayName(r.fighter)}</span>
          {/* Finding yourself in a list of twenty-five should not require reading it. */}
          {playerFighter?.id === r.fighter.id && <Chip tone="accent">You</Chip>}
        </span>
      ),
      onPhone: 'primary',
    },
    {
      id: 'record',
      label: 'Record',
      render: (r) => recordString(r.fighter.summary),
      onPhone: 'secondary',
    },
    {
      id: 'age',
      label: 'Age',
      render: (r) => fighterAge(r.fighter, world.day),
      sort: (a, b) => fighterAge(a.fighter, world.day) - fighterAge(b.fighter, world.day),
      numeric: true,
      onPhone: 'secondary',
    },
    {
      id: 'streak',
      label: 'Form',
      render: (r) =>
        Math.abs(r.fighter.summary.streak) >= 2 ? (
          <StreakBadge streak={r.fighter.summary.streak} />
        ) : (
          <span className="faint">—</span>
        ),
      sort: (a, b) => a.fighter.summary.streak - b.fighter.summary.streak,
      onPhone: 'trailing',
    },
    {
      id: 'ability',
      label: 'Ability',
      title: 'What the fighter is, as against what the promotion believes — the two disagreeing is the point',
      render: (r) => <span className="faint">{abilityRead(r.fighter.attributes).label}</span>,
      sort: (a, b) => overallRating(a.fighter.attributes) - overallRating(b.fighter.attributes),
      onPhone: 'trailing',
    },
  ];

  const filters = (
    <Card title="Filters">
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <div>
          <h3 className="section-title">Promotion</h3>
          <label>
            <span className="visually-hidden">Choose a promotion</span>
            <select
              className="field"
              value={promotionId}
              onChange={(e) => setPromotionId(e.target.value)}
            >
              {promotions.map((p) => (
                <option key={p.id} value={p.id as string}>
                  {p.name}
                  {playerFighter?.promotionId === p.id ? ' — your promotion' : ''}
                </option>
              ))}
              <option value={P4P}>Pound for pound (all promotions)</option>
            </select>
          </label>
        </div>

        <div>
          <h3 className="section-title">Division</h3>
          <Segmented
            label="Filter by sex"
            value={sex}
            onChange={onSexChange}
            options={[
              { value: 'male', label: "Men's" },
              { value: 'female', label: "Women's" },
            ]}
          />
          <label style={{ display: 'block', marginTop: 'var(--space-2)' }}>
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
        </div>

        {/*
          What ordered the list, on demand rather than permanently.

          Without this a player sees #6 at an elite ability sitting below #3 at a solid one and
          has no way to learn why — the explanation used to exist only as a code comment. It is
          the game's own teaching material, so it stays on the page; it is also the same three
          sentences on every visit, so it stays closed.
        */}
        <Help label="How is this ordered?">
          {isP4P ? (
            <>
              Pound for pound is ordered on <strong>ability</strong>, ignoring promotion and belts
              entirely. It is a fun argument, not a ladder — nobody gets a title shot from it.
            </>
          ) : (
            <>
              Ranked on what <strong>{promotion?.shortName ?? 'the promotion'}</strong> believes —
              results, reputation and momentum — not on ability. The ability column is what the
              fighter <em>is</em>, and the two disagreeing is the point: a fighter can be badly
              underrated and stay that way until they beat somebody the rankings respect. Only
              fighters signed here appear.
            </>
          )}
        </Help>
      </div>
    </Card>
  );

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Console
        main={
          <Panel
            testId="rankings"
            title={
              division
                ? `${division.name} · ${division.limitLbs} lb${isP4P ? ' · pound for pound' : ''}`
                : 'Rankings'
            }
          >
            <Card flush>
              <DataTable
                rows={ranked}
                columns={columns}
                rowKey={(r) => r.fighter.id as string}
                caption={`${division?.name ?? 'Divisional'} rankings`}
                onRowClick={(r) => navigate({ name: 'fighter', id: r.fighter.id as string })}
                isCurrent={(r) => playerFighter?.id === r.fighter.id}
                empty={
                  <Empty title="Nobody ranked here yet">
                    {isP4P
                      ? 'Nobody in this division has fought yet.'
                      : `${promotion?.shortName ?? 'This promotion'} has nobody signed in this division who has fought yet.`}
                  </Empty>
                }
              />
            </Card>
          </Panel>
        }
        side={filters}
      />
    </div>
  );
}
