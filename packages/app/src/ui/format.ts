/**
 * How money reads on screen.
 *
 * Presentation only — `game/money.ts` moves the money, this decides what it looks like when it
 * gets there, and the two are deliberately separate files for that reason.
 *
 * There was no shared formatter, so every screen wrote its own `£${Math.round(x * 10) / 10}k`
 * inline and they quietly disagreed. Worse, a balance appeared in exactly three places in the
 * whole game — the hub's stat card, a chip at the top of the training screen, and inside the
 * confirmation sentence of a spend that was *already* affordable — none of which is where the
 * player is actually deciding whether to spend. Asked to approve £40k for eight weeks at a gym,
 * they were doing arithmetic against a number two screens away.
 *
 * Money is in thousands everywhere in this codebase, which is the other half of it: the unit is
 * only obvious if the suffix is always present. So it always is.
 */

/** A balance or a price. Always suffixed, so the unit is never a thing to remember. */
export function money(thousands: number): string {
  const rounded = Math.round(thousands * 10) / 10;
  // The sign goes outside the symbol. `£-12.5k` reads as a typo; `-£12.5k` reads as a debt.
  const sign = rounded < 0 ? '-' : '';
  const size = Math.abs(rounded);
  // Millions rather than five-digit thousands, because a promoter's budget is 62000k and that
  // reads as a number nobody can size at a glance.
  if (size >= 1000) return `${sign}£${Math.round(size / 100) / 10}m`;
  return `${sign}£${size}k`;
}

/** Whether a balance is in the red, so the header can colour it without re-parsing the string. */
export const isOverdrawn = (thousands: number): boolean => thousands < 0;

/**
 * What a spend costs and what it leaves.
 *
 * The sentence the player actually needs, and the one missing at nearly every point of spending:
 * not "this costs £40k" but "£40k of your £52k, leaving £12k". A price on its own asks the player
 * to hold their balance in their head. This does not.
 */
export function spendLine(input: { cost: number; balance: number }): string {
  const { cost, balance } = input;
  const left = Math.round((balance - cost) * 10) / 10;
  if (left < 0) {
    return `${money(cost)} — you have ${money(balance)}, so this puts you ${money(Math.abs(left))} in the red.`;
  }
  return `${money(cost)} of your ${money(balance)}, leaving ${money(left)}.`;
}
