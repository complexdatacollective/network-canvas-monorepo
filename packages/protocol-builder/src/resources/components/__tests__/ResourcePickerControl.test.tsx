import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  InMemoryCompoundHost,
  type InMemoryCompoundHostLease,
} from '../../../compound-edit/InMemoryCompoundHost.ts';
import ProtocolField from '../../../form/ProtocolField.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
  type CompoundSectionEdit,
  type FinishRequest,
  type ProtocolBuilderPresence,
} from '../../../session.ts';
import {
  resourceFailure,
  type ProtocolBuilderResourceGateway,
  type ResourceContent,
  type ResourceInspection,
  type ResourceResult,
} from '../../gateway.ts';
import {
  InMemoryResourceGateway,
  type InMemoryResourceSeed,
} from '../../InMemoryResourceGateway.ts';
import ResourcePickerControl from '../ResourcePickerControl.tsx';
import {
  deferred,
  flushPendingWork,
  overrideGateway,
} from './overrideGateway.ts';
import { renderResourceEditor } from './renderResourceEditor.tsx';

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

const ROSTER = JSON.stringify({
  nodes: [
    { attributes: { name: 'Ada', age: 36 } },
    { attributes: { name: 'Grace', age: 41 } },
  ],
  edges: [{ from: 0, to: 1 }],
});

/** The same roster as a spreadsheet export: one node per row, no edges. */
const CSV_ROSTER = 'name,age\nAda,36\nGrace,41\n';

const imageSeed: InMemoryResourceSeed = {
  kind: 'image',
  id: 'image-1',
  name: 'Neighbourhood photo',
  source: 'neighbourhood.png',
  contentType: 'image/png',
  bytes: bytesOf('png-bytes'),
};

const videoSeed: InMemoryResourceSeed = {
  kind: 'video',
  id: 'video-1',
  name: 'Interview walkthrough',
  source: 'walkthrough.mp4',
  contentType: 'video/mp4',
  bytes: bytesOf('mp4-bytes'),
};

const audioSeed: InMemoryResourceSeed = {
  kind: 'audio',
  id: 'audio-1',
  name: 'Spoken instructions',
  source: 'instructions.mp3',
  contentType: 'audio/mpeg',
  bytes: bytesOf('mp3-bytes'),
};

const networkSeed: InMemoryResourceSeed = {
  kind: 'network',
  id: 'network-1',
  name: 'Community roster',
  source: 'community.json',
  contentType: 'application/json',
  bytes: bytesOf(ROSTER),
};

/** A second image, so a field can be moved off the one it is holding. */
const secondImageSeed: InMemoryResourceSeed = {
  kind: 'image',
  id: 'image-2',
  name: 'Community centre',
  source: 'centre.png',
  contentType: 'image/png',
  bytes: bytesOf('png-bytes-2'),
};

function imageField() {
  return (
    <ProtocolField
      component={ResourcePickerControl}
      name="backgroundImage"
      label="Background image"
      kind="image"
    />
  );
}

function rosterField() {
  return (
    <ProtocolField
      component={ResourcePickerControl}
      name="dataSource"
      label="Roster"
      kind="network"
    />
  );
}

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const assetsSection = sectionId({ kind: 'assets' });
const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });

const rosterFields: SectionDoc = {
  label: 'Roster',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'prompt-1', text: 'Pick someone you know' }],
  behaviours: {},
};

const presence: ProtocolBuilderPresence = {
  sessionId: 'tab-primary',
  userId: 'user-primary',
  displayName: 'Primary editor',
  sectionId: stageSection,
  mode: 'editing',
};
const lease: InMemoryCompoundHostLease = {
  sectionId: stageSection,
  leaseOwner: 'owner-primary',
  leaseEpoch: 4n,
  holder: presence,
};

type RosterFixtureOptions = Readonly<{
  gateway: ProtocolBuilderResourceGateway;
  /** Runs inside the finish apply, where the promotion is still undecided. */
  duringApply?: () => Promise<void>;
}>;

/**
 * The whole stack a host wires around a roster picker: a compound host holding
 * the protocol, the resource host, and a session over both. `onCommands` is
 * the live-applying host — the one that must never be handed a command naming
 * a resource whose manifest entry does not exist yet.
 */
