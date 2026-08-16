import { useMemo, useState } from 'react';
import {
  ATTRIBUTES_BY_GROUP,
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_KEYS,
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
import { EDITOR_TYPES } from '../game/editorSchema';

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
        <p className="muted prose" style={{ marginBottom: 'var(--space-3)' }}>
          Edit anything in the world — fighters, promotions, gyms, coaches, referees, judges
          and the commentary booth. Changes take effect in the live world when you save them.
          The editor warns about combinations that do not add up; it never blocks them.
        </p>
        <label>
          <span className="visually-hidden">Search fighters to edit</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a fighter…"
            className="field"
          />
        </label>
      </Card>

      <Card flush title="Everything else in the world">
        <div className="list">
          {EDITOR_TYPES.map((type) => (
            <ListItem
              key={type.kind}
              onClick={() => navigate({ name: 'editorList', kind: type.kind })}
              primary={type.label}
              secondary={type.blurb}
              trailing={<span className="faint">Edit ›</span>}
            />
          ))}
        </div>
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
  // Derived, not a timer: a setTimeout with no cleanup fires after unmount, and the label
  // should revert the moment the player edits again anyway.
  const showSaved = saved && !dirty;

  // Only the attribute moves here. Raising the ceiling on every onChange ratchets it
  // permanently: dragging Power 60 -> 95 -> back to 60 would leave a hidden growth ceiling of
  // 95 that the player never intended to touch and cannot see. The invariant is enforced once,
  // at save time, where it is a correction rather than a side effect.
  const setAttribute = (key: AttributeKey, value: number) =>
    setDraft((d) => (d ? { ...d, attributes: { ...d.attributes, [key]: toRating(value) } } : d));

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
    // A ceiling below the current rating is not a creative choice, it is a value the rest of
    // the engine treats as impossible. Corrected here, once.
    const potential = { ...draft.potential };
    for (const key of ATTRIBUTE_KEYS) {
      potential[key] = Math.max(potential[key], draft.attributes[key]);
    }
    const corrected = { ...draft, potential };
    db.fighters.upsert(corrected);
    setDraft(corrected);
    commit();
    setSaved(true);
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
          <label style={{ flex: '1 1 14rem' }}>
            <span className="section-title">Division</span>
            <select
              value={draft.divisionId as string}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, divisionId: e.target.value as never } : d))
              }
              className="field"
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
              inputMode="numeric"
              min={95}
              max={400}
              value={draft.walkingWeightLbs}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next)) return;
                // Bounded: an unvalidated field trivially produces a 0lb fighter, and the
                // cut-severity maths has no defence against that.
                setDraft((d) =>
                  d ? { ...d, walkingWeightLbs: Math.min(400, Math.max(95, next)) } : d,
                );
              }}
              className="field"
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
        {/* Deliberately not disabled on save: disabling the control the user just activated
            destroys focus and dumps a keyboard user back to the top of the document. */}
        <Button variant="primary" block onClick={save}>
          {showSaved ? 'Saved' : 'Save changes'}
        </Button>
        <Button variant="secondary" onClick={() => setDraft(original)} disabled={!dirty}>
          Revert
        </Button>
      </div>
    </div>
  );
}

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
  const [typed, setTyped] = useState<string | undefined>();
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
        {/*
          The field holds a raw string while focused. Coercing on every keystroke makes it
          unusable: backspacing "60" to type "45" passes through '' → 0 → clamped to 1, and
          the next keypress produces "145" → 100. This control is billed as the only way to
          set an exact value, so it has to actually permit one.
        */}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          value={typed ?? value}
          aria-label={`${label} value`}
          onChange={(e) => {
            setTyped(e.target.value);
            if (e.target.value !== '') onChange(Number(e.target.value));
          }}
          onBlur={() => setTyped(undefined)}
          className="numeric"
          style={{
            width: '4.5rem',
            minHeight: 'var(--tap-target)',
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
