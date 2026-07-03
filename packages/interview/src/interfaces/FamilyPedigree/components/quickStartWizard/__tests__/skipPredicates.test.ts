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

  it('returns true when introScreen has no items', () => {
    expect(shouldSkipIntroStep({ items: [] })).toBe(true);
  });

  it('returns false when introScreen has items', () => {
    expect(
      shouldSkipIntroStep({
        items: [{ id: 't1', type: 'text', content: 'Hello' }],
      }),
    ).toBe(false);
  });

  it('returns false when introScreen has multiple items', () => {
    expect(
      shouldSkipIntroStep({
        items: [
          { id: 't1', type: 'text', content: 'This is the intro.' },
          { id: 'v1', type: 'asset', content: 'abc123' },
        ],
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
