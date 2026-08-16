/**
 * What the editor can edit, declared as data.
 *
 * Four bespoke forms for promotions, gyms, coaches and officials would be four places to
 * forget a clamp and four places for the editor to drift from the domain model. This is one
 * schema and one form, so adding an editable type is a data change and every field gets the
 * same validation, the same warning behaviour and the same accessibility treatment for free.
 *
 * The editor's standing rule applies throughout: it **warns rather than blocks**. A gym with
 * prestige 90 and quality 20 is incoherent, and a player is entitled to build one.
 */

import type { GameDb } from '@mmasim/data';
import {
  JUDGE_ARCHETYPES,
  type Coach,
  type Commentator,
  type Gym,
  type Judge,
  type Promotion,
  type Referee,
} from '@mmasim/engine';

export type EditorEntityKind =
  | 'fighters'
  | 'promotions'
  | 'gyms'
  | 'coaches'
  | 'referees'
  | 'judges'
  | 'commentators';

export interface NumberField {
  kind: 'number';
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  /** Shown under the control. Should say what the number *does*, not what it is called. */
  help?: string;
}

export interface TextField {
  kind: 'text';
  key: string;
  label: string;
  help?: string;
}

export interface ChoiceField {
  kind: 'choice';
  key: string;
  label: string;
  options: readonly { value: string; label: string }[];
  help?: string;
}

export type EditorField = NumberField | TextField | ChoiceField;

export interface EditorTypeMeta {
  kind: EditorEntityKind;
  /** Plural, for the type picker. */
  label: string;
  singular: string;
  /** One line explaining what editing this actually changes in the game. */
  blurb: string;
  fields: readonly EditorField[];
  /** How a row reads in the list. */
  primary(entity: Record<string, unknown>): string;
  secondary(entity: Record<string, unknown>): string;
  /** Non-blocking coherence warnings. Returns human-readable sentences. */
  warnings?(entity: Record<string, unknown>): string[];
}

const rating = (key: string, label: string, help: string): NumberField => ({
  kind: 'number',
  key,
  label,
  min: 1,
  max: 100,
  help,
});

const asNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');

