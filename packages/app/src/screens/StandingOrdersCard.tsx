/**
 * Standing orders, on the dashboard. Doc 34 B6.
 *
 * Two pieces of busywork a promoter can hand off, each stated as what it will do, so turning one
 * on is a decision with its consequences in front of it (`game/standingOrders.ts`).
 */

import type { StandingOrders } from '@mmasim/data';
import { useGame } from '../state/GameProvider';
import { Card, Segmented } from '../ui';
import { AUTO_RENEW_OPTIONS, PRELIMS_FROM_DAYS, RENEW_WITHIN_DAYS } from '../game/standingOrders';

export function StandingOrdersCard() {
  const { world, updateWorld } = useGame();
  const orders: StandingOrders = world.standingOrders ?? {};
  const set = (changes: Partial<StandingOrders>) =>
    updateWorld({ standingOrders: { ...orders, ...changes } });

  return (
    <Card title="Standing orders">
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <div>
          <Segmented
            label="The prelims"
            value={orders.matchmakerOwnsPrelims ? 'matchmaker' : 'me'}
            onChange={(v) => set({ matchmakerOwnsPrelims: v === 'matchmaker' })}
            options={[
              { value: 'me', label: 'I book the prelims' },
              { value: 'matchmaker', label: 'The matchmaker does' },
            ]}
          />
          <p
            className="faint prose"
            style={{ fontSize: 'var(--text-sm)', margin: 'var(--space-1) 0 0' }}
          >
            {orders.matchmakerOwnsPrelims
              ? `From ${PRELIMS_FROM_DAYS} days out, empty prelims are filled with the matchmaker's pick and offered. The main card stays yours.`
              : 'Every bout on every card is yours to book.'}
          </p>
        </div>
        <div>
          <Segmented
            label="Re-sign automatically"
            value={orders.autoRenew ?? 'off'}
            onChange={(v) => set({ autoRenew: v })}
            options={AUTO_RENEW_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
          />
          <p
            className="faint prose"
            style={{ fontSize: 'var(--text-sm)', margin: 'var(--space-1) 0 0' }}
          >
            {(orders.autoRenew ?? 'off') === 'off'
              ? 'Every re-signing is yours to negotiate.'
              : `${RENEW_WITHIN_DAYS} days before a deal ends, they are re-signed at the going rate: the best rival bid you can match, or their market terms. Anybody who does not want to stay is left to you.`}
          </p>
        </div>
      </div>
    </Card>
  );
}
