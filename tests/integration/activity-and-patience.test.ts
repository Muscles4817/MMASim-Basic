/**
 * Training between fights, and what the promotion does about it.
 *
 * The failure this suite exists for: a player who trained lost their contract. Not after
 * neglecting a career for years — after a completely ordinary two-fight year followed by one
 * month in the gym. There was no warning of any kind, and the news feed announced that the
 * player had "walked out on" a promotion they had not walked out on.
 *
 * The cause was a rule applied to the wrong subject. `enforceActivity` asks whether the
 * *promotion* fell short of the bouts it owed — a real question about a fighter the world books,
 * and a meaningless one about the player, who books themselves. Doc 21 § 1.2.
 *
 * So what is pinned here is the whole of the player's side: silence through a normal schedule,
 * an escalation that asks before it acts, and a release that can only follow refusals.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld, type GameDb } from '@mmasim/data';
import {
  PATIENCE,
  createAgreement,
  defaultTerms,
  type Fighter,
  type NewsItem,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { answerBoutOffer } from '../../packages/app/src/game/career';
import { advanceTo } from '../../packages/app/src/game/clock';
import { advanceWorld } from '../../packages/app/src/game/world';
import { readInbox } from '../../packages/app/src/game/inbox';

/** Days between fights for a fighter on the sport's median schedule of two bouts a year. */
const MEDIAN_GAP = 182;

/**
 * A career mid-flight: an established fighter, a deal a year old, and two bouts behind them.
 *
 * Deliberately the *median* real schedule rather than a neglectful one. The point of every test
 * below is what happens to somebody doing nothing unusual.
 */
function establishedCareer(options: { lastFightDaysAgo?: number; starPower?: number } = {}) {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const day0 = getWorld(db).day;
  const lastFight = options.lastFightDaysAgo ?? 120;

  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.retiredDay === undefined && f.promotionId,
  );
  const me = { ...roster[40]!, starPower: options.starPower ?? roster[40]!.starPower };
  const promotion = db.promotions.findById(me.promotionId!) as Promotion;

  const record = [
    {
      day: day0 - lastFight - MEDIAN_GAP,
      opponentId: 'a',
      result: 'win',
      method: 'decision',
      round: 3,
    },
    { day: day0 - lastFight, opponentId: 'b', result: 'win', method: 'decision', round: 3 },
  ] as unknown as Fighter['record'];

  const base = defaultTerms(me, promotion);
  const agreement = createAgreement({
    fighter: me,
    promotion,
    day: day0 - 400,
    terms: {
      ...base,
      signingBonus: 0,
      revenuePoints: 0,
      fightsOwed: 4,
      championshipExtension: 'none',
      matchingRights: false,
      exclusive: true,
      outsideBouts: 0,
    },
  });

  db.agreements.upsert(agreement as never);
  db.fighters.upsert({
    ...me,
    record,
    promotionId: promotion.id,
    agreementId: agreement.id,
  } as never);
  setWorld(db, { playerRole: 'fighter', playerFighterId: me.id });

  return { db, id: me.id as string, promotion, agreement, lastFightDay: day0 - lastFight };
}

/** Train, month by month, answering every decision the way `answer` says. */
function train(
  db: GameDb,
  id: string,
  months: number,
  answer: 'accept-nothing' | 'refuse-everything',
): { offers: number; titles: string[] } {
  const seen = new Set<string>();
  const titles: string[] = [];
  let offers = 0;

  for (let month = 0; month < months; month++) {
    advanceTo(db, getWorld(db).day + 28);

    for (const item of readInbox(db)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      titles.push(item.title);
      if (!item.actions) continue;

      if (item.kind === 'offer') {
        offers++;
        if (answer === 'refuse-everything') {
          const fighter = db.fighters.findById(id) as Fighter;
          const agreement = db.agreements.findById(fighter.agreementId as string) as
            PromotionalAgreement | undefined;
          if (agreement) {
            db.agreements.upsert({
              ...agreement,
              refusedBouts: (agreement.refusedBouts ?? 0) + 1,
            } as never);
          }
        }
      }
      // Resolved either way, so the advance loop is not jammed against its own interrupt.
      db.inbox.upsert({
        ...item,
        resolvedDay: getWorld(db).day,
        resolvedWith: 'noted',
      } as never);
    }

    if (!(db.fighters.findById(id) as Fighter).promotionId) break;
  }

  return { offers, titles };
}

const stillSigned = (db: GameDb, id: string): boolean =>
  (db.fighters.findById(id) as Fighter).promotionId !== undefined;

