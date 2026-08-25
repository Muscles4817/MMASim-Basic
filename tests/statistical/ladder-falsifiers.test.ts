/**
 * The ladder, measured against the fights it produces.
 *
 * Doc 31 § 9 and § 12 step 7. Everything before this validated the ladder against itself — that a
 * rating reproduces from its parameters, that a body reconstructs, that the archetypes exist. None
 * of it asked the only question that finally matters: **does a world built on this ladder fight like
 * the sport does?**
 *
 * § 9 lists ten measurements the simulation can produce that the real sport independently answers.
 * They are run here, by division, over every same-division pairing in the roster the game ships. The
 * point of doing them per division rather than in aggregate is that the ladder's whole claim is
 * about *how things change with weight*, and an aggregate number cannot disagree with that.
 *
 * **This is a report first.** § 12 step 7 is the first step allowed to touch a fight-engine
 * constant, and the discipline is the same one § 14.6 used on the cut model: measure the whole
 * surface, find which single parameter each disagreement indicts, and change at most one thing.
 * A test that can only fail the whole model tells you nothing about what to move.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_ERA, createNewGame } from '@mmasim/data';
import {
  divisionsFor,
  getDivision,
  isDecisionMethod,
  isKoMethod,
  planFor,
  simulateFight,
  type DivisionId,
  type Fighter,
} from '@mmasim/engine';

const pending: string[] = [];
const say = (line: string) => pending.push(line);
const flush = () => {
  if (pending.length > 0) console.log(pending.join('\n'));
  pending.length = 0;
};

const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

interface DivisionProfile {
  id: string;
  shortName: string;
  order: number;
  limitLbs: number;
  fights: number;
  knockdowns: number;
  headStrikes: number;
  ko: number;
  sub: number;
  decision: number;
  finishRound3Plus: number;
  finishes: number;
  totalSeconds: number;
  round1Strikes: number;
  round3Strikes: number;
  roundsWithBoth: number;
  controlSeconds: number;
  grapplingExchanges: number;
  submissionAttempts: number;
}

const EMPTY = (id: string): DivisionProfile => {
  const d = getDivision(id as DivisionId);
  return {
    id,
    shortName: d.shortName,
    order: d.order,
    limitLbs: d.limitLbs,
    fights: 0,
    knockdowns: 0,
    headStrikes: 0,
    ko: 0,
    sub: 0,
    decision: 0,
    finishRound3Plus: 0,
    finishes: 0,
    totalSeconds: 0,
    round1Strikes: 0,
    round3Strikes: 0,
    roundsWithBoth: 0,
    controlSeconds: 0,
    grapplingExchanges: 0,
    submissionAttempts: 0,
  };
};

/**
 * Every same-division pairing in the shipped roster, three rounds.
 *
 * The 2026 era by name, for the reason `roster-profile.test.ts` gives at length: `createNewGame`
 * defaults to 2020 and `DEFAULT_ERA` is 2026, and the second is what a player actually gets. A
 * measurement taken on the first would be calibrating a world nobody plays.
 */
async function profile(): Promise<DivisionProfile[]> {
  const db = createNewGame({ adapter: undefined, era: DEFAULT_ERA });
  const all = db.fighters.findAll() as Fighter[];
  const byDivision = new Map<string, DivisionProfile>();
  let n = 0;

  for (const divisionId of new Set(all.map((f) => f.divisionId))) {
    const pool = all.filter((f) => f.divisionId === divisionId);
    const row = EMPTY(divisionId as string);
    byDivision.set(divisionId as string, row);

    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const red = pool[i]!;
        const blue = pool[j]!;
        const result = simulateFight({
          boutId: `lf${n}`,
          seed: `ladder_falsifier_${n}`,
          rounds: 3,
          red: { fighter: red, plan: planFor(red, blue) },
          blue: { fighter: blue, plan: planFor(blue, red) },
        });
        n++;
        if (n % 2_000 === 0) await breathe();

        row.fights++;
        for (const corner of ['red', 'blue'] as const) {
          const s = result.stats[corner];
          row.knockdowns += s.knockdowns;
          row.headStrikes += s.strikesByTarget.head;
          row.controlSeconds += s.controlSeconds;
          row.submissionAttempts += s.submissionAttempts;
          row.grapplingExchanges += s.takedownsAttempted;
        }

        const finished = !isDecisionMethod(result.method) && result.method !== 'draw';
        if (isKoMethod(result.method)) row.ko++;
        else if (result.method === 'submission') row.sub++;
        else if (isDecisionMethod(result.method)) row.decision++;
        if (finished) {
          row.finishes++;
          if (result.round >= 3) row.finishRound3Plus++;
        }
        row.totalSeconds += (result.round - 1) * 300 + result.timeSeconds;

        // Volume decay needs a round 1 and a round 3 in the same fight, or it is measuring
        // whether fights ended early rather than whether fighters faded.
        const rounds = result.roundStats;
        if (rounds && rounds.length >= 3) {
          row.roundsWithBoth++;
          for (const corner of ['red', 'blue'] as const) {
            row.round1Strikes += rounds[0]![corner].significantStrikes;
            row.round3Strikes += rounds[2]![corner].significantStrikes;
          }
        }
      }
    }
  }

  return [...byDivision.values()].sort((a, b) => a.order - b.order);
}

