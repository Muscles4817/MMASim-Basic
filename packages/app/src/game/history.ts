/**
 * The history book. Doc 34 B6.
 *
 * A promotion that has run for six years has a history, and none of it could be read: the belts
 * kept a lineage nobody showed, the nights it ran sat in the save as records, and a fighter who
 * was let go simply vanished from the screens. These read it back, as four questions a promoter
 * actually asks:
 *
 *  - **Who has held each belt** — the lineage, reign by reign, how it was won and how it ended.
 *  - **What has this promotion done** — a timeline of its nights, its title changes and the
 *    cards that never happened.
 *  - **Who were its greats** — a hall of fame scored from what they did *here*.
 *  - **Where are they now** — the fighters it cut, and what became of them.
 *
 * Derived on every read from what is already stored. Nothing here writes, so a history book can
 * never disagree with the save it is a history of.
 */

import {
  championOf,
  describeMethod,
  describeVacancy,
  displayName,
  getDivision,
  recordString,
  summariseRecord,
  type Championship,
  type DivisionId,
  type Fighter,
  type FightNight,
  type FightRecordEntry,
  type Promotion,
  type Reign,
} from '@mmasim/engine';
import type { Entity, GameDb } from '@mmasim/data';

const fighterOf = (db: GameDb, id: string | undefined): Fighter | undefined =>
  id ? (db.fighters.findById(id) as Fighter | undefined) : undefined;

const nameOf = (db: GameDb, id: string | undefined): string => {
  const f = fighterOf(db, id);
  return f ? displayName(f) : 'Unknown';
};

// --- Title lineage -----------------------------------------------------------------------------

export interface ReignRow {
  fighterId: string;
  name: string;
  wonDay: number;
  /** Undefined while the reign is ongoing. */
  lostDay?: number;
  defences: number;
  /** "Won by knockout in round 2 against Hill", or "Awarded the vacant belt". */
  how: string;
  /** "Lost to Reyes", "Vacated on retirement", or undefined while it goes on. */
  ended?: string;
}

export interface Lineage {
  divisionId: DivisionId;
  division: string;
  /** Newest first. */
  reigns: ReignRow[];
  /** The champion now, if there is one. */
  championId?: string;
}

