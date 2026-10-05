import type { ComponentType } from 'react';

import { LanguageIllustration } from './LanguageIllustration';
import { NextGenerationIllustration } from './NextGenerationIllustration';

type UpdateIllustration = {
  Illustration: ComponentType;
  bandClassName: string;
  dotClassName: string;
};

const coral = {
  bandClassName: 'bg-neon-coral/12',
  dotClassName: 'bg-neon-coral',
};

const seaGreen = {
  bandClassName: 'bg-sea-green/15',
  dotClassName: 'bg-sea-green',
};

export const updateIllustrations: Partial<Record<string, UpdateIllustration>> =
  {
    'language-localization': { Illustration: LanguageIllustration, ...coral },
    'summer-2026': { Illustration: NextGenerationIllustration, ...seaGreen },
  };
