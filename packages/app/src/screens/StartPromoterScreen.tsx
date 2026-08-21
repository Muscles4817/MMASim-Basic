/**
 * Choosing which promotion to run.
 *
 * The weakest screen in the old flow, and the one where the honest answer is uncomfortable.
 *
 * It rendered a vertical stack of near-identical rows — `national 11 · USA · £3.1m to spend ·` —
 * one tap on any of which started the save with no confirmation whatsoever. The rows looked
 * identical because in a generated world **they very nearly are**: `generateWorld` builds every
 * promotion as a spread of the seed's first, so `baseCountry`, `notes`, `sponsorshipPolicy`,
 * `narrativeControl`, `matchmakingAggression`, `activityGuarantee` and `minimumPurse` are
 * constant across the whole sport, and only tier, prestige, budget and divisions vary.
 *
 * Doc 33 records that as a world-generation problem to fix separately. What this screen does in
 * the meantime is doc 32 § 11.5's option (a): **show the axes that genuinely vary, and stop
 * implying character that is not there.** No `notes`, no matchmaking posture, no invented
 * personality — a table of the things that are actually different, and a preview built from
 * `financialSnapshot` and `attentionFor`, which are real reads of real state.
 *
 * `attentionFor` is the interesting one. It has always worked for any promotion rather than only
 * the player's, and nothing ever asked it about one you were considering — so "what problem am I
 * inheriting" was computable from the day it shipped and was never on screen.
 */

import { useMemo, useState } from 'react';
import { displayName, getDivision, isActive, type Fighter, type Promotion } from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, DataTable, MasterDetail, Panel, type Column } from '../ui';
import { Alert, Help } from '../ui/signals';
import { AttentionRow, Ledger, LedgerRow } from '../ui/console';
import { money } from '../ui/format';
import { attentionFor } from '../game/attention';
import { describeRunway, financialSnapshot } from '../game/finances';
import { clearTransientCareerState } from '../game/career';
import { PROMOTION_TIER_LABELS } from '../game/labels';

