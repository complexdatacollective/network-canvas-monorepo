import { useDirection } from '@base-ui/react/direction-provider';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppDirectionOverride } from '@codaco/app-i18n/react';

import { InterviewerI18nProvider } from '../InterviewerI18nProvider';

/** What a Base UI menu, slider or set of tabs in Interviewer is told. */
function BaseUiDirection() {
  return <output>{useDirection()}</output>;
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('dir');
  document.documentElement.removeAttribute('lang');
});

describe('Interviewer writing direction', () => {
  // No Interviewer language is right to left yet, so the override stands in
  // for one: it is how Storybook's direction control reads Interviewer
  // mirrored.
  it('gives Base UI the direction the language is shown in', () => {
    render(
      <AppDirectionOverride direction="rtl">
        <InterviewerI18nProvider>
          <BaseUiDirection />
        </InterviewerI18nProvider>
      </AppDirectionOverride>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('rtl');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });

  it('is left to right in a left-to-right language', () => {
    render(
      <InterviewerI18nProvider>
        <BaseUiDirection />
      </InterviewerI18nProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('ltr');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  });
});
