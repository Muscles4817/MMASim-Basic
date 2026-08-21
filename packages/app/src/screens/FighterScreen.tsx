/**
 * A fighter, read as an asset rather than as a rating sheet.
 *
 * The page used to open with a record, a strengths/weaknesses line, an exact overall rating, and
 * then thirty attribute rows with an explanatory sentence printed under every single one —
 * roughly two thousand vertical pixels of prose the player has already read on every other
 * fighter. Contract, availability, what the person wants and what the career has cost were at the
 * bottom, under the derived ratings, if they were anywhere.
 *
 * For a promoter that is exactly backwards. The questions are: *why do I care about this person,
 * are they available, what do they want, are they worth their deal, are they getting better or
 * worse, and who should they fight.* So the page leads with those and the technical ratings sit
 * behind a tab, compressed, with their definitions on demand.
 *
 * Three specific judgements worth recording:
 *
 * **No exact overall.** `abilityRead` returns a class and a sentence, never the number. A
 * promoter who can compare 34 against 47 is not scouting anybody, and the whole interest of
 * matchmaking is that two players can look at the same fighter and reasonably disagree. Every
 * underlying rating is still on the page for anyone who wants to form their own view.
 *
 * **Condition is near the top.** A 36-year-old with a body age of 41 and 67 points of trauma is a
 * completely different asset from a fresh 24-year-old, and that is a contract decision rather
 * than trivia.
 *
 * **Tabs on every width.** The grouping — overview, career, skills, contract — is conceptual, not
 * a phone concession, so desktop gets the same one rather than a second layout to maintain.
 */

import { useState } from 'react';
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
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Empty, Flag, RatingRow } from '../ui';
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
import { bookedOnPlans } from '../game/finances';
import { daysUnbookedBy } from '../game/plans';
import { GROUP_LABELS } from '../game/labels';

type TabId = 'overview' | 'career' | 'skills' | 'contract';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'career', label: 'Career' },
  { id: 'skills', label: 'Skills' },
  { id: 'contract', label: 'Contract' },
];

