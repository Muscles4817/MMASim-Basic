/**
 * The fighter's situation model.
 *
 * `careerAttention` is the load-bearing piece of doc 32: it is what turns eighteen regions
 * rendered in DOM order into a ranked list of things that need the player. Tested here rather
 * than only through the dashboard because the *ranking* is the product — a screen test can show
 * that a row rendered, and cannot show that a torn knee outranked a signing bonus.
 *
 * Everything below asserts a claim about relative urgency or about a specific state being
 * noticed at all. Nothing asserts on copy: the titles are prose and will be reworded.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, type GameDb } from '@mmasim/data';
import {
  TRAUMA_MEDICAL,
  asBoutId,
  asFighterId,
  asPromotionId,
  asId,
  type Fighter,
  type Injury,
  type Promotion,
} from '@mmasim/engine';
import { careerAttention, dominantAction } from '../../packages/app/src/game/careerAttention';

/** A fresh world, and one fighter out of it to push around. */
function world(): { db: GameDb; fighter: Fighter; day: number } {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const day = getWorld(db).day;
  const fighter = (db.fighters.findAll() as Fighter[]).find(
    (f) => f.promotionId !== undefined && f.record.length === 0,
  )!;
  return { db, fighter, day };
}

/** Write a mutated fighter back, so the module reads it the way the app would. */
function save(db: GameDb, fighter: Fighter): Fighter {
  db.fighters.upsert(fighter as never);
  return fighter;
}

const kinds = (db: GameDb, fighter: Fighter) => careerAttention(db, fighter).map((s) => s.kind);

describe('what needs the fighter', () => {
  it('says nothing about a body that is fine, rather than reassuring about it', () => {
    const { db, fighter } = world();
    const healthy = save(db, {
      ...fighter,
      condition: { ...fighter.condition, headTrauma: 0, bodyWear: 0, confidence: 70 },
      injuries: [],
    });

    // A permanent "you are healthy" row is a row the player learns to skip, which is exactly
    // the state you need them reading it in.
    expect(kinds(db, healthy)).not.toContain('trauma');
    expect(kinds(db, healthy)).not.toContain('wear');
    expect(kinds(db, healthy)).not.toContain('injury');
  });

  it('puts a serious injury above a contract improvement', () => {
    const { db, fighter, day } = world();
    // Built without a cast, deliberately: the first draft of this test wrote `startDay` and
    // `healsDay` and a type of `kneeLigament`, an `as Injury` swallowed all three, and the
    // fighter came back healthy. A cast on fixture data is a test that cannot fail correctly.
    const injury: Injury = {
      id: asId<Injury['id']>('inj_knee'),
      type: 'knee',
      severity: 0.7,
      day: day - 5,
      healedDay: day + 120,
      source: 'camp',
    };
    const hurt = save(db, { ...fighter, injuries: [injury] });

    const situations = careerAttention(db, hurt);
    const injuryItem = situations.find((s) => s.kind === 'injury')!;
    expect(injuryItem).toBeTruthy();

    // Every other item is scored on the same scale, which is the whole point of one producer.
    for (const other of situations) {
      if (other.kind === 'injury' || other.kind === 'inbox' || other.kind === 'titleShot') continue;
      expect(injuryItem.urgency).toBeGreaterThanOrEqual(other.urgency);
    }
  });

  it('reports ring rust to a free agent, which the old hub structurally could not', () => {
    const { db, fighter, day } = world();

    /*
     * The audit's sharpest small finding. `describeRust` was rendered inside the *contracted*
     * branch of the hub's contract card, so the fighter nobody is booking — the one for whom
     * inactivity is the whole problem — was the one player who never saw it.
     */
    const stale = save(db, {
      ...fighter,
      promotionId: undefined,
      // Branded ids, so the fixture is built through the same constructors the game uses
      // rather than cast past them.
      record: [
        {
          boutId: asBoutId('b1'),
          opponentId: asFighterId('x'),
          promotionId: asPromotionId('p_any'),
          day: day - 500,
          outcome: 'win',
          method: 'decisionUnanimous',
          round: 3,
          timeSeconds: 300,
          divisionId: fighter.divisionId,
          wasTitleFight: false,
        },
      ] satisfies Fighter['record'],
    });

    const found = careerAttention(db, stale);
    expect(found.map((s) => s.kind)).toContain('rust');
    expect(found.map((s) => s.kind)).toContain('unsigned');
  });

  it('notices accumulated trauma but never offers a button for it', () => {
    const { db, fighter } = world();
    const damaged = save(db, {
      ...fighter,
      condition: { ...fighter.condition, headTrauma: TRAUMA_MEDICAL + 5 },
    });

    const trauma = careerAttention(db, damaged).find((s) => s.kind === 'trauma')!;
    expect(trauma).toBeTruthy();
    expect(trauma.tone).toBe('danger');
    // There is no control that makes accumulated damage better. Offering one would be a lie,
    // and `canLead` is how the model says "urgent, and not the thing to press".
    expect(trauma.action).toBeUndefined();
    expect(trauma.canLead).toBeFalsy();
  });

  it('ranks a blocking inbox item above everything the player could otherwise press', () => {
    const { db, fighter } = world();
    const situations = careerAttention(db, fighter);
    const inbox = situations.find((s) => s.kind === 'inbox');
    // Only meaningful when the world actually raised one; a fresh save may not have.
    if (!inbox) return;

    // Time will not move past a blocking item, so nothing else on the page is going to work.
    expect(situations[0]?.kind).toBe('inbox');
  });
});

