/**
 * Your deal, and everything that could replace it.
 *
 * This was `OffersScreen`, and the name described a third of what belongs here. Doc 32 § 3.2
 * found the information architecture inverted: **every negotiating lever in the game was on the
 * dashboard**. The re-paper offer, the grounds to reopen a deal, the request for release, the
 * release risk, the fairness read and the manager were all rendered on the career hub, inside
 * alerts, while the screen actually named after contracts could sign a deal and do nothing else.
 *
 * So the levers moved here, where the deal they act on is on screen beside them. What is left on
 * the hub is one row saying there is something to read, which is what a dashboard is for.
 *
 * The other half of the fix is that this screen and the hub now read the **same market**. There
 * used to be two: `promotionOffers()` fed the hub and `offersFor()` fed this screen, and they
 * disagreed about who was interested and what the money was. `promotionOffers` is deleted.
 *
 * The design rule the offer list still honours, from the original screen and worth keeping: **an
 * offer is a future, not a number.** Every offer leads with money, route and level drawn from
 * real world state rather than with a purse to compare — and the comparison table exists on top
 * of that rather than instead of it, because a fighter choosing between two promotions is doing
 * both things at once.
 */

import { useMemo, useState } from 'react';
import {
  describeAdviceRecord,
  describeFairness,
  describeReleaseRisk,
  describeStable,
  describeTrigger,
  releaseRisk,
  renegotiationTriggers,
  type Offer,
  type RepaperOffer,
} from '@mmasim/engine';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, DataTable, Empty, Panel, type Column } from '../ui';
import { Alert, Help, StateRow } from '../ui/signals';
import { Console, Ledger, LedgerRow } from '../ui/console';
import { money } from '../ui/format';
import { getLadderStatus } from '../game/progression';
import {
  acceptRepaperOffer,
  contractStanding,
  hire,
  managersWillingToRepresent,
  offersOnTheTable,
  repaperOnTheTable,
  requestRelease,
  sign,
} from '../game/contracts';

