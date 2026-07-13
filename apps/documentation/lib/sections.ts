import type { Section } from '~/app/types';

export type SectionColor =
  | 'slate-blue'
  | 'sea-green'
  | 'neon-coral'
  | 'cerulean-blue';

export type SectionConfig = {
  key: Section;
  color: SectionColor;
  // Image icon sources; when absent the section renders the ChartNetwork glyph.
  images?: string[];
};

// Single source of truth for the workflow sections, shared by the collapsed
// section nav, the full homepage cards, and the search-result section badges.
// Labels and descriptions live in the `SectionSwitcher` translation namespace,
// keyed by `key`.
export const SECTIONS: SectionConfig[] = [
  { key: 'get-started', color: 'slate-blue', images: ['/images/mark.svg'] },
  {
    key: 'design-protocols',
    color: 'sea-green',
    images: ['/images/architect-icon.png'],
  },
  {
    key: 'collect-data',
    color: 'neon-coral',
    images: ['/images/interviewer.png', '/images/fresco.png'],
  },
  { key: 'analyze-data', color: 'cerulean-blue' },
];

export const sectionColorClasses: Record<SectionColor, string> = {
  'slate-blue': 'bg-slate-blue',
  // sea-green (shared OKLCH L≈0.7) is far lighter than the other section
  // colours (L≈0.55), so white card text fell to ~2.3:1. Pin its lightness into
  // the same range as the others (keeping hue/chroma) so the label reads.
  'sea-green': 'bg-[oklch(from_oklch(var(--sea-green))_0.54_c_h)]',
  'neon-coral': 'bg-neon-coral',
  'cerulean-blue': 'bg-cerulean-blue',
};

const colorBySlug = new Map(SECTIONS.map(({ key, color }) => [key, color]));

// Maps a section slug (the first path segment of a docs URL) to its homepage
// background-colour class, or undefined when the slug is not a known section.
export const getSectionColorClass = (slug: string): string | undefined => {
  const color = colorBySlug.get(slug as Section);
  return color ? sectionColorClasses[color] : undefined;
};
