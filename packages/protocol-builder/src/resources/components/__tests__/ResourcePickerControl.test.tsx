import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { ProtocolBuilderClient } from '../../../contract/contract.ts';
import ProtocolField from '../../../form/ProtocolField.tsx';
import type { InMemoryHost } from '../../../testing/host/createInMemoryHost.ts';
import ResourcePickerControl from '../ResourcePickerControl.tsx';
import { deferred, flushPendingWork } from './asyncControls.ts';
import { renderResourceEditor } from './renderResourceEditor.tsx';
import {
  withResourceProcedures,
  type CommittedResource,
} from './resourceHost.ts';

const HOST_UNAVAILABLE = 'the resource host is temporarily unavailable';

const ROSTER = JSON.stringify({
  nodes: [
    { attributes: { name: 'Ada', age: 36 } },
    { attributes: { name: 'Grace', age: 41 } },
  ],
  edges: [{ from: 0, to: 1 }],
});

/**
 * What the protocol files a committed resource's bytes under: their own
 * content, and the extension of the file the researcher picked.
 *
 * Written out as a digest rather than as a filename because that is what a
 * host commits — two researchers importing different pictures both called
 * `portrait.png` are two assets, so the manifest cannot name either by the
 * filename it came from. A fixture spelling it `neighbourhood.png` would let
 * every surface that shows a filename go on passing while showing a hash to
 * the researcher.
 */
const filedUnder = (digit: string, extension: string): string =>
  `${digit.repeat(64)}${extension}`;

const imageSeed: CommittedResource = {
  kind: 'image',
  id: 'image-1',
  name: 'Neighbourhood photo',
  source: filedUnder('a', '.png'),
  bytes: 'png-bytes',
};

const videoSeed: CommittedResource = {
  kind: 'video',
  id: 'video-1',
  name: 'Interview walkthrough',
  source: filedUnder('b', '.mp4'),
  bytes: 'mp4-bytes',
};

const audioSeed: CommittedResource = {
  kind: 'audio',
  id: 'audio-1',
  name: 'Spoken instructions',
  source: filedUnder('c', '.mp3'),
  bytes: 'mp3-bytes',
};

const networkSeed: CommittedResource = {
  kind: 'network',
  id: 'network-1',
  name: 'Community roster',
  source: filedUnder('d', '.json'),
  bytes: ROSTER,
};

const apiKeySeed: CommittedResource = {
  kind: 'apikey',
  id: 'apikey-1',
  name: 'Mapbox key',
  value: 'pk.picker-test-key',
};

/** A second image, so a field can be moved off the one it is holding. */
const secondImageSeed: CommittedResource = {
  kind: 'image',
  id: 'image-2',
  name: 'Community centre',
  source: filedUnder('e', '.png'),
  bytes: 'png-bytes-2',
};