describe('a player on the sport’s own schedule', () => {
  it('keeps their contract through a training block', () => {
    /*
     * The exact reproduction of the reported bug. Two bouts in the trailing year — the real UFC
     * median — then one month of training. This used to end the career.
     */
    const { db, id } = establishedCareer();
    train(db, id, 1, 'accept-nothing');
    expect(stillSigned(db, id)).toBe(true);
  });

  it('keeps it through six months of training, and is told nothing at all', () => {
    // Silence is the requirement, not merely survival. A game that warns you for taking a camp
    // has replaced one wrong behaviour with a nagging one.
    const { db, id } = establishedCareer({ lastFightDaysAgo: 0 });
    const { titles } = train(db, id, 5, 'accept-nothing');
    expect(stillSigned(db, id)).toBe(true);
    expect(titles.filter((t) => /would like you active|want you on a card/i.test(t))).toEqual([]);
  });
});

describe('the promotion asks before it acts', () => {
  it('says something at around six months out', () => {
    const { db, id } = establishedCareer({ lastFightDaysAgo: 0, starPower: 20 });
    const { titles } = train(db, id, 9, 'accept-nothing');
    expect(titles.some((t) => /would like you active/i.test(t))).toBe(true);
  });

  it('puts a named fight in front of you rather than only complaining', () => {
    /*
     * Doc 21 § 1.3, and the heart of the change. Before this, nothing in the game ever offered
     * the player a bout — so being judged on inactivity meant being judged on offers that did
     * not exist.
     */
    const { db, id } = establishedCareer({ lastFightDaysAgo: 0, starPower: 20 });
    train(db, id, 14, 'accept-nothing');

    const offer = readInbox(db).find((i) => i.kind === 'offer');
    expect(offer, 'no bout was ever offered').toBeDefined();
    expect(offer!.opponentId, 'an offer with nobody in it').toBeDefined();
    expect(offer!.priority, 'an offer must stop the clock').toBe('decision');
    expect(offer!.actions?.map((a) => a.id)).toEqual(['accept', 'decline']);
    // The opponent has to be somebody who exists, or accepting books nothing.
    expect(db.fighters.findById(offer!.opponentId as string)).toBeDefined();
  });

  it('does not chase somebody who already has a fight booked', () => {
    // Being in camp is the answer to "when are you fighting". Handled through the exclusion the
    // clock passes down, because the booking is session state the world cannot reach.
    const { db, id } = establishedCareer({ lastFightDaysAgo: 0, starPower: 20 });
    const start = getWorld(db).day;
    for (let step = 0; step < 26; step++) {
      advanceWorld(db, start + step * 14, start + (step + 1) * 14, {
        fighterId: id as never,
        playerHasBooking: true,
      });
      setWorld(db, { day: start + (step + 1) * 14 });
    }
    expect(readInbox(db).filter((i) => i.kind === 'offer')).toEqual([]);
  });
});

describe('losing the deal', () => {
  it('does not happen to somebody who simply never fought', () => {
    /*
     * Time alone is not a sackable offence inside the leash. Doc 21 § 5 D2: the median career
     * is two fights a year, so a rule that acts before eighteen months goes on punishing the
     * ordinary case.
     */
    const { db, id } = establishedCareer({ lastFightDaysAgo: 0, starPower: 20 });
    train(db, id, 16, 'accept-nothing');
    expect(stillSigned(db, id)).toBe(true);
  });

  it('happens once fights have been turned down', () => {
    const { db, id } = establishedCareer({ lastFightDaysAgo: 0, starPower: 20 });
    train(db, id, 26, 'refuse-everything');
    expect(stillSigned(db, id)).toBe(false);
  });

  it('never says the player walked out on anybody', () => {
    /*
     * The single most misleading line the game produced. A player who trained was announced in
     * the feed as having walked out on their promotion — a decision they never made, about a
     * relationship they had not ended.
     */
    const { db, id } = establishedCareer({ lastFightDaysAgo: 0, starPower: 20 });
    train(db, id, 26, 'refuse-everything');

    const mine = (db.news.findAll() as NewsItem[]).filter((n) =>
      n.fighterIds?.includes(id as never),
    );
    expect(mine.some((n) => /walks out/i.test(n.headline))).toBe(false);
    expect(mine.some((n) => /release/i.test(n.headline))).toBe(true);
  });

  it('tells the player it has happened, as a decision', () => {
    const { db, id } = establishedCareer({ lastFightDaysAgo: 0, starPower: 20 });
    train(db, id, 26, 'refuse-everything');
    const told = readInbox(db).find((i) => /have let you go/i.test(i.title));
    expect(told).toBeDefined();
    expect(told!.priority).toBe('decision');
  });
});

