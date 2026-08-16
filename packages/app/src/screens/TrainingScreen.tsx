import { useState } from 'react';
import {
  ATTRIBUTE_META,
  DANGEROUS_SEVERITY,
  appraiseDivisionMove,
  getDivision,
  overallRating,
  viableDivisions,
  TRAINING_FOCUSES,
  TRAINING_META,
  activeInjuries,
  campImpairment,
  describeInjury,
  fighterAge,
  headroom,
  type AttributeKey,
  type Coach,
  type DivisionId,
  type Gym,
  type TrainingFocus,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Segmented, Stat } from '../ui';
import {
  changeDivision,
  divisionField,
  joinGym,
  runLayoff,
  runTraining,
  type TrainingOutcome,
} from '../game/progression';
import { Alert, Trend } from '../ui/signals';

const WEEK_OPTIONS = [
  { value: '4', label: '4 weeks' },
  { value: '8', label: '8 weeks' },
  { value: '12', label: '12 weeks' },
] as const;

/**
 * Training between fights.
 *
 * The screen where a career is actually made. Two constraints are surfaced honestly rather
 * than hidden: focusing on two things is worse for both than focusing on one, and an area
 * already at its ceiling will not move however long you drill it.
 */
export function TrainingScreen() {
  const { db, world, playerFighter, commit } = useGame();
  const { navigate } = useRouter();
  const [focuses, setFocuses] = useState<TrainingFocus[]>(['striking']);
  const [weeks, setWeeks] = useState<'4' | '8' | '12'>('8');
  const [outcome, setOutcome] = useState<TrainingOutcome | undefined>();

  if (!playerFighter) {
    return (
      <Empty title="No career in progress">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Start a career
        </Button>
      </Empty>
    );
  }

  const fighter = playerFighter;
  const gym = fighter.gymId ? (db.gyms.findById(fighter.gymId) as Gym | undefined) : undefined;
  const coach = fighter.headCoachId
    ? (db.coaches.findById(fighter.headCoachId) as Coach | undefined)
    : undefined;

  const carrying = activeInjuries(fighter.injuries ?? [], world.day);
  const impairment = campImpairment(fighter.injuries ?? [], world.day);

  const toggleFocus = (focus: TrainingFocus) => {
    setOutcome(undefined);
    setFocuses((current) => {
      if (current.includes(focus)) {
        return current.length === 1 ? current : current.filter((f) => f !== focus);
      }
      // Two at most: a third would just make all three useless.
      return current.length >= 2 ? [current[1]!, focus] : [...current, focus];
    });
  };

  const train = () => {
    setOutcome(runTraining(db, fighter, focuses, Number(weeks)));
    commit();
  };

  const rest = () => {
    setOutcome(runLayoff(db, fighter, Number(weeks)));
    commit();
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <div className="stat-grid">
          <Stat value={fighterAge(fighter, world.day)} label="Age" />
          <Stat value={gym ? gym.quality : '—'} label="Gym quality" />
          <Stat value={coach ? coach.development : '—'} label="Coach" />
        </div>
        {coach ? (
          <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
            {coach.firstName} {coach.lastName} at {gym?.name}. Specialises in{' '}
            {coach.specialisms.join(', ')} — camps outside that get markedly less out of you.
          </p>
        ) : (
          <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
            You have no head coach. Training alone costs most of your progress.
          </p>
        )}
      </Card>

      {carrying.length > 0 && (
        <Alert
          tone={impairment < 0.6 ? 'danger' : 'warn'}
          title={carrying.length === 1 ? 'You are carrying an injury' : 'You are carrying injuries'}
        >
          {carrying.map((injury) => describeInjury(injury, world.day)).join(' ')} Training through
          it costs you roughly {Math.round((1 - impairment) * 100)}% of the camp.
        </Alert>
      )}

      <Card title="What to work on">
        <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
          Pick one focus, or two at a reduced rate. Areas already at your ceiling will not move
          — the bar on the right is how much room you have left.
        </p>

        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {TRAINING_FOCUSES.map((key) => {
            const meta = TRAINING_META[key];
            const selected = focuses.includes(key);
            const keys = Object.keys(meta.attributes) as AttributeKey[];
            const room =
              keys.reduce((a, k) => a + headroom(fighter.attributes[k], fighter.potential[k]), 0) /
              keys.length;
            const inSpecialism = coach?.specialisms.includes(meta.specialism) ?? false;

            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleFocus(key)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: 'var(--space-3)',
                  minHeight: 'var(--tap-target)',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                }}
              >
                <span
                  className="row"
                  style={{ justifyContent: 'space-between', gap: 'var(--space-2)' }}
                >
                  <span style={{ fontWeight: 700 }}>{meta.label}</span>
                  <span className="row" style={{ gap: 'var(--space-1)' }}>
                    {inSpecialism && <Chip tone="positive">Coach&rsquo;s specialism</Chip>}
                    <Chip tone={room > 0.35 ? 'info' : room > 0.12 ? 'warning' : 'neutral'}>
                      {room > 0.35 ? 'Lots of room' : room > 0.12 ? 'Some room' : 'Near ceiling'}
                    </Chip>
                  </span>
                </span>
                <span
                  className="muted"
                  style={{ display: 'block', fontSize: 'var(--text-sm)', marginTop: 2 }}
                >
                  {meta.blurb}
                </span>
                <span
                  className="faint"
                  style={{ display: 'block', fontSize: 'var(--text-xs)', marginTop: 2 }}
                >
                  Builds {keys.map((k) => ATTRIBUTE_META[k].label).join(', ')}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <h3 className="section-title">How long</h3>
          <Segmented
            label="Training block length"
            value={weeks}
            onChange={(v) => {
              setWeeks(v);
              setOutcome(undefined);
            }}
            options={WEEK_OPTIONS}
          />
          <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
            Longer blocks give more, with diminishing returns — and every week spent training
            is a week older.
          </p>
        </div>
      </Card>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={train}>
          Train for {weeks} weeks
        </Button>
        <Button onClick={rest}>Rest instead</Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'hub' })}>
          Back to career
        </Button>
      </div>

      {/*
        Live region, and below the action rather than above it. Tapping "Train" used to
        insert this card *above* the button, pushing the button down and often landing the
        result off-screen — the outcome of the screen's primary action, invisible and
        unannounced.
      */}
      {outcome && (
        <Card title="Camp report" role="status">
          {Object.keys(outcome.gains).length === 0 ? (
            <p className="muted">Nothing measurable changed.</p>
          ) : (
            <ul style={{ marginBottom: 'var(--space-3)' }}>
              {(Object.entries(outcome.gains) as [AttributeKey, number][])
                .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                .map(([key, delta]) => (
                  <li
                    key={key}
                    className="row"
                    style={{ justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}
                  >
                    <span>{ATTRIBUTE_META[key].label}</span>
                    {/* Trend rather than a hand-rolled coloured number: it carries a ▲/▼
                        glyph and a hidden "up"/"down", so the direction survives greyscale
                        and reaches a screen reader. It already existed and was unused. */}
                    <Trend delta={delta} />
                  </li>
                ))}
            </ul>
          )}
          {outcome.notes.map((note) => (
            <p key={note} className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
              {note}
            </p>
          ))}
        </Card>
      )}


      <DivisionPicker />

      <GymPicker currentGymId={fighter.gymId} onJoin={(g) => {
        joinGym(db, fighter, g);
        commit();
      }} />
    </div>
  );
}

