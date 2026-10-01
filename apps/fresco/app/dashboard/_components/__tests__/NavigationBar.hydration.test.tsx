import type * as MotionReact from 'motion/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { frescoLocales } from '~/i18n/locales';
import { frescoCatalogs } from '~/src/locales/catalogs';

const { mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseReducedMotion: vi.fn<() => boolean | null>(),
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>();
  return { ...actual, useReducedMotion: mockUseReducedMotion };
});

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

// The subject is the bar's own motion props. Its children reach server-only
// modules (session reads, server actions) that a render test cannot import, and
// none of them participates in the invariant under test.
vi.mock('../UserMenu', () => ({ default: () => <div /> }));
vi.mock('../MobileNavDrawer', () => ({ MobileNavDrawer: () => <div /> }));
vi.mock('~/i18n/FrescoLocaleSwitcher', () => ({ default: () => <div /> }));

import { NavigationBar } from '../NavigationBar';

/**
 * `useReducedMotion()` answers `null` on the server and `true`/`false` on the
 * client, so nothing the server serialises may depend on it. motion resolves
 * `initial` into an inline style in the SSR markup, which made this bar a
 * hydration mismatch for any visitor who prefers reduced motion. React reports
 * that as an attribute mismatch it "won't patch up" rather than routing it to
 * `onRecoverableError`, so a hydration-error spy cannot see it — comparing the
 * server markup across the three answers can.
 */
const serverMarkupFor = (preference: boolean | null) => {
  mockUseReducedMotion.mockReturnValue(preference);
  return renderToString(
    <AppI18nProvider
      locale="en"
      locales={frescoLocales}
      messages={frescoCatalogs.en}
    >
      <NavigationBar />
    </AppI18nProvider>,
  );
};

describe('dashboard NavigationBar server markup', () => {
  it('does not depend on the reduced-motion preference', () => {
    const server = serverMarkupFor(null);

    expect(serverMarkupFor(false)).toBe(server);
    expect(serverMarkupFor(true)).toBe(server);
  });
});
