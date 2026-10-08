// The named Fresco palette as CSS custom-property references, paired with a
// readable contrast color. Shared by components that color themselves from a
// palette name (Badge fills, Tag dots).
export type ThemeColorStyle = {
  color: string;
  contrast: string;
};

export const paletteColorStyles = {
  'white': {
    color: 'var(--color-white)',
    contrast: 'var(--text)',
  },
  'black': {
    color: 'var(--color-black)',
    contrast: 'var(--color-white)',
  },
  'neon-coral': {
    color: 'var(--color-neon-coral)',
    contrast: 'var(--color-neon-coral-contrast)',
  },
  'neon-coral-dark': {
    color: 'var(--color-neon-coral-dark)',
    contrast: 'var(--color-neon-coral-contrast)',
  },
  'sea-green': {
    color: 'var(--color-sea-green)',
    contrast: 'var(--color-sea-green-contrast)',
  },
  'sea-green-dark': {
    color: 'var(--color-sea-green-dark)',
    contrast: 'var(--color-sea-green-contrast)',
  },
  'slate-blue': {
    color: 'var(--color-slate-blue)',
    contrast: 'var(--color-slate-blue-contrast)',
  },
  'slate-blue-dark': {
    color: 'var(--color-slate-blue-dark)',
    contrast: 'var(--color-slate-blue-contrast)',
  },
  'navy-taupe': {
    color: 'var(--color-navy-taupe)',
    contrast: 'var(--color-navy-taupe-contrast)',
  },
  'navy-taupe-dark': {
    color: 'var(--color-navy-taupe-dark)',
    contrast: 'var(--color-navy-taupe-contrast)',
  },
  'cyber-grape': {
    color: 'var(--color-cyber-grape)',
    contrast: 'var(--color-cyber-grape-contrast)',
  },
  'cyber-grape-dark': {
    color: 'var(--color-cyber-grape-dark)',
    contrast: 'var(--color-cyber-grape-contrast)',
  },
  'mustard': {
    color: 'var(--color-mustard)',
    contrast: 'var(--color-mustard-contrast)',
  },
  'mustard-dark': {
    color: 'var(--color-mustard-dark)',
    contrast: 'var(--color-mustard-contrast)',
  },
  'rich-black': {
    color: 'var(--color-rich-black)',
    contrast: 'var(--color-rich-black-contrast)',
  },
  'rich-black-dark': {
    color: 'var(--color-rich-black-dark)',
    contrast: 'var(--color-rich-black-contrast)',
  },
  'charcoal': {
    color: 'var(--color-charcoal)',
    contrast: 'var(--color-charcoal-contrast)',
  },
  'charcoal-dark': {
    color: 'var(--color-charcoal-dark)',
    contrast: 'var(--color-charcoal-contrast)',
  },
  'platinum': {
    color: 'var(--color-platinum)',
    contrast: 'var(--color-platinum-contrast)',
  },
  'platinum-dark': {
    color: 'var(--color-platinum-dark)',
    contrast: 'var(--color-platinum-contrast)',
  },
  'sea-serpent': {
    color: 'var(--color-sea-serpent)',
    contrast: 'var(--color-sea-serpent-contrast)',
  },
  'sea-serpent-dark': {
    color: 'var(--color-sea-serpent-dark)',
    contrast: 'var(--color-sea-serpent-contrast)',
  },
  'purple-pizazz': {
    color: 'var(--color-purple-pizazz)',
    contrast: 'var(--color-purple-pizazz-contrast)',
  },
  'purple-pizazz-dark': {
    color: 'var(--color-purple-pizazz-dark)',
    contrast: 'var(--color-purple-pizazz-contrast)',
  },
  'paradise-pink': {
    color: 'var(--color-paradise-pink)',
    contrast: 'var(--color-paradise-pink-contrast)',
  },
  'paradise-pink-dark': {
    color: 'var(--color-paradise-pink-dark)',
    contrast: 'var(--color-paradise-pink-contrast)',
  },
  'cerulean-blue': {
    color: 'var(--color-cerulean-blue)',
    contrast: 'var(--color-cerulean-blue-contrast)',
  },
  'cerulean-blue-dark': {
    color: 'var(--color-cerulean-blue-dark)',
    contrast: 'var(--color-cerulean-blue-contrast)',
  },
  'kiwi': {
    color: 'var(--color-kiwi)',
    contrast: 'var(--color-kiwi-contrast)',
  },
  'kiwi-dark': {
    color: 'var(--color-kiwi-dark)',
    contrast: 'var(--color-kiwi-contrast)',
  },
  'neon-carrot': {
    color: 'var(--color-neon-carrot)',
    contrast: 'var(--color-neon-carrot-contrast)',
  },
  'neon-carrot-dark': {
    color: 'var(--color-neon-carrot-dark)',
    contrast: 'var(--color-neon-carrot-contrast)',
  },
  'barbie-pink': {
    color: 'var(--color-barbie-pink)',
    contrast: 'var(--color-barbie-pink-contrast)',
  },
  'barbie-pink-dark': {
    color: 'var(--color-barbie-pink-dark)',
    contrast: 'var(--color-barbie-pink-contrast)',
  },
  'tomato': {
    color: 'var(--color-tomato)',
    contrast: 'var(--color-tomato-contrast)',
  },
  'tomato-dark': {
    color: 'var(--color-tomato-dark)',
    contrast: 'var(--color-tomato-contrast)',
  },
} satisfies Record<string, ThemeColorStyle>;

export type PaletteColor = keyof typeof paletteColorStyles;
