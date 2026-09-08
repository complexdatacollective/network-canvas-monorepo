import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { ResourceGatewayProvider } from '../context.tsx';
import type {
  ProtocolBuilderResourceGateway,
  ResourceSecretStorage,
} from '../gateway.ts';
import { InMemoryResourceGateway } from '../InMemoryResourceGateway.ts';
import { overrideGateway } from '../overrideGateway.ts';
import ResourceSecretControl from './ResourceSecretControl.tsx';
import { API_KEY_RESOURCE } from './storyFixtures.ts';

/** A key of the shape a researcher pastes out of their map provider. */
const MAPBOX_KEY = 'pk.eyJ1IjoicmVzZWFyY2hlciIsImEiOiJzdG9yeWJvb2sifQ';

type SecretControlHostProps = Readonly<{
  /** What this host does with a key once the stage is saved. */
  secretStorage: ResourceSecretStorage;
  /** Whether the host will take the next key it is offered. */
  hostAcceptsKeys?: boolean;
}>;

/**
 * A host holding the key control and reporting what it was handed.
 *
 * It reports the descriptor, which is all the control ever gives it: the value
 * goes to the gateway and the opaque handle promotion needs is the session's,
 * captured where the secret was staged.
 */
function SecretControlHost({
  secretStorage,
  hostAcceptsKeys = true,
}: SecretControlHostProps) {
  const [gateway] = useState<ProtocolBuilderResourceGateway>(() => {
    const host = new InMemoryResourceGateway({
      committed: [API_KEY_RESOURCE],
    });
    if (!hostAcceptsKeys) host.failNext('stageSecret');
    // The in-memory host's own promotion writes the value into the protocol's
    // `apiKey` asset, which IS the `plaintext` answer — so it cannot honestly
    // say anything else about itself, and the vault story replaces the one
    // thing the control reads to decide what it tells the researcher.
    if (secretStorage === 'plaintext') return host;
    return overrideGateway(host, { secretStorage });
  });
  const [added, setAdded] = useState('No key has been added yet.');

  return (
    <ResourceGatewayProvider gateway={gateway}>
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
    </ResourceGatewayProvider>
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
          'Stages secret material — a map provider’s API key — without the editor ever holding on to it. The value exists in the control’s own state while it is being typed and nowhere else; staging hands it to the host and empties both inputs. Where a promoted key comes to rest is a fact about the host rather than about the editor, so the host says which it is and the control tells the researcher before they paste anything.',
      },
    },
  },
  args: { secretStorage: 'plaintext' },
  tags: ['autodocs'],
} satisfies Meta<typeof SecretControlHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Architect’s answer: the key is written into the protocol’s own asset, so it
 * travels inside the protocol file and inside every export of it. The
 * researcher is told so before they paste it, because they are the only person
 * who can decide whether that is acceptable for the key in their hand.
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
 * The answer a host with a secret store of its own gives. Saying "plain text"
 * here would be telling the researcher their key is going somewhere it is not,
 * which is its own kind of wrong.
 */
export const KeptByTheHost: Story = {
  args: { secretStorage: 'vault' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const key = canvas.getByLabelText('Key');
    await expect(key).toHaveAccessibleDescription(
      /kept by the host rather than saved inside your protocol/,
    );
    await expect(key).not.toHaveAccessibleDescription(/plain text/);
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
