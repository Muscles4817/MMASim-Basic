import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTES_BY_GROUP,
  ATTRIBUTE_KEYS,
  applyAftermath,
  careerSummary,
  createRng,
  defaultGamePlan,
  DIVISIONS,
  applyAgeing,
  applyTraining,
  fighterAge,
  generateFighter,
  pickTrainingFocus,
  isDecisionMethod,
  isKoMethod,
  offerOpponents,
  paperOdds,
  readinessDelay,
  retirementReason,
  shouldRetire,
  simulateFight,
  type Fighter,
  type FinishMethod,
  type Coach,
  type Gym,
  type Promotion,
} from '@mmasim/engine';
import { createMemoryAdapter, createNewGame } from '@mmasim/data';
import { mean, stdDev } from '../helpers/stats.js';

/**
 * Long-horizon integrity (design pillar 7).
 *
 * A twenty-year world must not drift into nonsense: no ratings inflation, no 600-fight
 * careers, no division collapse, no immortal champions. These properties cannot be checked
 * by inspection — they only appear after thousands of simulated fights — so they are
 * enforced here rather than hoped for.
 *
 * Run with `npm run test:long`.
 */

const YEARS = 20;
const DAYS = YEARS * 365;

interface SimSummary {
  fights: number;
  methods: Record<string, number>;
  /** Career bout counts at the end of the run, for every fighter who fought at all. */
  careerLengths: number[];
  /** Per-division fight counts, to detect a division quietly dying. */
  divisionFights: Record<string, number>;
  finalFighters: Fighter[];
  startingFighters: Fighter[];
  maxHeadTrauma: number;
  retired: number;
  generated: number;
  atDebut: Map<string, Fighter>;
}

/**
 * Drive the world forward.
 *
 * Offer, book, fight, apply consequences, lay off, retire, and replace. The last two matter
 * as much as the rest: this suite originally ran a fixed roster, and what it found was a
 * world that simply emptied as the seed aged out. Attribute development lands in a later
 * milestone; everything else in the loop is here.
 */
