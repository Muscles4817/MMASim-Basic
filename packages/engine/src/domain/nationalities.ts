/**
 * Countries, for display and for choosing.
 *
 * Nationality was a bare string picked from a list of fifteen, which made it a label rather than
 * a fact about a fighter: it never agreed with their name, it could not be searched, and it could
 * not be shown as anything but text. This gives it a code, which is what a flag and an
 * autocomplete both need.
 *
 * The sporting nations are here rather than the political ones where the two differ - England,
 * Scotland, Wales and Northern Ireland compete separately and a fighter from any of them would
 * not describe themselves as anything else. Their codes are the subdivision form, which is
 * exactly what the flag emoji for those three requires.
 */

export interface Nationality {
  name: string;
  /** ISO 3166-1 alpha-2, or an ISO 3166-2 subdivision for the home nations. */
  code: string;
}

/** Every nationality the game offers, alphabetical, for the creation screen's list. */
export const NATIONALITIES: readonly Nationality[] = [
  { name: 'Afghanistan', code: 'AF' },
  { name: 'Albania', code: 'AL' },
  { name: 'Algeria', code: 'DZ' },
  { name: 'Angola', code: 'AO' },
  { name: 'Argentina', code: 'AR' },
  { name: 'Armenia', code: 'AM' },
  { name: 'Australia', code: 'AU' },
  { name: 'Austria', code: 'AT' },
  { name: 'Azerbaijan', code: 'AZ' },
  { name: 'Bahrain', code: 'BH' },
  { name: 'Bangladesh', code: 'BD' },
  { name: 'Belarus', code: 'BY' },
  { name: 'Belgium', code: 'BE' },
  { name: 'Bolivia', code: 'BO' },
  { name: 'Bosnia', code: 'BA' },
  { name: 'Brazil', code: 'BR' },
  { name: 'Bulgaria', code: 'BG' },
  { name: 'Cameroon', code: 'CM' },
  { name: 'Canada', code: 'CA' },
  { name: 'Chile', code: 'CL' },
  { name: 'China', code: 'CN' },
  { name: 'Colombia', code: 'CO' },
  { name: 'Congo', code: 'CD' },
  { name: 'Costa Rica', code: 'CR' },
  { name: 'Croatia', code: 'HR' },
  { name: 'Cuba', code: 'CU' },
  { name: 'Cyprus', code: 'CY' },
  { name: 'Czechia', code: 'CZ' },
  { name: 'Denmark', code: 'DK' },
  { name: 'Dominican Republic', code: 'DO' },
  { name: 'Ecuador', code: 'EC' },
  { name: 'Egypt', code: 'EG' },
  { name: 'El Salvador', code: 'SV' },
  { name: 'England', code: 'GB-ENG' },
  { name: 'Estonia', code: 'EE' },
  { name: 'Ethiopia', code: 'ET' },
  { name: 'Finland', code: 'FI' },
  { name: 'France', code: 'FR' },
  { name: 'Georgia', code: 'GE' },
  { name: 'Germany', code: 'DE' },
  { name: 'Ghana', code: 'GH' },
  { name: 'Greece', code: 'GR' },
  { name: 'Guatemala', code: 'GT' },
  { name: 'Hungary', code: 'HU' },
  { name: 'Iceland', code: 'IS' },
  { name: 'India', code: 'IN' },
  { name: 'Indonesia', code: 'ID' },
  { name: 'Iran', code: 'IR' },
  { name: 'Iraq', code: 'IQ' },
  { name: 'Ireland', code: 'IE' },
  { name: 'Israel', code: 'IL' },
  { name: 'Italy', code: 'IT' },
  { name: 'Jamaica', code: 'JM' },
  { name: 'Japan', code: 'JP' },
  { name: 'Jordan', code: 'JO' },
  { name: 'Kazakhstan', code: 'KZ' },
  { name: 'Kenya', code: 'KE' },
  { name: 'Kuwait', code: 'KW' },
  { name: 'Kyrgyzstan', code: 'KG' },
  { name: 'Latvia', code: 'LV' },
  { name: 'Lebanon', code: 'LB' },
  { name: 'Lithuania', code: 'LT' },
  { name: 'Malaysia', code: 'MY' },
  { name: 'Mexico', code: 'MX' },
  { name: 'Moldova', code: 'MD' },
  { name: 'Mongolia', code: 'MN' },
  { name: 'Montenegro', code: 'ME' },
  { name: 'Morocco', code: 'MA' },
  { name: 'Netherlands', code: 'NL' },
  { name: 'New Zealand', code: 'NZ' },
  { name: 'Nicaragua', code: 'NI' },
  { name: 'Nigeria', code: 'NG' },
  { name: 'North Macedonia', code: 'MK' },
  { name: 'Northern Ireland', code: 'GB-NIR' },
  { name: 'Norway', code: 'NO' },
  { name: 'Pakistan', code: 'PK' },
  { name: 'Panama', code: 'PA' },
  { name: 'Paraguay', code: 'PY' },
  { name: 'Peru', code: 'PE' },
  { name: 'Philippines', code: 'PH' },
  { name: 'Poland', code: 'PL' },
  { name: 'Portugal', code: 'PT' },
  { name: 'Puerto Rico', code: 'PR' },
  { name: 'Qatar', code: 'QA' },
  { name: 'Romania', code: 'RO' },
  { name: 'Russia', code: 'RU' },
  { name: 'Saudi Arabia', code: 'SA' },
  { name: 'Scotland', code: 'GB-SCT' },
  { name: 'Senegal', code: 'SN' },
  { name: 'Serbia', code: 'RS' },
  { name: 'Singapore', code: 'SG' },
  { name: 'Slovakia', code: 'SK' },
  { name: 'Slovenia', code: 'SI' },
  { name: 'Somalia', code: 'SO' },
  { name: 'South Africa', code: 'ZA' },
  { name: 'South Korea', code: 'KR' },
  { name: 'Spain', code: 'ES' },
  { name: 'Sri Lanka', code: 'LK' },
  { name: 'Sudan', code: 'SD' },
  { name: 'Sweden', code: 'SE' },
  { name: 'Switzerland', code: 'CH' },
  { name: 'Syria', code: 'SY' },
  { name: 'Taiwan', code: 'TW' },
  { name: 'Tajikistan', code: 'TJ' },
  { name: 'Tanzania', code: 'TZ' },
  { name: 'Thailand', code: 'TH' },
  { name: 'Trinidad and Tobago', code: 'TT' },
  { name: 'Tunisia', code: 'TN' },
  { name: 'Turkey', code: 'TR' },
  { name: 'Turkmenistan', code: 'TM' },
  { name: 'Uganda', code: 'UG' },
  { name: 'Ukraine', code: 'UA' },
  { name: 'United Arab Emirates', code: 'AE' },
  { name: 'Uruguay', code: 'UY' },
  { name: 'USA', code: 'US' },
  { name: 'Uzbekistan', code: 'UZ' },
  { name: 'Venezuela', code: 'VE' },
  { name: 'Vietnam', code: 'VN' },
  { name: 'Wales', code: 'GB-WLS' },
  { name: 'Zimbabwe', code: 'ZW' }
];

