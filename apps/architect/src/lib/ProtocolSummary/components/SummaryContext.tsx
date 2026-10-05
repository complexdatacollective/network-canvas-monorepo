import { createContext } from 'react';

import type { CurrentProtocol, LocaleTag } from '@codaco/protocol-validation';

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
  /** The protocol language the summary shows its text in. */
  locale: LocaleTag;
};

const SummaryContext = createContext<SummaryContextType>({
  protocol: {} as CurrentProtocol,
  protocolName: 'Untitled Protocol',
  index: [],
  locale: '',
});

export default SummaryContext;