export const EDITOR_TYPES: readonly EditorTypeMeta[] = [
  {
    kind: 'promotions',
    label: 'Promotions',
    singular: 'promotion',
    blurb:
      'Prestige drives purses and who will sign; matchmaking aggression decides how often the promotion books a fight nobody is ready for.',
    fields: [
      { kind: 'text', key: 'name', label: 'Name' },
      { kind: 'text', key: 'shortName', label: 'Short name', help: 'Used on fight cards.' },
      {
        kind: 'choice',
        key: 'tier',
        label: 'Tier',
        options: [
          { value: 'global', label: 'Global' },
          { value: 'major', label: 'Major' },
          { value: 'regional', label: 'Regional' },
        ],
        help: 'Sets the ceiling on what this promotion can afford and attract.',
      },
      { kind: 'text', key: 'baseCountry', label: 'Base country' },
      rating('prestige', 'Prestige', 'Multiplies every purse, and gates who will sign.'),
      rating('buzz', 'Buzz', 'How much the audience currently cares. Moves with card quality.'),
      rating(
        'matchmakingAggression',
        'Matchmaking aggression',
        'High books the exciting fight over the sensible one, and burns fighters out.',
      ),
      rating(
        'narrativeControl',
        'Narrative control',
        'How effectively it can push a fighter beyond what their results justify.',
      ),
      {
        kind: 'number',
        key: 'budget',
        label: 'Budget ($k)',
        min: 0,
        max: 1_000_000,
        step: 100,
        help: 'What it can spend on a card before it is spending money it does not have.',
      },
    ],
    primary: (e) => asStr(e.name),
    secondary: (e) => `${asStr(e.tier)} · prestige ${asNum(e.prestige)} · buzz ${asNum(e.buzz)}`,
    warnings: (e) => {
      const out: string[] = [];
      if (asStr(e.tier) === 'global' && asNum(e.prestige) < 55) {
        out.push('A global promotion with low prestige will struggle to sign anybody worth signing.');
      }
      if (asNum(e.budget) < 500 && asStr(e.tier) !== 'regional') {
        out.push('This budget cannot pay a main event at this tier.');
      }
      return out;
    },
  },

  {
    kind: 'gyms',
    label: 'Gyms',
    singular: 'gym',
    blurb:
      'Quality caps how much a camp can develop a fighter. Prestige is the bar a fighter has to clear to be let in.',
    fields: [
      { kind: 'text', key: 'name', label: 'Name' },
      { kind: 'text', key: 'city', label: 'City' },
      { kind: 'text', key: 'country', label: 'Country' },
      rating('quality', 'Quality', 'The hard ceiling on what any camp here can achieve.'),
      rating('prestige', 'Prestige', 'The reputation a fighter needs before this room will take them.'),
      {
        kind: 'number',
        key: 'monthlyCost',
        label: 'Monthly cost ($k)',
        min: 0,
        max: 500,
        help: 'What it costs to run. The bootstrapping problem at the heart of coach mode.',
      },
    ],
    primary: (e) => asStr(e.name),
    secondary: (e) => `${asStr(e.city)} · quality ${asNum(e.quality)}`,
    warnings: (e) => {
      const out: string[] = [];
      if (asNum(e.prestige) > asNum(e.quality) + 25) {
        out.push(
          'Far more famous than it is good. Possible, and it means the fighters it attracts will not improve.',
        );
      }
      return out;
    },
  },

  {
    kind: 'coaches',
    label: 'Coaches',
    singular: 'coach',
    blurb:
      'Development is what they add to a camp; scouting is how accurately they read an opponent. Neither is visible to the player in game.',
    fields: [
      { kind: 'text', key: 'firstName', label: 'First name' },
      { kind: 'text', key: 'lastName', label: 'Last name' },
      rating('development', 'Development', 'How much a camp under them is actually worth.'),
      rating('scouting', 'Scouting', 'How accurate their read of an opponent is. Error, not bias.'),
      rating('gamePlanning', 'Game planning', 'The quality of the plan built from that read.'),
      rating('cornering', 'Cornering', 'Whether the between-rounds instruction lands.'),
      rating('reputation', 'Reputation', 'Drives hiring cost and who is willing to work with them.'),
      {
        kind: 'number',
        key: 'salary',
        label: 'Salary ($k/month)',
        min: 0,
        max: 500,
      },
    ],
    primary: (e) => `${asStr(e.firstName)} ${asStr(e.lastName)}`,
    secondary: (e) => `development ${asNum(e.development)} · scouting ${asNum(e.scouting)}`,
  },

  {
    kind: 'referees',
    label: 'Referees',
    singular: 'referee',
    blurb:
      'The most under-appreciated variable on a fight card. A referee is assigned per bout and shown before it, so a prepared player can plan around one.',
    fields: [
      { kind: 'text', key: 'name', label: 'Name' },
      rating(
        'stoppageTrigger',
        'Stoppage trigger',
        'Low saves careers and produces "he was still in it". High produces highlight reels and lasting damage.',
      ),
      rating(
        'standUpSpeed',
        'Stand-up speed',
        'How fast a stalled position is broken. The single biggest external modifier on a control wrestler.',
      ),
      rating(
        'foulTolerance',
        'Foul tolerance',
        'Low warns on sight and takes points early. High misses fouls entirely.',
      ),
      { kind: 'text', key: 'reputation', label: 'Reputation', help: 'The line shown on the fight card.' },
    ],
    primary: (e) => asStr(e.name),
    secondary: (e) =>
      `stoppage ${asNum(e.stoppageTrigger)} · stand-ups ${asNum(e.standUpSpeed)} · fouls ${asNum(e.foulTolerance)}`,
    warnings: (e) => {
      const out: string[] = [];
      if (asNum(e.stoppageTrigger) > 85) {
        out.push('This referee will let people take a great deal of unnecessary damage.');
      }
      return out;
    },
  },

  {
    kind: 'judges',
    label: 'Judges',
    singular: 'judge',
    blurb:
      'Three judges with different bias vectors are what produce a genuine split decision from a single set of fight data. Consistency is how reliably they apply their own criteria.',
    fields: [
      { kind: 'text', key: 'name', label: 'Name' },
      {
        kind: 'choice',
        key: 'archetype',
        label: 'What they reward',
        options: Object.keys(JUDGE_ARCHETYPES).map((value) => ({
          value,
          label:
            value === 'damageFirst'
              ? 'Damage first'
              : value === 'controlFirst'
                ? 'Control first'
                : value === 'volumeFirst'
                  ? 'Volume first'
                  : 'Balanced',
        })),
        help: 'Sets the whole bias vector. Wrestlers love a control judge.',
      },
      rating(
        'consistency',
        'Consistency',
        'Low means noisy cards — the mechanism behind scores nobody can explain.',
      ),
    ],
    primary: (e) => asStr(e.name),
    secondary: (e) => `consistency ${asNum(e.consistency)}`,
    warnings: (e) => {
      const out: string[] = [];
      if (asNum(e.consistency) < 30) {
        out.push('This judge will produce cards that bear no relation to the fight.');
      }
      return out;
    },
  },

  {
    kind: 'commentators',
    label: 'Commentators',
    singular: 'commentator',
    blurb:
      'In a text sim the commentary is the only view of the fight, so a biased booth genuinely misleads. Style bias reweights what they count before they decide who won.',
    fields: [
      { kind: 'text', key: 'name', label: 'Name' },
      {
        kind: 'number',
        key: 'styleBias',
        label: 'Style bias',
        min: -100,
        max: 100,
        help: 'Negative loves grapplers, positive loves strikers. Zero reads a round straight.',
      },
      rating('hype', 'Hype', 'How much they inflate what they are watching, and how certain they sound.'),
      rating('companyLine', 'Company line', 'How readily they narrate whoever the promotion is pushing.'),
    ],
    primary: (e) => asStr(e.name),
    secondary: (e) => {
      const bias = asNum(e.styleBias);
      const style = bias > 0.35 ? 'striking' : bias < -0.35 ? 'grappling' : 'even-handed';
      return `${style} · hype ${asNum(e.hype)}`;
    },
    warnings: (e) => {
      const out: string[] = [];
      if (asNum(e.companyLine) > 85 && asNum(e.hype) > 85) {
        out.push('This booth will tell the audience whatever it was told to, at volume.');
      }
      return out;
    },
  },
];

