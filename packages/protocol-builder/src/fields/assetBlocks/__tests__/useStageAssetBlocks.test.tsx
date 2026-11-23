import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { RichTextAssetBlockKind } from '@codaco/fresco-ui/form/fields/RichTextEditor';

import { unsupportedResourceKindMessage } from '../../../resources/components/resourceKinds.ts';
import { readMessage } from '../../../testing/i18n.ts';
import { useStageAssetBlocks } from '../StageAssetBlocks.tsx';

// The resource browser is its own component with its own tests; here it is a
// stand-in that says what it was asked for and answers as the test tells it.
const browser = vi.hoisted(() => ({
  chosen: { id: 'image-1', kind: 'image' } as { id: string; kind: string },
  reference: vi.fn((_resourceId: string): unknown => ({
    status: 'ok',
    data: undefined,
  })),
}));

vi.mock('../../../resources/components/ResourceBrowserDialog.tsx', () => ({
  default: (props: {
    open: boolean;
    kind: string;
    onSelect: (resource: { id: string; kind: string }) => void;
    onClose: () => void;
  }) =>
    props.open ? (
      <div data-testid="browser" data-kind={props.kind}>
        <button type="button" onClick={() => props.onSelect(browser.chosen)}>
          Choose
        </button>
        <button type="button" onClick={props.onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

vi.mock('../../../resources/client.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../resources/client.tsx')>()),
  useResourceClient: () => ({ referenceStaged: browser.reference }),
}));

type Outcome = { kind: RichTextAssetBlockKind; assetId: string | undefined };

function Harness({
  enabled,
  outcomes,
}: {
  enabled: boolean;
  outcomes: Outcome[];
}) {
  const { assetBlocks, picker } = useStageAssetBlocks(enabled);
  return (
    <>
      <output data-testid="has-blocks">
        {String(assetBlocks !== undefined)}
      </output>
      {(['image', 'audio', 'video'] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => {
            const pick = assetBlocks?.pick;
            if (pick === undefined) return;
            void (async () => {
              const assetId = await pick(kind);
              outcomes.push({ kind, assetId });
            })();
          }}
        >
          {`pick ${kind}`}
        </button>
      ))}
      {picker}
    </>
  );
}

const setup = (enabled = true) => {
  const outcomes: Outcome[] = [];
  const user = userEvent.setup();
  const view = render(<Harness enabled={enabled} outcomes={outcomes} />);
  return { user, outcomes, ...view };
};

const reset = () => {
  browser.chosen = { id: 'image-1', kind: 'image' };
  browser.reference.mockReset();
  browser.reference.mockReturnValue({ status: 'ok', data: undefined });
};

describe('useStageAssetBlocks', () => {
  it('gives no blocks and draws no picker when the field does not hold them', async () => {
    reset();
    const { user, outcomes } = setup(false);

    expect(screen.getByTestId('has-blocks')).toHaveTextContent('false');
    await user.click(screen.getByRole('button', { name: 'pick image' }));
    expect(screen.queryByTestId('browser')).toBeNull();
    expect(outcomes).toEqual([]);
  });

  it('opens the browser for the kind asked for, and resolves with the id chosen', async () => {
    reset();
    browser.chosen = { id: 'video-7', kind: 'video' };
    const { user, outcomes } = setup();

    expect(screen.getByTestId('has-blocks')).toHaveTextContent('true');
    expect(screen.queryByTestId('browser')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'pick video' }));
    expect(screen.getByTestId('browser')).toHaveAttribute('data-kind', 'video');

    await user.click(screen.getByRole('button', { name: 'Choose' }));

    await waitFor(() => {
      expect(outcomes).toEqual([{ kind: 'video', assetId: 'video-7' }]);
    });
    expect(browser.reference).toHaveBeenCalledExactlyOnceWith('video-7');
    expect(screen.queryByTestId('browser')).toBeNull();
  });

  it('resolves with nothing when the browser is closed', async () => {
    reset();
    const { user, outcomes } = setup();

    await user.click(screen.getByRole('button', { name: 'pick image' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(outcomes).toEqual([{ kind: 'image', assetId: undefined }]);
    });
    expect(screen.queryByTestId('browser')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refuses a resource of the wrong kind, says so, and resolves with nothing', async () => {
    reset();
    browser.chosen = { id: 'roster-1', kind: 'network' };
    const { user, outcomes } = setup();

    await user.click(screen.getByRole('button', { name: 'pick image' }));
    await user.click(screen.getByRole('button', { name: 'Choose' }));

    await waitFor(() => {
      expect(outcomes).toEqual([{ kind: 'image', assetId: undefined }]);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      readMessage(unsupportedResourceKindMessage('image')),
    );
    // Refused before the edit was asked to hold it.
    expect(browser.reference).not.toHaveBeenCalled();
  });

  it('refuses a resource the edit will not let a field hold, with the edit’s reason', async () => {
    reset();
    browser.reference.mockReturnValue({
      status: 'failed',
      failure: { reason: 'not-found', message: 'It was just discarded.' },
    });
    const { user, outcomes } = setup();

    await user.click(screen.getByRole('button', { name: 'pick image' }));
    await user.click(screen.getByRole('button', { name: 'Choose' }));

    await waitFor(() => {
      expect(outcomes).toEqual([{ kind: 'image', assetId: undefined }]);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'It was just discarded.',
    );
  });

  it('clears an earlier refusal when asked again', async () => {
    reset();
    browser.chosen = { id: 'roster-1', kind: 'network' };
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'pick image' }));
    await user.click(screen.getByRole('button', { name: 'Choose' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'pick image' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('settles an asking that is not yet answered with nothing when asked again', async () => {
    reset();
    browser.chosen = { id: 'audio-2', kind: 'audio' };
    const { user, outcomes } = setup();

    await user.click(screen.getByRole('button', { name: 'pick image' }));
    await user.click(screen.getByRole('button', { name: 'pick audio' }));

    // The first, answered by the second asking.
    await waitFor(() => {
      expect(outcomes).toEqual([{ kind: 'image', assetId: undefined }]);
    });
    expect(screen.getByTestId('browser')).toHaveAttribute('data-kind', 'audio');

    await user.click(screen.getByRole('button', { name: 'Choose' }));
    await waitFor(() => {
      expect(outcomes).toEqual([
        { kind: 'image', assetId: undefined },
        { kind: 'audio', assetId: 'audio-2' },
      ]);
    });
  });

  it('settles an asking with nothing when the field goes away', async () => {
    reset();
    const { user, outcomes, unmount } = setup();

    await user.click(screen.getByRole('button', { name: 'pick image' }));
    act(() => {
      unmount();
    });

    await waitFor(() => {
      expect(outcomes).toEqual([{ kind: 'image', assetId: undefined }]);
    });
  });
});
