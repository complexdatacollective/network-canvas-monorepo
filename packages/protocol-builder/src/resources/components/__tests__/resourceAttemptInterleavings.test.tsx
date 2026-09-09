import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';

import type { ProtocolBuilderClient } from '../../../contract/contract.ts';
import AssetPickerField from '../../../fields/AssetPickerField.tsx';
import type { InMemoryHost } from '../../../testing/host/createInMemoryHost.ts';
import { enIntl } from '../../../testing/i18n.ts';
import {
  RESOURCE_UPLOAD_MAX_BYTE_LENGTH,
  type ResourceDescriptor,
} from '../../types.ts';
import ResourcePreview, {
  PREVIEW_RENEWAL_LEAD_MS,
  PREVIEW_RENEWAL_MIN_INTERVAL_MS,
} from '../ResourcePreview.tsx';
import ResourceSecretControl from '../ResourceSecretControl.tsx';
import { deferred, flushPendingWork } from './asyncControls.ts';
import {
  advance,
  createPreviewHost,
  renderPreview,
  shownUrl,
} from './previewHarness.tsx';
import { renderResourceEditor } from './renderResourceEditor.tsx';
import { renderInResourceContext } from './resourceContext.tsx';
import {
  createResourceHost,
  stagedResources,
  withResourceProcedures,
} from './resourceHost.ts';

/**
 * Every state one resource attempt can be in, against every input that can
 * arrive while it is there.
 *
 * The four resource surfaces share one small state machine — a claim on the
 * order of calls, the call itself, its failure, and its retry — and every
 * defect these rows are about is the same shape: something the researcher did
 * while a call was undecided, answered as though they had not. Reading the
 * machine one surface at a time hides exactly that, so the interleavings are
 * enumerated here in one place and each one is driven through the real
 * components, over the in-memory host.
 */
type Interleaving = Readonly<{
  /** The surface whose attempt is mid-flight. */
  surface: 'upload' | 'secret' | 'preview' | 'picker';
  /** Where the attempt is when the next input arrives. */
  state: string;
  /** What arrives. */
  input: string;
  /** What must be true once everything has settled. */
  rule: string;
  check: () => Promise<void>;
}>;

const SECRET = 'pk.eyJ1IjoicmVzZWFyY2hlciIsImEiOiJzZWNyZXQifQ';

const OVERSIZE_FILE =
  'That file is too large to import. Files can be up to 8.0 MB.';

/**
 * The extensions are joined by `Intl.ListFormat` rather than by a comma, so
 * every language gets its own conjunction. Built with the same formatter the
 * control uses rather than written out, because re-spelling CLDR's list
 * punctuation here would be asserting on this file's guess at it.
 */
const UNSUPPORTED_IMAGE_FILE = `That file cannot be imported here. Supported file types are: ${enIntl.formatList(
  ['.jpg', '.jpeg', '.gif', '.png', '.svg'],
)}.`;

/** What a host that throws rather than answering is told to the researcher as. */
const UNREACHABLE = 'The resource could not be reached. Try again in a moment.';

/** What the hosts below say when they refuse. */
const HOST_UNAVAILABLE = 'the resource host is temporarily unavailable';

const REFUSAL = {
  status: 'failed' as const,
  failure: {
    reason: 'unavailable' as const,
    message: HOST_UNAVAILABLE,
    retryable: true,
  },
};

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

function imageField() {
  return (
    <Field
      component={AssetPickerField}
      name="backgroundImage"
      label="Background image"
      kind="image"
    />
  );
}

function rosterField() {
  return (
    <Field
      component={AssetPickerField}
      name="dataSource"
      label="Roster"
      kind="network"
    />
  );
}

function mapLayerField() {
  return (
    <Field
      component={AssetPickerField}
      name="mapLayer"
      label="Map layer"
      kind="geojson"
    />
  );
}

/** Opens the browser and hands back the file input inside it. */
async function openBrowser(
  user: ReturnType<typeof userEvent.setup>,
  action: string,
): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: action }));
  return screen.findByLabelText('Choose a file from your computer');
}