function createRosterFixture(options: RosterFixtureOptions) {
  const protocolSections: Record<string, SectionDoc> = {
    [settingsSection]: { name: 'Resource pickers', schemaVersion: 8 },
    [stageOrderSection]: { stages: ['stage-1'] },
    [stageSection]: {
      id: 'stage-1',
      type: 'NameGeneratorRoster',
      ...rosterFields,
    },
    [assetsSection]: {},
    [personSection]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {},
    },
  };
  const host = new InMemoryCompoundHost({
    protocolSections,
    manifestRevision: { sequence: 7n, hash: 'revision-7' },
    leases: [lease],
  });
  const onCommands = vi.fn();
  let finishes = 0;
  const onFinish = vi.fn(
    async ({ pendingCommands, resourceManifest }: FinishRequest) => {
      await options.duringApply?.();
      const sections = host.getSnapshot().protocolSections;
      const stageCommands = pendingCommands.flatMap((batch) => [
        ...batch.commands,
      ]);
      const edits: CompoundSectionEdit[] = [];
      if (stageCommands.length > 0) {
        edits.push({
          kind: 'update',
          sectionId: stageSection,
          expectedContentHash: contentHash(sections[stageSection] ?? {}),
          commands: stageCommands,
        });
      }
      if (resourceManifest !== undefined) {
        edits.push({
          kind: 'update',
          sectionId: assetsSection,
          expectedContentHash: contentHash(sections[assetsSection] ?? {}),
          commands: [...resourceManifest.commands],
        });
      }
      const result = host.submit({
        id: `finish-${++finishes}`,
        description: 'Finish the stage',
        edits,
        authority: {
          sectionId: stageSection,
          leaseOwner: 'owner-primary',
          leaseEpoch: 4n,
        },
      });
      if (result.status !== 'applied') {
        throw new Error(
          result.status === 'failed' ? result.message : 'the sections are held',
        );
      }
    },
  );

  const session = new ProtocolBuilderSessionStore({
    identity: createStageIdentity('NameGeneratorRoster', () => 'stage-1'),
    fields: rosterFields,
    protocolSections: host.getSnapshot().protocolSections,
    manifestRevision: host.getSnapshot().manifestRevision,
    access: { mode: 'editable', leaseOwner: 'owner-primary', leaseEpoch: 4n },
    resourceGateway: options.gateway,
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({ ...sections, [stageSection]: stageDocument }),
    onCommands,
    onFinish,
  });

  return { host, onCommands, onFinish, session };
}

