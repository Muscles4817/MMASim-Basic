/**
 * Is a generated world actually playable on the day it opens?
 *
 * Doc 27 § 4.2 says to "build the population at start-date minus N years, then run the sport at low
 * fidelity up to the start date". What shipped builds the population *at* the start date, runs
 * eight years past it, and winds the clock back — and the clock is the only thing that winds back.
 * Everything pre-history stamped in absolute game days stays where it was written, in what is now
 * the future.
 *
 * Two of those matter enough to break the game, and neither is visible from a screenshot:
 *
 *  - **`readyOnDay`.** `readinessDelay` stamps an absolute day after every loss. Wind the clock
 *    back eight years and nine fighters in ten are serving a medical suspension that ends years
 *    after the game begins. Every matchmaking path in the codebase filters on it.
 *  - **`birthDay` versus the record.** A fighter who was 25 when the generator built them fought
 *    through pre-history to 33 and is 25 again afterwards, holding a 33-year-old's record. The
 *    fighters who *debuted* during pre-history come out as children with professional records.
 *
 * This prints both, plus the consequence that matters — how many cards the sport actually stages
 * once the player is in it.
 *
 *   npx vite-node tools/generated-world-audit.ts
 *   SIZE=medium DAYS=180 npx vite-node tools/generated-world-audit.ts
 */

import { createNewGame, getWorld, type GameDb } from '@mmasim/data';
import { fighterAge, type Fighter, type Promotion } from '@mmasim/engine';
import { generateWorld } from '../packages/app/src/game/newWorld';
import { advanceWorld } from '../packages/app/src/game/world';

const SIZE = (process.env.SIZE ?? 'small') as 'small' | 'medium' | 'large';
/** How far to run the world *after* generation, to see whether the sport moves. */
const DAYS = Number(process.env.DAYS ?? 120);

const pct = (n: number, of: number) => `${((n / Math.max(1, of)) * 100).toFixed(1)}%`;

function quantiles(values: readonly number[]): string {
  if (values.length === 0) return 'none';
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return `min ${sorted[0]}  p25 ${at(0.25)}  median ${at(0.5)}  p75 ${at(0.75)}  max ${sorted[sorted.length - 1]}`;
}

/**
 * The same measurements against the hand-authored 2026 era.
 *
 * A control, and the only honest way to read the generated numbers: "median age 29" means nothing
 * on its own and means a great deal beside the 28 of the world a person wrote by hand. Anything
 * the seeded world also does is the game working as designed rather than the generator failing.
 */
function control(): string {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const day = getWorld(db).day;
  const active = (db.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);
  const bookable = active.filter((f) => (f.readyOnDay ?? 0) <= day);
  const before = db.events.findAll().length;
  advanceWorld(db, day, day + DAYS, {});
  const promotions = db.promotions.findAll().length;

  return [
    `promotions ${promotions}`,
    `active ${active.length}`,
    `ages ${quantiles(active.map((f) => fighterAge(f, day)))}`,
    `bookable ${pct(bookable.length, active.length)}`,
    `cards in ${DAYS} days ${db.events.findAll().length - before}`,
  ].join('\n                         ');
}

async function main(): Promise<void> {
  const started = Date.now();
  const db: GameDb = await generateWorld({ size: SIZE, yieldToUi: async () => {} });
  const world = getWorld(db);
  const day = world.day;

  const all = db.fighters.findAll() as Fighter[];
  const active = all.filter((f) => f.retiredDay === undefined);
  const withRecord = active.filter((f) => f.record.length > 0);

  // --- Is the world internally dated? ---------------------------------------------------------
  const futureRecord = withRecord.filter((f) => f.record[f.record.length - 1]!.day > day);
  const suspended = active.filter((f) => (f.readyOnDay ?? 0) > day);
  const worstSuspension = Math.max(0, ...active.map((f) => (f.readyOnDay ?? 0) - day));

  // --- Are the people plausible? ---------------------------------------------------------------
  const ages = active.map((f) => fighterAge(f, day));
  const children = active.filter((f) => fighterAge(f, day) < 18);
  const childrenWithRecords = children.filter((f) => f.record.length > 0);

  // --- Can anybody be booked? -------------------------------------------------------------------
  const bookable = active.filter((f) => (f.readyOnDay ?? 0) <= day);

  // --- Does the sport move once the player is in it? ---------------------------------------------
  const eventsBefore = db.events.findAll().length;
  advanceWorld(db, day, day + DAYS, {});
  const eventsAfter = db.events.findAll().length;

  const promotions = db.promotions.findAll() as unknown as Promotion[];

  console.log(`\n=== generated world audit — ${SIZE}, built in ${Date.now() - started}ms ===\n`);
  console.log(`start day            ${day}   startedDay ${world.startedDay ?? '(unset)'}`);
  console.log(`promotions           ${promotions.length}`);
  console.log(`fighters             ${all.length} (${active.length} active)`);
  console.log('');
  console.log('--- dated in the future (should all be zero) ---');
  console.log(
    `last fight after today   ${futureRecord.length} of ${withRecord.length}  ${pct(futureRecord.length, withRecord.length)}`,
  );
  console.log(
    `medically suspended      ${suspended.length} of ${active.length}  ${pct(suspended.length, active.length)}   worst ${worstSuspension} days`,
  );
  console.log('');
  console.log('--- the population ---');
  console.log(`ages                     ${quantiles(ages)}`);
  console.log(
    `under 18                 ${children.length}  (${childrenWithRecords.length} of them holding a pro record)`,
  );
  console.log(
    `mean real bouts          ${(withRecord.reduce((n, f) => n + f.record.length, 0) / Math.max(1, withRecord.length)).toFixed(1)}`,
  );
  console.log('');
  console.log('--- can the game be played ---');
  console.log(
    `bookable on day one      ${bookable.length} of ${active.length}  ${pct(bookable.length, active.length)}`,
  );
  console.log(`cards in the next ${DAYS} days   ${eventsAfter - eventsBefore}`);
  console.log('');
  console.log('--- control: the hand-authored 2026 era, same measurements ---');
  console.log(`                         ${control()}`);
  console.log('');
}

await main();
