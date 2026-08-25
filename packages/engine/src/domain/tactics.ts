/**
 * The tactical plan: **what fight are you trying to create?**
 *
 * This replaces `GamePlan.approach`, and the reason it had to is that `approach` was seven
 * buttons mixing four unrelated questions:
 *
 * ```
 *   Pressure / Counter          → initiative: how do you take the centre?
 *   Wrestle / Grind             → position:   where do you want the fight?
 *   Point Fight                 → risk:       what are you willing to lose?
 *   Hunt Submission / Finish    → finishing:  what ends it?
 * ```
 *
 * Those are not alternatives. A pressure fighter who wants it on the fence and takes no risks is
 * a real and extremely common fighter, and the old list made the player choose *one* of the four
 * things that describe him. Worse, because the answer was a single row in a weight table, the
 * engine could only read it as a nudge — measured, an 84-striking / 38-wrestling fighter spent
 * 138 seconds of a 900-second fight at distance, and all seven approaches moved that number
 * between 133 and 143. Every plan produced the same fight.
 *
 * So the plan answers five questions instead of one, and the engine treats the first as a
 * **governing intent** rather than a weight. See `fight/policy.ts` for the half of this that
 * turns intent into behaviour; this module is only the vocabulary.
 *
 *  1. `preferredState` — where you want the fight to happen.
 *  2. `entry`          — how you intend to get it there.
 *  3. `topIntent` / `bottomIntent` — what you do once the fight is on the floor.
 *  4. `finishing`     — how much the plan changes the moment a finish is there.
 *                        (Exchange risk is `GamePlan.riskLevel`, which already exists.)
 *  5. `situational`   — the conditional half: what changes when you are hurt, behind, or ahead.
 *
 * **Intent is not ability.** Nothing here makes a fighter better at anything. A 25-wrestling
 * fighter who asks for top position shoots constantly, misses, gets countered and empties his
 * tank — which is a *failed game plan*, and far more interesting than the engine quietly
 * ignoring him and reverting to generic MMA. `fight/policy.ts` enforces that separation: the
 * plan moves what a fighter *tries*, and every contest it leads to is resolved on attributes
 * exactly as before.
 */

import { clamp01 } from '../core/math.js';

// --- 1. Where do you want the fight? ------------------------------------------------------

/**
 * The states a fighter can want the fight to be in.
 *
 * Three of them are standing, and that is what makes an outside kickboxer, a pure boxer and a
 * pressure fighter three instructions rather than one. `FightState.range` carries the matching
 * state, so these are distinguishable *in the fight* and not only on the screen — before it,
 * `distance` was one undifferentiated place and every standing plan meant the same thing.
 *
 * `boxing` exists because two states could not carry the load. The two-state version of this had
 * to claim that at long range a fighter may only jab, which is false and was the signal that the
 * model was being stretched: a rear straight is not a pocket-only weapon, and most conventional
 * MMA striking happens at a range that is neither the one you enter from nor the one you survive
 * in.
 *
 * `adaptive` is a real answer and not a cop-out: it means the fighter takes whatever the
 * opponent gives, which is what a well-rounded fighter with no exploitable preference should
 * do, and it is the setting under which `policy.ts` applies no bias at all.
 */
export const PREFERRED_STATES = [
  'outside',
  'boxing',
  'pocket',
  'clinch',
  'top',
  'bottom',
  'submission',
  'adaptive',
] as const;
export type PreferredState = (typeof PREFERRED_STATES)[number];

export interface PreferredStateMeta {
  key: PreferredState;
  label: string;
  blurb: string;
  /** Whether this preference is satisfied on the feet. Drives which entry styles are offered. */
  standing: boolean;
}

