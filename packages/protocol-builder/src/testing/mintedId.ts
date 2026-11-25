import { expect } from 'vitest';

/**
 * Matches the id an editor gives an object it creates: a random (version 4)
 * UUID. A fixture's ids are made by name (`testId`, version 5), so this
 * matches none of them, and an expectation using it shows that the row was
 * given a new id rather than one copied from elsewhere.
 */
export const MINTED_ID: unknown = expect.stringMatching(
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);

/**
 * The start of every id a test's stand-in for `createOptionId` makes (see
 * `stubbedOptionId`): still a version 4 UUID, so `MINTED_ID` matches it too.
 */
const STUBBED_OPTION_ID_PREFIX = '00000000-0000-4000-8000-';

/** The `n`th id a test's stand-in for `createOptionId` makes. */
export const stubbedOptionId = (n: number): string =>
  `${STUBBED_OPTION_ID_PREFIX}${String(n).padStart(12, '0')}`;

/**
 * Matches an option id made by `createOptionId`, in a test that replaces it
 * with `stubbedOptionId`: an option row's id comes from the function made
 * for option ids, not from another that makes ids of the same shape.
 */
export const MINTED_OPTION_ID: unknown = expect.stringMatching(
  new RegExp(`^${STUBBED_OPTION_ID_PREFIX}\\d{12}$`),
);
