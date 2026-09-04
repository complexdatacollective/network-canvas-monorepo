import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppIntl } from '../messages.ts';

/** A message whose value is never supplied, so formatting it always throws. */
const BROKEN = {
  id: 'demo.broken',
  defaultMessage: 'Hello {name}',
  description: 'Test message formatted without its value.',
};

const PRESENT = {
  id: 'demo.hello',
  defaultMessage: 'Hello',
  description: 'Test message with no translation in the catalog.',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createAppIntl error reporting', () => {
  it('reports a formatting failure when the host passes no handler', () => {
    // Silence is the failure mode this guards: react-intl reports through the
    // handler it is configured with, so a filter that replaces the default
    // reporter and then drops everything makes broken messages invisible.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    createAppIntl({ locale: 'en' }).formatMessage(BROKEN);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('hands formatting failures to a host handler instead of the console', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const onError = vi.fn();
    createAppIntl({ locale: 'en', onError }).formatMessage(BROKEN);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('never reports a missing translation', () => {
    // Override catalogs are sparse by policy, so every message they do not
    // carry would report — the fallback to the English default message is the
    // design, not a fault.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const onError = vi.fn();
    const intl = createAppIntl({ locale: 'en-GB', messages: {}, onError });
    expect(intl.formatMessage(PRESENT)).toBe('Hello');
    expect(onError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('createAppIntl locale-aware fallback', () => {
  // A message with no catalog entry is the normal case, not the exception:
  // override catalogs like en-GB carry only the words that differ, so almost
  // everything an en-GB reader sees renders from the descriptor's own
  // defaultMessage. That fallback still has to format dates and numbers the
  // reader's way — otherwise a locale is only correct where somebody happened
  // to translate the words around the number.
  const DATED = {
    id: 'demo.dated',
    defaultMessage: 'Due {when, date, short}',
    description: 'A message whose formatting is locale-dependent.',
  };
  const COUNTED = {
    id: 'demo.counted',
    defaultMessage: '{total, number} items',
    description: 'A message whose grouping is locale-dependent.',
  };
  const when = new Date(Date.UTC(2020, 0, 2));

  it('formats an uncatalogued message in the active locale', () => {
    const intl = createAppIntl({ locale: 'en-GB', messages: {} });
    // Day first, as en-GB writes it — not 1/2/20.
    expect(intl.formatMessage(DATED, { when })).toBe('Due 02/01/20');
  });

  it('agrees with a message the catalog does carry', () => {
    // The bug this guards was visible as a disagreement between these two
    // paths: the same message formatted one way when translated and another
    // when it fell through.
    const uncatalogued = createAppIntl({ locale: 'en-GB', messages: {} });
    const catalogued = createAppIntl({
      locale: 'en-GB',
      messages: { [DATED.id]: DATED.defaultMessage },
    });
    expect(uncatalogued.formatMessage(DATED, { when })).toBe(
      catalogued.formatMessage(DATED, { when }),
    );
  });

  it('still renders the source locale correctly', () => {
    const intl = createAppIntl({ locale: 'en', messages: {} });
    expect(intl.formatMessage(DATED, { when })).toBe('Due 1/2/20');
    expect(intl.formatMessage(COUNTED, { total: 1234 })).toBe('1,234 items');
  });
});
