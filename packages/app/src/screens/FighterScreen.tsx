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
  isPhysical,
  overallRating,
  activeInjuries,
  describeHeat,
  describeInjury,
  recordString,
  type Fighter,
  TRAUMA_CONCERN,
  TRAUMA_MEDICAL,
  WEAR_CONCERN,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Flag, RatingRow } from '../ui';
import { Alert, Fact, FighterRead, ICON, Icon, KeyStat, OverallRating } from '../ui/signals';
import { FightRecordList, RecordSummaryBar } from '../ui/FightRecord';
import { readMileage } from '../ui/mileage';
import { getLadderStatus } from '../game/progression';
import { rivalriesFor } from '../game/rivalries';
import { GROUP_LABELS } from '../game/labels';

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
  const mileage = readMileage(fighter, world.day);
  const gym = fighter.gymId ? db.gyms.findById(fighter.gymId) : undefined;
  const promotion = fighter.promotionId ? db.promotions.findById(fighter.promotionId) : undefined;

  // Grudges, hottest first. Cold pairings are filtered out by `rivalriesFor` — a list of
  // every fighter they ever met with heat 3 would be noise, not history.
  const rivalries = rivalriesFor(db, fighter.id, world.day);

  // Only the opponents this fighter actually faced, so the list can name and link them.
  const opponents = new Map(
    fighter.record
      .map((entry) => db.fighters.findById(entry.opponentId as string) as Fighter | undefined)
      .filter((f): f is Fighter => f !== undefined)
      .map((f) => [f.id as string, f]),
  );

  // Bouts that happened before this save began have no round-by-round detail to show.
  const priorBouts = fighter.priorRecord
    ? fighter.priorRecord.wins + fighter.priorRecord.losses + fighter.priorRecord.draws
    : 0;

  const ladder = getLadderStatus(db, fighter);

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <h2 style={{ fontSize: 'var(--text-2xl)', lineHeight: 1.15 }}>{displayName(fighter)}</h2>
        <p className="muted">
          {division.name} · {fighterAge(fighter, world.day)} ·{' '}
          <Flag nationality={fighter.nationality} /> · {fighter.stance}
        </p>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <KeyStat
            value={recordString(fighter.summary)}
            label="Professional record"
            tone={
              fighter.summary.streak > 0 ? 'good' : fighter.summary.streak < 0 ? 'bad' : 'neutral'
            }
          />
        </div>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <FighterRead attributes={fighter.attributes} />
        </div>

        <div style={{ marginTop: 'var(--space-3)' }}>
          <Fact
            label="Overall"
            value={<OverallRating rating={overallRating(fighter.attributes)} />}
          />
          <Fact
            label="Star power"
            value={Math.round(fighter.starPower)}
            icon="star"
            emphasis="tertiary"
            hint="What the market pays to watch them. Independent of ability."
          />
          <Fact
            label="Reputation"
            value={Math.round(fighter.reputation)}
            emphasis="tertiary"
            hint="What the sport thinks of them. Moves slowly, and drives the rankings."
          />
        </div>
        <div className="row" style={{ marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
          {ladder.isChampion && (
            <Chip tone="accent" title="Reigning divisional champion">
              <Icon name="champion" /> Champion
            </Chip>
          )}
          {!ladder.isChampion && ladder.position !== undefined && (
            <Chip tone="info" title="Divisional ranking">
              #{ladder.position} contender
            </Chip>
          )}
          {promotion && <Chip tone="info">{promotion.shortName}</Chip>}
          {gym && <Chip>{gym.name}</Chip>}
          <Chip>
            {Math.round(fighter.heightInches)}″ · {Math.round(fighter.reachInches)}″ reach
          </Chip>
        </div>
      </Card>

      <Card title="Record">
        <RecordSummaryBar summary={fighter.summary} />
      </Card>

      <Card title="Results" flush>
        <FightRecordList
          fighter={fighter}
          opponents={opponents}
          priorBouts={priorBouts}
          onOpponentClick={(id) => navigate({ name: 'fighter', id })}
        />
      </Card>

      {rivalries.length > 0 && (
        <Card title="Bad blood">
          <p
            className="muted prose"
            style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}
          >
            Heat is per-pair: how badly the audience wants to see <em>these two</em>, which is a
            different thing from how big either of them is. It pays, and it changes how the fight
            gets fought.
          </p>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {rivalries.map(({ rivalry, heat, otherId }) => {
              const other = db.fighters.findById(otherId as string) as Fighter | undefined;
              return (
                <div
                  key={rivalry.id as string}
                  className="row"
                  style={{
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: rivalry.isRivalry ? 'var(--negative-soft)' : 'var(--surface)',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <button
                      type="button"
                      className="record-row__link"
                      onClick={() => other && navigate({ name: 'fighter', id: other.id as string })}
                      style={{ fontWeight: 600, display: 'block', textAlign: 'left' }}
                    >
                      {other ? displayName(other) : 'A former opponent'}
                    </button>
                    <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      {describeHeat(rivalry, world.day)}
                    </span>
                  </span>
                  {/* A word, not a bare number. "Heat 42" is meaningless — 42 out of what?
                      This matches how RatingRow pairs 84 with "Elite". */}
                  <Chip tone={rivalry.isRivalry ? 'negative' : heat > 45 ? 'warning' : 'neutral'}>
                    {rivalry.isRivalry
                      ? `${ICON.streak} Grudge`
                      : heat > 45
                        ? `${ICON.streak} Real interest`
                        : 'Simmering'}
                  </Chip>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {fighter.traits.length > 0 && (
        <Card title="Traits">
          {/*
            One rendering, not two. This was a coloured chip row *and* a full list of the
            same labels with their blurbs directly beneath — the same information twice, and
            the chip's tooltip a third time for anyone with a mouse.

            The glyph carries the polarity so it survives greyscale, and a neutral trait gets
            a neutral mark rather than the orange one that read as a problem.
          */}
          <ul className="trait-list">
            {fighter.traits.map((id) => {
              const trait = TRAITS[id];
              return (
                <li key={id} className={`trait trait--${trait.polarity}`}>
                  <span className="trait__mark" aria-hidden="true">
                    {trait.polarity === 'positive'
                      ? '+'
                      : trait.polarity === 'negative'
                        ? '−'
                        : '='}
                  </span>
                  <span>
                    <strong className="trait__label">{trait.label}</strong>
                    <span className="visually-hidden">
                      {trait.polarity === 'positive'
                        ? ' (strength)'
                        : trait.polarity === 'negative'
                          ? ' (weakness)'
                          : ' (double-edged)'}
                    </span>
                    <span className="trait__blurb muted">{trait.blurb}</span>
                  </span>
                </li>
              );
            })}
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
              /*
               * Only the player's own ceilings are known — everyone else's are scouted, and a
               * scouting estimate does not belong on a permanent profile page — and only
               * *physicals* have a ceiling at all.
               *
               * A skill's `potential` is a projection, not a wall: `difficulty` never reads it,
               * and skills grow on `skillResistance`, which only ever gets smaller. Showing it as
               * a tick was not a rounding error but a wrong number. Measured over twenty world
               * years, 1,928 skill values sat above the ceiling this row was drawing, the worst a
               * fight IQ of 92 against a displayed ceiling of 27. See docs/27 §13.
               */
              ceiling={isPlayer && isPhysical(key) ? fighter.potential[key] : undefined}
              hint={ATTRIBUTE_META[key].blurb}
            />
          ))}
        </Card>
      ))}

      <Card title="Derived">
        <p className="faint" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
          Computed from the ratings above, never stored — which is why they can never contradict
          them.
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
        {/*
          What the career has cost, before any of the individual numbers below.
          
          Decline runs on this rather than on the birthday (docs/27 §12), so it is the first thing
          the card should say: two fighters the same age with different histories are not the same
          fighter, and until now nothing on any screen said so.
        */}
        <Fact
          label="Body age"
          value={mileage.body}
          emphasis={mileage.heavy ? 'primary' : 'secondary'}
          tone={mileage.heavy ? 'bad' : mileage.notable ? 'warn' : undefined}
          hint={mileage.because}
        />

        {fighter.condition.headTrauma >= TRAUMA_CONCERN && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <Alert
              tone={fighter.condition.headTrauma >= TRAUMA_MEDICAL ? 'danger' : 'warn'}
              title={
                fighter.condition.headTrauma >= TRAUMA_MEDICAL
                  ? 'The chin has gone'
                  : 'Damage is accumulating'
              }
            >
              Trauma only ever rises, and it permanently lowers what this fighter can absorb.
            </Alert>
          </div>
        )}
        <Fact
          label="Head trauma"
          value={`${Math.round(fighter.condition.headTrauma)} / 100`}
          icon="trauma"
          emphasis={fighter.condition.headTrauma >= TRAUMA_CONCERN ? 'primary' : 'secondary'}
          tone={
            fighter.condition.headTrauma >= TRAUMA_MEDICAL
              ? 'bad'
              : fighter.condition.headTrauma >= TRAUMA_CONCERN
                ? 'warn'
                : undefined
          }
        />
        <Fact
          label="Body wear"
          value={`${Math.round(fighter.condition.bodyWear)} / 100`}
          emphasis="tertiary"
          // Same bands as the hub, and the same ones `retirementDrivers` reads. This screen used
          // to show wear as a bare number while the hub coloured it, so the two disagreed about
          // whether the same fighter was worn out.
          tone={
            fighter.condition.bodyWear >= 55
              ? 'bad'
              : fighter.condition.bodyWear >= WEAR_CONCERN
                ? 'warn'
                : undefined
          }
        />
        <Fact
          label="Confidence"
          value={Math.round(fighter.condition.confidence)}
          emphasis="tertiary"
          tone={fighter.condition.confidence < 40 ? 'bad' : undefined}
        />
      </Card>

      {(fighter.injuries?.length ?? 0) > 0 && (
        <Card title="Medical history">
          {activeInjuries(fighter.injuries ?? [], world.day).length > 0 && (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <Alert tone="warn" title="Currently injured">
                {activeInjuries(fighter.injuries ?? [], world.day)
                  .map((i) => describeInjury(i, world.day))
                  .join(' ')}
              </Alert>
            </div>
          )}
          <ul>
            {[...(fighter.injuries ?? [])].reverse().map((injury) => (
              <li
                key={injury.id}
                className="muted"
                style={{ fontSize: 'var(--text-sm)', marginBottom: 4 }}
              >
                <Icon name="injury" /> {describeInjury(injury, world.day)}
                {injury.foughtThrough && ' Fought on it.'}
              </li>
            ))}
          </ul>
        </Card>
      )}

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