const PROFILES = await profile();
const MEN = PROFILES.filter((p) => divisionsFor('male').some((d) => (d.id as string) === p.id));
const at = (shortName: string) => {
  const found = PROFILES.find((p) => p.shortName === shortName);
  if (!found) throw new Error(`no division ${shortName}`);
  return found;
};

const per100 = (row: DivisionProfile) => (100 * row.knockdowns) / Math.max(1, row.headStrikes);
const koPct = (row: DivisionProfile) => (100 * row.ko) / Math.max(1, row.fights);
const decisionPct = (row: DivisionProfile) => (100 * row.decision) / Math.max(1, row.fights);
const fade = (row: DivisionProfile) => row.round3Strikes / Math.max(1, row.round1Strikes);

describe('doc 31 § 9 — what would falsify this ladder', () => {
  it('reports all ten measurements, by division', () => {
    say('\n\n═══ § 9 measurements, by division ═══\n');
    say(
      `  ${PROFILES.reduce((a, p) => a + p.fights, 0).toLocaleString()} fights across ` +
        `${PROFILES.length} divisions, every same-division pairing in the ${DEFAULT_ERA} roster.\n`,
    );
    say(
      '  div     fights    KD/100 head   KO%   sub%   dec%   R3+ finishes   mean sec   R3:R1 volume',
    );
    for (const row of PROFILES) {
      say(
        `  ${row.shortName.padEnd(7)}${row.fights.toLocaleString().padStart(7)}` +
          `${per100(row).toFixed(2).padStart(14)}` +
          `${koPct(row).toFixed(1).padStart(7)}` +
          `${((100 * row.sub) / Math.max(1, row.fights)).toFixed(1).padStart(7)}` +
          `${decisionPct(row).toFixed(1).padStart(7)}` +
          `${((100 * row.finishRound3Plus) / Math.max(1, row.finishes)).toFixed(1).padStart(15)}` +
          `${(row.totalSeconds / Math.max(1, row.fights)).toFixed(0).padStart(11)}` +
          `${fade(row).toFixed(3).padStart(15)}`,
      );
    }
    flush();
    expect(PROFILES.length).toBeGreaterThan(8);
  });

  it('1. knockdowns per 100 head strikes rise with weight — the cleanest single test', () => {
    /**
     * § 9's headline. It isolates β_power − β_durability from pace and volume, because it is
     * normalised by the strikes actually landed: a division that throws more is not thereby more
     * dangerous per strike.
     *
     * The real sport says this rises steeply with weight. If heavyweight comes out only 1.4× a
     * flyweight, β_power is too low or β_durability too high.
     */
    const light = per100(at('FLW'));
    const heavy = per100(at('HW'));
    const ratio = heavy / light;
    say(
      `\n\n  Measurement 1: FLW ${light.toFixed(2)} → HW ${heavy.toFixed(2)} per 100 head strikes, ` +
        `a ratio of ${ratio.toFixed(2)}×.`,
    );
    flush();
    expect(ratio, `HW is ${ratio.toFixed(2)}× a flyweight per head strike landed`).toBeGreaterThan(
      1.4,
    );
    expect(
      ratio,
      `HW is ${ratio.toFixed(2)}× a flyweight — β_power is carrying too much`,
    ).toBeLessThan(6);
  });

  it('2 and 3. KO rate rises and decision rate falls across the men’s ladder', () => {
    const koRatio = koPct(at('HW')) / Math.max(0.1, koPct(at('FLW')));
    say(
      `\n  Measurement 2: KO rate HW ${koPct(at('HW')).toFixed(1)}% : FLW ` +
        `${koPct(at('FLW')).toFixed(1)}% = ${koRatio.toFixed(2)}×  (real sport ≈ 2.6×)`,
    );
    say(
      `  Measurement 3: decisions FLW ${decisionPct(at('FLW')).toFixed(1)}% → HW ` +
        `${decisionPct(at('HW')).toFixed(1)}%  (real sport ≈ 55–60% → 30–35%)`,
    );
    flush();
    expect(koRatio).toBeGreaterThan(1.3);
    expect(decisionPct(at('HW'))).toBeLessThan(decisionPct(at('FLW')));
  });

  it('4. reports round-3 volume decay, and why the population cannot answer it', () => {
    /**
     * § 9 calls this the measurement that isolates β_cardio "directly and with nothing else in the
     * way". Taken over the population it does no such thing, and the number comes out backwards:
     * flyweights fall to 0.552 of their round-one volume and heavyweights only to 0.621.
     *
     * The confound is survivorship, and it is large. A fight only contributes here if it *reached*
     * round three, and heavyweight fights mostly do not — 8.3% of heavyweight finishes come in
     * round three or later against 12.4% at flyweight, on a mean duration of 509 seconds against
     * 632. So the heavyweight bouts that see a third round are the ones between two men who could
     * still stand, which is a sample selected on exactly the trait being measured.
     *
     * It is reported rather than asserted for that reason, and the real test is the controlled one
     * in `mass-experiments.test.ts`, where the same fighter is simulated at two masses and nothing
     * is selected at all.
     */
    say('\n\n═══ Measurement 4: round-3 volume, and its confound ═══\n');
    say('  div     R3:R1 all      reached R3    mean seconds');
    for (const row of MEN) {
      say(
        `  ${row.shortName.padEnd(7)}${fade(row).toFixed(3).padStart(9)}` +
          `${((100 * row.roundsWithBoth) / Math.max(1, row.fights)).toFixed(1).padStart(15)}%` +
          `${(row.totalSeconds / Math.max(1, row.fights)).toFixed(0).padStart(16)}`,
      );
    }
    say(
      '\n  Read the middle column before the first one. Where only three fights in five reach the\n' +
        '  round being measured, the ones that do are not a sample of the division.',
    );
    flush();
    // What can honestly be asserted here: heavier divisions really do reach round three less often.
    expect(at('HW').roundsWithBoth / at('HW').fights).toBeLessThan(
      at('FLW').roundsWithBoth / at('FLW').fights,
    );
  });

  it('6. mean fight duration falls with weight', () => {
    const lightSeconds = at('FLW').totalSeconds / at('FLW').fights;
    const heavySeconds = at('HW').totalSeconds / at('HW').fights;
    say(
      `\n  Measurement 6: mean duration FLW ${lightSeconds.toFixed(0)}s → HW ${heavySeconds.toFixed(0)}s`,
    );
    flush();
    expect(heavySeconds).toBeLessThan(lightSeconds);
  });

  it('8. a light division’s best overlaps a heavy division’s middle', () => {
    /**
     * The guard on β magnitude collectively. If the exponents are too large the divisions stop
     * overlapping and the ladder has become a caste system — a flyweight would be unable to reach
     * a heavyweight's median on anything, which is false of every attribute in the real sport.
     */
    const db = createNewGame({ adapter: undefined, era: DEFAULT_ERA });
    const all = db.fighters.findAll() as Fighter[];
    const of = (
      divisionId: string,
      key: 'power' | 'speed' | 'cardio' | 'durability' | 'strength',
    ) => all.filter((f) => (f.divisionId as string) === divisionId).map((f) => f.attributes[key]);
    const mens = divisionsFor('male');
    const lightest = mens[0]!.id as string;
    const heaviest = mens[mens.length - 1]!.id as string;
    say('\n\n═══ Measurement 8: overlap ═══\n');
    say('  attribute     FLW p95   HW p50   overlap');
    for (const key of ['power', 'speed', 'cardio', 'durability', 'strength'] as const) {
      const light = [...of(lightest, key)].sort((a, b) => a - b);
      const heavy = [...of(heaviest, key)].sort((a, b) => a - b);
      const lightP95 = light[Math.floor(0.95 * (light.length - 1))]!;
      const heavyP50 = heavy[Math.floor(0.5 * (heavy.length - 1))]!;
      say(
        `  ${key.padEnd(13)}${lightP95.toFixed(0).padStart(7)}${heavyP50.toFixed(0).padStart(10)}` +
          `${lightP95 >= heavyP50 ? '   yes' : '   NO'}`,
      );
      expect(
        lightP95,
        `${key}: the best flyweight (${lightP95}) cannot reach the median heavyweight (${heavyP50})`,
      ).toBeGreaterThanOrEqual(heavyP50);
    }
    flush();
  });

  it('S3 and S5. control time and submissions stay roughly flat across the divisions', () => {
    /**
     * Doc 31 § 9.1's population statistics, and the note that comes with them: **corroborating
     * only.** Four parameters push on heavyweight submission rate, so it can never indict one of
     * them by itself. S3 is the better of the two because it is normalised per grappling exchange
     * entered, which removes "heavyweights grapple less" from the answer.
     */
    say('\n\n═══ § 9.1 S3 / S5 — grappling across the ladder ═══\n');
    say('  div     control sec per exchange   sub attempts per exchange   sub finish %');
    const controlPer: number[] = [];
    for (const row of MEN) {
      const exchanges = Math.max(1, row.grapplingExchanges);
      const control = row.controlSeconds / exchanges;
      controlPer.push(control);
      say(
        `  ${row.shortName.padEnd(7)}${control.toFixed(1).padStart(21)}` +
          `${(row.submissionAttempts / exchanges).toFixed(2).padStart(28)}` +
          `${((100 * row.sub) / Math.max(1, row.fights)).toFixed(1).padStart(15)}`,
      );
    }
    say(
      '\n  S3 predicts roughly flat and fails if it rises steeply with weight — that would be big\n' +
        '  men winning position on mass rather than on wrestling. S5 is never acted on alone.',
    );
    flush();
    const ratio = Math.max(...controlPer) / Math.min(...controlPer);
    expect(
      ratio,
      `control time per exchange varies ${ratio.toFixed(2)}× across the men's ladder`,
    ).toBeLessThan(2.2);
  });
});