export function StartPromoterScreen() {
  const { db, world, updateWorld } = useGame();
  const { navigate } = useRouter();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);

  /*
   * Regional only, and now the screen says why.
   *
   * The restriction is a real design decision — at the top of the sport payroll does not bite and
   * a broadcaster cannot plausibly drop you, so the pressure systems that make the mode a game
   * are inert there — and it was enforced in a `filter` and explained to nobody.
   */
  const regionals = useMemo(
    () =>
      (db.promotions.findAll() as unknown as Promotion[])
        .filter((p) => p.tier === 'regional')
        .sort((a, b) => b.prestige - a.prestige),
    [db],
  );

  const rosterSize = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of db.fighters.findAll() as Fighter[]) {
      if (!f.promotionId || !isActive(f, world.day)) continue;
      const key = f.promotionId as string;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [db, world.day]);

  const selected = selectedId
    ? (db.promotions.findById(selectedId) as Promotion | undefined)
    : undefined;

  /** The only place in this flow that writes `playerRole`. */
  const takeControl = (promotion: Promotion) => {
    clearTransientCareerState();
    updateWorld({
      playerRole: 'promoter',
      playerPromotionId: promotion.id as string,
      playerFighterId: undefined,
    });
    navigate({ name: 'promotion' });
  };

  const vacantBelts = (p: Promotion) =>
    p.divisions.filter((d) => p.champions[d] === undefined).length;

  /*
   * Five columns. The master column is an index — enough to tell two promotions apart and to
   * sort on, with the rest in the preview.
   *
   * Division count and region both went. Six columns overflowed the column and clipped prestige,
   * which is the one the table is *sorted by* — a sort you cannot see is not a sort. Both are in
   * the preview, which is on screen the moment a row is selected.
   */
  const columns: Column<Promotion>[] = [
    {
      id: 'name',
      label: 'Promotion',
      render: (p) => p.name,
      sort: (a, b) => a.name.localeCompare(b.name),
      onPhone: 'primary',
    },
    {
      id: 'budget',
      label: 'Cash',
      render: (p) => money(p.budget),
      sort: (a, b) => a.budget - b.budget,
      numeric: true,
      onPhone: 'secondary',
    },
    {
      id: 'roster',
      label: 'Roster',
      title: 'Active fighters signed here',
      render: (p) => rosterSize.get(p.id as string) ?? 0,
      sort: (a, b) => (rosterSize.get(a.id as string) ?? 0) - (rosterSize.get(b.id as string) ?? 0),
      numeric: true,
      onPhone: 'secondary',
    },
    {
      id: 'vacant',
      // Short, because a header cell is `nowrap` and a long one sets the column width: "Vacant
      // belts" was wide enough to push prestige — the sort column — off the edge.
      label: 'Vacant',
      title: 'A vacant belt is a tournament you can build a year around',
      render: (p) => {
        const n = vacantBelts(p);
        return n > 0 ? <Chip tone="info">{n}</Chip> : <span className="faint">—</span>;
      },
      sort: (a, b) => vacantBelts(a) - vacantBelts(b),
      onPhone: 'trailing',
    },
    {
      id: 'prestige',
      label: 'Prestige',
      title: 'What a fight is worth simply for happening here',
      render: (p) => p.prestige,
      sort: (a, b) => a.prestige - b.prestige,
      numeric: true,
      onPhone: 'trailing',
    },
  ];

  const list = (
    <>
      <Card>
        <p className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
          You decide who fights whom, who gets pushed and who gets cut.
        </p>
        <Help label="Why only regional promotions?">
          At the top of the sport the pressure systems are inert: a promotion with a £62m budget
          does not feel payroll and cannot plausibly lose its broadcaster, so the decisions that
          make the mode a game never arrive. Starting regional is a choice about which problem you
          want, not a difficulty setting.
        </Help>
      </Card>

      <Card flush title={`${regionals.length} to choose from`}>
        <DataTable
          rows={regionals}
          columns={columns}
          rowKey={(p) => p.id as string}
          caption="Regional promotions you could take control of"
          defaultSort="prestige"
          onRowClick={(p) => {
            setSelectedId(p.id as string);
            setConfirming(false);
          }}
          isCurrent={(p) => (p.id as string) === selectedId}
          empty={<p className="muted prose">This world has no regional promotions.</p>}
        />
      </Card>
    </>
  );

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }} data-testid="choose-promotion">
      <MasterDetail
        listLabel="Promotions"
        detailLabel="Preview"
        selected={selected !== undefined}
        onClear={() => {
          setSelectedId(undefined);
          setConfirming(false);
        }}
        list={list}
        placeholder={
          <Card>
            <p className="muted prose">
              Pick one to see what you would be inheriting — the money, the roster, the belts, and
              what already needs dealing with. Nothing starts until you say so.
            </p>
          </Card>
        }
        detail={
          selected && (
            <PromotionPreview
              promotion={selected}
              db={db}
              day={world.day}
              rosterSize={rosterSize.get(selected.id as string) ?? 0}
              confirming={confirming}
              onRequest={() => setConfirming(true)}
              onCancel={() => setConfirming(false)}
              onConfirm={() => takeControl(selected)}
            />
          )
        }
      />
    </div>
  );
}

/**
 * What you would be inheriting.
 *
 * Every figure here is a real read of real state: `financialSnapshot` for the money,
 * `attentionFor` for the problems, the roster for the depth, `champions` for the belts. Nothing
 * is invented to fill the panel, which is the constraint doc 33 imposes until generated
 * promotions have characters of their own.
 */
