import { screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import {
  useResourceClient,
  useStagedResources,
  type ResourceClient,
} from '../client.tsx';
import { useDialogUploadCheckpoint } from '../useDialogUploadCheckpoint.ts';

/** What the stage edit has staged, and the client to import with, as read last. */
const openEdit: {
  client: ResourceClient | undefined;
  staged: readonly string[];
} = { client: undefined, staged: [] };

function EditProbe() {
  const client = useResourceClient();
  const { staged } = useStagedResources();
  useEffect(() => {
    openEdit.client = client;
    openEdit.staged = staged.map(({ id }) => id);
  }, [client, staged]);
  return null;
}

const importImage = async (name: string): Promise<string> => {
  const result = await openEdit.client?.stageUpload({
    requestId: `import-${name}`,
    kind: 'image',
    name,
    source: `${name}.svg`,
    contentType: 'image/svg+xml',
    bytes: new Uint8Array([1, 2, 3]),
  });
  if (result?.status !== 'ok') throw new Error(`${name} was not staged`);
  return result.data.id;
};

/** A dialog over the stage that imports files, standing in for the codebook's. */
function ImportingDialog({ onClose }: Readonly<{ onClose: () => void }>) {
  const keepUploads = useDialogUploadCheckpoint(true);
  return (
    <div role="dialog" aria-label="Importing dialog">
      <button type="button" onClick={() => void importImage('in-dialog')}>
        Import in dialog
      </button>
      <button
        type="button"
        onClick={() => {
          keepUploads();
          onClose();
        }}
      >
        Save dialog
      </button>
      <button type="button" onClick={onClose}>
        Cancel dialog
      </button>
    </div>
  );
}

function StageWithADialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <EditProbe />
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open && <ImportingDialog onClose={() => setOpen(false)} />}
    </>
  );
}

const importFromTheDialog = async (
  harness: ReturnType<typeof renderStageEditor>,
) => {
  await harness.user.click(screen.getByRole('button', { name: 'Open dialog' }));
  const before = openEdit.staged.length;
  await harness.user.click(
    screen.getByRole('button', { name: 'Import in dialog' }),
  );
  await waitFor(() => expect(openEdit.staged).toHaveLength(before + 1));
  return openEdit.staged.at(-1);
};

/**
 * A dialog inside a stage editor shares the stage edit's staged files, so the
 * stage's save would promote whatever it imported. A cancelled dialog takes
 * its files back; the stage's own stay.
 */
describe('files imported in a dialog over a stage', () => {
  it('are discarded with a cancelled dialog, and the stage’s own are kept', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: <StageWithADialog />,
    });
    await waitFor(() => expect(openEdit.client).toBeDefined());
    const stagesOwn = await importImage('stage-own');
    await waitFor(() => expect(openEdit.staged).toEqual([stagesOwn]));

    const fromDialog = await importFromTheDialog(harness);
    expect(fromDialog).not.toBe(stagesOwn);
    await harness.user.click(
      screen.getByRole('button', { name: 'Cancel dialog' }),
    );

    await waitFor(() => expect(openEdit.staged).toEqual([stagesOwn]));
  });

  it('stay with the stage once the dialog’s save has gone through', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: <StageWithADialog />,
    });
    await waitFor(() => expect(openEdit.client).toBeDefined());

    const fromDialog = await importFromTheDialog(harness);
    await harness.user.click(
      screen.getByRole('button', { name: 'Save dialog' }),
    );

    expect(
      screen.queryByRole('dialog', { name: 'Importing dialog' }),
    ).toBeNull();
    // A discard would be a request of its own: one more import, answered
    // after it, is what shows none was made rather than one still on its way.
    const later = await importImage('later');
    await waitFor(() => expect(openEdit.staged).toContain(later));
    expect(openEdit.staged).toEqual([fromDialog, later]);
  });
});
