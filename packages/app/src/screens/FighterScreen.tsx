/**
 * Somebody else's page, and your own.
 *
 * Both are containers around one `FighterView`. All they do is resolve the subject, decide who is
 * looking, and supply the actions that viewer has — which is exactly the boundary doc 32 § 6
 * argues for: the facts are shared, the framing and the actions are contextual, and mode arrives
 * as a prop at the route rather than as a `world.playerRole` branch inside a shared component.
 *
 * The split into two routes is deliberate rather than cosmetic. `#/fighter/:id` is a page *about*
 * a fighter and belongs in a back stack; `#/me` is a place you go, sits under the Career tab, and
 * should not leave the player pressing back through their own profile to get home. Landing on
 * your own id redirects, so a link from a ranking table still does the right thing.
 */

import { useEffect } from 'react';
import { type Fighter } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Empty } from '../ui';
import { FighterView, type FighterViewer } from './FighterView';
import { bookedOnPlans } from '../game/finances';

export function FighterScreen({ id }: { id: string }) {
  const { db, world, playerFighter } = useGame();
  const { navigate, replace } = useRouter();

  const fighter = db.fighters.findById(id) as Fighter | undefined;
  const isPlayer = playerFighter !== undefined && playerFighter.id === id;

  /*
   * Your own page is `#/me`.
   *
   * A replace rather than a render, so the back stack never holds two routes for one subject —
   * and so a deep link, a ranking row and the rankings' "You" chip all arrive at the version
   * written in the first person.
   */
  useEffect(() => {
    if (isPlayer) replace({ name: 'me' });
  }, [isPlayer, replace]);

  if (!fighter) {
    return (
      <Empty title="Fighter not found">
        <Button variant="primary" onClick={() => navigate({ name: 'roster' })}>
          Back to roster
        </Button>
      </Empty>
    );
  }

  const isPromoter = world.playerRole === 'promoter';
  const viewer: FighterViewer = isPromoter
    ? 'promoter'
    : world.playerRole === 'coach'
      ? 'coach'
      : 'none';

  /*
   * Whether this fighter is one of *yours*.
   *
   * The promoter block is meaningless for somebody signed elsewhere — you cannot book them,
   * extend them or release them — and an empty version of it would be worse than none.
   */
  const isYours =
    isPromoter &&
    world.playerPromotionId !== undefined &&
    fighter.promotionId === world.playerPromotionId;

  return (
    <FighterView
      db={db}
      day={world.day}
      fighter={fighter}
      viewer={viewer}
      /* Only a promoter has cards to be booked on, so only a promoter asks. In fighter mode
         `playerPromotionId` is undefined and this was asked anyway, which left the availability
         chip on every fighter page in the mode answering a question nobody had put. */
      booked={isPromoter ? bookedOnPlans(db, world.playerPromotionId, world.day).has(id) : false}
      actions={
        isYours ? (
          <Button variant="primary" onClick={() => navigate({ name: 'calendar' })}>
            Put them on a card
          </Button>
        ) : undefined
      }
      onOpponentClick={(opponentId) => navigate({ name: 'fighter', id: opponentId })}
    />
  );
}

/**
 * Your own fighter, in the first person.
 *
 * The screen the audit asked for by name. The old profile described the player's own character as
 * though scouting a stranger — `WHERE THEY STAND`, `HOW THEY DECIDE`, `WHAT THEY WANT`, *they
 * fight here on a handshake* — while `isPlayer` was computed and spent on one thing.
 */
export function MeScreen() {
  const { db, world, playerFighter } = useGame();
  const { navigate } = useRouter();

  if (!playerFighter) {
    return (
      <Empty title="No career in progress">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Start a career
        </Button>
      </Empty>
    );
  }

  return (
    <FighterView
      db={db}
      day={world.day}
      fighter={playerFighter}
      viewer="self"
      actions={
        <>
          <Button onClick={() => navigate({ name: 'contract' })}>My deal</Button>
          <Button onClick={() => navigate({ name: 'training' })}>Training</Button>
        </>
      }
      onOpponentClick={(opponentId) => navigate({ name: 'fighter', id: opponentId })}
    />
  );
}