function reignRow(db: GameDb, reign: Reign): ReignRow {
  const won = reign.wonBy;
  const how = won
    ? `Won ${describeMethod(won.method, won.round)}${won.opponentId ? ` against ${nameOf(db, won.opponentId as string)}` : ' for the vacant belt'}`
    : 'Awarded the belt';
  const lost = reign.lostBy;
  const ended =
    reign.lostDay === undefined
      ? undefined
      : lost?.vacated
        ? capitalise(describeVacancy(lost.vacated))
        : lost?.opponentId
          ? `Lost to ${nameOf(db, lost.opponentId as string)}`
          : 'Lost the belt';
  return {
    fighterId: reign.fighterId as string,
    name: nameOf(db, reign.fighterId as string),
    wonDay: reign.wonDay,
    lostDay: reign.lostDay,
    defences: reign.defences,
    how,
    ended,
  };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Every belt the promotion has, with its lineage, in the promotion's division order. */
export function titleLineages(db: GameDb, promotion: Promotion): Lineage[] {
  const titles = (db.championships.findAll() as (Championship & Entity)[]).filter(
    (t) => t.promotionId === promotion.id,
  );
  return promotion.divisions.map((divisionId) => {
    const title = titles.find((t) => t.divisionId === divisionId);
    return {
      divisionId,
      division: getDivision(divisionId).name,
      reigns: (title?.lineage ?? []).map((r) => reignRow(db, r)).reverse(),
      championId: title ? (championOf(title) as string | undefined) : undefined,
    };
  });
}

// --- The timeline --------------------------------------------------------------------------------

export interface TimelineEntry {
  day: number;
  kind: 'night' | 'titleChange' | 'cancelled';
  title: string;
  detail?: string;
  /** Where tapping it goes. */
  link?: { route: 'plan' | 'fighter'; id: string };
}

/**
 * What the promotion has done, newest first: every night it ran, every time a belt changed hands
 * or was vacated, and every card it announced and did not run.
 */
export function promotionTimeline(db: GameDb, promotion: Promotion): TimelineEntry[] {
  const out: TimelineEntry[] = [];

  const nights = (db.events.findAll() as (FightNight & Entity)[]).filter(
    (n) => n.promotionId === promotion.id && n.status === 'complete',
  );
  for (const night of nights) {
    const main = night.bouts[0];
    const red = fighterOf(db, main?.redId as string | undefined);
    const entry = red?.record.find((r) => r.boutId === main?.boutId);
    const winnerId = entry
      ? entry.outcome === 'win'
        ? red!.id
        : entry.outcome === 'loss'
          ? main!.blueId
          : undefined
      : undefined;
    out.push({
      day: night.day,
      kind: 'night',
      title: night.name,
      detail: [
        main && winnerId && entry
          ? `${nameOf(db, winnerId as string)} won the main event ${describeMethod(entry.method, entry.round)}.`
          : main && entry
            ? 'The main event was a draw.'
            : undefined,
        night.attendance
          ? `${night.attendance.toLocaleString()} in ${night.venue.city}.`
          : undefined,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  for (const lineage of titleLineages(db, promotion)) {
    for (const reign of lineage.reigns) {
      out.push({
        day: reign.wonDay,
        kind: 'titleChange',
        title: `${reign.name} becomes ${lineage.division} champion`,
        detail: reign.how,
        link: { route: 'fighter', id: reign.fighterId },
      });
      if (reign.lostDay !== undefined && reign.ended && !reign.ended.startsWith('Lost to')) {
        out.push({
          day: reign.lostDay,
          kind: 'titleChange',
          title: `${lineage.division} title: ${reign.name} — ${reign.ended.toLowerCase()}`,
          link: { route: 'fighter', id: reign.fighterId },
        });
      }
    }
  }

  for (const plan of db.plans.findAll() as unknown as {
    id: string;
    promotionId: string;
    cancelled?: { day: number; reason: string; name: string };
  }[]) {
    if (plan.promotionId !== (promotion.id as string) || !plan.cancelled) continue;
    out.push({
      day: plan.cancelled.day,
      kind: 'cancelled',
      title: `${plan.cancelled.name} ${plan.cancelled.reason === 'missed' ? 'never ran' : 'was called off'}`,
      link: { route: 'plan', id: plan.id },
    });
  }

  return out.sort((a, b) => b.day - a.day);
}

// --- The hall of fame ------------------------------------------------------------------------------

export interface Legend {
  fighterId: string;
  name: string;
  /** What they did here, in a line: "3 reigns, 7 defences, 18-3 here". */
  line: string;
  score: number;
  /** Retired and over the bar: in the hall. Otherwise on course for it. */
  inducted: boolean;
}

/** The score a career here needs to be in the hall once it is over. */
export const HALL_OF_FAME_BAR = 40;

/**
 * The promotion's greats, scored from what they did *here*: wins, title fights won, bonuses, and
 * above all reigns and defences, because a belt held and defended is what a promotion's history
 * is made of. Retired fighters over the bar are inducted; active ones over it are on course.
 */
export function hallOfFame(db: GameDb, promotion: Promotion, limit = 10): Legend[] {
  const reigns = new Map<string, { reigns: number; defences: number }>();
  for (const lineage of titleLineages(db, promotion)) {
    for (const r of lineage.reigns) {
      const seen = reigns.get(r.fighterId) ?? { reigns: 0, defences: 0 };
      reigns.set(r.fighterId, { reigns: seen.reigns + 1, defences: seen.defences + r.defences });
    }
  }

  const legends: Legend[] = [];
  for (const fighter of db.fighters.findAll() as Fighter[]) {
    const here = fighter.record.filter((r) => r.promotionId === promotion.id);
    if (here.length === 0) continue;
    const summary = summariseRecord(here);
    const belts = reigns.get(fighter.id as string) ?? { reigns: 0, defences: 0 };
    const bonuses = here.filter((r) => r.bonus !== undefined).length;
    const titleWins = here.filter((r) => r.wasTitleFight && r.outcome === 'win').length;
    const score =
      summary.wins * 2 +
      titleWins * 6 +
      bonuses * 2 +
      belts.reigns * 10 +
      belts.defences * 5 -
      summary.losses;
    if (score < HALL_OF_FAME_BAR / 2) continue;

    const parts = [
      belts.reigns > 0
        ? `${belts.reigns} ${belts.reigns === 1 ? 'reign' : 'reigns'}, ${belts.defences} ${belts.defences === 1 ? 'defence' : 'defences'}`
        : undefined,
      `${recordString(summary)} here`,
      bonuses > 0 ? `${bonuses} ${bonuses === 1 ? 'bonus' : 'bonuses'}` : undefined,
    ].filter(Boolean);
    legends.push({
      fighterId: fighter.id as string,
      name: displayName(fighter),
      line: parts.join(' · '),
      score,
      inducted: fighter.retiredDay !== undefined && score >= HALL_OF_FAME_BAR,
    });
  }
  return legends.sort((a, b) => b.score - a.score).slice(0, limit);
}

// --- Where are they now ---------------------------------------------------------------------------

export interface FormerFighter {
  fighterId: string;
  name: string;
  cutDay: number;
  /** "Fighting for AFC", "Free agent", "Retired". */
  now: string;
  /** Their record since the cut, "4-1", or undefined if they have not fought since. */
  since?: string;
  /** Belts they hold now, anywhere: "AFC Lightweight". */
  belts: string[];
}

/**
 * The fighters this promotion cut, and what became of them, most recent cut first.
 *
 * Read off the `cut` in each fighter's relationship ledger, which survives leaving (C3) so that
 * this can be asked. A cut fighter who went on to win a belt somewhere else is the entry a
 * promoter most needs to see, and is also told in the news on the night it happens.
 */
export function whereAreTheyNow(db: GameDb, promotion: Promotion): FormerFighter[] {
  const promotions = db.promotions.findAll() as unknown as Promotion[];
  const out: FormerFighter[] = [];

  for (const fighter of db.fighters.findAll() as Fighter[]) {
    const cut = (fighter.ledger ?? [])
      .filter((e) => e.kind === 'cut' && e.promotionId === promotion.id)
      .sort((a, b) => b.day - a.day)[0];
    if (!cut) continue;

    const since: FightRecordEntry[] = fighter.record.filter((r) => r.day > cut.day);
    const now =
      fighter.retiredDay !== undefined
        ? 'Retired'
        : fighter.promotionId === promotion.id
          ? `Back with ${promotion.shortName}`
          : fighter.promotionId
            ? `Fighting for ${promotions.find((p) => p.id === fighter.promotionId)?.shortName ?? 'another promotion'}`
            : 'Free agent';
    const belts = promotions.flatMap((p) =>
      Object.entries(p.champions)
        .filter(([, id]) => id === fighter.id)
        .map(([divisionId]) => `${p.shortName} ${getDivision(divisionId as never).name}`),
    );

    out.push({
      fighterId: fighter.id as string,
      name: displayName(fighter),
      cutDay: cut.day,
      now,
      since: since.length > 0 ? recordString(summariseRecord(since)) : undefined,
      belts,
    });
  }

  // A former fighter holding a belt first: that is the one the promoter has to live with.
  return out.sort((a, b) => b.belts.length - a.belts.length || b.cutDay - a.cutDay);
}
