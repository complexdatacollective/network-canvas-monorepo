import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { expect, within } from 'storybook/test';

import Variables from './Variables';

const LONG_NAME =
  'participant_neighbourhood_social_support_contact_frequency_last_twelve_months';

const LONG_NAME_ID = 'long-name';
const SHORT_NAME_ID = 'short-name';

const createStoryStore = () =>
  createStore(() => ({
    activeProtocol: {
      present: {
        stages: [],
        codebook: {
          node: {
            person: {
              variables: {
                [LONG_NAME_ID]: { name: LONG_NAME, type: 'text' },
                [SHORT_NAME_ID]: { name: 'age', type: 'number' },
              },
            },
          },
          edge: {},
          ego: { variables: {} },
        },
      },
    },
  }));

const variables = [
  {
    id: LONG_NAME_ID,
    name: LONG_NAME,
    component: 'Text',
    inUse: true,
    usage: [{ id: 'stage-1', label: 'Roster' }],
    usageString: 'Roster',
  },
  {
    id: SHORT_NAME_ID,
    name: 'age',
    component: 'Number',
    inUse: false,
    usage: [],
  },
];

const meta = {
  title: 'Components/Codebook/Variables',
  component: Variables,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Provider store={createStoryStore()}>
        <div className="w-[48rem]">
          <Story />
        </div>
      </Provider>
    ),
  ],
  args: { entity: 'node' as const, type: 'person', variables },
} satisfies Meta<typeof Variables>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LongAttributeName: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const table = canvasElement.querySelector('table');
    if (!table?.parentElement) throw new Error('table scroll port not found');
    const scrollPort = table.parentElement;

    expect(scrollPort.scrollWidth).toBeLessThanOrEqual(
      scrollPort.clientWidth + 1,
    );

    const label = canvas.getByText(LONG_NAME);
    expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);

    const portRight = scrollPort.getBoundingClientRect().right;
    const deleteButtons = canvas.getAllByRole('button', {
      name: /Delete attribute|In use — cannot be deleted/,
    });
    expect(deleteButtons).toHaveLength(variables.length);
    for (const button of deleteButtons) {
      expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(
        portRight + 1,
      );
    }

    expect(
      canvas.getByRole('button', { name: `Edit attribute name: ${LONG_NAME}` }),
    ).toBeVisible();
  },
};
