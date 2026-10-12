import { isInaccessible, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Redacted } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import type { ProtocolBuilderAdapter } from '../../../state/context.ts';
import type { ResourceDescriptor } from '../../types.ts';
import ResourceChoiceCard from '../ResourceChoiceCard.tsx';
import { flushPendingWork } from './asyncControls.ts';
import { renderInResourceContext, TEST_EDIT_ID } from './resourceContext.tsx';
import { createResourceHost, withResourceProcedures } from './resourceHost.ts';

async function stage(
  adapter: ProtocolBuilderAdapter,
  protocolId: string,
  contentKind: 'image' | 'video',
  name: string,
): Promise<ResourceDescriptor> {
  const contentType = contentKind === 'image' ? 'image/png' : 'video/mp4';
  const staged = await adapter.rpcCall('ResourcesStage', {
    protocolId,
    editId: TEST_EDIT_ID,
    requestId: `request-${name}`,
    request: {
      kind: 'content',
      contentKind,
      name: Redacted.make(name),
      source: Redacted.make(name),
      contentType,
      bytes: Redacted.make(new Uint8Array(new TextEncoder().encode(name))),
    },
  });
  if (staged.status !== 'ok') throw new Error(`could not stage ${name}`);
  return staged.data.descriptor;
}

function renderCard(
  adapter: ProtocolBuilderAdapter,
  protocolId: string,
  descriptor: ResourceDescriptor,
  onSelect = vi.fn(),
) {
  renderInResourceContext(
    adapter,
    protocolId,
    <ResourceChoiceCard
      descriptor={descriptor}
      current={false}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

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

function expectOnlyNamedBy(control: HTMLElement, name: string) {
  const others = Array.from(document.body.querySelectorAll('*')).filter(
    (element) => element !== control && !isInaccessible(element),
  );
  for (const element of others) {
    expect(element).not.toHaveAccessibleName(name);
  }
}

describe('ResourceChoiceCard', () => {
  it('is chosen by its name, described by its badges', async () => {
    const { adapter, protocolId } = createResourceHost();
    const descriptor = await stage(adapter, protocolId, 'image', 'skyline.png');

    const onSelect = renderCard(adapter, protocolId, descriptor);

    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    expect(document.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.queryByRole('img')).toBeNull();
    const button = theOnlyControl();
    expect(button).toHaveAccessibleName('skyline.png');
    expectOnlyNamedBy(button, 'skyline.png');
    expect(button).toHaveAccessibleDescription(/Image/);

    await userEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(descriptor);
  });

  it('shows a video as a picture, not a player', async () => {
    const { adapter, protocolId } = createResourceHost();
    const descriptor = await stage(adapter, protocolId, 'video', 'walk.mp4');

    renderCard(adapter, protocolId, descriptor);

    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    const video = document.querySelector('video');
    expect(video).toHaveAttribute('aria-hidden', 'true');
    expect(video).not.toHaveAttribute('aria-label');
    const button = theOnlyControl();
    expectOnlyNamedBy(button, 'walk.mp4');
  });

  it('leaves the type mark, not a retry, when the preview fails', async () => {
    const host = createResourceHost();
    const descriptor = await stage(
      host.adapter,
      host.protocolId,
      'image',
      'skyline.png',
    );
    let asked = 0;
    const adapter = withResourceProcedures(host, {
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

    renderCard(adapter, host.protocolId, descriptor);

    await waitFor(() => expect(asked).toBeGreaterThan(0));
    await flushPendingWork();
    expect(
      screen.queryByText('the resource host is temporarily unavailable'),
    ).toBeNull();
    theOnlyControl();
  });
});
