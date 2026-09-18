import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ProtocolBuilderClient } from '@codaco/protocol-builder-core/contract';

import type { ResourceDescriptor } from '../../types.ts';
import ResourceChoiceCard from '../ResourceChoiceCard.tsx';
import { flushPendingWork } from './asyncControls.ts';
import { renderInResourceContext, TEST_EDIT_ID } from './resourceContext.tsx';
import { createResourceHost, withResourceProcedures } from './resourceHost.ts';

async function stage(
  client: ProtocolBuilderClient,
  protocolId: string,
  contentKind: 'image' | 'video',
  name: string,
): Promise<ResourceDescriptor> {
  const contentType = contentKind === 'image' ? 'image/png' : 'video/mp4';
  const staged = await client.resources.stage({
    protocolId,
    editId: TEST_EDIT_ID,
    requestId: `request-${name}`,
    request: {
      kind: 'content',
      contentKind,
      name,
      source: name,
      contentType,
      bytes: new Blob([name], { type: contentType }),
    },
  });
  if (staged.status !== 'ok') throw new Error(`could not stage ${name}`);
  return staged.data.descriptor;
}

function renderCard(
  client: ProtocolBuilderClient,
  protocolId: string,
  descriptor: ResourceDescriptor,
  onSelect = vi.fn(),
) {
  renderInResourceContext(
    client,
    protocolId,
    <ResourceChoiceCard
      descriptor={descriptor}
      current={false}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

/**
 * The card's one control, and everything else on the card that could be
 * operated. A button holds only phrasing content, so anything interactive or
 * block-level inside it is a control a click never reaches or markup a
 * browser rewrites.
 */
function theOnlyControl(): HTMLElement {
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(1);
  const [button] = buttons as [HTMLElement];
  expect(
    button.querySelector('button, a, input, video, audio, div, p'),
  ).toBeNull();
  expect(document.querySelector('video[controls], audio[controls]')).toBeNull();
  return button;
}

describe('ResourceChoiceCard', () => {
  it('is chosen by its name, described by its badges', async () => {
    const { client, protocolId } = createResourceHost();
    const descriptor = await stage(client, protocolId, 'image', 'skyline.png');

    const onSelect = renderCard(client, protocolId, descriptor);

    expect(
      await screen.findByRole('img', { name: 'skyline.png' }),
    ).toBeInTheDocument();
    const button = theOnlyControl();
    expect(button).toHaveAccessibleName('skyline.png');
    expect(button).toHaveAccessibleDescription(/Image/);

    await userEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(descriptor);
  });

  it('shows a video as a picture, not a player', async () => {
    const { client, protocolId } = createResourceHost();
    const descriptor = await stage(client, protocolId, 'video', 'walk.mp4');

    renderCard(client, protocolId, descriptor);

    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    theOnlyControl();
  });

  it('leaves the type mark, not a retry, when the preview fails', async () => {
    const host = createResourceHost();
    const descriptor = await stage(
      host.client,
      host.protocolId,
      'image',
      'skyline.png',
    );
    let asked = 0;
    const client = withResourceProcedures(host.client, {
      preview: async () => {
        asked += 1;
        return {
          status: 'failed' as const,
          failure: {
            reason: 'unavailable' as const,
            message: 'the resource host is temporarily unavailable',
            retryable: true,
          },
        };
      },
    });

    renderCard(client, host.protocolId, descriptor);

    await waitFor(() => expect(asked).toBeGreaterThan(0));
    await flushPendingWork();
    expect(
      screen.queryByText('the resource host is temporarily unavailable'),
    ).toBeNull();
    theOnlyControl();
  });
});