function runLongSim(seed: string): SimSummary {
  const db = createNewGame({ adapter: createMemoryAdapter(), seed });
  const startingFighters = (db.fighters.findAll() as Fighter[]).map((f) => ({ ...f }));
  const promotions = db.promotions.findAll() as unknown as Promotion[];
  const rng = createRng(`${seed}:long`);

  const methods: Record<string, number> = {};
  const divisionFights: Record<string, number> = {};
  /** Next day each fighter is available. */
  const readyOn = new Map<string, number>();
  /** Day each fighter was last processed, so ageing is applied over real elapsed time. */
  const lastSeen = new Map<string, number>();
  /** Attributes at the moment each fighter entered the world, for the development check. */
  const atDebut = new Map<string, Fighter>();
  let fights = 0;
  let generated = 0;

  /** Replace retirees so divisions do not quietly die out. */
  const replenish = (day: number) => {
    for (const division of DIVISIONS) {
      const active = (db.fighters.findAll() as Fighter[]).filter(
        (f) => f.divisionId === division.id && f.retiredDay === undefined,
      );
      // Enough bodies to make a card without every fight being a rematch.
      const target = division.sex === 'female' ? 5 : 7;
      for (let i = active.length; i < target; i++) {
        const born = generateFighter(rng.fork(`gen:${day}:${division.id}:${i}:${generated}`), {
          id: `gen_${generated++}`,
          divisionId: division.id,
          sex: division.sex,
          day,
          promotionId: rng.pick(promotions).id,
        });
        atDebut.set(born.id as string, born);
        db.fighters.upsert(born);
      }
    }
  };

  for (let day = 0; day < DAYS; day += 14) {
    // Quarterly intake, matching how a real promotion signs people.
    if (day % 91 === 0) replenish(day);

    const available = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.retiredDay === undefined && (readyOn.get(f.id as string) ?? 0) <= day,
    );

    // A fortnight's worth of cards across the promotions.
    const cardsThisBlock = 6;
    for (let card = 0; card < cardsThisBlock; card++) {
      if (available.length < 2) break;
      const promotion = rng.pick(promotions);
      const subject = rng.pick(available);

      const offers = offerOpponents(subject, available, promotion, day, rng.fork(`m:${day}:${card}`));
      if (offers.length === 0) continue;
      const opponent = rng.pick(offers).opponent;

      const red = db.fighters.getById(subject.id as string) as Fighter;
      const blue = db.fighters.getById(opponent.id as string) as Fighter;

      const boutId = `long:${day}:${card}`;
      const result = simulateFight({
        boutId,
        red: { fighter: red, plan: defaultGamePlan() },
        blue: { fighter: blue, plan: defaultGamePlan() },
        rounds: 3,
        seed: `${seed}:${boutId}`,
      });

      const after = applyAftermath({
        result,
        red,
        blue,
        day,
        divisionId: red.divisionId,
        promotionId: red.promotionId!,
        rng: rng.fork(`a:${boutId}`),
      });

      // Between fights, fighters train and age — the same loop the player is in. Without
      // this the world is frozen: nobody improves, nobody declines, and the ratings-drift
      // assertion below is checking a world that cannot change.
      const develop = (f: Fighter): Fighter => {
        const trainRng = rng.fork(`train:${f.id}:${day}`);
        const gym = f.gymId ? (db.gyms.findById(f.gymId) as Gym | undefined) : undefined;
        const coach = f.headCoachId
          ? (db.coaches.findById(f.headCoachId) as Coach | undefined)
          : undefined;

        const trained = applyTraining({
          fighter: f,
          // `pickTrainingFocus`, not a local `rng.pick` over the five — this harness drives its
          // own booking loop rather than `advanceWorld` (see docs/19 §7.6 on what that cost last
          // time), so a copy of the world's training policy that drifts from the world's is a
          // twenty-year regression suite measuring a game nobody plays.
          focuses: [pickTrainingFocus(trainRng, f)],
          weeks: 8,
          gym,
          coach,
          day,
          rng: trainRng,
        }).fighter;

        // Age over the real elapsed time since this fighter last competed. Ageing by a fixed
        // amount per fight double-counts it: a busy fighter would lose several extra years of
        // physical prime purely for having fought often.
        const since = lastSeen.get(f.id as string) ?? day;
        lastSeen.set(f.id as string, day);
        return applyAgeing(trained, since, day, trainRng).fighter;
      };

      // Careers end. Evaluated after every fight, which is when a fighter actually decides.
      const retireRng = rng.fork(`r:${boutId}`);
      const finalise = (f: Fighter): Fighter =>
        shouldRetire(f, day, retireRng.fork(f.id as string))
          ? { ...f, retiredDay: day, notes: retirementReason(f, day) }
          : f;

      db.fighters.upsert(finalise(develop(after.red)));
      db.fighters.upsert(finalise(develop(after.blue)));

      // Whoever lost by stoppage serves the medical suspension.
      const redLost = result.winnerId !== undefined && result.winnerId !== red.id;
      const blueLost = result.winnerId !== undefined && result.winnerId !== blue.id;
      readyOn.set(red.id as string, day + readinessDelay(after.red, redLost ? result.method : undefined));
      readyOn.set(blue.id as string, day + readinessDelay(after.blue, blueLost ? result.method : undefined));

      methods[result.method] = (methods[result.method] ?? 0) + 1;
      divisionFights[red.divisionId as string] = (divisionFights[red.divisionId as string] ?? 0) + 1;
      fights++;

      // Both are now booked; do not book them again in this block.
      for (const id of [red.id, blue.id]) {
        const index = available.findIndex((f) => f.id === id);
        if (index >= 0) available.splice(index, 1);
      }
    }
  }

  const finalFighters = db.fighters.findAll() as Fighter[];
  return {
    fights,
    methods,
    careerLengths: finalFighters.map((f) => f.record.length).filter((n) => n > 0),
    divisionFights,
    finalFighters,
    startingFighters,
    maxHeadTrauma: Math.max(...finalFighters.map((f) => f.condition.headTrauma)),
    retired: finalFighters.filter((f) => f.retiredDay !== undefined).length,
    generated,
    atDebut,
  };
}

