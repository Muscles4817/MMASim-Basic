import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ATHLETIC_ORIGINS,
  ATTAINMENT_META,
  ATTRIBUTES_BY_GROUP,
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_META,
  BUILDS,
  BUILD_META,
  COMBAT_DISCIPLINES,
  CREATION_POINTS,
  DEFAULT_ORIGIN,
  DISCIPLINE_META,
  MAX_POINTS_PER_ATTRIBUTE,
  TALENT_META,
  TALENT_TIERS,
  attainmentBlurb,
  attainmentLabel,
  attainmentsForTalent,
  createPlayerFighter,
  createRng,
  creationSummary,
  describeOrigin,
  divisionsFor,
  reconcileOrigin,
  secondaryOptionsFor,
  validateCreation,
  type AttributeKey,
  type Build,
  type CombatDiscipline,
  type CreateFighterSpec,
  type FighterOrigin,
  type Gym,
  type Sex,
  findNationality,
  NATIONALITIES,
} from '@mmasim/engine';
import { GROUP_LABELS } from '../game/labels';
import { useGame } from '../state/GameProvider';
import { useRouter } from '../state/router';
import { Button, Card, Chip, Flag, RatingRow, Segmented } from '../ui';
import { Alert } from '../ui/signals';
import { clearTransientCareerState } from '../game/career';
import { signFirstDeal } from '../game/contracts';

/**
 * One selectable origin option: a title, a paragraph, and an optional footnote.
 *
 * `aria-label` carries only the name and `aria-describedby` carries the prose, rather than
 * letting the accessible name fall out of the whole button's text content the way the old
 * background cards did. Two reasons, one of them a real bug: the old scheme made "Boxing"
 * a substring of "Kickboxing / Muay Thai" *and* of every blurb on the screen, so neither a
 * screen reader nor a test could name one option unambiguously. The other is that a name
 * forty words long is announced in full every time focus lands on it.
 */
function OriginOption({
  id,
  name,
  description,
  footnote,
  selected,
  onSelect,
}: {
  id: string;
  name: string;
  description: string;
  footnote?: ReactNode;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={name}
      aria-describedby={`${id}-desc`}
      onClick={onSelect}
      style={{
        textAlign: 'left',
        padding: 'var(--space-3)',
        minHeight: 'var(--tap-target)',
        borderRadius: 'var(--radius)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        background: selected ? 'var(--accent-soft)' : 'var(--surface)',
        color: 'var(--text)',
      }}
    >
      <span style={{ fontWeight: 700, display: 'block' }}>{name}</span>
      <span
        id={`${id}-desc`}
        className="muted"
        style={{ fontSize: 'var(--text-sm)', display: 'block' }}
      >
        {description}
      </span>
      {footnote && (
        <span className="faint" style={{ fontSize: 'var(--text-xs)', display: 'block', marginTop: 4 }}>
          {footnote}
        </span>
      )}
    </button>
  );
}

/** The grid every layer's options sit in. One column on a phone, as many as fit above it. */
const OPTION_GRID = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
  gap: 'var(--space-2)',
} as const;

/** A numbered heading, so three nested layers read as a sequence rather than a wall. */
function LayerHeading({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--space-2)' }}>
      <h3 className="section-title" style={{ marginBottom: 2 }}>
        {step}. {title}
      </h3>
      <p className="muted prose" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
        {children}
      </p>
    </div>
  );
}

/**
 * Create your fighter.
 *
 * Deliberately *not* a points budget across fifteen sliders. That invites min-maxing and
 * produces incoherent people — Power 90 on a body with no explosiveness, which the naturals
 * layer says is impossible.
 *
 * Instead you answer three questions in order — what kind of athlete you are, what you
 * trained, and how far you got at it — and those set your hidden physiology and therefore
 * your ceilings. A small discretionary allocation shapes where you already are inside them.
 *
 * The three layers are nested rather than independent, and the screen has to *show* that or
 * it becomes three unrelated menus: layer 1 filters what layer 3 offers, because an Olympic
 * medallist is by definition an elite athlete. `reconcileOrigin` keeps the selection legal
 * as the player moves between tiers, so nothing silently becomes invalid behind them.
 *
 * Nothing on this screen ever shows a ceiling. That is doc/06's rule and it is what makes
 * coaches, scouting and camps worth anything later: you are told what you *did*, and the
 * hidden physiology it implies is for the next ten years to reveal.
 */
