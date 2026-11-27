import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import {
  CodebookSchema,
  dynamicValueNameFor,
  optionCaseKey,
} from '@codaco/protocol-validation';

import { ProtocolLocalizationProvider } from '../localization/ProtocolLocalization.tsx';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import { fixtureStageId } from '../testing/protocolFixture.ts';
import { testId, testTypeId, testVariableId } from '../testing/testId.ts';
import NodeLabelField, { type NodeLabelDraft } from './NodeLabelField.tsx';

const PLACE = testTypeId('place');
const NEAR = testTypeId('near');
const PLACE_NAME = testVariableId('placeName');
const KIND = testVariableId('kind');
const BEDS = testVariableId('beds');
const HOSPITAL = testId('option/hospital');
const SCHOOL = testId('option/school');
const LINKED = testId('condition/linked');

const LABEL = 'Label';
const ENGLISH_ONLY = { defaultLocale: 'en', locales: ['en'] };

/** A place with a kind, and one way of joining two places. */
const CODEBOOK = CodebookSchema.parse({
  node: {
    [PLACE]: {
      name: 'Place',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        [PLACE_NAME]: { name: 'name', type: 'text' },
        [KIND]: {
          name: 'kind',
          type: 'ordinal',
          options: [
            { id: HOSPITAL, label: { en: 'Hospital' }, value: 'hospital' },
            { id: SCHOOL, label: { en: 'School' }, value: 'school' },
          ],
        },
        [BEDS]: { name: 'beds', type: 'number' },
      },
    },
  },
  edge: { [NEAR]: { name: 'Near', color: 'edge-color-seq-1' } },
});

const KIND_NAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'node',
  variableId: KIND,
});
const ICON = testId('dynamic/icon');
const LINKED_MARK = testId('dynamic/linked');

/**
 * An emoji for each kind of place, the label the interview would otherwise
 * choose, and a mark for a place joined to another: two dynamic attributes of
 * the label, one with a version for each answer and one with an “If”.
 */
const ICON_AND_LINK: NodeLabelDraft = {
  text: {
    en: `{${dynamicValueNameFor({ kind: 'dynamicAttribute', id: ICON })}} {node_label} {${dynamicValueNameFor({ kind: 'dynamicAttribute', id: LINKED_MARK })}}`,
  },
  conditions: {
    [LINKED]: {
      about: 'node',
      rules: [
        {
          id: testId('has-near'),
          type: 'edge',
          options: { type: NEAR, operator: 'EXISTS' },
        },
      ],
    },
  },
  dynamicAttributes: {
    [ICON]: {
      logic: 'answers',
      value: KIND_NAME,
      missing: { en: '📍' },
      answers: [
        { answer: optionCaseKey(HOSPITAL), wording: { en: '🏥' } },
        { answer: optionCaseKey(SCHOOL), wording: { en: '🏫' } },
      ],
      other: { en: '📍' },
    },
    [LINKED_MARK]: {
      logic: 'conditions',
      cases: [{ condition: LINKED, when: 'met', wording: { en: '🔗' } }],
      otherwise: { en: '·' },
    },
  },
};

function NodeLabel({
  initialValue,
  isNew = false,
}: Readonly<{ initialValue?: NodeLabelDraft; isNew?: boolean }>) {
  // The node type editor gives the field the protocol's languages itself,
  // as Architect's does: it sits outside any stage editor.
  return (
    <ProtocolLocalizationProvider localization={ENGLISH_ONLY}>
      <Field<typeof NodeLabelField>
        name="dynamicLabel"
        component={NodeLabelField}
        label={LABEL}
        hint="Shown on every node of this type."
        codebook={CODEBOOK}
        nodeType={isNew ? undefined : PLACE}
        {...(initialValue === undefined ? {} : { initialValue })}
      />
    </ProtocolLocalizationProvider>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Node label',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'How a node type labels its own nodes: one line of text that a participant reads on every node of the type. The Attribute menu puts in the node’s attributes, the label that the interview would otherwise choose, and the label’s own dynamic attributes: words that read differently for different nodes, by the answer to an attribute or by rules about the node’s attributes and its edges, which are built with the rule builder.',
      },
    },
  },
  args: {
    stageId: fixtureStageId('categorical-bin-1'),
    sectionTitle: 'Dynamic label',
    children: <NodeLabel />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing written yet: the label box, with its Attribute menu. */
export const NothingWrittenYet: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: LABEL }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Attribute' }),
    ).toBeEnabled();
  },
};

/**
 * Two dynamic attributes around the label the interview would otherwise
 * choose. Each is a pill that shows its wordings.
 */
export const DynamicAttributes: Story = {
  args: { children: <NodeLabel initialValue={ICON_AND_LINK} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('textbox', { name: LABEL });
    // The field's value reaches the editor a turn after it mounts.
    await waitFor(() =>
      expect(box.querySelector('data[value="📍 / 🏥 / 🏫"]')).not.toBeNull(),
    );
    await expect(box.querySelector('data[value="🔗 / ·"]')).not.toBeNull();
    await expect(
      box.querySelector('data[value="Default label"]'),
    ).not.toBeNull();
  },
};

/**
 * A node type that has not been saved has no attributes for a rule to name
 * or an answer to word for: the Attribute menu offers only the label that
 * the interview would otherwise choose.
 */
export const ANewNodeType: Story = {
  args: { children: <NodeLabel isNew /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    await userEvent.click(await canvas.findByRole('textbox', { name: LABEL }));
    await userEvent.click(canvas.getByRole('button', { name: 'Attribute' }));
    const menu = await body.findByRole('dialog', {
      name: 'Insert an attribute',
    });
    await expect(
      within(menu).getByRole('option', { name: /^Default label/ }),
    ).toBeInTheDocument();
    await expect(
      within(menu).queryByRole('option', { name: /^kind/ }),
    ).toBeNull();
  },
};