/**
 * Waits until the browser is really gone.
 *
 * Answering the dismissal is not the same instant as the browser closing. The
 * answer reaches the dialog through the confirmation's own promise, and the
 * import control goes away only when React commits the state that answer sets
 * — so between the click returning and the control unmounting there is a
 * window in which its claim is still current.
 *
 * A row about what happens *after* the browser is closed therefore has to wait
 * for that, rather than take the click's return for it: a file whose bytes
 * arrive inside the window is imported, selected, and left staged at the host,
 * which is the opposite of every such row's rule. Waiting for the control to
 * be gone is what makes the state the row names the state it is asserting
 * against.
 */
async function browserClosed(): Promise<void> {
  await waitFor(() =>
    expect(
      screen.queryByLabelText('Choose a file from your computer'),
    ).not.toBeInTheDocument(),
  );
}

/**
 * A file whose bytes arrive when the test says so, which is what puts a choice
 * in the state of "chosen, still being read".
 */
function heldFile(
  name: string,
  contentType: string,
  bytes: Uint8Array,
): Readonly<{ file: File; read: () => void }> {
  const held = deferred<ArrayBuffer>();
  const file = new File([''], name, { type: contentType });
  Object.defineProperty(file, 'arrayBuffer', { value: () => held.promise });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { file, read: () => held.settle(bytes.buffer as ArrayBuffer) };
}

function renderSecretControl(
  host: InMemoryHost,
  client: ProtocolBuilderClient = host.client,
) {
  const staged = vi.fn<(descriptor: ResourceDescriptor) => void>();
  renderInResourceContext(
    client,
    host.protocolId,
    <ResourceSecretControl onStaged={staged} />,
  );
  return staged;
}

/** A picker holding a staged image, over a host that discards on command. */
async function pickerWithADiscardInFlight(
  user: ReturnType<typeof userEvent.setup>,
) {
  const held = deferred<void>();
  const { fieldValue } = renderResourceEditor({
    client: (host) =>
      withResourceProcedures(host.client, {
        discard: async (input) => {
          await held.promise;
          return host.client.resources.discard(input);
        },
      }),
    children: imageField(),
  });

  const input = await openBrowser(user, 'Select an image');
  await user.upload(
    input,
    new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
  );
  await waitFor(() =>
    expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
  );

  await user.click(
    await screen.findByRole('button', { name: 'Discard this resource' }),
  );
  return { fieldValue, settleDiscard: () => held.settle(undefined) };
}

