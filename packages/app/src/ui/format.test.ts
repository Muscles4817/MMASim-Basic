import { describe, expect, it } from 'vitest';
import { fromNow } from './format';

describe('fromNow', () => {
  it('says a month, not "1 months", for the weeks either side of thirty days', () => {
    for (const days of [31, 38, 44]) expect(fromNow(days)).toBe('a month');
    expect(fromNow(45)).toBe('2 months');
    expect(fromNow(90)).toBe('3 months');
  });

  it('says days and weeks in the words a person uses', () => {
    expect(fromNow(0)).toBe('today');
    expect(fromNow(1)).toBe('tomorrow');
    expect(fromNow(5)).toBe('5 days');
    expect(fromNow(10)).toBe('next week');
    expect(fromNow(21)).toBe('3 weeks');
  });
});
