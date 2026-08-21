/**
 * Promoter sub-navigation.
 *
 * The tab bar stays at five, because five is what a thumb can hit and because forking the shell
 * to add a sixth would mean maintaining the rail/tab-bar breakpoint, the safe-area insets and
 * the focus handling twice. But promoter mode now has more systems than five tabs can name —
 * events, championships, contracts, the wider sport — and the old build's answer was to bury
 * them inside Roster and Calendar, where nobody found them.
 *
 * So the places live on a row of chips at the top of the promoter's own screens. It is one
 * component rather than a copy per screen precisely because the set will keep growing.
 */

import { useRouter, toHash, type Route } from '../state/router';
import { SubNav } from '../ui/console';

export type PromoterPlace = 'promotion' | 'calendar' | 'roster' | 'champions';

const PLACES: readonly { id: PromoterPlace; label: string; route: Route }[] = [
  { id: 'promotion', label: 'Dashboard', route: { name: 'promotion' } },
  { id: 'calendar', label: 'Events', route: { name: 'calendar' } },
  { id: 'roster', label: 'Roster & contracts', route: { name: 'promoterRoster' } },
  { id: 'champions', label: 'Championships', route: { name: 'champions' } },
];

export function PromoterSubNav({ current }: { current: PromoterPlace }) {
  const { navigate } = useRouter();

  return (
    <SubNav
      label="Promotion sections"
      items={PLACES.map((place) => ({
        label: place.label,
        href: toHash(place.route),
        current: place.id === current,
        onClick: () => navigate(place.route),
      }))}
    />
  );
}
