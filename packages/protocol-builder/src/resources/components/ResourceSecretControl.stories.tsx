import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../client.tsx';
import ResourceSecretControl from './ResourceSecretControl.tsx';
import { API_KEY_RESOURCE, createStoryHost } from './storyFixtures.ts';

/** A key of the shape a researcher pastes out of their map provider. */
const MAPBOX_KEY = 'pk.eyJ1IjoicmVzZWFyY2hlciIsImEiOiJzdG9yeWJvb2sifQ';

type SecretControlHostProps = Readonly<{
  /** Whether the host will take the next key it is offered. */
  hostAcceptsKeys?: boolean;
}>;

/**
 * A host holding the key control and reporting what it was handed.
 *
 * It reports the descriptor, which is what a stage field stores: the value
 * goes to the host, which writes it into the protocol's own asset manifest at
 * promotion.
 */
function SecretControlHost({ hostAcceptsKeys = true }: SecretControlHostProps) {
  const [host] = useState(() =>
    createStoryHost({
      resources: [API_KEY_RESOURCE],
      ...(hostAcceptsKeys
        ? {}
        : { refuses: { procedure: 'stage', forever: true } as const }),
    }),
  );
  const [added, setAdded] = useState('No key has been added yet.');

  return (
    <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
      <ResourceClientProvider>
        <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
          <Paragraph intent="smallText" emphasis="muted" aria-live="polite">
            {added}
          </Paragraph>
          <ResourceSecretControl
            onStaged={(descriptor) =>
              setAdded(`The stage now refers to ${descriptor.id}.`)
            }
          />
        </main>
      </ResourceClientProvider>
    </ProtocolBuilder>
  );
}

const meta = {
  title: 'Protocol Builder/Resources/API key control',
  component: SecretControlHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Stages a map provider’s API key. The value exists in the control’s own state while it is being typed and nowhere else on screen; staging hands it to the host and empties both inputs, and what the stage is left holding is the asset id. A promoted key is written into the protocol’s own asset manifest, so it travels with every copy of the protocol file — which the control says before the researcher pastes anything.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SecretControlHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The key is written into the protocol’s own asset, so it travels inside the
 * protocol file and inside every export of it. The researcher is told so
 * before they paste it, because they are the only person who can decide
 * whether that is acceptable for the key in their hand.
 */
export const SavedInTheProtocol: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // The description, not the text on screen: a warning no assistive
    // technology ties to the input is one a researcher filling it never hears.
    await expect(canvas.getByLabelText('Key')).toHaveAccessibleDescription(
      /saved inside your protocol as plain text, so anyone you give the protocol file to can read it/,
    );
  },
};

/**
 * Adding one. The inputs are emptied the moment the host has the key — an
 * input still holding it is the key, on screen and in the page — and what the
 * stage is left holding is the asset id.
 */
export const AddingAKey: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.type(canvas.getByLabelText('Name'), 'Mapbox key');
    await userEvent.type(canvas.getByLabelText('Key'), MAPBOX_KEY);
    await userEvent.click(canvas.getByRole('button', { name: 'Add API key' }));

    await expect(
      await canvas.findByText('The stage now refers to staged-resource-1.'),
    ).toBeInTheDocument();
    // Both inputs are still mounted, which is what makes their emptiness an
    // assertion rather than a query that found nothing to look at.
    await expect(canvas.getByLabelText('Name')).toHaveValue('');
    await expect(canvas.getByLabelText('Key')).toHaveValue('');
    await expect(canvasElement.innerHTML).not.toContain(MAPBOX_KEY);
  },
};

/**
 * A host that could not take the key. Repeating the identical request is
 * offered, and is what settles a failure that may mean the host staged it
 * anyway: the same request id stages one key rather than a second copy of it.
 */
export const TheHostRefusedTheKey: Story = {
  args: { hostAcceptsKeys: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.type(canvas.getByLabelText('Name'), 'Mapbox key');
    await userEvent.type(canvas.getByLabelText('Key'), MAPBOX_KEY);
    await userEvent.click(canvas.getByRole('button', { name: 'Add API key' }));

    await expect(
      await canvas.findByText('the resource host is temporarily unavailable'),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Try adding the key again' }),
    ).toBeEnabled();
  },
};