/**
 * Changing gyms.
 *
 * Gated on reputation: the best rooms in the sport do not take unknowns, which is what makes
 * outgrowing your starting gym a milestone rather than a menu option.
 */
function GymPicker({
  currentGymId,
  onJoin,
}: {
  currentGymId?: string;
  onJoin(gym: Gym): void;
}) {
  const { db, playerFighter } = useGame();
  if (!playerFighter) return null;

  const gyms = (db.gyms.findAll() as Gym[]).slice().sort((a, b) => b.quality - a.quality);

  return (
    <Card title="Gyms">
      <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
        A better room means better coaching and better sparring. The best of them will not
        take you until you have done something.
      </p>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        {gyms.map((gym) => {
          const isCurrent = gym.id === currentGymId;
          // The bar is reputation-based, so this is a ladder you climb rather than a list.
          const required = Math.max(0, gym.prestige - 35);
          const canJoin = playerFighter.reputation >= required;
          const coach = gym.headCoachId ? (db.coaches.findById(gym.headCoachId) as { lastName: string } | undefined) : undefined;

          return (
            <div
              key={gym.id}
              className="row"
              style={{
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius)',
                border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                background: isCurrent ? 'var(--accent-soft)' : 'var(--surface)',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, display: 'block' }}>{gym.name}</span>
                <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                  {gym.city} · quality {gym.quality}
                  {coach && ` · ${coach.lastName}`}
                </span>
              </span>
              {isCurrent ? (
                <Chip tone="accent">Your gym</Chip>
              ) : canJoin ? (
                <Button size="sm" onClick={() => onJoin(gym)}>
                  Join
                </Button>
              ) : (
                <Chip tone="warning">Needs rep {required}</Chip>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Changing weight class.
 *
 * The one screen in the game where the "ratings are absolute" decision becomes visible to
 * the player: nothing about the fighter changes, and everything about the field does. So the
 * appraisal leads with the field gap rather than with the cut, because the cut is the part a
 * player will guess correctly and the field is the part they will not.
 */
function DivisionPicker() {
  const { db, world, playerFighter, commit } = useGame();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DivisionId | undefined>();

  if (!playerFighter) return null;
  const fighter = playerFighter;
  const options = viableDivisions(fighter).filter((d) => d.id !== fighter.divisionId);

  return (
    <Card title="Weight class">
      <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
        You currently fight at {getDivision(fighter.divisionId).name}, walking around at{' '}
        {fighter.walkingWeightLbs}lb. Your ratings do not change when you move — the people
        across from you do.
      </p>

      {!open ? (
        <Button onClick={() => setOpen(true)} disabled={options.length === 0}>
          {options.length === 0 ? 'No other division you could make' : 'Consider a move'}
        </Button>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {options.map((division) => {
            const appraisal = appraiseDivisionMove(
              fighter,
              division.id,
              divisionField(db, division.id, fighter.id as string),
              overallRating(fighter.attributes),
            );
            const selected = pending === division.id;

            return (
              <div
                key={division.id}
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                }}
              >
                <button
                  type="button"
                  aria-expanded={selected}
                  onClick={() => setPending(selected ? undefined : division.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left' }}
                >
                  <span className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                    <span style={{ fontWeight: 700 }}>
                      {division.name}{' '}
                      <span className="faint" style={{ fontWeight: 400 }}>
                        {division.limitLbs}lb
                      </span>
                    </span>
                    <span className="row" style={{ gap: 'var(--space-1)' }}>
                      <Chip tone={appraisal.direction === 'up' ? 'info' : 'neutral'}>
                        {appraisal.direction === 'up' ? '↑ Up' : '↓ Down'}
                        {appraisal.steps > 1 ? ` ×${appraisal.steps}` : ''}
                      </Chip>
                      <Chip
                        tone={
                          appraisal.fieldGap > 4
                            ? 'positive'
                            : appraisal.fieldGap < -4
                              ? 'negative'
                              : 'neutral'
                        }
                        title="How you compare to the fighters already in that division"
                      >
                        {appraisal.fieldGap > 0 ? '+' : ''}
                        {appraisal.fieldGap} vs field
                      </Chip>
                      {appraisal.severity >= DANGEROUS_SEVERITY && (
                        <Chip tone="warning" title="A cut this size is genuinely risky">
                          ⚠ Hard cut
                        </Chip>
                      )}
                    </span>
                  </span>
                </button>

                {selected && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    {appraisal.notes.map((note) => (
                      <p key={note} className="prose" style={{ fontSize: 'var(--text-sm)' }}>
                        {note}
                      </p>
                    ))}
                    <div className="row" style={{ flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                      <Button
                        variant="primary"
                        onClick={() => {
                          changeDivision(db, fighter, division.id);
                          commit();
                          setPending(undefined);
                          setOpen(false);
                        }}
                      >
                        Move to {division.shortName}
                      </Button>
                      <Button variant="ghost" onClick={() => setPending(undefined)}>
                        Not this one
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Stay where I am
          </Button>
        </div>
      )}
      <p className="faint prose" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>
        Day {world.day}. Your body takes months to catch up with the move — you gain or lose
        real weight over several camps, and that is a trade rather than an upgrade.
      </p>
    </Card>
  );
}