export const editorTypeFor = (kind: EditorEntityKind): EditorTypeMeta | undefined =>
  EDITOR_TYPES.find((t) => t.kind === kind);

/** The repository behind an editable type. Fighters keep their own bespoke screen. */
export function repositoryFor(db: GameDb, kind: EditorEntityKind) {
  switch (kind) {
    case 'promotions':
      return db.promotions as unknown as GenericRepo;
    case 'gyms':
      return db.gyms as unknown as GenericRepo;
    case 'coaches':
      return db.coaches as unknown as GenericRepo;
    case 'referees':
      return db.referees as unknown as GenericRepo;
    case 'judges':
      return db.judges as unknown as GenericRepo;
    case 'commentators':
      return db.commentators as unknown as GenericRepo;
    default:
      return undefined;
  }
}

export interface GenericRepo {
  findAll(): Record<string, unknown>[];
  findById(id: string): Record<string, unknown> | undefined;
  upsert(entity: Record<string, unknown>): void;
}

export type EditableEntity = Promotion | Gym | Coach | Referee | Judge | Commentator;

/**
 * Read a field off an entity for the form.
 *
 * Two fields are stored differently from how they are edited, and both are handled here so
 * the form never has to know: a judge's bias is a five-way vector edited as an archetype,
 * and a commentator's style bias is a −1..1 float edited as a −100..100 integer, because a
 * slider that moves in hundredths of a unit is unusable on a phone.
 */
export function readField(entity: Record<string, unknown>, field: EditorField): string | number {
  if (field.key === 'archetype') {
    const bias = JSON.stringify(entity.bias);
    const match = Object.entries(JUDGE_ARCHETYPES).find(([, v]) => JSON.stringify(v) === bias);
    return match?.[0] ?? 'balanced';
  }
  if (field.key === 'styleBias') return Math.round(asNum(entity.styleBias) * 100);

  const value = entity[field.key];
  if (field.kind === 'number') return asNum(value);
  return asStr(value);
}

/** Write a form field back, undoing the same two transforms. */
export function writeField(
  entity: Record<string, unknown>,
  field: EditorField,
  value: string | number,
): Record<string, unknown> {
  if (field.key === 'archetype') {
    const archetype = JUDGE_ARCHETYPES[String(value)];
    return archetype ? { ...entity, bias: archetype } : entity;
  }
  if (field.key === 'styleBias') {
    return { ...entity, styleBias: Number(value) / 100 };
  }
  return { ...entity, [field.key]: value };
}
