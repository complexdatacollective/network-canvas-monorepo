import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { enIntl } from '../../testing/i18n.ts';
import { ResourceClientProvider } from '../client.tsx';
import type { ResourcePickerKind } from './resourceKinds.ts';
import ResourceUploadControl from './ResourceUploadControl.tsx';
import {
  createStoryHost,
  fieldNotesFile,
  skylineImageFile,
} from './storyFixtures.ts';

type UploadControlHostProps = Readonly<{
  /** Which kinds this control will accept, and what it stages them as. */
  kind: Exclude<ResourcePickerKind, 'apikey'>;
  /** Whether the host will take the next file it is offered. */
  hostAcceptsFiles?: boolean;
  /** Somebody else holds the stage, so nothing can be imported into it. */
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
  const [host] = useState(() =>
    createStoryHost(
      hostAcceptsFiles
        ? {}
        : { refuses: { procedure: 'stage', forever: true } },
    ),
  );
  const [imported, setImported] = useState('Nothing has been imported yet.');

  return (
    <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
      <ResourceClientProvider>
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
      </ResourceClientProvider>
    </ProtocolBuilder>
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
          'Imports one file into the open stage edit, through the host contract alone. Two ways in, deliberately: a drop target for a pointer, and a file input that is a real, labelled, focusable control rather than a hidden one behind the drop target — dropping a file is not something a keyboard can do. The import is not finished until the host has read back what it staged, because a field left pointing at content the interview cannot read is a protocol that fails when it is used.',
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

    // The extension list is joined by `Intl.ListFormat`, so each language gets
    // its own conjunction. Built with the same formatter rather than written
    // out, because re-spelling CLDR's list punctuation here would be asserting
    // on this file's guess at it.
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      `That file cannot be imported here. Supported file types are: ${enIntl.formatList(
        ['.jpg', '.jpeg', '.gif', '.png', '.svg'],
      )}.`,
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

/** Nothing can be imported into a stage somebody else is holding. */
export const Spectating: Story = {
  args: { disabled: true },
};
