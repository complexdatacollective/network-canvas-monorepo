import { describe, expect, it } from 'vitest';

import { shouldSkipFramingSelectionStep } from '../FramingSelectionStep';
import { shouldSkipIntroStep } from '../IntroStep';

describe('shouldSkipIntroStep', () => {
  it('returns true when introScreen is undefined', () => {
    expect(shouldSkipIntroStep(undefined)).toBe(true);
  });

  it('returns true when introScreen is null', () => {
    expect(shouldSkipIntroStep(null)).toBe(true);
  });

  it('returns false when introScreen is present', () => {
    expect(shouldSkipIntroStep({ text: 'Hello' })).toBe(false);
  });

  it('returns false when introScreen has all fields', () => {
    expect(
      shouldSkipIntroStep({
        title: 'Welcome',
        text: 'This is the intro.',
        videoAssetId: 'abc123',
      }),
    ).toBe(false);
  });
});

describe('shouldSkipFramingSelectionStep', () => {
  it('returns false when framingConfig is participantChoice', () => {
    expect(shouldSkipFramingSelectionStep({ mode: 'participantChoice' })).toBe(
      false,
    );
  });

  it('returns true when framingConfig is fixed with gamete value', () => {
    expect(
      shouldSkipFramingSelectionStep({ mode: 'fixed', value: 'gamete' }),
    ).toBe(true);
  });

  it('returns true when framingConfig is fixed with gendered value', () => {
    expect(
      shouldSkipFramingSelectionStep({ mode: 'fixed', value: 'gendered' }),
    ).toBe(true);
  });
});
