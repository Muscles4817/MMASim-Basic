/**
 * Branded entity IDs.
 *
 * Persisted state refers to entities by ID string, never by object reference — that keeps
 * the world tree acyclic and `JSON.stringify`-able. Branding costs nothing at runtime but
 * makes passing a `GymId` where a `FighterId` belongs a compile error, which matters a lot
 * once a dozen entity types are in play.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type FighterId = Brand<string, 'FighterId'>;
export type CoachId = Brand<string, 'CoachId'>;
export type GymId = Brand<string, 'GymId'>;
export type PromotionId = Brand<string, 'PromotionId'>;
export type EventId = Brand<string, 'EventId'>;
export type BoutId = Brand<string, 'BoutId'>;
export type ContractId = Brand<string, 'ContractId'>;
export type RivalryId = Brand<string, 'RivalryId'>;
export type InjuryId = Brand<string, 'InjuryId'>;
export type CampId = Brand<string, 'CampId'>;
export type OfficialId = Brand<string, 'OfficialId'>;
export type DivisionId = Brand<string, 'DivisionId'>;

export type EntityId =
  | FighterId
  | CoachId
  | GymId
  | PromotionId
  | EventId
  | BoutId
  | ContractId
  | RivalryId
  | InjuryId
  | CampId
  | OfficialId
  | DivisionId;

/**
 * Cast a raw string to a branded ID.
 *
 * Deliberately unchecked: it exists for deserialisation and seed data, where the string is
 * already known-good. Prefer `createIdFactory` for newly minted IDs.
 */
export const asId = <T extends EntityId>(raw: string): T => raw as T;

export const asFighterId = (raw: string): FighterId => raw as FighterId;
export const asPromotionId = (raw: string): PromotionId => raw as PromotionId;
export const asGymId = (raw: string): GymId => raw as GymId;
export const asDivisionId = (raw: string): DivisionId => raw as DivisionId;

/**
 * A monotonic ID minter, e.g. `fighter_0001`.
 *
 * Sequential rather than random because IDs must be reproducible: two runs of the same
 * seeded sim have to produce the same IDs or save diffs become unreadable. The counter
 * lives in world state, not in a module-level variable, so it survives save/load.
 */
export interface IdFactory<T extends EntityId> {
  next(): T;
  /** Current counter, for persisting alongside the world. */
  peek(): number;
}

export function createIdFactory<T extends EntityId>(prefix: string, startAt = 0): IdFactory<T> {
  let counter = startAt;
  return {
    next: () => `${prefix}_${String(++counter).padStart(4, '0')}` as T,
    peek: () => counter,
  };
}
