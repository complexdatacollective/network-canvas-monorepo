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
