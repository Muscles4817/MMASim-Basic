/**
 * The history book. Doc 34 B6.
 *
 * Four tabs, one per question a promoter asks of their own past: who has held each belt, what the
 * promotion has done, who its greats were, and what became of the fighters it let go. Everything
 * here is read from the save (`game/history.ts`); nothing on this screen changes anything.
 */

import { useMemo, useState } from 'react';
import type { Promotion } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, ListItem, Segmented } from '../ui';
import { formatGameDay } from '../shell/Shell';
import { PromoterSubNav } from './promoterNav';
import {
  HALL_OF_FAME_BAR,
  hallOfFame,
  promotionTimeline,
  titleLineages,
  whereAreTheyNow,
} from '../game/history';

type Tab = 'belts' | 'timeline' | 'hall' | 'former';

export function HistoryScreen() {
  const { db, world } = useGame();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<Tab>('belts');

  const promotion = world.playerPromotionId
    ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
    : undefined;

  const book = useMemo(
    () =>
      promotion
        ? {
            lineages: titleLineages(db, promotion),
            timeline: promotionTimeline(db, promotion).slice(0, 60),
            hall: hallOfFame(db, promotion),
            former: whereAreTheyNow(db, promotion),
          }
        : undefined,
    [db, promotion, world.day],
  );

  if (!promotion || !book) {
    return (
      <Empty title="No promotion">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Choose one
        </Button>
      </Empty>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <PromoterSubNav current="history" />

      <Segmented
        label="Which part of the history"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'belts', label: 'Belts' },
          { value: 'timeline', label: 'Timeline' },
          { value: 'hall', label: 'Hall of fame' },
          { value: 'former', label: 'Where are they now' },
        ]}
      />

      {tab === 'belts' && (
        <div className="division-grid">
          {book.lineages.map((lineage) => (
            <Card key={lineage.divisionId} title={lineage.division} flush>
              {lineage.reigns.length === 0 ? (
                <p className="muted prose" style={{ padding: 'var(--space-4)', margin: 0 }}>
                  Never contested.
                </p>
              ) : (
                <div className="list">
                  {lineage.reigns.map((r) => (
                    <ListItem
                      key={`${r.fighterId}:${r.wonDay}`}
                      onClick={() => navigate({ name: 'fighter', id: r.fighterId })}
                      primary={r.name}
                      secondary={`${formatGameDay(r.wonDay)} – ${
                        r.lostDay === undefined ? 'now' : formatGameDay(r.lostDay)
                      } · ${r.defences} ${r.defences === 1 ? 'defence' : 'defences'} · ${r.how}${
                        r.ended ? ` · ${r.ended}` : ''
                      }`}
                      trailing={
                        r.lostDay === undefined ? <Chip tone="accent">Champion</Chip> : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === 'timeline' &&
        (book.timeline.length === 0 ? (
          <Empty title="Nothing yet">Run a card and it starts here.</Empty>
        ) : (
          <Card flush title={`${promotion.shortName}, newest first`}>
            <div className="list">
              {book.timeline.map((entry) => (
                <ListItem
                  key={`${entry.kind}:${entry.day}:${entry.title}`}
                  onClick={entry.link ? () => navigate(entry.link as never) : undefined}
                  primary={entry.title}
                  secondary={`${formatGameDay(entry.day)}${entry.detail ? ` · ${entry.detail}` : ''}`}
                  trailing={
                    entry.kind === 'titleChange' ? (
                      <Chip tone="accent">Belt</Chip>
                    ) : entry.kind === 'cancelled' ? (
                      <Chip tone="negative">Off</Chip>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </Card>
        ))}

      {tab === 'hall' &&
        (book.hall.length === 0 ? (
          <Empty title="Nobody yet">
            A hall of fame is earned over years: belts held, defended, and nights that made the
            promotion.
          </Empty>
        ) : (
          <Card flush title="The promotion's greats">
            <p
              className="muted prose"
              style={{ padding: '0 var(--space-4)', fontSize: 'var(--text-sm)' }}
            >
              Scored on what they did here — reigns and defences above all. Retired fighters over
              the bar ({HALL_OF_FAME_BAR}) are in; active ones over it are on course.
            </p>
            <div className="list">
              {book.hall.map((legend) => (
                <ListItem
                  key={legend.fighterId}
                  onClick={() => navigate({ name: 'fighter', id: legend.fighterId })}
                  primary={legend.name}
                  secondary={legend.line}
                  trailing={
                    legend.inducted ? (
                      <Chip tone="accent">Inducted</Chip>
                    ) : legend.score >= HALL_OF_FAME_BAR ? (
                      <Chip tone="positive">On course</Chip>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </Card>
        ))}

      {tab === 'former' &&
        (book.former.length === 0 ? (
          <Empty title="Nobody cut">The fighters you release will be followed here.</Empty>
        ) : (
          <Card flush title="Fighters you let go">
            <div className="list">
              {book.former.map((f) => (
                <ListItem
                  key={f.fighterId}
                  onClick={() => navigate({ name: 'fighter', id: f.fighterId })}
                  primary={f.name}
                  secondary={`Cut ${formatGameDay(f.cutDay)} · ${f.now}${
                    f.since ? ` · ${f.since} since` : ' · not fought since'
                  }`}
                  trailing={
                    f.belts.length > 0 ? <Chip tone="accent">{f.belts.join(', ')}</Chip> : undefined
                  }
                />
              ))}
            </div>
          </Card>
        ))}
    </div>
  );
}