describe('ResourcePickerControl', () => {
  it('sets the field to the id of an image chosen from the protocol', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway({ committed: [imageSeed] });
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="backgroundImage"
          label="Background image"
          kind="image"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Neighbourhood photo' }),
    );

    // The asset id, which is exactly how the protocol format spells a
    // reference to a resource.
    await waitFor(() => expect(fieldValue('backgroundImage')).toBe('image-1'));
    expect(
      await screen.findByRole('img', { name: 'Neighbourhood photo' }),
    ).toBeVisible();
  });

  it('stages an imported image and sets the field to the new id', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="backgroundImage"
          label="Background image"
          kind="image"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );

    await waitFor(() =>
      expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
    );
    // Staged, not committed: the protocol does not hold it yet, and the field
    // says so rather than implying the import is saved.
    expect(await screen.findByText('Imported, not yet saved')).toBeVisible();
    expect(gateway.getCommittedManifest()).toEqual({});
  });

  it('previews a chosen video', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway({ committed: [videoSeed] });
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="video"
          label="Stage video"
          kind="video"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select a video' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Interview walkthrough' }),
    );

    await waitFor(() => expect(fieldValue('video')).toBe('video-1'));
    const preview = await screen.findByLabelText('Interview walkthrough');
    expect(preview.tagName).toBe('VIDEO');
  });

  it('previews a chosen audio file', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway({ committed: [audioSeed] });
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="audio"
          label="Stage audio"
          kind="audio"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select an audio file' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Spoken instructions' }),
    );

    await waitFor(() => expect(fieldValue('audio')).toBe('audio-1'));
    const preview = await screen.findByLabelText('Spoken instructions');
    expect(preview.tagName).toBe('AUDIO');
  });

  it('offers every stored resource to an untyped file field', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway({
      committed: [imageSeed, networkSeed],
    });
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="attachment"
          label="Attachment"
          kind="file"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select a resource' }),
    );
    const library = await screen.findByRole('list', {
      name: 'Resources in this protocol',
    });
    expect(
      within(library).getByRole('button', { name: 'Neighbourhood photo' }),
    ).toBeVisible();
    await user.click(
      within(library).getByRole('button', { name: 'Community roster' }),
    );

    await waitFor(() => expect(fieldValue('attachment')).toBe('network-1'));
  });

  it('summarises an imported data file from what the host inspected', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="dataSource"
          label="Roster"
          kind="network"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select a data file' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File([ROSTER], 'community.json', { type: 'application/json' }),
    );

    await waitFor(() =>
      expect(fieldValue('dataSource')).toBe('staged-resource-1'),
    );
    // The counts and attribute names a researcher picks a roster on, from
    // `inspect` rather than from anything the editor parsed itself.
    expect(await screen.findByText('Nodes')).toBeVisible();
    expect(await screen.findByText('age, name')).toBeVisible();
  });

  it('summarises an imported CSV roster, which is how most rosters arrive', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="dataSource"
          label="Roster"
          kind="network"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select a data file' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File([CSV_ROSTER], 'community.csv', { type: 'text/csv' }),
    );

    await waitFor(() =>
      expect(fieldValue('dataSource')).toBe('staged-resource-1'),
    );
    // One node per row, its columns the attributes — the same summary a JSON
    // roster gets, rather than the "not a readable network" a researcher used
    // to be shown for an ordinary spreadsheet export.
    expect(await screen.findByText('age, name')).toBeVisible();
    const nodes = await screen.findByText('Nodes');
    expect(nodes.nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Edges').nextElementSibling).toHaveTextContent('0');
  });

  it('uses the interview network without asking the host for a resource', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway({ committed: [networkSeed] });
    const list = vi.spyOn(gateway, 'list');
    const inspect = vi.spyOn(gateway, 'inspect');
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="dataSource"
          label="Network data"
          kind="network"
          canUseExisting
        />
      ),
    });

    await user.click(
      await screen.findByRole('radio', {
        name: 'Use the network from the in-progress interview',
      }),
    );

    await waitFor(() => expect(fieldValue('dataSource')).toBe('existing'));
    // Not an asset id, so nothing about it is a question for the gateway.
    expect(inspect).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('refuses a file the field cannot hold, and stages nothing', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const gateway = new InMemoryResourceGateway();
    const stageUpload = vi.spyOn(gateway, 'stageUpload');
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="mapLayer"
          label="Map layer"
          kind="geojson"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select a map layer' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['not a layer'], 'notes.txt', { type: 'text/plain' }),
    );

    expect(
      await screen.findByText(
        'That file cannot be imported here. Supported file types are: .geojson.',
      ),
    ).toBeVisible();
    expect(stageUpload).not.toHaveBeenCalled();
    expect(fieldValue('mapLayer')).toBeUndefined();
  });

  it('stages a map layer the field accepts', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="mapLayer"
          label="Map layer"
          kind="geojson"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select a map layer' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(
        [JSON.stringify({ type: 'FeatureCollection', features: [] })],
        'wards.geojson',
        { type: '' },
      ),
    );

    await waitFor(() =>
      expect(fieldValue('mapLayer')).toBe('staged-resource-1'),
    );
    expect(
      await screen.findByRole('heading', { name: 'wards.geojson' }),
    ).toBeVisible();
    expect(screen.getByText('Imported, not yet saved')).toBeVisible();
  });

  it('reports a failed import and imports it once the retry succeeds', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    gateway.failNext('stageUpload');
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="backgroundImage"
          label="Background image"
          kind="image"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );

    // The gateway's own researcher-facing message, with nothing about the host
    // added to it.
    expect(
      await screen.findByText('the resource host is temporarily unavailable'),
    ).toBeVisible();
    expect(fieldValue('backgroundImage')).toBeUndefined();

    await user.click(
      screen.getByRole('button', { name: 'Try importing the file again' }),
    );

    await waitFor(() =>
      expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
    );
  });

  it('clears the field when the imported resource is discarded', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="backgroundImage"
          label="Background image"
          kind="image"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );
    await waitFor(() =>
      expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Discard this resource' }),
    );

    // The field cannot go on naming something the host no longer holds.
    await waitFor(() => expect(fieldValue('backgroundImage')).toBeUndefined());
    expect(await screen.findByText('No resource selected.')).toBeVisible();
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('downloads the resource a field holds through the gateway', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway({ committed: [imageSeed] });
    const download = vi.spyOn(gateway, 'download');
    renderResourceEditor({
      gateway,
      fields: { label: 'Welcome', backgroundImage: 'image-1' },
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="backgroundImage"
          label="Background image"
          kind="image"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Download this resource' }),
    );

    expect(download).toHaveBeenCalledWith('image-1');
    expect(
      await screen.findByText('Neighbourhood photo was downloaded.'),
    ).toBeVisible();
  });

  it('reports a resource the protocol no longer holds', async () => {
    const gateway = new InMemoryResourceGateway();
    renderResourceEditor({
      gateway,
      fields: { label: 'Welcome', backgroundImage: 'image-1' },
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="backgroundImage"
          label="Background image"
          kind="image"
        />
      ),
    });

    expect(
      await screen.findByText('that resource is no longer available'),
    ).toBeVisible();
  });

  it('offers no way to change the resource in a read-only session', async () => {
    const gateway = new InMemoryResourceGateway({ committed: [imageSeed] });
    renderResourceEditor({
      gateway,
      readOnly: true,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="backgroundImage"
          label="Background image"
          kind="image"
        />
      ),
    });

    expect(
      await screen.findByRole('button', { name: 'Select an image' }),
    ).toBeDisabled();
  });

  it('repeats an uncertain import as the same request, so it is imported once', async () => {
    const user = userEvent.setup();
    const inner = new InMemoryResourceGateway();
    const stageUpload = vi.spyOn(inner, 'stageUpload');
    // The host stored the file and then failed to say so — exactly the
    // uncertain failure a stable request id exists for.
    let uncertain = true;
    const gateway = overrideGateway(inner, {
      stageUpload: async (request) => {
        const result = await inner.stageUpload(request);
        if (!uncertain) return result;
        uncertain = false;
        return resourceFailure(
          'unavailable',
          'the resource host is temporarily unavailable',
        );
      },
    });
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: imageField(),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );
    expect(
      await screen.findByText('the resource host is temporarily unavailable'),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Try importing the file again' }),
    );
    await waitFor(() =>
      expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
    );

    const requestIds = stageUpload.mock.calls.map(([call]) => call.requestId);
    expect(new Set(requestIds).size).toBe(1);
    // One file at the host. A retry that minted a new request id would have
    // left the first copy behind with nothing referencing it.
    expect(
      inner.getStagingResidue().filter((entry) => entry.startsWith('staged:')),
    ).toEqual(['staged:staged-resource-1']);
  });

  it('gives the file input back empty, so the same file can be chosen again', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const gateway = new InMemoryResourceGateway();
    renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="mapLayer"
          label="Map layer"
          kind="geojson"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select a map layer' }),
    );
    const input = await screen.findByLabelText(
      'Choose a file from your computer',
    );
    await user.upload(
      input,
      new File(['not a layer'], 'notes.txt', { type: 'text/plain' }),
    );

    // The rejection is what proves the input really took the file.
    expect(
      await screen.findByText(
        'That file cannot be imported here. Supported file types are: .geojson.',
      ),
    ).toBeVisible();
    // A browser reports no change when the same file is chosen again, so an
    // input still holding it would never hear about the second attempt — the
    // one the researcher makes after fixing what was wrong.
    expect(input).toHaveValue('');
  });

  it('reads the resource library once for a picker that spells its kinds inline', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway({ committed: [imageSeed] });
    const list = vi.spyOn(gateway, 'list');
    renderResourceEditor({ gateway, children: imageField() });

    await user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Neighbourhood photo' }),
    ).toBeVisible();

    // The kinds a picker browses are minted fresh on every render, so the
    // library has to key on what is in that array rather than on the array
    // itself: keyed on the array, every answer would prompt another question.
    await act(flushPendingWork);
    expect(list).toHaveBeenCalledTimes(1);
  });
});

