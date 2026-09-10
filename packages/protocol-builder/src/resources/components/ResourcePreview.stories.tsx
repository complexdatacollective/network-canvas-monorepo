import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';

import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../client.tsx';
import type { PreviewableResourceKind } from './resourceKinds.ts';
import ResourcePreview from './ResourcePreview.tsx';
import {
  AUDIO_RESOURCE,
  createStoryHost,
  IMAGE_RESOURCE,
  VIDEO_RESOURCE,
} from './storyFixtures.ts';

type ResourcePreviewHostProps = Readonly<{
  /** The resource to render, by the asset id a stage field would hold. */
  resourceId: string;
  kind: PreviewableResourceKind;
  /** The resource's name, which is what the media is announced as. */
  name: string;
  /** Whether the host can hand out a URL for it. */
  hostCanResolve?: boolean;
}>;

function ResourcePreviewHost({
  resourceId,
  kind,
  name,
  hostCanResolve = true,
}: ResourcePreviewHostProps) {
  const [host] = useState(() =>
    createStoryHost(
      hostCanResolve
        ? {}
        : { refuses: { procedure: 'preview', forever: true } },
    ),
  );

  return (
    <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
      <ResourceClientProvider>
        <main className="mx-auto max-w-2xl p-6">
          <ResourcePreview resourceId={resourceId} kind={kind} name={name} />
        </main>
      </ResourceClientProvider>
    </ProtocolBuilder>
  );
}

const meta = {
  title: 'Protocol Builder/Resources/Resource preview',
  component: ResourcePreviewHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Renders a resource’s content from a URL the host resolved. The URL is a lease rather than a fact — a host may answer with a signed link that stops resolving, and it says when by putting an expiry on its answer — so one that says so is renewed shortly before it does, alongside the URL it replaces rather than in place of it. The in-memory host these stories run over issues data URLs that never expire, so nothing here is renewed.',
      },
    },
  },
  args: {
    resourceId: IMAGE_RESOURCE.id,
    kind: 'image',
    name: IMAGE_RESOURCE.name,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ResourcePreviewHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The picture itself, named by the manifest's name for it. */
export const AnImage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('img', { name: IMAGE_RESOURCE.name }),
    ).toBeInTheDocument();
  },
};

/**
 * A player for the researcher's own imported media, which carries no caption
 * track — so its accessible name is the name the manifest records for it.
 *
 * The fixture's bytes are not a real MP4: a video short enough to write into a
 * fixture file is not a video at all. What this shows is the element, its
 * controls and its name, which is the whole of what the preview decides.
 */
export const AVideo: Story = {
  args: {
    resourceId: VIDEO_RESOURCE.id,
    kind: 'video',
    name: VIDEO_RESOURCE.name,
  },
};

/** The same, for audio. Its bytes are not a real MP3, for the same reason. */
export const SomeAudio: Story = {
  args: {
    resourceId: AUDIO_RESOURCE.id,
    kind: 'audio',
    name: AUDIO_RESOURCE.name,
  },
};

/**
 * The host could not hand out a URL. Nothing is on screen to keep, so the
 * failure is all there is to show — in the host's own researcher-facing words,
 * with the ask offered again.
 */
export const TheHostCannotAnswer: Story = {
  args: { hostCanResolve: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('the resource host is temporarily unavailable'),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Try loading the preview again' }),
    ).toBeEnabled();
  },
};
