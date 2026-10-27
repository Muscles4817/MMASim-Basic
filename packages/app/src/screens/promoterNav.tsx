/**
 * Promoter sub-navigation.
 *
 * The tab bar stays at five, because five is what a thumb can hit and because forking the shell
 * to add a sixth would mean maintaining the rail/tab-bar breakpoint, the safe-area insets and
 * the focus handling twice. Places that do not fit there live on a row of chips at the top of
 * the tab they belong to.
 *
 * Only places *within* the current tab. The row used to repeat the tab bar — Dashboard, Events,
 * Roster & contracts — beside the tab bar's own Promotion, Calendar and Roster, so the same three
 * destinations were on screen twice under different names. A tab whose only place is itself has
 * no row at all.
 */

import { useRouter, toHash, type Route } from '../state/router';
import { SubNav } from '../ui/console';

export type PromoterPlace = 'promotion' | 'calendar' | 'roster' | 'champions' | 'history';

/** Which tab a place sits under. Places sharing a tab are the row's siblings. */
type Tab = 'promotion' | 'calendar' | 'roster';

const PLACES: readonly { id: PromoterPlace; tab: Tab; label: string; route: Route }[] = [
  { id: 'promotion', tab: 'promotion', label: 'Dashboard', route: { name: 'promotion' } },
  { id: 'champions', tab: 'promotion', label: 'Championships', route: { name: 'champions' } },
  { id: 'history', tab: 'promotion', label: 'History', route: { name: 'history' } },
  { id: 'calendar', tab: 'calendar', label: 'Events', route: { name: 'calendar' } },
  { id: 'roster', tab: 'roster', label: 'Roster & contracts', route: { name: 'promoterRoster' } },
];

export function PromoterSubNav({ current }: { current: PromoterPlace }) {
  const { navigate } = useRouter();
  const tab = PLACES.find((p) => p.id === current)?.tab;
  const siblings = PLACES.filter((p) => p.tab === tab);
  if (siblings.length < 2) return null;

  return (
    <SubNav
      label="Promotion sections"
      items={siblings.map((place) => ({
        label: place.label,
        href: toHash(place.route),
        current: place.id === current,
        onClick: () => navigate(place.route),
      }))}
    />
  );
}
