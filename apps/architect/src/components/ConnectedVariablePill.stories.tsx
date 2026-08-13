import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { expect, screen, userEvent, waitFor } from 'storybook/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';

import ConnectedVariablePill from './ConnectedVariablePill';

const VARIABLE_UUID = 'story-participant-age';
const VARIABLE_NAME = 'participant_age_that_could_be_applied';
const PILL_NAME = `${VARIABLE_NAME}, number variable, Required, Minimum value, Maximum value`;

const STORY_PROTOCOL = {
  schemaVersion: 8,
  name: 'Connected variable pill story',
  description: '',
  lastModified: new Date(0).toISOString(),
  stages: [],
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-1',
        variables: {
          [VARIABLE_UUID]: {
            name: VARIABLE_NAME,
            type: 'number',
            validation: {
              required: true,
              minValue: 18,
              maxValue: 100,
            },
            synthetic: {
              distribution: 'normal',
              mean: 42,
              sd: 14,
              min: 18,
              max: 100,
            },
          },
        },
      },
    },
    edge: {},
    ego: { variables: {} },
  },
} as unknown as CurrentProtocol;

const storyStore = configureStore({ reducer: rootReducer });
storyStore.dispatch(setActiveProtocol(STORY_PROTOCOL));

type StoryArgs = {
  containerWidth: number;
  entity: 'node';
  type: string;
  uuid: string;
};

const meta = {
  title: 'Components/ConnectedVariablePill',
  component: ConnectedVariablePill,
  decorators: [
    (Story) => (
      <Provider store={storyStore}>
        <Story />
      </Provider>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
  args: {
    containerWidth: 390,
    entity: 'node',
    type: 'person',
    uuid: VARIABLE_UUID,
  },
  argTypes: {
    containerWidth: {
      control: { type: 'range', min: 240, max: 900, step: 10 },
      description: 'Width of the visible story container in pixels.',
    },
    uuid: { control: false },
  },
  render: ({ containerWidth, entity, type, uuid }) => (
    <div
      className="bg-surface-2 flex max-w-full rounded p-8"
      style={{ width: `${containerWidth}px` }}
    >
      <ConnectedVariablePill entity={entity} type={type} uuid={uuid} />
    </div>
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The pill is the disclosure control for its summary popover, so it has to
 * announce itself as one: keyboard users arrive on a button that reports
 * whether the panel of actions is open, and can bring the panel back after
 * dismissing it without reaching for the mouse.
 */
export const SummaryDisclosure: Story = {
  play: async () => {
    const pill = await screen.findByRole('button', { name: PILL_NAME });

    await expect(pill).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(pill).toHaveAttribute('aria-expanded', 'false');

    pill.focus();

    await waitFor(() => expect(pill).toHaveAttribute('aria-expanded', 'true'));
    // aria-haspopup names what actually appears, so the summary has to be the
    // dialog the pill promised, carrying the actions it promised.
    await expect(await screen.findByRole('dialog')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Rename' })).toBeVisible();
    await expect(
      screen.getByRole('button', { name: 'Configure Synthetic Data' }),
    ).toBeVisible();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(pill).toHaveAttribute('aria-expanded', 'false'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull(),
    );

    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(pill).toHaveAttribute('aria-expanded', 'true'));
    await expect(
      await screen.findByRole('button', { name: 'Rename' }),
    ).toBeVisible();
  },
};
