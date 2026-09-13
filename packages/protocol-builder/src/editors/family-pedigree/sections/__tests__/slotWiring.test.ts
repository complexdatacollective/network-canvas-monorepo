import { describe, expect, it } from 'vitest';

import {
  INTERFACE_OWNED_OPTION_SETS,
  type Variables,
} from '@codaco/protocol-validation';

import type {
  ExclusiveVariableSlotMap,
  VariableRoleMap,
} from '../../../../codebook/variableRoles.ts';
import type { CodebookSubject } from '../../../../protocol-context.ts';
import { readMessage } from '../../../../testing/i18n.ts';
import {
  ruleOutValuesOutsideOwnedSet,
  slotCrossClassIssue,
  slotPickerOptions,
  type SlotVariableOption,
  unusableVariableIssue,
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
    draftLabelVariable?: string;
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
    ...(input.draftLabelVariable === undefined
      ? {}
      : { draftLabelVariable: input.draftLabelVariable }),
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
      ...(input.draftLabelVariable === undefined
        ? {}
        : { draftLabelVariable: input.draftLabelVariable }),
      allVariables: VARIABLES,
    });
  /**
   * The refusal as the researcher reads it.
   *
   * The gate has no formatter of its own, so it hands its sentence across the
   * field's string-only error contract as an encoded descriptor — which is
   * what `FieldErrors` receives and decodes. This is the same
   * `formatMessageError(text, intl) ?? text` that render site uses, so an
   * assertion below is on the words a researcher sees and still fails when
   * those words change. `undefined` stays `undefined`: a pick that earned no
   * refusal must not read as an empty sentence.
   */
  const refusalTextFor = (variableId: string): string | undefined => {
    const refusal = refusalFor(variableId);
    return refusal === undefined ? undefined : readMessage(refusal);
  };
  return {
    offered: offered.map((option) => option.value),
    refusalFor,
    refusalTextFor,
  };
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
   * The display label is what the participant TYPES for each relative, and a
   * structural slot writes what the pedigree derives — so one attribute cannot
   * be both. The interview settles it in the slot's favour
   * (`FamilyPedigree/store.ts` spreads the node's attributes and then writes
   * the relationship over them), which is the researcher's name for that
   * person replaced by "sibling".
   */
  it('never offers a structural slot the attribute the display label names', () => {
    const { offered, refusalFor } = ask({
      options: TEXT_POOL,
      writerClass: 'unvalidated',
      committedValue: 'kinship',
      draftConflicting: [],
      draftLabelVariable: 'fm_name',
    });

    expect(offered).toEqual(['kinship']);
    expect(refusalFor('fm_name')).toBeDefined();
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
    const { refusalTextFor } = ask({
      options: BOOLEAN_POOL,
      writerClass: 'unvalidated',
      committedValue: 'is_ego',
      draftConflicting: ['unwell'],
    });

    expect(refusalTextFor('unwell')).toBe(
      '"unwell" is collected by this stage’s own form, so it cannot also be written by this slot (values written here would bypass its validation)',
    );
  });

  it('tells a structural slot the display label is that attribute', () => {
    const { refusalTextFor } = ask({
      options: TEXT_POOL,
      writerClass: 'unvalidated',
      committedValue: 'kinship',
      draftConflicting: [],
      draftLabelVariable: 'fm_name',
    });

    const refusal = refusalTextFor('fm_name');
    expect(refusal).toBe(
      '"fm_name" is the display label this stage shows each family member by, so it cannot also be written by this slot (what this slot derives would replace the name the participant entered)',
    );
    // Not the form's refusal: the display label is the control one line above,
    // and a researcher sent looking for a form field never added one.
    expect(refusal).not.toContain('form');
  });

  /**
   * The display label is a slot, not a form field: it names the attribute the
   * pedigree shows each family member by. Told it "cannot be used as a form
   * field", a researcher looks for a form field they never added.
   */
  it('tells the display label another slot on this screen is deriving it', () => {
    const { refusalTextFor } = ask({
      options: TEXT_POOL,
      writerClass: 'validated',
      committedValue: 'fm_name',
      draftConflicting: ['kinship'],
    });

    const refusal = refusalTextFor('kinship');
    expect(refusal).toBe(
      '"kinship" is written without validation by another slot in this stage, so it cannot also be collected here (the values that slot writes bypass this attribute’s validation)',
    );
    expect(refusal).not.toContain('form field');
  });
});

