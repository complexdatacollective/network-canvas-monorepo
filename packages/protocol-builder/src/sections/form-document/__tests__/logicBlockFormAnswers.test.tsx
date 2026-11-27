import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  dynamicValueNameFor,
  fieldBlockMarkdown,
} from '@codaco/protocol-validation';

import {
  attributeField,
  closeAttributePicker,
  openAttributePicker,
} from '../../../testing/attributePicker.ts';
import {
  fixtureTypeId,
  fixtureVariableId,
  loadFixtureStage,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { testId } from '../../../testing/testId.ts';
import FormDocumentSection from '../FormDocumentSection.tsx';
import { formEditor } from './formDocumentTesting.ts';

const personVariable = (name: string) =>
  fixtureVariableId({ entity: 'node', typeName: 'person' }, name);
const nodeValue = (name: string) =>
  dynamicValueNameFor({
    kind: 'attribute',
    role: 'node',
    variableId: personVariable(name),
  });

const FIXTURE = loadFixtureStage('alter-form-1');
const TYPE_FIELD = testId('field/contact-type');
const FLAGGED_FIELD = testId('field/flagged');

/**
 * A field above a logic block, and a field inside it. The block shows its
 * field according to how often the participant sees the person, which an
 * earlier stage recorded.
 */
const FORM = {
  content: {
    'en-US': [
      fieldBlockMarkdown(TYPE_FIELD),
      '',
      `{${nodeValue('contactFreq')}, select, missing {} other {${fieldBlockMarkdown(FLAGGED_FIELD)}}}`,
    ].join('\n'),
  },
  fields: [
    {
      id: TYPE_FIELD,
      variable: personVariable('contactType'),
      prompt: { 'en-US': 'How do you know them?' },
    },
    {
      id: FLAGGED_FIELD,
      variable: personVariable('flagged'),
      prompt: { 'en-US': 'Should we follow up?' },
    },
  ],
};

const openForm = (
  form: Readonly<Record<string, unknown>> = FORM,
  extra: Readonly<Record<string, unknown>> = {},
) =>
  renderStageEditor({
    stage: { ...FIXTURE, fields: { ...FIXTURE.fields, ...extra, form } },
    sections: <FormDocumentSection subject="node" />,
  });

const CONDITION = testId('condition/knows-them');

/** The same form, with the block shown by a rule instead. */
const CONDITION_FORM = {
  ...FORM,
  content: {
    'en-US': [
      fieldBlockMarkdown(TYPE_FIELD),
      '',
      `{${dynamicValueNameFor({ kind: 'condition', conditionId: CONDITION })}, select, true {${fieldBlockMarkdown(FLAGGED_FIELD)}} other {}}`,
    ].join('\n'),
  },
};
const CONDITIONS = {
  [CONDITION]: {
    rules: [
      {
        id: testId('rule/knows-them'),
        type: 'node',
        options: {
          type: fixtureTypeId('node', 'person'),
          attribute: personVariable('relationship_to_ego'),
          operator: 'EXISTS',
        },
      },
    ],
  },
};

/** Opens the settings of the form's logic block. */
const openBlockSettings = async (
  harness: ReturnType<typeof renderStageEditor>,
): Promise<HTMLElement> => {
  const editor = await formEditor();
  await within(editor).findByText('How do you know them?');
  await harness.user.click(
    within(editor).getByRole('button', { name: 'Logic block settings' }),
  );
  return screen.findByRole('dialog', { name: 'Logic block' });
};

type Listed = Readonly<{
  group: string;
  rows: readonly Readonly<{ id: string; unavailable: boolean }>[];
}>;

/** The groups of an open attribute list, with each row's attribute. */
const groupsIn = (popup: HTMLElement): Listed[] =>
  [...popup.querySelectorAll<HTMLElement>('[data-attribute-group]')].map(
    (group) => ({
      group: group.dataset.attributeGroup ?? '',
      rows: [
        ...group.querySelectorAll<HTMLElement>(
          '[role="option"][data-attribute-id]',
        ),
      ].map((row) => ({
        id: row.dataset.attributeId ?? '',
        unavailable: row.dataset.unavailable !== undefined,
      })),
    }),
  );

describe('the rules of a logic block in a form', () => {
  it('list the answers on the form first, and not the fields inside the block', async () => {
    const harness = openForm();
    const popover = await openBlockSettings(harness);
    const popup = await openAttributePicker(
      harness.user,
      attributeField('Attribute', popover),
    );
    const groups = groupsIn(popup);

    expect(groups.map(({ group }) => group)).toEqual([
      'form-answers',
      'earlier-answers',
    ]);
    // The answer given above the block is read as it is typed; the one
    // asked inside the block is listed, and cannot be chosen.
    expect(groups[0]?.rows).toEqual([
      { id: nodeValue('contactType'), unavailable: false },
      { id: nodeValue('flagged'), unavailable: true },
    ]);
    // Everything else was recorded before the form.
    const earlier = groups[1]?.rows.map(({ id }) => id) ?? [];
    expect(earlier).toContain(nodeValue('contactFreq'));
    expect(earlier).not.toContain(nodeValue('contactType'));
    expect(earlier).not.toContain(nodeValue('flagged'));

    const flagged = popup.querySelector<HTMLElement>(
      `[role="option"][data-attribute-id="${CSS.escape(nodeValue('flagged'))}"]`,
    );
    if (flagged === null) throw new Error('flagged is not listed');
    expect(flagged).toHaveTextContent(
      'A field inside this logic block collects this attribute, so it cannot decide which content the block shows.',
    );
    await closeAttributePicker(harness.user);
  });

  it('list the answers on the form first in the rules of an “If”', async () => {
    const harness = openForm(CONDITION_FORM, { conditions: CONDITIONS });
    const popover = await openBlockSettings(harness);
    await harness.user.click(
      within(popover).getByRole('button', { name: /^Edit rule/ }),
    );
    const popup = await openAttributePicker(
      harness.user,
      await waitFor(() => attributeField('Node attribute')),
    );
    const variableGroups = Object.fromEntries(
      groupsIn(popup).map(({ group, rows }) => [
        group,
        rows.map(
          ({ id, unavailable }) =>
            `${id}${unavailable ? ' (not available)' : ''}`,
        ),
      ]),
    );

    expect(variableGroups['form-answers']).toEqual([
      personVariable('contactType'),
      `${personVariable('flagged')} (not available)`,
    ]);
    expect(variableGroups['earlier-answers']).toContain(
      personVariable('relationship_to_ego'),
    );
    await closeAttributePicker(harness.user);
  });
});