export function CreateFighterScreen() {
  const { db, updateWorld, commit } = useGame();
  const { navigate } = useRouter();

  const issuesRef = useRef<HTMLDivElement>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [nationality, setNationality] = useState('USA');
  // Whether the typed country is one the game knows, which decides the flag and whether the
  // fighter's generated peers can share a name pool with them.
  const recognised = findNationality(nationality) !== undefined;
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState(22);
  const [origin, setOrigin] = useState<FighterOrigin>(DEFAULT_ORIGIN);
  const [build, setBuild] = useState<Build>('balanced');
  const [allocation, setAllocation] = useState<Partial<Record<AttributeKey, number>>>({});

  const divisions = useMemo(() => divisionsFor(sex), [sex]);
  const [divisionId, setDivisionId] = useState<string>(divisions[3]?.id as string);

  const spent = Object.values(allocation).reduce((a, v) => a + (v ?? 0), 0);
  const remaining = CREATION_POINTS - spent;

  const disciplines = secondaryOptionsFor(origin.discipline);
  const attainments = attainmentsForTalent(origin.talent);
  const minAge = ATTAINMENT_META[origin.attainment].minDebutAge;

  /*
   * Every origin change goes through `reconcileOrigin` and then through the age floor.
   *
   * Dropping from Freak to Grinder invalidates an Olympic attainment and a rugby background
   * at the same time, and leaving them selected would show the player a choice the engine
   * then refuses on submit — the exact dead end the "Turn pro" button's own comment argues
   * against. Reconciling here means the illegal field falls to its nearest legal value and
   * everything the player did not touch survives.
   *
   * The age floor moves *with* the attainment rather than merely validating against it,
   * because a slider that silently makes the form invalid is worse than one that moves.
   */
  const changeOrigin = (next: FighterOrigin) => {
    const legal = reconcileOrigin(next);
    setOrigin(legal);
    setAge((current) => Math.max(current, ATTAINMENT_META[legal.attainment].minDebutAge));
  };

  const spec: CreateFighterSpec = {
    id: `player_${Date.now().toString(36)}`,
    firstName,
    lastName,
    nickname: nickname || undefined,
    nationality,
    sex,
    age,
    divisionId: divisionId as CreateFighterSpec['divisionId'],
    origin,
    build,
    allocation,
    day: 0,
  };

  const issues = validateCreation(spec);
  const originKey = `${origin.talent}:${origin.discipline}:${origin.secondary ?? '-'}:${origin.attainment}`;

  // A stable preview: the same choices always show the same fighter, so the player is
  // comparing decisions rather than rerolling until they like the dice.
  const preview = useMemo(() => {
    if (issues.length > 0) return undefined;
    try {
      return createPlayerFighter(
        { ...spec, id: 'preview' },
        createRng(`preview:${originKey}:${build}:${age}:${sex}:${divisionId}`),
      );
    } catch {
      return undefined;
    }
    // Deliberately keyed on the *choices* rather than on `spec`, which is rebuilt every
    // render. Serialising the allocation is the cheapest stable key for a small object.
  }, [originKey, build, age, sex, divisionId, JSON.stringify(allocation), issues.length]);

  /*
   * Keep the fighter roughly where they were when the sex toggle flips.
   *
   * It reset to `divisionsFor(next)[0]` — the lightest class — while the initial state seeds
   * index 3, so toggling Male → Female → Male silently moved the fighter three divisions down
   * from where they started with no notice. Matching by index keeps the weight comparable and
   * makes the toggle reversible, which is what a player expects from a toggle.
   */
  const onSexChange = (next: Sex) => {
    const previous = divisionsFor(sex);
    const index = Math.max(
      0,
      previous.findIndex((d) => (d.id as string) === divisionId),
    );
    setSex(next);
    const options = divisionsFor(next);
    const match = options[Math.min(index, options.length - 1)] ?? options[0];
    if (match) setDivisionId(match.id as string);
  };

  const adjust = (key: AttributeKey, delta: number) => {
    setAllocation((current) => {
      const now = current[key] ?? 0;
      const next = now + delta;
      if (next < 0 || next > MAX_POINTS_PER_ATTRIBUTE) return current;
      /*
       * Budget derived from `current`, not from the render closure.
       *
       * It read `remaining` from the enclosing render, which is stale inside a functional
       * updater: two `+` presses landing in one React batch both saw the same value and the
       * allocation could overshoot the cap. The player then hit "Only 24 points are available"
       * on submit with no indication of which attribute to undo.
       */
      const spentNow = Object.values(current).reduce((a, n) => a + (n ?? 0), 0);
      if (delta > 0 && CREATION_POINTS - spentNow <= 0) return current;
      return { ...current, [key]: next };
    });
  };

  const start = () => {
    const world = db.world.findById('world');
    const day = world?.day ?? 0;

    // Everyone starts at the bottom of the ladder. That is the game.
    const developmental = db.promotions.findAll().find((p) => p.tier === 'developmental');
    // A modest starting gym: you cannot walk into the best room in the world unknown.
    const startingGym = (db.gyms.findAll() as Gym[])
      .slice()
      .sort((a, b) => a.quality - b.quality)[0];

    const fighter = createPlayerFighter(
      { ...spec, day, promotionId: developmental?.id as never, gymId: startingGym?.id },
      createRng(`create:${spec.id}`),
    );

    const withCoach = { ...fighter, headCoachId: startingGym?.headCoachId };
    db.fighters.upsert(withCoach as never);

    // A first deal, at the bottom promotion's floor, take it or leave it. Every fighter
    // starts unsigned and unmanaged — both are real states — but a career needs a first
    // rung, and the bottom of the sport is busy rather than empty.
    signFirstDeal(db, withCoach as never);

    clearTransientCareerState();
    updateWorld({ playerRole: 'fighter', playerFighterId: fighter.id as string });
    commit();
    navigate({ name: 'hub' });
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <Card>
        <h2 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>
          Create your fighter
        </h2>
        <p className="muted prose">
          You start unknown, on the smallest show in the sport, below the level everywhere.
          What you become is decided by who trains you and what you drill for the next ten
          years — not by the numbers on this screen.
        </p>
      </Card>

      <Card title="Who you are">
        <div className="stack">
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <label style={{ flex: '1 1 10rem' }}>
              <span className="section-title">First name</span>
              <input
                className="field"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label style={{ flex: '1 1 10rem' }}>
              <span className="section-title">Last name</span>
              <input
                className="field"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="off"
              />
            </label>
          </div>

          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <label style={{ flex: '1 1 12rem' }}>
              <span className="section-title">Nickname (optional)</span>
              <input
                className="field"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="The Predator"
                autoComplete="off"
              />
            </label>
            <label style={{ flex: '1 1 8rem' }}>
              <span className="section-title">Nationality</span>
              {/*
                A real list rather than a free-text box.
               
                It used to be an open input defaulting to "USA", so a typo or an invented country
                was accepted silently and then carried for the rest of the career — and since
                nothing validated it, that fighter would never get a flag and would never match a
                name pool. `datalist` is the right control here: it filters as you type, it is
                keyboard accessible for free, it works properly on a phone keyboard, and it still
                allows a country the list does not carry rather than trapping the player.
              */}
              <input
                className="field"
                list="nationality-options"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                autoComplete="off"
                aria-describedby="nationality-hint"
              />
              <datalist id="nationality-options">
                {NATIONALITIES.map((n) => (
                  <option key={n.code} value={n.name} />
                ))}
              </datalist>
              <span
                id="nationality-hint"
                className="muted"
                style={{
                  fontSize: 'var(--text-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  marginTop: 'var(--space-1)',
                  minHeight: '1.4em',
                }}
              >
                {recognised ? (
                  <Flag nationality={nationality} />
                ) : (
                  'Not a country we know — your fighter will have no flag.'
                )}
              </span>
            </label>
          </div>

          <div>
            <span className="section-title">Sex</span>
            <Segmented
              label="Sex"
              value={sex}
              onChange={onSexChange}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
            />
          </div>

          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <label style={{ flex: '1 1 12rem' }}>
              <span className="section-title">Division</span>
              <select
                className="field"
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
              >
                {divisions.map((d) => (
                  <option key={d.id} value={d.id as string}>
                    {d.name} ({d.limitLbs} lb)
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: '1 1 8rem' }}>
              <span className="section-title">Debut age: {age}</span>
              {/*
                The floor moves with what you say you achieved.

                You cannot medal at a world championship and also turn pro at nineteen, and
                that is the balance for the whole attainment layer rather than a hidden
                penalty: a fighter who arrives with a name arrives having spent the years it
                took to build it, and ageing bills them for it for the rest of the career.
              */}
              <input
                type="range"
                min={minAge}
                max={35}
                value={age}
                aria-label="Debut age"
                onChange={(e) => setAge(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
            Debuting young means more years to grow into your ceiling. Debuting late means you
            start further along and have less runway to use it.
            {minAge > 18 && ` Getting as far as you did means you cannot start before ${minAge}.`}
          </p>
        </div>
      </Card>

      <Card title="Where you came from">
        <p className="muted prose" style={{ marginBottom: 'var(--space-4)' }}>
          Three questions, in order: what you were born with, what you trained, and how far you
          got at it. They are separate things and they do separate jobs — the first decides what
          you could eventually become, the second what kind of fighter you already are, and the
          third who has heard of you on the day you turn pro.
        </p>

        {/* --- Layer 1: talent ---------------------------------------------------------- */}
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <LayerHeading step={1} title="What kind of athlete you are">
            The one thing on this screen you were born with rather than earned. Nobody, including
            you, ever finds out exactly how far it goes.
          </LayerHeading>
          <div role="radiogroup" aria-label="What kind of athlete you are" style={OPTION_GRID}>
            {TALENT_TIERS.map((key) => (
              <OriginOption
                key={key}
                id={`talent-${key}`}
                name={TALENT_META[key].label}
                description={TALENT_META[key].blurb}
                footnote={TALENT_META[key].cost}
                selected={origin.talent === key}
                onSelect={() => changeOrigin({ ...origin, talent: key })}
              />
            ))}
          </div>
        </div>

        {/* --- Layer 2: discipline ------------------------------------------------------ */}
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <LayerHeading step={2} title="What you trained">
            What you have already done ten thousand times. It decides what you reach for in a
            fight, and it is the reason two fighters with the same ratings do not fight the same.
          </LayerHeading>
          {/*
            One radiogroup for all of it, not two.

            The combat arts and the athletic backgrounds are a single mutually-exclusive
            choice, so splitting them into two radiogroups would announce two independent
            selections and let a keyboard user believe they could have one of each.
          */}
          <div role="radiogroup" aria-label="What you trained">
            <div style={OPTION_GRID}>
              {COMBAT_DISCIPLINES.map((key) => (
                <OriginOption
                  key={key}
                  id={`discipline-${key}`}
                  name={DISCIPLINE_META[key].label}
                  description={DISCIPLINE_META[key].blurb}
                  footnote={`Weakness: ${DISCIPLINE_META[key].weakness}`}
                  selected={origin.discipline === key}
                  onSelect={() => changeOrigin({ ...origin, discipline: key })}
                />
              ))}
            </div>

            {TALENT_META[origin.talent].allowsAthleticOrigin && (
              <>
                <p
                  className="faint prose"
                  style={{ fontSize: 'var(--text-sm)', margin: 'var(--space-3) 0 var(--space-2)' }}
                >
                  Or no martial art at all. You come from another sport entirely and everything
                  technical is still ahead of you — the longest road in the game, and the one with
                  the most at the end of it.
                </p>
                <div style={OPTION_GRID}>
                  {ATHLETIC_ORIGINS.map((key) => (
                    <OriginOption
                      key={key}
                      id={`discipline-${key}`}
                      name={DISCIPLINE_META[key].label}
                      description={DISCIPLINE_META[key].blurb}
                      footnote={`Weakness: ${DISCIPLINE_META[key].weakness}`}
                      selected={origin.discipline === key}
                      onSelect={() => changeOrigin({ ...origin, discipline: key })}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/*
            The second art is a select rather than nine more cards.

            It is an optional modifier on a choice already made, and giving it the same visual
            weight as the primary would suggest it is worth the same — it is worth a third,
            and it is taken out of the primary rather than added on top.
          */}
          <label style={{ display: 'block', marginTop: 'var(--space-3)' }}>
            <span className="section-title">A second discipline (optional)</span>
            <select
              className="field"
              value={origin.secondary ?? ''}
              disabled={disciplines.length === 0}
              onChange={(e) =>
                changeOrigin({
                  ...origin,
                  secondary: (e.target.value || undefined) as CombatDiscipline | undefined,
                })
              }
            >
              <option value="">Nothing else — you only ever did the one thing</option>
              {disciplines.map((key) => (
                <option key={key} value={key}>
                  {DISCIPLINE_META[key].label}
                </option>
              ))}
            </select>
            <span className="faint prose" style={{ fontSize: 'var(--text-sm)', display: 'block', marginTop: 4 }}>
              {disciplines.length === 0
                ? 'You have never trained a martial art, so there is no second one.'
                : 'Worth about a third of the first, and taken out of it rather than added on top. A wrestler who can box is not the same fighter as a boxer who can wrestle.'}
            </span>
          </label>
        </div>

        {/* --- Layer 3: attainment ------------------------------------------------------ */}
        <div>
          <LayerHeading step={3} title="How far you got">
            How much of it you actually have, and how many people know your name. A name gets
            you seeded above the nobodies for your first few fights — after that it is results.
          </LayerHeading>
          <div role="radiogroup" aria-label="How far you got" style={OPTION_GRID}>
            {attainments.map((key) => (
              <OriginOption
                key={key}
                id={`attainment-${key}`}
                name={attainmentLabel(key, origin.discipline)}
                description={attainmentBlurb(key, origin.discipline)}
                footnote={
                  ATTAINMENT_META[key].minDebutAge > 18
                    ? `Getting there takes years: you cannot turn pro before ${ATTAINMENT_META[key].minDebutAge}.`
                    : undefined
                }
                selected={origin.attainment === key}
                onSelect={() => changeOrigin({ ...origin, attainment: key })}
              />
            ))}
          </div>
          {/*
            Why the list is short, said out loud rather than left as a mystery.

            The filter is the design: the higher rungs are not offered below the tier that
            earns them, because an Olympic medallist *is* an elite athlete and offering it
            here and then quietly discounting it would count the same fact twice.
          */}
          {attainments.length < Object.keys(ATTAINMENT_META).length && (
            <p className="faint prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
              Nobody medals at a world championship without the body to do it. The rungs above
              this open up if you are a better athlete.
            </p>
          )}
        </div>
      </Card>

      <Card title="Build">
        {/*
          Physique, kept separate from origin on purpose: a rangy boxer and a powerful boxer
          are both real people, so folding this into the discipline would mean inventing six
          more menu entries for a choice that is orthogonal to all of them.
        */}
        <Segmented
          label="Build"
          value={build}
          onChange={setBuild}
          options={BUILDS.map((b) => ({ value: b, label: BUILD_META[b].label }))}
        />
        <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
          {BUILD_META[build].blurb}
        </p>
      </Card>

      <Card
        title="Head start"
        action={
          /*
            Announced. Pressing + changes this and the attribute's value with no other
            feedback, so a screen-reader user got no confirmation that anything happened at
            all — on the screen's only mechanic.
          */
          <Chip tone={remaining === 0 ? 'neutral' : 'accent'}>
            <span role="status">
              {remaining} of {CREATION_POINTS} left
            </span>
          </Chip>
        }
      >
        <p className="muted prose" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
          A small head start, up to {MAX_POINTS_PER_ATTRIBUTE} in any one area. Enough to say
          what kind of fighter you are — not enough to build a finished one.
        </p>

        {ATTRIBUTE_GROUPS.map((group) => (
          <div key={group} style={{ marginBottom: 'var(--space-3)' }}>
            {/*
              `GROUP_LABELS`, not the raw enum. `.section-title` uppercases, which happened to
              disguise "physical" / "striking" for sighted players — but the accessible name
              was still the lowercase enum, and `labels.ts` exists specifically to stop this.
            */}
            <h3 className="section-title">{GROUP_LABELS[group]}</h3>
            {ATTRIBUTES_BY_GROUP[group].map((key) => (
              <div
                key={key}
                className="row"
                style={{ justifyContent: 'space-between', minHeight: 'var(--tap-target)' }}
              >
                {/*
                  The blurb on the page, not in a `title`.

                  The player is asked to spend 24 points across Composure, Scrambling and
                  Fight IQ, and what any of them mean existed only in a tooltip — which shows
                  nothing on touch and cannot be focused by a keyboard. `RatingRow` already
                  renders exactly this hint visibly on the fighter profile.
                */}
                <span style={{ flex: 1, minWidth: 0, paddingRight: 'var(--space-2)' }}>
                  <span style={{ fontSize: 'var(--text-sm)', display: 'block' }}>
                    {ATTRIBUTE_META[key].label}
                  </span>
                  <span className="rating__hint">{ATTRIBUTE_META[key].blurb}</span>
                </span>
                <span className="row" style={{ gap: 'var(--space-2)' }}>
                  <Button
                    size="sm"
                    onClick={() => adjust(key, -1)}
                    aria-disabled={(allocation[key] ?? 0) === 0}
                    aria-label={`Remove a point from ${ATTRIBUTE_META[key].label}`}
                  >
                    −
                  </Button>
                  <span
                    className="numeric"
                    style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 700 }}
                  >
                    {allocation[key] ?? 0}
                  </span>
                  {/*
                    `aria-disabled`, matching the primary button at the bottom of this screen
                    and its comment. Real `disabled` dropped all fifteen + buttons out of the
                    tab order the instant the last point was spent, with no message — the same
                    dead end that comment rejects, applied inconsistently fifty lines up.
                  */}
                  <Button
                    size="sm"
                    onClick={() => adjust(key, 1)}
                    aria-disabled={
                      remaining <= 0 || (allocation[key] ?? 0) >= MAX_POINTS_PER_ATTRIBUTE
                    }
                    aria-label={`Add a point to ${ATTRIBUTE_META[key].label}`}
                  >
                    +
                  </Button>
                </span>
              </div>
            ))}
          </div>
        ))}
      </Card>

      {preview && (
        <Card title="What you would start as">
          <p className="prose" style={{ marginBottom: 'var(--space-2)', fontWeight: 600 }}>
            {describeOrigin(origin)}
          </p>
          <p className="muted prose" style={{ marginBottom: 'var(--space-3)' }}>
            {creationSummary(preview)}
          </p>
          {/*
            No ceiling ticks here, deliberately.

            `RatingRow` can draw a scouted-ceiling marker and this screen used to pass the
            fighter's *true* `potential`, which is the one thing doc/06 says the player must
            never see — and worse, it leaked the hidden roll: flipping between two origins
            and reading where the ticks landed told you exactly how the dice had fallen for
            each. Hiding potential is the entire reason coaches, scouting reports and camps
            are worth anything later on, so the creation screen shows what you *are* and the
            next ten years reveal what you could have been.
          */}
          {ATTRIBUTE_GROUPS.map((group) => (
            <div key={group} style={{ marginBottom: 'var(--space-2)' }}>
              {ATTRIBUTES_BY_GROUP[group].map((key) => (
                <RatingRow
                  key={key}
                  label={ATTRIBUTE_META[key].label}
                  value={preview.attributes[key]}
                />
              ))}
            </div>
          ))}
          <p className="faint prose" style={{ fontSize: 'var(--text-sm)' }}>
            Your real physiology is rolled and you are never shown it — two fighters built
            identically on this screen are not the same person, and finding out which one you
            got is what coaches, scouting and ten years of camps are for.
          </p>
        </Card>
      )}

      {/*
        `warn`, not `danger`, so this is a polite live region rather than an assertive one.

        The screen opens with "First name is required" already showing, and `Alert tone="danger"`
        maps to `role="alert"` — so every character typed into the name fields mutated an
        assertive region and interrupted the user mid-word. Validation that resolves as you type
        wants polite; the assertive announcement belongs on the submit attempt below, which
        already focuses this block.
      */}
      {issues.length > 0 && (
        <div ref={issuesRef} tabIndex={-1} style={{ outline: 'none' }}>
          <Alert tone="warn" title="Not ready to turn pro yet">
            <ul style={{ margin: 0, paddingInlineStart: '1.1rem' }}>
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      {/*
        Deliberately not `disabled`.

        A truly disabled button is not focusable, so a keyboard user tabs straight past the
        one control on the screen and never learns why nothing happened — and on touch, a
        greyed button that silently swallows a tap is the same dead end. aria-disabled says
        the same thing to assistive tech while leaving the control reachable, so pressing it
        can explain itself by sending the reader to the reasons.
      */}
      <Button
        variant="primary"
        block
        onClick={() => {
          if (issues.length > 0) {
            issuesRef.current?.focus();
            issuesRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            return;
          }
          start();
        }}
        aria-disabled={issues.length > 0}
      >
        Turn pro
      </Button>
    </div>
  );
}