/**
 * The codebook moving under a control that is already holding an attribute.
 *
 * Everything else in this module asks who ELSE writes an attribute. This asks
 * whether the attribute is still one this control can use at all, which is the
 * question a collaborator's deletion or retyping raises — and the one no gate
 * was asking, so a save closed over a reference the whole-protocol check then
 * refused.
 */
describe('the categorical pool a value-owning slot is handed', () => {
  const CANONICAL = INTERFACE_OWNED_OPTION_SETS.gameteRole.options;
  const words = (attributeName: string) => ({
    optionLabel: `${attributeName}: values moved`,
    note: 'note',
  });
  const exact: SlotVariableOption = {
    value: 'gameteRole',
    label: 'gameteRole',
    type: 'categorical',
    options: [
      { value: 'egg', label: 'Egg' },
      { value: 'sperm', label: 'Sperm' },
    ],
  };
  const edited: SlotVariableOption = {
    value: 'gameteRole',
    label: 'gameteRole',
    type: 'categorical',
    options: [
      { value: 'egg', label: 'Egg' },
      { value: 'sperm', label: 'Sperm' },
      { value: 'unknown', label: 'Unknown' },
    ],
  };
  const valueless: SlotVariableOption = {
    value: 'bare',
    label: 'bare',
    type: 'categorical',
  };

  it('leaves an attribute carrying exactly the owned set as it is', () => {
    expect(ruleOutValuesOutsideOwnedSet([exact], CANONICAL, words)).toEqual([
      exact,
    ]);
  });

  /**
   * Ruled out and named rather than dropped: the attribute a slot already
   * holds is one of these, and dropped it could only be reported as gone.
   */
  it('keeps an attribute whose values moved, ruled out in the caller’s words', () => {
    expect(
      ruleOutValuesOutsideOwnedSet(
        [exact, edited, valueless],
        CANONICAL,
        words,
      ),
    ).toEqual([
      exact,
      {
        ...edited,
        usable: false,
        unusableWords: {
          optionLabel: 'gameteRole: values moved',
          note: 'note',
        },
      },
      {
        ...valueless,
        usable: false,
        unusableWords: { optionLabel: 'bare: values moved', note: 'note' },
      },
    ]);
  });
});

describe('an attribute a pedigree control can no longer use', () => {
  it('says nothing about an attribute of the type the control needs', () => {
    expect(
      unusableVariableIssue(VARIABLES, 'is_ego', 'boolean'),
    ).toBeUndefined();
  });

  it('says nothing about a control holding nothing yet', () => {
    expect(unusableVariableIssue(VARIABLES, '', 'boolean')).toBeUndefined();
    expect(
      unusableVariableIssue(VARIABLES, undefined, 'boolean'),
    ).toBeUndefined();
  });

  /**
   * Named by its stored id, because there is no definition left to take a name
   * from — the same treatment a deleted type gets in `EntityTypePickerField`.
   */
  it('names an attribute that has left the codebook', () => {
    const issue = unusableVariableIssue(
      VARIABLES,
      'deleted_attribute',
      'boolean',
    );

    expect(issue).toBeDefined();
    expect(issue === undefined ? '' : readMessage(issue)).toBe(
      '"deleted_attribute" is no longer in the codebook, so nothing can be recorded under it. Choose another attribute.',
    );
  });

  it('refuses one whose type has been changed under the control', () => {
    const issue = unusableVariableIssue(VARIABLES, 'fm_name', 'boolean');

    expect(issue).toBeDefined();
    expect(issue === undefined ? '' : readMessage(issue)).toBe(
      '"fm_name" is no longer the kind of attribute this control can use, because its type was changed somewhere else. Choose another attribute.',
    );
  });
});
