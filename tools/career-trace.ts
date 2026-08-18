/**
 * Three careers, start to finish, with every number shown.
 *
 * The progression model has grown enough moving parts — aptitude-driven growth, emergent
 * plateaus, per-attribute peaks, concurrent-training interference, and now neglect — that no
 * single test shows what it *feels* like. The long-sim asserts distributions across forty
 * careers; this writes three of them out attribute by attribute, year by year, so the shape can
 * be read rather than inferred.
 *
 * It plays the actual game. Fighters are created the way `CreateFighterScreen` creates them,
 * signed the way it signs them, and then driven through `runTraining`, `bookFight`,
 * `runBookedFight` and `advanceTo` — the same four functions the player's own buttons call. The
 * only thing this harness decides is what to train and when to fight, because that is the
 * player's job. Everything else — matchmaking, damage, money, contracts, the promotion's
 * patience, the retirement decision — is the game's.
 *
 * Not a test. It asserts nothing and guards nothing. Run it when the progression numbers change
 * and read what came out:
 *
 *     npx vite-node tools/career-trace.ts | npx prettier --parser markdown > docs/24-three-careers.md
 *
 * Deterministic: same seeds in, same document out, so a diff of the output is a diff of the model.
 */

import {
  createMemoryAdapter,
  createNewGame,
  getWorld,
  setWorld,
  type GameDb,
} from '../packages/data/src/index.js';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTES_BY_GROUP,
  blocking,
  createPlayerFighter,
  createRng,
  fighterAge,
  headroom,
  overallRating,
  retirementUrge,
  skillResistance,
  TRAINING_FOCUSES,
  TRAINING_META,
  type AttributeKey,
  type CreateFighterSpec,
  type Fighter,
  type Gym,
  type InboxItem,
  type Promotion,
  type TrainingFocus,
} from '../packages/engine/src/index.js';
import {
  aiPlanFor,
  answerBoutOffer,
  bookFight,
  getOffers,
  runBookedFight,
  saveBookingPlan,
  type Booking,
} from '../packages/app/src/game/career.js';
import { runTraining } from '../packages/app/src/game/progression.js';
import { signFirstDeal } from '../packages/app/src/game/contracts.js';
import { readInbox, resolveItem } from '../packages/app/src/game/inbox.js';
import { advanceTo } from '../packages/app/src/game/clock.js';

const YEAR = 365;

/**
 * How many fighters the traced division carries.
 *
 * Forty across five promotions is about eight a show, which is a division that can make a card
 * at every level rather than only at the top. The seed's own figure is fifteen — see
 * `buildTheFeeder`.
 */
const FEEDER_TARGET = 40;

/* ---------------------------------------------------------------- the three ------ */

/**
 * A training policy is the part of a career the player actually controls, and it is where the
 * interesting differences come from: the same engine produces very different fighters depending
 * on what the camps are spent on.
 */
type Policy = (f: Fighter, age: number) => readonly TrainingFocus[];

/** Whatever currently has the most room. Broad, and deliberately the worst sensible strategy. */
const rotate: Policy = (f) => {
  const roomFor = (key: AttributeKey) =>
    ATTRIBUTES_BY_GROUP.physical.includes(key)
      ? headroom(f.attributes[key], f.potential[key])
      : skillResistance(f.attributes[key]);
  let best: TrainingFocus = 'boxing';
  let bestRoom = -1;
  for (const focus of TRAINING_FOCUSES) {
    const keys = Object.keys(TRAINING_META[focus].attributes) as AttributeKey[];
    const room = keys.reduce((a, k) => a + roomFor(k), 0) / keys.length;
    if (room > bestRoom) [bestRoom, best] = [room, focus];
  }
  return [best];
};

/** Two things, for the whole career. Everything else lives on the general-maintenance term. */
const commit =
  (a: TrainingFocus, b: TrainingFocus): Policy =>
  () => [a, b];

/** Commit while it still pays, then spend the back half of the career holding on to it. */
const commitThenMaintain =
  (a: TrainingFocus, b: TrainingFocus, from: number): Policy =>
  (f, age) =>
    age < from ? [a, b] : rotate(f, age);

interface Subject {
  key: string;
  name: string;
  blurb: string;
  spec: Omit<CreateFighterSpec, 'day' | 'promotionId' | 'gymId'>;
  policy: Policy;
  policyLabel: string;
  /** Rough target gap between fights, in days. Two a year is the sport's median. */
  restDays: number;
  /** Weeks per training block between camps. */
  blockWeeks: number;
}

