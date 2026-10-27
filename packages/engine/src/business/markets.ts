/**
 * Where a card is staged, and what that costs.
 *
 * The market a card went to used to be decoration. The player picked one of five cities from a
 * list, `plan.city` was written onto the night, and nothing that earned or cost money ever read
 * it — so a regional show in Las Vegas cost exactly what the same show cost in Sacramento, and
 * the venue the night was actually held in came from one global list of five buildings, which is
 * how a promotion based in Ohio ran its cards in Rotterdam.
 *
 * Two things are fixed here. A market has a **cost factor** — renting a room, crewing it and
 * putting a production into it in Las Vegas costs about two and a half times what it does in a
 * small market — and a promotion has a **home market**, which is where its cards go unless the
 * promoter takes one somewhere else.
 */

import type { Promotion } from '../domain/organisations.js';

export interface Market {
  city: string;
  country: string;
  /**
   * What staging a card here costs, against a small market at 1.
   *
   * Applied to venue hire and production, which is where a city's prices land. Purses do not
   * move: a fighter is paid what their contract says wherever the cage is.
   */
  costFactor: number;
  /** One line for the market picker. */
  note: string;
}

/** A market nobody has priced: a small city with an ordinary hall. */
export const SMALL_MARKET_COST = 1;

/**
 * The markets with a price of their own.
 *
 * Everywhere else is a small market. The sport's destination cities sit at the top: Las Vegas is
 * the shop window and charges for it, and a capital-city arena is not far behind.
 */
const PRICED: readonly Market[] = [
  {
    city: 'Las Vegas',
    country: 'USA',
    costFactor: 2.5,
    note: 'The sport’s shop window. Expensive, and everybody watches.',
  },
  {
    city: 'New York',
    country: 'USA',
    costFactor: 2.3,
    note: 'The biggest room in the sport, at the biggest price.',
  },
  {
    city: 'Los Angeles',
    country: 'USA',
    costFactor: 2.1,
    note: 'A huge market that needs a reason to turn up.',
  },
  {
    city: 'Tokyo',
    country: 'Japan',
    costFactor: 2,
    note: 'Enormous when it lands. Indifferent when it does not.',
  },
  {
    city: 'London',
    country: 'UK',
    costFactor: 2,
    note: 'A capital-city crowd at capital-city prices.',
  },
  {
    city: 'Singapore',
    country: 'Singapore',
    costFactor: 1.9,
    note: 'A polished room, built for television.',
  },
  {
    city: 'Chicago',
    country: 'USA',
    costFactor: 1.7,
    note: 'A big fight town that expects a big card.',
  },
  { city: 'Miami', country: 'USA', costFactor: 1.6, note: 'Glamour, and a bill to match.' },
  {
    city: 'Houston',
    country: 'USA',
    costFactor: 1.4,
    note: 'A big city that turns out for a card.',
  },
  {
    city: 'Dallas',
    country: 'USA',
    costFactor: 1.4,
    note: 'A big city that turns out for a card.',
  },
  {
    city: 'Atlanta',
    country: 'USA',
    costFactor: 1.4,
    note: 'A big city that turns out for a card.',
  },
  { city: 'Philadelphia', country: 'USA', costFactor: 1.4, note: 'A hard crowd in a big city.' },
  { city: 'Boston', country: 'USA', costFactor: 1.4, note: 'A hard crowd in a big city.' },
  { city: 'Denver', country: 'USA', costFactor: 1.3, note: 'A mid-sized room that fills.' },
  { city: 'Phoenix', country: 'USA', costFactor: 1.3, note: 'A mid-sized room that fills.' },
  { city: 'Minneapolis', country: 'USA', costFactor: 1.3, note: 'A mid-sized room that fills.' },
  { city: 'Kansas City', country: 'USA', costFactor: 1.2, note: 'A working fight town.' },
  { city: 'Nashville', country: 'USA', costFactor: 1.2, note: 'A working fight town.' },
  {
    city: 'Manchester',
    country: 'UK',
    costFactor: 1.4,
    note: 'Loud, loyal, and it turns out for its own.',
  },
  {
    city: 'Warsaw',
    country: 'Poland',
    costFactor: 1.3,
    note: 'A national-team crowd for a national promotion.',
  },
  {
    city: 'Prague',
    country: 'Czechia',
    costFactor: 1.2,
    note: 'A small country that fills a big room.',
  },
  {
    city: 'Rotterdam',
    country: 'Netherlands',
    costFactor: 1.1,
    note: 'A small room and a hard crowd. Where reputations start.',
  },
  {
    city: 'Sacramento',
    country: 'USA',
    costFactor: 1.1,
    note: 'A working fight town. Cheap to run, reliably full.',
  },
];

/** Where a promotion with no home city of its own is taken to be based. */
const CAPITAL: Readonly<Record<string, string>> = {
  USA: 'Las Vegas',
  UK: 'London',
  England: 'London',
  Japan: 'Tokyo',
  Singapore: 'Singapore',
  Poland: 'Warsaw',
  Czechia: 'Prague',
  Netherlands: 'Rotterdam',
};

/** The market in this city: priced if the sport prices it, a small market if not. */
export function marketOf(city: string, country: string): Market {
  return (
    PRICED.find((m) => m.city === city) ?? {
      city,
      country,
      costFactor: SMALL_MARKET_COST,
      note: 'A small market. Cheap to run, and the crowd is your own.',
    }
  );
}

/** Where this promotion stages a card unless the promoter takes it elsewhere. */
export function homeMarket(promotion: Promotion): Market {
  const city = promotion.homeCity ?? CAPITAL[promotion.baseCountry] ?? 'Las Vegas';
  return marketOf(city, promotion.baseCountry);
}

/**
 * The markets a promoter can choose between: home first, then the shop window, then the big
 * rooms of their own country.
 */
export function marketsFor(promotion: Promotion): readonly Market[] {
  const home = homeMarket(promotion);
  const rest = PRICED.filter(
    (m) => m.city !== home.city && (m.city === 'Las Vegas' || m.country === promotion.baseCountry),
  );
  return [home, ...rest.slice(0, 5)];
}
