import type * as MotionReact from 'motion/react';
import { NextIntlClientProvider } from 'next-intl';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { siteAppCatalogs, siteAppLocales } from '~/lib/i18n/appLocales';
import { loadLocaleMessages } from '~/lib/i18n/messages';
import type { NewsItem } from '~/lib/siteContent';

const { mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseReducedMotion: vi.fn<() => boolean | null>(),
}));

// Partial mock on purpose. NewsTicker.test.tsx replaces the whole module with a
// `useReducedMotion` that only ever answers a boolean — which models a client
// and cannot represent the server, where motion answers `null`. That is the gap
// this file closes, so the real module has to stay underneath.
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>();
  return { ...actual, useReducedMotion: mockUseReducedMotion };
});

import { NewsTicker } from '../NewsTicker';

const newsItems: NewsItem[] = [
  { id: 'a', title: 'First fixture item', href: 'https://example.com/a' },
  { id: 'b', title: 'Second fixture item', href: 'https://example.com/b' },
];

/**
 * `useReducedMotion()` answers `null` on the server — motion learns the
 * preference from `matchMedia`, which the server cannot read — and `true` or
 * `false` on the client. The desktop ticker chooses between two different
 * element trees (one marquee with every item twice, or a single item), so
 * reading the preference during the first client render made a reduced-motion
 * visitor hydrate markup built from the other branch. React throws that as
 * "Hydration failed because the server rendered HTML didn't match the client"
 * — minified error #418 — and discards the tree.
 *
 * Asserting on the server markup states the rule directly: nothing the server
 * writes may depend on a preference the server cannot know.
 */
const serverMarkupFor = (preference: boolean | null) => {
  mockUseReducedMotion.mockReturnValue(preference);
  return renderToString(
    <NextIntlClientProvider
      locale="en-US"
      messages={loadLocaleMessages('en-US')}
      timeZone="UTC"
    >
      <AppI18nProvider
        locale="en-US"
        locales={siteAppLocales}
        messages={siteAppCatalogs['en-US']}
        manageDocument={false}
        timeZone="UTC"
      >
        <NewsTicker newsItems={newsItems} />
      </AppI18nProvider>
    </NextIntlClientProvider>,
  );
};

describe('NewsTicker server markup', () => {
  it('does not depend on the reduced-motion preference', () => {
    const server = serverMarkupFor(null);

    expect(serverMarkupFor(false)).toBe(server);
    expect(serverMarkupFor(true)).toBe(server);
  });

  it('serves the marquee branch, which stops itself without JavaScript', () => {
    // The pre-hydration frame a reduced-motion visitor sees is already
    // motionless: the marquee carries `motion-reduce:animate-none`, so the
    // preference is honoured by CSS before the gate below ever flips.
    const server = serverMarkupFor(null);
    expect(server).toContain('animate-marquee');
    expect(server).toContain('motion-reduce:animate-none');
  });
});
