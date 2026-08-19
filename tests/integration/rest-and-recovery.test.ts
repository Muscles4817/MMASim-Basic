/**
 * Time passing has to do something to the person playing.
 *
 * The world tick deliberately excludes the player, and it must — their camps, fights and
 * decisions are run by the screens rather than by the simulation. But *excluded from the
 * simulation* had quietly become *exempt from time*. The hub's "wait eight weeks" called
 * `advanceWorld` directly and then set the date: the whole roster aged, fought, retired and
 * changed hands, and the player's own fighter came back byte-for-byte identical.
 *
 * The consequence that actually bites is freshness. It is the resource three separate decisions
 * turn on — how hard to train, when to fight, and now how likely a camp is to hurt you — and the
 * single most obvious way to get it back was the one route in the game that did not give it back.
 *
 * These assert what a day off is worth, and that the day-by-day picture the hub draws is the same
 * arithmetic the fighter is actually charged.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld, type GameDb } from '@mmasim/data';
import {
  asId,
  freshnessOf,
  weeksUntilFit,
  type Fighter,
  type InjuryId,
} from '@mmasim/engine';
import { advanceTo } from '../../packages/app/src/game/clock';
import { restDays } from '../../packages/app/src/game/progression';

const START = 2192;

/** A live career: a seeded fighter, taken over, flattened by whatever they have just done. */
function career(freshness = 40): { db: GameDb; fighter: Fighter } {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  setWorld(db, { day: START });
  const fighter = (db.fighters.findAll() as Fighter[]).find((f) => !f.retiredDay)!;
  const flat: Fighter = { ...fighter, condition: { ...fighter.condition, freshness } };
  db.fighters.upsert(flat as Fighter & { id: string });
  setWorld(db, { playerRole: 'fighter', playerFighterId: flat.id as string });
  db.save();
  return { db, fighter: flat };
}

const reload = (db: GameDb, fighter: Fighter): Fighter =>
  db.fighters.getById(fighter.id as string) as Fighter;

describe('sitting out actually recovers a fighter', () => {
  it('gives freshness back, which waiting never did', () => {
    const { db, fighter } = career(40);
    const outcome = restDays(db, fighter, 28);

    expect(outcome.days).toBe(28);
    expect(outcome.freshnessAfter).toBeGreaterThan(outcome.freshnessBefore + 10);
    expect(freshnessOf(reload(db, fighter))).toBe(outcome.freshnessAfter);
  });

  it('charges the player through the calendar too, not only through the rest button', () => {
    /*
     * The same defect one layer up: the calendar screen's day/week/month buttons went through
     * `advanceTo`, which excluded the player from the world tick and then charged them nothing.
     * A fighter could sit on that screen for a year and come back the same age.
     */
    const { db, fighter } = career(40);
    const before = freshnessOf(fighter);

    const result = advanceTo(db, START + 21);

    expect(result.player).toBeDefined();
    expect(result.player!.days).toBe(21);
    expect(freshnessOf(reload(db, fighter))).toBeGreaterThan(before);
  });

  it('leaves a promoter alone, because a promoter has no body', () => {
    const db = createNewGame({ adapter: undefined, era: '2026' });
    setWorld(db, { day: START, playerRole: 'promoter' });
    expect(advanceTo(db, START + 30).player).toBeUndefined();
  });

  it('never recovers past full, however long the layoff', () => {
    const { db, fighter } = career(90);
    expect(restDays(db, fighter, 180).freshnessAfter).toBeLessThanOrEqual(100);
  });
});

