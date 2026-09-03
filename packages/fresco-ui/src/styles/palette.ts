// The named Fresco palette as CSS custom-property references, paired with a
// readable contrast color. Shared by components that color themselves from a
// palette name (Badge fills, Tag dots).
export type ThemeColorStyle = {
  color: string;
  contrast: string;
  label?: string;
};

export const paletteColorStyles = {
  'white': {
    color: 'var(--color-white)',
    contrast: 'var(--text)',
    label: 'var(--text)',
  },
  'black': {
    color: 'var(--color-black)',
    contrast: 'var(--color-white)',
  },
  'neon-coral': {
    color: 'var(--color-neon-coral)',
    contrast: 'var(--color-white)',
  },
  'neon-coral-dark': {
    color: 'var(--color-neon-coral-dark)',
    contrast: 'var(--color-white)',
  },
  'sea-green': {
    color: 'var(--color-sea-green)',
    contrast: 'var(--color-white)',
  },
  'sea-green-dark': {
    color: 'var(--color-sea-green-dark)',
    contrast: 'var(--color-white)',
  },
  'slate-blue': {
    color: 'var(--color-slate-blue)',
    contrast: 'var(--color-white)',
  },
  'slate-blue-dark': {
    color: 'var(--color-slate-blue-dark)',
    contrast: 'var(--color-white)',
  },
  'navy-taupe': {
    color: 'var(--color-navy-taupe)',
    contrast: 'var(--color-white)',
  },
  'navy-taupe-dark': {
    color: 'var(--color-navy-taupe-dark)',
    contrast: 'var(--color-white)',
  },
  'cyber-grape': {
    color: 'var(--color-cyber-grape)',
    contrast: 'var(--color-white)',
  },
  'cyber-grape-dark': {
    color: 'var(--color-cyber-grape-dark)',
    contrast: 'var(--color-white)',
  },
  'mustard': {
    color: 'var(--color-mustard)',
    contrast: 'var(--color-charcoal)',
    label: 'var(--color-charcoal)',
  },
  'mustard-dark': {
    color: 'var(--color-mustard-dark)',
    contrast: 'var(--color-charcoal)',
    label: 'var(--color-charcoal)',
  },
  'rich-black': {
    color: 'var(--color-rich-black)',
    contrast: 'var(--color-white)',
  },
  'rich-black-dark': {
    color: 'var(--color-rich-black-dark)',
    contrast: 'var(--color-white)',
  },
  'charcoal': {
    color: 'var(--color-charcoal)',
    contrast: 'var(--color-white)',
  },
  'charcoal-dark': {
    color: 'var(--color-charcoal-dark)',
    contrast: 'var(--color-white)',
  },
  'platinum': {
    color: 'var(--color-platinum)',
    contrast: 'var(--color-charcoal)',
    label: 'var(--color-charcoal)',
  },
  'platinum-dark': {
    color: 'var(--color-platinum-dark)',
    contrast: 'var(--color-charcoal)',
    label: 'var(--color-charcoal)',
  },
  'sea-serpent': {
    color: 'var(--color-sea-serpent)',
    contrast: 'var(--color-charcoal)',
    label: 'var(--color-charcoal)',
  },
  'sea-serpent-dark': {
    color: 'var(--color-sea-serpent-dark)',
    contrast: 'var(--color-charcoal)',
    label: 'var(--color-charcoal)',
  },
  'purple-pizazz': {
    color: 'var(--color-purple-pizazz)',
    contrast: 'var(--color-white)',
  },
  'purple-pizazz-dark': {
    color: 'var(--color-purple-pizazz-dark)',
    contrast: 'var(--color-white)',
  },
  'paradise-pink': {
    color: 'var(--color-paradise-pink)',
    contrast: 'var(--color-white)',
  },
  'paradise-pink-dark': {
    color: 'var(--color-paradise-pink-dark)',
    contrast: 'var(--color-white)',
  },
  'cerulean-blue': {
    color: 'var(--color-cerulean-blue)',
    contrast: 'var(--color-white)',
  },
  'cerulean-blue-dark': {
    color: 'var(--color-cerulean-blue-dark)',
    contrast: 'var(--color-white)',
  },
  'kiwi': {
    color: 'var(--color-kiwi)',
    contrast: 'var(--color-charcoal)',
    label: 'var(--color-charcoal)',
  },
  'kiwi-dark': {
    color: 'var(--color-kiwi-dark)',
    contrast: 'var(--color-charcoal)',
    label: 'var(--color-charcoal)',
  },
  'neon-carrot': {
    color: 'var(--color-neon-carrot)',
    contrast: 'var(--color-charcoal)',
    label: 'var(--color-charcoal)',
  },
  'neon-carrot-dark': {
    color: 'var(--color-neon-carrot-dark)',
    contrast: 'var(--color-charcoal)',
    label: 'var(--color-charcoal)',
  },
  'barbie-pink': {
    color: 'var(--color-barbie-pink)',
    contrast: 'var(--color-white)',
  },
  'barbie-pink-dark': {
    color: 'var(--color-barbie-pink-dark)',
    contrast: 'var(--color-white)',
  },
  'tomato': {
    color: 'var(--color-tomato)',
    contrast: 'var(--color-white)',
  },
  'tomato-dark': {
    color: 'var(--color-tomato-dark)',
    contrast: 'var(--color-white)',
  },
} satisfies Record<string, ThemeColorStyle>;

export type PaletteColor = keyof typeof paletteColorStyles;
