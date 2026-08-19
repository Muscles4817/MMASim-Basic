import { useMemo, useState } from 'react';
import {
  APPROACHES,
  activeLesson,
  focusForAttribute,
  TRAINING_FOCUSES,
  APPROACH_META,
  MAX_PREPPED_READS,
  PURCHASES,
  PURCHASE_KEYS,
  campPurchaseEffects,
  campQuality as computeCampQuality,
  purchaseCost,
  type PurchaseKey,
  createRng,
  currentHeat,
  deriveTendencies,
  displayName,
  drillQuality as computeDrillQuality,
  footageAvailable,
  getDivision,
  normaliseTargeting,
  ratingBand,
  recordString,
  ATTRIBUTE_META,
  DEFAULT_INTENSITY,
  INTENSITY_META,
  TRAINING_INTENSITIES,
  TRAINING_META,
  type TrainingIntensity,
  type AttributeKey,
  READ_META,
  scoutOpponent,
  type Approach,
  type TrainingFocus,
  type Attributes,
  type Coach,
  type Fighter,
  type Gym,
  type ReadKey,
  type StrikeTarget,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Segmented } from '../ui';
import { spendLine } from '../ui/format';
import { Alert, FighterRead, KeyStat } from '../ui/signals';
import {
  forecastCampDevelopment,
  getBooking,
  isBoutOff,
  runBookedFight,
  type BoutOffOutcome,
  saveBookingFocus,
  saveBookingIntensity,
  saveBookingPlan,
  saveBookingPurchases,
} from '../game/career';
import { getRivalry } from '../game/rivalries';
import { currentPurse, payForCamp } from '../game/money';
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
  /*
   * Stateful, not a mount-time snapshot.
   *
   * It was `const [booking] = useState(...)` with no setter, which was harmless while the plan
   * was the only thing written. Adding purchases gave the screen a second writer, and both
   * spread the same stale object over the whole record — so ticking a purchase and then moving
   * a slider erased the purchase, and picking four reads and then ticking a purchase reverted
   * all four reads to whatever they were when the screen loaded.
   *
   * Both save functions already return the updated booking; the return value was simply being
   * dropped. On the one screen whose entire purpose is a considered decision, and which
   * promises in its own copy that the plan is saved as you build it.
   */
  const [booking, setBooking] = useState(() => getBooking());
  const [intensity, setIntensity] = useState<TrainingIntensity>(
    () => getBooking()?.intensity ?? DEFAULT_INTENSITY,
  );
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /**
   * The night that did not happen.
   *
   * Held rather than navigated away from. See `BoutOff` at the foot of this file for why.
   */
  const [boutOff, setBoutOff] = useState<BoutOffOutcome | undefined>();

  const opponent = booking
    ? (db.fighters.findById(booking.opponentId) as Fighter | undefined)
    : undefined;

  const coach = playerFighter?.headCoachId
    ? (db.coaches.findById(playerFighter.headCoachId) as Coach | undefined)
    : undefined;
  const gym = playerFighter?.gymId ? (db.gyms.findById(playerFighter.gymId) as Gym | undefined) : undefined;

  const weeks = booking ? Math.max(1, Math.round((booking.bout.day - booking.campStartDay) / 7)) : 8;

  /*
   * What this camp will develop, forecast from the same arithmetic that runs at the fight and
   * seeded on the same bout — so it is the camp the player is actually going to get rather than
   * a second, prettier draw of it.
   */
  const development = useMemo(
    () =>
      booking && playerFighter
        ? forecastCampDevelopment(db, playerFighter, { ...booking, intensity })
        : undefined,
    [db, playerFighter, booking, intensity],
  );

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
  const [risk, setRisk] = useState<number>(booking?.plan.riskLevel ?? 0.5);
  const [targeting, setTargeting] = useState<Record<StrikeTarget, number>>(
    booking?.plan.targeting ?? { head: 0.6, body: 0.25, legs: 0.15 },
  );
  const [selected, setSelected] = useState<ReadKey[]>(
    booking?.plan.preppedReads.map((r) => r.read) ?? [],
  );
  /*
   * What the player is buying for this camp.
   *
   * Held here rather than on the plan because it is spending, not tactics — it is debited
   * when the camp is committed and never read again. `PURCHASES` was a price list in the
   * engine with no callers and no effects, which meant money could be earned and never used
   * on anything but a gym.
   */
  /*
   * What the camp works on.
   *
   * `undefined` is a real value here and not a missing one: it means the player has not chosen,
   * and the fighter trains whatever they most need. Only once they pick something does the camp
   * stop being the game's decision. See docs/27 §2.1.
   */
  const lesson = playerFighter ? activeLesson(playerFighter, world.day) : undefined;
  const lessonFocus = lesson ? focusForAttribute(lesson) : undefined;
  const [campFocus, setCampFocus] = useState<TrainingFocus | undefined>(booking?.campFocus);
  const [bought, setBought] = useState<PurchaseKey[]>([...(booking?.purchases ?? [])]);
  const purchases = campPurchaseEffects(bought);
  const spend = purchaseCost(bought);

  /**
   * Write the plan down as it is built, not when the fight starts.
   *
   * The plan was only persisted inside `startFight`, so leaving the screen for any reason —
   * checking the opponent's profile, looking at the rankings, an accidental back gesture on
   * a phone — silently threw away every read, the approach and all three sliders, and
   * returned you to the default plan you never chose. On the screen whose entire purpose is
   * a considered decision.
   */
  const persist = (next: {
    approach?: Approach;
    riskLevel?: number;
    targeting?: Record<StrikeTarget, number>;
    selected?: ReadKey[];
  }) => {
    if (!booking) return;
    const reads = next.selected ?? selected;
    setBooking(
      saveBookingPlan(booking, {
        ...booking.plan,
        approach: next.approach ?? approach,
        riskLevel: next.riskLevel ?? risk,
        targeting: normaliseTargeting(next.targeting ?? targeting),
        preppedReads: reads.map((read) => ({
          read,
          drillQuality: 0,
          confidence: report?.reads.find((r) => r.read === read)?.confidence ?? 0.5,
        })),
      }),
    );
  };

  /*
   * Checked before the "no fight booked" guard below, because by this point there genuinely is
   * no booking any more — `runBookedFight` cleared it. Falling through would answer the player's
   * click with an empty screen, which is the same silence in a different shape.
   */
  if (boutOff) {
    return (
      <BoutOff
        outcome={boutOff}
        isPlayer={boutOff.pullOut.fighterId === playerFighter?.id}
        opponentName={opponent ? displayName(opponent) : 'Your opponent'}
        onLeave={() => navigate({ name: 'hub' })}
        onInbox={() => navigate({ name: 'inbox' })}
      />
    );
  }

  if (!booking || !opponent || !playerFighter) {
    return (
      <Empty title="No fight booked">
        <Button variant="primary" onClick={() => navigate({ name: 'hub' })}>
          Back to career
        </Button>
      </Empty>
    );
  }

  const rivalry = getRivalry(db, playerFighter.id, opponent.id, world.day);
  const heat = currentHeat(rivalry, world.day);
  // A title fight is a main event, which is where the money for it now lives — the old flat
  // ×1.5 on the base was cancelling the champion-versus-draw grievance doc 08 promises.
  /*
   * Quoted at the slot this fight is actually booked into.
   *
   * It read `isTitleFight ? 'mainEvent' : 'mainCard'`, which is neither of the two things the
   * game does with card position: settlement pays the real slot, so a non-title main event was
   * quoted a main-card purse here and then paid 2.5× it, and a prelim was quoted 2× what it
   * would earn. Money on this screen is the number a player decides how much camp to buy
   * against — being wrong in either direction is worse than not showing it.
   */
  const purse = currentPurse(db, playerFighter, booking.bout.position ?? 'mainCard');

  const baseCamp = computeCampQuality(
    weeks,
    gym?.quality ?? 45,
    coach?.development ?? 45,
    playerFighter.personality.discipline,
  );
  // Purchases multiply what the camp already computes rather than replacing it, so the gym,
  // the coach, the discipline and the weeks all still matter underneath.
  const camp = Math.min(1, baseCamp * purchases.campQuality);
  const drill = Math.min(
    1,
    computeDrillQuality(camp, selected.length, coach?.gamePlanning ?? 45) * purchases.drillQuality,
  );
  const targetingTotal = targeting.head + targeting.body + targeting.legs || 1;

  // aria-disabled rather than disabled: a disabled button leaves the tab order silently, so
  // a keyboard user at the cap would find the remaining options simply vanish with no
  // explanation. They stay focusable and say why instead.
  const toggleRead = (read: ReadKey) => {
    setSelected((current) => {
      const next = current.includes(read)
        ? current.filter((r) => r !== read)
        : current.length >= MAX_PREPPED_READS
          ? current
          : [...current, read];
      persist({ selected: next });
      return next;
    });
  };

  const startFight = () => {
    setRunning(true);
    const plan = {
      approach,
      targeting: normaliseTargeting(targeting),
      riskLevel: risk,
      campQuality: camp,
      preppedReads: selected.map((read) => {
        const scouted = report?.reads.find((r) => r.read === read);
        return {
          read,
          drillQuality: drill,
          // A scouting report does not change what is true about the opponent; it changes
          // how likely the camp's read of them is to be the right one.
          confidence: Math.min(1, (scouted?.confidence ?? 0.5) * purchases.scoutingAccuracy),
        };
      }),
    };
    try {
      // Pay for what was bought. Debited here rather than when each was ticked, so a player
      // who changes their mind on this screen is not charged for a camp they did not run —
      // and, like the camp itself, it is allowed to take the bank negative.
      if (spend > 0) payForCamp(db, playerFighter, spend);

      const updated = saveBookingPurchases(
        saveBookingPlan(saveBookingIntensity(booking, intensity), plan),
        bought,
      );
      const outcome = runBookedFight(db, updated);
      commit();
      /*
       * Sometimes there is no fight. The camp happened, the work is banked and the opponent is
       * not coming — so there is no bout to show, and sending the player to the fight screen for
       * a fight that did not take place would be a blank page and a lie.
       *
       * This used to `navigate({ name: 'hub' })` and drop `outcome.notes` on the floor, on the
       * grounds that the inbox has the news. It does — behind a tab, under a badge, on a screen
       * the player did not ask for. What the player actually experienced was pressing "walk out"
       * and being returned to the career hub with no fight, no message and their booking gone,
       * roughly one booked bout in eight. That is indistinguishable from the app losing their
       * fight, and it is the commonest bug report this screen produces.
       *
       * So the answer stays here, on the screen the click was made from, and the player leaves
       * when they have read it.
       */
      if (isBoutOff(outcome)) {
        setBoutOff(outcome);
        return;
      }
      navigate({ name: 'fight', boutId: outcome.result.boutId });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        {/*
          h2 first, then the label. The old order put a section-title h3 ("Fight week") above
          the h2 naming the opponent, so document order ran h1 → h3 → h2 — and "Fight week"
          was the wrong frame anyway for a screen where you plan the whole camp.
        */}
        <h2 style={{ fontSize: 'var(--text-xl)' }}>vs {displayName(opponent)}</h2>
        <p className="muted">
          {formatGameDay(booking.bout.day)} · {getDivision(opponent.divisionId).shortName} ·{' '}
          {recordString(opponent.summary)}
        </p>

        {/*
          What is at stake. Purses, titles and heat all ship, and the screen where a player
          decides how hard to prepare mentioned none of them.
        */}
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
          {booking.bout.isTitleFight && <Chip tone="accent">🏆 Championship bout</Chip>}
          {rivalry.isRivalry ? (
            <Chip tone="negative">🔥 Grudge — he wants this one badly</Chip>
          ) : (
            heat >= 40 && <Chip tone="warning">🔥 The audience wants this</Chip>
          )}
          {purse && (
            <Chip tone="info" title="Show money is paid win or lose; the win bonus is not">
              £{purse.show}k to show · £{purse.win}k to win
            </Chip>
          )}
          <Chip tone="neutral">{booking.bout.rounds} rounds</Chip>
        </div>

        {/*
          Both fighters, side by side. The opponent's read was here and yours was not, so
          "should I pressure him or stay long?" had to be answered from memory of a screen
          two taps away.
        */}
        <div className="camp-reads">
          <div>
            <h3 className="section-title">Him</h3>
            <FighterRead attributes={opponent.attributes} />
          </div>
          <div>
            <h3 className="section-title">You</h3>
            <FighterRead attributes={playerFighter.attributes} />
          </div>
        </div>

        {camp < 0.45 && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <Alert tone="warn" title="This camp is compromised">
              Too little time, too poor a room, or not enough discipline. Every prepared read
              is worth less than it should be.
            </Alert>
          </div>
        )}

        {/*
          What the camp is building, not just what it is preparing for.
          
          A fight camp used to develop nothing at all while every AI fighter got a full block of
          training around every bout — so the majority of a career's elapsed time was, for the
          player alone, pure ageing. It develops properly now, and a system the player cannot see
          is a system they cannot plan around, so it says so before the fight rather than after.
        */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <p className="section-title">How hard to run it</p>
          <Segmented
            label="Camp intensity"
            value={intensity}
            onChange={setIntensity}
            options={TRAINING_INTENSITIES.map((key) => ({
              value: key,
              label: INTENSITY_META[key].label,
            }))}
          />
          <p
            className="faint prose"
            style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}
            data-testid="camp-intensity-effect"
          >
            {INTENSITY_META[intensity].blurb} You walk to the cage in the state this leaves you in.
          </p>
        </div>

        {/*
          What the last fight said to go and fix.
          
          A fight grants direction rather than points (docs/27 §2.4), and direction the player
          cannot see is direction they cannot act on — so it is named here, on the screen where
          the decision is actually made, rather than buried in a post-fight note they scrolled
          past six weeks ago.
        */}
        {lesson && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <Alert tone="info" title="What last time out exposed">
              {ATTRIBUTE_META[lesson].label} was the hole. The next camp works it harder than
              usual{lessonFocus ? ` — that is ${TRAINING_META[lessonFocus].label}.` : '.'}
            </Alert>
          </div>
        )}

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <p className="section-title">What this camp works on</p>
          <p className="faint" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
            {campFocus
              ? `${weeks} weeks on it, alongside preparing for this opponent.`
              : lessonFocus
                ? 'Pointed at what the last fight exposed. Pick something else to override that.'
                : 'Left to him, he trains whatever he most needs. Pick something to override that.'}
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {TRAINING_FOCUSES.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={campFocus === key}
                aria-label={`Train ${TRAINING_META[key].label}`}
                onClick={() => {
                  // Tapping the chosen focus again hands the decision back to the fighter.
                  const next = campFocus === key ? undefined : key;
                  setCampFocus(next);
                  if (booking) setBooking(saveBookingFocus(booking, next));
                }}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  minHeight: 'var(--tap-target)',
                  borderRadius: 'var(--radius)',
                  border: `1px solid ${campFocus === key ? 'var(--accent)' : 'var(--border)'}`,
                  background: campFocus === key ? 'var(--accent-soft)' : 'var(--surface)',
                }}
              >
                {TRAINING_META[key].label}
              </button>
            ))}
          </div>
        </div>

        {development && development.totalExpected > 0.05 && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <p className="section-title">This camp is building</p>
            <p className="faint" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
              {weeks} weeks of {TRAINING_META[development.focus].label.toLowerCase()}, on top of
              preparing for this opponent.
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {(Object.entries(development.expected) as [AttributeKey, number][])
                .filter(([, gain]) => gain >= 0.05)
                .sort((a, b) => b[1] - a[1])
                .map(([key, gain]) => (
                  <Chip key={key} tone="positive">
                    {ATTRIBUTE_META[key].label} +{Math.round(gain * 10) / 10}
                  </Chip>
                ))}
            </div>
          </div>
        )}
        {development?.atCeiling && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <Alert tone="info" title="This camp will not develop you">
              Everything it works is already at your ceiling. The weeks still sharpen you for
              this opponent — they will not make you a better fighter.
            </Alert>
          </div>
        )}

        <div className="row" style={{ flexWrap: 'wrap' }}>
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
                aria-disabled={atLimit}
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
                  // 0.45 put the threat name at 2.93:1 and the drill line at 2.00:1 — four
                  // ghost rows nobody could read. The row now says why it is unavailable
                  // instead, which is what the aria-disabled comment above always promised.
                  opacity: atLimit ? 0.72 : 1,
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
                {/*
                  Whether the threat is a threat *to you*.

                  "He shoots early, constantly, certain" is terrifying with takedown defence
                  of 40 and irrelevant at 85 — and the report said the same thing either
                  way, leaving the player to hold their own ratings in their head and do the
                  comparison. Four reads out of eight is a real budget and this is the
                  information that makes spending it a decision rather than a guess.
                */}
                <ExposureLine phase={READ_META[r.read].phase} attributes={playerFighter.attributes} />
                {atLimit && (
                  <span style={{ display: 'block', marginTop: 'var(--space-2)' }}>
                    <Chip tone="warning">⚠ Camp is full — drop one of your reads first</Chip>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          role="status"
          style={{
            marginTop: 'var(--space-4)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <KeyStat
            value={`${Math.round(drill * 100)}%`}
            label="Sharpness of each answer"
            tone={drill >= 0.6 ? 'good' : drill >= 0.35 ? 'neutral' : 'bad'}
            detail={
              selected.length > 2
                ? `${selected.length} of ${MAX_PREPPED_READS} drilled — each one you add blunts the rest`
                : `${selected.length} of ${MAX_PREPPED_READS} drilled`
            }
          />
        </div>
      </Card>

      <Card title="Game plan">
        <div className="stack">
          <div>
            <h3 className="section-title">Approach</h3>
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
                  onClick={() => {
                    setApproach(key);
                    persist({ approach: key });
                  }}
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
            <h3 className="section-title">Where to attack</h3>
            {(['head', 'body', 'legs'] as const).map((target) => (
              <label key={target} style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                <span className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ textTransform: 'capitalize' }}>{target}</span>
                  <span className="numeric muted">
                    {/* Guarded divisor: three sliders at zero produced a literal NaN%, and
                        the engine then silently substituted a 60/25/15 plan the player never
                        chose. Showing the normalised share keeps the label honest about what
                        will actually be fought. */}
                    {Math.round((targeting[target] / targetingTotal) * 100)}%
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(targeting[target] * 100)}
                  onChange={(e) =>
                    setTargeting((t) => {
                      const next = { ...t, [target]: Number(e.target.value) / 100 };
                      persist({ targeting: next });
                      return next;
                    })
                  }
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </label>
            ))}
            <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>
              Legs cut mobility and takedown defence. Body drains the tank and stops them
              recovering between rounds. Head ends fights.
            </p>

            {/*
              How much to commit.

              `riskLevel` sat on the game plan from the beginning, hardcoded to 0.5 here and
              read zero times by the simulator. Now it trades three things at once, and the
              readout below names all three because a slider whose effect you cannot predict
              is a slider nobody moves.
            */}
            <h3 className="section-title" style={{ marginTop: 'var(--space-4)' }}>
              How much to commit
            </h3>
            <label style={{ display: 'block' }}>
              <span className="row" style={{ justifyContent: 'space-between' }}>
                <span>{riskLabel(risk)}</span>
                <span className="numeric muted">{Math.round(risk * 100)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(risk * 100)}
                aria-label="How much to commit"
                aria-valuetext={`${riskLabel(risk)}. ${riskDescription(risk)}`}
                onChange={(e) => {
                  const next = Number(e.target.value) / 100;
                  setRisk(next);
                  persist({ riskLevel: next });
                }}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </label>
            <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>
              {riskDescription(risk)}
            </p>

            {/*
              What money can buy for this camp.

              `PURCHASES` was a price list in the engine with no callers and no effects, which
              meant money could be earned and never spent on anything but a gym — a career
              where the bank is a scoreboard rather than a resource.

              Each one multiplies something the camp already computes rather than adding a new
              mechanic, and the effect is stated before the player commits rather than after,
              which is the difference between a decision and a slot machine. The running total
              sits against the bank on purpose: the full set costs more than a mid-tier camp,
              so buying everything is not affordable at the bottom of the sport, which is
              exactly where it would help most.
            */}
            <h3 className="section-title" style={{ marginTop: 'var(--space-4)' }}>
              Spend on this camp
            </h3>
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              {PURCHASE_KEYS.map((key) => {
                const item = PURCHASES[key];
                const on = bought.includes(key);
                return (
                  <label
                    key={key}
                    className="row"
                    style={{
                      gap: 'var(--space-2)',
                      alignItems: 'flex-start',
                      padding: 'var(--space-2)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      background: on ? 'var(--accent-soft)' : 'var(--surface)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        setBought((current) => {
                          const next = current.includes(key)
                            ? current.filter((k) => k !== key)
                            : [...current, key];
                          if (booking) setBooking(saveBookingPurchases(booking, next));
                          return next;
                        });
                      }}
                      style={{ marginTop: 2, accentColor: 'var(--accent)' }}
                    />
                    <span style={{ flex: 1 }}>
                      <span className="row" style={{ justifyContent: 'space-between' }}>
                        <strong>{item.label}</strong>
                        <span className="numeric muted">£{item.cost}k</span>
                      </span>
                      <span className="faint" style={{ fontSize: 'var(--text-sm)' }}>
                        {item.effect}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {/*
              Announced, because it changes on every tick and a total nobody hears is not a
              total. And the over-budget case is an Alert rather than a dropped `faint` class:
              signalling "you cannot afford this" by going from grey to slightly-less-grey was
              the quietest thing in the block.
            */}
            {spend > playerFighter.bank ? (
              <Alert tone="warn" title="More than you have">
                £{spend}k against a bank of £{Math.round(playerFighter.bank * 10) / 10}k. You can
                run it anyway and go into the red — nothing stops you — but you will start
                taking fights you would otherwise refuse.
              </Alert>
            ) : (
              <p
                className="faint prose"
                role="status"
                style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}
              >
                {spend === 0
                  ? `Nothing bought. You have £${Math.round(playerFighter.bank * 10) / 10}k.`
                  : spendLine({ cost: spend, balance: playerFighter.bank })}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/*
        The commit step.

        "Fight" was a single unlabelled tap at the bottom of eight read buttons, four
        approach cards and three sliders — irreversible, and with no restatement of what was
        actually being committed to. A player who scrolled past the top of the screen had no
        way to check their own plan without scrolling back up. This is the same two-step the
        rest of the app already uses for consequential actions.
      */}
      <Card title="Ready?" raised>
        <ul style={{ marginBottom: 'var(--space-3)' }}>
          <li className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Approach</span>
            <strong>
              {APPROACH_META[approach].label} · {riskLabel(risk).toLowerCase()}
            </strong>
          </li>
          <li className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Drilled</span>
            <strong>
              {selected.length === 0
                ? 'Nothing'
                : `${selected.length} read${selected.length === 1 ? '' : 's'}`}
            </strong>
          </li>
          <li className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Targeting</span>
            <strong>
              {(['head', 'body', 'legs'] as const)
                .map((t) => `${Math.round((targeting[t] / targetingTotal) * 100)}% ${t}`)
                .join(' · ')}
            </strong>
          </li>
          {/*
            The spend. This card exists to restate what is being committed to, and it listed
            everything except the only money commitment on the screen — up to £58k debited the
            moment the player confirms, never mentioned in the confirmation.
          */}
          <li className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Spend</span>
            <strong>
              {spend === 0
                ? 'Nothing extra'
                : `£${spend}k · ${bought.length} ${bought.length === 1 ? 'extra' : 'extras'}`}
            </strong>
          </li>
        </ul>

        {selected.length === 0 && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <Alert tone="warn" title="You have drilled nothing">
              You can absolutely walk in cold, and against a fighter you clearly outclass it
              costs you little. Against anyone else you are giving away the one advantage
              preparation buys.
            </Alert>
          </div>
        )}

        {!confirming ? (
          <Button variant="primary" block onClick={() => setConfirming(true)}>
            Fight {displayName(opponent)}
          </Button>
        ) : (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={startFight} disabled={running}>
              {running ? 'Fight in progress…' : 'Yes — walk out'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Not yet, let me change something
            </Button>
          </div>
        )}
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
          Your plan is saved as you build it, so you can leave this screen and come back.
        </p>
      </Card>
    </div>
  );
}

/**
 * The fight is off.
 *
 * A whole screen rather than a toast, because losing a booked fight is one of the largest things
 * that can happen to a career and the player has just spent ten weeks and up to £58k on it. The
 * three questions it has to answer are the three the silent redirect answered none of: what
 * happened, what it cost, and what is left.
 *
 * `notes` is the same list the fight screen shows under "Afterwards" — the camp that still
 * counted, the ageing that still happened — and it was already being computed and returned by
 * `runBookedFight` for a caller that threw it away.
 */
function BoutOff({
  outcome,
  isPlayer,
  opponentName,
  onLeave,
  onInbox,
}: {
  outcome: BoutOffOutcome;
  /** Whether it was the player who pulled out, which is a different piece of news entirely. */
  isPlayer: boolean;
  opponentName: string;
  onLeave(): void;
  onInbox(): void;
}) {
  const rest = outcome.notes.filter((note) => note !== outcome.pullOut.note);

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card raised>
        {/*
          The same words the inbox uses, deliberately. A player who sees this and later finds the
          item under the badge should recognise it as the same event rather than wonder whether
          something else went wrong as well.
        */}
        <h2 style={{ fontSize: 'var(--text-xl)' }}>The fight is off</h2>
        <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>
          {isPlayer ? 'You are not walking out.' : `${opponentName} is not coming.`}
        </p>
        {/*
          `danger` rather than `warn`: this is the outcome of the action the player just took,
          and it is the one tone that carries role="alert" — so a screen-reader user is told the
          fight was cancelled instead of being moved to a screen that never mentions it.
        */}
        <Alert tone="danger" title="No fight tonight">
          {outcome.pullOut.note}
        </Alert>
      </Card>

      {/*
        The withdrawal note itself is the first entry in `notes`, and it is already the headline
        above — so it is dropped here rather than said twice on one screen.
      */}
      {rest.length > 0 && (
        <Card title="What the camp still did">
          <ul className="aftermath">
            {rest.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={onLeave}>
          Back to career
        </Button>
        <Button onClick={onInbox}>Read it in the inbox</Button>
      </div>
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

/**
 * How exposed the player is to one kind of threat.
 *
 * The mapping from a read's resolution phase to the attribute that answers it is the honest
 * one: a takedown read is answered by takedown defence and nothing else, a submission read
 * by your own submission grappling. Deliberately one attribute rather than a blend — a
 * composite would be more accurate and far less actionable, and the player is choosing what
 * to drill, not auditing the engine.
 */
const PHASE_DEFENCE: Readonly<Record<ReadMetaPhase, { key: keyof Attributes; label: string }>> = {
  striking: { key: 'strikingDefence', label: 'striking defence' },
  takedown: { key: 'takedownDefence', label: 'takedown defence' },
  clinch: { key: 'strength', label: 'strength in the clinch' },
  ground: { key: 'scrambling', label: 'scrambling' },
  submission: { key: 'submissions', label: 'submission grappling' },
};

type ReadMetaPhase = 'striking' | 'takedown' | 'clinch' | 'ground' | 'submission';

function ExposureLine({
  phase,
  attributes,
}: {
  phase: ReadMetaPhase;
  attributes: Attributes;
}) {
  const defence = PHASE_DEFENCE[phase];
  const value = attributes[defence.key];
  const band = ratingBand(value);
  const exposed = value < 55;

  return (
    <span
      className={`exposure ${exposed ? 'exposure--weak' : ''}`}
      style={{ display: 'block', fontSize: 'var(--text-xs)', marginTop: 4 }}
    >
      <span aria-hidden="true">{exposed ? '⚠' : '✓'}</span> Your {defence.label} is{' '}
      <strong>{band.label.toLowerCase()}</strong> ({value})
      {exposed ? ' — this one will hurt you.' : ' — you can live with this.'}
    </span>
  );
}

/**
 * Naming the setting rather than the number.
 *
 * "0.72" tells a player nothing about what their fighter will do. These are the words a
 * corner would actually use, and the description names the trade in both directions so the
 * slider reads as a decision with a cost rather than a difficulty setting.
 */
function riskLabel(risk: number): string {
  if (risk < 0.2) return 'Stay safe';
  if (risk < 0.4) return 'Measured';
  if (risk < 0.6) return 'Balanced';
  if (risk < 0.8) return 'Sit down on it';
  return 'Swing for it';
}

function riskDescription(risk: number): string {
  if (risk < 0.2) {
    return 'Hit and move. You will not hurt them much, but you will be hard to catch and you will still have your legs in the third.';
  }
  if (risk < 0.4) {
    return 'Pick your moments. Slightly less on your shots, noticeably less coming back.';
  }
  if (risk < 0.6) {
    return 'No particular gamble either way.';
  }
  if (risk < 0.8) {
    return 'Plant your feet and mean it. Your shots land flusher — and you are standing still when theirs come back.';
  }
  return 'Everything into every shot. You will finish them or you will be finished, and either way you will be empty by the third.';
}
