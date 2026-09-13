import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ProtocolBuilderClient } from '@codaco/protocol-builder-core/contract';

import {
  useResourceClient,
  useStagedResources,
  type ResourceClient,
} from '../../client.tsx';
import type { ResourceDescriptor } from '../../types.ts';
import { ResourceContextFrame } from './resourceContext.tsx';
import { createResourceHost, type CommittedResource } from './resourceHost.ts';

/**
 * A researcher can have two edits open at once — a codebook dialog over a
 * stage editor, two editors side by side — and each is its own
 * `ResourceClientProvider`.
 *
 * What they must not share is staging. An imported file belongs to the edit
 * that imported it until that edit's save promotes it or its cancel drops it,
 * so an edit that could see another's would offer the researcher a file the
 * other is still deciding about, and an edit that could drop another's would
 * take away the file the other was about to save. Neither is recoverable: the
 * bytes are only in the host.
 */

const ROSTER: CommittedResource = {
  kind: 'network',
  id: 'roster-1',
  name: 'Community roster',
  source: `${'a'.repeat(64)}.json`,
  bytes: '{"nodes":[],"edges":[]}',
};

const STAGE_EDITOR = 'stage-editor';
const CODEBOOK_DIALOG = 'codebook-dialog';

/** One edit's own view of the resources: its client and what it has staged. */
type OpenEdit = {
  client: ResourceClient | undefined;
  editId: string | undefined;
};

function Probe({ into }: Readonly<{ into: OpenEdit }>) {
  into.client = useResourceClient();
  into.editId = useStagedResources().editId;
  return null;
}

const clientOf = (edit: OpenEdit): ResourceClient => {
  if (edit.client === undefined) throw new Error('that edit is not open');
  return edit.client;
};

/**
 * Whatever the host will tell this edit about, by id — the protocol's
 * committed resources, plus what this edit itself has staged.
 */
async function listedTo(edit: OpenEdit): Promise<string[]> {
  const listed = await clientOf(edit).list();
  if (listed.status !== 'ok') throw new Error('the host refused to list');
  return listed.data.map((descriptor) => descriptor.id).toSorted();
}

/** Imports a file into one edit, and answers with the id it was staged under. */
async function importInto(edit: OpenEdit, name: string): Promise<string> {
  const staged = await clientOf(edit).stageUpload({
    requestId: `import-${name}`,
    kind: 'network',
    name,
    source: name,
    contentType: 'application/json',
    bytes: new TextEncoder().encode(`{"file":"${name}"}`),
  });
  if (staged.status !== 'ok') {
    throw new Error(`the host refused to stage ${name}`);
  }
  return staged.data.id;
}

/**
 * Both edits over one host, in one session — which is what a codebook dialog
 * opened from inside a stage editor is. The second closes when the test says
 * so, which is that dialog being cancelled.
 */
function renderTwoEdits(
  client: ProtocolBuilderClient,
  protocolId: string,
  edits: Readonly<{ stage: OpenEdit; dialog: OpenEdit }>,
) {
  const both = (dialogOpen: boolean) => (
    <>
      <ResourceContextFrame
        client={client}
        protocolId={protocolId}
        editId={STAGE_EDITOR}
      >
        <Probe into={edits.stage} />
      </ResourceContextFrame>
      {dialogOpen && (
        <ResourceContextFrame
          client={client}
          protocolId={protocolId}
          editId={CODEBOOK_DIALOG}
        >
          <Probe into={edits.dialog} />
        </ResourceContextFrame>
      )}
    </>
  );
  const view = render(both(true));
  return {
    closeTheDialog: async () => {
      await act(async () => {
        view.rerender(both(false));
      });
      edits.dialog.client = undefined;
    },
  };
}

const openEdits = () => ({
  stage: { client: undefined, editId: undefined } as OpenEdit,
  dialog: { client: undefined, editId: undefined } as OpenEdit,
});

describe('two edits open in one session', () => {
  it('are two different edits as far as the host is concerned', () => {
    const host = createResourceHost({ resources: [ROSTER] });
    const edits = openEdits();
    renderTwoEdits(host.client, host.protocolId, edits);

    // Named here, but the rule is that they differ: an editor that minted one
    // id for the whole session would have both of these the same, and every
    // assertion below would pass while the two edits shared their staging.
    expect(edits.stage.editId).toBe(STAGE_EDITOR);
    expect(edits.dialog.editId).toBe(CODEBOOK_DIALOG);
    expect(edits.stage.editId).not.toBe(edits.dialog.editId);
  });

  it('do not offer each other the files they have imported', async () => {
    const host = createResourceHost({ resources: [ROSTER] });
    const edits = openEdits();
    renderTwoEdits(host.client, host.protocolId, edits);

    const inTheStage = await importInto(edits.stage, 'from-the-stage.json');
    const inTheDialog = await importInto(edits.dialog, 'from-the-dialog.json');

    // Each edit is offered the protocol's own resource and its own import, and
    // nothing of the other's: a file the researcher has not saved yet is not
    // part of this protocol, and the other edit may still discard it.
    expect(await listedTo(edits.stage)).toEqual(
      [ROSTER.id, inTheStage].toSorted(),
    );
    expect(await listedTo(edits.dialog)).toEqual(
      [ROSTER.id, inTheDialog].toSorted(),
    );
  });

  it('cannot discard what the other imported', async () => {
    const host = createResourceHost({ resources: [ROSTER] });
    const edits = openEdits();
    renderTwoEdits(host.client, host.protocolId, edits);

    const inTheStage = await importInto(edits.stage, 'from-the-stage.json');

    const refused = await clientOf(edits.dialog).discardStaged(inTheStage);

    expect(refused.status).toBe('failed');
    // And it is still there for the edit that imported it, which is the half
    // that matters: a refusal reported over a file that had gone anyway would
    // be no protection at all.
    expect(await listedTo(edits.stage)).toContain(inTheStage);
  });

  it('leave the other’s imports alone when they are closed', async () => {
    const host = createResourceHost({ resources: [ROSTER] });
    const edits = openEdits();
    const { closeTheDialog } = renderTwoEdits(
      host.client,
      host.protocolId,
      edits,
    );

    const inTheStage = await importInto(edits.stage, 'from-the-stage.json');
    const inTheDialog = await importInto(edits.dialog, 'from-the-dialog.json');

    // Closing an edit without saving is what discards everything it staged.
    await closeTheDialog();

    // Its own import has gone, and the stage editor's — which the researcher
    // is still writing, and which its save has yet to promote — has not.
    expect(await listedTo(edits.stage)).toEqual(
      [ROSTER.id, inTheStage].toSorted(),
    );
    expect(await stagedAtTheHost(host.client, host.protocolId)).toEqual([
      inTheStage,
    ]);
    expect(await stagedAtTheHost(host.client, host.protocolId)).not.toContain(
      inTheDialog,
    );
  });
});

/**
 * Everything the stage editor's edit is still holding staged, asked of the
 * host rather than of the client's own bookkeeping: a discard the host did not
 * make would leave the two disagreeing, and the bytes are the host's.
 */
async function stagedAtTheHost(
  client: ProtocolBuilderClient,
  protocolId: string,
): Promise<string[]> {
  const listed = await client.resources.list({
    protocolId,
    editId: STAGE_EDITOR,
    status: 'staged',
  });
  if (listed.status !== 'ok') throw new Error('the host refused to list');
  return listed.data.resources
    .map((descriptor: ResourceDescriptor) => descriptor.id)
    .toSorted();
}
