import { configureStore, type UnknownAction } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
  asEntityAttributeReference,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import activeProtocolReducer from '~/ducks/modules/activeProtocol';

import NodeLabelWorkerSection from './NodeLabelWorkerSection';

const protocol: CurrentProtocol = {
  name: 'Story protocol',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          name: { name: 'name', type: 'text', component: 'Text' },
          age: { name: 'age', type: 'number', component: 'Number' },
        },
      },
    },
  },
  stages: [
    {
      id: 'name-generator',
      type: 'NameGenerator',
      label: { en: 'Name generator' },
      subject: { entity: 'node', type: 'person' },
      form: {
        title: { en: 'Add a person' },
        fields: [
          {
            variable: asEntityAttributeReference('name'),
            prompt: { en: 'Name' },
          },
        ],
      },
      prompts: [{ id: 'prompt-1', text: { en: 'Name people' } }],
    },
  ],
};

const INITIALS = `function nodeLabelWorker({ node }) {
  const name = node.name || '';
  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}`;

type Present = { present: CurrentProtocol | null };

const createStoryStore = (nodeLabelWorker?: string) => {
  const initial: Present = {
    present: nodeLabelWorker ? { ...protocol, nodeLabelWorker } : protocol,
  };
  return configureStore({
    reducer: {
      activeProtocol: (state: Present = initial, action: UnknownAction) => ({
        present: activeProtocolReducer(state.present, action),
      }),
    },
  });
};

const meta = {
  title: 'Components/Codebook/NodeLabelWorkerSection',
  component: NodeLabelWorkerSection,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof NodeLabelWorkerSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoScript: Story = {
  decorators: [
    (Story) => (
      <Provider store={createStoryStore()}>
        <Story />
      </Provider>
    ),
  ],
};

export const WithScript: Story = {
  decorators: [
    (Story) => (
      <Provider store={createStoryStore(INITIALS)}>
        <Story />
      </Provider>
    ),
  ],
};

export const Editing: Story = {
  decorators: WithScript.decorators,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Edit script' }));

    const dialog = within(await within(document.body).findByRole('dialog'));
    await waitFor(
      () => expect(dialog.getAllByRole('listitem').length).toBeGreaterThan(0),
      { timeout: 20_000 },
    );
  },
};

export const ScriptThatCannotBeUsed: Story = {
  decorators: [
    (Story) => (
      <Provider store={createStoryStore('function nodeLabelWorker( {')}>
        <Story />
      </Provider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Edit script' }));

    const dialog = within(await within(document.body).findByRole('dialog'));
    await expect(
      await dialog.findByRole('alert', {}, { timeout: 20_000 }),
    ).toBeVisible();
  },
};
