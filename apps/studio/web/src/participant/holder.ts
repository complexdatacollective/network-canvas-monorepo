import { Option, Schema } from 'effect';

import { HolderId } from '@codaco/studio-contract/schema/participant';

import { createUuid } from '../lib/createUuid.ts';

const HOLDER_KEY = 'studio.participant.holder';

const decodeHolder = Schema.decodeUnknownOption(HolderId);

const reloaded = (): boolean =>
  performance
    .getEntriesByType('navigation')
    .some(
      (entry) =>
        entry instanceof PerformanceNavigationTiming && entry.type === 'reload',
    );

// A duplicated tab copies sessionStorage too, so only a reload of this page
// may carry its holder over; any other arrival must take the session over.
const readHolder = (): string | undefined => {
  try {
    return reloaded()
      ? Option.getOrUndefined(decodeHolder(sessionStorage.getItem(HOLDER_KEY)))
      : undefined;
  } catch {
    return undefined;
  }
};

const writeHolder = (holder: string): void => {
  try {
    sessionStorage.setItem(HOLDER_KEY, holder);
  } catch {
    return;
  }
};

export const pageHolderId = (): string => {
  const holder = readHolder() ?? createUuid();
  writeHolder(holder);
  return holder;
};
