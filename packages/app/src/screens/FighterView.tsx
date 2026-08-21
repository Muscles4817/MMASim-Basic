/**
 * A fighter, read by whoever is looking.
 *
 * The facts about a fighter do not change with who is asking. The record is the record, the
 * ratings are the ratings, the knee is the knee. What changes is the **framing** — what the page
 * calls things, which tab it leads with, and what you can do about any of it — and the old
 * `FighterScreen` had exactly one framing for all of them.
 *
 * That framing was a promoter scouting a stranger, and in fighter mode it was applied to the
 * player's own character. `WHERE THEY STAND`. `HOW THEY DECIDE`. `WHAT THEY WANT`. *They fight
 * here on a handshake, which means nothing holds them.* The screen already knew — `isPlayer` was
 * computed, and used for precisely one thing: showing physical ceilings in the Skills tab.
 *
 * So `viewer` is a real prop with four values, and the vocabulary hangs off it:
 *
 *  - `self` — you are this fighter. My career, my condition, my deal, my next objective.
 *  - `coach` — one of yours. Development, readiness, form, what the camp should be about.
 *  - `promoter` — an asset. Scouting read, availability, marketability, asking price.
 *  - `none` — nobody in particular, which is the honest state when browsing candidates before a
 *    career exists. No promoter context, no self disclosure, no "put them on a card".
 *
 * The other half of the fix is that this component does **not** call `useGame`. It takes the
 * database and the day, and it takes `actions` from its caller. That is what lets new-game
 * selection reuse the whole page without pulling an active career in behind it — the coupling
 * the old screen had to `world.playerPromotionId`, `playerFighter` and `bookedOnPlans` is why it
 * could not be reused anywhere.
 */

import { useState, type ReactNode } from 'react';
import {
  ATTRIBUTES_BY_GROUP,
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_META,
  DERIVED_META,
  TRAITS,
  abilityRead,
  activeInjuries,
  askingPrice,
  availabilityOf,
  careerArc,
  conditionRead,
  deriveRatings,
  describeFairness,
  describeHeat,
  describeInjury,
  dispositionsOf,
  displayName,
  fighterAge,
  getDivision,
  isPhysical,
  marketValue,
  recordString,
  scoutingRead,
  valueRead,
  wantsOf,
  type Fighter,
  TRAUMA_CONCERN,
  TRAUMA_MEDICAL,
  WEAR_CONCERN,
} from '@mmasim/engine';
import type { GameDb } from '@mmasim/data';
import { Button, Card, Chip, Flag, RatingRow } from '../ui';
import { Alert, AttributeBadge, Fact, ICON, Icon, KeyStat } from '../ui/signals';
import {
  AbilityBand,
  Console,
  Ledger,
  LedgerRow,
  MiniRating,
  TabPanel,
  Tabs,
} from '../ui/console';
import { FightRecordList, RecordSummaryBar } from '../ui/FightRecord';
import { readMileage } from '../ui/mileage';
import { money } from '../ui/format';
import { getLadderStatus } from '../game/progression';
import { rivalriesFor } from '../game/rivalries';
import { contractStanding } from '../game/contracts';
import { currentPurse, promotionOf } from '../game/money';
import { GROUP_LABELS } from '../game/labels';

/** Who is looking. Decides the vocabulary, the disclosure and the lead tab — never the facts. */
export type FighterViewer = 'self' | 'coach' | 'promoter' | 'none';

type TabId = 'overview' | 'career' | 'skills' | 'contract';

/**
 * The words, per viewer.
 *
 * A table rather than conditionals scattered through the render, because the whole point is that
 * the *set* is coherent: a page that says "your condition" and then "what they want" is worse
 * than one that says "they" throughout. Keeping them together makes an inconsistency visible
 * while it is being written rather than in a screenshot three weeks later.
 */
