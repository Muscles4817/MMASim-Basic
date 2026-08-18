/**
 * What a fighter works on between fights.
 *
 * The world picked this with `rng.pick` over the five focuses — **every fighter in the game trained
 * a uniformly random discipline every camp** (docs/19 §12). A wrestler spent a fifth of their
 * career on submissions and a fifth on film study; a kickboxer trained takedown defence as often as
 * their shins. Over a career that is a treadmill pulling every fighter toward the same shape, and
 * it is the other half of why a kickboxer's striking/kicking gap closed to nothing in twenty-four
 * camps: splitting the striking focus fixes what a camp *does*, and this fixes which camp they
 * take.
 *
 * Same defect shape as the game plans in phase 5 — a real mechanism, driven by a uniform default —
 * and the same fix: read the fighter.
 *
 * Two things pull, and both have to be there:
 *
 *  - **Identity.** You train what you are. A wrestler wrestles, and that is what makes a career
 *    twelve years long still legible as one fighter's career, which is goal G3.
 *  - **Headroom.** You cannot train what is already finished. An attribute at its ceiling returns
 *    nothing for the camp, so a fighter whose wrestling is maxed will spend time elsewhere whether
 *    they think of themselves as a wrestler or not.
 *
 * Deliberately still a *draw* rather than a decision. A fighter who trained their best discipline
 * every single camp for twelve years would be a spreadsheet rather than a person, and the sport is
 * full of people who spent a year fixing the hole everyone kept exploiting.
 */

import { clamp01 } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { Fighter } from '../domain/fighter.js';
import type { AttributeKey } from '../ratings/attributes.js';
import { skillResistance } from '../ratings/attributes.js';
import {
  TRAINING_FOCUSES,
  TRAINING_META,
  headroom,
  isPhysical,
  type TrainingFocus,
} from './development.js';

/**
 * How hard identity pulls against headroom.
 *
 * At 1 the fighter trains their strengths and nothing else; at 0 this is the old `rng.pick` with
 * extra steps. 0.7 leaves a fighter's shape recognisable across a career while still sending them
 * to work on a hole roughly one camp in four.
 */
const IDENTITY_WEIGHT = 0.7;

/** Mean current rating across the attributes a focus trains, weighted as the focus weights them. */
function affinity(fighter: Fighter, focus: TrainingFocus): number {
  const entries = Object.entries(TRAINING_META[focus].attributes) as [AttributeKey, number][];
  let sum = 0;
  let total = 0;
  for (const [key, weight] of entries) {
    sum += fighter.attributes[key] * weight;
    total += weight;
  }
  return total === 0 ? 0 : sum / total;
}

/**
 * Mean remaining room, same weighting. Zero means every camp here is wasted.
 *
 * Physicals ask a real ceiling; skills ask how hard the next point is, because they have no
 * ceiling to ask. Doc 23 § 2.1. Without the split a fighter's skills would read as infinitely
 * roomy and every AI fighter in the world would train nothing else.
 */
function room(fighter: Fighter, focus: TrainingFocus): number {
  const entries = Object.entries(TRAINING_META[focus].attributes) as [AttributeKey, number][];
  let sum = 0;
  let total = 0;
  for (const [key, weight] of entries) {
    sum +=
      (isPhysical(key)
        ? headroom(fighter.attributes[key], fighter.potential[key])
        : skillResistance(fighter.attributes[key])) * weight;
    total += weight;
  }
  return total === 0 ? 0 : sum / total;
}

/**
 * How much this fighter wants each focus, as a weight for a draw.
 *
 * Affinity is measured against the fighter's *own* mean rather than against an absolute, so this
 * expresses shape rather than level: a poor fighter still has a best discipline, and a great one
 * still has a worst. That is the same normalisation the targeting habits and the read ranking
 * needed — comparing raw numbers across differently-scaled formulas ranks the formulas.
 */
export function focusWeights(fighter: Fighter): Record<TrainingFocus, number> {
  const affinities = TRAINING_FOCUSES.map((f) => affinity(fighter, f));
  const mean = affinities.reduce((a, b) => a + b, 0) / affinities.length;

  const out = {} as Record<TrainingFocus, number>;
  TRAINING_FOCUSES.forEach((focus, i) => {
    // Around 1 for a fighter's average discipline, and roughly double for their signature.
    //
    // The slope was 3.5 first and gave a kickboxer their own block 23% of the time against 16% for
    // everything else — a preference rather than an identity, and not enough for a career to stay
    // legible. At 7 the signature block runs ~35% and the weakest ~12%, which is a fighter who
    // trains what they are and still fixes things.
    const identity = mean <= 0 ? 1 : 1 + ((affinities[i]! - mean) / mean) * 7;
    // A focus with no room left is nearly worthless, but never quite impossible: the ceiling is
    // per-attribute, and a focus trains several.
    const left = clamp01(room(fighter, focus) / 12);
    out[focus] = Math.max(0.04, identity * IDENTITY_WEIGHT + (1 - IDENTITY_WEIGHT)) * (0.15 + left);
  });
  return out;
}

/** The block this fighter takes next. */
export function pickTrainingFocus(rng: Rng, fighter: Fighter): TrainingFocus {
  const weights = focusWeights(fighter);
  return rng.pickWeighted(TRAINING_FOCUSES, (f) => weights[f]);
}