/**
 * What the picker does with an answer that arrives after the researcher has
 * moved on. Each of these puts one gateway call in flight, moves the field,
 * and then lets the first call land — the shape a slow host produces on its
 * own, and the one a picker without a staleness guard reports as if it were
 * about what is on screen now.
 */
describe('a picker whose in-flight call is superseded', () => {
  it('drops the inspection of a resource the field has moved off', async () => {
    const user = userEvent.setup();
    const inner = new InMemoryResourceGateway({
      committed: [imageSeed, secondImageSeed],
    });
    const held = deferred<ResourceResult<ResourceInspection>>();
    const gateway = overrideGateway(inner, {
      inspect: (resourceId) =>
        resourceId === 'image-1' ? held.promise : inner.inspect(resourceId),
    });
    const { fieldValue } = renderResourceEditor({
      gateway,
      fields: { label: 'Welcome', backgroundImage: 'image-1' },
      children: imageField(),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Change the image' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Community centre' }),
    );
    await waitFor(() => expect(fieldValue('backgroundImage')).toBe('image-2'));
    expect(
      await screen.findByRole('heading', { name: 'Community centre' }),
    ).toBeVisible();

    held.settle(
      resourceFailure<ResourceInspection>(
        'unavailable',
        'the first resource could not be inspected',
      ),
    );
    await act(flushPendingWork);

    expect(
      screen.queryByText('the first resource could not be inspected'),
    ).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Community centre' }),
    ).toBeVisible();
  });

  it('drops a download that fails after the field has moved off', async () => {
    const user = userEvent.setup();
    const inner = new InMemoryResourceGateway({
      committed: [imageSeed, secondImageSeed],
    });
    const held = deferred<ResourceResult<ResourceContent>>();
    const gateway = overrideGateway(inner, { download: () => held.promise });
    renderResourceEditor({
      gateway,
      fields: { label: 'Welcome', backgroundImage: 'image-1' },
      children: imageField(),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Download this resource' }),
    );
    // The researcher does not wait for the download before choosing another
    // resource.
    await user.click(screen.getByRole('button', { name: 'Change the image' }));
    await user.click(
      await screen.findByRole('button', { name: 'Community centre' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Community centre' }),
    ).toBeVisible();

    held.settle(
      resourceFailure<ResourceContent>(
        'unavailable',
        'the download could not be completed',
      ),
    );
    await act(flushPendingWork);

    // The download was of the resource this field no longer holds, so a
    // failure notice beside the new one would be about nothing on screen.
    expect(
      screen.queryByText('the download could not be completed'),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try that again' })).toBeNull();
  });

  it('stops showing the previous resource while the new one is inspected', async () => {
    const user = userEvent.setup();
    const inner = new InMemoryResourceGateway({
      committed: [imageSeed, secondImageSeed],
    });
    const held = deferred<ResourceResult<ResourceInspection>>();
    const gateway = overrideGateway(inner, {
      inspect: (resourceId) =>
        resourceId === 'image-2' ? held.promise : inner.inspect(resourceId),
    });
    renderResourceEditor({
      gateway,
      fields: { label: 'Welcome', backgroundImage: 'image-1' },
      children: imageField(),
    });

    expect(
      await screen.findByRole('heading', { name: 'Neighbourhood photo' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Change the image' }));
    await user.click(
      await screen.findByRole('button', { name: 'Community centre' }),
    );

    // The field holds the second image now, and the first one's name is not
    // an answer to what it holds — not even for as long as the host takes.
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Neighbourhood photo' }),
      ).toBeNull(),
    );

    held.settle(await inner.inspect('image-2'));
    expect(
      await screen.findByRole('heading', { name: 'Community centre' }),
    ).toBeVisible();
  });
});

/**
 * What the picker shows when the session's own resource rules refuse a call:
 * staging that outlived the session it belonged to, and a discard the finish
 * is in the middle of committing. Both are the session-scoped gateway's
 * answers, so the picker's job is to say them and to offer a retry only where
 * repeating the call could still work.
 */
describe('a picker over a session that has moved on', () => {
  it('reports an import the cancelled session did not keep', async () => {
    const user = userEvent.setup();
    const inner = new InMemoryResourceGateway();
    const gate = deferred<undefined>();
    const gateway = overrideGateway(inner, {
      stageUpload: async (request) => {
        await gate.promise;
        return inner.stageUpload(request);
      },
    });
    const { session } = renderResourceEditor({
      gateway,
      children: imageField(),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );

    // The researcher closes the editor while the import is still on its way.
    await act(async () => {
      await session.cancel();
    });
    gate.settle(undefined);

    expect(
      await screen.findByText(
        'this editing session ended before the file finished staging, so it was not kept',
      ),
    ).toBeVisible();
    // Repeating it cannot help: the session that import belonged to is over.
    expect(
      screen.queryByRole('button', { name: 'Try importing the file again' }),
    ).toBeNull();
    // And the host is not left holding it either.
    expect(inner.getStagingResidue()).toEqual([]);
  });

  it('reports a discard the finish is committing through, and offers to try again', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const applyStarted = deferred<undefined>();
    const applyHeld = deferred<undefined>();
    const { session } = createRosterFixture({
      gateway,
      duringApply: async () => {
        applyStarted.settle(undefined);
        await applyHeld.promise;
      },
    });
    const sessionGateway = session.getResourceGateway();
    if (sessionGateway === undefined) {
      throw new Error('the session was opened without a resource gateway');
    }
    const staged = await sessionGateway.stageUpload({
      requestId: 'roster-request',
      kind: 'network',
      name: 'Community roster',
      source: 'community.json',
      contentType: 'application/json',
      bytes: bytesOf(ROSTER),
    });
    expect(staged.status).toBe('ok');
    session.dispatch([
      { op: 'set', key: 'dataSource', value: 'staged-resource-1' },
    ]);

    renderResourceEditor({ session, children: rosterField() });
    expect(
      await screen.findByRole('heading', { name: 'Community roster' }),
    ).toBeVisible();

    const finishing = session.finish();
    await act(async () => {
      await applyStarted.promise;
    });

    await user.click(
      screen.getByRole('button', { name: 'Discard this resource' }),
    );

    expect(
      await screen.findByText(
        'these resources are being saved right now, so they cannot be discarded until the save finishes',
      ),
    ).toBeVisible();
    // Retryable, and true to what the researcher can do: once the save
    // settles, an unwanted resource can be discarded like any other.
    expect(
      screen.getByRole('button', { name: 'Try that again' }),
    ).toBeVisible();

    applyHeld.settle(undefined);
    await act(async () => {
      await finishing;
    });
  });

  it('keeps a command naming a staged roster pending until the finish carries it', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const { host, onCommands, onFinish, session } = createRosterFixture({
      gateway,
    });
    const { fieldValue } = renderResourceEditor({
      session,
      actions: ({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      ),
      children: rosterField(),
    });

    // A command that names nothing staged reaches a live-applying host at
    // once, which is what makes the silence below an assertion.
    session.dispatch([{ op: 'set', key: 'label', value: 'People you know' }]);
    expect(onCommands).toHaveBeenCalledTimes(1);
    // Settled before the editor is touched: a draft the form itself did not
    // write remounts the form store, which would close the browser under the
    // click that opened it.
    await act(flushPendingWork);

    await user.click(
      await screen.findByRole('button', { name: 'Select a data file' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File([ROSTER], 'community.json', { type: 'application/json' }),
    );
    await waitFor(() =>
      expect(fieldValue('dataSource')).toBe('staged-resource-1'),
    );

    gateway.failNext('promote');
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));
    await waitFor(() =>
      expect(host.getSnapshot().manifestRevision.sequence).toBe(7n),
    );

    // The promotion was rolled back, so nothing was written — and the command
    // that names the staged roster is still waiting rather than sitting in a
    // host with no manifest entry to resolve it against.
    expect(onFinish).not.toHaveBeenCalled();
    expect(onCommands).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onCommands.mock.calls)).not.toContain(
      'staged-resource-1',
    );
    expect(JSON.stringify(session.getSnapshot().pendingCommands)).toContain(
      'staged-resource-1',
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));

    // The held command and the manifest entry travelled in one revision.
    const request = onFinish.mock.calls[0]?.[0];
    expect(
      request?.pendingCommands.flatMap((batch) => [...batch.commands]),
    ).toContainEqual({
      op: 'set',
      key: 'dataSource',
      value: 'staged-resource-1',
    });
    expect(
      request?.resourceManifest?.commands.map((command) => command.key),
    ).toEqual(['staged-resource-1']);
    expect(host.getSnapshot().manifestRevision.sequence).toBe(8n);
    expect(host.getSnapshot().protocolSections[stageSection]).toMatchObject({
      dataSource: 'staged-resource-1',
    });
    expect(host.getSnapshot().protocolSections[assetsSection]).toHaveProperty(
      'staged-resource-1',
    );
  });
});