describe(`${YEARS}-year world integrity`, () => {
  const sim = runLongSim('long-sim-a');

  it('simulates a substantial number of fights', () => {
    expect(sim.fights).toBeGreaterThan(1500);
  });

  it('keeps career lengths plausible', () => {
    // Nobody should accumulate a 600-fight record because the layoff model stopped working.
    const longest = Math.max(...sim.careerLengths);
    expect(longest, `longest career was ${longest} bouts`).toBeLessThan(90);
    expect(mean(sim.careerLengths)).toBeGreaterThan(3);
  });

  it('never lets a fighter fight while they should be laid off', () => {
    // Implicitly enforced by the harness, but assert the consequence: nobody averages more
    // than a fight every ten weeks over twenty years.
    const maxPerYear = Math.max(...sim.careerLengths) / YEARS;
    expect(maxPerYear).toBeLessThan(5.5);
  });

  it('does not inflate ratings over time', () => {
    // Fighters now train and age, so individual attributes move — that is the point. What
    // must NOT happen is the *population* drifting upward, which is how a rating scale dies:
    // twenty years in, an 80 has to still mean what it meant in 2020.
    // Compares the *top* of the population, not its average. The average legitimately falls
    // as an elite seed roster is replaced by a realistic spread of newcomers; what must stay
    // put is the ceiling of the scale, because that is what makes an 80 still mean an 80.
    const topEnd = (fs: readonly Fighter[]) => {
      const all = fs.flatMap((f) => ATTRIBUTE_KEYS.map((k) => f.attributes[k])).sort((a, b) => a - b);
      return all.length === 0 ? 0 : all[Math.floor(all.length * 0.98)]!;
    };

    const startTop = topEnd(sim.startingFighters);
    const endTop = topEnd(sim.finalFighters.filter((f) => f.retiredDay === undefined));

    expect(
      endTop,
      `the top of the scale drifted ${startTop} -> ${endTop}`,
    ).toBeLessThanOrEqual(startTop + 4);

    /*
     * Nobody may exceed a *physical* ceiling, however many camps they run.
     *
     * Skills are excluded deliberately since doc 23: they no longer have a ceiling, only a
     * projection and a curve that makes each further point slower. A twenty-year specialist
     * passing the number that says where they would have settled is the model working, not
     * rating inflation — and the drift assertion immediately above is what actually guards
     * against inflation, by watching the top of the whole scale rather than one fighter.
     */
    for (const f of sim.finalFighters) {
      for (const key of ATTRIBUTES_BY_GROUP.physical) {
        expect(f.attributes[key], `${f.lastName}.${key} passed its ceiling`).toBeLessThanOrEqual(
          f.potential[key],
        );
      }
    }
  });

  it('lets fighters genuinely develop and genuinely decline', () => {
    // Seeded fighters *and* everyone who debuted during the run. The seed roster is mostly
    // at peak with very little upside left, so measuring only them would test the wrong half
    // of the population.
    const before = new Map<string, Fighter>([
      ...sim.startingFighters.map((f) => [f.id as string, f] as const),
      ...sim.atDebut,
    ]);
    let improved = 0;
    let declined = 0;

    for (const after of sim.finalFighters) {
      const start = before.get(after.id as string);
      if (!start) continue;
      const delta =
        ATTRIBUTE_KEYS.reduce((a, k) => a + after.attributes[k], 0) -
        ATTRIBUTE_KEYS.reduce((a, k) => a + start.attributes[k], 0);
      if (delta > 6) improved++;
      if (delta < -6) declined++;
    }

    // Both must happen. A world where everyone only improves has no arc, and one where
    // everyone only declines has no hope.
    expect(improved, 'nobody improved over twenty years').toBeGreaterThan(0);
    expect(declined, 'nobody declined over twenty years').toBeGreaterThan(0);
  });

  it('keeps every division alive', () => {
    // A division that stops producing fights has quietly died, usually because everyone in
    // it is permanently injured or has fought everyone recently.
    const active = Object.entries(sim.divisionFights).filter(([, n]) => n > 10);
    expect(active.length, JSON.stringify(sim.divisionFights)).toBeGreaterThanOrEqual(10);
  });

  it('produces a stable, plausible finish distribution across two decades', () => {
    const total = sim.fights;
    const ko = Object.entries(sim.methods)
      .filter(([m]) => isKoMethod(m as FinishMethod))
      .reduce((a, [, n]) => a + n, 0);
    const sub = sim.methods.submission ?? 0;
    const dec = Object.entries(sim.methods)
      .filter(([m]) => isDecisionMethod(m as FinishMethod))
      .reduce((a, [, n]) => a + n, 0);
    const draw = sim.methods.draw ?? 0;
    // Fouls can end a night without a result. These are deliberately their own bucket
    // rather than folded into "draw": a no contest is not a draw, and lumping them would
    // hide a regression in the foul system behind a bound that was set for draws.
    const noResult = (sim.methods.noContest ?? 0) + (sim.methods.dq ?? 0);

    const describe_ = `KO ${((ko / total) * 100).toFixed(1)}% SUB ${((sub / total) * 100).toFixed(1)}% DEC ${((dec / total) * 100).toFixed(1)}% DRAW ${((draw / total) * 100).toFixed(1)}% NR ${((noResult / total) * 100).toFixed(1)}%`;

    expect(ko / total, describe_).toBeGreaterThan(0.15);
    expect(ko / total, describe_).toBeLessThan(0.6);
    expect(sub / total, describe_).toBeGreaterThan(0.03);
    expect(dec / total, describe_).toBeGreaterThan(0.2);
    expect(draw / total, describe_).toBeLessThan(0.06);
    // A world where 5% of fights are waved off is not a sport anybody would watch.
    expect(noResult / total, describe_).toBeLessThan(0.015);

    // Exhaustiveness. This is the assertion that caught fouls being added: every finish
    // method must land in exactly one bucket, so a new one cannot be introduced without
    // somebody deciding, here, what it means for the world.
    expect(ko + sub + dec + draw + noResult, describe_).toBe(total);
  });

  it('accumulates career damage without letting it run away', () => {
    expect(sim.maxHeadTrauma).toBeLessThanOrEqual(100);
    // Twenty years of fights should genuinely wear people down — if nobody accumulates real
    // trauma, the whole career-arc system is inert.
    expect(sim.maxHeadTrauma).toBeGreaterThan(40);
  });

  it('gives acquired traits to the fighters who earned them', () => {
    const chinny = sim.finalFighters.filter((f) => f.traits.includes('chinny'));
    const gunShy = sim.finalFighters.filter((f) => f.traits.includes('gunShy'));
    // Both must actually occur, and neither may consume the roster.
    expect(chinny.length + gunShy.length).toBeGreaterThan(0);
    expect(chinny.length).toBeLessThan(sim.finalFighters.length * 0.5);
  });

  it('keeps star power and reputation inside their scales', () => {
    for (const f of sim.finalFighters) {
      expect(f.starPower).toBeGreaterThanOrEqual(1);
      expect(f.starPower).toBeLessThanOrEqual(100);
      expect(f.reputation).toBeGreaterThanOrEqual(1);
      expect(f.reputation).toBeLessThanOrEqual(100);
      expect(f.condition.confidence).toBeGreaterThanOrEqual(1);
      expect(f.condition.confidence).toBeLessThanOrEqual(100);
    }
  });

  it('does not collapse star power into a single runaway name', () => {
    const stars = sim.finalFighters.map((f) => f.starPower);
    // If one fighter hoovers up every point of star power, the business layer is broken.
    expect(stdDev(stars)).toBeLessThan(35);
    expect(stars.filter((s) => s >= 99).length).toBeLessThan(8);
  });

  it('keeps every record internally consistent after thousands of fights', () => {
    for (const f of sim.finalFighters) {
      expect(f.summary, `${f.lastName}'s summary drifted from their record`).toEqual(
        careerSummary(f),
      );
    }
  });

  it('is fully reproducible from the seed', () => {
    const a = runLongSim('repro');
    const b = runLongSim('repro');
    expect(a.fights).toBe(b.fights);
    expect(a.methods).toEqual(b.methods);
    expect(a.finalFighters.map((f) => f.summary)).toEqual(b.finalFighters.map((f) => f.summary));
  });
});

