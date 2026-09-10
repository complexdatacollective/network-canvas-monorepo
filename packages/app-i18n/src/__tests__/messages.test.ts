import { execFileSync } from 'node:child_process';

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
  // Named zone, not a hopeful instant: without one each formatter uses the
  // process's zone, so this suite passed in UTC and failed anywhere west of
  // it — `Due 01/01/20` in America/Los_Angeles, for the same correct en-GB
  // formatting.
  const when = new Date(Date.UTC(2020, 0, 2));

  it('formats an uncatalogued message in the active locale', () => {
    const intl = createAppIntl({
      locale: 'en-GB',
      messages: {},
      timeZone: 'UTC',
    });
    // Day first, as en-GB writes it — not 1/2/20.
    expect(intl.formatMessage(DATED, { when })).toBe('Due 02/01/20');
  });

  it('agrees with a message the catalog does carry', () => {
    // The bug this guards was visible as a disagreement between these two
    // paths: the same message formatted one way when translated and another
    // when it fell through.
    const uncatalogued = createAppIntl({
      locale: 'en-GB',
      messages: {},
      timeZone: 'UTC',
    });
    const catalogued = createAppIntl({
      locale: 'en-GB',
      messages: { [DATED.id]: DATED.defaultMessage },
      timeZone: 'UTC',
    });
    expect(uncatalogued.formatMessage(DATED, { when })).toBe(
      catalogued.formatMessage(DATED, { when }),
    );
  });

  it('still renders the source locale correctly', () => {
    const intl = createAppIntl({ locale: 'en', messages: {}, timeZone: 'UTC' });
    expect(intl.formatMessage(DATED, { when })).toBe('Due 1/2/20');
    expect(intl.formatMessage(COUNTED, { total: 1234 })).toBe('1,234 items');
  });
});

describe('createAppIntl time zone', () => {
  const AT_MIDNIGHT = {
    id: 'demo.midnight',
    defaultMessage: 'Due {when, date, short}',
    description:
      'A timestamp that falls on different dates in different zones.',
  };
  const when = new Date(Date.UTC(2020, 0, 2));

  it('renders one date for one instant, wherever the process is', () => {
    // The reason this option exists: a Next host formats on the server and
    // again after hydration, in two processes that need not share a zone. An
    // instant at midnight UTC is 1 January in Los Angeles and 2 January in
    // Tokyo, so without a named zone the two renders disagree and React
    // reports a hydration mismatch on a date nobody typed.
    const inTokyo = createAppIntl({
      locale: 'en',
      timeZone: 'Asia/Tokyo',
    }).formatMessage(AT_MIDNIGHT, { when });
    const inLosAngeles = createAppIntl({
      locale: 'en',
      timeZone: 'America/Los_Angeles',
    }).formatMessage(AT_MIDNIGHT, { when });

    expect(inTokyo).toBe('Due 1/2/20');
    expect(inLosAngeles).toBe('Due 1/1/20');
  });
});

it('formats through the universal facade under React server conditions', () => {
  const moduleUrl = new URL('../messages.ts', import.meta.url).href;
  const script = `
    import { createAppIntl, defineMessages } from ${JSON.stringify(moduleUrl)};
    const messages = defineMessages({ count: { id: 'server.count', defaultMessage: '{count, plural, one {# result} other {# results}}', description: 'Server smoke test.' } });
    const intl = createAppIntl({ locale: 'es', messages: { 'server.count': '{count, plural, one {# resultado} other {# resultados}}' } });
    process.stdout.write(intl.formatMessage(messages.count, { count: 2 }));
  `;
  expect(
    execFileSync(
      process.execPath,
      ['--conditions=react-server', '--input-type=module', '-e', script],
      { encoding: 'utf8' },
    ),
  ).toBe('2 resultados');
});
