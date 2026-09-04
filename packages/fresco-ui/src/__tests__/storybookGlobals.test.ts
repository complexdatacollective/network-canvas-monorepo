// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { storybookI18n } from '@codaco/storybook-config/i18n';

/**
 * The toolbar's remembered selections are a convenience for a person clicking
 * around Storybook, and must not survive into an automated run.
 *
 * Two stories in this package pin a global — `DropdownMenu` and `Table` both
 * set `appDirection: 'rtl'`. While the controls persisted under automation,
 * rendering either of them wrote `rtl` to storage and every story that ran
 * afterwards opened mirrored. Nothing declared it and nothing failed at the
 * point of the mistake: it surfaced three files later as `LikertScale`'s
 * arrow keys moving the wrong way and a click at the track's right edge
 * setting the lowest value, in both browsers.
 */

const DIRECTION_KEY = 'storybook-app-direction-preference';
const LOCALE_KEY = 'storybook-app-locale-preference';

const withWebdriver = (value: boolean) => {
  Object.defineProperty(window.navigator, 'webdriver', {
    value,
    configurable: true,
  });
};

const build = () => storybookI18n({ locales: ecosystemLocales, catalogs: {} });

afterEach(() => {
  window.localStorage.clear();
  withWebdriver(false);
});

describe('the Storybook language and direction controls', () => {
  it('ignore a stored selection under automation', () => {
    window.localStorage.setItem(DIRECTION_KEY, 'rtl');
    window.localStorage.setItem(LOCALE_KEY, 'en-GB');
    withWebdriver(true);

    expect(build().initialGlobals).toEqual({
      appDirection: 'auto',
      appLocale: 'en',
    });
  });

  it('honour a stored selection for a person', () => {
    // The convenience itself still has to work, or the guard is just a
    // deletion of the feature.
    window.localStorage.setItem(DIRECTION_KEY, 'rtl');
    window.localStorage.setItem(LOCALE_KEY, 'en-GB');
    withWebdriver(false);

    expect(build().initialGlobals).toEqual({
      appDirection: 'rtl',
      appLocale: 'en-GB',
    });
  });
});