const VOCAB: Record<
  FighterViewer,
  {
    tabs: Record<TabId, string>;
    read: string;
    condition: string;
    situation: string;
    disposition: string;
    wants: string;
    fairness: string;
    form: string;
    /** Whether the page may show things only this fighter would know about themselves. */
    intimate: boolean;
  }
> = {
  self: {
    tabs: { overview: 'Now', career: 'My career', skills: 'My skills', contract: 'My deal' },
    read: 'Your game',
    condition: 'Your condition',
    situation: 'Where you stand',
    disposition: 'How you decide',
    wants: 'What you want next',
    fairness: 'How you see it',
    form: 'Your recent form',
    intimate: true,
  },
  coach: {
    tabs: { overview: 'Development', career: 'Career', skills: 'Skills', contract: 'Contract' },
    read: 'What they bring',
    condition: 'Condition',
    situation: 'Readiness',
    disposition: 'How they take instruction',
    wants: 'What they want',
    fairness: 'How they see their deal',
    form: 'Recent form',
    intimate: true,
  },
  promoter: {
    tabs: { overview: 'Scouting', career: 'Career', skills: 'Skills', contract: 'Contract' },
    read: 'Scouting read',
    condition: 'Condition',
    situation: 'Where they stand',
    disposition: 'How they decide',
    wants: 'What they want',
    fairness: 'How they see it',
    form: 'Recent form',
    intimate: false,
  },
  none: {
    tabs: { overview: 'Overview', career: 'Career', skills: 'Skills', contract: 'Contract' },
    read: 'The read',
    condition: 'Condition',
    situation: 'Career position',
    disposition: 'How they decide',
    wants: 'What they want',
    fairness: 'How they see their deal',
    form: 'Recent form',
    intimate: false,
  },
};