const BY_NAME: ReadonlyMap<string, Nationality> = new Map(
  NATIONALITIES.map((n) => [n.name.toLowerCase(), n]),
);

export const findNationality = (name: string): Nationality | undefined =>
  BY_NAME.get(name.trim().toLowerCase());

/**
 * The flag, as emoji.
 *
 * Regional indicator symbols rather than an image set: no assets to ship, no network request,
 * and it inherits the surrounding font size so it lines up with text without any layout work.
 *
 * The home nations use the tag-sequence form, which is the only way to express England, Scotland
 * and Wales - a black flag, the subdivision spelled out in tag characters, and a cancel tag.
 * Platform support for those three is good but not universal, so `flagOf` returns an empty
 * string rather than a broken glyph for anything it does not recognise, and every caller shows
 * the country name beside it. A missing flag therefore costs nothing.
 */
const OFFSET = 0x1f1e6 - 0x41; // Regional Indicator A, minus 'A'.
const BLACK_FLAG = 0x1f3f4;
const CANCEL_TAG = 0xe007f;
const TAG_BASE = 0xe0000;

export function flagOf(nationality: string): string {
  const found = findNationality(nationality);
  if (!found) return '';

  const { code } = found;

  if (code.startsWith('GB-')) {
    const subdivision = ('gb' + code.slice(3)).toLowerCase();
    const tags = [...subdivision]
      .map((c) => String.fromCodePoint(TAG_BASE + c.charCodeAt(0)))
      .join('');
    return String.fromCodePoint(BLACK_FLAG) + tags + String.fromCodePoint(CANCEL_TAG);
  }

  return [...code].map((c) => String.fromCodePoint(c.charCodeAt(0) + OFFSET)).join('');
}
