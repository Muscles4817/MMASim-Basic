import {
  ATTRIBUTES_BY_GROUP,
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_META,
  DERIVED_META,
  TRAITS,
  deriveRatings,
  displayName,
  fighterAge,
  getDivision,
  overallRating,
  recordString,
  type AttributeGroup,
  type Fighter,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, RatingRow, Stat } from '../ui';

const GROUP_LABELS: Record<AttributeGroup, string> = {
  physical: 'Physical',
  striking: 'Striking',
  grappling: 'Grappling',
  mental: 'Mental',
};

/**
 * Fighter profile.
 *
 * Shows the fifteen visible attributes and nothing hidden. Potential appears only as a tick
 * on the bar, and only for the player's own fighter — a scouted estimate of someone else's
 * ceiling belongs in a scouting report, not on their profile.
 */
export function FighterScreen({ id }: { id: string }) {
  const { db, world, playerFighter } = useGame();
  const { navigate } = useRouter();
  const fighter = db.fighters.findById(id) as Fighter | undefined;

  if (!fighter) {
    return (
      <Empty title="Fighter not found">
        <Button variant="primary" onClick={() => navigate({ name: 'roster' })}>
          Back to roster
        </Button>
      </Empty>
    );
  }

  const isPlayer = playerFighter?.id === fighter.id;
  const division = getDivision(fighter.divisionId);
  const derived = deriveRatings(fighter.attributes);
  const gym = fighter.gymId ? db.gyms.findById(fighter.gymId) : undefined;
  const promotion = fighter.promotionId ? db.promotions.findById(fighter.promotionId) : undefined;

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <h2 style={{ fontSize: 'var(--text-2xl)', lineHeight: 1.15 }}>{displayName(fighter)}</h2>
        <p className="muted">
          {division.name} · {fighterAge(fighter, world.day)} · {fighter.nationality} ·{' '}
          {fighter.stance}
        </p>
        <div className="stat-grid" style={{ marginTop: 'var(--space-4)' }}>
          <Stat value={recordString(fighter.summary)} label="Record" />
          <Stat value={Math.round(overallRating(fighter.attributes))} label="Overall" />
          <Stat value={`★ ${Math.round(fighter.starPower)}`} label="Star power" />
          <Stat value={Math.round(fighter.reputation)} label="Reputation" />
        </div>
        <div className="row" style={{ marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
          {promotion && <Chip tone="info">{promotion.shortName}</Chip>}
          {gym && <Chip>{gym.name}</Chip>}
          <Chip>{Math.round(fighter.heightInches)}″ · {Math.round(fighter.reachInches)}″ reach</Chip>
        </div>
      </Card>

      {fighter.traits.length > 0 && (
        <Card title="Traits">
          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {fighter.traits.map((id) => {
              const trait = TRAITS[id];
              return (
                <Chip
                  key={id}
                  tone={
                    trait.polarity === 'positive'
                      ? 'positive'
                      : trait.polarity === 'negative'
                        ? 'negative'
                        : 'warning'
                  }
                  title={trait.blurb}
                >
                  {trait.label}
                </Chip>
              );
            })}
          </div>
          <ul style={{ marginTop: 'var(--space-3)' }}>
            {fighter.traits.map((id) => (
              <li key={id} className="muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 4 }}>
                <strong>{TRAITS[id].label}:</strong> {TRAITS[id].blurb}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {ATTRIBUTE_GROUPS.map((group) => (
        <Card key={group} title={GROUP_LABELS[group]}>
          {ATTRIBUTES_BY_GROUP[group].map((key) => (
            <RatingRow
              key={key}
              label={ATTRIBUTE_META[key].label}
              value={fighter.attributes[key]}
              // Only the player's own ceilings are known. Everyone else's are scouted, and
              // a scouting estimate does not belong on a permanent profile page.
              ceiling={isPlayer ? fighter.potential[key] : undefined}
              hint={ATTRIBUTE_META[key].blurb}
            />
          ))}
        </Card>
      ))}

      <Card title="Derived">
        <p className="faint" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
          Computed from the ratings above, never stored — which is why they can never
          contradict them.
        </p>
        {Object.values(DERIVED_META).map((meta) => (
          <RatingRow
            key={meta.key}
            label={meta.label}
            value={derived[meta.key]}
            hint={meta.blurb}
          />
        ))}
      </Card>

      <Card title="Condition">
        <div className="stat-grid">
          <Stat
            value={Math.round(fighter.condition.headTrauma)}
            label="Head trauma"
            tone={fighter.condition.headTrauma > 50 ? 'negative' : undefined}
          />
          <Stat value={Math.round(fighter.condition.bodyWear)} label="Body wear" />
          <Stat
            value={Math.round(fighter.condition.confidence)}
            label="Confidence"
            tone={fighter.condition.confidence < 40 ? 'negative' : undefined}
          />
        </div>
        <p className="faint" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
          Head trauma only ever goes up. It permanently erodes the chin.
        </p>
      </Card>

      {fighter.notes && (
        <Card title="Rating notes">
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            {fighter.notes}
          </p>
        </Card>
      )}
    </div>
  );
}