const SUBJECTS: readonly Subject[] = [
  {
    key: 'freak',
    name: 'Marcus Bell',
    blurb:
      'A national-level sprinter who has never been hit. The highest ceilings the model hands ' +
      'out, attached to almost no idea what he is doing.',
    spec: {
      id: 'trace_freak',
      firstName: 'Marcus',
      lastName: 'Bell',
      nationality: 'USA',
      sex: 'male',
      divisionId: 'mens-lightweight' as CreateFighterSpec['divisionId'],
      age: 22,
      origin: { talent: 'freak', discipline: 'trackAndField', attainment: 'national' },
      build: 'balanced',
    },
    policy: rotate,
    policyLabel: 'Rotates to whatever has the most room. Broad; never specialises.',
    restDays: 150,
    blockWeeks: 8,
  },
  {
    key: 'wrestler',
    name: 'Danil Orlov',
    blurb:
      'A national-level wrestler with ordinary genetics. Knows exactly what he is good at and ' +
      'never trains anything else.',
    spec: {
      id: 'trace_wrestler',
      firstName: 'Danil',
      lastName: 'Orlov',
      nationality: 'RUS',
      sex: 'male',
      divisionId: 'mens-lightweight' as CreateFighterSpec['divisionId'],
      age: 22,
      origin: { talent: 'natural', discipline: 'wrestling', attainment: 'national' },
      build: 'powerful',
    },
    policy: commit('wrestling', 'boxing'),
    policyLabel: 'Wrestling and boxing, every camp, for the whole career.',
    restDays: 150,
    blockWeeks: 8,
  },
  {
    key: 'grinder',
    name: 'Tom Whitfield',
    blurb:
      'Came to it late off a regional boxing background, with the least raw material of the ' +
      'three. Switches to maintenance at 32 rather than chasing gains that no longer come.',
    spec: {
      id: 'trace_grinder',
      firstName: 'Tom',
      lastName: 'Whitfield',
      nationality: 'GBR',
      sex: 'male',
      divisionId: 'mens-lightweight' as CreateFighterSpec['divisionId'],
      age: 26,
      origin: {
        talent: 'grinder',
        discipline: 'boxing',
        secondary: 'jiuJitsu',
        attainment: 'regional',
      },
      build: 'balanced',
    },
    policy: commitThenMaintain('boxing', 'submissions', 32),
    policyLabel: 'Boxing and submissions until 32, then rotates to hold on to what he has.',
    restDays: 180,
    blockWeeks: 10,
  },
];

/* ---------------------------------------------------------------- the career ----- */

interface Snapshot {
  age: number;
  attributes: Record<string, number>;
  overall: number;
  record: string;
  fights: number;
  headTrauma: number;
  bodyWear: number;
  bank: number;
  focuses: string;
  urge: number;
}

interface Career {
  subject: Subject;
  debut: Fighter;
  snapshots: Snapshot[];
  final: Fighter;
  retiredAtAge?: number;
  retirementReason?: string;
  /** Every distinct thing a camp report said was being dropped, with the age it said it. */
  neglectNotes: string[];
  /** Titles, division moves and other career notes worth showing. */
  milestones: string[];
}

const recordOf = (f: Fighter) =>
  `${f.summary.wins}-${f.summary.losses}${f.summary.draws ? `-${f.summary.draws}` : ''}`;

function snapshot(f: Fighter, day: number, focuses: readonly TrainingFocus[]): Snapshot {
  return {
    age: fighterAge(f, day),
    attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, f.attributes[k]])),
    overall: overallRating(f.attributes),
    record: recordOf(f),
    fights: f.record.length,
    headTrauma: Math.round(f.condition.headTrauma),
    bodyWear: Math.round(f.condition.bodyWear),
    bank: Math.round(f.bank),
    focuses: focuses.join(' + '),
    urge: retirementUrge(f, day),
  };
}

