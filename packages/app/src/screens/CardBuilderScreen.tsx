/**
 * "Build a card", which is no longer a thing you do in one sitting.
 *
 * This route used to be the whole of promoter mode: it opened with nine fights already chosen,
 * and pressing one button both booked and ran the night. Cards are planned objects now — they
 * live in the save, they can be half empty for months, and they are edited on `PlanScreen`.
 *
 * So the route survives as a door rather than a screen. Old links, the dashboard's fallback and
 * anybody who typed `#/card` land here and get sent to the card they are actually working on, or
 * to the calendar to start one. Keeping it is cheaper than breaking every existing link, and a
 * redirect that explains itself is better than a 404 into the fighter hub.
 */

import { useEffect } from 'react';
import type { Promotion } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Empty } from '../ui';
import { nextPlan } from '../game/plans';

export function CardBuilderScreen() {
  const { db, world } = useGame();
  const { replace, navigate } = useRouter();

  const promotion = world.playerPromotionId
    ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
    : undefined;

  const next = promotion ? nextPlan(db, promotion.id as string, world.day) : undefined;

  // `replace` rather than `navigate`: this is a redirect, and leaving it in the history would
  // make the back button bounce the player between the card and the door to it.
  useEffect(() => {
    if (next) replace({ name: 'plan', id: next.id });
  }, [next, replace]);

  if (next) return null;

  return (
    <Empty title="No card in progress">
      A card starts with a date. Pick one months out, put your champion on it, and fill the rest
      as the fights become makeable.
      <span style={{ display: 'block', marginTop: 'var(--space-3)' }}>
        <Button variant="primary" onClick={() => navigate({ name: 'calendar' })}>
          Plan a card
        </Button>
      </span>
    </Empty>
  );
}
