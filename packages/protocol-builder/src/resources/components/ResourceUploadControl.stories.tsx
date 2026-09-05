import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { ResourceGatewayProvider } from '../context.tsx';
import { InMemoryResourceGateway } from '../InMemoryResourceGateway.ts';
import type { ResourcePickerKind } from './resourceKinds.ts';
import ResourceUploadControl from './ResourceUploadControl.tsx';
import {
  fieldNotesFile,
  PROTOCOL_RESOURCES,
  skylineImageFile,
} from './storyFixtures.ts';

type UploadControlHostProps = Readonly<{
  /** Which kinds this control will accept, and what it stages them as. */
  kind: Exclude<ResourcePickerKind, 'apikey'>;
  /** Whether the host will take the next file it is offered. */
  hostAcceptsFiles?: boolean;
  /** The session is open for reading, so nothing can be imported into it. */
  disabled?: boolean;
}>;

/**
 * A host holding the import control and reporting what it staged, standing in
 * for the resource browser this control really lives inside.
 */
function UploadControlHost({
  kind,
  hostAcceptsFiles = true,
  disabled = false,
}: UploadControlHostProps) {
  const [gateway] = useState(() => {
    const host = new InMemoryResourceGateway({
      committed: [...PROTOCOL_RESOURCES],
    });
    if (!hostAcceptsFiles) host.failNext('stageUpload');
    return host;
  });
  const [imported, setImported] = useState('Nothing has been imported yet.');

  return (
    <ResourceGatewayProvider gateway={gateway}>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <Paragraph intent="smallText" emphasis="muted" aria-live="polite">
          {imported}
        </Paragraph>
        <ResourceUploadControl
          kind={kind}
          disabled={disabled}
          onStaged={(descriptor) =>
            setImported(
              `${descriptor.name} was staged as ${descriptor.id}, and is not saved yet.`,
            )
          }
        />
      </main>
    </ResourceGatewayProvider>
  );
}

const meta = {
  title: 'Protocol Builder/Resources/File import',
  component: UploadControlHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Imports one file into the editing session through the gateway alone. Two ways in, deliberately: a drop target for a pointer, and a file input that is a real, labelled, focusable control rather than a hidden one behind the drop target — dropping a file is not something a keyboard can do. The import is not finished until the host has read back what it staged, because a field left pointing at content the interview cannot read is a protocol that fails when it is used.',
      },
    },
  },
  args: { kind: 'image' },
  tags: ['autodocs'],
} satisfies Meta<typeof UploadControlHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Waiting for a file, by drop or by the input beneath it. */
export const Waiting: Story = {};

/**
 * A staged file. It takes its asset id immediately, so the field that asked
 * for it can point at it while the host holds the bytes outside the protocol.
 */
export const ImportingAFile: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.upload(
      canvas.getByLabelText('Choose a file from your computer'),
      skylineImageFile(),
    );

    await expect(
      await canvas.findByText(
        'skyline.svg was staged as staged-resource-1, and is not saved yet.',
      ),
    ).toBeInTheDocument();
  },
};

/**
 * A file this control does not accept, refused before a byte of it is read —
 * the file picked by mistake is the large one, and the researcher is told
 * which types would work instead.
 */
export const AFileOfTheWrongKind: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // `accept` is a hint the browser applies to its own file dialog, and the
    // control refuses the file itself because that hint is not a guarantee: a
    // researcher can pick "all files" in that dialog, and a dropped file never
    // meets it at all. Simulating the accept filter here would mean the story
    // never reached the refusal it is about.
    await userEvent
      .setup({ applyAccept: false })
      .upload(
        canvas.getByLabelText('Choose a file from your computer'),
        fieldNotesFile(),
      );

    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'That file cannot be imported here. Supported file types are: .jpg, .jpeg, .gif, .png, .svg.',
    );
  },
};

/**
 * A host that could not take the file. Repeating the identical request is
 * offered, and repeating it is safe: the file carries one request id, so an
 * uncertain import that the host actually kept is not imported twice.
 */
export const TheHostRefusedTheFile: Story = {
  args: { hostAcceptsFiles: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.upload(
      canvas.getByLabelText('Choose a file from your computer'),
      skylineImageFile(),
    );

    await expect(
      await canvas.findByText('the resource host is temporarily unavailable'),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Try importing the file again' }),
    ).toBeEnabled();
  },
};

/** Nothing can be imported into a session that is open for reading. */
export const Spectating: Story = {
  args: { disabled: true },
};
