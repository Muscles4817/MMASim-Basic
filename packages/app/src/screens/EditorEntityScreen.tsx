import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Empty } from '../ui';
import { Alert } from '../ui/signals';
import {
  editorTypeFor,
  readField,
  repositoryFor,
  writeField,
  type EditorEntityKind,
  type EditorField,
  type EditorTypeMeta,
  type NumberField,
} from '../game/editorSchema';

/**
 * The list of one editable type.
 *
 * Fighters keep their own bespoke screen — fifteen attributes, hidden potential, personality
 * and traits do not fit a generic form and should not be squeezed into one. Everything else
 * is driven from `editorSchema.ts`.
 */
export function EditorListScreen({ kind }: { kind: EditorEntityKind }) {
  const { db } = useGame();
  const { navigate } = useRouter();
  const meta = editorTypeFor(kind);
  const repo = repositoryFor(db, kind);

  if (!meta || !repo) {
    return (
      <Empty title="Nothing to edit here">
        <Button variant="primary" onClick={() => navigate({ name: 'editor' })}>
          Back to the editor
        </Button>
      </Empty>
    );
  }

  const entities = repo.findAll();

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card>
        <p className="muted prose">{meta.blurb}</p>
      </Card>

      <Card flush title={`${entities.length} ${meta.label.toLowerCase()}`}>
        <div className="list">
          {entities.map((entity) => {
            const warnings = meta.warnings?.(entity) ?? [];
            return (
              <button
                key={String(entity.id)}
                type="button"
                className="list__item"
                // Named explicitly. Without this the accessible name is a run-on of the
                // primary line, the secondary line and the warning count, which is what a
                // screen reader would read out for every row in a list of sixty.
                aria-label={`Edit ${meta.primary(entity)}`}
                onClick={() =>
                  navigate({ name: 'editorEntity', kind, id: String(entity.id) })
                }
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="list__primary" style={{ display: 'block' }}>
                    {meta.primary(entity)}
                  </span>
                  <span className="list__secondary" style={{ display: 'block' }}>
                    {meta.secondary(entity)}
                  </span>
                </span>
                {/* A warning marker on the row, so an incoherent entity is findable without
                    opening every one of them in turn. */}
                {warnings.length > 0 && (
                  <span
                    className="editor-warning-dot"
                    title={warnings.join(' ')}
                    aria-label={`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}
                  >
                    &#9888;
                  </span>
                )}
                <span className="faint" aria-hidden="true">
                  Edit &rsaquo;
                </span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/**
 * Editing one entity.
 *
 * Draft state is local and only written on Save, which is the same rule the fighter editor
 * settled on after the ceiling-ratchet bug: live-writing a slider means every intermediate
 * value on the way to the one you wanted also happened.
 */
export function EditorEntityScreen({ kind, id }: { kind: EditorEntityKind; id: string }) {
  const { db, commit } = useGame();
  const { navigate, back } = useRouter();
  const meta = editorTypeFor(kind);
  const repo = repositoryFor(db, kind);

  const original = useMemo(() => repo?.findById(id), [repo, id]);
  const [draft, setDraft] = useState<Record<string, unknown> | undefined>(original);
  const [saved, setSaved] = useState(false);

  if (!meta || !repo || !draft) {
    return (
      <Empty title="Not found">
        <Button variant="primary" onClick={() => navigate({ name: 'editor' })}>
          Back to the editor
        </Button>
      </Empty>
    );
  }

  const warnings = meta.warnings?.(draft) ?? [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  const update = (field: EditorField, value: string | number) => {
    setSaved(false);
    setDraft((current) => (current ? writeField(current, field, value) : current));
  };

  const save = () => {
    repo.upsert(draft);
    commit();
    setSaved(true);
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {warnings.length > 0 && (
        <Alert tone="warn" title="This does not quite add up">
          {/* Warn, never block. Deliberately incoherent people and organisations exist, and
              the player is entitled to build them. */}
          {warnings.join(' ')} That is allowed — it will just behave the way it reads.
        </Alert>
      )}

      {saved && (
        <Alert tone="good" title="Saved">
          The change is live in the world from now on.
        </Alert>
      )}

      <Card title={meta.primary(draft) || `Untitled ${meta.singular}`}>
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          {meta.fields.map((field) => (
            <EditorControl
              key={field.key}
              field={field}
              value={readField(draft, field)}
              onChange={(v) => update(field, v)}
            />
          ))}
        </div>
      </Card>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {/*
          aria-disabled rather than disabled, on both. A real `disabled` on the button the
          user just pressed removes it from the tab order mid-interaction and throws focus
          back to the document — so a keyboard user saves, loses their place, and gets no
          confirmation because the "Saved" Alert is not where focus went. The sibling
          fighter editor already refused to do this; the two screens disagreed.
        */}
        <Button variant="primary" onClick={() => dirty && save()} aria-disabled={!dirty}>
          {dirty ? 'Save changes' : 'Saved'}
        </Button>
        <Button
          onClick={() => {
            if (!dirty) return;
            setDraft(original);
            setSaved(false);
          }}
          aria-disabled={!dirty}
        >
          Revert
        </Button>
        <Button variant="ghost" onClick={back}>
          Back
        </Button>
      </div>
    </div>
  );
}

function EditorControl({
  field,
  value,
  onChange,
}: {
  field: EditorField;
  value: string | number;
  onChange(value: string | number): void;
}) {
  const helpId = field.help ? `help-${field.key}` : undefined;

  if (field.kind === 'text') {
    return (
      <div>
        <label htmlFor={`f-${field.key}`} className="section-title">
          {field.label}
        </label>
        <input
          id={`f-${field.key}`}
          type="text"
          className="field"
          value={String(value)}
          aria-describedby={helpId}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.help && (
          <p id={helpId} className="faint" style={{ fontSize: 'var(--text-sm)', marginTop: 2 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  }

  if (field.kind === 'choice') {
    return (
      <div>
        <label htmlFor={`f-${field.key}`} className="section-title">
          {field.label}
        </label>
        <select
          id={`f-${field.key}`}
          className="field"
          value={String(value)}
          aria-describedby={helpId}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {field.help && (
          <p id={helpId} className="faint" style={{ fontSize: 'var(--text-sm)', marginTop: 2 }}>
            {field.help}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <label htmlFor={`f-${field.key}`} className="section-title">
          {field.label}
        </label>
        <span className="numeric" style={{ fontWeight: 700 }}>
          {Number(value)}
        </span>
      </div>
      <div className="row" style={{ gap: 'var(--space-3)' }}>
        <input
          id={`f-${field.key}`}
          type="range"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={Number(value)}
          aria-describedby={helpId}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        {/*
          A number input beside the slider, not instead of it. A range alone cannot be set
          precisely on a phone and cannot be typed into at all — and the editor is exactly
          where somebody wants to type 87 rather than nudge toward it.
        */}
        <ExactNumberInput field={field} value={Number(value)} onChange={onChange} />
      </div>
      {field.help && (
        <p id={helpId} className="faint" style={{ fontSize: 'var(--text-sm)', marginTop: 2 }}>
          {field.help}
        </p>
      )}
    </div>
  );
}

/**
 * The type-a-number box.
 *
 * Holds its own text while the field is being edited, which is not gold-plating — a purely
 * controlled numeric input cannot be cleared, because emptying it parses as 0, clamps to the
 * minimum, and immediately writes the minimum back into the box. The result is that typing a
 * new value is impossible: you get the old digits with the new ones appended. A negative
 * number is worse still, since a lone "-" is not a number and gets eaten before the digits
 * arrive. Both of those were found by the editor's own UI tests.
 *
 * So: intermediate text is allowed to be unparseable, and only a genuine number is committed.
 */
function ExactNumberInput({
  field,
  value,
  onChange,
}: {
  field: NumberField;
  value: number;
  onChange(value: number): void;
}) {
  const [text, setText] = useState(String(value));

  // Re-sync when the value moves for any reason other than this box — the slider beside it,
  // or Revert. Typing sets both, so this does not fight the user.
  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  return (
    <input
      type="number"
      className="field"
      min={field.min}
      max={field.max}
      step={field.step ?? 1}
      value={text}
      inputMode={field.min < 0 ? 'text' : 'numeric'}
      aria-label={`${field.label}, exact value`}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        // "" and "-" are legitimate things to have on the way to a number, and neither is one.
        if (raw === '' || raw === '-') return;
        const next = Number(raw);
        if (!Number.isFinite(next)) return;
        onChange(Math.min(field.max, Math.max(field.min, next)));
      }}
      onBlur={() => setText(String(value))}
      style={{ width: '5.5rem', flex: 'none' }}
    />
  );
}

export const editorTypeLabel = (kind: EditorEntityKind): string =>
  (editorTypeFor(kind) as EditorTypeMeta | undefined)?.label ?? 'Editor';
