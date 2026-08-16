/**
 * The managers.
 *
 * Deliberately **shapes rather than tiers**. There is no best manager in this list and that
 * is the entire point: `connections` is a per-promotion vector, so the set cannot be ordered,
 * and "who should I sign with" has no answer without knowing what career you are trying to
 * have. See docs/16-contracts-free-agency-managers.md, Part 3.
 *
 * The archetypes are the real ones. Each is the correct choice for somebody and a mistake for
 * somebody else.
 */

import {
  asManagerId,
  asPromotionId,
  uniformPersonality,
  type Manager,
} from '@mmasim/engine';

const APEX = asPromotionId('p_apex');
const VANGUARD = asPromotionId('p_vanguard');
const RISING_SUN = asPromotionId('p_rising_sun');
const ECC = asPromotionId('p_cage_circuit');
const FRONTIER = asPromotionId('p_frontier');

export const SEED_MANAGERS: readonly Manager[] = [
  {
    id: asManagerId('mg_family'),
    name: 'Danny Rourke',
    /*
     * The family manager, and the honest default for a debutant.
     *
     * Not a bad manager — a *non*-manager. He is your cousin, he takes nothing, and he knows
     * nobody. Extremely common in the sport, and the truthful answer to "who represents
     * somebody nobody has heard of". He is also the reason this screen is never empty: a
     * fighter with no options still has this one, and it costs them nothing but opportunity.
     */
    negotiation: 30,
    standing: 12,
    integrity: 88,
    connections: { [FRONTIER]: 25, [ECC]: 15 },
    favour: {},
    purseRate: 0,
    sponsorshipRate: 0,
    clientIds: [],
    personality: uniformPersonality(50),
    advice: [],
    blurb:
      'Your cousin. Takes nothing, tells you the truth, and cannot get a matchmaker on the phone to save his life.',
  },
  {
    id: asManagerId('mg_kessler'),
    name: 'Ray Kessler',
    // The super-agency. You get booked; you are also one of thirty.
    negotiation: 72,
    standing: 92,
    integrity: 45,
    connections: { [APEX]: 74, [VANGUARD]: 70, [RISING_SUN]: 62, [ECC]: 55, [FRONTIER]: 40 },
    favour: { [APEX]: 70, [VANGUARD]: 40 },
    purseRate: 0.12,
    sponsorshipRate: 0.2,
    clientIds: [],
    personality: uniformPersonality(50),
    advice: [],
    blurb:
      'Runs the biggest stable in the sport. Everybody takes his call, and he will put you on a prelim to get somebody else a main event.',
  },
  {
    id: asManagerId('mg_okafor'),
    name: 'Ada Okafor',
    // The company man — superb until you want to leave.
    negotiation: 66,
    standing: 58,
    integrity: 62,
    connections: { [APEX]: 91, [VANGUARD]: 22, [RISING_SUN]: 18, [ECC]: 20, [FRONTIER]: 15 },
    favour: { [APEX]: 88 },
    purseRate: 0.1,
    sponsorshipRate: 0.18,
    clientIds: [],
    personality: uniformPersonality(50),
    advice: [],
    blurb:
      'Has the matchmaker at Apex on speed dial and almost nobody else. Signing her partly chooses your next five years.',
  },
  {
    id: asManagerId('mg_valdez'),
    name: 'Hector Valdez',
    // The shark. The best money in the sport, and a bridge on fire behind you.
    negotiation: 94,
    standing: 44,
    integrity: 18,
    connections: { [APEX]: 55, [VANGUARD]: 58, [RISING_SUN]: 40, [ECC]: 52, [FRONTIER]: 48 },
    favour: {},
    purseRate: 0.15,
    sponsorshipRate: 0.2,
    clientIds: [],
    personality: uniformPersonality(50),
    advice: [],
    blurb:
      'Gets more money out of a promotion than anybody. Also leaves a trail of matchmakers who will not deal with him twice.',
  },
  {
    id: asManagerId('mg_brennan'),
    name: 'Tommy Brennan',
    // The old-school guy. A career made of opportunities you had no business getting.
    negotiation: 52,
    standing: 88,
    integrity: 78,
    connections: { [APEX]: 60, [VANGUARD]: 64, [RISING_SUN]: 55, [ECC]: 70, [FRONTIER]: 62 },
    favour: { [ECC]: 55 },
    purseRate: 0.1,
    sponsorshipRate: 0.15,
    clientIds: [],
    personality: uniformPersonality(50),
    advice: [],
    blurb:
      'Been doing this thirty years. Will get you a short-notice title shot and will not get you paid properly for it.',
  },
  {
    id: asManagerId('mg_shaw'),
    name: 'Priya Shaw',
    // The lawyer. An excellent deal at a promotion that does not book you.
    negotiation: 89,
    standing: 30,
    integrity: 85,
    connections: { [APEX]: 18, [VANGUARD]: 20, [RISING_SUN]: 12, [ECC]: 22, [FRONTIER]: 18 },
    favour: {},
    purseRate: 0.11,
    sponsorshipRate: 0.15,
    clientIds: [],
    personality: uniformPersonality(50),
    advice: [],
    blurb:
      'Reads a contract properly, which almost nobody does. Cannot get a matchmaker to return a call to save her life.',
  },
  {
    id: asManagerId('mg_delacroix'),
    name: 'Marcel Delacroix',
    // The believer. Nobody else takes that call when you are 4-6.
    negotiation: 58,
    standing: 40,
    integrity: 94,
    connections: { [APEX]: 30, [VANGUARD]: 44, [RISING_SUN]: 38, [ECC]: 58, [FRONTIER]: 66 },
    favour: {},
    purseRate: 0.08,
    sponsorshipRate: 0.15,
    clientIds: [],
    personality: uniformPersonality(50),
    advice: [],
    blurb:
      'Takes eight per cent and tells you the truth. Still returns your calls when you are 4-6 and everybody else has stopped.',
  },
];
