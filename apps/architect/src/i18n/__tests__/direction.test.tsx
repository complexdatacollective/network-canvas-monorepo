import { useDirection } from '@base-ui/react/direction-provider';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppDirectionOverride } from '@codaco/app-i18n/react';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';

/** What a Base UI menu, slider or set of tabs in Architect is told. */
function BaseUiDirection() {
  return <output>{useDirection()}</output>;
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('dir');
  document.documentElement.removeAttribute('lang');
});

describe('Architect writing direction', () => {
  // No Architect language is right to left yet, so the override stands in for
  // one: it is how Storybook's direction control reads Architect mirrored.
  it('gives Base UI the direction the language is shown in', () => {
    render(
      <AppDirectionOverride direction="rtl">
        <ArchitectI18nProvider>
          <BaseUiDirection />
        </ArchitectI18nProvider>
      </AppDirectionOverride>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('rtl');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });

  it('is left to right in a left-to-right language', () => {
    render(
      <ArchitectI18nProvider>
        <BaseUiDirection />
      </ArchitectI18nProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('ltr');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  });
});
