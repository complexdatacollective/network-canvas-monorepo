import { describe, expect, it } from 'vitest';

import { familyPedigreeStage } from '@codaco/protocol-validation';

import { PRESERVE_ON_NODE_TYPE_CHANGE } from '../NodeConfiguration';

/**
 * Changing the node type resets every stage-editor field NOT in
 * PRESERVE_ON_NODE_TYPE_CHANGE. Any schema-REQUIRED top-level field that gets
 * cleared and has no editor-level `required` validation surfaces as a raw zod
 * error when the researcher clicks "Finished Editing" (this shipped once, for
 * `boundaries`). This seam test fails when a new required field is added to
 * the FamilyPedigree schema without deciding how the reset should treat it:
 * either preserve it here, or reset it deliberately and add it to
 * INTENTIONALLY_RESET below (with editor validation to reprompt for it).
 */
describe('PRESERVE_ON_NODE_TYPE_CHANGE covers schema-required fields', () => {
  // nodeConfig is what the reset is FOR (its variables reference the old node
  // type); only its `type` subfield is preserved. All its fields have
  // `required` editor validation, so the researcher is reprompted.
  const INTENTIONALLY_RESET = ['nodeConfig'];

  it('preserves every required top-level stage field', () => {
    // A field is required when its schema rejects `undefined` (zod v4
    // deprecated `.isOptional()`).
    const requiredKeys = Object.entries(familyPedigreeStage.shape)
      .filter(([, schema]) => !schema.safeParse(undefined).success)
      .map(([key]) => key);

    for (const key of requiredKeys) {
      if (INTENTIONALLY_RESET.includes(key)) {
        continue;
      }
      expect(
        PRESERVE_ON_NODE_TYPE_CHANGE,
        `schema-required field "${key}"`,
      ).toContain(key);
    }
  });
});