const REFUSAL = {
  status: 'failed' as const,
  failure: {
    reason: 'unavailable' as const,
    message: HOST_UNAVAILABLE,
    retryable: true,
  },
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

/**
 * The in-memory host, counting the calls a test needs to be able to count.
 *
 * The resource client asks the host for the library once when the edit opens,
 * to learn where a promoted secret would go, so "how many times has the host
 * been listed?" is only ever a question about the calls made after some moment
 * a test names — which is why the counts are readings rather than assertions.
 */
function countedProcedures() {
  const counts = { list: 0, stage: 0, inspect: 0, preview: 0 };
  const wrap = (host: InMemoryHost): ProtocolBuilderClient =>
    withResourceProcedures(host.client, {
      list: (input) => {
        counts.list += 1;
        return host.client.resources.list(input);
      },
      stage: (input) => {
        counts.stage += 1;
        return host.client.resources.stage(input);
      },
      inspect: (input) => {
        counts.inspect += 1;
        return host.client.resources.inspect(input);
      },
      preview: (input) => {
        counts.preview += 1;
        return host.client.resources.preview(input);
      },
    });
  return { counts, wrap };
}

/** The `fields` an Information stage holding a background image opens with. */
const withBackgroundImage = (id: string): SectionDoc => ({
  label: 'Welcome',
  title: 'Welcome',
  items: [],
  backgroundImage: id,
});

describe('ResourcePickerControl', () => {
  it('sets the field to the id of an image chosen from the protocol', async () => {
    const user = userEvent.setup();
    const { fieldValue } = renderResourceEditor({
      resources: [imageSeed],
      children: imageField(),
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
    const { fieldValue, manifest } = renderResourceEditor({
      children: imageField(),
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
    expect(manifest()).toEqual({});
  });

  it('previews a chosen video', async () => {
    const user = userEvent.setup();
    const { fieldValue } = renderResourceEditor({
      resources: [videoSeed],
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
    const { fieldValue } = renderResourceEditor({
      resources: [audioSeed],
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
    const { fieldValue } = renderResourceEditor({
      resources: [imageSeed, networkSeed],
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

  it('offers only what the field can hold, whatever the host answers with', async () => {
    const user = userEvent.setup();
    renderResourceEditor({
      resources: [imageSeed, networkSeed, apiKeySeed],
      // A host that ignores the `kinds` filter. The contract requires it to be
      // honoured, but which resources a field may hold is the editor's own
      // rule: offering a backdrop image as an API key would put an id in the
      // field that the schema refuses and the interview cannot load.
      client: (host) =>
        withResourceProcedures(host.client, {
          list: ({ protocolId, status }) =>
            host.client.resources.list({
              protocolId,
              ...(status === undefined ? {} : { status }),
            }),
        }),
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="apiKey"
          label="Map provider API key"
          kind="apikey"
        />
      ),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select an API key' }),
    );
    const library = await screen.findByRole('list', {
      name: 'Resources in this protocol',
    });

    expect(
      within(library)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Mapbox key']);
  });

  it('refuses a staged resource the host answered with a wrong kind for', async () => {
    const user = userEvent.setup();
    const { fieldValue } = renderResourceEditor({
      // An import route reaches the field with no list in between, so this is
      // where a wrong kind arrives when the host decides one for itself.
      client: (host) =>
        withResourceProcedures(host.client, {
          stage: async (input) => {
            const staged = await host.client.resources.stage(input);
            if (staged.status !== 'ok') return staged;
            return {
              status: 'ok' as const,
              data: {
                ...staged.data,
                descriptor: {
                  ...staged.data.descriptor,
                  kind: 'network' as const,
                },
              },
            };
          },
        }),
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
      await screen.findByText(
        'That resource cannot be used in this field. It accepts: Image.',
      ),
    ).toBeVisible();
    expect(fieldValue('backgroundImage')).toBeUndefined();
  });

  it('summarises an imported data file from what the host inspected', async () => {
    const user = userEvent.setup();
    const { fieldValue } = renderResourceEditor({
      // A host that reads what it was given, which is what `inspect` is for:
      // the counts and attribute names a researcher picks a roster on are the
      // host's to know, and this control shows whatever it is told.
      client: (host) =>
        withResourceProcedures(host.client, {
          inspect: async (input) => {
            const inspected = await host.client.resources.inspect(input);
            if (
              inspected.status !== 'ok' ||
              inspected.data.descriptor.kind !== 'network'
            ) {
              return inspected;
            }
            return {
              status: 'ok' as const,
              data: {
                ...inspected.data,
                counts: { nodes: 2, edges: 1 },
                variableNames: ['age', 'name'],
              },
            };
          },
        }),
      children: rosterField(),
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
    const nodes = await screen.findByText('Nodes');
    expect(nodes.nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Edges').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('age, name')).toBeVisible();
  });

  it('uses the interview network without asking the host for a resource', async () => {
    const user = userEvent.setup();
    const counted = countedProcedures();
    const { fieldValue } = renderResourceEditor({
      resources: [networkSeed],
      client: counted.wrap,
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

    const before = { ...counted.counts };
    await user.click(
      await screen.findByRole('radio', {
        name: 'Use the network from the in-progress interview',
      }),
    );

    await waitFor(() => expect(fieldValue('dataSource')).toBe('existing'));
    // Not an asset id, so nothing about it is a question for the host.
    expect(counted.counts.inspect).toBe(0);
    expect(counted.counts.list).toBe(before.list);
  });

  it('refuses a file the field cannot hold, and stages nothing', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const counted = countedProcedures();
    const { fieldValue } = renderResourceEditor({
      client: counted.wrap,
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
    expect(counted.counts.stage).toBe(0);
    expect(fieldValue('mapLayer')).toBeUndefined();
  });

  it('stages a map layer the field accepts', async () => {
    const user = userEvent.setup();
    const { fieldValue } = renderResourceEditor({
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
    let refuse = true;
    const { fieldValue } = renderResourceEditor({
      client: (host) =>
        withResourceProcedures(host.client, {
          stage: (input) => {
            if (refuse) {
              refuse = false;
              return Promise.resolve(REFUSAL);
            }
            return host.client.resources.stage(input);
          },
        }),
      children: imageField(),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );

    // The host's own researcher-facing message, with nothing about the host
    // added to it.
    expect(await screen.findByText(HOST_UNAVAILABLE)).toBeVisible();
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
    const { fieldValue, staged } = renderResourceEditor({
      children: imageField(),
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
    expect(await staged()).toEqual([]);
  });

  /**
   * The contract has no download. What it can answer with is the URL a preview
   * renders from, so saving a copy is that URL handed to a link the page clicks
   * — which is what puts the file on the researcher's computer, under the name
   * the protocol records for it.
   */
  it('saves a copy of the resource a field holds, from the URL the host resolved', async () => {
    const user = userEvent.setup();
    const saved: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function (this: HTMLAnchorElement) {
        saved.push({ href: this.href, download: this.download });
      },
    );
    renderResourceEditor({
      resources: [imageSeed],
      fields: withBackgroundImage('image-1'),
      children: imageField(),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Download this resource' }),
    );

    expect(
      await screen.findByText('Neighbourhood photo was downloaded.'),
    ).toBeVisible();
    // Named as the protocol names the resource, carrying the extension of the
    // file it came from, and pointed at what the host answered with rather
    // than at anything this editor made up. NOT the name the bytes are filed
    // under: a copy called sixty-four hex characters is one the researcher
    // cannot recognise on their own computer.
    expect(saved).toHaveLength(1);
    expect(saved[0]?.download).toBe('Neighbourhood photo.png');
    expect(saved[0]?.href).toContain('base64,');
    vi.restoreAllMocks();
  });

  /**
   * The name a committed resource's bytes are filed under is the host's, not
   * the researcher's: it is worked out from the content so that two files
   * imported under one filename stay two assets. So it is never shown, and
   * what the summary says about a saved resource is what the protocol calls
   * it.
   */
  it('never shows the name a committed resource’s bytes are filed under', async () => {
    renderResourceEditor({
      resources: [imageSeed],
      fields: withBackgroundImage('image-1'),
      children: imageField(),
    });

    // The summary is on screen: the heading names the resource, and the size
    // read out of the bytes is a detail row only an inspection can supply.
    expect(await screen.findByText('Neighbourhood photo')).toBeVisible();
    expect(await screen.findByText('Size')).toBeVisible();
    // And nothing under it is the digest, nor the label that would introduce
    // one as the file the researcher chose.
    expect(document.body.textContent ?? '').not.toContain(
      filedUnder('a', '.png'),
    );
    expect(screen.queryByText('File')).not.toBeInTheDocument();
  });

  it('reports a resource the protocol no longer holds', async () => {
    renderResourceEditor({
      fields: withBackgroundImage('image-1'),
      children: imageField(),
    });

    // The host's own words for a resource it does not have.
    expect(await screen.findByText('no such resource')).toBeVisible();
  });

  it('lets a field let go of a resource the protocol no longer holds', async () => {
    const user = userEvent.setup();
    const { fieldValue } = renderResourceEditor({
      fields: withBackgroundImage('image-1'),
      children: imageField(),
    });

    expect(await screen.findByText('no such resource')).toBeVisible();
    // Nothing is known about the resource, so there is no summary and no
    // discard — but the reference is still in the draft, and this field is not
    // required, so choosing a replacement is not the only thing the researcher
    // can reasonably want to do.
    expect(
      screen.getByText(
        'This field still refers to that resource. Removing it clears the reference; it does not delete anything.',
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Remove this resource' }),
    );

    await waitFor(() => expect(fieldValue('backgroundImage')).toBeUndefined());
    expect(await screen.findByText('No resource selected.')).toBeVisible();
  });

  it('offers no way to let go of a resource while somebody else holds the stage', async () => {
    renderResourceEditor({
      readOnly: true,
      fields: withBackgroundImage('image-1'),
      children: imageField(),
    });

    expect(await screen.findByText('no such resource')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Remove this resource' }),
    ).toBeDisabled();
  });

  it('offers no way to change the resource while somebody else holds the stage', async () => {
    renderResourceEditor({
      readOnly: true,
      resources: [imageSeed],
      children: imageField(),
    });

    expect(
      await screen.findByRole('button', { name: 'Select an image' }),
    ).toBeDisabled();
  });

  it('repeats an uncertain import as the same request, so it is imported once', async () => {
    const user = userEvent.setup();
    const requests: string[] = [];
    // The host stored the file and then failed to say so — exactly the
    // uncertain failure a stable request id exists for.
    let uncertain = true;
    const { fieldValue, staged } = renderResourceEditor({
      client: (host) =>
        withResourceProcedures(host.client, {
          stage: async (input) => {
            requests.push(input.requestId);
            const result = await host.client.resources.stage(input);
            if (!uncertain) return result;
            uncertain = false;
            return REFUSAL;
          },
        }),
      children: imageField(),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );
    expect(await screen.findByText(HOST_UNAVAILABLE)).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Try importing the file again' }),
    );
    await waitFor(() =>
      expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
    );

    expect(new Set(requests).size).toBe(1);
    // One file at the host. A retry that minted a new request id would have
    // left the first copy behind with nothing referencing it.
    expect((await staged()).map((descriptor) => descriptor.id)).toEqual([
      'staged-resource-1',
    ]);
  });

  it('gives the file input back empty, so the same file can be chosen again', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderResourceEditor({
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
    const counted = countedProcedures();
    renderResourceEditor({
      resources: [imageSeed],
      client: counted.wrap,
      children: imageField(),
    });

    await screen.findByRole('button', { name: 'Select an image' });
    // Counted from here, because the edit itself reads the library once when
    // it opens: what this is about is the browser's own reading.
    const before = counted.counts.list;

    await user.click(screen.getByRole('button', { name: 'Select an image' }));
    expect(
      await screen.findByRole('button', { name: 'Neighbourhood photo' }),
    ).toBeVisible();

    // The kinds a picker browses are minted fresh on every render, so the
    // library has to key on what is in that array rather than on the array
    // itself: keyed on the array, every answer would prompt another question.
    await act(flushPendingWork);
    expect(counted.counts.list - before).toBe(1);
  });
});

/**
 * What the picker does with an answer that arrives after the researcher has
 * moved on. Each of these puts one host call in flight, moves the field, and
 * then lets the first call land — the shape a slow host produces on its own,
 * and the one a picker without a staleness guard reports as if it were about
 * what is on screen now.
 */
describe('a picker whose in-flight call is superseded', () => {
  it('drops the inspection of a resource the field has moved off', async () => {
    const user = userEvent.setup();
    const held = deferred<void>();
    const { fieldValue } = renderResourceEditor({
      resources: [imageSeed, secondImageSeed],
      client: (host) =>
        withResourceProcedures(host.client, {
          inspect: async (input) => {
            if (input.resourceId === 'image-1') {
              await held.promise;
              return {
                status: 'failed' as const,
                failure: {
                  reason: 'unavailable' as const,
                  message: 'the first resource could not be inspected',
                  retryable: true,
                },
              };
            }
            return host.client.resources.inspect(input);
          },
        }),
      fields: withBackgroundImage('image-1'),
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

    held.settle(undefined);
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
    const held = deferred<void>();
    renderResourceEditor({
      resources: [imageSeed, secondImageSeed],
      // Only the resource the field is about to move off: a download and a
      // preview are the same call now, so refusing every one of them would
      // put the second image's own preview failure where this row expects
      // silence.
      client: (host) =>
        withResourceProcedures(host.client, {
          preview: async (input) => {
            if (input.resourceId !== 'image-1') {
              return host.client.resources.preview(input);
            }
            await held.promise;
            return {
              status: 'failed' as const,
              failure: {
                reason: 'unavailable' as const,
                message: 'the download could not be completed',
                retryable: true,
              },
            };
          },
        }),
      fields: withBackgroundImage('image-1'),
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

    held.settle(undefined);
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
    const held = deferred<void>();
    renderResourceEditor({
      resources: [imageSeed, secondImageSeed],
      client: (host) =>
        withResourceProcedures(host.client, {
          inspect: async (input) => {
            if (input.resourceId === 'image-2') await held.promise;
            return host.client.resources.inspect(input);
          },
        }),
      fields: withBackgroundImage('image-1'),
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

    held.settle(undefined);
    expect(
      await screen.findByRole('heading', { name: 'Community centre' }),
    ).toBeVisible();
  });
});

/**
 * An Information stage whose two items can hold the same image, which is what
 * makes "another field is still using this" a state a researcher can reach.
 *
 * The item's `id` and `type` are rendered alongside its content because a
 * section owning part of a nested value has to render every part of it: the
 * form replaces the whole `items` key, so an item whose type no field carries
 * stops being an asset item the moment the form is read.
 */
function itemIdentityFields(index: number) {
  return (
    <>
      <ProtocolField
        component={InputField}
        name={`items[${index}].id`}
        nameMode="path"
        label={`Item ${index + 1} id`}
        labelHidden
      />
      <ProtocolField
        component={InputField}
        name={`items[${index}].type`}
        nameMode="path"
        label={`Item ${index + 1} type`}
        labelHidden
      />
    </>
  );
}

function itemPicker(index: number, label: string) {
  return (
    <ProtocolField
      component={ResourcePickerControl}
      name={`items[${index}].content`}
      nameMode="path"
      label={label}
      kind="image"
    />
  );
}

const ASSET_ITEMS: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome',
  items: [
    { id: 'item-1', type: 'asset', content: '' },
    { id: 'item-2', type: 'asset', content: '' },
  ],
};

/**
 * Discarding is a decision about the whole edit, not about one field: the
 * resource leaves the host, and every reference to it anywhere in the stage
 * becomes one the protocol cannot resolve. So the picker asks what else is
 * using it, from the same `assetReference` tags the protocol is validated
 * against.
 */
describe('discarding a resource other fields may share', () => {
  async function importInto(
    user: ReturnType<typeof userEvent.setup>,
    group: HTMLElement,
  ) {
    await user.click(
      within(group).getByRole('button', { name: 'Select an image' }),
    );
    await user.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
    );
  }

  function renderItems(client?: (host: InMemoryHost) => ProtocolBuilderClient) {
    const { formValues, staged, resourceClient } = renderResourceEditor({
      fields: ASSET_ITEMS,
      ...(client === undefined ? {} : { client }),
      children: (
        <>
          {itemIdentityFields(0)}
          {itemPicker(0, 'First image')}
          {itemIdentityFields(1)}
          {itemPicker(1, 'Second image')}
        </>
      ),
    });
    const contents = (): unknown[] =>
      (formValues().items as { content?: unknown }[] | undefined)?.map(
        (item) => item.content,
      ) ?? [];
    return Object.assign(contents, { staged, resourceClient });
  }

  it('refuses to discard one a second field still names, and says why', async () => {
    const user = userEvent.setup();
    const contents = renderItems();

    const first = await screen.findByRole('group', { name: 'First image' });
    const second = screen.getByRole('group', { name: 'Second image' });
    await importInto(user, first);
    await waitFor(() => expect(contents()[0]).toBe('staged-resource-1'));

    // The second item is pointed at the very same import, which the browser
    // offers because it lists everything staged in this edit.
    await user.click(
      within(second).getByRole('button', { name: 'Select an image' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'skyline.png' }),
    );
    await waitFor(() => expect(contents()[1]).toBe('staged-resource-1'));

    await user.click(
      within(first).getByRole('button', { name: 'Discard this resource' }),
    );
    await act(flushPendingWork);

    expect(within(first).getByRole('alert')).toHaveTextContent(
      'This resource is still used elsewhere on this stage, so it was not discarded.',
    );
    // Nothing moved: neither field lost its reference, and the host still has
    // the file both of them name.
    expect(contents()).toEqual(['staged-resource-1', 'staged-resource-1']);
    expect(await contents.staged()).not.toEqual([]);
  });

  it('lets a field let go of one it was refused the discard of', async () => {
    const user = userEvent.setup();
    const contents = renderItems();

    const first = await screen.findByRole('group', { name: 'First image' });
    const second = screen.getByRole('group', { name: 'Second image' });
    await importInto(user, first);
    await waitFor(() => expect(contents()[0]).toBe('staged-resource-1'));
    await user.click(
      within(second).getByRole('button', { name: 'Select an image' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'skyline.png' }),
    );
    await waitFor(() => expect(contents()[1]).toBe('staged-resource-1'));

    await user.click(
      within(first).getByRole('button', { name: 'Discard this resource' }),
    );
    await act(flushPendingWork);

    // Both fields name it, so neither of them can discard it. Telling each
    // researcher to move the other field off it first is telling them to do
    // the very thing the other field cannot do either.
    await user.click(
      within(first).getByRole('button', { name: 'Remove this resource' }),
    );

    await waitFor(() =>
      expect(contents()).toEqual([undefined, 'staged-resource-1']),
    );
    // The file itself is untouched: the other field still names it.
    expect(await contents.staged()).not.toEqual([]);
  });

  it('discards one no other field names', async () => {
    const user = userEvent.setup();
    const contents = renderItems();

    const first = await screen.findByRole('group', { name: 'First image' });
    await importInto(user, first);
    await waitFor(() => expect(contents()[0]).toBe('staged-resource-1'));

    await user.click(
      within(first).getByRole('button', { name: 'Discard this resource' }),
    );

    await waitFor(() => expect(contents()[0]).toBeUndefined());
    expect(within(first).queryByRole('alert')).toBeNull();
    expect(await contents.staged()).toEqual([]);
  });

  it('will not let a second field take one a finished discard has already removed', async () => {
    const user = userEvent.setup();
    const contents = renderItems();

    const first = await screen.findByRole('group', { name: 'First image' });
    const second = screen.getByRole('group', { name: 'Second image' });
    await importInto(user, first);
    await waitFor(() => expect(contents()[0]).toBe('staged-resource-1'));

    // The second field opens its browser, which reads the list once. Nothing
    // refreshes it after that.
    await user.click(
      within(second).getByRole('button', { name: 'Select an image' }),
    );
    await screen.findByRole('button', { name: 'skyline.png' });

    // The first field discards the resource, and the host finishes carrying it
    // out — so the in-flight mark that would have covered this is lifted again
    // before the second field clicks. Made through the edit's own resource
    // client because the open browser hides the rest of the editor from this
    // test exactly as it does from the researcher; it is the same call the
    // first field's own discard button makes.
    await act(async () => {
      const discarded = await contents
        .resourceClient()
        .discardStaged('staged-resource-1');
      expect(discarded.status).toBe('ok');
    });
    expect(await contents.staged()).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'skyline.png' }));
    await act(flushPendingWork);

    expect(within(second).getByRole('alert')).toHaveTextContent(
      'That resource is no longer available',
    );
    // Untouched: still the empty string the item started as.
    expect(contents()[1]).toBe('');
  });

  it('will not let a second field take one whose discard is already under way', async () => {
    const user = userEvent.setup();
    const discard = deferred<void>();
    const contents = renderItems((host) =>
      withResourceProcedures(host.client, {
        discard: async (input) => {
          await discard.promise;
          return host.client.resources.discard(input);
        },
      }),
    );

    const first = await screen.findByRole('group', { name: 'First image' });
    const second = screen.getByRole('group', { name: 'Second image' });
    await importInto(user, first);
    await waitFor(() => expect(contents()[0]).toBe('staged-resource-1'));

    // No other field names it, so the discard is allowed and dispatched.
    await user.click(
      within(first).getByRole('button', { name: 'Discard this resource' }),
    );
    // While the host is still carrying it out, the second field browses —
    // its own button, which the first field's discard does not disable — and
    // the browser still lists the resource, because it is still staged.
    await user.click(
      within(second).getByRole('button', { name: 'Select an image' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'skyline.png' }),
    );
    await act(flushPendingWork);

    // The count the first field checked was true when it checked it and false
    // by now. Taking the resource here is what leaves this field naming bytes
    // the host is deleting — a stage that cannot be saved, reached by two
    // actions each of which was allowed.
    expect(within(second).getByRole('alert')).toHaveTextContent(
      'That resource is being discarded, so it cannot be used here.',
    );
    // Untouched: still the empty string the item started as.
    expect(contents()[1]).toBe('');
    // Nothing to remove: this field never had it.
    expect(
      within(second).queryByRole('button', { name: 'Remove this resource' }),
    ).toBeNull();

    discard.settle(undefined);

    await waitFor(() => expect(contents()[0]).toBeUndefined());
    expect(contents()).toEqual([undefined, '']);
    expect(await contents.staged()).toEqual([]);
  });
});

describe('the validation state a picker exposes', () => {
  it('tells assistive technology that a picker group is required and invalid', async () => {
    const user = userEvent.setup();
    renderResourceEditor({
      resources: [imageSeed],
      actions: ({ formId }) => <SubmitButton form={formId}>Save</SubmitButton>,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="backgroundImage"
          label="Background image"
          kind="image"
          required
        />
      ),
    });

    const group = await screen.findByRole('group', {
      name: 'Background image',
    });
    // Announced as required through the field's own hidden marker, not through
    // `aria-required`, which `group` does not take: a picker that never says it
    // is required announces as an optional one.
    expect(group).not.toHaveAttribute('aria-required');
    expect(group).toHaveAccessibleDescription(/Required/);
    // Nothing has been refused yet. Asserted as "not invalid" rather than as
    // the literal `false`, so that a group which says nothing at all fails on
    // the refusal below — where the announcement is actually lost — rather
    // than here.
    expect(group).not.toHaveAttribute('aria-invalid', 'true');
    expect(group).not.toHaveAccessibleDescription(/This field is required\./);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(group).toHaveAttribute('aria-invalid', 'true'));
    // Both halves, because neither announces the refusal on its own:
    // `FieldErrors` deliberately renders no `role="alert"`, so the message is
    // reached only from a control that says it is invalid — and without the
    // state on this group, a refused save announces exactly like an accepted
    // one.
    expect(group).toHaveAccessibleDescription(/This field is required\./);
  });

  it('says the same on the group a required API key picker renders', async () => {
    const user = userEvent.setup();
    renderResourceEditor({
      actions: ({ formId }) => <SubmitButton form={formId}>Save</SubmitButton>,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="apiKey"
          label="Map provider API key"
          kind="apikey"
          required
        />
      ),
    });

    // The secret picker is this same control under another kind, so what it
    // renders is this same group — the one that has to carry the refusal.
    const group = await screen.findByRole('group', {
      name: 'Map provider API key',
    });
    expect(group).not.toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(group).toHaveAttribute('aria-invalid', 'true'));
    expect(group).toHaveAccessibleDescription(/This field is required\./);
  });

  it('tells assistive technology the same about a source radio group', async () => {
    const user = userEvent.setup();
    renderResourceEditor({
      resources: [networkSeed],
      actions: ({ formId }) => <SubmitButton form={formId}>Save</SubmitButton>,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="dataSource"
          label="Network data"
          kind="network"
          canUseExisting
          required
        />
      ),
    });

    // With a source choice there IS an inner control: the div around it is a
    // plain wrapper carrying no role and no ARIA, so the radio group is the
    // field and the one that has to say it was refused.
    const group = await screen.findByRole('radiogroup', {
      name: 'Network data',
    });
    expect(group).toHaveAttribute('aria-required', 'true');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(group).toHaveAttribute('aria-invalid', 'true'));
    expect(group).toHaveAccessibleDescription(/This field is required\./);
  });
});

/**
 * The two ways a picker can be left showing something that is no longer true:
 * a call still in flight for a resource the field has let go, and a source
 * chosen but never followed through.
 */
describe('a picker the researcher backs out of', () => {
  it('drops an in-flight download when the resource is removed', async () => {
    const user = userEvent.setup();
    const held = deferred<void>();
    const { fieldValue } = renderResourceEditor({
      resources: [imageSeed],
      client: (host) =>
        withResourceProcedures(host.client, {
          preview: async () => {
            await held.promise;
            return {
              status: 'failed' as const,
              failure: {
                reason: 'unavailable' as const,
                message: 'the download could not be completed',
                retryable: true,
              },
            };
          },
        }),
      fields: withBackgroundImage('image-1'),
      children: imageField(),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Download this resource' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Remove this resource' }),
    );
    await waitFor(() => expect(fieldValue('backgroundImage')).toBeUndefined());

    held.settle(undefined);
    await act(flushPendingWork);

    // The download was of the resource the field just let go of, so a notice
    // beside "No resource selected" would be about nothing on screen, and its
    // retry would download the removed resource all over again.
    expect(
      screen.queryByText('the download could not be completed'),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try that again' })).toBeNull();
  });

  it('keeps the interview network when the browser is cancelled', async () => {
    const user = userEvent.setup();
    const { fieldValue } = renderResourceEditor({
      resources: [networkSeed],
      fields: {
        label: 'Roster',
        title: 'Roster',
        items: [],
        dataSource: 'existing',
      },
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
      await screen.findByRole('radio', { name: 'Use an imported data file' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    // Nothing was chosen, so nothing replaced what the field had: a required
    // field emptied on the way to a choice never made is one the researcher
    // has to notice and put back.
    expect(fieldValue('dataSource')).toBe('existing');
    expect(
      await screen.findByRole('radio', {
        name: 'Use the network from the in-progress interview',
      }),
    ).toBeChecked();
  });
});

describe('two files chosen before either has been read', () => {
  it('imports the one the researcher chose last', async () => {
    const user = userEvent.setup();
    const staging = new Map<string, () => void>();
    const requests: string[] = [];
    const { fieldValue } = renderResourceEditor({
      client: (host) =>
        withResourceProcedures(host.client, {
          stage: (input) => {
            const source =
              input.request.kind === 'content' ? input.request.source : '';
            requests.push(source);
            return new Promise((settle) => {
              staging.set(source, () => {
                void host.client.resources.stage(input).then(settle);
              });
            });
          },
        }),
      children: imageField(),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Select an image' }),
    );
    const input = await screen.findByLabelText(
      'Choose a file from your computer',
    );

    // A big first choice and a small second one: the reads are what overlap,
    // and the second finishes first.
    const slow = deferred<ArrayBuffer>();
    const fast = deferred<ArrayBuffer>();
    const older = new File(['older'], 'older.png', { type: 'image/png' });
    const newer = new File(['newer'], 'newer.png', { type: 'image/png' });
    Object.defineProperty(older, 'arrayBuffer', { value: () => slow.promise });
    Object.defineProperty(newer, 'arrayBuffer', { value: () => fast.promise });

    await user.upload(input, older);
    await user.upload(input, newer);

    fast.settle(new TextEncoder().encode('newer').buffer as ArrayBuffer);
    await act(flushPendingWork);
    slow.settle(new TextEncoder().encode('older').buffer as ArrayBuffer);
    await act(flushPendingWork);

    await act(async () => {
      for (const settle of staging.values()) settle();
      await flushPendingWork();
    });

    // The older read finished last, but it was chosen first: it is not staged
    // at all, and the field holds the file the researcher actually chose.
    expect(requests).toEqual(['newer.png']);
    await waitFor(() =>
      expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
    );
  });
});
