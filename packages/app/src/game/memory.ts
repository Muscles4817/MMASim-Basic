/**
 * What a fight night leaves behind in the people on it. Doc 34 C3.
 *
 * Three things, all applied in one place after a bout settles so that `runCardBout` calls one
 * function rather than growing three more blocks:
 *
 *  - **Drift.** A title won, a knockout, a run of wins or losses moves the personality a few
 *    points (`driftAfter`). Everybody, every promotion, because a career changes the person
 *    having it wherever it happens.
 *  - **Memory.** What the bout means for the fighter's relationship with the promotion that made
 *    it — a shot given, a mismatch, a rematch owed and delivered — and, on a title fight, the
 *    contender who was passed over. Only the player's own promotion keeps a ledger: the ledger is
 *    the fighter-promoter relationship the player manages, and recording every AI promotion's
 *    history would cost save size for something nobody reads.
 *  - **Voice.** The winner's callout from the cage and a skipped contender's complaint, as news.
 */

import {
  boutMemories,
  calloutFor,
  displayName,
  driftAfter,
  isKoMethod,
  milestonesOf,
  newsId,
  voiceFor,
  withLedgerEntry,
  type Fighter,
  type FinishMethod,
  type LedgerKind,
  type NewsItem,
  type Promotion,
  type RankedFighter,
} from '@mmasim/engine';
import { getWorld, type GameDb } from '@mmasim/data';

const remember = (fighter: Fighter, promotion: Promotion, day: number, kinds: LedgerKind[]) =>
  kinds.length === 0
    ? fighter
    : {
        ...fighter,
        ledger: kinds.reduce(
          (ledger, kind) => withLedgerEntry(ledger, { day, promotionId: promotion.id, kind }),
          fighter.ledger,
        ),
      };

/** The words inside an attributed line: `Name: “…”` → `…`. */
const quoteOf = (text?: string): string | undefined => /“(.*)”$/.exec(text ?? '')?.[1];

/** The most recent quote in the feed, so the next one never repeats it. */
function lastQuote(db: GameDb): string | undefined {
  const voices = (db.news.findAll() as NewsItem[]).filter((n) => n.kind === 'voice');
  return quoteOf(voices.sort((a, b) => b.day - a.day)[0]?.detail);
}

export function afterTheBout(input: {
  db: GameDb;
  day: number;
  promotion: Promotion;
  red: Fighter;
  blue: Fighter;
  boutId: string;
  winnerId?: Fighter['id'];
  method: FinishMethod;
  isTitleFight: boolean;
  /** The champion going in. */
  championId?: Fighter['id'];
  /** The division as ranked before the fight; empty on a bulk tick. */
  ranked: readonly RankedFighter[];
  /** A bulk tick writes no sentences. */
  quiet: boolean;
}): { red: Fighter; blue: Fighter; news: NewsItem[] } {
  const { db, day, promotion, winnerId, method, isTitleFight, championId, ranked, quiet } = input;
  const keepsLedger = getWorld(db).playerPromotionId === promotion.id;
  const news: NewsItem[] = [];
  // The quote said last — tonight's if there is one yet, else the feed's.
  const previous = () => quoteOf(news[news.length - 1]?.detail) ?? lastQuote(db);

  const settle = (fighter: Fighter, opponent: Fighter): Fighter => {
    const won = winnerId === fighter.id;
    const lost = winnerId !== undefined && !won;
    const personality = driftAfter(
      fighter.personality,
      milestonesOf({
        won,
        knockedOut: lost && isKoMethod(method),
        wonTitle: isTitleFight && won && championId !== fighter.id,
        lostTitle: isTitleFight && lost && championId === fighter.id,
        streak: fighter.summary.streak,
      }),
    );
    const kinds = keepsLedger
      ? boutMemories({
          fighter,
          opponent,
          boutId: input.boutId,
          winnerId,
          method,
          isTitleFight,
          championId,
        })
      : [];
    return remember({ ...fighter, personality }, promotion, day, kinds);
  };

  const red = settle(input.red, input.blue);
  const blue = settle(input.blue, input.red);

  // The contender a title fight went past, who will remember it.
  if (keepsLedger && isTitleFight) {
    const next = ranked.find((r) => r.position === 1)?.fighter;
    if (next && next.id !== red.id && next.id !== blue.id) {
      const stored = (db.fighters.findById(next.id as string) as Fighter | undefined) ?? next;
      db.fighters.upsert(remember(stored, promotion, day, ['titleShotSkipped']) as never);
      if (!quiet) {
        const said = voiceFor(stored, 'titleSkipped', day, previous());
        news.push({
          id: newsId(day as never, `skipped_${input.boutId}`),
          day: day as never,
          kind: 'voice',
          weight: 'minor',
          headline: `${displayName(stored)} was passed over for the title shot.`,
          detail: said.text,
          fighterIds: [stored.id],
          divisionId: stored.divisionId,
          promotionId: promotion.id,
        });
      }
    }
  }

  // The winner's callout, on a night worth calling somebody out after.
  const winner = winnerId === red.id ? red : winnerId === blue.id ? blue : undefined;
  const loser = winner === red ? blue : winner === blue ? red : undefined;
  const notable = isTitleFight || isKoMethod(method) || method === 'submission';
  if (!quiet && winner && loser && notable) {
    const targets = ranked
      .filter((r) => r.fighter.id !== winner.id && r.fighter.id !== loser.id)
      .map((r) => r.fighter)
      .slice(0, 3);
    const callout = calloutFor({
      winner,
      loser,
      method,
      day: day as never,
      targets,
      previous: previous(),
    });
    if (callout) {
      news.push({
        id: newsId(day as never, `callout_${input.boutId}`),
        day: day as never,
        kind: 'voice',
        weight: 'minor',
        headline: `${displayName(winner)} has something to say.`,
        detail: callout.text,
        fighterIds: callout.targetId ? [winner.id, callout.targetId] : [winner.id],
        divisionId: winner.divisionId,
        promotionId: promotion.id,
      });
    }
  }

  return { red, blue, news };
}