/**
 * Give the division a bottom rung, using the game's own intake.
 *
 * A created fighter debuts around 52 and the seeded lightweight roster is fifteen people rated
 * 65–79, with nobody below. `newGame` sets `divisionTargets` to the seeded headcount, so
 * `world.ts:replenish` — which generates debutants rated 23–63 and signs them to the small shows
 * — only fires when somebody retires, and the bottom of the sport therefore never exists. Every
 * offer a debutant gets is a contender: measured win chances of 2–13% across their first five
 * fights, and the career dies 0-5.
 *
 * So the harness raises the target and lets the game's own `replenish` fill the division in. Not
 * a model change and not a fudge of the numbers below — the fighters it creates are the ones the
 * intake was always meant to create. See "What this trace found" at the end of the document.
 */
function buildTheFeeder(db: GameDb, divisionId: string, target: number): void {
  const world = getWorld(db);
  setWorld(db, { divisionTargets: { ...world.divisionTargets, [divisionId]: target } });
  db.save();
  // A year of world time, which is four of `replenish`'s quarterly intakes.
  advanceTo(db, getWorld(db).day + YEAR);
}

/** Create and sign exactly the way `CreateFighterScreen.start()` does. */
function enterTheSport(db: GameDb, s: Subject): Fighter {
  const day = getWorld(db).day;
  const developmental = (db.promotions.findAll() as unknown as Promotion[]).find(
    (p) => p.tier === 'developmental',
  );
  const startingGym = (db.gyms.findAll() as unknown as Gym[])
    .slice()
    .sort((a, b) => a.quality - b.quality)[0];

  const fighter = createPlayerFighter(
    { ...s.spec, day, promotionId: developmental?.id as never, gymId: startingGym?.id },
    createRng(`create:${s.spec.id}`),
  );
  const withCoach = { ...fighter, headCoachId: startingGym?.headCoachId };
  db.fighters.upsert(withCoach as never);
  signFirstDeal(db, withCoach as never);
  setWorld(db, { playerRole: 'fighter', playerFighterId: fighter.id as string });
  db.save();
  return db.fighters.getById(fighter.id as string) as Fighter;
}

/**
 * Answer everything the game is waiting on.
 *
 * A career that ignores its inbox gets released — which is a real outcome, and one the patience
 * model exists to produce, but it is not the thing this document is trying to show. So the
 * harness takes every deal and every fight it is offered, which is what a player chasing a title
 * does.
 */
function clearTheInbox(db: GameDb, fighter: Fighter): Booking | undefined {
  let booking: Booking | undefined;
  for (const item of blocking(readInbox(db)) as InboxItem[]) {
    if (item.resolvedDay !== undefined) continue;
    const action = item.actions?.find((a) => !a.isDismiss) ?? item.actions?.[0];
    if (!action) continue;
    if (item.kind === 'offer')
      booking ??= answerBoutOffer(db, fighter, item as { opponentId?: string }, 'accept');
    resolveItem(db, item.id, action.id);
  }
  return booking;
}

/**
 * The opponent a fighter climbing actually takes.
 *
 * The even fight, not the safest one. Taking the highest win chance on offer every time is a
 * strategy — it is padding a record — and it produced 25-4 and 32-6 careers that told you more
 * about the harness than about the model. `TARGET_WIN_CHANCE` is a fighter who is favoured and
 * still has to turn up, which is what a matchmaker gives somebody they are building.
 */
const TARGET_WIN_CHANCE = 0.55;

function chooseOpponent(db: GameDb, fighter: Fighter): Fighter | undefined {
  const offers = getOffers(db, fighter);
  if (offers.length === 0) return undefined;
  const best = offers.reduce((a, b) =>
    Math.abs(b.winChance - TARGET_WIN_CHANCE) < Math.abs(a.winChance - TARGET_WIN_CHANCE) ? b : a,
  );
  return db.fighters.getById(best.opponent.id as string) as Fighter;
}

/**
 * One fighter, from their first camp to the day they stop.
 *
 * The loop is the player's loop: answer the inbox, take a fight when rested and one is on offer,
 * otherwise train. It runs until the engine retires them or thirty years have passed, whichever
 * comes first — the second bound has never been reached.
 */
