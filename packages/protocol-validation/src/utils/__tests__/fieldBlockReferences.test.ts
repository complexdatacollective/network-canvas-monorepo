import { describe, expect, it } from 'vitest';

import { testId } from '../../__tests__/testIds.ts';
import {
  fieldIdsIn,
  readContentDocument,
} from '../../localization/contentDocument.ts';
import { fieldBlockMarkdown } from '../../localization/fieldBlock.ts';
import { dynamicValueNameFor } from '../../schemas/9/dynamic-value-names.ts';
import { assignProtocolObjectIds } from '../../schemas/9/migration-object-ids.ts';
import { freshenProtocolFragmentIds } from '../freshenProtocolFragmentIds.ts';
import {
  formPathOfField,
  rewriteFieldBlockReferences,
} from '../protocolObjectIdRewrite.ts';
import { createBaseProtocol, localized } from '../test-utils.ts';

type Fields = Record<string, unknown>;

const FIELD_1 = testId('field-1');
const FIELD_2 = testId('field-2');
const NEW_1 = testId('new-1');
const CONDITION = dynamicValueNameFor({
  kind: 'condition',
  conditionId: testId('condition'),
});

const field = (id: string, variable: string) => ({
  id,
  variable,
  prompt: localized(`${variable}?`),
});

const twoFieldForm = () => ({
  content: {
    en: `Intro.\n\n${fieldBlockMarkdown(FIELD_1)}\n\n{${CONDITION}, select, true {${fieldBlockMarkdown(FIELD_2)}} other {}}`,
    fr: `${fieldBlockMarkdown(FIELD_2)}\n\n${fieldBlockMarkdown(FIELD_1)}`,
  },
  fields: [field(FIELD_1, 'name'), field(FIELD_2, 'age')],
});

const alterForm = (id: string, form = twoFieldForm()): Fields => ({
  id,
  type: 'AlterForm',
  label: localized('About them'),
  subject: { entity: 'node', type: 'person' },
  form,
});

/** The fields each language's document of `form` places, in order. */
const placed = (form: unknown) =>
  Object.fromEntries(
    Object.entries((form as { content: Record<string, string> }).content).map(
      ([locale, message]) => [
        locale,
        fieldIdsIn(readContentDocument(message).nodes),
      ],
    ),
  );

const fieldIdsOf = (form: unknown) =>
  (form as { fields: { id: string }[] }).fields.map(({ id }) => id);

describe('rewriteFieldBlockReferences', () => {
  it('points the blocks of the form, in every language and version, at the new ids', () => {
    const root = { stages: [alterForm(testId('af'))] };
    rewriteFieldBlockReferences(
      root,
      ['stages', 0, 'form'],
      new Map([[FIELD_1, NEW_1]]),
    );
    expect(placed(root.stages[0]?.form)).toEqual({
      en: [NEW_1, FIELD_2],
      fr: [FIELD_2, NEW_1],
    });
  });

  it('finds the form of a field from the path of its id', () => {
    expect(formPathOfField(['stages', 3, 'form', 'fields', 1, 'id'])).toEqual([
      'stages',
      3,
      'form',
    ]);
  });
});

describe('assignProtocolObjectIds', () => {
  it('points each form’s field blocks at the new ids of its own fields', () => {
    const base = createBaseProtocol();
    // Two forms whose fields share ids: each form's text names its own.
    const document: Fields = {
      ...base,
      stages: [alterForm('af1'), alterForm('af2')],
    };
    assignProtocolObjectIds(document);
    const [first, second] = document.stages as Fields[];
    for (const stage of [first, second]) {
      const [name, age] = fieldIdsOf(stage?.form);
      expect(placed(stage?.form)).toEqual({ en: [name, age], fr: [age, name] });
    }
    expect(fieldIdsOf(first?.form)).not.toEqual(fieldIdsOf(second?.form));
  });
});

describe('freshenProtocolFragmentIds', () => {
  it('points a copied form’s field blocks at the new ids its fields are given', () => {
    const stage = alterForm(testId('af'));
    const { fragment } = freshenProtocolFragmentIds(stage, [FIELD_1]);
    const [name, age] = fieldIdsOf(fragment.form);
    expect(name).not.toBe(FIELD_1);
    expect(age).toBe(FIELD_2);
    expect(placed(fragment.form)).toEqual({ en: [name, age], fr: [age, name] });
  });

  it('renames the blocks of each copied form by its own fields, when two forms share a field id', () => {
    const { fragment } = freshenProtocolFragmentIds(
      [alterForm(testId('af1')), alterForm(testId('af2'))],
      [],
    );
    const [first, second] = fragment;
    for (const stage of [first, second]) {
      const [name, age] = fieldIdsOf(stage?.form);
      expect(placed(stage?.form)).toEqual({ en: [name, age], fr: [age, name] });
    }
    expect(fieldIdsOf(first?.form)).not.toEqual(fieldIdsOf(second?.form));
  });
});
