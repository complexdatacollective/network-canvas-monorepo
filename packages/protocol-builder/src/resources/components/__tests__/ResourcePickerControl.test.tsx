import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ProtocolField from '../../../form/ProtocolField.tsx';
import {
  InMemoryResourceGateway,
  type InMemoryResourceSeed,
} from '../../InMemoryResourceGateway.ts';
import ResourcePickerControl from '../ResourcePickerControl.tsx';
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
});