export const PREFERRED_STATE_META: Readonly<Record<PreferredState, PreferredStateMeta>> = {
  outside: {
    key: 'outside',
    label: 'Outside',
    blurb: 'Kicking range. Make them come to you, and make coming expensive.',
    standing: true,
  },
  boxing: {
    key: 'boxing',
    label: 'Boxing range',
    blurb: 'Where the hands work and the kicks still reach. Neither hiding nor trading.',
    standing: true,
  },
  pocket: {
    key: 'pocket',
    label: 'Pocket',
    blurb: 'Chest to chest. Short shots, heavy exchanges, no room to step off.',
    standing: true,
  },
  clinch: {
    key: 'clinch',
    label: 'Clinch',
    blurb: 'Fence and tie-up. Dirty box, knees, trips, control.',
    /*
     * Grappling for the purposes of *route*, even though the fight is on the feet.
     *
     * `standing` decides which entry styles are offered, and "how do I get to the tie-up and what
     * do I do from it" is a grappling question — you walk them onto the fence, or you throw them
     * from grips. Listing the clinch as standing gave it Lead / Counter / Pressure / Movement,
     * so **the judo exemplar came out as `clinch` + `counter`** — a throwing specialist told to
     * counter-punch — and jiu-jitsu against judo fell to 0.046 on the fingerprint, under the 0.05
     * floor every pair in the game is held to. `tripsAndThrows` had no preference that could
     * reach it.
     */
    standing: false,
  },
  top: {
    key: 'top',
    label: 'Ground — Top',
    blurb: 'Take them down and stay on top of them.',
    standing: false,
  },
  /*
   * D4. `submission` used to carry this as well — *get it to the floor and hunt from either
   * position* — and the two are different fighters. A guard player who wants the fight on his back
   * and a wrestler who wants it on the floor either way were the same instruction, so the only
   * thing that could say "I mean to be underneath" was `bottomIntent`, which was already saying two
   * other things (see `BOTTOM_INTENTS`).
   *
   * **The gap this leaves, stated rather than papered over:** there is no *entry* to the bottom. The
   * grappling entries are all routes to the top — shoot, chain, tie up, throw — and the engine has
   * no pull-guard. A bottom preference therefore takes the floor by whatever route it can and gets
   * where it wants when the position turns over, which is honest but incomplete. Inventing an entry
   * would be inventing a mechanic, and that is not what a vocabulary pass is for.
   */
  bottom: {
    key: 'bottom',
    label: 'Ground — Bottom',
    blurb: 'Off your back on purpose. Guard, sweeps, and the finish from underneath.',
    standing: false,
  },
  submission: {
    key: 'submission',
    label: 'Ground — Submission',
    blurb: 'Get it to the floor and go hunting, from either position.',
    standing: false,
  },
  adaptive: {
    key: 'adaptive',
    label: 'Adaptive',
    blurb: 'Take what the opponent gives you.',
    standing: true,
  },
};

// --- 2. How do you get there? -------------------------------------------------------------

/**
 * How a fighter creates their preferred state.
 *
 * Split by whether the preference is standing or grappling, because "Pressure" and "Shoot
 * proactively" are answers to the same question asked of different fighters — and because the
 * pair `(preferredState, entry)` is where the expressiveness lives. `pocket` + `pressure` is a
 * pressure boxer; `top` + `pressure` is a relentless chain wrestler; `top` + `counter` is a
 * reactive wrestler who shoots when you overextend. One dimension could not say any of that.
 */
export const STANDING_ENTRIES = ['lead', 'counter', 'pressure', 'movement'] as const;
export const GRAPPLING_ENTRIES = [
  'reactiveShot',
  'proactiveWrestling',
  'clinchEntries',
  'tripsAndThrows',
] as const;
export const ENTRY_STYLES = [...STANDING_ENTRIES, ...GRAPPLING_ENTRIES] as const;
export type EntryStyle = (typeof ENTRY_STYLES)[number];

export const ENTRY_META: Readonly<Record<EntryStyle, { label: string; blurb: string }>> = {
  lead: { label: 'Lead', blurb: 'Take the initiative and occupy the space first.' },
  counter: { label: 'Counter', blurb: 'Draw the attack and punish the mistake.' },
  pressure: { label: 'Pressure', blurb: 'Walk them backwards and never let them set.' },
  movement: { label: 'Movement', blurb: 'Circle, reset, refuse the exchange.' },
  reactiveShot: { label: 'Reactive shots', blurb: 'Change levels underneath their strikes.' },
  proactiveWrestling: { label: 'Chain wrestling', blurb: 'Force entry after entry, all night.' },
  clinchEntries: { label: 'Clinch first', blurb: 'Walk them down, tie up, then take them down.' },
  tripsAndThrows: {
    label: 'Trips and throws',
    blurb: 'Take them down from the tie-up, not the shot.',
  },
};