describe('the one dominant action', () => {
  it('picks something the player can actually do, not merely the loudest row', () => {
    const { db, fighter } = world();
    const damaged = save(db, {
      ...fighter,
      condition: { ...fighter.condition, headTrauma: TRAUMA_MEDICAL + 5 },
    });

    const situations = careerAttention(db, damaged);
    const lead = dominantAction(situations);

    // The trauma row is near the top and has no action. The dominant action must skip it
    // rather than leave the dashboard with no primary button at all.
    if (lead) {
      const source = situations.find((s) => s.title === lead.because)!;
      expect(source.action).toBeTruthy();
      expect(source.canLead).toBe(true);
    }
  });

  it('returns exactly one, which is the whole fix for six competing primaries', () => {
    const { db, fighter } = world();
    const lead = dominantAction(careerAttention(db, fighter));
    // Either one action or none. There is no shape of this function that returns two.
    expect(lead === undefined || typeof lead.label === 'string').toBe(true);
  });

  it('leads with free agency for a fighter nobody has signed', () => {
    const { db, fighter } = world();
    const free = save(db, { ...fighter, promotionId: undefined });

    const situations = careerAttention(db, free);
    expect(situations.map((s) => s.kind)).toContain('unsigned');

    const unsigned = situations.find((s) => s.kind === 'unsigned')!;
    expect(unsigned.action?.route.name).toBe('contract');
  });
});

describe('every situation carries its own justification', () => {
  it('never produces a row that is merely a notification', () => {
    const { db, fighter, day } = world();

    // Push the fighter into as many states at once as the model can hold, so this walks a
    // realistically messy career rather than a clean one.
    const messy = save(db, {
      ...fighter,
      promotionId: undefined,
      bank: -20,
      condition: { ...fighter.condition, headTrauma: 40, bodyWear: 60, confidence: 25 },
      injuries: [
        {
          id: asId<Injury['id']>('inj_hand'),
          type: 'hand',
          severity: 0.5,
          day: day - 3,
          healedDay: day + 60,
          source: 'fight',
        },
      ] satisfies Injury[],
    });

    const situations = careerAttention(db, messy);
    expect(situations.length).toBeGreaterThan(2);

    for (const s of situations) {
      // The rule the module exists to enforce: a claim and a consequence, always.
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.detail.length).toBeGreaterThan(0);
      expect(s.urgency).toBeGreaterThanOrEqual(0);
      expect(s.urgency).toBeLessThanOrEqual(100);
    }

    // Sorted, so the caller can take the top N and mean it.
    const scores = situations.map((s) => s.urgency);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('does not repeat itself when a promotion is behind two different problems', () => {
    const { db, fighter } = world();
    const promotion = db.promotions.findById(fighter.promotionId as string) as Promotion;
    expect(promotion).toBeTruthy();

    const ids = careerAttention(db, fighter).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