describe('the day-by-day picture is the model, not a decoration over it', () => {
  it('reports one entry per day, in order', () => {
    const { db, fighter } = career(45);
    const { timeline, from } = restDays(db, fighter, 14);

    expect(timeline).toHaveLength(14);
    expect(timeline[0]!.day).toBe(from + 1);
    expect(timeline[timeline.length - 1]!.day).toBe(from + 14);
  });

  it('lands on exactly the freshness the fighter ends up with', () => {
    /*
     * The property that makes showing the walk honest. If the timeline and the stored value could
     * disagree, the hub would be animating a number the game does not believe in — which is the
     * complaint that produced the whole feature, restated in a nicer font.
     */
    const { db, fighter } = career(35);
    const outcome = restDays(db, fighter, 30);
    const last = outcome.timeline[outcome.timeline.length - 1]!;

    expect(Math.round(last.freshness)).toBe(Math.round(outcome.freshnessAfter));
  });

  it('climbs rather than jumping, which is the entire point', () => {
    const { db, fighter } = career(20);
    const { timeline } = restDays(db, fighter, 21);

    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i]!.freshness).toBeGreaterThanOrEqual(timeline[i - 1]!.freshness);
    }
    // And no single day is worth a visible chunk of the bar, or it is a jump with extra steps.
    const biggestStep = Math.max(
      ...timeline.slice(1).map((d, i) => d.freshness - timeline[i]!.freshness),
    );
    expect(biggestStep).toBeLessThan(6);
  });

  it('names what faded rather than gesturing at "sharpness"', () => {
    /*
     * The note used to read "Time off the mats. Some sharpness has gone." whenever `losses` was
     * non-empty, which is neither actionable nor checkable against the card the player is looking
     * at. It now names the attributes, and only ones that moved by a whole rating point — anything
     * under that lives in `trainingCarry` and never appears on the card at all.
     */
    const { db, fighter } = career(50);
    const outcome = restDays(db, fighter, 60);
    const note = outcome.notes.find((n) => /faded/.test(n));
    if (note) {
      expect(note).not.toMatch(/some sharpness/i);
      // Named, lower-cased attribute labels rather than a generic noun.
      expect(note).toMatch(/faded while you were away/);
    }
    for (const [, delta] of Object.entries(outcome.losses)) {
      expect(delta).toBeLessThan(0);
    }
  });

  it('names the day an injury finally healed', () => {
    const { db, fighter } = career(60);
    const healsOn = START + 20;
    const hurt: Fighter = {
      ...fighter,
      injuries: [
        {
          id: asId<InjuryId>('inj_rest_test'),
          type: 'rib',
          day: START - 20,
          healedDay: healsOn,
          severity: 0.4,
          source: 'camp',
        },
      ],
    };
    db.fighters.upsert(hurt as Fighter & { id: string });
    db.save();

    const outcome = restDays(db, hurt, 40);

    expect(outcome.healed).toContain('Ribs');
    expect(outcome.timeline.find((d) => d.day === healsOn)?.healed).toContain('Ribs');
    expect(outcome.weeksToFit).toBe(0);
  });

  it('stops short of full fitness when the rest was too short, and says so', () => {
    const { db, fighter } = career(60);
    const hurt: Fighter = {
      ...fighter,
      injuries: [
        {
          id: asId<InjuryId>('inj_rest_long'),
          type: 'knee',
          day: START,
          healedDay: START + 140,
          severity: 0.8,
          source: 'camp',
        },
      ],
    };
    db.fighters.upsert(hurt as Fighter & { id: string });
    db.save();

    const outcome = restDays(db, hurt, 14);

    expect(outcome.weeksToFit).toBeGreaterThan(0);
    expect(weeksUntilFit(reload(db, hurt).injuries ?? [], outcome.to)).toBe(outcome.weeksToFit);
  });
});

describe('sitting out can be interrupted', () => {
  it('reports the day it actually reached rather than the one it was asked for', () => {
    /*
     * The hub's old wait could not be interrupted at all, so an offer that arrived in week two of
     * an eight-week wait was not seen until week eight — by which time the world had moved on and
     * the decision had been made for the player by their own absence.
     */
    const { db, fighter } = career(50);
    const outcome = restDays(db, fighter, 200);

    expect(outcome.to).toBe(getWorld(db).day);
    expect(outcome.days).toBe(outcome.to - outcome.from);
    if (outcome.interrupted) expect(outcome.waiting.length).toBeGreaterThan(0);
    // Whatever happened, the timeline describes the days that were actually lived.
    expect(outcome.timeline).toHaveLength(outcome.days);
  });
});