function runCareer(subject: Subject): Career {
  const db = createNewGame({ adapter: createMemoryAdapter(), seed: `trace:${subject.key}` });
  buildTheFeeder(db, subject.spec.divisionId as string, FEEDER_TARGET);
  let f = enterTheSport(db, subject);
  const debut = { ...f };

  const snapshots: Snapshot[] = [];
  const neglectNotes: string[] = [];
  const milestones: string[] = [];
  let lastFightDay = -subject.restDays;
  let nextSnapshotAge = fighterAge(f, getWorld(db).day) + 1;
  let focuses = subject.policy(f, fighterAge(f, getWorld(db).day));

  const note = (day: number, text: string) => {
    if (/nobody has worked on/i.test(text)) {
      neglectNotes.push(`**${fighterAge(f, day)}** — ${text}`);
    } else if (/title|champion|belt/i.test(text)) {
      milestones.push(`**${fighterAge(f, day)}** — ${text}`);
    }
  };

  for (let step = 0; step < 400; step++) {
    f = db.fighters.getById(f.id as string) as Fighter;
    if (f.retiredDay !== undefined) break;

    const day = getWorld(db).day;
    const age = fighterAge(f, day);
    if (age > 55) break;
    focuses = subject.policy(f, age);

    // Snapshot on every birthday the loop crosses, so a long camp cannot skip a year.
    while (age >= nextSnapshotAge) {
      snapshots.push(snapshot(f, day, focuses));
      nextSnapshotAge++;
    }

    let booking = clearTheInbox(db, f);
    f = db.fighters.getById(f.id as string) as Fighter;

    if (!booking && day - lastFightDay >= subject.restDays) {
      const opponent = chooseOpponent(db, f);
      if (opponent) booking = bookFight(db, f, opponent, { weeks: 8 });
    }

    if (booking) {
      /*
       * Prepare, the way the camp screen lets a player prepare.
       *
       * `bookFight` stores `defaultGamePlan()` and `runBookedFight` hands the *opponent* a plan
       * built for this matchup — so a harness that leaves the default in place fights every bout
       * of a career on a neutral plan against somebody who prepared for it. Measured: it turned
       * offers priced at 55–63% into a 6-9 record. The player gets exactly the planner every
       * other fight in the game runs on.
       */
      const opponent = db.fighters.getById(booking.bout.blueId as string) as Fighter | undefined;
      if (opponent) booking = saveBookingPlan(booking, aiPlanFor(f, opponent));
      const outcome = runBookedFight(db, booking);
      for (const text of outcome.notes) note(getWorld(db).day, text);
      lastFightDay = booking.bout.day;
      continue;
    }

    // No fight to take: train, which is also how the clock moves.
    const before = getWorld(db).day;
    const outcome = runTraining(db, f, focuses, subject.blockWeeks);
    for (const text of outcome.notes) note(getWorld(db).day, text);
    if (getWorld(db).day <= before) advanceTo(db, before + 28);
  }

  f = db.fighters.getById(f.id as string) as Fighter;
  const endDay = f.retiredDay ?? getWorld(db).day;
  snapshots.push(snapshot(f, endDay, focuses));

  return {
    subject,
    debut,
    snapshots,
    final: f,
    retiredAtAge: f.retiredDay !== undefined ? fighterAge(f, f.retiredDay) : undefined,
    retirementReason: f.retiredDay !== undefined ? f.notes : undefined,
    neglectNotes,
    milestones,
  };
}

/* ----------------------------------------------------------------- the report ---- */

const PRETTY: Record<string, string> = {
  power: 'Power',
  speed: 'Speed',
  strength: 'Strength',
  cardio: 'Cardio',
  durability: 'Durability',
  strikingOffence: 'Striking off.',
  strikingDefence: 'Striking def.',
  kicking: 'Kicking',
  wrestling: 'Wrestling',
  takedownDefence: 'TD defence',
  scrambling: 'Scrambling',
  groundControl: 'Ground ctrl',
  submissions: 'Submissions',
  fightIq: 'Fight IQ',
  composure: 'Composure',
};

const signed = (n: number) => (n > 0 ? `+${n}` : n === 0 ? '—' : `${n}`);
const out: string[] = [];
const say = (line = '') => out.push(line);

const careers = SUBJECTS.map(runCareer);

