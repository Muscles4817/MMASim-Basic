/**
 * Human labels for the domain's enums.
 *
 * These exist because raw enum values kept leaking into the interface — `physical` as a card
 * title, `global` in a promotion chip — hidden only by a CSS `text-transform: uppercase`
 * that made them look deliberate. One map, imported everywhere, rather than a label map on
 * one screen and a leak on the next.
 */

import type { AttributeGroup, Promotion } from '@mmasim/engine';

export const GROUP_LABELS: Record<AttributeGroup, string> = {
  physical: 'Physical',
  striking: 'Striking',
  grappling: 'Grappling',
  mental: 'Mental',
};

export const PROMOTION_TIER_LABELS: Record<Promotion['tier'], string> = {
  global: 'Global',
  major: 'Major',
  regional: 'Regional',
  developmental: 'Developmental',
};
