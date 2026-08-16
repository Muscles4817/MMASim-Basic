import { useMemo, useState } from 'react';
import {
  ATTRIBUTES_BY_GROUP,
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_META,
  ALL_TRAITS,
  DIVISIONS,
  PERSONALITY_AXES,
  PERSONALITY_META,
  displayName,
  findTraitConflicts,
  getDivision,
  overallRating,
  ratingBand,
  toRating,
  type AttributeKey,
  type Fighter,
  type PersonalityAxis,
  type TraitId,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { bandColour, Button, Card, Chip, Empty, ListItem } from '../ui';

/**
 * The editor.
 *
 * Not a separate app: it operates on the same repositories as the game, so there is exactly
 * one definition of a valid fighter and no chance of the editor producing something the sim
 * cannot run. It *warns* rather than blocks on incoherent combinations, because deliberately
 * incoherent people exist and the player is allowed to make them.
 */
export function EditorScreen() {
  const { db } = useGame();
  const { navigate } = useRouter();
  const [search, setSearch] = useState('');

  const fighters = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (db.fighters.findAll() as Fighter[])
      .filter(
        (f) =>
          !term || `${f.firstName} ${f.lastName} ${f.nickname ?? ''}`.toLowerCase().includes(term),
      )
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  }, [db, search]);

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card>
        <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>
          Edit any fighter's ratings, hidden potential, personality and traits. Changes save
          immediately and affect the live world.
        </p>
        <label>
          <span className="visually-hidden">Search fighters to edit</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a fighter…"
            style={{
              width: '100%',
              minHeight: 'var(--tap-target)',
              padding: '0 var(--space-3)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-strong)',
              background: 'var(--surface)',
            }}
          />
        </label>
      </Card>

      <Card flush title={`${fighters.length} fighters`}>
        <div className="list">
          {fighters.map((f) => (
            <ListItem
              key={f.id}
              onClick={() => navigate({ name: 'editorFighter', id: f.id as string })}
              primary={displayName(f)}
              secondary={`${getDivision(f.divisionId).shortName} · overall ${Math.round(overallRating(f.attributes))}`}
              trailing={<span className="faint">Edit ›</span>}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function EditorFighterScreen({ id }: { id: string }) {
  const { db, commit } = useGame();
  const { navigate } = useRouter();
  const original = db.fighters.findById(id) as Fighter | undefined;
  const [draft, setDraft] = useState<Fighter | undefined>(original);
  const [saved, setSaved] = useState(false);

  if (!original || !draft) {
    return (
      <Empty title="Fighter not found">
        <Button variant="primary" onClick={() => navigate({ name: 'editor' })}>
          Back to editor
        </Button>
      </Empty>
    );
  }

  const conflicts = findTraitConflicts(draft.traits);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  const setAttribute = (key: AttributeKey, value: number) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            attributes: { ...d.attributes, [key]: toRating(value) },
            // A ceiling below the current rating is nonsense, so raise it with the rating
            // rather than letting the editor produce an impossible fighter.
            potential: {
              ...d.potential,
              [key]: Math.max(d.potential[key], toRating(value)),
            },
          }
        : d,
    );

  const setPotential = (key: AttributeKey, value: number) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            potential: { ...d.potential, [key]: toRating(Math.max(value, d.attributes[key])) },
          }
        : d,
    );

  const setAxis = (axis: PersonalityAxis, value: number) =>
    setDraft((d) =>
      d ? { ...d, personality: { ...d.personality, [axis]: toRating(value) } } : d,
    );

  const toggleTrait = (trait: TraitId) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            traits: d.traits.includes(trait)
              ? d.traits.filter((t) => t !== trait)
              : [...d.traits, trait],
          }
        : d,
    );

  const save = () => {
    db.fighters.upsert(draft);
    commit();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <h2 style={{ fontSize: 'var(--text-xl)' }}>{displayName(draft)}</h2>
        <p className="muted">
          {getDivision(draft.divisionId).name} · overall{' '}
          {Math.round(overallRating(draft.attributes))}
        </p>
        <div className="row" style={{ marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 12rem' }}>
            <span className="section-title">Division</span>
            <select
              value={draft.divisionId as string}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, divisionId: e.target.value as never } : d))
              }
              style={fieldStyle}
            >
              {DIVISIONS.filter((x) => x.sex === draft.sex).map((division) => (
                <option key={division.id} value={division.id as string}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: '1 1 8rem' }}>
            <span className="section-title">Walking weight (lb)</span>
            <input
              type="number"
              value={draft.walkingWeightLbs}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, walkingWeightLbs: Number(e.target.value) } : d))
              }
              style={fieldStyle}
            />
          </label>
        </div>
        <p className="faint" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
          Ratings are absolute. Changing division changes no numbers — it changes who they
          fight and how hard the cut is.
        </p>
      </Card>

      {conflicts.length > 0 && (
        <Card>
          <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-2)' }}>
            <Chip tone="warning">Warning</Chip>
            <div>
              <p style={{ fontWeight: 600 }}>Contradictory traits</p>
              <ul className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                {conflicts.map(([a, b]) => (
                  <li key={`${a}-${b}`}>
                    {ALL_TRAITS.find((t) => t.id === a)?.label} vs{' '}
                    {ALL_TRAITS.find((t) => t.id === b)?.label}
                  </li>
                ))}
              </ul>
              <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>
                Allowed, but the two will fight each other in the simulation.
              </p>
            </div>
          </div>
        </Card>
      )}

      {ATTRIBUTE_GROUPS.map((group) => (
        <Card key={group} title={group}>
          {ATTRIBUTES_BY_GROUP[group].map((key) => (
            <EditorSlider
              key={key}
              label={ATTRIBUTE_META[key].label}
              hint={ATTRIBUTE_META[key].blurb}
              value={draft.attributes[key]}
              ceiling={draft.potential[key]}
              onChange={(v) => setAttribute(key, v)}
              onCeilingChange={(v) => setPotential(key, v)}
            />
          ))}
        </Card>
      ))}

      <Card title="Personality (hidden in game)">
        {PERSONALITY_AXES.map((axis) => (
          <EditorSlider
            key={axis}
            label={PERSONALITY_META[axis].label}
            hint={`${PERSONALITY_META[axis].low} → ${PERSONALITY_META[axis].high}`}
            value={draft.personality[axis]}
            onChange={(v) => setAxis(axis, v)}
          />
        ))}
      </Card>

      <Card title="Traits">
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {ALL_TRAITS.map((trait) => {
            const active = draft.traits.includes(trait.id);
            return (
              <button
                key={trait.id}
                type="button"
                aria-pressed={active}
                title={trait.blurb}
                onClick={() => toggleTrait(trait.id)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  minHeight: '2.25rem',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent-soft)' : 'var(--surface)',
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {trait.label}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <Button variant="primary" block onClick={save} disabled={!dirty}>
          {saved ? 'Saved' : dirty ? 'Save changes' : 'No changes'}
        </Button>
        <Button variant="secondary" onClick={() => setDraft(original)} disabled={!dirty}>
          Revert
        </Button>
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 'var(--tap-target)',
  padding: '0 var(--space-3)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border-strong)',
  background: 'var(--surface)',
};

/**
 * A slider with a number field beside it.
 *
 * Both, deliberately: the slider is the fast way to explore a value on a touchscreen, and
 * the number field is the only way to set an exact one. Editors that offer only a slider
 * are unusable for precise work; ones that offer only a field are miserable on a phone.
 */
function EditorSlider({
  label,
  hint,
  value,
  ceiling,
  onChange,
  onCeilingChange,
}: {
  label: string;
  hint?: string;
  value: number;
  ceiling?: number;
  onChange(value: number): void;
  onCeilingChange?(value: number): void;
}) {
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }} title={hint}>
          {label}
        </span>
        <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
          {ratingBand(value).label}
        </span>
      </div>
      <div className="row">
        <input
          type="range"
          min={1}
          max={100}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: bandColour(value) }}
        />
        <input
          type="number"
          min={1}
          max={100}
          value={value}
          aria-label={`${label} value`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="numeric"
          style={{
            width: '4rem',
            minHeight: '2.25rem',
            textAlign: 'center',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-strong)',
            background: 'var(--surface)',
          }}
        />
      </div>
      {onCeilingChange && ceiling !== undefined && (
        <div className="row" style={{ marginTop: 4 }}>
          <span className="faint" style={{ fontSize: 'var(--text-xs)', flex: '0 0 4.5rem' }}>
            Ceiling
          </span>
          <input
            type="range"
            min={1}
            max={100}
            value={ceiling}
            aria-label={`${label} potential ceiling`}
            onChange={(e) => onCeilingChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--text-faint)' }}
          />
          <span className="numeric faint" style={{ width: '4rem', textAlign: 'center' }}>
            {ceiling}
          </span>
        </div>
      )}
    </div>
  );
}
