import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';

import { getValidationLabel } from '../variableValidation.ts';

/**
 * One rule, one name (parity audit candidate 21).
 *
 * `@codaco/protocol-validation` owns the rules and names them for the errors a
 * protocol's own validation reports; this package used to keep a second
 * catalogue of its own, so the rule a researcher ticked as "Minimum length"
 * came back from the validator as "Minimum text length" and read as a
 * different rule. The names are now the shared ones, and this fails if a copy
 * is reintroduced here.
 */
const intl = createAppIntl({ locale: 'en' });

describe('what a validation rule is called', () => {
  it('names the rules the researcher ticks with the shared words', () => {
    // Spot-checks the four the package used to name differently, so this test
    // still says something if `validationRuleMessages` is ever re-exported
    // from a second copy rather than from the package that owns it.
    expect(getValidationLabel('minLength', intl)).toBe('Minimum text length');
    expect(getValidationLabel('maxLength', intl)).toBe('Maximum text length');
    expect(getValidationLabel('required', intl)).toBe('Required answer');
    expect(getValidationLabel('sameAs', intl)).toBe(
      'Same as another attribute',
    );
  });
});