export function ContractScreen() {
  const { db, world, playerFighter, commit } = useGame();
  const { navigate } = useRouter();
  const [selected, setSelected] = useState<string | undefined>();
  const [confirmingSign, setConfirmingSign] = useState(false);
  const [confirmingManager, setConfirmingManager] = useState<string | undefined>();
  const [confirmingRepaper, setConfirmingRepaper] = useState(false);
  const [signedRepaper, setSignedRepaper] = useState<RepaperOffer | undefined>();
  const [releaseWord, setReleaseWord] = useState<string | undefined>();
  const [refusal, setRefusal] = useState<string | undefined>();

  const offers = useMemo(
    () => (playerFighter ? offersOnTheTable(db, playerFighter) : []),
    [db, playerFighter, world.day],
  );
  const managers = useMemo(
    () => (playerFighter ? managersWillingToRepresent(db, playerFighter) : []),
    [db, playerFighter],
  );

  if (!playerFighter) {
    return (
      <Empty title="No career in progress">
        <Button variant="primary" onClick={() => navigate({ name: 'start' })}>
          Start a career
        </Button>
      </Empty>
    );
  }

  const fighter = playerFighter;
  const standing = contractStanding(db, fighter);
  const ladder = getLadderStatus(db, fighter);
  const repaper = repaperOnTheTable(db, fighter);
  const triggers =
    standing.agreement && standing.promotion
      ? renegotiationTriggers(standing.agreement, fighter, standing.promotion, {
          isChampion: ladder.isChampion,
        })
      : [];
  const jobRisk =
    standing.promotion && !standing.freeAgent ? releaseRisk(fighter, standing.promotion) : 0;

  const chosen = offers.find((o) => (o.promotion.id as string) === selected);

  /*
   * Which half of the screen leads.
   *
   * Not a fixed layout, because the question the screen answers changes with the situation. A
   * free agent, or anybody with somebody calling, is here about the market — so the market takes
   * the wide column and comes first on a phone. A contracted fighter with nobody calling is here
   * about their own deal, and putting "Nobody is calling" above it would be answering a question
   * they did not ask.
   */
  const marketLeads = standing.freeAgent || offers.length > 0;

  const columns: Column<Offer>[] = [
    {
      id: 'promotion',
      label: 'Promotion',
      render: (o) => o.promotion.name,
      sort: (a, b) => a.promotion.name.localeCompare(b.promotion.name),
      onPhone: 'primary',
    },
    {
      id: 'pay',
      label: 'Show / win',
      render: (o) => `${money(o.terms.showPurse)} / ${money(o.terms.winBonus)}`,
      sort: (a, b) =>
        a.terms.showPurse + a.terms.winBonus - (b.terms.showPurse + b.terms.winBonus),
      numeric: true,
      onPhone: 'secondary',
    },
    {
      id: 'owed',
      label: 'Fights',
      title: 'Fights owed before the deal is up',
      render: (o) => o.terms.fightsOwed,
      sort: (a, b) => a.terms.fightsOwed - b.terms.fightsOwed,
      numeric: true,
      onPhone: 'secondary',
    },
    {
      id: 'move',
      label: 'Move',
      render: (o) => <Chip tone={motiveTone(o)}>{motiveLabel(o)}</Chip>,
      onPhone: 'trailing',
    },
    {
      id: 'edge',
      label: 'Unmatchable',
      title: 'Terms your current promotion structurally cannot replicate',
      render: (o) =>
        o.unmatchable.length > 0 ? (
          <Chip tone="positive" title={o.unmatchable.join(' ')}>
            Yes
          </Chip>
        ) : (
          <span className="faint">—</span>
        ),
      onPhone: 'trailing',
    },
  ];

  // --- The market -------------------------------------------------------------------------

  const market = (
    <Panel
      testId="offers"
      title={offers.length === 0 ? 'Nobody is calling' : `${offers.length} on the table`}
      action={
        chosen && (
          <Button size="sm" variant="ghost" onClick={() => setSelected(undefined)}>
            Clear
          </Button>
        )
      }
    >
      {refusal && (
        <Alert tone="warn" title="You cannot sign this">
          {refusal}
        </Alert>
      )}

      {offers.length === 0 ? (
        <p className="muted prose">
          Nothing right now. This sport has one buyer that matters and a handful who cannot
          compete with it — free agency is usually about getting out, not being fought over. Win,
          or find somebody who can get a matchmaker on the phone.
        </p>
      ) : (
        <>
          <Card flush>
            <DataTable
              rows={offers}
              columns={columns}
              rowKey={(o) => o.promotion.id as string}
              caption="Promotions with an offer on the table"
              onRowClick={(o) => {
                setSelected(o.promotion.id as string);
                setConfirmingSign(false);
              }}
              isCurrent={(o) => (o.promotion.id as string) === selected}
            />
          </Card>

          {chosen ? (
            <OfferDetail
              offer={chosen}
              canSign={standing.freeAgent}
              confirming={confirmingSign}
              onConfirm={() => setConfirmingSign(true)}
              onCancel={() => setConfirmingSign(false)}
              onAccept={() => {
                // `sign` refuses rather than corrupting when the fighter is still under
                // contract. The panel is gated on `canSign`, so a refusal here means the gate
                // and the rule disagreed — say so rather than navigating away as though
                // something happened.
                const result = sign(db, fighter, chosen.promotion, chosen.terms);
                if (!result.ok) {
                  setRefusal(result.reason);
                  return;
                }
                commit();
                navigate({ name: 'hub' });
              }}
            />
          ) : (
            <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
              Pick one to see the whole deal — what it pays, where you would slot in, and what
              you would be signing away.
            </p>
          )}
        </>
      )}
    </Panel>
  );

  // --- Your deal ---------------------------------------------------------------------------

  const deal = (
    <Card title="Your deal" testId="your-deal">
      {standing.freeAgent || !standing.agreement ? (
        <Alert tone="warn" title="You are a free agent">
          Nobody is obliged to offer you anything. Every week without a booking is a week your
          name gets smaller and your timing gets worse.
        </Alert>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <Ledger>
            <LedgerRow label="Promotion" value={standing.promotion?.name ?? '—'} />
            <LedgerRow label="To show" value={money(standing.agreement.showPurse)} />
            <LedgerRow label="To win" value={money(standing.agreement.winBonus)} />
            <LedgerRow
              label="Fights left"
              value={standing.status?.fightsRemaining ?? 0}
              tone={(standing.status?.fightsRemaining ?? 0) <= 1 ? 'bad' : undefined}
            />
            <LedgerRow
              label="Activity owed"
              value={`${standing.agreement.activityGuarantee} a year`}
            />
            <LedgerRow
              label="Days on the clock"
              value={Math.max(0, standing.agreement.expiresDay - world.day)}
            />
            {standing.agreement.tolledDays > 0 && (
              <LedgerRow
                label="Clock stopped for"
                value={`${standing.agreement.tolledDays} days`}
                tone="bad"
              />
            )}
            <LedgerRow
              label="Championship clause"
              value={
                standing.agreement.championshipExtension === 'standard'
                  ? 'You cannot leave holding the belt'
                  : 'None'
              }
              tone={standing.agreement.championshipExtension === 'standard' ? 'bad' : undefined}
            />
          </Ledger>

          {/* The fairness ratio is computed and deliberately never shown as a number — a ratio
              needs a paragraph and a sentence does not. */}
          <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
            {describeFairness(standing.fairness ?? 1)}
          </p>

          {jobRisk > 0 && (
            <Alert
              tone={jobRisk >= 0.45 ? 'danger' : 'warn'}
              title={jobRisk >= 0.45 ? 'You are fighting for your job' : 'Your place is slipping'}
            >
              {describeReleaseRisk(jobRisk)}
            </Alert>
          )}

          {standing.agreement.tolledDays > 0 && (
            <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
              The clock has been stopped for {standing.agreement.tolledDays} days you were not
              available. Time out does not run a deal down.
            </p>
          )}
        </div>
      )}
    </Card>
  );

  // --- Reopening it -----------------------------------------------------------------------

  const negotiation =
    standing.freeAgent || !standing.agreement ? undefined : (
      <Card title="Reopening it" testId="negotiation">
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          {/*
            The ratchet — doc 16's re-paper, which used to live in an alert on the dashboard.
            Both halves are stated plainly, including the ones that cost you, because the whole
            point is that it is a real decision and a fighter who says yes should know exactly
            what they said yes to.
          */}
          {repaper && !signedRepaper && (
            <Alert tone="good" title="They want to tear this up">
              <span className="prose" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                {repaper.reason}
              </span>
              <span className="prose" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                <strong>
                  {money(repaper.terms.showPurse)} to show, {money(repaper.terms.winBonus)} to win
                </strong>{' '}
                — up from {money(repaper.current.showPurse)} and {money(repaper.current.winBonus)},
                a {Math.round(repaper.uplift * 100)}% rise starting with your next fight.
              </span>
              <span className="prose" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
                In exchange the deal restarts at{' '}
                <strong>{repaper.terms.fightsOwed} fights</strong> owed, where you currently owe{' '}
                {repaper.current.fightsRemaining}
                {repaper.terms.championshipExtension !== 'none' &&
                  ', and the championship extension is reattached'}
                . Saying no costs you nothing today, but the offer may not come back at this
                price.
              </span>
              {confirmingRepaper ? (
                <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Button
                    onClick={() => {
                      acceptRepaperOffer(db, fighter, repaper);
                      setSignedRepaper(repaper);
                      setConfirmingRepaper(false);
                      commit();
                    }}
                  >
                    Yes — sign it
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmingRepaper(false)}>
                    Not yet
                  </Button>
                </span>
              ) : (
                <Button variant="secondary" onClick={() => setConfirmingRepaper(true)}>
                  Sign it
                </Button>
              )}
            </Alert>
          )}

          {/* The receipt. Its own region rather than a branch inside the alert, because the
              alert is gone by then: `standing` recomputes on commit and the offer stops
              existing, which is why signing used to leave no evidence anything happened. */}
          {signedRepaper && (
            <Alert tone="good" title="Signed">
              <span className="prose" style={{ display: 'block' }}>
                You now owe {signedRepaper.terms.fightsOwed} fights at{' '}
                {money(signedRepaper.terms.showPurse)} to show and{' '}
                {money(signedRepaper.terms.winBonus)} to win.
              </span>
            </Alert>
          )}

          {triggers.length > 0 && !repaper && (
            <Alert tone="info" title="You have grounds to reopen this">
              {describeTrigger(triggers[0]!)}
            </Alert>
          )}

          {releaseWord ? (
            <Alert tone="info" title="You asked for your release">
              {releaseWord}
            </Alert>
          ) : (
            <div>
              <p className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
                You can ask to be let go. Whether they agree depends on what you are worth to
                them and on how much of the deal is left.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  const outcome = requestRelease(db, fighter);
                  setReleaseWord(outcome.reason);
                  commit();
                }}
                style={{ marginTop: 'var(--space-2)' }}
              >
                Ask to be released
              </Button>
            </div>
          )}
        </div>
      </Card>
    );

  // --- Representation ----------------------------------------------------------------------

  const representation = (
    <Card title="Who negotiates for you" testId="representation">
      {standing.manager ? (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <StateRow
            label={standing.manager.name}
            value={`${Math.round(standing.manager.purseRate * 100)}%`}
            state="of every purse"
            emphasis="secondary"
          />
          <p className="prose" style={{ fontSize: 'var(--text-sm)' }}>
            {standing.manager.blurb}
          </p>
          {/*
            Their record of being right, and who else they carry.

            Both were rendered on the career hub and both are about the person negotiating for
            you, so they came here with them. The advice record is the more interesting of the
            two: the hub logs what a manager said about every fight against what actually
            happened, and a manager who has been wrong three times running is a fact a fighter
            should be able to look up.
          */}
          <p className="muted prose" style={{ fontSize: 'var(--text-sm)' }}>
            {describeAdviceRecord(standing.manager)} {describeStable(standing.manager)}
          </p>
        </div>
      ) : (
        <>
          <p className="muted prose" style={{ marginBottom: 'var(--space-3)' }}>
            You have nobody. You will only hear from promotions that already know your name, and
            you will negotiate against people who do this professionally. Some fighters genuinely
            prefer it — you keep every penny.
          </p>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {managers.length === 0 ? (
              <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
                Nobody will take you on yet. A better gym vouching for you does more than a better
                record — managers bet on potential, and they hear about it from coaches.
              </p>
            ) : (
              managers.map((manager) => (
                <div
                  key={manager.id as string}
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div
                    className="row"
                    style={{ justifyContent: 'space-between', gap: 'var(--space-2)' }}
                  >
                    <strong>{manager.name}</strong>
                    <Chip tone="neutral">{Math.round(manager.purseRate * 100)}% of purse</Chip>
                  </div>
                  <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginTop: 2 }}>
                    {manager.blurb}
                  </p>
                  {/* Hiring takes a permanent cut of every purse from here on. One tap on a
                      list of six was the least reversible thing on the screen. */}
                  {confirmingManager === (manager.id as string) ? (
                    <div
                      className="row"
                      style={{
                        gap: 'var(--space-2)',
                        marginTop: 'var(--space-2)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <Button
                        size="sm"
                        onClick={() => {
                          hire(db, fighter, manager);
                          setConfirmingManager(undefined);
                          commit();
                        }}
                      >
                        Yes — {Math.round(manager.purseRate * 100)}% of every purse
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmingManager(undefined)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setConfirmingManager(manager.id as string)}
                      style={{ marginTop: 'var(--space-2)' }}
                    >
                      Sign with {manager.name.split(' ')[1] ?? manager.name}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Card>
  );

  const lock = !standing.freeAgent && standing.agreement && (
    <Alert tone="warn" title="You are under contract">
      {standing.status?.summary} You can look, and until the deal is up you cannot sign anything.
    </Alert>
  );

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }} data-testid="contract">
      {lock}
      <Console
        main={
          marketLeads ? (
            <>
              {market}
              {negotiation}
            </>
          ) : (
            <>
              {deal}
              {negotiation}
            </>
          )
        }
        side={
          marketLeads ? (
            <>
              {deal}
              {representation}
            </>
          ) : (
            <>
              {market}
              {representation}
            </>
          )
        }
      />
    </div>
  );
}

// --- One offer, in full --------------------------------------------------------------------

function motiveLabel(offer: Offer): string {
  return offer.motive === 'reach'
    ? 'A leap'
    : offer.motive === 'ascend'
      ? 'Step up'
      : offer.motive === 'lateral'
        ? 'Sideways'
        : 'Step down';
}

function motiveTone(offer: Offer) {
  return offer.motive === 'reach'
    ? ('accent' as const)
    : offer.motive === 'ascend'
      ? ('info' as const)
      : offer.motive === 'lateral'
        ? ('neutral' as const)
        : ('warning' as const);
}

/**
 * The selected offer, expanded.
 *
 * Below the comparison table rather than inside it, because the table answers "which of these"
 * and this answers "what exactly am I signing" — and the second question has an answer four
 * paragraphs long that no column can hold.
 */
function OfferDetail({
  offer,
  canSign,
  confirming,
  onConfirm,
  onCancel,
  onAccept,
}: {
  offer: Offer;
  canSign: boolean;
  confirming: boolean;
  onConfirm(): void;
  onCancel(): void;
  onAccept(): void;
}) {
  return (
    <Card raised testId="offer-detail">
      <h3 style={{ fontSize: 'var(--text-xl)' }}>{offer.promotion.name}</h3>

      {/*
        The three named futures. Money, route, level — never a bare purse to compare.

        Each glyph is paired with a word and hidden from assistive tech, which is the house
        rule: three bare emoji had a screen reader announcing "pound banknote", "ladder" and
        "balance scale" before each line.
      */}
      <div className="stack" style={{ gap: 'var(--space-1)', marginTop: 'var(--space-3)' }}>
        <p style={{ fontSize: 'var(--text-sm)' }}>
          <span aria-hidden="true">💷</span> <span className="muted">Money:</span> {offer.money}
        </p>
        <p style={{ fontSize: 'var(--text-sm)' }}>
          <span aria-hidden="true">🪜</span> <span className="muted">Route:</span> {offer.route}
        </p>
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          <span aria-hidden="true">⚖️</span> Level: {offer.level}
        </p>
      </div>

      <ul style={{ fontSize: 'var(--text-sm)', margin: 'var(--space-3) 0' }}>
        <li>
          {offer.terms.fightsOwed} fights owed
          {offer.terms.exclusive ? ', exclusive' : ', non-exclusive'}
          {offer.terms.outsideBouts > 0 && ` — ${offer.terms.outsideBouts} bouts elsewhere a year`}
        </li>
        {offer.terms.revenuePoints > 0 && (
          <li>
            <strong>{offer.terms.revenuePoints} points</strong> on the event revenue. Almost nobody
            gets these
          </li>
        )}
        {offer.terms.championshipExtension === 'standard' && (
          <li>
            <strong>You cannot leave while you hold the belt.</strong> It lets go two fights or a
            year after you lose it
          </li>
        )}
        {offer.terms.matchingRights && (
          <li>They may match a rival offer — and you are paid for granting that</li>
        )}
      </ul>

      {offer.unmatchable.length > 0 && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <Alert tone="good" title="They cannot match this">
            {offer.unmatchable.join(' ')}
          </Alert>
        </div>
      )}

      <Help label="What am I actually trading?">
        Money, level and freedom pull against each other, and no offer gives you all three. A
        longer deal pays more per fight because length is worth something to the promotion.
        Matching rights are sold rather than assumed. The championship extension is the one term
        that can keep you somewhere for years after you wanted to leave.
      </Help>

      {/* Two steps. Signing commits a multi-fight exclusive deal and then navigates away, which
          is both the most consequential decision here and the easiest not to notice making. */}
      {canSign ? (
        confirming ? (
          <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={onAccept}>
              Yes — sign with {offer.promotion.shortName}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Not yet
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={onConfirm}>
            Sign with {offer.promotion.shortName}
          </Button>
        )
      ) : (
        <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
          You are under contract. This is what would be waiting if you were not.
        </p>
      )}
    </Card>
  );
}