describe('paper odds stay meaningful over a long run', () => {
  it('still favours the better fighter after twenty years of results', () => {
    const sim = runLongSim('odds-drift');
    const sorted = [...sim.finalFighters].sort((a, b) => b.reputation - a.reputation);
    const top = sorted[0]!;
    const bottom = sorted[sorted.length - 1]!;
    // Reputation moves with results; it must not invert relative to ability.
    expect(paperOdds(top, bottom)).toBeGreaterThan(0.35);
  });
});

describe('careers end', () => {
  it('retires a substantial share of the roster over twenty years', () => {
    const sim = runLongSim('retire');
    // Not everyone: the seed contains 26-year-olds who are still only 46 at the end.
    expect(sim.retired).toBeGreaterThan(20);
    // And the sport must keep replacing them, or the world dies out.
    expect(sim.generated).toBeGreaterThan(40);
    expect(sim.finalFighters.filter((f) => f.retiredDay === undefined).length).toBeGreaterThan(40);
  });
});

describe('nobody fights past a plausible age', () => {
  it('does not produce active 60-year-olds', () => {
    const sim = runLongSim('ageing');
    for (const f of sim.finalFighters) {
      if (f.record.length === 0) continue;
      const lastFight = f.record[f.record.length - 1]!;
      const ageAtLastFight = fighterAge(f, lastFight.day);
      expect(ageAtLastFight, `${f.lastName} was still fighting at ${ageAtLastFight}`).toBeLessThan(53);
    }
  });
});