describe('answering the offer', () => {
  /** Get a career far enough along that a bout is actually sitting in the inbox. */
  function withAnOffer() {
    const career = establishedCareer({ lastFightDaysAgo: 0, starPower: 20 });
    train(career.db, career.id, 14, 'accept-nothing');
    const offer = readInbox(career.db).find((i) => i.kind === 'offer');
    expect(offer, 'the fixture produced no offer to answer').toBeDefined();
    return { ...career, offer: offer! };
  }

  it('books the fight the promotion named when you take it', () => {
    const { db, id, offer } = withAnOffer();
    const me = db.fighters.findById(id) as Fighter;

    const booking = answerBoutOffer(db, me, offer, 'accept');

    expect(booking, 'taking the fight booked nothing').toBeDefined();
    // The opponent has to be the one they offered. Booking somebody else would make the whole
    // exchange theatre — the player agreed to a specific name.
    expect(booking!.opponentId).toBe(offer.opponentId);
    expect(booking!.bout.day).toBeGreaterThan(getWorld(db).day);
  });

  it('records the refusal when you turn it down, and books nothing', () => {
    /*
     * The counter the whole ladder runs on. Refusing has to leave a trace or the promotion's
     * patience is just a calendar, and a calendar cannot tell the difference between a fighter
     * who is training and one who will not take a fight.
     */
    const { db, id, offer } = withAnOffer();
    const me = db.fighters.findById(id) as Fighter;
    const before =
      (db.agreements.findById(me.agreementId as string) as PromotionalAgreement).refusedBouts ?? 0;

    const booking = answerBoutOffer(db, me, offer, 'decline');

    expect(booking).toBeUndefined();
    const after =
      (db.agreements.findById(me.agreementId as string) as PromotionalAgreement).refusedBouts ?? 0;
    expect(after).toBe(before + 1);
  });

  it('books nothing when the opponent has left the sport in the meantime', () => {
    // A roster can lose somebody to retirement between an offer being made and answered, and
    // silently booking nobody would be worse than the offer quietly lapsing.
    const { db, id, offer } = withAnOffer();
    const me = db.fighters.findById(id) as Fighter;

    const booking = answerBoutOffer(db, me, { opponentId: 'nobody_at_all' }, 'accept');
    expect(booking).toBeUndefined();
    void offer;
  });
});

describe('the promoter’s side of the guarantee still bites', () => {
  it('shelved fighters can still walk, so signing somebody to bury them is not free', () => {
    /*
     * Doc 16's trap, and doc 21 § 4 promises it survives. The player is excluded from
     * `enforceActivity` because the rule cannot mean anything about somebody who books
     * themselves — not because being shelved should stop costing a promotion.
     */
    const db = createNewGame({ adapter: undefined, era: '2026' });
    const start = 2192;
    let walkouts = 0;
    for (let step = 0; step < 26 * 3; step++) {
      const from = start + step * 14;
      const advance = advanceWorld(db, from, from + 14, {});
      walkouts += advance.news.filter((n) => /walks out/i.test(n.headline)).length;
    }
    expect(walkouts).toBeGreaterThan(0);
  });

  it('no longer voids the roster wholesale', () => {
    /*
     * It did: 2,776 contracts in three simulated years, advancing a fortnight at a time. The
     * cause was a flat 0.25–0.85 roll evaluated once per `advanceWorld` call, so the severity of
     * the rule depended on how the player happened to chop up their time — and a single missed
     * bout counted the same as being shelved for a year.
     *
     * The bound is deliberately loose. What is being defended is the order of magnitude, not a
     * number that would have to be edited every time matchmaking moves.
     */
    const db = createNewGame({ adapter: undefined, era: '2026' });
    const start = 2192;
    let walkouts = 0;
    for (let step = 0; step < 26 * 3; step++) {
      const from = start + step * 14;
      const advance = advanceWorld(db, from, from + 14, {});
      walkouts += advance.news.filter((n) => /walks out/i.test(n.headline)).length;
    }
    expect(walkouts).toBeLessThan(800);
  });
});

describe('the guarantee is one a promotion can actually honour', () => {
  it('sits below the world’s own ceiling on how often anybody fights', () => {
    /*
     * The arithmetic nobody had read against itself: `MAX_BOUTS_PER_YEAR` is 3, and the two
     * biggest promotions guaranteed 3. Meeting the contract meant taking every bout the
     * simulation would allow, every year, forever — so 41% of year-old deals sat in breach.
     */
    const db = createNewGame({ adapter: undefined, era: '2026' });
    for (const promotion of db.promotions.findAll() as unknown as Promotion[]) {
      expect(
        promotion.activityGuarantee,
        `${promotion.shortName} guarantees too much`,
      ).toBeLessThan(3);
    }
  });
});

describe('the ladder is measured in a sane unit', () => {
  it('leaves well over a year before anything can end a deal', () => {
    // A guard on the constants themselves, so a future edit that makes the leash shorter than
    // the sport's own median gap between fights has to argue with this line first.
    expect(PATIENCE.nudge).toBeGreaterThan(MEDIAN_GAP - 30);
    expect(PATIENCE.cut).toBeGreaterThan(365);
    expect(PATIENCE.hardCut).toBeGreaterThan(PATIENCE.cut);
  });
});