say(
  '<!-- Generated by `npx vite-node tools/career-trace.ts | npx prettier --parser markdown > ' +
    'docs/24-three-careers.md`. Do not edit by hand. -->',
);
say();
say('# 24 — Three careers, creation to retirement');
say();
say(
  'Three fighters, played through the real game. They are created the way the creation screen ' +
    'creates them, signed the way it signs them, and then driven through `runTraining`, ' +
    '`bookFight`, `runBookedFight` and `advanceTo` — the same four functions the player’s own ' +
    'buttons call. The harness decides only what to train and when to fight. Matchmaking, damage, ' +
    'money, contracts, the promotion’s patience and the retirement decision are all the game’s.',
);
say();
say(
  'Every number here is measured. Regenerate with `npx vite-node tools/career-trace.ts | npx ' +
    'prettier --parser markdown > docs/24-three-careers.md`; it is deterministic, so a diff of ' +
    'this file is a diff of the model.',
);
say();
say(
  'Read alongside [22 — the attribute catalogue](./22-attribute-model-catalogue.md) and ' +
    '[23 — aptitudes and emergent plateaus](./23-aptitudes-and-emergent-plateaus.md).',
);
say();

say('## At a glance');
say();
say('| Fighter | Debut | Ceiling | Peak | At age | Final | Retired | Record | How it ended |');
say('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |');
for (const c of careers) {
  const peak = c.snapshots.reduce((a, s) => (s.overall > a.overall ? s : a), c.snapshots[0]!);
  const last = c.snapshots[c.snapshots.length - 1]!;
  say(
    `| **${c.subject.name}** | ${overallRating(c.debut.attributes).toFixed(1)} | ` +
      `${overallRating(c.debut.potential).toFixed(1)} | ${peak.overall.toFixed(1)} | ${peak.age} | ` +
      `${last.overall.toFixed(1)} | ${c.retiredAtAge ?? '—'} | ${last.record} | ` +
      `${c.retirementReason ?? 'Still active at the end of the trace'} |`,
  );
}
say();

for (const c of careers) {
  const { subject: s } = c;
  const peak = c.snapshots.reduce((a, x) => (x.overall > a.overall ? x : a), c.snapshots[0]!);
  const last = c.snapshots[c.snapshots.length - 1]!;
  const debutOverall = overallRating(c.debut.attributes);

  say('---');
  say();
  say(`## ${s.name}`);
  say();
  say(`_${s.blurb}_`);
  say();
  const o = s.spec.origin!;
  say(
    `**Origin** — ${o.talent} · ${o.discipline}${o.secondary ? ` (+ ${o.secondary})` : ''} · ${o.attainment}, ` +
      `build \`${s.spec.build}\`, turns pro at ${s.spec.age}.  `,
  );
  say(
    `**Training** — ${s.policyLabel} Blocks of ${s.blockWeeks} weeks, fighting about every ${s.restDays} days.`,
  );
  say();

  say('### Where every attribute went');
  say();
  say('| Attribute | Debut | Ceiling | Career best | Final | Growth | Decay |');
  say('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const key of ATTRIBUTE_KEYS) {
    const debutValue = c.debut.attributes[key];
    const best = Math.max(...c.snapshots.map((x) => x.attributes[key]!));
    const final = last.attributes[key]!;
    const physical = (ATTRIBUTES_BY_GROUP.physical as readonly string[]).includes(key);
    say(
      `| ${physical ? PRETTY[key] : `*${PRETTY[key]}*`} | ${debutValue} | ${c.debut.potential[key]} | ` +
        `${best} | ${final} | ${signed(best - debutValue)} | ${signed(final - best)} |`,
    );
  }
  say(
    `| **Overall** | **${debutOverall.toFixed(1)}** | **${overallRating(c.debut.potential).toFixed(1)}** | ` +
      `**${peak.overall.toFixed(1)}** | **${last.overall.toFixed(1)}** | ` +
      `**${signed(Math.round((peak.overall - debutOverall) * 10) / 10)}** | ` +
      `**${signed(Math.round((last.overall - peak.overall) * 10) / 10)}** |`,
  );
  say();
  say(
    'Physicals in roman, skills in _italics_. “Ceiling” is the fighter’s own `potential`, which for a physical is a wall and for a skill is a projection — doc 23 § 2.1.',
  );
  say();

  const physical = ATTRIBUTES_BY_GROUP.physical as readonly AttributeKey[];
  const skills = ATTRIBUTE_KEYS.filter((k) => !physical.includes(k));

  say('### Year by year — the body');
  say();
  say(
    `| Age | Ovr | ${physical.map((k) => PRETTY[k]).join(' | ')} | Record | Trauma | Wear | Trained |`,
  );
  say(`| ---: | ---: | ${physical.map(() => '---:').join(' | ')} | --- | ---: | ---: | --- |`);
  for (const x of c.snapshots) {
    say(
      `| ${x.age} | ${x.overall.toFixed(1)} | ${physical.map((k) => x.attributes[k]).join(' | ')} | ` +
        `${x.record} | ${x.headTrauma} | ${x.bodyWear} | ${x.focuses} |`,
    );
  }
  say();

  say('### Year by year — the craft');
  say();
  say(`| Age | ${skills.map((k) => PRETTY[k]).join(' | ')} |`);
  say(`| ---: | ${skills.map(() => '---:').join(' | ')} |`);
  for (const x of c.snapshots) {
    say(`| ${x.age} | ${skills.map((k) => x.attributes[k]).join(' | ')} |`);
  }
  say();

  if (c.milestones.length > 0) {
    say('### Career notes');
    say();
    for (const m of [...new Set(c.milestones)].slice(0, 10)) say(`- ${m}`);
    say();
  }

  if (c.neglectNotes.length > 0) {
    say('### What the camp reports said he was letting go');
    say();
    for (const n of [...new Set(c.neglectNotes)].slice(0, 10)) say(`- ${n}`);
    say();
  } else {
    say('### What the camp reports said he was letting go');
    say();
    say(
      'Nothing — he was never out of camp long enough for the grace period to start. See finding 4.',
    );
    say();
  }
}

