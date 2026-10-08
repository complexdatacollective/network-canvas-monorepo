import type { ComponentType } from 'react';

import { FrescoFundedIllustration } from './FrescoFundedIllustration';
import { FrescoOneIllustration } from './FrescoOneIllustration';
import { FundingIllustration } from './FundingIllustration';
import { LanguageIllustration } from './LanguageIllustration';
import { NextGenerationIllustration } from './NextGenerationIllustration';
import { StableReleaseIllustration } from './StableReleaseIllustration';
import { StudioFundedIllustration } from './StudioFundedIllustration';

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
    'fresco-1': {
      Illustration: FrescoOneIllustration,
      bandClassName: 'bg-sea-serpent/12',
      dotClassName: 'bg-sea-serpent',
    },
    'studio-funded': {
      Illustration: StudioFundedIllustration,
      bandClassName: 'bg-purple-pizazz/12',
      dotClassName: 'bg-purple-pizazz',
    },
    'fresco-funded': {
      Illustration: FrescoFundedIllustration,
      bandClassName: 'bg-slate-blue/12',
      dotClassName: 'bg-slate-blue',
    },
    'stable-release': {
      Illustration: StableReleaseIllustration,
      bandClassName: 'bg-cerulean-blue/12',
      dotClassName: 'bg-cerulean-blue',
    },
    'nih-funds-network-canvas': {
      Illustration: FundingIllustration,
      bandClassName: 'bg-mustard/12',
      dotClassName: 'bg-mustard',
    },
  };
