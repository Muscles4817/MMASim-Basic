/**
 * A card is allowed to have holes in it.
 *
 * That is the whole claim this module exists to make, and the one the old model could not: a
 * `FightNight` is a finished thing, so there was nowhere to keep the April card that exists in
 * January with three names on it. Everything below is a property of a plan alone — no database,
 * no world — which is what keeps the calendar, the dashboard and the builder asking the same
 * questions rather than each inventing its own answer.
 */

import { describe, expect, it } from 'vitest';
import {
  EVENT_SCALES,
  eventScale,
  fightersIn,
  planHealth,
  planIssues,
  planProgress,
  plannedBouts,
  rescale,
  roundsFor,
  slotsFor,
  withSlot,
  type EventPlan,
  type PlannedBout,
} from './eventPlans.js';
import { asId } from '../core/ids.js';

const plan = (scale: EventPlan['scale'] = 'standard'): EventPlan => ({
  id: 'plan_test',
  promotionId: asId('promo'),
  day: 400,
  name: 'Test 1',
  city: 'Manchester',
  country: 'UK',
  scale,
  broadcast: 'televised',
  status: 'planning',
  slots: slotsFor(scale),
});

const bout = (red: string, blue: string, over: Partial<PlannedBout> = {}): PlannedBout => ({
  redId: asId(red),
  blueId: asId(blue),
  divisionId: asId('mens-lightweight'),
  status: 'draft',
  rounds: 3,
  ...over,
});

describe('the shape of a card', () => {
  it('gives every scale a main event and a co-main', () => {
    for (const scale of EVENT_SCALES) {
      const slots = slotsFor(scale.id);
      expect(slots.filter((s) => s.position === 'mainEvent')).toHaveLength(1);
      expect(slots.filter((s) => s.position === 'coMain')).toHaveLength(1);
    }
  });

  it('sizes the card to the scale', () => {
    expect(slotsFor('club')).toHaveLength(6);
    expect(slotsFor('standard')).toHaveLength(9);
    expect(slotsFor('flagship')).toHaveLength(12);
  });

  it('gives slots stable ids, so an edit and a React key point at the same thing', () => {
    const ids = slotsFor('standard').map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(slotsFor('standard').map((s) => s.id)).toEqual(ids);
  });

  it('falls back to the standard shape rather than throwing on an unknown scale', () => {
    expect(eventScale('nonsense' as never).id).toBe('standard');
  });
});

describe('rounds', () => {
  it('gives a main event and any title fight five', () => {
    expect(roundsFor('mainEvent')).toBe(5);
    expect(roundsFor('prelim', 'undisputed')).toBe(5);
    expect(roundsFor('coMain', 'interim')).toBe(5);
  });

  it('gives everything else three', () => {
    expect(roundsFor('coMain')).toBe(3);
    expect(roundsFor('mainCard')).toBe(3);
    expect(roundsFor('prelim')).toBe(3);
  });
});

describe('reading a plan', () => {
  it('reports an empty card as empty rather than as complete', () => {
    const progress = planProgress(plan());
    expect(progress.filled).toBe(0);
    expect(progress.complete).toBe(false);
    expect(progress.hasMainEvent).toBe(false);
    expect(planHealth(plan())).toBe('empty');
  });

  it('does not count a pencilled fight as booked', () => {
    // The distinction the whole offer system rests on: writing a name into a slot is an
    // intention, not a fight.
    const p = withSlot(plan(), 'main', bout('a', 'b'));
    expect(planProgress(p).filled).toBe(1);
    expect(planProgress(p).agreed).toBe(0);
    expect(planProgress(p).hasMainEvent).toBe(false);
  });

  it('counts an agreed fight', () => {
    const p = withSlot(plan(), 'main', bout('a', 'b', { status: 'agreed' }));
    expect(planProgress(p).agreed).toBe(1);
    expect(planProgress(p).hasMainEvent).toBe(true);
  });

  it('is only complete when every slot holds a signed fight', () => {
    let p = plan('club');
    p.slots.forEach((slot, i) => {
      p = withSlot(p, slot.id, bout(`red${i}`, `blue${i}`, { status: 'agreed' }));
    });
    expect(planProgress(p).complete).toBe(true);
    expect(planHealth(p)).toBe('ready');
  });
});

describe('what is wrong with a card', () => {
  it('leads with the missing main event, because nothing else sells the night', () => {
    expect(planIssues(plan())[0]?.kind).toBe('noMainEvent');
  });

  it('catches somebody booked twice across three months of planning', () => {
    // Impossible to spot by reading nine rows, and easy to do when a card is filled over weeks.
    let p = withSlot(plan(), 'main', bout('a', 'b', { status: 'agreed' }));
    p = withSlot(p, 'co', bout('a', 'c', { status: 'agreed' }));
    expect(planIssues(p).some((i) => i.kind === 'doubleBooked')).toBe(true);
  });

  it('says a bout was turned down, and keeps saying it until the slot changes', () => {
    const p = withSlot(plan(), 'main', bout('a', 'b', { status: 'declined' }));
    expect(planIssues(p).some((i) => i.kind === 'declined')).toBe(true);
    expect(planHealth(p)).toBe('atRisk');
  });

  it('reports empty slots without treating them as a failure', () => {
    const empty = planIssues(plan()).find((i) => i.kind === 'emptySlots');
    expect(empty?.message).toMatch(/9 slots still empty/);
    // Lower urgency than a missing main event: a hole in the prelims is a plan, not a crisis.
    expect(empty!.urgency).toBeLessThan(
      planIssues(plan()).find((i) => i.kind === 'noMainEvent')!.urgency,
    );
  });
});

describe('resizing a card', () => {
  it('keeps the fights that still fit', () => {
    let p = withSlot(plan('standard'), 'main', bout('a', 'b', { status: 'agreed' }));
    p = withSlot(p, 'co', bout('c', 'd', { status: 'agreed' }));
    const { plan: bigger, dropped } = rescale(p, 'flagship');

    expect(dropped).toHaveLength(0);
    expect(plannedBouts(bigger)).toHaveLength(2);
    expect(bigger.slots).toHaveLength(12);
  });

  it('returns what a smaller card would drop rather than deleting it silently', () => {
    // Shrinking a card that has fights on it is a real decision, so the screen has to be able to
    // say what it costs before anything is written.
    let p = plan('standard');
    p.slots.forEach((slot, i) => {
      p = withSlot(p, slot.id, bout(`red${i}`, `blue${i}`, { status: 'agreed' }));
    });

    const { plan: smaller, dropped } = rescale(p, 'club');
    expect(smaller.slots).toHaveLength(6);
    expect(dropped).toHaveLength(3);
    // The bottom of the undercard comes off, not the main event.
    expect(smaller.slots.find((s) => s.position === 'mainEvent')?.bout).toBeDefined();
  });
});

describe('who is on the card', () => {
  it('lists both corners of every bout, agreed or not', () => {
    let p = withSlot(plan(), 'main', bout('a', 'b', { status: 'agreed' }));
    p = withSlot(p, 'co', bout('c', 'd'));
    expect([...fightersIn(p)].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
