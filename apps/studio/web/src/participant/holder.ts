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

// A browser that denies sessionStorage still keeps `window.name` across a
// reload of the same tab. It is used only when empty or already this page's.
const NAME_PREFIX = `${HOLDER_KEY}:`;

const fromName = (): string | undefined =>
  window.name.startsWith(NAME_PREFIX)
    ? window.name.slice(NAME_PREFIX.length)
    : undefined;

const fromSessionStorage = (): string | null => {
  try {
    return sessionStorage.getItem(HOLDER_KEY);
  } catch {
    return null;
  }
};

// A duplicated tab copies sessionStorage and `window.name` too, so only a
// reload of this page may carry its holder over; any other arrival must take
// the session over.
const readHolder = (): string | undefined => {
  if (!reloaded()) return undefined;
  return Option.getOrUndefined(
    decodeHolder(fromSessionStorage() ?? fromName()),
  );
};

const writeHolder = (holder: string): void => {
  if (window.name === '' || fromName() !== undefined) {
    window.name = `${NAME_PREFIX}${holder}`;
  }
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
