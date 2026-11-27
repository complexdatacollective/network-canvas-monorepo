import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
  testId,
  testTypeId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  asEntityAttributeReference,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { ProtocolReadOnlyContext } from '~/hooks/useProtocolReadOnly';

import Layouts from './Layouts';

const PERSON = testTypeId('person');
const CLOSENESS = testVariableId('closeness-layout');
const SEATING = testVariableId('seating-layout');
const CHECKED_BY_A_RULE = testVariableId('checked-layout');
const UNUSED = testVariableId('unused-layout');

const label = (en: string) => ({ en });

// A Sociogram places people in Closeness and checks Checked in its filter; a
// Narrative shows Closeness and Seating, which no stage places anyone in.
const protocol: CurrentProtocol = {
  name: 'Layouts',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  assetManifest: {},
  codebook: {
    node: {
      [PERSON]: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
      },
    },
    layouts: {
      [CLOSENESS]: { name: 'Closeness' },
      [SEATING]: { name: 'Seating' },
      [CHECKED_BY_A_RULE]: { name: 'Checked' },
      [UNUSED]: { name: 'Unused' },
    },
  },
  stages: [
    {
      id: testId('sociogram'),
      type: 'Sociogram',
      label: label('Place your contacts'),
      subject: { entity: 'node', types: [PERSON] },
      layout: CLOSENESS,
      background: { concentricCircles: 4, skewedTowardCenter: true },
      prompts: [{ id: testId('sociogram-prompt'), text: label('Place them') }],
      filter: {
        join: 'OR',
        rules: [
          {
            type: 'node',
            id: testId('checked-rule'),
            options: {
              type: PERSON,
              attribute: asEntityAttributeReference(CHECKED_BY_A_RULE),
              operator: 'EXISTS',
            },
          },
        ],
      },
    },
    {
      id: testId('narrative'),
      type: 'Narrative',
      label: label('Tell us about them'),
      subject: { entity: 'node', types: [PERSON] },
      background: { concentricCircles: 4 },
      presets: [
        {
          id: testId('closeness-preset'),
          label: label('Closeness'),
          layout: CLOSENESS,
        },
        {
          id: testId('seating-preset'),
          label: label('Seating'),
          layout: SEATING,
        },
      ],
    },
  ],
};

const createStoryStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(protocolActions.setActiveProtocol(structuredClone(protocol)));
  return store;
};

const meta = {
  title: 'Components/Codebook/Layouts',
  component: Layouts,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <Provider store={createStoryStore()}>
        <div className="max-w-3xl">
          <Story />
        </div>
      </Provider>
    ),
  ],
} satisfies Meta<typeof Layouts>;

export default meta;

type Story = StoryObj<typeof meta>;

const entry = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement).getByRole('region', { name: `${name} layout` });

/** Every layout: placed and shown, only shown, named by a rule, and unused. */
export const AllLayouts: Story = {};

/** A layout that a stage places nodes in and another stage shows. */
export const UsedLayout: Story = {
  args: { search: 'Closeness' },
  play: async ({ canvasElement }) => {
    const closeness = within(entry(canvasElement, 'Closeness'));
    await expect(
      closeness.getByText('Stages that place nodes in it:'),
    ).toBeVisible();
    await expect(
      closeness.getByText('Stages that show its positions:'),
    ).toBeVisible();
    await expect(closeness.getByRole('link', { name: 'Person' })).toBeVisible();
    await expect(
      closeness.queryByRole('button', { name: 'Delete layout' }),
    ).not.toBeInTheDocument();
  },
};

/** A layout that a stage only shows: no node type has positions in it. */
export const ReadOnlyLayout: Story = {
  args: { search: 'Seating' },
  play: async ({ canvasElement }) => {
    const seating = within(entry(canvasElement, 'Seating'));
    await expect(
      seating.getByText('Stages that show its positions:'),
    ).toBeVisible();
    await expect(
      seating.queryByText('Node types that have positions in it:'),
    ).not.toBeInTheDocument();
  },
};

/** A layout that only a filter rule names still cannot be deleted. */
export const NamedOnlyByARule: Story = {
  args: { search: 'Checked' },
  play: async ({ canvasElement }) => {
    const checked = within(entry(canvasElement, 'Checked'));
    await expect(
      checked.getByText('Stages with rules that name it:'),
    ).toBeVisible();
    await expect(checked.queryByText('not in use')).not.toBeInTheDocument();
    await expect(
      checked.queryByRole('button', { name: 'Delete layout' }),
    ).not.toBeInTheDocument();
  },
};

/** An unused layout can be deleted. */
export const UnusedLayout: Story = {
  args: { search: 'Unused' },
  play: async ({ canvasElement }) => {
    const unused = within(entry(canvasElement, 'Unused'));
    await expect(unused.getByText('not in use')).toBeVisible();
    await userEvent.click(
      unused.getByRole('button', { name: 'Delete layout' }),
    );
    const dialog = await within(document.body).findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete layout' }),
    );
    await waitFor(() =>
      expect(
        within(canvasElement).queryByRole('region', { name: 'Unused layout' }),
      ).not.toBeInTheDocument(),
    );
  },
};

/** While another tab owns the protocol, an unused layout cannot be deleted. */
export const UnusedLayoutWhileLocked: Story = {
  args: { search: 'Unused' },
  decorators: [
    (Story) => (
      <ProtocolReadOnlyContext value>
        <Story />
      </ProtocolReadOnlyContext>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(entry(canvasElement, 'Unused')).getByRole('button', {
        name: 'Delete layout',
      }),
    ).toBeDisabled();
  },
};
