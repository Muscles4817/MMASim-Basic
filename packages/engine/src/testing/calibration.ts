/**
 * Calibration fixtures for the Reduced-engine refit.
 *
 * `ARCHETYPES` are characters: a shape someone could point at in a real promotion, written to
 * make a behaviour legible in a test that reads like prose. These are not that. Each one is a
 * *point in a lever space*, chosen so that a fit can see one constant move without the others
 * moving with it. Naming them after fighters would be a lie about what they are for.
 *
 * ## Why this exists
 *
 * D22 established that `round.ts`'s constants are a mutually-compensating set: each was fitted
 * against the same six near-symmetric matchups with the others' errors already in place, so the
 * Reduced engine is accurate exactly where its fixtures live and wrong off them — it lands 1.90x
 * Full's strikes per round in `guardPlayer-v-smotherer` on unmodified master. Two separate
 * attempts to fix one constant at a time (D21's control-split sign error, D12's hurt window)
 * were proven correct in isolation and still broke parity bounds, because moving one member of
 * a compensating set exposes the errors it was cancelling.
 *
 * The way out is a joint refit, and D22 recorded the precondition: *the fixture set has to be
 * designed for the fit rather than borrowed from it*. This is that set.
 *
 * ## What "designed for the fit" means here
 *
 * The constants are not totals, they are rates:
 *
 * | rate         | what it prices                     |
 * | ------------ | ---------------------------------- |
 * | `volume`     | significant strikes landed per round |
 * | `control`    | share of the round spent in control  |
 * | `hazard`     | knockdowns per landed strike         |
 * | `conversion` | strike finishes per knockdown        |
 *
 * `hazard` and `conversion` multiply into the same observable — the KO rate — so unless a
 * fixture set moves them apart from each other, an error in one is indistinguishable from the
 * opposite error in the other and a fit will place a compensating pair. That is not a
 * hypothetical. Measured across the current six at 800 fights per matchup, over three disjoint
 * blocks of fights:
 *
 * | set         | worst \|r\|      | the confounded pair                       |
 * | ----------- | -------------- | ----------------------------------------- |
 * | current six | 0.83 0.83 0.85 | `volume` vs `conversion`, `hazard` vs `conversion` |
 * | this set    | 0.53 0.54 0.63 | none above 0.7                            |
 *
 * The current six could not have separated volume from finish conversion, so they did not. Note
 * the direction of the error: at 250 fights per matchup the same set reads 0.67, because noise
 * dilutes a correlation. Measuring a fixture set too cheaply makes it look *better* than it is,
 * which is why the coverage test pays for 600 fights a matchup.
 *
 * Every rate also spans wider here than in the current six — hazard 159x against 47x, finish
 * conversion 44x against 20x, volume 35x against 15x — which matters because a constant is only
 * pinned over the range its fixtures visit. Control is the one rate the six span better (30x
 * against 24x), and it is why `topControl`, `bottomGame` and `sprawl` are separate levers below.
 *
 * Three findings worth keeping, each of which cost a wrong turn to learn:
 *
 * - The selection plateaus at |r| ~= 0.6 whether it picks 8 matchups or 14. Independence comes
 *   from *which* matchups, not how many; adding fixtures to a confounded set buys precision on a
 *   quantity it still cannot separate.
 * - The score surface over candidate sets is flat, so the selection is not the authority on its
 *   own output. Two runs at 200 and 400 fights per pair agreed on only 4 of 10 matchups, and the
 *   200-fight winner degraded to 0.74 when re-measured at 800. A proposed set is only worth
 *   shipping once it has been re-measured on fights it was not chosen against, which is why the
 *   table above reports three blocks rather than one.
 * - A metric for this has to be fixed, not derived from the data it is handed. An earlier version
 *   floored each rate at a fraction of the median of whatever rows it was measuring, and the same
 *   set scored 0.61 against one comparison and 0.69 against another with nothing about the set
 *   changed. The apparent first win — 0.86 down to 0.61 — was entirely that artefact.
 *
 * ## What this set is not for
 *
 * It is not a replacement for the archetype matchups in the parity suites, and nothing here is
 * wired into `reduced-fidelity.test.ts` yet. Those bounds describe the compensating set as it
 * stands; pointing them at fixtures the constants were never fitted against would add failing
 * assertions that describe a known-wrong model rather than a regression. The swap belongs with
 * the refit, not before it.
 */

import type { Fighter } from '../domain/fighter.js';
import { makeFighter } from './fixtures.js';

/**
 * The independent axes a fighter is varied along. Everything not named here stays at the
 * fixture default, so a difference between two calibration fighters is always attributable.
 *
 * Five levers rather than fifteen attributes because the attributes are not independent in the
 * engine — striking offence, kicking, speed and striking defence all move the same observable —
 * and a lever space with hidden dependencies cannot deliver the independence this set exists
 * to provide.
 */
