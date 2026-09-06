import { describe, expect, it } from 'vitest';

import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';

import { makeAssignAttributesValidation } from '../AssignAttributes.tsx';
import { makeMultiSelectValidation } from '../MultiSelect.tsx';
import { optionsValidation } from '../Options.tsx';

/**
 * What the field would report for this whole array.
 *
 * The rules are exercised through the bag a call site actually passes, not one
 * by one: the bag is the unit — a call site cannot keep some of it and drop
 * others — and reaching past it would leave the composition itself untested.
 */
async function arrayIssue(
  custom: CustomFieldValidation,
  value: unknown,
): Promise<string | undefined> {
  const schema =
    typeof custom.schema === 'function'
      ? await custom.schema({})
      : custom.schema;
  const result = await schema.safeParseAsync(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('optionsValidation', () => {
  const issue = (value: unknown) => arrayIssue(optionsValidation.custom, value);

  it('accepts a complete, unambiguous list', async () => {
    await expect(
      issue([
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ]),
    ).resolves.toBeUndefined();
  });

  it('refuses a single option', async () => {
    await expect(issue([{ label: 'Yes', value: 'yes' }])).resolves.toMatch(
      /minimum of two options/,
    );
  });

  it('refuses a half-finished option', async () => {
    await expect(
      issue([{ label: 'Yes', value: 'yes' }, { label: 'No' }]),
    ).resolves.toBe('Every option needs both a label and a value.');
  });

  it('treats a label of nothing but spaces as missing', async () => {
    // Spaces are not a label: nothing is shown to the participant and nothing
    // is read out. The row that displays the gap trims before judging, so the
    // array — the only layer that can refuse the save — has to trim too.
    await expect(
      issue([
        { label: '   ', value: 'yes' },
        { label: 'No', value: 'no' },
      ]),
    ).resolves.toBe('Every option needs both a label and a value.');
  });

  it('treats an emptied value as missing rather than as malformed', async () => {
    // Clearing the value field leaves `''`, not an absent key. Told only that
    // `''` is not a valid export column, the researcher is being lectured
    // about characters in a value they have not typed yet.
    await expect(
      issue([
        { label: 'Yes', value: '' },
        { label: 'No', value: 'no' },
      ]),
    ).resolves.toBe('Every option needs both a label and a value.');
  });

  it('refuses two options that export as the same answer', async () => {
    await expect(
      issue([
        { label: 'Yes', value: 'yes' },
        { label: 'Affirmative', value: 'yes' },
      ]),
    ).resolves.toBe('Every option needs a unique value.');
  });

  it('refuses two options that read as the same choice', async () => {
    await expect(
      issue([
        { label: 'Yes', value: 'yes' },
        // Case and Unicode composition are not what tells two choices apart.
        { label: 'yes', value: 'no' },
      ]),
    ).resolves.toBe('Every option needs a unique label.');
  });

  it('refuses a value that cannot become an export column', async () => {
    await expect(
      issue([
        { label: 'Yes', value: 'yes please' },
        { label: 'No', value: 'no' },
      ]),
    ).resolves.toMatch(/Not a valid option value/);
  });

  it('says what is missing before it says the missing part is malformed', async () => {
    // Both rules fail here. A blank row should be told what it needs, not
    // lectured about the characters in the value it does not have.
    await expect(
      issue([{ label: 'Yes' }, { label: 'No', value: 'no thanks' }]),
    ).resolves.toBe('Every option needs both a label and a value.');
  });
});

describe('makeMultiSelectValidation', () => {
  const { custom } = makeMultiSelectValidation([
    { fieldName: 'property' },
    { fieldName: 'direction' },
  ]);

  it('passes the unconfigured state', async () => {
    // These lists live behind optional sections; empty is where they start.
    await expect(arrayIssue(custom, [])).resolves.toBeUndefined();
    await expect(arrayIssue(custom, undefined)).resolves.toBeUndefined();
  });

  it('refuses a row missing one of its columns', async () => {
    await expect(arrayIssue(custom, [{ property: 'name' }])).resolves.toBe(
      'Every row needs a value in each column.',
    );
  });

  it('refuses a column holding nothing but spaces', async () => {
    // The cells' own `required` trims before judging, so a whitespace-only
    // column already shows "Required" on the row. Without the same trim here
    // the researcher reads that error and is still allowed to save.
    await expect(
      arrayIssue(custom, [{ property: 'name', direction: '   ' }]),
    ).resolves.toBe('Every row needs a value in each column.');
  });
});

describe('makeAssignAttributesValidation', () => {
  const { custom } = makeAssignAttributesValidation({
    allVariables: { worried: { name: 'Worried', type: 'boolean' } },
    committedVariableIds: new Set(['worried']),
    draftValidatedVariables: new Set(['worried']),
    hasValidatedUseElsewhere: () => false,
  });

  it('passes a prompt that assigns nothing', async () => {
    await expect(arrayIssue(custom, [])).resolves.toBeUndefined();
  });

  it('refuses a half-finished stamp', async () => {
    await expect(arrayIssue(custom, [{ variable: 'worried' }])).resolves.toBe(
      'Every additional attribute needs both an attribute and a value.',
    );
  });

  it('refuses a stamp whose attribute has been cleared', async () => {
    // Deselecting the picker leaves `''` behind, not an absent key. `''` is a
    // string, so a test on the type alone would let `{ variable: '' }` reach
    // the protocol, where the schema rejects it long after the researcher has
    // moved on.
    await expect(
      arrayIssue(custom, [{ variable: '', value: true }]),
    ).resolves.toBe(
      'Every additional attribute needs both an attribute and a value.',
    );
  });

  it('accepts `false` as an assigned value', async () => {
    await expect(
      arrayIssue(custom, [{ variable: 'worried', value: false }]),
    ).resolves.toBeUndefined();
  });

  it('escapes a contradiction the researcher has already saved', async () => {
    // `worried` is collected by this stage's own form, which would normally be
    // refused — but it is also what this prompt already had, and re-saving an
    // unchanged pick introduces nothing new.
    await expect(
      arrayIssue(custom, [{ variable: 'worried', value: true }]),
    ).resolves.toBeUndefined();
  });

  it('escapes a saved pick that a form ELSEWHERE validates', async () => {
    // The sibling escape: the conflict is with another stage's saved form
    // rather than with this stage's draft, so it is refused on the way in and
    // must still be escaped on the way back out. An imported protocol can
    // arrive already holding this contradiction, and re-saving the prompt
    // unchanged introduces nothing new to refuse.
    const { custom: settled } = makeAssignAttributesValidation({
      allVariables: { worried: { name: 'Worried', type: 'boolean' } },
      committedVariableIds: new Set(['worried']),
      draftValidatedVariables: new Set(),
      hasValidatedUseElsewhere: () => true,
    });
    await expect(
      arrayIssue(settled, [{ variable: 'worried', value: true }]),
    ).resolves.toBeUndefined();
  });

  it('refuses a NEW pick of a variable this stage validates', async () => {
    const { custom: strict } = makeAssignAttributesValidation({
      allVariables: { worried: { name: 'Worried', type: 'boolean' } },
      committedVariableIds: new Set(),
      draftValidatedVariables: new Set(['worried']),
      hasValidatedUseElsewhere: () => false,
    });
    await expect(
      arrayIssue(strict, [{ variable: 'worried', value: true }]),
    ).resolves.toMatch(/"Worried" is collected by this stage's form/);
  });
});
