import { createContext } from 'react';

import type { CurrentProtocol } from '@codaco/protocol-validation';

export type IndexEntry = {
  id: string;
  name: string;
  type: string;
  component?: string;
  stages: string[];
  [key: string]: unknown;
};

type SummaryContextType = {
  protocol: CurrentProtocol;
  protocolName: string;
  index: IndexEntry[];
};

const SummaryContext = createContext<SummaryContextType>({
  protocol: {
    name: 'Untitled Protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'und', locales: ['und'] },
    assetManifest: {},
    codebook: {},
    stages: [],
  },
  protocolName: 'Untitled Protocol',
  index: [],
});

export default SummaryContext;