export function FighterView({
  db,
  day,
  fighter,
  viewer,
  booked = false,
  actions,
  onOpponentClick,
}: {
  db: GameDb;
  day: number;
  fighter: Fighter;
  viewer: FighterViewer;
  /**
   * Whether this fighter is already on one of the viewer's cards.
   *
   * Passed in rather than computed, because "booked" only means anything to a promoter and the
   * old screen asked `bookedOnPlans(db, world.playerPromotionId, …)` unconditionally — in
   * fighter mode that id is undefined, so the availability chip on every fighter page in the
   * mode was answering a question nobody had asked.
   */
  booked?: boolean;
  /** What this viewer can do about this fighter. The caller owns it entirely. */
  actions?: ReactNode;
  onOpponentClick?(id: string): void;
}) {
  const [tab, setTab] = useState<TabId>('overview');
  const [showDerived, setShowDerived] = useState(false);
  const [showDefinitions, setShowDefinitions] = useState(false);

  const words = VOCAB[viewer];
  const division = getDivision(fighter.divisionId);
  const ladder = getLadderStatus(db, fighter);
  const arc = careerArc({
    fighter,
    day,
    rank: ladder.position,
    isChampion: ladder.isChampion,
  });
  const ability = abilityRead(fighter.attributes);
  const scouting = scoutingRead(fighter, day);
  const availability = availabilityOf({ fighter, day, booked });
  const standing = contractStanding(db, fighter);

  const TABS: readonly { id: TabId; label: string }[] = [
    { id: 'overview', label: words.tabs.overview },
    { id: 'career', label: words.tabs.career },
    { id: 'skills', label: words.tabs.skills },
    { id: 'contract', label: words.tabs.contract },
  ];

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }} data-testid="fighter-view">
      {/* Identity, always visible above the tabs. Who this is never belongs behind one. */}
      <Card raised>
        <h2 style={{ fontSize: 'var(--text-2xl)', lineHeight: 1.15 }}>{displayName(fighter)}</h2>
        <p className="muted">
          {division.name} · {fighterAge(fighter, day)} · <Flag nationality={fighter.nationality} />{' '}
          · {fighter.stance}
        </p>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <KeyStat
            value={recordString(fighter.summary)}
            label="Professional record"
            detail={arc.blurb}
            tone={
              fighter.summary.streak > 0 ? 'good' : fighter.summary.streak < 0 ? 'bad' : 'neutral'
            }
          />
        </div>

        <div className="row" style={{ marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Chip tone={arc.tone === 'good' ? 'positive' : arc.tone === 'bad' ? 'negative' : 'info'}>
            {arc.label}
          </Chip>
          {ladder.isChampion && (
            <Chip tone="accent" title="Reigning divisional champion">
              <Icon name="champion" /> Champion
            </Chip>
          )}
          {!ladder.isChampion && ladder.position !== undefined && (
            <Chip tone="info" title="Divisional ranking">
              #{ladder.position} contender
            </Chip>
          )}
          {/*
            Availability is a booking question, so it is only asked by somebody who books. A
            fighter reading their own page does not need to be told they are available to
            themselves.
          */}
          {viewer !== 'self' && (
            <Chip
              tone={
                availability.state === 'ready'
                  ? 'positive'
                  : availability.state === 'booked'
                    ? 'info'
                    : 'warning'
              }
            >
              {availability.label}
            </Chip>
          )}
          {scouting.tags.slice(0, 3).map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </div>

        {actions && (
          <div className="row" style={{ marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
            {actions}
          </div>
        )}
      </Card>

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Fighter sections" />

      {tab === 'overview' && (
        <TabPanel id="overview">
          <Console
            main={
              <>
                <Card title={words.read}>
                  <p className="prose">{scouting.summary}</p>

                  {/*
                    Badges rather than plain chips: `AttributeBadge` carries the value and the
                    band word as well as the colour, which is what makes the signal survive
                    greyscale and a screen reader.
                  */}
                  <div className="fighter-read" style={{ marginTop: 'var(--space-3)' }}>
                    <div className="fighter-read__group">
                      <span className="fighter-read__caption">Wins with</span>
                      <span className="fighter-read__badges">
                        {scouting.strengths.map((call) => (
                          <AttributeBadge
                            key={call.key}
                            call={{ key: call.key, value: call.value }}
                            kind="strength"
                          />
                        ))}
                      </span>
                    </div>
                    {scouting.weaknesses.length > 0 && (
                      <div className="fighter-read__group">
                        <span className="fighter-read__caption">Vulnerable to</span>
                        <span className="fighter-read__badges">
                          {scouting.weaknesses.map((call) => (
                            <AttributeBadge
                              key={call.key}
                              call={{ key: call.key, value: call.value }}
                              kind="weakness"
                            />
                          ))}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 'var(--space-4)' }}>
                    {/*
                      A class and a sentence, never a number. An exact overall would make
                      matchmaking arithmetic instead of judgement, and the whole interest of it is
                      that two people can look at the same fighter and reasonably disagree.
                    */}
                    <AbilityBand label={ability.label} fill={ability.fill} note={ability.blurb} />
                  </div>
                </Card>

                <Card title={words.condition}>
                  <ConditionBlock fighter={fighter} day={day} />
                </Card>

                {activeInjuries(fighter.injuries ?? [], day).length > 0 && (
                  <Alert tone="warn" title="Currently injured">
                    {activeInjuries(fighter.injuries ?? [], day)
                      .map((i) => describeInjury(i, day))
                      .join(' ')}
                  </Alert>
                )}

                <Card title={words.form}>
                  <RecordSummaryBar summary={fighter.summary} />
                </Card>
              </>
            }
            side={
              <>
                <SituationCard
                  title={words.situation}
                  fighter={fighter}
                  viewer={viewer}
                  availability={availability}
                  standing={standing}
                  ladder={ladder}
                  db={db}
                  day={day}
                />

                {/*
                  Personality as tendencies, not as rules. The old trait blurbs read like internal
                  simulation notes, which is both untrue of the model and the wrong register for a
                  person you are about to negotiate with.
                */}
                <Card title={words.disposition}>
                  <div className="stack" style={{ gap: 'var(--space-3)' }}>
                    {dispositionsOf(fighter).length === 0 && (
                      <p className="prose" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                        Nothing pronounced either way.{' '}
                        {viewer === 'self'
                          ? 'You weigh an offer roughly the way anybody would.'
                          : 'They will weigh an offer roughly the way anybody would.'}
                      </p>
                    )}
                    {dispositionsOf(fighter).map((d) => (
                      <div key={d.id}>
                        <strong>{d.label}</strong>
                        <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                          {d.blurb}
                        </p>
                      </div>
                    ))}
                    <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
                      Tendencies rather than rules. They shift the odds on how somebody answers;
                      they do not decide it.
                    </p>
                  </div>
                </Card>

                {fighter.traits.length > 0 && (
                  <Card title="Traits">
                    <ul className="trait-list">
                      {fighter.traits.map((traitId) => {
                        const trait = TRAITS[traitId];
                        return (
                          <li key={traitId} className={`trait trait--${trait.polarity}`}>
                            <span className="trait__mark" aria-hidden="true">
                              {trait.polarity === 'positive'
                                ? '+'
                                : trait.polarity === 'negative'
                                  ? '−'
                                  : '='}
                            </span>
                            <span>
                              <strong className="trait__label">{trait.label}</strong>
                              <span className="visually-hidden">
                                {trait.polarity === 'positive'
                                  ? ' (strength)'
                                  : trait.polarity === 'negative'
                                    ? ' (weakness)'
                                    : ' (double-edged)'}
                              </span>
                              <span className="trait__blurb muted">{trait.blurb}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}
              </>
            }
          />
        </TabPanel>
      )}

      {tab === 'career' && (
        <TabPanel id="career">
          <CareerTab
            fighter={fighter}
            db={db}
            day={day}
            ladder={ladder}
            onOpponentClick={onOpponentClick}
          />
        </TabPanel>
      )}

      {tab === 'skills' && (
        <TabPanel id="skills">
          <Card
            title="Ratings"
            action={
              <Button size="sm" variant="ghost" onClick={() => setShowDefinitions((v) => !v)}>
                {showDefinitions ? 'Hide definitions' : 'What do these mean?'}
              </Button>
            }
          >
            <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 0 }}>
              Absolute, never relative to the division: 78 power is the same force at flyweight and
              at heavyweight.
            </p>
          </Card>

          {ATTRIBUTE_GROUPS.map((group) => (
            <Card key={group} title={GROUP_LABELS[group]}>
              {/*
                Compressed. The full `RatingRow` prints its definition under every stat, which is
                useful once and is several screens of repeated prose by the fifth fighter — so the
                definitions live behind one toggle for the whole page, and the dense row is what
                you actually read.
              */}
              {showDefinitions ? (
                ATTRIBUTES_BY_GROUP[group].map((key) => (
                  <RatingRow
                    key={key}
                    label={ATTRIBUTE_META[key].label}
                    value={fighter.attributes[key]}
                    /* Your own ceilings, and only your own. A promoter who could see them would
                       be scouting with certainty, which is the one thing the model refuses. */
                    ceiling={
                      words.intimate && viewer === 'self' && isPhysical(key)
                        ? fighter.potential[key]
                        : undefined
                    }
                    hint={ATTRIBUTE_META[key].blurb}
                  />
                ))
              ) : (
                <div className="mini-ratings">
                  {ATTRIBUTES_BY_GROUP[group].map((key) => (
                    <MiniRating
                      key={key}
                      label={ATTRIBUTE_META[key].label}
                      value={fighter.attributes[key]}
                      hint={ATTRIBUTE_META[key].blurb}
                    />
                  ))}
                </div>
              )}
            </Card>
          ))}

          <Card
            title="Advanced analysis"
            action={
              <Button size="sm" variant="ghost" onClick={() => setShowDerived((v) => !v)}>
                {showDerived ? 'Hide' : 'Show'}
              </Button>
            }
          >
            <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 0 }}>
              Computed from the ratings above, never stored — which is why they can never
              contradict them.
            </p>
            {showDerived && (
              <div className="mini-ratings" style={{ marginTop: 'var(--space-3)' }}>
                {Object.values(DERIVED_META).map((meta) => (
                  <MiniRating
                    key={meta.key}
                    label={meta.label}
                    value={deriveRatings(fighter.attributes)[meta.key]}
                    hint={meta.blurb}
                  />
                ))}
              </div>
            )}
          </Card>
        </TabPanel>
      )}

      {tab === 'contract' && (
        <TabPanel id="contract">
          <ContractTab
            fighter={fighter}
            db={db}
            day={day}
            standing={standing}
            viewer={viewer}
            words={words}
          />
        </TabPanel>
      )}
    </div>
  );
}

// --- Situation ---------------------------------------------------------------------------------

/**
 * The block that answers "what does this person mean to me".
 *
 * Same ledger, four readings of it. A promoter is asking what they cost and whether they can be
 * booked; a coach is asking whether they are ready; the fighter themselves is asking where their
 * own career has got to. The rows that only make sense to one of them are gated rather than
 * relabelled — an "expected card level" row is a promoter's phrase for something a fighter would
 * call *where I would be booked*, and pretending otherwise is how the old page ended up telling
 * the player what they wanted.
 */
function SituationCard({
  title,
  fighter,
  viewer,
  availability,
  standing,
  ladder,
  db,
  day,
}: {
  title: string;
  fighter: Fighter;
  viewer: FighterViewer;
  availability: ReturnType<typeof availabilityOf>;
  standing: ReturnType<typeof contractStanding>;
  ladder: ReturnType<typeof getLadderStatus>;
  db: GameDb;
  day: number;
}) {
  const purse = currentPurse(db, fighter, 'mainCard');
  const boutsThisYear = fighter.record.filter((r) => day - r.day < 365).length;
  const guarantee = standing.agreement?.activityGuarantee;
  const self = viewer === 'self';

  return (
    <Card title={title}>
      <Ledger>
        <LedgerRow
          label="Contract"
          value={
            standing.freeAgent
              ? 'Free agent'
              : standing.status
                ? `${standing.status.fightsRemaining} ${standing.status.fightsRemaining === 1 ? 'fight' : 'fights'} left`
                : 'No written deal'
          }
          tone={standing.freeAgent ? 'bad' : undefined}
        />
        {purse && <LedgerRow label="Pay" value={`${money(purse.show)} / ${money(purse.win)}`} />}
        <LedgerRow
          label="Bouts this year"
          value={boutsThisYear}
          tone={boutsThisYear === 0 ? 'bad' : undefined}
        />
        {/* A booking question, asked only by somebody who books. */}
        {!self && (
          <LedgerRow
            label="Availability"
            value={availability.label}
            tone={availability.state === 'ready' ? 'good' : undefined}
          />
        )}
        <LedgerRow
          label="Streak"
          value={
            fighter.summary.streak === 0
              ? '—'
              : `${fighter.summary.streak > 0 ? 'W' : 'L'}${Math.abs(fighter.summary.streak)}`
          }
          tone={fighter.summary.streak > 0 ? 'good' : fighter.summary.streak < 0 ? 'bad' : undefined}
        />
        {guarantee !== undefined && (
          <LedgerRow
            label={self ? 'Fights you are owed' : 'Activity owed'}
            value={`${boutsThisYear} of ${guarantee} this year`}
            tone={boutsThisYear < guarantee ? 'bad' : 'good'}
          />
        )}
        <LedgerRow
          label={self ? 'Where you get booked' : 'Expected level'}
          value={
            ladder.isChampion
              ? 'Champion'
              : ladder.position !== undefined && ladder.position <= 5
                ? 'Contender'
                : ladder.position !== undefined
                  ? 'Ranked opposition'
                  : 'Undercard'
          }
        />
      </Ledger>

      <p className="prose muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>
        {ladder.titleShot.reason}
      </p>
    </Card>
  );
}

// --- Condition ---------------------------------------------------------------------------------

function ConditionBlock({ fighter, day }: { fighter: Fighter; day: number }) {
  const mileage = readMileage(fighter, day);
  const read = conditionRead(fighter, day);

  return (
    <>
      <KeyStat
        value={read.label}
        label="Physical standing"
        detail={read.detail}
        tone={read.tone === 'good' ? 'good' : read.tone === 'bad' ? 'bad' : 'neutral'}
      />

      <Fact
        label="Body age"
        value={mileage.body}
        emphasis={mileage.heavy ? 'primary' : 'secondary'}
        tone={mileage.heavy ? 'bad' : mileage.notable ? 'warn' : undefined}
        hint={mileage.because}
      />
      <Fact
        label="Head trauma"
        value={`${Math.round(fighter.condition.headTrauma)} / 100`}
        icon="trauma"
        emphasis={fighter.condition.headTrauma >= TRAUMA_CONCERN ? 'primary' : 'secondary'}
        tone={
          fighter.condition.headTrauma >= TRAUMA_MEDICAL
            ? 'bad'
            : fighter.condition.headTrauma >= TRAUMA_CONCERN
              ? 'warn'
              : undefined
        }
      />
      <Fact
        label="Body wear"
        value={`${Math.round(fighter.condition.bodyWear)} / 100`}
        emphasis="tertiary"
        tone={
          fighter.condition.bodyWear >= 55
            ? 'bad'
            : fighter.condition.bodyWear >= WEAR_CONCERN
              ? 'warn'
              : undefined
        }
      />
      <Fact
        label="Confidence"
        value={Math.round(fighter.condition.confidence)}
        emphasis="tertiary"
        tone={fighter.condition.confidence < 40 ? 'bad' : undefined}
      />
    </>
  );
}

// --- Career ------------------------------------------------------------------------------------

function CareerTab({
  fighter,
  db,
  day,
  ladder,
  onOpponentClick,
}: {
  fighter: Fighter;
  db: GameDb;
  day: number;
  ladder: ReturnType<typeof getLadderStatus>;
  onOpponentClick?(id: string): void;
}) {
  const opponents = new Map(
    fighter.record
      .map((entry) => db.fighters.findById(entry.opponentId as string) as Fighter | undefined)
      .filter((f): f is Fighter => f !== undefined)
      .map((f) => [f.id as string, f]),
  );

  const priorBouts = fighter.priorRecord
    ? fighter.priorRecord.wins + fighter.priorRecord.losses + fighter.priorRecord.draws
    : 0;

  const rivalries = rivalriesFor(db, fighter.id, day);

  /*
   * Strength of schedule. "22-4" is not a career until you know who the four were against — and
   * the record screen had no way to say that a fighter's wins came against people the sport
   * rates or against people it does not.
   */
  const rated = fighter.record
    .map((entry) => db.fighters.findById(entry.opponentId as string) as Fighter | undefined)
    .filter((f): f is Fighter => f !== undefined);
  const averageOpponent =
    rated.length > 0
      ? Math.round(rated.reduce((sum, f) => sum + f.reputation, 0) / rated.length)
      : undefined;

  return (
    <Console
      main={
        <>
          <Card title="Results" flush>
            <FightRecordList
              fighter={fighter}
              opponents={opponents}
              priorBouts={priorBouts}
              onOpponentClick={onOpponentClick}
            />
          </Card>

          {rivalries.length > 0 && (
            <Card title="Bad blood">
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {rivalries.map(({ rivalry, heat, otherId }) => {
                  const other = db.fighters.findById(otherId as string) as Fighter | undefined;
                  return (
                    <div
                      key={rivalry.id as string}
                      className="row"
                      style={{
                        justifyContent: 'space-between',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-3)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        background: rivalry.isRivalry ? 'var(--negative-soft)' : 'var(--surface)',
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <button
                          type="button"
                          className="record-row__link"
                          onClick={() => other && onOpponentClick?.(other.id as string)}
                          style={{ fontWeight: 600, display: 'block', textAlign: 'left' }}
                        >
                          {other ? displayName(other) : 'A former opponent'}
                        </button>
                        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                          {describeHeat(rivalry, day)}
                        </span>
                      </span>
                      <Chip tone={rivalry.isRivalry ? 'negative' : heat > 45 ? 'warning' : 'neutral'}>
                        {rivalry.isRivalry
                          ? `${ICON.streak} Grudge`
                          : heat > 45
                            ? `${ICON.streak} Real interest`
                            : 'Simmering'}
                      </Chip>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      }
      side={
        <>
          <Card title="Standing">
            <Ledger>
              <LedgerRow label="Division" value={getDivision(fighter.divisionId).name} />
              <LedgerRow
                label="Ranking"
                value={
                  ladder.isChampion
                    ? 'Champion'
                    : ladder.position !== undefined
                      ? `#${ladder.position}`
                      : 'Unranked'
                }
              />
              <LedgerRow label="Bouts here" value={fighter.record.length} />
              <LedgerRow label="Bouts before" value={priorBouts} />
              <LedgerRow
                label="Finishes"
                value={`${fighter.summary.koWins + fighter.summary.submissionWins} of ${fighter.summary.wins} wins`}
              />
              <LedgerRow
                label="Stopped"
                value={`${fighter.summary.koLosses + fighter.summary.submissionLosses} of ${fighter.summary.losses} losses`}
                tone={fighter.summary.koLosses >= 3 ? 'bad' : undefined}
              />
              {averageOpponent !== undefined && (
                <LedgerRow
                  label="Level faced"
                  value={
                    averageOpponent >= 60
                      ? 'Elite'
                      : averageOpponent >= 45
                        ? 'Solid'
                        : averageOpponent >= 30
                          ? 'Regional'
                          : 'Low'
                  }
                  tone={averageOpponent >= 55 ? 'good' : averageOpponent < 30 ? 'bad' : undefined}
                />
              )}
            </Ledger>
            <p
              className="faint prose"
              style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}
            >
              A record is only worth what the opposition was worth. Twenty-two and four against
              people nobody rates is a different fighter from the same record against contenders.
            </p>
          </Card>

          <Card title="Title picture">
            <p className="prose" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
              {ladder.titleShot.reason}
            </p>
          </Card>
        </>
      }
    />
  );
}

// --- The deal ----------------------------------------------------------------------------------

function ContractTab({
  fighter,
  db,
  day,
  standing,
  viewer,
  words,
}: {
  fighter: Fighter;
  db: GameDb;
  day: number;
  standing: ReturnType<typeof contractStanding>;
  viewer: FighterViewer;
  words: (typeof VOCAB)[FighterViewer];
}) {
  const self = viewer === 'self';
  const purse = currentPurse(db, fighter, 'mainCard');
  /*
   * The promotion they fight for, not the one named on a contract.
   *
   * Almost nobody in a fresh world has a written agreement — deals arrive through free agency as
   * the world runs — so reading the promotion off the agreement left this whole tab blank for the
   * entire starting roster, including what they are worth and what they cost.
   */
  const promotion = standing.promotion ?? promotionOf(db, fighter);
  const worth = promotion ? marketValue(fighter, promotion) : undefined;
  const value =
    purse !== undefined && worth !== undefined
      ? valueRead({ paid: purse.show + purse.win, worth })
      : undefined;
  const wants = wantsOf({
    fighter,
    day,
    rank: getLadderStatus(db, fighter).position,
    daysIdle: 0,
    aggrieved: (standing.fairness ?? 1) < 0.7,
  });

  return (
    <Console
      main={
        <>
          <Card title="The deal">
            {standing.agreement ? (
              <Ledger>
                <LedgerRow label="Promotion" value={promotion?.shortName ?? '—'} />
                <LedgerRow label="Show purse" value={money(standing.agreement.showPurse)} />
                <LedgerRow label="Win bonus" value={money(standing.agreement.winBonus)} />
                <LedgerRow
                  label="Fights remaining"
                  value={standing.agreement.fightsRemaining}
                  tone={standing.agreement.fightsRemaining <= 1 ? 'bad' : undefined}
                />
                <LedgerRow
                  label="Activity guarantee"
                  value={`${standing.agreement.activityGuarantee} a year`}
                />
                <LedgerRow
                  label="Days on the clock"
                  value={Math.max(0, standing.agreement.expiresDay - day)}
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
                    standing.agreement.championshipExtension === 'standard' ? 'Standard' : 'None'
                  }
                />
              </Ledger>
            ) : (
              <div className="stack" style={{ gap: 'var(--space-3)' }}>
                <p className="prose" style={{ margin: 0 }}>
                  {self
                    ? 'No written agreement. You fight on a handshake, which means nothing holds you and nothing obliges anybody — and whoever papers one first has you.'
                    : 'No written agreement. They fight here on a handshake, which means nothing holds them and nothing obliges you — and whoever papers one first takes them.'}
                </p>
                {/*
                  What they would cost anyway. A tab that says "no contract" and stops has said
                  nothing anybody can act on; the market rate is the number the decision actually
                  turns on, and almost nobody in a fresh world has a written deal.
                */}
                {purse && (
                  <Ledger>
                    <LedgerRow label="Market rate, to show" value={money(purse.show)} />
                    <LedgerRow label="Market rate, to win" value={money(purse.win)} />
                    {promotion && (
                      <LedgerRow
                        label={self ? 'What you would ask' : 'What they would ask'}
                        value={money(askingPrice(fighter, promotion))}
                      />
                    )}
                  </Ledger>
                )}
              </div>
            )}
          </Card>

          {standing.fairness !== undefined && (
            <Card title={words.fairness}>
              <p className="prose">{describeFairness(standing.fairness)}</p>
              {fighter.resentment > 40 && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <Alert
                    tone={fighter.resentment > 65 ? 'warn' : 'info'}
                    title={fighter.resentment > 65 ? 'Aggrieved' : 'Noticing'}
                  >
                    {self
                      ? 'It is already showing up in which fights you feel able to turn down.'
                      : 'It is already showing up in how readily they take fights.'}
                  </Alert>
                </div>
              )}
            </Card>
          )}
        </>
      }
      side={
        <>
          {/*
            Value for money is a *buyer's* question. Asking it about yourself — "are you worth
            what you are paid" — is the register the whole of this rework exists to get rid of.
          */}
          {value && !self && (
            <Card title="Value for money">
              <KeyStat
                value={value.label}
                label="Against what they return"
                detail={value.detail}
                tone={value.tone === 'good' ? 'good' : value.tone === 'bad' ? 'bad' : 'neutral'}
              />
            </Card>
          )}

          <Card title={words.wants}>
            <KeyStat value={wants.label} label="Next" detail={wants.detail} />
          </Card>

          {standing.manager && (
            <Card title="Represented by">
              <p className="prose" style={{ margin: 0 }}>
                <strong>{standing.manager.name}</strong>
              </p>
              <p className="muted prose" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                {self
                  ? 'Every offer goes through them, and they have their own plan for your career.'
                  : 'Every offer goes through them, and they have their own plan for this career.'}
              </p>
            </Card>
          )}
        </>
      }
    />
  );
}
