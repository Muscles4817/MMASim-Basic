/**
 * The inbox.
 *
 * Everything that needs the player, kept until they deal with it. The news feed is a
 * chronological list of things that happened to other people; anything that needed *an answer*
 * went into that same stream and was lost among sixty results.
 *
 * Decisions sort above everything regardless of age, because an unanswered decision from three
 * weeks ago outranks a result from this morning — one of them is still waiting on the player and
 * the other is history. That ordering is the whole screen.
 */

import { useMemo } from 'react';
import { inboxOrder, isBlocking, type InboxItem } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty } from '../ui';
import { Alert } from '../ui/signals';
import { formatGameDay } from '../shell/Shell';
import { markItemRead, readInbox, resolveItem } from '../game/inbox';

export function InboxScreen() {
  const { db, world, commit } = useGame();
  const { navigate } = useRouter();

  const items = useMemo(
    () => readInbox(db).slice().sort(inboxOrder),
    [db, world.day],
  );

  const decisions = items.filter(isBlocking);
  const rest = items.filter((i) => !isBlocking(i));

  const answer = (item: InboxItem, actionId: string) => {
    resolveItem(db, item.id, actionId);
    commit();
  };

  const open = (item: InboxItem) => {
    markItemRead(db, item.id);
    commit();
    if (item.link) navigate({ name: item.link.route } as never);
  };

  if (items.length === 0) {
    return (
      <Empty title="Nothing waiting">
        Anything that needs an answer will arrive here, and time will stop rather than run past
        it.
      </Empty>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {decisions.length > 0 && (
        <Alert tone="warn" title={`${decisions.length} waiting on you`}>
          Time will not move past these. Answer them, or say you have understood and deal with it
          yourself.
        </Alert>
      )}

      {decisions.map((item) => (
        <Card key={item.id} raised title={item.title}>
          {item.body && (
            <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
              {item.body}
            </p>
          )}
          <p className="faint" style={{ fontSize: 'var(--text-xs)' }}>
            {formatGameDay(item.day)}
          </p>

          <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {(item.actions ?? []).map((action) => (
              <Button
                key={action.id}
                variant={action.isDismiss ? 'secondary' : 'primary'}
                onClick={() => answer(item, action.id)}
              >
                {action.label}
              </Button>
            ))}
            {item.link && (
              <Button variant="ghost" onClick={() => open(item)}>
                Take me there
              </Button>
            )}
          </div>

          {/*
            The cost of each option under the buttons rather than in them. A confirmation that
            only says "are you sure" carries no information; one that says what it costs is the
            decision.
          */}
          {(item.actions ?? []).some((a) => a.detail) && (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-2)' }}>
              {(item.actions ?? [])
                .filter((a) => a.detail)
                .map((a) => (
                  <li key={a.id} className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                    <strong>{a.label}</strong> — {a.detail}
                  </li>
                ))}
            </ul>
          )}
        </Card>
      ))}

      {rest.length > 0 && (
        <Card flush title="Everything else">
          <div className="list">
            {rest.map((item) => (
              <button
                key={item.id}
                type="button"
                className="list__item"
                onClick={() => open(item)}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="list__primary"
                    style={{ display: 'block', fontWeight: item.readDay === undefined ? 700 : 400 }}
                  >
                    {item.title}
                  </span>
                  <span className="list__secondary" style={{ display: 'block' }}>
                    {formatGameDay(item.day)}
                    {item.body ? ` · ${item.body}` : ''}
                  </span>
                </span>
                {item.readDay === undefined && <Chip tone="accent">New</Chip>}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