export interface CalibrationLevers {
  /** Hands, kicks, speed and defensive striking. Drives volume. */
  striking: number;
  /** Power alone. Drives hazard without touching volume. */
  power: number;
  /** Durability and composure. Divides hazard from conversion: a chin absorbs knockdowns. */
  chin: number;
  /**
   * Wrestling, ground control and strength — the game played from on top. Drives control.
   *
   * Split from `bottomGame` for the same reason `sprawl` was split out: one lever could not
   * express the shape that produces the most control in the whole engine, which is a fighter who
   * is dangerous off his back and cannot wrestle at all, held down by someone who can. The
   * incumbent set has that matchup (`guardPlayer` v `smotherer`, 0.735 of the round) and the
   * single-lever space topped out at 0.65 because every grappler it could build was good at
   * everything on the mat and therefore got up.
   */
  topControl: number;
  /**
   * Submissions and scrambling — the game played from underneath.
   *
   * Moves the threat a bottom fighter carries without moving how much control they concede, which
   * is what makes `hazard` and `control` separable on the mat rather than one being a proxy for
   * the other.
   */
  bottomGame: number;
  /**
   * Takedown defence, alone.
   *
   * Split out from `grappling` after the coverage test caught what tying them together cost. When
   * one lever drove both, a fighter with no wrestling also had no sprawl, so he was taken down
   * constantly — which meant the low-grappling end of the space produced *more* ground time, not
   * less, and neither end of the control span was reachable. The set topped out at 22.8x on
   * control where the six it was replacing managed 30.2x.
   *
   * They are independent in the sport and independent in the engine, and a lever space with a
   * hidden dependency inside it cannot deliver the independence this set exists to provide. That
   * the defect showed up as a *narrower span* rather than as a wrong number is the general
   * lesson: a fixture set fails quietly.
   */
  sprawl: number;
  /** Cardio. Moves late-round volume without moving early-round volume. */
  engine: number;
}

/**
 * The candidate pool the selection ran over.
 *
 * Deliberately kept inside what the shipped 2026 roster actually contains — a lever set that
 * spans 1-99 would decorrelate beautifully and calibrate the engine against fighters who do not
 * exist. `median` and `lowLevel` are here because a set made only of extremes fits a line
 * through its endpoints and never checks the middle.
 *
 * Six of the sixteen are in the pool and not in the selection. They are kept because the pool is
 * the record of what was considered: they lost, they did not go unasked, and a later re-selection
 * against a changed engine may well take them. `guardPlayer` in particular is here because it is
 * half of the highest-control matchup the engine can produce, and a re-selection that ever needs
 * more of the control span will want it.
 */
export const CALIBRATION_LEVERS: Readonly<Record<string, CalibrationLevers>> = {
  /** High output, no power. Separates volume from hazard. */
  outputNoPower: {
    striking: 82,
    power: 34,
    chin: 62,
    topControl: 40,
    bottomGame: 34,
    sprawl: 44,
    engine: 88,
  },
  /** One shot, no output. The same separation from the other side. */
  powerNoOutput: {
    striking: 46,
    power: 92,
    chin: 60,
    topControl: 38,
    bottomGame: 32,
    sprawl: 42,
    engine: 44,
  },
  /** Hits hard, cannot be hit. Drives hazard to both extremes within one matchup. */
  glassCannon: {
    striking: 78,
    power: 84,
    chin: 32,
    topControl: 36,
    bottomGame: 30,
    sprawl: 40,
    engine: 60,
  },
  /** Absorbs everything. The low-hazard end of a high-volume matchup. */
  granite: {
    striking: 52,
    power: 44,
    chin: 88,
    topControl: 44,
    bottomGame: 38,
    sprawl: 48,
    engine: 74,
  },
  /** Control without striking. The high end of the control span. */
  pureGrappler: {
    striking: 38,
    power: 42,
    chin: 66,
    topControl: 86,
    bottomGame: 80,
    sprawl: 90,
    engine: 82,
  },
  /** The same game with no gas, which moves control across rounds rather than across fighters. */
  grapplerNoGas: {
    striking: 40,
    power: 40,
    chin: 58,
    topControl: 84,
    bottomGame: 78,
    sprawl: 88,
    engine: 36,
  },
  /** Everything near the roster median. The middle of every span. */
  median: {
    striking: 60,
    power: 58,
    chin: 60,
    topControl: 58,
    bottomGame: 52,
    sprawl: 62,
    engine: 62,
  },
  /** Low everywhere. The bottom of every span, and the corner that gets finished. */
  lowLevel: {
    striking: 38,
    power: 36,
    chin: 40,
    topControl: 36,
    bottomGame: 30,
    sprawl: 40,
    engine: 42,
  },
  /** Striking with no wrestling — the corner a grappler smothers. */
  strikerNoWrestling: {
    striking: 84,
    power: 62,
    chin: 64,
    topControl: 30,
    bottomGame: 24,
    sprawl: 34,
    engine: 70,
  },
  /** Wrestling with no striking. The opposite corner of the same matchup. */
  chainWrestler: {
    striking: 32,
    power: 38,
    chin: 70,
    topControl: 88,
    bottomGame: 82,
    sprawl: 92,
    engine: 78,
  },
  /** Volume, chin and gas, no power. The one shape that lands a lot and finishes nothing. */
  durablePressure: {
    striking: 66,
    power: 44,
    chin: 84,
    topControl: 50,
    bottomGame: 44,
    sprawl: 54,
    engine: 90,
  },

  // The five below exist only because `sprawl`, `topControl` and `bottomGame` are separate levers.
  // Each is a point the collapsed space could not name, and between them they are what re-opened
  // the control span after the coverage test caught it narrowing.

  /** Sprawls and brawls: nothing offensive on the mat, everything defensive. Drives control to nil. */
  sprawlAndBrawl: {
    striking: 80,
    power: 60,
    chin: 64,
    topControl: 26,
    bottomGame: 22,
    sprawl: 88,
    engine: 72,
  },
  /** No sprawl at all. Held down by opponents who are not grapplers, which nothing else does. */
  noSprawl: {
    striking: 64,
    power: 52,
    chin: 58,
    topControl: 40,
    bottomGame: 34,
    sprawl: 22,
    engine: 68,
  },
  /** The top of the grappling ladder, for the matchup where control should be near-total. */
  eliteGrappler: {
    striking: 34,
    power: 40,
    chin: 68,
    topControl: 94,
    bottomGame: 86,
    sprawl: 90,
    engine: 84,
  },
  /** Holds people down and does nothing else. The top half of the highest-control matchup. */
  smother: {
    striking: 58,
    power: 52,
    chin: 76,
    topControl: 96,
    bottomGame: 76,
    sprawl: 88,
    engine: 82,
  },
  /** Dangerous off his back, cannot wrestle, does not want to stand. The bottom half of it. */
  guardPlayer: {
    striking: 48,
    power: 50,
    chin: 62,
    topControl: 42,
    bottomGame: 88,
    sprawl: 46,
    engine: 70,
  },
};