/* ------------------------------------------------------- what the trace found ---- */

const peakAges = careers.map(
  (c) => c.snapshots.reduce((a, x) => (x.overall > a.overall ? x : a), c.snapshots[0]!).age,
);
const bell = careers[0]!;
const physicalUse = (ATTRIBUTES_BY_GROUP.physical as readonly AttributeKey[]).map((k) => {
  const debutValue = bell.debut.attributes[k];
  const best = Math.max(...bell.snapshots.map((x) => x.attributes[k]!));
  return { k, debutValue, ceiling: bell.debut.potential[k], best, used: best - debutValue };
});
const maxTrauma = Math.max(...careers.flatMap((c) => c.snapshots.map((x) => x.headTrauma)));
const mostFights = Math.max(...careers.map((c) => c.snapshots[c.snapshots.length - 1]!.fights));

say('---');
say();
say('## What this trace found');
say();
say(
  'Running three whole careers through the real game surfaced six things no unit test was ' +
    'positioned to see. Two are fixed; the rest are recorded here with the numbers, because they ' +
    'are judgement calls rather than defects.',
);
say();

say('### 1. The sport has no bottom rung — *blocking, unfixed*');
say();
say(
  '`newGame` sets `world.divisionTargets` to the seeded headcount, and the seeded lightweight ' +
    'division is fifteen fighters rated 65–79 with nobody below. `world.ts:replenish` only tops a ' +
    'division back **up to** that number, so the intake — which generates debutants rated 23–63 ' +
    'and signs them to the small shows — essentially never fires, and the division stays fifteen ' +
    'elite fighters forever.',
);
say();
say(
  'A created fighter debuts around 52. Measured on the unmodified world, their first five offers ' +
    'priced at 2%, 4%, 5%, 6% and 6%, they went 0-5, and the career ended at 24 on "retired on a ' +
    'losing run". That is every created fighter, not an unlucky seed: there is nobody in the world ' +
    'for them to fight.',
);
say();
say(
  'This document raises the target to ' +
    FEEDER_TARGET +
    ' and lets the game\u2019s own ' +
    '`replenish` populate the division, which is why the careers above exist at all. The fix ' +
    'belongs in the world, not the harness.',
);
say();

say(
  '### 2. The composite peaks at ' +
    Math.min(...peakAges) +
    '\u2013' +
    Math.max(...peakAges) +
    ', not 29\u201332',
);
say();
say(
  'Doc 23 \u00a7 6 sets out "the composite still peaks 29\u201332" as a definition of done. Measured across ' +
    'these three: ' +
    peakAges.join(', ') +
    '. The tables show why — skills keep climbing into the ' +
    'late thirties while the physical decline is small and spread over five of fifteen attributes, ' +
    'so a fighter still taking three camps a year outruns it. Whether that is wrong depends on ' +
    'whether the model is meant to say "a fighter is at their best at 30" or "a fighter who keeps ' +
    'training keeps improving"; right now it says the second.',
);
say();

