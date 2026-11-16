import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { expect, userEvent, within } from 'storybook/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import createTimelineReducer from '~/ducks/middleware/timeline';
import activeProtocolReducer, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';

import ProtocolInfoCard from './ProtocolInfoCard';

const protocolNamed = (name: string): CurrentProtocol => ({
  name,
  description: '',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
});

// Each card has a store of its own, so the cards can sit side by side.
const createCardStore = (name: string) => {
  const store = configureStore({
    reducer: { activeProtocol: createTimelineReducer(activeProtocolReducer) },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(protocolNamed(name)));
  return store;
};

const CardNamed = ({ name }: { name: string }) => {
  const [store] = useState(() => createCardStore(name));
  return (
    <Provider store={store}>
      <ProtocolInfoCard />
    </Provider>
  );
};

const meta = {
  title: 'Components/ProtocolInfoCard',
  component: CardNamed,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CardNamed>;

export default meta;

type Story = StoryObj<typeof meta>;

// The name either side of each step in the heading size, counted in
// graphemes, and a legacy name far over the cap.
const NAMES = [
  'A'.repeat(32),
  'A'.repeat(33),
  'A'.repeat(64),
  'A'.repeat(65),
  'م'.repeat(342),
];

/** The name steps down in size as it grows, so a long name stays bounded. */
export const NameSizeSteps: Story = {
  args: { name: '' },
  render: () => (
    <div className="flex flex-col gap-8">
      {NAMES.map((name) => (
        <CardNamed key={name} name={name} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const sizes = within(canvasElement)
      .getAllByRole('textbox', { name: 'Protocol name' })
      .map((control) => Number.parseFloat(getComputedStyle(control).fontSize));
    const [upTo32, from33, upTo64, from65, legacy] = sizes;

    await expect(sizes).toHaveLength(NAMES.length);
    await expect(upTo32).toBeGreaterThan(from33 ?? Infinity);
    await expect(from33).toBe(upTo64);
    await expect(upTo64).toBeGreaterThan(from65 ?? Infinity);
    await expect(legacy).toBe(from65);
  },
};

/** The size follows the name as it is typed, not only once it is saved. */
export const NameSizeStepsWhileTyping: Story = {
  args: { name: 'A'.repeat(32) },
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const control = within(canvasElement).getByRole('textbox', {
      name: 'Protocol name',
    });
    const fontSize = () =>
      Number.parseFloat(getComputedStyle(control).fontSize);
    const before = fontSize();

    await userEvent.type(control, 'A', {
      initialSelectionStart: 32,
      initialSelectionEnd: 32,
    });

    await expect(control).toHaveValue('A'.repeat(33));
    await expect(fontSize()).toBeLessThan(before);
  },
};