/** The entries that make sense for a given preference. The UI offers only these. */
export function entriesFor(state: PreferredState): readonly EntryStyle[] {
  return PREFERRED_STATE_META[state].standing ? STANDING_ENTRIES : GRAPPLING_ENTRIES;
}

// --- 3. What do you do once you are there? ------------------------------------------------

/**
 * On top, and underneath — and the bottom list is the one this whole rework exists for.
 *
 * The reported defect was a striker who gets taken down and then *hunts a guillotine*, because
 * at the moment of choosing, the local numbers for a submission and for a stand-up were close
 * enough that the draw picked either. That is not a fighter making a bad decision; it is a
 * fighter with no decision to make. `bottomIntent` is the missing instruction, and `policy.ts`
 * enforces it hierarchically rather than as another weight.
 */
export const TOP_INTENTS = ['control', 'groundAndPound', 'advance', 'submit'] as const;
export type TopIntent = (typeof TOP_INTENTS)[number];

/**
 * And underneath — **what he does down there, and nothing else.**
 *
 * It used to do three jobs. `standUp | scramble | playGuard | recover | attack` set how urgently he
 * wanted off the floor (`BOTTOM_EXIT`), which route he took when he went (`standUp` against `sweep`)
 * *and* what he did while he stayed (`submission` against `defend`) — one field answering *where do
 * I want the fight*, *how do I get there* and *what do I do here*. That is the defect D3 removed
 * from the clinch, and the bottom had it worse.
 *
 * The first two are now `preferredState`'s, which is what D4's `bottom` state exists to make
 * sayable, and this is the third. Three values against the old five, because there are two in-state
 * actions and the honest question about them is how much of the fight you are willing to lose to
 * hunt a finish — with `recover` as the answer that spends nothing at all.
 *
 * That leaves the vocabulary un-bunched, which was D6: three of the old five sat in an exit band of
 * 0.816 to 0.909 and differed on the axis that no longer lives here.
 */
export const BOTTOM_INTENTS = ['attack', 'defend', 'recover'] as const;
export type BottomIntent = (typeof BOTTOM_INTENTS)[number];

/** What an old five-value bottom instruction was saying about the *work*, which is all this is now. */
export function bottomIntentFor(legacy: string): BottomIntent {
  switch (legacy) {
    case 'attack':
      return 'attack';
    case 'recover':
      return 'recover';
    /*
     * `playGuard` maps here rather than to `attack`, and it is the one place the migration loses
     * something. It meant *I am comfortable down here and I work my guard* — half exit, half work —
     * and the exit half now belongs to `preferredState: 'bottom'`, which a migration cannot choose
     * on the player's behalf. The work half is a busy defensive guard, which is this.
     */
    default:
      return 'defend';
  }
}

/**
 * And in a tie-up, which until D3 was the one position with no instruction of its own.
 *
 * The clinch was the only place in the engine where *what do I do having arrived* was read off
 * `preferredState` — the field that answers *where do I want the fight*. One instruction doing two
 * jobs, and the measurement said so: the controlling clinch was the **lowest-authority decision
 * surface in the game** (0.56 to 1.35 at full conviction, against 2.11–4.82 at range), and a clinch
 * preference spent 64% of its beats striking against 13.9% holding. "Hold him here" could not be
 * said.
 *
 * **One field for both ends of the tie-up**, which is the one place this departs from the
 * `topIntent` / `bottomIntent` precedent. Top and bottom are separate fields because they are
 * separate jobs a fighter can be in for minutes. The two ends of a clinch swap within seconds —
 * `reverse` exists to swap them — and a corner does not give two different tie-up instructions. Two
 * alignment tables, one instruction, read from whichever end he is on.
 *
 * Three values and not four: there is no clinch analogue of `submit`, standing submissions are not
 * modelled, and inventing one here would be a mechanic smuggled in through a vocabulary change.
 *
 * **What it does not cover is leaving.** Whether a fighter wants to be in a tie-up at all is a
 * `preferredState` question, exactly as getting off the floor is (docs/01 § 8, and D2 before this).
 * The rule the two share: *intents own what stays within or advances the grappling; `preferredState`
 * owns the exits back to the feet.*
 */
