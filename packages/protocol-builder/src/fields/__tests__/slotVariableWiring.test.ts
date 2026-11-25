import { describe, expect, it } from 'vitest';

import { variableRoleKey } from '../../codebook/variableRoles.ts';
import { enIntl } from '../../testing/i18n.ts';
import { testId, testTypeId, testVariableId } from '../../testing/testId.ts';
import {
  ruleOutOptionsManagedElsewhere,
  ruleOutValuesOutsideOwnedSet,
  type SlotVariableOption,
  slotPickerOptions,
} from '../slotVariableWiring.ts';

const SUBJECT = { entity: 'node', type: testTypeId('person') } as const;
const SEX = testVariableId('sex');
const GENDER = testVariableId('gender');
const PLAIN = testVariableId('plain');

const OPTIONS: SlotVariableOption[] = [
  { value: SEX, label: 'sex', type: 'categorical' },
  { value: GENDER, label: 'gender', type: 'categorical' },
  { value: PLAIN, label: 'plain', type: 'categorical' },
];

const reasons = (marked: readonly { unavailableReason?: string }[]) =>
  marked.map((option) => option.unavailableReason);

/** The reasons a slot picker gives, with nothing claimed but `input`. */
const slotReasons = (input: Partial<Parameters<typeof slotPickerOptions>[0]>) =>
  reasons(
    slotPickerOptions({
      roleMap: {},
      slotMap: {},
      draftSlotMap: {},
      subject: SUBJECT,
      options: OPTIONS,
      writerClass: 'unvalidated',
      intl: enIntl,
      ...input,
    }),
  );

describe('the attributes a slot picker lists', () => {
  it('says an attribute is already one of this stage’s other answers', () => {
    expect(slotReasons({ draftBoundElsewhere: [GENDER] })).toEqual([
      undefined,
      'Another field on this stage already uses this attribute.',
      undefined,
    ]);
  });

  it('names the writer class a draft field on this stage already uses', () => {
    expect(
      slotReasons({ writerClass: 'unvalidated', draftConflicting: [SEX] }),
    ).toEqual([
      'Another field on this stage collects this attribute and validates each answer, so it cannot also be set here without validation.',
      undefined,
      undefined,
    ]);
    expect(
      slotReasons({ writerClass: 'validated', draftConflicting: [SEX] }),
    ).toEqual([
      'Another field on this stage sets this attribute without validation, so it cannot also be collected here.',
      undefined,
      undefined,
    ]);
  });

  it('gives the saved claim before a draft one, and never marks the held value', () => {
    const slotMap = {
      [variableRoleKey(SUBJECT, SEX)]: {
        source: 'protocol',
        slot: 'pedigree.sex',
        owner: 'Family Pedigree',
        stageLabel: 'Family tree',
      },
    } as const;
    expect(
      slotReasons({ slotMap, draftBoundElsewhere: [SEX, GENDER] }),
    ).toEqual([
      'The “Family tree” stage records its own information in this attribute, so it cannot be used here.',
      'Another field on this stage already uses this attribute.',
      undefined,
    ]);
    expect(
      slotReasons({
        slotMap,
        draftBoundElsewhere: [SEX, GENDER],
        currentValue: GENDER,
      }),
    ).toEqual([
      'The “Family tree” stage records its own information in this attribute, so it cannot be used here.',
      undefined,
      undefined,
    ]);
  });
});

describe('the attributes a slot that owns its values lists', () => {
  const owned = [{ value: 'a' }, { value: 'b' }];
  const valueOf = (value: string) => ({
    id: testId(`option/${value}`),
    label: { 'en-US': value },
    value,
  });
  const withValues: SlotVariableOption[] = [
    { value: SEX, label: 'sex', options: [valueOf('a'), valueOf('b')] },
    { value: GENDER, label: 'gender', options: [valueOf('a'), valueOf('c')] },
  ];

  it('marks an attribute whose options differ, even the one the slot holds', () => {
    expect(
      reasons(ruleOutValuesOutsideOwnedSet(withValues, owned, 'Differs.')),
    ).toEqual([undefined, 'Differs.']);
  });

  it('names the stages that manage an attribute’s options', () => {
    expect(
      reasons(
        ruleOutOptionsManagedElsewhere(
          withValues,
          (id) => (id === SEX ? ['Family tree'] : []),
          (stageLabels) => `Managed by ${stageLabels.join(', ')}.`,
        ),
      ),
    ).toEqual(['Managed by Family tree.', undefined]);
  });
});
