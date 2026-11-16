import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { CodebookSchema } from '@codaco/protocol-validation';

import { ProtocolLocalizationProvider } from '../localization/ProtocolLocalization.tsx';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import NodeLabelField, { type NodeLabelDraft } from './NodeLabelField.tsx';

const LABEL = 'Label';
const ENGLISH_ONLY = { defaultLocale: 'en', locales: ['en'] };

/** A place with a kind, and one way of joining two places. */
const CODEBOOK = CodebookSchema.parse({
  node: {
    place: {
      name: 'Place',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        placeName: { name: 'name', type: 'text' },
        kind: {
          name: 'kind',
          type: 'ordinal',
          options: [
            { label: { en: 'Hospital' }, value: 'hospital' },
            { label: { en: 'School' }, value: 'school' },
          ],
        },
        beds: { name: 'beds', type: 'number' },
      },
    },
  },
  edge: { near: { name: 'Near', color: 'edge-color-seq-1' } },
});

const SWITCH_ON_KIND: NodeLabelDraft = {
  text: {
    en: '{kind, select, missing {} hospital {🏥 } school {🏫 } other {}}{nodeLabel}{linked, select, yes { 🔗} other {}}',
  },
  dynamicValues: {
    kind: {
      path: 'node.kind',
      cases: { hospital: 'hospital', school: 'school' },
    },
    nodeLabel: { path: 'node.$label' },
    linked: { path: 'node.$connected.near', cases: { yes: true } },
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
        nodeType={isNew ? undefined : 'place'}
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
          'How a node type labels its own nodes: one line of text a participant reads on every node of the type, written in the piped text editor. It can show the node’s attributes and the label the interview would otherwise choose, and give a version of the text for each answer of an attribute, for how the node is connected, and for conditions built with the rule builder. A version can hold further versions.',
      },
    },
  },
  args: {
    stageId: 'categorical-bin-1',
    sectionTitle: 'Dynamic label',
    children: <NodeLabel />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing written yet: the label box, and no conditions. */
export const NothingWrittenYet: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: LABEL }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Add condition' }),
    ).toBeEnabled();
  },
};

/**
 * An emoji for each kind of place, the label the interview would otherwise
 * choose, and a mark on a place joined to another. Each value is a pill; a
 * pill with versions opens when it is selected.
 */
export const AVersionForEachAnswer: Story = {
  args: { children: <NodeLabel initialValue={SWITCH_ON_KIND} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('textbox', { name: LABEL });
    // The field's value reaches the editor a turn after it mounts.
    await waitFor(() => expect(box).toHaveTextContent('kind'));
    await expect(box).toHaveTextContent('Default label');
    await expect(box).toHaveTextContent('Has a Near edge');
  },
};

/**
 * A node type that has not been saved has no attributes for a rule to name,
 * so its conditions wait until it has been.
 */
export const ANewNodeType: Story = {
  args: { children: <NodeLabel isNew /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await canvas.findByRole('textbox', { name: LABEL });
    await expect(
      canvas.queryByRole('button', { name: 'Add condition' }),
    ).toBeNull();
  },
};