function PromotionPreview({
  promotion,
  db,
  day,
  rosterSize,
  confirming,
  onRequest,
  onCancel,
  onConfirm,
}: {
  promotion: Promotion;
  db: ReturnType<typeof useGame>['db'];
  day: number;
  rosterSize: number;
  confirming: boolean;
  onRequest(): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  const finances = useMemo(
    () => financialSnapshot({ db, promotion }),
    [db, promotion, day],
  );
  /*
   * What you would inherit — minus the things that are true of every promotion in the world.
   *
   * `attentionFor` opens with "Nothing on the calendar" at urgency 96, and on this screen that is
   * noise: *no* promotion has planned cards before somebody takes one over, so the row appears
   * first on every preview and distinguishes nothing. Planning the first card is the job, not a
   * problem being handed over.
   */
  const attention = useMemo(() => {
    /*
     * At most two of any one kind.
     *
     * A fresh world hands most promotions five or six fighters inside an activity guarantee, and
     * five rows of "X can walk for nothing" say less than two do — the sixth tells the player
     * nothing the second did not, and it crowds out the vacant belt and the champion who has not
     * defended. Variety is what makes a preview a read on a promotion rather than a list.
     */
    const perKind = new Map<string, number>();
    return attentionFor(db, promotion)
      .filter((item) => item.kind !== 'card')
      .filter((item) => {
        const seen = perKind.get(item.kind) ?? 0;
        perKind.set(item.kind, seen + 1);
        return seen < 2;
      });
  }, [db, promotion, day]);

  const champions = promotion.divisions.map((divisionId) => {
    const championId = promotion.champions[divisionId];
    const champion = championId
      ? (db.fighters.findById(championId as string) as Fighter | undefined)
      : undefined;
    return { divisionId, champion };
  });
  const vacant = champions.filter((c) => c.champion === undefined).length;

  return (
    <>
      <Card raised testId="take-control">
        <h2 style={{ fontSize: 'var(--text-xl)' }}>{promotion.name}</h2>
        <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>
          {PROMOTION_TIER_LABELS[promotion.tier]} · {promotion.baseCountry} · prestige{' '}
          {promotion.prestige}
        </p>

        {confirming ? (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
              {money(finances.cash)} in the bank, {rosterSize} fighters on the books, and{' '}
              {attention.length} thing{attention.length === 1 ? '' : 's'} already needing an
              answer. From here it is your promotion and its problems.
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={onConfirm}>
                Yes — run {promotion.shortName}
              </Button>
              <Button variant="ghost" onClick={onCancel}>
                Keep looking
              </Button>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <Button variant="primary" onClick={onRequest}>
              Run {promotion.name}
            </Button>
            <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>
              You are browsing. Nothing starts until you press this.
            </p>
          </div>
        )}
      </Card>

      <Card title="The business">
        <Ledger>
          <LedgerRow label="Cash" value={money(finances.cash)} />
          <LedgerRow label="Monthly burn" value={money(finances.monthlyBurn)} />
          <LedgerRow
            label="Roster"
            value={`${rosterSize} across ${promotion.divisions.length} divisions`}
            tone={rosterSize < promotion.divisions.length * 4 ? 'bad' : undefined}
          />
          {/* Not a bill: it is what makes hoarding legible. A promotion carrying eighty
              fighters it cannot afford to book has a problem upkeep alone does not show. */}
          <LedgerRow
            label="Roster, if all of them fought"
            value={money(finances.contractedPurses)}
          />
          <LedgerRow label="Minimum purse" value={money(promotion.minimumPurse)} />
        </Ledger>
        <p className="prose muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
          {describeRunway(finances)}
        </p>
      </Card>

      <Card title="The belts">
        {vacant > 0 && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <Alert tone="info" title={`${vacant} vacant`}>
              A vacant belt is a tournament you can build a year around, and a division nobody has
              a reason to care about yet.
            </Alert>
          </div>
        )}
        <Ledger>
          {champions.map(({ divisionId, champion }) => (
            /*
              `getDivision`, not a regex over the id.
              
              Stripping the `mens-`/`womens-` prefix rendered women's strawweight as
              "strawweight" beside men's flyweight as "flyweight", so the two sexes' divisions
              were indistinguishable in a list that contains both.
            */
            <LedgerRow
              key={divisionId}
              label={getDivision(divisionId).name}
              value={champion ? displayName(champion) : 'Vacant'}
              tone={champion ? undefined : 'bad'}
            />
          ))}
        </Ledger>
      </Card>

      {/*
        What already needs dealing with.

        `attentionFor` has always accepted any promotion and was only ever asked about the
        player's own. Asking it here is the difference between "£3.1m to spend" and "£3.1m, a
        champion who has not defended in eleven months, and four deals expiring next month" —
        which is the difference between two rows in a list and two different careers.
      */}
      <Panel title={attention.length === 0 ? 'Nothing outstanding' : 'What you would inherit'}>
        {attention.length === 0 ? (
          <p className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
            Nothing urgent on the books. A quiet promotion is a blank page, which is its own kind
            of problem.
          </p>
        ) : (
          <div className="attention">
            {attention.slice(0, 5).map((item) => (
              <AttentionRow
                key={item.id}
                tone={item.tone}
                title={item.title}
                detail={item.detail}
              />
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
