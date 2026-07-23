export type AccentColor =
  | 'cerulean-blue'
  | 'kiwi'
  | 'mustard'
  | 'neon-carrot'
  | 'neon-coral'
  | 'paradise-pink'
  | 'sea-green'
  | 'sea-serpent'
  | 'slate-blue';

export const accentBackgroundClasses: Record<AccentColor, string> = {
  'cerulean-blue': 'bg-cerulean-blue',
  'kiwi': 'bg-kiwi',
  'mustard': 'bg-mustard',
  'neon-carrot': 'bg-neon-carrot',
  'neon-coral': 'bg-neon-coral',
  'paradise-pink': 'bg-paradise-pink',
  'sea-green': 'bg-sea-green',
  'sea-serpent': 'bg-sea-serpent',
  'slate-blue': 'bg-slate-blue',
};

export const accentSoftBackgroundClasses: Record<AccentColor, string> = {
  'cerulean-blue': 'bg-cerulean-blue/15',
  'kiwi': 'bg-kiwi/15',
  'mustard': 'bg-mustard/15',
  'neon-carrot': 'bg-neon-carrot/15',
  'neon-coral': 'bg-neon-coral/15',
  'paradise-pink': 'bg-paradise-pink/15',
  'sea-green': 'bg-sea-green/15',
  'sea-serpent': 'bg-sea-serpent/15',
  'slate-blue': 'bg-slate-blue/15',
};

export const accentTextClasses: Record<AccentColor, string> = {
  'cerulean-blue': 'text-cerulean-blue',
  'kiwi': 'text-kiwi',
  'mustard': 'text-mustard',
  'neon-carrot': 'text-neon-carrot',
  'neon-coral': 'text-neon-coral',
  'paradise-pink': 'text-paradise-pink',
  'sea-green': 'text-sea-green',
  'sea-serpent': 'text-sea-serpent',
  'slate-blue': 'text-slate-blue',
};
