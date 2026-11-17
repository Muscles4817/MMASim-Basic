/**
 * The icon vocabulary.
 *
 * Drawn rather than emoji. Emoji were chosen because they needed no asset pipeline, and they cost
 * more than that saved: they render as a different artist's drawing on every platform, they carry
 * their own colours into a palette that did not choose them, and a row of 🏆🔥🧊 is the single
 * most recognisable sign of a UI nobody designed. These are one stroke weight, one grid and
 * `currentColor`, so an icon takes the colour of the text it sits in — red in a red chip, ink on
 * the poster, white on a broadcast plate.
 *
 * Every icon is decorative. Each is always paired with a word that carries the meaning, which is
 * why `Icon` is `aria-hidden` and has no label prop: an icon that needed one would be an icon
 * standing in for a word, and that is not a thing this game does.
 *
 * Paths are on a 24×24 grid with a 2px stroke. A circle is written as a pair of arcs so every
 * glyph is a single `d` string and the table stays data.
 */

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

interface Glyph {
  d: string;
  /** Solid shapes — the trend arrows and the star — read better filled at text size. */
  filled?: boolean;
}

const GLYPHS = {
  // --- Results and standing -------------------------------------------------------------
  champion: { d: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4' },
  knockout: {
    d: 'M12 3l2.2 5.3 5.6-1.8-2.6 5.2 4.3 3.8-5.7.5.2 5.8L12 18.2 8 21.8l.2-5.8-5.7-.5 4.3-3.8L4.2 6.5l5.6 1.8z',
  },
  submission: { d: `M8 11V7a4 4 0 0 1 8 0v4M5 11h14v10H5z` },
  decision: { d: 'M9 3h6v3H9zM6 5h12v16H6zM9 12h6M9 16h4' },
  draw: { d: 'M5 9h14M5 15h14' },
  streak: {
    d: 'M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5-5 8 0 4 3 7 7 7z',
  },
  skid: { d: 'M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9' },
  rising: { d: 'M12 6l7 12H5z', filled: true },
  falling: { d: 'M12 18L5 6h14z', filled: true },
  level: { d: 'M7 7h10v10H7z', filled: true },
  star: {
    d: 'M12 3l2.8 5.9 6.2.7-4.6 4.2 1.3 6.2L12 17l-5.7 3 1.3-6.2L3 9.6l6.2-.7z',
    filled: true,
  },

  // --- The body ---------------------------------------------------------------------------
  injury: { d: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z' },
  trauma: { d: 'M12 3a8 8 0 0 0-8 8c0 3 2 5 4 6v4h8v-4c2-1 4-3 4-6a8 8 0 0 0-8-8zM12 8v4M10 10h4' },

  // --- Work -------------------------------------------------------------------------------
  camp: { d: 'M7 11V6a3 3 0 0 1 3-3h4a4 4 0 0 1 4 4v6a5 5 0 0 1-5 5h-4a2 2 0 0 1-2-2zM7 12H5.5a2 2 0 0 0 0 4H7M10 21h5' },
  training: { d: 'M3 20h18M5 16l5-5 4 3 6-7M15 7h5v5' },

  // --- Messages ---------------------------------------------------------------------------
  warning: { d: 'M12 3l10 18H2zM12 10v5M12 18v.01' },
  success: { d: 'M5 12.5l4.5 4.5L19 7' },
  info: { d: `${circle(12, 12, 9)}M12 11v6M12 7.5v.01` },
  locked: { d: `M8 11V7a4 4 0 0 1 8 0v4M5 11h14v10H5z` },
  time: { d: `${circle(12, 12, 9)}M12 7v5l3 2` },
  cross: { d: 'M6 6l12 12M18 6L6 18' },

  // --- The deal ---------------------------------------------------------------------------
  money: { d: 'M17 5.5A4.5 4.5 0 0 0 9 8v12M6 13h8M6 20h12' },
  route: { d: 'M8 3v18M16 3v18M8 7h8M8 12h8M8 17h8' },
  balance: { d: 'M12 4v16M7 20h10M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z' },

  // --- News -------------------------------------------------------------------------------
  bolt: { d: 'M13 2L4 14h7l-1 8 9-12h-7z' },
  pen: { d: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3' },
  cut: { d: `${circle(6, 6, 3)}${circle(6, 18, 3)}M8.5 8.5L20 20M8.5 15.5L20 4` },
  tag: { d: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01' },
  speech: { d: 'M4 5h16v11H9l-5 4z' },
  exit: { d: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9' },

  // --- Navigation -------------------------------------------------------------------------
  person: { d: `${circle(12, 8, 4)}M4 21c1-4 4-6 8-6s7 2 8 6` },
  calendar: { d: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4' },
  inbox: { d: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5' },
  roster: {
    d: `${circle(9, 8, 3.5)}M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.6 3 5.2`,
  },
  settings: {
    d: `${circle(12, 12, 3)}M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1`,
  },
  promotion: { d: 'M3 10v4h4l9 5V5L7 10zM19 9a3 3 0 0 1 0 6' },
  rankings: { d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

/**
 * An icon that is always decorative — the adjacent text carries the meaning.
 *
 * Sized in `em` so it scales with the text beside it, the way the emoji it replaces did.
 */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  const glyph: Glyph = GLYPHS[name];
  return (
    <svg
      className={['icon', className].filter(Boolean).join(' ')}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      fill={glyph.filled ? 'currentColor' : 'none'}
      stroke={glyph.filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={glyph.d} />
    </svg>
  );
}
