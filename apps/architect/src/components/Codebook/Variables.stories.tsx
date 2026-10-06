import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useState } from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';

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

const horizontalScrollPortOf = (element: HTMLElement) => {
  for (
    let ancestor = element.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const { overflowX } = getComputedStyle(ancestor);
    if (overflowX === 'auto' || overflowX === 'scroll') return ancestor;
  }
  throw new Error('The table has no horizontal scroll port.');
};

export const LongAttributeName: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scrollPort = horizontalScrollPortOf(canvas.getByRole('table'));

    expect(scrollPort.scrollWidth).toBeLessThanOrEqual(
      scrollPort.clientWidth + 1,
    );

    const label = canvas.getByText(LONG_NAME);
    expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);

    const portRight = scrollPort.getBoundingClientRect().right;
    const rowButtons = canvas.getAllByRole('button', {
      name: /Edit attribute label|Delete attribute|In use — cannot be deleted/,
    });
    expect(rowButtons).toHaveLength(variables.length * 2);
    for (const button of rowButtons) {
      expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(
        portRight + 1,
      );
    }

    expect(
      canvas.getByRole('button', { name: `Edit attribute name: ${LONG_NAME}` }),
    ).toBeVisible();
  },
};

/** A protocol written in English and declared in French, saved by the real reducers. */
const createBilingualStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });
  store.dispatch(
    setActiveProtocol({
      name: 'Study',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
      assetManifest: {},
      codebook: {
        node: {
          person: {
            name: 'Person',
            label: { en: 'Person' },
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              [SHORT_NAME_ID]: {
                name: 'age',
                type: 'number',
                label: 'Age',
              },
            },
          },
        },
        edge: {},
        ego: { variables: {} },
      },
      stages: [],
    }),
  );
  return store;
};

const BilingualStore = ({ children }: { children: ReactNode }) => {
  const [store] = useState(createBilingualStore);
  return <Provider store={store}>{children}</Provider>;
};

/**
 * The label button beside each attribute edits the words participants are
 * shown for it, in each of the protocol's languages. The editor opens in the
 * default language; the French label is written beside the English.
 */
export const EditLabelInSeveralLanguages: Story = {
  args: { variables: variables.filter(({ id }) => id === SHORT_NAME_ID) },
  decorators: [
    (Story) => (
      <BilingualStore>
        <Story />
      </BilingualStore>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const openLabel = async () => {
      await userEvent.click(
        canvas.getByRole('button', { name: 'Edit attribute label: age' }),
      );
      return canvas.findByRole('textbox', { name: 'Attribute label' });
    };
    const chooseFrench = async () => {
      const trigger = canvas.getByRole('button', { name: /Editing language/ });
      await userEvent.click(trigger);
      // The menu portals beside the modal dialog rather than inside it, so the
      // dialog hides it from the accessibility tree.
      await userEvent.click(
        await canvas.findByRole('menuitemradio', {
          name: /^français/,
          hidden: true,
        }),
      );
      // The menu returns focus to its trigger at the end of its exit
      // animation; typing before then would land on the trigger.
      await waitFor(async () => {
        await expect(trigger).toHaveFocus();
      });
    };

    await expect(await openLabel()).toHaveValue('Age');
    await chooseFrench();
    const french = canvas.getByRole('textbox', { name: 'Attribute label' });
    await expect(french).toHaveValue('');
    await userEvent.type(french, 'Âge');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      await expect(canvas.queryByRole('dialog')).toBeNull();
    });

    await expect(await openLabel()).toHaveValue('Age');
    await chooseFrench();
    await expect(
      canvas.getByRole('textbox', { name: 'Attribute label' }),
    ).toHaveValue('Âge');
  },
};