export const CLINCH_INTENTS = ['control', 'damage', 'takedown'] as const;
export type ClinchIntent = (typeof CLINCH_INTENTS)[number];

export const TOP_INTENT_META: Readonly<Record<TopIntent, { label: string; blurb: string }>> = {
  control: { label: 'Control', blurb: 'Position and riding time. Give up nothing.' },
  groundAndPound: {
    label: 'Damage',
    blurb: 'Posture up and hit them. Accept some positional risk.',
  },
  advance: { label: 'Advance', blurb: 'Pass, mount, take the back. Position over damage.' },
  submit: { label: 'Submit', blurb: 'Expose yourself to attack the finish.' },
};

export const BOTTOM_INTENT_META: Readonly<Record<BottomIntent, { label: string; blurb: string }>> =
  {
    attack: { label: 'Attack', blurb: 'Hunt the finish off your back. Let the position go.' },
    defend: { label: 'Defend', blurb: 'Frame, hand-fight, deny the pass. Give them nothing.' },
    /*
     * D6 gave this one a mechanism of its own, which is why it survived the cut from five values to
     * three. It used to be a slightly softer `standUp` — 0.816 exit urgency against 0.909, and the
     * two within a point of each other on everything else — so it was a word rather than an
     * instruction. It now buys what the word means: he works at a lower intensity and burns less of
     * the tank doing it, which `accrueFatigue` has been able to express all along.
     */
    recover: { label: 'Recover', blurb: 'Spend nothing. Weather it and get your wind back.' },
  };

// --- 4. What will you trade? ---------------------------------------------------------------

/**
 * One dial here rather than the three the design sketch asked for, and both folds are deliberate.
 *
 * **Exchange risk is `GamePlan.riskLevel`**, which already exists, is already measured
 * (`tests/statistical/risk.test.ts` holds both extremes to within a few points of even money) and
 * already trades commitment, exposure, exertion and output against each other. Restating it here
 * would be a second source of truth for one question, and the engine would have to pick a winner.
 *
 * **Positional risk was folded into `topIntent`**, because `control` against `advance` *is* that
 * axis, asked at the point where the fighter is actually making the choice. Two controls that
 * mean the same thing are two controls the player has to reconcile, and one of them always loses.
 *
 * What is left is genuinely its own question: how much the plan changes when a finish appears.
 */
/**
 * **`control` means this tie-up, not grappling in general** — decision A of the two the design put
 * up, and it is the reason the wording matters before the screen is written.
 *
 * The alternative, B, was *prioritise position over damage, takedowns included*, and the first
 * draft's alignments implemented it by accident: `control` came out at 36% takedowns against 46%
 * holding. It was rejected because three intents that overlap are three intents that do not
 * separate, and separating them is the entire finding — a player who asks for `control` and gets a
 * fighter who shoots a third of the time has been given `takedown` with extra steps.
 *
 * So the blurb says *keep the tie-up*, and the table means it: `clinchTakedown` reads −0.55 under
 * `control`. A fighter told to control a clinch and take people down is told two things, and the
 * axis lets him say the second one.
 */
/**
 * What a plan written before `clinchIntent` existed was implicitly asking for.
 *
 * Measured off the table it replaces. Keyed on `preferredState`, the old clinch decision gave a
 * top or submission preference 82% takedowns, and gave everybody else a strike-led mix — 44% for an
 * outside fighter, 57% in the pocket, 64% for a clinch fighter. So two rows, and the clinch
 * preference lands on `damage` rather than `control` because that is what it *did*, not because a
 * clinch fighter should not be allowed to grind. Making him grind is the new instruction, and new
 * instructions are opt-in.
 */
export function clinchIntentFor(state: PreferredState): ClinchIntent {
  return state === 'top' || state === 'submission' || state === 'bottom' ? 'takedown' : 'damage';
}

export const CLINCH_INTENT_META: Readonly<Record<ClinchIntent, { label: string; blurb: string }>> = {
  control: { label: 'Control', blurb: 'Keep the tie-up. Wear them out against the fence.' },
  damage: { label: 'Damage', blurb: 'Knees and short shots. Accept the position getting away.' },
  takedown: { label: 'Takedown', blurb: 'Use the tie-up as the route to the floor.' },
};

