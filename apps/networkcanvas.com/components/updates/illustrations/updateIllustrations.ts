import type { ComponentType } from 'react';

import { LanguageIllustration } from './LanguageIllustration';
import { NextGenerationIllustration } from './NextGenerationIllustration';

type UpdateIllustration = {
  Illustration: ComponentType;
  bandClassName: string;
};

const coral = {
  bandClassName: 'bg-neon-coral/12',
};

const seaGreen = {
  bandClassName: 'bg-sea-green/15',
};

export const updateIllustrations: Partial<Record<string, UpdateIllustration>> =
  {
    'language-localization': { Illustration: LanguageIllustration, ...coral },
    'summer-2026': { Illustration: NextGenerationIllustration, ...seaGreen },
  };
