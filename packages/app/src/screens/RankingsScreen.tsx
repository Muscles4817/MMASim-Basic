import { useMemo, useState } from 'react';
import {
  displayName,
  divisionsFor,
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
import { Card, Chip, Empty, ListItem, Segmented } from '../ui';
import { Icon, OverallRating, StreakBadge } from '../ui/signals';

/**
 * Divisional rankings.
 *
 * Two things were wrong with this screen and both were structural.
 *
 * **It ranked across every promotion at once**, which is not a thing that exists. Rankings
 * are a promotion's opinion of its own roster — a fighter is number three *in the AFC*, and
 * being number three there says nothing about somebody on a rival's books. Mixing them
 * produced a list where a regional prospect sat above a global contender because reputation
 * happened to line up, and a player could not see the only ladder they were actually on.
 * The promotion filter defaults to the player's own for exactly that reason.
 *
 * **It scored fighters with its own private formula**, a near-copy of the engine's, so the
 * screen and the career could and did disagree about who the number one contender was. It
 * now calls `rankDivision` — the same function the title-shot logic reads — which also
 * brings the things the copy had quietly dropped: retired fighters excluded, debutants not
 * ranked until they have actually fought, and the champion being the fighter who holds the
 * belt rather than whoever happens to sort first.
 *
 * A pound-for-pound view is kept, because "who is the best in the world regardless of who
 * signs their cheques" is a real question — it is just not the ranking that decides a player's
 * next fight, so it is not the default.
 */

/** The synthetic promotion filter for the cross-promotional view. */
const P4P = '__p4p__';

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
      // Pound-for-pound: no belt, no promotion, just everyone still competing in the
      // division sorted the same way. Deliberately not a rankDivision call, because that
      // function is about one promotion's ladder and this question is not.
      return all
        .filter((f) => f.divisionId === division.id && isActive(f, world.day) && f.record.length > 0)
        .map((fighter) => ({ fighter, position: 0, score: overallRating(fighter.attributes) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 15)
        .map((r, i) => ({ ...r, position: i + 1 }));
    }

    if (!promotion) return [];
    return rankDivision(
      all,
      division.id,
      promotion.id,
      world.day,
      promotion.champions[division.id],
    ).slice(0, 15);
  }, [all, division, promotion, promotionId, world.day]);

  const isP4P = promotionId === P4P;

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {/*
        Titled, so the h3s below it have an h2 to sit under.
        
        This card had no title, so it emitted no <h2> and the first headings on the page were
        these h3s — document order ran h1 → h3 → h2, with the h2 only arriving with the second
        card. The same violation the camp screen documents fixing; this was the last screen
        still doing it.
      */}
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
        </div>

        {/*
          What ordered the list, said out loud. Without this a player sees #6 at overall 88
          sitting below #3 at 79 and has no way to learn why — the explanation used to exist
          only as a code comment.
        */}
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
          {isP4P ? (
            <>
              Pound for pound is ordered on <strong>ability</strong>, ignoring promotion and
              belts entirely. It is a fun argument, not a ladder — nobody gets a title shot
              from it.
            </>
          ) : (
            <>
              Ranked on what <strong>{promotion?.shortName ?? 'the promotion'}</strong> believes
              — results, reputation and momentum — not on ability. The rating on the right is
              ability, and the two disagreeing is the point. Only fighters signed here appear.
            </>
          )}
        </p>
      </Card>

      <Card
        flush
        title={
          division
            ? `${division.name} · ${division.limitLbs} lb${isP4P ? ' · pound for pound' : ''}`
            : 'Rankings'
        }
      >
        {ranked.length === 0 ? (
          <Empty title="Nobody ranked here yet">
            {isP4P
              ? 'Nobody in this division has fought yet.'
              : `${promotion?.shortName ?? 'This promotion'} has nobody signed in this division who has fought yet.`}
          </Empty>
        ) : (
          <div className="list">
            {ranked.map((entry) => {
              const f = entry.fighter;
              const isChampion = !isP4P && entry.position === 0;
              const isPlayer = playerFighter?.id === f.id;

              return (
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
                        color: isChampion ? 'var(--accent)' : 'var(--text-faint)',
                      }}
                    >
                      {isChampion ? <Icon name="champion" /> : entry.position}
                      <span className="visually-hidden">
                        {isChampion ? 'Champion' : ` Ranked number ${entry.position}`}
                      </span>
                    </span>
                  }
                  primary={
                    <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <span>{displayName(f)}</span>
                      {/* Finding yourself in a list of fifteen should not require reading it. */}
                      {isPlayer && <Chip tone="accent">You</Chip>}
                    </span>
                  }
                  secondary={
                    <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <span>{recordString(f.summary)}</span>
                      {Math.abs(f.summary.streak) >= 2 && <StreakBadge streak={f.summary.streak} />}
                    </span>
                  }
                  trailing={
                    // The band word beside the number, not just the colour: a division has
                    // to read as a shape in greyscale too.
                    <OverallRating rating={overallRating(f.attributes)} />
                  }
                />
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