export const FINISHING_URGENCIES = ['disciplined', 'pressAdvantage', 'huntFinish'] as const;
export type FinishingUrgency = (typeof FINISHING_URGENCIES)[number];

export const FINISHING_META: Readonly<Record<FinishingUrgency, { label: string; blurb: string }>> =
  {
    disciplined: { label: 'Stay disciplined', blurb: 'Take what comes. Do not chase it.' },
    pressAdvantage: { label: 'Press advantages', blurb: 'Step on them when they are wobbled.' },
    huntFinish: { label: 'Hunt the finish', blurb: 'Every opening, everything behind it.' },
  };

// --- 5. What changes when the fight does? --------------------------------------------------

/**
 * The conditional half of a game plan, which is most of what a corner actually says.
 *
 * One shared vocabulary of responses rather than a bespoke list per situation. The sketch this
 * came from gave each situation its own options — "if losing: increase activity / force
 * grappling / hunt finish", "if hurt: survive / clinch / wrestle / fire back" — and those five
 * lists share almost every entry. A single vocabulary means `policy.ts` has one function to
 * apply instead of five, the UI has one control shape, and a response the player understands in
 * one row means the same thing in the next.
 */
export const SITUATIONS = [
  'losingRound',
  'winningRound',
  'badlyHurt',
  'opponentHurt',
  'finalMinute',
] as const;
export type Situation = (typeof SITUATIONS)[number];

export const SITUATIONAL_RESPONSES = [
  'holdThePlan',
  'raiseOutput',
  'raiseRisk',
  'lowerRisk',
  'forceGrappling',
  'huntFinish',
  'survive',
  'secureControl',
] as const;
export type SituationalResponse = (typeof SITUATIONAL_RESPONSES)[number];

export const SITUATION_META: Readonly<
  Record<Situation, { label: string; options: readonly SituationalResponse[] }>
> = {
  losingRound: {
    label: 'If you are losing the round',
    options: ['holdThePlan', 'raiseOutput', 'raiseRisk', 'forceGrappling', 'huntFinish'],
  },
  winningRound: {
    label: 'If you are winning it',
    options: ['holdThePlan', 'lowerRisk', 'secureControl'],
  },
  badlyHurt: {
    label: 'If you are badly hurt',
    options: ['survive', 'forceGrappling', 'raiseRisk', 'holdThePlan'],
  },
  opponentHurt: {
    label: 'If they are hurt',
    options: ['holdThePlan', 'huntFinish', 'raiseOutput', 'forceGrappling'],
  },
  finalMinute: {
    label: 'In the last minute of a round',
    options: ['holdThePlan', 'raiseOutput', 'secureControl', 'huntFinish'],
  },
};

export const RESPONSE_META: Readonly<Record<SituationalResponse, { label: string }>> = {
  holdThePlan: { label: 'Stay disciplined' },
  raiseOutput: { label: 'Raise the output' },
  raiseRisk: { label: 'Take more risk' },
  lowerRisk: { label: 'Take fewer risks' },
  forceGrappling: { label: 'Force the grappling' },
  huntFinish: { label: 'Hunt the finish' },
  survive: { label: 'Survive it' },
  secureControl: { label: 'Secure position' },
};

export type SituationalRules = Partial<Record<Situation, SituationalResponse>>;

// --- The plan ------------------------------------------------------------------------------

export interface TacticalPlan {
  preferredState: PreferredState;
  entry: EntryStyle;
  topIntent: TopIntent;
  bottomIntent: BottomIntent;
  clinchIntent: ClinchIntent;
  finishing: FinishingUrgency;
  /** Unset situations fall through to `holdThePlan`. */
  situational: SituationalRules;
  /**
   * 0–1. How hard the corner wants the preferred state imposed, before the fighter's own
   * discipline and fight IQ are applied.
   *
   * **Not a player-facing dial**, deliberately. "How much do you mean it?" is not a question
   * anybody can answer, and a sixth slider that silently scales the other five is the kind of
   * control that makes a screen feel arbitrary. It is set from the plan itself — a fighter who
   * asked for `adaptive` means it less than one who asked for `longRange` — and then modulated
   * per situation by `policy.ts`.
   */
  conviction: number;
}