export function FighterScreen({ id }: { id: string }) {
  const { db, world, playerFighter } = useGame();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<TabId>('overview');
  const [showDerived, setShowDerived] = useState(false);
  const [showDefinitions, setShowDefinitions] = useState(false);

  const fighter = db.fighters.findById(id) as Fighter | undefined;

  if (!fighter) {
    return (
      <Empty title="Fighter not found">
        <Button variant="primary" onClick={() => navigate({ name: 'roster' })}>
          Back to roster
        </Button>
      </Empty>
    );
  }

  const isPlayer = playerFighter?.id === fighter.id;
  const isPromoter = world.playerRole === 'promoter';
  const division = getDivision(fighter.divisionId);
  const ladder = getLadderStatus(db, fighter);
  const arc = careerArc({
    fighter,
    day: world.day,
    rank: ladder.position,
    isChampion: ladder.isChampion,
  });
  const ability = abilityRead(fighter.attributes);
  const scouting = scoutingRead(fighter, world.day);
  const condition = conditionRead(fighter, world.day);
  const booked = bookedOnPlans(db, world.playerPromotionId, world.day).has(fighter.id as string);
  const availability = availabilityOf({ fighter, day: world.day, booked });
  const standing = contractStanding(db, fighter);
  /*
   * How long they have been on the shelf, measured from the start of the save for anybody who
   * has not fought since it began. A seeded fighter's real career carries no dates, so measuring
   * from their pro debut would call every champion in the sport nine years inactive on day one.
   */
  const idle = daysUnbookedBy(fighter, world.day, world.startedDay ?? world.day);
  /*
   * Whether they have actually fought here.
   *
   * A seeded fighter's real career carries no dates, so "last fought" is unanswerable on day one
   * and "0 days ago" is a lie rather than a rounding. The row says what is true instead.
   */
  const hasFoughtHere = fighter.record.length > 0;
  const wants = wantsOf({
    fighter,
    day: world.day,
    rank: ladder.position,
    daysIdle: idle,
    aggrieved: (standing.fairness ?? 1) < 0.7,
  });

  /*
   * Whether this fighter is one of *yours*.
   *
   * The whole promoter block is meaningless for somebody signed elsewhere — you cannot book
   * them, extend them or release them — and showing an empty version of it would be worse than
   * showing nothing.
   */
  const isYours =
    isPromoter &&
    world.playerPromotionId !== undefined &&
    fighter.promotionId === world.playerPromotionId;

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {/* Identity, always visible above the tabs. Who this is never belongs behind one. */}
      <Card raised>
        <h2 style={{ fontSize: 'var(--text-2xl)', lineHeight: 1.15 }}>{displayName(fighter)}</h2>
        <p className="muted">
          {division.name} · {fighterAge(fighter, world.day)} ·{' '}
          <Flag nationality={fighter.nationality} /> · {fighter.stance}
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
          {scouting.tags.slice(0, 3).map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </div>
      </Card>

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Fighter sections" />

      {tab === 'overview' && (
        <TabPanel id="overview">
          <Console
            main={
              <>
                {/*
                  The scouting read: what kind of fighter this is, in five seconds, synthesised
                  from the ratings and the record rather than left for the player to reconstruct
                  from thirty numbers.
                */}
                <Card title="Scouting read">
                  <p className="prose">{scouting.summary}</p>

                  {/*
                    Badges rather than plain chips: `AttributeBadge` carries the value and the
                    band word as well as the colour, which is what makes the signal survive
                    greyscale and a screen reader. A chip carrying only a label would have been
                    colour-only for the half of the information that matters.
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
                      A class and a sentence, never a number. See the file header: an exact
                      overall would make matchmaking arithmetic instead of judgement.
                    */}
                    <AbilityBand label={ability.label} fill={ability.fill} note={ability.blurb} />
                  </div>
                </Card>

                {/*
                  Condition, high up. For a promoter this is a contract decision: two fighters
                  the same age with different histories are not the same asset, and the page used
                  to say so at the very bottom if at all.
                */}
                <Card title="Condition">
                  <KeyStat
                    value={condition.label}
                    label="Physical standing"
                    detail={condition.detail}
                    tone={
                      condition.tone === 'good'
                        ? 'good'
                        : condition.tone === 'bad'
                          ? 'bad'
                          : 'neutral'
                    }
                  />
                  <ConditionFacts fighter={fighter} day={world.day} />
                </Card>

                {(fighter.injuries?.length ?? 0) > 0 &&
                  activeInjuries(fighter.injuries ?? [], world.day).length > 0 && (
                    <Alert tone="warn" title="Currently injured">
                      {activeInjuries(fighter.injuries ?? [], world.day)
                        .map((i) => describeInjury(i, world.day))
                        .join(' ')}
                    </Alert>
                  )}

                <Card title="Recent form">
                  <RecordSummaryBar summary={fighter.summary} />
                </Card>
              </>
            }
            side={
              <>
                <PromoterStatus
                  fighter={fighter}
                  isYours={isYours}
                  hasFoughtHere={hasFoughtHere}
                  availability={availability}
                  wants={wants}
                  standing={standing}
                  ladder={ladder}
                  idle={idle}
                  db={db}
                  day={world.day}
                  onBook={() => navigate({ name: 'calendar' })}
                />

                {/*
                  Personality as tendencies, not as rules. The old trait blurbs read like
                  internal simulation notes — "beats everyone below them and loses to everyone
                  above, never changes" — which is both untrue of the model and the wrong
                  register for a person you are about to negotiate with.
                */}
                <Card title="How they decide">
                  <div className="stack" style={{ gap: 'var(--space-3)' }}>
                    {dispositionsOf(fighter).length === 0 && (
                      <p className="prose" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                        Nothing pronounced either way. They will weigh an offer roughly the way
                        anybody would.
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
            day={world.day}
            ladder={ladder}
            navigate={navigate}
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
                useful once and is several screens of repeated prose by the fifth fighter — so
                the definitions live behind one toggle for the whole page and on each label's
                tooltip, and the dense row is what you actually read.
              */}
              {showDefinitions ? (
                ATTRIBUTES_BY_GROUP[group].map((key) => (
                  <RatingRow
                    key={key}
                    label={ATTRIBUTE_META[key].label}
                    value={fighter.attributes[key]}
                    ceiling={isPlayer && isPhysical(key) ? fighter.potential[key] : undefined}
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

          {/*
            Derived ratings behind a toggle. They are computed from the ratings above and never
            stored, so they add no information a careful reader did not already have — and six
            more full-height rows between the player and the career facts is the wrong trade.
          */}
          <Card
            title="Advanced analysis"
            action={
              <Button size="sm" variant="ghost" onClick={() => setShowDerived((v) => !v)}>
                {showDerived ? 'Hide' : 'Show'}
              </Button>
            }
          >
            <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 0 }}>
              Computed from the ratings above, never stored — which is why they can never contradict
              them.
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
            day={world.day}
            standing={standing}
            isYours={isYours}
            wants={wants}
          />
        </TabPanel>
      )}
    </div>
  );
}

// --- Promoter status ---------------------------------------------------------------------------

/**
 * The block that answers "what do I do with this person".
 *
 * Contract, pay, activity, availability, what they want, how they feel about you — every one of
 * which existed in the save and none of which appeared anywhere near the top of this page.
 */
function PromoterStatus({
  fighter,
  isYours,
  hasFoughtHere,
  availability,
  wants,
  standing,
  ladder,
  idle,
  db,
  day,
  onBook,
}: {
  fighter: Fighter;
  isYours: boolean;
  hasFoughtHere: boolean;
  availability: ReturnType<typeof availabilityOf>;
  wants: ReturnType<typeof wantsOf>;
  standing: ReturnType<typeof contractStanding>;
  ladder: ReturnType<typeof getLadderStatus>;
  idle: number;
  db: ReturnType<typeof useGame>['db'];
  day: number;
  onBook(): void;
}) {
  const purse = currentPurse(db, fighter, 'mainCard');
  const boutsThisYear = fighter.record.filter((r) => day - r.day < 365).length;
  const guarantee = standing.agreement?.activityGuarantee;

  return (
    <Card title={isYours ? 'Promoter status' : 'Where they stand'}>
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
          label={hasFoughtHere ? 'Last fought' : 'Unbooked for'}
          value={
            hasFoughtHere
              ? `${Math.round(idle)} days ago`
              : idle < 30
                ? 'Not since you took over'
                : `${Math.round(idle)} days`
          }
          tone={idle > 300 ? 'bad' : undefined}
        />
        <LedgerRow
          label="Availability"
          value={availability.label}
          tone={availability.state === 'ready' ? 'good' : undefined}
        />
        <LedgerRow label="Wants" value={wants.label} />
        <LedgerRow
          label="Streak"
          value={
            fighter.summary.streak === 0
              ? '—'
              : `${fighter.summary.streak > 0 ? 'W' : 'L'}${Math.abs(fighter.summary.streak)}`
          }
          tone={
            fighter.summary.streak > 0 ? 'good' : fighter.summary.streak < 0 ? 'bad' : undefined
          }
        />
        {guarantee !== undefined && (
          <LedgerRow
            label="Activity owed"
            value={`${boutsThisYear} of ${guarantee} this year`}
            tone={boutsThisYear < guarantee ? 'bad' : 'good'}
          />
        )}
        <LedgerRow
          label="Expected level"
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

      <p
        className="prose muted"
        style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}
      >
        {wants.detail}
        {availability.detail ? ` ${availability.detail}` : ''}
      </p>

      {isYours && (
        <div className="stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          <Button variant="primary" block onClick={onBook}>
            Put them on a card
          </Button>
        </div>
      )}
    </Card>
  );
}

// --- Condition ---------------------------------------------------------------------------------

function ConditionFacts({ fighter, day }: { fighter: Fighter; day: number }) {
  const mileage = readMileage(fighter, day);

  return (
    <>
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

// --- Career ---------------------------------------------------------------------------------------

function CareerTab({
  fighter,
  db,
  day,
  ladder,
  navigate,
}: {
  fighter: Fighter;
  db: ReturnType<typeof useGame>['db'];
  day: number;
  ladder: ReturnType<typeof getLadderStatus>;
  navigate: ReturnType<typeof useRouter>['navigate'];
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
              onOpponentClick={(id) => navigate({ name: 'fighter', id })}
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
                          onClick={() =>
                            other && navigate({ name: 'fighter', id: other.id as string })
                          }
                          style={{ fontWeight: 600, display: 'block', textAlign: 'left' }}
                        >
                          {other ? displayName(other) : 'A former opponent'}
                        </button>
                        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                          {describeHeat(rivalry, day)}
                        </span>
                      </span>
                      <Chip
                        tone={rivalry.isRivalry ? 'negative' : heat > 45 ? 'warning' : 'neutral'}
                      >
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

// --- Contract ---------------------------------------------------------------------------------------

function ContractTab({
  fighter,
  db,
  day,
  standing,
  isYours,
  wants,
}: {
  fighter: Fighter;
  db: ReturnType<typeof useGame>['db'];
  day: number;
  standing: ReturnType<typeof contractStanding>;
  isYours: boolean;
  wants: ReturnType<typeof wantsOf>;
}) {
  const purse = currentPurse(db, fighter, 'mainCard');
  /*
   * The promotion they fight for, not the one named on a contract.
   *
   * Almost nobody in a fresh world has a written agreement — deals arrive through free agency as
   * the world runs — so reading the promotion off the agreement left this whole tab blank for
   * the entire starting roster, including what they are worth and what they cost.
   */
  const promotion = standing.promotion ?? promotionOf(db, fighter);
  const worth = promotion ? marketValue(fighter, promotion) : undefined;
  const value =
    purse !== undefined && worth !== undefined
      ? valueRead({ paid: purse.show + purse.win, worth })
      : undefined;

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
                  No written agreement. They fight here on a handshake, which means nothing holds
                  them and nothing obliges you — and whoever papers one first takes them.
                </p>
                {/*
                  What they would cost anyway. A tab that says "no contract" and stops has told
                  the promoter nothing they can act on; the market rate is the number the decision
                  actually turns on, and almost nobody in a fresh world has a written deal.
                */}
                {purse && (
                  <Ledger>
                    <LedgerRow label="Market rate, to show" value={money(purse.show)} />
                    <LedgerRow label="Market rate, to win" value={money(purse.win)} />
                    {promotion && (
                      <LedgerRow
                        label="What they would ask"
                        value={money(askingPrice(fighter, promotion))}
                      />
                    )}
                  </Ledger>
                )}
              </div>
            )}
          </Card>

          {standing.fairness !== undefined && (
            <Card title="How they see it">
              <p className="prose">{describeFairness(standing.fairness)}</p>
              {fighter.resentment > 40 && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <Alert
                    tone={fighter.resentment > 65 ? 'warn' : 'info'}
                    title={fighter.resentment > 65 ? 'Aggrieved' : 'Noticing'}
                  >
                    It is already showing up in how readily they take fights.
                  </Alert>
                </div>
              )}
            </Card>
          )}
        </>
      }
      side={
        <>
          {value && (
            <Card title="Value for money">
              <KeyStat
                value={value.label}
                label="Against what they return"
                detail={value.detail}
                tone={value.tone === 'good' ? 'good' : value.tone === 'bad' ? 'bad' : 'neutral'}
              />
            </Card>
          )}

          <Card title="What they want">
            <KeyStat value={wants.label} label="Next" detail={wants.detail} />
          </Card>

          {standing.manager && (
            <Card title="Represented by">
              <p className="prose" style={{ margin: 0 }}>
                <strong>{standing.manager.name}</strong>
              </p>
              <p className="muted prose" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                Every offer goes through them, and they have their own plan for this career.
              </p>
            </Card>
          )}

          {isYours && (
            <Card title="Options">
              <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
                Extending a deal and releasing somebody are both done from the roster screen, where
                the rest of the promotion is in view beside them.
              </p>
            </Card>
          )}
        </>
      }
    />
  );
}