const INTERLEAVINGS: readonly Interleaving[] = [
  {
    surface: 'upload',
    state: 'reading a chosen file',
    input: 'a second file the field can hold is chosen',
    rule: 'the file chosen last is the one imported',
    check: async () => {
      const user = userEvent.setup();
      const sources: string[] = [];
      const { fieldValue } = renderResourceEditor({
        client: (host) => stagingsInto(host, sources),
        children: imageField(),
      });

      const input = await openBrowser(user, 'Select an image');
      const older = heldFile('older.png', 'image/png', bytesOf('older'));
      const newer = heldFile('newer.png', 'image/png', bytesOf('newer'));
      await user.upload(input, older.file);
      await user.upload(input, newer.file);

      newer.read();
      await act(flushPendingWork);
      older.read();
      await act(flushPendingWork);

      await waitFor(() =>
        expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
      );
      expect(sources).toEqual(['newer.png']);
    },
  },
  {
    surface: 'upload',
    state: 'reading a chosen file',
    input: 'a second file the field cannot hold is chosen',
    rule: 'the rejection stands and the earlier file is not imported',
    check: async () => {
      const user = userEvent.setup({ applyAccept: false });
      const sources: string[] = [];
      const { fieldValue } = renderResourceEditor({
        client: (host) => stagingsInto(host, sources),
        children: imageField(),
      });

      const input = await openBrowser(user, 'Select an image');
      const older = heldFile('older.png', 'image/png', bytesOf('older'));
      await user.upload(input, older.file);
      await user.upload(
        input,
        new File(['notes'], 'notes.txt', { type: 'text/plain' }),
      );

      expect(await screen.findByText(UNSUPPORTED_IMAGE_FILE)).toBeVisible();

      // The file the researcher moved off finishes reading at last. It was
      // chosen before the one that was refused, so it decides nothing.
      older.read();
      await act(flushPendingWork);

      expect(sources).toEqual([]);
      expect(fieldValue('backgroundImage')).toBeUndefined();
      expect(screen.getByText(UNSUPPORTED_IMAGE_FILE)).toBeVisible();
    },
  },
  {
    surface: 'upload',
    state: 'reading a chosen file',
    input: 'the browser is dismissed with Escape',
    rule: 'the researcher is asked before the choice is thrown away',
    check: async () => {
      const user = userEvent.setup();
      const { fieldValue } = renderResourceEditor({ children: imageField() });

      const input = await openBrowser(user, 'Select an image');
      const chosen = heldFile('skyline.png', 'image/png', bytesOf('skyline'));
      await user.upload(input, chosen.file);

      // Nothing has reached the host yet, because the file is still being
      // read: there is no call in flight for the dialog to notice, and Escape
      // is the reflex that would otherwise lose the choice silently.
      await user.keyboard('{Escape}');

      expect(
        await screen.findByText(
          'This editor holds changes that have not been saved. Closing it now discards them.',
        ),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Keep editing' }));
      chosen.read();
      await act(flushPendingWork);

      // Kept, so the import the researcher asked for still lands.
      await waitFor(() =>
        expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
      );
    },
  },
  {
    surface: 'upload',
    state: 'a file the field cannot hold has just been refused',
    input: 'the browser is dismissed with Escape',
    rule: 'nothing is asked about a choice that was never taken',
    check: async () => {
      const user = userEvent.setup({ applyAccept: false });
      renderResourceEditor({ children: imageField() });

      const input = await openBrowser(user, 'Select an image');
      await user.upload(
        input,
        new File(['notes'], 'notes.txt', { type: 'text/plain' }),
      );
      expect(await screen.findByText(UNSUPPORTED_IMAGE_FILE)).toBeVisible();

      await user.keyboard('{Escape}');

      // A question the researcher has to dismiss after every mis-click is one
      // they learn to dismiss without reading.
      await browserClosed();
      expect(
        screen.queryByRole('button', { name: 'Keep editing' }),
      ).not.toBeInTheDocument();
    },
  },
  {
    surface: 'upload',
    state: 'a failed import on screen',
    input: 'a file the field cannot hold is chosen',
    rule: 'the stale failure goes with the choice it was about',
    check: async () => {
      const user = userEvent.setup({ applyAccept: false });
      let refuse = true;
      renderResourceEditor({
        client: (host) =>
          withResourceProcedures(host.client, {
            stage: (input) => {
              if (!refuse) return host.client.resources.stage(input);
              refuse = false;
              return Promise.resolve(REFUSAL);
            },
          }),
        children: imageField(),
      });

      const input = await openBrowser(user, 'Select an image');
      await user.upload(
        input,
        new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
      );
      expect(
        await screen.findByRole('button', {
          name: 'Try importing the file again',
        }),
      ).toBeVisible();

      await user.upload(
        input,
        new File(['notes'], 'notes.txt', { type: 'text/plain' }),
      );

      expect(await screen.findByText(UNSUPPORTED_IMAGE_FILE)).toBeVisible();
      // Repeating a call about a file the researcher has moved off is not
      // what "try again" would mean any more.
      expect(
        screen.queryByRole('button', { name: 'Try importing the file again' }),
      ).toBeNull();
    },
  },
  {
    surface: 'upload',
    state: 'a failed import on screen',
    input: 'another file is chosen and is still being read',
    rule: 'the stale retry cannot repeat the call over the newer choice',
    check: async () => {
      const user = userEvent.setup();
      const sources: string[] = [];
      let refuse = true;
      const { fieldValue } = renderResourceEditor({
        client: (host) =>
          withResourceProcedures(host.client, {
            stage: (input) => {
              sources.push(
                input.request.kind === 'content' ? input.request.source : '',
              );
              if (!refuse) return host.client.resources.stage(input);
              refuse = false;
              return Promise.resolve(REFUSAL);
            },
          }),
        children: imageField(),
      });

      const input = await openBrowser(user, 'Select an image');
      await user.upload(
        input,
        new File(['fake-png-bytes'], 'refused.png', { type: 'image/png' }),
      );
      expect(
        await screen.findByRole('button', {
          name: 'Try importing the file again',
        }),
      ).toBeVisible();

      const newer = heldFile('newer.png', 'image/png', bytesOf('newer'));
      await user.upload(input, newer.file);

      // Repeating the refused import would take the newest place in the order
      // and win over the file that is still being read for it.
      expect(
        screen.queryByRole('button', { name: 'Try importing the file again' }),
      ).toBeNull();

      newer.read();
      await act(flushPendingWork);

      await waitFor(() =>
        expect(fieldValue('backgroundImage')).toBe('staged-resource-1'),
      );
      expect(sources).toEqual(['refused.png', 'newer.png']);
    },
  },
  {
    surface: 'upload',
    state: 'staging a chosen file',
    input: 'a second file is offered',
    rule: 'no second file is accepted until the first has settled',
    check: async () => {
      const user = userEvent.setup();
      const held = deferred<void>();
      renderResourceEditor({
        client: (host) =>
          withResourceProcedures(host.client, {
            stage: async () => {
              await held.promise;
              return REFUSAL;
            },
          }),
        children: imageField(),
      });

      const input = await openBrowser(user, 'Select an image');
      await user.upload(
        input,
        new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
      );

      await waitFor(() => expect(input).toBeDisabled());
      held.settle(undefined);
      await waitFor(() => expect(input).toBeEnabled());
    },
  },
  {
    surface: 'upload',
    state: 'staged bytes the host cannot read as the kind they claim',
    input: 'the import settles',
    rule: 'nothing is selected, nothing stays staged, and the reason is shown',
    check: async () => {
      const user = userEvent.setup();
      // A host that will hold any bytes is not a host that can tell a roster
      // from a text file, and `inspect` is where it says so.
      const { fieldValue, staged } = renderResourceEditor({
        client: (host) =>
          withResourceProcedures(host.client, {
            inspect: () =>
              Promise.resolve({
                status: 'failed' as const,
                failure: {
                  reason: 'invalid-content' as const,
                  message: 'the selected file is not a readable network',
                  retryable: false,
                },
              }),
          }),
        children: rosterField(),
      });

      const input = await openBrowser(user, 'Select a data file');
      await user.upload(
        input,
        new File(['not a roster at all'], 'community.json', {
          type: 'application/json',
        }),
      );

      expect(
        await screen.findByText('the selected file is not a readable network'),
      ).toBeVisible();
      // A field pointed at an unreadable roster is a stage the interview
      // cannot load, so the field is never pointed at one.
      expect(fieldValue('dataSource')).toBeUndefined();
      await waitFor(async () => expect(await staged()).toEqual([]));
    },
  },
  {
    surface: 'secret',
    state: 'a submitted key in flight',
    input: 'the researcher corrects the name',
    rule: 'the correction stands and the superseded key is not selected',
    check: async () => {
      const user = userEvent.setup();
      const host = createResourceHost();
      const held = deferred<void>();
      let calls = 0;
      const staged = renderSecretControl(
        host,
        withResourceProcedures(host.client, {
          stage: async (input) => {
            calls += 1;
            if (calls === 1) await held.promise;
            return host.client.resources.stage(input);
          },
        }),
      );

      await user.type(screen.getByLabelText('Name'), 'Mapbox key');
      await user.type(screen.getByLabelText('Key'), SECRET);
      await user.click(screen.getByRole('button', { name: 'Add API key' }));

      await user.clear(screen.getByLabelText('Name'));
      await user.type(screen.getByLabelText('Name'), 'Mapbox production key');

      // The host answers the submission the researcher has already moved off.
      held.settle(undefined);
      await act(flushPendingWork);

      expect(staged).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Name')).toHaveValue(
        'Mapbox production key',
      );
      expect(screen.getByLabelText('Key')).toHaveValue(SECRET);
    },
  },
  {
    surface: 'secret',
    state: 'a submitted key in flight',
    input: 'the researcher corrects the name, then the call fails',
    rule: 'nothing offers to repeat the superseded call',
    check: async () => {
      const user = userEvent.setup();
      const host = createResourceHost();
      const held = deferred<void>();
      let calls = 0;
      renderSecretControl(
        host,
        withResourceProcedures(host.client, {
          stage: async (input) => {
            calls += 1;
            if (calls > 1) return host.client.resources.stage(input);
            await held.promise;
            return {
              status: 'failed' as const,
              failure: {
                reason: 'unavailable' as const,
                message: 'the key could not be added just now',
                retryable: true,
              },
            };
          },
        }),
      );

      await user.type(screen.getByLabelText('Name'), 'Mapbox key');
      await user.type(screen.getByLabelText('Key'), SECRET);
      await user.click(screen.getByRole('button', { name: 'Add API key' }));

      await user.clear(screen.getByLabelText('Name'));
      await user.type(screen.getByLabelText('Name'), 'Mapbox production key');

      held.settle(undefined);
      await act(flushPendingWork);

      expect(
        screen.queryByText('the key could not be added just now'),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Try adding the key again' }),
      ).toBeNull();
      expect(screen.getByLabelText('Name')).toHaveValue(
        'Mapbox production key',
      );
    },
  },
  {
    surface: 'secret',
    state: 'a required-field error on screen',
    input: 'the researcher enters a name',
    rule: 'the corrected field stops being described as invalid',
    check: async () => {
      const user = userEvent.setup();
      renderSecretControl(createResourceHost());

      await user.click(screen.getByRole('button', { name: 'Add API key' }));
      const name = await screen.findByLabelText('Name');
      expect(name).toHaveAccessibleDescription(/Enter a name for this key\./);

      await user.type(name, 'Mapbox key');

      expect(name).not.toHaveAccessibleDescription(
        /Enter a name for this key\./,
      );
      expect(screen.queryByText('Enter a name for this key.')).toBeNull();
      // The key itself is still missing, so what is said about it is still
      // true and stays where it is.
      expect(screen.getByLabelText('Key')).toHaveAccessibleDescription(
        /Enter the value of the key\./,
      );
    },
  },
  {
    surface: 'upload',
    state: 'a file larger than the import limit is chosen',
    input: 'nothing else — its size alone decides it',
    rule: 'it is refused without ever being read',
    check: async () => {
      const user = userEvent.setup();
      const sources: string[] = [];
      renderResourceEditor({
        client: (host) => stagingsInto(host, sources),
        children: imageField(),
      });

      const input = await openBrowser(user, 'Select an image');
      const arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
      const huge = new File([''], 'huge.png', { type: 'image/png' });
      Object.defineProperty(huge, 'size', {
        value: RESOURCE_UPLOAD_MAX_BYTE_LENGTH + 1,
      });
      Object.defineProperty(huge, 'arrayBuffer', { value: arrayBuffer });
      await user.upload(input, huge);

      expect(await screen.findByText(OVERSIZE_FILE)).toBeVisible();
      // Reading the file to learn what its own size already said is what
      // pulls a file of any size into memory just to refuse it.
      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(sources).toEqual([]);
    },
  },
  {
    surface: 'upload',
    state: 'an import in flight',
    input: 'the browser is cancelled',
    rule: 'what it staged is discarded rather than left at the host',
    check: async () => {
      const user = userEvent.setup();
      // Held at the HOST, not at the file read: the call has to be under way
      // for the browser to be cancelled during it. A read still in flight is
      // the other row — nothing has been sent, and nothing is dispatched.
      const staging = deferred<void>();
      const sources: string[] = [];
      const { fieldValue, staged } = renderResourceEditor({
        client: (host) =>
          withResourceProcedures(host.client, {
            stage: async (input) => {
              sources.push(
                input.request.kind === 'content' ? input.request.source : '',
              );
              await staging.promise;
              return host.client.resources.stage(input);
            },
          }),
        children: imageField(),
      });

      const input = await openBrowser(user, 'Select an image');
      await user.upload(
        input,
        new File(['late-png'], 'late.png', { type: 'image/png' }),
      );
      await waitFor(() => expect(sources).toEqual(['late.png']));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      // An import still in flight is work the researcher chose and nothing
      // else records, so the dismissal asks first; this row is about what
      // happens once they have said to let it go.
      await user.click(
        await screen.findByRole('button', { name: 'Discard changes' }),
      );
      await browserClosed();
      // The host answers an import whose surface has gone. Suppressing the
      // callback is not enough: the resource exists, the edit is tracking it,
      // and no field will ever name it.
      staging.settle(undefined);

      await waitFor(async () => expect(await staged()).toEqual([]));
      expect(fieldValue('backgroundImage')).toBeUndefined();
    },
  },
  {
    surface: 'upload',
    state: 'a chosen file still being read',
    input: 'the browser is closed before the bytes arrive',
    rule: 'the import is never sent to the host at all',
    check: async () => {
      const user = userEvent.setup();
      const sources: string[] = [];
      const { fieldValue, staged } = renderResourceEditor({
        client: (host) => stagingsInto(host, sources),
        children: imageField(),
      });

      const input = await openBrowser(user, 'Select an image');
      const held = heldFile('slow.png', 'image/png', bytesOf('slow'));
      await user.upload(input, held.file);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      // Closing asks first, because the file being read is a choice nothing
      // else records. Here the answer is that it may go.
      await user.click(
        await screen.findByRole('button', { name: 'Discard changes' }),
      );
      await browserClosed();
      // The read finishes for a control that is no longer there. Discarding
      // afterwards leaves the same clean end state, but the bytes have been
      // sent and the host has done the work of holding them — for an import
      // there was never anything left to hand to.
      held.read();
      await act(flushPendingWork);

      expect(sources).toEqual([]);
      expect(await staged()).toEqual([]);
      expect(fieldValue('backgroundImage')).toBeUndefined();
    },
  },
  {
    surface: 'secret',
    state: 'a submitted key in flight',
    input: 'the surface goes away before the host answers',
    rule: 'the staged key is discarded rather than held for a form nobody is watching',
    check: async () => {
      const user = userEvent.setup();
      const host = createResourceHost();
      const held = deferred<void>();
      const client = withResourceProcedures(host.client, {
        stage: async (input) => {
          await held.promise;
          return host.client.resources.stage(input);
        },
      });
      const staged = vi.fn<(descriptor: ResourceDescriptor) => void>();
      const { unmount } = renderInResourceContext(
        client,
        host.protocolId,
        <ResourceSecretControl onStaged={staged} />,
      );

      await user.type(screen.getByLabelText('Name'), 'Mapbox key');
      await user.type(screen.getByLabelText('Key'), SECRET);
      await user.click(screen.getByRole('button', { name: 'Add API key' }));

      unmount();
      held.settle(undefined);

      // A key the host goes on holding for a form that is gone is worse than
      // abandoned bytes: nothing left knows it is there.
      await waitFor(async () =>
        expect(await stagedResources(host.client, host.protocolId)).toEqual([]),
      );
      expect(staged).not.toHaveBeenCalled();
    },
  },
  {
    surface: 'preview',
    state: 'a URL being renewed',
    input: 'the renewal has not answered yet',
    rule: 'the URL in use goes on rendering until its replacement lands',
    check: async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      try {
        const host = createPreviewHost();
        const image = await host.image('leased.png');
        // This URL ends 30ms after the lead, so the renewal falls due on the
        // floor rather than on the lead — asking again in 30ms would be the
        // host answering as fast as it can, for as long as the preview shows.
        host.urlsLastFor(PREVIEW_RENEWAL_LEAD_MS + 30);

        renderPreview(host, image);
        await advance(1);
        expect(shownUrl()).toBe(1);

        const renewal = host.holdNext();
        await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);

        // The renewal is undecided and the URL on screen still resolves:
        // throwing it away here is what stops an audio or video element
        // mid-playback.
        expect(shownUrl()).toBe(1);
        expect(host.issued()).toBe(1);

        renewal.settle(undefined);
        await advance(1);

        expect(shownUrl()).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    },
  },
  {
    surface: 'preview',
    state: 'a URL being renewed',
    input: 'the renewal fails',
    rule: 'the working URL is kept until it really ends, then the failure is reported',
    check: async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      try {
        const host = createPreviewHost();
        const image = await host.image('leased.png');
        host.urlsLastFor(PREVIEW_RENEWAL_MIN_INTERVAL_MS + 40);

        renderPreview(host, image);
        await advance(1);
        expect(shownUrl()).toBe(1);

        // The renewal falls due, and the host cannot answer it.
        host.refuseNext();
        await advance(PREVIEW_RENEWAL_MIN_INTERVAL_MS);
        expect(shownUrl()).toBe(1);
        expect(screen.queryByText(HOST_UNAVAILABLE)).toBeNull();

        // Only once the URL it was renewing has stopped resolving is there
        // anything to tell the researcher about.
        await advance(40);
        expect(screen.getByText(HOST_UNAVAILABLE)).toBeVisible();
        expect(shownUrl()).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    },
  },
  {
    surface: 'picker',
    state: 'a discard in flight',
    input: 'the researcher asks to change the resource',
    rule: 'the browser cannot be opened while the discard is undecided',
    check: async () => {
      const user = userEvent.setup();
      const { settleDiscard, fieldValue } =
        await pickerWithADiscardInFlight(user);

      // Reselecting the resource being discarded would disown the discard,
      // leaving the field naming something the host has deleted.
      expect(
        screen.getByRole('button', { name: 'Change the image' }),
      ).toBeDisabled();

      settleDiscard();
      await waitFor(() =>
        expect(fieldValue('backgroundImage')).toBeUndefined(),
      );
    },
  },
  {
    surface: 'picker',
    state: 'a discard in flight',
    input: 'the discard succeeds',
    rule: 'the field is cleared and a resource can be chosen again',
    check: async () => {
      const user = userEvent.setup();
      const { settleDiscard, fieldValue } =
        await pickerWithADiscardInFlight(user);

      settleDiscard();

      await waitFor(() =>
        expect(fieldValue('backgroundImage')).toBeUndefined(),
      );
      expect(await screen.findByText('No resource selected.')).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Select an image' }),
      ).toBeEnabled();
    },
  },
  {
    surface: 'picker',
    state: 'a call in flight',
    input: 'the host throws instead of answering',
    rule: 'the throw is told as a failure and the control stops waiting',
    check: async () => {
      const user = userEvent.setup();
      // A map layer rather than an image, so the only call resolving a URL is
      // the download the researcher asked for: an image would have a preview
      // beside it asking the same throwing procedure.
      renderResourceEditor({
        // Thrown synchronously, which is the shape a `.catch()` chained onto
        // the call itself cannot see: the throw happens before there is a
        // promise to chain onto.
        client: (host) =>
          withResourceProcedures(host.client, {
            preview: () => {
              throw new Error('the host threw');
            },
          }),
        children: mapLayerField(),
      });

      const input = await openBrowser(user, 'Select a map layer');
      await user.upload(
        input,
        new File(
          [JSON.stringify({ type: 'FeatureCollection', features: [] })],
          'wards.geojson',
          { type: '' },
        ),
      );
      await user.click(
        await screen.findByRole('button', { name: 'Download this resource' }),
      );

      expect(await screen.findByText(UNREACHABLE)).toBeVisible();
      // Still waiting would be a control the researcher can never use again,
      // with nothing on screen saying why.
      expect(
        screen.getByRole('button', { name: 'Download this resource' }),
      ).toBeEnabled();
    },
  },
  {
    surface: 'preview',
    state: 'resolving its first URL',
    input: 'the host throws instead of answering',
    rule: 'the throw is told as a failure rather than left as empty space',
    check: async () => {
      const host = createResourceHost();
      const staged = await host.client.resources.stage({
        protocolId: host.protocolId,
        requestId: 'request-throwing',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'thrown.png',
          source: 'thrown.png',
          contentType: 'image/png',
          bytes: new Blob(['png'], { type: 'image/png' }),
        },
      });
      if (staged.status !== 'ok') throw new Error('the image was not staged');

      renderInResourceContext(
        withResourceProcedures(host.client, {
          preview: () => {
            throw new Error('the host threw');
          },
        }),
        host.protocolId,
        <ResourcePreview
          resourceId={staged.data.descriptor.id}
          kind="image"
          name="Thrown image"
        />,
      );

      expect(await screen.findByText(UNREACHABLE)).toBeVisible();
    },
  },
];

/** The host, recording the filename of every staging it is asked to make. */
function stagingsInto(
  host: InMemoryHost,
  sources: string[],
): ProtocolBuilderClient {
  return withResourceProcedures(host.client, {
    stage: (input) => {
      sources.push(
        input.request.kind === 'content' ? input.request.source : '',
      );
      return host.client.resources.stage(input);
    },
  });
}

it.each(INTERLEAVINGS)(
  'the $surface control, $state: $input — $rule',
  async ({ check }) => {
    await check();
  },
);