export type CalibrationFighter = keyof typeof CALIBRATION_LEVERS;

/**
 * Build the fighter at a lever point.
 *
 * The derived offsets (`striking - 6` for kicks, `grappling - 8` for submissions) keep each
 * fighter internally coherent — a 32-striking fighter with 82 striking defence is not a point in
 * this space, it is a different fighter — while leaving one number per lever to reason about.
 * Takedown defence is deliberately *not* derived; see `sprawl`.
 */
export function calibrationFighter(name: CalibrationFighter): Fighter {
  const l = CALIBRATION_LEVERS[name]!;
  return makeFighter({
    id: `fighter_cal_${name}`,
    lastName: name,
    attributes: {
      strikingOffence: l.striking,
      kicking: l.striking - 6,
      strikingDefence: l.striking - 10,
      speed: l.striking - 4,
      power: l.power,
      durability: l.chin,
      composure: l.chin - 4,
      wrestling: l.topControl,
      groundControl: l.topControl + 2,
      scrambling: l.bottomGame - 2,
      takedownDefence: l.sprawl,
      submissions: l.bottomGame,
      cardio: l.engine,
      // Strength belongs to the top game — it is what holds a position rather than what escapes
      // one — but only partly, or every striker in the pool would be frail in the clinch. The
      // shipped `smotherer` sits at 85 with wrestling 92, which is the ratio this reproduces.
      strength: Math.round(48 + l.topControl * 0.38),
      fightIq: 60,
    },
  });
}

/**
 * The selected matchups.
 *
 * Ten, because the selection plateaus there: 8 gives a worse worst-|r| and 12 and 14 give the
 * same one, so the eleventh fixture costs simulation time and buys no separation.
 *
 * Each is a matchup rather than a fighter because a rate is only observable in a contest — a
 * grappler's control share is a fact about who they are in with, and half the point of the set
 * is that `smother` reads differently against `strikerNoWrestling` than against `powerNoOutput`.
 *
 * Reproduce with `npx tsx tools/fixture-coverage.ts --select 10 --fights 800`. Expect the
 * selection to propose a *different* set of similar quality — see the flatness note above — and
 * treat a proposal as a candidate to re-measure, not a replacement to paste in.
 */
export const CALIBRATION_MATCHUPS: readonly (readonly [CalibrationFighter, CalibrationFighter])[] =
  [
    ['chainWrestler', 'durablePressure'],
    ['granite', 'durablePressure'],
    ['grapplerNoGas', 'eliteGrappler'],
    ['outputNoPower', 'durablePressure'],
    ['outputNoPower', 'powerNoOutput'],
    ['outputNoPower', 'smother'],
    ['powerNoOutput', 'glassCannon'],
    ['powerNoOutput', 'pureGrappler'],
    ['powerNoOutput', 'smother'],
    ['strikerNoWrestling', 'smother'],
  ];
