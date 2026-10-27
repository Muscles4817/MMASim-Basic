import { describe, expect, it } from 'vitest';
import { asDivisionId, asFighterId } from '../core/ids.js';
import { fightNews, type FightNewsInput } from './news.js';

const titleFight = (over: Partial<FightNewsInput>): FightNewsInput => ({
  day: 100 as never,
  boutId: 'b1',
  winnerName: 'Jon Reyes',
  loserName: 'Dan Hill',
  winnerId: asFighterId('f_r'),
  loserId: asFighterId('f_h'),
  method: 'decisionUnanimous',
  round: 5,
  divisionId: asDivisionId('mens-lightweight'),
  isTitleFight: true,
  ...over,
});

describe('a belt is somebody’s belt', () => {
  it('names the promotion and the division when the title changes hands', () => {
    const item = fightNews(titleFight({ promotionName: 'GCFC', titleChangedHands: true }));
    expect(item?.kind).toBe('titleChange');
    expect(item?.detail).toBe(
      "Beat Dan Hill by unanimous decision to take the GCFC Men's Lightweight title.",
    );
  });

  it('names them on a defence too', () => {
    const item = fightNews(titleFight({ promotionName: 'GCFC', titleChangedHands: false }));
    expect(item?.kind).toBe('titleDefence');
    expect(item?.detail).toBe(
      "Turned back Dan Hill by unanimous decision to keep the GCFC Men's Lightweight title.",
    );
  });

  it('falls back to "the title" when nobody says whose it is', () => {
    const item = fightNews(titleFight({ titleChangedHands: true }));
    expect(item?.detail).toBe('Beat Dan Hill by unanimous decision to take the title.');
  });
});