/** How committed each preference is by nature. `adaptive` means "no preference", so it is 0. */
const BASE_CONVICTION: Readonly<Record<PreferredState, number>> = {
  outside: 0.85,
  // The most forgiving preference in the list, and the least urgently held: a fighter comfortable
  // at boxing range can work a step either side of it, which is what makes it the default answer
  // for a rounded striker rather than a compromise between two better ones.
  boxing: 0.6,
  pocket: 0.75,
  clinch: 0.8,
  top: 0.85,
  bottom: 0.9,
  submission: 0.9,
  adaptive: 0,
};

export function convictionFor(state: PreferredState): number {
  return BASE_CONVICTION[state];
}

/**
 * The plan a fighter with no camp brings: no preference, and therefore no bias anywhere.
 *
 * `adaptive` with conviction 0 makes every term in `policy.ts` exactly 1.0, which is what keeps
 * the whole statistical tier calibrated: a fight nobody planned resolves precisely as it did
 * before this module existed.
 */
export function defaultTactics(): TacticalPlan {
  return {
    preferredState: 'adaptive',
    entry: 'lead',
    topIntent: 'control',
    bottomIntent: 'defend',
    clinchIntent: 'damage',
    finishing: 'disciplined',
    situational: {},
    conviction: 0,
  };
}

/**
 * Make a plan safe to run, wherever it came from.
 *
 * The type says `TacticalPlan` and the value may not be one. Plans arrive from the editor, from a
 * booking written by an older build, and from `tacticsFromApproach` migrating a save that predates
 * the whole layer — and TypeScript checks none of those, because all three cross a `JSON.parse`.
 * This is the one funnel every entry point goes through, so it is where a value that is no longer
 * part of the vocabulary has to become one that is.
 *
 * `preferredState` is checked first and matters most: `entriesFor` reaches straight into
 * `PREFERRED_STATE_META`, so a state this build has never heard of is not a wrong fight plan, it
 * is a `TypeError` on the way into the cage. Nothing persisted today carries a stale one — the two
 * standing states that existed before the range split, `outside` and `pocket`, are both still in
 * the list — but "nothing does yet" is not the same as "nothing can", and the cost of being wrong
 * here is a crash rather than a bad fight.
 *
 * Everything unrecognised falls back to the neutral plan's answer rather than to a guess, because
 * a plan that has lost a field should apply no bias on that axis. Guessing would silently give a
 * fighter an instruction nobody chose.
 */
export function normaliseTactics(plan: TacticalPlan): TacticalPlan {
  const fallback = defaultTactics();
  const oneOf = <T,>(allowed: readonly T[], value: T, whenUnknown: T): T =>
    allowed.includes(value) ? value : whenUnknown;

  const preferredState = oneOf(PREFERRED_STATES, plan.preferredState, fallback.preferredState);
  const entries = entriesFor(preferredState);

  return {
    ...plan,
    preferredState,
    // An entry style left over from a previous preference is not a plan, it is a stale control.
    entry: entries.includes(plan.entry) ? plan.entry : entries[0]!,
    topIntent: oneOf(TOP_INTENTS, plan.topIntent, fallback.topIntent),
    // A five-value instruction from before D4 is not missing a value, it had one — see
    // `bottomIntentFor`, which asks what it was saying about the *work*.
    bottomIntent: oneOf(BOTTOM_INTENTS, plan.bottomIntent, bottomIntentFor(plan.bottomIntent)),
    /*
     * A plan written before this field existed is not missing an instruction, it *had* one — the
     * clinch read `preferredState` — so the migration asks what that plan was implicitly saying
     * rather than dropping everybody on a default. See `clinchIntentFor`.
     */
    clinchIntent: oneOf(CLINCH_INTENTS, plan.clinchIntent, clinchIntentFor(preferredState)),
    finishing: oneOf(FINISHING_URGENCIES, plan.finishing, fallback.finishing),
    situational: plan.situational ?? {},
    conviction: Number.isFinite(plan.conviction) ? clamp01(plan.conviction) : 0,
  };
}
