import { useMemo, useState } from 'react';
import {
  APPROACHES,
  APPROACH_META,
  MAX_PREPPED_READS,
  campQuality as computeCampQuality,
  createRng,
  deriveTendencies,
  displayName,
  drillQuality as computeDrillQuality,
  footageAvailable,
  getDivision,
  normaliseTargeting,
  recordString,
  scoutOpponent,
  type Approach,
  type Coach,
  type Fighter,
  type Gym,
  type ReadKey,
  type StrikeTarget,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty } from '../ui';
import { getBooking, runBookedFight, saveBookingPlan } from '../game/career';
import { formatGameDay } from '../shell/Shell';

/**
 * Fight camp — the screen where preparation happens.
 *
 * The design problem here is that the player must make a *committed* choice under genuine
 * uncertainty. So the scouting report shows an estimate and a confidence, never a truth,
 * and the four-read limit is presented as a budget being spent rather than a list with
 * checkboxes. Drilling a fifth thing is not disallowed by a disabled control — it is
 * visibly making the other four worse.
 */
export function CampScreen() {
  const { db, world, playerFighter, commit } = useGame();
  const { navigate } = useRouter();
  const [booking] = useState(() => getBooking());
  const [running, setRunning] = useState(false);

  const opponent = booking
    ? (db.fighters.findById(booking.opponentId) as Fighter | undefined)
    : undefined;

  const coach = playerFighter?.headCoachId
    ? (db.coaches.findById(playerFighter.headCoachId) as Coach | undefined)
    : undefined;
  const gym = playerFighter?.gymId ? (db.gyms.findById(playerFighter.gymId) as Gym | undefined) : undefined;

  const weeks = booking ? Math.max(1, Math.round((booking.bout.day - booking.campStartDay) / 7)) : 8;

  const report = useMemo(() => {
    if (!opponent) return undefined;
    const truth = deriveTendencies(opponent);
    const footage = footageAvailable(
      opponent.summary.wins + opponent.summary.losses,
      opponent.record.length,
    );
    // Seeded on the bout, so the report is stable: re-reading it must not reroll the
    // opponent's tendencies, or the player is just rerolling until they like the answer.
    const rng = createRng(`${world.seed}:scout:${booking?.bout.id ?? 'none'}`);
    return scoutOpponent(truth, coach?.scouting ?? 45, footage, rng);
  }, [opponent, coach, world.seed, booking?.bout.id]);

  const [approach, setApproach] = useState<Approach>(booking?.plan.approach ?? 'pressure');
  const [targeting, setTargeting] = useState<Record<StrikeTarget, number>>(
    booking?.plan.targeting ?? { head: 0.6, body: 0.25, legs: 0.15 },
  );
  const [selected, setSelected] = useState<ReadKey[]>(
    booking?.plan.preppedReads.map((r) => r.read) ?? [],
  );

  if (!booking || !opponent || !playerFighter) {
    return (
      <Empty title="No fight booked">
        <Button variant="primary" onClick={() => navigate({ name: 'hub' })}>
          Back to career
        </Button>
      </Empty>
    );
  }

  const camp = computeCampQuality(
    weeks,
    gym?.quality ?? 45,
    coach?.development ?? 45,
    playerFighter.personality.discipline,
  );
  const drill = computeDrillQuality(camp, selected.length, coach?.gamePlanning ?? 45);

  const toggleRead = (read: ReadKey) => {
    setSelected((current) =>
      current.includes(read)
        ? current.filter((r) => r !== read)
        : current.length >= MAX_PREPPED_READS
          ? current
          : [...current, read],
    );
  };

  const startFight = () => {
    setRunning(true);
    const plan = {
      approach,
      targeting: normaliseTargeting(targeting),
      riskLevel: 0.5,
      campQuality: camp,
      preppedReads: selected.map((read) => {
        const scouted = report?.reads.find((r) => r.read === read);
        return { read, drillQuality: drill, confidence: scouted?.confidence ?? 0.5 };
      }),
    };
    const updated = saveBookingPlan(booking, plan);
    const outcome = runBookedFight(db, updated);
    commit();
    navigate({ name: 'fight', boutId: outcome.result.boutId });
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        <p className="section-title">Fight week</p>
        <h2 style={{ fontSize: 'var(--text-xl)' }}>vs {displayName(opponent)}</h2>
        <p className="muted">
          {formatGameDay(booking.bout.day)} · {getDivision(opponent.divisionId).shortName} ·{' '}
          {recordString(opponent.summary)}
        </p>
        <div className="row" style={{ marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Chip tone={camp >= 0.7 ? 'positive' : camp >= 0.45 ? 'warning' : 'negative'}>
            {weeks}-week camp · {camp >= 0.7 ? 'Strong' : camp >= 0.45 ? 'Adequate' : 'Compromised'}
          </Chip>
          {coach ? (
            <Chip tone="info">
              Coach: {coach.lastName} · scouting {coach.scouting}
            </Chip>
          ) : (
            <Chip tone="warning">No head coach — scouting is guesswork</Chip>
          )}
        </div>
      </Card>

      <Card title="Scouting report">
        <p style={{ marginBottom: 'var(--space-4)', fontStyle: 'italic' }}>“{report?.summary}”</p>
        <p className="muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
          Pick up to {MAX_PREPPED_READS} things to drill. Each one you add spreads the camp
          thinner — and a read your coach got wrong is camp time spent on a fight that never
          happens.
        </p>

        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {report?.reads.slice(0, 8).map((r) => {
            const isSelected = selected.includes(r.read);
            const atLimit = !isSelected && selected.length >= MAX_PREPPED_READS;
            return (
              <button
                key={r.read}
                type="button"
                onClick={() => toggleRead(r.read)}
                disabled={atLimit}
                aria-pressed={isSelected}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: 'var(--space-3)',
                  minHeight: 'var(--tap-target)',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  background: isSelected ? 'var(--accent-soft)' : 'var(--surface)',
                  opacity: atLimit ? 0.45 : 1,
                }}
              >
                <span className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                  <span style={{ fontWeight: 600 }}>{r.threat}</span>
                  <ConfidenceChip estimate={r.estimate} confidence={r.confidence} />
                </span>
                <span
                  className="muted"
                  style={{ display: 'block', fontSize: 'var(--text-sm)', marginTop: 2 }}
                >
                  Drill: {r.counter}
                </span>
              </button>
            );
          })}
        </div>

        <p className="faint" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
          {selected.length} of {MAX_PREPPED_READS} drilled · each answer is{' '}
          <strong>{Math.round(drill * 100)}%</strong> sharp
          {selected.length > 2 && ' — adding more is costing you sharpness on the rest'}
        </p>
      </Card>

      <Card title="Game plan">
        <div className="stack">
          <div>
            <p className="section-title">Approach</p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
                gap: 'var(--space-2)',
              }}
            >
              {APPROACHES.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={approach === key}
                  onClick={() => setApproach(key)}
                  style={{
                    padding: 'var(--space-3)',
                    minHeight: 'var(--tap-target)',
                    textAlign: 'left',
                    borderRadius: 'var(--radius)',
                    border: `1px solid ${approach === key ? 'var(--accent)' : 'var(--border)'}`,
                    background: approach === key ? 'var(--accent-soft)' : 'var(--surface)',
                  }}
                >
                  <span style={{ fontWeight: 700, display: 'block' }}>{APPROACH_META[key].label}</span>
                  <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                    {APPROACH_META[key].blurb}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="section-title">Where to attack</p>
            {(['head', 'body', 'legs'] as const).map((target) => (
              <label key={target} style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ textTransform: 'capitalize' }}>{target}</span>
                  <span className="numeric muted">
                    {Math.round(
                      (targeting[target] / (targeting.head + targeting.body + targeting.legs)) * 100,
                    )}
                    %
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(targeting[target] * 100)}
                  onChange={(e) =>
                    setTargeting((t) => ({ ...t, [target]: Number(e.target.value) / 100 }))
                  }
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </label>
            ))}
            <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>
              Legs cut mobility and takedown defence. Body drains the tank and stops them
              recovering between rounds. Head ends fights.
            </p>
          </div>
        </div>
      </Card>

      <Button variant="primary" block onClick={startFight} disabled={running}>
        {running ? 'Fight in progress…' : 'Fight'}
      </Button>
    </div>
  );
}

/**
 * How the report presents a read.
 *
 * Two dimensions — how often they expect it, and how sure they are — kept separate on
 * purpose. A coach who is confidently wrong should look exactly like a coach who is
 * confidently right, because that is the situation the player is actually in.
 */
function ConfidenceChip({ estimate, confidence }: { estimate: number; confidence: number }) {
  const frequency = estimate >= 0.65 ? 'Constantly' : estimate >= 0.4 ? 'Often' : 'Sometimes';
  const sureness =
    confidence >= 0.7 ? 'certain' : confidence >= 0.45 ? 'fairly sure' : 'a hunch';
  const tone = confidence >= 0.7 ? 'info' : confidence >= 0.45 ? 'neutral' : 'warning';
  return (
    <Chip tone={tone} title={`Coach is ${sureness} about this read`}>
      {frequency} · {sureness}
    </Chip>
  );
}
