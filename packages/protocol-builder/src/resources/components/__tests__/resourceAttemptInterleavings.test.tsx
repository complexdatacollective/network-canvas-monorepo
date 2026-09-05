import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import ProtocolField from '../../../form/ProtocolField.tsx';
import { ResourceGatewayProvider } from '../../context.tsx';
import {
  resourceFailure,
  RESOURCE_UPLOAD_MAX_BYTE_LENGTH,
  type ProtocolBuilderResourceGateway,
  type ResourceDescriptor,
  type ResourcePreview as ResolvedPreview,
  type ResourceResult,
  type StagedSecret,
} from '../../gateway.ts';
import { InMemoryResourceGateway } from '../../InMemoryResourceGateway.ts';
import ResourcePickerControl from '../ResourcePickerControl.tsx';
import ResourcePreview, {
  PREVIEW_RENEWAL_LEAD_MS,
  PREVIEW_RENEWAL_MIN_INTERVAL_MS,
} from '../ResourcePreview.tsx';
import ResourceSecretControl from '../ResourceSecretControl.tsx';
import {
  deferred,
  flushPendingWork,
  overrideGateway,
  type Deferred,
} from './overrideGateway.ts';
import { renderResourceEditor } from './renderResourceEditor.tsx';

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
 * components.
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

const UNSUPPORTED_IMAGE_FILE =
  'That file cannot be imported here. Supported file types are: .jpg, .jpeg, .gif, .png, .svg.';

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

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

/** Opens the browser and hands back the file input inside it. */
async function openBrowser(
  user: ReturnType<typeof userEvent.setup>,
  action: string,
): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: action }));
  return screen.findByLabelText('Choose a file from your computer');
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

async function stageImage(
  gateway: InMemoryResourceGateway,
  requestId: string,
  source: string,
): Promise<string> {
  const staged = await gateway.stageUpload({
    requestId,
    kind: 'image',
    name: source,
    source,
    contentType: 'image/png',
    bytes: bytesOf(`png-${source}`),
  });
  if (staged.status === 'failed') throw new Error('could not stage the image');
  return staged.data.id;
}

function renderPreview(
  gateway: ProtocolBuilderResourceGateway,
  resourceId: string,
  name: string,
) {
  return render(
    <ResourceGatewayProvider gateway={gateway}>
      <ResourcePreview resourceId={resourceId} kind="image" name={name} />
    </ResourceGatewayProvider>,
  );
}

function renderSecretControl(gateway: ProtocolBuilderResourceGateway) {
  const staged = vi.fn<(descriptor: ResourceDescriptor) => void>();
  render(
    <ResourceGatewayProvider gateway={gateway}>
      <ResourceSecretControl onStaged={staged} />
    </ResourceGatewayProvider>,
  );
  return staged;
}

/**
 * A host handing out leases that end, where the FIRST lease for a resource is
 * issued at once and every renewal is the test's to time or to refuse. That is
 * the only way to observe the moment a renewal is undecided, which is where
 * the researcher's playback either survives or does not.
 */
function leasingHost(
  inner: InMemoryResourceGateway,
  livesForMs: number,
  renewal: 'hold' | 'fail',
) {
  let issued = 0;
  let released = 0;
  const callsFor = new Map<string, number>();
  const renewals: Deferred<ResourceResult<ResolvedPreview>>[] = [];

  const issue = async (
    resourceId: string,
  ): Promise<ResourceResult<ResolvedPreview>> => {
    const result = await inner.resolvePreview(resourceId);
    if (result.status === 'failed') return result;
    issued += 1;
    const lease = issued;
    return {
      status: 'ok',
      data: {
        resourceId,
        url: `${result.data.url}#lease-${lease}`,
        expiresAt: Date.now() + livesForMs,
        release: () => {
          released += 1;
          result.data.release();
        },
      },
    };
  };

  return {
    issue,
    issued: () => issued,
    released: () => released,
    renewals,
    gateway: overrideGateway(inner, {
      resolvePreview: (resourceId) => {
        const calls = (callsFor.get(resourceId) ?? 0) + 1;
        callsFor.set(resourceId, calls);
        if (calls === 1) return issue(resourceId);
        if (renewal === 'fail') {
          return Promise.resolve(
            resourceFailure<ResolvedPreview>(
              'unavailable',
              'the resource host is temporarily unavailable',
            ),
          );
        }
        const held = deferred<ResourceResult<ResolvedPreview>>();
        renewals.push(held);
        return held.promise;
      },
    }),
  };
}

