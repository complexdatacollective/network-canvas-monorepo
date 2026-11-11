// @vitest-environment jsdom
import { useDirection } from '@base-ui/react/direction-provider';
import type { Decorator } from '@storybook/react-vite';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { storybookI18n } from '@codaco/storybook-config/i18n';

import LocaleDirectionProvider from '../LocaleDirectionProvider';

/**
 * The toolbar's direction has to reach a host's own providers when a story
 * mounts them, not only the page.
 *
 * A host gives Base UI the direction of its app language through
 * `LocaleDirectionProvider`. Inside a story that provider is nearer the
 * components than the one the Storybook decorator mounts, so it is the one
 * Base UI listens to. English forced right to left would then mirror the CSS
 * while every menu and slider still behaved left to right — the mismatch the
 * direction control exists to find.
 */

const { withAppI18n, initialGlobals } = storybookI18n({
  locales: ecosystemLocales,
  catalogs: {},
});

/** The decorator reads `globals` from its context and nothing else. */
type DecoratorContext = Parameters<Decorator>[1];

const contextWith = (appDirection: string): DecoratorContext =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a whole StoryContext would assert a shape the decorator never reads
  ({
    globals: { ...initialGlobals, appLocale: 'en', appDirection },
  }) as unknown as DecoratorContext;

/** A host's provider stack in miniature, as a story would mount it. */
function HostStory() {
  return (
    <LocaleDirectionProvider>
      <BaseUiDirection />
    </LocaleDirectionProvider>
  );
}

function BaseUiDirection() {
  return <output>{useDirection()}</output>;
}

function renderIn(appDirection: string) {
  const Decorated = () => withAppI18n(HostStory, contextWith(appDirection));
  render(<Decorated />);
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('dir');
  document.documentElement.removeAttribute('lang');
});

describe('the Storybook direction control', () => {
  it('turns a host’s own direction provider right to left', () => {
    renderIn('rtl');
    expect(screen.getByRole('status').textContent).toBe('rtl');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('leaves it in the language’s own direction on Automatic', () => {
    renderIn('auto');
    expect(screen.getByRole('status').textContent).toBe('ltr');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
