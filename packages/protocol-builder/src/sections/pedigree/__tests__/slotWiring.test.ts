import { describe, expect, it } from 'vitest';

import type { Variables } from '@codaco/protocol-validation';

import type {
  ExclusiveVariableSlotMap,
  VariableRoleMap,
} from '../../../codebook/variableRoles.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import {
  slotCrossClassIssue,
  slotPickerOptions,
  type SlotVariableOption,
} from '../slotWiring.ts';

const SUBJECT: CodebookSubject = { entity: 'node', type: 'family_member' };

/** Nothing in the SAVED protocol claims anything, so only the draft can. */
const NO_ROLES: VariableRoleMap = Object.freeze({});
const NO_SLOTS: ExclusiveVariableSlotMap = Object.freeze({});

const VARIABLES: Readonly<Variables> = Object.freeze({
  is_ego: { name: 'is_ego', type: 'boolean' },
  hasConditionX: { name: 'hasConditionX', type: 'boolean' },
  unwell: { name: 'unwell', type: 'boolean' },
  fm_name: { name: 'fm_name', type: 'text' },
  kinship: { name: 'kinship', type: 'text' },
});

const optionFor = (value: string): SlotVariableOption => {
  const variable = VARIABLES[value];
  if (variable === undefined) throw new Error(`no ${value} in this codebook`);
  return { value, label: variable.name, type: variable.type };
};

const BOOLEAN_POOL = ['is_ego', 'hasConditionX', 'unwell'].map(optionFor);
const TEXT_POOL = ['fm_name', 'kinship'].map(optionFor);

/**
 * The picker and the gate, always asked the same question.
 *
 * They take the same inputs by construction here, because that is the file's
 * invariant: a picker that offered an attribute the gate then refuses reads as
 * the editor changing its mind between the pick and the save.
 */
const ask = (
  input: Readonly<{
    options: readonly SlotVariableOption[];
    writerClass: 'validated' | 'unvalidated';
    committedValue: string;
    draftConflicting: readonly string[];
  }>,
) => {
  const offered = slotPickerOptions({
    roleMap: NO_ROLES,
    slotMap: NO_SLOTS,
    subject: SUBJECT,
    options: input.options,
    currentValue: input.committedValue,
    writerClass: input.writerClass,
    draftConflicting: input.draftConflicting,
  });
  const refusalFor = (variableId: string) =>
    slotCrossClassIssue({
      roleMap: NO_ROLES,
      slotMap: NO_SLOTS,
      subject: SUBJECT,
      variableId,
      committedValue: input.committedValue,
      writerClass: input.writerClass,
      draftConflicting: input.draftConflicting,
      allVariables: VARIABLES,
    });
  return { offered: offered.map((option) => option.value), refusalFor };
};

describe('the attributes one pedigree slot may bind', () => {
  /**
   * The claim the whole module exists to keep: everything on offer saves.
   *
   * Asserted over the offered list rather than against a written-down one, so
   * an exclusion added to the picker and not to the gate — or the other way
   * round — fails here rather than in the researcher's editor.
   */
  it('offers a structural slot exactly what its gate accepts', () => {
    const { offered, refusalFor } = ask({
      options: BOOLEAN_POOL,
      writerClass: 'unvalidated',
      committedValue: 'is_ego',
      draftConflicting: ['unwell'],
    });

    expect(offered).toEqual(['is_ego', 'hasConditionX']);
    for (const variableId of offered) {
      expect(refusalFor(variableId)).toBeUndefined();
    }
  });

  it('offers the display label exactly what its gate accepts', () => {
    const { offered, refusalFor } = ask({
      options: TEXT_POOL,
      writerClass: 'validated',
      committedValue: 'fm_name',
      draftConflicting: ['kinship'],
    });

    expect(offered).toEqual(['fm_name']);
    for (const variableId of offered) {
      expect(refusalFor(variableId)).toBeUndefined();
    }
  });

  /**
   * A protocol that arrives already holding the conflict stays editable. The
   * pick is the slot's own committed value, so dropping it from the list would
   * blank the control and then write the blank over the very reference the
   * researcher has to resolve.
   */
  it('keeps a slot’s own committed pick on offer even when the draft claims it', () => {
    const { offered, refusalFor } = ask({
      options: BOOLEAN_POOL,
      writerClass: 'unvalidated',
      committedValue: 'unwell',
      draftConflicting: ['unwell'],
    });

    expect(offered).toContain('unwell');
    expect(refusalFor('unwell')).toBeUndefined();
  });
});

/**
 * The two refusals a pedigree slot can earn from this stage's own draft, in
 * each slot's own words. Both are shown one section away from the thing they
 * are about, so neither may send the researcher looking through their other
 * stages for it — and neither may describe the control it appears under as
 * something it is not.
 */
describe('what a refused pedigree pick is told', () => {
  it('tells a structural slot the form on this screen is collecting it', () => {
    const { refusalFor } = ask({
      options: BOOLEAN_POOL,
      writerClass: 'unvalidated',
      committedValue: 'is_ego',
      draftConflicting: ['unwell'],
    });

    expect(refusalFor('unwell')).toBe(
      '"unwell" is collected by this stage’s own form, so it cannot also be written by this slot (values written here would bypass its validation)',
    );
  });

  /**
   * The display label is a slot, not a form field: it names the attribute the
   * pedigree shows each family member by. Told it "cannot be used as a form
   * field", a researcher looks for a form field they never added.
   */
  it('tells the display label another slot on this screen is deriving it', () => {
    const { refusalFor } = ask({
      options: TEXT_POOL,
      writerClass: 'validated',
      committedValue: 'fm_name',
      draftConflicting: ['kinship'],
    });

    const refusal = refusalFor('kinship');
    expect(refusal).toBe(
      '"kinship" is written without validation by another slot in this stage, so it cannot also be collected here (the values that slot writes bypass this attribute’s validation)',
    );
    expect(refusal).not.toContain('form field');
  });
});