/** A picker holding a staged image, over a host that discards on command. */
async function pickerWithADiscardInFlight(
  user: ReturnType<typeof userEvent.setup>,
) {
  const inner = new InMemoryResourceGateway();
  const held = deferred<void>();
  const gateway = overrideGateway(inner, {
    discardStaged: async (resourceId) => {
      await held.promise;
      return inner.discardStaged(resourceId);
    },
  });
  const { fieldValue } = renderResourceEditor({
    gateway,
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
      const gateway = new InMemoryResourceGateway();
      const stageUpload = vi.spyOn(gateway, 'stageUpload');
      const { fieldValue } = renderResourceEditor({
        gateway,
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
      expect(stageUpload.mock.calls.map(([request]) => request.source)).toEqual(
        ['newer.png'],
      );
    },
  },
  {
    surface: 'upload',
    state: 'reading a chosen file',
    input: 'a second file the field cannot hold is chosen',
    rule: 'the rejection stands and the earlier file is not imported',
    check: async () => {
      const user = userEvent.setup({ applyAccept: false });
      const gateway = new InMemoryResourceGateway();
      const stageUpload = vi.spyOn(gateway, 'stageUpload');
      const { fieldValue } = renderResourceEditor({
        gateway,
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

      expect(stageUpload).not.toHaveBeenCalled();
      expect(fieldValue('backgroundImage')).toBeUndefined();
      expect(screen.getByText(UNSUPPORTED_IMAGE_FILE)).toBeVisible();
    },
  },
  {
    surface: 'upload',
    state: 'a failed import on screen',
    input: 'a file the field cannot hold is chosen',
    rule: 'the stale failure goes with the choice it was about',
    check: async () => {
      const user = userEvent.setup({ applyAccept: false });
      const gateway = new InMemoryResourceGateway();
      gateway.failNext('stageUpload');
      renderResourceEditor({ gateway, children: imageField() });

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
      const gateway = new InMemoryResourceGateway();
      const stageUpload = vi.spyOn(gateway, 'stageUpload');
      gateway.failNext('stageUpload');
      const { fieldValue } = renderResourceEditor({
        gateway,
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
      expect(stageUpload.mock.calls.map(([request]) => request.source)).toEqual(
        ['refused.png', 'newer.png'],
      );
    },
  },
  {
    surface: 'upload',
    state: 'staging a chosen file',
    input: 'a second file is offered',
    rule: 'no second file is accepted until the first has settled',
    check: async () => {
      const user = userEvent.setup();
      const inner = new InMemoryResourceGateway();
      const held = deferred<ResourceResult<ResourceDescriptor>>();
      const gateway = overrideGateway(inner, {
        stageUpload: () => held.promise,
      });
      renderResourceEditor({ gateway, children: imageField() });

      const input = await openBrowser(user, 'Select an image');
      await user.upload(
        input,
        new File(['fake-png-bytes'], 'skyline.png', { type: 'image/png' }),
      );

      await waitFor(() => expect(input).toBeDisabled());
      held.settle(
        resourceFailure<ResourceDescriptor>('unavailable', 'not this time'),
      );
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
      const gateway = new InMemoryResourceGateway();
      const { fieldValue } = renderResourceEditor({
        gateway,
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
      expect(gateway.getStagingResidue()).toEqual([]);
    },
  },
  {
    surface: 'secret',
    state: 'a submitted key in flight',
    input: 'the researcher corrects the name',
    rule: 'the correction stands and the superseded key is not selected',
    check: async () => {
      const user = userEvent.setup();
      const inner = new InMemoryResourceGateway();
      const held = deferred<ResourceResult<StagedSecret>>();
      let calls = 0;
      const gateway = overrideGateway(inner, {
        stageSecret: (request) => {
          calls += 1;
          return calls === 1 ? held.promise : inner.stageSecret(request);
        },
      });
      const staged = renderSecretControl(gateway);

      await user.type(screen.getByLabelText('Name'), 'Mapbox key');
      await user.type(screen.getByLabelText('Key'), SECRET);
      await user.click(screen.getByRole('button', { name: 'Add API key' }));

      await user.clear(screen.getByLabelText('Name'));
      await user.type(screen.getByLabelText('Name'), 'Mapbox production key');

      // The host answers the submission the researcher has already moved off.
      held.settle(
        await inner.stageSecret({
          requestId: 'superseded',
          name: 'Mapbox key',
          value: SECRET,
        }),
      );
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
      const inner = new InMemoryResourceGateway();
      const held = deferred<ResourceResult<StagedSecret>>();
      let calls = 0;
      const gateway = overrideGateway(inner, {
        stageSecret: (request) => {
          calls += 1;
          return calls === 1 ? held.promise : inner.stageSecret(request);
        },
      });
      renderSecretControl(gateway);

      await user.type(screen.getByLabelText('Name'), 'Mapbox key');
      await user.type(screen.getByLabelText('Key'), SECRET);
      await user.click(screen.getByRole('button', { name: 'Add API key' }));

      await user.clear(screen.getByLabelText('Name'));
      await user.type(screen.getByLabelText('Name'), 'Mapbox production key');

      held.settle(
        resourceFailure<StagedSecret>(
          'unavailable',
          'the key could not be added just now',
        ),
      );
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
      const gateway = new InMemoryResourceGateway();
      renderSecretControl(gateway);

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
      const gateway = new InMemoryResourceGateway();
      const stageUpload = vi.spyOn(gateway, 'stageUpload');
      renderResourceEditor({ gateway, children: imageField() });

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
      expect(stageUpload).not.toHaveBeenCalled();
    },
  },
  {
    surface: 'upload',
    state: 'an import in flight',
    input: 'the browser is cancelled',
    rule: 'what it staged is discarded rather than left at the host',
    check: async () => {
      const user = userEvent.setup();
      const gateway = new InMemoryResourceGateway();
      const discardStaged = vi.spyOn(gateway, 'discardStaged');
      const { fieldValue, session } = renderResourceEditor({
        gateway,
        children: imageField(),
      });

      const input = await openBrowser(user, 'Select an image');
      const held = heldFile('late.png', 'image/png', bytesOf('late'));
      await user.upload(input, held.file);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      // The host answers an import whose surface has gone. Suppressing the
      // callback is not enough: the resource exists, the session is tracking
      // it, and no field will ever name it.
      held.read();

      await waitFor(() =>
        expect(discardStaged).toHaveBeenCalledWith('staged-resource-1'),
      );
      expect(gateway.getStagingResidue()).toEqual([]);
      expect(session.getSnapshot().stagedResources).toEqual([]);
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
      const inner = new InMemoryResourceGateway();
      const discardStaged = vi.spyOn(inner, 'discardStaged');
      const held = deferred<ResourceResult<StagedSecret>>();
      const staged = vi.fn<(descriptor: ResourceDescriptor) => void>();
      const { unmount } = render(
        <ResourceGatewayProvider
          gateway={overrideGateway(inner, { stageSecret: () => held.promise })}
        >
          <ResourceSecretControl onStaged={staged} />
        </ResourceGatewayProvider>,
      );

      await user.type(screen.getByLabelText('Name'), 'Mapbox key');
      await user.type(screen.getByLabelText('Key'), SECRET);
      await user.click(screen.getByRole('button', { name: 'Add API key' }));

      unmount();
      held.settle(
        await inner.stageSecret({
          requestId: 'abandoned',
          name: 'Mapbox key',
          value: SECRET,
        }),
      );

      await waitFor(() =>
        expect(discardStaged).toHaveBeenCalledWith('staged-resource-1'),
      );
      // A key the host goes on holding for a form that is gone is worse than
      // abandoned bytes: nothing left knows it is there.
      expect(inner.getStagingResidue()).toEqual([]);
      expect(staged).not.toHaveBeenCalled();
    },
  },
  {
    surface: 'preview',
    state: 'a lease being renewed',
    input: 'the renewal has not answered yet',
    rule: 'the lease in use goes on playing and is not released',
    check: async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      try {
        const inner = new InMemoryResourceGateway();
        const resourceId = await stageImage(
          inner,
          'renewal-held',
          'leased.png',
        );
        const host = leasingHost(inner, PREVIEW_RENEWAL_LEAD_MS + 30, 'hold');

        renderPreview(host.gateway, resourceId, 'Leased image');
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1);
        });
        expect(
          screen.getByRole('img', { name: 'Leased image' }).getAttribute('src'),
        ).toContain('#lease-1');

        // This lease ends 30ms after the lead, so the renewal falls due on the
        // floor rather than on the lead — asking again in 30ms would be the
        // host answering as fast as it can, for as long as the preview shows.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(PREVIEW_RENEWAL_MIN_INTERVAL_MS);
        });
        expect(host.renewals).toHaveLength(1);
        // The renewal is undecided, and the URL on screen still works:
        // throwing it away here is what stops an audio or video element
        // mid-playback.
        expect(
          screen.getByRole('img', { name: 'Leased image' }).getAttribute('src'),
        ).toContain('#lease-1');
        expect(host.released()).toBe(0);

        await act(async () => {
          host.renewals[0]?.settle(await host.issue(resourceId));
          await vi.advanceTimersByTimeAsync(0);
        });

        expect(
          screen.getByRole('img', { name: 'Leased image' }).getAttribute('src'),
        ).toContain('#lease-2');
        expect(host.released()).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    },
  },
  {
    surface: 'preview',
    state: 'a lease being renewed',
    input: 'the renewal fails',
    rule: 'the working lease is kept until it really ends, then reported',
    check: async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      try {
        const inner = new InMemoryResourceGateway();
        const resourceId = await stageImage(
          inner,
          'renewal-refused',
          'leased.png',
        );
        const host = leasingHost(inner, PREVIEW_RENEWAL_LEAD_MS + 40, 'fail');

        renderPreview(host.gateway, resourceId, 'Leased image');
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1);
        });
        expect(
          screen.getByRole('img', { name: 'Leased image' }).getAttribute('src'),
        ).toContain('#lease-1');

        // The renewal falls due, and the host cannot answer it.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(45);
        });
        expect(
          screen.getByRole('img', { name: 'Leased image' }).getAttribute('src'),
        ).toContain('#lease-1');
        expect(host.released()).toBe(0);
        expect(
          screen.queryByText('the resource host is temporarily unavailable'),
        ).toBeNull();

        // Only once the lease it was renewing has ended is there anything to
        // tell the researcher about.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(PREVIEW_RENEWAL_LEAD_MS);
        });
        expect(
          screen.getByText('the resource host is temporarily unavailable'),
        ).toBeVisible();
      } finally {
        vi.useRealTimers();
      }
    },
  },
  {
    surface: 'preview',
    state: 'a lease being renewed',
    input: 'the field moves to another resource',
    rule: 'every lease for the resource left behind is released',
    check: async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      try {
        const inner = new InMemoryResourceGateway();
        const first = await stageImage(inner, 'renewal-switch-1', 'first.png');
        const second = await stageImage(
          inner,
          'renewal-switch-2',
          'second.png',
        );
        const host = leasingHost(inner, PREVIEW_RENEWAL_LEAD_MS + 30, 'hold');

        const { rerender } = renderPreview(host.gateway, first, 'First');
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1);
        });
        screen.getByRole('img', { name: 'First' });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(PREVIEW_RENEWAL_MIN_INTERVAL_MS);
        });
        expect(host.renewals).toHaveLength(1);

        rerender(
          <ResourceGatewayProvider gateway={host.gateway}>
            <ResourcePreview resourceId={second} kind="image" name="Second" />
          </ResourceGatewayProvider>,
        );
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1);
        });
        screen.getByRole('img', { name: 'Second' });

        // The renewal for the resource the field left answers at last.
        // Nothing will ever render it, so nothing else would ever release it.
        await act(async () => {
          host.renewals[0]?.settle(await host.issue(first));
          await vi.advanceTimersByTimeAsync(0);
        });

        expect(screen.getByRole('img', { name: 'Second' })).toBeVisible();
        expect(host.issued()).toBe(3);
        expect(host.released()).toBe(2);
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
];

it.each(INTERLEAVINGS)(
  'the $surface control, $state: $input — $rule',
  async ({ check }) => {
    await check();
  },
);