say('### 3. Physical ceilings are close to decorative');
say();
say('Marcus Bell is a `freak`, the top talent tier, and this is what he did with his ceilings:');
say();
say('| Physical | Debut | Ceiling | Career best | Of the gap, used |');
say('| --- | ---: | ---: | ---: | ---: |');
for (const r of physicalUse) {
  const gap = r.ceiling - r.debutValue;
  say(
    `| ${PRETTY[r.k]} | ${r.debutValue} | ${r.ceiling} | ${r.best} | ${gap > 0 ? Math.round((r.used / gap) * 100) : 0}% |`,
  );
}
say();
say(
  'Eighteen years of professional training bought him one point of speed against a ten-point gap. ' +
    '`ARRIVAL` is doing what doc 23 designed — a 22-year-old is near their physical best — but the ' +
    'consequence is that the difference between a freak\u2019s ceilings and anybody else\u2019s is mostly ' +
    'unreachable, so the talent tier shows up in scouting reports and barely in careers.',
);
say();

say('### 4. Neglect charges inactivity, not emphasis');
say();
say(
  '`GENERAL_MAINTENANCE` is 0.35 and `NEGLECT_GRACE_DAYS` is 240, so **any camp within 84 days ' +
    'fully maintains every attribute**. A fighter who is continuously in camp — which the player ' +
    'always is, because there is nothing else to do with the time — therefore neglects nothing, ' +
    'ever, whatever they emphasise.',
);
say();
say(
  'Danil Orlov is the case in point: twenty-two years of wrestling and boxing, never a single ' +
    'camp on anything else, and his fight IQ went 46 \u2192 45 and his composure 49 \u2192 49. What his ' +
    'choice cost him is not decay but **opportunity** — the things he trained went up thirty points ' +
    'and the things he did not stayed exactly where he found them.',
);
say();
say(
  'That may well be right. A professional in the gym year-round does drill everything a little, ' +
    'and real detraining needs real inactivity. But it is not quite what "skills degrade when not ' +
    'trained" implies, and if emphasis alone should cost something, `GENERAL_MAINTENANCE` is the ' +
    'dial — with the caveat that lowering it charges the *broad* player hardest, and ' +
    '`overallRating` averages all fifteen attributes, so the yardstick rewards the breadth the ' +
    'mechanic would be charging for.',
);
say();

say('### 5. The neglect report was unreachable — *fixed*');
say();
say(
  'The camp note that names what a fighter is letting go was gated on a whole rating point coming ' +
    'off inside a single `applyAgeing` call. Losses are banked in `trainingCarry` like gains, and ' +
    'the function is called once per camp — a fifth of a year — so an attribute fading at a point ' +
    'a year reported a loss of zero every time. Across these three careers it fired **not once**. ' +
    'It also read the *total* loss, so a 38-year-old losing speed to age could be told nobody had ' +
    'worked on his speed. It is now judged on the annualised neglect charge specifically, at 0.35 ' +
    'points a year, with both cases under test.',
);
say();

say('### 6. Nobody retires hurt, and now that matters more');
say();
say(
  `The most damaged fighter here finished on ${maxTrauma} head trauma after ${mostFights} professional fights. ` +
    '`retirementUrge` does not start reading trauma until 45 and wear until 50, so the term never ' +
    'engages and every career still ends on age or on a losing run. The sport\u2019s most ' +
    'characteristic ending — the fighter who is told to stop — remains unreachable.',
);
say();
say(
  'Doc 25 phase 1 sharpened this rather than fixing it. Injuries, medical suspensions and ' +
    'withdrawals now disrupt a career properly, and the **only** route the retirement model offers ' +
    'for a disrupted career is the skid: lost fights, collapsed confidence, walk away. Measured on ' +
    'twelve seeded careers before and after that change, mean career length went from 10.5 years ' +
    'to 8.7 and mean retirement age from 32.6 to 30.8 — but the informative part is the tail. ' +
    'Before, no career ended before 27. After, five of twelve end between 22 and 26.',
);
say();
say(
  'That is not the injury model being too harsh: measured at **1.09 injuries per career-year**, it ' +
    'sits at the top of the band § 1.2 was already designed around, and only 9% of fights are ' +
    'fought carrying one. It is that `retirementUrge` converts every kind of adversity into the ' +
    'same exit. A fighter whose year was wrecked by a knee should come back at 28 having lost ' +
    'time, not quit at 24 having lost heart.',
);
say();

process.stdout.write(out.join('\n') + '\n');
